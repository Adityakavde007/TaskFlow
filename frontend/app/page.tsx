"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../lib/supabase";

export default function Home() {
  const router = useRouter();
  const [isSignup, setIsSignup] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleEmailAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsError(false);
    setBusy(true);

    try {
      if (isSignup) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: name.trim() },
            emailRedirectTo: `${window.location.origin}/dashboard`,
          },
        });

        if (error) {
          throw error;
        }

        if (data.session) {
          router.push("/dashboard");
        } else {
          setMessage("Account created. Check your email to confirm your account.");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          throw error;
        }

        router.push("/dashboard");
      }
    } catch (error) {
      setIsError(true);
      setMessage(
        error instanceof Error ? error.message : "Authentication failed."
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogleLogin() {
    setMessage("");
    setIsError(false);
    setBusy(true);

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/dashboard`,
        },
      });

      if (error) {
        throw error;
      }
    } catch (error) {
      setIsError(true);
      setMessage(
        error instanceof Error ? error.message : "Google sign-in failed."
      );
      setBusy(false);
    }
  }

  function toggleMode() {
    setIsSignup((current) => !current);
    setMessage("");
    setIsError(false);
  }

  return (
    <main className="auth-layout">
      <section className="story-panel" aria-label="About TaskFlow">
        <Link className="brand" href="/" aria-label="TaskFlow home">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </span>
          TaskFlow
        </Link>

        <div className="story-copy">
          <p className="story-kicker">A thoughtful space for teamwork</p>
          <h1>Turn plans into progress.</h1>
          <p className="story-description">
            Bring the right people into every task, keep the next step visible,
            and celebrate the work your team gets done.
          </p>
        </div>

        <div className="preview-stage" aria-hidden="true">
          <div className="preview-window">
            <div className="preview-heading">
              <span>Team focus</span>
              <span className="preview-count">
                <span className="status-dot" />
                2 of 3 moving
              </span>
            </div>
            <div className="preview-task">
              <span className="task-check task-check-complete">✓</span>
              <span className="task-copy">
                <span className="task-title task-title-complete">
                  Share the project brief
                </span>
                <span className="task-meta">Completed</span>
              </span>
              <span className="task-avatar">AM</span>
            </div>
            <div className="preview-task">
              <span className="task-check" />
              <span className="task-copy">
                <span className="task-title">Review the launch checklist</span>
                <span className="task-meta">In progress</span>
              </span>
              <span className="task-avatar task-avatar-light">JS</span>
            </div>
            <div className="preview-task">
              <span className="task-check" />
              <span className="task-copy">
                <span className="task-title">Send notes to the team</span>
                <span className="task-meta">Pending</span>
              </span>
              <span className="task-avatar">AM</span>
            </div>
          </div>
          <p className="preview-caption">
            One clear next step makes all the difference.
          </p>
        </div>
      </section>

      <section className="form-panel">
        <div className="auth-content">
          <div className="auth-heading">
            <p className="auth-eyebrow">{isSignup ? "GET STARTED" : "WELCOME BACK"}</p>
            <h2>{isSignup ? "Create your account" : "Sign in to TaskFlow"}</h2>
            <p className="auth-description">
              {isSignup
                ? "Set up your account and start moving work forward."
                : "Pick up where you and your team left off."}
            </p>
          </div>

          <form className="auth-form" onSubmit={handleEmailAuth}>
            {isSignup && (
              <label className="field">
                Full name
                <input
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Your name"
                  required
                  disabled={busy}
                />
              </label>
            )}

            <label className="field">
              Email address
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                required
                disabled={busy}
              />
            </label>

            <label className="field">
              Password
              <input
                type="password"
                autoComplete={isSignup ? "new-password" : "current-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 6 characters"
                minLength={6}
                required
                disabled={busy}
              />
            </label>

            <button className="primary-button" type="submit" disabled={busy}>
              {busy
                ? "Please wait..."
                : isSignup
                  ? "Create account"
                  : "Sign in"}
            </button>
          </form>

          <div className="auth-divider">
            <span />
            <span>or continue with</span>
            <span />
          </div>

          <button
            className="google-button"
            type="button"
            onClick={handleGoogleLogin}
            disabled={busy}
          >
            <span className="google-mark" aria-hidden="true">G</span>
            Continue with Google
          </button>

          <p className="auth-message" role="status" aria-live="polite">
            {message && (
              <span className={isError ? "message-error" : ""}>{message}</span>
            )}
          </p>

          <p className="auth-switch">
            {isSignup ? "Already have an account?" : "New to TaskFlow?"}
            <button type="button" onClick={toggleMode} disabled={busy}>
              {isSignup ? "Sign in" : "Create an account"}
            </button>
          </p>
        </div>
      </section>
    </main>
  );
}
