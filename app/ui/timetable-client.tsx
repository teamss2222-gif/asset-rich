"use client";

import { useState, useEffect, useCallback, useRef } from "react";

type DragState = {
  ev: ScheduleEvent;
  offsetMin: number;      // minutes from event-top where pointer landed
  startClientX: number;
  startClientY: number;
  moved: boolean;
};
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
  repeatType: string;        // 'none' | 'daily' | 'weekly'
  repeatGroupId: string | null;
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
  repeatType: "none" | "daily" | "weekly";  // create에서만 사용
  repeatUntil: string;                       // create에서만 사용
  isRepeated: boolean;                       // edit 시 반복 일정인지 여부
  scope: "single" | "all";                   // edit/delete 범위
};

// ── Korean Public Holidays ────────────────────────────────────────────────────

/** 매년 고정 공휴일 (MM-DD) */
const FIXED_HOLIDAYS: Record<string, string> = {
  "01-01": "신정",
  "03-01": "삼일절",
  "05-05": "어린이날",
  "06-06": "현충일",
  "08-15": "광복절",
  "10-03": "개천절",
  "10-09": "한글날",
  "12-25": "성탄절",
};

/** 음력 기반 공휴일 (YYYY-MM-DD) */
const LUNAR_HOLIDAYS: Record<string, string> = {
  // 2024
  "2024-02-09": "설날 전날", "2024-02-10": "설날", "2024-02-11": "설날 연휴",
  "2024-02-12": "대체공휴일",
  "2024-05-15": "부처님오신날",
  "2024-09-16": "추석 연휴", "2024-09-17": "추석", "2024-09-18": "추석 연휴",
  // 2025
  "2025-01-28": "설날 전날", "2025-01-29": "설날", "2025-01-30": "설날 연휴",
  "2025-03-03": "대체공휴일",
  "2025-05-05": "어린이날·부처님오신날",
  "2025-10-05": "추석 전날", "2025-10-06": "추석", "2025-10-07": "추석 연휴",
  "2025-10-08": "대체공휴일",
  // 2026
  "2026-01-01": "신정",
  "2026-02-17": "설날 전날", "2026-02-18": "설날", "2026-02-19": "설날 연휴",
  "2026-05-24": "부처님오신날",
  "2026-05-25": "대체공휴일",
  "2026-08-17": "대체공휴일",
  "2026-09-24": "추석 전날", "2026-09-25": "추석", "2026-09-26": "추석 연휴",
  // 2027
  "2027-02-07": "설날 전날", "2027-02-08": "설날", "2027-02-09": "설날 연휴",
  "2027-03-01": "삼일절",
  "2027-05-13": "부처님오신날",
  "2027-10-14": "추석 전날", "2027-10-15": "추석", "2027-10-16": "추석 연휴",
};

function getHoliday(dateStr: string): string | null {
  if (LUNAR_HOLIDAYS[dateStr]) return LUNAR_HOLIDAYS[dateStr];
  const mmdd = dateStr.slice(5); // "MM-DD"
  return FIXED_HOLIDAYS[mmdd] ?? null;
}

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
    repeatType: "none", repeatUntil: "", isRepeated: false, scope: "single",
  });
  const [summaryDirty, setSummaryDirty] = useState<Record<string, boolean>>({});
  const [nowMinutes, setNowMinutes] = useState(getNowMinutes);
  const todayStr = getTodayStr();

  // ── Drag & Drop state ─────────────────────────────────────────────────────
  const [drag, setDrag]   = useState<DragState | null>(null);
  const [ghost, setGhost] = useState<{ date: string; startMin: number; ctrlCopy: boolean } | null>(null);
  const daysRef   = useRef<HTMLDivElement>(null);
  const bodyRef   = useRef<HTMLDivElement>(null);
  // always-fresh refs to avoid stale closures in the drag effect
  const ghostRef     = useRef(ghost);
  const weekDaysRef  = useRef<typeof weekDays>([]);
  const weekStartRef = useRef(weekStart);
  const loadWeekRef  = useRef<(ws: Date) => Promise<void>>(() => Promise.resolve());
  weekDaysRef.current  = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart); d.setDate(d.getDate() + i);
    return { date: formatDate(d), dayOfWeek: i, dayNum: d.getDate() };
  });
  weekStartRef.current = weekStart;
  // loadWeekRef updated after loadWeek is declared (below)

  // mount-once drag listeners – read state via refs to avoid stale closures
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = drag; // closure captures drag at effect-setup time
      if (!d || !daysRef.current || !bodyRef.current) return;
      const dx = e.clientX - d.startClientX;
      const dy = e.clientY - d.startClientY;
      if (!d.moved && Math.sqrt(dx * dx + dy * dy) < 6) return;
      if (!d.moved) setDrag(prev => prev ? { ...prev, moved: true } : null);

      const rect     = daysRef.current.getBoundingClientRect();
      const wds      = weekDaysRef.current;
      const colW     = rect.width / wds.length;
      const colIdx   = Math.max(0, Math.min(wds.length - 1, Math.floor((e.clientX - rect.left) / colW)));
      const scrollTop = bodyRef.current.scrollTop;
      const yInGrid  = e.clientY - rect.top + scrollTop;
      const rawStart = DAY_START + Math.round(yInGrid / SLOT_HEIGHT) * 10 - d.offsetMin;
      const dur      = d.ev.endTime - d.ev.startTime;
      const startMin = Math.max(DAY_START, Math.min(DAY_END - dur, rawStart));
      const g = { date: wds[colIdx].date, startMin, ctrlCopy: e.ctrlKey || e.metaKey };
      ghostRef.current = g;
      setGhost(g);
    };

    const onUp = async () => {
      const currentDrag  = drag;
      const currentGhost = ghostRef.current;
      setDrag(null);
      setGhost(null);
      ghostRef.current = null;
      if (!currentDrag) return;

      if (!currentDrag.moved || !currentGhost) {
        // short click → open edit modal
        const ev = currentDrag.ev;
        setModal({
          open: true, mode: "edit", eventId: ev.id,
          date: ev.date, startTime: ev.startTime, endTime: ev.endTime,
          title: ev.title, description: ev.description, color: ev.color,
          repeatType: "none", repeatUntil: "",
          isRepeated: !!ev.repeatGroupId, scope: "single",
        });
        return;
      }

      const { ev } = currentDrag;
      const dur      = ev.endTime - ev.startTime;
      const newStart = currentGhost.startMin;
      const newEnd   = Math.min(DAY_END, newStart + dur);
      const newDate  = currentGhost.date;
      if (!currentGhost.ctrlCopy && newDate === ev.date && newStart === ev.startTime) return;

      setSaving(true);
      if (currentGhost.ctrlCopy) {
        // ── COPY ──────────────────────────────────────────────────────────
        const res = await requestApi<{ event?: ScheduleEvent; events?: ScheduleEvent[] }>("/api/schedule", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date: newDate, startTime: newStart, endTime: newEnd,
            title: ev.title, description: ev.description, color: ev.color,
          }),
        });
        if (res.ok && res.data?.event) {
          const ne = res.data.event;
          if (weekDaysRef.current.some(d => d.date === ne.date))
            setEvents(prev => [...prev, ne]);
        }
      } else {
        // ── MOVE ──────────────────────────────────────────────────────────
        const res = await requestApi<{ event?: ScheduleEvent }>("/api/schedule", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: ev.id, date: newDate, startTime: newStart, endTime: newEnd,
            title: ev.title, description: ev.description, color: ev.color, scope: "single",
          }),
        });
        if (res.ok && res.data?.event) {
          setEvents(prev => prev.map(x => x.id === ev.id ? res.data!.event! : x));
        } else if (res.ok) {
          await loadWeekRef.current(weekStartRef.current);
        }
      }
      setSaving(false);
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup",   onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup",   onUp);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag]);

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
  // keep loadWeekRef always up-to-date
  loadWeekRef.current = loadWeek;

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
    // 반복 종료 기본값: 해당 날짜로부터 4주 후
    const defDate = new Date(date + "T12:00:00");
    defDate.setDate(defDate.getDate() + 28);
    const defaultUntil = defDate.toISOString().slice(0, 10);
    setModal({
      open: true, mode: "create", date,
      startTime, endTime, title: "", description: "", color: EVENT_COLORS[0],
      repeatType: "none", repeatUntil: defaultUntil, isRepeated: false, scope: "single",
    });
  };

  // ── Open edit modal ──────────────────────────────────────────────────────

  const openEditModal = (ev: ScheduleEvent, e: React.MouseEvent) => {
    e.stopPropagation();
    setModal({
      open: true, mode: "edit", eventId: ev.id,
      date: ev.date, startTime: ev.startTime, endTime: ev.endTime,
      title: ev.title, description: ev.description, color: ev.color,
      repeatType: "none", repeatUntil: "",
      isRepeated: !!ev.repeatGroupId,
      scope: "single",
    });
  };

  const closeModal = () => setModal(prev => ({ ...prev, open: false }));

  // ── Save / delete ────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!modal.title.trim()) return;
    setSaving(true);
    const body: Record<string, unknown> = {
      ...(modal.mode === "edit" ? { id: modal.eventId } : {}),
      date: modal.date,
      startTime: modal.startTime,
      endTime: modal.endTime,
      title: modal.title.trim(),
      description: modal.description.trim(),
      color: modal.color,
    };
    if (modal.mode === "create" && modal.repeatType !== "none") {
      body.repeatType  = modal.repeatType;
      body.repeatUntil = modal.repeatUntil;
    }
    if (modal.mode === "edit") {
      body.scope = modal.scope;
    }

    const res = await requestApi<{ event?: ScheduleEvent; events?: ScheduleEvent[] }>("/api/schedule", {
      method: modal.mode === "create" ? "POST" : "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (res.ok && res.data) {
      if (modal.mode === "create") {
        const weekDateSet = new Set(weekDays.map(d => d.date));
        const newEvts = res.data.events
          ? res.data.events.filter((ev: ScheduleEvent) => weekDateSet.has(ev.date))
          : res.data.event ? [res.data.event] : [];
        setEvents(prev => [...prev, ...newEvts]);
      } else if (modal.scope === "all") {
        // 전체 반복 수정 → 현주 재로드
        await loadWeek(weekStart);
      } else if (res.data.event) {
        setEvents(prev => prev.map(ev => ev.id === modal.eventId ? res.data!.event! : ev));
      }
      closeModal();
    } else {
      setError(res.message || "저장에 실패했습니다.");
    }
  };

  const handleDelete = async () => {
    if (!modal.eventId) return;
    setSaving(true);
    const res = await requestApi(
      `/api/schedule?id=${modal.eventId}&scope=${modal.scope}`,
      { method: "DELETE" },
    );
    setSaving(false);
    if (res.ok) {
      if (modal.scope === "all") {
        await loadWeek(weekStart);
      } else {
        setEvents(prev => prev.filter(ev => ev.id !== modal.eventId));
      }
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
          const isToday   = date === todayStr;
          const holiday   = getHoliday(date);
          const isHoliday = !!holiday;
          const dayCls    = dayOfWeek === 0 ? " sched-day-sun" : dayOfWeek === 6 ? " sched-day-sat" : "";
          const holCls    = isHoliday ? " holiday" : "";
          return (
            <div key={date} className={`sched-day-head${isToday ? " today" : ""}${dayCls}${holCls}`}>
              <div className="sched-day-name">{DAY_NAMES[dayOfWeek]}</div>
              <div className={`sched-day-num${isToday ? " today-circle" : ""}${isHoliday && !isToday ? " holiday-num" : ""}`}>{dayNum}</div>
              {holiday && <div className="sched-holiday-name">{holiday}</div>}
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
        <div
          className="sched-body"
          ref={bodyRef}
          style={{ cursor: drag?.moved ? (ghost?.ctrlCopy ? "copy" : "grabbing") : undefined }}
        >

          {/* Time labels column */}
          <div className="sched-time-col" style={{ height: GRID_HEIGHT }}>
            {hourMarkers.map(({ min, y, label }) => (
              <div key={min} className="sched-hour-label" style={{ top: y }}>
                {label}
              </div>
            ))}
          </div>

          {/* 7 day event columns */}
          <div className="sched-days" ref={daysRef}>
            {weekDays.map(({ date, dayOfWeek }) => {
              const isToday   = date === todayStr;
              const isHoliday = !!getHoliday(date);
              const dayEvts   = events.filter(ev => ev.date === date);
              const nowY      = isToday && nowMinutes >= DAY_START && nowMinutes <= DAY_END
                ? timeToY(nowMinutes) : null;
              const colCls    = [
                "sched-day-col",
                dayOfWeek === 0 ? "sched-col-sun" : dayOfWeek === 6 ? "sched-col-sat" : "",
                isHoliday ? "sched-col-holiday" : "",
              ].filter(Boolean).join(" ");

              return (
                <div
                  key={date}
                  className={colCls}
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
                    const isDragging = drag?.moved && drag.ev.id === ev.id;
                    return (
                      <div
                        key={ev.id}
                        className={`sched-event${ev.repeatGroupId ? " sched-event-repeat" : ""}${isDragging ? " sched-event-dragging" : ""}`}
                        style={{ top, height, background: ev.color }}
                        onMouseDown={e => {
                          e.stopPropagation();
                          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                          const offsetPx  = e.clientY - rect.top;
                          const offsetMin = Math.max(0, Math.round(offsetPx / SLOT_HEIGHT) * 10);
                          setDrag({ ev, offsetMin, startClientX: e.clientX, startClientY: e.clientY, moved: false });
                        }}
                      >
                        <div className="sched-event-time">
                          {minutesToTime(ev.startTime)}–{minutesToTime(ev.endTime)}
                          {ev.repeatGroupId && <span className="sched-repeat-icon">↻</span>}
                        </div>
                        <div className="sched-event-title">{ev.title}</div>
                        {ev.description && height >= 48 && (
                          <div className="sched-event-desc">{ev.description}</div>
                        )}
                      </div>
                    );
                  })}
                  {/* drag ghost */}
                  {ghost && ghost.date === date && drag && (() => {
                    const dur = drag.ev.endTime - drag.ev.startTime;
                    return (
                      <div
                        className={`sched-ghost${ghost.ctrlCopy ? " sched-ghost-copy" : ""}`}
                        style={{
                          top: timeToY(ghost.startMin),
                          height: Math.max(20, dur * 2),
                          background: drag.ev.color,
                        }}
                      >
                        {ghost.ctrlCopy && <div className="sched-ghost-badge">복사</div>}
                        <div className="sched-event-time">
                          {minutesToTime(ghost.startMin)}–{minutesToTime(Math.min(DAY_END, ghost.startMin + dur))}
                        </div>
                        <div className="sched-event-title">{drag.ev.title}</div>
                      </div>
                    );
                  })()}
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

              {/* 반복 설정 (생성 시만) */}
              {modal.mode === "create" && (
                <div className="sched-repeat-section">
                  <div className="sched-field">
                    <label className="sched-label">반복</label>
                    <select
                      className="sched-select"
                      value={modal.repeatType}
                      onChange={e => setModal(prev => ({
                        ...prev,
                        repeatType: e.target.value as "none" | "daily" | "weekly",
                      }))}
                    >
                      <option value="none">반복 없음</option>
                      <option value="daily">매일</option>
                      <option value="weekly">매주 (같은 요일)</option>
                    </select>
                  </div>
                  {modal.repeatType !== "none" && (
                    <div className="sched-field">
                      <label className="sched-label">반복 종료 날짜</label>
                      <input
                        type="date"
                        className="sched-input"
                        value={modal.repeatUntil}
                        min={(() => {
                          const d = new Date(modal.date + "T12:00:00");
                          d.setDate(d.getDate() + (modal.repeatType === "daily" ? 1 : 7));
                          return d.toISOString().slice(0, 10);
                        })()}
                        max={(() => {
                          const d = new Date(modal.date + "T12:00:00");
                          d.setFullYear(d.getFullYear() + 1);
                          return d.toISOString().slice(0, 10);
                        })()}
                        onChange={e => setModal(prev => ({ ...prev, repeatUntil: e.target.value }))}
                      />
                      <span className="sched-repeat-hint">
                        {modal.repeatType === "daily" ? "매일" : "매주"} · 
                        {modal.repeatUntil && (
                          <>
                            {modal.repeatType === "daily"
                              ? Math.round((new Date(modal.repeatUntil + "T12:00:00").getTime() - new Date(modal.date + "T12:00:00").getTime()) / 86400000) + 1
                              : Math.round((new Date(modal.repeatUntil + "T12:00:00").getTime() - new Date(modal.date + "T12:00:00").getTime()) / (86400000 * 7)) + 1
                            }월 생성
                          </>
                        )}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* 수정 범위 (반복 일정 편집 시) */}
              {modal.mode === "edit" && modal.isRepeated && (
                <div className="sched-scope-section">
                  <div className="sched-scope-label">반복 일정 수정/삭제 범위</div>
                  <label className="sched-scope-option">
                    <input
                      type="radio"
                      name="scope"
                      value="single"
                      checked={modal.scope === "single"}
                      onChange={() => setModal(prev => ({ ...prev, scope: "single" }))}
                    />
                    <span>이 일정만</span>
                  </label>
                  <label className="sched-scope-option">
                    <input
                      type="radio"
                      name="scope"
                      value="all"
                      checked={modal.scope === "all"}
                      onChange={() => setModal(prev => ({ ...prev, scope: "all" }))}
                    />
                    <span>모든 반복 일정</span>
                  </label>
                </div>
              )}

            </div>{/* /sched-form */}

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
