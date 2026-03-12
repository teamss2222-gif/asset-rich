import { apiError, apiOk } from "../../../../lib/api-response";
import { readSession } from "../../../../lib/session";

type LookupBody = {
  lawdCode?: string;
  dealYmd?: string;
  apartmentName?: string;
};

type TradeItem = {
  apartmentName: string;
  amountManwon: number;
  dealYmd: string;
  dealDateKey: string;
};

function stripTag(source: string, tag: string) {
  const match = source.match(new RegExp(`<${tag}>(.*?)</${tag}>`, "s"));
  return (match?.[1] ?? "").trim();
}

function parseAmountManwon(text: string) {
  const normalized = text.replace(/,/g, "").replace(/\s/g, "");
  const value = Number(normalized);
  return Number.isFinite(value) ? value : 0;
}

function monthKeyFromDate(date: Date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${yyyy}${mm}`;
}

function shiftMonth(yyyymm: string, diff: number) {
  const year = Number(yyyymm.slice(0, 4));
  const month = Number(yyyymm.slice(4, 6));
  const date = new Date(year, month - 1 + diff, 1);
  return monthKeyFromDate(date);
}

function normalizeName(name: string) {
  return name.replace(/\s/g, "").toLowerCase();
}

function listRecentMonths(baseYmd: string, months: number) {
  return Array.from({ length: months }, (_, index) => shiftMonth(baseYmd, -index));
}

function toDealYmd(input?: string) {
  const fallback = new Date();
  const yyyy = fallback.getFullYear();
  const mm = String(fallback.getMonth() + 1).padStart(2, "0");
  const ymd = (input ?? `${yyyy}${mm}`).trim();

  if (!/^\d{6}$/.test(ymd)) {
    return null;
  }

  return ymd;
}

function parseItemsFromXml(xml: string): TradeItem[] {
  const items = xml.match(/<item>([\s\S]*?)<\/item>/g) ?? [];

  return items.flatMap((item) => {
    const apartmentName = stripTag(item, "아파트") || stripTag(item, "aptNm");
    const amountRaw = stripTag(item, "거래금액") || stripTag(item, "dealAmount");
    const dealYear = stripTag(item, "년") || stripTag(item, "dealYear");
    const dealMonth = stripTag(item, "월") || stripTag(item, "dealMonth");
    const dealDay = stripTag(item, "일") || stripTag(item, "dealDay");

    const amountManwon = parseAmountManwon(amountRaw);
    if (amountManwon <= 0) {
      return [];
    }

    const normalizedMonth = dealMonth.toString().padStart(2, "0");
    const normalizedDay = (dealDay || "1").toString().padStart(2, "0");
    const dealYmd = `${dealYear}${normalizedMonth}`;
    const dealDateKey = `${dealYear}${normalizedMonth}${normalizedDay}`;

    return [{ apartmentName, amountManwon, dealYmd, dealDateKey }];
  });
}

async function fetchTradesForMonth(serviceKey: string, lawdCode: string, dealYmd: string) {
  const endpoint =
    "https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade" +
    `?serviceKey=${encodeURIComponent(serviceKey)}` +
    `&LAWD_CD=${lawdCode}` +
    `&DEAL_YMD=${dealYmd}` +
    "&numOfRows=500&pageNo=1";

  const response = await fetch(endpoint, { cache: "no-store" });
  const xml = await response.text();

  if (!response.ok) {
    throw new Error("실거래가 API 호출에 실패했습니다.");
  }

  return parseItemsFromXml(xml);
}

export async function POST(request: Request) {
  const username = await readSession();
  if (!username) {
    return apiError({ status: 401, code: "UNAUTHORIZED", message: "로그인이 필요합니다." });
  }

  const serviceKey = process.env.REAL_ESTATE_API_KEY || process.env.REAL_ESTATE_LAWD_API_KEY;
  if (!serviceKey) {
    return apiError({
      status: 400,
      code: "MARKET_API_KEY_REQUIRED",
      message:
        "시세 조회를 쓰려면 data.go.kr 실거래가 서비스키가 필요합니다. 지금은 키가 없어 자동 시세 조회를 할 수 없습니다. 현재시세를 직접 입력하거나 API 키를 설정해 주세요.",
    });
  }

  try {
    const body = (await request.json()) as LookupBody;
    const lawdCode = (body.lawdCode ?? "").trim();
    const dealYmd = toDealYmd(body.dealYmd);
    const apartmentName = normalizeName((body.apartmentName ?? "").trim());

    if (!/^\d{5}$/.test(lawdCode)) {
      return apiError({ status: 400, code: "INVALID_LAWD_CODE", message: "법정동코드 5자리를 입력해 주세요." });
    }

    if (!dealYmd) {
      return apiError({ status: 400, code: "INVALID_DEAL_YMD", message: "조회년월은 YYYYMM 형식이어야 합니다." });
    }

    const recentMonths = listRecentMonths(dealYmd, 6);
    const recentWindowTrades: TradeItem[] = [];
    for (const month of recentMonths) {
      const monthlyTrades = await fetchTradesForMonth(serviceKey, lawdCode, month);
      recentWindowTrades.push(...monthlyTrades);
    }

    const filteredRecent = apartmentName
      ? recentWindowTrades.filter((item) => normalizeName(item.apartmentName).includes(apartmentName))
      : recentWindowTrades;

    const recent3MonthKeys = new Set(listRecentMonths(dealYmd, 3));
    const tradesIn3Months = filteredRecent.filter((trade) => recent3MonthKeys.has(trade.dealYmd));

    if (tradesIn3Months.length > 0) {
      const monthWeight = new Map<string, number>([
        [shiftMonth(dealYmd, 0), 3],
        [shiftMonth(dealYmd, -1), 2],
        [shiftMonth(dealYmd, -2), 1],
      ]);

      const weightedSum = tradesIn3Months.reduce((sum, trade) => {
        const weight = monthWeight.get(trade.dealYmd) ?? 1;
        return sum + trade.amountManwon * weight;
      }, 0);
      const weightTotal = tradesIn3Months.reduce((sum, trade) => sum + (monthWeight.get(trade.dealYmd) ?? 1), 0);
      const marketPriceManwon = Math.round(weightedSum / Math.max(weightTotal, 1));
      const latest = tradesIn3Months.reduce(
        (max, trade) => (trade.dealDateKey > max ? trade.dealDateKey : max),
        tradesIn3Months[0].dealDateKey,
      );

      return apiOk({
        marketPriceManwon,
        sampleCount: tradesIn3Months.length,
        source: "국토교통부 실거래가 공개시스템",
        asOf: latest,
        lawdCode,
        dealYmd,
        strategy: "weighted_3m",
      });
    }

    let latestFallbackTrade: TradeItem | null = null;
    for (const month of listRecentMonths(dealYmd, 36)) {
      const monthTrades = await fetchTradesForMonth(serviceKey, lawdCode, month);
      const filtered = apartmentName
        ? monthTrades.filter((item) => normalizeName(item.apartmentName).includes(apartmentName))
        : monthTrades;

      if (filtered.length > 0) {
        latestFallbackTrade = filtered.reduce((latest, current) => {
          return current.dealDateKey > latest.dealDateKey ? current : latest;
        }, filtered[0]);
        break;
      }
    }

    if (!latestFallbackTrade) {
      return apiError({
        status: 404,
        code: "MARKET_DATA_NOT_FOUND",
        message: apartmentName
          ? "해당 단지명으로 조회된 실거래가가 없습니다. 단지명을 줄이거나 비워서 조회해 보세요."
          : "조회된 실거래가 데이터가 없습니다.",
      });
    }

    return apiOk({
      marketPriceManwon: latestFallbackTrade.amountManwon,
      sampleCount: 1,
      source: "국토교통부 실거래가 공개시스템",
      asOf: latestFallbackTrade.dealDateKey,
      lawdCode,
      dealYmd,
      strategy: "latest_trade_fallback",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "시세 조회 중 오류가 발생했습니다.";
    return apiError({ status: 500, code: "MARKET_LOOKUP_FAILED", message });
  }
}
