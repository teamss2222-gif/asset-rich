import { apiError, apiOk } from "../../../lib/api-response";
import { ensureBackgroundJobsTable, getPool } from "../../../lib/db";
import { readSession } from "../../../lib/session";

type CreateJobBody = {
  type?: string;
  payload?: Record<string, unknown>;
};

type JobRow = {
  id: string;
  job_type: string;
  status: string;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

function parseJobType(input?: string) {
  const value = (input ?? "").trim().toLowerCase();
  if (!/^[a-z0-9:_-]{3,80}$/.test(value)) {
    return null;
  }
  return value;
}

export async function POST(request: Request) {
  const username = await readSession();
  if (!username) {
    return apiError({ status: 401, code: "UNAUTHORIZED", message: "로그인이 필요합니다." });
  }

  try {
    const body = (await request.json()) as CreateJobBody;
    const type = parseJobType(body.type);
    if (!type) {
      return apiError({
        status: 400,
        code: "INVALID_JOB_TYPE",
        message: "job type 값이 올바르지 않습니다.",
      });
    }

    const payload = body.payload ?? {};
    const id = crypto.randomUUID();

    await ensureBackgroundJobsTable();
    const pool = getPool();
    await pool.query(
      `
        INSERT INTO background_jobs (id, username, job_type, status, payload, updated_at)
        VALUES ($1, $2, $3, 'queued', $4::jsonb, NOW())
      `,
      [id, username, type, JSON.stringify(payload)],
    );

    return apiOk(
      {
        job: {
          id,
          type,
          status: "queued",
          payload,
        },
      },
      { status: 201, code: "JOB_CREATED", message: "job created" },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "작업 생성 중 오류가 발생했습니다.";
    return apiError({ status: 500, code: "JOB_CREATE_FAILED", message });
  }
}

export async function GET() {
  const username = await readSession();
  if (!username) {
    return apiError({ status: 401, code: "UNAUTHORIZED", message: "로그인이 필요합니다." });
  }

  await ensureBackgroundJobsTable();
  const pool = getPool();
  const result = await pool.query<JobRow>(
    `
      SELECT id, job_type, status, payload, result, error_message, created_at, updated_at
      FROM background_jobs
      WHERE username = $1
      ORDER BY created_at DESC
      LIMIT 50
    `,
    [username],
  );

  return apiOk({
    jobs: result.rows.map((row) => ({
      id: row.id,
      type: row.job_type,
      status: row.status,
      payload: row.payload ?? {},
      result: row.result,
      errorMessage: row.error_message,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  });
}
