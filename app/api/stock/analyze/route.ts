import { apiError, apiOk } from "../../../../lib/api-response";

export const maxDuration = 60;

export type AgentResult = {
  name: string;
  role: string;
  emoji: string;
  stance: "\uac15\ub825\ub9e4\uc218" | "\ub9e4\uc218" | "\uc911\ub9bd" | "\ub9e4\ub3c4" | "\uac15\ub825\ub9e4\ub3c4";
  score: number;
  reasoning: string;
  keyPoints: string[];
};

export type StockAnalysis = {
  query: string;
  news: { title: string; source: string }[];
  agents: AgentResult[];
  consensus: {
    direction: "\uc0c1\uc2b9" | "\ud558\ub77d" | "\ud6a1\ubcf4";
    magnitude: string;
    confidence: number;
    summary: string;
    timeframe: string;
    bullCount: number;
    bearCount: number;
  };
  analyzedAt: string;
};

function extractJson(raw: string): string {
  let text = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  if (fence) text = fence[1].trim();
  const s = text.indexOf("{");
  const e = text.lastIndexOf("}");
  return s !== -1 && e > s ? text.slice(s, e + 1) : text;
}

async function fetchStockNews(q: string): Promise<{ title: string; source: string }[]> {
  const FEEDS = [
    "https://rss.news.daum.net/rss/economic",
    "https://www.yna.co.kr/rss/economy.xml",
  ];
  const results: { title: string; source: string }[] = [];
  const kw = q.replace(/\s/g, "").toLowerCase();

  await Promise.allSettled(
    FEEDS.map(async (url) => {
      try {
        const res = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0" },
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) return;
        const xml = await res.text();
        const itemRegex = /<item>([\s\S]*?)<\/item>/g;
        let m;
        while ((m = itemRegex.exec(xml)) !== null) {
          const block = m[1];
          const title =
            (/<title><!\[CDATA\[(.+?)\]\]><\/title>/.exec(block) ??
              /<title>(.+?)<\/title>/.exec(block))?.[1]
              ?.replace(/<[^>]+>/g, "")
              .trim() ?? "";
          if (!title) continue;
          const source =
            (/<source[^>]*>(.+?)<\/source>/.exec(block))?.[1]?.trim() ?? "Daum";
          const normalized = title.replace(/\s/g, "").toLowerCase();
          if (normalized.includes(kw) || (kw.length >= 3 && kw.split("").some((c) => normalized.includes(c)))) {
            results.push({ title, source });
          }
        }
      } catch { /* skip */ }
    })
  );

  if (results.length === 0) {
    try {
      const res = await fetch("https://rss.news.daum.net/rss/economic", {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const xml = await res.text();
        const itemRegex = /<item>([\s\S]*?)<\/item>/g;
        let m;
        while ((m = itemRegex.exec(xml)) !== null && results.length < 6) {
          const block = m[1];
          const title =
            (/<title><!\[CDATA\[(.+?)\]\]><\/title>/.exec(block) ??
              /<title>(.+?)<\/title>/.exec(block))?.[1]
              ?.replace(/<[^>]+>/g, "")
              .trim() ?? "";
          if (title) results.push({ title, source: "Daum\uacbd\uc81c" });
        }
      }
    } catch { /* skip */ }
  }

  return results.slice(0, 8);
}

async function runAgentSimulation(
  q: string,
  news: { title: string; source: string }[]
): Promise<{ agents: AgentResult[]; consensus: StockAnalysis["consensus"] } | null> {
  const apiKey = process.env.AZURE_OPENAI_API_KEY?.split(/[\r\n]/)[0].replace(/\s.*$/, "").trim();
  const ep = (process.env.AZURE_OPENAI_ENDPOINT ?? "").split(/[\r\n]/)[0].trim();
  const dep = (process.env.AZURE_OPENAI_DEPLOYMENT_NAME ?? "").split(/[\r\n]/)[0].trim();
  const ver = (process.env.AZURE_OPENAI_API_VERSION ?? "2025-04-01-preview").split(/[\r\n]/)[0].trim();
  if (!apiKey || !ep || !dep) return null;

  let origin: string;
  try { origin = new URL(ep).origin; } catch { return null; }
  const url = `${origin}/openai/deployments/${encodeURIComponent(dep)}/chat/completions?api-version=${encodeURIComponent(ver)}`;

  const newsText =
    news.length > 0
      ? news.slice(0, 6).map((n, i) => `${i + 1}. [${n.source}] ${n.title}`).join("\n")
      : "\ucd5c\uadfc \uad00\ub828 \ub274\uc2a4 \uc5c6\uc74c";

  const systemMsg = `\ub2f9\uc2e0\uc740 \ud55c\uad6d \uc8fc\uc2dd \uc2dc\uc7a5 \uc2dc\ubbac\ub808\uc774\uc158 AI\uc785\ub2c8\ub2e4. \ubc18\ub4dc\uc2dc \uc720\ud6a8\ud55c JSON\ub9cc \ucd9c\ub825\ud558\uc138\uc694.`;
  const userMsg = `\uc885\ubaa9: "${q}"
\uad00\ub828 \ub274\uc2a4:
${newsText}

\uc544\ub798 5\uba85\uc758 \ud22c\uc790 \uc8fc\uccb4\uac00 \uc774 \uc815\ubcf4\ub97c \ubcf4\uace0 \uc5b4\ub5a4 \ud22c\uc790 \ud310\ub2e8\uc744 \ub0b4\ub9b4\uc9c0 \uc2dc\ubbac\ub808\uc774\uc158\ud558\uc138\uc694.
1. \uac1c\uc778\ud22c\uc790\uc790 (\ub2e8\uae30 \uc2ec\ub9ac, \ucee4\ubba4\ub2c8\ud2f0)
2. \uad6d\ub0b4\uae30\uad00 (\ud380\ub354\uba58\ud138, 3~6\uac1c\uc6d4)
3. \uc678\uad6d\uc778 (\ud658\uc728, \uae00\ub85c\ubc8c \ub9e4\ud06c\ub85c)
4. \uc99d\uad8c\uc0ac \uc560\ub110\ub9ac\uc2a4\ud2b8 (\ubc38\ub958\uc5d0\uc774\uc158)
5. \uacf5\ub9e4\ub3c4 \uc138\ub825 (\ub9ac\uc2a4\ud06c \ubd80\uac01)

\uc544\ub798 JSON\uc744 \ubc18\ud658\ud558\uc138\uc694:
{
  "agents": [
    {
      "name": "\ud22c\uc790\uc790 \uc720\ud615\uba85",
      "role": "\uc5ed\ud560 \ud55c\uc904",
      "emoji": "\uc774\ubaa8\uc9c0",
      "stance": "\uac15\ub825\ub9e4\uc218 \ub610\ub294 \ub9e4\uc218 \ub610\ub294 \uc911\ub9bd \ub610\ub294 \ub9e4\ub3c4 \ub610\ub294 \uac15\ub825\ub9e4\ub3c4",
      "score": 0,
      "reasoning": "\ud310\ub2e8 \uadfc\uac70 2\ubb38\uc7a5",
      "keyPoints": ["\ud3ec\uc778\ud2b81", "\ud3ec\uc778\ud2b82"]
    }
  ],
  "consensus": {
    "direction": "\uc0c1\uc2b9 \ub610\ub294 \ud558\ub77d \ub610\ub294 \ud6a1\ubcf4",
    "magnitude": "+1~3%",
    "confidence": 70,
    "summary": "\uc885\ud569 \ud310\ub2e8 3\ubb38\uc7a5",
    "timeframe": "1\uc8fc\uc77c",
    "bullCount": 3,
    "bearCount": 1
  }
}
score\ub294 -5(\uac15\ub825\ub9e4\ub3c4)~+5(\uac15\ub825\ub9e4\uc218) \uc22b\uc790, confidence\ub294 0~100 \uc22b\uc790.`;

  async function call(useJsonMode: boolean) {
    const body: Record<string, unknown> = {
      messages: [
        { role: "system", content: systemMsg },
        { role: "user", content: userMsg },
      ],
      max_tokens: 3000,
      temperature: 0.7,
    };
    if (useJsonMode) body.response_format = { type: "json_object" };
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": apiKey! },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45000),
    });
    return res;
  }

  try {
    let res = await call(true);
    if (!res.ok) res = await call(false);
    if (!res.ok) return null;
    const data = await res.json() as { choices?: Array<{ message: { content: string } }> };
    const raw = data.choices?.[0]?.message?.content ?? "";
    const jsonStr = extractJson(raw);
    const parsed = JSON.parse(jsonStr) as { agents?: AgentResult[]; consensus?: StockAnalysis["consensus"] };
    if (!parsed.agents?.length || !parsed.consensus) return null;
    return { agents: parsed.agents, consensus: parsed.consensus };
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim().slice(0, 50);
  if (!q) return apiError({ status: 400, code: "BAD_REQUEST", message: "\uc885\ubaa9\uba85\uc744 \uc785\ub825\ud558\uc138\uc694." });

  const news = await fetchStockNews(q);
  const result = await runAgentSimulation(q, news);

  if (!result) {
    return apiError({ status: 503, code: "AI_UNAVAILABLE", message: "AI \ubd84\uc11d\uc5d0 \uc2e4\ud328\ud588\uc2b5\ub2c8\ub2e4. \uc7a0\uc2dc \ud6c4 \ub2e4\uc2dc \uc2dc\ub3c4\ud574 \uc8fc\uc138\uc694." });
  }

  return apiOk({
    query: q, news, agents: result.agents, consensus: result.consensus,
    analyzedAt: new Date().toISOString(),
  } satisfies StockAnalysis);
}