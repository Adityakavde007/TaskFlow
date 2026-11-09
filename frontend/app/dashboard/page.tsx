"use client";

import {
  CircleCheck,
  Clock3,
  Inbox,
  ListTodo,
  LogOut,
  Plus,
  Search,
  Trash2,
  Users,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { apiRequest } from "@/lib/api";
import { supabase } from "@/lib/supabase";

type TaskStatus = "Pending" | "In Progress" | "Completed";
type TaskFilter = "all" | "assigned" | "created";

interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  created_by: string;
  assigned_to: string;
  created_at: string;
}

interface Profile {
  id: string;
  email: string;
  full_name: string | null;
}

interface TaskMutationResponse {
  task: Task;
  notification_warning: string | null;
}

const statuses: TaskStatus[] = ["Pending", "In Progress", "Completed"];

export default function Dashboard() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [email, setEmail] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [people, setPeople] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyTaskId, setBusyTaskId] = useState("");
  const [filter, setFilter] = useState<TaskFilter>("all");
  const [search, setSearch] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignee, setAssignee] = useState("");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  const loadWorkspace = useCallback(async () => {
    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();
    if (sessionError) {
      throw sessionError;
    }

    const user = sessionData.session?.user;
    if (!user) {
      router.replace("/");
      return;
    }

    setUserId(user.id);
    setEmail(user.email ?? "");

    const [taskList, profileList] = await Promise.all([
      apiRequest<Task[]>("/tasks"),
      apiRequest<Profile[]>("/users"),
    ]);
    setTasks(taskList);
    setPeople(profileList);
  }, [router]);

  useEffect(() => {
    let active = true;
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!session) {
          router.replace("/");
        }
      }
    );

    const initialize = async () => {
      try {
        await loadWorkspace();
      } catch (error) {
        if (active) {
          setIsError(true);
          setMessage(
            error instanceof Error ? error.message : "Could not load tasks."
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void initialize();
    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, [loadWorkspace, router]);

  const visibleTasks = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return tasks.filter((task) => {
      const matchesFilter =
        filter === "all" ||
        (filter === "assigned" && task.assigned_to === userId) ||
        (filter === "created" && task.created_by === userId);
      const matchesSearch =
        !normalizedSearch ||
        task.title.toLowerCase().includes(normalizedSearch) ||
        task.description.toLowerCase().includes(normalizedSearch);
      return matchesFilter && matchesSearch;
    });
  }, [filter, search, tasks, userId]);

  const completedCount = tasks.filter(
    (task) => task.status === "Completed"
  ).length;
  const inProgressCount = tasks.filter(
    (task) => task.status === "In Progress"
  ).length;
  const pendingCount = tasks.filter(
    (task) => task.status === "Pending"
  ).length;

  async function handleCreateTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setIsError(false);

    try {
      const response = await apiRequest<TaskMutationResponse>("/tasks", "POST", {
        title,
        description,
        assigned_to: assignee,
      });
      setTitle("");
      setDescription("");
      setAssignee("");
      setMessage(
        response.notification_warning ?? "Task created and assigned."
      );
      await loadWorkspace();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Could not create the task.";
      setIsError(true);
      setMessage(errorMessage);
      try {
        await loadWorkspace();
      } catch (refreshError) {
        setMessage(
          `${errorMessage} Refresh failed: ${
            refreshError instanceof Error
              ? refreshError.message
              : "Could not reload the workspace."
          }`
        );
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(task: Task, status: TaskStatus) {
    setBusyTaskId(task.id);
    setMessage("");
    setIsError(false);
    try {
      const response = await apiRequest<TaskMutationResponse>(
        `/tasks/${encodeURIComponent(task.id)}`,
        "PUT",
        { status }
      );
      setTasks((current) =>
        current.map((item) =>
          item.id === task.id ? response.task : item
        )
      );
      if (response.notification_warning) {
        setMessage(response.notification_warning);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Could not update the task.";
      setIsError(true);
      setMessage(errorMessage);
      try {
        await loadWorkspace();
      } catch (refreshError) {
        setMessage(
          `${errorMessage} Refresh failed: ${
            refreshError instanceof Error
              ? refreshError.message
              : "Could not reload the workspace."
          }`
        );
      }
    } finally {
      setBusyTaskId("");
    }
  }

  async function handleDeleteTask(taskId: string) {
    setBusyTaskId(taskId);
    setMessage("");
    setIsError(false);
    try {
      await apiRequest<{ message: string }>(
        `/tasks/${encodeURIComponent(taskId)}`,
        "DELETE"
      );
      setTasks((current) => current.filter((task) => task.id !== taskId));
    } catch (error) {
      setIsError(true);
      setMessage(
        error instanceof Error ? error.message : "Could not delete the task."
      );
    } finally {
      setBusyTaskId("");
    }
  }

  async function handleSignOut() {
    const { error } = await supabase.auth.signOut();
    if (error) {
      setIsError(true);
      setMessage(error.message);
      return;
    }
    router.replace("/");
  }

  function getProfileName(profileId: string) {
    if (profileId === userId) {
      return "You";
    }
    const profile = people.find((person) => person.id === profileId);
    return profile?.full_name || profile?.email || "Team member";
  }

  return (
    <main className="workspace">
      <aside className="workspace-sidebar">
        <Link className="brand workspace-brand" href="/dashboard">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </span>
          TaskFlow
        </Link>

        <div className="workspace-nav-label">WORKSPACE</div>
        <nav className="workspace-nav" aria-label="Task views">
          <button
            className={filter === "all" ? "nav-item nav-item-active" : "nav-item"}
            onClick={() => setFilter("all")}
            type="button"
          >
            <Inbox size={18} />
            All tasks
            <span>{tasks.length}</span>
          </button>
          <button
            className={
              filter === "assigned" ? "nav-item nav-item-active" : "nav-item"
            }
            onClick={() => setFilter("assigned")}
            type="button"
          >
            <ListTodo size={18} />
            Assigned to me
            <span>{tasks.filter((task) => task.assigned_to === userId).length}</span>
          </button>
          <button
            className={
              filter === "created" ? "nav-item nav-item-active" : "nav-item"
            }
            onClick={() => setFilter("created")}
            type="button"
          >
            <Users size={18} />
            Created by me
            <span>{tasks.filter((task) => task.created_by === userId).length}</span>
          </button>
        </nav>

        <div className="sidebar-bottom">
          <div className="account-chip">
            <span className="account-avatar">
              {(email.charAt(0) || "U").toUpperCase()}
            </span>
            <span className="account-copy">
              <strong>Signed in</strong>
              <span title={email}>{email || "TaskFlow member"}</span>
            </span>
          </div>
          <button className="signout-button" onClick={handleSignOut} type="button">
            <LogOut size={17} />
            Sign out
          </button>
        </div>
      </aside>

      <section className="workspace-main">
        <header className="workspace-header">
          <div>
            <p className="workspace-eyebrow">YOUR TEAM, IN FLOW</p>
            <h1>Good work starts with a clear next step.</h1>
            <p className="workspace-subtitle">
              Create tasks, share ownership, and keep progress visible.
            </p>
          </div>
          <div className="workspace-date">
            <span className="date-dot" />
            Your workspace
          </div>
        </header>

        <section className="stats-grid" aria-label="Task summary">
          <article className="stat-card">
            <span className="stat-icon stat-icon-dark"><ListTodo size={19} /></span>
            <span className="stat-label">Total tasks</span>
            <strong>{tasks.length}</strong>
            <span className="stat-footnote">Across your workspace</span>
          </article>
          <article className="stat-card">
            <span className="stat-icon stat-icon-sand"><Clock3 size={19} /></span>
            <span className="stat-label">In progress</span>
            <strong>{inProgressCount}</strong>
            <span className="stat-footnote">{pendingCount} still pending</span>
          </article>
          <article className="stat-card">
            <span className="stat-icon stat-icon-green"><CircleCheck size={19} /></span>
            <span className="stat-label">Completed</span>
            <strong>{completedCount}</strong>
            <span className="stat-footnote">Nice work, team</span>
          </article>
        </section>

        <section className="task-workspace">
          <div className="task-list-panel">
            <div className="task-panel-heading">
              <div>
                <p className="section-eyebrow">TASK BOARD</p>
                <h2>
                  {filter === "assigned"
                    ? "Assigned to me"
                    : filter === "created"
                      ? "Created by me"
                      : "All tasks"}
                </h2>
              </div>
              <label className="task-search">
                <Search size={16} />
                <input
                  aria-label="Search tasks"
                  placeholder="Search tasks"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
            </div>

            {message && (
              <p
                className={isError ? "workspace-message message-error" : "workspace-message"}
                role="status"
              >
                {message}
              </p>
            )}

            {loading ? (
              <div className="task-empty">
                <span className="loading-indicator" />
                <p>Loading your workspace...</p>
              </div>
            ) : visibleTasks.length === 0 ? (
              <div className="task-empty">
                <span className="empty-icon"><ListTodo size={22} /></span>
                <h3>{search ? "No matching tasks" : "Your board is clear"}</h3>
                <p>
                  {search
                    ? "Try a different search term."
                    : "Create a task to get your team moving."}
                </p>
              </div>
            ) : (
              <div className="task-list">
                {visibleTasks.map((task) => {
                  const canDelete = task.created_by === userId;
                  return (
                    <article className="task-row" key={task.id}>
                      <div className="task-row-copy">
                        <div className="task-row-title">
                          <h3>{task.title}</h3>
                          <span className={`status-pill status-${task.status.toLowerCase().replace(" ", "-")}`}>
                            {task.status}
                          </span>
                        </div>
                        {task.description && (
                          <p className="task-row-description">{task.description}</p>
                        )}
                        <div className="task-row-meta">
                          <span>Assigned to {getProfileName(task.assigned_to)}</span>
                          <span className="meta-separator">·</span>
                          <span>Created by {getProfileName(task.created_by)}</span>
                        </div>
                      </div>
                      <div className="task-row-actions">
                        <label className="status-select-label">
                          <span className="sr-only">Update status for {task.title}</span>
                          <select
                            value={task.status}
                            disabled={busyTaskId === task.id}
                            onChange={(event) =>
                              void handleStatusChange(
                                task,
                                event.target.value as TaskStatus
                              )
                            }
                          >
                            {statuses.map((status) => (
                              <option key={status} value={status}>{status}</option>
                            ))}
                          </select>
                        </label>
                        {canDelete && (
                          <button
                            className="icon-button delete-task-button"
                            type="button"
                            aria-label={`Delete ${task.title}`}
                            disabled={busyTaskId === task.id}
                            onClick={() => void handleDeleteTask(task.id)}
                          >
                            <Trash2 size={17} />
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>

          <aside className="create-task-panel">
            <div className="create-task-heading">
              <span className="create-task-icon"><Plus size={19} /></span>
              <div>
                <p className="section-eyebrow">MOVE WORK FORWARD</p>
                <h2>Create a task</h2>
              </div>
            </div>
            <p className="create-task-intro">
              Give the next step an owner and let your team take it from here.
            </p>

            <form className="task-form" onSubmit={handleCreateTask}>
              <label className="task-field">
                Task name
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="e.g. Review the project brief"
                  maxLength={200}
                  required
                />
              </label>
              <label className="task-field">
                Description <span>(optional)</span>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Add a little more context..."
                  rows={4}
                  maxLength={2000}
                />
              </label>
              <label className="task-field">
                Assign to
                <select
                  value={assignee}
                  onChange={(event) => setAssignee(event.target.value)}
                  required
                >
                  <option value="">Choose a team member</option>
                  {people.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.full_name
                        ? `${person.full_name} (${person.email})`
                        : person.email}
                    </option>
                  ))}
                </select>
              </label>
              {people.length === 0 && !loading && (
                <p className="form-hint">
                  Another user needs to create an account before you can assign a task.
                </p>
              )}
              <button
                className="create-task-button"
                type="submit"
                disabled={saving || loading || people.length === 0}
              >
                <Plus size={17} />
                {saving ? "Creating task..." : "Create task"}
              </button>
            </form>

            <div className="notification-note">
              <span className="notification-note-dot" />
              Assignees are emailed when a task is created. You&apos;ll be notified
              when it&apos;s completed.
            </div>
          </aside>
        </section>
      </section>
    </main>
  );
}
