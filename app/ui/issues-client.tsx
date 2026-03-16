"use client";

import { useState, useEffect, useCallback } from "react";
import { requestApi } from "../../lib/http-client";

type AgeKey = "10" | "20" | "30" | "40" | "50" | "60";

type IssueRecord = {
  id: number;
  rank: number;
  keyword: string;
  sourceRanks: { google?: number; youtube?: number; naver?: number; daum?: number; ai?: number };
  score: number;
  genderWeights: { male: number; female: number };
  ageWeights: Record<AgeKey, number>;
  meta: { traffic?: string; videoId?: string; thumbnail?: string };
  collectedAt: string;
};

const GENDER_OPTIONS = [
  { value: "", label: "전체" },
  { value: "male", label: "남성" },
  { value: "female", label: "여성" },
];

const AGE_OPTIONS = [
  { value: "", label: "전체" },
  { value: "10", label: "10대" },
  { value: "20", label: "20대" },
  { value: "30", label: "30대" },
  { value: "40", label: "40대" },
  { value: "50", label: "50대" },
  { value: "60", label: "60대+" },
];

function RankBadge({ rank }: { rank: number }) {
  const cls =
    rank === 1 ? "issue-rank rank-1" :
    rank === 2 ? "issue-rank rank-2" :
    rank === 3 ? "issue-rank rank-3" : "issue-rank";
  return <div className={cls}>{rank}</div>;
}

function SourceBadges({ sourceRanks }: { sourceRanks: IssueRecord["sourceRanks"] }) {
  return (
    <div className="issue-meta">
      {sourceRanks.ai !== undefined && (
        <span className="issue-source-badge source-ai">AI</span>
      )}
      {sourceRanks.google !== undefined && (
        <span className="issue-source-badge source-google">G</span>
      )}
      {sourceRanks.youtube !== undefined && (
        <span className="issue-source-badge source-youtube">Y</span>
      )}
      {sourceRanks.naver !== undefined && (
        <span className="issue-source-badge source-naver">N</span>
      )}
      {sourceRanks.daum !== undefined && (
        <span className="issue-source-badge source-daum">D</span>
      )}
    </div>
  );
}

function DotPulse() {
  return (
    <div className="dot-pulse">
      <span /><span /><span />
    </div>
  );
}

export default function IssuesClient() {
  const [issues, setIssues] = useState<IssueRecord[]>([]);
  const [collectedAt, setCollectedAt] = useState<string | null>(null);
  const [gender, setGender] = useState("");
  const [age, setAge] = useState("");
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");
  const [selected, setSelected] = useState<IssueRecord | null>(null);
  const [explanation, setExplanation] = useState("");
  const [explaining, setExplaining] = useState(false);
  const [explainError, setExplainError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [crawlMsg, setCrawlMsg] = useState("");
  const [countdown, setCountdown] = useState(0);

  const fetchIssues = useCallback(async (g: string, a: string) => {
    setLoading(true);
    setFetchError("");
    const params = new URLSearchParams();
    if (g) params.set("gender", g);
    if (a) params.set("age", a);

    const res = await requestApi<{
      issues: IssueRecord[];
      collectedAt: string | null;
    }>(`/api/issues?${params.toString()}`);

    if (res.ok) {
      setIssues(res.data.issues ?? []);
      setCollectedAt(res.data.collectedAt ?? null);
    } else {
      setFetchError(res.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchIssues(gender, age);
  }, [gender, age, fetchIssues]);

  const handleRefresh = async () => {
    setRefreshing(true);
    setCrawlMsg("");
    const res = await requestApi<{ count: number; sources: string[] }>(
      "/api/issues/crawl",
      { method: "POST" },
    );
    if (res.ok) {
      setCrawlMsg(`✅ ${res.data.count}건 수집 완료 (${res.data.sources.join(", ")})`);
    } else {
      setCrawlMsg(`⚠️ 수집 실패: ${res.message}`);
    }
    await fetchIssues(gender, age);
    setRefreshing(false);
    setTimeout(() => setCrawlMsg(""), 5000);
  };

  const MAX_WAIT = 30;
  const handleItemClick = async (issue: IssueRecord) => {
    setSelected(issue);
    setExplanation("");
    setExplainError("");
    setExplaining(true);
    setCountdown(MAX_WAIT);

    // 카운트다운 타이머
    const tick = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) { clearInterval(tick); return 0; }
        return c - 1;
      });
    }, 1000);

    // 30초 클라이언트 타임아웃
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), MAX_WAIT * 1000);

    try {
      const res = await requestApi<{ keyword: string; explanation: string }>(
        "/api/issues/explain",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keyword: issue.keyword }),
          signal: controller.signal,
        },
      );
      if (res.ok) {
        setExplanation(res.data.explanation ?? "");
      } else {
        const detail = (res.raw as Record<string, string> | null)?.details;
        setExplainError(detail ? `${res.message}\n\n[detail] ${detail}` : res.message);
      }
    } catch {
      setExplainError("30초 내 응답이 없어 중단되었습니다.");
    } finally {
      clearInterval(tick);
      clearTimeout(timeoutId);
      setCountdown(0);
      setExplaining(false);
    }
  };

  const clearDetail = () => {
    setSelected(null);
    setExplanation("");
    setExplainError("");
  };

  const formatTime = (iso: string) => {
    return new Date(iso).toLocaleString("ko-KR", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // 설명 텍스트 볼드 마크다운 렌더링
  const renderExplanation = (text: string) => {
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={i} style={{ color: "var(--text-1)" }}>{part.slice(2, -2)}</strong>;
      }
      return <span key={i}>{part}</span>;
    });
  };

  return (
    <div className="issue-shell">
      {/* 헤더 */}
      <div className="issue-header">
        <div className="issue-header-left">
          <h2>🔥 실시간 이슈</h2>
          <small>
            {collectedAt
              ? `최근 수집: ${formatTime(collectedAt)}`
              : "데이터 수집 중..."}
          </small>
        </div>
        <button
          className="issue-refresh-btn"
          onClick={handleRefresh}
          disabled={refreshing}
          type="button"
        >
          {refreshing ? (
            <>
              <DotPulse />
              수집 중...
            </>
          ) : (
            <>↻ 지금 수집</>
          )}
        </button>
      </div>

      {/* 수집 결과 메시지 */}
      {crawlMsg && (
        <div className={`issue-crawl-msg${crawlMsg.startsWith("⚠️") ? " is-error" : ""}`}>
          {crawlMsg}
        </div>
      )}

      {/* API 에러 메시지 */}
      {fetchError && !loading && (
        <div className="issue-crawl-msg is-error">
          ⚠️ {fetchError}
        </div>
      )}

      {/* 필터 바 */}
      <div className="issue-filter-bar">
        <div className="issue-filter-row">
          <span className="issue-filter-label">성별</span>
          {GENDER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`filter-chip${gender === opt.value ? " active" : ""}`}
              onClick={() => setGender(opt.value)}
              type="button"
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="issue-filter-row">
          <span className="issue-filter-label">연령대</span>
          {AGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`filter-chip${age === opt.value ? " active" : ""}`}
              onClick={() => setAge(opt.value)}
              type="button"
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* 본문: 2단 분할 */}
      <div className="issue-body-split">
        {/* 왼쪽: 2열 이슈 그리드 */}
        <div className="issue-list-pane">
          {loading ? (
            <div className="issue-grid-2col">
              {Array.from({ length: 20 }).map((_, i) => (
                <div key={i} className="issue-skeleton" style={{ height: "42px" }} />
              ))}
            </div>
          ) : issues.length === 0 ? (
            <p style={{ color: "var(--text-3)", textAlign: "center", padding: "2rem 0", fontSize: "0.84rem" }}>
              이슈 데이터가 없습니다. 위 버튼으로 수동 수집하세요.
            </p>
          ) : (
            <div className="issue-grid-2col">
              {issues.map((issue) => (
                <button
                  key={issue.id}
                  className={`issue-grid-item${selected?.id === issue.id ? " active" : ""}`}
                  onClick={() => void handleItemClick(issue)}
                  type="button"
                >
                  <RankBadge rank={issue.rank} />
                  <span className="issue-keyword">{issue.keyword}</span>
                  <SourceBadges sourceRanks={issue.sourceRanks} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 오른쪽: 상세 분석 패널 */}
        <div className="issue-detail-pane">
          {!selected ? (
            <div className="issue-detail-empty">
              <div className="issue-detail-empty-icon">🔍</div>
              <span>키워드를 클릭하면<br />AI 이슈 분석이<br />여기에 표시됩니다</span>
            </div>
          ) : (
            <div className="issue-detail-content">
              <div className="issue-detail-head">
                <span className="issue-detail-rank">#{selected.rank}</span>
                <h3 className="issue-detail-title">{selected.keyword}</h3>
                <button
                  className="issue-detail-close"
                  onClick={clearDetail}
                  type="button"
                  aria-label="닫기"
                >
                  ×
                </button>
              </div>

              <div className="issue-modal-sources">
                {selected.sourceRanks.google !== undefined && (
                  <span className="issue-modal-source-item">
                    <span className="issue-source-badge source-google">G</span>
                    구글 {selected.sourceRanks.google}위
                  </span>
                )}
                {selected.sourceRanks.youtube !== undefined && (
                  <span className="issue-modal-source-item">
                    <span className="issue-source-badge source-youtube">Y</span>
                    유튜브 {selected.sourceRanks.youtube}위
                  </span>
                )}
                {selected.sourceRanks.naver !== undefined && (
                  <span className="issue-modal-source-item">
                    <span className="issue-source-badge source-naver">N</span>
                    네이버 {selected.sourceRanks.naver}위
                  </span>
                )}
                {selected.sourceRanks.daum !== undefined && (
                  <span className="issue-modal-source-item">
                    <span className="issue-source-badge source-daum">D</span>
                    다음 {selected.sourceRanks.daum}위
                  </span>
                )}
                {selected.sourceRanks.ai !== undefined && (
                  <span className="issue-modal-source-item">
                    <span className="issue-source-badge source-ai">AI</span>
                    AI 생성
                  </span>
                )}
                {selected.meta.traffic && (
                  <span className="issue-modal-source-item">검색량 {selected.meta.traffic}</span>
                )}
              </div>

              <div className="issue-explain-section">
                <p className="issue-explain-title">🤖 AI 이슈 분석</p>
                {explaining ? (
                  <div className="issue-explain-loading">
                    <DotPulse />
                    <span>분석 중... ({countdown}초)</span>
                    <div className="issue-countdown-bar">
                      <div className="issue-countdown-fill" style={{ width: `${(countdown / 30) * 100}%` }} />
                    </div>
                  </div>
                ) : explainError ? (
                  <div className="issue-no-openai">⚠️ {explainError}</div>
                ) : explanation ? (
                  <p className="issue-explain-text">{renderExplanation(explanation)}</p>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
