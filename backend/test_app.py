import unittest
from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import patch

import app as taskflow
from google.auth.exceptions import RefreshError


class FakeQuery:
    def __init__(self, database, table):
        self.database = database
        self.table_name = table
        self.operation = "select"
        self.payload = {}
        self.filters = []
        self.single = False

    def select(self, fields):
        return self

    def insert(self, payload):
        self.operation = "insert"
        self.payload = payload
        return self

    def update(self, payload):
        self.operation = "update"
        self.payload = payload
        return self

    def delete(self):
        self.operation = "delete"
        return self

    def eq(self, field, value):
        self.filters.append(("eq", field, value))
        return self

    def neq(self, field, value):
        self.filters.append(("neq", field, value))
        return self

    def or_(self, expression):
        return self

    def order(self, field, desc=False):
        return self

    def maybe_single(self):
        self.single = True
        return self

    def execute(self):
        rows = self.database.tables[self.table_name]
        if self.operation == "insert":
            row = {
                **self.payload,
                "id": f"task-{len(self.database.tables['tasks']) + 1}",
                "created_at": "2026-01-01T00:00:00Z",
            }
            rows.append(row)
            return SimpleNamespace(data=[deepcopy(row)])

        matches = [
            row for row in rows
            if all(
                row.get(field) == value if operation == "eq"
                else row.get(field) != value
                for operation, field, value in self.filters
            )
        ]
        if self.operation == "update":
            for row in matches:
                row.update(self.payload)
        elif self.operation == "delete":
            self.database.tables[self.table_name] = [
                row for row in rows if row not in matches
            ]

        result = deepcopy(matches)
        if self.single:
            result = result[0] if result else None
        return SimpleNamespace(data=result)


class FakeDatabase:
    def __init__(self):
        self.tables = {
            "profiles": [
                {
                    "id": "creator",
                    "email": "creator@example.com",
                    "full_name": "Task Creator",
                },
                {
                    "id": "assignee",
                    "email": "assignee@example.com",
                    "full_name": "Task Assignee",
                },
            ],
            "tasks": [],
        }

    def table(self, name):
        return FakeQuery(self, name)


class TaskFlowApiTests(unittest.TestCase):
    def setUp(self):
        self.client = taskflow.app.test_client()
        self.database = FakeDatabase()
        self.creator = SimpleNamespace(id="creator")
        self.assignee = SimpleNamespace(id="assignee")
        self.email_sender = patch.object(taskflow, "send_email")
        self.email_sender.start()
        self.addCleanup(self.email_sender.stop)
        self.addCleanup(self.stop_authentication_patch)
        self.set_authenticated_user(self.creator)

    def set_authenticated_user(self, user, status=200):
        if hasattr(self, "auth_patcher"):
            self.auth_patcher.stop()
        self.auth_patcher = patch.object(
            taskflow,
            "get_authenticated_context",
            return_value=(user, self.database if user else None, status),
        )
        self.auth_patcher.start()

    def stop_authentication_patch(self):
        if hasattr(self, "auth_patcher"):
            self.auth_patcher.stop()

    def create_task(self):
        return self.client.post(
            "/tasks",
            json={
                "title": "Prepare the demo",
                "description": "Review the slides",
                "assigned_to": "assignee",
            },
        )

    def test_create_and_list_task_and_email_assignee(self):
        with patch.object(taskflow, "send_email") as send_email:
            response = self.create_task()

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json["task"]["status"], "Pending")
        self.assertIsNone(response.json["notification_warning"])
        send_email.assert_called_once()
        self.assertEqual(send_email.call_args.args[0], "assignee@example.com")

        tasks = self.client.get("/tasks")
        self.assertEqual(tasks.status_code, 200)
        self.assertEqual(len(tasks.json), 1)

    def test_completion_emails_creator_only_on_first_transition(self):
        self.create_task()
        self.set_authenticated_user(self.assignee)

        with patch.object(taskflow, "send_email") as send_email:
            response = self.client.put(
                "/tasks/task-1",
                json={"status": "Completed"},
            )
            repeated = self.client.put(
                "/tasks/task-1",
                json={"status": "Completed"},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["task"]["status"], "Completed")
        self.assertEqual(repeated.status_code, 200)
        send_email.assert_called_once()
        self.assertEqual(send_email.call_args.args[0], "creator@example.com")

    def test_invalid_input_is_rejected(self):
        missing_title = self.client.post(
            "/tasks",
            json={"title": "  ", "assigned_to": "assignee"},
        )
        self_assigned = self.client.post(
            "/tasks",
            json={"title": "Prepare the demo", "assigned_to": "creator"},
        )
        unregistered_assignee = self.client.post(
            "/tasks",
            json={"title": "Prepare the demo", "assigned_to": "unknown"},
        )
        long_title = self.client.post(
            "/tasks",
            json={"title": "x" * 201, "assigned_to": "assignee"},
        )
        non_text_description = self.client.post(
            "/tasks",
            json={
                "title": "Prepare the demo",
                "description": 123,
                "assigned_to": "assignee",
            },
        )

        self.assertEqual(missing_title.status_code, 400)
        self.assertEqual(self_assigned.status_code, 400)
        self.assertEqual(unregistered_assignee.status_code, 400)
        self.assertEqual(long_title.status_code, 400)
        self.assertEqual(non_text_description.status_code, 400)
        self.assertEqual(self.database.tables["tasks"], [])

        self.create_task()
        invalid_status = self.client.put(
            "/tasks/task-1",
            json={"status": "Unknown"},
        )

        self.assertEqual(invalid_status.status_code, 400)

    def test_creator_can_delete_but_assignee_cannot(self):
        self.create_task()
        self.set_authenticated_user(self.assignee)
        forbidden = self.client.delete("/tasks/task-1")
        self.assertEqual(forbidden.status_code, 403)

        self.set_authenticated_user(self.creator)
        deleted = self.client.delete("/tasks/task-1")
        self.assertEqual(deleted.status_code, 200)
        self.assertEqual(self.database.tables["tasks"], [])

    def test_email_failure_is_returned_as_warning_without_losing_task(self):
        with patch.object(
            taskflow,
            "send_email",
            side_effect=RuntimeError("Gmail unavailable"),
        ):
            response = self.create_task()

        self.assertEqual(response.status_code, 201)
        self.assertIsNotNone(response.json["notification_warning"])
        self.assertEqual(len(self.database.tables["tasks"]), 1)

    def test_invalid_gmail_oauth_client_has_actionable_warning(self):
        error = RefreshError(
            "invalid_client: The OAuth client was not found."
        )
        with patch.object(taskflow, "send_email", side_effect=error):
            response = self.create_task()

        self.assertEqual(response.status_code, 201)
        self.assertIn("GMAIL_CLIENT_ID", response.json["notification_warning"])
        self.assertEqual(len(self.database.tables["tasks"]), 1)

    def test_unauthenticated_request_is_rejected(self):
        self.set_authenticated_user(None, status=401)

        response = self.client.get("/tasks")
        self.assertEqual(response.status_code, 401)

    def test_localhost_alias_is_allowed_by_cors(self):
        response = self.client.options(
            "/tasks",
            headers={
                "Origin": "http://127.0.0.1:3000",
                "Access-Control-Request-Method": "GET",
            },
        )
        self.assertEqual(
            response.headers.get("Access-Control-Allow-Origin"),
            "http://127.0.0.1:3000",
        )


if __name__ == "__main__":
    unittest.main()
