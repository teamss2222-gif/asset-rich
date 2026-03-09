"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const username = String(formData.get("username") ?? "");
    const password = String(formData.get("password") ?? "");

    setError(null);
    startTransition(async () => {
      const result = await signIn("credentials", {
        redirect: false,
        username,
        password,
      });

      if (result?.error) {
        setError("Invalid username or password.");
        return;
      }

      router.push("/dashboard");
    });
  };

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="eyebrow">SECURE ACCESS</p>
        <h1 className="auth-title">Sign in to Asset Lab</h1>
        <p className="auth-subtitle">Use the demo credentials from your .env.local file.</p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="auth-field">
            Username
            <input className="auth-input" name="username" type="text" autoComplete="username" required />
          </label>
          <label className="auth-field">
            Password
            <input className="auth-input" name="password" type="password" autoComplete="current-password" required />
          </label>

          {error ? <p className="auth-error">{error}</p> : null}

          <button className="btn btn-primary auth-submit" type="submit" disabled={isPending}>
            {isPending ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <div className="auth-divider" />
        <p className="auth-hint">
          Need to go back? <a className="auth-link" href="/">Return home</a>
        </p>
      </section>
    </main>
  );
}
