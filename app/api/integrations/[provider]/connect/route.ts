import { apiError, apiOk } from "../../../../../lib/api-response";
import { ensureIntegrationConnectionsTable, getPool } from "../../../../../lib/db";
import { readSession } from "../../../../../lib/session";

type ConnectBody = {
  config?: Record<string, unknown>;
};

function parseProvider(input: string) {
  const provider = input.trim().toLowerCase();
  if (!/^[a-z0-9-]{2,30}$/.test(provider)) {
    return null;
  }
  return provider;
}

export async function POST(
  request: Request,
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

  try {
    const body = (await request.json()) as ConnectBody;
    const config = body.config ?? {};

    await ensureIntegrationConnectionsTable();
    const pool = getPool();
    await pool.query(
      `
        INSERT INTO integration_connections (username, provider, status, config, connected_at, updated_at)
        VALUES ($1, $2, 'connected', $3::jsonb, NOW(), NOW())
        ON CONFLICT (username, provider)
        DO UPDATE SET
          status = 'connected',
          config = EXCLUDED.config,
          connected_at = NOW(),
          updated_at = NOW()
      `,
      [username, provider, JSON.stringify(config)],
    );

    return apiOk({
      provider,
      status: "connected",
      connected: true,
      connectedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "연동 연결 중 오류가 발생했습니다.";
    return apiError({ status: 500, code: "INTEGRATION_CONNECT_FAILED", message });
  }
}
