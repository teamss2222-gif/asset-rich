import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api-response";
import { crawlCard, saveCard } from "@/lib/card-crawler";

// POST — 단건 크롤링 (프론트에서 1장씩 호출)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { cardId } = body as { cardId?: number };

    if (!cardId) {
      return apiError({ status: 400, code: "BAD_REQUEST", message: "cardId 필수" });
    }

    const card = await crawlCard(cardId);
    if (!card) {
      return apiOk({ cardId, ok: false }, { message: `카드 ID ${cardId} 크롤링 실패` });
    }

    await saveCard(card);
    return apiOk({ cardId, ok: true, name: card.name }, { message: "카드 크롤링 완료" });
  } catch (err) {
    return apiError({
      status: 500,
      code: "CRAWL_ERROR",
      message: "크롤링 중 오류 발생",
      details: err instanceof Error ? err.message : String(err),
    });
  }
}
