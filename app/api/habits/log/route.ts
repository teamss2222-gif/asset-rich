import { apiError, apiOk } from "../../../../lib/api-response";
import { ensureHabitTables, getPool } from "../../../../lib/db";
import { readSession } from "../../../../lib/session";

// POST /api/habits/log  — 날짜 완료 토글 (있으면 삭제, 없으면 삽입)
export async function POST(req: Request) {
  const username = await readSession();
  if (!username) return apiError({ status: 401, code: "UNAUTHORIZED", message: "로그인이 필요합니다." });

  const body = await req.json().catch(() => null);
  const habitId = Number(body?.habit_id);
  const dateStr: string = (body?.date ?? "").slice(0, 10); // YYYY-MM-DD

  if (!habitId || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return apiError({ status: 400, code: "BAD_REQUEST", message: "habit_id와 date(YYYY-MM-DD)가 필요합니다." });
  }

  await ensureHabitTables();
  const pool = getPool();

  // 해당 습관이 이 사용자 것인지 확인
  const { rows: own } = await pool.query<{ id: number }>(
    `SELECT id FROM habits WHERE id = $1 AND username = $2`,
    [habitId, username],
  );
  if (!own.length) return apiError({ status: 404, code: "NOT_FOUND", message: "습관을 찾을 수 없습니다." });

  // 이미 로그가 있으면 삭제 (토글 OFF), 없으면 삽입 (토글 ON)
  const { rows: existing } = await pool.query<{ id: number }>(
    `SELECT id FROM habit_logs WHERE username = $1 AND habit_id = $2 AND log_date = $3`,
    [username, habitId, dateStr],
  );

  let done: boolean;
  if (existing.length > 0) {
    await pool.query(
      `DELETE FROM habit_logs WHERE username = $1 AND habit_id = $2 AND log_date = $3`,
      [username, habitId, dateStr],
    );
    done = false;
  } else {
    await pool.query(
      `INSERT INTO habit_logs (username, habit_id, log_date) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [username, habitId, dateStr],
    );
    done = true;
  }

  return apiOk({ habit_id: habitId, date: dateStr, done });
}
