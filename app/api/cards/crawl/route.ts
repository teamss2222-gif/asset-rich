import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api-response";
import { crawlAll, crawlCard, saveCard, getPopularCardIds } from "@/lib/card-crawler";

// POST  — 크롤링 실행 (전체 또는 단건)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { cardId, cardIds } = body as { cardId?: number; cardIds?: number[] };

    // 단건 크롤링
    if (cardId) {
      const card = await crawlCard(cardId);
      if (!card) {
        return apiError({ status: 404, code: "NOT_FOUND", message: `카드 ID ${cardId} 크롤링 실패` });
      }
      await saveCard(card);
      return apiOk(card, { message: "카드 크롤링 완료" });
    }

    // 전체 크롤링
    const ids = cardIds ?? getPopularCardIds();
    const results = await crawlAll(ids);
    const success = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => !r.ok).length;

    return apiOk(
      { results, summary: { total: ids.length, success, failed } },
      { message: `크롤링 완료: 성공 ${success}, 실패 ${failed}` },
    );
  } catch (err) {
    return apiError({
      status: 500,
      code: "CRAWL_ERROR",
      message: "크롤링 중 오류 발생",
      details: err instanceof Error ? err.message : String(err),
    });
  }
}
