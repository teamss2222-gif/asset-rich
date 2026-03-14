import { apiError, apiOk } from "../../../../lib/api-response";
import { readSession } from "../../../../lib/session";
import { ensureScheduleTables, getPool } from "../../../../lib/db";

const REPEAT_UNTIL = "2026-07-22";

type SingleEventRow = {
  id: number;
  event_date: string;
  start_time: number;
  end_time: number;
  title: string;
  description: string;
  color: string;
};

function generateWeeklyDates(startDate: string, until: string): string[] {
  const dates: string[] = [];
  const current = new Date(startDate + "T12:00:00");
  const end     = new Date(until      + "T12:00:00");
  let count = 0;
  while (current <= end && count < 53) {
    dates.push(current.toISOString().slice(0, 10));
    current.setDate(current.getDate() + 7);
    count++;
  }
  return dates;
}

export async function POST() {
  const username = await readSession();
  if (!username) {
    return apiError({ status: 401, code: "UNAUTHORIZED", message: "로그인이 필요합니다." });
  }

  await ensureScheduleTables();
  const pool = getPool();

  // 비반복 일정만 조회
  const singles = await pool.query<SingleEventRow>(
    `SELECT id, event_date::text, start_time, end_time, title, description, color
     FROM schedule_events
     WHERE username = $1
       AND (repeat_group_id IS NULL)
       AND (repeat_type = 'none' OR repeat_type IS NULL)
     ORDER BY event_date, start_time`,
    [username],
  );

  if (!singles.rowCount || singles.rowCount === 0) {
    return apiOk({ converted: 0, message: "변환할 비반복 일정이 없습니다." });
  }

  let converted = 0;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const ev of singles.rows) {
      const dateStr = String(ev.event_date).slice(0, 10);
      if (dateStr > REPEAT_UNTIL) continue; // 이미 종료일 이후

      const dates = generateWeeklyDates(dateStr, REPEAT_UNTIL);
      if (dates.length <= 1) continue; // 반복할 날짜 없으면 스킵

      const groupId = crypto.randomUUID();

      // 원본 삭제
      await client.query(
        "DELETE FROM schedule_events WHERE id = $1 AND username = $2",
        [ev.id, username],
      );

      // 반복 시리즈 삽입
      for (const d of dates) {
        await client.query(
          `INSERT INTO schedule_events
             (username, event_date, start_time, end_time, title, description, color, repeat_type, repeat_group_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'weekly', $8)`,
          [username, d, ev.start_time, ev.end_time, ev.title, ev.description, ev.color, groupId],
        );
      }

      converted++;
    }

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    const msg = e instanceof Error ? e.message : "알 수 없는 오류";
    return apiError({ status: 500, code: "SERVER_ERROR", message: "일괄 변환 실패: " + msg });
  } finally {
    client.release();
  }

  return apiOk({ converted });
}
