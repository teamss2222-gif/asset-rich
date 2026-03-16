"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { requestApi } from "../../../lib/http-client";

type Entry = {
  word: string;
  pos: string;
  definition: string;
  example: string;
  source: "krdict" | "local";
};

const CHOSEONG = ["ㄱ","ㄴ","ㄷ","ㄹ","ㅁ","ㅂ","ㅅ","ㅇ","ㅈ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];

export default function DictionaryPage() {
  const [query, setQuery] = useState("");
  const [cho, setCho] = useState("ㄱ");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState<"krdict" | "local" | null>(null);
  const [hasApiKey, setHasApiKey] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchWords = useCallback(async (q: string, c: string) => {
    setLoading(true);
    try {
      const params = q ? `q=${encodeURIComponent(q)}` : `cho=${encodeURIComponent(c)}`;
      const res = await requestApi<{ entries: Entry[]; source: string; hasApiKey: boolean }>(
        `/api/dictionary?${params}`
      );
      const data = res.data;
      setEntries(data.entries);
      setSource(data.source as "krdict" | "local");
      setHasApiKey(data.hasApiKey);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // 초성 탭 변경
  useEffect(() => {
    if (query) return;
    fetchWords("", cho);
  }, [cho, fetchWords, query]);

  // 검색어 디바운스
  const handleInput = (val: string) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (val.trim()) {
        fetchWords(val.trim(), "");
      } else {
        fetchWords("", cho);
      }
    }, 350);
  };

  const clearSearch = () => {
    setQuery("");
    fetchWords("", cho);
  };

  return (
    <div className="dict-page">
      <div className="dict-header">
        <h1 className="dict-title">📚 초등 국어사전</h1>
        {hasApiKey ? (
          <span className="dict-api-badge api-live">국립국어원 연동</span>
        ) : (
          <span className="dict-api-badge api-local">내장 사전</span>
        )}
      </div>

      <div className="dict-search-row">
        <div className="dict-search-wrap">
          <input
            className="dict-search-input"
            type="text"
            placeholder="낱말을 입력하세요..."
            value={query}
            onChange={(e) => handleInput(e.target.value)}
          />
          {query && (
            <button className="dict-search-clear" onClick={clearSearch} aria-label="지우기">×</button>
          )}
        </div>
      </div>

      {!query && (
        <div className="dict-tabs">
          {CHOSEONG.map((c) => (
            <button
              key={c}
              className={`dict-tab-btn${cho === c ? " active" : ""}`}
              onClick={() => { setCho(c); }}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      <div className="dict-list">
        {loading ? (
          <div className="dict-loading">
            <span className="dict-spinner" />
            검색 중...
          </div>
        ) : entries.length === 0 ? (
          <div className="dict-empty">
            <span className="dict-empty-icon">🔍</span>
            <p>찾는 낱말이 없어요.</p>
            <p className="dict-empty-sub">다른 낱말로 검색해 보세요.</p>
          </div>
        ) : (
          <>
            <p className="dict-count">총 <strong>{entries.length}</strong>개</p>
            {entries.map((entry, i) => (
              <div key={i} className="dict-card">
                <div className="dict-card-top">
                  <span className="dict-word">{entry.word}</span>
                  <span className="dict-pos">{entry.pos}</span>
                  {entry.source === "krdict" && <span className="dict-krdict-tag">국어원</span>}
                </div>
                <p className="dict-def">{entry.definition}</p>
                {entry.example && (
                  <p className="dict-ex"><span className="dict-ex-label">예)</span> {entry.example}</p>
                )}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
