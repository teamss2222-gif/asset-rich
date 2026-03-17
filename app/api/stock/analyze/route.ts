import { apiError, apiOk } from "../../../../lib/api-response";

export const maxDuration = 60; // Vercel 최대 60초

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
export type AgentResult = {
  name: string;
  role: string;
  emoji: string;
  stance: "강력매수" | "매수" | "중립" | "매도" | "강력매도";
  score: number; // -5 ~ +5
  reasoning: string;
  keyPoints: string[];
};

export type StockAnalysis = {
  query: string;
  news: { title: string; source: string; pubDate: string }[];
  agents: AgentResult[];
  consensus: {
    direction: "상승" | "하락" | "횡보";
    magnitude: string;
    confidence: number;
    summary: string;
    timeframe: string;
    bullCount: number;
    bearCount: number;
  };
  analyzedAt: string;
};

// ─────────────────────────────────────────────
// 네이버 뉴스 RSS 수집
// ─────────────────────────────────────────────
async function fetchStockNews(q: string): Promise<{ title: string; source: string; pubDate: string }[]> {
  try {
    const url = `https://search.naver.com/rss?where=news&query=${encodeURIComponent(q + " 주가")}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const items: { title: string; source: string; pubDate: string }[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    while ((match = itemRegex.exec(xml)) !== null && items.length < 8) {
      const block = match[1];
      const title = (/<title><!\[CDATA\[(.*?)\]\]><\/title>/.exec(block) ?? /<title>(.*?)<\/title>/.exec(block))?.[1]?.replace(/<[^>]+>/g, "").trim() ?? "";
      const source = (/<source[^>]*>(.*?)<\/source>/.exec(block))?.[1]?.trim() ?? "";
      const pubDate = (/<pubDate>(.*?)<\/pubDate>/.exec(block))?.[1]?.trim() ?? "";
      if (title) items.push({ title, source, pubDate });
    }
    return items;
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────
// Azure OpenAI 다중 에이전트 시뮬레이션
// ─────────────────────────────────────────────
async function runAgentSimulation(
  q: string,
  news: { title: string; source: string; pubDate: string }[]
): Promise<{ agents: AgentResult[]; consensus: StockAnalysis["consensus"] } | null> {
  const apiKey = process.env.AZURE_OPENAI_API_KEY?.split(/[\r\n]/)[0].replace(/\s.*$/, "").trim();
  const ep = (process.env.AZURE_OPENAI_ENDPOINT ?? "").split(/[\r\n]/)[0].trim();
  const dep = (process.env.AZURE_OPENAI_DEPLOYMENT_NAME ?? "").split(/[\r\n]/)[0].trim();
  const ver = (process.env.AZURE_OPENAI_API_VERSION ?? "2025-04-01-preview").split(/[\r\n]/)[0].trim();
  if (!apiKey || !ep || !dep) return null;

  const origin = new URL(ep).origin;
  const url = `${origin}/openai/deployments/${encodeURIComponent(dep)}/chat/completions?api-version=${encodeURIComponent(ver)}`;

  const newsText = news.length > 0
    ? news.map((n, i) => `${i + 1}. [${n.source}] ${n.title}`).join("\n")
    : "관련 뉴스 없음 (최근 뉴스를 찾을 수 없습니다)";

  const prompt = `당신은 주식 시장 시뮬레이션 AI입니다.
종목: "${q}"
최근 뉴스 헤드라인:
${newsText}

아래 5명의 투자 주체가 이 뉴스를 보고 어떤 판단을 내릴지 시뮬레이션하세요.

각 에이전트:
1. 개인투자자 (단기 심리, 커뮤니티 반응 중시)
2. 국내기관 (펀더멘털, 실적 중심, 3~6개월 관점)
3. 외국인 (환율·글로벌 매크로·달러인덱스 고려)
4. 증권사 애널리스트 (밸류에이션, 목표주가 관점)
5. 공매도 세력 (약세 포인트, 리스크 부각)

아래 JSON 형식으로만 출력하세요. 다른 텍스트 없이 JSON만:
{
  "agents": [
    {
      "name": "에이전트명",
      "role": "역할 설명 (10자 이내)",
      "emoji": "이모지",
      "stance": "강력매수|매수|중립|매도|강력매도 중 하나",
      "score": 숫자(-5~+5, 양수=매수, 음수=매도),
      "reasoning": "판단 근거 (2~3문장)",
      "keyPoints": ["핵심 포인트 1", "핵심 포인트 2"]
    }
  ],
  "consensus": {
    "direction": "상승|하락|횡보 중 하나",
    "magnitude": "예상 변동폭 (예: +1~3%, -2~4%)",
    "confidence": 신뢰도(0~100 정수),
    "summary": "종합 판단 (3~4문장, 한국어)",
    "timeframe": "예측 기간 (예: 1주일, 2주일)",
    "bullCount": 매수의견 에이전트 수(정수),
    "bearCount": 매도의견 에이전트 수(정수)
  }
}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": apiKey },
      body: JSON.stringify({
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 2000,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(40000),
    });
    if (!res.ok) return null;
    const data = await res.json() as { choices?: Array<{ message: { content: string } }> };
    const raw = data.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as { agents?: AgentResult[]; consensus?: StockAnalysis["consensus"] };
    if (!parsed.agents || !parsed.consensus) return null;
    return { agents: parsed.agents, consensus: parsed.consensus };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────
// GET /api/stock/analyze?q=삼성전자
// ─────────────────────────────────────────────
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim().slice(0, 50);

  if (!q) return apiError({ status: 400, code: "BAD_REQUEST", message: "종목명을 입력하세요." });

  const [news, simulation] = await Promise.all([
    fetchStockNews(q),
    (async () => {
      // 뉴스 먼저 수집 후 시뮬레이션 — 직렬 처리가 더 좋음
      return null;
    })(),
  ]);

  void simulation; // 병렬 처리는 아래서 처리

  const result = await runAgentSimulation(q, news);
  if (!result) {
    return apiError({ status: 503, code: "AI_UNAVAILABLE", message: "AI 분석 서비스를 사용할 수 없습니다. Azure OpenAI 설정을 확인하세요." });
  }

  const analysis: StockAnalysis = {
    query: q,
    news,
    agents: result.agents,
    consensus: result.consensus,
    analyzedAt: new Date().toISOString(),
  };

  return apiOk(analysis);
}
