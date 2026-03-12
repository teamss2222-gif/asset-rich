import { apiError, apiOk } from "../../../../../lib/api-response";
import { ensureIntegrationConnectionsTable, getPool } from "../../../../../lib/db";
import { readSession } from "../../../../../lib/session";

type IntegrationRow = {
  status: string;
  connected_at: string | null;
  updated_at: string;
};

function parseProvider(input: string) {
  const provider = input.trim().toLowerCase();
  if (!/^[a-z0-9-]{2,30}$/.test(provider)) {
    return null;
  }
  return provider;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const username = await readSession();
  if (!username) {
    return apiError({ status: 401, code: "UNAUTHORIZED", message: "로그인이 필요합니다." });
  }

  const resolvedParams = await params;
  const provider = parseProvider(resolvedParams.provider);
  if (!provider) {
    return apiError({ status: 400, code: "INVALID_PROVIDER", message: "provider 값이 올바르지 않습니다." });
  }

  await ensureIntegrationConnectionsTable();
  const pool = getPool();
  const result = await pool.query<IntegrationRow>(
    `
      SELECT status, connected_at, updated_at
      FROM integration_connections
      WHERE username = $1 AND provider = $2
      LIMIT 1
    `,
    [username, provider],
  );

  if (!result.rowCount) {
    return apiOk({
      provider,
      status: "disconnected",
      connected: false,
      connectedAt: null,
      updatedAt: null,
    });
  }

  const row = result.rows[0];

  return apiOk({
    provider,
    status: row.status,
    connected: row.status === "connected",
    connectedAt: row.connected_at,
    updatedAt: row.updated_at,
  });
}
