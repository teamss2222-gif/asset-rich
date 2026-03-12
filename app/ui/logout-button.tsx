"use client";

import { requestApi } from "../../lib/http-client";

export function LogoutButton() {
  const handleLogout = async () => {
    await requestApi("/api/auth/logout", { method: "POST" });
    window.location.href = "/";
  };

  return (
    <button className="btn btn-primary btn-sm" type="button" onClick={handleLogout}>
      로그아웃
    </button>
  );
}
