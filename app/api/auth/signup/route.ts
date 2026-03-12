import bcrypt from "bcryptjs";
import { apiError, apiOk } from "../../../../lib/api-response";
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
      return apiError({ status: 400, code: "INVALID_USERNAME", message: "아이디는 5자 이상이어야 합니다." });
    }

    if (password.length < 6) {
      return apiError({ status: 400, code: "INVALID_PASSWORD", message: "비밀번호는 6자 이상이어야 합니다." });
    }

    await ensureUsersTable();
    const pool = getPool();

    const exists = await pool.query("SELECT id FROM users WHERE username = $1 LIMIT 1", [username]);
    if (exists.rowCount && exists.rowCount > 0) {
      return apiError({ status: 409, code: "USERNAME_EXISTS", message: "이미 사용 중인 아이디입니다." });
    }

    const hash = await bcrypt.hash(password, 10);
    await pool.query("INSERT INTO users (username, password_hash) VALUES ($1, $2)", [username, hash]);

    await createSession(username);

    return apiOk({ username }, { status: 201, code: "SIGNUP_OK", message: "signup success" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "회원가입 처리 중 오류가 발생했습니다.";
    return apiError({ status: 500, code: "SIGNUP_FAILED", message });
  }
}
