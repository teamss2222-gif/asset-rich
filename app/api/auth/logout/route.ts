import { apiOk } from "../../../../lib/api-response";
import { clearSession } from "../../../../lib/session";

export async function POST() {
  await clearSession();
  return apiOk({ ok: true }, { code: "LOGOUT_OK", message: "logout success" });
}
