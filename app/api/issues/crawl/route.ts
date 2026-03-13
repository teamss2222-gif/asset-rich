import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api-response";
import { collectAndSave } from "@/lib/issues";

// GET  — Vercel Cron 자동 호출 (매 15분: 0,15,30,45분)
//        Authorization: Bearer CRON_SECRET 헤더로 보호
// POST — 대시보드에서 수동 새로고침
async function runCrawl() {
  const result = await collectAndSave();
  return result;
}

export async function GET(req: NextRequest) {
  // Vercel Cron 시크릿 검증 (환경 변수가 설정된 경우에만 강제)
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return apiError({
        status: 401,
        code: "UNAUTHORIZED",
        message: "크론 인증 실패",
      });
    }
  }

  try {
    const result = await runCrawl();
    return apiOk(result, { message: `이슈 수집 완료 (${result.count}건)` });
  } catch (err) {
    return apiError({
      status: 500,
      code: "CRAWL_ERROR",
      message: "이슈 수집 중 오류 발생",
      details: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function POST() {
  try {
    const result = await runCrawl();
    return apiOk(result, { message: `이슈 수집 완료 (${result.count}건)` });
  } catch (err) {
    return apiError({
      status: 500,
      code: "CRAWL_ERROR",
      message: "이슈 수집 중 오류 발생",
      details: err instanceof Error ? err.message : String(err),
    });
  }
}
