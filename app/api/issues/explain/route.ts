import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api-response";

const SYSTEM_PROMPT = `
1. **이슈 배경** - 왜 지금 화제가 되고 있는지
2. **핵심 내용** - 무슨 일이 있었는지
3. **사회적 반응** - 여론, SNS, 언론의 반응
4. **향후 전망** - 앞으로 전개될 방향 (해당되는 경우)
사실에 근거하고 균형 잡힌 시각으로 3~4 문단으로 요약해주세요.
섹션 제목은 **볼드체**로 표시해주세요.
`.trim();

function buildAzureUrl(): string | null {
  const endpointRaw = process.env.AZURE_OPENAI_ENDPOINT ?? "";
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT_NAME ?? "";
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION ?? "2025-04-01-preview";
  if (!endpointRaw || !deployment) return null;
  const origin = new URL(endpointRaw).origin;
  return `${origin}/openai/deployments/${encodeURIComponent(deployment)}/chat/completions?api-version=${encodeURIComponent(apiVersion)}`;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const chatUrl = buildAzureUrl();

  if (!apiKey || !chatUrl) {
    return apiError({
      status: 503,
      code: "AZURE_OPENAI_NOT_CONFIGURED",
      message: "AZURE_OPENAI_API_KEY / AZURE_OPENAI_ENDPOINT / AZURE_OPENAI_DEPLOYMENT_NAME env vars not set.",
    });
  }

  let keyword: string;
  try {
    const body = await req.json() as { keyword?: string };
    keyword = (body.keyword ?? "").trim();
    if (!keyword) {
      return apiError({ status: 400, code: "BAD_REQUEST", message: "keyword required" });
    }
  } catch {
    return apiError({ status: 400, code: "BAD_REQUEST", message: "body parse failed" });
  }

  try {
    const now = new Date().toLocaleDateString("ko-KR", {
      year: "numeric", month: "long", day: "numeric",
    });

    const sysPrompt = `당신은 한국 실시간 검색어 트렌드 전문 분석가입니다.\n${SYSTEM_PROMPT}`;
    const userMsg = `오늘 날짜: ${now}\n키워드: "${keyword}"\n\n이 키워드가 왜 지금 실시간 검색어에 오르고 있는지 핵심 내용을 분석해주세요.`;

    const res = await fetch(chatUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": apiKey },
      body: JSON.stringify({
        messages: [
          { role: "system", content: sysPrompt },
          { role: "user", content: userMsg },
        ],
        max_tokens: 700,
        temperature: 0.65,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      return apiError({ status: 502, code: "AZURE_API_ERROR", message: "Azure OpenAI API error", details: errBody });
    }

    const data = await res.json() as { choices?: Array<{ message: { content: string } }> };
    const explanation = data.choices?.[0]?.message?.content?.trim() ?? "";
    return apiOk({ keyword, explanation }, { message: "success" });
  } catch (err) {
    return apiError({
      status: 500,
      code: "EXPLAIN_ERROR",
      message: "explain error",
      details: err instanceof Error ? err.message : String(err),
    });
  }
}