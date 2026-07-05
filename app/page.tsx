"use client";

// 러닝콜 메인 화면 — 점수 히어로, 시간대 추천, 러닝 정보 드로어
import {
  AlertCircle,
  BellRing,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  CloudRain,
  CloudSun,
  Droplets,
  Haze,
  LocateFixed,
  Menu,
  Plus,
  RefreshCw,
  Search,
  Share2,
  Shirt,
  Sparkles,
  Star,
  Sun,
  Thermometer,
  Wind,
  X
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CITY_PRESETS, DEFAULT_CITY } from "@/lib/cities";
import { GUIDE_TOPICS, type GuideTopic } from "@/lib/guide";
import { getOutfit, getOutfitPlan } from "@/lib/outfit";
import { buildMonthGrid, currentStreak, fmtDate, monthCount, weekCount } from "@/lib/record";
import {
  composeOneLiner,
  getConditionChips,
  getRankedWindows,
  getDayParts,
  getMetricDetail,
  heroHeadline,
  heroSubline,
  type ConditionChip,
  type MetricKey as DetailKey
} from "@/lib/insights";
import {
  compareWithYesterday,
  findBestRemainingSlot,
  findCurrentSlot,
  scoreForecast,
  type LocationPoint,
  type RawForecast
} from "@/lib/weather";
import { ACTIVITIES, ACTIVITY_ORDER, getDogPlan, getHikePlan, type ActivityKey } from "@/lib/activity";
import {
  DEFAULT_GOALS,
  emptyLog,
  loadGoals,
  loadLog,
  recordButtonLabel,
  saveGoals,
  saveLog,
  toggleDay,
  type ActivityGoal,
  type ActivityLog
} from "@/lib/activity-record";
import { ACTIVITY_GUIDE, getDynamicGuideBlock } from "@/lib/activity-guide";
import {
  ACTIVITY_JOURNAL_FIELDS,
  MOODS,
  deleteEntry,
  emptyEntry,
  emptyJournal,
  isEntryEmpty,
  loadJournal,
  saveJournal,
  setEntry,
  type ActivityRecord,
  type Journal,
  type JournalEntry,
  type MoodKey
} from "@/lib/journal";

// 활동 내부 탭 (판단 / 준비 / 기록 / 가이드)
type InnerTab = "today" | "prep" | "record" | "guide";
import {
  gradeHumidity,
  gradePm25,
  gradePrecipitation,
  gradeTemperature,
  gradeUv,
  gradeWind,
  type MetricGrade,
  type RunningSlot
} from "@/lib/scoring";

type LocationStep = "idle" | "checking" | "gps" | "address" | "weather" | "blocked";
type DayMode = "today" | "tomorrow";
type SearchResult = { name: string; detail: string; latitude: number; longitude: number };

const STORAGE_KEY = "running-alarm:location";

const DEFAULT_LOCATION: LocationPoint = {
  name: DEFAULT_CITY.name,
  latitude: DEFAULT_CITY.latitude,
  longitude: DEFAULT_CITY.longitude,
  source: "city"
};

const CHIP_ICONS: Record<ConditionChip["key"], React.ReactNode> = {
  precip: <CloudRain size={15} />,
  dust: <Haze size={15} />,
  temp: <Thermometer size={15} />,
  uv: <Sun size={15} />,
  wind: <Wind size={15} />,
  humidity: <Droplets size={15} />
};

// 조건칩 아이콘 — 비는 상태에 맞게(비 없으면 맑음 아이콘)
function chipIcon(chip: ConditionChip) {
  if (chip.key === "precip") {
    return chip.tone === "good" ? <CloudSun size={15} /> : <CloudRain size={15} />;
  }
  return CHIP_ICONS[chip.key];
}

// read: 차트에 표시할 실제 값 / score: 러닝 관점 점수(0~100, 높을수록 러닝에 좋음)
const METRICS: Array<{
  key: DetailKey;
  label: string;
  unit: string;
  read: (slot: RunningSlot) => number;
  score: (slot: RunningSlot) => number;
}> = [
  { key: "feel", label: "체감", unit: "°", read: (s) => s.apparentTemperature, score: (s) => s.temperatureScore },
  { key: "precip", label: "강수", unit: "%", read: (s) => s.precipitationProbability, score: (s) => s.precipitationScore },
  { key: "dust", label: "미세먼지", unit: "㎍", read: (s) => s.pm25, score: (s) => s.dustScore },
  { key: "uv", label: "자외선", unit: "", read: (s) => s.uvIndex, score: (s) => s.uvScore },
  { key: "wind", label: "바람", unit: "㎧", read: (s) => s.windSpeed, score: (s) => s.windScore },
  { key: "humidity", label: "습도", unit: "%", read: (s) => s.humidity, score: (s) => s.humidityScore }
];

const ALARM_KEY = "running-alarm:alarms";
const SAVED_KEY = "running-alarm:saved";
const ACTIVITY_KEY = "running-alarm:activity";

type SavedLocation = LocationPoint & { detail?: string; fav: boolean; ts: number };

function locKey(l: { latitude: number; longitude: number }) {
  return `${l.latitude.toFixed(3)},${l.longitude.toFixed(3)}`;
}

type AlarmConfig = { id: string; targetMs: number; label: string; timeLabel: string; leadMin: number; popup: boolean };

const LEAD_OPTIONS: Array<{ min: number; label: string }> = [
  { min: 0, label: "정각" },
  { min: 10, label: "10분 전" },
  { min: 20, label: "20분 전" },
  { min: 30, label: "30분 전" },
  { min: 60, label: "1시간 전" }
];

// 시간 문자열("2026-07-04T21:00")을 로컬 타임스탬프로
function slotToMs(time: string) {
  const ms = new Date(time).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

async function getNotificationRegistration() {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return (await navigator.serviceWorker.getRegistration("/")) ?? (await navigator.serviceWorker.register("/sw.js"));
  } catch {
    return null;
  }
}

async function showRunningNotification(alarm: AlarmConfig) {
  const body = `${alarm.label} · 나가기 좋은 시간이 다가와요.`;
  const registration = await getNotificationRegistration();
  if (registration?.showNotification) {
    const options = {
      body,
      tag: `running-alarm-${alarm.id}`,
      renotify: true,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: "/" }
    } as NotificationOptions;
    await registration.showNotification("러닝콜", options);
    return;
  }
  new Notification("러닝콜", { body, icon: "/icons/icon-192.png" });
}

// 앱이 완전히 닫혀 있어도 예약 발동하는 브라우저 기능(Notification Triggers). 지원 시 사용.
function supportsTrigger() {
  return typeof window !== "undefined" && "Notification" in window && "showTrigger" in Notification.prototype;
}

async function scheduleBackgroundAlarm(alarm: AlarmConfig) {
  if (!supportsTrigger()) return false;
  const registration = await getNotificationRegistration();
  if (!registration?.showNotification) return false;
  const fireAt = alarm.targetMs - alarm.leadMin * 60000;
  if (fireAt <= Date.now()) return false;
  try {
    const TriggerCtor = (window as unknown as { TimestampTrigger: new (t: number) => unknown }).TimestampTrigger;
    await registration.showNotification("러닝콜", {
      body: `${alarm.label} · 지금 나가기 좋은 시간이에요!`,
      tag: `running-alarm-${alarm.id}`,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: "/" },
      showTrigger: new TriggerCtor(fireAt)
    } as NotificationOptions & { showTrigger: unknown });
    return true;
  } catch {
    return false;
  }
}

async function cancelBackgroundAlarm(id: string) {
  const registration = await getNotificationRegistration();
  const reg = registration as (ServiceWorkerRegistration & {
    getNotifications?: (opts?: { includeTriggered?: boolean; tag?: string }) => Promise<Notification[]>;
  }) | null;
  if (!reg?.getNotifications) return;
  try {
    const notes = await reg.getNotifications({ includeTriggered: true, tag: `running-alarm-${id}` });
    notes.forEach((note) => note.close());
  } catch {
    // 무시
  }
}

// 좁은 칸에서도 항상 한 줄에 맞도록 폰트를 자동 축소 (두 줄/잘림 방지)
function FitText({ text, maxPx, minPx, className }: { text: string; maxPx: number; minPx: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      let size = maxPx;
      el.style.fontSize = `${size}px`;
      let guard = 0;
      while (el.scrollWidth > el.clientWidth + 0.5 && size > minPx && guard < 60) {
        size -= 0.5;
        el.style.fontSize = `${size}px`;
        guard += 1;
      }
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text, maxPx, minPx]);

  return (
    <span ref={ref} className={className} style={{ display: "block", whiteSpace: "nowrap", overflow: "hidden" }}>
      {text}
    </span>
  );
}

async function fetchAppForecast(location: LocationPoint) {
  const params = new URLSearchParams({
    name: location.name,
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    source: location.source
  });
  const response = await fetch(`/api/forecast?${params.toString()}`, {
    cache: "no-store",
    headers: { Accept: "application/json" }
  });
  if (!response.ok) throw new Error("Forecast unavailable");
  return (await response.json()) as RawForecast;
}

async function fetchLocationName(latitude: number, longitude: number) {
  const params = new URLSearchParams({ latitude: String(latitude), longitude: String(longitude) });
  const response = await fetch(`/api/reverse-location?${params.toString()}`, { cache: "no-store" });
  if (!response.ok) return "내 위치";
  const data = (await response.json()) as { name?: string };
  return data.name || "내 위치";
}

async function fetchSearch(query: string, mountainFirst = false) {
  const response = await fetch(`/api/search-location?query=${encodeURIComponent(query)}${mountainFirst ? "&mountain=1" : ""}`, {
    cache: "no-store"
  });
  if (!response.ok) return [];
  const data = (await response.json()) as { results?: SearchResult[] };
  return data.results ?? [];
}

function formatHour(slot: RunningSlot) {
  return `${String(slot.hour).padStart(2, "0")}:00`;
}

function fmtAmPm(hour: number) {
  const h = ((hour % 24) + 24) % 24;
  if (h === 0 || h === 24) return "자정";
  if (h === 12) return "정오";
  const ap = h < 12 ? "오전" : "오후";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${ap} ${h12}시`;
}

function formatClock(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function bestOf(slots: RunningSlot[]) {
  return slots.reduce((prev, slot) => (slot.totalScore > prev.totalScore ? slot : prev), slots[0]);
}

// 현재 시각부터 앞으로 12시간(13개 포인트). 자정을 넘어가도 이어지도록 오늘+내일 슬롯을 이어붙여 사용.
function windowSlots(timeline: RunningSlot[], currentTime: string | null) {
  if (!currentTime) {
    const day = timeline.filter((s) => s.hour >= 6 && s.hour <= 22);
    return (day.length >= 6 ? day : timeline).slice(0, 13);
  }
  const idx = timeline.findIndex((s) => s.time === currentTime);
  const start = idx < 0 ? 0 : idx;
  const win = timeline.slice(start, start + 13);
  return win.length >= 6 ? win : timeline.slice(Math.max(0, timeline.length - 13));
}

function ringColor(score: number) {
  if (score >= 72) return "#35d07a";
  if (score >= 55) return "#ffb020";
  if (score >= 38) return "#ff8a3d";
  return "#ff5a5f";
}

// 상황에 맞는 이모지 (미세 좋음인데 마스크 같은 오류 방지)
function precipEmoji(prob: number) {
  return prob >= 60 ? "🌧️" : prob >= 30 ? "🌦️" : "☀️";
}

function dustEmoji(label: string) {
  if (label === "좋음") return "😊";
  if (label === "보통") return "🙂";
  if (label === "나쁨") return "😷";
  return "🤢";
}

function windEmoji(label: string) {
  return label === "약함" ? "🍃" : "💨";
}

function toneBadge(grade: MetricGrade) {
  return `pill pill-${grade.tone}`;
}

function TimelineChart({
  slots,
  metric,
  currentTime,
  bestTime,
  worstTime,
  selectedTime,
  onSelectTime
}: {
  slots: RunningSlot[];
  metric: (typeof METRICS)[number];
  currentTime: string | null;
  bestTime: string | null;
  worstTime: string | null;
  selectedTime?: string;
  onSelectTime?: (time: string) => void;
}) {
  const width = 346;
  const height = 224;
  const padL = 30;
  const padR = 16;
  const top = 30;
  const bottom = 34;
  const chartHeight = height - top - bottom;
  const baseY = height - bottom;

  const values = slots.map((slot) => metric.read(slot));
  const nonNegative = Math.min(...values) >= 0;
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (max - min < 0.8) {
    const mid = (min + max) / 2;
    min = nonNegative ? Math.max(0, mid - 2) : mid - 2;
    max = mid + 2;
  } else {
    const pad = (max - min) * 0.18;
    min -= pad;
    max += pad;
    if (nonNegative && min < 0) min = 0;
  }
  const span = max - min || 1;
  const yTicks = [0, 0.5, 1].map((r) => ({ y: top + chartHeight - r * chartHeight, v: Math.round(min + span * r) }));

  const step = (width - padL - padR) / Math.max(slots.length - 1, 1);
  const points = slots.map((slot, index) => {
    const value = metric.read(slot);
    const x = padL + index * step;
    const y = top + chartHeight - ((value - min) / span) * chartHeight;
    return { x, y, slot, value };
  });

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${baseY} L ${points[0].x.toFixed(1)} ${baseY} Z`;

  const currentPoint = currentTime ? points.find((p) => p.slot.time === currentTime) ?? null : null;
  const bestPoint = bestTime ? points.find((p) => p.slot.time === bestTime) ?? null : null;
  const worstPoint = worstTime ? points.find((p) => p.slot.time === worstTime) ?? null : null;
  const selPoint = selectedTime ? points.find((p) => p.slot.time === selectedTime) ?? null : null;
  const labelEvery = points.length > 9 ? 3 : 2;
  const fmtVal = (v: number) => (Math.abs(v) < 12 ? v.toFixed(1) : Math.round(v).toString());

  const bubble = (p: { x: number; y: number; value: number }, cls: string, above: boolean) => (
    <g
      transform={`translate(${Math.min(Math.max(p.x, 24), width - 24)}, ${
        above ? Math.max(p.y - 13, 15) : Math.min(p.y + 27, baseY - 2)
      })`}
    >
      <rect className={cls} x="-21" y="-14" width="42" height="19" rx="7" />
      <text className="bubble-text" x="0" y="-0.5" textAnchor="middle">
        {fmtVal(p.value)}
      </text>
    </g>
  );

  return (
    <div className="graph-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${metric.label} 시간대별 그래프`}>
        <defs>
          <linearGradient id="areaFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#2f6bff" stopOpacity="0.24" />
            <stop offset="100%" stopColor="#2f6bff" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {yTicks.map((tick) => (
          <g key={tick.y}>
            <line className="grid-line" x1={padL} x2={width - padR} y1={tick.y} y2={tick.y} />
            <text className="axis-label" x={padL - 7} y={tick.y + 3.5} textAnchor="end">
              {tick.v}
            </text>
          </g>
        ))}

        {currentPoint ? (
          <line className="current-line" x1={currentPoint.x} x2={currentPoint.x} y1={top - 4} y2={baseY} />
        ) : null}

        <path className="chart-area" d={areaPath} fill="url(#areaFill)" />
        <path className="chart-line" d={linePath} stroke="#2f6bff" />

        {points.map((p) => (
          <circle key={p.slot.time} className="dot" cx={p.x} cy={p.y} r="2.4" />
        ))}

        {points.map((p, index) =>
          index % labelEvery === 0 || index === points.length - 1 ? (
            <text key={`x-${p.slot.time}`} className="hour-label" x={p.x} y={baseY + 17} textAnchor="middle">
              {String(p.slot.hour).padStart(2, "0")}
            </text>
          ) : null
        )}

        {worstPoint ? (
          <>
            <circle className="mark-halo mark-worst" cx={worstPoint.x} cy={worstPoint.y} r="11" />
            <circle className="mark-dot mark-worst" cx={worstPoint.x} cy={worstPoint.y} r="4.5" />
            {bubble(worstPoint, "bubble-worst", false)}
          </>
        ) : null}

        {bestPoint ? (
          <>
            <circle className="mark-halo mark-best" cx={bestPoint.x} cy={bestPoint.y} r="11" />
            <circle className="mark-dot mark-best" cx={bestPoint.x} cy={bestPoint.y} r="4.5" />
            {bubble(bestPoint, "bubble-best", true)}
          </>
        ) : null}

        {currentPoint ? (
          <text className="now-tag" x={currentPoint.x} y={top - 8} textAnchor="middle">
            지금
          </text>
        ) : null}

        {/* 선택한 시각 = 움직이는 세로 바 + 값 말풍선 */}
        {selPoint ? (
          <>
            <line className="sel-line" x1={selPoint.x} x2={selPoint.x} y1={top - 4} y2={baseY} />
            <circle className="sel-dot" cx={selPoint.x} cy={selPoint.y} r="6" />
            {bubble(selPoint, "sel-bubble", selPoint.y > top + chartHeight / 2)}
          </>
        ) : null}

        {/* 탭 영역 — 시간을 눌러 값 확인 */}
        {onSelectTime
          ? points.map((p) => (
              <rect
                key={`tap-${p.slot.time}`}
                x={p.x - step / 2}
                y={top - 8}
                width={step}
                height={chartHeight + 16}
                fill="transparent"
                style={{ cursor: "pointer" }}
                onClick={() => onSelectTime(p.slot.time)}
              />
            ))
          : null}
      </svg>
    </div>
  );
}

function MetricSheet({
  sheetKey,
  reference,
  slots,
  currentTime,
  activity,
  onClose
}: {
  sheetKey: DetailKey;
  reference: RunningSlot;
  slots: RunningSlot[];
  currentTime: string | null;
  activity: ActivityKey;
  onClose: () => void;
}) {
  const metric = METRICS.find((item) => item.key === sheetKey) ?? METRICS[0];
  const chart = windowSlots(slots, currentTime);

  // 그래프에서 선택한 시각 (기본 = 지금). 탭하면 그 시각 값·등급·바가 바뀜.
  const defaultSel = currentTime ?? chart[0]?.time ?? reference.time;
  const [selTime, setSelTime] = useState(defaultSel);
  const selSlot = chart.find((s) => s.time === selTime) ?? reference;
  const isNowSel = currentTime != null && selTime === currentTime;
  const detail = getMetricDetail(sheetKey, selSlot, activity);

  // 러닝 관점 최고/최저 시각 (지표 점수 기준)
  const bestSlot = chart.reduce((a, b) => (metric.score(b) > metric.score(a) ? b : a), chart[0]);
  const worstSlot = chart.reduce((a, b) => (metric.score(b) < metric.score(a) ? b : a), chart[0]);
  const spread = metric.score(bestSlot) - metric.score(worstSlot);
  const bestTime = spread >= 8 ? bestSlot.time : null;
  const worstTime = spread >= 8 && worstSlot.time !== bestSlot.time ? worstSlot.time : null;

  return (
    <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-label={`${detail.title} 상세`} onClick={onClose}>
      <div className="sheet" onClick={(event) => event.stopPropagation()}>
        <div className="sheet-topbar">
          <div className="sheet-grip" aria-hidden="true" />
          <button className="sheet-close" type="button" onClick={onClose} aria-label="닫기">
            <X size={18} />
          </button>
        </div>

        <div className="sheet-head">
          <p className="sheet-title">
            {detail.title}
            <span className="sheet-when">{isNowSel ? " · 지금" : ` · ${fmtAmPm(selSlot.hour)}`}</span>
          </p>
          <div className="sheet-value-row">
            <p className="sheet-value">
              {detail.valueText}
              <span>{detail.unit}</span>
            </p>
            <span className={`pill pill-${detail.grade.tone} sheet-grade`}>{detail.grade.label}</span>
          </div>
        </div>

        <div className="scale">
          <div className="scale-bar">
            {detail.segments.map((seg) => (
              <span key={seg.label} className={`scale-seg tone-${seg.tone}`} style={{ flexGrow: seg.to - seg.from }}>
                {seg.label}
              </span>
            ))}
          </div>
          <div className="scale-marker" style={{ left: `${detail.marker * 100}%` }} aria-hidden="true">
            <span />
          </div>
        </div>

        <p className="sheet-meaning">{detail.meaning}</p>
        <div className="sheet-tip">
          <Sparkles size={15} />
          <span>{detail.tip}</span>
        </div>

        <p className="sheet-graph-label">
          <b>{currentTime ? "앞으로 12시간" : "내일"} {metric.label} 흐름</b>
          <small>시간을 눌러보세요</small>
        </p>
        <TimelineChart
          slots={chart}
          metric={metric}
          currentTime={currentTime}
          bestTime={bestTime}
          worstTime={worstTime}
          selectedTime={selTime}
          onSelectTime={setSelTime}
        />
        {bestTime || worstTime ? (
          <div className="chart-legend">
            {bestTime ? (
              <span className="cl-best">🟢 {ACTIVITIES[activity].label} 좋은 {String(bestSlot.hour).padStart(2, "0")}시</span>
            ) : null}
            {worstTime ? (
              <span className="cl-worst">🔴 피할 {String(worstSlot.hour).padStart(2, "0")}시</span>
            ) : null}
            {currentTime ? <span className="cl-now">🔵 지금</span> : null}
          </div>
        ) : (
          <p className="chart-hint">시간대에 따라 크게 달라지지 않아요.</p>
        )}
      </div>
    </div>
  );
}

// 복장 플랜 본문 — OutfitSheet(모달)과 준비 탭(인라인)에서 공유
function OutfitPlanBody({ plan }: { plan: ReturnType<typeof getOutfitPlan> }) {
  return (
    <>
      <p className="sheet-meaning">{plan.headline}</p>

      {/* 오늘 날씨 변화 (비·자외선·기온) */}
      {plan.changes.length > 0 ? (
        <div className="outfit-changes">
          {plan.changes.map((c, i) => (
            <div key={i} className={`ofc ofc-${c.tone}`}>
              <span aria-hidden="true">{c.emoji}</span>
              <p>{c.text}</p>
            </div>
          ))}
        </div>
      ) : null}

      {/* 카테고리별 복장 */}
      <p className="outfit-section">기본 복장</p>
      <ul className="outfit-cats">
        {plan.categories.map((c, i) => (
          <li key={`${c.label}-${i}`}>
            <span className="oc-emoji" aria-hidden="true">
              {c.emoji}
            </span>
            <div className="oc-body">
              <strong>
                <span className="oc-label">{c.label}</span>
                {c.value}
              </strong>
              <small>{c.reason}</small>
            </div>
          </li>
        ))}
      </ul>

      {/* 햇빛·자외선 */}
      {plan.sun ? (
        <>
          <p className="outfit-section outfit-sun-head">
            ☀️ 햇빛·자외선 <em>{plan.sun.level}</em>
          </p>
          <ul className="outfit-cats sun-cats">
            {plan.sun.items.map((item, i) => (
              <li key={`${item.label}-${i}`}>
                <span className="oc-emoji" aria-hidden="true">
                  {item.emoji}
                </span>
                <div className="oc-body">
                  <strong>{item.label}</strong>
                  <small>{item.reason}</small>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {/* 시간대별 옷차림 */}
      {plan.byTime.length > 0 ? (
        <>
          <p className="outfit-section">시간대별 옷차림</p>
          <ul className="outfit-times">
            {plan.byTime.map((p) => (
              <li key={p.label}>
                <span className="ot-when">
                  <span aria-hidden="true">{p.emoji}</span>
                  {p.label} · {p.feel}°
                </span>
                <span className="ot-wear">
                  {p.main}
                  {p.note ? <small> · {p.note}</small> : null}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </>
  );
}

// 준비 탭 — 복장 상세 + 활동별 준비/주의 콘텐츠
function PrepView({ slot, slots, activity }: { slot: RunningSlot; slots: RunningSlot[]; activity: ActivityKey }) {
  const plan = getOutfitPlan(slots, slot, activity);
  const keyBlock = getDynamicGuideBlock(activity, slot);
  return (
    <section className="prep-view" aria-label={`${ACTIVITIES[activity].terms.outfitTitle}`}>
      <p className="prep-head">
        {ACTIVITIES[activity].terms.outfitTitle} · 체감 {plan.feels.toFixed(0)}°C
      </p>
      <p className="prep-main">{plan.main}</p>
      {keyBlock ? (
        <div className="prep-key" role="note">
          <p className="prep-key-head">🔑 오늘 준비 핵심</p>
          <ul>
            {keyBlock.items.map((it) => (
              <li key={it}>{it}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <OutfitPlanBody plan={plan} />
      <GuideBlocks blocks={ACTIVITY_GUIDE[activity].prep} />
    </section>
  );
}

function OutfitSheet({
  slot,
  slots,
  activity,
  onClose
}: {
  slot: RunningSlot;
  slots: RunningSlot[];
  activity: ActivityKey;
  onClose: () => void;
}) {
  const plan = getOutfitPlan(slots, slot, activity);

  return (
    <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-label="복장 상세" onClick={onClose}>
      <div className="sheet" onClick={(event) => event.stopPropagation()}>
        <div className="sheet-topbar">
          <div className="sheet-grip" aria-hidden="true" />
          <button className="sheet-close" type="button" onClick={onClose} aria-label="닫기">
            <X size={18} />
          </button>
        </div>

        <div className="sheet-head">
          <p className="sheet-title">지금 {ACTIVITIES[activity].terms.outfitTitle} · 체감 {plan.feels.toFixed(0)}°C</p>
          <div className="sheet-value-row">
            <p className="sheet-value outfit-main">{plan.main}</p>
          </div>
        </div>

        <OutfitPlanBody plan={plan} />
      </div>
    </div>
  );
}

// 가이드 탭 — 오늘 조건 맞춤 동적 블록 + 활동별 실전 팁
function GuideView({ activity, slot }: { activity: ActivityKey; slot: RunningSlot | null }) {
  const dynamicBlock = slot ? getDynamicGuideBlock(activity, slot) : null;
  return (
    <section className="guide-view" aria-label={`${ACTIVITIES[activity].label} 가이드`}>
      {dynamicBlock ? <GuideBlocks blocks={[dynamicBlock]} /> : null}
      <GuideBlocks blocks={ACTIVITY_GUIDE[activity].guide} />
    </section>
  );
}

function GuideSheet({ topic, onClose }: { topic: GuideTopic; onClose: () => void }) {
  return (
    <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-label={topic.title} onClick={onClose}>
      <div className="sheet" onClick={(event) => event.stopPropagation()}>
        <div className="sheet-topbar">
          <div className="sheet-grip" aria-hidden="true" />
          <button className="sheet-close" type="button" onClick={onClose} aria-label="닫기">
            <X size={18} />
          </button>
        </div>

        <div className="sheet-head">
          <p className="sheet-title">
            {topic.emoji} {topic.tagline}
          </p>
          <div className="sheet-value-row">
            <p className="sheet-value guide-title">{topic.title}</p>
          </div>
        </div>

        <div className="guide-body">
          {topic.sections.map((section, index) => (
            <div className="guide-section" key={index}>
              {section.heading ? <h3>{section.heading}</h3> : null}
              {section.body ? <p>{section.body}</p> : null}
              {section.list ? (
                <ul>
                  {section.list.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// 활동별 기록 (내부 "기록" 탭에 인라인) — 오늘 체크·연속일·목표·달력
function RecordView({
  activity,
  daySet,
  goal,
  onToggle,
  onSetGoal
}: {
  activity: ActivityKey;
  daySet: Set<string>;
  goal: ActivityGoal;
  onToggle: (dateStr: string) => void;
  onSetGoal: (goal: ActivityGoal) => void;
}) {
  const today = new Date();
  const todayS = fmtDate(today);
  const [ym, setYm] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const grid = buildMonthGrid(ym.y, ym.m);
  const streak = currentStreak(daySet, today);
  const wk = weekCount(daySet, today);
  const mo = monthCount(daySet, ym.y, ym.m);
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  const doneNow = goal.period === "month" ? monthCount(daySet, today.getFullYear(), today.getMonth()) : wk;
  const goalOptions = goal.period === "month" ? [1, 2, 3, 4] : [2, 3, 4, 5, 6, 7];
  const periodLabel = goal.period === "month" ? "이번 달" : "이번 주";
  const todayDone = daySet.has(todayS);

  const shift = (delta: number) => {
    const d = new Date(ym.y, ym.m + delta, 1);
    setYm({ y: d.getFullYear(), m: d.getMonth() });
  };

  return (
    <section className="record-view" aria-label={`${ACTIVITIES[activity].label} 기록`}>
      <button
        type="button"
        className={`record-toggle ${todayDone ? "done" : ""}`}
        onClick={() => onToggle(todayS)}
      >
        {todayDone ? "오늘 완료! 🎉 (취소하려면 다시)" : recordButtonLabel(activity)}
      </button>

      <div className="rec-stats">
        <div className="rs-item rs-fire">
          <strong>{streak}</strong>
          <small>연속 일 🔥</small>
        </div>
        <div className="rs-item">
          <strong>
            {doneNow}
            <span>/{goal.count}</span>
          </strong>
          <small>{periodLabel} 목표</small>
        </div>
        <div className="rs-item">
          <strong>{mo}</strong>
          <small>이번 달 누적</small>
        </div>
      </div>

      <p className="rec-goal-label">{ACTIVITIES[activity].label} 목표 ({goal.period === "month" ? "월간" : "주간"})</p>
      <div className="rec-goals">
        {goalOptions.map((g) => (
          <button
            key={g}
            type="button"
            className={`rec-goal ${goal.count === g ? "on" : ""}`}
            onClick={() => onSetGoal({ count: g, period: goal.period })}
          >
            {goal.period === "month" ? "월" : "주"} {g}회
          </button>
        ))}
      </div>

      <div className="cal-nav">
        <button type="button" onClick={() => shift(-1)} aria-label="이전 달">
          <ChevronLeft size={18} />
        </button>
        <strong>
          {ym.y}년 {ym.m + 1}월
        </strong>
        <button type="button" onClick={() => shift(1)} aria-label="다음 달">
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="cal-grid">
        {weekdays.map((w) => (
          <span className={`cal-wd ${w === "일" ? "sun" : w === "토" ? "sat" : ""}`} key={w}>
            {w}
          </span>
        ))}
        {grid.map((cell, i) => {
          if (!cell) return <span className="cal-cell empty" key={`e${i}`} />;
          const ds = fmtDate(cell);
          const isDone = daySet.has(ds);
          const isToday = ds === todayS;
          const isFuture = ds > todayS;
          return (
            <button
              type="button"
              key={ds}
              disabled={isFuture}
              onClick={() => onToggle(ds)}
              className={`cal-cell ${isDone ? "is-run" : ""} ${isToday ? "is-today" : ""} ${isFuture ? "is-future" : ""}`}
            >
              {cell.getDate()}
            </button>
          );
        })}
      </div>

      <p className="cal-hint">날짜를 눌러 기록을 표시하거나 지울 수 있어요. 활동별로 따로 저장돼요.</p>
    </section>
  );
}

// 활동별 실전 준비·가이드 블록 렌더
function GuideBlocks({ blocks }: { blocks: { heading: string; items: string[] }[] }) {
  return (
    <div className="guide-blocks">
      {blocks.map((b) => (
        <div className="guide-block" key={b.heading}>
          <p className="gb-head">{b.heading}</p>
          <ul>
            {b.items.map((it) => (
              <li key={it}>{it}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

// 편집 중 숫자 필드는 문자열로 보관(소수점 입력 보존), 저장 시 숫자로 변환
type DraftActivity = { key: ActivityKey; distanceKm?: string; durationMin?: string; place?: string };
type JournalDraft = { activities: DraftActivity[]; mood?: MoodKey; note: string };

const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"];

function prettyDate(ds: string): string {
  const [y, m, d] = ds.split("-").map(Number);
  const wd = WEEKDAY_KO[new Date(y, m - 1, d).getDay()];
  return `${m}월 ${d}일 ${wd}요일`;
}

function toDraft(entry: JournalEntry): JournalDraft {
  return {
    activities: entry.activities.map((a) => ({
      key: a.key,
      distanceKm: a.distanceKm?.toString(),
      durationMin: a.durationMin?.toString(),
      place: a.place
    })),
    mood: entry.mood,
    note: entry.note
  };
}

function fromDraft(draft: JournalDraft): JournalEntry {
  const activities: ActivityRecord[] = draft.activities.map((a) => {
    const rec: ActivityRecord = { key: a.key };
    const d = a.distanceKm != null && a.distanceKm !== "" ? Number(a.distanceKm) : NaN;
    const t = a.durationMin != null && a.durationMin !== "" ? Number(a.durationMin) : NaN;
    if (Number.isFinite(d) && d >= 0) rec.distanceKm = d;
    if (Number.isFinite(t) && t >= 0) rec.durationMin = t;
    if (a.place && a.place.trim()) rec.place = a.place.trim();
    return rec;
  });
  return { activities, mood: draft.mood, note: draft.note };
}

// 전체 운동 일지 — 월 캘린더(활동 이모지) ↔ 날짜별 다이어리 편집기(기분·활동 기록·일기)
function JournalView({
  journal,
  ym,
  onShiftMonth,
  selectedDate,
  onSelectDate,
  onSaveEntry,
  onDeleteEntry,
  onClose
}: {
  journal: Journal;
  ym: { y: number; m: number };
  onShiftMonth: (delta: number) => void;
  selectedDate: string | null;
  onSelectDate: (date: string | null) => void;
  onSaveEntry: (date: string, entry: JournalEntry) => void;
  onDeleteEntry: (date: string) => void;
  onClose: () => void;
}) {
  const grid = buildMonthGrid(ym.y, ym.m);
  const todayS = fmtDate(new Date());
  const [draft, setDraft] = useState<JournalDraft>({ activities: [], note: "" });
  const [savedFlash, setSavedFlash] = useState(false);

  // 날짜를 새로 열 때만 원본에서 draft 초기화 (편집 중엔 draft 독립)
  useEffect(() => {
    if (selectedDate) {
      const e = journal[selectedDate];
      setDraft(toDraft(e ?? emptyEntry()));
    }
    // journal은 의도적으로 의존성 제외 — 저장 시 draft가 리셋되지 않게
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  const monthPrefix = `${ym.y}-${String(ym.m + 1).padStart(2, "0")}`;
  const recordedDays = Object.entries(journal).filter(
    ([d, e]) => d.startsWith(monthPrefix) && !isEntryEmpty(e)
  ).length;

  function toggleAct(key: ActivityKey) {
    setDraft((d) => {
      const has = d.activities.some((a) => a.key === key);
      return {
        ...d,
        activities: has ? d.activities.filter((a) => a.key !== key) : [...d.activities, { key }]
      };
    });
  }

  function setField(key: ActivityKey, field: "distanceKm" | "durationMin" | "place", value: string) {
    setDraft((d) => ({
      ...d,
      activities: d.activities.map((a) => (a.key === key ? { ...a, [field]: value } : a))
    }));
  }

  function handleSave() {
    if (!selectedDate) return;
    const entry = fromDraft(draft);
    if (isEntryEmpty(entry)) onDeleteEntry(selectedDate);
    else onSaveEntry(selectedDate, entry);
    setSavedFlash(true);
    window.setTimeout(() => {
      setSavedFlash(false);
      onSelectDate(null);
    }, 700);
  }

  return (
    <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-label="운동 일지" onClick={onClose}>
      <div className="sheet journal-sheet" onClick={(event) => event.stopPropagation()}>
        <div className="sheet-topbar">
          <div className="sheet-grip" aria-hidden="true" />
          <button className="sheet-close" type="button" onClick={onClose} aria-label="닫기">
            <X size={18} />
          </button>
        </div>

        {!selectedDate ? (
          <>
            <div className="sheet-head journal-cal-head">
              <p className="sheet-title">📔 나의 운동 일지</p>
              <span className="journal-month-count">이번 달 {recordedDays}일 기록</span>
            </div>

            <div className="cal-nav">
              <button type="button" onClick={() => onShiftMonth(-1)} aria-label="이전 달">
                <ChevronLeft size={18} />
              </button>
              <strong>
                {ym.y}년 {ym.m + 1}월
              </strong>
              <button type="button" onClick={() => onShiftMonth(1)} aria-label="다음 달">
                <ChevronRight size={18} />
              </button>
            </div>

            <div className="cal-grid journal-grid">
              {WEEKDAY_KO.map((w) => (
                <span className={`cal-wd ${w === "일" ? "sun" : w === "토" ? "sat" : ""}`} key={w}>
                  {w}
                </span>
              ))}
              {grid.map((cell, i) => {
                if (!cell) return <span className="cal-cell empty" key={`e${i}`} />;
                const ds = fmtDate(cell);
                const dayEntry = journal[ds];
                const isToday = ds === todayS;
                const isFuture = ds > todayS;
                return (
                  <button
                    type="button"
                    key={ds}
                    disabled={isFuture}
                    onClick={() => onSelectDate(ds)}
                    className={`cal-cell journal-cell ${isToday ? "is-today" : ""} ${isFuture ? "is-future" : ""}`}
                  >
                    <span className="jc-date">{cell.getDate()}</span>
                    {dayEntry && dayEntry.activities.length > 0 ? (
                      <span className="jc-icons">
                        {dayEntry.activities.slice(0, 3).map((a) => (
                          <span key={a.key} aria-hidden="true">
                            {ACTIVITIES[a.key].emoji}
                          </span>
                        ))}
                        {dayEntry.activities.length > 3 ? (
                          <span className="jc-more">+{dayEntry.activities.length - 3}</span>
                        ) : null}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
            <p className="journal-hint">날짜를 눌러 그날의 운동과 기분, 일기를 남겨보세요.</p>
          </>
        ) : (
          <div className="journal-editor">
            <div className="journal-editor-top">
              <button type="button" className="journal-back" onClick={() => onSelectDate(null)}>
                <ChevronLeft size={16} /> 달력
              </button>
              <p className="journal-editor-date">{prettyDate(selectedDate)}</p>
            </div>

            <p className="journal-section-label">오늘 기분</p>
            <div className="journal-moods">
              {MOODS.map((mood) => (
                <button
                  key={mood.key}
                  type="button"
                  className={`journal-mood${draft.mood === mood.key ? " on" : ""}`}
                  aria-pressed={draft.mood === mood.key}
                  onClick={() => setDraft((d) => ({ ...d, mood: d.mood === mood.key ? undefined : mood.key }))}
                >
                  <span className="jm-emoji" aria-hidden="true">
                    {mood.emoji}
                  </span>
                  <small>{mood.label}</small>
                </button>
              ))}
            </div>

            <p className="journal-section-label">무슨 운동을 했나요?</p>
            <div className="journal-activity-picks">
              {ACTIVITY_ORDER.map((key) => {
                const rec = draft.activities.find((a) => a.key === key);
                const on = Boolean(rec);
                return (
                  <button
                    key={key}
                    type="button"
                    className={`journal-pick${on ? " on" : ""}`}
                    onClick={() => toggleAct(key)}
                  >
                    <span className="jp-emoji" aria-hidden="true">
                      {ACTIVITIES[key].emoji}
                    </span>
                    {ACTIVITIES[key].label}
                  </button>
                );
              })}
            </div>

            {draft.activities.length > 0 ? (
              <div className="journal-fields">
                {ACTIVITY_ORDER.filter((k) => draft.activities.some((a) => a.key === k)).map((key) => {
                  const rec = draft.activities.find((a) => a.key === key)!;
                  return (
                    <div className="jf-row" key={key}>
                      <span className="jf-act">
                        <span aria-hidden="true">{ACTIVITIES[key].emoji}</span> {ACTIVITIES[key].label}
                      </span>
                      <div className="jf-inputs">
                        {ACTIVITY_JOURNAL_FIELDS[key].map((f) => (
                          <label className="jf-field" key={f.key}>
                            <span className="jf-label">{f.label}</span>
                            <span className="jf-input">
                              <input
                                type="text"
                                inputMode={f.kind === "number" ? "decimal" : "text"}
                                value={rec[f.key] ?? ""}
                                placeholder={f.placeholder ?? ""}
                                onChange={(e) => setField(key, f.key, e.target.value)}
                              />
                              {f.unit ? <em>{f.unit}</em> : null}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}

            <p className="journal-section-label">오늘의 일기</p>
            <textarea
              className="journal-note"
              placeholder="오늘 어땠나요? 코스·컨디션·느낀 점을 남겨보세요."
              value={draft.note}
              maxLength={500}
              onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
            />

            <div className="journal-footer">
              <button type="button" className="journal-cancel" onClick={() => onSelectDate(null)}>
                취소
              </button>
              <button type="button" className="journal-save" onClick={handleSave}>
                {savedFlash ? "저장됨 ✓" : "저장"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AlarmSheet({
  target,
  existing,
  canNotify,
  onSave,
  onRemove,
  onClose
}: {
  target: { id: string; label: string; timeLabel: string; targetMs: number };
  existing: AlarmConfig | null;
  canNotify: boolean;
  onSave: (leadMin: number, popup: boolean) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [leadMin, setLeadMin] = useState(existing ? existing.leadMin : 10);
  const [popup, setPopup] = useState(existing ? existing.popup : false);
  const fireMs = target.targetMs - leadMin * 60000;
  const tooLate = fireMs <= Date.now();

  return (
    <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-label="알림 설정" onClick={onClose}>
      <div className="sheet" onClick={(event) => event.stopPropagation()}>
        <div className="sheet-topbar">
          <div className="sheet-grip" aria-hidden="true" />
          <button className="sheet-close" type="button" onClick={onClose} aria-label="닫기">
            <X size={18} />
          </button>
        </div>

        <div className="sheet-head">
          <p className="sheet-title">🔔 알림 설정</p>
          <div className="sheet-value-row">
            <p className="sheet-value">{target.timeLabel}</p>
            <span className="pill pill-normal sheet-grade">{target.label}</span>
          </div>
        </div>

        <p className="alarm-q">언제 알려드릴까요?</p>
        <div className="alarm-leads">
          {LEAD_OPTIONS.map((opt) => (
            <button
              key={opt.min}
              type="button"
              className={`alarm-lead ${leadMin === opt.min ? "on" : ""}`}
              onClick={() => setLeadMin(opt.min)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <button type="button" className={`alarm-toggle ${popup ? "on" : ""}`} onClick={() => setPopup((v) => !v)}>
          <div>
            <strong>기기 팝업 알림</strong>
            <small>{canNotify ? "휴대폰 알림창으로 받을 수 있어요" : "이 기기는 앱 화면에서만 알려요"}</small>
          </div>
          <span className="switch" aria-hidden="true" />
        </button>

        <p className="alarm-note">
          {tooLate
            ? "이미 지난 시간이에요. 다른 시간대를 골라주세요."
            : "앱을 백그라운드에 둔 상태까지는 알림이 안정적이에요. 완전히 종료하면 제한될 수 있어요."}
        </p>

        <div className="alarm-actions">
          {existing ? (
            <button type="button" className="ghost-action" onClick={onRemove}>
              알림 끄기
            </button>
          ) : null}
          <button type="button" className="primary-action" disabled={tooLate} onClick={() => onSave(leadMin, popup)}>
            {existing ? "알림 변경" : "알림 켜기"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AdSlot({ side }: { side?: "left" | "right" }) {
  return (
    <aside className={side ? `side-ad side-ad-${side}` : "infeed-ad"} aria-label="광고 영역">
      <span>AD</span>
      <strong>{side ? "사이드 배너" : "인피드 광고"}</strong>
    </aside>
  );
}

// 활동 선택 — 데스크탑 좌측 레일(rail, 큰 글자) / 모바일 상단 탭(tabs)
function ActivityRail({
  activity,
  onChange,
  variant,
  onOpenJournal
}: {
  activity: ActivityKey;
  onChange: (next: ActivityKey) => void;
  variant: "rail" | "tabs";
  onOpenJournal?: () => void;
}) {
  return (
    <nav className={variant === "rail" ? "activity-rail" : "activity-tabs"} aria-label="활동 선택">
      {ACTIVITY_ORDER.map((key) => {
        const item = ACTIVITIES[key];
        const on = key === activity;
        return (
          <button
            key={key}
            type="button"
            className={`act-item${on ? " on" : ""}`}
            aria-pressed={on}
            onClick={() => onChange(key)}
          >
            <span className="act-emoji" aria-hidden="true">
              {item.emoji}
            </span>
            {variant === "rail" ? (
              <span className="act-rail-label">{item.label}</span>
            ) : (
              <span className="act-label">{item.short}</span>
            )}
          </button>
        );
      })}
      {variant === "rail" && onOpenJournal ? (
        <>
          <div className="rail-sep" aria-hidden="true" />
          <button type="button" className="act-item journal-btn" onClick={onOpenJournal}>
            <span className="act-emoji" aria-hidden="true">
              📔
            </span>
            <span className="act-rail-label">운동 일지</span>
          </button>
        </>
      ) : null}
    </nav>
  );
}

export default function Home() {
  const [location, setLocation] = useState<LocationPoint>(DEFAULT_LOCATION);
  const [rawForecast, setRawForecast] = useState<RawForecast | null>(null);
  const [activity, setActivity] = useState<ActivityKey>("walk");
  const [isLoading, setIsLoading] = useState(true);
  const [isLocating, setIsLocating] = useState(false);
  const [locationStep, setLocationStep] = useState<LocationStep>("idle");
  const [error, setError] = useState("");
  const [dayMode, setDayMode] = useState<DayMode>("today");
  const [sheetKey, setSheetKey] = useState<DetailKey | null>(null);
  const [isOutfitOpen, setIsOutfitOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [guideTopic, setGuideTopic] = useState<GuideTopic | null>(null);
  const [toast, setToast] = useState("");
  const [alarms, setAlarms] = useState<AlarmConfig[]>([]);
  const [alarmTarget, setAlarmTarget] = useState<{ id: string; label: string; timeLabel: string; targetMs: number } | null>(
    null
  );
  const [firedAlarm, setFiredAlarm] = useState<AlarmConfig | null>(null);
  const [isRestored, setIsRestored] = useState(false);
  const [nowClock, setNowClock] = useState("");
  const [nowHour, setNowHour] = useState(-1);

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchNote, setSearchNote] = useState("");
  const [saved, setSaved] = useState<SavedLocation[]>([]);
  const [activityLog, setActivityLog] = useState<ActivityLog>(emptyLog);
  const [goals, setGoals] = useState(DEFAULT_GOALS);
  const [isRecordRestored, setIsRecordRestored] = useState(false);
  const [innerTab, setInnerTab] = useState<InnerTab>("today");
  const [activityLocations, setActivityLocations] = useState<Partial<Record<ActivityKey, LocationPoint>>>({});
  const [journal, setJournalState] = useState<Journal>(emptyJournal);
  const [isJournalRestored, setIsJournalRestored] = useState(false);
  const [isJournalOpen, setIsJournalOpen] = useState(false);
  const [journalYm, setJournalYm] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const [journalSelectedDate, setJournalSelectedDate] = useState<string | null>(null);

  const loadForecast = useCallback(async (target: LocationPoint) => {
    setIsLoading(true);
    setError("");
    try {
      const data = await fetchAppForecast(target);
      setRawForecast(data);
    } catch {
      setError("데이터를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as LocationPoint;
        if (
          typeof parsed.latitude === "number" &&
          typeof parsed.longitude === "number" &&
          typeof parsed.name === "string"
        ) {
          setLocation({
            name: parsed.name,
            latitude: parsed.latitude,
            longitude: parsed.longitude,
            source: parsed.source === "gps" || parsed.source === "search" ? parsed.source : "city"
          });
        }
      }
    } catch {
      // 저장값이 깨졌으면 기본 도시로 시작
    }
    setIsRestored(true);
  }, []);

  useEffect(() => {
    if (!isRestored) return;
    void loadForecast(location);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(location));
    } catch {
      // 저장 불가 환경 무시
    }
  }, [isRestored, loadForecast, location]);

  useEffect(() => {
    const tick = () => {
      setNowClock(new Intl.DateTimeFormat("ko-KR", { hour: "numeric", minute: "2-digit" }).format(new Date()));
      setNowHour(new Date().getHours());
    };
    tick();
    const id = window.setInterval(tick, 30000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(""), 2200);
    return () => window.clearTimeout(id);
  }, [toast]);

  // 저장된 알림 복원 (지난 것 정리)
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(ALARM_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as AlarmConfig[];
        const now = Date.now();
        setAlarms(parsed.filter((a) => a.targetMs > now));
      }
    } catch {
      // 무시
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(ALARM_KEY, JSON.stringify(alarms));
    } catch {
      // 무시
    }
  }, [alarms]);

  // 저장한 위치(즐겨찾기·최근) 복원·저장
  useEffect(() => {
    try {
      const s = window.localStorage.getItem(SAVED_KEY);
      if (s) {
        const parsed = JSON.parse(s) as SavedLocation[];
        if (Array.isArray(parsed)) setSaved(parsed);
      }
    } catch {
      // 무시
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(SAVED_KEY, JSON.stringify(saved));
    } catch {
      // 무시
    }
  }, [saved]);

  // 활동별 기록 복원 (신규 키 없으면 기존 runlog에서 1회 마이그레이션) — 마운트 시 1회
  useEffect(() => {
    setActivityLog(loadLog());
    setGoals(loadGoals());
    setIsRecordRestored(true);
  }, []);

  // 활동별 마지막 위치 복원
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("running-alarm:activity-location:v1");
      if (raw) setActivityLocations(JSON.parse(raw));
    } catch {
      // 무시
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("running-alarm:activity-location:v1", JSON.stringify(activityLocations));
    } catch {
      // 무시
    }
  }, [activityLocations]);

  // 운동 일지 복원·저장
  useEffect(() => {
    setJournalState(loadJournal());
    setIsJournalRestored(true);
  }, []);

  useEffect(() => {
    if (!isJournalRestored) return;
    saveJournal(journal);
  }, [journal, isJournalRestored]);

  // 복원 완료 후에만 저장 (초기 빈 값이 기존 기록을 덮어쓰지 않게)
  useEffect(() => {
    if (!isRecordRestored) return;
    saveLog(activityLog);
  }, [activityLog, isRecordRestored]);

  useEffect(() => {
    if (!isRecordRestored) return;
    saveGoals(goals);
  }, [goals, isRecordRestored]);

  // 현재 선택 활동의 기록 Set
  const runSet = useMemo(() => new Set(activityLog[activity]), [activityLog, activity]);

  function toggleRunDay(dateStr: string) {
    setActivityLog((prev) => toggleDay(prev, activity, dateStr));
  }

  // 활동 선택 복원·저장
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(ACTIVITY_KEY);
      if (stored === "walk" || stored === "run" || stored === "dog" || stored === "hike" || stored === "bike") {
        setActivity(stored);
      }
    } catch {
      // 무시
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(ACTIVITY_KEY, activity);
    } catch {
      // 무시
    }
  }, [activity]);

  // 활동 전환 — 열린 시트를 닫고 즉시(재요청 없이) 재계산
  const changeActivity = useCallback(
    (next: ActivityKey) => {
      setSheetKey(null);
      setIsOutfitOpen(false);
      setInnerTab("today");
      setActivity(next);
      const remembered = activityLocations[next];
      if (remembered) setLocation(remembered);
    },
    [activityLocations]
  );

  // 원본 예보를 선택된 활동 프로필로 점수화 (활동 전환 시 이 줄만 다시 돈다)
  const forecast = useMemo(
    () => (rawForecast ? scoreForecast(rawForecast, ACTIVITIES[activity]) : null),
    [rawForecast, activity]
  );

  const profile = ACTIVITIES[activity];

  // 알림 예약 — 앱이 열려 있는 동안 지정 시각에 발동
  useEffect(() => {
    const now = Date.now();
    const timers = alarms.map((alarm) => {
      const fireAt = alarm.targetMs - alarm.leadMin * 60000;
      const delay = fireAt - now;
      if (delay <= 0 || delay > 24 * 3600 * 1000) return null;
      return window.setTimeout(() => {
        setFiredAlarm(alarm);
        if (alarm.popup && typeof Notification !== "undefined" && Notification.permission === "granted") {
          void showRunningNotification(alarm).catch(() => undefined);
        }
        setAlarms((prev) => prev.filter((a) => a.id !== alarm.id));
      }, delay);
    });
    return () => timers.forEach((t) => (t !== null ? window.clearTimeout(t) : undefined));
  }, [alarms]);

  const hasTomorrow = (forecast?.tomorrow.length ?? 0) > 0;
  const isTomorrow = dayMode === "tomorrow" && hasTomorrow;

  const view = useMemo(() => {
    if (!forecast || forecast.slots.length === 0) return null;
    const hour = nowHour >= 0 ? nowHour : new Date().getHours();

    // 추천 시각은 시간대(아침/낮/저녁) 카드와 항상 일치시킨다
    const pickBest = (parts: ReturnType<typeof getDayParts>, fallback: RunningSlot) => {
      const candidates = parts.filter((p) => !p.past && p.best).map((p) => p.best as RunningSlot);
      if (candidates.length === 0) return fallback;
      return candidates.reduce((a, b) => (b.totalScore > a.totalScore ? b : a));
    };

    if (isTomorrow) {
      const slots = forecast.tomorrow;
      const parts = getDayParts(slots, false, hour, activity);
      const best = pickBest(parts, bestOf(slots));
      const todayBest = bestOf(forecast.slots);
      return {
        slots,
        timeline: slots,
        best,
        reference: best,
        currentTime: null as string | null,
        delta: best.totalScore - todayBest.totalScore,
        deltaLabel: "오늘보다",
        parts,
        rankedWindows: getRankedWindows(slots, false, hour, activity)
      };
    }

    const slots = forecast.slots;
    const current = findCurrentSlot(slots);
    const parts = getDayParts(slots, true, hour, activity);
    const best = pickBest(parts, findBestRemainingSlot(slots));
    return {
      slots,
      timeline: [...slots, ...forecast.tomorrow], // 자정을 넘어 12시간을 이어보기 위한 연속 타임라인
      best,
      reference: current,
      currentTime: current.time,
      delta: compareWithYesterday(current, forecast.yesterday),
      deltaLabel: "어제보다",
      parts,
      rankedWindows: getRankedWindows(slots, true, hour, activity)
    };
  }, [forecast, isTomorrow, nowHour, activity]);

  const outfit = useMemo(() => (view ? getOutfit(view.reference, activity) : null), [view, activity]);
  const chips = useMemo(
    () => (view ? getConditionChips(isTomorrow ? view.best : view.reference).slice(0, 2) : []),
    [view, isTomorrow]
  );
  const oneLiner = useMemo(
    () => (view ? composeOneLiner(isTomorrow ? view.best : view.reference, isTomorrow, activity) : ""),
    [view, isTomorrow, activity]
  );

  // 애견산책 — 산책 신호등·추천 길이·발바닥·체크리스트 (현재/최적 기준)
  const dogPlan = useMemo(() => {
    if (activity !== "dog" || !view) return null;
    const ref = isTomorrow ? view.best : view.reference;
    return getDogPlan({
      score: ref.totalScore,
      hour: ref.hour,
      temperature: ref.temperature,
      apparentTemperature: ref.apparentTemperature,
      uvIndex: ref.uvIndex,
      precipitation: ref.precipitation,
      precipitationProbability: ref.precipitationProbability
    });
  }, [activity, view, isTomorrow]);

  // 등산 — 하산 마감·일출·안전 신호·조망·준비물 (내일 탭이면 내일 일출·일몰 사용)
  const hikePlan = useMemo(() => {
    if (activity !== "hike" || !view || !forecast) return null;
    const ref = isTomorrow ? view.best : view.reference;
    return getHikePlan({
      hour: ref.hour,
      temperature: ref.temperature,
      apparentTemperature: ref.apparentTemperature,
      humidity: ref.humidity,
      uvIndex: ref.uvIndex,
      windSpeed: ref.windSpeed,
      windGust: ref.windGust,
      precipitation: ref.precipitation,
      precipitationProbability: ref.precipitationProbability,
      weatherCode: ref.weatherCode,
      visibility: ref.visibility,
      cloudCover: ref.cloudCover,
      snowfall: ref.snowfall,
      pm25: ref.pm25,
      sunrise: isTomorrow ? forecast.sunriseTomorrow : forecast.sunrise,
      sunset: isTomorrow ? forecast.sunsetTomorrow : forecast.sunset
    });
  }, [activity, view, isTomorrow, forecast]);

  // 자전거 — 강풍 위험 안내
  const bikeWind = useMemo(() => {
    if (activity !== "bike" || !view) return null;
    const ref = isTomorrow ? view.best : view.reference;
    if (ref.windSpeed >= 11) return { level: "danger" as const, text: "강풍이에요. 자전거가 휘청일 수 있으니 다리·둑길을 조심하세요." };
    if (ref.windSpeed >= 7) return { level: "caution" as const, text: "바람이 조금 있어요. 맞바람 구간은 속도를 낮추세요." };
    return null;
  }, [activity, view, isTomorrow]);

  function rememberLocation(loc: LocationPoint, detail?: string) {
    setSaved((prev) => {
      const key = locKey(loc);
      const existing = prev.find((s) => locKey(s) === key);
      const rest = prev.filter((s) => locKey(s) !== key);
      const entry: SavedLocation = {
        ...loc,
        detail: detail ?? existing?.detail,
        fav: existing?.fav ?? false,
        ts: Date.now()
      };
      const next = [entry, ...rest];
      const favs = next.filter((s) => s.fav);
      const recents = next.filter((s) => !s.fav).slice(0, 5);
      return [...favs, ...recents];
    });
  }

  function toggleFav(target: SavedLocation) {
    setSaved((prev) => prev.map((s) => (locKey(s) === locKey(target) ? { ...s, fav: !s.fav } : s)));
  }

  function removeSaved(target: SavedLocation) {
    setSaved((prev) => prev.filter((s) => locKey(s) !== locKey(target)));
  }

  function chooseLocation(next: LocationPoint, detail?: string) {
    setLocation(next);
    rememberLocation(next, detail);
    setActivityLocations((prev) => ({ ...prev, [activity]: next }));
    setDayMode("today");
    setIsSearchOpen(false);
    setSearchResults([]);
    setSearchQuery("");
    setSearchNote("");
  }

  const favList = saved.filter((s) => s.fav).sort((a, b) => b.ts - a.ts);
  const recentList = saved
    .filter((s) => !s.fav)
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 3);
  const savedList = [...favList, ...recentList];

  async function runSearch(query: string) {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSearchNote("두 글자 이상 입력해 주세요.");
      return;
    }
    setIsSearching(true);
    setSearchNote("");
    try {
      const results = await fetchSearch(trimmed, activity === "hike");
      setSearchResults(results);
      setSearchNote(results.length === 0 ? "검색 결과가 없어요. 동/도로명/장소명을 확인해 주세요." : "");
    } catch {
      setSearchNote("검색에 실패했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsSearching(false);
    }
  }

  async function startLocate() {
    if (!navigator.geolocation) {
      setError("현재 브라우저에서 위치 감지를 지원하지 않아요.");
      return;
    }
    if (!window.isSecureContext) {
      setIsSearchOpen(false);
      setError("휴대폰 현재위치는 HTTPS 주소에서만 작동해요. HTTPS 터널/배포 주소로 접속해 주세요.");
      return;
    }

    setIsSearchOpen(false);
    setIsLocating(true);
    setLocationStep("checking");
    setError("");

    if ("permissions" in navigator) {
      const permission = await navigator.permissions.query({ name: "geolocation" }).catch(() => null);
      if (permission?.state === "denied") {
        setLocationStep("blocked");
        setError("위치 권한이 차단되어 있어요. 주소창 왼쪽 사이트 설정에서 위치를 허용해 주세요.");
        setIsLocating(false);
        return;
      }
    }

    setLocationStep("gps");
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        setLocationStep("address");
        const name = await fetchLocationName(latitude, longitude).catch(() => "현재 위치 근처");
        setLocationStep("weather");
        chooseLocation({ name, latitude, longitude, source: "gps" });
        setIsLocating(false);
        setLocationStep("idle");
      },
      (failure) => {
        setLocationStep(failure.code === failure.PERMISSION_DENIED ? "blocked" : "idle");
        setError(
          failure.code === failure.PERMISSION_DENIED
            ? "위치 권한이 거부됐어요. 주소창 왼쪽 사이트 설정에서 위치를 허용한 뒤 다시 눌러주세요."
            : "현재 위치를 찾지 못했어요. 검색이나 도시 선택으로도 점수를 볼 수 있어요."
        );
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 1000 * 60 * 10 }
    );
  }

  async function handleShare() {
    const score = view ? (isTomorrow ? view.best.totalScore : view.reference.totalScore) : null;
    const text =
      score !== null
        ? `오늘 ${location.name} ${profile.label} 점수 ${score}점 ${profile.emoji} — 러닝콜`
        : "러닝콜 — 걷기·애견산책·러닝·등산·자전거, 나가기 좋은 시간";
    const url = window.location.href;

    if (navigator.share) {
      try {
        await navigator.share({ title: "러닝콜", text, url });
      } catch {
        // 사용자가 공유를 취소한 경우
      }
      return;
    }

    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      setToast("링크를 복사했어요");
    } catch {
      setToast("공유를 지원하지 않는 브라우저예요");
    }
  }

  const canNotify = typeof window !== "undefined" && "Notification" in window;

  function openAlarm(part: { label: string; best: RunningSlot | null }) {
    if (!part.best) return;
    const targetMs = slotToMs(part.best.time);
    setAlarmTarget({
      id: part.best.time,
      label: `${part.label} ${profile.label}`,
      timeLabel: formatHour(part.best),
      targetMs
    });
  }

  // 랭킹 카드 탭 → 그 구간 시작 시각 기준 알림 설정
  function openWindowAlarm(startHour: number) {
    const slot = view?.slots.find((s) => s.hour === startHour);
    if (!slot) return;
    setAlarmTarget({
      id: slot.time,
      label: `추천 ${profile.label}`,
      timeLabel: formatHour(slot),
      targetMs: slotToMs(slot.time)
    });
  }

  async function saveAlarm(leadMin: number, popup: boolean) {
    if (!alarmTarget) return;
    if (popup && canNotify && Notification.permission !== "granted") {
      const result = await Notification.requestPermission().catch(() => "denied");
      if (result !== "granted") {
        popup = false;
        setToast("알림 권한이 없어 화면 알림만 울려요");
      }
    }
    const next: AlarmConfig = {
      id: alarmTarget.id,
      targetMs: alarmTarget.targetMs,
      label: `${alarmTarget.label} ${alarmTarget.timeLabel}`,
      timeLabel: alarmTarget.timeLabel,
      leadMin,
      popup
    };
    setAlarms((prev) => [...prev.filter((a) => a.id !== next.id), next]);
    // 앱이 닫혀 있어도 울리도록 백그라운드 예약(지원 기기) — 미지원이면 앱 열려있을 때 발동
    let background = false;
    if (popup) {
      background = await scheduleBackgroundAlarm(next);
    }
    setAlarmTarget(null);
    setToast(
      background
        ? "백그라운드 알림을 예약했어요"
        : leadMin === 0
        ? `${alarmTarget.timeLabel} 알림을 켰어요`
        : `${leadMin}분 전에 알려드릴게요`
    );
  }

  function removeAlarm() {
    if (!alarmTarget) return;
    const id = alarmTarget.id;
    setAlarms((prev) => prev.filter((a) => a.id !== id));
    void cancelBackgroundAlarm(id);
    setAlarmTarget(null);
    setToast("알림을 껐어요");
  }

  const reasonRows =
    view !== null
      ? [
          {
            key: "feel" as DetailKey,
            icon: <Thermometer size={19} />,
            label: "체감온도",
            value: view.reference.apparentTemperature.toFixed(1),
            unit: "°C",
            grade: gradeTemperature(view.reference.apparentTemperature),
            iconClass: "ci-blue"
          },
          {
            key: "precip" as DetailKey,
            icon: <CloudRain size={19} />,
            label: "강수",
            value:
              view.reference.precipitation >= 0.1
                ? view.reference.precipitation.toFixed(1)
                : `${Math.round(view.reference.precipitationProbability)}`,
            unit: view.reference.precipitation >= 0.1 ? "mm" : "%",
            grade: gradePrecipitation(view.reference.precipitation, view.reference.precipitationProbability),
            iconClass: "ci-teal"
          },
          {
            key: "dust" as DetailKey,
            icon: <Haze size={19} />,
            label: "미세먼지",
            value: view.reference.pm25.toFixed(0),
            unit: "㎍/m³",
            grade: gradePm25(view.reference.pm25),
            iconClass: "ci-green"
          },
          {
            key: "uv" as DetailKey,
            icon: <Sun size={19} />,
            label: "자외선",
            value: view.reference.uvIndex.toFixed(1),
            unit: "UVI",
            grade: gradeUv(view.reference.uvIndex),
            iconClass: "ci-amber"
          },
          {
            key: "wind" as DetailKey,
            icon: <Wind size={19} />,
            label: "바람",
            value: view.reference.windSpeed.toFixed(1),
            unit: "m/s",
            grade: gradeWind(view.reference.windSpeed),
            iconClass: "ci-sky"
          },
          {
            key: "humidity" as DetailKey,
            icon: <Droplets size={19} />,
            label: "습도",
            value: `${Math.round(view.reference.humidity)}`,
            unit: "%",
            grade: gradeHumidity(view.reference.humidity),
            iconClass: "ci-indigo"
          }
        ]
      : [];

  const locationStepText: Record<LocationStep, string> = {
    idle: "",
    checking: "권한 확인 중",
    gps: "GPS 잡는 중",
    address: "동네명 찾는 중",
    weather: "날씨 계산 중",
    blocked: "권한 차단됨"
  };

  const sunrise = forecast ? formatClock(forecast.sunrise) : null;
  const sunset = forecast ? formatClock(forecast.sunset) : null;

  // 아침·낮·저녁이 모두 지났고, 지금 이후 추천 구간도 없을 때만 안내
  const allDayPartsPast =
    !isTomorrow && view ? view.parts.every((part) => part.past) && view.rankedWindows.length === 0 : false;
  const ready = !isLoading && view;

  return (
    <main className="page">
      <div className="dashboard-frame">
        <ActivityRail
          activity={activity}
          onChange={changeActivity}
          variant="rail"
          onOpenJournal={() => setIsJournalOpen(true)}
        />

        <section className="app-shell">
          {/* 상단 바 — 메뉴 · 현재 위치 · 공유 · 위치 추가 */}
          <header className="top-header">
            <button className="icon-button" type="button" onClick={() => setIsMenuOpen(true)} aria-label="메뉴 열기">
              <Menu size={21} />
            </button>
            <button className="loc-center" type="button" onClick={() => setIsSearchOpen(true)} aria-label="위치 변경">
              <small>{location.source === "gps" ? "현재 위치" : "선택한 위치"}</small>
              <strong>
                {location.name}
                <ChevronDown size={15} className="loc-caret" />
              </strong>
            </button>
            <div className="top-actions">
              <button className="icon-button" type="button" onClick={handleShare} aria-label="공유하기">
                <Share2 size={19} />
              </button>
              <button className="icon-button" type="button" onClick={() => setIsSearchOpen(true)} aria-label="위치 추가">
                <Plus size={21} />
              </button>
            </div>
          </header>

          {/* 좌측 드로어 메뉴 */}
          {isMenuOpen ? (
            <div className="drawer-backdrop" role="dialog" aria-modal="true" aria-label="메뉴" onClick={() => setIsMenuOpen(false)}>
              <aside className="drawer" onClick={(event) => event.stopPropagation()}>
                <div className="drawer-head">
                  <div className="drawer-brand">
                    <strong>러닝콜</strong>
                    <small>걷기·애견산책·러닝·등산·자전거, 나가기 좋은 시간</small>
                  </div>
                  <button className="sheet-close" type="button" onClick={() => setIsMenuOpen(false)} aria-label="닫기">
                    <X size={18} />
                  </button>
                </div>
                <nav>
                  <p className="drawer-label">활동 선택</p>
                  <div className="drawer-acts">
                    {ACTIVITY_ORDER.map((key) => {
                      const item = ACTIVITIES[key];
                      const on = key === activity;
                      return (
                        <button
                          key={key}
                          type="button"
                          className={`drawer-act${on ? " on" : ""}`}
                          onClick={() => {
                            changeActivity(key);
                            setIsMenuOpen(false);
                          }}
                        >
                          <strong>
                            <span aria-hidden="true">{item.emoji}</span> {item.label}
                          </strong>
                          <small>{item.tagline}</small>
                        </button>
                      );
                    })}
                  </div>

                  <div className="drawer-sep" aria-hidden="true" />

                  <button
                    type="button"
                    className="drawer-item"
                    onClick={() => {
                      setIsMenuOpen(false);
                      setIsJournalOpen(true);
                    }}
                  >
                    <span className="di-emoji" aria-hidden="true">
                      📔
                    </span>
                    운동 일지 전체 보기
                    <ChevronRight size={17} className="di-arrow" />
                  </button>

                  <div className="drawer-sep" aria-hidden="true" />

                  {GUIDE_TOPICS.map((topic) => (
                    <button
                      key={topic.id}
                      type="button"
                      className="drawer-item"
                      onClick={() => {
                        setGuideTopic(topic);
                        setIsMenuOpen(false);
                      }}
                    >
                      <span className="di-emoji" aria-hidden="true">
                        {topic.emoji}
                      </span>
                      {topic.title}
                      <ChevronRight size={17} className="di-arrow" />
                    </button>
                  ))}

                  <div className="drawer-sep" aria-hidden="true" />

                  <button
                    type="button"
                    className="drawer-item"
                    onClick={() => {
                      setIsMenuOpen(false);
                      void handleShare();
                    }}
                  >
                    <span className="di-emoji" aria-hidden="true">
                      📤
                    </span>
                    친구에게 알려주기
                    <ChevronRight size={17} className="di-arrow" />
                  </button>
                  <a className="drawer-item" href="mailto:runner.pyrri@gmail.com?subject=%EB%9F%AC%EB%8B%9D%EC%BD%9C%20%EA%B0%9C%EC%84%A0%20%EC%A0%9C%EC%95%88">
                    <span className="di-emoji" aria-hidden="true">
                      💬
                    </span>
                    개선 제안 보내기
                    <ChevronRight size={17} className="di-arrow" />
                  </a>
                  <button
                    type="button"
                    className="drawer-item"
                    onClick={() => {
                      setIsMenuOpen(false);
                      void loadForecast(location);
                    }}
                  >
                    <span className="di-emoji" aria-hidden="true">
                      🔄
                    </span>
                    데이터 새로고침
                    <ChevronRight size={17} className="di-arrow" />
                  </button>
                </nav>
              </aside>
            </div>
          ) : null}

          {/* 위치 검색 모달 */}
          {isSearchOpen ? (
            <section className="location-modal" role="dialog" aria-modal="true" aria-label="위치 검색">
              <div className="location-dialog search-dialog">
                <button className="modal-close" type="button" onClick={() => setIsSearchOpen(false)} aria-label="닫기">
                  <X size={18} />
                </button>
                <h2>위치 검색</h2>
                <form
                  className="search-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void runSearch(searchQuery);
                  }}
                >
                  <Search size={18} />
                  <input
                    type="text"
                    inputMode="search"
                    autoFocus
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder={activity === "hike" ? "산 이름 검색 (예: 북한산)" : "동·도로명·장소 검색"}
                    aria-label="검색어"
                  />
                  <button type="submit" className="search-go">
                    검색
                  </button>
                </form>

                <button className="gps-inline" type="button" onClick={startLocate}>
                  <LocateFixed size={17} />
                  현재 위치 사용
                </button>

                {savedList.length > 0 ? (
                  <div className="saved-block">
                    <p className="quick-title">{favList.length > 0 ? "즐겨찾기 · 최근" : "최근 위치"}</p>
                    <div className="saved-list">
                      {savedList.map((loc) => (
                        <div className={`saved-row ${loc.fav ? "is-fav" : ""}`} key={locKey(loc)}>
                          <button
                            type="button"
                            className="saved-pick"
                            onClick={() => chooseLocation({ name: loc.name, latitude: loc.latitude, longitude: loc.longitude, source: loc.source }, loc.detail)}
                          >
                            <span className="saved-ic" aria-hidden="true">
                              {loc.source === "gps" ? "📍" : loc.fav ? "⭐" : "🕘"}
                            </span>
                            <span className="saved-name">
                              <strong>{loc.name}</strong>
                              {loc.detail ? <small>{loc.detail}</small> : null}
                            </span>
                          </button>
                          <button
                            type="button"
                            className={`saved-star ${loc.fav ? "on" : ""}`}
                            onClick={() => toggleFav(loc)}
                            aria-label={loc.fav ? "즐겨찾기 해제" : "즐겨찾기 추가"}
                          >
                            <Star size={17} fill={loc.fav ? "currentColor" : "none"} />
                          </button>
                          <button
                            type="button"
                            className="saved-del"
                            onClick={() => removeSaved(loc)}
                            aria-label="삭제"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {isSearching ? <p className="search-note">검색 중…</p> : null}
                {searchNote ? <p className="search-note">{searchNote}</p> : null}

                {searchResults.length > 0 ? (
                  <ul className="search-results">
                    {searchResults.map((result, index) => (
                      <li key={`${result.latitude}-${result.longitude}-${index}`}>
                        <button
                          type="button"
                          onClick={() =>
                            chooseLocation(
                              {
                                name: result.name,
                                latitude: result.latitude,
                                longitude: result.longitude,
                                source: "search"
                              },
                              result.detail
                            )
                          }
                        >
                          <strong>{result.name}</strong>
                          {result.detail ? <small>{result.detail}</small> : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <>
                    <p className="quick-title">주요 도시</p>
                    <div className="quick-cities">
                      {CITY_PRESETS.slice(0, 4).map((city) => (
                        <button
                          key={city.id}
                          type="button"
                          onClick={() =>
                            chooseLocation({
                              name: city.name,
                              latitude: city.latitude,
                              longitude: city.longitude,
                              source: "city"
                            })
                          }
                        >
                          {city.name}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </section>
          ) : null}

          {error && forecast ? <div className="notice">{error}</div> : null}
          {isLocating ? (
            <div className="locating-bar">
              <RefreshCw className="spin" size={16} />
              {locationStepText[locationStep]}
            </div>
          ) : null}

          {error && !forecast && !isLoading ? (
            <section className="error-panel">
              <AlertCircle size={30} />
              <p>{error}</p>
              <button className="primary-action" type="button" onClick={() => loadForecast(location)}>
                다시 시도
              </button>
            </section>
          ) : !ready || !view ? (
            <section className="loading-panel">
              <RefreshCw className="spin" size={28} />
              <p>{profile.label} 점수를 계산하고 있어요</p>
            </section>
          ) : (
            <>
              <ActivityRail activity={activity} onChange={changeActivity} variant="tabs" />

              <nav className="inner-tabs" aria-label="세부 보기">
                {([
                  ["today", "오늘 판단"],
                  ["prep", "준비"],
                  ["record", "기록"],
                  ["guide", "가이드"]
                ] as const).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    className={`inner-tab${innerTab === k ? " on" : ""}`}
                    aria-pressed={innerTab === k}
                    onClick={() => setInnerTab(k)}
                  >
                    {label}
                  </button>
                ))}
              </nav>

              {innerTab === "prep" && view ? (
                <PrepView slot={view.reference} slots={view.slots} activity={activity} />
              ) : null}

              {innerTab === "record" ? (
                <RecordView
                  activity={activity}
                  daySet={runSet}
                  goal={goals[activity]}
                  onToggle={toggleRunDay}
                  onSetGoal={(g) => setGoals((prev) => ({ ...prev, [activity]: g }))}
                />
              ) : null}

              {innerTab === "guide" ? <GuideView activity={activity} slot={view?.reference ?? null} /> : null}

              {innerTab === "today" ? (
                <>

              <div className="day-toggle" role="tablist" aria-label="날짜 선택">
                <button
                  type="button"
                  role="tab"
                  aria-selected={!isTomorrow}
                  className={`day-tab ${!isTomorrow ? "on" : ""}`}
                  onClick={() => setDayMode("today")}
                >
                  오늘
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={isTomorrow}
                  className={`day-tab ${isTomorrow ? "on" : ""}`}
                  onClick={() => setDayMode("tomorrow")}
                  disabled={!hasTomorrow}
                >
                  내일
                </button>
              </div>

              {/* 데스크탑 2단 대시보드 — 모바일은 display:contents로 1단 유지 */}
              <div className="content-cols">
                <div className="col-main">

              {/* HERO — 좌: 점수만 크게 / 우: 문구 + 이유 + 조건 2개 */}
              <section className="hero">
                <div className="hero-top">
                  <span className="hero-cond">
                    <Clock size={14} />
                    {isTomorrow
                      ? `내일 ${profile.label} 전망`
                      : nowClock
                      ? `${nowClock} 기준 · ${profile.label}`
                      : `지금 ${profile.label} 컨디션`}
                  </span>
                </div>
                <div className="gauge-row">
                  <div
                    className="gauge"
                    style={
                      {
                        "--p": isTomorrow ? view.best.totalScore : view.reference.totalScore,
                        "--ring": ringColor(isTomorrow ? view.best.totalScore : view.reference.totalScore)
                      } as React.CSSProperties
                    }
                  >
                    <div className="gauge-num">
                      {isTomorrow ? view.best.totalScore : view.reference.totalScore}
                      <span>점</span>
                    </div>
                  </div>
                  <div className="hero-copy">
                    <FitText
                      className="hero-h1"
                      text={heroHeadline(isTomorrow ? view.best : view.reference, activity)}
                      maxPx={29}
                      minPx={17}
                    />
                    <FitText
                      className="hero-why"
                      text={heroSubline(isTomorrow ? view.best : view.reference, activity)}
                      maxPx={17}
                      minPx={12}
                    />
                    <div className="status-chips">
                      {chips.map((chip) => (
                        <button
                          key={chip.key}
                          type="button"
                          className={`status-chip status-${chip.tone}`}
                          onClick={() => setSheetKey(chip.key === "temp" ? "feel" : chip.key)}
                        >
                          {chipIcon(chip)}
                          {chip.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              {/* 애견산책 전용 — 산책 신호등·추천 길이·발바닥·챙길 것 */}
              {dogPlan ? (
                <section className={`dog-plan dog-${dogPlan.signal}`} aria-label="산책 안내">
                  <div className="dog-signal">
                    <span className="dog-dot" aria-hidden="true" />
                    <strong>{dogPlan.signalText}</strong>
                    <span className="dog-length">{dogPlan.walkLength}</span>
                  </div>
                  <p className="dog-reason">{dogPlan.reason}</p>
                  {dogPlan.alternative ? <p className="dog-alt">💡 {dogPlan.alternative}</p> : null}
                  <div className={`dog-paw paw-${dogPlan.paw.level}`}>
                    <span aria-hidden="true">
                      {dogPlan.paw.level === "danger" ? "🚨" : dogPlan.paw.level === "caution" ? "⚠️" : "🐾"}
                    </span>
                    <div>
                      <b>{dogPlan.paw.title}</b>
                      <p>{dogPlan.paw.detail}</p>
                    </div>
                  </div>
                  <p className="dog-care">🧴 {dogPlan.careTip}</p>
                  <ul className="dog-check">
                    {dogPlan.checklist.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {/* 등산 전용 — 하산 마감·일출·안전 신호·조망·준비물 */}
              {hikePlan ? (
                <section className="hike-plan" aria-label="등산 안내">
                  {hikePlan.descentDeadline ? (
                    <div className="hike-descent">
                      <span aria-hidden="true">🌄</span>
                      <div>
                        <b>{hikePlan.sunsetText} · 하산 여유 확인</b>
                        <p>
                          {hikePlan.descentDeadline}. {hikePlan.summitNote}
                        </p>
                      </div>
                    </div>
                  ) : null}
                  {hikePlan.sunrisePlan ? <p className="hike-sunrise">🌅 {hikePlan.sunrisePlan}</p> : null}
                  {hikePlan.signals.length > 0 ? (
                    <ul className="hike-signals">
                      {hikePlan.signals.map((s) => (
                        <li key={s.text} className={`hs-${s.level}`}>
                          <span aria-hidden="true">{s.emoji}</span> {s.text}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <p className="hike-view">👁️ {hikePlan.view}</p>
                  <ul className="hike-check">
                    {hikePlan.checklist.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {/* 자전거 — 강풍 위험 안내 */}
              {bikeWind ? (
                <section className={`advisory advisory-${bikeWind.level}`} aria-label="바람 안내">
                  <span className="advisory-emoji" aria-hidden="true">
                    💨
                  </span>
                  <div className="advisory-body">
                    <strong>{bikeWind.level === "danger" ? "강풍 주의" : "바람 주의"}</strong>
                    <p>{bikeWind.text}</p>
                  </div>
                </section>
              ) : null}

              {/* 오늘/내일 추천 시간대 — 2시간 구간 1·2·3등 */}
              {view.rankedWindows.length > 0 ? (
                <section className="ranks" aria-label={`추천 ${profile.label} 시간대`}>
                  <div className="section-title ranks-title">
                    <b>
                      {isTomorrow ? "내일" : "오늘"} 추천 {profile.label} 시간대
                    </b>
                    <small>2시간 · 점수순</small>
                  </div>
                  <div className="rank-list">
                    {view.rankedWindows.map((win, index) => {
                      const isNow = !isTomorrow && win.startHour === nowHour;
                      const hasAlarm = view.slots.some(
                        (s) => s.hour === win.startHour && alarms.some((a) => a.id === s.time)
                      );
                      return (
                        <button
                          type="button"
                          className={`rank-card rank-${index + 1} ${isNow ? "is-now" : ""}`}
                          key={win.startHour}
                          onClick={() => openWindowAlarm(win.startHour)}
                        >
                          <span className="rank-badge">{index + 1}</span>
                          <div className="rank-body">
                            <p className="rank-time">
                              {fmtAmPm(win.startHour)} ~ {fmtAmPm(win.startHour + 2)}
                              {isNow ? <em className="rank-now">{profile.terms.nowTag}</em> : null}
                              {hasAlarm ? <BellRing size={14} className="rank-bell" /> : null}
                            </p>
                            <div className="rank-metrics">
                              <span>🌡️ 체감 {win.feel}°</span>
                              <span>{precipEmoji(win.precipProb)} 강수 {win.precipProb}%</span>
                              <span>{dustEmoji(win.dustLabel)} 미세 {win.dustLabel}</span>
                              <span>{windEmoji(win.windLabel)} 바람 {win.windLabel}</span>
                            </div>
                          </div>
                          <span className="rank-score" style={{ color: ringColor(win.score) }}>
                            {win.score}
                            <small>점</small>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ) : (
                <section className="rec-card rec-empty">
                  <p className="rec-eyebrow">{isTomorrow ? `내일 ${profile.label} 전망` : "오늘 추천 시간대"}</p>
                  <p className="rec-none">
                    {isTomorrow
                      ? "내일은 딱 추천할 만한 시간대가 없어요."
                      : `오늘 ${profile.label} 좋은 시간대는 이미 지나갔어요.`}
                  </p>
                  {!isTomorrow && hasTomorrow ? (
                    <button type="button" className="rec-tomorrow" onClick={() => setDayMode("tomorrow")}>
                      내일 시간대 보기 <ChevronRight size={16} />
                    </button>
                  ) : null}
                </section>
              )}

                </div>
                <div className="col-side">

              {/* 일출 · 일몰 — 밝은 시간대 판단용 */}
              {sunrise && sunset ? (
                <div className="sun-cards" aria-label="일출과 일몰">
                  <div className="sun-card sun-rise">
                    <span className="sun-ic" aria-hidden="true">
                      🌅
                    </span>
                    <div>
                      <small>일출</small>
                      <strong>{sunrise}</strong>
                    </div>
                  </div>
                  <div className="sun-card sun-set">
                    <span className="sun-ic" aria-hidden="true">
                      🌇
                    </span>
                    <div>
                      <small>일몰</small>
                      <strong>{sunset}</strong>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* 아침·낮·저녁 각 구간에서 가장 뛰기 좋은 시각 (탭 → 알림) */}
              <section className="dayparts" aria-label="아침 낮 저녁 베스트 시각">
                <div className="section-title ranks-title">
                  <b>{view.parts.map((p) => p.label).join("·")} 베스트</b>
                  <small>탭하면 알림 설정</small>
                </div>
                <div className={`dayparts-grid cols-${view.parts.length}`}>
                  {view.parts.map((part) => {
                    const isBest = !part.past && part.best && part.best.time === view.best.time;
                    const blocked = !part.past && !part.best;
                    const hasAlarm = part.best ? alarms.some((a) => a.id === part.best!.time) : false;
                    const clickable = !!part.best && !part.past;
                    return (
                      <button
                        key={part.key}
                        type="button"
                        disabled={!clickable}
                        onClick={() => openAlarm(part)}
                        className={`daypart ${part.past ? "is-past" : ""} ${isBest ? "is-best" : ""} ${
                          blocked ? "is-blocked" : ""
                        }`}
                      >
                        {hasAlarm ? <BellRing size={14} className="dp-bell" /> : null}
                        <span className="dp-label">{part.label}</span>
                        {part.past ? (
                          <span className="dp-score dp-none">지난 시간</span>
                        ) : part.best ? (
                          <>
                            <strong className="dp-time">{formatHour(part.best)}</strong>
                            <span className="dp-score" style={{ color: ringColor(part.best.totalScore) }}>
                              {part.rainy ? `${profile.terms.rainyTag} ${part.best.totalScore}점` : `${part.best.totalScore}점`}
                            </span>
                          </>
                        ) : (
                          <span className="dp-score dp-blocked">{profile.terms.blockedTag}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {allDayPartsPast ? (
                  <p className="dayparts-done">오늘 추천 시간은 모두 지났어요. 내일 컨디션을 확인해볼까요?</p>
                ) : null}
              </section>

              {/* 복장 */}
              <button type="button" className="outfit-chip" onClick={() => setIsOutfitOpen(true)}>
                <span className="ci ci-green">
                  <Shirt size={19} />
                </span>
                <div className="outfit-text">
                  <small>{profile.terms.outfitTitle} · 눌러서 자세히</small>
                  <strong>
                    {outfit?.main ?? "-"}
                    {outfit && outfit.extras.length > 0 ? ` · ${outfit.extras.join(" · ")}` : ""}
                  </strong>
                </div>
                <ChevronRight size={20} className="chip-arrow" />
              </button>

              {/* 오늘의 한마디 */}
              <section className="oneliner">
                <div className="oneliner-head">
                  <span>
                    <Sparkles size={15} /> 오늘의 한마디
                  </span>
                </div>
                <p>{oneLiner}</p>
              </section>

              {/* 항목별 상태 (2개씩 한 줄) */}
              <section className="reasons" aria-label="항목별 상태">
                {reasonRows.map((row) => (
                  <button className="rc" key={row.label} type="button" onClick={() => setSheetKey(row.key)}>
                    <div className="rc-top">
                      <span className={`ci ${row.iconClass}`}>{row.icon}</span>
                      <span className={toneBadge(row.grade)}>{row.grade.label}</span>
                    </div>
                    <p className="rc-label">{row.label}</p>
                    <p className="rc-value">
                      {row.value}
                      <span>{row.unit}</span>
                    </p>
                  </button>
                ))}
              </section>

              <AdSlot />

                </div>
              </div>
                </>
              ) : null}
            </>
          )}
        </section>
      </div>

      {toast ? <div className="toast">{toast}</div> : null}

      {sheetKey && view ? (
        <MetricSheet
          sheetKey={sheetKey}
          reference={view.reference}
          slots={view.timeline}
          currentTime={view.currentTime}
          activity={activity}
          onClose={() => setSheetKey(null)}
        />
      ) : null}

      {isOutfitOpen && view ? (
        <OutfitSheet slot={view.reference} slots={view.slots} activity={activity} onClose={() => setIsOutfitOpen(false)} />
      ) : null}

      {guideTopic ? <GuideSheet topic={guideTopic} onClose={() => setGuideTopic(null)} /> : null}

      {isJournalOpen ? (
        <JournalView
          journal={journal}
          ym={journalYm}
          onShiftMonth={(delta) => {
            const d = new Date(journalYm.y, journalYm.m + delta, 1);
            setJournalYm({ y: d.getFullYear(), m: d.getMonth() });
          }}
          selectedDate={journalSelectedDate}
          onSelectDate={setJournalSelectedDate}
          onSaveEntry={(date, entry) => setJournalState((prev) => setEntry(prev, date, entry))}
          onDeleteEntry={(date) => setJournalState((prev) => deleteEntry(prev, date))}
          onClose={() => {
            setIsJournalOpen(false);
            setJournalSelectedDate(null);
          }}
        />
      ) : null}

      {alarmTarget ? (
        <AlarmSheet
          target={alarmTarget}
          existing={alarms.find((a) => a.id === alarmTarget.id) ?? null}
          canNotify={canNotify}
          onSave={saveAlarm}
          onRemove={removeAlarm}
          onClose={() => setAlarmTarget(null)}
        />
      ) : null}

      {firedAlarm ? (
        <div className="alarm-fire" role="alertdialog" aria-label="알림">
          <div className="alarm-fire-card">
            <BellRing size={30} />
            <strong>{firedAlarm.timeLabel} 나가기 좋은 시간이에요!</strong>
            <p>지금 나가면 딱 좋아요. 준비하고 천천히 출발해볼까요?</p>
            <button type="button" className="primary-action" onClick={() => setFiredAlarm(null)}>
              확인
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
