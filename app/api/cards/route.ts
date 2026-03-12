import { apiOk, apiError } from "@/lib/api-response";
import { getSavedCards } from "@/lib/card-crawler";

// GET — 저장된 카드 목록 조회
export async function GET() {
  try {
    const cards = await getSavedCards();
    return apiOk(cards, { message: `카드 ${cards.length}건 조회` });
  } catch (err) {
    return apiError({
      status: 500,
      code: "QUERY_ERROR",
      message: "카드 목록 조회 실패",
      details: err instanceof Error ? err.message : String(err),
    });
  }
}
