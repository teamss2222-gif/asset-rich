"use client";

import { useState } from "react";
import type { StockAnalysis, AgentResult } from "../../api/stock/analyze/route";

const POPULAR = ["삼성전자", "SK하이닉스", "LG에너지솔루션", "현대차", "카카오", "네이버", "셀트리온", "POSCO홀딩스"];

function StanceBar({ score }: { score: number }) {
  // score: -5 ~ +5 → 0 ~ 100%
  const pct = ((score + 5) / 10) * 100;
  const color = score >= 2 ? "#22c55e" : score <= -2 ? "#ef4444" : "#f59e0b";
  return (
    <div className="stock-stance-bar-wrap">
      <div className="stock-stance-bar-track">
        <div className="stock-stance-bar-fill" style={{ width: `${pct}%`, background: color }} />
        <div className="stock-stance-bar-center" />
      </div>
      <div className="stock-stance-labels">
        <span>강매도</span>
        <span>중립</span>
        <span>강매수</span>
      </div>
    </div>
  );
}

function AgentCard({ agent }: { agent: AgentResult }) {
  const [open, setOpen] = useState(false);
  const stanceColor =
    agent.stance.includes("매수") ? "var(--green-600, #16a34a)" :
    agent.stance.includes("매도") ? "var(--red-500, #ef4444)" : "#f59e0b";

  return (
    <div className="stock-agent-card" onClick={() => setOpen((v) => !v)}>
      <div className="stock-agent-header">
        <span className="stock-agent-emoji">{agent.emoji}</span>
        <div className="stock-agent-info">
          <span className="stock-agent-name">{agent.name}</span>
          <span className="stock-agent-role">{agent.role}</span>
        </div>
        <span className="stock-agent-stance" style={{ color: stanceColor }}>
          {agent.stance}
        </span>
      </div>
      <StanceBar score={agent.score} />
      {open && (
        <div className="stock-agent-detail">
          <p className="stock-agent-reasoning">{agent.reasoning}</p>
          <ul className="stock-agent-points">
            {agent.keyPoints.map((pt, i) => (
              <li key={i}>• {pt}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ConsensusCard({ consensus, query }: { consensus: StockAnalysis["consensus"]; query: string }) {
  const dirColor =
    consensus.direction === "상승" ? "#22c55e" :
    consensus.direction === "하락" ? "#ef4444" : "#f59e0b";
  const dirIcon =
    consensus.direction === "상승" ? "📈" :
    consensus.direction === "하락" ? "📉" : "➡️";

  const bullW = Math.round((consensus.bullCount / 5) * 100);
  const bearW = Math.round((consensus.bearCount / 5) * 100);
  const neuW = 100 - bullW - bearW;

  return (
    <div className="stock-consensus-card">
      <div className="stock-consensus-top">
        <div className="stock-consensus-direction" style={{ color: dirColor }}>
          <span className="stock-consensus-icon">{dirIcon}</span>
          <span className="stock-consensus-label">{consensus.direction}</span>
          <span className="stock-consensus-magnitude">{consensus.magnitude}</span>
        </div>
        <div className="stock-consensus-meta">
          <span className="stock-consensus-timeframe">📅 {consensus.timeframe}</span>
          <span className="stock-consensus-conf">신뢰도 {consensus.confidence}%</span>
        </div>
      </div>

      {/* 매수/중립/매도 바 */}
      <div className="stock-sentiment-bar">
        {bullW > 0 && (
          <div className="stock-sentiment-bull" style={{ width: `${bullW}%` }}>
            {bullW >= 20 && `매수 ${consensus.bullCount}`}
          </div>
        )}
        {neuW > 0 && (
          <div className="stock-sentiment-neu" style={{ width: `${neuW}%` }}>
            {neuW >= 15 && "중립"}
          </div>
        )}
        {bearW > 0 && (
          <div className="stock-sentiment-bear" style={{ width: `${bearW}%` }}>
            {bearW >= 20 && `매도 ${consensus.bearCount}`}
          </div>
        )}
      </div>

      <p className="stock-consensus-summary">{consensus.summary}</p>
      <p className="stock-consensus-disclaimer">
        ⚠️ 본 분석은 AI 시뮬레이션이며 투자 권고가 아닙니다. "{query}"에 대한 뉴스 기반 가상 시나리오입니다.
      </p>
    </div>
  );
}

function NewsCard({ news }: { news: StockAnalysis["news"] }) {
  if (!news.length) return null;
  return (
    <div className="stock-news-section">
      <h3 className="stock-section-title">📰 수집된 뉴스 ({news.length}건)</h3>
      <div className="stock-news-list">
        {news.map((n, i) => (
          <div key={i} className="stock-news-item">
            <span className="stock-news-title">{n.title}</span>
            {n.source && <span className="stock-news-source">{n.source}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function StockPage() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<StockAnalysis | null>(null);
  const [error, setError] = useState("");

  async function analyze(q: string) {
    if (!q.trim() || loading) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch(`/api/stock/analyze?q=${encodeURIComponent(q.trim())}`);
      const json = await res.json() as { ok: boolean; data?: StockAnalysis; message?: string };
      if (!json.ok || !json.data) {
        setError(json.message ?? "분석에 실패했습니다.");
      } else {
        setResult(json.data);
      }
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="stock-page">
      <div className="stock-header">
        <h1 className="stock-title">📊 주가 시뮬레이터</h1>
        <p className="stock-desc">
          종목명을 입력하면 최신 뉴스를 수집하고, 5가지 투자 주체 관점에서 AI가 주가 방향을 시뮬레이션합니다.
        </p>
      </div>

      {/* 검색 */}
      <div className="stock-search-area">
        <div className="stock-search-row">
          <input
            className="stock-search-input"
            type="text"
            placeholder="종목명 입력 (예: 삼성전자, SK하이닉스...)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && analyze(input)}
            disabled={loading}
          />
          <button
            className={`stock-search-btn${loading ? " loading" : ""}`}
            onClick={() => analyze(input)}
            disabled={loading || !input.trim()}
          >
            {loading ? "분석 중..." : "분석"}
          </button>
        </div>
        <div className="stock-popular">
          {POPULAR.map((s) => (
            <button
              key={s}
              className="stock-popular-tag"
              onClick={() => { setInput(s); analyze(s); }}
              disabled={loading}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* 로딩 */}
      {loading && (
        <div className="stock-loading">
          <div className="stock-loading-spinner" />
          <div className="stock-loading-steps">
            <p>📰 뉴스 수집 중...</p>
            <p>🤖 5개 에이전트 시뮬레이션 중...</p>
            <p>📊 종합 예측 생성 중...</p>
          </div>
        </div>
      )}

      {/* 에러 */}
      {error && <div className="stock-error">{error}</div>}

      {/* 결과 */}
      {result && !loading && (
        <div className="stock-result">
          <div className="stock-result-header">
            <h2 className="stock-result-query">"{result.query}" 분석 결과</h2>
            <span className="stock-result-time">
              {new Date(result.analyzedAt).toLocaleString("ko-KR")}
            </span>
          </div>

          {/* 종합 예측 */}
          <ConsensusCard consensus={result.consensus} query={result.query} />

          {/* 에이전트별 분석 */}
          <h3 className="stock-section-title">🤖 에이전트별 시뮬레이션 <span className="stock-section-hint">(클릭하면 상세 내용)</span></h3>
          <div className="stock-agents-grid">
            {result.agents.map((a, i) => (
              <AgentCard key={i} agent={a} />
            ))}
          </div>

          {/* 뉴스 */}
          <NewsCard news={result.news} />
        </div>
      )}
    </div>
  );
}
