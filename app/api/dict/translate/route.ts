import { apiError, apiOk } from "../../../../lib/api-response";

// GET /api/dict/translate?q=hello&dir=en|ko
// dir: "en|ko" (영→한) or "ko|en" (한→영)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim().slice(0, 200);
  const dir = searchParams.get("dir") ?? "en|ko";

  if (!q) return apiError({ status: 400, code: "BAD_REQUEST", message: "검색어를 입력하세요." });
  if (!["en|ko", "ko|en"].includes(dir)) {
    return apiError({ status: 400, code: "BAD_REQUEST", message: "dir은 en|ko 또는 ko|en 이어야 합니다." });
  }

  // MyMemory 번역 API (무료, CORS 허용)
  const translationUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(q)}&langpair=${dir}`;
  const transRes = await fetch(translationUrl, {
    headers: { "Accept": "application/json" },
    next: { revalidate: 3600 },
  });

  if (!transRes.ok) {
    return apiError({ status: 502, code: "UPSTREAM_ERROR", message: "번역 서비스에 일시적인 오류가 발생했습니다." });
  }

  const transJson = await transRes.json();
  const translation: string = transJson.responseData?.translatedText ?? "";
  const matches: { translation: string; quality: number; subject: string; usage_count: number }[] =
    (transJson.matches ?? []).slice(0, 5);

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
    } catch {
      // 정의 없으면 무시
    }
  }

  return apiOk({ q, dir, translation, matches, definitions });
}
