"use client";

import { useState } from "react";
import type { StockAnalysis, AgentResult } from "../../api/stock/analyze/route";

const POPULAR = ["삼성전자", "SK하이닉스", "현대차", "카카오", "NAVER", "셀트리온", "LG에너지솔루션", "POSCO홀딩스"];

function StanceBadge({ stance }: { stance: AgentResult["stance"] }) {
  const cfg: Record<string, { bg: string; color: string }> = {
    "강력매수": { bg: "rgba(34,197,94,0.2)",  color: "#22c55e" },
    "매수":     { bg: "rgba(34,197,94,0.12)", color: "#4ade80" },
    "중립":     { bg: "rgba(245,158,11,0.15)",color: "#fbbf24" },
    "매도":     { bg: "rgba(239,68,68,0.12)", color: "#f87171" },
    "강력매도": { bg: "rgba(239,68,68,0.2)",  color: "#ef4444" },
  };
  const s = cfg[stance] ?? { bg: "rgba(255,255,255,0.08)", color: "var(--text-2)" };
  return <span className="stock2-stance-badge" style={{ background: s.bg, color: s.color }}>{stance}</span>;
}

function ScoreBar({ score }: { score: number }) {
  const pct = ((score + 5) / 10) * 100;
  const color = score >= 2 ? "#22c55e" : score <= -2 ? "#ef4444" : "#fbbf24";
  return (
    <div className="stock2-scorebar-wrap">
      <div className="stock2-scorebar-track">
        <div className="stock2-scorebar-fill" style={{ width: `${pct}%`, background: color }} />
        <div className="stock2-scorebar-mid" />
      </div>
    </div>
  );
}

function AgentCard({ agent, index }: { agent: AgentResult; index: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`stock2-agent${open ? " open" : ""}`} onClick={() => setOpen(v => !v)} style={{ animationDelay: `${index * 80}ms` }}>
      <div className="stock2-agent-top">
        <span className="stock2-agent-emoji">{agent.emoji}</span>
        <div className="stock2-agent-meta">
          <span className="stock2-agent-name">{agent.name}</span>
          <span className="stock2-agent-role">{agent.role}</span>
        </div>
        <StanceBadge stance={agent.stance} />
        <span className="stock2-agent-chevron">{open ? "▲" : "▼"}</span>
      </div>
      <ScoreBar score={agent.score} />
      {open && (
        <div className="stock2-agent-body">
          <p className="stock2-agent-reasoning">{agent.reasoning}</p>
          <div className="stock2-agent-points">
            {agent.keyPoints.map((pt, i) => <span key={i} className="stock2-agent-point">→ {pt}</span>)}
          </div>
        </div>
      )}
    </div>
  );
}

function ConsensusPanel({ r }: { r: StockAnalysis }) {
  const { consensus } = r;
  const isUp = consensus.direction === "상승";
  const isDn = consensus.direction === "하락";
  const dirColor = isUp ? "#22c55e" : isDn ? "#ef4444" : "#fbbf24";
  const dirIcon  = isUp ? "📈" : isDn ? "📉" : "📊";
  const bull = Math.max(0, Math.min(100, Math.round((consensus.bullCount / 5) * 100)));
  const bear = Math.max(0, Math.min(100, Math.round((consensus.bearCount / 5) * 100)));
  const neu  = 100 - bull - bear;
  return (
    <div className="stock2-consensus">
      <div className="stock2-consensus-hero">
        <div className="stock2-dir" style={{ color: dirColor }}>
          <span className="stock2-dir-icon">{dirIcon}</span>
          <div>
            <div className="stock2-dir-label">{consensus.direction}</div>
            <div className="stock2-dir-mag">{consensus.magnitude}</div>
          </div>
        </div>
        <div className="stock2-stats">
          <div className="stock2-stat"><span className="stock2-stat-val" style={{ color: dirColor }}>{consensus.confidence}%</span><span className="stock2-stat-lbl">신뢰도</span></div>
          <div className="stock2-stat"><span className="stock2-stat-val">{consensus.timeframe}</span><span className="stock2-stat-lbl">예측 기간</span></div>
        </div>
      </div>
      <div className="stock2-sentiment-bar">
        {bull > 0 && <div className="stock2-s-bull" style={{ width: `${bull}%` }}>{bull >= 25 ? `매수 ${consensus.bullCount}` : ""}</div>}
        {neu  > 0 && <div className="stock2-s-neu"  style={{ width: `${neu}%`  }}>{neu  >= 20 ? "중립" : ""}</div>}
        {bear > 0 && <div className="stock2-s-bear" style={{ width: `${bear}%` }}>{bear >= 25 ? `매도 ${consensus.bearCount}` : ""}</div>}
      </div>
      <div className="stock2-s-legend">
        <span style={{ color:"#22c55e" }}>● 매수 {consensus.bullCount}</span>
        <span style={{ color:"var(--text-3)" }}>● 중립 {5 - consensus.bullCount - consensus.bearCount}</span>
        <span style={{ color:"#ef4444" }}>● 매도 {consensus.bearCount}</span>
      </div>
      <p className="stock2-summary">{consensus.summary}</p>
      <p className="stock2-disclaimer">⚠️ AI 시뮬레이션이며 투자 권고가 아닙니다.</p>
    </div>
  );
}

export default function StockPage() {
  const [input, setInput]     = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState<StockAnalysis | null>(null);
  const [error, setError]     = useState("");

  async function analyze(q: string) {
    if (!q.trim() || loading) return;
    setLoading(true); setError(""); setResult(null);
    try {
      const res  = await fetch(`/api/stock/analyze?q=${encodeURIComponent(q.trim())}`);
      const json = await res.json() as { ok: boolean; data?: StockAnalysis; message?: string };
      if (!json.ok || !json.data) setError(json.message ?? "\ubd84\uc11d\uc5d0 \uc2e4\ud328\ud588\uc2b5\ub2c8\ub2e4.");
      else setResult(json.data);
    } catch { setError("\ub124\ud2b8\uc6cc\ud06c \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4."); }
    finally   { setLoading(false); }
  }

  return (
    <div className="stock2-page">
      <div className="stock2-header">
        <h1 className="stock2-title"><span>📊</span> 주가 시뮬레이터</h1>
        <p className="stock2-subtitle">최신 뉴스를 수집하고 5가지 투자 주체 관점에서 AI가 주가 방향을 예측합니다</p>
      </div>
      <div className="stock2-search-card">
        <div className="stock2-search-row">
          <input
            className="stock2-input" type="text" placeholder="종목명 입력 (예: 삼성전자)"
            value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && analyze(input)} disabled={loading}
          />
          <button className="stock2-btn" onClick={() => analyze(input)} disabled={loading || !input.trim()}>
            {loading ? <span className="stock2-btn-spin" /> : "분석"}
          </button>
        </div>
        <div className="stock2-popular">
          <span className="stock2-popular-lbl">인기</span>
          {POPULAR.map(s => (
            <button key={s} className="stock2-chip" onClick={() => { setInput(s); analyze(s); }} disabled={loading}>{s}</button>
          ))}
        </div>
      </div>
      {loading && (
        <div className="stock2-loading">
          <div className="stock2-loading-ring" />
          <div className="stock2-loading-text">
            <div className="stock2-loading-q">&quot;{input}&quot; 분석 중…</div>
            <div className="stock2-loading-steps">
              <span>📰 경제 뉴스 수집</span>
              <span>🤖 에이전트 시뮬레이션 (20~40초 소요)</span>
              <span>📊 예측 리포트 생성</span>
            </div>
          </div>
        </div>
      )}
      {error && <div className="stock2-error">{"\u26a0\ufe0f"} {error}</div>}
      {result && !loading && (
        <div className="stock2-result">
          <div className="stock2-result-bar">
            <span className="stock2-result-q">&quot;{result.query}&quot; 분석 결과</span>
            <span className="stock2-result-time">{new Date(result.analyzedAt).toLocaleString("ko-KR")}</span>
          </div>
          <div className="stock2-layout">
            <ConsensusPanel r={result} />
            <div className="stock2-agents-wrap">
              <div className="stock2-agents-title">🤖 에이전트별 분석 <span className="stock2-section-hint">클릭해서 상세</span></div>
              {result.agents.map((a, i) => <AgentCard key={i} agent={a} index={i} />)}
            </div>
          </div>
          {result.news.length > 0 && (
            <details className="stock2-news">
              <summary className="stock2-news-summary">📰 수집된 뉴스 ({result.news.length}건)</summary>
              <div className="stock2-news-list">
                {result.news.map((n, i) => (
                  <div key={i} className="stock2-news-item">
                    <span className="stock2-news-ttl">{n.title}</span>
                    {n.source && <span className="stock2-news-src">{n.source}</span>}
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}