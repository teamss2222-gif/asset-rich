import { apiError, apiOk } from "../../../../lib/api-response";

// GET /api/dict/translate?q=hello&dir=en|ko
// dir: "en|ko" (영→한) or "ko|en" (한→영)
// 주력: Azure OpenAI (이미 설정됨, 한국어 번역 품질 최고)
// 폴백: MyMemory (Azure 미설정 시)

function buildAzureUrl(): string | null {
  const apiKey = process.env.AZURE_OPENAI_API_KEY?.split(/[\r\n]/)[0].replace(/\s.*$/, "").trim();
  const ep = (process.env.AZURE_OPENAI_ENDPOINT ?? "").split(/[\r\n]/)[0].trim();
  const dep = (process.env.AZURE_OPENAI_DEPLOYMENT_NAME ?? "").split(/[\r\n]/)[0].trim();
  const ver = (process.env.AZURE_OPENAI_API_VERSION ?? "2025-04-01-preview").split(/[\r\n]/)[0].trim();
  if (!apiKey || !ep || !dep) return null;
  return `${new URL(ep).origin}/openai/deployments/${encodeURIComponent(dep)}/chat/completions?api-version=${encodeURIComponent(ver)}`;
}

async function translateWithAzure(q: string, isKoEn: boolean): Promise<{ translation: string; definitions?: string } | null> {
  const apiKey = process.env.AZURE_OPENAI_API_KEY?.split(/[\r\n]/)[0].replace(/\s.*$/, "").trim();
  const chatUrl = buildAzureUrl();
  if (!apiKey || !chatUrl) return null;

  const isWord = q.trim().split(/\s+/).length <= 3;
  const prompt = isKoEn
    ? isWord
      ? `한국어 단어 "${q}"를 영어로 번역하세요. 아래 JSON 형식으로만 출력하세요:\n{"translation":"영어 번역","definitions":"품사와 뜻풀이 1~2개 (영어로)"}`
      : `한국어 문장 "${q}"를 영어로 번역하세요. 아래 JSON 형식으로만 출력하세요:\n{"translation":"영어 번역"}`
    : isWord
      ? `영어 단어 "${q}"를 한국어로 번역하세요. 아래 JSON 형식으로만 출력하세요:\n{"translation":"한국어 번역","definitions":"품사와 뜻풀이 1~2개 (한국어로)"}`
      : `영어 문장 "${q}"를 한국어로 번역하세요. 아래 JSON 형식으로만 출력하세요:\n{"translation":"한국어 번역"}`;

  try {
    const res = await fetch(chatUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": apiKey },
      body: JSON.stringify({
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 300,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const data = await res.json() as { choices?: Array<{ message: { content: string } }> };
    const raw = data.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as { translation?: string; definitions?: string };
    if (!parsed.translation) return null;
    return { translation: parsed.translation, definitions: parsed.definitions };
  } catch {
    return null;
  }
}

async function translateWithMyMemory(q: string, dir: string): Promise<string> {
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(q)}&langpair=${dir}`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return "";
    const json = await res.json();
    return (json.responseData?.translatedText ?? "") as string;
  } catch {
    return "";
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim().slice(0, 200);
  const dir = searchParams.get("dir") ?? "en|ko";

  if (!q) return apiError({ status: 400, code: "BAD_REQUEST", message: "검색어를 입력하세요." });
  if (!["en|ko", "ko|en"].includes(dir)) {
    return apiError({ status: 400, code: "BAD_REQUEST", message: "dir은 en|ko 또는 ko|en 이어야 합니다." });
  }

  const isKoEn = dir === "ko|en";
  const hasAzure = !!buildAzureUrl();

  // 1순위: Azure OpenAI (정확도 최고, 한국어 관용어도 정확히 번역)
  let translation = "";
  let aiDefinitions = "";
  if (hasAzure) {
    const azureResult = await translateWithAzure(q, isKoEn);
    if (azureResult) {
      translation = azureResult.translation;
      aiDefinitions = azureResult.definitions ?? "";
    }
  }

  // 2순위 폴백: MyMemory (Azure 미설정 or 실패 시)
  if (!translation) {
    translation = await translateWithMyMemory(q, dir);
  }

  // 영어 단어 → Free Dictionary API로 발음/품사/예문 추가
  let definitions: unknown[] = [];
  if (!isKoEn && /^[a-zA-Z\s'-]+$/.test(q.trim())) {
    try {
      const defRes = await fetch(
        `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(q.trim().toLowerCase())}`,
        { next: { revalidate: 3600 } },
      );
      if (defRes.ok) definitions = await defRes.json();
    } catch { /* 무시 */ }
  }

  return apiOk({ q, dir, translation, aiDefinitions, definitions, source: hasAzure ? "azure" : "mymemory" });
}

