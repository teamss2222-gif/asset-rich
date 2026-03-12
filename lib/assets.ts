export type AssetCategoryKey =
  | "realEstate"
  | "deposit"
  | "saving"
  | "stock"
  | "coin"
  | "pension"
  | "car"
  | "other"
  | "loan";

export type RealEstateSubtypeKey = "selfOwned" | "jeonse" | "monthlyRent";
export type AssetSubtypeKey = RealEstateSubtypeKey | null;

export type AssetExtraData = {
  address?: string;
  purchasePriceManwon?: number;
  marketPriceManwon?: number;
  depositManwon?: number;
  marketSource?: string;
  marketUpdatedAt?: string;
  marketLawdCode?: string;
  marketDealYmd?: string;
  marketAreaM2?: string;
  mortgageLoanManwon?: number;
  jeonseMonthlyLoanManwon?: number;
  mortgageMonthlyPaymentManwon?: number;
  jeonseMonthlyLoanPaymentManwon?: number;
};

export type AssetEntry = {
  id: string;
  categoryKey: AssetCategoryKey;
  subtypeKey: AssetSubtypeKey;
  label: string;
  amountManwon: number;
  sortOrder: number;
  extraData?: AssetExtraData;
};

export const REAL_ESTATE_SUBTYPES: Array<{ key: RealEstateSubtypeKey; label: string }> = [
  { key: "selfOwned", label: "자가" },
  { key: "jeonse", label: "전세" },
  { key: "monthlyRent", label: "월세" },
];

export const ASSET_CATEGORIES: Array<{
  key: AssetCategoryKey;
  label: string;
  description: string;
  color: string;
  isLiability?: boolean;
  supportsSubtype?: boolean;
}> = [
  { key: "realEstate", label: "부동산", description: "자가, 전세, 월세 등 부동산 보유 현황", color: "#d38b12", supportsSubtype: true },
  { key: "deposit", label: "예금", description: "입출금 통장, 정기예금", color: "#1d8f5a" },
  { key: "saving", label: "적금", description: "정기적금, 청약저축", color: "#1676cc" },
  { key: "stock", label: "주식", description: "국내외 주식, ETF", color: "#c53b51" },
  { key: "coin", label: "코인", description: "가상자산 투자분", color: "#8557d8" },
  { key: "pension", label: "연금저축", description: "연금저축, IRP", color: "#0a9d94" },
  { key: "car", label: "자동차", description: "자가용, 법인차, 리스차량 평가액", color: "#5468ff" },
  { key: "other", label: "기타", description: "현금, 귀금속, 기타 자산", color: "#697586" },
  { key: "loan", label: "대출금", description: "주담대, 신용대출, 전세대출", color: "#ef5f50", isLiability: true },
];

export function getCategoryMeta(categoryKey: AssetCategoryKey) {
  return ASSET_CATEGORIES.find((category) => category.key === categoryKey);
}

export function createEmptyAssetEntry(categoryKey: AssetCategoryKey, id: string, sortOrder = 0): AssetEntry {
  return {
    id,
    categoryKey,
    subtypeKey: categoryKey === "realEstate" ? "selfOwned" : null,
    label: "",
    amountManwon: 0,
    sortOrder,
    extraData: {},
  };
}

export function getEffectiveAssetAmountManwon(entry: AssetEntry) {
  if (entry.categoryKey !== "realEstate") {
    return entry.amountManwon;
  }

  if (entry.subtypeKey === "jeonse" || entry.subtypeKey === "monthlyRent") {
    const deposit = Number(entry.extraData?.depositManwon ?? 0);
    if (deposit > 0) {
      return deposit;
    }

    return entry.amountManwon;
  }

  const marketPrice = Number(entry.extraData?.marketPriceManwon ?? 0);
  if (marketPrice > 0) {
    return marketPrice;
  }

  const deposit = Number(entry.extraData?.depositManwon ?? 0);
  if (deposit > 0) {
    return deposit;
  }

  return entry.amountManwon;
}

export function getLinkedLoanAmountManwon(entry: AssetEntry) {
  if (entry.categoryKey !== "realEstate") {
    return 0;
  }

  if (entry.subtypeKey === "selfOwned") {
    return Number(entry.extraData?.mortgageLoanManwon ?? 0);
  }

  return Number(entry.extraData?.jeonseMonthlyLoanManwon ?? 0);
}

export function getLinkedLoanMonthlyPaymentManwon(entry: AssetEntry) {
  if (entry.categoryKey !== "realEstate") {
    return 0;
  }

  if (entry.subtypeKey === "selfOwned") {
    return Number(entry.extraData?.mortgageMonthlyPaymentManwon ?? 0);
  }

  return Number(entry.extraData?.jeonseMonthlyLoanPaymentManwon ?? 0);
}

export function getSubtypeLabel(subtypeKey: AssetSubtypeKey) {
  return REAL_ESTATE_SUBTYPES.find((subtype) => subtype.key === subtypeKey)?.label ?? "";
}

export function buildDefaultLabel(categoryKey: AssetCategoryKey, index: number, subtypeKey: AssetSubtypeKey) {
  if (categoryKey === "realEstate") {
    const subtypeLabel = getSubtypeLabel(subtypeKey) || "부동산";
    return `${subtypeLabel} ${index}`;
  }

  const category = getCategoryMeta(categoryKey);
  return `${category?.label ?? "자산"} ${index}`;
}

export function toLegacyEntries(holdings: Array<{ category_key: string; amount: string | number }>): AssetEntry[] {
  return holdings
    .filter((holding) => Number(holding.amount) > 0)
    .flatMap((holding, index) => {
      const category = getCategoryMeta(holding.category_key as AssetCategoryKey);
      if (!category || category.isLiability) {
        return [];
      }

      return [
        {
          id: `legacy-${holding.category_key}-${index}`,
          categoryKey: category.key,
          subtypeKey: category.supportsSubtype ? "selfOwned" : null,
          label: category.label,
          amountManwon: Math.round(Number(holding.amount) / 10000),
          sortOrder: index,
          extraData: {},
        },
      ];
    });
}