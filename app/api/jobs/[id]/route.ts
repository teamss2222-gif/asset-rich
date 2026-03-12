import { apiError, apiOk } from "../../../../lib/api-response";
import { ensureBackgroundJobsTable, getPool } from "../../../../lib/db";
import { readSession } from "../../../../lib/session";

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

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const username = await readSession();
  if (!username) {
    return apiError({ status: 401, code: "UNAUTHORIZED", message: "로그인이 필요합니다." });
  }

  const resolvedParams = await params;
  const jobId = resolvedParams.id.trim();
  if (!/^[0-9a-fA-F-]{36}$/.test(jobId)) {
    return apiError({ status: 400, code: "INVALID_JOB_ID", message: "job id 형식이 올바르지 않습니다." });
  }

  await ensureBackgroundJobsTable();
  const pool = getPool();
  const result = await pool.query<JobRow>(
    `
      SELECT id, job_type, status, payload, result, error_message, created_at, updated_at
      FROM background_jobs
      WHERE id = $1 AND username = $2
      LIMIT 1
    `,
    [jobId, username],
  );

  if (!result.rowCount) {
    return apiError({ status: 404, code: "JOB_NOT_FOUND", message: "작업을 찾을 수 없습니다." });
  }

  const row = result.rows[0];
  return apiOk({
    job: {
      id: row.id,
      type: row.job_type,
      status: row.status,
      payload: row.payload ?? {},
      result: row.result,
      errorMessage: row.error_message,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
  });
}
