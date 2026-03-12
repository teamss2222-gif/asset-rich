import { apiOk } from "@/lib/api-response";
import { getPopularCardIds } from "@/lib/card-crawler";

// GET — 크롤링 대상 카드 ID 목록
export async function GET() {
  return apiOk(getPopularCardIds());
}
