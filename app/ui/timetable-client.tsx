"use client";

import { useState, useEffect, useCallback } from "react";
import { requestApi } from "../../lib/http-client";

// ── Types ────────────────────────────────────────────────────────────────────

type ScheduleEvent = {
  id: number;
  date: string;      // YYYY-MM-DD
  startTime: number; // minutes from midnight (e.g. 540 = 09:00)
  endTime: number;
  title: string;
  description: string;
  color: string;
};

type ModalState = {
  open: boolean;
  mode: "create" | "edit";
  eventId?: number;
  date: string;
  startTime: number;
  endTime: number;
  title: string;
  description: string;
  color: string;
};

// ── Constants ────────────────────────────────────────────────────────────────

const SLOT_HEIGHT = 20;   // px per 10 min
const DAY_START   = 420;  // 07:00
const DAY_END     = 1440; // 24:00
const GRID_HEIGHT = (DAY_END - DAY_START) * 2; // 2040 px
const DAY_NAMES   = ["일", "월", "화", "수", "목", "금", "토"];
const EVENT_COLORS = [
  "#0a84ff", "#30d158", "#ff9500", "#ff453a",
  "#bf5af2", "#32ade6", "#ff375f", "#ffd60a",
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function minutesToTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** minutes → pixel offset from top of grid */
function timeToY(minutes: number): number {
  return (minutes - DAY_START) * 2; // /10*SLOT_HEIGHT = *2
}

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay()); // back to Sunday
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatWeekLabel(start: Date): string {
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const fmt = (d: Date) =>
    `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
  return `${fmt(start)} ~ ${fmt(end)}`;
}

function getNowMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function getTodayStr(): string {
  return formatDate(new Date());
}

// ── Sub-components ───────────────────────────────────────────────────────────

function ColorSwatch({ color, selected, onClick }: {
  color: string; selected: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`sched-color-swatch${selected ? " selected" : ""}`}
      style={{ background: color }}
      onClick={onClick}
      aria-label={color}
    />
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function TimetableClient() {
  const [weekStart, setWeekStart] = useState<Date>(() => getWeekStart(new Date()));
  const [events, setEvents]       = useState<ScheduleEvent[]>([]);
  const [summaries, setSummaries] = useState<Record<string, string>>({});
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState("");
  const [saving, setSaving]       = useState(false);
  const [modal, setModal] = useState<ModalState>({
    open: false, mode: "create", date: "", startTime: 540, endTime: 600,
    title: "", description: "", color: EVENT_COLORS[0],
  });
  const [summaryDirty, setSummaryDirty] = useState<Record<string, boolean>>({});
  const [nowMinutes, setNowMinutes] = useState(getNowMinutes);
  const todayStr = getTodayStr();

  // refresh "now" indicator every minute
  useEffect(() => {
    const id = setInterval(() => setNowMinutes(getNowMinutes()), 60_000);
    return () => clearInterval(id);
  }, []);

  // load data when weekStart changes
  const loadWeek = useCallback(async (ws: Date) => {
    setLoading(true);
    setError("");
    const res = await requestApi<{ events: ScheduleEvent[]; summaries: Record<string, string> }>(
      `/api/schedule?weekStart=${formatDate(ws)}`,
    );
    setLoading(false);
    if (res.ok && res.data) {
      setEvents(res.data.events ?? []);
      setSummaries(res.data.summaries ?? {});
    } else {
      setError(res.message || "데이터를 불러오지 못했습니다.");
    }
  }, []);

  useEffect(() => { loadWeek(weekStart); }, [weekStart, loadWeek]);

  // ── Derived data ────────────────────────────────────────────────────────

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return { date: formatDate(d), dayOfWeek: i, dayNum: d.getDate() };
  });

  const hourMarkers = Array.from({ length: 18 }, (_, i) => {
    const min = (7 + i) * 60;
    return { min, y: timeToY(min), label: minutesToTime(min) };
  });

  const halfHourMins = Array.from({ length: 17 }, (_, i) => (7 + i) * 60 + 30);

  // ── Navigation ───────────────────────────────────────────────────────────

  const prevWeek = () => setWeekStart(ws => {
    const d = new Date(ws); d.setDate(d.getDate() - 7); return d;
  });
  const nextWeek = () => setWeekStart(ws => {
    const d = new Date(ws); d.setDate(d.getDate() + 7); return d;
  });
  const goToday  = () => setWeekStart(getWeekStart(new Date()));

  // ── Summary ──────────────────────────────────────────────────────────────

  const handleSummaryChange = (date: string, value: string) => {
    setSummaries(prev => ({ ...prev, [date]: value }));
    setSummaryDirty(prev => ({ ...prev, [date]: true }));
  };

  const saveSummary = async (date: string) => {
    if (!summaryDirty[date]) return;
    setSummaryDirty(prev => ({ ...prev, [date]: false }));
    await requestApi("/api/schedule/summary", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, summary: summaries[date] ?? "" }),
    });
  };

  // ── Grid click → create ──────────────────────────────────────────────────

  const handleDayColClick = (date: string, e: React.MouseEvent<HTMLDivElement>) => {
    const y = e.nativeEvent.offsetY;
    const snapped    = DAY_START + Math.round(y / SLOT_HEIGHT) * 10;
    const startTime  = Math.max(DAY_START, Math.min(1430, snapped));
    const endTime    = Math.min(DAY_END, startTime + 60);
    setModal({
      open: true, mode: "create", date,
      startTime, endTime, title: "", description: "", color: EVENT_COLORS[0],
    });
  };

  // ── Open edit modal ──────────────────────────────────────────────────────

  const openEditModal = (ev: ScheduleEvent, e: React.MouseEvent) => {
    e.stopPropagation();
    setModal({
      open: true, mode: "edit", eventId: ev.id,
      date: ev.date, startTime: ev.startTime, endTime: ev.endTime,
      title: ev.title, description: ev.description, color: ev.color,
    });
  };

  const closeModal = () => setModal(prev => ({ ...prev, open: false }));

  // ── Save / delete ────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!modal.title.trim()) return;
    setSaving(true);
    const body = {
      ...(modal.mode === "edit" ? { id: modal.eventId } : {}),
      date: modal.date,
      startTime: modal.startTime,
      endTime: modal.endTime,
      title: modal.title.trim(),
      description: modal.description.trim(),
      color: modal.color,
    };
    const res = await requestApi<{ event: ScheduleEvent }>("/api/schedule", {
      method: modal.mode === "create" ? "POST" : "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (res.ok && res.data?.event) {
      if (modal.mode === "create") {
        setEvents(prev => [...prev, res.data!.event]);
      } else {
        setEvents(prev => prev.map(ev => ev.id === modal.eventId ? res.data!.event : ev));
      }
      closeModal();
    } else {
      setError(res.message || "저장에 실패했습니다.");
    }
  };

  const handleDelete = async () => {
    if (!modal.eventId) return;
    setSaving(true);
    const res = await requestApi(`/api/schedule?id=${modal.eventId}`, { method: "DELETE" });
    setSaving(false);
    if (res.ok) {
      setEvents(prev => prev.filter(ev => ev.id !== modal.eventId));
      closeModal();
    } else {
      setError(res.message || "삭제에 실패했습니다.");
    }
  };

  // ── Time option lists ────────────────────────────────────────────────────

  const startOpts: { value: number; label: string }[] = [];
  for (let m = DAY_START; m <= 1430; m += 10) {
    startOpts.push({ value: m, label: minutesToTime(m) });
  }

  const endOpts: { value: number; label: string }[] = [];
  for (let m = modal.startTime + 10; m <= DAY_END; m += 10) {
    endOpts.push({ value: m, label: minutesToTime(m) });
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="sched-shell">

      {/* ── Week navigation ── */}
      <div className="sched-nav">
        <button className="sched-nav-btn" onClick={prevWeek}>← 이전 주</button>
        <div className="sched-nav-center">
          <span className="sched-nav-title">{formatWeekLabel(weekStart)}</span>
          <button className="sched-nav-btn sched-today-btn" onClick={goToday}>오늘</button>
        </div>
        <button className="sched-nav-btn" onClick={nextWeek}>다음 주 →</button>
      </div>

      {error && <div className="sched-error-bar">{error}</div>}

      {/* ── Day headers (sticky) ── */}
      <div className="sched-col-headers">
        <div className="sched-corner" />
        {weekDays.map(({ date, dayOfWeek, dayNum }) => {
          const isToday = date === todayStr;
          const dayCls  = dayOfWeek === 0 ? " sched-day-sun" : dayOfWeek === 6 ? " sched-day-sat" : "";
          return (
            <div key={date} className={`sched-day-head${isToday ? " today" : ""}${dayCls}`}>
              <div className="sched-day-name">{DAY_NAMES[dayOfWeek]}</div>
              <div className={`sched-day-num${isToday ? " today-circle" : ""}`}>{dayNum}</div>
              <textarea
                className="sched-summary-input"
                placeholder="하루 요약..."
                value={summaries[date] ?? ""}
                onChange={e => handleSummaryChange(date, e.target.value)}
                onBlur={() => saveSummary(date)}
                maxLength={500}
              />
            </div>
          );
        })}
      </div>

      {/* ── Scrollable time grid ── */}
      {loading ? (
        <div className="sched-loading">불러오는 중…</div>
      ) : (
        <div className="sched-body">

          {/* Time labels column */}
          <div className="sched-time-col" style={{ height: GRID_HEIGHT }}>
            {hourMarkers.map(({ min, y, label }) => (
              <div key={min} className="sched-hour-label" style={{ top: y }}>
                {label}
              </div>
            ))}
          </div>

          {/* 7 day event columns */}
          <div className="sched-days">
            {weekDays.map(({ date, dayOfWeek }) => {
              const isToday  = date === todayStr;
              const dayEvts  = events.filter(ev => ev.date === date);
              const nowY     = isToday && nowMinutes >= DAY_START && nowMinutes <= DAY_END
                ? timeToY(nowMinutes) : null;

              return (
                <div
                  key={date}
                  className={`sched-day-col${dayOfWeek === 0 ? " sched-col-sun" : dayOfWeek === 6 ? " sched-col-sat" : ""}`}
                  style={{ height: GRID_HEIGHT }}
                  onClick={e => handleDayColClick(date, e)}
                >
                  {/* hour lines */}
                  {hourMarkers.map(({ min, y }) => (
                    <div key={min} className="sched-hour-line" style={{ top: y }} />
                  ))}
                  {/* half-hour lines */}
                  {halfHourMins.map(m => (
                    <div key={m} className="sched-half-line" style={{ top: timeToY(m) }} />
                  ))}
                  {/* current time indicator */}
                  {nowY !== null && (
                    <div className="sched-now-line" style={{ top: nowY }} />
                  )}
                  {/* events */}
                  {dayEvts.map(ev => {
                    const top    = timeToY(ev.startTime);
                    const height = Math.max(20, (ev.endTime - ev.startTime) * 2);
                    return (
                      <div
                        key={ev.id}
                        className="sched-event"
                        style={{ top, height, background: ev.color }}
                        onClick={e => openEditModal(ev, e)}
                      >
                        <div className="sched-event-time">
                          {minutesToTime(ev.startTime)}–{minutesToTime(ev.endTime)}
                        </div>
                        <div className="sched-event-title">{ev.title}</div>
                        {ev.description && height >= 48 && (
                          <div className="sched-event-desc">{ev.description}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

        </div>
      )}

      {/* ── Event modal ── */}
      {modal.open && (
        <div className="sched-modal-overlay" onClick={closeModal}>
          <div className="sched-modal" onClick={e => e.stopPropagation()}>
            <div className="sched-modal-head">
              <h3>{modal.mode === "create" ? "일정 추가" : "일정 수정"}</h3>
              <button type="button" className="btn btn-ghost btn-sm" onClick={closeModal}>✕</button>
            </div>

            <div className="sched-form">
              {/* Title */}
              <div className="sched-field">
                <label className="sched-label">제목 *</label>
                <input
                  className="sched-input"
                  type="text"
                  placeholder="일정 제목을 입력하세요"
                  value={modal.title}
                  maxLength={200}
                  autoFocus
                  onChange={e => setModal(prev => ({ ...prev, title: e.target.value }))}
                  onKeyDown={e => { if (e.key === "Enter") handleSave(); }}
                />
              </div>

              {/* Time range */}
              <div className="sched-time-row">
                <div className="sched-field">
                  <label className="sched-label">시작</label>
                  <select
                    className="sched-select"
                    value={modal.startTime}
                    onChange={e => {
                      const s = Number(e.target.value);
                      const end = modal.endTime > s ? modal.endTime
                        : s + 60 <= DAY_END ? s + 60 : DAY_END;
                      setModal(prev => ({ ...prev, startTime: s, endTime: end }));
                    }}
                  >
                    {startOpts.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div className="sched-field">
                  <label className="sched-label">종료</label>
                  <select
                    className="sched-select"
                    value={modal.endTime}
                    onChange={e => setModal(prev => ({ ...prev, endTime: Number(e.target.value) }))}
                  >
                    {endOpts.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Description */}
              <div className="sched-field">
                <label className="sched-label">메모</label>
                <textarea
                  className="sched-textarea"
                  placeholder="메모 (선택 사항)"
                  value={modal.description}
                  maxLength={500}
                  onChange={e => setModal(prev => ({ ...prev, description: e.target.value }))}
                />
              </div>

              {/* Color */}
              <div className="sched-field">
                <label className="sched-label">색상</label>
                <div className="sched-color-row">
                  {EVENT_COLORS.map(c => (
                    <ColorSwatch
                      key={c}
                      color={c}
                      selected={modal.color === c}
                      onClick={() => setModal(prev => ({ ...prev, color: c }))}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="sched-modal-actions">
              {modal.mode === "edit" && (
                <button
                  type="button"
                  className="btn btn-sm sched-btn-delete"
                  disabled={saving}
                  onClick={handleDelete}
                >
                  삭제
                </button>
              )}
              <button type="button" className="btn btn-ghost btn-sm" disabled={saving} onClick={closeModal}>
                취소
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={saving || !modal.title.trim()}
                onClick={handleSave}
              >
                {saving ? "저장 중…" : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
