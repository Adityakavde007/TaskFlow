import os
from typing import Any

from flask import Flask, jsonify, request
from flask_cors import CORS
from google.auth.exceptions import RefreshError
from supabase_auth.errors import AuthError

from database import get_supabase_client
from email_service import send_email

app = Flask(__name__)

allowed_origins = [
    origin.strip()
    for origin in os.getenv(
        "FRONTEND_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000",
    ).split(",")
    if origin.strip()
]
CORS(app, origins=allowed_origins)


def get_authenticated_context() -> tuple[Any, Any, int]:
    authorization = request.headers.get("Authorization", "")
    if not authorization.startswith("Bearer "):
        return None, None, 401

    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        return None, None, 401

    try:
        client = get_supabase_client()
        response = client.auth.get_user(token)
        user = response.user if response else None
        if user is None:
            return None, None, 401

        client.postgrest.auth(token)
        return user, client, 200
    except AuthError as error:
        app.logger.info(
            "Supabase rejected an access token (%s).",
            type(error).__name__,
        )
        return None, None, 401
    except Exception as error:
        app.logger.exception(
            "The Supabase authentication service is unavailable (%s).",
            type(error).__name__,
        )
        return None, None, 503


def authentication_error(status: int):
    if status == 401:
        return jsonify({"error": "Unauthorized"}), status
    return jsonify({"error": "Authentication service unavailable"}), status


def send_notification(
    receiver: str | None,
    subject: str,
    body: str,
) -> str | None:
    if not receiver:
        return "The notification recipient does not have an email address."

    try:
        send_email(receiver, subject, body)
    except RefreshError as error:
        if "invalid_client" in str(error).lower():
            app.logger.error(
                "Gmail rejected its OAuth client; update the backend Gmail credentials."
            )
            return (
                "Task saved, but Gmail rejected the OAuth client. "
                "Check GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and "
                "GMAIL_REFRESH_TOKEN in backend/.env."
            )
        app.logger.exception("Failed to refresh Gmail OAuth credentials.")
        return "The task was saved, but its email notification could not be sent."
    except Exception:
        app.logger.exception("Failed to send a task notification email.")
        return "The task was saved, but its email notification could not be sent."

    return None


@app.get("/")
def home():
    return jsonify({"message": "TaskFlow API is running"})


@app.get("/users")
def get_users():
    user, client, auth_status = get_authenticated_context()
    if not user:
        return authentication_error(auth_status)

    result = client.table("profiles") \
        .select("id,email,full_name") \
        .neq("id", user.id) \
        .execute()

    return jsonify([
        profile for profile in result.data
        if profile.get("email")
    ])


@app.get("/tasks")
def get_tasks():
    user, client, auth_status = get_authenticated_context()
    if not user:
        return authentication_error(auth_status)

    result = client.table("tasks") \
        .select("*") \
        .or_(
            f"created_by.eq.{user.id},assigned_to.eq.{user.id}"
        ) \
        .order("created_at", desc=True) \
        .execute()

    return jsonify(result.data)


@app.post("/tasks")
def create_task():
    user, client, auth_status = get_authenticated_context()
    if not user:
        return authentication_error(auth_status)

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "A JSON object is required"}), 400

    title = data.get("title")
    assigned_to = data.get("assigned_to")
    if not isinstance(title, str) or not title.strip():
        return jsonify({"error": "A task title is required"}), 400
    if len(title.strip()) > 200:
        return jsonify({"error": "Task titles must be 200 characters or fewer"}), 400
    if not isinstance(assigned_to, str) or not assigned_to:
        return jsonify({"error": "An assignee is required"}), 400

    description = data.get("description", "")
    if not isinstance(description, str):
        return jsonify({"error": "Task descriptions must be text"}), 400
    if len(description) > 2000:
        return jsonify({
            "error": "Task descriptions must be 2000 characters or fewer"
        }), 400
    if assigned_to == user.id:
        return jsonify({"error": "Tasks must be assigned to another user"}), 400

    try:
        recipient = client.table("profiles") \
            .select("id,email") \
            .eq("id", assigned_to) \
            .maybe_single() \
            .execute()
    except Exception:
        app.logger.exception("Could not verify the task assignee.")
        return jsonify({"error": "The assignee could not be verified"}), 503

    if not recipient.data:
        return jsonify({"error": "Choose a registered team member"}), 400

    task = {
        "title": title.strip(),
        "description": description.strip(),
        "created_by": user.id,
        "assigned_to": assigned_to,
        "status": "Pending",
    }

    result = client.table("tasks").insert(task).execute()
    if not result.data:
        app.logger.error("Supabase inserted no task row.")
        return jsonify({"error": "The task could not be created"}), 500

    task_data = result.data[0]
    warning = send_notification(
        recipient.data.get("email"),
        "New Task Assigned - TaskFlow",
        (
            "Hello,\n\n"
            "A new task has been assigned to you.\n\n"
            f"Task: {task_data['title']}\n"
            "Status: Pending\n\n"
            "Please log in to TaskFlow."
        ),
    )

    return jsonify({
        "task": task_data,
        "notification_warning": warning,
    }), 201


@app.put("/tasks/<task_id>")
def update_task(task_id: str):
    user, client, auth_status = get_authenticated_context()
    if not user:
        return authentication_error(auth_status)

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "A JSON object is required"}), 400

    existing = client.table("tasks") \
        .select("*") \
        .eq("id", task_id) \
        .maybe_single() \
        .execute()

    if not existing.data:
        return jsonify({"error": "Task not found"}), 404

    task = existing.data
    if user.id not in (task["created_by"], task["assigned_to"]):
        return jsonify({"error": "Forbidden"}), 403

    status = data.get("status")
    if status not in ("Pending", "In Progress", "Completed"):
        return jsonify({"error": "Invalid status"}), 400

    result = client.table("tasks") \
        .update({"status": status}) \
        .eq("id", task_id) \
        .execute()

    if not result.data:
        return jsonify({"error": "The task could not be updated"}), 500

    updated_task = result.data[0]
    warning = None
    if task["status"] != "Completed" and status == "Completed":
        try:
            creator = client.table("profiles") \
                .select("email") \
                .eq("id", task["created_by"]) \
                .maybe_single() \
                .execute()
        except Exception:
            app.logger.exception(
                "Task was completed, but the creator email lookup failed."
            )
            warning = (
                "Task was completed, but the creator email could not be loaded."
            )
        else:
            creator_email = creator.data.get("email") if creator.data else None
            warning = send_notification(
                creator_email,
                "Task Completed - TaskFlow",
                (
                    "Hello,\n\n"
                    "Your task has been completed.\n\n"
                    f"Task: {task['title']}\n"
                    "Status: Completed\n\n"
                    "Thank you for using TaskFlow."
                ),
            )

    return jsonify({
        "task": updated_task,
        "notification_warning": warning,
    })


@app.delete("/tasks/<task_id>")
def delete_task(task_id: str):
    user, client, auth_status = get_authenticated_context()
    if not user:
        return authentication_error(auth_status)

    result = client.table("tasks") \
        .select("id,created_by") \
        .eq("id", task_id) \
        .maybe_single() \
        .execute()

    if not result.data:
        return jsonify({"error": "Task not found"}), 404
    if result.data["created_by"] != user.id:
        return jsonify({"error": "Only the creator can delete a task"}), 403

    client.table("tasks") \
        .delete() \
        .eq("id", task_id) \
        .execute()

    return jsonify({"message": "Task deleted"})


if __name__ == "__main__":
    app.run(
        debug=os.getenv("FLASK_DEBUG", "false").lower() == "true",
        port=int(os.getenv("PORT", "5000")),
    )
