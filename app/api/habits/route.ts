import { apiError, apiOk } from "../../../lib/api-response";
import { ensureHabitTables, getPool } from "../../../lib/db";
import { readSession } from "../../../lib/session";

// GET  /api/habits  — 습관 목록 + 오늘 완료 여부 + 연속 스트릭
export async function GET() {
  const username = await readSession();
  if (!username) return apiError({ status: 401, code: "UNAUTHORIZED", message: "로그인이 필요합니다." });

  await ensureHabitTables();
  const pool = getPool();

  const todayStr = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }); // YYYY-MM-DD

  // 습관 목록 + 오늘 완료 여부
  const { rows: habits } = await pool.query<{
    id: number; name: string; icon: string; color: string; sort_order: number; created_at: string; done_today: boolean;
  }>(
    `SELECT h.id, h.name, h.icon, h.color, h.sort_order, h.created_at,
       (SELECT COUNT(*) > 0 FROM habit_logs hl WHERE hl.habit_id = h.id AND hl.username = h.username AND hl.log_date = $2) AS done_today
     FROM habits h
     WHERE h.username = $1
     ORDER BY h.sort_order, h.id`,
    [username, todayStr],
  );

  // 스트릭 계산: 각 습관별 최근 연속 완료 일수
  const streaks: Record<number, number> = {};
  for (const h of habits) {
    const { rows } = await pool.query<{ log_date: string }>(
      `SELECT log_date::text FROM habit_logs WHERE habit_id = $1 AND username = $2 ORDER BY log_date DESC LIMIT 400`,
      [h.id, username],
    );
    const dateset = new Set(rows.map((r) => r.log_date));
    let streak = 0;
    // 오늘부터 거슬러 올라가며 연속 체크
    const cursor = new Date(todayStr);
    while (true) {
      const d = cursor.toLocaleDateString("sv-SE");
      if (dateset.has(d)) {
        streak++;
        cursor.setDate(cursor.getDate() - 1);
      } else {
        break;
      }
    }
    streaks[h.id] = streak;
  }

  // 최근 7일 달성 여부 맵 (heatmap용)
  const weekDates: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(todayStr);
    d.setDate(d.getDate() - i);
    weekDates.push(d.toLocaleDateString("sv-SE"));
  }

  const weekMap: Record<number, Record<string, boolean>> = {};
  if (habits.length > 0) {
    const habitIds = habits.map((h) => h.id);
    const { rows: weekLogs } = await pool.query<{ habit_id: number; log_date: string }>(
      `SELECT habit_id, log_date::text FROM habit_logs
       WHERE username = $1 AND habit_id = ANY($2::int[]) AND log_date >= $3`,
      [username, habitIds, weekDates[0]],
    );
    for (const h of habits) weekMap[h.id] = {};
    for (const log of weekLogs) {
      if (weekMap[log.habit_id]) weekMap[log.habit_id][log.log_date] = true;
    }
  }

  return apiOk({
    habits: habits.map((h) => ({
      ...h,
      streak: streaks[h.id] ?? 0,
      weekDates,
      weekDone: weekDates.map((d) => weekMap[h.id]?.[d] ?? false),
    })),
    today: todayStr,
  });
}

// POST /api/habits  — 습관 생성
export async function POST(req: Request) {
  const username = await readSession();
  if (!username) return apiError({ status: 401, code: "UNAUTHORIZED", message: "로그인이 필요합니다." });

  const body = await req.json().catch(() => null);
  const name: string = (body?.name ?? "").trim().slice(0, 100);
  const icon: string = (body?.icon ?? "✅").slice(0, 10);
  const color: string = (body?.color ?? "#30d158").slice(0, 20);

  if (!name) return apiError({ status: 400, code: "BAD_REQUEST", message: "이름을 입력하세요." });

  await ensureHabitTables();
  const pool = getPool();

  // 현재 순서 최댓값
  const { rows: [maxRow] } = await pool.query<{ max: number | null }>(
    `SELECT MAX(sort_order) AS max FROM habits WHERE username = $1`,
    [username],
  );
  const sortOrder = (maxRow?.max ?? -1) + 1;

  const { rows: [habit] } = await pool.query<{ id: number; name: string; icon: string; color: string; sort_order: number; created_at: string }>(
    `INSERT INTO habits (username, name, icon, color, sort_order)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name, icon, color, sort_order, created_at`,
    [username, name, icon, color, sortOrder],
  );

  return apiOk({ habit }, { status: 201 });
}

// PUT /api/habits  — 습관 수정
export async function PUT(req: Request) {
  const username = await readSession();
  if (!username) return apiError({ status: 401, code: "UNAUTHORIZED", message: "로그인이 필요합니다." });

  const body = await req.json().catch(() => null);
  const id = Number(body?.id);
  if (!id) return apiError({ status: 400, code: "BAD_REQUEST", message: "id가 필요합니다." });

  const name: string = (body?.name ?? "").trim().slice(0, 100);
  const icon: string = (body?.icon ?? "✅").slice(0, 10);
  const color: string = (body?.color ?? "#30d158").slice(0, 20);

  if (!name) return apiError({ status: 400, code: "BAD_REQUEST", message: "이름을 입력하세요." });

  await ensureHabitTables();
  const pool = getPool();

  const { rows } = await pool.query<{ id: number }>(
    `UPDATE habits SET name = $1, icon = $2, color = $3
     WHERE id = $4 AND username = $5
     RETURNING id`,
    [name, icon, color, id, username],
  );

  if (!rows.length) return apiError({ status: 404, code: "NOT_FOUND", message: "습관을 찾을 수 없습니다." });

  return apiOk({ id });
}

// DELETE /api/habits  — 습관 삭제
export async function DELETE(req: Request) {
  const username = await readSession();
  if (!username) return apiError({ status: 401, code: "UNAUTHORIZED", message: "로그인이 필요합니다." });

  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get("id"));
  if (!id) return apiError({ status: 400, code: "BAD_REQUEST", message: "id가 필요합니다." });

  await ensureHabitTables();
  const pool = getPool();

  const { rows } = await pool.query<{ id: number }>(
    `DELETE FROM habits WHERE id = $1 AND username = $2 RETURNING id`,
    [id, username],
  );

  if (!rows.length) return apiError({ status: 404, code: "NOT_FOUND", message: "습관을 찾을 수 없습니다." });

  return apiOk({ id });
}
