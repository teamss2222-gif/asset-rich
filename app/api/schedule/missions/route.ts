import { NextRequest } from "next/server";
import { apiError, apiOk } from "../../../../lib/api-response";
import { readSession } from "../../../../lib/session";
import { ensureScheduleTables, getPool } from "../../../../lib/db";

type TemplateRow = {
  id: number;
  title: string;
  reward_min: number;
  sort_order: number;
  completed: boolean;
  quantity: number;
};

function rowToMission(r: TemplateRow) {
  return {
    id: r.id,
    title: r.title,
    rewardMin: r.reward_min,
    sortOrder: r.sort_order,
    completed: r.completed ?? false,
    quantity: r.quantity ?? 1,
  };
}

// GET /api/schedule/missions          → 템플릿 목록
// GET /api/schedule/missions?date=... → 날짜별 완료 상태 + weekTotal
export async function GET(req: NextRequest) {
  const username = await readSession();
  if (!username) return apiError({ status: 401, code: "UNAUTHORIZED", message: "로그인이 필요합니다." });

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");

  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date))
    return apiError({ status: 400, code: "BAD_REQUEST", message: "날짜 형식이 올바르지 않습니다." });

  await ensureScheduleTables();
  const pool = getPool();

  if (date) {
    // 날짜별: 템플릿 + 해당 날짜 완료 여부 LEFT JOIN
    const { rows } = await pool.query<TemplateRow>(
      `SELECT t.id, t.title, t.reward_min, t.sort_order,
              COALESCE(c.completed, false) AS completed,
              COALESCE(c.quantity, 1) AS quantity
       FROM schedule_mission_templates t
       LEFT JOIN schedule_mission_completions c
         ON c.template_id = t.id AND c.username = $1 AND c.mission_date = $2::date
       WHERE t.username = $1
       ORDER BY t.sort_order ASC, t.id ASC`,
      [username, date],
    );

    // 주간 누적 (일~토, 일요일 기준)
    const { rows: weekRows } = await pool.query<{ week_total: string }>(
      `SELECT COALESCE(SUM(t.reward_min * c.quantity), 0)::text AS week_total
       FROM schedule_mission_completions c
       JOIN schedule_mission_templates t ON t.id = c.template_id
       WHERE c.username = $1
         AND c.completed = TRUE
         AND c.mission_date >= ($2::date - EXTRACT(DOW FROM $2::date)::integer)
         AND c.mission_date <= ($2::date - EXTRACT(DOW FROM $2::date)::integer + 6)`,
      [username, date],
    );
    const weekTotal = parseInt(weekRows[0]?.week_total ?? '0', 10);

    return apiOk({ missions: rows.map(rowToMission), weekTotal });
  } else {
    // 템플릿만 반환 (날짜 없음 → 미션 관리 패널용)
    const { rows } = await pool.query<TemplateRow>(
      `SELECT id, title, reward_min, sort_order, false AS completed
       FROM schedule_mission_templates
       WHERE username = $1
       ORDER BY sort_order ASC, id ASC`,
      [username],
    );
    return apiOk({ missions: rows.map(rowToMission) });
  }
}

// POST /api/schedule/missions  Body: { title, rewardMin }
export async function POST(req: NextRequest) {
  const username = await readSession();
  if (!username) return apiError({ status: 401, code: "UNAUTHORIZED", message: "로그인이 필요합니다." });

  let body: { title?: unknown; rewardMin?: unknown };
  try { body = await req.json(); }
  catch { return apiError({ status: 400, code: "BAD_REQUEST", message: "요청 파싱 오류입니다." }); }

  const title = String(body.title ?? "").trim().slice(0, 200);
  if (!title) return apiError({ status: 400, code: "BAD_REQUEST", message: "미션 제목을 입력하세요." });

  const rewardMin = Math.min(1440, Math.max(-1440, Number(body.rewardMin) || 0));

  await ensureScheduleTables();
  const pool = getPool();

  const sortRes = await pool.query<{ next: number }>(
    `SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM schedule_mission_templates WHERE username = $1`,
    [username],
  );
  const sortOrder = sortRes.rows[0].next;

  const { rows } = await pool.query<{ id: number; title: string; reward_min: number; sort_order: number }>(
    `INSERT INTO schedule_mission_templates (username, title, reward_min, sort_order)
     VALUES ($1, $2, $3, $4)
     RETURNING id, title, reward_min, sort_order`,
    [username, title, rewardMin, sortOrder],
  );

  return apiOk({ mission: { id: rows[0].id, title: rows[0].title, rewardMin: rows[0].reward_min, sortOrder: rows[0].sort_order, completed: false } });
}

// PUT /api/schedule/missions
// Body A: { id, date, completed } → 날짜별 완료 토글
// Body B: { id, title?, rewardMin? } → 템플릿 수정
export async function PUT(req: NextRequest) {
  const username = await readSession();
  if (!username) return apiError({ status: 401, code: "UNAUTHORIZED", message: "로그인이 필요합니다." });

  let body: { id?: unknown; title?: unknown; completed?: unknown; rewardMin?: unknown; date?: unknown; quantity?: unknown };
  try { body = await req.json(); }
  catch { return apiError({ status: 400, code: "BAD_REQUEST", message: "요청 파싱 오류입니다." }); }

  const id = Number(body.id);
  if (!Number.isInteger(id) || id <= 0)
    return apiError({ status: 400, code: "BAD_REQUEST", message: "유효하지 않은 미션 ID입니다." });

  await ensureScheduleTables();
  const pool = getPool();

  const own = await pool.query<{ id: number; title: string; reward_min: number; sort_order: number }>(
    `SELECT id, title, reward_min, sort_order FROM schedule_mission_templates WHERE id = $1 AND username = $2`,
    [id, username],
  );
  if (own.rowCount === 0)
    return apiError({ status: 404, code: "NOT_FOUND", message: "미션을 찾을 수 없습니다." });

  const cur = own.rows[0];

  if (body.date !== undefined) {
    // Body A: 날짜별 완료 토글
    const date = String(body.date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
      return apiError({ status: 400, code: "BAD_REQUEST", message: "날짜 형식이 올바르지 않습니다." });
    const completed = body.completed === true;
    const quantity = Math.max(1, Math.min(9999, Number(body.quantity) || 1));
    await pool.query(
      `INSERT INTO schedule_mission_completions (username, template_id, mission_date, completed, quantity)
       VALUES ($1, $2, $3::date, $4, $5)
       ON CONFLICT (username, template_id, mission_date)
       DO UPDATE SET completed = EXCLUDED.completed, quantity = EXCLUDED.quantity`,
      [username, id, date, completed, quantity],
    );
    return apiOk({ mission: { id, title: cur.title, rewardMin: cur.reward_min, sortOrder: cur.sort_order, completed, quantity } });
  } else {
    // Body B: 템플릿 수정
    const title     = body.title !== undefined ? String(body.title).trim().slice(0, 200) || cur.title : cur.title;
    const rewardMin = body.rewardMin !== undefined ? Math.min(1440, Math.max(-1440, Number(body.rewardMin) || 0)) : cur.reward_min;
    const { rows } = await pool.query<{ id: number; title: string; reward_min: number; sort_order: number }>(
      `UPDATE schedule_mission_templates SET title = $1, reward_min = $2
       WHERE id = $3 AND username = $4
       RETURNING id, title, reward_min, sort_order`,
      [title, rewardMin, id, username],
    );
    return apiOk({ mission: { id: rows[0].id, title: rows[0].title, rewardMin: rows[0].reward_min, sortOrder: rows[0].sort_order, completed: false } });
  }
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
    `DELETE FROM schedule_mission_templates WHERE id = $1 AND username = $2`,
    [id, username],
  );
  if (res.rowCount === 0)
    return apiError({ status: 404, code: "NOT_FOUND", message: "미션을 찾을 수 없습니다." });

  return apiOk({ ok: true });
}

