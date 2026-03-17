import { NextRequest } from "next/server";
import { apiError, apiOk } from "../../../../lib/api-response";
import { readSession } from "../../../../lib/session";

// GET /api/market/stock?action=search&q=삼성전자
// GET /api/market/stock?action=price&code=005930
// 인증 키 불필요 – NAVER Finance 공개 API 사용

const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15";

export async function GET(req: NextRequest) {
  const username = await readSession();
  if (!username) return apiError({ status: 401, code: "UNAUTHORIZED", message: "로그인이 필요합니다." });

  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");

  // ── 종목 검색 ────────────────────────────────────────────────────────────
  if (action === "search") {
    const q = (searchParams.get("q") ?? "").trim().slice(0, 30);
    if (!q) return apiError({ status: 400, code: "BAD_REQUEST", message: "검색어를 입력하세요." });

    try {
      const acUrl = `https://ac.finance.naver.com/ac?q=${encodeURIComponent(q)}&q_enc=UTF-8&target=stock`;
      const acRes = await fetch(acUrl, {
        headers: { "User-Agent": UA, "Referer": "https://finance.naver.com/" },
        signal: AbortSignal.timeout(6000),
      });
      const text = await acRes.text();

      // NAVER JSONP 래퍼 제거: ac({...}) 형식
      const jsonStr = text.replace(/^[a-zA-Z_$][\w$.]*\s*\(/, "").replace(/\);\s*$/, "");

      type FormatA = { t?: Array<[string, Array<[string, string[]]>]> };
      type FormatB = { items?: string[][] };
      const data = JSON.parse(jsonStr) as FormatA & FormatB;

      let stocks: Array<{ code: string; name: string; market: string }> = [];

      if (Array.isArray(data.t)) {
        // 형식 A: {t:[["stock",[[이름,[코드,isin,kospiKosdaq]],...]],...]}
        const stockEntry = data.t.find((e) => e[0] === "stock");
        if (stockEntry) {
          stocks = (stockEntry[1] ?? [])
            .filter((item) => item[1]?.[0])
            .slice(0, 10)
            .map((item) => ({
              name: item[0],
              code: item[1][0],
              market: item[1][2] === "1" ? "KOSDAQ" : "KOSPI",
            }));
        }
      } else if (Array.isArray(data.items)) {
        // 형식 B: {items:[[이름,코드,시장,...],...]}
        stocks = data.items
          .filter((row) => row[1])
          .slice(0, 10)
          .map((row) => ({
            name: row[0] ?? "",
            code: row[1] ?? "",
            market: row[2] === "코스닥" ? "KOSDAQ" : "KOSPI",
          }));
      }

      return apiOk({ stocks });
    } catch {
      return apiError({ status: 502, code: "EXTERNAL_API_ERROR", message: "종목 검색에 실패했습니다. 종목코드를 직접 입력해 보세요." });
    }
  }

  // ── 현재가 조회 ──────────────────────────────────────────────────────────
  if (action === "price") {
    const code = (searchParams.get("code") ?? "").replace(/\D/g, "").slice(0, 6);
    if (!code) return apiError({ status: 400, code: "BAD_REQUEST", message: "종목코드를 입력하세요." });

    try {
      const res = await fetch(`https://m.stock.naver.com/api/stock/${code}/basic`, {
        headers: { "User-Agent": UA, "Referer": "https://m.stock.naver.com/" },
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as {
        closePrice?: string;
        stockName?: string;
        compareToPreviousClosePrice?: string;
        fluctuationsRatio?: string;
        marketType?: string;
      };

      const price = Number((data.closePrice ?? "").replace(/,/g, ""));
      if (!price || price <= 0) throw new Error("invalid price");

      return apiOk({
        code,
        name: data.stockName ?? code,
        market: (data.marketType ?? "KOSPI") as "KOSPI" | "KOSDAQ",
        currentPriceWon: price,
        change: Number((data.compareToPreviousClosePrice ?? "0").replace(/,/g, "")),
        changeRate: Number(data.fluctuationsRatio ?? "0"),
        updatedAt: new Date().toISOString(),
      });
    } catch {
      return apiError({ status: 502, code: "EXTERNAL_API_ERROR", message: "시세 조회 실패. 종목코드를 확인하세요." });
    }
  }

  return apiError({ status: 400, code: "BAD_REQUEST", message: "action 파라미터가 필요합니다 (search | price)." });
}
