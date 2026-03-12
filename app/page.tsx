"use client";

import { useEffect, useState } from "react";
import { requestApi } from "../lib/http-client";

type StoredUser = {
  username: string;
  password: string;
};

export default function Home() {
  const [mode, setMode] = useState<"none" | "login" | "signup">("none");
  const [loginId, setLoginId] = useState("");
  const [loginPw, setLoginPw] = useState("");
  const [signupId, setSignupId] = useState("");
  const [signupPw, setSignupPw] = useState("");
  const [loginError, setLoginError] = useState("");
  const [signupError, setSignupError] = useState("");
  const [showLoginPw, setShowLoginPw] = useState(false);
  const [showSignupPw, setShowSignupPw] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const loadSession = async () => {
      const result = await requestApi<{ username: string | null }>("/api/auth/session", { cache: "no-store" });
      const data = result.data;

      if (data.username) {
        window.location.replace("/dashboard");
      }
    };

    void loadSession();
  }, []);

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoginError("");
    setBusy(true);

    const id = loginId.trim();
    const pw = loginPw;

    try {
      const result = await requestApi<{ username?: string }>("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username: id, password: pw } satisfies StoredUser),
      });

      if (!result.ok) {
        setLoginError(result.traceId ? `${result.message} (traceId: ${result.traceId})` : result.message);
        return;
      }

      setMode("none");
      setLoginId("");
      setLoginPw("");
      window.location.href = "/dashboard";
    } finally {
      setBusy(false);
    }
  };

  const handleSignup = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSignupError("");
    setBusy(true);

    const id = signupId.trim();
    const pw = signupPw;

    if (id.length < 5) {
      setSignupError("아이디는 5자 이상이어야 합니다.");
      setBusy(false);
      return;
    }

    if (pw.length < 6) {
      setSignupError("비밀번호는 6자 이상이어야 합니다.");
      setBusy(false);
      return;
    }

    try {
      const result = await requestApi<{ username?: string }>("/api/auth/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username: id, password: pw } satisfies StoredUser),
      });

      if (!result.ok) {
        setSignupError(result.traceId ? `${result.message} (traceId: ${result.traceId})` : result.message);
        return;
      }

      setMode("none");
      setSignupId("");
      setSignupPw("");
      window.location.href = "/dashboard";
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="landing-shell">
      <section className="orb orb-left" aria-hidden="true" />
      <section className="orb orb-right" aria-hidden="true" />

      <header className="topbar reveal">
        <div className="top-actions">
          <button className="btn btn-ghost" type="button" onClick={() => setMode("login")}>
            로그인
          </button>
          <button className="btn btn-primary" type="button" onClick={() => setMode("signup")}>
            회원가입
          </button>
        </div>
      </header>

      {mode !== "none" ? (
        <section className="auth-overlay" role="dialog" aria-modal="true">
          <div className="auth-modal">
            <div className="auth-modal-head">
              <h2>{mode === "login" ? "로그인" : "회원가입"}</h2>
              <button className="text-link" type="button" onClick={() => setMode("none")}>
                닫기
              </button>
            </div>

            {mode === "login" ? (
              <form className="auth-form" onSubmit={handleLogin}>
                <label className="auth-field">
                  아이디
                  <input
                    className="auth-input"
                    name="login-id"
                    value={loginId}
                    onChange={(event) => setLoginId(event.target.value)}
                    required
                  />
                </label>
                <label className="auth-field">
                  비밀번호
                  <div className="password-row">
                    <input
                      className="auth-input"
                      name="login-password"
                      type={showLoginPw ? "text" : "password"}
                      value={loginPw}
                      onChange={(event) => setLoginPw(event.target.value)}
                      required
                    />
                    <button className="eye-btn" type="button" onClick={() => setShowLoginPw((prev) => !prev)}>
                      &lt;눈&gt;
                    </button>
                  </div>
                </label>
                {loginError ? <p className="auth-error">{loginError}</p> : null}
                <button className="btn btn-primary auth-submit" type="submit" disabled={busy}>
                  {busy ? "처리 중..." : "로그인"}
                </button>
              </form>
            ) : (
              <form className="auth-form" onSubmit={handleSignup}>
                <label className="auth-field">
                  아이디 (5자 이상)
                  <input
                    className="auth-input"
                    name="signup-id"
                    value={signupId}
                    onChange={(event) => setSignupId(event.target.value)}
                    required
                  />
                </label>
                <label className="auth-field">
                  비밀번호 (6자 이상)
                  <div className="password-row">
                    <input
                      className="auth-input"
                      name="signup-password"
                      type={showSignupPw ? "text" : "password"}
                      value={signupPw}
                      onChange={(event) => setSignupPw(event.target.value)}
                      required
                    />
                    <button className="eye-btn" type="button" onClick={() => setShowSignupPw((prev) => !prev)}>
                      &lt;눈&gt;
                    </button>
                  </div>
                </label>
                {signupError ? <p className="auth-error">{signupError}</p> : null}
                <button className="btn btn-primary auth-submit" type="submit" disabled={busy}>
                  {busy ? "처리 중..." : "회원가입"}
                </button>
              </form>
            )}
          </div>
        </section>
      ) : null}
    </main>
  );
}
