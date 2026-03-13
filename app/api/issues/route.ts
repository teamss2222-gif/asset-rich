import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api-response";
import { ensureIssuesTable } from "@/lib/db";
import {
  getLatestIssues,
  filterIssues,
} from "@/lib/issues";

export async function GET(req: NextRequest) {
  try {
    await ensureIssuesTable();

    // 순수 read-only — 자동수집 없음 (타임아웃 방지)
    const issues = await getLatestIssues();

    const { searchParams } = new URL(req.url);
    const gender = searchParams.get("gender") ?? undefined;
    const age = searchParams.get("age") ?? undefined;

    const filtered = filterIssues(issues, gender, age);
    const collectedAt = issues[0]?.collectedAt ?? null;

    return apiOk(
      { issues: filtered, collectedAt },
      { message: "실시간 이슈 조회 완료" },
    );
  } catch (err) {
    return apiError({
      status: 500,
      code: "ISSUES_FETCH_ERROR",
      message: "이슈 데이터 조회 중 오류가 발생했습니다.",
      details: err instanceof Error ? err.message : String(err),
    });
  }
}
