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
  { key: "korean", label: "국어사전", emoji: "📚" },
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

// ── 초등 국어사전 탭 ──
const CHOSEONG = ["ㄱ","ㄴ","ㄷ","ㄹ","ㅁ","ㅂ","ㅅ","ㅇ","ㅈ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];

type KEntry = { word: string; pos: string; definition: string; example: string };

const KOREAN_WORDS: KEntry[] = [
  {word:"가족",pos:"명사",definition:"부모님, 형제, 자매처럼 함께 생활하는 사람들의 무리.",example:"우리 가족은 모두 다섯 명이에요."},
  {word:"가을",pos:"명사",definition:"여름과 겨울 사이의 계절로, 날씨가 서늘해지고 단풍이 드는 때.",example:"가을에는 낙엽이 예쁘게 물들어요."},
  {word:"강",pos:"명사",definition:"산이나 들을 흘러 바다나 호수로 이어지는 큰 물줄기.",example:"강물이 맑고 깨끗해요."},
  {word:"거짓말",pos:"명사",definition:"사실이 아닌 것을 사실인 양 하는 말.",example:"거짓말을 하면 친구들이 믿지 않아요."},
  {word:"겨울",pos:"명사",definition:"가을 다음에 오는 가장 추운 계절.",example:"겨울에는 눈이 내리기도 해요."},
  {word:"고마움",pos:"명사",definition:"남이 베풀어 준 도움이나 은혜에 대해 느끼는 따뜻한 마음.",example:"친구의 도움에 고마움을 느꼈어요."},
  {word:"공부",pos:"명사",definition:"학문이나 기술 등을 배우고 익히는 것.",example:"매일 열심히 공부하면 성적이 올라요."},
  {word:"구름",pos:"명사",definition:"공기 중의 물방울이나 얼음 알갱이가 모여 하늘에 떠 있는 것.",example:"하늘에 흰 구름이 두둥실 떠 있어요."},
  {word:"꽃",pos:"명사",definition:"식물에서 피어나는 아름다운 부분으로, 씨앗을 만드는 역할을 해요.",example:"봄이 오면 예쁜 꽃이 피어나요."},
  {word:"꿈",pos:"명사",definition:"①잠을 자는 동안 보이는 것. ②이루고 싶은 목표나 희망.",example:"나의 꿈은 의사가 되는 것이에요."},
  {word:"감사",pos:"명사",definition:"고맙게 여기는 마음.",example:"도와준 친구에게 감사 인사를 했어요."},
  {word:"걱정",pos:"명사",definition:"안 좋은 일이 생길까 봐 마음이 불안한 것.",example:"시험 점수가 걱정됐지만 잘 봤어요."},
  {word:"겸손",pos:"명사",definition:"잘난 척하지 않고 자신을 낮추는 것.",example:"겸손한 사람은 모두에게 사랑 받아요."},
  {word:"관심",pos:"명사",definition:"어떤 것에 마음이 끌려 주의를 기울이는 것.",example:"동생은 곤충에 관심이 많아요."},
  {word:"나라",pos:"명사",definition:"일정한 땅과 국민을 가지고 다스리는 조직이 있는 집단.",example:"우리나라 이름은 대한민국이에요."},
  {word:"나무",pos:"명사",definition:"줄기가 단단한 목질로 된 여러해살이 식물.",example:"공원에 키 큰 나무가 많아요."},
  {word:"날씨",pos:"명사",definition:"그날그날 하늘의 상태. 맑음, 흐림, 비, 눈 등.",example:"오늘 날씨가 맑고 따뜻해요."},
  {word:"낱말",pos:"명사",definition:"뜻을 가지는 가장 작은 말의 단위.",example:"낱말의 뜻을 국어사전에서 찾아봐요."},
  {word:"노래",pos:"명사",definition:"음정과 리듬에 맞추어 목소리로 부르는 것.",example:"즐거운 노래를 함께 불러요."},
  {word:"노력",pos:"명사",definition:"목표를 이루기 위해 힘을 다해 애쓰는 것.",example:"꾸준한 노력이 좋은 결과를 만들어요."},
  {word:"눈물",pos:"명사",definition:"슬프거나 기쁠 때 눈에서 흘러내리는 액체.",example:"슬픈 영화를 보면 눈물이 나요."},
  {word:"다리",pos:"명사",definition:"①강 위에 건너다닐 수 있도록 놓은 구조물. ②몸을 받치고 걷는 기관.",example:"강 위에 긴 다리가 놓여 있어요."},
  {word:"달",pos:"명사",definition:"지구 주위를 도는 위성으로 밤하늘을 비추는 천체.",example:"보름날에는 둥근 달이 떠올라요."},
  {word:"대화",pos:"명사",definition:"두 사람 이상이 서로 이야기를 주고받는 것.",example:"가족과 대화를 많이 나누면 좋아요."},
  {word:"도움",pos:"명사",definition:"어떤 일을 잘 되도록 힘을 빌려 주는 것.",example:"친구의 도움 덕분에 문제를 해결했어요."},
  {word:"독서",pos:"명사",definition:"책을 읽는 활동.",example:"독서는 상상력을 키워줘요."},
  {word:"동물",pos:"명사",definition:"스스로 움직이고 살아가는 생명체.",example:"동물원에서 다양한 동물을 볼 수 있어요."},
  {word:"동생",pos:"명사",definition:"나보다 나이가 어린 형제 또는 자매.",example:"내 동생은 올해 여섯 살이에요."},
  {word:"땅",pos:"명사",definition:"지구의 표면 중 물이 없는 단단한 부분.",example:"씨앗을 땅에 심으면 싹이 나요."},
  {word:"마음",pos:"명사",definition:"생각하고 느끼고 판단하는 정신 작용의 바탕.",example:"착한 마음을 가지는 것이 중요해요."},
  {word:"말",pos:"명사",definition:"생각이나 느낌을 소리로 나타내는 것.",example:"고운 말을 쓰면 친구들이 좋아해요."},
  {word:"모둠",pos:"명사",definition:"학교에서 활동을 함께 하기 위해 나누어진 작은 그룹.",example:"모둠별로 발표 준비를 해요."},
  {word:"무지개",pos:"명사",definition:"비가 온 뒤 햇빛이 물방울에 꺾여 생기는 일곱 가지 색의 아치.",example:"소나기가 지나가고 아름다운 무지개가 떴어요."},
  {word:"물",pos:"명사",definition:"강, 바다, 지하 등에 있는 빛깔도 냄새도 없는 액체.",example:"목이 마를 때는 물을 마시세요."},
  {word:"바다",pos:"명사",definition:"지구 표면의 많은 부분을 차지하는 넓고 깊은 소금물.",example:"여름 방학에 바다에서 수영했어요."},
  {word:"바람",pos:"명사",definition:"공기가 움직이는 것.",example:"봄바람이 살랑살랑 불어요."},
  {word:"배려",pos:"명사",definition:"다른 사람을 위해 마음을 쓰고 신경 써 주는 것.",example:"친구를 배려하는 마음이 중요해요."},
  {word:"봄",pos:"명사",definition:"겨울이 지나고 날씨가 따뜻해지며 꽃이 피는 계절.",example:"봄이 되면 나들이를 가요."},
  {word:"부모님",pos:"명사",definition:"아버지와 어머니를 함께 이르는 말.",example:"부모님께 항상 감사해요."},
  {word:"비",pos:"명사",definition:"하늘에서 물방울이 되어 내리는 것.",example:"비가 오면 우산을 써야 해요."},
  {word:"사랑",pos:"명사",definition:"다른 사람이나 대상을 아끼고 소중히 여기는 마음.",example:"부모님의 사랑에 항상 감사해요."},
  {word:"산",pos:"명사",definition:"평지보다 높이 솟아 있는 땅의 부분.",example:"가을에 산을 오르면 단풍이 예뻐요."},
  {word:"상상",pos:"명사",definition:"실제로 없거나 경험하지 못한 것을 머릿속으로 그려 보는 것.",example:"상상력이 풍부하면 창의적인 아이디어가 나와요."},
  {word:"생각",pos:"명사",definition:"머릿속으로 이리저리 헤아려 보는 것.",example:"어려운 문제는 천천히 생각하면 풀려요."},
  {word:"선생님",pos:"명사",definition:"학교에서 학생을 가르치는 사람.",example:"선생님께서 재미있게 수업해 주셨어요."},
  {word:"성실",pos:"명사",definition:"게으르지 않고 언제나 열심히 하는 태도.",example:"성실하게 공부하면 꼭 성공해요."},
  {word:"소리",pos:"명사",definition:"공기 등이 진동하여 귀에 들리는 것.",example:"새들의 예쁜 소리가 들려요."},
  {word:"숲",pos:"명사",definition:"나무가 많이 모여 자라는 곳.",example:"숲속에는 다양한 나무와 동물이 살아요."},
  {word:"씨앗",pos:"명사",definition:"식물이 번식을 위해 만들어 내는 것.",example:"화분에 씨앗을 심고 매일 물을 줬어요."},
  {word:"아침",pos:"명사",definition:"날이 밝은 후부터 낮이 되기 전까지의 시간.",example:"아침에 일어나면 세수를 해요."},
  {word:"약속",pos:"명사",definition:"어떤 일을 하기로 미리 정하는 것.",example:"친구와 한 약속은 꼭 지켜야 해요."},
  {word:"어른",pos:"명사",definition:"다 자란 사람. 나이가 많아 경험이 많은 사람.",example:"어른들께는 존댓말을 써야 해요."},
  {word:"여름",pos:"명사",definition:"봄과 가을 사이의 가장 더운 계절.",example:"여름에는 아이스크림이 맛있어요."},
  {word:"예절",pos:"명사",definition:"사람들이 사회에서 지켜야 할 바른 행동 방식.",example:"예절 바른 사람이 되어야 해요."},
  {word:"우정",pos:"명사",definition:"친구 사이의 따뜻하고 깊은 정.",example:"오래된 우정은 정말 소중해요."},
  {word:"의견",pos:"명사",definition:"어떤 문제에 대한 자신의 생각이나 판단.",example:"회의 시간에 자신의 의견을 말했어요."},
  {word:"이야기",pos:"명사",definition:"어떤 사실이나 일에 대해 말로 나타내는 글이나 말.",example:"할머니의 옛날 이야기가 재미있어요."},
  {word:"인사",pos:"명사",definition:"서로 만나거나 헤어질 때 예의를 표하는 행동이나 말.",example:"아침에 선생님께 인사를 했어요."},
  {word:"자연",pos:"명사",definition:"사람이 만들지 않고 스스로 이루어진 모든 것.",example:"자연을 보호해야 우리가 건강하게 살 수 있어요."},
  {word:"재미",pos:"명사",definition:"즐겁고 신나는 느낌.",example:"수학 문제를 풀면서 재미를 느꼈어요."},
  {word:"절약",pos:"명사",definition:"돈, 물, 전기 등을 아껴 쓰는 것.",example:"물을 절약하는 습관을 길러요."},
  {word:"정직",pos:"명사",definition:"마음이 바르고 거짓이 없는 것.",example:"정직한 사람은 모두에게 신뢰를 받아요."},
  {word:"존중",pos:"명사",definition:"상대방을 소중히 여기고 높이 대하는 것.",example:"친구를 존중하는 말을 사용해요."},
  {word:"존댓말",pos:"명사",definition:"상대방을 높여서 하는 말.",example:"어른들께는 항상 존댓말을 써요."},
  {word:"지혜",pos:"명사",definition:"사물의 이치를 잘 알고 슬기롭게 판단하는 능력.",example:"독서를 많이 하면 지혜가 생겨요."},
  {word:"창의",pos:"명사",definition:"새롭고 독특한 것을 만들어 내는 능력.",example:"창의적인 생각이 세상을 바꿔요."},
  {word:"책",pos:"명사",definition:"글이나 그림을 여러 장의 종이에 적어 묶어 놓은 것.",example:"책을 많이 읽으면 어휘력이 늘어요."},
  {word:"책임",pos:"명사",definition:"자신이 맡은 일을 끝까지 해야 하는 의무.",example:"자기 일에 책임감을 가져야 해요."},
  {word:"친구",pos:"명사",definition:"나와 나이가 비슷하고 친하게 어울려 지내는 사람.",example:"친구와 함께 재미있게 놀았어요."},
  {word:"칭찬",pos:"명사",definition:"좋은 점이나 잘한 것을 좋게 말하는 것.",example:"선생님께 칭찬을 받아서 기분이 좋았어요."},
  {word:"태양",pos:"명사",definition:"지구에서 가장 가까운 별로, 빛과 열을 내는 큰 별.",example:"태양 덕분에 지구에 생명체가 살 수 있어요."},
  {word:"편지",pos:"명사",definition:"안부나 소식 등을 종이에 써서 상대방에게 전하는 것.",example:"할머니께 편지를 썼어요."},
  {word:"하늘",pos:"명사",definition:"땅 위로 높이 펼쳐진 공간.",example:"맑은 날에는 하늘이 파랗게 보여요."},
  {word:"학교",pos:"명사",definition:"학생들이 모여 공부를 하는 건물이나 기관.",example:"학교에서 친구들과 함께 배워요."},
  {word:"행복",pos:"명사",definition:"삶에서 즐거움과 만족감을 느끼는 상태.",example:"가족과 함께할 때 행복해요."},
  {word:"호기심",pos:"명사",definition:"새롭거나 신기한 것에 관심을 가지고 알고 싶어 하는 마음.",example:"호기심이 많으면 공부가 재미있어요."},
  {word:"희망",pos:"명사",definition:"어떤 일이 잘 이루어지기를 바라는 마음.",example:"밝은 희망을 가지고 열심히 살아요."},
];

function getChoseong(ch: string): string {
  const code = ch.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return "";
  const idx = Math.floor((code - 0xac00) / (21 * 28));
  const arr = ["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
  const c = arr[idx];
  return ({ㄲ:"ㄱ",ㄸ:"ㄷ",ㅃ:"ㅂ",ㅆ:"ㅅ",ㅉ:"ㅈ"} as Record<string,string>)[c] ?? c;
}

function KoreanDictTab() {
  const [query, setQuery] = useState("");
  const [cho, setCho] = useState("ㄱ");
  const inputRef = useRef<HTMLInputElement>(null);

  const sorted = useMemo(() => [...KOREAN_WORDS].sort((a,b) => a.word.localeCompare(b.word,"ko")), []);

  const list = useMemo(() => {
    const q = query.trim();
    if (q) return sorted.filter(w => w.word.includes(q) || w.definition.includes(q) || w.example.includes(q));
    return sorted.filter(w => getChoseong(w.word[0]) === cho);
  }, [query, cho, sorted]);

  return (
    <div>
      <div className="dict-search-bar">
        <input
          ref={inputRef}
          className="dict-search-input"
          placeholder="낱말, 뜻, 예문으로 검색…"
          value={query}
          autoFocus
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && <button className="dict-clear-btn" onClick={() => { setQuery(""); inputRef.current?.focus(); }}>✕</button>}
      </div>

      {!query && (
        <div className="dict-tag-strip" style={{marginTop:"0.75rem"}}>
          {CHOSEONG.map((c) => (
            <button key={c} className={`dict-tag${cho===c ? " active" : ""}`} onClick={() => setCho(c)}>{c}</button>
          ))}
        </div>
      )}

      <div style={{marginTop:"0.75rem"}}>
        {list.length === 0 ? (
          <div className="dict-empty">검색 결과가 없어요.</div>
        ) : (
          <>
            <p className="dict-count">{list.length}개</p>
            {list.map((w) => (
              <div key={w.word} className="dict-card" style={{marginBottom:"0.45rem"}}>
                <div style={{display:"flex",alignItems:"center",gap:"0.5rem",marginBottom:"0.35rem"}}>
                  <span className="dict-gosa-word" style={{fontSize:"1.05rem"}}>{w.word}</span>
                  <span className="dict-pos">{w.pos}</span>
                </div>
                <p className="dict-def-text">{w.definition}</p>
                <p className="dict-def-example" style={{marginTop:"0.3rem"}}>예) {w.example}</p>
              </div>
            ))}
          </>
        )}
      </div>
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
