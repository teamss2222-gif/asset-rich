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

  const startCrawl = async () => {
    setCrawling(true);
    setCrawlMsg("크롤링 시작...");
    try {
      const res = await fetch("/api/cards/crawl", { method: "POST" });
      const json = await res.json();
      if (json.ok) {
        const s = json.data?.summary;
        setCrawlMsg(`완료! 성공: ${s?.success ?? 0} / 실패: ${s?.failed ?? 0}`);
        await fetchCards();
      } else {
        setCrawlMsg(`오류: ${json.message}`);
      }
    } catch (e) {
      setCrawlMsg(`실패: ${e instanceof Error ? e.message : "네트워크 오류"}`);
    }
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
        <button
          className="btn btn-primary btn-sm"
          onClick={startCrawl}
          disabled={crawling}
        >
          {crawling ? "크롤링 중..." : "🔄 크롤링 실행"}
        </button>
      </div>

      {crawlMsg && <p className="crawl-msg">{crawlMsg}</p>}

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
        <p className="cards-empty">
          {cards.length === 0
            ? "저장된 카드가 없습니다. 크롤링을 실행해 주세요!"
            : "검색 결과가 없습니다."}
        </p>
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
