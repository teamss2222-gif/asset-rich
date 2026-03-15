"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ── 타이머 설정값 ──
const MODES = [
  { key: "work",       label: "집중",      defaultMin: 25, color: "#ff9500" },
  { key: "shortBreak", label: "짧은 휴식",  defaultMin: 5,  color: "#30d158" },
  { key: "longBreak",  label: "긴 휴식",   defaultMin: 15, color: "#0a84ff" },
] as const;
type ModeKey = typeof MODES[number]["key"];

const CIRCLE_R = 90;
const CIRCLE_C = 2 * Math.PI * CIRCLE_R; // circumference

function pad(n: number) { return String(n).padStart(2, "0"); }

function beep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.6);
  } catch {
    // 무시
  }
}

interface Stats {
  completedCount: number;
  totalFocusMinutes: number;
  weekly: { session_date: string; count: string }[];
}

export default function PomodoroPage() {
  const [modeIdx, setModeIdx] = useState(0);
  const mode = MODES[modeIdx];

  // 사용자 정의 시간 (분)
  const [customMins, setCustomMins] = useState<Record<ModeKey, number>>({
    work: 25,
    shortBreak: 5,
    longBreak: 15,
  });

  const totalSec = customMins[mode.key] * 60;
  const [secsLeft, setSecsLeft] = useState(totalSec);
  const [running, setRunning] = useState(false);
  const [sessionCount, setSessionCount] = useState(0); // 완료된 집중 세션 수 (로컬)
  const [label, setLabel] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 서버에서 오늘 통계 로딩
  async function fetchStats() {
    const res = await fetch("/api/pomodoro");
    if (!res.ok) return;
    const json = await res.json();
    setStats({
      completedCount: json.data?.completedCount ?? 0,
      totalFocusMinutes: json.data?.totalFocusMinutes ?? 0,
      weekly: json.data?.weekly ?? [],
    });
  }

  useEffect(() => {
    fetchStats();
  }, []);

  // 모드 변경 시 타이머 리셋
  function switchMode(idx: number) {
    if (running) stopTimer();
    setModeIdx(idx);
    setSecsLeft(customMins[MODES[idx].key] * 60);
  }

  const stopTimer = useCallback(() => {
    setRunning(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!running) return;
    intervalRef.current = setInterval(() => {
      setSecsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(intervalRef.current!);
          intervalRef.current = null;
          setRunning(false);
          beep();
          // 집중 모드 완료시 서버 저장
          if (MODES[modeIdx].key === "work") {
            setSessionCount((c) => c + 1);
            fetch("/api/pomodoro", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                work_minutes: customMins[MODES[modeIdx].key],
                completed: true,
                label: label.trim(),
              }),
            }).then(fetchStats);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running, modeIdx, customMins, label]);

  function startPause() {
    if (running) {
      stopTimer();
    } else {
      setRunning(true);
    }
  }

  function reset() {
    stopTimer();
    setSecsLeft(customMins[mode.key] * 60);
  }

  function applySettings(newMins: Record<ModeKey, number>) {
    setCustomMins(newMins);
    setSecsLeft(newMins[mode.key] * 60);
    stopTimer();
    setShowSettings(false);
  }

  const progress = totalSec > 0 ? (totalSec - secsLeft) / totalSec : 0;
  const dashOffset = CIRCLE_C * (1 - progress);

  const mins = Math.floor(secsLeft / 60);
  const secs = secsLeft % 60;

  // 최근 7일 array
  const weeklyMap: Record<string, number> = {};
  stats?.weekly.forEach((w) => { weeklyMap[w.session_date] = Number(w.count); });
  const weekDates: string[] = [];
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    weekDates.push(d.toLocaleDateString("sv-SE"));
  }

  return (
    <div className="pomo-page">
      {/* 헤더 */}
      <div className="pomo-header">
        <h1 className="pomo-title">⏱ 뽀모도로 타이머</h1>
        <button className="pomo-settings-btn" onClick={() => setShowSettings(true)} title="설정">⚙️</button>
      </div>

      {/* 모드 탭 */}
      <div className="pomo-mode-tabs">
        {MODES.map((m, i) => (
          <button
            key={m.key}
            className={`pomo-mode-tab ${modeIdx === i ? "active" : ""}`}
            style={modeIdx === i ? { borderBottomColor: m.color, color: m.color } : {}}
            onClick={() => switchMode(i)}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* 원형 타이머 */}
      <div className="pomo-timer-wrap">
        <svg className="pomo-ring" viewBox="0 0 200 200" width={220} height={220}>
          <circle cx={100} cy={100} r={CIRCLE_R} className="pomo-ring-bg" />
          <circle
            cx={100} cy={100} r={CIRCLE_R}
            className="pomo-ring-fill"
            style={{
              stroke: mode.color,
              strokeDasharray: CIRCLE_C,
              strokeDashoffset: dashOffset,
            }}
          />
        </svg>
        <div className="pomo-time-display">
          <span className="pomo-time-number">{pad(mins)}:{pad(secs)}</span>
          <span className="pomo-time-mode">{mode.label}</span>
        </div>
      </div>

      {/* 라벨 인풋 */}
      <div className="pomo-label-wrap">
        <input
          className="pomo-label-input"
          placeholder="지금 집중할 작업을 입력해 보세요 (선택)"
          value={label}
          maxLength={80}
          onChange={(e) => setLabel(e.target.value)}
        />
      </div>

      {/* 컨트롤 버튼 */}
      <div className="pomo-controls">
        <button className="pomo-reset-btn" onClick={reset}>↺</button>
        <button
          className={`pomo-start-btn ${running ? "pause" : "start"}`}
          style={{ background: mode.color }}
          onClick={startPause}
        >
          {running ? "⏸ 일시 정지" : secsLeft === 0 ? "🔄 다시 시작" : "▶ 시작"}
        </button>
      </div>

      {/* 오늘 통계 */}
      <div className="pomo-stats-row">
        <div className="pomo-stat-card">
          <span className="pomo-stat-num">🍅 {(stats?.completedCount ?? 0) + sessionCount}</span>
          <span className="pomo-stat-label">오늘 완료</span>
        </div>
        <div className="pomo-stat-card">
          <span className="pomo-stat-num">⏱ {(stats?.totalFocusMinutes ?? 0) + (sessionCount * customMins.work)}분</span>
          <span className="pomo-stat-label">총 집중 시간</span>
        </div>
        <div className="pomo-stat-card">
          <span className="pomo-stat-num">🎯 {sessionCount}</span>
          <span className="pomo-stat-label">이번 세션</span>
        </div>
      </div>

      {/* 7일 히트맵 */}
      <div className="pomo-weekly">
        <p className="pomo-weekly-title">최근 7일</p>
        <div className="pomo-weekly-grid">
          {weekDates.map((d) => {
            const count = weeklyMap[d] ?? 0;
            const dayLabel = ["일", "월", "화", "수", "목", "금", "토"][new Date(d + "T00:00:00").getDay()];
            const intensity = Math.min(count, 8);
            return (
              <div key={d} className="pomo-weekly-cell">
                <div className="pomo-weekly-bar-wrap" title={`${d}: ${count}개`}>
                  <div className="pomo-weekly-bar" style={{ height: `${Math.max(4, intensity * 10)}%`, background: "#ff9500", opacity: count > 0 ? 0.5 + intensity * 0.065 : 0.12 }} />
                </div>
                <span className="pomo-weekly-day">{dayLabel}</span>
                {count > 0 && <span className="pomo-weekly-count">{count}</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* 설정 모달 */}
      {showSettings && (
        <SettingsModal
          current={customMins}
          onApply={applySettings}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}

function SettingsModal({
  current,
  onApply,
  onClose,
}: {
  current: Record<ModeKey, number>;
  onApply: (v: Record<ModeKey, number>) => void;
  onClose: () => void;
}) {
  const [vals, setVals] = useState({ ...current });

  function set(k: ModeKey, v: string) {
    const n = Math.min(120, Math.max(1, parseInt(v) || 1));
    setVals((prev) => ({ ...prev, [k]: n }));
  }

  return (
    <div className="pomo-modal-overlay" onClick={onClose}>
      <div className="pomo-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="pomo-modal-title">타이머 설정</h2>
        {MODES.map((m) => (
          <div key={m.key} className="pomo-modal-row">
            <label className="pomo-modal-label">{m.label} (분)</label>
            <input
              type="number"
              className="pomo-modal-input"
              min={1} max={120}
              value={vals[m.key]}
              onChange={(e) => set(m.key, e.target.value)}
            />
          </div>
        ))}
        <div className="pomo-modal-actions">
          <button className="habit-modal-cancel" onClick={onClose}>취소</button>
          <button className="habit-modal-save" style={{ background: "#ff9500" }} onClick={() => onApply(vals)}>적용</button>
        </div>
      </div>
    </div>
  );
}
