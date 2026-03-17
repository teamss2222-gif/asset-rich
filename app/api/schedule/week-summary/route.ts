import { NextRequest } from "next/server";
import { apiError, apiOk } from "../../../../lib/api-response";
import { readSession } from "../../../../lib/session";
import { ensureScheduleTables, getPool } from "../../../../lib/db";

const DEFAULT_COLOR = "#8e8e93"; // gray events excluded from achievement tracking

// GET /api/schedule/week-summary?weekStart=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const username = await readSession();
  if (!username) return apiError({ status: 401, code: "UNAUTHORIZED", message: "로그인이 필요합니다." });

  const { searchParams } = new URL(req.url);
  const weekStart = searchParams.get("weekStart") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart))
    return apiError({ status: 400, code: "BAD_REQUEST", message: "날짜 형식이 올바르지 않습니다." });

  await ensureScheduleTables();
  const pool = getPool();

  // 주간 이벤트 완료 현황 (기본색 제외)
  const { rows: evtRows } = await pool.query<{
    date: string;
    title: string;
    start_time: number;
    color: string;
    completed: boolean;
  }>(`
    SELECT
      se.event_date::text AS date,
      se.title,
      se.start_time,
      se.color,
      COALESCE(sec.completed, false) AS completed
    FROM schedule_events se
    LEFT JOIN schedule_event_completions sec
      ON sec.event_id = se.id
      AND sec.username = $1
      AND sec.completion_date = se.event_date
    WHERE se.username = $1
      AND se.event_date >= $2::date
      AND se.event_date <  $2::date + 7
      AND se.color != $3
    ORDER BY se.event_date, se.start_time ASC
  `, [username, weekStart, DEFAULT_COLOR]);

  // 주간 미션 누적 보상
  const { rows: missionRows } = await pool.query<{ week_total: string }>(`
    SELECT COALESCE(SUM(t.reward_min * c.quantity), 0)::text AS week_total
    FROM schedule_mission_completions c
    JOIN schedule_mission_templates t ON t.id = c.template_id
    WHERE c.username = $1
      AND c.completed = TRUE
      AND c.mission_date >= $2::date
      AND c.mission_date <  $2::date + 7
  `, [username, weekStart]);
  const weekMissionTotal = parseInt(missionRows[0]?.week_total ?? "0", 10);

  // 날짜별 그루핑
  const days: Record<string, { doneEvents: string[]; totalEvents: number }> = {};
  for (const r of evtRows) {
    const d = r.date.slice(0, 10);
    if (!days[d]) days[d] = { doneEvents: [], totalEvents: 0 };
    days[d].totalEvents++;
    if (r.completed) days[d].doneEvents.push(r.title);
  }

  return apiOk({ days, weekMissionTotal });
}
