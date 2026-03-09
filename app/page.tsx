"use client";

import { useEffect, useMemo, useState } from "react";

type StoredUser = {
  username: string;
  password: string;
};

const USERS_KEY = "asset-users";
const CURRENT_USER_KEY = "asset-current-user";

function readUsers(): StoredUser[] {
  const raw = localStorage.getItem(USERS_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as StoredUser[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeUsers(users: StoredUser[]) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

export default function Home() {
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [mode, setMode] = useState<"none" | "login" | "signup">("none");
  const [loginId, setLoginId] = useState("");
  const [loginPw, setLoginPw] = useState("");
  const [signupId, setSignupId] = useState("");
  const [signupPw, setSignupPw] = useState("");
  const [loginError, setLoginError] = useState("");
  const [signupError, setSignupError] = useState("");
  const [message, setMessage] = useState("");
  const [showLoginPw, setShowLoginPw] = useState(false);
  const [showSignupPw, setShowSignupPw] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(CURRENT_USER_KEY);
    if (saved) {
      setCurrentUser(saved);
    }
  }, []);

  const isLoggedIn = useMemo(() => Boolean(currentUser), [currentUser]);

  const handleLogin = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoginError("");
    setMessage("");

    const id = loginId.trim();
    const pw = loginPw;
    const users = readUsers();
    const match = users.find((user) => user.username === id && user.password === pw);

    if (!match) {
      setLoginError("아이디 또는 비밀번호가 올바르지 않습니다.");
      return;
    }

    localStorage.setItem(CURRENT_USER_KEY, id);
    setCurrentUser(id);
    setMode("none");
    setLoginId("");
    setLoginPw("");
    setMessage("로그인 되었습니다.");
  };

  const handleSignup = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSignupError("");
    setMessage("");

    const id = signupId.trim();
    const pw = signupPw;

    if (id.length < 5) {
      setSignupError("아이디는 5자 이상이어야 합니다.");
      return;
    }

    if (pw.length < 6) {
      setSignupError("비밀번호는 6자 이상이어야 합니다.");
      return;
    }

    const users = readUsers();
    const exists = users.some((user) => user.username === id);
    if (exists) {
      setSignupError("이미 사용 중인 아이디입니다.");
      return;
    }

    writeUsers([...users, { username: id, password: pw }]);
    localStorage.setItem(CURRENT_USER_KEY, id);
    setCurrentUser(id);
    setMode("none");
    setSignupId("");
    setSignupPw("");
    setMessage("회원가입 및 로그인이 완료되었습니다.");
  };

  const handleLogout = () => {
    localStorage.removeItem(CURRENT_USER_KEY);
    setCurrentUser(null);
    setMessage("로그아웃 되었습니다.");
  };

  return (
    <main className="landing-shell">
      <section className="orb orb-left" aria-hidden="true" />
      <section className="orb orb-right" aria-hidden="true" />

      <header className="topbar reveal">
        <p className="brand">자산관리 홈</p>
        <div className="top-actions">
          {isLoggedIn ? (
            <>
              <span className="welcome-text">{currentUser} 님</span>
              <button className="btn btn-ghost" type="button" onClick={handleLogout}>
                로그아웃
              </button>
            </>
          ) : (
            <>
              <button className="btn btn-ghost" type="button" onClick={() => setMode("login")}>
                로그인
              </button>
              <button className="btn btn-primary" type="button" onClick={() => setMode("signup")}>
                회원가입
              </button>
            </>
          )}
        </div>
      </header>

      <nav className="menu-row reveal reveal-delay-1" aria-label="주요 메뉴">
        <a href="#" className="menu-item">
          메인
        </a>
        <a href="#" className="menu-item">
          자산 현황
        </a>
        <a href="#" className="menu-item">
          수입/지출
        </a>
        <a href="#" className="menu-item">
          목표 관리
        </a>
      </nav>

      <section className="hero reveal reveal-delay-1">
        <p className="eyebrow">ASSET MANAGEMENT</p>
        <h1>내 자산을 한눈에 확인하고 계획적으로 관리하세요.</h1>
        <p className="subtitle">
          로그인하면 대시보드가 활성화되고, 카드별로 자산 요약/월간 수지/저축률을 바로 볼 수 있습니다.
        </p>
      </section>

      {message ? <p className="status-ok reveal reveal-delay-2">{message}</p> : null}

      <section className="stat-grid reveal reveal-delay-2">
        <article className="card">
          <p>총 자산</p>
          <h2>{isLoggedIn ? "42,500,000원" : "로그인 후 확인"}</h2>
        </article>
        <article className="card">
          <p>이번 달 수지</p>
          <h2>{isLoggedIn ? "+1,320,000원" : "로그인 후 확인"}</h2>
        </article>
        <article className="card">
          <p>저축률</p>
          <h2>{isLoggedIn ? "31%" : "로그인 후 확인"}</h2>
        </article>
      </section>

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
                <button className="btn btn-primary auth-submit" type="submit">
                  로그인
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
                <button className="btn btn-primary auth-submit" type="submit">
                  회원가입
                </button>
              </form>
            )}
          </div>
        </section>
      ) : null}
    </main>
  );
}
