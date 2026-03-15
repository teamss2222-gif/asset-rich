import { NextRequest } from "next/server";
import { apiError, apiOk } from "../../../../lib/api-response";
import { readSession } from "../../../../lib/session";
import { ensureScheduleTables, getPool } from "../../../../lib/db";

type MissionRow = {
  id: number;
  mission_date: string | Date;
  title: string;
  completed: boolean;
  reward_min: number;
  sort_order: number;
};

function rowToMission(r: MissionRow) {
  return {
    id: r.id,
    date: String(r.mission_date).slice(0, 10),
    title: r.title,
    completed: r.completed,
    rewardMin: r.reward_min,
    sortOrder: r.sort_order,
  };
}

// GET /api/schedule/missions?date=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const username = await readSession();
  if (!username) return apiError({ status: 401, code: "UNAUTHORIZED", message: "로그인이 필요합니다." });

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    return apiError({ status: 400, code: "BAD_REQUEST", message: "날짜 형식이 올바르지 않습니다." });

  await ensureScheduleTables();
  const pool = getPool();

  const { rows } = await pool.query<MissionRow>(
    `SELECT id, mission_date, title, completed, reward_min, sort_order
     FROM schedule_missions
     WHERE username = $1 AND mission_date = $2::date
     ORDER BY sort_order ASC, id ASC`,
    [username, date],
  );

  // 이번 주(일~토) 완료된 미션의 보상 시간 누적 (주간 리셋 기준: 일요일)
  const { rows: weekRows } = await pool.query<{ week_total: string }>(
    `SELECT COALESCE(SUM(reward_min), 0)::text AS week_total
     FROM schedule_missions
     WHERE username = $1
       AND completed = TRUE
       AND mission_date >= ($2::date - EXTRACT(DOW FROM $2::date)::integer)
       AND mission_date <= ($2::date - EXTRACT(DOW FROM $2::date)::integer + 6)`,
    [username, date],
  );
  const weekTotal = parseInt(weekRows[0]?.week_total ?? '0', 10);

  // 다음 일요일 날짜 계산
  const d = new Date(date + 'T00:00:00');
  const daysUntilSunday = 7 - d.getDay();
  const nextSunday = new Date(d);
  nextSunday.setDate(d.getDate() + daysUntilSunday);
  const nextSundayStr = nextSunday.toLocaleDateString('sv-SE');

  return apiOk({ missions: rows.map(rowToMission), weekTotal, nextSunday: nextSundayStr });
}

// POST /api/schedule/missions  Body: { date, title, rewardMin }
export async function POST(req: NextRequest) {
  const username = await readSession();
  if (!username) return apiError({ status: 401, code: "UNAUTHORIZED", message: "로그인이 필요합니다." });

  let body: { date?: unknown; title?: unknown; rewardMin?: unknown };
  try { body = await req.json(); }
  catch { return apiError({ status: 400, code: "BAD_REQUEST", message: "요청 파싱 오류입니다." }); }

  const date = String(body.date ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    return apiError({ status: 400, code: "BAD_REQUEST", message: "날짜 형식이 올바르지 않습니다." });

  const title = String(body.title ?? "").trim().slice(0, 200);
  if (!title) return apiError({ status: 400, code: "BAD_REQUEST", message: "미션 제목을 입력하세요." });

  const rewardMin = Math.min(1440, Math.max(-1440, Number(body.rewardMin) || 0));

  await ensureScheduleTables();
  const pool = getPool();

  const sortRes = await pool.query<{ next: number }>(
    `SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM schedule_missions WHERE username = $1 AND mission_date = $2::date`,
    [username, date],
  );
  const sortOrder = sortRes.rows[0].next;

  const { rows } = await pool.query<MissionRow>(
    `INSERT INTO schedule_missions (username, mission_date, title, completed, reward_min, sort_order)
     VALUES ($1, $2::date, $3, false, $4, $5)
     RETURNING id, mission_date, title, completed, reward_min, sort_order`,
    [username, date, title, rewardMin, sortOrder],
  );

  return apiOk({ mission: rowToMission(rows[0]) });
}

// PUT /api/schedule/missions  Body: { id, title?, completed?, rewardMin? }
export async function PUT(req: NextRequest) {
  const username = await readSession();
  if (!username) return apiError({ status: 401, code: "UNAUTHORIZED", message: "로그인이 필요합니다." });

  let body: { id?: unknown; title?: unknown; completed?: unknown; rewardMin?: unknown };
  try { body = await req.json(); }
  catch { return apiError({ status: 400, code: "BAD_REQUEST", message: "요청 파싱 오류입니다." }); }

  const id = Number(body.id);
  if (!Number.isInteger(id) || id <= 0)
    return apiError({ status: 400, code: "BAD_REQUEST", message: "유효하지 않은 미션 ID입니다." });

  await ensureScheduleTables();
  const pool = getPool();

  const own = await pool.query<MissionRow>(
    `SELECT id, mission_date, title, completed, reward_min, sort_order FROM schedule_missions WHERE id = $1 AND username = $2`,
    [id, username],
  );
  if (own.rowCount === 0)
    return apiError({ status: 404, code: "NOT_FOUND", message: "미션을 찾을 수 없습니다." });

  const cur = own.rows[0];
  const title     = body.title !== undefined ? String(body.title).trim().slice(0, 200) || cur.title : cur.title;
  const completed = body.completed !== undefined ? body.completed === true : cur.completed;
  const rewardMin = body.rewardMin !== undefined ? Math.min(1440, Math.max(-1440, Number(body.rewardMin) || 0)) : cur.reward_min;

  const { rows } = await pool.query<MissionRow>(
    `UPDATE schedule_missions SET title = $1, completed = $2, reward_min = $3
     WHERE id = $4 AND username = $5
     RETURNING id, mission_date, title, completed, reward_min, sort_order`,
    [title, completed, rewardMin, id, username],
  );

  return apiOk({ mission: rowToMission(rows[0]) });
}

// DELETE /api/schedule/missions?id=N
export async function DELETE(req: NextRequest) {
  const username = await readSession();
  if (!username) return apiError({ status: 401, code: "UNAUTHORIZED", message: "로그인이 필요합니다." });

  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0)
    return apiError({ status: 400, code: "BAD_REQUEST", message: "유효하지 않은 미션 ID입니다." });

  await ensureScheduleTables();
  const pool = getPool();

  const res = await pool.query(
    `DELETE FROM schedule_missions WHERE id = $1 AND username = $2`,
    [id, username],
  );
  if (res.rowCount === 0)
    return apiError({ status: 404, code: "NOT_FOUND", message: "미션을 찾을 수 없습니다." });

  return apiOk({ ok: true });
}
