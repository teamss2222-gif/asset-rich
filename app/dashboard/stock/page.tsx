"use client";

import { useState } from "react";
import type { StockAnalysis, AgentResult } from "../../api/stock/analyze/route";

const POPULAR = ["삼성전자", "SK하이닉스", "현대차", "카카오", "NAVER", "셀트리온", "LG에너지솔루션", "POSCO홀딩스"];

function StanceBadge({ stance }: { stance: AgentResult["stance"] }) {
  const cfg: Record<string, { bg: string; color: string }> = {
    "\uac15\ub825\ub9e4\uc218": { bg: "rgba(34,197,94,0.2)",  color: "#22c55e" },
    "\ub9e4\uc218":     { bg: "rgba(34,197,94,0.12)", color: "#4ade80" },
    "\uc911\ub9bd":     { bg: "rgba(245,158,11,0.15)",color: "#fbbf24" },
    "\ub9e4\ub3c4":     { bg: "rgba(239,68,68,0.12)", color: "#f87171" },
    "\uac15\ub825\ub9e4\ub3c4": { bg: "rgba(239,68,68,0.2)",  color: "#ef4444" },
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
        <span className="stock2-agent-chevron">{open ? "\u25b2" : "\u25bc"}</span>
      </div>
      <ScoreBar score={agent.score} />
      {open && (
        <div className="stock2-agent-body">
          <p className="stock2-agent-reasoning">{agent.reasoning}</p>
          <div className="stock2-agent-points">
            {agent.keyPoints.map((pt, i) => <span key={i} className="stock2-agent-point">{"\u2192"} {pt}</span>)}
          </div>
        </div>
      )}
    </div>
  );
}

function ConsensusPanel({ r }: { r: StockAnalysis }) {
  const { consensus } = r;
  const isUp = consensus.direction === "\uc0c1\uc2b9";
  const isDn = consensus.direction === "\ud558\ub77d";
  const dirColor = isUp ? "#22c55e" : isDn ? "#ef4444" : "#fbbf24";
  const dirIcon  = isUp ? "\ud83d\udcc8" : isDn ? "\ud83d\udcc9" : "\ud83d\udcca";
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
          <div className="stock2-stat"><span className="stock2-stat-val" style={{ color: dirColor }}>{consensus.confidence}%</span><span className="stock2-stat-lbl">\uc2e0\ub8b0\ub3c4</span></div>
          <div className="stock2-stat"><span className="stock2-stat-val">{consensus.timeframe}</span><span className="stock2-stat-lbl">\uc608\uce21 \uae30\uac04</span></div>
        </div>
      </div>
      <div className="stock2-sentiment-bar">
        {bull > 0 && <div className="stock2-s-bull" style={{ width: `${bull}%` }}>{bull >= 25 ? `\ub9e4\uc218 ${consensus.bullCount}` : ""}</div>}
        {neu  > 0 && <div className="stock2-s-neu"  style={{ width: `${neu}%`  }}>{neu  >= 20 ? "\uc911\ub9bd" : ""}</div>}
        {bear > 0 && <div className="stock2-s-bear" style={{ width: `${bear}%` }}>{bear >= 25 ? `\ub9e4\ub3c4 ${consensus.bearCount}` : ""}</div>}
      </div>
      <div className="stock2-s-legend">
        <span style={{ color:"#22c55e" }}>{"\u25cf"} \ub9e4\uc218 {consensus.bullCount}</span>
        <span style={{ color:"var(--text-3)" }}>{"\u25cf"} \uc911\ub9bd {5 - consensus.bullCount - consensus.bearCount}</span>
        <span style={{ color:"#ef4444" }}>{"\u25cf"} \ub9e4\ub3c4 {consensus.bearCount}</span>
      </div>
      <p className="stock2-summary">{consensus.summary}</p>
      <p className="stock2-disclaimer">{"\u26a0\ufe0f"} AI \uc2dc\ubbac\ub808\uc774\uc158\uc774\uba70 \ud22c\uc790 \uad8c\uace0\uac00 \uc544\ub2d9\ub2c8\ub2e4.</p>
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
        <h1 className="stock2-title"><span>{"\ud83d\udcca"}</span> \uc8fc\uac00 \uc2dc\ubbac\ub808\uc774\ud130</h1>
        <p className="stock2-subtitle">\ucd5c\uc2e0 \ub274\uc2a4\ub97c \uc218\uc9d1\ud558\uace0 5\uac00\uc9c0 \ud22c\uc790 \uc8fc\uccb4 \uad00\uc810\uc5d0\uc11c AI\uac00 \uc8fc\uac00 \ubc29\ud5a5\uc744 \uc608\uce21\ud569\ub2c8\ub2e4</p>
      </div>
      <div className="stock2-search-card">
        <div className="stock2-search-row">
          <input
            className="stock2-input" type="text" placeholder="\uc885\ubaa9\uba85 \uc785\ub825 (\uc608: \uc0bc\uc131\uc804\uc790)"
            value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && analyze(input)} disabled={loading}
          />
          <button className="stock2-btn" onClick={() => analyze(input)} disabled={loading || !input.trim()}>
            {loading ? <span className="stock2-btn-spin" /> : "\ubd84\uc11d"}
          </button>
        </div>
        <div className="stock2-popular">
          <span className="stock2-popular-lbl">\uc778\uae30</span>
          {POPULAR.map(s => (
            <button key={s} className="stock2-chip" onClick={() => { setInput(s); analyze(s); }} disabled={loading}>{s}</button>
          ))}
        </div>
      </div>
      {loading && (
        <div className="stock2-loading">
          <div className="stock2-loading-ring" />
          <div className="stock2-loading-text">
            <div className="stock2-loading-q">&quot;{input}&quot; \ubd84\uc11d \uc911&hellip;</div>
            <div className="stock2-loading-steps">
              <span>{"\ud83d\udcf0"} \uacbd\uc81c \ub274\uc2a4 \uc218\uc9d1</span>
              <span>{"\ud83e\udd16"} \uc5d0\uc774\uc804\ud2b8 \uc2dc\ubbac\ub808\uc774\uc158 (20~40\ucd08 \uc18c\uc694)</span>
              <span>{"\ud83d\udcca"} \uc608\uce21 \ub9ac\ud3ec\ud2b8 \uc0dd\uc131</span>
            </div>
          </div>
        </div>
      )}
      {error && <div className="stock2-error">{"\u26a0\ufe0f"} {error}</div>}
      {result && !loading && (
        <div className="stock2-result">
          <div className="stock2-result-bar">
            <span className="stock2-result-q">&quot;{result.query}&quot; \ubd84\uc11d \uacb0\uacfc</span>
            <span className="stock2-result-time">{new Date(result.analyzedAt).toLocaleString("ko-KR")}</span>
          </div>
          <div className="stock2-layout">
            <ConsensusPanel r={result} />
            <div className="stock2-agents-wrap">
              <div className="stock2-agents-title">{"\ud83e\udd16"} \uc5d0\uc774\uc804\ud2b8\ubcc4 \ubd84\uc11d <span className="stock2-section-hint">\ud074\ub9ad\ud574\uc11c \uc0c1\uc138</span></div>
              {result.agents.map((a, i) => <AgentCard key={i} agent={a} index={i} />)}
            </div>
          </div>
          {result.news.length > 0 && (
            <details className="stock2-news">
              <summary className="stock2-news-summary">{"\ud83d\udcf0"} \uc218\uc9d1\ub41c \ub274\uc2a4 ({result.news.length}\uac74)</summary>
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