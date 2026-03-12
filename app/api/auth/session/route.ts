import { apiOk } from "../../../../lib/api-response";
import { readSession } from "../../../../lib/session";

export async function GET() {
  const username = await readSession();
  return apiOk({ username }, { code: "SESSION_OK", message: "session loaded" });
}
