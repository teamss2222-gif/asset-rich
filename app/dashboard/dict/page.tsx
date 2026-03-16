"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GOSA_DATA, GosaEntry, SODAM_DATA, SodamEntry } from "../../../lib/dict-data";

type Tab = "en-ko" | "ko-en" | "gosa" | "sodam" | "korean";

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

type KEntry = {
  word: string;
  hanja?: string;
  pos: string;
  definitions: { meaning: string; example?: string }[];
  tags?: string[];
};

const KOREAN_WORDS: KEntry[] = [
  {word:"가치",hanja:"價値",pos:"명사",definitions:[{meaning:"사물이 지니고 있는 쓸모나 중요성.",example:"이 작품의 예술적 가치는 매우 높다."},{meaning:"대상이 인간의 필요나 욕구를 충족시킬 수 있는 성질.",example:"노동의 가치를 소중히 여겨야 한다."}],tags:["철학","경제"]},
  {word:"갈등",hanja:"葛藤",pos:"명사",definitions:[{meaning:"서로 다른 욕구나 의견이 충돌하는 상태.",example:"두 나라 사이의 갈등이 심화되었다."},{meaning:"소설·극에서 등장인물 사이의 대립과 긴장.",example:"이 소설의 핵심은 주인공의 내면 갈등이다."}],tags:["심리","문학"]},
  {word:"개념",hanja:"槪念",pos:"명사",definitions:[{meaning:"어떤 사물이나 현상에 대한 일반적인 지식이나 이해.",example:"민주주의의 개념을 정확히 이해해야 한다."}],tags:["철학","논리"]},
  {word:"경쟁",hanja:"競爭",pos:"명사",definitions:[{meaning:"같은 목적을 두고 이기거나 앞서려 서로 겨루는 일.",example:"치열한 경쟁을 뚫고 입사했다."}],tags:["사회"]},
  {word:"공감",hanja:"共感",pos:"명사",definitions:[{meaning:"남의 감정이나 생각을 함께 느끼고 이해하는 것.",example:"상대방의 입장에 공감하는 것이 중요하다."}],tags:["심리","소통"]},
  {word:"관계",hanja:"關係",pos:"명사",definitions:[{meaning:"둘 이상의 사람이나 사물 사이의 연결이나 관련.",example:"인간관계는 신뢰를 바탕으로 한다."},{meaning:"어떤 사물이나 현상이 다른 것에 미치는 영향.",example:"건강과 식습관의 관계는 밀접하다."}],tags:["사회","논리"]},
  {word:"기억",hanja:"記憶",pos:"명사",definitions:[{meaning:"이전에 경험한 것을 떠올리는 심리 작용.",example:"어린 시절의 기억이 아직도 생생하다."},{meaning:"컴퓨터 등에서 데이터를 저장하는 장치.",example:"이 컴퓨터는 기억 용량이 크다."}],tags:["심리","IT"]},
  {word:"논리",hanja:"論理",pos:"명사",definitions:[{meaning:"생각이나 주장의 근거와 맥락이 일관되게 이어지는 것.",example:"그의 주장은 논리가 명확하다."}],tags:["철학","수학"]},
  {word:"다양성",hanja:"多樣性",pos:"명사",definitions:[{meaning:"여러 가지 종류나 특성이 공존하는 상태.",example:"생태계의 다양성을 보존해야 한다."}],tags:["사회","생물"]},
  {word:"동기",hanja:"動機",pos:"명사",definitions:[{meaning:"어떤 행동을 유발시키는 내적 원인이나 이유.",example:"학습 동기를 높이는 것이 중요하다."},{meaning:"같은 학교·직장 등에 함께 들어온 사람.",example:"그는 나의 대학 동기다."}],tags:["심리","교육"]},
  {word:"맥락",hanja:"脈絡",pos:"명사",definitions:[{meaning:"사물이나 글의 앞뒤 관계와 전체적인 흐름.",example:"문장의 맥락을 파악해야 뜻을 이해할 수 있다."}],tags:["언어","논리"]},
  {word:"모순",hanja:"矛盾",pos:"명사",definitions:[{meaning:"두 사실이나 명제가 서로 어긋나 양립할 수 없는 상태.",example:"그의 발언에는 모순이 있다."}],tags:["논리","철학"]},
  {word:"문화",hanja:"文化",pos:"명사",definitions:[{meaning:"한 사회의 구성원들이 공유하는 생활 방식·가치관·예술·제도의 총체.",example:"다양한 문화를 존중하는 태도가 필요하다."},{meaning:"교양과 세련미를 갖춘 상태.",example:"그는 문화적 소양이 깊다."}],tags:["사회","인류학"]},
  {word:"반론",hanja:"反論",pos:"명사",definitions:[{meaning:"상대방의 주장이나 논거가 잘못되었음을 밝히는 주장.",example:"그는 조목조목 반론을 제기했다."}],tags:["논리","토론"]},
  {word:"발전",hanja:"發展",pos:"명사",definitions:[{meaning:"더 나은 상태로 나아가거나 성장하는 것.",example:"기술의 발전은 삶을 바꿔 놓았다."},{meaning:"전기를 만들어 내는 것.",example:"수력 발전으로 전기를 공급한다."}],tags:["사회","물리"]},
  {word:"비판",hanja:"批判",pos:"명사",definitions:[{meaning:"사물의 옳고 그름 또는 좋고 나쁨을 평가하는 것.",example:"언론의 비판을 겸허히 수용해야 한다."},{meaning:"단순 비난과 달리, 근거를 갖춘 평가.",example:"건전한 비판은 발전의 원동력이다."}],tags:["논리","사회"]},
  {word:"상징",hanja:"象徵",pos:"명사",definitions:[{meaning:"추상적인 개념이나 감정을 구체적인 사물로 나타내는 것.",example:"비둘기는 평화의 상징이다."}],tags:["언어","문학","철학"]},
  {word:"설득",hanja:"說得",pos:"명사",definitions:[{meaning:"이치나 근거를 들어 상대방이 동의하도록 하는 것.",example:"그는 논리적인 설득으로 회의를 이끌었다."}],tags:["소통","논리"]},
  {word:"소통",hanja:"疏通",pos:"명사",definitions:[{meaning:"막힘없이 서로 오가거나 잘 통하는 것.",example:"세대 간 원활한 소통이 필요하다."}],tags:["사회","심리"]},
  {word:"신뢰",hanja:"信賴",pos:"명사",definitions:[{meaning:"믿고 의지하는 것.",example:"신뢰는 인간관계의 기본이다."}],tags:["심리","사회"]},
  {word:"역할",hanja:"役割",pos:"명사",definitions:[{meaning:"어떤 자리에서 마땅히 해야 할 기능이나 임무.",example:"각자의 역할을 충실히 수행해야 한다."}],tags:["사회"]},
  {word:"원칙",hanja:"原則",pos:"명사",definitions:[{meaning:"어떤 행동이나 이론에서 일관되게 지켜지는 기본 규범.",example:"그는 원칙을 중시하는 사람이다."}],tags:["논리","사회"]},
  {word:"의식",hanja:"意識",pos:"명사",definitions:[{meaning:"깨어 있어 주변을 인식하는 심리 상태.",example:"사고 후 의식을 잃었다가 회복했다."},{meaning:"어떤 사물이나 사실에 대해 인식하거나 자각하는 것.",example:"시민 의식이 높아진 사회가 건강하다."}],tags:["철학","심리"]},
  {word:"자아",hanja:"自我",pos:"명사",definitions:[{meaning:"자기 자신에 대한 의식이나 관념.",example:"청소년기에 자아 정체성이 형성된다."}],tags:["철학","심리"]},
  {word:"전제",hanja:"前提",pos:"명사",definitions:[{meaning:"어떤 결론이나 추론을 이끌어 내기 위해 앞서 설정하는 조건이나 명제.",example:"그 주장은 전제 자체가 잘못됐다."}],tags:["논리","철학"]},
  {word:"추론",hanja:"推論",pos:"명사",definitions:[{meaning:"알고 있는 사실을 근거로 알지 못하는 사실을 논리적으로 이끌어 내는 것.",example:"귀납 추론과 연역 추론은 대표적인 논리 방법이다."}],tags:["논리","철학"]},
  {word:"타협",hanja:"妥協",pos:"명사",definitions:[{meaning:"대립하는 의견들이 서로 양보하여 합의점을 찾는 것.",example:"협상은 타협을 통해 마무리되었다."}],tags:["사회","정치"]},
  {word:"통찰",hanja:"洞察",pos:"명사",definitions:[{meaning:"사물의 본질이나 핵심을 꿰뚫어 보는 능력.",example:"그의 글은 사회에 대한 날카로운 통찰을 담고 있다."}],tags:["철학","심리"]},
  {word:"판단",hanja:"判斷",pos:"명사",definitions:[{meaning:"사물을 인식하여 논리·기준에 따라 옳고 그름을 결정하는 사고 작용.",example:"냉철한 판단이 필요한 순간이다."}],tags:["논리","심리"]},
  {word:"표현",hanja:"表現",pos:"명사",definitions:[{meaning:"생각이나 감정을 말·글·행동 등으로 나타내는 것.",example:"자신의 의견을 명확하게 표현하는 것이 중요하다."}],tags:["언어","예술"]},
  {word:"혁신",hanja:"革新",pos:"명사",definitions:[{meaning:"기존의 제도나 방식을 완전히 바꾸어 새롭게 하는 것.",example:"디지털 혁신이 산업 구조를 바꾸고 있다."}],tags:["사회","경제"]},
  {word:"협력",hanja:"協力",pos:"명사",definitions:[{meaning:"힘을 합쳐 서로 도움으로써 어떤 일을 이루는 것.",example:"국제적 협력이 기후 문제 해결의 열쇠다."}],tags:["사회"]},
  {word:"형식",hanja:"形式",pos:"명사",definitions:[{meaning:"사물이나 내용을 담는 외적인 틀이나 방식.",example:"내용도 중요하지만 형식도 무시할 수 없다."},{meaning:"실질적 내용 없이 겉모양만 갖추는 것.",example:"형식적인 행사는 의미가 없다."}],tags:["논리","예술"]},
];

function koChoseong(ch: string): string {
  const code = ch.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return "";
  const idx = Math.floor((code - 0xac00) / (21 * 28));
  const arr = ["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
  const c = arr[idx];
  return ({ㄲ:"ㄱ",ㄸ:"ㄷ",ㅃ:"ㅂ",ㅆ:"ㅅ",ㅉ:"ㅈ"} as Record<string,string>)[c] ?? c;
}

function KoreanCard({ entry, isOpen, onToggle }: { entry: KEntry; isOpen: boolean; onToggle: () => void }) {
  const nums = "❶❷❸❹❺❻❼❽❾❿";
  return (
    <button className={`dict-card ${isOpen ? "open" : ""}`} onClick={onToggle}>
      <div className="dict-card-main">
        <div className="dict-card-left">
          <span className="dict-gosa-word">{entry.word}</span>
          {entry.hanja && <span className="dict-gosa-hanja">{entry.hanja}</span>}
          <span className="dict-pos">{entry.pos}</span>
        </div>
        <div className="dict-card-right">
          <span className="dict-card-summary">{entry.definitions[0].meaning.slice(0,28)}{entry.definitions[0].meaning.length>28?"…":""}</span>
          <span className={`dict-card-arrow ${isOpen ? "open" : ""}`}>›</span>
        </div>
      </div>
      {isOpen && (
        <div className="dict-card-body">
          {entry.definitions.map((d, i) => (
            <div key={i} className="dict-def-item">
              {entry.definitions.length > 1 && <span className="dict-pos">{nums[i]}</span>}
              <p className="dict-card-meaning">{d.meaning}</p>
              {d.example && <p className="dict-def-example">"{d.example}"</p>}
            </div>
          ))}
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

function KoreanDictTab() {
  const [query, setQuery] = useState("");
  const [cho, setCho] = useState("ㄱ");
  const [expanded, setExpanded] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const sorted = useMemo(() => [...KOREAN_WORDS].sort((a, b) => a.word.localeCompare(b.word, "ko")), []);

  const list = useMemo(() => {
    const q = query.trim();
    if (q) return sorted.filter(w =>
      w.word.includes(q) ||
      (w.hanja ?? "").includes(q) ||
      w.definitions.some(d => d.meaning.includes(q) || (d.example ?? "").includes(q)) ||
      (w.tags ?? []).some(t => t.includes(q))
    );
    return sorted.filter(w => koChoseong(w.word[0]) === cho);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, cho]);

  return (
    <div>
      <div className="dict-search-bar">
        <input
          ref={inputRef}
          className="dict-search-input"
          placeholder="단어, 한자, 뜻, 분야로 검색…"
          value={query}
          autoFocus
          onChange={(e) => { setQuery(e.target.value); setExpanded(null); }}
        />
        {query && <button className="dict-clear-btn" onClick={() => { setQuery(""); setExpanded(null); inputRef.current?.focus(); }}>✕</button>}
      </div>

      {!query && (
        <div className="dict-tag-strip" style={{ marginTop: "0.75rem" }}>
          {CHOSEONG_KO.map((c) => (
            <button key={c} className={`dict-tag${cho === c ? " active" : ""}`} onClick={() => { setCho(c); setExpanded(null); }}>{c}</button>
          ))}
        </div>
      )}

      {list.length === 0 ? (
        <div className="dict-empty" style={{ marginTop: "2.5rem" }}>검색 결과가 없어요.</div>
      ) : (
        <>
          <p className="dict-count" style={{ marginTop: "0.75rem" }}>{list.length}개</p>
          <div className="dict-card-list">
            {list.map((w, i) => (
              <KoreanCard key={w.word} entry={w} isOpen={expanded === i} onToggle={() => setExpanded(expanded === i ? null : i)} />
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
