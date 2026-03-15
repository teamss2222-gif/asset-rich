import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api-response";
import { getSavedCards, saveCard, ensureCardTables } from "@/lib/card-crawler";
import { getPool } from "@/lib/db";

// GET — 저장된 카드 목록 조회
export async function GET() {
  try {
    const cards = await getSavedCards();
    return apiOk(cards, { message: `카드 ${cards.length}건 조회` });
  } catch (err) {
    return apiError({
      status: 500,
      code: "QUERY_ERROR",
      message: "카드 목록 조회 실패",
      details: err instanceof Error ? err.message : String(err),
    });
  }
}

// POST — 카드 수동 입력
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as {
      name?: string;
      company?: string;
      annual_fee?: string;
      min_spending?: string;
      brand?: string;
      image_url?: string;
      benefits?: { category: string; summary: string }[];
    };

    const name = String(body.name ?? "").trim();
    if (!name) return apiError({ status: 400, code: "BAD_REQUEST", message: "카드명이 필요합니다." });

    await ensureCardTables();
    const pool = getPool();

    // 수동 입력은 gorilla_id를 음수 자동 생성 (충돌 방지)
    const seqRes = await pool.query<{ mn: number }>(`SELECT COALESCE(MIN(gorilla_id), 0) - 1 AS mn FROM cards WHERE gorilla_id < 0`);
    const gorillaId = seqRes.rows[0].mn;

    await saveCard({
      gorilla_id: gorillaId,
      name,
      company: String(body.company ?? "").trim(),
      annual_fee: String(body.annual_fee ?? "").trim(),
      min_spending: String(body.min_spending ?? "").trim(),
      brand: String(body.brand ?? "").trim(),
      image_url: String(body.image_url ?? "").trim(),
      benefits: Array.isArray(body.benefits) ? body.benefits : [],
      crawled_at: new Date().toISOString(),
    });

    const cards = await getSavedCards();
    const saved = cards.find(c => (c as { gorilla_id: number }).gorilla_id === gorillaId);
    return apiOk(saved ?? {}, { message: "카드 저장 완료" });
  } catch (err) {
    return apiError({
      status: 500,
      code: "SAVE_ERROR",
      message: "카드 저장 실패",
      details: err instanceof Error ? err.message : String(err),
    });
  }
}

// DELETE — 카드 삭제 (?id=gorilla_id)
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const gorillaId = Number(searchParams.get("id"));
    if (!gorillaId) return apiError({ status: 400, code: "BAD_REQUEST", message: "id 필요" });

    await ensureCardTables();
    const pool = getPool();
    await pool.query(`DELETE FROM cards WHERE gorilla_id = $1`, [gorillaId]);
    return apiOk({ ok: true });
  } catch (err) {
    return apiError({ status: 500, code: "DELETE_ERROR", message: "삭제 실패", details: String(err) });
  }
}
