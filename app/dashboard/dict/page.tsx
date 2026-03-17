"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GOSA_DATA, GosaEntry, SODAM_DATA, SodamEntry } from "../../../lib/dict-data";

type Tab = "en-ko" | "ko-en" | "gosa" | "sodam" | "korean";

// ── 번역 결과 타입 ──
interface TransResult {
  translation: string;
  aiDefinitions?: string;
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
  { key: "korean", label: "국어사전", emoji: "📖" },
];

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
        setResult({ translation: json.data?.translation ?? "", aiDefinitions: json.data?.aiDefinitions ?? "", definitions: json.data?.definitions ?? [] });
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

              {/* 한→영일 때 AI 자세 설명 표시 */}
              {!isEnKo && result.aiDefinitions && (
                <div className="dict-definitions">
                  <div className="dict-meaning-group">
                    <p className="dict-def-text" style={{ whiteSpace: "pre-line" }}>{result.aiDefinitions}</p>
                  </div>
                </div>
              )}

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
  const [expanded, setExpanded] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return [];
    return GOSA_DATA.filter((g) =>
      g.word.includes(q) ||
      g.hanja.includes(q) ||
      g.meaning.includes(q) ||
      g.english.toLowerCase().includes(q)
    );
  }, [q]);

  return (
    <div>
      <div className="dict-search-bar">
        <input
          ref={inputRef}
          className="dict-search-input"
          placeholder="고사성어, 한자, 뜻으로 검색…"
          value={query}
          autoFocus
          onChange={(e) => { setQuery(e.target.value); setExpanded(null); }}
        />
        {query && <button className="dict-clear-btn" onClick={() => { setQuery(""); setExpanded(null); inputRef.current?.focus(); }}>✕</button>}
      </div>

      {!q && (
        <div className="dict-empty" style={{ marginTop: "2.5rem" }}>
          검색어를 입력하면 결과가 표시됩니다.
        </div>
      )}
      {q && filtered.length === 0 && <div className="dict-empty" style={{ marginTop: "2.5rem" }}>검색 결과가 없어요.</div>}
      {q && filtered.length > 0 && (
        <>
          <p className="dict-count">{filtered.length}개</p>
          <div className="dict-card-list">
            {filtered.map((g, i) => (
              <GosaCard key={g.word} entry={g} isOpen={expanded === i} onToggle={() => setExpanded(expanded === i ? null : i)} />
            ))}
          </div>
        </>
      )}
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
  const [expanded, setExpanded] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return [];
    return SODAM_DATA.filter((s) =>
      s.sodam.includes(q) ||
      s.meaning.includes(q) ||
      s.english.toLowerCase().includes(q)
    );
  }, [q]);

  return (
    <div>
      <div className="dict-search-bar">
        <input
          ref={inputRef}
          className="dict-search-input"
          placeholder="속담, 뜻으로 검색…"
          value={query}
          autoFocus
          onChange={(e) => { setQuery(e.target.value); setExpanded(null); }}
        />
        {query && <button className="dict-clear-btn" onClick={() => { setQuery(""); setExpanded(null); inputRef.current?.focus(); }}>✕</button>}
      </div>

      {!q && (
        <div className="dict-empty" style={{ marginTop: "2.5rem" }}>
          검색어를 입력하면 결과가 표시됩니다.
        </div>
      )}
      {q && filtered.length === 0 && <div className="dict-empty" style={{ marginTop: "2.5rem" }}>검색 결과가 없어요.</div>}
      {q && filtered.length > 0 && (
        <>
          <p className="dict-count">{filtered.length}개</p>
          <div className="dict-card-list">
            {filtered.map((s, i) => (
              <SodamCard key={s.sodam} entry={s} isOpen={expanded === i} onToggle={() => setExpanded(expanded === i ? null : i)} />
            ))}
          </div>
        </>
      )}
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

// ── 국어사전 탭 ──
const CHOSEONG_KO = ["ㄱ","ㄴ","ㄷ","ㄹ","ㅁ","ㅂ","ㅅ","ㅇ","ㅈ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];

type KoEntry = { word: string; pos: string; definition: string; example: string; source: string };



function KoreanDictTab() {
  const [query, setQuery] = useState("");
  const [cho, setCho] = useState("ㄱ");
  const [entries, setEntries] = useState<KoEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doFetch = useCallback(async (q: string, c: string) => {
    setLoading(true);
    setExpanded(null);
    try {
      const params = q ? `q=${encodeURIComponent(q)}` : `cho=${encodeURIComponent(c)}`;
      const res = await fetch(`/api/dictionary?${params}`);
      const json = await res.json();
      setEntries(json.data?.entries ?? []);
      setHasApiKey(json.data?.hasApiKey ?? false);
    } catch {
      setEntries([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!query) doFetch("", cho);
  }, [cho, doFetch, query]);

  function handleChange(v: string) {
    setQuery(v);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!v.trim()) { doFetch("", cho); return; }
    timerRef.current = setTimeout(() => doFetch(v.trim(), ""), 500);
  }

  return (
    <div>
      <div className="dict-search-bar">
        <input
          ref={inputRef}
          className="dict-search-input"
          placeholder="단어를 검색하세요…"
          value={query}
          autoFocus
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { if (timerRef.current) clearTimeout(timerRef.current); if (query.trim()) doFetch(query.trim(), ""); } }}
        />
        {query && <button className="dict-clear-btn" onClick={() => { setQuery(""); doFetch("", cho); inputRef.current?.focus(); }}>✕</button>}
        <button className="dict-search-btn" onClick={() => { if (timerRef.current) clearTimeout(timerRef.current); if (query.trim()) doFetch(query.trim(), ""); }}>검색</button>
      </div>

      {!query && (
        <div className="dict-tag-strip" style={{ marginTop: "0.75rem" }}>
          {CHOSEONG_KO.map((c) => (
            <button key={c} className={`dict-tag${cho === c ? " active" : ""}`} onClick={() => setCho(c)}>{c}</button>
          ))}
        </div>
      )}

      <p className="dict-hint" style={{ marginTop: "0.4rem" }}>
        {hasApiKey
          ? "🔗 국립국어원 한국어기초사전 연동 중"
          : "💡 KRDICT_API_KEY 설정 시 국립국어원 전체 사전이 연동됩니다"}
      </p>

      {loading && <div className="dict-loading">검색 중…</div>}

      {!loading && entries.length === 0 && (
        <div className="dict-empty" style={{ marginTop: "2.5rem" }}>검색 결과가 없어요.</div>
      )}

      {!loading && entries.length > 0 && (
        <>
          <p className="dict-count" style={{ marginTop: "0.75rem" }}>{entries.length}개</p>
          <div className="dict-card-list">
            {entries.map((w, i) => (
              <button key={i} className={`dict-card ${expanded === i ? "open" : ""}`} onClick={() => setExpanded(expanded === i ? null : i)}>
                <div className="dict-card-main">
                  <div className="dict-card-left">
                    <span className="dict-gosa-word">{w.word}</span>
                    {w.pos && <span className="dict-pos">{w.pos}</span>}
                  </div>
                  <div className="dict-card-right">
                    <span className="dict-card-summary">{w.definition.slice(0,28)}{w.definition.length>28?"…":""}</span>
                    <span className={`dict-card-arrow ${expanded === i ? "open" : ""}`}>›</span>
                  </div>
                </div>
                {expanded === i && (
                  <div className="dict-card-body">
                    <p className="dict-card-meaning">{w.definition}</p>
                    {w.example && <p className="dict-def-example">"{w.example}"</p>}
                    {w.source === "krdict" && <div className="dict-card-tags"><span className="dict-tag-badge">국립국어원</span></div>}
                  </div>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
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
        {tab === "korean" && <KoreanDictTab />}
      </div>
    </div>
  );
}
