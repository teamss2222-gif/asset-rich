import { apiError, apiOk } from "../../../../../lib/api-response";
import { ensureIntegrationConnectionsTable, getPool } from "../../../../../lib/db";
import { readSession } from "../../../../../lib/session";

function parseProvider(input: string) {
  const provider = input.trim().toLowerCase();
  if (!/^[a-z0-9-]{2,30}$/.test(provider)) {
    return null;
  }
  return provider;
}

export async function POST(
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
  await pool.query(
    `
      INSERT INTO integration_connections (username, provider, status, config, connected_at, updated_at)
      VALUES ($1, $2, 'disconnected', '{}'::jsonb, NULL, NOW())
      ON CONFLICT (username, provider)
      DO UPDATE SET
        status = 'disconnected',
        connected_at = NULL,
        updated_at = NOW()
    `,
    [username, provider],
  );

  return apiOk({
    provider,
    status: "disconnected",
    connected: false,
    connectedAt: null,
  });
}
