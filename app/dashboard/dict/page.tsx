"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GOSA_DATA, GosaEntry, SODAM_DATA, SodamEntry } from "../../../lib/dict-data";

type Tab = "en-ko" | "ko-en" | "gosa" | "sodam";

// ── 번역 결과 타입 ──
interface TransResult {
  translation: string;
  definitions: DictEntry[];
  error?: string;
}
interface DictEntry {
  word: string;
  phonetics?: { text?: string }[];
  meanings?: {
    partOfSpeech: string;
    definitions: { definition: string; example?: string }[];
  }[];
}

const TABS: { key: Tab; label: string; emoji: string }[] = [
  { key: "en-ko", label: "영→한", emoji: "🇺🇸" },
  { key: "ko-en", label: "한→영", emoji: "🇰🇷" },
  { key: "gosa", label: "고사성어", emoji: "📜" },
  { key: "sodam", label: "속담", emoji: "💬" },
];

const ALL_GOSA_TAGS = Array.from(new Set(GOSA_DATA.flatMap((g) => g.tags ?? []))).sort();
const ALL_SODAM_TAGS = Array.from(new Set(SODAM_DATA.flatMap((s) => s.tags ?? []))).sort();

// ── 번역 탭 컴포넌트 ──
function TranslateTab({ dir }: { dir: "en|ko" | "ko|en" }) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<TransResult | null>(null);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isEnKo = dir === "en|ko";

  function clear() {
    setQuery("");
    setResult(null);
  }

  async function search(q: string) {
    if (!q.trim()) { setResult(null); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/dict/translate?q=${encodeURIComponent(q.trim())}&dir=${dir}`);
      const json = await res.json();
      if (!res.ok) {
        setResult({ translation: "", definitions: [], error: json.message ?? "오류 발생" });
      } else {
        setResult({ translation: json.data?.translation ?? "", definitions: json.data?.definitions ?? [] });
      }
    } catch {
      setResult({ translation: "", definitions: [], error: "네트워크 오류" });
    }
    setLoading(false);
  }

  function handleChange(v: string) {
    setQuery(v);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!v.trim()) { setResult(null); return; }
    timerRef.current = setTimeout(() => search(v), 600);
  }

  const phonetic = result?.definitions?.[0]?.phonetics?.find((p) => p.text)?.text ?? "";

  return (
    <div className="dict-translate-wrap">
      <div className="dict-search-bar">
        <input
          className="dict-search-input"
          placeholder={isEnKo ? "영어 단어나 문장을 입력하세요" : "한국어 단어나 문장을 입력하세요"}
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { if (timerRef.current) clearTimeout(timerRef.current); search(query); } }}
          autoFocus
        />
        {query && <button className="dict-clear-btn" onClick={clear}>✕</button>}
        <button className="dict-search-btn" onClick={() => { if (timerRef.current) clearTimeout(timerRef.current); search(query); }}>검색</button>
      </div>

      {loading && <div className="dict-loading">번역 중…</div>}

      {!loading && result && (
        <div className="dict-result-card">
          {result.error ? (
            <p className="dict-error">{result.error}</p>
          ) : (
            <>
              <div className="dict-query-row">
                <span className="dict-query-word">{query.trim()}</span>
                {phonetic && <span className="dict-phonetic">{phonetic}</span>}
              </div>

              <div className="dict-translation-box">
                <span className="dict-translation-arrow">{isEnKo ? "🇰🇷" : "🇺🇸"}</span>
                <span className="dict-translation-text">{result.translation}</span>
              </div>

              {/* 영한일 때 영어 사전 정의 표시 */}
              {isEnKo && result.definitions.length > 0 && (
                <div className="dict-definitions">
                  {result.definitions[0].meanings?.slice(0, 3).map((m, i) => (
                    <div key={i} className="dict-meaning-group">
                      <span className="dict-pos">{m.partOfSpeech}</span>
                      {m.definitions.slice(0, 2).map((d, j) => (
                        <div key={j} className="dict-def-item">
                          <p className="dict-def-text">{d.definition}</p>
                          {d.example && <p className="dict-def-example">"{d.example}"</p>}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {!loading && !result && !query && (
        <div className="dict-hint">
          {isEnKo
            ? "영어 단어, 구문, 또는 문장을 입력하면 한국어 번역과 영영 사전 뜻풀이를 보여드려요."
            : "한국어 단어, 구문, 또는 문장을 입력하면 영어 번역을 보여드려요."}
        </div>
      )}
    </div>
  );
}

// ── 고사성어 탭 ──
function GosaTab() {
  const [query, setQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return GOSA_DATA.filter((g) => {
      const matchTag = selectedTag ? g.tags?.includes(selectedTag) : true;
      if (!q) return matchTag;
      return matchTag && (
        g.word.includes(q) ||
        g.hanja.includes(q) ||
        g.meaning.includes(q) ||
        g.english.toLowerCase().includes(q)
      );
    });
  }, [query, selectedTag]);

  return (
    <div>
      <div className="dict-search-bar">
        <input
          className="dict-search-input"
          placeholder="고사성어, 한자, 뜻으로 검색…"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setExpanded(null); }}
        />
        {query && <button className="dict-clear-btn" onClick={() => { setQuery(""); setExpanded(null); }}>✕</button>}
      </div>

      <div className="dict-tag-strip">
        <button
          className={`dict-tag ${!selectedTag ? "active" : ""}`}
          onClick={() => setSelectedTag(null)}
        >전체</button>
        {ALL_GOSA_TAGS.map((t) => (
          <button
            key={t}
            className={`dict-tag ${selectedTag === t ? "active" : ""}`}
            onClick={() => setSelectedTag(t === selectedTag ? null : t)}
          >{t}</button>
        ))}
      </div>

      <p className="dict-count">{filtered.length}개</p>

      <div className="dict-card-list">
        {filtered.length === 0 && <div className="dict-empty">검색 결과가 없어요.</div>}
        {filtered.map((g, i) => (
          <GosaCard key={g.word} entry={g} isOpen={expanded === i} onToggle={() => setExpanded(expanded === i ? null : i)} />
        ))}
      </div>
    </div>
  );
}

function GosaCard({ entry, isOpen, onToggle }: { entry: GosaEntry; isOpen: boolean; onToggle: () => void }) {
  return (
    <button className={`dict-card ${isOpen ? "open" : ""}`} onClick={onToggle}>
      <div className="dict-card-main">
        <div className="dict-card-left">
          <span className="dict-gosa-word">{entry.word}</span>
          <span className="dict-gosa-hanja">{entry.hanja}</span>
        </div>
        <div className="dict-card-right">
          <span className="dict-card-summary">{entry.meaning.slice(0, 30)}{entry.meaning.length > 30 ? "…" : ""}</span>
          <span className={`dict-card-arrow ${isOpen ? "open" : ""}`}>›</span>
        </div>
      </div>
      {isOpen && (
        <div className="dict-card-body">
          <p className="dict-card-meaning">{entry.meaning}</p>
          <div className="dict-card-english">
            <span className="dict-card-en-label">🇺🇸</span>
            <span>{entry.english}</span>
          </div>
          {entry.tags && (
            <div className="dict-card-tags">
              {entry.tags.map((t) => <span key={t} className="dict-tag-badge">{t}</span>)}
            </div>
          )}
        </div>
      )}
    </button>
  );
}

// ── 속담 탭 ──
function SodamTab() {
  const [query, setQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return SODAM_DATA.filter((s) => {
      const matchTag = selectedTag ? s.tags?.includes(selectedTag) : true;
      if (!q) return matchTag;
      return matchTag && (
        s.sodam.includes(q) ||
        s.meaning.includes(q) ||
        s.english.toLowerCase().includes(q)
      );
    });
  }, [query, selectedTag]);

  return (
    <div>
      <div className="dict-search-bar">
        <input
          className="dict-search-input"
          placeholder="속담, 뜻으로 검색…"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setExpanded(null); }}
        />
        {query && <button className="dict-clear-btn" onClick={() => { setQuery(""); setExpanded(null); }}>✕</button>}
      </div>

      <div className="dict-tag-strip">
        <button
          className={`dict-tag ${!selectedTag ? "active" : ""}`}
          onClick={() => setSelectedTag(null)}
        >전체</button>
        {ALL_SODAM_TAGS.map((t) => (
          <button
            key={t}
            className={`dict-tag ${selectedTag === t ? "active" : ""}`}
            onClick={() => setSelectedTag(t === selectedTag ? null : t)}
          >{t}</button>
        ))}
      </div>

      <p className="dict-count">{filtered.length}개</p>

      <div className="dict-card-list">
        {filtered.length === 0 && <div className="dict-empty">검색 결과가 없어요.</div>}
        {filtered.map((s, i) => (
          <SodamCard key={s.sodam} entry={s} isOpen={expanded === i} onToggle={() => setExpanded(expanded === i ? null : i)} />
        ))}
      </div>
    </div>
  );
}

function SodamCard({ entry, isOpen, onToggle }: { entry: SodamEntry; isOpen: boolean; onToggle: () => void }) {
  return (
    <button className={`dict-card ${isOpen ? "open" : ""}`} onClick={onToggle}>
      <div className="dict-card-main">
        <div className="dict-card-left" style={{ flex: 1 }}>
          <span className="dict-sodam-text">{entry.sodam}</span>
        </div>
        <span className={`dict-card-arrow ${isOpen ? "open" : ""}`}>›</span>
      </div>
      {isOpen && (
        <div className="dict-card-body">
          <p className="dict-card-meaning">{entry.meaning}</p>
          <div className="dict-card-english">
            <span className="dict-card-en-label">🇺🇸</span>
            <span>{entry.english}</span>
          </div>
          {entry.tags && (
            <div className="dict-card-tags">
              {entry.tags.map((t) => <span key={t} className="dict-tag-badge">{t}</span>)}
            </div>
          )}
        </div>
      )}
    </button>
  );
}

// ── 메인 페이지 ──
export default function DictPage() {
  const [tab, setTab] = useState<Tab>("en-ko");
  const [dailyGosa, setDailyGosa] = useState<GosaEntry | null>(null);
  const [dailySodam, setDailySodam] = useState<SodamEntry | null>(null);

  useEffect(() => {
    // 오늘 날짜 기반 오늘의 단어
    const dayIdx = Math.floor(Date.now() / 86400000);
    setDailyGosa(GOSA_DATA[dayIdx % GOSA_DATA.length]);
    setDailySodam(SODAM_DATA[dayIdx % SODAM_DATA.length]);
  }, []);

  return (
    <div className="dict-page">
      {/* 헤더 */}
      <div className="dict-header">
        <h1 className="dict-title">📖 사전</h1>
        <p className="dict-subtitle">한영 · 영한 · 고사성어 · 속담</p>
      </div>

      {/* 오늘의 단어 카드 */}
      {dailyGosa && dailySodam && (
        <div className="dict-daily-row">
          <div className="dict-daily-card">
            <span className="dict-daily-label">📜 오늘의 고사성어</span>
            <span className="dict-daily-word">{dailyGosa.word}</span>
            <span className="dict-daily-hanja">{dailyGosa.hanja}</span>
            <span className="dict-daily-meaning">{dailyGosa.meaning}</span>
          </div>
          <div className="dict-daily-card sodam">
            <span className="dict-daily-label">💬 오늘의 속담</span>
            <span className="dict-daily-sodam">{dailySodam.sodam}</span>
            <span className="dict-daily-meaning">{dailySodam.meaning}</span>
          </div>
        </div>
      )}

      {/* 탭 바 */}
      <div className="dict-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`dict-tab-btn ${tab === t.key ? "active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            <span>{t.emoji}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* 탭 콘텐츠 */}
      <div className="dict-tab-content">
        {tab === "en-ko" && <TranslateTab dir="en|ko" />}
        {tab === "ko-en" && <TranslateTab dir="ko|en" />}
        {tab === "gosa" && <GosaTab />}
        {tab === "sodam" && <SodamTab />}
      </div>
    </div>
  );
}
