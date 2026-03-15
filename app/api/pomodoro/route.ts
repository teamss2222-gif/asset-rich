import { apiError, apiOk } from "../../../lib/api-response";
import { ensureHabitTables, getPool } from "../../../lib/db";
import { readSession } from "../../../lib/session";

// GET /api/pomodoro  — 오늘 세션 목록 + 통계
export async function GET() {
  const username = await readSession();
  if (!username) return apiError({ status: 401, code: "UNAUTHORIZED", message: "로그인이 필요합니다." });

  await ensureHabitTables();
  const pool = getPool();

  const todayStr = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

  const { rows: sessions } = await pool.query<{
    id: number; work_minutes: number; completed: boolean; label: string; created_at: string;
  }>(
    `SELECT id, work_minutes, completed, label, created_at
     FROM pomodoro_sessions
     WHERE username = $1 AND session_date = $2
     ORDER BY created_at ASC`,
    [username, todayStr],
  );

  const completed = sessions.filter((s) => s.completed);
  const totalFocusMinutes = completed.reduce((acc, s) => acc + s.work_minutes, 0);

  // 최근 7일 일별 완료 수
  const { rows: weekly } = await pool.query<{ session_date: string; count: string }>(
    `SELECT session_date::text, COUNT(*)::text AS count
     FROM pomodoro_sessions
     WHERE username = $1 AND completed = TRUE AND session_date >= NOW() - INTERVAL '6 days'
     GROUP BY session_date
     ORDER BY session_date`,
    [username],
  );

  return apiOk({
    today: todayStr,
    sessions,
    completedCount: completed.length,
    totalFocusMinutes,
    weekly,
  });
}

// POST /api/pomodoro  — 세션 기록
export async function POST(req: Request) {
  const username = await readSession();
  if (!username) return apiError({ status: 401, code: "UNAUTHORIZED", message: "로그인이 필요합니다." });

  const body = await req.json().catch(() => null);
  const workMinutes = Math.min(120, Math.max(1, Number(body?.work_minutes ?? 25)));
  const completed = Boolean(body?.completed ?? true);
  const label: string = (body?.label ?? "").trim().slice(0, 80);

  await ensureHabitTables();
  const pool = getPool();

  const todayStr = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

  const { rows: [session] } = await pool.query<{ id: number }>(
    `INSERT INTO pomodoro_sessions (username, session_date, work_minutes, completed, label)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [username, todayStr, workMinutes, completed, label],
  );

  return apiOk({ id: session.id }, { status: 201 });
}
