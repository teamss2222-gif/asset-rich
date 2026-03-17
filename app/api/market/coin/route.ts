import { NextRequest } from "next/server";
import { apiError, apiOk } from "../../../../lib/api-response";
import { readSession } from "../../../../lib/session";

// GET /api/market/coin?action=search&q=비트코인
// GET /api/market/coin?action=price&symbol=BTC

const KRW_MARKETS_URL = "https://api.upbit.com/v1/market/all";
const TICKER_URL = "https://api.upbit.com/v1/ticker";

type UpbitMarket = { market: string; korean_name: string; english_name: string };
type UpbitTicker = { market: string; trade_price: number; signed_change_rate: number; signed_change_price: number };

export async function GET(req: NextRequest) {
  const username = await readSession();
  if (!username) return apiError({ status: 401, code: "UNAUTHORIZED", message: "로그인이 필요합니다." });

  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");

  if (action === "search") {
    const q = (searchParams.get("q") ?? "").trim().toLowerCase();
    if (!q) return apiError({ status: 400, code: "BAD_REQUEST", message: "검색어를 입력하세요." });

    try {
      const res = await fetch(KRW_MARKETS_URL, {
        headers: { "Accept": "application/json" },
        signal: AbortSignal.timeout(5000),
      });
      const all = await res.json() as UpbitMarket[];
      const krw = all.filter((m) => m.market.startsWith("KRW-"));
      const filtered = krw
        .filter((m) =>
          m.korean_name.toLowerCase().includes(q) ||
          m.english_name.toLowerCase().includes(q) ||
          m.market.toLowerCase().includes(q)
        )
        .slice(0, 12)
        .map((m) => ({
          symbol: m.market.replace("KRW-", ""),
          name: m.korean_name,
          market: m.market,
        }));
      return apiOk({ coins: filtered });
    } catch {
      return apiError({ status: 502, code: "EXTERNAL_API_ERROR", message: "코인 검색에 실패했습니다." });
    }
  }

  if (action === "price") {
    const symbol = (searchParams.get("symbol") ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
    if (!symbol) return apiError({ status: 400, code: "BAD_REQUEST", message: "심볼을 입력하세요." });

    const market = `KRW-${symbol}`;
    try {
      const res = await fetch(`${TICKER_URL}?markets=${encodeURIComponent(market)}`, {
        headers: { "Accept": "application/json" },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as UpbitTicker[];
      const ticker = data?.[0];
      if (!ticker?.trade_price) throw new Error("no price");

      return apiOk({
        symbol,
        market,
        currentPriceWon: Math.round(ticker.trade_price),
        changeRate: ticker.signed_change_rate * 100,
        change: Math.round(ticker.signed_change_price),
        updatedAt: new Date().toISOString(),
      });
    } catch {
      return apiError({ status: 502, code: "EXTERNAL_API_ERROR", message: "시세 조회에 실패했습니다. 심볼을 확인하세요." });
    }
  }

  return apiError({ status: 400, code: "BAD_REQUEST", message: "action 파라미터가 필요합니다 (search | price)." });
}
