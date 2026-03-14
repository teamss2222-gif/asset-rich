import { NextRequest } from "next/server";
import { apiError, apiOk } from "../../../../lib/api-response";
import { readSession } from "../../../../lib/session";
import { ensureScheduleTables, getPool } from "../../../../lib/db";

// GET /api/schedule/achievements?date=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const username = await readSession();
  if (!username) return apiError({ status: 401, code: "UNAUTHORIZED", message: "로그인이 필요합니다." });

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    return apiError({ status: 400, code: "BAD_REQUEST", message: "날짜 형식이 올바르지 않습니다." });

  await ensureScheduleTables();
  const pool = getPool();

  const { rows } = await pool.query<{
    id: number; title: string; start_time: number; end_time: number; color: string; completed: boolean;
  }>(`
    SELECT
      se.id,
      se.title,
      se.start_time,
      se.end_time,
      se.color,
      COALESCE(sec.completed, false) AS completed
    FROM schedule_events se
    LEFT JOIN schedule_event_completions sec
      ON sec.event_id = se.id
      AND sec.username = $1
      AND sec.completion_date = $2::date
    WHERE se.username = $1
      AND se.event_date = $2::date
    ORDER BY se.start_time ASC
  `, [username, date]);

  return apiOk({
    completions: rows.map(r => ({
      id: r.id,
      title: r.title,
      startTime: r.start_time,
      endTime: r.end_time,
      color: r.color,
      completed: r.completed,
    })),
  });
}

// PUT /api/schedule/achievements  Body: { date, eventId, completed }
export async function PUT(req: NextRequest) {
  const username = await readSession();
  if (!username) return apiError({ status: 401, code: "UNAUTHORIZED", message: "로그인이 필요합니다." });

  let body: { date?: unknown; eventId?: unknown; completed?: unknown };
  try { body = await req.json(); }
  catch { return apiError({ status: 400, code: "BAD_REQUEST", message: "요청 파싱 오류입니다." }); }

  const date = String(body.date ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    return apiError({ status: 400, code: "BAD_REQUEST", message: "날짜 형식이 올바르지 않습니다." });

  const eventId = Number(body.eventId);
  if (!Number.isInteger(eventId) || eventId <= 0)
    return apiError({ status: 400, code: "BAD_REQUEST", message: "유효하지 않은 이벤트 ID입니다." });

  const completed = body.completed === true;

  await ensureScheduleTables();
  const pool = getPool();

  const own = await pool.query(
    `SELECT id FROM schedule_events WHERE id = $1 AND username = $2`,
    [eventId, username],
  );
  if (own.rowCount === 0)
    return apiError({ status: 404, code: "NOT_FOUND", message: "해당 이벤트를 찾을 수 없습니다." });

  await pool.query(`
    INSERT INTO schedule_event_completions (username, event_id, completion_date, completed)
    VALUES ($1, $2, $3::date, $4)
    ON CONFLICT (username, event_id, completion_date)
    DO UPDATE SET completed = EXCLUDED.completed
  `, [username, eventId, date, completed]);

  return apiOk({ ok: true });
}
