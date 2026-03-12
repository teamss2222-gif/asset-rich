import { apiError, apiOk } from "../../../../../lib/api-response";
import { readSession } from "../../../../../lib/session";

const DEFAULT_PERMISSIONS = [
  "assets:read",
  "assets:write",
  "documents:read",
  "documents:write",
  "reports:read",
  "integrations:read",
  "integrations:write",
] as const;

export async function GET() {
  const username = await readSession();
  if (!username) {
    return apiError({ status: 401, code: "UNAUTHORIZED", message: "로그인이 필요합니다." });
  }

  return apiOk({
    username,
    role: "user",
    permissions: [...DEFAULT_PERMISSIONS],
  });
}
