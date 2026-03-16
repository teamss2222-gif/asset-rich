import { NextResponse } from "next/server";
import { apiOk, apiError } from "@/lib/api-response";
import { ensureAssetSnapshotsTable, getPool } from "@/lib/db";
import { readSession } from "@/lib/session";

export async function GET() {
  const username = await readSession();
  if (!username) {
    return NextResponse.json({ ok: false, message: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    await ensureAssetSnapshotsTable();
    const pool = getPool();

    const result = await pool.query<{
      snapshot_date: string;
      total_assets_manwon: number;
      total_loans_manwon: number;
      net_assets_manwon: number;
      category_breakdown: Record<string, number>;
    }>(
      `SELECT snapshot_date, total_assets_manwon, total_loans_manwon, net_assets_manwon, category_breakdown
       FROM asset_snapshots
       WHERE username = $1
       ORDER BY snapshot_date ASC
       LIMIT 24`,
      [username],
    );

    return apiOk(result.rows.map((row) => ({
      date: row.snapshot_date,
      totalAssets: Number(row.total_assets_manwon),
      totalLoans: Number(row.total_loans_manwon),
      netAssets: Number(row.net_assets_manwon),
      breakdown: row.category_breakdown,
    })));
  } catch (err) {
    return apiError({
      status: 500,
      code: "QUERY_ERROR",
      message: "이력 조회 실패",
      details: err instanceof Error ? err.message : String(err),
    });
  }
}
