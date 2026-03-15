"use client";

import { useEffect, useRef, useState } from "react";

interface Habit {
  id: number;
  name: string;
  icon: string;
  color: string;
  sort_order: number;
  done_today: boolean;
  streak: number;
  weekDates: string[];
  weekDone: boolean[];
}

const PRESET_ICONS = ["✅", "💪", "📚", "🏃", "💧", "🧘", "🎯", "🧹", "🍎", "😴", "✍️", "🎸", "🌅", "🚴", "💊", "🧠", "🌿", "💬"];
const PRESET_COLORS = [
  "#30d158", "#0a84ff", "#ff9500", "#ff453a", "#bf5af2",
  "#5e5ce6", "#64d2ff", "#ffd60a", "#ff6b6b", "#4ecdc4",
];

function weekDayLabel(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
}

function StreakBadge({ streak }: { streak: number }) {
  if (streak === 0) return null;
  return (
    <span className="habit-streak">
      🔥 {streak}일
    </span>
  );
}

function WeekGrid({ weekDates, weekDone }: { weekDates: string[]; weekDone: boolean[] }) {
  return (
    <div className="habit-week-grid">
      {weekDates.map((d, i) => (
        <div key={d} className={`habit-week-cell ${weekDone[i] ? "done" : ""}`}>
          <span className="habit-week-day">{weekDayLabel(d)}</span>
          <div className="habit-week-dot" />
        </div>
      ))}
    </div>
  );
}

interface ModalState {
  mode: "add" | "edit";
  id?: number;
  name: string;
  icon: string;
  color: string;
}

export default function HabitPage() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [today, setToday] = useState("");
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<number | null>(null);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  async function fetchHabits() {
    const res = await fetch("/api/habits");
    if (!res.ok) return;
    const json = await res.json();
    setHabits(json.data?.habits ?? []);
    setToday(json.data?.today ?? "");
    setLoading(false);
  }

  useEffect(() => { fetchHabits(); }, []);

  useEffect(() => {
    if (modal) setTimeout(() => nameRef.current?.focus(), 80);
  }, [modal]);

  async function toggle(habit: Habit) {
    if (toggling !== null) return;
    setToggling(habit.id);
    await fetch("/api/habits/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ habit_id: habit.id, date: today }),
    });
    await fetchHabits();
    setToggling(null);
  }

  async function saveHabit() {
    if (!modal || saving) return;
    const name = modal.name.trim();
    if (!name) { nameRef.current?.focus(); return; }
    setSaving(true);

    if (modal.mode === "add") {
      await fetch("/api/habits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, icon: modal.icon, color: modal.color }),
      });
    } else {
      await fetch("/api/habits", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: modal.id, name, icon: modal.icon, color: modal.color }),
      });
    }

    setSaving(false);
    setModal(null);
    await fetchHabits();
  }

  async function deleteHabit(id: number) {
    if (deleting !== null) return;
    if (!confirm("습관을 삭제하면 모든 기록도 함께 삭제됩니다. 삭제할까요?")) return;
    setDeleting(id);
    await fetch(`/api/habits?id=${id}`, { method: "DELETE" });
    setDeleting(null);
    await fetchHabits();
  }

  const completedCount = habits.filter((h) => h.done_today).length;
  const rate = habits.length ? Math.round((completedCount / habits.length) * 100) : 0;

  return (
    <div className="habit-page">
      {/* 헤더 */}
      <div className="habit-header">
        <div>
          <h1 className="habit-title">🌿 습관 트래커</h1>
          <p className="habit-subtitle">오늘 {today ? today.replace(/-/g, ".") : ""} · 매일 조금씩 성장</p>
        </div>
        <button className="habit-add-btn" onClick={() => setModal({ mode: "add", name: "", icon: "✅", color: "#30d158" })}>
          + 습관 추가
        </button>
      </div>

      {/* 오늘 달성률 */}
      {habits.length > 0 && (
        <div className="habit-progress-bar-wrap">
          <div className="habit-progress-label">
            <span>오늘 달성 {completedCount}/{habits.length}</span>
            <span className="habit-progress-pct">{rate}%</span>
          </div>
          <div className="habit-progress-track">
            <div className="habit-progress-fill" style={{ width: `${rate}%` }} />
          </div>
        </div>
      )}

      {/* 로딩 */}
      {loading && (
        <div className="habit-empty">불러오는 중…</div>
      )}

      {/* 비어있을 때 */}
      {!loading && habits.length === 0 && (
        <div className="habit-empty">
          <span style={{ fontSize: "2.5rem" }}>🌱</span>
          <p>아직 습관이 없어요.</p>
          <p style={{ fontSize: "0.82rem", color: "var(--text-2)" }}>+ 습관 추가로 첫 번째 습관을 만들어 보세요!</p>
        </div>
      )}

      {/* 습관 리스트 */}
      <div className="habit-list">
        {habits.map((h) => (
          <div key={h.id} className={`habit-card ${h.done_today ? "done" : ""}`}>
            <button
              className="habit-check"
              style={{ borderColor: h.color, background: h.done_today ? h.color : "transparent" }}
              onClick={() => toggle(h)}
              disabled={toggling === h.id}
              aria-label={h.done_today ? "완료 취소" : "완료"}
            >
              {h.done_today && <span style={{ color: "#fff", fontSize: "1rem" }}>✓</span>}
            </button>

            <div className="habit-icon" style={{ background: h.color + "22" }}>
              {h.icon}
            </div>

            <div className="habit-info">
              <div className="habit-name-row">
                <span className="habit-name">{h.name}</span>
                <StreakBadge streak={h.streak} />
              </div>
              <WeekGrid weekDates={h.weekDates} weekDone={h.weekDone} />
            </div>

            <div className="habit-actions">
              <button
                className="habit-action-btn"
                onClick={() => setModal({ mode: "edit", id: h.id, name: h.name, icon: h.icon, color: h.color })}
                title="편집"
              >
                ✏️
              </button>
              <button
                className="habit-action-btn danger"
                onClick={() => deleteHabit(h.id)}
                disabled={deleting === h.id}
                title="삭제"
              >
                🗑
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* 모달 */}
      {modal && (
        <div className="habit-modal-overlay" onClick={() => setModal(null)}>
          <div className="habit-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="habit-modal-title">{modal.mode === "add" ? "새 습관 추가" : "습관 편집"}</h2>

            <label className="habit-modal-label">이름</label>
            <input
              ref={nameRef}
              className="habit-modal-input"
              placeholder="ex) 아침 독서 30분"
              value={modal.name}
              maxLength={100}
              onChange={(e) => setModal((m) => m ? { ...m, name: e.target.value } : m)}
              onKeyDown={(e) => { if (e.key === "Enter") saveHabit(); }}
            />

            <label className="habit-modal-label">아이콘</label>
            <div className="habit-icon-picker">
              {PRESET_ICONS.map((ic) => (
                <button
                  key={ic}
                  className={`habit-icon-option ${modal.icon === ic ? "selected" : ""}`}
                  onClick={() => setModal((m) => m ? { ...m, icon: ic } : m)}
                >
                  {ic}
                </button>
              ))}
            </div>

            <label className="habit-modal-label">색상</label>
            <div className="habit-color-picker">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  className={`habit-color-swatch ${modal.color === c ? "selected" : ""}`}
                  style={{ background: c }}
                  onClick={() => setModal((m) => m ? { ...m, color: c } : m)}
                  aria-label={c}
                />
              ))}
            </div>

            <div className="habit-modal-preview">
              미리보기: <span style={{ background: modal.color + "22", borderRadius: "8px", padding: "4px 10px", fontWeight: 600 }}>
                {modal.icon} {modal.name || "이름 없음"}
              </span>
            </div>

            <div className="habit-modal-actions">
              <button className="habit-modal-cancel" onClick={() => setModal(null)}>취소</button>
              <button className="habit-modal-save" onClick={saveHabit} disabled={saving}>
                {saving ? "저장 중…" : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
