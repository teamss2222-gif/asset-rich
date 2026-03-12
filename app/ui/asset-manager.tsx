"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ASSET_CATEGORIES,
  REAL_ESTATE_SUBTYPES,
  buildDefaultLabel,
  createEmptyAssetEntry,
  getEffectiveAssetAmountManwon,
  getLinkedLoanAmountManwon,
  getLinkedLoanMonthlyPaymentManwon,
  type AssetCategoryKey,
  type AssetEntry,
  type AssetSubtypeKey,
} from "../../lib/assets";

type AssetManagerProps = {
  initialEntries: AssetEntry[];
  hasRealEstateMarketApiKey: boolean;
};

type DraftEntry = AssetEntry;

type DaumPostcodeData = {
  address?: string;
  roadAddress?: string;
  jibunAddress?: string;
};

type DaumPostcodeCtor = new (options: {
  oncomplete: (data: DaumPostcodeData) => void;
}) => {
  open: (options?: { popupName?: string }) => void;
};

declare global {
  interface Window {
    daum?: {
      Postcode?: DaumPostcodeCtor;
    };
  }
}

function formatManwon(value: number) {
  const normalized = Math.round(value);
  if (normalized >= 10000) {
    const eok = Math.floor(normalized / 10000);
    const remainder = normalized % 10000;
    return remainder > 0
      ? `${new Intl.NumberFormat("ko-KR").format(eok)}억 ${new Intl.NumberFormat("ko-KR").format(remainder)}만원`
      : `${new Intl.NumberFormat("ko-KR").format(eok)}억원`;
  }

  return `${new Intl.NumberFormat("ko-KR").format(normalized)}만원`;
}

function createPlaceholderId(categoryKey: AssetCategoryKey, index: number) {
  return `placeholder-${categoryKey}-${index}`;
}

function ensureCategoryRows(entries: AssetEntry[]) {
  const withSort = entries.map((entry, index) => ({
    ...entry,
    sortOrder: entry.sortOrder ?? index,
    extraData: entry.extraData ?? {},
  }));

  return ASSET_CATEGORIES.flatMap((category) => {
    const rows = withSort.filter((entry) => entry.categoryKey === category.key);
    if (rows.length > 0) {
      return rows;
    }

    return [createEmptyAssetEntry(category.key, createPlaceholderId(category.key, 0), 0)];
  });
}

function createLocalRow(categoryKey: AssetCategoryKey, index: number) {
  return createEmptyAssetEntry(categoryKey, `local-${categoryKey}-${Date.now()}-${index}`, index);
}

export default function AssetManager({ initialEntries, hasRealEstateMarketApiKey }: AssetManagerProps) {
  const [draftEntries, setDraftEntries] = useState<DraftEntry[]>(() => ensureCategoryRows(initialEntries));
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [lookupLoadingById, setLookupLoadingById] = useState<Record<string, boolean>>({});
  const [lookupMessageById, setLookupMessageById] = useState<Record<string, string>>({});
  const [isAddressPopupReady, setIsAddressPopupReady] = useState(false);
  const [isAddressPopupLoading, setIsAddressPopupLoading] = useState(false);

  const ensureAddressPopupScript = () => {
    if (typeof window === "undefined") {
      return;
    }

    if (window.daum?.Postcode) {
      setIsAddressPopupReady(true);
      setIsAddressPopupLoading(false);
      return;
    }

    const existing = document.getElementById("daum-postcode-script") as HTMLScriptElement | null;
    const handleLoaded = () => {
      setIsAddressPopupReady(Boolean(window.daum?.Postcode));
      setIsAddressPopupLoading(false);
    };
    const handleErrored = () => {
      setIsAddressPopupReady(false);
      setIsAddressPopupLoading(false);
    };

    if (existing) {
      if (existing.getAttribute("data-loaded") === "true") {
        handleLoaded();
        return;
      }

      setIsAddressPopupLoading(true);
      existing.addEventListener("load", handleLoaded, { once: true });
      existing.addEventListener("error", handleErrored, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = "daum-postcode-script";
    script.src = "https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";
    script.async = true;
    setIsAddressPopupLoading(true);
    script.onload = () => {
      script.setAttribute("data-loaded", "true");
      handleLoaded();
    };
    script.onerror = handleErrored;
    document.body.appendChild(script);
  };

  useEffect(() => {
    ensureAddressPopupScript();
  }, []);

  const categoryTotals = useMemo(() => {
    return ASSET_CATEGORIES.reduce<Record<AssetCategoryKey, number>>((totals, category) => {
      totals[category.key] = draftEntries
        .filter((entry) => entry.categoryKey === category.key)
        .reduce((sum, entry) => sum + (Number(getEffectiveAssetAmountManwon(entry)) || 0), 0);
      return totals;
    }, {
      realEstate: 0,
      deposit: 0,
      saving: 0,
      stock: 0,
      coin: 0,
      pension: 0,
      car: 0,
      other: 0,
      loan: 0,
    });
  }, [draftEntries]);

  const positiveCategories = ASSET_CATEGORIES.filter((category) => !category.isLiability);
  const totalAssets = positiveCategories.reduce((sum, category) => sum + categoryTotals[category.key], 0);
  const linkedRealEstateLoans = draftEntries.reduce(
    (sum, entry) => sum + Math.max(0, getLinkedLoanAmountManwon(entry)),
    0,
  );
  const monthlyLoanPayments = draftEntries.reduce(
    (sum, entry) => sum + Math.max(0, getLinkedLoanMonthlyPaymentManwon(entry)),
    0,
  );
  const totalLoans = categoryTotals.loan + linkedRealEstateLoans;
  const netAssets = totalAssets - totalLoans;
  const liquidAssets = categoryTotals.deposit + categoryTotals.saving;
  const monthlyNetCashflow = 0 - monthlyLoanPayments;

  const largestCategory = useMemo(() => {
    return positiveCategories.reduce(
      (largest, category) => {
        const amount = categoryTotals[category.key];
        return amount > largest.amount ? { label: category.label, amount } : largest;
      },
      { label: "미입력", amount: 0 },
    );
  }, [categoryTotals, positiveCategories]);

  const groupedEntries = useMemo(() => {
    return ASSET_CATEGORIES.map((category) => ({
      ...category,
      total: categoryTotals[category.key],
      entries: draftEntries
        .filter((entry) => entry.categoryKey === category.key)
        .sort((left, right) => left.sortOrder - right.sortOrder),
    }));
  }, [categoryTotals, draftEntries]);

  const realEstateNetCards = useMemo(() => {
    return draftEntries
      .filter((entry) => entry.categoryKey === "realEstate")
      .map((entry, index) => {
        const effectiveAmount = getEffectiveAssetAmountManwon(entry);
        const linkedLoan = getLinkedLoanAmountManwon(entry);
        const monthlyPayment = getLinkedLoanMonthlyPaymentManwon(entry);
        const displayName = entry.label.trim() || buildDefaultLabel("realEstate", index + 1, entry.subtypeKey);
        const subtypeLabel =
          REAL_ESTATE_SUBTYPES.find((subtype) => subtype.key === entry.subtypeKey)?.label ?? "부동산";

        return {
          id: entry.id,
          displayName,
          subtypeLabel,
          effectiveAmount,
          linkedLoan,
          monthlyPayment,
          netAmount: effectiveAmount - linkedLoan,
        };
      })
      .filter((card) => card.effectiveAmount > 0 || card.linkedLoan > 0 || card.monthlyPayment > 0);
  }, [draftEntries]);

  const bubbles = useMemo(() => {
    const filled = positiveCategories
      .map((category) => ({
        ...category,
        amount: categoryTotals[category.key],
      }))
      .filter((category) => category.amount > 0);

    const maxAmount = Math.max(...filled.map((category) => category.amount), 1);

    return filled.map((category) => ({
      ...category,
      share: totalAssets > 0 ? (category.amount / totalAssets) * 100 : 0,
      size: Math.max(94, Math.round(94 + Math.sqrt(category.amount / maxAmount) * 118)),
    }));
  }, [categoryTotals, positiveCategories, totalAssets]);

  const updateEntry = (entryId: string, updater: (current: DraftEntry) => DraftEntry) => {
    setDraftEntries((current) => current.map((entry) => (entry.id === entryId ? updater(entry) : entry)));
  };

  const handleLabelChange = (entryId: string, value: string) => {
    updateEntry(entryId, (current) => ({ ...current, label: value }));
  };

  const handleSubtypeChange = (entryId: string, value: string) => {
    updateEntry(entryId, (current) => ({ ...current, subtypeKey: value as AssetSubtypeKey }));
  };

  const handleAmountChange = (entryId: string, value: string) => {
    if (!/^\d*$/.test(value)) {
      return;
    }

    updateEntry(entryId, (current) => ({
      ...current,
      amountManwon: value === "" ? 0 : Number(value),
    }));
  };

  const handleRealEstateMetaChange = (
    entryId: string,
    key: "address" | "marketSource" | "marketLawdCode" | "marketDealYmd" | "marketAreaM2" | "marketDongName",
    value: string,
  ) => {
    updateEntry(entryId, (current) => ({
      ...current,
      extraData: {
        ...(current.extraData ?? {}),
        [key]: value,
      },
    }));
  };

  const handleRealEstateMetaAmountChange = (
    entryId: string,
    key:
      | "purchasePriceManwon"
      | "marketPriceManwon"
      | "depositManwon"
      | "mortgageLoanManwon"
      | "jeonseMonthlyLoanManwon"
      | "mortgageMonthlyPaymentManwon"
      | "jeonseMonthlyLoanPaymentManwon",
    value: string,
  ) => {
    if (!/^\d*$/.test(value)) {
      return;
    }

    updateEntry(entryId, (current) => ({
      ...current,
      extraData: {
        ...(current.extraData ?? {}),
        [key]: value === "" ? 0 : Number(value),
      },
    }));
  };

  const handleApplyMarketToAmount = (entryId: string) => {
    updateEntry(entryId, (current) => {
      const market = Number(current.extraData?.marketPriceManwon ?? 0);
      if (market <= 0) {
        return current;
      }

      return {
        ...current,
        amountManwon: market,
        extraData: {
          ...(current.extraData ?? {}),
          marketUpdatedAt: new Date().toISOString(),
        },
      };
    });
  };

  const handleLookupMarketPrice = async (entryId: string) => {
    const target = draftEntries.find((entry) => entry.id === entryId);
    if (!target) {
      return;
    }

    const lawdCode = (target.extraData?.marketLawdCode ?? "").trim();
    const dealYmd = (target.extraData?.marketDealYmd ?? "").trim();

    if (!/^\d{5}$/.test(lawdCode)) {
      setLookupMessageById((current) => ({
        ...current,
        [entryId]: "법정동코드 5자리를 입력해 주세요.",
      }));
      return;
    }

    setLookupLoadingById((current) => ({ ...current, [entryId]: true }));
    setLookupMessageById((current) => ({ ...current, [entryId]: "시세 조회 중..." }));

    try {
      const response = await fetch("/api/market/real-estate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          lawdCode,
          dealYmd,
          apartmentName: (target.label || target.extraData?.address || "").trim(),
          areaM2: Number(target.extraData?.marketAreaM2) || 0,
          dongName: (target.extraData?.marketDongName ?? "").trim(),
        }),
      });

      const data = (await response.json()) as {
        message?: string;
        marketPriceManwon?: number;
        sampleCount?: number;
        source?: string;
        asOf?: string;
        strategy?: "weighted_3m" | "latest_trade_fallback";
      };
      const marketPrice = data.marketPriceManwon;

      if (!response.ok || typeof marketPrice !== "number" || marketPrice <= 0) {
        setLookupMessageById((current) => ({
          ...current,
          [entryId]: data.message ?? "시세 조회에 실패했습니다.",
        }));
        return;
      }

      updateEntry(entryId, (current) => ({
        ...current,
        extraData: {
          ...(current.extraData ?? {}),
          marketPriceManwon: marketPrice,
          marketSource: data.source ?? "국토교통부 실거래가 공개시스템",
          marketUpdatedAt: data.asOf ?? new Date().toISOString(),
        },
      }));

      setLookupMessageById((current) => ({
        ...current,
        [entryId]: data.strategy === "latest_trade_fallback"
          ? `최근 3개월 거래가 없어 최신 실거래 ${formatManwon(marketPrice)}를 반영합니다.`
          : `최근 3개월 가중평균 (${data.sampleCount ?? 0}건): ${formatManwon(marketPrice)}`,
      }));
    } finally {
      setLookupLoadingById((current) => ({ ...current, [entryId]: false }));
    }
  };

  const lookupLawdCodeByAddress = async (entryId: string, addressInput: string) => {
    const address = addressInput.trim();
    if (address.length < 2) {
      setLookupMessageById((current) => ({
        ...current,
        [entryId]: "주소를 먼저 입력해 주세요.",
      }));
      return;
    }

    setLookupLoadingById((current) => ({ ...current, [entryId]: true }));
    setLookupMessageById((current) => ({ ...current, [entryId]: "법정동코드 조회 중..." }));

    try {
      const response = await fetch("/api/market/lawd-code", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ address }),
      });

      const data = (await response.json()) as {
        message?: string;
        lawdCode?: string;
        matchedAddress?: string;
      };

      if (!response.ok || !data.lawdCode) {
        setLookupMessageById((current) => ({
          ...current,
          [entryId]: data.message ?? "법정동코드 조회에 실패했습니다.",
        }));
        return;
      }

      updateEntry(entryId, (current) => ({
        ...current,
        extraData: {
          ...(current.extraData ?? {}),
          marketLawdCode: data.lawdCode,
        },
      }));

      setLookupMessageById((current) => ({
        ...current,
        [entryId]: `법정동코드 ${data.lawdCode} 자동 입력 (${data.matchedAddress ?? "주소 일치"})`,
      }));
    } finally {
      setLookupLoadingById((current) => ({ ...current, [entryId]: false }));
    }
  };

  const handleLookupLawdCode = async (entryId: string) => {
    const target = draftEntries.find((entry) => entry.id === entryId);
    if (!target) {
      return;
    }

    await lookupLawdCodeByAddress(entryId, target.extraData?.address ?? "");
  };

  const applyPopupAddress = (entryId: string, displayAddress: string, autoLookupLawdCode: boolean) => {
    updateEntry(entryId, (current) => ({
      ...current,
      extraData: {
        ...(current.extraData ?? {}),
        address: displayAddress,
      },
    }));

    if (autoLookupLawdCode) {
      void lookupLawdCodeByAddress(entryId, displayAddress);
    }
  };

  const openAddressPopup = (entryId: string, autoLookupLawdCode: boolean) => {
    if (isAddressPopupLoading) {
      setLookupMessageById((current) => ({
        ...current,
        [entryId]: "주소 팝업 로딩 중입니다. 잠시 후 다시 눌러주세요.",
      }));
      return;
    }

    if (!window.daum?.Postcode) {
      ensureAddressPopupScript();
      setLookupMessageById((current) => ({
        ...current,
        [entryId]: "주소 팝업을 준비 중입니다. 한 번 더 눌러주세요.",
      }));
      return;
    }

    const postcode = new window.daum.Postcode({
      oncomplete: (data) => {
        const displayAddress =
          (data.roadAddress ?? "").trim() ||
          (data.jibunAddress ?? "").trim() ||
          (data.address ?? "").trim();

        if (!displayAddress) {
          return;
        }

        applyPopupAddress(entryId, displayAddress, autoLookupLawdCode);
      },
    });

    postcode.open({ popupName: "asset-postcode-popup" });
  };

  const handleAddEntry = (categoryKey: AssetCategoryKey) => {
    setDraftEntries((current) => {
      const currentRows = current.filter((entry) => entry.categoryKey === categoryKey);
      return [...current, createLocalRow(categoryKey, currentRows.length)];
    });
  };

  const handleRemoveEntry = (entryId: string) => {
    setDraftEntries((current) => {
      const target = current.find((entry) => entry.id === entryId);
      if (!target) {
        return current;
      }

      const next = current.filter((entry) => entry.id !== entryId);
      const remainingOfCategory = next.filter((entry) => entry.categoryKey === target.categoryKey);
      if (remainingOfCategory.length > 0) {
        return next;
      }

      return [...next, createEmptyAssetEntry(target.categoryKey, createPlaceholderId(target.categoryKey, 0), 0)];
    });
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setNotice("");
    setError("");

    const payloadEntries = draftEntries.flatMap((entry, index) => {
      const label = entry.label.trim();
      const amountManwon = Number(entry.amountManwon) || 0;
      const extraData = entry.extraData ?? {};
      const hasRealEstateMeta =
        Number(extraData.purchasePriceManwon ?? 0) > 0 ||
        Number(extraData.marketPriceManwon ?? 0) > 0 ||
        Number(extraData.depositManwon ?? 0) > 0 ||
        Number(extraData.mortgageLoanManwon ?? 0) > 0 ||
        Number(extraData.jeonseMonthlyLoanManwon ?? 0) > 0 ||
        Number(extraData.mortgageMonthlyPaymentManwon ?? 0) > 0 ||
        Number(extraData.jeonseMonthlyLoanPaymentManwon ?? 0) > 0 ||
        Boolean((extraData.address ?? "").trim());

      if (!label && amountManwon <= 0 && !hasRealEstateMeta) {
        return [];
      }

      return [{
        categoryKey: entry.categoryKey,
        subtypeKey: entry.categoryKey === "realEstate" ? entry.subtypeKey ?? "selfOwned" : null,
        label: label || buildDefaultLabel(entry.categoryKey, index + 1, entry.subtypeKey),
        amountManwon,
        extraData,
        sortOrder: index,
      }];
    });

    const response = await fetch("/api/assets", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ entries: payloadEntries }),
    });

    const data = (await response.json()) as { message?: string };
    if (!response.ok) {
      setSaving(false);
      setError(data.message ?? "자산 저장에 실패했습니다.");
      return;
    }

    setSaving(false);
    setNotice("자산 항목이 저장되었습니다.");
  };

  return (
    <section className="asset-layout">
      <div className="asset-main-column">
        <section className="asset-summary-grid">
          <article className="asset-summary-card">
            <p>총자산</p>
            <h2>{formatManwon(totalAssets)}</h2>
          </article>
          <article className="asset-summary-card asset-summary-card-warn">
            <p>총대출</p>
            <h2>{formatManwon(totalLoans)}</h2>
          </article>
          <article className="asset-summary-card asset-summary-card-strong">
            <p>총 순자산</p>
            <h2>{formatManwon(netAssets)}</h2>
          </article>
          <article className="asset-summary-card">
            <p>최대 보유 자산</p>
            <h2>{largestCategory.amount > 0 ? largestCategory.label : "미입력"}</h2>
            <span>{formatManwon(liquidAssets)} 유동자산</span>
          </article>
          <article className="asset-summary-card asset-summary-card-cashflow">
            <p>월 상환액(원리금)</p>
            <h2>{formatManwon(monthlyLoanPayments)}</h2>
            <span>월 순현금흐름 {formatManwon(monthlyNetCashflow)}</span>
          </article>
        </section>

        {realEstateNetCards.length > 0 ? (
          <section className="realestate-net-grid">
            {realEstateNetCards.map((card) => (
              <article key={card.id} className="realestate-net-card">
                <p>{card.subtypeLabel}</p>
                <h3>{card.displayName}</h3>
                <span>평가금액 {formatManwon(card.effectiveAmount)}</span>
                <span>연결대출 {formatManwon(card.linkedLoan)}</span>
                <span>월상환 {formatManwon(card.monthlyPayment)}</span>
                <strong>순자산 {formatManwon(card.netAmount)}</strong>
              </article>
            ))}
          </section>
        ) : null}

        <section className="asset-panel">
          <div className="asset-panel-head">
            <div>
              <p className="asset-kicker">ASSET LEDGER</p>
              <h1>자산 항목 입력</h1>
            </div>
            <p className="asset-panel-copy">모든 금액은 만원 단위입니다. 부동산은 매입가/현재시세/보증금을 별도로 입력할 수 있습니다.</p>
          </div>

          <form className="asset-form" onSubmit={handleSubmit}>
            <div className="asset-category-stack">
              {groupedEntries.map((group) => (
                <section
                  key={group.key}
                  className={`asset-group-card${group.isLiability ? " asset-group-card-liability" : ""}`}
                >
                  <div className="asset-group-head">
                    <div>
                      <h3>{group.label}</h3>
                      <p>{group.description}</p>
                    </div>
                    <div className="asset-group-actions">
                      <strong>{formatManwon(group.total)}</strong>
                      <button className="btn btn-ghost btn-sm" type="button" onClick={() => handleAddEntry(group.key)}>
                        + 추가
                      </button>
                    </div>
                  </div>

                  <div className="asset-row-stack">
                    {group.entries.map((entry, index) => {
                      const effectiveAmount = getEffectiveAssetAmountManwon(entry);
                      return (
                        <div key={entry.id} className="asset-row-card">
                          <div className="asset-row">
                            {group.supportsSubtype ? (
                              <select
                                className="asset-select"
                                value={entry.subtypeKey ?? "selfOwned"}
                                onChange={(event) => handleSubtypeChange(entry.id, event.target.value)}
                              >
                                {REAL_ESTATE_SUBTYPES.map((subtype) => (
                                  <option key={subtype.key} value={subtype.key}>{subtype.label}</option>
                                ))}
                              </select>
                            ) : null}

                            <input
                              className="asset-row-input asset-row-label"
                              value={entry.label}
                              onChange={(event) => handleLabelChange(entry.id, event.target.value)}
                              placeholder={buildDefaultLabel(group.key, index + 1, entry.subtypeKey)}
                            />

                            <div className="asset-input-wrap">
                              <input
                                className="asset-input"
                                inputMode="numeric"
                                value={entry.amountManwon === 0 ? "" : String(entry.amountManwon)}
                                onChange={(event) => handleAmountChange(entry.id, event.target.value)}
                                placeholder="0"
                              />
                              <span className="asset-input-unit">만원</span>
                            </div>

                            <button className="asset-row-remove" type="button" onClick={() => handleRemoveEntry(entry.id)}>
                              삭제
                            </button>
                          </div>

                          {group.key === "realEstate" ? (
                            <>
                              <div className="realestate-address-row">
                                <input
                                  className="asset-row-input"
                                  value={entry.extraData?.address ?? ""}
                                  readOnly
                                  onClick={() => openAddressPopup(entry.id, entry.subtypeKey === "selfOwned")}
                                  placeholder={isAddressPopupReady ? "주소 입력(클릭 시 팝업)" : "주소 팝업 로딩 중..."}
                                  style={{ cursor: "pointer" }}
                                />
                                <button
                                  className="btn btn-primary btn-sm"
                                  type="button"
                                  onClick={() => openAddressPopup(entry.id, entry.subtypeKey === "selfOwned")}
                                >
                                  🔍 주소 검색
                                </button>
                                {entry.subtypeKey === "selfOwned" && (
                                  <button
                                    className="btn btn-ghost btn-sm"
                                    type="button"
                                    disabled={Boolean(
                                      lookupLoadingById[entry.id] || !((entry.extraData?.address ?? "").trim())
                                    )}
                                    onClick={() => handleLookupLawdCode(entry.id)}
                                  >
                                    {lookupLoadingById[entry.id] ? "조회중..." : "코드찾기"}
                                  </button>
                                )}
                              </div>
                            <div className="realestate-meta-grid">
                              {entry.subtypeKey === "selfOwned" ? (
                                <>
                                  <div className="asset-input-wrap">
                                    <input
                                      className="asset-input"
                                      inputMode="numeric"
                                      value={entry.extraData?.purchasePriceManwon ? String(entry.extraData.purchasePriceManwon) : ""}
                                      onChange={(event) => handleRealEstateMetaAmountChange(entry.id, "purchasePriceManwon", event.target.value)}
                                      placeholder="매입가"
                                    />
                                    <span className="asset-input-unit">만원</span>
                                  </div>
                                  <div className="asset-input-wrap">
                                    <input
                                      className="asset-input"
                                      inputMode="numeric"
                                      value={entry.extraData?.marketPriceManwon ? String(entry.extraData.marketPriceManwon) : ""}
                                      onChange={(event) => handleRealEstateMetaAmountChange(entry.id, "marketPriceManwon", event.target.value)}
                                      placeholder="현재시세"
                                    />
                                    <span className="asset-input-unit">만원</span>
                                  </div>
                                  <div className="asset-input-wrap">
                                    <input
                                      className="asset-input"
                                      inputMode="numeric"
                                      value={entry.extraData?.mortgageLoanManwon ? String(entry.extraData.mortgageLoanManwon) : ""}
                                      onChange={(event) => handleRealEstateMetaAmountChange(entry.id, "mortgageLoanManwon", event.target.value)}
                                      placeholder="주담대"
                                    />
                                    <span className="asset-input-unit">만원</span>
                                  </div>
                                  <div className="asset-input-wrap">
                                    <input
                                      className="asset-input"
                                      inputMode="numeric"
                                      value={entry.extraData?.mortgageMonthlyPaymentManwon ? String(entry.extraData.mortgageMonthlyPaymentManwon) : ""}
                                      onChange={(event) => handleRealEstateMetaAmountChange(entry.id, "mortgageMonthlyPaymentManwon", event.target.value)}
                                      placeholder="월 상환액"
                                    />
                                    <span className="asset-input-unit">만원</span>
                                  </div>
                                </>
                              ) : (
                                <>
                                  <div className="asset-input-wrap">
                                    <input
                                      className="asset-input"
                                      inputMode="numeric"
                                      value={entry.extraData?.depositManwon ? String(entry.extraData.depositManwon) : ""}
                                      onChange={(event) => handleRealEstateMetaAmountChange(entry.id, "depositManwon", event.target.value)}
                                      placeholder="보증금"
                                    />
                                    <span className="asset-input-unit">만원</span>
                                  </div>
                                  <div className="asset-input-wrap">
                                    <input
                                      className="asset-input"
                                      inputMode="numeric"
                                      value={entry.extraData?.jeonseMonthlyLoanManwon ? String(entry.extraData.jeonseMonthlyLoanManwon) : ""}
                                      onChange={(event) => handleRealEstateMetaAmountChange(entry.id, "jeonseMonthlyLoanManwon", event.target.value)}
                                      placeholder="전세월세대출"
                                    />
                                    <span className="asset-input-unit">만원</span>
                                  </div>
                                  <div className="asset-input-wrap">
                                    <input
                                      className="asset-input"
                                      inputMode="numeric"
                                      value={entry.extraData?.jeonseMonthlyLoanPaymentManwon ? String(entry.extraData.jeonseMonthlyLoanPaymentManwon) : ""}
                                      onChange={(event) => handleRealEstateMetaAmountChange(entry.id, "jeonseMonthlyLoanPaymentManwon", event.target.value)}
                                      placeholder="월 상환액"
                                    />
                                    <span className="asset-input-unit">만원</span>
                                  </div>
                                </>
                              )}
                              <div className="realestate-meta-actions">
                                {entry.subtypeKey === "selfOwned" ? (
                                  <>
                                    <div className="realestate-market-query-grid">
                                      <input
                                        className="asset-row-input"
                                        value={entry.extraData?.marketLawdCode ?? ""}
                                        onChange={(event) => handleRealEstateMetaChange(entry.id, "marketLawdCode", event.target.value)}
                                        placeholder="법정동코드 5자리 (예: 11680)"
                                      />
                                      <input
                                        className="asset-row-input"
                                        value={entry.extraData?.marketDealYmd ?? ""}
                                        onChange={(event) => handleRealEstateMetaChange(entry.id, "marketDealYmd", event.target.value)}
                                        placeholder="조회년월 YYYYMM (예: 202603)"
                                      />
                                      <input
                                        className="asset-row-input"
                                        value={entry.extraData?.marketAreaM2 ?? ""}
                                        onChange={(event) => handleRealEstateMetaChange(entry.id, "marketAreaM2", event.target.value)}
                                        placeholder="전용면적㎡ (예: 84)"
                                      />
                                      <input
                                        className="asset-row-input"
                                        value={entry.extraData?.marketDongName ?? ""}
                                        onChange={(event) => handleRealEstateMetaChange(entry.id, "marketDongName", event.target.value)}
                                        placeholder="동 이름 (예: 역삼동)"
                                      />
                                      <button
                                        className="btn btn-ghost btn-sm"
                                        type="button"
                                        disabled={Boolean(lookupLoadingById[entry.id] || !hasRealEstateMarketApiKey)}
                                        onClick={() => handleLookupMarketPrice(entry.id)}
                                      >
                                        {lookupLoadingById[entry.id] ? "조회중..." : "시세 조회"}
                                      </button>
                                    </div>
                                    {!hasRealEstateMarketApiKey ? (
                                      <span className="realestate-lookup-warning">
                                        자동 시세 조회는 API 키 설정 후 사용할 수 있습니다. 지금은 현재시세를 직접 입력해 주세요.
                                      </span>
                                    ) : null}
                                    <input
                                      className="asset-row-input"
                                      value={entry.extraData?.marketSource ?? ""}
                                      onChange={(event) => handleRealEstateMetaChange(entry.id, "marketSource", event.target.value)}
                                      placeholder="시세 출처 (예: KB, 네이버부동산)"
                                    />
                                    <button className="btn btn-ghost btn-sm" type="button" onClick={() => handleApplyMarketToAmount(entry.id)}>
                                      현재시세 반영
                                    </button>
                                  </>
                                ) : (
                                  <span className="asset-subhint">전세/월세는 보증금과 전세월세대출 중심으로 계산됩니다.</span>
                                )}
                                <span className="realestate-effective">반영값: {formatManwon(effectiveAmount)}</span>
                                {lookupMessageById[entry.id] ? (
                                  <span className="realestate-lookup-message">{lookupMessageById[entry.id]}</span>
                                ) : null}
                              </div>
                            </div>
                            </>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>

            {error ? <p className="asset-message asset-message-error">{error}</p> : null}
            {notice ? <p className="asset-message asset-message-ok">{notice}</p> : null}

            <div className="asset-actions">
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? "저장 중..." : "자산 저장"}
              </button>
            </div>
          </form>
        </section>
      </div>

      <aside className="asset-chart-panel">
        <div className="asset-chart-head">
          <p className="asset-kicker">ASSET BUBBLES</p>
          <h2>자산 분포</h2>
          <span>분류별 합산 금액 기준으로 원 크기가 달라집니다. 부동산은 현재시세가 있으면 그 값을 우선 사용합니다.</span>
        </div>

        {bubbles.length > 0 ? (
          <div className="asset-bubble-wrap">
            {bubbles.map((bubble) => (
              <article
                key={bubble.key}
                className="asset-bubble"
                style={{
                  width: `${bubble.size}px`,
                  height: `${bubble.size}px`,
                  background: `radial-gradient(circle at 30% 25%, #ffffff 0%, ${bubble.color} 42%, ${bubble.color} 100%)`,
                }}
              >
                <strong>{bubble.label}</strong>
                <span>{formatManwon(bubble.amount)}</span>
                <em>{bubble.share.toFixed(1)}%</em>
              </article>
            ))}
          </div>
        ) : (
          <div className="asset-empty-state">
            <strong>아직 입력된 자산이 없습니다.</strong>
            <span>왼쪽에서 자산 항목을 추가하면 여기서 분포를 바로 볼 수 있습니다.</span>
          </div>
        )}

        <div className="asset-liability-box">
          <p>총대출</p>
          <strong>{formatManwon(totalLoans)}</strong>
          <span>순자산 = 총자산 - 대출금</span>
        </div>

        <div className="asset-legend">
          {positiveCategories.map((category) => (
            <div key={category.key} className="asset-legend-item">
              <span className="asset-legend-dot" style={{ backgroundColor: category.color }} />
              <span>{category.label}</span>
              <strong>{formatManwon(categoryTotals[category.key])}</strong>
            </div>
          ))}
        </div>
      </aside>
    </section>
  );
}
