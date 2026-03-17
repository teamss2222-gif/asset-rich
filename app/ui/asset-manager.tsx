"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ASSET_CATEGORIES,
  BANKS,
  CAR_MAKERS,
  DEPOSIT_SUBTYPES,
  REAL_ESTATE_SUBTYPES,
  buildDefaultLabel,
  createEmptyAssetEntry,
  getEffectiveAssetAmountManwon,
  getLinkedLoanAmountManwon,
  getLinkedLoanMonthlyPaymentManwon,
  type AssetCategoryKey,
  type AssetEntry,
  type AssetSubtypeKey,
  type DepositSubtypeKey,
} from "../../lib/assets";

type AssetManagerProps = {
  initialEntries: AssetEntry[];
  hasRealEstateMarketApiKey: boolean;
};
type DraftEntry = AssetEntry;
type DaumPostcodeData = { address?: string; roadAddress?: string; jibunAddress?: string };
type DaumPostcodeCtor = new (opts: { oncomplete: (d: DaumPostcodeData) => void }) => { open: (o?: { popupName?: string }) => void };
declare global { interface Window { daum?: { Postcode?: DaumPostcodeCtor } } }

/* ── formatters ── */
function formatManwon(n: number) {
  const v = Math.round(n);
  if (v >= 10000) {
    const eok = Math.floor(v / 10000);
    const rem = v % 10000;
    return rem > 0
      ? `${new Intl.NumberFormat("ko-KR").format(eok)}억 ${new Intl.NumberFormat("ko-KR").format(rem)}만`
      : `${new Intl.NumberFormat("ko-KR").format(eok)}억원`;
  }
  return `${new Intl.NumberFormat("ko-KR").format(v)}만원`;
}
function formatPct(v: number) { return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`; }

/* ── pie chart size by asset level ── */
function getPieSize(manwon: number) {
  if (manwon < 10000)   return 140; // < 1억
  if (manwon < 30000)   return 164; // 3억
  if (manwon < 50000)   return 188; // 5억
  if (manwon < 100000)  return 216; // 10억
  if (manwon < 300000)  return 252; // 30억
  if (manwon < 500000)  return 288; // 50억
  if (manwon < 1000000) return 324; // 100억
  return 360;
}

/* ── SVG donut/pie chart ── */
function PieChart({ slices, netAssets, size }: {
  slices: { key: string; color: string; share: number }[];
  netAssets: number;
  size: number;
}) {
  const cx = size / 2, cy = size / 2;
  const r = size * 0.34, sw = size * 0.12;
  const C = 2 * Math.PI * r;
  let cum = 0;
  const fs = Math.max(9, Math.round(size * 0.056));
  const vs = Math.max(12, Math.round(size * 0.078));
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} style={{ display: "block" }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={sw} />
      {slices.map((s) => {
        if (s.share <= 0) return null;
        const dash = (s.share / 100) * C;
        const off = C - (cum / 100) * C;
        cum += s.share;
        return (
          <circle key={s.key} cx={cx} cy={cy} r={r} fill="none"
            stroke={s.color} strokeWidth={sw}
            strokeDasharray={`${dash} ${C - dash}`}
            strokeDashoffset={off}
            style={{ transform: "rotate(-90deg)", transformOrigin: `${cx}px ${cy}px` }}
          />
        );
      })}
      <text x={cx} y={cy - fs * 0.7} textAnchor="middle" fill="var(--text-2)" fontSize={fs} fontFamily="inherit">순자산</text>
      <text x={cx} y={cy + vs * 0.9} textAnchor="middle" fill="var(--text-1)" fontSize={vs} fontWeight="700" fontFamily="inherit">
        {netAssets >= 10000
          ? `${Math.floor(netAssets / 10000)}억${netAssets % 10000 > 0 ? ` ${netAssets % 10000}만` : ""}`
          : `${new Intl.NumberFormat("ko-KR").format(Math.round(netAssets))}만`}
      </text>
    </svg>
  );
}

/* ── helpers ── */
function placeholderId(k: AssetCategoryKey, i: number) { return `placeholder-${k}-${i}`; }
function ensureCategoryRows(entries: AssetEntry[]) {
  // "saving" 카테고리를 "deposit"으로 마이그레이션
  const migrated = entries.map((e) =>
    e.categoryKey === "saving"
      ? { ...e, categoryKey: "deposit" as AssetCategoryKey, extraData: { ...e.extraData, depositSubtype: "saving" as DepositSubtypeKey } }
      : e
  );
  const sorted = migrated.map((e, i) => ({ ...e, sortOrder: e.sortOrder ?? i, extraData: e.extraData ?? {} }));
  return ASSET_CATEGORIES.flatMap((cat) => {
    const rows = sorted.filter((e) => e.categoryKey === cat.key);
    return rows.length > 0 ? rows : [createEmptyAssetEntry(cat.key, placeholderId(cat.key, 0), 0)];
  });
}
function newLocalRow(k: AssetCategoryKey, idx: number) {
  return createEmptyAssetEntry(k, `local-${k}-${Date.now()}-${idx}`, idx);
}

/** 자동차 감가상각 잔존가치 계산 (KB차차차 기준 근사치) */
function calcCarResidual(purchaseManwon: number, year: number, mileageKm: number): number {
  if (!purchaseManwon || !year) return 0;
  const now = new Date().getFullYear();
  const age = Math.max(0, now - year);
  const rates = [1.0, 0.75, 0.63, 0.53, 0.45, 0.38, 0.32, 0.27, 0.23, 0.19, 0.16];
  const rate = rates[Math.min(age, rates.length - 1)];
  const avgKm = age * 15000;
  const excessKm = Math.max(0, (mileageKm || 0) - avgKm);
  const mileagePenalty = Math.min(0.15, (excessKm / 100000) * 0.05);
  return Math.max(0, Math.round(purchaseManwon * rate * (1 - mileagePenalty)));
}

function formatWon(won: number) {
  if (won >= 100000000) return `${(won / 100000000).toFixed(2)}억원`;
  if (won >= 10000) return `${(won / 10000).toFixed(0)}만원`;
  return `${won.toLocaleString()}원`;
}

/* ══════════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════════ */
export default function AssetManager({ initialEntries, hasRealEstateMarketApiKey }: AssetManagerProps) {
  const [drafts, setDrafts] = useState<DraftEntry[]>(() => ensureCategoryRows(initialEntries));
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [lookupLoading, setLookupLoading] = useState<Record<string, boolean>>({});
  const [lookupMsg, setLookupMsg] = useState<Record<string, string>>({});
  const [addrReady, setAddrReady] = useState(false);
  const [addrLoading, setAddrLoading] = useState(false);
  const [selectedCat, setSelectedCat] = useState<AssetCategoryKey | null>(null);
  const [monthlyIncome, setMonthlyIncome] = useState(0);
  const [monthlySavings, setMonthlySavings] = useState(0);
  const [monthlyInterest, setMonthlyInterest] = useState(0);
  const [monthlyPrincipal, setMonthlyPrincipal] = useState(0);
  // 주식 검색
  const [stockSearch, setStockSearch] = useState<Record<string, string>>({});
  const [stockResults, setStockResults] = useState<Record<string, Array<{code: string; name: string; market: string}>>>({});
  const stockSearchRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  // 코인 검색
  const [coinSearch, setCoinSearch] = useState<Record<string, string>>({});
  const [coinResults, setCoinResults] = useState<Record<string, Array<{symbol: string; name: string}>>>({});

  /* localStorage cashflow */
  useEffect(() => {
    try {
      const raw = localStorage.getItem("asset-cf");
      if (raw) {
        const p = JSON.parse(raw) as Record<string, number>;
        setMonthlyIncome(p.inc ?? 0);
        setMonthlySavings(p.sav ?? 0);
        setMonthlyInterest(p.int ?? 0);
        setMonthlyPrincipal(p.pri ?? 0);
      }
    } catch { /* ignore */ }
  }, []);
  const saveCF = useCallback((inc: number, sav: number, int: number, pri: number) => {
    try { localStorage.setItem("asset-cf", JSON.stringify({ inc, sav, int, pri })); } catch { /* ignore */ }
  }, []);

  /* addr script — 마운트 시 로드 X, 사용자가 주소검색 클릭할 때만 로드 */
  const ensureAddr = useCallback(() => {
    if (typeof window === "undefined") return;
    if (window.daum?.Postcode) { setAddrReady(true); setAddrLoading(false); return; }
    const ex = document.getElementById("daum-postcode-script") as HTMLScriptElement | null;
    const onOk = () => { setAddrReady(Boolean(window.daum?.Postcode)); setAddrLoading(false); };
    const onErr = () => { setAddrReady(false); setAddrLoading(false); };
    if (ex) {
      if (ex.getAttribute("data-loaded") === "true") { onOk(); return; }
      setAddrLoading(true);
      ex.addEventListener("load", onOk, { once: true });
      ex.addEventListener("error", onErr, { once: true });
      return;
    }
    const s = document.createElement("script");
    s.id = "daum-postcode-script";
    s.src = "https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";
    s.async = true;
    setAddrLoading(true);
    s.onload = () => { s.setAttribute("data-loaded", "true"); onOk(); };
    s.onerror = onErr;
    document.body.appendChild(s);
  }, []);

  /* ── computed ── */
  const catTotals = useMemo(() =>
    ASSET_CATEGORIES.reduce<Record<AssetCategoryKey, number>>((acc, cat) => {
      acc[cat.key] = drafts
        .filter((e) => e.categoryKey === cat.key)
        .reduce((s, e) => s + (Number(getEffectiveAssetAmountManwon(e)) || 0), 0);
      return acc;
    }, { realEstate: 0, deposit: 0, saving: 0, stock: 0, coin: 0, pension: 0, car: 0, other: 0, loan: 0 }),
  [drafts]);
  const positiveCats = ASSET_CATEGORIES.filter((c) => !c.isLiability);
  const totalAssets = positiveCats.reduce((s, c) => s + catTotals[c.key], 0);
  const linkedRELoans = drafts.reduce((s, e) => s + Math.max(0, getLinkedLoanAmountManwon(e)), 0);
  const totalLoans = catTotals.loan + linkedRELoans;
  const netAssets = totalAssets - totalLoans;
  const computedRepayment = drafts.reduce((s, e) => s + Math.max(0, getLinkedLoanMonthlyPaymentManwon(e)), 0);
  const grouped = useMemo(() =>
    ASSET_CATEGORIES.map((cat) => ({
      ...cat,
      total: catTotals[cat.key],
      entries: drafts.filter((e) => e.categoryKey === cat.key).sort((a, b) => a.sortOrder - b.sortOrder),
    })),
  [catTotals, drafts]);
  const slices = useMemo(() =>
    positiveCats
      .map((cat) => ({ key: cat.key, label: cat.label, color: cat.color, amount: catTotals[cat.key], share: totalAssets > 0 ? (catTotals[cat.key] / totalAssets) * 100 : 0 }))
      .filter((s) => s.amount > 0),
  [catTotals, positiveCats, totalAssets]);
  const pieSize = getPieSize(totalAssets);

  /* ── handlers ── */
  const upd = (id: string, fn: (e: DraftEntry) => DraftEntry) =>
    setDrafts((cur) => cur.map((e) => (e.id === id ? fn(e) : e)));

  const handleAmt = (id: string, v: string) => {
    if (!/^\d*$/.test(v)) return;
    upd(id, (e) => ({ ...e, amountManwon: v === "" ? 0 : Number(v) }));
  };
  const handleMeta = (
    id: string,
    key: "address" | "marketSource" | "marketLawdCode" | "marketDealYmd" | "marketAreaM2" | "marketDongName" | "marketAptName",
    v: string,
  ) => upd(id, (e) => ({ ...e, extraData: { ...(e.extraData ?? {}), [key]: v } }));

  const handleMetaAmt = (
    id: string,
    key: "purchasePriceManwon" | "marketPriceManwon" | "depositManwon" | "mortgageLoanManwon"
       | "jeonseMonthlyLoanManwon" | "mortgageMonthlyPaymentManwon" | "jeonseMonthlyLoanPaymentManwon",
    v: string,
  ) => {
    if (!/^\d*$/.test(v)) return;
    upd(id, (e) => ({ ...e, extraData: { ...(e.extraData ?? {}), [key]: v === "" ? 0 : Number(v) } }));
  };

  const applyMarket = (id: string) => upd(id, (e) => {
    const m = Number(e.extraData?.marketPriceManwon ?? 0);
    return m > 0 ? { ...e, amountManwon: m, extraData: { ...(e.extraData ?? {}), marketUpdatedAt: new Date().toISOString() } } : e;
  });

  // ── 주식 핸들러 ──────────────────────────────────────────────────────────

  const searchStock = (id: string, q: string) => {
    setStockSearch((s) => ({ ...s, [id]: q }));
    if (stockSearchRef.current[id]) clearTimeout(stockSearchRef.current[id]);
    if (!q.trim()) { setStockResults((s) => ({ ...s, [id]: [] })); return; }
    stockSearchRef.current[id] = setTimeout(async () => {
      try {
        const res = await fetch(`/api/market/stock?action=search&q=${encodeURIComponent(q)}`);
        const data = await res.json() as { data?: { stocks?: Array<{code: string; name: string; market: string}> } };
        setStockResults((s) => ({ ...s, [id]: data.data?.stocks ?? [] }));
      } catch { /* ignore */ }
    }, 350);
  };

  const selectStock = (id: string, code: string, name: string, market: string) => {
    upd(id, (e) => ({ ...e, label: e.label || name, extraData: { ...(e.extraData ?? {}), stockCode: code, stockMarket: market as "KOSPI" | "KOSDAQ" } }));
    setStockSearch((s) => ({ ...s, [id]: "" }));
    setStockResults((s) => ({ ...s, [id]: [] }));
  };

  const fetchStockPrice = async (id: string) => {
    const entry = drafts.find((e) => e.id === id);
    const code = entry?.extraData?.stockCode ?? "";
    if (!code) { setLookupMsg((c) => ({ ...c, [id]: "종목을 먼저 선택하세요." })); return; }
    setLookupLoading((c) => ({ ...c, [id]: true }));
    setLookupMsg((c) => ({ ...c, [id]: "시세 조회 중..." }));
    try {
      const res = await fetch(`/api/market/stock?action=price&code=${code}`);
      const json = await res.json() as { data?: { currentPriceWon?: number; name?: string; market?: string; changeRate?: number } };
      const d = json.data;
      if (!d?.currentPriceWon) { setLookupMsg((c) => ({ ...c, [id]: "시세 조회 실패" })); return; }
      const qty = Number(entry?.extraData?.stockQty ?? 0);
      upd(id, (e) => ({
        ...e,
        label: e.label || (d.name ?? ""),
        amountManwon: qty > 0 ? Math.round((qty * d.currentPriceWon!) / 10000) : e.amountManwon,
        extraData: {
          ...(e.extraData ?? {}),
          stockCurrentPriceWon: d.currentPriceWon,
          stockMarket: (d.market ?? e.extraData?.stockMarket) as "KOSPI" | "KOSDAQ",
          stockPriceUpdatedAt: new Date().toISOString(),
        },
      }));
      const rate = d.changeRate ?? 0;
      setLookupMsg((c) => ({ ...c, [id]: `${formatWon(d.currentPriceWon!)} (${rate >= 0 ? "+" : ""}${rate.toFixed(2)}%)` }));
    } finally { setLookupLoading((c) => ({ ...c, [id]: false })); }
  };

  const handleStockQty = (id: string, v: string) => {
    if (!/^\d*\.?\d*$/.test(v)) return;
    const qty = v === "" ? 0 : Number(v);
    upd(id, (e) => {
      const price = Number(e.extraData?.stockCurrentPriceWon ?? 0);
      return {
        ...e,
        extraData: { ...(e.extraData ?? {}), stockQty: qty },
        amountManwon: price > 0 ? Math.round((qty * price) / 10000) : e.amountManwon,
      };
    });
  };

  // ── 코인 핸들러 ──────────────────────────────────────────────────────────

  const searchCoin = async (id: string, q: string) => {
    setCoinSearch((s) => ({ ...s, [id]: q }));
    if (!q.trim()) { setCoinResults((s) => ({ ...s, [id]: [] })); return; }
    try {
      const res = await fetch(`/api/market/coin?action=search&q=${encodeURIComponent(q)}`);
      const data = await res.json() as { data?: { coins?: Array<{symbol: string; name: string}> } };
      setCoinResults((s) => ({ ...s, [id]: data.data?.coins ?? [] }));
    } catch { /* ignore */ }
  };

  const selectCoin = (id: string, symbol: string, name: string) => {
    upd(id, (e) => ({ ...e, label: e.label || name, extraData: { ...(e.extraData ?? {}), coinSymbol: symbol, coinName: name } }));
    setCoinSearch((s) => ({ ...s, [id]: "" }));
    setCoinResults((s) => ({ ...s, [id]: [] }));
  };

  const fetchCoinPrice = async (id: string) => {
    const entry = drafts.find((e) => e.id === id);
    const symbol = entry?.extraData?.coinSymbol ?? "";
    if (!symbol) { setLookupMsg((c) => ({ ...c, [id]: "코인을 먼저 선택하세요." })); return; }
    setLookupLoading((c) => ({ ...c, [id]: true }));
    setLookupMsg((c) => ({ ...c, [id]: "시세 조회 중..." }));
    try {
      const res = await fetch(`/api/market/coin?action=price&symbol=${symbol}`);
      const json = await res.json() as { data?: { currentPriceWon?: number; changeRate?: number } };
      const d = json.data;
      if (!d?.currentPriceWon) { setLookupMsg((c) => ({ ...c, [id]: "시세 조회 실패" })); return; }
      const qty = Number(entry?.extraData?.coinQty ?? 0);
      upd(id, (e) => ({
        ...e,
        amountManwon: qty > 0 ? Math.round((qty * d.currentPriceWon!) / 10000) : e.amountManwon,
        extraData: {
          ...(e.extraData ?? {}),
          coinCurrentPriceWon: d.currentPriceWon,
          coinPriceUpdatedAt: new Date().toISOString(),
        },
      }));
      const rate = d.changeRate ?? 0;
      setLookupMsg((c) => ({ ...c, [id]: `${formatWon(d.currentPriceWon!)} (${rate >= 0 ? "+" : ""}${rate.toFixed(2)}%)` }));
    } finally { setLookupLoading((c) => ({ ...c, [id]: false })); }
  };

  const handleCoinQty = (id: string, v: string) => {
    if (!/^\d*\.?\d*$/.test(v)) return;
    const qty = v === "" ? 0 : Number(v);
    upd(id, (e) => {
      const price = Number(e.extraData?.coinCurrentPriceWon ?? 0);
      return {
        ...e,
        extraData: { ...(e.extraData ?? {}), coinQty: qty },
        amountManwon: price > 0 ? Math.round((qty * price) / 10000) : e.amountManwon,
      };
    });
  };

  // ── 자동차 핸들러 ─────────────────────────────────────────────────────────

  const calcCarValue = (id: string) => {
    upd(id, (e) => {
      const purchase = Number(e.extraData?.carPurchasePriceManwon ?? 0);
      const year = Number(e.extraData?.carYear ?? 0);
      const mileage = Number(e.extraData?.carMileageKm ?? 0);
      const est = calcCarResidual(purchase, year, mileage);
      return { ...e, extraData: { ...(e.extraData ?? {}), carEstimatedPriceManwon: est }, amountManwon: est };
    });
  };

  const lookupMarket = async (id: string) => {
    const t = drafts.find((e) => e.id === id);
    if (!t) return;
    const lawdCode = (t.extraData?.marketLawdCode ?? "").trim();
    const now = new Date();
    const dealYmd = (t.extraData?.marketDealYmd ?? "").trim() || `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
    if (!/^\d{5}$/.test(lawdCode)) { setLookupMsg((c) => ({ ...c, [id]: "법정동코드 5자리 입력" })); return; }
    setLookupLoading((c) => ({ ...c, [id]: true }));
    setLookupMsg((c) => ({ ...c, [id]: "시세 조회 중..." }));
    try {
      const res = await fetch("/api/market/real-estate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lawdCode, dealYmd, apartmentName: (t.extraData?.marketAptName || t.label || t.extraData?.address || "").trim(), areaM2: Number(t.extraData?.marketAreaM2) || 0, dongName: (t.extraData?.marketDongName ?? "").trim() }),
      });
      const data = await res.json() as { message?: string; marketPriceManwon?: number; sampleCount?: number; source?: string; asOf?: string; strategy?: string };
      const mp = data.marketPriceManwon;
      if (!res.ok || typeof mp !== "number" || mp <= 0) { setLookupMsg((c) => ({ ...c, [id]: data.message ?? "조회 실패" })); return; }
      upd(id, (e) => ({ ...e, extraData: { ...(e.extraData ?? {}), marketPriceManwon: mp, marketSource: data.source ?? "", marketUpdatedAt: data.asOf ?? new Date().toISOString() } }));
      setLookupMsg((c) => ({ ...c, [id]: data.strategy === "latest_trade_fallback" ? `최신 실거래 ${formatManwon(mp)}` : `평균 (${data.sampleCount ?? 0}건): ${formatManwon(mp)}` }));
    } finally { setLookupLoading((c) => ({ ...c, [id]: false })); }
  };

  const lookupLawd = async (id: string, addr: string) => {
    if (addr.length < 2) { setLookupMsg((c) => ({ ...c, [id]: "주소를 먼저 입력해주세요." })); return; }
    setLookupLoading((c) => ({ ...c, [id]: true }));
    setLookupMsg((c) => ({ ...c, [id]: "법정동코드 조회 중..." }));
    try {
      const res = await fetch("/api/market/lawd-code", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address: addr }) });
      const data = await res.json() as { message?: string; lawdCode?: string };
      if (!res.ok || !data.lawdCode) { setLookupMsg((c) => ({ ...c, [id]: data.message ?? "조회 실패" })); return; }
      upd(id, (e) => ({ ...e, extraData: { ...(e.extraData ?? {}), marketLawdCode: data.lawdCode } }));
      setLookupMsg((c) => ({ ...c, [id]: `법정동코드 ${data.lawdCode} 자동 입력` }));
    } finally { setLookupLoading((c) => ({ ...c, [id]: false })); }
  };

  const openAddr = (id: string, autoLookup: boolean) => {
    if (addrLoading) { setLookupMsg((c) => ({ ...c, [id]: "팝업 로딩 중..." })); return; }
    if (!window.daum?.Postcode) { ensureAddr(); setLookupMsg((c) => ({ ...c, [id]: "한 번 더 눌러주세요." })); return; }
    new window.daum.Postcode({
      oncomplete: (data) => {
        const addr = (data.roadAddress ?? "").trim() || (data.jibunAddress ?? "").trim() || (data.address ?? "").trim();
        if (!addr) return;
        upd(id, (e) => ({ ...e, extraData: { ...(e.extraData ?? {}), address: addr } }));
        const dong = addr.match(/(\S+[동리읍면])(?:\s|$)/)?.[1];
        if (dong) upd(id, (e) => ({ ...e, extraData: { ...(e.extraData ?? {}), marketDongName: dong } }));
        if (autoLookup) void lookupLawd(id, addr);
      },
    }).open({ popupName: "asset-addr" });
  };

  const addEntry = (k: AssetCategoryKey) =>
    setDrafts((cur) => [...cur, newLocalRow(k, cur.filter((e) => e.categoryKey === k).length)]);

  const removeEntry = (id: string) =>
    setDrafts((cur) => {
      const t = cur.find((e) => e.id === id);
      if (!t) return cur;
      const next = cur.filter((e) => e.id !== id);
      const rem = next.filter((e) => e.categoryKey === t.categoryKey);
      return rem.length > 0 ? next : [...next, createEmptyAssetEntry(t.categoryKey, placeholderId(t.categoryKey, 0), 0)];
    });

  const handleSubmit = async (evt: React.FormEvent<HTMLFormElement>) => {
    evt.preventDefault();
    setSaving(true); setNotice(""); setError("");
    const payload = drafts.flatMap((e, i) => {
      const label = e.label.trim();
      const amt = Number(e.amountManwon) || 0;
      const extra = e.extraData ?? {};
      const hasMeta = ["purchasePriceManwon","marketPriceManwon","depositManwon","mortgageLoanManwon","jeonseMonthlyLoanManwon","mortgageMonthlyPaymentManwon","jeonseMonthlyLoanPaymentManwon"]
        .some((k) => Number((extra as Record<string, unknown>)[k] ?? 0) > 0) || Boolean((extra.address ?? "").trim());
      if (!label && amt <= 0 && !hasMeta) return [];
      return [{ categoryKey: e.categoryKey, subtypeKey: e.categoryKey === "realEstate" ? (e.subtypeKey ?? "selfOwned") : null, label: label || buildDefaultLabel(e.categoryKey, i + 1, e.subtypeKey), amountManwon: amt, extraData: extra, sortOrder: i }];
    });
    const res = await fetch("/api/assets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entries: payload }) });
    const data = await res.json() as { message?: string };
    setSaving(false);
    if (!res.ok) { setError(data.message ?? "저장 실패"); return; }
    setNotice("✅ 저장 완료!");
  };

  /* ══════════ RENDER ══════════ */
  return (
    <div className="asset-split">

      {/* ── LEFT: 자산 분포 + 요약 ── */}
      <div className="asset-left-col">
        <p className="asset-kicker">ASSET DISTRIBUTION</p>

        {slices.length > 0 ? (
          <div className="asset-pie-center">
            <PieChart slices={slices} netAssets={netAssets} size={pieSize} />
          </div>
        ) : (
          <div className="asset-pie-empty">자산을 입력하면<br />분포가 표시됩니다</div>
        )}

        {slices.length > 0 && (
          <div className="asset-legend-simple">
            {slices.map((s) => (
              <div key={s.key} className="asset-legend-row">
                <span className="asset-legend-dot" style={{ backgroundColor: s.color }} />
                <span className="asset-legend-label">{s.label}</span>
                <span className="asset-legend-pct">{s.share.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        )}

        <div className="asset-stat-list">
          <div className="asset-stat-row asset-stat-net">
            <span>총 순자산</span>
            <strong>{formatManwon(netAssets)}</strong>
          </div>
          <div className="asset-stat-row">
            <span>총자산</span>
            <span>{formatManwon(totalAssets)}</span>
          </div>
          <div className="asset-stat-row asset-stat-warn">
            <span>총대출</span>
            <span>{formatManwon(totalLoans)}</span>
          </div>
          <div className="asset-stat-divider" />
          <div className="asset-stat-row">
            <span>월 소득액</span>
            <div className="asset-inline-input">
              <input inputMode="numeric" value={monthlyIncome || ""} placeholder="0"
                onChange={(e) => { const v = Number(e.target.value.replace(/\D/g, "")) || 0; setMonthlyIncome(v); saveCF(v, monthlySavings, monthlyInterest, monthlyPrincipal); }} />
              <span>만원</span>
            </div>
          </div>
          <div className="asset-stat-row">
            <span>월 저축액</span>
            <div className="asset-inline-input">
              <input inputMode="numeric" value={monthlySavings || ""} placeholder="0"
                onChange={(e) => { const v = Number(e.target.value.replace(/\D/g, "")) || 0; setMonthlySavings(v); saveCF(monthlyIncome, v, monthlyInterest, monthlyPrincipal); }} />
              <span>만원</span>
            </div>
          </div>
          <div className="asset-stat-divider" />
          <div className="asset-stat-row">
            <span>월 상환 이자</span>
            <div className="asset-inline-input">
              <input inputMode="numeric" value={monthlyInterest || ""} placeholder="0"
                onChange={(e) => { const v = Number(e.target.value.replace(/\D/g, "")) || 0; setMonthlyInterest(v); saveCF(monthlyIncome, monthlySavings, v, monthlyPrincipal); }} />
              <span>만원</span>
            </div>
          </div>
          <div className="asset-stat-row">
            <span>월 상환 원금</span>
            <div className="asset-inline-input">
              <input inputMode="numeric" value={monthlyPrincipal || ""} placeholder="0"
                onChange={(e) => { const v = Number(e.target.value.replace(/\D/g, "")) || 0; setMonthlyPrincipal(v); saveCF(monthlyIncome, monthlySavings, monthlyInterest, v); }} />
              <span>만원</span>
            </div>
          </div>
          {computedRepayment > 0 && (
            <div className="asset-stat-hint">부동산 자동계산 {formatManwon(computedRepayment)}/월 별도</div>
          )}
        </div>
      </div>

      {/* ── RIGHT: 자산 입력 ── */}
      <div className="asset-right-col">
        <p className="asset-kicker">ASSET LEDGER</p>

        <div className="asset-cat-tab-bar">
          {ASSET_CATEGORIES.map((cat) => (
            <button key={cat.key} type="button"
              className={`asset-cat-tab${cat.isLiability ? " liability" : ""}`}
              style={selectedCat === cat.key ? { borderColor: cat.color, color: cat.color, background: `${cat.color}22` } : undefined}
              onClick={() => setSelectedCat(selectedCat === cat.key ? null : cat.key)}
            >
              {cat.label}
              {catTotals[cat.key] > 0 && <span className="asset-cat-dot" style={{ background: cat.color }} />}
            </button>
          ))}
        </div>

        {!selectedCat && (
          <div className="asset-cat-hint">위에서 카테고리를 선택하여 자산을 입력하세요</div>
        )}

        {selectedCat && (() => {
          const catMeta = ASSET_CATEGORIES.find((c) => c.key === selectedCat)!;
          const group = grouped.find((g) => g.key === selectedCat)!;
          return (
            <form className="asset-form" onSubmit={handleSubmit}>
              <div className="asset-cat-form-header">
                <span className="asset-group-dot" style={{ background: catMeta.color }} />
                <strong>{catMeta.label}</strong>
                <span className="asset-cat-form-desc">{catMeta.description}</span>
                <span className="asset-cat-form-total">{formatManwon(group.total)}</span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => addEntry(selectedCat)}>+ 추가</button>
              </div>

              <div className="asset-row-stack">
                {group.entries.map((entry, idx) => {
                  const effective = getEffectiveAssetAmountManwon(entry);
                  return (
                    <div key={entry.id} className="asset-row-card">
                      <div className="asset-row">
                        {catMeta.supportsSubtype && (
                          <select className="asset-select" value={entry.subtypeKey ?? "selfOwned"}
                            onChange={(e) => upd(entry.id, (d) => ({ ...d, subtypeKey: e.target.value as AssetSubtypeKey }))}>
                            {REAL_ESTATE_SUBTYPES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                          </select>
                        )}
                        <input className="asset-row-input asset-row-label"
                          value={entry.label}
                          onChange={(e) => upd(entry.id, (d) => ({ ...d, label: e.target.value }))}
                          placeholder={buildDefaultLabel(group.key, idx + 1, entry.subtypeKey)}
                        />
                        <div className="asset-input-wrap">
                          <input className="asset-input" inputMode="numeric"
                            value={entry.amountManwon === 0 ? "" : String(entry.amountManwon)}
                            onChange={(e) => handleAmt(entry.id, e.target.value)}
                            placeholder="0"
                          />
                          <span className="asset-input-unit">만원</span>
                        </div>
                        <button className="asset-row-remove" type="button" onClick={() => removeEntry(entry.id)}>삭제</button>
                      </div>

                      {group.key === "realEstate" && (
                        <>
                          <div className="realestate-address-row">
                            <input className="asset-row-input" value={entry.extraData?.address ?? ""} readOnly
                              onClick={() => openAddr(entry.id, entry.subtypeKey === "selfOwned")}
                              placeholder={addrReady ? "주소 입력(클릭 시 팝업)" : "주소 로딩 중..."}
                              style={{ cursor: "pointer" }}
                            />
                            <button className="btn btn-primary btn-sm" type="button" onClick={() => openAddr(entry.id, entry.subtypeKey === "selfOwned")}>🔍 검색</button>
                          </div>
                          <div className="realestate-meta-grid">
                            {entry.subtypeKey === "selfOwned" ? (
                              <>
                                <div className="asset-input-wrap">
                                  <input className="asset-input" inputMode="numeric"
                                    value={entry.extraData?.purchasePriceManwon ? String(entry.extraData.purchasePriceManwon) : ""}
                                    onChange={(e) => handleMetaAmt(entry.id, "purchasePriceManwon", e.target.value)} placeholder="매입가" />
                                  <span className="asset-input-unit">만원</span>
                                </div>
                                <div className="asset-input-wrap">
                                  <input className="asset-input" inputMode="numeric"
                                    value={entry.extraData?.marketPriceManwon ? String(entry.extraData.marketPriceManwon) : ""}
                                    onChange={(e) => handleMetaAmt(entry.id, "marketPriceManwon", e.target.value)} placeholder="현재시세" />
                                  <span className="asset-input-unit">만원</span>
                                </div>
                                <div className="asset-input-wrap">
                                  <input className="asset-input" inputMode="numeric"
                                    value={entry.extraData?.mortgageLoanManwon ? String(entry.extraData.mortgageLoanManwon) : ""}
                                    onChange={(e) => handleMetaAmt(entry.id, "mortgageLoanManwon", e.target.value)} placeholder="주담대" />
                                  <span className="asset-input-unit">만원</span>
                                </div>
                                <div className="asset-input-wrap">
                                  <input className="asset-input" inputMode="numeric"
                                    value={entry.extraData?.mortgageMonthlyPaymentManwon ? String(entry.extraData.mortgageMonthlyPaymentManwon) : ""}
                                    onChange={(e) => handleMetaAmt(entry.id, "mortgageMonthlyPaymentManwon", e.target.value)} placeholder="월 상환액" />
                                  <span className="asset-input-unit">만원</span>
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="asset-input-wrap">
                                  <input className="asset-input" inputMode="numeric"
                                    value={entry.extraData?.depositManwon ? String(entry.extraData.depositManwon) : ""}
                                    onChange={(e) => handleMetaAmt(entry.id, "depositManwon", e.target.value)} placeholder="보증금" />
                                  <span className="asset-input-unit">만원</span>
                                </div>
                                <div className="asset-input-wrap">
                                  <input className="asset-input" inputMode="numeric"
                                    value={entry.extraData?.jeonseMonthlyLoanManwon ? String(entry.extraData.jeonseMonthlyLoanManwon) : ""}
                                    onChange={(e) => handleMetaAmt(entry.id, "jeonseMonthlyLoanManwon", e.target.value)} placeholder="전세대출" />
                                  <span className="asset-input-unit">만원</span>
                                </div>
                                <div className="asset-input-wrap">
                                  <input className="asset-input" inputMode="numeric"
                                    value={entry.extraData?.jeonseMonthlyLoanPaymentManwon ? String(entry.extraData.jeonseMonthlyLoanPaymentManwon) : ""}
                                    onChange={(e) => handleMetaAmt(entry.id, "jeonseMonthlyLoanPaymentManwon", e.target.value)} placeholder="월 상환액" />
                                  <span className="asset-input-unit">만원</span>
                                </div>
                              </>
                            )}
                            <div className="realestate-meta-actions">
                              {entry.subtypeKey === "selfOwned" && (
                                <>
                                  <div className="realestate-market-query-grid">
                                    <input className="asset-row-input" value={entry.extraData?.marketAptName ?? ""}
                                      onChange={(e) => handleMeta(entry.id, "marketAptName", e.target.value)} placeholder="아파트명" />
                                    <input className="asset-row-input" value={entry.extraData?.marketAreaM2 ?? ""}
                                      onChange={(e) => handleMeta(entry.id, "marketAreaM2", e.target.value)} placeholder="면적㎡" />
                                    <input className="asset-row-input" value={entry.extraData?.marketDongName ?? ""}
                                      onChange={(e) => handleMeta(entry.id, "marketDongName", e.target.value)} placeholder="동명" />
                                    <button className="btn btn-ghost btn-sm" type="button"
                                      disabled={Boolean(lookupLoading[entry.id] || !hasRealEstateMarketApiKey)}
                                      onClick={() => lookupMarket(entry.id)}>
                                      {lookupLoading[entry.id] ? "조회중..." : "시세 조회"}
                                    </button>
                                  </div>
                                  {!hasRealEstateMarketApiKey && (
                                    <span className="realestate-lookup-warning">API 키 설정 후 자동 시세 조회 가능</span>
                                  )}
                                  <button className="btn btn-ghost btn-sm" type="button" onClick={() => applyMarket(entry.id)}>
                                    시세 → 자산 반영
                                  </button>
                                </>
                              )}
                              {entry.subtypeKey !== "selfOwned" && (
                                <span className="asset-subhint">전세/월세는 보증금·전세대출을 기반으로 계산됩니다.</span>
                              )}
                              <span className="realestate-effective">반영값: {formatManwon(effective)}</span>
                              {lookupMsg[entry.id] && <span className="realestate-lookup-message">{lookupMsg[entry.id]}</span>}
                            </div>
                          </div>
                        </>
                      )}

                      {/* ── 예금·적금 ──────────────────────────────── */}
                      {group.key === "deposit" && (
                        <div className="asset-deposit-meta">
                          <select className="asset-select" value={entry.extraData?.bankName ?? ""}
                            onChange={(e) => upd(entry.id, (d) => ({ ...d, extraData: { ...(d.extraData ?? {}), bankName: e.target.value } }))}>
                            <option value="">은행 선택</option>
                            {BANKS.map((b) => <option key={b} value={b}>{b}</option>)}
                          </select>
                          <select className="asset-select" value={entry.extraData?.depositSubtype ?? "checking"}
                            onChange={(e) => upd(entry.id, (d) => ({ ...d, extraData: { ...(d.extraData ?? {}), depositSubtype: e.target.value as DepositSubtypeKey } }))}>
                            {DEPOSIT_SUBTYPES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                          </select>
                        </div>
                      )}

                      {/* ── 주식 ────────────────────────────────────── */}
                      {group.key === "stock" && (
                        <div className="asset-market-meta">
                          <div className="asset-search-row">
                            <div className="asset-search-wrap">
                              <input className="asset-row-input" placeholder="종목명 검색 (예: 삼성전자)"
                                value={stockSearch[entry.id] ?? ""}
                                onChange={(e) => searchStock(entry.id, e.target.value)}
                              />
                              {entry.extraData?.stockCode && (
                                <span className="asset-code-badge">{entry.extraData.stockMarket ?? ""} {entry.extraData.stockCode}</span>
                              )}
                              {(stockResults[entry.id]?.length ?? 0) > 0 && (
                                <ul className="asset-search-dropdown">
                                  {stockResults[entry.id].map((r) => (
                                    <li key={r.code} onClick={() => selectStock(entry.id, r.code, r.name, r.market)}>
                                      <span className="asset-dd-name">{r.name}</span>
                                      <span className="asset-dd-code">{r.market} {r.code}</span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                            <div className="asset-qty-wrap">
                              <input className="asset-input" inputMode="numeric" placeholder="수량"
                                value={entry.extraData?.stockQty ?? ""}
                                onChange={(e) => handleStockQty(entry.id, e.target.value)}
                              />
                              <span className="asset-input-unit">주</span>
                            </div>
                            <button className="btn btn-ghost btn-sm" type="button"
                              disabled={lookupLoading[entry.id]}
                              onClick={() => fetchStockPrice(entry.id)}>
                              {lookupLoading[entry.id] ? "조회중..." : "📈 현재가"}
                            </button>
                          </div>
                          {entry.extraData?.stockCurrentPriceWon && (
                            <div className="asset-price-row">
                              <span className="asset-price-label">현재가</span>
                              <span className="asset-price-val">{formatWon(entry.extraData.stockCurrentPriceWon)}</span>
                              {(entry.extraData.stockQty ?? 0) > 0 && (
                                <span className="asset-price-total">× {entry.extraData.stockQty}주 = {formatManwon(Math.round((entry.extraData.stockQty! * entry.extraData.stockCurrentPriceWon) / 10000))}</span>
                              )}
                              {entry.extraData.stockPriceUpdatedAt && (
                                <span className="asset-price-time">{new Date(entry.extraData.stockPriceUpdatedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })} 기준</span>
                              )}
                            </div>
                          )}
                          {lookupMsg[entry.id] && <span className="realestate-lookup-message">{lookupMsg[entry.id]}</span>}
                        </div>
                      )}

                      {/* ── 코인 ────────────────────────────────────── */}
                      {group.key === "coin" && (
                        <div className="asset-market-meta">
                          <div className="asset-search-row">
                            <div className="asset-search-wrap">
                              <input className="asset-row-input" placeholder="코인명 검색 (예: 비트코인)"
                                value={coinSearch[entry.id] ?? ""}
                                onChange={(e) => {
                                  void searchCoin(entry.id, e.target.value);
                                  setCoinSearch((s) => ({ ...s, [entry.id]: e.target.value }));
                                }}
                              />
                              {entry.extraData?.coinSymbol && (
                                <span className="asset-code-badge">KRW-{entry.extraData.coinSymbol}</span>
                              )}
                              {(coinResults[entry.id]?.length ?? 0) > 0 && (
                                <ul className="asset-search-dropdown">
                                  {coinResults[entry.id].map((r) => (
                                    <li key={r.symbol} onClick={() => selectCoin(entry.id, r.symbol, r.name)}>
                                      <span className="asset-dd-name">{r.name}</span>
                                      <span className="asset-dd-code">{r.symbol}</span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                            <div className="asset-qty-wrap">
                              <input className="asset-input" placeholder="수량"
                                value={entry.extraData?.coinQty ?? ""}
                                onChange={(e) => handleCoinQty(entry.id, e.target.value)}
                              />
                              <span className="asset-input-unit">개</span>
                            </div>
                            <button className="btn btn-ghost btn-sm" type="button"
                              disabled={lookupLoading[entry.id]}
                              onClick={() => fetchCoinPrice(entry.id)}>
                              {lookupLoading[entry.id] ? "조회중..." : "🪙 현재가"}
                            </button>
                          </div>
                          {entry.extraData?.coinCurrentPriceWon && (
                            <div className="asset-price-row">
                              <span className="asset-price-label">현재가</span>
                              <span className="asset-price-val">{formatWon(entry.extraData.coinCurrentPriceWon)}</span>
                              {(entry.extraData.coinQty ?? 0) > 0 && (
                                <span className="asset-price-total">× {entry.extraData.coinQty}개 = {formatManwon(Math.round((entry.extraData.coinQty! * entry.extraData.coinCurrentPriceWon) / 10000))}</span>
                              )}
                              {entry.extraData.coinPriceUpdatedAt && (
                                <span className="asset-price-time">{new Date(entry.extraData.coinPriceUpdatedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })} 기준</span>
                              )}
                            </div>
                          )}
                          {lookupMsg[entry.id] && <span className="realestate-lookup-message">{lookupMsg[entry.id]}</span>}
                        </div>
                      )}

                      {/* ── 자동차 ──────────────────────────────────── */}
                      {group.key === "car" && (
                        <div className="asset-car-meta">
                          <div className="asset-car-grid">
                            <select className="asset-select" value={entry.extraData?.carMaker ?? ""}
                              onChange={(e) => upd(entry.id, (d) => ({ ...d, extraData: { ...(d.extraData ?? {}), carMaker: e.target.value } }))}>
                              <option value="">제조사 선택</option>
                              {CAR_MAKERS.map((m) => <option key={m} value={m}>{m}</option>)}
                            </select>
                            <input className="asset-row-input" placeholder="차종 (예: 아반떼 N·1.6T)"
                              value={entry.extraData?.carModel ?? ""}
                              onChange={(e) => upd(entry.id, (d) => ({ ...d, extraData: { ...(d.extraData ?? {}), carModel: e.target.value } }))}
                            />
                            <div className="asset-input-wrap">
                              <input className="asset-input" inputMode="numeric" placeholder="연식"
                                value={entry.extraData?.carYear ?? ""}
                                onChange={(e) => {
                                  const v = Number(e.target.value.replace(/\D/g, "")) || undefined;
                                  upd(entry.id, (d) => ({ ...d, extraData: { ...(d.extraData ?? {}), carYear: v } }));
                                }}
                              />
                              <span className="asset-input-unit">년</span>
                            </div>
                            <div className="asset-input-wrap">
                              <input className="asset-input" inputMode="numeric" placeholder="주행거리"
                                value={entry.extraData?.carMileageKm ?? ""}
                                onChange={(e) => {
                                  const v = Number(e.target.value.replace(/\D/g, "")) || undefined;
                                  upd(entry.id, (d) => ({ ...d, extraData: { ...(d.extraData ?? {}), carMileageKm: v } }));
                                }}
                              />
                              <span className="asset-input-unit">km</span>
                            </div>
                            <div className="asset-input-wrap">
                              <input className="asset-input" inputMode="numeric" placeholder="구매가"
                                value={entry.extraData?.carPurchasePriceManwon ?? ""}
                                onChange={(e) => {
                                  const v = Number(e.target.value.replace(/\D/g, "")) || undefined;
                                  upd(entry.id, (d) => ({ ...d, extraData: { ...(d.extraData ?? {}), carPurchasePriceManwon: v } }));
                                }}
                              />
                              <span className="asset-input-unit">만원</span>
                            </div>
                            <button className="btn btn-ghost btn-sm" type="button" onClick={() => calcCarValue(entry.id)}>
                              🚗 잔존가치 계산
                            </button>
                          </div>
                          {(entry.extraData?.carEstimatedPriceManwon ?? 0) > 0 && (
                            <div className="asset-car-result">
                              <span className="asset-price-label">추정 중고가</span>
                              <strong className="asset-price-val">{formatManwon(entry.extraData!.carEstimatedPriceManwon!)}</strong>
                              <span className="asset-price-time">
                                (구매가 {entry.extraData?.carPurchasePriceManwon ? formatManwon(entry.extraData.carPurchasePriceManwon) : "-"} 기준 KB감가상각 근사치 / 실제와 차이 있을 수 있음)
                              </span>
                            </div>
                          )}
                          {!entry.extraData?.carEstimatedPriceManwon && (
                            <p className="asset-subhint">제조사·차종·연식·주행거리·구매가 입력 후 "잔존가치 계산" 클릭 → 금액 자동 반영<br/>※ KB차차차 기준 감가상각 공식 적용 (실제 중고가는 차이 있을 수 있음)</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {error && <p className="asset-message asset-message-error">{error}</p>}
              {notice && <p className="asset-message asset-message-ok">{notice}</p>}
              <div className="asset-actions">
                <button className="btn btn-primary" type="submit" disabled={saving}>
                  {saving ? "저장 중..." : "💾 저장"}
                </button>
              </div>
            </form>
          );
        })()}
      </div>
    </div>
  );
}