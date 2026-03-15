"use client";

import { useState, useEffect, useCallback, useRef } from "react";

type DragState = {
  ev: ScheduleEvent;
  offsetMin: number;      // minutes from event-top where pointer landed
  startClientX: number;
  startClientY: number;
  moved: boolean;
};

type UndoAction =
  | { type: "create";  events: ScheduleEvent[] }
  | { type: "update";  prev: ScheduleEvent[] }
  | { type: "delete";  events: ScheduleEvent[] }
  | { type: "reload" };

// ── Achievement & Mission types ───────────────────────────────────────────────

type EventCompletion = {
  id: number;
  title: string;
  startTime: number;
  endTime: number;
  color: string;
  completed: boolean;
};

type Mission = {
  id: number;
  title: string;
  completed: boolean;
  rewardMin: number;
  sortOrder: number;
  quantity: number;
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

const SLOT_HEIGHT = 10;   // px per 10 min
const DAY_START   = 420;  // 07:00
const DAY_END     = 1440; // 24:00
const GRID_HEIGHT = (DAY_END - DAY_START); // 1020 px
const DAY_NAMES   = ["일", "월", "화", "수", "목", "금", "토"];
const EVENT_COLORS = [
  // 그레이 (기본)
  "#8e8e93",
  // 파랑 계열
  "#0a84ff", "#32ade6", "#5ac8fa", "#1c3d6e",
  // 녹색 계열
  "#30d158", "#34c759", "#00c7be", "#1b6e3d",
  // 주황/노란
  "#ff9500", "#ffd60a", "#f4e04d", "#c8a200",
  // 빨강/분홍
  "#ff453a", "#ff375f", "#ff6b6b", "#d93025",
  // 보라/자주
  "#bf5af2", "#9b59b6", "#7c3aed", "#5e2ca5",
  // 중립 어둠
  "#48484a", "#2c2c2e",
];
const DEFAULT_COLOR = EVENT_COLORS[0]; // 회색

// ── Helpers ──────────────────────────────────────────────────────────────────

function minutesToTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** minutes → pixel offset from top of grid */
function timeToY(minutes: number): number {
  return (minutes - DAY_START); // /10*SLOT_HEIGHT = *1 (1px per min)
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
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState("");
  const [saving, setSaving]       = useState(false);
  const [modal, setModal] = useState<ModalState>({
    open: false, mode: "create", date: "", startTime: 540, endTime: 600,
    title: "", description: "", color: DEFAULT_COLOR,
    repeatType: "none", repeatUntil: "", isRepeated: false, scope: "single",
  });
  const [nowMinutes, setNowMinutes] = useState(getNowMinutes);
  const [undoMsg, setUndoMsg]  = useState("");
  const todayStr = getTodayStr();

  // ── Auto summary per day ───────────────────────────────────────────────
  const [dayAutoSummaries, setDayAutoSummaries] = useState<Record<string, { doneEvents: string[]; totalEvents: number }>>({});
  const [weekMissionTotal, setWeekMissionTotal] = useState(0);

  // ── Achievement popup state ───────────────────────────────────────────────
  const [achieveDate, setAchieveDate]         = useState<string | null>(null);
  const [completions, setCompletions]         = useState<EventCompletion[]>([]);
  const [weekTotalReward, setWeekTotalReward] = useState(0);

  // ── Mission panel state ───────────────────────────────────────────────────
  const [missionPanelOpen, setMissionPanelOpen]   = useState(false);
  const [missions, setMissions]                   = useState<Mission[]>([]);
  const [missionLoading, setMissionLoading]       = useState(false);
  const [newMissionTitle, setNewMissionTitle]     = useState("");
  const [newMissionReward, setNewMissionReward]   = useState(30);
  const [editMissionId, setEditMissionId]         = useState<number | null>(null);
  const [editMissionTitle, setEditMissionTitle]   = useState("");
  const [editMissionReward, setEditMissionReward] = useState(0);

  // undo stack (max 5)
  const undoStack = useRef<{ action: UndoAction; snapshot: ScheduleEvent[] }[]>([]);
  const eventsRef = useRef<ScheduleEvent[]>([]);

  const pushUndo = (action: UndoAction, snapshot: ScheduleEvent[]) => {
    undoStack.current = [
      ...undoStack.current.slice(-4),
      { action, snapshot },
    ];
  };

  const setEventsTracked = (updater: ScheduleEvent[] | ((prev: ScheduleEvent[]) => ScheduleEvent[])) => {
    setEvents(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      eventsRef.current = next;
      return next;
    });
  };

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
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        const entry = undoStack.current.pop();
        if (!entry) {
          setUndoMsg("❌ 되돌릴 항목이 없습니다.");
          setTimeout(() => setUndoMsg(""), 2000);
          return;
        }
        const { action, snapshot } = entry;
        if (action.type === "create") {
          // 생성 실행 취소 → 생성된 id들 삭제
          const createdIds = new Set(action.events.map(ev => ev.id));
          setEventsTracked(prev => prev.filter(ev => !createdIds.has(ev.id)));
          // 서버에도 삭제
          action.events.forEach(ev => requestApi(`/api/schedule?id=${ev.id}&scope=single`, { method: "DELETE" }));
        } else if (action.type === "update" || action.type === "delete") {
          // 스냅샷으로 복원
          setEventsTracked(snapshot);
        } else {
          // reload 전 스냅샷
          setEventsTracked(snapshot);
        }
        setUndoMsg(`↩ 되돌리기 완료 (${undoStack.current.length}개 더 가능)`);
        setTimeout(() => setUndoMsg(""), 2000);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
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
      // rect.top already reflects scroll (viewport-relative), so no scrollTop needed
      const yInGrid  = e.clientY - rect.top;
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
          if (weekDaysRef.current.some(d => d.date === ne.date)) {
            pushUndo({ type: "create", events: [ne] }, eventsRef.current);
            setEventsTracked(prev => [...prev, ne]);
          }
        }
      } else {
        // ── MOVE ──────────────────────────────────────────────────────────
        const prevSnap = [...eventsRef.current];
        const res = await requestApi<{ event?: ScheduleEvent }>("/api/schedule", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: ev.id, date: newDate, startTime: newStart, endTime: newEnd,
            title: ev.title, description: ev.description, color: ev.color, scope: "single",
          }),
        });
        if (res.ok && res.data?.event) {
          pushUndo({ type: "update", prev: prevSnap }, prevSnap);
          setEventsTracked(prev => prev.map(x => x.id === ev.id ? res.data!.event! : x));
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
    const wsStr = formatDate(ws);
    const [res, sumRes] = await Promise.all([
      requestApi<{ events: ScheduleEvent[] }>(`/api/schedule?weekStart=${wsStr}`),
      requestApi<{ days: Record<string, { doneEvents: string[]; totalEvents: number }>; weekMissionTotal: number }>(
        `/api/schedule/week-summary?weekStart=${wsStr}`,
      ),
    ]);
    setLoading(false);
    if (res.ok && res.data) {
      setEventsTracked(res.data.events ?? []);
    } else {
      setError(res.message || "데이터를 불러오지 못했습니다.");
    }
    if (sumRes.ok && sumRes.data) {
      setDayAutoSummaries(sumRes.data.days ?? {});
      setWeekMissionTotal(sumRes.data.weekMissionTotal ?? 0);
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
      startTime, endTime, title: "", description: "", color: DEFAULT_COLOR,
      repeatType: "none", repeatUntil: defaultUntil, isRepeated: false, scope: "single",
    });
  };

  // ── Open edit modal ──────────────────────────────────────────────────────

  const openEditModal = (ev: ScheduleEvent, e: React.MouseEvent) => {
    e.stopPropagation();
    // 비반복 일정 수정 시 기본 종료일: 2026-07-22
    const defaultUntil = "2026-07-22";
    setModal({
      open: true, mode: "edit", eventId: ev.id,
      date: ev.date, startTime: ev.startTime, endTime: ev.endTime,
      title: ev.title, description: ev.description, color: ev.color,
      repeatType: "none", repeatUntil: defaultUntil,
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
    // 수정 모드에서 비반복 → 반복 변환
    if (modal.mode === "edit" && !modal.isRepeated && modal.repeatType !== "none") {
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
        pushUndo({ type: "create", events: newEvts }, eventsRef.current);
        setEventsTracked(prev => [...prev, ...newEvts]);
      } else if (modal.scope === "all" || (res.data.events && (res.data.events as ScheduleEvent[]).length > 0)) {
        pushUndo({ type: "reload" }, eventsRef.current);
        await loadWeek(weekStart);
      } else if (res.data.event) {
        pushUndo({ type: "update", prev: [...eventsRef.current] }, [...eventsRef.current]);
        setEventsTracked(prev => prev.map(ev => ev.id === modal.eventId ? res.data!.event! : ev));
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
        pushUndo({ type: "reload" }, eventsRef.current);
        await loadWeek(weekStart);
      } else {
        const deleted = eventsRef.current.filter(ev => ev.id === modal.eventId);
        pushUndo({ type: "delete", events: deleted }, [...eventsRef.current]);
        setEventsTracked(prev => prev.filter(ev => ev.id !== modal.eventId));
      }
      closeModal();
    } else {
      setError(res.message || "삭제에 실패했습니다.");
    }
  };

  // ── Achievement & Mission handlers ───────────────────────────────────────

  const openAchieve = async (date: string) => {
    setAchieveDate(date);
    setMissionLoading(true);
    const [cRes, mRes] = await Promise.all([
      requestApi<{ completions: EventCompletion[] }>(`/api/schedule/achievements?date=${date}`),
      requestApi<{ missions: Mission[]; weekTotal: number }>(`/api/schedule/missions?date=${date}`),
    ]);
    if (cRes.ok && cRes.data) setCompletions(cRes.data.completions);
    if (mRes.ok && mRes.data) {
      setMissions(mRes.data.missions);
      setWeekTotalReward(mRes.data.weekTotal ?? 0);
    }
    setMissionLoading(false);
  };

  const closeAchieve = () => {
    setAchieveDate(null);
    setEditMissionId(null);
  };

  const toggleCompletion = async (eventId: number, completed: boolean) => {
    if (!achieveDate) return;
    const updated = completions.map(c => c.id === eventId ? { ...c, completed } : c);
    setCompletions(updated);
    // 데이 자동 요약 업데이트
    const nonGray = updated.filter(c => c.color !== DEFAULT_COLOR);
    setDayAutoSummaries(prev => ({
      ...prev,
      [achieveDate]: {
        doneEvents: nonGray.filter(c => c.completed).map(c => c.title),
        totalEvents: nonGray.length,
      },
    }));
    await requestApi("/api/schedule/achievements", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: achieveDate, eventId, completed }),
    });
  };

  const addMission = async () => {
    if (!newMissionTitle.trim()) return;
    const res = await requestApi<{ mission: Mission }>("/api/schedule/missions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newMissionTitle.trim(), rewardMin: newMissionReward }),
    });
    if (res.ok && res.data?.mission) {
      setMissions(prev => [...prev, res.data!.mission!]);
      setNewMissionTitle("");
      setNewMissionReward(30);
    }
  };

  const toggleMission = async (id: number, completed: boolean) => {
    const m = missions.find(m2 => m2.id === id);
    const qty = m?.quantity ?? 1;
    setMissions(prev => prev.map(m2 => m2.id === id ? { ...m2, completed } : m2));
    if (m) {
      const delta = completed ? m.rewardMin : -m.rewardMin;
      setWeekTotalReward(prev => prev + delta);
      setWeekMissionTotal(prev => prev + delta);
    }
    await requestApi("/api/schedule/missions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, date: achieveDate, completed, quantity: qty }),
    });
  };

  const updateMissionQty = async (id: number, quantity: number) => {
    setMissions(prev => prev.map(m => m.id === id ? { ...m, quantity } : m));
    const m = missions.find(m2 => m2.id === id);
    await requestApi("/api/schedule/missions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, date: achieveDate, completed: m?.completed ?? true, quantity }),
    });
  };

  const startEditMission = (m: Mission) => {
    setEditMissionId(m.id);
    setEditMissionTitle(m.title);
    setEditMissionReward(m.rewardMin);
  };

  const saveEditMission = async (id: number) => {
    const res = await requestApi<{ mission: Mission }>("/api/schedule/missions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, title: editMissionTitle.trim(), rewardMin: editMissionReward }),
    });
    if (res.ok && res.data?.mission) {
      setMissions(prev => prev.map(m => m.id === id ? res.data!.mission! : m));
    }
    setEditMissionId(null);
  };

  const deleteMission = async (id: number) => {
    const res = await requestApi(`/api/schedule/missions?id=${id}`, { method: "DELETE" });
    if (res.ok) setMissions(prev => prev.filter(m => m.id !== id));
  };

  // ── Mission panel ─────────────────────────────────────────────────────────

  const openMissionPanel = async () => {
    setMissionPanelOpen(true);
    setMissionLoading(true);
    setNewMissionTitle("");
    setNewMissionReward(30);
    setEditMissionId(null);
    const mRes = await requestApi<{ missions: Mission[] }>(`/api/schedule/missions`);
    if (mRes.ok && mRes.data) setMissions(mRes.data.missions);
    setMissionLoading(false);
  };

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
        <button
          className="sched-nav-btn sched-mission-nav-btn"
          onClick={() => openMissionPanel()}
          title="미션 관리"
        >
          🎯 미션
        </button>
      </div>

      {undoMsg && <div className="sched-undo-toast">{undoMsg}</div>}

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
              <button
                className="sched-achieve-btn"
                onClick={() => openAchieve(date)}
                title={`${date} 성과 & 미션`}
              >
                📊 성과
              </button>
              {/* 자동 완료 요약 */}
              {(() => {
                const ds = dayAutoSummaries[date];
                const hasEvents = ds && ds.totalEvents > 0;
                const hasMission = weekMissionTotal !== 0;
                if (!hasEvents && !hasMission) return null;
                return (
                  <div className="sched-auto-summary">
                    {hasEvents && ds.doneEvents.map((t, i) => (
                      <div key={i} className="sched-auto-done">✓ {t}</div>
                    ))}
                    {hasEvents && ds.totalEvents - ds.doneEvents.length > 0 && (
                      <div className="sched-auto-undone">
                        미완 {ds.totalEvents - ds.doneEvents.length}개
                      </div>
                    )}
                    {hasMission && (
                      <div className={`sched-auto-mission${weekMissionTotal < 0 ? " neg" : ""}`}>
                        🏆{weekMissionTotal >= 0 ? "+" : ""}{weekMissionTotal}분
                      </div>
                    )}
                  </div>
                );
              })()}
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
                    const height = Math.max(SLOT_HEIGHT, ev.endTime - ev.startTime);
                    const isDragging = drag?.moved && drag.ev.id === ev.id;
                    return (
                      <div
                        key={ev.id}
                        className={`sched-event${ev.repeatGroupId ? " sched-event-repeat" : ""}${isDragging ? " sched-event-dragging" : ""}`}
                        style={{ top, height, background: ev.color }}
                        onClick={e => e.stopPropagation()}
                        onMouseDown={e => {
                          e.stopPropagation();
                          const evRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                          const offsetPx  = e.clientY - evRect.top;
                          const offsetMin = Math.max(0, Math.round(offsetPx / SLOT_HEIGHT) * 10);
                          setDrag({ ev, offsetMin, startClientX: e.clientX, startClientY: e.clientY, moved: false });
                        }}
                      >
                        <div className="sched-event-time">
                          {minutesToTime(ev.startTime)}–{minutesToTime(ev.endTime)}
                          {ev.repeatGroupId && <span className="sched-repeat-icon">↻</span>}
                        </div>
                        <div className="sched-event-title">{ev.title}</div>
                        {ev.description && height >= 24 && (
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
                          height: Math.max(SLOT_HEIGHT, dur),
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

      {/* ── Achievement Popup ── */}
      {achieveDate && (
        <div className="sched-modal-overlay" onClick={closeAchieve}>
          <div className="sched-modal sched-achieve-modal" onClick={e => e.stopPropagation()}>
            <div className="sched-modal-head">
              <h3>📊 성과 — {achieveDate}</h3>
              <button type="button" className="btn btn-ghost btn-sm" onClick={closeAchieve}>✕</button>
            </div>

            {missionLoading ? (
              <div className="sched-achieve-loading">불러오는 중…</div>
            ) : (
              <div className="sched-achieve-body">

                {/* ── 일정 성과 체크 (기본색 제외) ── */}
                <div className="sched-achieve-section">
                  <div className="sched-achieve-section-title">🗓️ 오늘의 일정 성과</div>
                  {completions.filter(c => c.color !== DEFAULT_COLOR).length === 0 ? (
                    <div className="sched-achieve-empty">이 날 등록된 일정이 없습니다.</div>
                  ) : (
                    <ul className="sched-achieve-list">
                      {completions
                        .filter(c => c.color !== DEFAULT_COLOR)
                        .map(c => (
                          <li key={c.id} className={`sched-achieve-item${c.completed ? " done" : ""}`}>
                            <label className="sched-achieve-check-label">
                              <input
                                type="checkbox"
                                className="sched-achieve-checkbox"
                                checked={c.completed}
                                onChange={e => toggleCompletion(c.id, e.target.checked)}
                              />
                              <span
                                className="sched-achieve-dot"
                                style={{ background: c.color }}
                              />
                              <span className="sched-achieve-time">
                                {(() => {
                                  const sh = String(Math.floor(c.startTime / 60)).padStart(2, "0");
                                  const sm = String(c.startTime % 60).padStart(2, "0");
                                  const eh = String(Math.floor(c.endTime / 60)).padStart(2, "0");
                                  const em = String(c.endTime % 60).padStart(2, "0");
                                  return `${sh}:${sm}–${eh}:${em}`;
                                })()}
                              </span>
                              <span className="sched-achieve-title">{c.title}</span>
                            </label>
                            {c.completed && <span className="sched-achieve-badge">✓ 완료</span>}
                          </li>
                        ))}
                    </ul>
                  )}
                  {completions.filter(c => c.color !== DEFAULT_COLOR).length > 0 && (
                    <div className="sched-achieve-summary">
                      완료 {completions.filter(c => c.color !== DEFAULT_COLOR && c.completed).length} / {completions.filter(c => c.color !== DEFAULT_COLOR).length}
                    </div>
                  )}
                </div>

                {/* ── 오늘의 미션 체크 ── */}
                <div className="sched-achieve-section">
                  <div className="sched-achieve-section-title">🎯 오늘의 미션</div>
                  {missions.length === 0 ? (
                    <div className="sched-achieve-empty">등록된 미션이 없습니다. 상단 🎯 미션에서 추가하세요.</div>
                  ) : (
                    <ul className="sched-mission-list">
                      {missions.map(m => (
                        <li key={m.id} className={`sched-mission-item${m.completed ? " done" : ""}`}>
                          <div className="sched-mission-row">
                            <label className="sched-achieve-check-label">
                              <input
                                type="checkbox"
                                className="sched-achieve-checkbox"
                                checked={m.completed}
                                onChange={e => toggleMission(m.id, e.target.checked)}
                              />
                              <span className="sched-mission-title">{m.title}</span>
                            </label>
                            <span className={`sched-mission-reward${m.rewardMin < 0 ? " neg" : ""}`}>
                              {m.rewardMin >= 0 ? "🎁 +" : "⚠️ "}{m.rewardMin}분
                            </span>
                            {m.completed && (
                              <div className="sched-mission-qty">
                                <button
                                  className="sched-qty-btn"
                                  onClick={() => updateMissionQty(m.id, Math.max(1, m.quantity - 1))}
                                  aria-label="수량 감소"
                                >−</button>
                                <span className="sched-qty-value">{m.quantity}</span>
                                <button
                                  className="sched-qty-btn"
                                  onClick={() => updateMissionQty(m.id, Math.min(9999, m.quantity + 1))}
                                  aria-label="수량 증가"
                                >+</button>
                              </div>
                            )}
                            {m.completed && <span className="sched-achieve-badge">✓</span>}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* ── 이번 주 미션 누적 보상 ── */}
                <div className="sched-achieve-section">
                  <div className="sched-mission-total-week">
                    🏆 이번 주 누적:{" "}
                    <strong className={weekTotalReward >= 0 ? "sched-reward-pos" : "sched-reward-neg"}>
                      {weekTotalReward >= 0 ? "+" : ""}{weekTotalReward}분
                    </strong>
                    <span className="sched-mission-reset-note">(매주 일요일 리셋)</span>
                  </div>
                </div>

              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Mission Management Panel ── */}
      {missionPanelOpen && (
        <div className="sched-modal-overlay" onClick={() => setMissionPanelOpen(false)}>
          <div className="sched-modal sched-mission-panel" onClick={e => e.stopPropagation()}>
            <div className="sched-modal-head">
              <h3>🎯 미션 관리 (공통)</h3>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMissionPanelOpen(false)}>✕</button>
            </div>

            {missionLoading ? (
              <div className="sched-achieve-loading">불러오는 중…</div>
            ) : (
              <div className="sched-achieve-body">
                <div className="sched-achieve-section">
                  <div className="sched-achieve-section-title">전체 미션 목록</div>

                  {missions.length === 0 ? (
                    <div className="sched-achieve-empty">아직 미션이 없습니다. 아래에서 추가하세요.</div>
                  ) : (
                    <ul className="sched-mission-list">
                      {missions.map(m => (
                        <li key={m.id} className="sched-mission-item">
                          {editMissionId === m.id ? (
                            <div className="sched-mission-edit">
                              <input
                                className="sched-input sched-mission-edit-input"
                                value={editMissionTitle}
                                onChange={e => setEditMissionTitle(e.target.value)}
                                onKeyDown={e => { if (e.key === "Enter") saveEditMission(m.id); }}
                                autoFocus
                                placeholder="미션명"
                              />
                              <div className="sched-mission-edit-row">
                                <label className="sched-label">보상(분)</label>
                                <input
                                  type="number"
                                  className="sched-input sched-mission-reward-input"
                                  min={-1440} max={1440}
                                  value={editMissionReward}
                                  onChange={e => setEditMissionReward(Math.min(1440, Math.max(-1440, Number(e.target.value) || 0)))}
                                />
                                <button className="btn btn-primary btn-sm" onClick={() => saveEditMission(m.id)}>저장</button>
                                <button className="btn btn-ghost btn-sm" onClick={() => setEditMissionId(null)}>취소</button>
                              </div>
                            </div>
                          ) : (
                            <div className="sched-mission-row">
                              <span className="sched-mission-title">{m.title}</span>
                              <span className={`sched-mission-reward${m.rewardMin < 0 ? " neg" : ""}`}>
                                {m.rewardMin >= 0 ? "🎁 +" : "⚠️ "}{m.rewardMin}분
                              </span>
                              <div className="sched-mission-actions">
                                <button className="sched-mission-btn" onClick={() => startEditMission(m)}>✏️</button>
                                <button className="sched-mission-btn sched-mission-del" onClick={() => deleteMission(m.id)}>🗑️</button>
                              </div>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* 미션 추가 폼 */}
                  <div className="sched-mission-add">
                    <input
                      className="sched-input sched-mission-add-title"
                      placeholder="새 미션 이름"
                      value={newMissionTitle}
                      maxLength={200}
                      onChange={e => setNewMissionTitle(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") addMission(); }}
                    />
                    <div className="sched-mission-add-row">
                      <label className="sched-label">보상(분, 마이너스 가능)</label>
                      <input
                        type="number"
                        className="sched-input sched-mission-reward-input"
                        min={-1440} max={1440}
                        value={newMissionReward}
                        onChange={e => setNewMissionReward(Math.min(1440, Math.max(-1440, Number(e.target.value) || 0)))}
                      />
                      <button
                        className="btn btn-primary btn-sm"
                        disabled={!newMissionTitle.trim()}
                        onClick={addMission}
                      >
                        + 추가
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
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

              {/* 반복 설정 (생성 시 또는 비반복 편집 시) */}
              {(modal.mode === "create" || (modal.mode === "edit" && !modal.isRepeated)) && (
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
