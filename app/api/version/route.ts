import { apiOk } from "../../../lib/api-response";

export async function GET() {
  return apiOk(
    {
      ok: true,
      service: "asset",
      version: "0.1.0",
      timestamp: new Date().toISOString(),
    },
    { status: 200, code: "VERSION_OK", message: "version check ok" },
  );
}
