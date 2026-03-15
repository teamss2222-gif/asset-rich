import * as cheerio from "cheerio";
import { getPool } from "./db";

/* ══════════════════════════════════════════
   카드고릴라 크롤러 – 카드 혜택 수집
   ══════════════════════════════════════════ */

export interface CardData {
  gorilla_id: number;
  name: string;
  company: string;
  annual_fee: string;
  min_spending: string;
  brand: string;
  image_url: string;
  benefits: CardBenefit[];
  crawled_at: string;
}

export interface CardBenefit {
  category: string;
  summary: string;
}

/* ── 폴백용 하드코딩 ID (사이트 접근 실패 시 사용) ── */
const FALLBACK_CARD_IDS = [
  13, 39, 51, 106, 466, 608, 716,
  2261, 2330, 2441, 2609, 2646, 2687,
  2759, 2835, 2928, 2749,
];

export function getPopularCardIds() {
  return FALLBACK_CARD_IDS;
}

/* ── 카드고릴라 목록 페이지에서 카드 ID 동적 수집 ── */
// 카드고릴라의 카드 전체 목록, 회사별 목록, 인기 목록 등 여러 경로를 탐색해
// /card/detail/{id} 패턴의 링크에서 ID를 추출합니다.
export async function fetchCardIdsFromSite(options?: {
  maxPages?: number;  // 페이지당 목록 페이지 최대 수 (기본 15)
  delayMs?: number;   // 요청 간격 ms (기본 800)
}): Promise<{ ids: number[]; source: string }> {
  const maxPages = options?.maxPages ?? 15;
  const delayMs  = options?.delayMs  ?? 800;

  const idSet = new Set<number>();

  const HEADERS = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ko-KR,ko;q=0.9",
    Referer: "https://www.card-gorilla.com/",
  };

  // 카드고릴라의 카드 목록 URL 패턴들
  // /card/list?filt=POPULARITY  (인기순)
  // /card/list?filt=ANNUALFEE   (연회비순)
  // /card/all                   (전체)
  const LIST_URLS = [
    "https://www.card-gorilla.com/card/list?filt=POPULARITY",
    "https://www.card-gorilla.com/card/list?filt=RECOMMAND",
    "https://www.card-gorilla.com/card/list?filt=ANNUALFEE",
    "https://www.card-gorilla.com/card/all",
  ];

  // 카드사별 목록 (카드고릴라 corp 코드)
  // BC=3, 국민=4, 신한=6, 우리=7, 현대=9, 롯데=11, 삼성=14, 하나=16
  const CORP_IDS = [3, 4, 6, 7, 9, 11, 14, 16];
  for (const corp of CORP_IDS) {
    LIST_URLS.push(`https://www.card-gorilla.com/card/list?corp=${corp}`);
  }

  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  const scrapeUrl = async (url: string): Promise<number[]> => {
    const found: number[] = [];
    try {
      const res = await fetch(url, { headers: HEADERS });
      if (!res.ok) return found;
      const html = await res.text();
      // /card/detail/숫자 패턴 추출
      const matches = html.matchAll(/\/card\/detail\/(\d+)/g);
      for (const m of matches) {
        const id = parseInt(m[1], 10);
        if (id > 0) found.push(id);
      }
    } catch { /* ignore */ }
    return found;
  };

  // 1단계: 목록 페이지 1페이지씩 스크래핑
  for (const baseUrl of LIST_URLS) {
    // 1페이지 (기본)
    const ids = await scrapeUrl(baseUrl);
    ids.forEach(id => idSet.add(id));
    await sleep(delayMs);

    // 페이지네이션 (page=2~maxPages)
    for (let p = 2; p <= maxPages; p++) {
      const sep = baseUrl.includes("?") ? "&" : "?";
      const pageUrl = `${baseUrl}${sep}page=${p}`;
      const pageIds = await scrapeUrl(pageUrl);
      if (pageIds.length === 0) break; // 더 이상 카드 없음
      pageIds.forEach(id => idSet.add(id));
      await sleep(delayMs);
    }
  }

  // 2단계: 결과가 너무 적으면 폴백
  if (idSet.size < FALLBACK_CARD_IDS.length) {
    FALLBACK_CARD_IDS.forEach(id => idSet.add(id));
    return {
      ids: Array.from(idSet).sort((a, b) => a - b),
      source: idSet.size === FALLBACK_CARD_IDS.length ? "fallback" : "mixed",
    };
  }

  return {
    ids: Array.from(idSet).sort((a, b) => a - b),
    source: "live",
  };
}

/* ── 단일 카드 크롤링 ── */
export async function crawlCard(cardId: number): Promise<CardData | null> {
  const url = `https://www.card-gorilla.com/card/detail/${cardId}`;

  const HEADERS = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    Referer: "https://www.card-gorilla.com/",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
  };

  try {
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) return null;
    const html = await res.text();
    // 최소 1KB 미만이면 차단된 것으로 판단
    if (html.length < 1000) return null;
    return parseCardDetail(cardId, html);
  } catch {
    return null;
  }
}

/* ── HTML 파싱 (다중 전략) ── */
function parseCardDetail(cardId: number, html: string): CardData | null {
  const $ = cheerio.load(html);

  // ── 전략 1: Nuxt 3 SSR payload (__NUXT_DATA__ 또는 window.__NUXT__) ──
  let nuxtCard: Partial<CardData> | null = null;
  try {
    // Nuxt 3: <script id="__NUXT_DATA__" type="application/json">
    const nuxtEl = $("script#__NUXT_DATA__").html();
    if (nuxtEl) {
      const arr: unknown[] = JSON.parse(nuxtEl);
      // 배열에서 카드명 패턴 탐색 (한글 포함, 길이 2~50)
      const cardName = arr.find(
        (v): v is string =>
          typeof v === "string" &&
          /[가-힣]/.test(v) &&
          v.length >= 2 &&
          v.length <= 60 &&
          !v.startsWith("http"),
      );
      if (cardName) nuxtCard = { name: cardName };
    }

    // Nuxt 2: window.__NUXT__={...}
    if (!nuxtCard) {
      const m = html.match(/window\.__NUXT__\s*=\s*(\{.+?\})\s*;?\s*<\/script>/s);
      if (m) {
        const state = JSON.parse(m[1]);
        const findStr = (o: unknown): string | null => {
          if (typeof o === "string" && /[가-힣카드]/.test(o) && o.length > 2 && o.length < 60) return o;
          if (typeof o === "object" && o) {
            for (const v of Object.values(o as Record<string, unknown>)) {
              const r = findStr(v);
              if (r) return r;
            }
          }
          return null;
        };
        const n = findStr(state);
        if (n) nuxtCard = { name: n };
      }
    }
  } catch { /* ignore */ }

  // ── 전략 2: JSON-LD ──
  let jsonLdName = "";
  let jsonLdDesc = "";
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const d = JSON.parse($(el).html() ?? "");
      if (d.name && typeof d.name === "string") jsonLdName = d.name;
      if (d.description) jsonLdDesc = String(d.description);
    } catch { /* ignore */ }
  });

  // ── 전략 3: OG meta ──
  const ogTitle = $('meta[property="og:title"]').attr("content") ?? "";
  const ogDesc  = $('meta[property="og:description"]').attr("content") ?? "";
  const ogImage = $('meta[property="og:image"]').attr("content") ?? "";

  // ── 전략 4: CSS 선택자 (카드고릴라 여러 버전) ──
  const selectorName =
    $(".card_top_detail .card_name").first().text().trim() ||
    $(".card_tit, .tit.card_name, .card-name, .card_nm").first().text().trim() ||
    $("h1.tit, h2.tit, h1.title, h2.title").first().text().trim() ||
    $("[class*='card_name'], [class*='cardName'], [class*='card-name']").first().text().trim();

  const selectorCompany =
    $(".card_top_detail .card_corp").text().trim() ||
    $(".corp_info .name, .corp_name, .card_corp, .issuer, [class*='corp']").first().text().trim();

  // ── 이름 최종 결정 ──
  let name =
    nuxtCard?.name ||
    jsonLdName ||
    // OG title에서 "| 카드고릴라" 제거
    (ogTitle.replace(/[ㄱ-힣]*카드고릴라.*$/i, "").replace(/\s*[-|]\s*$/, "").trim()) ||
    selectorName ||
    $("title").first().text().replace(/[ㄱ-힣]*카드고릴라.*/i, "").replace(/\s*[-|·]\s*$/, "").trim();

  if (!name || name.length < 2) return null;
  // OG title에 회사명 포함된 경우 분리 (예: "[신한카드] The Dream Cashback")
  let company = selectorCompany;
  if (!company) {
    const m = name.match(/^\[(.+?)\]/);
    if (m) { company = m[1]; name = name.replace(/^\[.+?\]\s*/, "").trim(); }
  }

  // ── 이미지 ──
  const imgSel =
    $(".card_top_detail img, .card_img img, .card-img img, [class*='card_img'] img, [class*='cardImg'] img").first().attr("src") ?? "";
  const image_url = imgSel || ogImage;

  // ── 연회비 / 전월실적 / 브랜드 ──
  let annual_fee = "";
  let min_spending = "";
  let brand = "";

  const infoTexts: string[] = [];
  $(".bnf2 li, .card_info li, .card-info li, .card_spec li, [class*='card_info'] li, [class*='cardInfo'] li").each((_, el) => {
    infoTexts.push($(el).text().trim());
  });
  if (infoTexts.length === 0 && ogDesc) infoTexts.push(ogDesc);
  if (infoTexts.length === 0 && jsonLdDesc) infoTexts.push(jsonLdDesc);

  for (const txt of infoTexts) {
    if (!annual_fee && (txt.includes("연회비") || txt.includes("연 회비")))
      annual_fee = txt.replace(/연\s?회비\s?[:：]?\s?/g, "").trim();
    if (!min_spending && txt.includes("전월실적"))
      min_spending = txt.replace(/전월실적\s?[:：]?\s?/g, "").trim();
    if (!brand && txt.includes("브랜드"))
      brand = txt.replace(/브랜드\s?[:：]?\s?/g, "").trim();
  }

  // ── 혜택 ──
  const benefits: CardBenefit[] = [];
  const seen = new Set<string>();

  const addBenefit = (cat: string, summary: string) => {
    const key = summary.slice(0, 40);
    if (summary.length > 2 && !seen.has(key)) {
      seen.add(key);
      benefits.push({ category: cat || "기타", summary });
    }
  };

  $(
    ".card_top_detail .lst li, .bnf1 li, " +
    ".lst.benefit_lst li, .benefit_area li, #benefitArea li, " +
    ".benefit_list li, .bnf_list li, " +
    "[class*='benefit'] li, [class*='bnf'] li",
  ).each((_, el) => {
    const cat     = $(el).find("b, strong, .tit, .cat, [class*='tit']").first().text().trim();
    const detail  = $(el).find("p, .txt, .desc, .content, [class*='desc']").first().text().trim();
    const summary = (detail || $(el).text().trim()).replace(cat, "").trim();
    addBenefit(cat, summary);
  });

  // OG description으로 기본 혜택 추가 (아무것도 없을 때)
  if (benefits.length === 0 && ogDesc) {
    ogDesc.split(/[.。\n]/).forEach(s => {
      const t = s.trim();
      if (t.length > 5) addBenefit("혜택", t);
    });
  }

  return {
    gorilla_id: cardId,
    name,
    company,
    annual_fee,
    min_spending,
    brand,
    image_url,
    benefits,
    crawled_at: new Date().toISOString(),
  };
}

/* ── DB 테이블 생성 ── */
export async function ensureCardTables() {
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cards (
      id            SERIAL PRIMARY KEY,
      gorilla_id    INTEGER UNIQUE NOT NULL,
      name          TEXT NOT NULL,
      company       TEXT DEFAULT '',
      annual_fee    TEXT DEFAULT '',
      min_spending  TEXT DEFAULT '',
      brand         TEXT DEFAULT '',
      image_url     TEXT DEFAULT '',
      crawled_at    TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS card_benefits (
      id        SERIAL PRIMARY KEY,
      card_id   INTEGER REFERENCES cards(id) ON DELETE CASCADE,
      category  TEXT DEFAULT '',
      summary   TEXT DEFAULT ''
    );
  `);
}

/* ── DB 저장 ── */
export async function saveCard(card: CardData) {
  await ensureCardTables();
  const pool = getPool();

  const res = await pool.query(
    `INSERT INTO cards (gorilla_id, name, company, annual_fee, min_spending, brand, image_url, crawled_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (gorilla_id) DO UPDATE SET
       name = EXCLUDED.name,
       company = EXCLUDED.company,
       annual_fee = EXCLUDED.annual_fee,
       min_spending = EXCLUDED.min_spending,
       brand = EXCLUDED.brand,
       image_url = EXCLUDED.image_url,
       crawled_at = EXCLUDED.crawled_at
     RETURNING id`,
    [card.gorilla_id, card.name, card.company, card.annual_fee, card.min_spending, card.brand, card.image_url, card.crawled_at],
  );

  const dbId = res.rows[0].id;

  await pool.query(`DELETE FROM card_benefits WHERE card_id = $1`, [dbId]);
  for (const b of card.benefits) {
    await pool.query(
      `INSERT INTO card_benefits (card_id, category, summary) VALUES ($1, $2, $3)`,
      [dbId, b.category, b.summary],
    );
  }

  return dbId;
}

/* ── 전체 크롤 (순차, rate limit 준수) ── */
export async function crawlAll(
  cardIds?: number[],
  delayMs = 1500,
  onProgress?: (done: number, total: number, card: string) => void,
) {
  const ids = cardIds ?? FALLBACK_CARD_IDS;
  const results: { id: number; name: string; ok: boolean }[] = [];

  for (let i = 0; i < ids.length; i++) {
    const card = await crawlCard(ids[i]);
    if (card) {
      await saveCard(card);
      results.push({ id: ids[i], name: card.name, ok: true });
      onProgress?.(i + 1, ids.length, card.name);
    } else {
      results.push({ id: ids[i], name: `(ID: ${ids[i]})`, ok: false });
      onProgress?.(i + 1, ids.length, `실패 (ID: ${ids[i]})`);
    }

    if (i < ids.length - 1) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  return results;
}

/* ── 저장된 카드 조회 ── */
export async function getSavedCards() {
  await ensureCardTables();
  const pool = getPool();
  const { rows: cards } = await pool.query(
    `SELECT * FROM cards ORDER BY gorilla_id`,
  );
  const { rows: benefits } = await pool.query(
    `SELECT cb.*, c.gorilla_id FROM card_benefits cb JOIN cards c ON cb.card_id = c.id ORDER BY cb.id`,
  );

  return cards.map((c: Record<string, unknown>) => ({
    ...c,
    benefits: benefits.filter((b: Record<string, unknown>) => b.gorilla_id === c.gorilla_id),
  }));
}
