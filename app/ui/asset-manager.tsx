"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

type HistoryPoint = {
  date: string;
  totalAssets: number;
  totalLoans: number;
  netAssets: number;
};

type DaumPostcodeData = {
  address?: string;
  roadAddress?: string;
  jibunAddress?: string;
};
type DaumPostcodeCtor = new (options: { oncomplete: (data: DaumPostcodeData) => void }) => { open: (o?: { popupName?: string }) => void };
declare global {
  interface Window { daum?: { Postcode?: DaumPostcodeCtor } }
}

/* ── 서식 ── */
function formatManwon(value: number) {
  const n = Math.round(value);
  if (n >= 10000) {
    const eok = Math.floor(n / 10000);
    const rem = n % 10000;
    return rem > 0
      ? `${new Intl.NumberFormat("ko-KR").format(eok)}억 ${new Intl.NumberFormat("ko-KR").format(rem)}만`
      : `${new Intl.NumberFormat("ko-KR").format(eok)}억원`;
  }
  return `${new Intl.NumberFormat("ko-KR").format(n)}만원`;
}

function formatPct(value: number) {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

/* ── 재무 건강 점수 ── */
function computeHealthScore(
  categoryTotals: Record<AssetCategoryKey, number>,
  totalAssets: number,
  totalLoans: number,
) {
  if (totalAssets === 0) return { score: 0, grade: "미입력", color: "#697586", detail: [] as string[] };
  const debtRatio = totalLoans / totalAssets;
  const liquid = (categoryTotals.deposit + categoryTotals.saving) / totalAssets;
  const filledCats = (Object.keys(categoryTotals) as AssetCategoryKey[])
    .filter((k) => k !== "loan" && categoryTotals[k] > 0).length;
  const hasPension = categoryTotals.pension > 0;

  let score = 0;
  const detail: string[] = [];

  if (debtRatio < 0.3)       { score += 40; detail.push("부채비율 양호 (30% 미만)"); }
  else if (debtRatio < 0.5)  { score += 25; detail.push("부채비율 보통 (50% 미만)"); }
  else if (debtRatio < 0.7)  { score += 10; detail.push("부채비율 주의 (70% 미만)"); }
  else                        {              detail.push("부채비율 위험 (70% 이상)"); }

  if (liquid > 0.2)           { score += 30; detail.push("유동성 우수 (20% 초과)"); }
  else if (liquid > 0.1)      { score += 20; detail.push("유동성 양호 (10% 초과)"); }
  else if (liquid > 0.05)     { score += 10; detail.push("유동성 보통 (5% 초과)"); }
  else                        {              detail.push("유동성 부족 (5% 미만)"); }

  if (filledCats >= 4)        { score += 20; detail.push("자산 분산 우수 (4종 이상)"); }
  else if (filledCats >= 2)   { score += 12; detail.push("자산 분산 보통 (2~3종)"); }
  else if (filledCats >= 1)   { score += 5;  detail.push("자산 분산 부족 (1종)"); }

  if (hasPension)             { score += 10; detail.push("연금/노후 준비 중"); }
  else                        {              detail.push("연금/노후 미준비"); }

  const grade = score >= 80 ? "우수" : score >= 60 ? "양호" : score >= 40 ? "보통" : "주의";
  const color = score >= 80 ? "#30d158" : score >= 60 ? "#0a84ff" : score >= 40 ? "#ffd60a" : "#ff453a";
  return { score, grade, color, detail };
}

/* ── SVG 도넛 차트 ── */
function DonutChart({ slices, netAssets }: {
  slices: { key: string; label: string; color: string; share: number; amount: number }[];
  netAssets: number;
}) {
  const cx = 110, cy = 110, r = 80, sw = 28;
  const C = 2 * Math.PI * r;
  let cumShare = 0;
  return (
    <svg viewBox="0 0 220 220" className="donut-svg">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={sw} />
      {slices.map((s) => {
        if (s.share <= 0) return null;
        const dash = (s.share / 100) * C;
        const offset = C - (cumShare / 100) * C;
        cumShare += s.share;
        return (
          <circle
            key={s.key}
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={s.color}
            strokeWidth={sw}
            strokeDasharray={`${dash} ${C - dash}`}
            strokeDashoffset={offset}
            style={{ transform: `rotate(-90deg)`, transformOrigin: `${cx}px ${cy}px` }}
          />
        );
      })}
      <text x={cx} y={cy - 12} textAnchor="middle" fill="var(--text-2)" fontSize="10" fontFamily="inherit">순자산</text>
      <text x={cx} y={cy + 10} textAnchor="middle" fill="var(--text-1)" fontSize="13" fontWeight="700" fontFamily="inherit">
        {netAssets >= 10000
          ? `${Math.floor(netAssets / 10000)}억${netAssets % 10000 > 0 ? ` ${netAssets % 10000}만` : ""}`
          : `${new Intl.NumberFormat("ko-KR").format(Math.round(netAssets))}만`}
      </text>
    </svg>
  );
}

/* ── 스파크라인 ── */
function SparkLine({ data }: { data: HistoryPoint[] }) {
  if (data.length < 2) return null;
  const W = 100, H = 32;
  const vals = data.map((d) => d.netAssets);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const pts = vals.map((v, i) => {
    const x = (i / (vals.length - 1)) * W;
    const y = H - 4 - ((v - min) / range) * (H - 8);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const lastX = W, lastY = H - 4 - ((vals[vals.length - 1] - min) / range) * (H - 8);
  const isUp = vals[vals.length - 1] >= vals[0];
  const strokeColor = isUp ? "#30d158" : "#ff453a";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="sparkline-svg" style={{ width: "100px", height: "32px" }}>
      <polyline fill="none" stroke={strokeColor} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" points={pts} />
      <circle cx={lastX} cy={lastY} r="2.5" fill={strokeColor} />
    </svg>
  );
}

/* ── 유틸 ── */
function createPlaceholderId(categoryKey: AssetCategoryKey, index: number) {
  return `placeholder-${categoryKey}-${index}`;
}

function ensureCategoryRows(entries: AssetEntry[]) {
  const withSort = entries.map((entry, i) => ({
    ...entry,
    sortOrder: entry.sortOrder ?? i,
    extraData: entry.extraData ?? {},
  }));
  return ASSET_CATEGORIES.flatMap((cat) => {
    const rows = withSort.filter((e) => e.categoryKey === cat.key);
    return rows.length > 0 ? rows : [createEmptyAssetEntry(cat.key, createPlaceholderId(cat.key, 0), 0)];
  });
}

function createLocalRow(categoryKey: AssetCategoryKey, index: number) {
  return createEmptyAssetEntry(categoryKey, `local-${categoryKey}-${Date.now()}-${index}`, index);
}

/* ══════════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════════ */
export default function AssetManager({ initialEntries, hasRealEstateMarketApiKey }: AssetManagerProps) {
  const [draftEntries, setDraftEntries] = useState<DraftEntry[]>(() => ensureCategoryRows(initialEntries));
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [lookupLoadingById, setLookupLoadingById] = useState<Record<string, boolean>>({});
  const [lookupMsgById, setLookupMsgById] = useState<Record<string, string>>({});
  const [addrReady, setAddrReady] = useState(false);
  const [addrLoading, setAddrLoading] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<AssetCategoryKey>>(new Set());
  const [historyData, setHistoryData] = useState<HistoryPoint[]>([]);
  const [healthOpen, setHealthOpen] = useState(false);

  /* 주소 팝업 */
  const ensureAddrScript = useCallback(() => {
    if (typeof window === "undefined") return;
    if (window.daum?.Postcode) { setAddrReady(true); setAddrLoading(false); return; }
    const existing = document.getElementById("daum-postcode-script") as HTMLScriptElement | null;
    const onLoaded = () => { setAddrReady(Boolean(window.daum?.Postcode)); setAddrLoading(false); };
    const onError = () => { setAddrReady(false); setAddrLoading(false); };
    if (existing) {
      if (existing.getAttribute("data-loaded") === "true") { onLoaded(); return; }
      setAddrLoading(true);
      existing.addEventListener("load", onLoaded, { once: true });
      existing.addEventListener("error", onError, { once: true });
      return;
    }
    const s = document.createElement("script");
    s.id = "daum-postcode-script";
    s.src = "https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";
    s.async = true;
    setAddrLoading(true);
    s.onload = () => { s.setAttribute("data-loaded", "true"); onLoaded(); };
    s.onerror = onError;
    document.body.appendChild(s);
  }, []);

  useEffect(() => {
    ensureAddrScript();
    fetch("/api/assets/history")
      .then((r) => r.json())
      .then((j) => { if (j.ok && Array.isArray(j.data)) setHistoryData(j.data as HistoryPoint[]); })
      .catch(() => {});
  }, [ensureAddrScript]);

  /* ── 집계값 ── */
  const categoryTotals = useMemo(() => {
    return ASSET_CATEGORIES.reduce<Record<AssetCategoryKey, number>>((acc, cat) => {
      acc[cat.key] = draftEntries
        .filter((e) => e.categoryKey === cat.key)
        .reduce((s, e) => s + (Number(getEffectiveAssetAmountManwon(e)) || 0), 0);
      return acc;
    }, { realEstate: 0, deposit: 0, saving: 0, stock: 0, coin: 0, pension: 0, car: 0, other: 0, loan: 0 });
  }, [draftEntries]);

  const positiveCategories = ASSET_CATEGORIES.filter((c) => !c.isLiability);
  const totalAssets = positiveCategories.reduce((s, c) => s + categoryTotals[c.key], 0);
  const linkedRELoans = draftEntries.reduce((s, e) => s + Math.max(0, getLinkedLoanAmountManwon(e)), 0);
  const monthlyPayments = draftEntries.reduce((s, e) => s + Math.max(0, getLinkedLoanMonthlyPaymentManwon(e)), 0);
  const totalLoans = categoryTotals.loan + linkedRELoans;
  const netAssets = totalAssets - totalLoans;
  const liquidAssets = categoryTotals.deposit + categoryTotals.saving;
  const debtRatioPct = totalAssets > 0 ? (totalLoans / totalAssets) * 100 : 0;

  const health = useMemo(
    () => computeHealthScore(categoryTotals, totalAssets, totalLoans),
    [categoryTotals, totalAssets, totalLoans],
  );

  const groupedEntries = useMemo(() => {
    return ASSET_CATEGORIES.map((cat) => ({
      ...cat,
      total: categoryTotals[cat.key],
      entries: draftEntries
        .filter((e) => e.categoryKey === cat.key)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    }));
  }, [categoryTotals, draftEntries]);

  const realEstateCards = useMemo(() => {
    return draftEntries
      .filter((e) => e.categoryKey === "realEstate")
      .map((e, i) => {
        const effective = getEffectiveAssetAmountManwon(e);
        const linked = getLinkedLoanAmountManwon(e);
        const monthly = getLinkedLoanMonthlyPaymentManwon(e);
        const purchase = Number(e.extraData?.purchasePriceManwon ?? 0);
        const market = Number(e.extraData?.marketPriceManwon ?? 0);
        const profitPct = purchase > 0 && market > 0 ? ((market - purchase) / purchase) * 100 : null;
        const subtypeLabel = REAL_ESTATE_SUBTYPES.find((s) => s.key === e.subtypeKey)?.label ?? "부동산";
        return {
          id: e.id,
          name: e.label.trim() || buildDefaultLabel("realEstate", i + 1, e.subtypeKey),
          subtypeLabel, effective, linked, monthly, profitPct,
          net: effective - linked,
        };
      })
      .filter((c) => c.effective > 0 || c.linked > 0);
  }, [draftEntries]);

  const donutSlices = useMemo(() => {
    return positiveCategories
      .map((cat) => ({
        key: cat.key, label: cat.label, color: cat.color,
        amount: categoryTotals[cat.key],
        share: totalAssets > 0 ? (categoryTotals[cat.key] / totalAssets) * 100 : 0,
      }))
      .filter((s) => s.amount > 0);
  }, [categoryTotals, positiveCategories, totalAssets]);

  /* ── 인터렉션 ── */
  const updateEntry = (id: string, fn: (e: DraftEntry) => DraftEntry) =>
    setDraftEntries((cur) => cur.map((e) => (e.id === id ? fn(e) : e)));

  const handleLabelChange = (id: string, v: string) => updateEntry(id, (e) => ({ ...e, label: v }));
  const handleSubtypeChange = (id: string, v: string) => updateEntry(id, (e) => ({ ...e, subtypeKey: v as AssetSubtypeKey }));
  const handleAmountChange = (id: string, v: string) => {
    if (!/^\d*$/.test(v)) return;
    updateEntry(id, (e) => ({ ...e, amountManwon: v === "" ? 0 : Number(v) }));
  };

  const handleMetaChange = (
    id: string,
    key: "address" | "marketSource" | "marketLawdCode" | "marketDealYmd" | "marketAreaM2" | "marketDongName" | "marketAptName",
    v: string,
  ) => updateEntry(id, (e) => ({ ...e, extraData: { ...(e.extraData ?? {}), [key]: v } }));

  const handleMetaAmountChange = (
    id: string,
    key: "purchasePriceManwon" | "marketPriceManwon" | "depositManwon" | "mortgageLoanManwon"
       | "jeonseMonthlyLoanManwon" | "mortgageMonthlyPaymentManwon" | "jeonseMonthlyLoanPaymentManwon",
    v: string,
  ) => {
    if (!/^\d*$/.test(v)) return;
    updateEntry(id, (e) => ({ ...e, extraData: { ...(e.extraData ?? {}), [key]: v === "" ? 0 : Number(v) } }));
  };

  const handleApplyMarket = (id: string) => updateEntry(id, (e) => {
    const m = Number(e.extraData?.marketPriceManwon ?? 0);
    return m > 0 ? { ...e, amountManwon: m, extraData: { ...(e.extraData ?? {}), marketUpdatedAt: new Date().toISOString() } } : e;
  });

  const handleLookupMarket = async (id: string) => {
    const t = draftEntries.find((e) => e.id === id);
    if (!t) return;
    const lawdCode = (t.extraData?.marketLawdCode ?? "").trim();
    const now = new Date();
    const dealYmd = (t.extraData?.marketDealYmd ?? "").trim() || `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
    if (!/^\d{5}$/.test(lawdCode)) {
      setLookupMsgById((c) => ({ ...c, [id]: "법정동코드 5자리를 입력해주세요." }));
      return;
    }
    setLookupLoadingById((c) => ({ ...c, [id]: true }));
    setLookupMsgById((c) => ({ ...c, [id]: "시세 조회 중..." }));
    try {
      const res = await fetch("/api/market/real-estate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lawdCode, dealYmd,
          apartmentName: (t.extraData?.marketAptName || t.label || t.extraData?.address || "").trim(),
          areaM2: Number(t.extraData?.marketAreaM2) || 0,
          dongName: (t.extraData?.marketDongName ?? "").trim(),
        }),
      });
      const data = await res.json() as { message?: string; marketPriceManwon?: number; sampleCount?: number; source?: string; asOf?: string; strategy?: string };
      const mp = data.marketPriceManwon;
      if (!res.ok || typeof mp !== "number" || mp <= 0) {
        setLookupMsgById((c) => ({ ...c, [id]: data.message ?? "조회 실패" }));
        return;
      }
      updateEntry(id, (e) => ({ ...e, extraData: { ...(e.extraData ?? {}), marketPriceManwon: mp, marketSource: data.source ?? "", marketUpdatedAt: data.asOf ?? new Date().toISOString() } }));
      setLookupMsgById((c) => ({ ...c, [id]: data.strategy === "latest_trade_fallback" ? `최신 실거래 ${formatManwon(mp)}` : `3개월 가중평균 (${data.sampleCount ?? 0}건): ${formatManwon(mp)}` }));
    } finally {
      setLookupLoadingById((c) => ({ ...c, [id]: false }));
    }
  };

  const lookupLawdByAddr = async (id: string, addr: string) => {
    if (addr.length < 2) { setLookupMsgById((c) => ({ ...c, [id]: "주소를 먼저 입력해주세요." })); return; }
    setLookupLoadingById((c) => ({ ...c, [id]: true }));
    setLookupMsgById((c) => ({ ...c, [id]: "법정동코드 조회 중..." }));
    try {
      const res = await fetch("/api/market/lawd-code", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address: addr }) });
      const data = await res.json() as { message?: string; lawdCode?: string; matchedAddress?: string };
      if (!res.ok || !data.lawdCode) { setLookupMsgById((c) => ({ ...c, [id]: data.message ?? "조회 실패" })); return; }
      updateEntry(id, (e) => ({ ...e, extraData: { ...(e.extraData ?? {}), marketLawdCode: data.lawdCode } }));
      setLookupMsgById((c) => ({ ...c, [id]: `법정동코드 ${data.lawdCode} 자동 입력` }));
    } finally {
      setLookupLoadingById((c) => ({ ...c, [id]: false }));
    }
  };

  const openAddrPopup = (id: string, autoLookup: boolean) => {
    if (addrLoading) { setLookupMsgById((c) => ({ ...c, [id]: "팝업 로딩 중..." })); return; }
    if (!window.daum?.Postcode) { ensureAddrScript(); setLookupMsgById((c) => ({ ...c, [id]: "한 번 더 눌러주세요." })); return; }
    new window.daum.Postcode({
      oncomplete: (data) => {
        const addr = (data.roadAddress ?? "").trim() || (data.jibunAddress ?? "").trim() || (data.address ?? "").trim();
        if (!addr) return;
        updateEntry(id, (e) => ({ ...e, extraData: { ...(e.extraData ?? {}), address: addr } }));
        const dong = addr.match(/(\S+[동리읍면])(?:\s|$)/)?.[1];
        if (dong) updateEntry(id, (e) => ({ ...e, extraData: { ...(e.extraData ?? {}), marketDongName: dong } }));
        if (autoLookup) void lookupLawdByAddr(id, addr);
      },
    }).open({ popupName: "asset-addr" });
  };

  const handleAddEntry = (key: AssetCategoryKey) =>
    setDraftEntries((cur) => [...cur, createLocalRow(key, cur.filter((e) => e.categoryKey === key).length)]);

  const handleRemoveEntry = (id: string) =>
    setDraftEntries((cur) => {
      const t = cur.find((e) => e.id === id);
      if (!t) return cur;
      const next = cur.filter((e) => e.id !== id);
      const rem = next.filter((e) => e.categoryKey === t.categoryKey);
      return rem.length > 0 ? next : [...next, createEmptyAssetEntry(t.categoryKey, createPlaceholderId(t.categoryKey, 0), 0)];
    });

  const toggleCollapse = (key: AssetCategoryKey) =>
    setCollapsed((c) => { const n = new Set(c); n.has(key) ? n.delete(key) : n.add(key); return n; });

  const handleSubmit = async (evt: React.FormEvent<HTMLFormElement>) => {
    evt.preventDefault();
    setSaving(true); setNotice(""); setError("");
    const payloadEntries = draftEntries.flatMap((e, i) => {
      const label = e.label.trim();
      const amt = Number(e.amountManwon) || 0;
      const extra = e.extraData ?? {};
      const hasMeta = ["purchasePriceManwon","marketPriceManwon","depositManwon","mortgageLoanManwon","jeonseMonthlyLoanManwon","mortgageMonthlyPaymentManwon","jeonseMonthlyLoanPaymentManwon"]
        .some((k) => Number((extra as Record<string,unknown>)[k] ?? 0) > 0) || Boolean((extra.address ?? "").trim());
      if (!label && amt <= 0 && !hasMeta) return [];
      return [{ categoryKey: e.categoryKey, subtypeKey: e.categoryKey === "realEstate" ? e.subtypeKey ?? "selfOwned" : null, label: label || buildDefaultLabel(e.categoryKey, i + 1, e.subtypeKey), amountManwon: amt, extraData: extra, sortOrder: i }];
    });
    const res = await fetch("/api/assets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entries: payloadEntries }) });
    const data = await res.json() as { message?: string };
    setSaving(false);
    if (!res.ok) { setError(data.message ?? "저장 실패"); return; }
    setNotice("✅ 저장 완료! 스냅샷이 기록되었습니다.");
    // 이력 새로고침
    fetch("/api/assets/history").then((r) => r.json()).then((j) => { if (j.ok && Array.isArray(j.data)) setHistoryData(j.data as HistoryPoint[]); }).catch(() => {});
  };

  /* ══════════ RENDER ══════════ */
  return (
    <section className="asset-layout">
      {/* ── 메인 컬럼 ── */}
      <div className="asset-main-column">

        {/* ── 요약 카드 ── */}
        <section className="asset-summary-grid">
          {/* 재무 건강 점수 */}
          <article className="asset-summary-card asset-health-card" onClick={() => setHealthOpen((v) => !v)} style={{ cursor: "pointer", borderColor: health.color }}>
            <p>재무 건강 점수</p>
            <div className="asset-health-score-row">
              <h2 style={{ color: health.color }}>{health.score}점</h2>
              <span className="asset-health-grade" style={{ background: health.color + "22", color: health.color }}>{health.grade}</span>
            </div>
            <span style={{ fontSize: "0.72rem", opacity: 0.6 }}>{healthOpen ? "▲ 닫기" : "▼ 상세 보기"}</span>
          </article>

          <article className="asset-summary-card">
            <p>총자산</p>
            <h2>{formatManwon(totalAssets)}</h2>
            {historyData.length >= 2 && (
              <div className="asset-sparkline-row">
                <SparkLine data={historyData} />
              </div>
            )}
          </article>

          <article className="asset-summary-card asset-summary-card-warn">
            <p>총대출</p>
            <h2>{formatManwon(totalLoans)}</h2>
            <span>부채비율 {debtRatioPct.toFixed(1)}%</span>
          </article>

          <article className="asset-summary-card asset-summary-card-strong">
            <p>순자산</p>
            <h2>{formatManwon(netAssets)}</h2>
            <span>유동자산 {formatManwon(liquidAssets)}</span>
          </article>

          <article className="asset-summary-card asset-summary-card-cashflow">
            <p>월 원리금 상환</p>
            <h2>{formatManwon(monthlyPayments)}</h2>
            <span>연간 {formatManwon(monthlyPayments * 12)}</span>
          </article>
        </section>

        {/* 건강 상세 드롭다운 */}
        {healthOpen && (
          <div className="asset-health-detail">
            {health.detail.map((d, i) => (
              <span key={i} className="asset-health-badge">{d}</span>
            ))}
          </div>
        )}

        {/* ── 부동산 카드 ── */}
        {realEstateCards.length > 0 && (
          <section className="realestate-net-grid">
            {realEstateCards.map((card) => (
              <article key={card.id} className="realestate-net-card">
                <p>{card.subtypeLabel}</p>
                <h3>{card.name}</h3>
                <div className="realestate-net-stats">
                  <span>평가금액 <strong>{formatManwon(card.effective)}</strong></span>
                  <span>연결대출 <strong>{formatManwon(card.linked)}</strong></span>
                  {card.monthly > 0 && <span>월상환 <strong>{formatManwon(card.monthly)}</strong></span>}
                </div>
                <div className="realestate-net-bottom">
                  <strong className="realestate-net-value">순자산 {formatManwon(card.net)}</strong>
                  {card.profitPct !== null && (
                    <span className={`realestate-profit-badge ${card.profitPct >= 0 ? "up" : "down"}`}>
                      {formatPct(card.profitPct)}
                    </span>
                  )}
                </div>
              </article>
            ))}
          </section>
        )}

        {/* ── 입력 폼 ── */}
        <section className="asset-panel">
          <div className="asset-panel-head">
            <div>
              <p className="asset-kicker">ASSET LEDGER</p>
              <h1>자산 항목 입력</h1>
            </div>
            <p className="asset-panel-copy">모든 금액은 만원 단위입니다.</p>
          </div>

          <form className="asset-form" onSubmit={handleSubmit}>
            <div className="asset-category-stack">
              {groupedEntries.map((group) => {
                const isCollapsed = collapsed.has(group.key);
                return (
                  <section key={group.key} className={`asset-group-card${group.isLiability ? " asset-group-card-liability" : ""}`}>
                    <div className="asset-group-head" onClick={() => toggleCollapse(group.key)} style={{ cursor: "pointer", userSelect: "none" }}>
                      <div>
                        <h3>
                          <span className="asset-group-dot" style={{ background: group.color }} />
                          {group.label}
                        </h3>
                        <p>{group.description}</p>
                      </div>
                      <div className="asset-group-actions">
                        <strong>{formatManwon(group.total)}</strong>
                        {totalAssets > 0 && !group.isLiability && (
                          <span className="asset-group-share">{((group.total / totalAssets) * 100).toFixed(1)}%</span>
                        )}
                        <span className="asset-collapse-icon">{isCollapsed ? "›" : "⌄"}</span>
                        <button className="btn btn-ghost btn-sm" type="button"
                          onClick={(e) => { e.stopPropagation(); handleAddEntry(group.key); }}
                        >+ 추가</button>
                      </div>
                    </div>

                    {!isCollapsed && (
                      <div className="asset-row-stack">
                        {group.entries.map((entry, index) => {
                          const effective = getEffectiveAssetAmountManwon(entry);
                          return (
                            <div key={entry.id} className="asset-row-card">
                              <div className="asset-row">
                                {group.supportsSubtype && (
                                  <select className="asset-select" value={entry.subtypeKey ?? "selfOwned"}
                                    onChange={(e) => handleSubtypeChange(entry.id, e.target.value)}>
                                    {REAL_ESTATE_SUBTYPES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                                  </select>
                                )}
                                <input className="asset-row-input asset-row-label"
                                  value={entry.label}
                                  onChange={(e) => handleLabelChange(entry.id, e.target.value)}
                                  placeholder={buildDefaultLabel(group.key, index + 1, entry.subtypeKey)}
                                />
                                <div className="asset-input-wrap">
                                  <input className="asset-input" inputMode="numeric"
                                    value={entry.amountManwon === 0 ? "" : String(entry.amountManwon)}
                                    onChange={(e) => handleAmountChange(entry.id, e.target.value)}
                                    placeholder="0"
                                  />
                                  <span className="asset-input-unit">만원</span>
                                </div>
                                <button className="asset-row-remove" type="button" onClick={() => handleRemoveEntry(entry.id)}>삭제</button>
                              </div>

                              {group.key === "realEstate" && (
                                <>
                                  <div className="realestate-address-row">
                                    <input className="asset-row-input" value={entry.extraData?.address ?? ""} readOnly
                                      onClick={() => openAddrPopup(entry.id, entry.subtypeKey === "selfOwned")}
                                      placeholder={addrReady ? "주소 입력(클릭 시 팝업)" : "주소 팝업 로딩 중..."}
                                      style={{ cursor: "pointer" }}
                                    />
                                    <button className="btn btn-primary btn-sm" type="button" onClick={() => openAddrPopup(entry.id, entry.subtypeKey === "selfOwned")}>🔍 검색</button>
                                  </div>
                                  <div className="realestate-meta-grid">
                                    {entry.subtypeKey === "selfOwned" ? (
                                      <>
                                        <div className="asset-input-wrap">
                                          <input className="asset-input" inputMode="numeric"
                                            value={entry.extraData?.purchasePriceManwon ? String(entry.extraData.purchasePriceManwon) : ""}
                                            onChange={(e) => handleMetaAmountChange(entry.id, "purchasePriceManwon", e.target.value)}
                                            placeholder="매입가"
                                          />
                                          <span className="asset-input-unit">만원</span>
                                        </div>
                                        <div className="asset-input-wrap">
                                          <input className="asset-input" inputMode="numeric"
                                            value={entry.extraData?.marketPriceManwon ? String(entry.extraData.marketPriceManwon) : ""}
                                            onChange={(e) => handleMetaAmountChange(entry.id, "marketPriceManwon", e.target.value)}
                                            placeholder="현재시세"
                                          />
                                          <span className="asset-input-unit">만원</span>
                                        </div>
                                        <div className="asset-input-wrap">
                                          <input className="asset-input" inputMode="numeric"
                                            value={entry.extraData?.mortgageLoanManwon ? String(entry.extraData.mortgageLoanManwon) : ""}
                                            onChange={(e) => handleMetaAmountChange(entry.id, "mortgageLoanManwon", e.target.value)}
                                            placeholder="주담대"
                                          />
                                          <span className="asset-input-unit">만원</span>
                                        </div>
                                        <div className="asset-input-wrap">
                                          <input className="asset-input" inputMode="numeric"
                                            value={entry.extraData?.mortgageMonthlyPaymentManwon ? String(entry.extraData.mortgageMonthlyPaymentManwon) : ""}
                                            onChange={(e) => handleMetaAmountChange(entry.id, "mortgageMonthlyPaymentManwon", e.target.value)}
                                            placeholder="월 상환액"
                                          />
                                          <span className="asset-input-unit">만원</span>
                                        </div>
                                      </>
                                    ) : (
                                      <>
                                        <div className="asset-input-wrap">
                                          <input className="asset-input" inputMode="numeric"
                                            value={entry.extraData?.depositManwon ? String(entry.extraData.depositManwon) : ""}
                                            onChange={(e) => handleMetaAmountChange(entry.id, "depositManwon", e.target.value)}
                                            placeholder="보증금"
                                          />
                                          <span className="asset-input-unit">만원</span>
                                        </div>
                                        <div className="asset-input-wrap">
                                          <input className="asset-input" inputMode="numeric"
                                            value={entry.extraData?.jeonseMonthlyLoanManwon ? String(entry.extraData.jeonseMonthlyLoanManwon) : ""}
                                            onChange={(e) => handleMetaAmountChange(entry.id, "jeonseMonthlyLoanManwon", e.target.value)}
                                            placeholder="전세대출"
                                          />
                                          <span className="asset-input-unit">만원</span>
                                        </div>
                                        <div className="asset-input-wrap">
                                          <input className="asset-input" inputMode="numeric"
                                            value={entry.extraData?.jeonseMonthlyLoanPaymentManwon ? String(entry.extraData.jeonseMonthlyLoanPaymentManwon) : ""}
                                            onChange={(e) => handleMetaAmountChange(entry.id, "jeonseMonthlyLoanPaymentManwon", e.target.value)}
                                            placeholder="월 상환액"
                                          />
                                          <span className="asset-input-unit">만원</span>
                                        </div>
                                      </>
                                    )}
                                    <div className="realestate-meta-actions">
                                      {entry.subtypeKey === "selfOwned" && (
                                        <>
                                          <div className="realestate-market-query-grid">
                                            <input className="asset-row-input" value={entry.extraData?.marketAptName ?? ""}
                                              onChange={(e) => handleMetaChange(entry.id, "marketAptName", e.target.value)}
                                              placeholder="아파트명"
                                            />
                                            <input className="asset-row-input" value={entry.extraData?.marketAreaM2 ?? ""}
                                              onChange={(e) => handleMetaChange(entry.id, "marketAreaM2", e.target.value)}
                                              placeholder="면적㎡"
                                            />
                                            <input className="asset-row-input" value={entry.extraData?.marketDongName ?? ""}
                                              onChange={(e) => handleMetaChange(entry.id, "marketDongName", e.target.value)}
                                              placeholder="동명"
                                            />
                                            <button className="btn btn-ghost btn-sm" type="button"
                                              disabled={Boolean(lookupLoadingById[entry.id] || !hasRealEstateMarketApiKey)}
                                              onClick={() => handleLookupMarket(entry.id)}
                                            >{lookupLoadingById[entry.id] ? "조회중..." : "시세 조회"}</button>
                                          </div>
                                          {!hasRealEstateMarketApiKey && (
                                            <span className="realestate-lookup-warning">API 키 설정 후 자동 시세 조회 가능</span>
                                          )}
                                          <button className="btn btn-ghost btn-sm" type="button" onClick={() => handleApplyMarket(entry.id)}>
                                            시세 → 자산 반영
                                          </button>
                                        </>
                                      )}
                                      {entry.subtypeKey !== "selfOwned" && (
                                        <span className="asset-subhint">전세/월세는 보증금·전세대출을 기반으로 계산됩니다.</span>
                                      )}
                                      <span className="realestate-effective">반영값: {formatManwon(effective)}</span>
                                      {lookupMsgById[entry.id] && (
                                        <span className="realestate-lookup-message">{lookupMsgById[entry.id]}</span>
                                      )}
                                    </div>
                                  </div>
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>

            {error && <p className="asset-message asset-message-error">{error}</p>}
            {notice && <p className="asset-message asset-message-ok">{notice}</p>}

            <div className="asset-actions">
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? "저장 중..." : "💾 자산 저장"}
              </button>
            </div>
          </form>
        </section>
      </div>

      {/* ── 사이드바 ── */}
      <aside className="asset-chart-panel">
        <div className="asset-chart-head">
          <p className="asset-kicker">ASSET DISTRIBUTION</p>
          <h2>자산 분포</h2>
        </div>

        {donutSlices.length > 0 ? (
          <div className="donut-wrap">
            <DonutChart slices={donutSlices} netAssets={netAssets} />
          </div>
        ) : (
          <div className="asset-empty-state">
            <strong>자산을 입력하면 분포가 표시됩니다.</strong>
          </div>
        )}

        {/* 이력 추이 */}
        {historyData.length >= 2 && (
          <div className="asset-history-panel">
            <p className="asset-kicker" style={{ marginTop: "1.5rem" }}>NET WORTH HISTORY</p>
            <div className="asset-history-chart">
              {(() => {
                const W = 220, H = 64;
                const vals = historyData.map((d) => d.netAssets);
                const min = Math.min(...vals);
                const max = Math.max(...vals);
                const range = max - min || 1;
                const pts = vals.map((v, i) => {
                  const x = (i / (vals.length - 1)) * W;
                  const y = H - 6 - ((v - min) / range) * (H - 12);
                  return `${x.toFixed(1)},${y.toFixed(1)}`;
                }).join(" ");
                const isUp = vals[vals.length - 1] >= vals[0];
                return (
                  <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "64px" }}>
                    <polyline fill="none" stroke={isUp ? "#30d158" : "#ff453a"} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" points={pts} />
                    {historyData.map((d, i) => {
                      const x = (i / (vals.length - 1)) * W;
                      const y = H - 6 - ((vals[i] - min) / range) * (H - 12);
                      return <circle key={i} cx={x} cy={y} r="2.5" fill={isUp ? "#30d158" : "#ff453a"} opacity="0.7" />;
                    })}
                  </svg>
                );
              })()}
              <div className="asset-history-labels">
                <span>{historyData[0]?.date?.slice(5)}</span>
                <span>{historyData[historyData.length - 1]?.date?.slice(5)}</span>
              </div>
            </div>
          </div>
        )}

        {/* 대출 박스 */}
        <div className="asset-liability-box">
          <p>총대출</p>
          <strong>{formatManwon(totalLoans)}</strong>
          <span style={{ fontSize: "0.75rem", opacity: 0.6 }}>부채비율 {debtRatioPct.toFixed(1)}%</span>
        </div>

        {/* 범례 */}
        <div className="asset-legend">
          {positiveCategories
            .filter((cat) => categoryTotals[cat.key] > 0)
            .map((cat) => (
              <div key={cat.key} className="asset-legend-item">
                <span className="asset-legend-dot" style={{ backgroundColor: cat.color }} />
                <span>{cat.label}</span>
                <strong>{formatManwon(categoryTotals[cat.key])}</strong>
                {totalAssets > 0 && (
                  <span className="asset-legend-pct">{((categoryTotals[cat.key] / totalAssets) * 100).toFixed(1)}%</span>
                )}
              </div>
            ))}
        </div>
      </aside>
    </section>
  );
}
