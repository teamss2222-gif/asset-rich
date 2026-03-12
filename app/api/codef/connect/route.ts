import { apiOk, apiError } from "../../../../lib/api-response";
import { readSession } from "../../../../lib/session";
import { createConnectedId, addAccount } from "../../../../lib/codef";

/* ══════════════════════════════════════
   CODEF connectedId 생성 / 계정 추가
   ══════════════════════════════════════ */

export async function POST(req: Request) {
  const sess = await readSession();
  if (!sess) return apiError({ status: 401, code: "UNAUTHORIZED", message: "로그인이 필요합니다." });

  try {
    const body = await req.json();
    const { action, connectedId, accountList } = body;

    if (!accountList || !Array.isArray(accountList) || accountList.length === 0) {
      return apiError({ status: 400, code: "INVALID_BODY", message: "accountList가 필요합니다." });
    }

    if (action === "add" && connectedId) {
      const result = await addAccount(connectedId, accountList);
      return apiOk(result);
    }

    // 기본: 새 connectedId 생성
    const newId = await createConnectedId(accountList);
    return apiOk({ connectedId: newId });
  } catch (err) {
    return apiError({ status: 500, code: "CODEF_ERROR", message: String(err) });
  }
}
