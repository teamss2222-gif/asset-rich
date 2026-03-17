import { apiError, apiOk } from "../../../../lib/api-response";

// GET /api/dict/translate?q=hello&dir=en|ko
// dir: "en|ko" (영→한) or "ko|en" (한→영)

// 번역 결과가 그냥 로마자 변환인지 감지 (예: "바보" → "Babo")
function isRomanization(original: string, translated: string): boolean {
  if (!translated) return false;
  // 영문자+공백만인데, 원문 발음과 비슷한 경우 (소문자 비교)
  const t = translated.trim().toLowerCase();
  const o = original.trim().toLowerCase();
  // 완전히 같거나, 원문 한글 제거 후 남은 것과 같으면 로마자
  if (t === o) return true;
  // 번역 결과가 영어 단어만으로 이루어졌는데 길이가 원문의 2배 이하이고
  // 원문에 한글이 있으면 의심
  const hasKorean = /[가-힣]/.test(original);
  const isOnlyRoman = /^[a-z\s'-]+$/.test(t);
  if (hasKorean && isOnlyRoman && t.length <= o.length * 3) {
    // 실제 영단어인지 확인: 공백 포함 1~2단어면 로마자 의심
    const words = t.split(/\s+/).filter(Boolean);
    if (words.length <= 2 && words.every((w) => w.length <= 10)) {
      // 흔한 영단어 패턴이 아니면 로마자로 판단
      const commonEndings = /(?:tion|ness|ment|ance|ence|ing|ful|less|ous|ive|ble|al|ly|er|or|ist|ism|ize|ate|ary|ory|ism)$/i;
      if (!commonEndings.test(t)) return true;
    }
  }
  return false;
}

// Azure OpenAI로 번역
async function translateWithAzure(q: string, isKoEn: boolean): Promise<string | null> {
  const apiKey = process.env.AZURE_OPENAI_API_KEY?.split(/[\r\n]/)[0].replace(/\s.*$/, "").trim();
  const endpointRaw = (process.env.AZURE_OPENAI_ENDPOINT ?? "").split(/[\r\n]/)[0].trim();
  const deployment = (process.env.AZURE_OPENAI_DEPLOYMENT_NAME ?? "").split(/[\r\n]/)[0].trim();
  const apiVersion = (process.env.AZURE_OPENAI_API_VERSION ?? "2025-04-01-preview").split(/[\r\n]/)[0].trim();
  if (!apiKey || !endpointRaw || !deployment) return null;

  const origin = new URL(endpointRaw).origin;
  const url = `${origin}/openai/deployments/${encodeURIComponent(deployment)}/chat/completions?api-version=${encodeURIComponent(apiVersion)}`;

  const prompt = isKoEn
    ? `다음 한국어 단어/문장을 영어로 번역하세요. 번역 결과만 출력하고 설명은 쓰지 마세요.\n\n"${q}"`
    : `다음 영어 단어/문장을 한국어로 번역하세요. 번역 결과만 출력하고 설명은 쓰지 마세요.\n\n"${q}"`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": apiKey },
      body: JSON.stringify({
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 200,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = await res.json() as { choices?: Array<{ message: { content: string } }> };
    return data.choices?.[0]?.message?.content?.trim() ?? null;
  } catch {
    return null;
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

  // MyMemory 번역 API (무료, CORS 허용)
  let translation = "";
  let matches: { translation: string; quality: number; subject: string; usage_count: number }[] = [];

  try {
    const translationUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(q)}&langpair=${dir}`;
    const transRes = await fetch(translationUrl, {
      headers: { "Accept": "application/json" },
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(5000),
    });
    if (transRes.ok) {
      const transJson = await transRes.json();
      translation = transJson.responseData?.translatedText ?? "";
      matches = (transJson.matches ?? []).slice(0, 5);
    }
  } catch { /* 폴백 */ }

  // 한→영 번역 시 로마자 반환이면 Azure OpenAI로 재시도
  if (isKoEn && isRomanization(q, translation)) {
    const azureTranslation = await translateWithAzure(q, true);
    if (azureTranslation) translation = azureTranslation;
  }

  // 영→한 번역이 비어있거나 이상하면 Azure로 보완
  if (!isKoEn && (!translation || translation === q)) {
    const azureTranslation = await translateWithAzure(q, false);
    if (azureTranslation) translation = azureTranslation;
  }

  // 영어 단어일 때 Free Dictionary API로 상세 정의 추가
  let definitions: unknown[] = [];
  if (dir === "en|ko" && /^[a-zA-Z\s'-]+$/.test(q.trim())) {
    try {
      const defRes = await fetch(
        `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(q.trim().toLowerCase())}`,
        { next: { revalidate: 3600 } },
      );
      if (defRes.ok) {
        definitions = await defRes.json();
      }
    } catch { /* 정의 없으면 무시 */ }
  }

  return apiOk({ q, dir, translation, matches, definitions });
}

