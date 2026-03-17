import { NextRequest } from "next/server";
import { apiError, apiOk } from "../../../../lib/api-response";
import { readSession } from "../../../../lib/session";

// GET /api/market/stock?action=search&q=삼성전자
// GET /api/market/stock?action=price&code=005930

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

export async function GET(req: NextRequest) {
  const username = await readSession();
  if (!username) return apiError({ status: 401, code: "UNAUTHORIZED", message: "로그인이 필요합니다." });

  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");

  if (action === "search") {
    const q = (searchParams.get("q") ?? "").trim().slice(0, 30);
    if (!q) return apiError({ status: 400, code: "BAD_REQUEST", message: "검색어를 입력하세요." });

    try {
      const url = `https://ac.finance.naver.com/ac?q=${encodeURIComponent(q)}&q_enc=UTF-8&target=index,stock,marketindicator`;
      const res = await fetch(url, {
        headers: { "User-Agent": UA, "Referer": "https://finance.naver.com/" },
        signal: AbortSignal.timeout(5000),
      });
      const text = await res.text();

      // NAVER returns JSONP: ac({...}) – strip wrapper
      const jsonStr = text.replace(/^ac\(/, "").replace(/\);?\s*$/, "");
      const data = JSON.parse(jsonStr) as {
        t?: {
          s?: { d?: string[][] };
        };
      };

      const items = data?.t?.s?.d ?? [];
      const stocks = items
        .filter((row) => row[1]) // has code
        .slice(0, 10)
        .map((row) => ({
          name: row[0] ?? "",
          code: row[1] ?? "",
          market: detectMarket(row[1] ?? ""),
        }));

      return apiOk({ stocks });
    } catch {
      return apiError({ status: 502, code: "EXTERNAL_API_ERROR", message: "종목 검색에 실패했습니다." });
    }
  }

  if (action === "price") {
    const code = (searchParams.get("code") ?? "").replace(/\D/g, "").slice(0, 6);
    if (!code) return apiError({ status: 400, code: "BAD_REQUEST", message: "종목코드를 입력하세요." });

    try {
      const res = await fetch(`https://m.stock.naver.com/api/stock/${code}/basic`, {
        headers: { "User-Agent": UA, "Referer": "https://m.stock.naver.com/" },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as {
        closePrice?: string;
        stockName?: string;
        compareToPreviousClosePrice?: string;
        fluctuationsRatio?: string;
        marketType?: string;
      };

      const priceStr = (data.closePrice ?? "").replace(/,/g, "");
      const price = Number(priceStr);
      if (!price || price <= 0) throw new Error("invalid price");

      const change = Number((data.compareToPreviousClosePrice ?? "0").replace(/,/g, ""));
      const changeRate = Number(data.fluctuationsRatio ?? "0");

      return apiOk({
        code,
        name: data.stockName ?? code,
        market: (data.marketType ?? "KOSPI") as "KOSPI" | "KOSDAQ",
        currentPriceWon: price,
        change,
        changeRate,
        updatedAt: new Date().toISOString(),
      });
    } catch {
      return apiError({ status: 502, code: "EXTERNAL_API_ERROR", message: "시세 조회에 실패했습니다. 종목코드를 확인하세요." });
    }
  }

  return apiError({ status: 400, code: "BAD_REQUEST", message: "action 파라미터가 필요합니다 (search | price)." });
}

function detectMarket(code: string): "KOSPI" | "KOSDAQ" {
  const n = Number(code);
  // KOSDAQ: 보통 6자리 중 A로 시작하거나 숫자 범위로 추정 (단순 추정)
  if (code.startsWith("A")) return "KOSDAQ";
  if (n >= 900000) return "KOSDAQ"; // 9xxxxx = ETN/ETF
  return "KOSPI"; // 기본은 KOSPI로 표시, 실제는 price API에서 확인
}
