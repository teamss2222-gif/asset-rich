import { apiOk } from "../../../lib/api-response";

export async function GET() {
  return apiOk(
    {
      ok: true,
      service: "asset-lab",
      timestamp: new Date().toISOString(),
    },
    { status: 200, code: "HEALTH_OK", message: "health check ok" },
  );
}
