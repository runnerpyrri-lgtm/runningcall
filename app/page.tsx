"use client";

// 러닝콜 메인 화면 — 점수 히어로, 시간대 추천, 러닝 정보 드로어
import {
  AlertCircle,
  Backpack,
  BellRing,
  ChevronDown,
  ChevronRight,
  Clock,
  CloudRain,
  Droplets,
  Haze,
  LocateFixed,
  RefreshCw,
  Search,
  Sparkles,
  Star,
  Sun,
  Thermometer,
  Wind,
  X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_CITY } from "@/lib/cities";
import { ActivityPictogram } from "@/lib/pictograms";
import { getOutfitPlan } from "@/lib/outfit";
import {
  getDayParts,
  getMetricDetail,
  getRankedWindows,
  heroHeadline,
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
import { ACTIVITIES, ACTIVITY_ORDER, type ActivityKey } from "@/lib/activity";
import { neighborhoodMatch } from "@/lib/search";
import { getDynamicGuideBlock } from "@/lib/activity-guide";
import { GachaHero, TimeReel, type ReelRank } from "./gacha";

// 활동 내부 탭 (판단 / 준비 / 가이드)
import {
  gradeHumidity,
  gradePm25,
  gradePrecipitation,
  gradeTemperature,
  gradeUv,
  gradeWind,
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
  { key: "dust", label: "미세먼지", unit: "㎍", read: (s) => s.pm25, score: (s) => s.dustScore },
  { key: "uv", label: "자외선", unit: "", read: (s) => s.uvIndex, score: (s) => s.uvScore },
  { key: "wind", label: "바람", unit: "㎧", read: (s) => s.windSpeed, score: (s) => s.windScore },
  { key: "humidity", label: "습도", unit: "%", read: (s) => s.humidity, score: (s) => s.humidityScore }
];

const ALARM_KEY = "running-alarm:alarms";
const SAVED_KEY = "running-alarm:saved";
const ACTIVITY_KEY = "running-alarm:activity";
const QUICK_NEIGHBORHOODS = ["성수동", "독산1동", "연남동", "서초동"];
const QUICK_MOUNTAINS = ["북한산", "관악산", "한라산", "설악산"];

type SavedLocationTag = "home" | "work";
type LocationShelf = SavedLocationTag | "fav" | "recent";
type SavedLocation = LocationPoint & { detail?: string; fav: boolean; ts: number; tag?: SavedLocationTag };

function locKey(l: { latitude: number; longitude: number }) {
  return `${l.latitude.toFixed(3)},${l.longitude.toFixed(3)}`;
}

function hasNeighborhoodName(value: string) {
  return Boolean(neighborhoodMatch(value));
}

function displayLocationName(name: string, detail = "") {
  return locationDisplay(name, detail).title;
}

function locationDisplay(name: string, detail = "") {
  const joined = `${name} ${detail}`.trim();
  const matches = neighborhoodMatch(joined);
  const titleFromDong = matches && matches.length > 0 ? matches[matches.length - 1] : "";
  const parts = joined
    .replace(/\([^)]*\)/g, " ")
    .replace(/[(),]/g, " ")
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const title = titleFromDong || parts[parts.length - 1] || name;
  const titleIndex = parts.lastIndexOf(title);
  const regionParts = (titleIndex > 0 ? parts.slice(0, titleIndex) : parts.slice(0, -1))
    .filter((part) => /(특별시|광역시|자치시|자치도|도|시|군|구)$/.test(part))
    .slice(-2);
  const subtitle = regionParts.length > 0 ? regionParts.join(" ") : detail && detail !== title ? detail : "";
  return { title, subtitle };
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
  if (response.status === 503) throw new Error("LOCATION_SEARCH_NOT_CONFIGURED");
  if (!response.ok) throw new Error("LOCATION_SEARCH_FAILED");
  const data = (await response.json()) as { results?: SearchResult[] };
  return data.results ?? [];
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

function formatHour(slot: RunningSlot) {
  return `${String(slot.hour).padStart(2, "0")}:00`;
}

function formatHourNum(hour: number) {
  return `${String(((hour % 24) + 24) % 24).padStart(2, "0")}:00`;
}

function formatTwoHourWindow(startHour: number) {
  return `${formatHourNum(startHour)}~${formatHourNum(startHour + 2)}`;
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
  const rainChart = sheetKey === "precip" ? sheetSlots : chart;
  const activeSlots = sheetKey === "precip" ? rainChart : chart;

  // 그래프에서 선택한 시각 (기본 = 지금). 탭하면 그 시각 값·등급·바가 바뀜.
  const defaultSel = currentTime ?? activeSlots[0]?.time ?? reference.time;
  const [selTime, setSelTime] = useState(defaultSel);
  const selSlot = activeSlots.find((s) => s.time === selTime) ?? reference;
  const isNowSel = currentTime != null && selTime === currentTime;
  const detail = getMetricDetail(sheetKey, selSlot, activity);
  const selectedRainDecision = sheetKey === "precip" ? rainDecision(selSlot) : null;
  const metricSummary = summarizeMetric(activeSlots, metric, activity);

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
              {selectedRainDecision ? selectedRainDecision.action : detail.valueText}
              <span>{selectedRainDecision ? "" : detail.unit}</span>
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

        {sheetKey === "precip" ? (
          <RainDetailPanel slots={rainChart} selectedTime={selTime} onSelectTime={setSelTime} currentTime={currentTime} />
        ) : (
          <MetricPeriodPanel
            slots={chart}
            metric={metric}
            activity={activity}
            selectedTime={selTime}
            onSelectTime={setSelTime}
            dayLabel={currentTime ? "오늘" : "내일"}
          />
        )}
      </div>
    </div>
  );
}

// 복장 플랜 본문 — OutfitSheet(모달)과 준비 탭(인라인)에서 공유
// 준비 탭 — 복장 상세 + 활동별 준비/주의 콘텐츠
function PrepView({ slot, slots, activity }: { slot: RunningSlot; slots: RunningSlot[]; activity: ActivityKey }) {
  const plan = getOutfitPlan(slots, slot, activity);
  const keyBlock = getDynamicGuideBlock(activity, slot);
  const essentials = plan.categories.slice(0, 4);
  const keyItems = keyBlock?.items.slice(0, 2) ?? [];
  const change = plan.changes[0];
  const times = plan.byTime.slice(0, 3);

  return (
    <section className="prep-view prep-lite" aria-label={`${ACTIVITIES[activity].terms.outfitTitle}`}>
      <div className="prep-lite-head">
        <span>
          <Backpack size={18} />
          오늘 준비
        </span>
        <b>{plan.main}</b>
        <small>
          체감 {plan.feels.toFixed(0)}° · {plan.headline}
        </small>
      </div>

      {keyItems.length > 0 ? (
        <div className="prep-lite-alert" role="note">
          <strong>{keyBlock?.heading ?? "오늘 체크"}</strong>
          {keyItems.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      ) : null}

      <div className="prep-lite-grid" aria-label="핵심 준비물">
        {essentials.map((item) => (
          <div className="prep-lite-card" key={item.label}>
            <span aria-hidden="true">{item.emoji}</span>
            <b>{item.value}</b>
            <small>{item.label}</small>
          </div>
        ))}
      </div>

      {change ? (
        <div className={`prep-lite-note tone-${change.tone}`}>
          <span aria-hidden="true">{change.emoji}</span>
          <b>{change.text}</b>
        </div>
      ) : null}

      {times.length > 0 ? (
        <div className="prep-lite-times">
          {times.map((time) => (
            <span key={time.label}>
              <b>{time.label}</b>
              {time.main}
            </span>
          ))}
        </div>
      ) : null}
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
  return (
    <aside className={side ? `side-ad side-ad-${side}` : "infeed-ad"} aria-label="광고 영역">
      <span>AD</span>
      <strong>{side ? "사이드 배너" : "인피드 광고"}</strong>
    </aside>
  );
}

type PanelTone = "good" | "normal" | "caution" | "bad";

const PERIOD_DEFS = [
  { key: "dawn", label: "새벽", from: 0, to: 5 },
  { key: "morning", label: "오전", from: 6, to: 11 },
  { key: "afternoon", label: "오후", from: 12, to: 17 },
  { key: "evening", label: "저녁", from: 18, to: 23 }
];

// 기상청 강수 강도 표현을 사용자 행동 문장으로 다시 풀어낸다.
function rainInfo(mm: number): { label: string; desc: string; tone: PanelTone } {
  if (mm <= 0) return { label: "비 양은 0mm", desc: "확률만 높을 수 있어요. 아래 우산 판단을 보세요.", tone: "good" };
  if (mm < 0.1) return { label: "빗방울", desc: "공식 예보상 비로 잡히기 전, 살짝 떨어지는 정도예요.", tone: "normal" };
  if (mm < 1) return { label: "흩뿌림", desc: "바닥이 살짝 젖는 정도. 짧은 이동은 가능해요.", tone: "normal" };
  if (mm < 3) return { label: "약한 비", desc: "우산이 있으면 편하고, 없으면 조금 젖어요.", tone: "caution" };
  if (mm < 15) return { label: "보통 비", desc: "우산 없이는 꽤 젖어요. 야외 활동은 줄이는 편이 좋아요.", tone: "bad" };
  if (mm < 30) return { label: "강한 비", desc: "짧은 외출도 불편해요. 실내 대안을 보세요.", tone: "bad" };
  return { label: "매우 강한 비", desc: "외출보다 안전이 먼저예요.", tone: "bad" };
}

function rainAmountText(mm: number) {
  if (mm <= 0) return "0mm";
  return `${mm.toFixed(1)}mm`;
}

function rainDecision(slot: RunningSlot): { action: string; short: string; body: string; tone: PanelTone } {
  const mm = slot.precipitation;
  const prob = Math.round(slot.precipitationProbability);
  const info = rainInfo(mm);

  if (mm >= 3) {
    return { action: "우산 꼭 필요", short: "우산", body: `${info.label}예요. ${fmtAmPm(slot.hour)} 전후 야외 일정은 줄이세요.`, tone: "bad" };
  }
  if (mm >= 1 || prob >= 75) {
    return {
      action: "우산 챙기기",
      short: "우산",
      body: mm >= 1 ? `${info.label}가 잡혔어요. 우산 없이는 젖을 수 있어요.` : `비가 올 가능성이 높아요. 아직 양이 작아도 우산을 챙기는 쪽이 안전해요.`,
      tone: "caution"
    };
  }
  if (mm >= 0.1 || prob >= 55) {
    return {
      action: "접이식 우산",
      short: "접이식",
      body: mm >= 0.1 ? `${info.label} 수준이에요. 오래 걷는다면 접이식 우산이 편해요.` : `비 가능성이 있어요. 긴 외출이면 작은 우산을 넣어두세요.`,
      tone: "normal"
    };
  }
  if (prob >= 35) {
    return { action: "하늘 확인", short: "확인", body: "비 신호가 약해요. 나가기 직전 하늘만 한번 확인하면 충분해요.", tone: "normal" };
  }
  return { action: "우산 불필요", short: "없음", body: "비 가능성이 낮아요. 비 때문에 일정을 바꿀 정도는 아니에요.", tone: "good" };
}

function rainDayLabel(hasToday: boolean, groupIndex: number) {
  if (hasToday) {
    return groupIndex === 0 ? "오늘" : groupIndex === 1 ? "내일" : "다음날";
  }

  return groupIndex === 0 ? "내일" : "다음날";
}

function timeRangeText(first: RunningSlot, last: RunningSlot) {
  const endHour = (last.hour + 1) % 24;
  if (first.time === last.time) return `${fmtAmPm(first.hour)} 전후`;
  return `${fmtAmPm(first.hour)}-${fmtAmPm(endHour)}`;
}

function summarizeRain(slots: RunningSlot[]) {
  const wet = slots.filter((slot) => slot.precipitation >= 0.1 || slot.precipitationProbability >= 55);
  if (wet.length === 0) {
    return { title: "비 때문에 바꿀 일정은 거의 없어요", body: "뚜렷한 비 구간이 없고, 우산은 대체로 필요하지 않아요." };
  }
  const first = wet[0];
  const last = wet[wet.length - 1];
  const peak = wet.reduce((a, b) => (b.precipitation > a.precipitation ? b : a), wet[0]);
  const probable = wet.reduce((a, b) => (b.precipitationProbability > a.precipitationProbability ? b : a), wet[0]);
  const focus = peak.precipitation >= 0.1 ? peak : probable;
  const decision = rainDecision(focus);
  const strength = focus.precipitation >= 0.1 ? rainInfo(focus.precipitation).label : "아직 양은 작지만 가능성 높은";
  return {
    title: `${timeRangeText(first, last)} 비 신호`,
    body: `${decision.action}. 기준 시간은 ${fmtAmPm(focus.hour)}이고 ${strength} 신호예요.`
  };
}

function rainWindowSlots(slots: RunningSlot[], currentTime: string | null) {
  if (!currentTime) return slots;
  const index = slots.findIndex((slot) => slot.time === currentTime);
  return index >= 0 ? slots.slice(index) : slots;
}

function summarizeMetric(slots: RunningSlot[], metric: (typeof METRICS)[number], activity: ActivityKey) {
  const best = slots.reduce((a, b) => (metric.score(b) > metric.score(a) ? b : a), slots[0]);
  const worst = slots.reduce((a, b) => (metric.score(b) < metric.score(a) ? b : a), slots[0]);
  const avg = slots.reduce((sum, slot) => sum + metric.read(slot), 0) / Math.max(slots.length, 1);
  const unit = metric.unit;
  const fmt = (value: number) => (Math.abs(value) < 10 && unit !== "%" ? value.toFixed(1) : Math.round(value).toString());

  if (metric.key === "precip") {
    const rain = summarizeRain(slots);
    const peak = slots.reduce((a, b) => (b.precipitation > a.precipitation ? b : a), slots[0]);
    const probable = slots.reduce((a, b) => (b.precipitationProbability > a.precipitationProbability ? b : a), slots[0]);
    const focus = peak.precipitation >= 0.1 ? peak : probable;
    const risky = slots.filter((s) => s.precipitation >= 0.1 || s.precipitationProbability >= 55).length;
    const decision = rainDecision(focus);
    const strength = focus.precipitation >= 0.1 ? rainInfo(focus.precipitation).label : "확률 높음";
    return [
      { label: "요약", value: rain.title, note: rain.body },
      { label: "기준 시간", value: `${fmtAmPm(focus.hour)} · ${strength}`, note: `${rainAmountText(focus.precipitation)} · ${decision.action}` },
      { label: "우산 판단", value: risky > 0 ? decision.action : "우산 불필요", note: risky > 0 ? `${risky}시간 정도 비 신호가 있어요` : "비 때문에 챙길 물건은 거의 없어요" }
    ];
  }

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
  const best = group.reduce((a, b) => (metric.score(b) > metric.score(a) ? b : a), group[0]);
  const worst = group.reduce((a, b) => (metric.score(b) < metric.score(a) ? b : a), group[0]);
  const avg = group.reduce((sum, slot) => sum + metric.read(slot), 0) / Math.max(group.length, 1);
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
    const worstDust = group.reduce((a, b) => (b.pm25 > a.pm25 ? b : a), group[0]);
    const grade = gradePm25(worstDust.pm25);
    const tone: PanelTone = grade.label === "좋음" ? "good" : grade.label === "보통" ? "normal" : grade.label === "나쁨" ? "caution" : "bad";
    const note = grade.label === "좋음" ? "호흡 부담이 낮아요." : grade.label === "보통" ? "민감하면 강도만 살짝 낮추세요." : "오래 뛰기보다 짧게 움직이세요.";
    return { primary: `미세 ${grade.label}`, value: `${Math.round(worstDust.pm25)}㎍`, note, tone, focus: worstDust };
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

function toneRank(tone: PanelTone) {
  if (tone === "bad") return 3;
  if (tone === "caution") return 2;
  if (tone === "normal") return 1;
  return 0;
}

function buildRainDayBoards(slots: RunningSlot[], currentTime: string | null) {
  const dayGroups = slots.reduce<Array<{ day: string; slots: RunningSlot[] }>>((groups, slot) => {
    const day = slot.time.slice(0, 10);
    const last = groups[groups.length - 1];
    if (last?.day === day) {
      last.slots.push(slot);
    } else {
      groups.push({ day, slots: [slot] });
    }
    return groups;
  }, []);

  return dayGroups.slice(0, 2).map((group, groupIndex) => {
    const cells = PERIOD_DEFS.flatMap((period) => {
      const periodSlots = group.slots.filter((slot) => slot.hour >= period.from && slot.hour <= period.to);
      if (periodSlots.length === 0) return [];
      const first = periodSlots[0];
      const last = periodSlots[periodSlots.length - 1];
      const peak = periodSlots.reduce((a, b) => (b.precipitation > a.precipitation ? b : a), periodSlots[0]);
      const probable = periodSlots.reduce(
        (a, b) => (b.precipitationProbability > a.precipitationProbability ? b : a),
        periodSlots[0]
      );
      const focus = peak.precipitation >= 0.1 ? peak : probable;
      const decision = rainDecision(focus);
      const info = rainInfo(focus.precipitation);
      return [
        {
          key: `${group.day}-${period.key}`,
          label: period.label,
          range: timeRangeText(first, last),
          amount: rainAmountText(peak.precipitation),
          prob: Math.round(probable.precipitationProbability),
          decision,
          info,
          focus
        }
      ];
    });
    if (cells.length === 0) {
      return {
        key: group.day,
        label: rainDayLabel(Boolean(currentTime), groupIndex),
        headline: "비 정보 없음",
        summary: "표시할 시간대가 없어요",
        cells,
        tone: "good" as PanelTone
      };
    }
    const worst = cells.reduce((a, b) => (toneRank(b.decision.tone) > toneRank(a.decision.tone) ? b : a), cells[0]);
    const rainy = cells.filter((cell) => cell.decision.short !== "없음" && cell.decision.short !== "확인");
    const watch = cells.filter((cell) => cell.decision.short === "확인");
    const headline = rainy.length > 0 ? `${rainy[0].label}부터 ${worst.decision.action}` : watch.length > 0 ? "하늘만 확인" : "비 걱정 낮음";
    const summary =
      rainy.length > 0
        ? `${rainy[0].range} 중심 · 최대 ${worst.amount}`
        : watch.length > 0
        ? `${watch[0].range} 전후 약한 신호`
        : "우산 없이 봐도 괜찮아요";
    return {
      key: group.day,
      label: rainDayLabel(Boolean(currentTime), groupIndex),
      headline,
      summary,
      cells,
      tone: worst?.decision.tone ?? "good"
    };
  });
}

function buildRainOverview(slots: RunningSlot[], dayLabel: string) {
  const wet = slots.filter((slot) => slot.precipitation >= 0.1 || slot.precipitationProbability >= 55);
  const peak = slots.reduce((a, b) => (b.precipitation > a.precipitation ? b : a), slots[0]);
  const probable = slots.reduce((a, b) => (b.precipitationProbability > a.precipitationProbability ? b : a), slots[0]);
  const focus = peak.precipitation >= 0.1 ? peak : probable;
  const decision = rainDecision(focus);

  if (wet.length === 0) {
    return {
      tone: "good" as PanelTone,
      title: `${dayLabel} 비 걱정 낮음`,
      body: "우산 없이 봐도 괜찮아요. 나가기 전 하늘만 한 번 확인하면 충분해요.",
      time: "비 신호 없음",
      amount: "0mm",
      prob: `${Math.round(probable.precipitationProbability)}%`
    };
  }

  const first = wet[0];
  const last = wet[wet.length - 1];
  return {
    tone: decision.tone,
    title: decision.action,
    body: `${timeRangeText(first, last)} 중심으로 비 신호가 있어요. 제일 신경 쓸 시간은 ${fmtAmPm(focus.hour)} 전후예요.`,
    time: timeRangeText(first, last),
    amount: rainAmountText(peak.precipitation),
    prob: `${Math.round(probable.precipitationProbability)}%`
  };
}

function rainSignalPercent(slot: RunningSlot) {
  const byAmount = Math.min(100, slot.precipitation * 24);
  const byProb = Math.min(100, slot.precipitationProbability * 0.86);
  return Math.round(Math.max(8, Math.min(100, Math.max(byAmount, byProb))));
}

function rainNowTitle(slot: RunningSlot) {
  const prob = Math.round(slot.precipitationProbability);
  if (slot.precipitation >= 3) return "지금 꽤 와요";
  if (slot.precipitation >= 1) return "지금 비 와요";
  if (slot.precipitation >= 0.1) return "약하게 내려요";
  if (prob >= 70) return "곧 올 수 있어요";
  if (prob >= 45) return "하늘 확인";
  return "비 걱정 낮음";
}

function rainFlowSummary(slots: RunningSlot[]) {
  const wet = slots.filter((slot) => slot.precipitation >= 0.1 || slot.precipitationProbability >= 55);
  const peak = slots.reduce((a, b) => (b.precipitation > a.precipitation ? b : a), slots[0]);
  const probable = slots.reduce((a, b) => (b.precipitationProbability > a.precipitationProbability ? b : a), slots[0]);
  const focus = peak.precipitation >= 0.1 ? peak : probable;
  const decision = rainDecision(focus);

  if (wet.length === 0) {
    return {
      title: "남은 시간 뚜렷한 비 없음",
      body: `최대 가능성 ${Math.round(probable.precipitationProbability)}%. 우산 없이 봐도 괜찮아요.`,
      decision,
      focus
    };
  }

  return {
    title: `${timeRangeText(wet[0], wet[wet.length - 1])} 비 신호`,
    body: `${fmtAmPm(focus.hour)} 전후가 제일 신경 쓸 시간이에요. ${decision.action}.`,
    decision,
    focus
  };
}

function RainDetailPanel({
  slots,
  selectedTime,
  onSelectTime,
  currentTime
}: {
  slots: RunningSlot[];
  selectedTime: string;
  onSelectTime: (time: string) => void;
  currentTime: string | null;
}) {
  const selected = slots.find((slot) => slot.time === selectedTime) ?? slots[0];
  const selectedDecision = rainDecision(selected);
  const dayLabel = currentTime ? "오늘" : "내일";
  const flow = rainFlowSummary(slots);
  const flowSlots = slots.slice(0, 24);

  return (
    <div className="rain-panel">
      <p className="sheet-graph-label rain-panel-title">
        <b>{dayLabel} 하루 강수</b>
        <small>0시부터 24시까지 한 번에 봐요</small>
      </p>

      <div className={`rain-now-card tone-${selectedDecision.tone}`}>
        <div>
          <span>{currentTime ? "지금 상태" : `${dayLabel} 선택 시간`}</span>
          <b>{rainNowTitle(selected)}</b>
          <small>{currentTime ? "현재 기준" : fmtAmPm(selected.hour)} · {rainAmountText(selected.precipitation)}</small>
        </div>
        <strong>{Math.round(selected.precipitationProbability)}%</strong>
      </div>

      <div className={`rain-flow-summary tone-${flow.decision.tone}`}>
        <b>{flow.title}</b>
        <span>{flow.body}</span>
      </div>

      <div className="rain-hour-flow" aria-label={`${dayLabel} 시간별 비 흐름`}>
        {flowSlots.map((slot) => {
          const decision = rainDecision(slot);
          const active = slot.time === selected.time;
          return (
            <button
              type="button"
              key={slot.time}
              className={`rain-hour tone-${decision.tone}${active ? " active" : ""}`}
              style={{ "--rain-signal": `${rainSignalPercent(slot)}%` } as React.CSSProperties}
              onClick={() => onSelectTime(slot.time)}
            >
              <span>{fmtAmPm(slot.hour)}</span>
              <i aria-hidden="true" />
              <b>{Math.round(slot.precipitationProbability)}%</b>
              <small>{rainAmountText(slot.precipitation)}</small>
            </button>
          );
        })}
      </div>

      <div className={`rain-selected-note tone-${selectedDecision.tone}`}>
        <div>
          <span>{fmtAmPm(selected.hour)}</span>
          <b>{selectedDecision.action}</b>
        </div>
        <small>{selectedDecision.body}</small>
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
  const [sheetKey, setSheetKey] = useState<DetailKey | null>(null);
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
  const [locationShelf, setLocationShelf] = useState<LocationShelf>("fav");
  const [isActivityOpen, setIsActivityOpen] = useState(false);
  const [isPrepOpen, setIsPrepOpen] = useState(false);
  const [isReelOpen, setIsReelOpen] = useState(false);
  const [activityLocations, setActivityLocations] = useState<Partial<Record<ActivityKey, LocationPoint>>>({});

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
      setIsPrepOpen(false);
      setIsReelOpen(false);
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
        parts
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
      parts
    };
  }, [forecast, isTomorrow, nowHour, activity]);


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
    const normalized = activity === "hike" ? next : { ...next, name: displayLocationName(next.name, detail) };
    setLocation(normalized);
    rememberLocation(normalized, detail);
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
    if (activity !== "hike" && !hasNeighborhoodName(trimmed)) {
      setSearchResults([]);
      setSearchNote("동네명까지 입력해 주세요. 예: 성수동, 독산1동, 연남동");
      return;
    }
    setIsSearching(true);
    setSearchNote("");
    try {
      const rawResults = await fetchSearch(trimmed, activity === "hike");
      const results =
        activity === "hike"
          ? rawResults
          : rawResults.filter((result) => hasNeighborhoodName(`${result.name} ${result.detail}`));
      setSearchResults(results);
      setSearchNote(results.length === 0 ? "동까지 포함된 결과가 없어요. 예: 성수동, 독산1동처럼 입력해 주세요." : "");
    } catch (searchError) {
      setSearchNote(
        searchError instanceof Error && searchError.message === "LOCATION_SEARCH_NOT_CONFIGURED"
          ? "위치 검색 연결을 준비 중이에요. 현재 위치 버튼을 사용해 주세요."
          : "검색에 실패했어요. 잠시 후 다시 시도해 주세요."
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

    const onSuccess = async (position: GeolocationPosition) => {
      const { latitude, longitude } = position.coords;
      setLocationStep("address");
      const name = await fetchLocationName(latitude, longitude).catch(() => "현재 위치 근처");
      setLocationStep("weather");
      chooseLocation({ name: displayLocationName(name), latitude, longitude, source: "gps" }, name);
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
      targetMs: slotToMs(part.best.time)
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

  // 지표 그리드는 다이얼과 같은 기준(오늘=현재 / 내일=베스트)을 쓴다
  const metricRef = view ? (isTomorrow ? view.best : view.reference) : null;
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
            value: `${Math.round(metricRef.precipitationProbability)}`,
            unit: "%",
            grade: gradePrecipitation(metricRef.precipitation, metricRef.precipitationProbability),
            iconClass: "ci-teal"
          },
          {
            key: "dust" as DetailKey,
            icon: <Haze size={19} />,
            label: "미세먼지",
            value: gradePm25(metricRef.pm25).label,
            unit: "",
            grade: gradePm25(metricRef.pm25),
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

  const sunrise = forecast ? formatClock(forecast.sunrise) : null;
  const sunset = forecast ? formatClock(forecast.sunset) : null;
  const locationLabel = displayLocationName(location.name);

  const ready = !isLoading && view;

  return (
    <main className="page">
      <div className="dashboard-frame">
        <section className="app-shell">
          {/* 상단 바 — 활동 선택(좌) · 동네 표시(우) */}
          <header className="top-header">
            <div className="activity-select-wrap">
              <button
                className="activity-select"
                type="button"
                onClick={() => setIsActivityOpen((v) => !v)}
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
                  <div className="activity-menu" role="menu">
                    {ACTIVITY_ORDER.map((key) => (
                      <button
                        key={key}
                        type="button"
                        role="menuitem"
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
            <button className="loc-center" type="button" onClick={() => setIsSearchOpen(true)} aria-label="위치 변경">
              <strong>
                {locationLabel}
                <ChevronDown size={15} className="loc-caret" />
              </strong>
            </button>
          </header>

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
                    placeholder={activity === "hike" ? "산 이름 검색 (예: 북한산)" : "동네명 입력 (예: 성수동)"}
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

                <div className="saved-block">
                  <div className="location-shelves" role="tablist" aria-label="저장 위치">
                    {locationShelves.map((shelf) => (
                      <button
                        key={shelf.key}
                        type="button"
                        role="tab"
                        aria-selected={locationShelf === shelf.key}
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

                {isSearching ? <p className="search-note">검색 중…</p> : null}
                {searchNote ? <p className="search-note">{searchNote}</p> : null}

                {searchResults.length > 0 ? (
                  <ul className="search-results">
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
                    <p className="quick-title">{activity === "hike" ? "산 예시" : "동네 예시"}</p>
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

              {/* HERO — 가챠 카드: 개봉 연출 + 실측 날씨 씬 + 티어 등급 (탭 = 재개봉) */}
              <section className="hero">
                <div className="hero-top">
                  <span className="hero-cond">
                    <Clock size={14} />
                    {isTomorrow ? "내일" : nowClock || "지금"}
                  </span>
                  <button className="hero-prep" type="button" onClick={() => setIsPrepOpen(true)} aria-label="준비물 보기">
                    <Backpack size={18} />
                    <span>준비</span>
                  </button>
                </div>
                <GachaHero
                  score={isTomorrow ? view.best.totalScore : view.reference.totalScore}
                  headline={heroHeadline(isTomorrow ? view.best : view.reference, activity)}
                  slot={isTomorrow ? view.best : view.reference}
                  place={displayLocationName(location.name)}
                  actLabel={profile.label}
                  isTomorrow={isTomorrow}
                />
                <div className="hero-metrics" aria-label="항목별 상태">
                  {reasonRows.map((row) => (
                    <button className="hm" key={row.label} type="button" onClick={() => setSheetKey(row.key)}>
                      <span className="hm-v">
                        {row.value}
                        {row.unit ? <em>{row.unit}</em> : null}
                      </span>
                      <span className="hm-l">{row.label}</span>
                    </button>
                  ))}
                </div>
              </section>

                </div>
                <div className="col-side">

              {/* 추천 시간대 — 잭팟 버튼 → 슬롯 릴로 금·은·동 순위 공개 (pod 탭 = 알림) */}
              {(() => {
                const hasUpcoming = view.parts.some((p) => !p.past);
                const rankedWindows = getRankedWindows(view.slots, !isTomorrow, nowHour >= 0 ? nowHour : new Date().getHours(), activity);
                const byHour = new Map(view.slots.map((slot) => [slot.hour, slot]));
                const ranked = rankedWindows
                  .map((win, index) => {
                    const start = byHour.get(win.startHour);
                    if (!start) return null;
                    const label = isTomorrow ? "내일" : index === 0 ? "베스트" : "추천";
                    return { win, start, label };
                  })
                  .filter((item): item is { win: (typeof rankedWindows)[number]; start: RunningSlot; label: string } => item !== null);
                const reelRanks: ReelRank[] = ranked.map(({ win, start, label }) => ({
                  key: `${win.startHour}`,
                  label,
                  time: formatTwoHourWindow(win.startHour),
                  score: win.score,
                  chips: [
                    `🌡️ 체감 ${win.feel}°`,
                    `🌧️ 강수 ${win.precipProb}%`,
                    `🙂 미세 ${win.dustLabel}`,
                    `🍃 바람 ${win.windLabel}`
                  ]
                }));
                const reelPool = ranked.map(({ win }) => ({ time: formatTwoHourWindow(win.startHour), score: win.score }));
                return (
                  <section className="ranks" aria-label={`추천 ${profile.label} 시간대`}>
                    {reelRanks.length > 0 ? (
                      <div className="gbtnwrap">
                        <div className="gbtn-aura" aria-hidden="true" />
                        <button type="button" className="gbtn" onClick={() => setIsReelOpen(true)}>
                          <span className="gb-main">
                            <span className="slot7" aria-hidden="true">🎰</span>
                            <span className="gb-text">{isTomorrow ? "내일" : "오늘"}의 추천 {profile.label} 시간대 뽑기</span>
                          </span>
                        </button>
                      </div>
                    ) : (
                      <div className="gclosed">
                        <p className="gclosed-title">
                          {isTomorrow
                            ? `내일은 ${profile.label} 좋은 시간대가 없어요`
                            : hasUpcoming
                            ? `남은 시간엔 ${profile.label} 좋은 때가 없어요`
                            : `오늘 ${profile.label} 추천 시간대는 마감됐어요`}
                        </p>
                      </div>
                    )}
                    <TimeReel
                      open={isReelOpen && reelRanks.length > 0}
                      title={`${isTomorrow ? "내일" : "오늘"}의 추천 ${profile.label} 시간대`}
                      ranks={reelRanks}
                      pool={reelPool}
                      onClose={() => setIsReelOpen(false)}
                      onPick={(rank) => {
                        const target = ranked.find((item) => `${item.win.startHour}` === rank.key);
                        if (!target) return;
                        setIsReelOpen(false);
                        openAlarm({
                          label: rank.label,
                          best: target.start,
                          timeLabel: rank.time
                        });
                      }}
                    />
                  </section>
                );
              })()}

              {/* 일출 · 일몰 — 슬림 한 줄(숫자 위주) */}
              {sunrise && sunset ? (
                <div className="suntimes" aria-label="일출과 일몰">
                  <span>
                    <b>일출</b>
                    {sunrise}
                  </span>
                  <span className="suntimes-sep" aria-hidden="true">
                    ·
                  </span>
                  <span>
                    <b>일몰</b>
                    {sunset}
                  </span>
                </div>
              ) : null}

              <AdSlot />

              <footer className="data-notice">
                <p>
                  날씨·대기질 데이터는{" "}
                  <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
                    Open-Meteo
                  </a>
                  , 위치 정보는 Kakao Local과{" "}
                  <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
                    © OpenStreetMap contributors
                  </a>
                  를 사용합니다.
                </p>
                <p>현재 위치를 사용하면 좌표가 위치 이름 확인과 날씨 조회를 위해 해당 서비스로 전달됩니다.</p>
              </footer>

                </div>
              </div>
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

      {isPrepOpen && view ? (
        <div
          className="sheet-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="준비물"
          onClick={() => setIsPrepOpen(false)}
        >
          <div className="sheet" onClick={(event) => event.stopPropagation()}>
            <div className="sheet-topbar">
              <div className="sheet-grip" aria-hidden="true" />
              <button className="sheet-close" type="button" onClick={() => setIsPrepOpen(false)} aria-label="닫기">
                <X size={18} />
              </button>
            </div>
            <PrepView slot={view.reference} slots={view.slots} activity={activity} />
          </div>
        </div>
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
