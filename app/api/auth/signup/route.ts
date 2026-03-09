import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { ensureUsersTable, getPool } from "../../../../lib/db";
import { createSession } from "../../../../lib/session";

type SignupBody = {
  username?: string;
  password?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SignupBody;
    const username = body.username?.trim() ?? "";
    const password = body.password ?? "";

    if (username.length < 5) {
      return NextResponse.json({ message: "아이디는 5자 이상이어야 합니다." }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ message: "비밀번호는 6자 이상이어야 합니다." }, { status: 400 });
    }

    await ensureUsersTable();
    const pool = getPool();

    const exists = await pool.query("SELECT id FROM users WHERE username = $1 LIMIT 1", [username]);
    if (exists.rowCount && exists.rowCount > 0) {
      return NextResponse.json({ message: "이미 사용 중인 아이디입니다." }, { status: 409 });
    }

    const hash = await bcrypt.hash(password, 10);
    await pool.query("INSERT INTO users (username, password_hash) VALUES ($1, $2)", [username, hash]);

    await createSession(username);

    return NextResponse.json({ username });
  } catch (error) {
    const message = error instanceof Error ? error.message : "회원가입 처리 중 오류가 발생했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
