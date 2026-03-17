export type AssetCategoryKey =
  | "realEstate"
  | "deposit"
  | "saving"   // legacy – migrated to deposit at runtime
  | "stock"
  | "coin"
  | "pension"
  | "car"
  | "other"
  | "loan";

export type RealEstateSubtypeKey = "selfOwned" | "jeonse" | "monthlyRent";
export type AssetSubtypeKey = RealEstateSubtypeKey | null;
export type DepositSubtypeKey = "checking" | "fixedDeposit" | "subscription" | "saving" | "other";

export const BANKS = [
  "KB국민", "신한", "하나", "우리", "기업", "NH농협", "SC제일",
  "씨티", "카카오뱅크", "토스뱅크", "케이뱅크", "수협", "부산",
  "대구", "경남", "광주", "전북", "제주", "새마을금고", "신협",
  "우체국", "기타",
] as const;

export const DEPOSIT_SUBTYPES: Array<{ key: DepositSubtypeKey; label: string }> = [
  { key: "checking",     label: "입출금통장" },
  { key: "fixedDeposit", label: "정기예금" },
  { key: "subscription", label: "주택청약" },
  { key: "saving",       label: "적금" },
  { key: "other",        label: "기타" },
];

export const CAR_MAKERS = [
  "현대", "기아", "제네시스", "쉐보레(GM)", "르노코리아", "KGM(쌍용)",
  "BMW", "벤츠", "아우디", "폭스바겐", "도요타", "혼다", "닛산",
  "테슬라", "볼보", "포르쉐", "기타",
] as const;

export type AssetExtraData = {
  // 부동산
  address?: string;
  purchasePriceManwon?: number;
  marketPriceManwon?: number;
  depositManwon?: number;
  marketSource?: string;
  marketUpdatedAt?: string;
  marketLawdCode?: string;
  marketDealYmd?: string;
  marketAreaM2?: string;
  marketDongName?: string;
  marketAptName?: string;
  mortgageLoanManwon?: number;
  jeonseMonthlyLoanManwon?: number;
  mortgageMonthlyPaymentManwon?: number;
  jeonseMonthlyLoanPaymentManwon?: number;
  // 예금·적금
  bankName?: string;
  depositSubtype?: DepositSubtypeKey;
  // 주식
  stockCode?: string;
  stockMarket?: "KOSPI" | "KOSDAQ";
  stockQty?: number;
  stockCurrentPriceWon?: number;
  stockPriceUpdatedAt?: string;
  // 코인
  coinSymbol?: string;
  coinName?: string;
  coinQty?: number;
  coinCurrentPriceWon?: number;
  coinPriceUpdatedAt?: string;
  // 자동차
  carMaker?: string;
  carModel?: string;
  carYear?: number;
  carPurchasePriceManwon?: number;
  carMileageKm?: number;
  carEstimatedPriceManwon?: number;
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
  { key: "deposit", label: "예금·적금", description: "정기예금, 입출금, 주택청약, 적금", color: "#1d8f5a" },
  { key: "stock", label: "주식", description: "코스피·코스닥 주식, ETF", color: "#c53b51" },
  { key: "coin", label: "코인", description: "가상자산 (업비트 실시간 시세)", color: "#8557d8" },
  { key: "pension", label: "연금저축", description: "연금저축, IRP", color: "#0a9d94" },
  { key: "car", label: "자동차", description: "자동차 감가상각 잔존가치 계산", color: "#5468ff" },
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
  // 주식: 수량 × 현재가
  if (entry.categoryKey === "stock") {
    const qty = Number(entry.extraData?.stockQty ?? 0);
    const price = Number(entry.extraData?.stockCurrentPriceWon ?? 0);
    if (qty > 0 && price > 0) return Math.round((qty * price) / 10000);
    return entry.amountManwon;
  }
  // 코인: 수량 × 현재가
  if (entry.categoryKey === "coin") {
    const qty = Number(entry.extraData?.coinQty ?? 0);
    const price = Number(entry.extraData?.coinCurrentPriceWon ?? 0);
    if (qty > 0 && price > 0) return Math.round((qty * price) / 10000);
    return entry.amountManwon;
  }
  // 자동차: 잔존가치 추정액
  if (entry.categoryKey === "car") {
    const est = Number(entry.extraData?.carEstimatedPriceManwon ?? 0);
    if (est > 0) return est;
    return entry.amountManwon;
  }

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