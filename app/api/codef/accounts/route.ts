import { apiOk, apiError } from "../../../../lib/api-response";
import { readSession } from "../../../../lib/session";
import { getAccountList } from "../../../../lib/codef";

/* ══════════════════════════════════════
   CODEF 보유 계좌 목록 조회
   ══════════════════════════════════════ */

export async function POST(req: Request) {
  const sess = await readSession();
  if (!sess) return apiError({ status: 401, code: "UNAUTHORIZED", message: "로그인이 필요합니다." });

  try {
    const { connectedId, organization } = await req.json();

    if (!connectedId || !organization) {
      return apiError({ status: 400, code: "INVALID_BODY", message: "connectedId와 organization이 필요합니다." });
    }

    const result = await getAccountList(connectedId, organization);
    return apiOk(result);
  } catch (err) {
    return apiError({ status: 500, code: "CODEF_ERROR", message: String(err) });
  }
}
