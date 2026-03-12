import { apiOk, apiError } from "../../../../lib/api-response";
import { readSession } from "../../../../lib/session";
import { getTransactions } from "../../../../lib/codef";

/* ══════════════════════════════════════
   CODEF 계좌 거래내역 조회
   ══════════════════════════════════════ */

export async function POST(req: Request) {
  const sess = await readSession();
  if (!sess) return apiError({ status: 401, code: "UNAUTHORIZED", message: "로그인이 필요합니다." });

  try {
    const { connectedId, organization, account, startDate, endDate } = await req.json();

    if (!connectedId || !organization || !account || !startDate || !endDate) {
      return apiError({
        status: 400,
        code: "INVALID_BODY",
        message: "connectedId, organization, account, startDate, endDate 모두 필요합니다.",
      });
    }

    const result = await getTransactions(connectedId, organization, account, startDate, endDate);
    return apiOk(result);
  } catch (err) {
    return apiError({ status: 500, code: "CODEF_ERROR", message: String(err) });
  }
}
