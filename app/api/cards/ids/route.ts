import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api-response";
import { fetchCardIdsFromSite, getPopularCardIds } from "@/lib/card-crawler";

// GET — 크롤링 대상 카드 ID 목록
// ?live=1  → 카드고릴라 사이트에서 실시간 수집
// (기본)   → 하드코딩 폴백 ID 반환 (즉시 응답)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const live = searchParams.get("live") === "1";

  if (!live) {
    const ids = getPopularCardIds();
    return apiOk({ ids, count: ids.length, source: "fallback" });
  }

  try {
    const result = await fetchCardIdsFromSite({ maxPages: 15, delayMs: 600 });
    return apiOk({ ids: result.ids, count: result.ids.length, source: result.source });
  } catch (err) {
    return apiError({
      status: 500,
      code: "SCRAPE_ERROR",
      message: "카드 ID 수집 실패",
      details: err instanceof Error ? err.message : String(err),
    });
  }
}
