// 야외봄 오늘 탭 히어로: 판정 배너 + 시간대별 점수 스크러버(드래그) + 시간 연동 지표 타일 + 베스트 스트립.
// warm-paper 테마·Pretendard·브랜드 블루 토큰을 그대로 쓰고, 등급 3단계(좋음 초록/보통 파랑/주의 빨강)로 통일한다.
"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { BellRing, CloudRain, Haze, Sun, Thermometer, Wind } from "lucide-react";
import { gradePm25, gradePrecipitation, gradeTemperature, gradeWind, type MetricGrade, type RunningSlot } from "@/lib/scoring";

type HeroGrade = "good" | "ok" | "bad";

// 점수 → 판정 등급 3단계 (①의 임계: ≥78 좋음 / ≥62 보통 / <62 주의)
function scoreGrade(score: number): { key: HeroGrade; label: string } {
  if (score >= 78) return { key: "good", label: "좋음" };
  if (score >= 62) return { key: "ok", label: "보통" };
  return { key: "bad", label: "주의" };
}

// 지표 등급(good/normal/caution/bad) → 히어로 3색(초록/파랑/빨강)
function toneToGrade(tone: MetricGrade["tone"]): HeroGrade {
  if (tone === "good") return "good";
  if (tone === "normal") return "ok";
  return "bad";
}

// 등급 심각도(태그·최악 지표 판정용)
const SEVERITY: Record<HeroGrade, number> = { good: 0, ok: 1, bad: 2 };

function hourLabel(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  if (h === 0) return "밤 12시";
  if (h === 12) return "낮 12시";
  const period = h < 12 ? "오전" : "오후";
  const display = h <= 12 ? h : h - 12;
  return `${period} ${display}시`;
}

type TileDef = { key: string; label: string; icon: ReactNode; value: string; grade: HeroGrade; gradeLabel: string };

function tilesForSlot(slot: RunningSlot): TileDef[] {
  const feels = gradeTemperature(slot.apparentTemperature);
  const rain = gradePrecipitation(slot.precipitation, slot.precipitationProbability ?? 0);
  const wind = gradeWind(slot.windSpeed);
  const pmKnown = slot.pm25 !== null && slot.pm25 !== undefined;
  const pm = pmKnown ? gradePm25(slot.pm25 as number) : ({ label: "정보 없음", tone: "normal" } as MetricGrade);
  return [
    { key: "feels", label: "체감", icon: <Thermometer size={17} aria-hidden="true" />, value: `${Math.round(slot.apparentTemperature)}°`, grade: toneToGrade(feels.tone), gradeLabel: feels.label },
    { key: "rain", label: "강수", icon: <CloudRain size={17} aria-hidden="true" />, value: slot.precipitationProbability === null ? "—" : `${Math.round(slot.precipitationProbability)}%`, grade: toneToGrade(rain.tone), gradeLabel: rain.label },
    { key: "pm", label: "미세", icon: <Haze size={17} aria-hidden="true" />, value: pmKnown ? `${Math.round(slot.pm25 as number)}` : "—", grade: pmKnown ? toneToGrade(pm.tone) : "ok", gradeLabel: pm.label },
    { key: "wind", label: "풍속", icon: <Wind size={17} aria-hidden="true" />, value: `${slot.windSpeed.toFixed(1)}`, grade: toneToGrade(wind.tone), gradeLabel: wind.label }
  ];
}

// 배너 한 줄 설명 — 상황 연동
function bannerDetail(slot: RunningSlot, tiles: TileDef[], grade: HeroGrade): string {
  const worst = tiles.reduce((a, b) => (SEVERITY[b.grade] > SEVERITY[a.grade] ? b : a));
  if (worst.grade === "bad") {
    if (worst.key === "feels") return `체감 ${Math.round(slot.apparentTemperature)}°가 발목을 잡고 있어요.`;
    if (worst.key === "rain") return `비 가능성이 발목을 잡고 있어요.`;
    if (worst.key === "pm") return `미세먼지가 발목을 잡고 있어요.`;
    return `바람이 발목을 잡고 있어요.`;
  }
  if (grade === "good") return "네 지표 모두 양호해 지금 나가기 좋아요.";
  return "치명적인 지표 없이 대체로 무난해요.";
}

// 3시간 연속 구간 음영 계산
function threeHourWindows(slots: RunningSlot[]) {
  if (slots.length < 3) return { best: null as null | [number, number], worst: null as null | [number, number], ok: null as null | [number, number] };
  const sums = slots.slice(0, slots.length - 2).map((_, i) => ({ i, sum: slots[i].totalScore + slots[i + 1].totalScore + slots[i + 2].totalScore }));
  const sorted = [...sums].sort((a, b) => b.sum - a.sum);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  const overlaps = (a: number, b: number) => Math.abs(a - b) < 3;
  const ok = sorted.find((w) => w.i !== best.i && w.i !== worst.i && !overlaps(w.i, best.i)) ?? null;
  const range = (w: { i: number } | null): [number, number] | null => (w ? [w.i, w.i + 2] : null);
  return { best: range(best), worst: range(worst), ok: range(ok) };
}

type Props = {
  daySlots: RunningSlot[];
  initialHour: number;
  nowHour: number; // 현재 시(오늘 탭에서만 유효, 내일이면 -1)
  activityLabel: string;
  dayLabel: string; // "오늘" | "내일"
  sunrise: string | null;
  sunset: string | null;
  onAlarm: (slot: RunningSlot, windowLabel: string) => void;
};

const VB_W = 340;
const VB_H = 150;
const PLOT_TOP = 14;
const PLOT_BOT = 116;

// 특정 시(hour)에 가장 가까운 슬롯 인덱스
function nearestIndex(slots: RunningSlot[], hour: number): number {
  if (!slots.length) return 0;
  let idx = slots.findIndex((s) => s.hour === hour);
  if (idx < 0) idx = slots.reduce((best, s, i) => (Math.abs(s.hour - hour) < Math.abs(slots[best].hour - hour) ? i : best), 0);
  return Math.max(0, idx);
}

export function TodayHero({ daySlots, initialHour, nowHour, activityLabel, dayLabel, sunrise, sunset, onAlarm }: Props) {
  const slots = daySlots;
  const n = slots.length;
  const initialIndex = useMemo(() => nearestIndex(slots, initialHour), [slots, initialHour]);
  // 현재 시각이 그래프 범위 안이면 "지금" 마커를 표시(오늘 탭 전용)
  const nowIndex = useMemo(() => (nowHour >= 0 ? nearestIndex(slots, nowHour) : -1), [slots, nowHour]);
  const showNow = nowIndex >= 0 && slots.length > 0 && Math.abs(slots[nowIndex].hour - nowHour) <= 1;

  const [index, setIndex] = useState(initialIndex);
  // 사용자가 아직 바를 만지지 않았으면 커서를 현재 시각에 붙여둔다(시간이 흐르면 따라감).
  const [touched, setTouched] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    if (!touched && showNow && nowIndex >= 0) setIndex(nowIndex);
  }, [touched, showNow, nowIndex]);

  const active = slots[Math.min(index, n - 1)] ?? slots[0];
  const grade = scoreGrade(active.totalScore);
  const tiles = useMemo(() => tilesForSlot(active), [active]);
  const worstTile = useMemo(() => tiles.reduce((a, b) => (SEVERITY[b.grade] > SEVERITY[a.grade] ? b : a)), [tiles]);
  const detail = bannerDetail(active, tiles, grade.key);
  const windows = useMemo(() => threeHourWindows(slots), [slots]);

  const frac = (i: number) => (n > 1 ? i / (n - 1) : 0.5);
  const scoreY = (score: number) => PLOT_TOP + (1 - Math.max(0, Math.min(100, score)) / 100) * (PLOT_BOT - PLOT_TOP);
  const points = slots.map((s, i) => `${(frac(i) * VB_W).toFixed(1)},${scoreY(s.totalScore).toFixed(1)}`).join(" ");
  const areaPath = `M ${frac(0) * VB_W},${PLOT_BOT} L ${points.split(" ").join(" L ")} L ${frac(n - 1) * VB_W},${PLOT_BOT} Z`;

  const setFromClientX = (clientX: number) => {
    const el = trackRef.current;
    if (!el || n < 2) return;
    const rect = el.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    setTouched(true);
    setIndex(Math.round(f * (n - 1)));
  };
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    setFromClientX(e.clientX);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    setFromClientX(e.clientX);
  };
  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    draggingRef.current = false;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* noop */ }
  };
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); setTouched(true); setIndex((i) => Math.max(0, i - 1)); }
    else if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); setTouched(true); setIndex((i) => Math.min(n - 1, i + 1)); }
    else if (e.key === "Home") { e.preventDefault(); setTouched(true); setIndex(0); }
    else if (e.key === "End") { e.preventDefault(); setTouched(true); setIndex(n - 1); }
  };

  // 커서 말풍선 좌우 클램프
  const cursorFrac = frac(index);
  const bubbleClamp = Math.max(11, Math.min(89, cursorFrac * 100));
  // "지금" 마커 위치(현재 시각) — 바를 옮겨도 항상 표시
  const nowFrac = showNow ? frac(nowIndex) : 0;
  const nowLabelClamp = Math.max(6, Math.min(94, nowFrac * 100));
  const nowIsCursor = showNow && nowIndex === index;

  // 가로축 눈금(3시간 간격 정도)
  const ticks = slots.filter((s) => s.hour % 3 === 0);

  // 베스트 스트립: 초록 음영 구간
  const bestWin = windows.best;
  const bestSlots = bestWin ? slots.slice(bestWin[0], bestWin[1] + 1) : [];
  const bestPeak = bestSlots.length ? bestSlots.reduce((a, b) => (b.totalScore > a.totalScore ? b : a)) : active;
  const bestStart = bestSlots[0] ?? active;
  const bestEnd = bestSlots[bestSlots.length - 1] ?? active;
  const bestRangeLabel = bestSlots.length
    ? `${hourLabel(bestStart.hour)}–${hourLabel(bestEnd.hour)} · 최고 ${Math.round(bestPeak.totalScore)}점`
    : `${hourLabel(active.hour)} · ${Math.round(active.totalScore)}점`;
  const bestSpanHours = bestSlots.length ? bestEnd.hour - bestStart.hour + 1 : 1;

  const shadeLabel = (win: [number, number] | null, cls: string, text: string) => {
    if (!win) return null;
    const x0 = frac(win[0]) * VB_W;
    const x1 = frac(win[1]) * VB_W;
    const centerPct = (((x0 + x1) / 2) / VB_W) * 100;
    return (
      <>
        <rect className={`hero-shade hero-shade-${cls}`} x={x0} y={PLOT_TOP} width={x1 - x0} height={PLOT_BOT - PLOT_TOP} />
        <text className={`hero-shade-label hero-shade-label-${cls}`} x={(centerPct / 100) * VB_W} y={PLOT_TOP + 11} textAnchor="middle">{text}</text>
      </>
    );
  };

  return (
    <section className={`today-hero grade-${grade.key}`} aria-label={`${dayLabel} ${activityLabel} 시간대별 판단`}>
      {/* ① 판정 히어로 배너 */}
      <div className="today-banner">
        <div className="today-banner-left">
          <span className="today-banner-tag">{grade.label}</span>
          <h1 className="today-banner-title">{activityLabel} {grade.key === "good" ? "지금 딱 좋아요" : grade.key === "ok" ? "무난하게 괜찮아요" : "조금 아쉬워요"}</h1>
          <p className="today-banner-detail">{detail}</p>
        </div>
        <div className="today-banner-score" aria-hidden="true">
          <small className="today-banner-when">{hourLabel(active.hour)} 기준</small>
          <div className="today-banner-num"><strong>{Math.round(active.totalScore)}</strong><span>/100</span></div>
        </div>
      </div>

      {/* ② 시간대별 점수 스크러버 */}
      <div className="today-scrubber">
        <div
          className="today-track"
          ref={trackRef}
          role="slider"
          tabIndex={0}
          aria-label={`시간대 선택. 현재 ${hourLabel(active.hour)}, ${Math.round(active.totalScore)}점`}
          aria-valuemin={slots[0]?.hour ?? 6}
          aria-valuemax={slots[n - 1]?.hour ?? 21}
          aria-valuenow={active.hour}
          aria-valuetext={`${hourLabel(active.hour)} ${Math.round(active.totalScore)}점`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={onKeyDown}
          style={{ touchAction: "none" }}
        >
          <svg className="today-graph" viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="none" aria-hidden="true">
            {shadeLabel(windows.worst, "bad", "피하기")}
            {shadeLabel(windows.ok, "ok", "괜찮음")}
            {shadeLabel(windows.best, "good", "베스트")}
            <path className="today-graph-area" d={areaPath} />
            <polyline className="today-graph-line" points={points} vectorEffect="non-scaling-stroke" fill="none" />
            {showNow && !nowIsCursor ? (
              <line className="today-now-line" x1={nowFrac * VB_W} x2={nowFrac * VB_W} y1={PLOT_TOP - 2} y2={PLOT_BOT} vectorEffect="non-scaling-stroke" strokeDasharray="3 4" />
            ) : null}
            <line className="today-cursor-line" x1={cursorFrac * VB_W} x2={cursorFrac * VB_W} y1={PLOT_TOP - 2} y2={PLOT_BOT} vectorEffect="non-scaling-stroke" />
            <circle className="today-cursor-dot" cx={cursorFrac * VB_W} cy={scoreY(active.totalScore)} r="4.5" />
          </svg>
          {showNow ? (
            <span className={`today-now-badge${nowIsCursor ? " is-cursor" : ""}`} style={{ left: `${nowLabelClamp}%` }} aria-hidden="true">지금</span>
          ) : null}
          <div className="today-bubble" style={{ left: `${bubbleClamp}%` }}>
            <b>{hourLabel(active.hour)}</b><span>{Math.round(active.totalScore)}점</span>
          </div>
        </div>
        <div className="today-axis" aria-hidden="true">
          {ticks.map((s) => (
            <span key={s.hour} style={{ left: `${frac(slots.indexOf(s)) * 100}%` }}>{hourLabel(s.hour).replace(/^(오전|오후|낮|밤) /, "")}</span>
          ))}
        </div>
        <div className="today-legend" aria-hidden="true">
          <span className="lg-good">베스트</span><span className="lg-ok">괜찮음</span><span className="lg-bad">피하기</span>
        </div>
      </div>

      {/* ③ 시간 연동 지표 타일 */}
      <div className="today-tiles" aria-label={`${hourLabel(active.hour)} 지표`}>
        {tiles.map((t) => {
          const showTag = t.key === worstTile.key && grade.key !== "bad" && SEVERITY[worstTile.grade] >= 1;
          return (
            <div key={t.key} className={`today-tile tile-${t.grade}`}>
              <span className="today-tile-top">{t.icon}<em>{t.label}</em></span>
              <b>{t.value}</b>
              <small>{t.gradeLabel}</small>
              {showTag ? <span className={`today-tile-tag tag-${t.grade}`}>가장 아쉬움</span> : null}
            </div>
          );
        })}
      </div>

      {/* ④ 오늘의 베스트 시간 스트립 */}
      <div className="today-best">
        <div>
          <span className="today-best-kicker"><Sun size={15} aria-hidden="true" /> {dayLabel}의 베스트 시간</span>
          <b>{bestRangeLabel}</b>
          <small>이 {bestSpanHours}시간이 {dayLabel} 최고 · 체감 {Math.round(bestPeak.apparentTemperature)}°</small>
        </div>
        <button type="button" onClick={() => onAlarm(bestStart, `${hourLabel(bestStart.hour)}–${hourLabel(bestEnd.hour)}`)} aria-label="베스트 시간 알림">
          <BellRing size={19} aria-hidden="true" />
        </button>
      </div>

      {sunrise && sunset ? (
        <div className="today-sun" aria-label="일출과 일몰">
          <span><Sun size={14} aria-hidden="true" /> 일출 <b>{sunrise}</b></span>
          <span>일몰 <b>{sunset}</b></span>
        </div>
      ) : null}
    </section>
  );
}
