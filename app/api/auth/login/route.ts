import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { ensureUsersTable, getPool } from "../../../../lib/db";
import { createSession } from "../../../../lib/session";

type LoginBody = {
  username?: string;
  password?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as LoginBody;
    const username = body.username?.trim() ?? "";
    const password = body.password ?? "";

    await ensureUsersTable();
    const pool = getPool();

    const result = await pool.query("SELECT username, password_hash FROM users WHERE username = $1 LIMIT 1", [username]);
    if (!result.rowCount) {
      return NextResponse.json({ message: "아이디 또는 비밀번호가 올바르지 않습니다." }, { status: 401 });
    }

    const user = result.rows[0] as { username: string; password_hash: string };
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return NextResponse.json({ message: "아이디 또는 비밀번호가 올바르지 않습니다." }, { status: 401 });
    }

    await createSession(user.username);

    return NextResponse.json({ username: user.username });
  } catch (error) {
    const message = error instanceof Error ? error.message : "로그인 처리 중 오류가 발생했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
