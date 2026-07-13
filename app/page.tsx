"use client";

// 야외봄 메인 화면 — 점수 히어로, 시간대 추천, 야외활동 정보 드로어
import {
  AlertCircle,
  Backpack,
  BellRing,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  CloudRain,
  Database,
  Code2,
  Droplets,
  ExternalLink,
  FileText,
  Haze,
  House,
  LocateFixed,
  Mail,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Sun,
  Thermometer,
  Wind,
  X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DEFAULT_CITY } from "@/lib/cities";
import { ActivityPictogram } from "@/lib/pictograms";
import { getOutfitPlan, getPackingPlan, type ActivityDuration, type PackingCategory } from "@/lib/outfit";
import {
  buildActivityDaySummary,
  fmtAmPm,
  formatHourNum,
  formatTwoHourWindow,
  getDayParts,
  getMetricDetail,
  getRankedWindows,
  heroHeadline,
  isUnsafeOutdoorSlot,
  type MetricKey as DetailKey,
  type RankedWindow
} from "@/lib/insights";
import {
  compareWithYesterday,
  findBestRemainingSlot,
  findCurrentSlot,
  formatLocalClock,
  hourInTimezone,
  scoreForecast,
  zonedDateTimeToMs,
  type LocationPoint,
  type RawForecast
} from "@/lib/weather";
import { buildLocationDisplay, readReverseLocation, type ReverseLocationResponse } from "@/lib/location-display";
import { ActivityDaySummaryCard } from "@/components/ActivityDaySummary";
import { LocationBar } from "@/components/LocationControls";
import { PrecipitationSheet } from "@/components/PrecipitationSheet";
import { RecommendationList } from "@/components/RecommendationList";
import { ACTIVITIES, ACTIVITY_ORDER, type ActivityKey } from "@/lib/activity";
import { getDynamicGuideBlock } from "@/lib/activity-guide";
import { forecastCacheAgeLabel, readForecastCache, saveForecastCache } from "@/lib/forecast-cache";
import { FamilyWordmark } from "./family-wordmark";
import { APP_BASE_PATH, apiPath, publicPath } from "@/lib/public-path";
import packageInfo from "../package.json";

// 활동 내부 탭 (판단 / 준비 / 가이드)
import {
  gradeHumidity,
  gradePm25,
  gradePrecipitation,
  gradeTemperature,
  gradeUv,
  gradeWind,
  scoreTone,
  type RunningSlot
} from "@/lib/scoring";

type LocationStep = "idle" | "checking" | "gps" | "address" | "weather" | "blocked";
type DayMode = "today" | "tomorrow";
type MainTab = "today" | "time" | "prep" | "settings";
type SearchResult = { name: string; detail: string; latitude: number; longitude: number };
type GoNowDecision = { tone: "good" | "normal" | "caution" | "bad"; title: string; detail: string };

const STORAGE_KEY = "running-alarm:location";
const ACTIVITY_LOCATION_KEY = "running-alarm:activity-location:v1";
const ACTIVITY_DURATION_KEY = "outbom:activity-duration:v1";
const BUILD_SHA = process.env.NEXT_PUBLIC_BUILD_SHA || "local";
const PWA_CACHE = `outbom-v${packageInfo.version}`;

const DEFAULT_LOCATION: LocationPoint = {
  name: DEFAULT_CITY.name,
  latitude: DEFAULT_CITY.latitude,
  longitude: DEFAULT_CITY.longitude,
  source: "city"
};

// 현재 시각의 예보를 점수와 별개로 짧게 설명해, 바로 출발해도 되는지 먼저 판단하게 한다.
function getGoNowDecision(slot: RunningSlot, profile: (typeof ACTIVITIES)[ActivityKey]): GoNowDecision {
  if (isUnsafeOutdoorSlot(slot, profile.key)) {
    if ((slot.weatherCode ?? 0) >= 95) {
      return { tone: "bad", title: "낙뢰 예보라 오늘은 미루세요", detail: "낙뢰는 장비로 상쇄할 수 없어요. 실내 활동이나 다음 안전 시간대를 선택하세요." };
    }
    if ((slot.windGust ?? slot.windSpeed) >= 14) {
      return { tone: "bad", title: "돌풍이 강해 지금은 미루세요", detail: "균형과 시야가 흔들릴 수 있어요. 바람이 잦아든 뒤 다시 확인하세요." };
    }
    if (slot.apparentTemperature >= 38) {
      return { tone: "bad", title: "위험한 더위라 지금은 쉬세요", detail: "그늘과 수분을 먼저 확보하고, 훨씬 선선한 시간으로 미루세요." };
    }
    return { tone: "bad", title: "공기 상태가 나빠 지금은 미루세요", detail: "장비보다 활동 시간과 강도를 줄이는 것이 우선이에요." };
  }
  const rainProbability = slot.precipitationProbability;
  if (slot.precipitation >= 0.5 || (rainProbability !== null && rainProbability >= 70)) {
    return { tone: "bad", title: "비 때문에 지금은 미루세요", detail: "노면과 시야가 불편할 수 있어요. 비가 약해진 뒤 출발하세요." };
  }
  if (slot.precipitation >= 0.2 || (rainProbability !== null && rainProbability >= 40)) {
    return { tone: "caution", title: "비를 보고 짧게만 나가세요", detail: "우산·방수 준비를 하고 가까운 코스로만 다녀오세요." };
  }
  if (slot.pm25 !== null && slot.pm25 > 75) {
    return { tone: "bad", title: "공기 때문에 지금은 쉬어가세요", detail: "미세먼지가 매우 나빠요. 실내 운동이 더 나아요." };
  }
  if (slot.pm25 !== null && slot.pm25 > 35) {
    return { tone: "caution", title: "공기를 보고 가볍게만", detail: "미세먼지가 나쁜 편이에요. 짧은 코스로 줄여 보세요." };
  }
  if (slot.apparentTemperature >= profile.heat.hot2) {
    return { tone: "bad", title: "더위 때문에 지금은 미루세요", detail: "체감온도가 높아요. 해가 진 뒤가 더 안전해요." };
  }
  if (slot.apparentTemperature >= profile.heat.hot1 || slot.windSpeed >= profile.windCap.speed) {
    return { tone: "caution", title: "지금은 짧고 가볍게", detail: "더위나 바람이 부담될 수 있어요. 페이스를 낮춰 보세요." };
  }
  if (slot.totalScore >= 72) {
    return { tone: "good", title: "지금 바로 출발해도 좋아요", detail: "비·공기·체감온도가 무난해요. 평소 코스로 가도 좋아요." };
  }
  return { tone: "normal", title: "지금은 가볍게 출발하세요", detail: "무리한 기록보다 짧은 코스로 컨디션을 확인해 보세요." };
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
  { key: "precip", label: "강수", unit: "mm", read: (s) => s.precipitation, score: (s) => s.precipitationScore },
  // 대기질 결측은 0으로 위장하지 않고 NaN으로 전달해 요약·최고·최저 계산에서 제외한다.
  { key: "dust", label: "미세먼지", unit: "㎍", read: (s) => s.pm25 ?? Number.NaN, score: (s) => s.dustScore ?? Number.NaN },
  { key: "uv", label: "자외선", unit: "", read: (s) => s.uvIndex, score: (s) => s.uvScore },
  { key: "wind", label: "바람", unit: "㎧", read: (s) => s.windSpeed, score: (s) => s.windScore },
  { key: "humidity", label: "습도", unit: "%", read: (s) => s.humidity, score: (s) => s.humidityScore }
];

const ALARM_KEY = "running-alarm:alarms";
const SAVED_KEY = "running-alarm:saved";
const ACTIVITY_KEY = "running-alarm:activity";
const QUICK_NEIGHBORHOODS = ["성수동", "강남역", "연남동", "서초동"];
const QUICK_MOUNTAINS = ["북한산", "관악산", "한라산", "설악산"];

type SavedLocationTag = "home" | "work";
type LocationShelf = SavedLocationTag | "fav" | "recent";
type SavedLocation = LocationPoint & { detail?: string; fav: boolean; ts: number; tag?: SavedLocationTag };

function locKey(l: { latitude: number; longitude: number }) {
  return `${l.latitude.toFixed(3)},${l.longitude.toFixed(3)}`;
}

function displayLocationName(name: string, detail = "") {
  return buildLocationDisplay(name, detail).title;
}

// 저장 목록·검색 결과가 쓰는 축약 표시 — 정본 규칙은 lib/location-display에 있다.
function locationDisplay(name: string, detail = "") {
  const display = buildLocationDisplay(name, detail);
  return { title: display.title, subtitle: display.region };
}

type AlarmConfig = { id: string; targetMs: number; label: string; timeLabel: string; leadMin: number; popup: boolean };

const LEAD_OPTIONS: Array<{ min: number; label: string }> = [
  { min: 0, label: "정각" },
  { min: 10, label: "10분 전" },
  { min: 20, label: "20분 전" },
  { min: 30, label: "30분 전" },
  { min: 60, label: "1시간 전" }
];

// Open-Meteo의 timezone 없는 현지 시각을 예보 지역 기준 타임스탬프로 바꾼다.
function slotToMs(time: string, timezone: string) {
  const ms = zonedDateTimeToMs(time, timezone);
  return Number.isNaN(ms) ? 0 : ms;
}

async function getNotificationRegistration() {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return (
      (await navigator.serviceWorker.getRegistration(`${APP_BASE_PATH || ""}/`)) ??
      (await navigator.serviceWorker.register(publicPath("/sw.js")))
    );
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
      icon: publicPath("/icons/icon-192.png"),
      badge: publicPath("/icons/icon-192.png"),
      data: { url: `${APP_BASE_PATH || ""}/` }
    } as NotificationOptions;
    await registration.showNotification("야외봄", options);
    return;
  }
  new Notification("야외봄", { body, icon: publicPath("/icons/icon-192.png") });
}

async function fetchAppForecast(location: LocationPoint) {
  const params = new URLSearchParams({
    name: location.name,
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    source: location.source
  });
  const response = await fetch(apiPath(`/api/forecast?${params.toString()}`), {
    cache: "no-store",
    headers: { Accept: "application/json" }
  });
  if (!response.ok) throw new Error("Forecast unavailable");
  return (await response.json()) as RawForecast;
}

async function fetchLocationName(latitude: number, longitude: number) {
  const params = new URLSearchParams({ latitude: String(latitude), longitude: String(longitude) });
  const response = await fetch(apiPath(`/api/reverse-location?${params.toString()}`), { cache: "no-store" });
  if (!response.ok) return { name: "내 위치", detail: undefined };
  const data = (await response.json()) as ReverseLocationResponse;
  return readReverseLocation(data);
}

async function fetchSearch(query: string, mountainFirst = false) {
  const response = await fetch(apiPath(`/api/search-location?query=${encodeURIComponent(query)}${mountainFirst ? "&mountain=1" : ""}`), {
    cache: "no-store"
  });
  if (response.status === 503) throw new Error("LOCATION_SEARCH_NOT_CONFIGURED");
  const data = (await response.json().catch(() => ({}))) as { results?: SearchResult[]; error?: string };
  // 502(카카오 장애)나 error 필드는 "결과 없음"과 구분해 일시 오류로 처리한다.
  if (!response.ok || data.error) throw new Error("LOCATION_SEARCH_UNSTABLE");
  return data.results ?? [];
}

function formatForecastMoment(time: string, tomorrow: boolean) {
  const hour = Number(time.match(/T(\d{2}):/)?.[1]);
  return `${tomorrow ? "내일" : "오늘"} · ${Number.isFinite(hour) ? fmtAmPm(hour) : "시각 확인"} 예보`;
}

function scoreLabel(score: number) {
  return {
    excellent: "매우 좋음",
    good: "좋음",
    fair: "보통",
    caution: "주의",
    bad: "나쁨"
  }[scoreTone(score)];
}

function formatHour(slot: RunningSlot) {
  return `${String(slot.hour).padStart(2, "0")}:00`;
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
  const daySlots = slots.filter((slot) => slot.time.slice(0, 10) === reference.time.slice(0, 10));
  const sheetSlots = daySlots.length > 0 ? daySlots : slots;
  const chart = windowSlots(sheetSlots, currentTime);

  // 그래프에서 선택한 시각 (기본 = 지금). 탭하면 그 시각 값·등급·바가 바뀜.
  const defaultSel = currentTime ?? chart[0]?.time ?? reference.time;
  const [selTime, setSelTime] = useState(defaultSel);
  const selSlot = chart.find((s) => s.time === selTime) ?? reference;
  const isNowSel = currentTime != null && selTime === currentTime;
  const detail = getMetricDetail(sheetKey, selSlot, activity);
  const metricSummary = summarizeMetric(chart, metric, activity);

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

        <div className="metric-brief" aria-label={`${detail.title} 요약`}>
          {metricSummary.map((item) => (
            <div className="metric-brief-card" key={item.label}>
              <span>{item.label}</span>
              <b>{item.value}</b>
              <small>{item.note}</small>
            </div>
          ))}
        </div>

        <MetricPeriodPanel
          slots={chart}
          metric={metric}
          activity={activity}
          selectedTime={selTime}
          onSelectTime={setSelTime}
          dayLabel={currentTime ? "오늘" : "내일"}
        />
      </div>
    </div>
  );
}

// 복장 플랜 본문 — OutfitSheet(모달)과 준비 탭(인라인)에서 공유
// 준비 탭 — 복장 상세 + 활동별 준비/주의 콘텐츠
function PrepView({
  slot,
  slots,
  activity,
  packedIds,
  onTogglePacked,
  duration,
  onDurationChange
}: {
  slot: RunningSlot;
  slots: RunningSlot[];
  activity: ActivityKey;
  packedIds: string[];
  onTogglePacked: (id: string) => void;
  duration: ActivityDuration;
  onDurationChange: (duration: ActivityDuration) => void;
}) {
  const plan = getOutfitPlan(slots, slot, activity);
  const packing = getPackingPlan(slot, activity, duration);
  const keyBlock = getDynamicGuideBlock(activity, slot);
  const keyItems = keyBlock?.items.slice(0, 2) ?? [];
  const categoryLabels: Record<PackingCategory, { title: string; note: string }> = {
    required: { title: "필수", note: "활동 자체에 꼭 필요한 준비" },
    weather: { title: "날씨", note: "추천 시간의 기온·비·햇빛 기준" },
    safety: { title: "안전", note: "시야·연락·노면 위험 대비" },
    optional: { title: "선택", note: "거리와 개인 상황에 따라 추가" }
  };
  const categories: PackingCategory[] = ["required", "weather", "safety", "optional"];
  const safetyWarning =
    activity === "bike" && (slot.precipitation >= 0.5 || (slot.precipitationProbability ?? 0) >= 60)
      ? { title: "비 오는 라이딩은 미루는 편이 안전해요", detail: "방수 재킷·라이트를 챙겨도 젖은 노면의 제동거리와 시야 위험은 사라지지 않아요." }
      : activity === "hike" && (slot.weatherCode === 95 || slot.weatherCode === 96 || slot.weatherCode === 99 || slot.windSpeed >= 12)
        ? { title: "위험 예보라 산행은 미루세요", detail: "낙뢰·강풍은 장비로 상쇄할 수 없어요. 다음 안전 시간대를 확인하세요." }
        : null;

  return (
    <section className="prep-view prep-lite" aria-label={`${ACTIVITIES[activity].terms.outfitTitle}`}>
      <div className="prep-lite-head">
        <span>
          <Backpack size={18} />
          출발 전 준비
        </span>
        <b>{plan.main}</b>
        <small>
          지금 추천 시간 체감 {plan.feels.toFixed(0)}°에 맞춘 최소 준비예요.
        </small>
      </div>

      <fieldset className="prep-duration">
        <legend>활동 시간</legend>
        {(["short", "normal", "long"] as ActivityDuration[]).map((value) => (
          <button key={value} type="button" className={duration === value ? "on" : ""} aria-pressed={duration === value} onClick={() => onDurationChange(value)}>
            {value === "short" ? "짧게" : value === "normal" ? "보통" : "길게"}
          </button>
        ))}
      </fieldset>

      {safetyWarning || keyItems.length > 0 ? (
        <div className={`prep-lite-alert${safetyWarning ? " tone-bad" : ""}`} role="note">
          <strong>{safetyWarning?.title ?? keyBlock?.heading ?? "오늘 체크"}</strong>
          {safetyWarning ? <span>{safetyWarning.detail}</span> : keyItems.map((item) => <span key={item}>{item}</span>)}
        </div>
      ) : null}

      <div className="prep-all-groups" aria-label="출발 전 전체 체크리스트">
        {categories.map((category) => {
          const items = packing.items.filter((item) => item.category === category);
          if (items.length === 0) return null;
          const checkedCount = items.filter((item) => packedIds.includes(item.id)).length;
          return (
            <section className={`prep-pack prep-pack-${category}`} key={category} aria-label={`${categoryLabels[category].title} 준비물`}>
              <div className="prep-pack-head"><div><strong>{categoryLabels[category].title}</strong><small>{categoryLabels[category].note} · {checkedCount}/{items.length}</small></div></div>
              <div className="prep-pack-list">
                {items.map((item) => {
                  const checked = packedIds.includes(item.id);
                  return (
                    <label className={`prep-pack-item${checked ? " is-packed" : ""}`} key={item.id}>
                      <input type="checkbox" checked={checked} onChange={() => onTogglePacked(item.id)} />
                      <span className="prep-pack-check" aria-hidden="true">{checked ? "✓" : ""}</span>
                      <span className="prep-pack-copy"><b>{item.emoji} {item.label}</b><small>{item.detail} · {item.reason}</small></span>
                    </label>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}

// 활동별 실전 준비·가이드 블록 렌더
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
            : "알림은 이 앱 화면이 열려 있을 때 동작해요. 앱을 닫거나 기기가 절전 상태면 울리지 않을 수 있어요."}
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
  if (!side) return null;
  return <aside className={`side-ad side-ad-${side}`} aria-label="광고 자리, 현재 비활성"><span>광고</span><strong>사이드 배너 준비 중</strong></aside>;
}

function contactHref(kind: "일반 문의" | "광고·제휴 문의") {
  const subject = `[야외봄] ${kind} · v${packageInfo.version}`;
  return `mailto:hello.robom@gmail.com?subject=${encodeURIComponent(subject)}`;
}

// 폰 설정 딥링크(웹 최선책): Android Chrome 계열은 intent: URI로 일부 시스템 설정을 열 수 있다.
// 화면이 전환되지 않으면(비Android·미지원) 기기별 안내 문구로 폴백한다.
function openAndroidSetting(action: string, onFallback: () => void) {
  if (!/android/i.test(navigator.userAgent)) {
    onFallback();
    return;
  }
  const timer = window.setTimeout(onFallback, 1600);
  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.hidden) window.clearTimeout(timer);
    },
    { once: true }
  );
  window.location.href = `intent:#Intent;action=${action};end`;
}

function SettingsCardHead({ icon, title, id }: { icon: ReactNode; title: string; id: string }) {
  return (
    <div className="settings-card-head">
      <span className="settings-chip" aria-hidden="true">{icon}</span>
      <h3 id={id}>{title}</h3>
    </div>
  );
}

function SettingsDeepLinks() {
  const [guide, setGuide] = useState<string | null>(null);
  return (
    <>
      <div className="settings-deeplinks">
        <button
          type="button"
          className="ghost-action"
          onClick={() =>
            openAndroidSetting("android.settings.APP_NOTIFICATION_SETTINGS", () =>
              setGuide("폰 설정 → 애플리케이션 → 사용 중인 브라우저(또는 야외봄) → 알림에서 허용으로 바꿔주세요.")
            )
          }
        >
          폰 알림 설정 열기
        </button>
        <button
          type="button"
          className="ghost-action"
          onClick={() =>
            openAndroidSetting("android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS", () =>
              setGuide("폰 설정 → 배터리 → 배터리 최적화(앱 절전)에서 사용 중인 브라우저를 예외로 지정하면 알림 지연이 줄어요.")
            )
          }
        >
          배터리 예외 설정 열기
        </button>
      </div>
      {guide ? <p className="settings-note settings-guide" role="status">{guide}</p> : null}
    </>
  );
}

function SettingsView() {
  const familyApps = [
    { name: "청약봄", description: "청약 공고와 마감 알림", href: "https://robom.kr/apps/homebom", status: "웹으로 이용" },
    { name: "러닝봄", description: "러닝 대회 접수 알림", href: "https://robom.kr/apps/runningbom", status: "웹으로 이용" }
  ];

  return (
    <div className="family-settings" aria-label="설정과 앱 정보">
      <section className="settings-card" aria-labelledby="about-outbom-title">
        <SettingsCardHead icon={<Sun size={16} strokeWidth={1.9} />} title="야외봄은" id="about-outbom-title" />
        <p className="settings-note">
          날씨와 대기질로 걷기·러닝·자전거·등산·애견산책하기 좋은 시간을 알려주는 앱입니다.
          오늘·내일 예보를 활동별 점수로 정리하고, 좋은 시간대와 준비물을 함께 챙겨드려요.
        </p>
      </section>

      <section className="settings-card" aria-labelledby="perm-outbom-title">
        <SettingsCardHead icon={<BellRing size={16} strokeWidth={1.9} />} title="알림과 위치" id="perm-outbom-title" />
        <p className="settings-note">
          알림은 야외봄 화면이 열려 있을 때 동작해요. 앱을 닫거나 기기가 절전 상태면 울리지
          않을 수 있어요.
        </p>
        <p className="settings-note">
          현재 위치는 위치 이름 확인과 날씨 조회에만 쓰이고 별도로 저장하지 않아요. 위치 권한은
          브라우저 사이트 설정에서 언제든 바꿀 수 있어요.
        </p>
        <SettingsDeepLinks />
      </section>

      <section className="settings-card" aria-labelledby="family-apps-title">
        <SettingsCardHead icon={<House size={16} strokeWidth={1.9} />} title="다른 로봄 앱" id="family-apps-title" />
        {familyApps.map((app) => (
          <a className="settings-row family-app-row" href={app.href} target="_blank" rel="noopener noreferrer" key={app.name}>
            <span className="settings-row-icon" aria-hidden="true"><House size={20} /></span>
            <span><strong>{app.name}</strong><small>{app.description}</small></span>
            <em>{app.status}</em>
            <ExternalLink size={18} aria-hidden="true" />
          </a>
        ))}
        <a className="settings-row" href="https://robom.kr">
          <span className="settings-row-icon" aria-hidden="true"><ExternalLink size={20} /></span>
          <span><strong>로봄 홈페이지</strong><small>robom.kr</small></span>
          <ChevronRight size={19} aria-hidden="true" />
        </a>
      </section>

      <section className="settings-card" aria-labelledby="contact-title">
        <SettingsCardHead icon={<Mail size={16} strokeWidth={1.9} />} title="문의" id="contact-title" />
        <a className="settings-row" href={contactHref("일반 문의")}>
          <span className="settings-row-icon" aria-hidden="true"><Mail size={20} /></span>
          <span><strong>일반 문의</strong><small>hello.robom@gmail.com</small></span>
          <ChevronRight size={19} aria-hidden="true" />
        </a>
        <a className="settings-row" href={contactHref("광고·제휴 문의")}>
          <span className="settings-row-icon" aria-hidden="true"><Sparkles size={20} /></span>
          <span><strong>광고·제휴 문의</strong><small>앱명·용도·버전이 제목에 포함돼요.</small></span>
          <ChevronRight size={19} aria-hidden="true" />
        </a>
      </section>

      <section className="settings-card" aria-labelledby="source-title">
        <SettingsCardHead icon={<Database size={16} strokeWidth={1.9} />} title="데이터 출처" id="source-title" />
        <p className="settings-note">
          날씨·대기질은 Open-Meteo, 위치 검색은 Kakao Local, 지도 데이터는 OpenStreetMap
          기여자들의 자료를 사용합니다. 예보는 참고용이며 실제 날씨와 다를 수 있어요.
        </p>
      </section>

      <section className="settings-card" aria-labelledby="policy-title">
        <SettingsCardHead icon={<ShieldCheck size={16} strokeWidth={1.9} />} title="정책과 정보" id="policy-title" />
        <a className="settings-row" href="https://robom.kr/privacy/outbom"><span className="settings-row-icon" aria-hidden="true"><ShieldCheck size={20} /></span><span><strong>개인정보처리방침</strong></span><ChevronRight size={19} aria-hidden="true" /></a>
        <a className="settings-row" href="https://robom.kr/terms"><span className="settings-row-icon" aria-hidden="true"><FileText size={20} /></span><span><strong>이용약관</strong></span><ChevronRight size={19} aria-hidden="true" /></a>
        <a className="settings-row" href="https://robom.kr/open-source"><span className="settings-row-icon" aria-hidden="true"><Code2 size={20} /></span><span><strong>오픈소스 라이선스</strong></span><ChevronRight size={19} aria-hidden="true" /></a>
      </section>

      <section className="app-meta-card" aria-label="앱 정보">
        <span className="app-meta-icon" aria-hidden="true"><Sun size={26} /></span>
        <div><strong>야외봄</strong><small>개발자 · 로봄</small><small className="app-build">빌드 {BUILD_SHA.slice(0, 7)} · PWA {PWA_CACHE}</small></div>
        <span className="app-version">v{packageInfo.version}</span>
      </section>
    </div>
  );
}

// 설정 기어는 로봄 패밀리 정본 아이콘(청약봄 BottomNav와 동일 path)을 쓴다.
const FAMILY_GEAR_ICON = (
  <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
    <path d="M9.8 3.9 10.5 2h3l.7 1.9 1.8.8 1.9-.8 2.1 2.1-.8 1.9.8 1.8 2 .7v3l-2 .7-.8 1.8.8 1.9-2.1 2.1-1.9-.8-1.8.8-.7 2h-3l-.7-2-1.8-.8-1.9.8L4 17.8l.8-1.9-.8-1.8-2-.7v-3l2-.7.8-1.8L4 6l2.1-2.1 1.9.8 1.8-.8Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    <circle cx="12" cy="11.9" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
  </svg>
);

function FamilyBottomNav({ active, onChange }: { active: MainTab; onChange: (tab: MainTab) => void }) {
  // 패밀리 아이콘 규격: 24px, 선 1.9 라운드 (청약봄 기준)
  const items: Array<{ key: MainTab; label: string; icon: ReactNode }> = [
    { key: "today", label: "오늘", icon: <Sun size={24} strokeWidth={1.9} /> },
    { key: "time", label: "추천", icon: <Sparkles size={24} strokeWidth={1.9} /> },
    { key: "prep", label: "준비", icon: <Backpack size={24} strokeWidth={1.9} /> },
    { key: "settings", label: "설정", icon: FAMILY_GEAR_ICON }
  ];

  return (
    <nav className="family-bottom-nav" aria-label="주요 메뉴">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          className={active === item.key ? "is-active" : ""}
          aria-current={active === item.key ? "page" : undefined}
          onClick={() => onChange(item.key)}
        >
          {item.icon}
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}

type PanelTone = "good" | "normal" | "caution" | "bad";

const PERIOD_DEFS = [
  { key: "dawn", label: "새벽", from: 0, to: 5 },
  { key: "morning", label: "오전", from: 6, to: 11 },
  { key: "afternoon", label: "오후", from: 12, to: 17 },
  { key: "evening", label: "저녁", from: 18, to: 23 }
];

function timeRangeText(first: RunningSlot, last: RunningSlot) {
  const endHour = (last.hour + 1) % 24;
  if (first.time === last.time) return `${fmtAmPm(first.hour)} 전후`;
  return `${fmtAmPm(first.hour)}-${fmtAmPm(endHour)}`;
}

function summarizeMetric(slots: RunningSlot[], metric: (typeof METRICS)[number], activity: ActivityKey) {
  const available = slots.filter((slot) => Number.isFinite(metric.read(slot)) && Number.isFinite(metric.score(slot)));
  if (available.length === 0) {
    return [
      { label: "요약", value: "정보 없음", note: `${metric.label} 데이터를 불러오지 못했어요.` },
      { label: "가장 좋은 때", value: "—", note: "결측 시간은 순위에서 제외했어요." },
      { label: "평균 흐름", value: "—", note: "값이 들어오면 다시 계산해요." }
    ];
  }
  const best = available.reduce((a, b) => (metric.score(b) > metric.score(a) ? b : a));
  const worst = available.reduce((a, b) => (metric.score(b) < metric.score(a) ? b : a));
  const avg = available.reduce((sum, slot) => sum + metric.read(slot), 0) / available.length;
  const unit = metric.unit;
  const fmt = (value: number) => (Math.abs(value) < 10 && unit !== "%" ? value.toFixed(1) : Math.round(value).toString());

  return [
    { label: "가장 좋은 때", value: `${fmtAmPm(best.hour)}`, note: `${ACTIVITIES[activity].label} 기준 ${metric.score(best)}점` },
    { label: "주의할 때", value: `${fmtAmPm(worst.hour)}`, note: `${metric.label}이 가장 부담되는 시간` },
    { label: "평균 흐름", value: `${fmt(avg)}${unit}`, note: "선택한 시간 범위 평균값" }
  ];
}

function windHuman(ms: number) {
  if (ms < 4) return "약한 바람";
  if (ms < 9) return "조금 강한 바람";
  if (ms < 14) return "강한 바람";
  return "매우 강한 바람";
}

function humidityHuman(value: number) {
  if (value < 35) return { label: "건조", tone: "caution" as PanelTone, note: "목이 마르기 쉬워요. 물을 챙기세요." };
  if (value <= 60) return { label: "쾌적", tone: "good" as PanelTone, note: "땀이 마르기 쉬운 편이에요." };
  if (value <= 75) return { label: "습함", tone: "normal" as PanelTone, note: "천천히 움직이면 부담이 덜해요." };
  return { label: "끈적함", tone: "caution" as PanelTone, note: "체감이 답답할 수 있어요. 강도는 낮추세요." };
}

function metricPeriodSummary(metric: (typeof METRICS)[number], group: RunningSlot[], activity: ActivityKey) {
  const available = group.filter((slot) => Number.isFinite(metric.read(slot)) && Number.isFinite(metric.score(slot)));
  const fallback = group[0];
  if (available.length === 0) {
    return { primary: "정보 없음", value: "—", note: `${metric.label} 데이터가 없어 계산에서 제외했어요.`, tone: "normal" as PanelTone, focus: fallback };
  }
  const best = available.reduce((a, b) => (metric.score(b) > metric.score(a) ? b : a));
  const worst = available.reduce((a, b) => (metric.score(b) < metric.score(a) ? b : a));
  const avg = available.reduce((sum, slot) => sum + metric.read(slot), 0) / available.length;
  const focus = worst;

  if (metric.key === "feel") {
    const hot = Math.max(...group.map((s) => s.apparentTemperature));
    const cold = Math.min(...group.map((s) => s.apparentTemperature));
    const tone: PanelTone = hot >= 30 || cold <= 0 ? "caution" : hot >= 27 || cold <= 5 ? "normal" : "good";
    const label = hot >= 30 ? "더위 부담" : cold <= 0 ? "매서움" : cold <= 5 ? "쌀쌀함" : "움직이기 편함";
    const note = hot >= 30 ? "물과 그늘을 먼저 보세요." : cold <= 5 ? "초반 보온이 중요해요." : `${ACTIVITIES[activity].label}하기 무난해요.`;
    return { primary: label, value: `${Math.round(cold)}°-${Math.round(hot)}°`, note, tone, focus };
  }

  if (metric.key === "dust") {
    const dustSlots = group.filter((slot) => slot.pm25 !== null);
    if (dustSlots.length === 0) return { primary: "미세 정보 없음", value: "—", note: "대기질 데이터를 못 불러왔어요.", tone: "normal" as PanelTone, focus: fallback };
    const worstDust = dustSlots.reduce((a, b) => ((b.pm25 ?? -1) > (a.pm25 ?? -1) ? b : a));
    const dustValue = worstDust.pm25;
    if (dustValue === null) return { primary: "미세 정보 없음", value: "—", note: "대기질 데이터를 못 불러왔어요.", tone: "normal" as PanelTone, focus: fallback };
    const grade = gradePm25(dustValue);
    const tone: PanelTone = grade.label === "좋음" ? "good" : grade.label === "보통" ? "normal" : grade.label === "나쁨" ? "caution" : "bad";
    const note = grade.label === "좋음" ? "호흡 부담이 낮아요." : grade.label === "보통" ? "민감하면 강도만 살짝 낮추세요." : "오래 뛰기보다 짧게 움직이세요.";
    return { primary: `미세 ${grade.label}`, value: `${Math.round(dustValue)}㎍`, note, tone, focus: worstDust };
  }

  if (metric.key === "uv") {
    const peak = group.reduce((a, b) => (b.uvIndex > a.uvIndex ? b : a), group[0]);
    const grade = gradeUv(peak.uvIndex);
    const tone: PanelTone = peak.uvIndex >= 8 ? "bad" : peak.uvIndex >= 6 ? "caution" : peak.uvIndex >= 3 ? "normal" : "good";
    const note = peak.uvIndex >= 8 ? "10-15시는 그늘과 차단제를 우선하세요." : peak.uvIndex >= 6 ? "모자와 선크림이 있으면 좋아요." : "자외선 부담이 낮아요.";
    return { primary: `자외선 ${grade.label}`, value: `${Math.round(peak.uvIndex)}`, note, tone, focus: peak };
  }

  if (metric.key === "wind") {
    const peak = group.reduce((a, b) => (b.windSpeed > a.windSpeed ? b : a), group[0]);
    const tone: PanelTone = peak.windSpeed >= 9 ? "bad" : peak.windSpeed >= 4 ? "normal" : "good";
    const note = peak.windSpeed >= 9 ? "맞바람과 체온 저하를 조심하세요." : peak.windSpeed >= 4 ? "가벼운 겉옷이 도움이 돼요." : "바람 부담이 작아요.";
    return { primary: windHuman(peak.windSpeed), value: `${peak.windSpeed.toFixed(1)}㎧`, note, tone, focus: peak };
  }

  const hum = humidityHuman(avg);
  return { primary: hum.label, value: `${Math.round(avg)}%`, note: hum.note, tone: hum.tone, focus: best };
}

function buildMetricPeriodCards(slots: RunningSlot[], metric: (typeof METRICS)[number], activity: ActivityKey) {
  return PERIOD_DEFS.flatMap((period) => {
    const groups = slots.filter((slot) => slot.hour >= period.from && slot.hour <= period.to);
    if (groups.length === 0) return [];
    const byDay = groups.reduce<Array<RunningSlot[]>>((acc, slot) => {
      const last = acc[acc.length - 1];
      if (last?.[0]?.time.slice(0, 10) === slot.time.slice(0, 10)) {
        last.push(slot);
      } else {
        acc.push([slot]);
      }
      return acc;
    }, []);

    return byDay.map((group) => {
      const first = group[0];
      const last = group[group.length - 1];
      const summary = metricPeriodSummary(metric, group, activity);
      return {
        key: `${period.key}-${first.time}`,
        label: period.label,
        range: timeRangeText(first, last),
        slots: group,
        ...summary
      };
    });
  }).slice(0, 6);
}

function MetricPeriodPanel({
  slots,
  metric,
  activity,
  selectedTime,
  onSelectTime,
  dayLabel
}: {
  slots: RunningSlot[];
  metric: (typeof METRICS)[number];
  activity: ActivityKey;
  selectedTime: string;
  onSelectTime: (time: string) => void;
  dayLabel: string;
}) {
  const cards = buildMetricPeriodCards(slots, metric, activity);

  return (
    <div className="metric-period-panel">
      <p className="sheet-graph-label">
        <b>{dayLabel} {metric.label} 핵심</b>
        <small>시간대를 누르면 위 설명이 바뀌어요</small>
      </p>
      <div className="metric-period-grid">
        {cards.map((card) => {
          const active = card.slots.some((slot) => slot.time === selectedTime);
          return (
            <button
              type="button"
              key={card.key}
              className={`metric-period-card tone-${card.tone}${active ? " active" : ""}`}
              onClick={() => onSelectTime(card.focus.time)}
            >
              <span>{card.label}</span>
              <b>{card.primary}</b>
              <strong>{card.value}</strong>
              <small>{card.range} · {card.note}</small>
            </button>
          );
        })}
      </div>
    </div>
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
  const [activeTab, setActiveTab] = useState<MainTab>("today");
  const [sheetKey, setSheetKey] = useState<DetailKey | null>(null);
  const [toast, setToast] = useState("");
  const [alarms, setAlarms] = useState<AlarmConfig[]>([]);
  const [alarmTarget, setAlarmTarget] = useState<{ id: string; label: string; timeLabel: string; targetMs: number } | null>(
    null
  );
  const [firedAlarm, setFiredAlarm] = useState<AlarmConfig | null>(null);
  const [isRestored, setIsRestored] = useState(false);
  const [nowHour, setNowHour] = useState(-1);
  const [alarmTimerEpoch, setAlarmTimerEpoch] = useState(0);

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchNote, setSearchNote] = useState("");
  const [saved, setSaved] = useState<SavedLocation[]>([]);
  const [locationShelf, setLocationShelf] = useState<LocationShelf>("fav");
  const [isActivityOpen, setIsActivityOpen] = useState(false);
  const [packedIds, setPackedIds] = useState<string[]>([]);
  const [activityDuration, setActivityDuration] = useState<ActivityDuration>("normal");
  const [activityLocations, setActivityLocations] = useState<Partial<Record<ActivityKey, LocationPoint>>>({});
  const [activityLocationsRestored, setActivityLocationsRestored] = useState(false);

  const forecastReqId = useRef(0);
  const activityMenuRef = useRef<HTMLDivElement | null>(null);
  const activityTriggerRef = useRef<HTMLButtonElement | null>(null);
  const searchDialogRef = useRef<HTMLDivElement | null>(null);
  const searchTriggerRef = useRef<HTMLElement | null>(null);

  const openLocationSearch = useCallback((trigger: HTMLElement) => {
    searchTriggerRef.current = trigger;
    setIsSearchOpen(true);
  }, []);

  useEffect(() => {
    if (!isActivityOpen) return;
    const menu = activityMenuRef.current;
    const items = () => Array.from(menu?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
    const selected = menu?.querySelector<HTMLButtonElement>(`[data-activity="${activity}"]`);
    (selected ?? items()[0])?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      const menuItems = items();
      if (event.key === "Escape") {
        event.preventDefault();
        setIsActivityOpen(false);
        return;
      }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) || menuItems.length === 0) return;
      event.preventDefault();
      const current = Math.max(0, menuItems.indexOf(document.activeElement as HTMLButtonElement));
      const nextIndex = event.key === "Home"
        ? 0
        : event.key === "End"
          ? menuItems.length - 1
          : (current + (event.key === "ArrowDown" ? 1 : -1) + menuItems.length) % menuItems.length;
      menuItems[nextIndex]?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      activityTriggerRef.current?.focus();
    };
  }, [activity, isActivityOpen]);

  useEffect(() => {
    if (!isSearchOpen) return;
    const dialog = searchDialogRef.current;
    if (!dialog) return;
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'));
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsSearchOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      searchTriggerRef.current?.focus();
    };
  }, [isSearchOpen]);

  const loadForecast = useCallback(async (target: LocationPoint) => {
    // 위치를 빠르게 바꾸면 여러 요청이 겹친다. 가장 최근 요청의 결과만 반영해
    // 늦게 도착한 이전 위치 응답이 새 위치를 덮어쓰는 경합을 막는다.
    const reqId = ++forecastReqId.current;
    setIsLoading(true);
    setError("");
    setRawForecast((previous) => {
      if (!previous) return null;
      const sameLocation = Math.abs(previous.location.latitude - target.latitude) < 0.001 && Math.abs(previous.location.longitude - target.longitude) < 0.001;
      return sameLocation ? previous : null;
    });
    try {
      const data = await fetchAppForecast(target);
      if (forecastReqId.current !== reqId) return;
      setRawForecast(data);
      saveForecastCache(window.localStorage, target, data);
    } catch {
      if (forecastReqId.current !== reqId) return;
      const cached = readForecastCache(window.localStorage, target);
      if (cached) {
        setRawForecast(cached.forecast);
        setError(`실시간 연결이 불안정해 ${forecastCacheAgeLabel(cached.savedAt)} 저장한 같은 위치 예보를 보여드려요.`);
      } else {
        setError("데이터를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
      }
    } finally {
      if (forecastReqId.current === reqId) setIsLoading(false);
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
            detail: typeof parsed.detail === "string" ? parsed.detail : undefined,
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
      setNowHour(hourInTimezone(new Date(), rawForecast?.timezone));
    };
    tick();
    const id = window.setInterval(tick, 30000);
    return () => window.clearInterval(id);
  }, [rawForecast?.timezone]);

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

  // 활동별 마지막 위치 복원
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(ACTIVITY_LOCATION_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Record<ActivityKey | "commute", LocationPoint>>;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          const migrated: Partial<Record<ActivityKey, LocationPoint>> = { ...parsed };
          if (parsed.commute && !parsed.walk) migrated.walk = parsed.commute;
          delete (migrated as Partial<Record<ActivityKey | "commute", LocationPoint>>).commute;
          setActivityLocations(migrated);
          if (parsed.commute) window.localStorage.setItem(ACTIVITY_LOCATION_KEY, JSON.stringify(migrated));
        }
      }
    } catch {
      // 무시
    } finally {
      setActivityLocationsRestored(true);
    }
  }, []);

  useEffect(() => {
    if (!activityLocationsRestored) return;
    try {
      window.localStorage.setItem(ACTIVITY_LOCATION_KEY, JSON.stringify(activityLocations));
    } catch {
      // 무시
    }
  }, [activityLocations, activityLocationsRestored]);

  // 활동 선택 복원·저장
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(ACTIVITY_KEY);
      if (stored === "walk" || stored === "run" || stored === "dog" || stored === "hike" || stored === "bike") {
        setActivity(stored);
      } else if (stored === "commute") {
        setActivity("walk");
        window.localStorage.setItem(ACTIVITY_KEY, "walk");
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

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(ACTIVITY_DURATION_KEY);
      if (stored === "short" || stored === "normal" || stored === "long") setActivityDuration(stored);
    } catch {
      // 저장 불가 환경은 보통 시간으로 유지
    }
  }, []);

  const changeActivityDuration = useCallback((next: ActivityDuration) => {
    setActivityDuration(next);
    try {
      window.localStorage.setItem(ACTIVITY_DURATION_KEY, next);
    } catch {
      // 저장 불가 환경은 현재 세션 상태만 유지
    }
  }, []);

  // 활동 전환 — 열린 시트를 닫고 즉시(재요청 없이) 재계산
  const changeActivity = useCallback(
    (next: ActivityKey) => {
      setSheetKey(null);
      setDayMode("today");
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
    const rearmAfter = 24 * 3600 * 1000;
    let needsRearm = false;
    const timers = alarms.map((alarm) => {
      const fireAt = alarm.targetMs - alarm.leadMin * 60000;
      const delay = fireAt - now;
      if (delay <= 0) return null;
      if (delay > rearmAfter) {
        needsRearm = true;
        return null;
      }
      return window.setTimeout(() => {
        setFiredAlarm(alarm);
        if (alarm.popup && typeof Notification !== "undefined" && Notification.permission === "granted") {
          void showRunningNotification(alarm).catch(() => undefined);
        }
        setAlarms((prev) => prev.filter((a) => a.id !== alarm.id));
      }, delay);
    });
    if (needsRearm) {
      timers.push(window.setTimeout(() => setAlarmTimerEpoch((value) => value + 1), rearmAfter));
    }
    return () => timers.forEach((t) => (t !== null ? window.clearTimeout(t) : undefined));
  }, [alarms, alarmTimerEpoch]);

  useEffect(() => {
    const rearm = () => setAlarmTimerEpoch((value) => value + 1);
    const onVisibility = () => {
      if (document.visibilityState === "visible") rearm();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", rearm);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", rearm);
    };
  }, []);

  const hasTomorrow = (forecast?.tomorrow.length ?? 0) > 0;
  const isTomorrow = dayMode === "tomorrow" && hasTomorrow;

  const view = useMemo(() => {
    if (!forecast || forecast.slots.length === 0) return null;
    const hour = nowHour >= 0 ? nowHour : hourInTimezone(new Date(), forecast.timezone);

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
        parts
      };
    }

    const slots = forecast.slots;
    const current = findCurrentSlot(slots, hour);
    const parts = getDayParts(slots, true, hour, activity);
    const best = pickBest(parts, findBestRemainingSlot(slots, hour));
    return {
      slots,
      timeline: [...slots, ...forecast.tomorrow], // 자정을 넘어 12시간을 이어보기 위한 연속 타임라인
      best,
      reference: current,
      currentTime: current.time,
      delta: compareWithYesterday(current, forecast.yesterday),
      deltaLabel: "어제보다",
      parts
    };
  }, [forecast, isTomorrow, nowHour, activity]);

  // 추천 시간대 계산을 한 번만 수행해 목록과 결정형 요약이 같은 결과를 사용한다.
  const recommendation = useMemo(() => {
    const empty = {
      entries: [] as Array<{ win: RankedWindow; start: RunningSlot; label: string }>
    };
    if (!view) return empty;
    const hour = nowHour >= 0 ? nowHour : hourInTimezone(new Date(), forecast?.timezone);
    const rankedWindows = getRankedWindows(view.slots, !isTomorrow, hour, activity);
    const byHour = new Map(view.slots.map((slot) => [slot.hour, slot]));
    const entries = rankedWindows
      .map((win, index) => {
        const start = byHour.get(win.startHour);
        if (!start) return null;
        const label = isTomorrow ? "내일" : index === 0 ? "베스트" : "추천";
        return { win, start, label };
      })
      .filter((item): item is { win: RankedWindow; start: RunningSlot; label: string } => item !== null);
    return { entries };
  }, [view, isTomorrow, nowHour, activity]);


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

  function assignSavedTag(target: SavedLocation, tag: SavedLocationTag) {
    const key = locKey(target);
    setSaved((prev) =>
      prev.map((s) => ({
        ...s,
        tag: locKey(s) === key ? tag : s.tag === tag ? undefined : s.tag,
        fav: locKey(s) === key ? true : s.fav
      }))
    );
    setLocationShelf(tag);
  }

  function removeSaved(target: SavedLocation) {
    setSaved((prev) => prev.filter((s) => locKey(s) !== locKey(target)));
  }

  function chooseLocation(next: LocationPoint, detail?: string) {
    const display = activity === "hike" ? { title: next.name, subtitle: detail ?? "" } : locationDisplay(next.name, detail);
    const normalized = { ...next, name: display.title, detail: display.subtitle || detail || undefined };
    setLocation(normalized);
    rememberLocation(normalized, normalized.detail);
    setActivityLocations((prev) => ({ ...prev, [activity]: normalized }));
    setDayMode("today");
    setIsSearchOpen(false);
    setSearchResults([]);
    setSearchQuery("");
    setSearchNote("");
  }

  const homeList = saved.filter((s) => s.tag === "home");
  const workList = saved.filter((s) => s.tag === "work");
  const favList = saved.filter((s) => s.fav && s.tag !== "home" && s.tag !== "work").sort((a, b) => b.ts - a.ts);
  const recentList = saved
    .filter((s) => s.tag !== "home" && s.tag !== "work")
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 5);
  const locationShelves: Array<{ key: LocationShelf; label: string; count: number }> = [
    { key: "home", label: "집", count: homeList.length },
    { key: "work", label: "회사", count: workList.length },
    { key: "fav", label: "즐겨찾기", count: favList.length },
    { key: "recent", label: "최근", count: recentList.length }
  ];
  const activeSavedList =
    locationShelf === "home" ? homeList : locationShelf === "work" ? workList : locationShelf === "fav" ? favList : recentList;

  async function runSearch(query: string) {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSearchNote("두 글자 이상 입력해 주세요.");
      return;
    }
    setIsSearching(true);
    setSearchNote("");
    try {
      // 동네명 게이트 제거 — 역명·도로명·건물명도 그대로 검색한다 (서버가 주소·키워드 검색을 함께 수행).
      const results = await fetchSearch(trimmed, activity === "hike");
      setSearchResults(results);
      setSearchNote(results.length === 0 ? "검색 결과가 없어요. 다른 검색어로 시도해 보세요." : "");
    } catch (searchError) {
      setSearchNote(
        searchError instanceof Error && searchError.message === "LOCATION_SEARCH_NOT_CONFIGURED"
          ? "위치 검색 연결을 준비 중이에요. 현재 위치 버튼을 사용해 주세요."
          : "위치 검색이 일시적으로 불안정해요. 잠시 후 다시 시도해 주세요."
      );
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

    const onSuccess = async (position: GeolocationPosition) => {
      const { latitude, longitude } = position.coords;
      setLocationStep("address");
      const found = await fetchLocationName(latitude, longitude).catch(() => ({ name: "현재 위치 근처", detail: undefined }));
      setLocationStep("weather");
      chooseLocation(
        { name: displayLocationName(found.name, found.detail), latitude, longitude, source: "gps" },
        found.detail ?? found.name
      );
      setIsLocating(false);
      setLocationStep("idle");
    };

    const onError = (failure: GeolocationPositionError) => {
      setLocationStep(failure.code === failure.PERMISSION_DENIED ? "blocked" : "idle");
      setError(
        failure.code === failure.PERMISSION_DENIED
          ? "위치 권한이 거부됐어요. 주소창 왼쪽 사이트 설정에서 위치를 허용한 뒤 다시 눌러주세요."
          : "현재 위치를 찾지 못했어요. 검색이나 도시 선택으로도 점수를 볼 수 있어요."
      );
      setIsLocating(false);
    };

    // 1차 고정밀(GPS). 타임아웃·불가면 2차로 저정밀(와이파이·기지국) 재시도 —
    // "갑자기 인식 못 함"의 흔한 원인(실내 GPS 타임아웃)을 완화한다.
    navigator.geolocation.getCurrentPosition(
      onSuccess,
      (failure) => {
        if (failure.code === failure.PERMISSION_DENIED) {
          onError(failure);
          return;
        }
        setLocationStep("gps");
        navigator.geolocation.getCurrentPosition(onSuccess, onError, {
          enableHighAccuracy: false,
          timeout: 15000,
          maximumAge: 1000 * 60 * 30
        });
      },
      { enableHighAccuracy: true, timeout: 9000, maximumAge: 1000 * 60 * 5 }
    );
  }

  const canNotify = typeof window !== "undefined" && "Notification" in window;

  function openAlarm(part: { label: string; best: RunningSlot | null; timeLabel?: string }) {
    if (!part.best) return;
    setAlarmTarget({
      id: part.best.time,
      label: `${part.label} ${profile.label}`,
      timeLabel: part.timeLabel ?? formatHour(part.best),
      targetMs: slotToMs(part.best.time, forecast?.timezone ?? "Asia/Seoul")
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
    setAlarmTarget(null);
    setToast(
      leadMin === 0
        ? `${alarmTarget.timeLabel} 앱 실행 중 알림을 켰어요`
        : `${leadMin}분 전 앱 실행 중 알림을 켰어요`
    );
  }

  function removeAlarm() {
    if (!alarmTarget) return;
    const id = alarmTarget.id;
    setAlarms((prev) => prev.filter((a) => a.id !== id));
    setAlarmTarget(null);
    setToast("알림을 껐어요");
  }

  // 새 히어로·상세·준비물은 모두 같은 추천 시각을 기준으로 설명한다.
  const heroSlot = view?.best ?? null;

  useEffect(() => setPackedIds([]), [activity, heroSlot?.time]);

  const togglePacked = useCallback((id: string) => {
    setPackedIds((previous) => (previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id]));
  }, []);
  const metricRef = heroSlot;
  const reasonRows =
    metricRef
      ? [
          {
            key: "feel" as DetailKey,
            icon: <Thermometer size={19} />,
            label: "체감",
            value: `${Math.round(metricRef.apparentTemperature)}`,
            unit: "°",
            grade: gradeTemperature(metricRef.apparentTemperature),
            iconClass: "ci-blue"
          },
          {
            key: "precip" as DetailKey,
            icon: <CloudRain size={19} />,
            label: "비올확률",
            value: `${Math.round((metricRef.precipitationProbability ?? 0))}`,
            unit: "%",
            grade: gradePrecipitation(metricRef.precipitation, (metricRef.precipitationProbability ?? 0)),
            iconClass: "ci-teal"
          },
          {
            key: "dust" as DetailKey,
            icon: <Haze size={19} />,
            label: "미세먼지",
            // 대기질 결측이면 "좋음"으로 위장하지 않고 정보 없음으로 표시한다.
            value: metricRef.pm25 === null ? "—" : gradePm25(metricRef.pm25).label,
            unit: "",
            grade: metricRef.pm25 === null ? { label: "정보 없음", tone: "normal" as const } : gradePm25(metricRef.pm25),
            iconClass: "ci-green"
          },
          {
            key: "uv" as DetailKey,
            icon: <Sun size={19} />,
            label: "자외선",
            value: `${Math.round(metricRef.uvIndex)}`,
            unit: "",
            grade: gradeUv(metricRef.uvIndex),
            iconClass: "ci-amber"
          },
          {
            key: "wind" as DetailKey,
            icon: <Wind size={19} />,
            label: "바람",
            value: metricRef.windSpeed.toFixed(1),
            unit: "㎧",
            grade: gradeWind(metricRef.windSpeed),
            iconClass: "ci-sky"
          },
          {
            key: "humidity" as DetailKey,
            icon: <Droplets size={19} />,
            label: "습도",
            value: `${Math.round(metricRef.humidity)}`,
            unit: "%",
            grade: gradeHumidity(metricRef.humidity),
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

  // 일출·일몰은 기기 시간대가 아니라 예보 지역 시각으로 표기한다.
  const sunrise = forecast ? formatLocalClock(forecast.sunrise, forecast.timezone) : null;
  const sunset = forecast ? formatLocalClock(forecast.sunset, forecast.timezone) : null;
  const locationModel = buildLocationDisplay(location.name, location.detail);
  const locationLabel = locationModel.title;
  const ready = Boolean(view);
  // "오늘 한눈에" 5칸 grid 대신 활동별 결론 카드 하나로 답한다.
  const daySummary = useMemo(() => {
    if (!view) return null;
    const ordered = view.slots.filter((slot) => isTomorrow || view.currentTime === null || slot.time >= view.currentTime);
    const top = recommendation.entries[0] ?? null;
    return buildActivityDaySummary({
      activity,
      slots: ordered,
      bestStartHour: top ? top.win.startHour : null,
      bestSlot: top ? top.start : null,
      sunsetLabel: sunset
    });
  }, [activity, isTomorrow, recommendation.entries, sunset, view]);
  const heroPlan = view && heroSlot ? getOutfitPlan(view.slots, heroSlot, activity) : null;
  const nowSlot = !isTomorrow && view ? view.reference : heroSlot;
  const nowDecision = nowSlot ? getGoNowDecision(nowSlot, profile) : null;
  const nowRainProbability = nowSlot?.precipitationProbability ?? null;
  const nowRainValue = nowRainProbability === null ? "정보 없음" : `${Math.round(nowRainProbability)}%`;
  const nowRainDetail = nowSlot && nowSlot.precipitation > 0 ? `예상 ${nowSlot.precipitation.toFixed(1)}mm` : "예상 강수량 0mm";
  const nowAirValue = nowSlot?.pm25 === null || nowSlot?.pm25 === undefined ? "정보 없음" : `${Math.round(nowSlot.pm25)}`;
  const nowAirDetail = nowSlot?.pm25 === null || nowSlot?.pm25 === undefined ? "미세먼지" : `미세먼지 · ${gradePm25(nowSlot.pm25).label}`;
  const nowFeelGrade = nowSlot ? gradeTemperature(nowSlot.apparentTemperature) : { label: "정보 없음", tone: "normal" as const };
  const nowWindGrade = nowSlot ? gradeWind(nowSlot.windSpeed) : { label: "정보 없음", tone: "normal" as const };
  const heroAir = heroSlot?.pm25 === null || heroSlot?.pm25 === undefined ? "정보 없음" : gradePm25(heroSlot.pm25).label;
  const heroRain = heroSlot ? `${Math.round(heroSlot.precipitationProbability ?? 0)}%` : "—";
  // 오늘 카드 지표에 색+라벨(색각 접근성)로 상태를 함께 표기하기 위한 등급 톤
  const heroAirTone = heroSlot?.pm25 === null || heroSlot?.pm25 === undefined ? "normal" : gradePm25(heroSlot.pm25).tone;
  const heroFeelTone = heroSlot ? gradeTemperature(heroSlot.apparentTemperature).tone : "normal";
  const heroRainTone = heroSlot ? gradePrecipitation(heroSlot.precipitation, heroSlot.precipitationProbability ?? 0).tone : "normal";

  return (
    <main className="page">
      <div className="dashboard-frame">
        <section className="app-shell">
          {/* 위치 변경은 아래 전체 폭 위치 bar 한 곳으로 모은다 — 앱바 중복 pin 제거 */}
          <header className="family-appbar">
            <div className="family-brand-icon" aria-hidden="true"><Sun size={30} /></div>
            <div className="family-brand-copy">
              <FamilyWordmark />
              <span>robom · 바깥바람이 좋은 때</span>
            </div>
          </header>

          {activeTab !== "settings" ? (
          <div className="family-filter-row" aria-label="조회 조건">
            <div className="activity-select-wrap">
              <button
                ref={activityTriggerRef}
                className="activity-select"
                type="button"
                onClick={() => setIsActivityOpen((v) => !v)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                    event.preventDefault();
                    setIsActivityOpen(true);
                  }
                }}
                aria-haspopup="menu"
                aria-expanded={isActivityOpen}
                aria-label="활동 선택"
              >
                <ActivityPictogram activity={activity} className="as-picto" />
                <span>{profile.label}</span>
                <ChevronDown size={15} className={`as-caret${isActivityOpen ? " open" : ""}`} />
              </button>
              {isActivityOpen ? (
                <>
                  <div className="as-backdrop" onClick={() => setIsActivityOpen(false)} aria-hidden="true" />
                  <div ref={activityMenuRef} className="activity-menu" role="menu" aria-label="활동 목록">
                    {ACTIVITY_ORDER.map((key) => (
                      <button
                        key={key}
                        type="button"
                        role="menuitem"
                        data-activity={key}
                        className={`as-item${key === activity ? " on" : ""}`}
                        onClick={() => {
                          changeActivity(key);
                          setIsActivityOpen(false);
                        }}
                      >
                        <ActivityPictogram activity={key} className="as-picto" />
                        <span>{ACTIVITIES[key].label}</span>
                      </button>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
            <div className="family-day-filter" role="tablist" aria-label="날짜 선택">
              <button type="button" role="tab" aria-selected={!isTomorrow} className={!isTomorrow ? "is-active" : ""} onClick={() => setDayMode("today")}>오늘</button>
              <button type="button" role="tab" aria-selected={isTomorrow} className={isTomorrow ? "is-active" : ""} onClick={() => setDayMode("tomorrow")} disabled={!hasTomorrow}>내일</button>
            </div>
            <LocationBar display={locationModel} pending={isLocating} onOpen={openLocationSearch} />
          </div>
          ) : null}

          {/* 위치 검색 모달 */}
          {isSearchOpen ? (
            <section className="location-modal" role="dialog" aria-modal="true" aria-labelledby="location-search-title">
              <div ref={searchDialogRef} className="location-dialog search-dialog">
                <button className="modal-close" type="button" onClick={() => setIsSearchOpen(false)} aria-label="닫기">
                  <X size={18} />
                </button>
                <div className="search-dialog-head">
                  <p className="search-dialog-kicker">나갈 곳 설정</p>
                  <h2 id="location-search-title">어디로 갈까요?</h2>
                  <p className="search-dialog-copy">동네, 역, 주소를 검색하거나 지금 있는 곳을 바로 사용할 수 있어요.</p>
                </div>
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
                    placeholder={activity === "hike" ? "산 이름 검색 (예: 북한산)" : "동네·역·주소 검색 (예: 성수동, 강남역)"}
                    aria-label="검색어"
                  />
                  <button type="submit" className="search-go">
                    검색
                  </button>
                </form>

                {isLocating ? <div className="location-step" role="status" aria-live="polite"><RefreshCw className="spin" size={17} /><strong>{locationStepText[locationStep]}</strong><small>위치 확인부터 날씨 계산까지 이 화면에서 이어집니다.</small></div> : null}
                {!isLocating && error ? <p className="search-note" role="alert">{error}</p> : null}

                <button className="gps-inline" type="button" onClick={startLocate} disabled={isLocating}>
                  <span className="gps-inline-icon" aria-hidden="true"><LocateFixed size={18} /></span>
                  <span className="gps-inline-copy">
                    <strong>현재 위치로 찾기</strong>
                    <small>내 주변 날씨와 추천 시간을 바로 볼게요</small>
                  </span>
                  <ChevronRight size={18} aria-hidden="true" />
                </button>

                <div className="saved-block">
                  <div className="saved-block-head">
                    <strong>저장한 위치</strong>
                    <span>자주 가는 곳을 빠르게</span>
                  </div>
                  <div className="location-shelves" aria-label="저장 위치 필터">
                    {locationShelves.map((shelf) => (
                      <button
                        key={shelf.key}
                        type="button"
                        aria-pressed={locationShelf === shelf.key}
                        className={`location-shelf ${locationShelf === shelf.key ? "on" : ""}`}
                        onClick={() => setLocationShelf(shelf.key)}
                      >
                        <span>{shelf.label}</span>
                        <b>{shelf.count}</b>
                      </button>
                    ))}
                  </div>

                  {activeSavedList.length > 0 ? (
                    <div className="saved-list">
                      {activeSavedList.map((loc) => {
                        const display = locationDisplay(loc.name, loc.detail);
                        return (
                          <div className={`saved-row ${loc.fav ? "is-fav" : ""}`} key={locKey(loc)}>
                            <button
                              type="button"
                              className="saved-pick"
                              onClick={() => chooseLocation({ name: loc.name, latitude: loc.latitude, longitude: loc.longitude, source: loc.source }, loc.detail)}
                            >
                              <span className="saved-ic" aria-hidden="true">
                                {loc.tag === "home" ? "집" : loc.tag === "work" ? "회사" : loc.fav ? "★" : "최근"}
                              </span>
                              <span className="saved-name">
                                <strong>{display.title}</strong>
                                {display.subtitle ? <small>{display.subtitle}</small> : null}
                              </span>
                            </button>
                            <div className="saved-actions">
                              <button type="button" className={`saved-tag ${loc.tag === "home" ? "on" : ""}`} onClick={() => assignSavedTag(loc, "home")}>
                                집
                              </button>
                              <button type="button" className={`saved-tag ${loc.tag === "work" ? "on" : ""}`} onClick={() => assignSavedTag(loc, "work")}>
                                회사
                              </button>
                              <button
                                type="button"
                                className={`saved-star ${loc.fav ? "on" : ""}`}
                                onClick={() => toggleFav(loc)}
                                aria-label={loc.fav ? "즐겨찾기 해제" : "즐겨찾기 추가"}
                              >
                                <Star size={16} fill={loc.fav ? "currentColor" : "none"} />
                              </button>
                              <button type="button" className="saved-del" onClick={() => removeSaved(loc)} aria-label="삭제">
                                <X size={15} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="saved-empty">
                      <b>{locationShelves.find((shelf) => shelf.key === locationShelf)?.label} 위치가 비어 있어요</b>
                      <span>검색한 장소를 저장한 뒤 집이나 회사로 지정할 수 있어요.</span>
                    </div>
                  )}
                </div>

                {isSearching || searchNote ? (
                  <p className="search-note" role="status" aria-live="polite" aria-atomic="true">
                    {isSearching ? "장소를 찾고 있어요…" : searchNote}
                  </p>
                ) : null}

                {searchResults.length > 0 ? (
                  <ul className="search-results" aria-busy={isSearching}>
                    {searchResults.map((result, index) => {
                      const display = activity === "hike" ? { title: result.name, subtitle: result.detail } : locationDisplay(result.name, result.detail);
                      return (
                        <li key={`${result.latitude}-${result.longitude}-${index}`}>
                          <button
                            type="button"
                            onClick={() =>
                              chooseLocation(
                                {
                                  name: activity === "hike" ? result.name : display.title,
                                  latitude: result.latitude,
                                  longitude: result.longitude,
                                  source: "search"
                                },
                                activity === "hike" ? result.detail : result.name
                              )
                            }
                          >
                            <strong>{display.title}</strong>
                            {display.subtitle ? <small>{display.subtitle}</small> : null}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <>
                    <p className="quick-title">{activity === "hike" ? "산 예시" : "검색 예시"}</p>
                    <div className="quick-cities">
                      {(activity === "hike" ? QUICK_MOUNTAINS : QUICK_NEIGHBORHOODS).map((name) => (
                        <button
                          key={name}
                          type="button"
                          onClick={() => {
                            setSearchQuery(name);
                            void runSearch(name);
                          }}
                        >
                          {name}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </section>
          ) : null}

          {error && forecast ? <div className="notice" role="alert">{error}</div> : null}
          {rawForecast && rawForecast.airQualityAvailable === false ? <div className="notice" role="status">대기질 정보를 불러오지 못했어요. 점수에는 반영하지 않았어요.</div> : null}
          {isLoading && ready ? <div className="updating-bar" role="status" aria-live="polite"><RefreshCw className="spin" size={15} /> 최신 예보로 업데이트 중</div> : null}

          {activeTab === "settings" ? (
            <SettingsView />
          ) : error && !forecast && !isLoading ? (
            <section className="error-panel" role="alert">
              <AlertCircle size={30} />
              <p>{error}</p>
              <button className="primary-action" type="button" onClick={() => loadForecast(location)}>다시 시도</button>
            </section>
          ) : !ready || !view || !heroSlot || !nowSlot || !nowDecision ? (
            <section className="forecast-skeleton" role="status" aria-live="polite" aria-label={`${profile.label} 예보 불러오는 중`}>
              <span className="skeleton-line is-short" /><span className="skeleton-line is-title" />
              <div className="skeleton-card"><span /><span /><span /></div>
              <div className="skeleton-grid"><span /><span /><span /><span /></div>
            </section>
          ) : (
            <div className="family-content">
              {activeTab === "today" ? (
                <>
                  <section className="family-hero family-hero-solo" aria-labelledby="hero-title">
                    <p className="family-now-kicker">지금 출발 판단 · {formatForecastMoment(view.reference.time, isTomorrow)}</p>
                    <div className={`family-now-head tone-${nowDecision.tone}`}>
                      <div>
                        <h1 id="hero-title">{nowDecision.title}</h1>
                        <p>{nowDecision.detail}</p>
                      </div>
                      <div className="family-score" aria-label={`${profile.label} 야외활동 점수 ${Math.round(nowSlot.totalScore)}점, ${scoreLabel(nowSlot.totalScore)}`}>
                        <span>{scoreLabel(nowSlot.totalScore)}</span>
                        <strong>{Math.round(nowSlot.totalScore)}</strong>
                        <small>/100</small>
                      </div>
                    </div>
                    <div className="family-now-metrics" aria-label="현재 출발 판단 근거">
                      <span className={`now-rain tone-${gradePrecipitation(nowSlot.precipitation, nowRainProbability ?? 0).tone}`}><CloudRain size={18} aria-hidden="true" /><b>{nowRainValue}</b><small>비 가능성 · {nowRainDetail}</small></span>
                      <span className={`tone-${nowSlot.pm25 === null ? "normal" : gradePm25(nowSlot.pm25).tone}`}><Haze size={18} aria-hidden="true" /><b>{nowAirValue}</b><small>{nowAirDetail}</small></span>
                      <span className={`tone-${nowFeelGrade.tone}`}><Thermometer size={18} aria-hidden="true" /><b>{Math.round(nowSlot.apparentTemperature)}°</b><small>체감 · {nowFeelGrade.label}</small></span>
                      <span className={`tone-${nowWindGrade.tone}`}><Wind size={18} aria-hidden="true" /><b>{nowSlot.windSpeed.toFixed(1)}</b><small>바람 ㎧ · {nowWindGrade.label}</small></span>
                    </div>

                    <div className="family-next-best">
                      <span><CalendarClock size={17} aria-hidden="true" /> 다음으로 편안한 시간</span>
                      <b>{formatHour(heroSlot)} · {heroHeadline(heroSlot, activity)}</b>
                    </div>

                    {sunrise && sunset ? (
                      <div className="family-hero-sun" aria-label="일출과 일몰">
                        <span><Sun size={16} aria-hidden="true" /> 일출 <b>{sunrise}</b></span>
                        <span>일몰 <b>{sunset}</b></span>
                      </div>
                    ) : null}

                    <div className="family-hero-actions">
                      <span>{formatHour(heroSlot)}에는 지금보다 더 편안할 가능성이 높아요.</span>
                      <button type="button" onClick={() => openAlarm({ label: "추천 시간", best: heroSlot })}><BellRing size={20} /> 추천 시간 알림</button>
                    </div>
                  </section>
                  <AdSlot />
                </>
              ) : null}

              {activeTab === "time" ? (
                <section className="family-time-view" aria-labelledby="time-title">
                  <div className="family-section-head"><p>{profile.label} 기준으로 모든 지표를 다시 계산했어요.</p><h2 id="time-title">추천 시간과 날씨</h2></div>
                  {daySummary ? (
                    <ActivityDaySummaryCard
                      summary={daySummary}
                      dayLabel={isTomorrow ? "내일" : "오늘"}
                      onAlarm={
                        recommendation.entries[0]
                          ? () =>
                              openAlarm({
                                label: "가장 좋은 시간",
                                best: recommendation.entries[0].start,
                                timeLabel: formatTwoHourWindow(recommendation.entries[0].win.startHour)
                              })
                          : null
                      }
                    />
                  ) : null}
                  <RecommendationList
                    entries={recommendation.entries.slice(1, 3)}
                    onAlarm={(entry) =>
                      openAlarm({ label: "추천 시간", best: entry.start, timeLabel: formatTwoHourWindow(entry.win.startHour) })
                    }
                  />
                  {recommendation.entries.length === 0 ? <p className="family-empty">남은 추천 시간대가 없어요. 내일 예보를 확인해 보세요.</p> : null}
                  <section className="detail-weather" aria-labelledby="detail-weather-title">
                    <h3 id="detail-weather-title">상세 날씨</h3>
                    <div className="family-metric-grid" aria-label="추천 시간 날씨 상세">
                      {reasonRows.map((row) => <button key={row.label} type="button" className={`tone-${row.grade.tone}`} onClick={() => setSheetKey(row.key)}><span className={row.iconClass}>{row.icon}</span><b>{row.value}{row.unit}</b><small>{row.label} · {row.grade.label}</small></button>)}
                    </div>
                  </section>
                </section>
              ) : null}

              {activeTab === "prep" ? (
                <section className="family-prep-view" aria-labelledby="prep-title">
                  <div className="family-section-head"><p>{formatHour(heroSlot)} 추천 시간의 실제 예보를 기준으로 준비해요.</p><h2 id="prep-title">{isTomorrow ? "내일" : "오늘"}의 준비</h2></div>
                  <PrepView slot={heroSlot} slots={view.slots} activity={activity} packedIds={packedIds} onTogglePacked={togglePacked} duration={activityDuration} onDurationChange={changeActivityDuration} />
                </section>
              ) : null}
            </div>
          )}

          {activeTab !== "settings" ? (
            <footer className="data-notice family-data-notice">
              <p>날씨·대기질은 <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a>, 위치는 Kakao Local과 <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>를 사용합니다.</p>
              <p>현재 위치를 사용하면 좌표가 위치 이름 확인과 날씨 조회를 위해 해당 서비스로 전달됩니다.</p>
            </footer>
          ) : null}
        </section>
      </div>

      <FamilyBottomNav active={activeTab} onChange={setActiveTab} />

      {toast ? <div className="toast">{toast}</div> : null}

      {sheetKey === "precip" && view ? (
        // 강수는 generic 지표 시트 대신 전용 화면 — 하루 흐름을 한 화면 폭에 담는다.
        <PrecipitationSheet
          slots={view.slots}
          currentTime={view.currentTime}
          dayLabel={isTomorrow ? "내일" : "오늘"}
          onClose={() => setSheetKey(null)}
        />
      ) : sheetKey && view ? (
        <MetricSheet
          sheetKey={sheetKey}
          reference={heroSlot ?? view.reference}
          slots={view.timeline}
          currentTime={view.currentTime}
          activity={activity}
          onClose={() => setSheetKey(null)}
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
