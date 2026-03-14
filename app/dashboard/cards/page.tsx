"use client";

import { useState, useEffect, useCallback } from "react";

interface CardBenefit {
  category: string;
  summary: string;
}

interface Card {
  gorilla_id: number;
  name: string;
  company: string;
  annual_fee: string;
  min_spending: string;
  brand: string;
  image_url: string;
  crawled_at: string;
  benefits: CardBenefit[];
}

export default function CardsPage() {
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [crawling, setCrawling] = useState(false);
  const [crawlMsg, setCrawlMsg] = useState("");
  const [selected, setSelected] = useState<Card | null>(null);
  const [filter, setFilter] = useState("");

  const fetchCards = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/cards");
      const json = await res.json();
      if (json.ok) setCards(json.data ?? []);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchCards(); }, [fetchCards]);

  const [crawlProgress, setCrawlProgress] = useState({ done: 0, total: 0, current: "" });
  const [seeding, setSeeding] = useState(false);
  const [crawlSource, setCrawlSource] = useState("");

  const loadSampleData = async () => {
    setSeeding(true);
    setCrawlMsg("");
    try {
      const res = await fetch("/api/cards/seed", { method: "POST" });
      const json = await res.json() as { ok: boolean; message?: string };
      if (json.ok) {
        setCrawlMsg(`✅ ${json.message ?? "샘플 데이터 추가 완료"}`);
        await fetchCards();
      } else {
        setCrawlMsg("⚠️ 샘플 데이터 추가 실패");
      }
    } catch {
      setCrawlMsg("⚠️ 서버 오류");
    }
    setSeeding(false);
    setTimeout(() => setCrawlMsg(""), 5000);
  };

  const startCrawl = async () => {
    setCrawling(true);
    setCrawlMsg("");

    // 1) ID 목록 가져오기
    let ids: number[] = [];
    try {
      const idRes = await fetch("/api/cards/ids");
      const idJson = await idRes.json();
      ids = idJson.data ?? [];
    } catch {
      setCrawlMsg("카드 ID 목록 조회 실패");
      setCrawling(false);
      return;
    }

    // 2) 1장씩 크롤링
    let success = 0;
    let failed = 0;
    setCrawlProgress({ done: 0, total: ids.length, current: "준비 중..." });

    for (let i = 0; i < ids.length; i++) {
      setCrawlProgress({ done: i, total: ids.length, current: `카드 #${ids[i]} 크롤링 중...` });
      try {
        const res = await fetch("/api/cards/crawl", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cardId: ids[i] }),
        });
        const json = await res.json();
        if (json.ok && json.data?.ok) {
          success++;
          setCrawlProgress({ done: i + 1, total: ids.length, current: `✅ ${json.data.name}` });
        } else {
          failed++;
          setCrawlProgress({ done: i + 1, total: ids.length, current: `❌ 카드 #${ids[i]} 실패` });
        }
      } catch {
        failed++;
        setCrawlProgress({ done: i + 1, total: ids.length, current: `❌ 카드 #${ids[i]} 오류` });
      }
    }

    setCrawlMsg(`완료! 성공: ${success} / 실패: ${failed}`);
    setCrawlProgress({ done: 0, total: 0, current: "" });
    await fetchCards();
    setCrawling(false);
  };

  const filtered = cards.filter(
    (c) =>
      !filter ||
      c.name.includes(filter) ||
      c.company.includes(filter) ||
      c.benefits.some(
        (b) => b.category.includes(filter) || b.summary.includes(filter),
      ),
  );

  if (selected) {
    return (
      <div className="cards-page">
        <button className="btn btn-ghost btn-sm" onClick={() => setSelected(null)}>
          ← 목록으로
        </button>

        <div className="card-detail-wrap">
          <div className="card-detail-header">
            {selected.image_url && (
              <img
                src={selected.image_url}
                alt={selected.name}
                className="card-detail-img"
              />
            )}
            <div className="card-detail-info">
              <h2 className="card-detail-name">{selected.name}</h2>
              <p className="card-detail-company">{selected.company}</p>
              <div className="card-detail-meta">
                {selected.annual_fee && <span>연회비: {selected.annual_fee}</span>}
                {selected.min_spending && <span>전월실적: {selected.min_spending}</span>}
                {selected.brand && <span>브랜드: {selected.brand}</span>}
              </div>
            </div>
          </div>

          <h3 className="card-benefits-title">💰 혜택</h3>
          <ul className="card-benefits-list">
            {selected.benefits.length > 0 ? (
              selected.benefits.map((b, i) => (
                <li key={i} className="card-benefit-item">
                  <span className="card-benefit-cat">{b.category || "기타"}</span>
                  <span className="card-benefit-txt">{b.summary}</span>
                </li>
              ))
            ) : (
              <li className="card-benefit-item">혜택 정보 없음</li>
            )}
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className="cards-page">
      <div className="cards-header">
        <h1 className="cards-title">💳 카드 혜택 비교</h1>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={loadSampleData}
            disabled={seeding || crawling}
          >
            {seeding ? "로드 중..." : "📂 샘플 데이터"}
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={startCrawl}
            disabled={crawling || seeding}
            title="카드고릴라 사이트를 스캔하여 카드 ID를 자동 수집 후 크롤링"
          >
            {crawling
              ? crawlProgress.total > 0
                ? `🔄 ${crawlProgress.done}/${crawlProgress.total}`
                : "🔍 ID 수집 중…"
              : "🔄 크롤링 실행"}
          </button>
        </div>
      </div>

      {crawlMsg && <p className="crawl-msg">{crawlMsg}</p>}
      {crawlSource && !crawling && (
        <p className="crawl-msg" style={{ opacity: 0.65, fontSize: "0.75rem" }}>
          ID 수집 경로: {crawlSource === "live" ? "카드고릴라 실시간 스캔" : crawlSource === "mixed" ? "혼합(live+폴백)" : "폴백 ID"}
        </p>
      )}

      {crawling && crawlProgress.total > 0 && (
        <div className="crawl-progress">
          <div className="crawl-progress-bar">
            <div
              className="crawl-progress-fill"
              style={{ width: `${(crawlProgress.done / crawlProgress.total) * 100}%` }}
            />
          </div>
          <p className="crawl-progress-text">
            {crawlProgress.done}/{crawlProgress.total} — {crawlProgress.current}
          </p>
        </div>
      )}

      <input
        type="text"
        className="cards-search"
        placeholder="카드명, 카드사, 혜택 검색..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />

      {loading ? (
        <p className="cards-empty">로딩 중...</p>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "3rem 0" }}>
          <p className="cards-empty" style={{ marginBottom: "1rem" }}>
            {cards.length === 0
              ? "저장된 카드가 없습니다."
              : "검색 결과가 없습니다."}
          </p>
          {cards.length === 0 && (
            <button className="btn btn-primary btn-sm" onClick={loadSampleData} disabled={seeding}>
              {seeding ? "로드 중..." : "📂 샘플 카드 데이터 불러오기"}
            </button>
          )}
        </div>
      ) : (
        <div className="cards-grid">
          {filtered.map((c) => (
            <button
              key={c.gorilla_id}
              className="card-item"
              onClick={() => setSelected(c)}
            >
              <div className="card-item-top">
                {c.image_url && (
                  <img src={c.image_url} alt={c.name} className="card-item-img" />
                )}
              </div>
              <div className="card-item-body">
                <p className="card-item-name">{c.name}</p>
                <p className="card-item-company">{c.company}</p>
                {c.benefits.length > 0 && (
                  <p className="card-item-benefit">
                    {c.benefits[0].category}: {c.benefits[0].summary.slice(0, 30)}
                    {c.benefits[0].summary.length > 30 ? "…" : ""}
                  </p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
