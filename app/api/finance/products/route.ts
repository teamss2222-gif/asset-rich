import { apiOk, apiError } from "../../../../lib/api-response";
import { readSession } from "../../../../lib/session";

/* ══════════════════════════════════════════
   금융감독원 "금융상품 한눈에" API 프록시
   ══════════════════════════════════════════ */

const FSS_BASE = "https://finlife.fss.or.kr/finlifeapi";

const ENDPOINTS: Record<string, string> = {
  deposit: "depositProductsSearch.json",         // 정기예금
  saving: "savingProductsSearch.json",            // 정기적금
  mortgage: "mortgageLoanProductsSearch.json",    // 주택담보대출
  rent: "rentHouseLoanProductsSearch.json",       // 전세자금대출
  credit: "creditLoanProductsSearch.json",        // 개인신용대출
};

// 금융권역 코드
const FIN_GROUPS: Record<string, string> = {
  bank: "020000",       // 은행
  saving_bank: "030200", // 저축은행
  credit_union: "030300", // 신용협동조합
  insurance: "050000",  // 보험
  invest: "060000",     // 금융투자
};

export async function GET(req: Request) {
  const sess = await readSession();
  if (!sess) return apiError({ status: 401, code: "UNAUTHORIZED", message: "로그인이 필요합니다." });

  const apiKey = process.env.FSS_API_KEY;
  if (!apiKey) return apiError({ status: 500, code: "NO_API_KEY", message: "FSS API 키가 설정되지 않았습니다." });

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") || "deposit";
  const group = searchParams.get("group") || "bank";
  const page = searchParams.get("page") || "1";

  const endpoint = ENDPOINTS[type];
  if (!endpoint) return apiError({ status: 400, code: "INVALID_TYPE", message: `유효하지 않은 상품 유형: ${type}` });

  const topFinGrpNo = FIN_GROUPS[group] || "020000";

  const url = `${FSS_BASE}/${endpoint}?auth=${encodeURIComponent(apiKey)}&topFinGrpNo=${topFinGrpNo}&pageNo=${page}`;

  try {
    const res = await fetch(url, { next: { revalidate: 3600 } }); // 1시간 캐시
    if (!res.ok) {
      return apiError({ status: 502, code: "FSS_ERROR", message: `FSS API 오류: ${res.status}` });
    }

    const data = await res.json();
    const result = data?.result;

    if (!result || result.err_cd !== "000") {
      return apiError({
        status: 502,
        code: "FSS_API_FAIL",
        message: result?.err_msg || "FSS API 응답 오류",
      });
    }

    return apiOk({
      type,
      group,
      totalCount: parseInt(result.total_count || "0", 10),
      maxPage: parseInt(result.max_page_no || "1", 10),
      currentPage: parseInt(result.now_page_no || "1", 10),
      products: result.baseList || [],
      options: result.optionList || [],
    });
  } catch (err) {
    return apiError({ status: 500, code: "FSS_FETCH_FAIL", message: "FSS API 호출 실패", details: String(err) });
  }
}
