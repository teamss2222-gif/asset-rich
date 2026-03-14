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

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "ko-KR,ko;q=0.9",
      },
    });

    if (!res.ok) return null;

    const html = await res.text();
    return parseCardDetail(cardId, html);
  } catch {
    return null;
  }
}

/* ── HTML 파싱 ── */
function parseCardDetail(cardId: number, html: string): CardData | null {
  const $ = cheerio.load(html);

  const nameEl = $(".card_top_detail .card_name");
  const name = nameEl.length > 0
    ? nameEl.first().text().trim()
    : $("h1").first().text().trim() || $(".tit").first().text().trim();

  if (!name) return null;

  const company = $(".card_top_detail .card_corp").text().trim()
    || $(".corp_name").text().trim()
    || "";

  const imgEl = $(".card_top_detail img, .card_img img").first();
  const image_url = imgEl.attr("src") || "";

  let annual_fee = "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  $(".bnf2 li, .card_info li").each((_: number, el: any) => {
    const txt = $(el).text();
    if (txt.includes("연회비")) {
      annual_fee = txt.replace("연회비", "").trim();
    }
  });

  let min_spending = "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  $(".bnf2 li, .card_info li").each((_: number, el: any) => {
    const txt = $(el).text();
    if (txt.includes("전월실적")) {
      min_spending = txt.replace("전월실적", "").trim();
    }
  });

  let brand = "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  $(".bnf2 li, .card_info li").each((_: number, el: any) => {
    const txt = $(el).text();
    if (txt.includes("브랜드")) {
      brand = txt.replace("브랜드", "").trim();
    }
  });

  const benefits: CardBenefit[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  $(".card_top_detail .lst li, .bnf1 li").each((_: number, el: any) => {
    const cat = $(el).find("b, strong").first().text().trim();
    const summary = $(el).text().trim();
    if (summary) {
      benefits.push({ category: cat || "기타", summary: summary.replace(cat, "").trim() });
    }
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  $(".lst.benefit_lst li, .benefit_area li, #benefitArea li").each((_: number, el: any) => {
    const cat = $(el).find("b, strong, .tit").first().text().trim();
    const detail = $(el).find("p, .txt, .desc").first().text().trim();
    const summary = detail || $(el).text().trim();
    if (summary && !benefits.some((b) => b.summary === summary.replace(cat, "").trim())) {
      benefits.push({ category: cat || "기타", summary: summary.replace(cat, "").trim() });
    }
  });

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
