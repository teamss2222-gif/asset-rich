import { apiError, apiOk } from "../../../lib/api-response";
import {
  ASSET_CATEGORIES,
  REAL_ESTATE_SUBTYPES,
  buildDefaultLabel,
  toLegacyEntries,
  getEffectiveAssetAmountManwon,
  getLinkedLoanAmountManwon,
  type AssetCategoryKey,
  type AssetExtraData,
  type AssetEntry,
  type AssetSubtypeKey,
} from "../../../lib/assets";
import { ensureAssetEntriesTable, ensureAssetHoldingsTable, ensureAssetSnapshotsTable, getPool } from "../../../lib/db";
import { readSession } from "../../../lib/session";

type AssetsBody = {
  entries?: Array<{
    id?: string;
    categoryKey?: AssetCategoryKey;
    subtypeKey?: AssetSubtypeKey;
    label?: string;
    amountManwon?: number;
    sortOrder?: number;
    extraData?: AssetExtraData;
  }>;
};

type AssetEntryRow = {
  id: number;
  category_key: AssetCategoryKey;
  subtype_key: AssetSubtypeKey;
  label: string;
  amount_manwon: number;
  extra_data: AssetExtraData;
  sort_order: number;
};

async function loadEntries(username: string) {
  await ensureAssetEntriesTable();

  const pool = getPool();
  const result = await pool.query<AssetEntryRow>(
    `
      SELECT id, category_key, subtype_key, label, amount_manwon, extra_data, sort_order
      FROM asset_entries
      WHERE username = $1
      ORDER BY category_key, sort_order, id
    `,
    [username],
  );

  if (result.rowCount && result.rowCount > 0) {
    return result.rows.map((row) => ({
      id: String(row.id),
      categoryKey: row.category_key,
      subtypeKey: row.subtype_key,
      label: row.label,
      amountManwon: Number(row.amount_manwon),
      extraData: row.extra_data ?? {},
      sortOrder: row.sort_order,
    })) satisfies AssetEntry[];
  }

  await ensureAssetHoldingsTable();
  const legacy = await pool.query<{ category_key: string; amount: string }>(
    "SELECT category_key, amount FROM asset_holdings WHERE username = $1",
    [username],
  );

  return toLegacyEntries(legacy.rows);
}

export async function GET() {
  const username = await readSession();
  if (!username) {
    return apiError({ status: 401, code: "UNAUTHORIZED", message: "로그인이 필요합니다." });
  }

  const entries = await loadEntries(username);
  return apiOk({ entries });
}

export async function POST(request: Request) {
  const username = await readSession();
  if (!username) {
    return apiError({ status: 401, code: "UNAUTHORIZED", message: "로그인이 필요합니다." });
  }

  try {
    const body = (await request.json()) as AssetsBody;
    const rawEntries = body.entries ?? [];
    const normalizedEntries = rawEntries.flatMap((entry, index) => {
      const category = ASSET_CATEGORIES.find((item) => item.key === entry.categoryKey);
      if (!category) {
        return [];
      }

      const amountManwon = Number(entry.amountManwon ?? 0);
      if (!Number.isFinite(amountManwon) || amountManwon < 0) {
        throw new Error(`${category.label} 금액은 0 이상의 숫자여야 합니다.`);
      }

      const subtypeKey = category.supportsSubtype
        ? (entry.subtypeKey ?? "selfOwned")
        : null;

      if (
        category.supportsSubtype &&
        !REAL_ESTATE_SUBTYPES.some((subtype) => subtype.key === subtypeKey)
      ) {
        throw new Error("부동산 유형 값이 올바르지 않습니다.");
      }

      const label = (entry.label ?? "").trim();
      const extraData = entry.extraData ?? {};
      if (!label && amountManwon <= 0) {
        return [];
      }

      return [
        {
          categoryKey: category.key,
          subtypeKey,
          label: label || buildDefaultLabel(category.key, index + 1, subtypeKey),
          amountManwon: Math.round(amountManwon),
          extraData,
          sortOrder: Number(entry.sortOrder ?? index),
        },
      ];
    });

    await ensureAssetEntriesTable();
    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      await client.query("DELETE FROM asset_entries WHERE username = $1", [username]);

      for (const entry of normalizedEntries) {
        await client.query(
          `
            INSERT INTO asset_entries (username, category_key, subtype_key, label, amount_manwon, extra_data, sort_order, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, NOW())
          `,
          [
            username,
            entry.categoryKey,
            entry.subtypeKey,
            entry.label,
            entry.amountManwon,
            JSON.stringify(entry.extraData ?? {}),
            entry.sortOrder,
          ],
        );
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    const assetTotal = normalizedEntries
      .filter((entry) => entry.categoryKey !== "loan")
      .reduce((sum, entry) => sum + entry.amountManwon, 0);
    const loanTotal = normalizedEntries
      .filter((entry) => entry.categoryKey === "loan")
      .reduce((sum, entry) => sum + entry.amountManwon, 0);

    // ── 스냅샷 저장 (오늘 날짜 기준, UPSERT) ──
    try {
      await ensureAssetSnapshotsTable();
      const categoryBreakdown: Record<string, number> = {};
      for (const entry of normalizedEntries) {
        if (entry.categoryKey !== "loan") {
          categoryBreakdown[entry.categoryKey] = (categoryBreakdown[entry.categoryKey] ?? 0) + entry.amountManwon;
        }
      }
      const pool2 = getPool();
      await pool2.query(
        `INSERT INTO asset_snapshots (username, snapshot_date, total_assets_manwon, total_loans_manwon, net_assets_manwon, category_breakdown)
         VALUES ($1, CURRENT_DATE, $2, $3, $4, $5::jsonb)
         ON CONFLICT (username, snapshot_date)
         DO UPDATE SET total_assets_manwon=$2, total_loans_manwon=$3, net_assets_manwon=$4, category_breakdown=$5::jsonb, created_at=NOW()`,
        [username, assetTotal, loanTotal, assetTotal - loanTotal, JSON.stringify(categoryBreakdown)],
      );
    } catch { /* 스냅샷 저장 실패는 무시 */ }

    return apiOk({ entries: normalizedEntries, totalAssets: assetTotal, netAssets: assetTotal - loanTotal });
  } catch (error) {
    const message = error instanceof Error ? error.message : "자산 저장 중 오류가 발생했습니다.";
    return apiError({ status: 500, code: "ASSET_SAVE_FAILED", message });
  }
}