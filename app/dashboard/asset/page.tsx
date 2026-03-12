import AssetManager from "../../ui/asset-manager";
import { toLegacyEntries, type AssetCategoryKey, type AssetEntry, type AssetExtraData, type AssetSubtypeKey } from "../../../lib/assets";
import { ensureAssetEntriesTable, ensureAssetHoldingsTable, getPool } from "../../../lib/db";
import { readSession } from "../../../lib/session";

type AssetEntryRow = {
  id: number;
  category_key: AssetCategoryKey;
  subtype_key: AssetSubtypeKey;
  label: string;
  amount_manwon: number;
  extra_data: AssetExtraData;
  sort_order: number;
};

export default async function AssetPage() {
  const username = await readSession();
  let initialEntries: AssetEntry[] = [];
  const hasRealEstateMarketApiKey = Boolean(
    process.env.REAL_ESTATE_API_KEY?.trim() || process.env.REAL_ESTATE_LAWD_API_KEY?.trim(),
  );

  if (username) {
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
      initialEntries = result.rows.map((row) => ({
        id: String(row.id),
        categoryKey: row.category_key,
        subtypeKey: row.subtype_key,
        label: row.label,
        amountManwon: Number(row.amount_manwon),
        extraData: row.extra_data ?? {},
        sortOrder: row.sort_order,
      }));
    } else {
      await ensureAssetHoldingsTable();
      const legacy = await pool.query<{ category_key: string; amount: string }>(
        "SELECT category_key, amount FROM asset_holdings WHERE username = $1",
        [username],
      );
      initialEntries = toLegacyEntries(legacy.rows);
    }
  }

  return <AssetManager initialEntries={initialEntries} hasRealEstateMarketApiKey={hasRealEstateMarketApiKey} />;
}
