import { NextRequest } from "next/server";
import { apiError, apiOk } from "../../../../lib/api-response";
import { readSession } from "../../../../lib/session";
import { ensureScheduleTables, getPool } from "../../../../lib/db";

export async function PUT(request: NextRequest) {
  const username = await readSession();
  if (!username) {
    return apiError({ status: 401, code: "UNAUTHORIZED", message: "로그인이 필요합니다." });
  }

  const body = (await request.json()) as { date?: string; summary?: string };

  if (!body.date || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
    return apiError({ status: 400, code: "BAD_REQUEST", message: "날짜 형식이 유효하지 않습니다." });
  }

  const summary = String(body.summary ?? "").trim().slice(0, 1000);

  await ensureScheduleTables();
  const pool = getPool();

  await pool.query(
    `INSERT INTO schedule_day_summaries (username, summary_date, summary)
     VALUES ($1, $2, $3)
     ON CONFLICT (username, summary_date)
     DO UPDATE SET summary = EXCLUDED.summary, updated_at = NOW()`,
    [username, body.date, summary],
  );

  return apiOk({ saved: true });
}
