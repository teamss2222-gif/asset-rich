import { load } from "cheerio";
import { getPool, ensureIssuesTable } from "./db";

// ──────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────

export type SourceRanks = {
  google?: number;
  youtube?: number;
  naver?: number;
  ai?: number;
};

export type GenderWeights = { male: number; female: number };

export type AgeWeights = {
  "10": number;
  "20": number;
  "30": number;
  "40": number;
  "50": number;
  "60": number;
};

export type IssueRecord = {
  id: number;
  rank: number;
  keyword: string;
  sourceRanks: SourceRanks;
  score: number;
  genderWeights: GenderWeights;
  ageWeights: AgeWeights;
  meta: {
    traffic?: string;
    videoId?: string;
    thumbnail?: string;
  };
  collectedAt: string;
};

type RawItem = {
  keyword: string;
  googleRank?: number;
  youtubeRank?: number;
  naverRank?: number;
  meta?: Record<string, string | undefined>;
};

// ──────────────────────────────────────────────────
// Data Sources
// ──────────────────────────────────────────────────

async function fetchGoogleTrends(): Promise<RawItem[]> {
  try {
    const res = await fetch(
      "https://trends.google.com/trends/trendingsearches/daily/rss?geo=KR",
      {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; AssetLabBot/1.0)" },
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!res.ok) return [];

    const xml = await res.text();
    const $ = load(xml, { xmlMode: true });
    const items: RawItem[] = [];

    $("item").each((i, el) => {
      const keyword = $(el).find("title").first().text().trim();
      const traffic = $(el).find("ht\\:approx_traffic").text().trim();
      if (keyword) {
        items.push({ keyword, googleRank: i + 1, meta: { traffic } });
      }
    });

    return items.slice(0, 20);
  } catch {
    return [];
  }
}

async function fetchYoutubeTrending(): Promise<RawItem[]> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return [];

  try {
    const url = new URL("https://www.googleapis.com/youtube/v3/videos");
    url.searchParams.set("part", "snippet");
    url.searchParams.set("chart", "mostPopular");
    url.searchParams.set("regionCode", "KR");
    url.searchParams.set("maxResults", "20");
    url.searchParams.set("key", apiKey);

    const res = await fetch(url.toString(), {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];

    const data = await res.json() as {
      items?: Array<{
        id: string;
        snippet: {
          title: string;
          thumbnails: { medium: { url: string } };
        };
      }>;
    };

    return (data.items ?? []).map((item, i) => ({
      keyword: item.snippet.title,
      youtubeRank: i + 1,
      meta: {
        videoId: item.id,
        thumbnail: item.snippet.thumbnails?.medium?.url,
      },
    }));
  } catch {
    return [];
  }
}

// 네이버 모의 데이터: 15분 단위 시드로 변화하여 실시간감 부여
const NAVER_POOL = [
  "이재명", "윤석열", "한동훈", "지민", "손흥민",
  "국민연금", "코스피", "비트코인", "아이폰 17", "갤럭시 S25",
  "봄 여행지", "벚꽃 명소", "황사 마스크", "전세사기 대책", "금투세",
  "수능 일정", "의대 정원", "대학입시", "청년 주택", "최저임금",
  "롯데자이언츠", "KBS 드라마", "넷플릭스 신작", "카카오뱅크", "SK하이닉스",
  "환율 급등", "미중 무역전쟁", "AI 규제", "챗GPT 업데이트", "테슬라 주가",
  "엔비디아 실적", "삼성전자 배당", "프로야구 개막", "K리그", "올림픽 대표",
  "무신사 할인", "쿠팡 프레시", "배달의민족 이슈", "야놀자 특가", "여행 트렌드",
  "부동산 규제", "청약 당첨", "아파트 분양", "전월세 전환", "대출 금리",
];

function simpleHash(str: string | number): number {
  const s = String(str);
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function generateNaverMock(): RawItem[] {
  const seed = Math.floor(Date.now() / (15 * 60 * 1000));
  const shuffled = [...NAVER_POOL].sort(
    (a, b) => simpleHash(a + seed) - simpleHash(b + seed),
  );
  return shuffled.slice(0, 20).map((keyword, i) => ({
    keyword,
    naverRank: i + 1,
  }));
}

// ──────────────────────────────────────────────────
// Azure OpenAI 이슈 생성
// ──────────────────────────────────────────────────

type AIIssueItem = {
  keyword: string;
  genderWeights: GenderWeights;
  ageWeights: AgeWeights;
  meta: IssueRecord["meta"];
};

async function fetchAzureOpenAIIssues(): Promise<AIIssueItem[] | null> {
  const apiKey = process.env.AZURE_OPENAI_API_KEY?.trim();
  const endpointRaw = (process.env.AZURE_OPENAI_ENDPOINT ?? "").trim();
  const deployment = (process.env.AZURE_OPENAI_DEPLOYMENT_NAME ?? "").trim();
  const apiVersion = (process.env.AZURE_OPENAI_API_VERSION ?? "2025-04-01-preview").trim();

  if (!apiKey || !endpointRaw || !deployment) return null;

  try {
    const origin = new URL(endpointRaw).origin;
    const url = `${origin}/openai/deployments/${encodeURIComponent(deployment)}/chat/completions?api-version=${encodeURIComponent(apiVersion)}`;

    const now = new Date().toLocaleDateString("ko-KR", {
      year: "numeric", month: "long", day: "numeric", weekday: "long",
    });

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify({
        messages: [
          {
            role: "system",
            content: `당신은 대한민국 실시간 트렌드 전문 분석가입니다. 오늘은 ${now}입니다. 현재 한국에서 가장 많이 검색되는 키워드 TOP 20을 생성하세요. 시사, 연예, 스포츠, 경제, 정치, 사회, 문화 등 다양한 분야를 포함하세요. 현재 계절과 최신 사회적 이슈를 반영하세요.`,
          },
          {
            role: "user",
            content: `한국 실시간 검색어 TOP 20을 아래 JSON 형식으로만 반환하세요. 마크다운 없이 순수 JSON만 출력:
{"items":[{"keyword":"키워드","reason":"짧은 이유","male":0.5,"female":0.5,"a10":0.15,"a20":0.25,"a30":0.25,"a40":0.20,"a50":0.10,"a60":0.05}]}
조건: male+female=1.0, a10+a20+a30+a40+a50+a60=1.0. 리스트 수: 정확히 20개.`,
          },
        ],
        max_tokens: 2000,
        temperature: 0.85,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(9000),
    });

    if (!res.ok) {
      console.error("[AzureOpenAI] issue fetch failed:", res.status, await res.text().catch(() => ""));
      return null;
    }

    const data = await res.json() as { choices?: Array<{ message: { content: string } }> };
    const content = data.choices?.[0]?.message?.content ?? "";

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      const match = content.match(/\[\s*\{[\s\S]*\}\s*\]/);
      if (!match) return null;
      parsed = JSON.parse(match[0]);
    }

    const arr: unknown[] = Array.isArray(parsed)
      ? parsed
      : (parsed as Record<string, unknown>)?.items as unknown[] ?? [];

    if (!Array.isArray(arr) || arr.length < 5) return null;

    return arr.slice(0, 20).map((item) => {
      const it = item as Record<string, number | string>;
      const male = Math.min(1, Math.max(0, Number(it.male ?? 0.5)));
      const female = parseFloat((1 - male).toFixed(3));
      const a10 = Number(it.a10 ?? 0.15);
      const a20 = Number(it.a20 ?? 0.25);
      const a30 = Number(it.a30 ?? 0.25);
      const a40 = Number(it.a40 ?? 0.20);
      const a50 = Number(it.a50 ?? 0.10);
      const a60 = parseFloat((1 - a10 - a20 - a30 - a40 - a50).toFixed(3));
      return {
        keyword: String(it.keyword ?? "").trim(),
        genderWeights: { male, female },
        ageWeights: { "10": a10, "20": a20, "30": a30, "40": a40, "50": a50, "60": Math.max(0.01, a60) },
        meta: it.reason ? { traffic: String(it.reason) } : {},
      } satisfies AIIssueItem;
    }).filter((it) => it.keyword.length > 0);
  } catch (e) {
    console.error("[AzureOpenAI] fetchAzureOpenAIIssues error:", e);
    return null;
  }
}

// ──────────────────────────────────────────────────
// Ranking & Demographic Weights
// ──────────────────────────────────────────────────

function assignDemographicWeights(keyword: string): {
  genderWeights: GenderWeights;
  ageWeights: AgeWeights;
} {
  const k = keyword;
  const maleRe = /축구|야구|농구|배구|게임|주식|코인|군대|스포츠|격투|감독|총선|대선|손흥민|류현진|병역|전쟁|무기|배틀|자동차|모터|NASCAR/;
  const femaleRe = /뷰티|드라마|메이크업|다이어트|육아|임신|아이돌|걸그룹|트와이스|블랙핑크|에스파|패션|화장|코디|쇼핑|무신사|스킨케어/;

  let male = 0.5;
  let female = 0.5;
  if (maleRe.test(k)) { male = 0.72; female = 0.28; }
  else if (femaleRe.test(k)) { male = 0.28; female = 0.72; }

  const youngRe = /아이돌|게임|유튜브|틱톡|웹툰|입시|수능|학교|대학|포켓몬|하이브|SM엔터|JYP/;
  const midRe = /부동산|주식|결혼|육아|직장|회사|연봉|청약|아파트|전세|월세|대출/;
  const olderRe = /연금|노후|건강보험|정치|국회|대통령|노인|복지|의료|치매|고령/;

  let ages: AgeWeights;
  if (youngRe.test(k)) {
    ages = { "10": 0.30, "20": 0.33, "30": 0.20, "40": 0.11, "50": 0.04, "60": 0.02 };
  } else if (midRe.test(k)) {
    ages = { "10": 0.04, "20": 0.14, "30": 0.30, "40": 0.30, "50": 0.17, "60": 0.05 };
  } else if (olderRe.test(k)) {
    ages = { "10": 0.03, "20": 0.07, "30": 0.15, "40": 0.23, "50": 0.26, "60": 0.26 };
  } else {
    const b = simpleHash(keyword) % 100;
    ages = {
      "10": parseFloat((0.08 + (b % 5) * 0.012).toFixed(3)),
      "20": parseFloat((0.18 + (b % 7) * 0.011).toFixed(3)),
      "30": parseFloat((0.25 + (b % 4) * 0.009).toFixed(3)),
      "40": parseFloat((0.24 + (b % 3) * 0.008).toFixed(3)),
      "50": parseFloat((0.15 + (b % 4) * 0.008).toFixed(3)),
      "60": parseFloat((0.10 - (b % 3) * 0.007).toFixed(3)),
    };
  }

  return { genderWeights: { male, female }, ageWeights: ages };
}

export function computeRanking(
  google: RawItem[],
  youtube: RawItem[],
  naver: RawItem[],
): Omit<IssueRecord, "id" | "collectedAt">[] {
  const scoreMap = new Map<string, {
    googleRank?: number;
    youtubeRank?: number;
    naverRank?: number;
    meta: Record<string, string | undefined>;
    score: number;
  }>();

  const addScore = (
    items: RawItem[],
    weight: number,
    rankKey: "googleRank" | "youtubeRank" | "naverRank",
  ) => {
    items.forEach((item) => {
      const existing = scoreMap.get(item.keyword) ?? { meta: {}, score: 0 };
      const rankScore = (21 - (item[rankKey] ?? 21)) * weight;
      scoreMap.set(item.keyword, {
        ...existing,
        [rankKey]: item[rankKey],
        meta: { ...existing.meta, ...(item.meta ?? {}) },
        score: existing.score + rankScore,
      });
    });
  };

  addScore(google, 0.40, "googleRank");
  addScore(youtube, 0.35, "youtubeRank");
  addScore(naver, 0.25, "naverRank");

  const sorted = [...scoreMap.entries()]
    .sort(([, a], [, b]) => b.score - a.score)
    .slice(0, 20);

  return sorted.map(([keyword, data], idx) => {
    const { genderWeights, ageWeights } = assignDemographicWeights(keyword);
    return {
      rank: idx + 1,
      keyword,
      sourceRanks: {
        google: data.googleRank,
        youtube: data.youtubeRank,
        naver: data.naverRank,
      },
      score: parseFloat(data.score.toFixed(4)),
      genderWeights,
      ageWeights,
      meta: data.meta,
    };
  });
}

export function filterIssues(
  issues: IssueRecord[],
  gender?: string,
  age?: string,
): IssueRecord[] {
  if (!gender && !age) return issues;

  const scored = issues.map((issue) => {
    let multiplier = 1;
    if (gender === "male") multiplier *= issue.genderWeights.male * 2;
    else if (gender === "female") multiplier *= issue.genderWeights.female * 2;
    if (age) {
      const aw = issue.ageWeights[age as keyof AgeWeights] ?? 0.1;
      multiplier *= aw * 10;
    }
    return { ...issue, filteredScore: issue.score * multiplier };
  });

  return scored
    .sort((a, b) => b.filteredScore - a.filteredScore)
    .map((issue, idx) => ({ ...issue, rank: idx + 1 }));
}

// ──────────────────────────────────────────────────
// DB Operations
// ──────────────────────────────────────────────────

export async function saveIssues(
  issues: Omit<IssueRecord, "id" | "collectedAt">[],
): Promise<void> {
  if (issues.length === 0) return;

  const pool = getPool();
  const now = new Date();

  // 기존 데이터 전부 삭제 후 단일 bulk INSERT (루프 20회 → 쿼리 2회)
  const placeholders = issues
    .map((_, i) => {
      const b = i * 8;
      return `($${b + 1}, $${b + 2}, $${b + 3}::jsonb, $${b + 4}, $${b + 5}::jsonb, $${b + 6}::jsonb, $${b + 7}::jsonb, $${b + 8})`;
    })
    .join(", ");

  const values = issues.flatMap((issue) => [
    issue.rank,
    issue.keyword,
    JSON.stringify(issue.sourceRanks),
    issue.score,
    JSON.stringify(issue.genderWeights),
    JSON.stringify(issue.ageWeights),
    JSON.stringify(issue.meta),
    now,
  ]);

  await pool.query(`DELETE FROM realtime_issues`);
  await pool.query(
    `INSERT INTO realtime_issues
       (rank, keyword, source_ranks, score, gender_weights, age_weights, meta, collected_at)
     VALUES ${placeholders}`,
    values,
  );
}

export async function getLatestIssues(): Promise<IssueRecord[]> {
  const pool = getPool();

  const res = await pool.query<{
    id: number;
    rank: number;
    keyword: string;
    source_ranks: SourceRanks;
    score: string;
    gender_weights: GenderWeights;
    age_weights: AgeWeights;
    meta: IssueRecord["meta"];
    collected_at: Date;
  }>(
    `SELECT id, rank, keyword, source_ranks, score, gender_weights, age_weights, meta, collected_at
     FROM realtime_issues
     ORDER BY rank ASC
     LIMIT 20`,
  );

  return res.rows.map((row) => ({
    id: row.id,
    rank: row.rank,
    keyword: row.keyword,
    sourceRanks: row.source_ranks,
    score: parseFloat(row.score as unknown as string),
    genderWeights: row.gender_weights,
    ageWeights: row.age_weights,
    meta: row.meta,
    collectedAt: row.collected_at.toISOString(),
  }));
}

export async function collectAndSave(): Promise<{
  count: number;
  sources: string[];
}> {
  await ensureIssuesTable();

  // Azure OpenAI 우선 시도
  const aiItems = await fetchAzureOpenAIIssues();
  if (aiItems && aiItems.length >= 5) {
    const ranked = aiItems.map((item, idx) => ({
      rank: idx + 1,
      keyword: item.keyword,
      sourceRanks: { ai: idx + 1 } as SourceRanks,
      score: parseFloat(((20 - idx) / 20).toFixed(4)),
      genderWeights: item.genderWeights,
      ageWeights: item.ageWeights,
      meta: item.meta,
    }));
    await saveIssues(ranked);
    return { count: ranked.length, sources: ["ai"] };
  }

  // 폴댐: 스크래핑
  const [google, youtube] = await Promise.all([
    fetchGoogleTrends(),
    fetchYoutubeTrending(),
  ]);
  const naver = generateNaverMock();

  const sources: string[] = ["naver"];
  if (google.length > 0) sources.unshift("google");
  if (youtube.length > 0) sources.push("youtube");

  const ranked = computeRanking(google, youtube, naver);
  if (ranked.length === 0) return { count: 0, sources };

  await saveIssues(ranked);
  return { count: ranked.length, sources };
}
