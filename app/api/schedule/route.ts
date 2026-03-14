import { NextRequest } from "next/server";
import { apiError, apiOk } from "../../../lib/api-response";
import { readSession } from "../../../lib/session";
import { ensureScheduleTables, getPool } from "../../../lib/db";

type RepeatType = "none" | "daily" | "weekly";

type EventRow = {
  id: number;
  event_date: string;
  start_time: number;
  end_time: number;
  title: string;
  description: string;
  color: string;
  repeat_type: string;
  repeat_group_id: string | null;
};

type EventBody = {
  id?: number;
  date?: string;
  startTime?: unknown;
  endTime?: unknown;
  title?: string;
  description?: string;
  color?: string;
  repeatType?: string;
  repeatUntil?: string;
  scope?: string;
};

function validateEvent(body: EventBody) {
  if (!body.date || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
    throw new Error("유효하지 않은 날짜입니다.");
  }
  const start = Number(body.startTime);
  const end = Number(body.endTime);
  if (!Number.isInteger(start) || start < 420 || start >= 1440) {
    throw new Error("시작 시간은 07:00~23:50 사이여야 합니다.");
  }
  if (!Number.isInteger(end) || end <= start || end > 1440) {
    throw new Error("종료 시간이 유효하지 않습니다.");
  }
  const title = String(body.title ?? "").trim().slice(0, 200);
  const description = String(body.description ?? "").trim().slice(0, 2000);
  const color = /^#[0-9a-fA-F]{3,8}$/.test(body.color ?? "")
    ? body.color!
    : "#0a84ff";

  const repeatType: RepeatType = ["daily", "weekly"].includes(body.repeatType ?? "")
    ? (body.repeatType as RepeatType)
    : "none";

  let repeatUntil: string | null = null;
  if (repeatType !== "none") {
    if (!body.repeatUntil || !/^\d{4}-\d{2}-\d{2}$/.test(body.repeatUntil)) {
      throw new Error("반복 종료 날짜가 필요합니다.");
    }
    if (body.repeatUntil <= body.date) {
      throw new Error("반복 종료 날짜는 시작 날짜 이후여야 합니다.");
    }
    repeatUntil = body.repeatUntil;
  }

  return { date: body.date, start, end, title, description, color, repeatType, repeatUntil };
}

function rowToEvent(r: EventRow) {
  return {
    id: r.id,
    date: String(r.event_date).slice(0, 10),
    startTime: r.start_time,
    endTime: r.end_time,
    title: r.title,
    description: r.description,
    color: r.color,
    repeatType: r.repeat_type ?? "none",
    repeatGroupId: r.repeat_group_id ?? null,
  };
}

function generateRepeatDates(startDate: string, repeatType: RepeatType, repeatUntil: string): string[] {
  const dates: string[] = [];
  const current = new Date(startDate + "T12:00:00");
  const until = new Date(repeatUntil + "T12:00:00");
  const maxInstances = repeatType === "daily" ? 366 : 53;
  let count = 0;
  while (current <= until && count < maxInstances) {
    dates.push(current.toISOString().slice(0, 10));
    if (repeatType === "daily") {
      current.setDate(current.getDate() + 1);
    } else {
      current.setDate(current.getDate() + 7);
    }
    count++;
  }
  return dates;
}

export async function GET(request: NextRequest) {
  const username = await readSession();
  if (!username) {
    return apiError({ status: 401, code: "UNAUTHORIZED", message: "로그인이 필요합니다." });
  }

  const weekStart = request.nextUrl.searchParams.get("weekStart");
  if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    return apiError({ status: 400, code: "BAD_REQUEST", message: "weekStart 파라미터가 필요합니다." });
  }

  const startDate = new Date(weekStart + "T00:00:00");
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 6);
  const weekEnd = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`;

  await ensureScheduleTables();
  const pool = getPool();

  const eventsResult = await pool.query<EventRow>(
    `SELECT id, event_date::text, start_time, end_time, title, description, color,
            repeat_type, repeat_group_id::text
     FROM schedule_events
     WHERE username = $1 AND event_date BETWEEN $2 AND $3
     ORDER BY event_date, start_time`,
    [username, weekStart, weekEnd],
  );

  const summariesResult = await pool.query<{ summary_date: string; summary: string }>(
    `SELECT summary_date::text, summary
     FROM schedule_day_summaries
     WHERE username = $1 AND summary_date BETWEEN $2 AND $3`,
    [username, weekStart, weekEnd],
  );

  const events = eventsResult.rows.map(rowToEvent);
  const summaries: Record<string, string> = {};
  for (const r of summariesResult.rows) {
    summaries[String(r.summary_date).slice(0, 10)] = r.summary;
  }

  return apiOk({ events, summaries });
}

export async function POST(request: NextRequest) {
  const username = await readSession();
  if (!username) {
    return apiError({ status: 401, code: "UNAUTHORIZED", message: "로그인이 필요합니다." });
  }

  try {
    const body = (await request.json()) as EventBody;
    const { date, start, end, title, description, color, repeatType, repeatUntil } = validateEvent(body);

    await ensureScheduleTables();
    const pool = getPool();

    if (repeatType === "none") {
      const result = await pool.query<EventRow>(
        `INSERT INTO schedule_events (username, event_date, start_time, end_time, title, description, color, repeat_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'none')
         RETURNING id, event_date::text, start_time, end_time, title, description, color, repeat_type, repeat_group_id::text`,
        [username, date, start, end, title, description, color],
      );
      return apiOk({ event: rowToEvent(result.rows[0]) }, { status: 201 });
    }

    // 반복 일정: 날짜별로 개별 row 생성
    const groupId = crypto.randomUUID();
    const dates = generateRepeatDates(date, repeatType, repeatUntil!);
    const events: ReturnType<typeof rowToEvent>[] = [];
    for (const d of dates) {
      const result = await pool.query<EventRow>(
        `INSERT INTO schedule_events (username, event_date, start_time, end_time, title, description, color, repeat_type, repeat_group_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, event_date::text, start_time, end_time, title, description, color, repeat_type, repeat_group_id::text`,
        [username, d, start, end, title, description, color, repeatType, groupId],
      );
      events.push(rowToEvent(result.rows[0]));
    }
    return apiOk({ events }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "일정 생성에 실패했습니다.";
    return apiError({ status: 400, code: "BAD_REQUEST", message: msg });
  }
}

export async function PUT(request: NextRequest) {
  const username = await readSession();
  if (!username) {
    return apiError({ status: 401, code: "UNAUTHORIZED", message: "로그인이 필요합니다." });
  }

  try {
    const body = (await request.json()) as EventBody;
    if (!body.id || !Number.isInteger(Number(body.id))) {
      return apiError({ status: 400, code: "BAD_REQUEST", message: "id가 필요합니다." });
    }
    const { date, start, end, title, description, color } = validateEvent(body);
    const scope = body.scope === "all" ? "all" : "single";

    await ensureScheduleTables();
    const pool = getPool();

    if (scope === "single") {
      const result = await pool.query<EventRow>(
        `UPDATE schedule_events
         SET event_date = $1, start_time = $2, end_time = $3, title = $4,
             description = $5, color = $6, updated_at = NOW()
         WHERE id = $7 AND username = $8
         RETURNING id, event_date::text, start_time, end_time, title, description, color, repeat_type, repeat_group_id::text`,
        [date, start, end, title, description, color, Number(body.id), username],
      );
      if (!result.rowCount) {
        return apiError({ status: 404, code: "NOT_FOUND", message: "일정을 찾을 수 없습니다." });
      }
      return apiOk({ event: rowToEvent(result.rows[0]) });
    }

    // scope === "all": repeat_group 전체 수정 (날짜 제외)
    const groupRow = await pool.query<{ repeat_group_id: string }>(
      "SELECT repeat_group_id FROM schedule_events WHERE id = $1 AND username = $2",
      [Number(body.id), username],
    );
    if (!groupRow.rowCount) {
      return apiError({ status: 404, code: "NOT_FOUND", message: "일정을 찾을 수 없습니다." });
    }
    const groupId = groupRow.rows[0]?.repeat_group_id;
    if (groupId) {
      await pool.query(
        `UPDATE schedule_events
         SET start_time = $1, end_time = $2, title = $3, description = $4, color = $5, updated_at = NOW()
         WHERE repeat_group_id = $6 AND username = $7`,
        [start, end, title, description, color, groupId, username],
      );
    } else {
      await pool.query(
        `UPDATE schedule_events
         SET event_date = $1, start_time = $2, end_time = $3, title = $4,
             description = $5, color = $6, updated_at = NOW()
         WHERE id = $7 AND username = $8`,
        [date, start, end, title, description, color, Number(body.id), username],
      );
    }
    return apiOk({ updated: true, scope: "all" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "일정 수정에 실패했습니다.";
    return apiError({ status: 400, code: "BAD_REQUEST", message: msg });
  }
}

export async function DELETE(request: NextRequest) {
  const username = await readSession();
  if (!username) {
    return apiError({ status: 401, code: "UNAUTHORIZED", message: "로그인이 필요합니다." });
  }

  const idParam = request.nextUrl.searchParams.get("id");
  const id = Number(idParam);
  if (!idParam || !Number.isInteger(id) || id <= 0) {
    return apiError({ status: 400, code: "BAD_REQUEST", message: "유효한 id가 필요합니다." });
  }

  const scope = request.nextUrl.searchParams.get("scope") === "all" ? "all" : "single";

  await ensureScheduleTables();
  const pool = getPool();

  if (scope === "single") {
    const result = await pool.query(
      "DELETE FROM schedule_events WHERE id = $1 AND username = $2",
      [id, username],
    );
    if (!result.rowCount) {
      return apiError({ status: 404, code: "NOT_FOUND", message: "일정을 찾을 수 없습니다." });
    }
    return apiOk({ deleted: true });
  }

  // scope === "all": 그룹 전체 삭제
  const groupRow = await pool.query<{ repeat_group_id: string }>(
    "SELECT repeat_group_id FROM schedule_events WHERE id = $1 AND username = $2",
    [id, username],
  );
  if (!groupRow.rowCount) {
    return apiError({ status: 404, code: "NOT_FOUND", message: "일정을 찾을 수 없습니다." });
  }
  const groupId = groupRow.rows[0]?.repeat_group_id;
  if (groupId) {
    await pool.query(
      "DELETE FROM schedule_events WHERE repeat_group_id = $1 AND username = $2",
      [groupId, username],
    );
  } else {
    await pool.query("DELETE FROM schedule_events WHERE id = $1 AND username = $2", [id, username]);
  }
  return apiOk({ deleted: true });
}
