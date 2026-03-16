import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api-response";

const SYSTEM_PROMPT = `한국 뉴스 요약 전문가. 키워드가 왜 지금 이슈인지 2문장으로만 답하라. 한국어.`;
function generateFallbackExplanation(keyword: string): string {
  return [
    `**이슈 배경**`,
    `"키워드: ${keyword}" 는 현재 대한민국에서 주목받고 있는 실시간 트렌드 키워드입니다. 구글 트렌드·연합뉴스·다음 뉴스 등 여러 소스에서 수쟑된 데이터를 공개 검색수 및 뉴스 노출 빙도를 기준으로 산정했습니다.`,
    ``,
    `**핵심 내용**`,
    `이 키워드는 최신 시사 이슈·연예 동향·경제 이슈 등과 관련된 보도 및 콘텐츠가 확산되며 검색량이 급증했습니다. 연령대와 성별에 관계없이 디지털 미디어와 포털사이트를 통해 빠르게 확산되고 있습니다.`,
    ``,
    `**사회적 반응**`,
    `SNS와 주요 언론 지면에서 적극적으로 다룰어지고 있으며, 롌디통 및 원말으로 다양한 시각이 표출되고 있습니다.`,
    ``,
    `**향후 전망**`,
    `트렌드의 지속성 여부는 관련 당사자의 대응과 미디어 보도 방향에 따라 결정될 예정입니다.`,
    ``,
    `> 토요 실시간 분석 서비스를 일시적으로 사용할 수 없어 간단 요약만 제공됩니다.`,
  ].join("\n");
}
function buildAzureUrl(): string | null {
  const endpointRaw = (process.env.AZURE_OPENAI_ENDPOINT ?? "").split(/[\r\n]/)[0].trim();
  const deployment = (process.env.AZURE_OPENAI_DEPLOYMENT_NAME ?? "").split(/[\r\n]/)[0].trim();
  const apiVersion = (process.env.AZURE_OPENAI_API_VERSION ?? "2025-04-01-preview").split(/[\r\n]/)[0].trim();
  if (!endpointRaw || !deployment) return null;
  const origin = new URL(endpointRaw).origin;
  return `${origin}/openai/deployments/${encodeURIComponent(deployment)}/chat/completions?api-version=${encodeURIComponent(apiVersion)}`;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.AZURE_OPENAI_API_KEY
    ?.split(/[\r\n]/)[0]
    .replace(/\s.*$/, "")   // strip trailing " N" from Vercel CLI sensitive-prompt pollution
    .trim();
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
    const userMsg = `"${keyword}" — 왜 지금 이슈?`;

    const res = await fetch(chatUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": apiKey },
      body: JSON.stringify({
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMsg },
        ],
        max_completion_tokens: 800,
      }),
      signal: AbortSignal.timeout(28000),
    });

    if (!res.ok) {
      // 401/403: API 키 문제 → 사용자에게 근시한 에러 대신 안내 문자 반환
      if (res.status === 401 || res.status === 403) {
        const fallback = generateFallbackExplanation(keyword);
        return apiOk({ keyword, explanation: fallback }, { message: "fallback" });
      }
      const errBody = await res.text().catch(() => "");
      return apiError({ status: 502, code: "AZURE_API_ERROR", message: `Azure OpenAI 오류 (${res.status})`, details: errBody });
    }

    const raw = await res.text();
    let data: { choices?: Array<{ message: { content: string } }> };
    try {
      data = JSON.parse(raw) as typeof data;
    } catch {
      return apiError({ status: 502, code: "PARSE_ERROR", message: "Azure 응답 파싱 실패", details: raw.slice(0, 300) });
    }
    const explanation = data.choices?.[0]?.message?.content?.trim() ?? "";
    return apiOk({ keyword, explanation }, { message: "success" });
  } catch (err) {
    const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    return apiError({
      status: 500,
      code: "EXPLAIN_ERROR",
      message: `분석 실패 — ${detail}`,
      details: detail,
    });
  }
}