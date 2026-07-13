// 강수 전용 시트 — generic 지표 UI를 빌리지 않고 "비가 오는가 → 언제 → 얼마나"를 한 화면에 답한다.
"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { analyzeRain, fmtAmPm, rainAmountText, rainDecision, type RainAnalysis } from "@/lib/insights";
import type { RunningSlot } from "@/lib/scoring";

const PERIODS = [
  { key: "dawn", label: "새벽", from: 0, to: 5, range: "0~6시" },
  { key: "morning", label: "오전", from: 6, to: 11, range: "6~12시" },
  { key: "afternoon", label: "오후", from: 12, to: 17, range: "12~18시" },
  { key: "evening", label: "저녁", from: 18, to: 20, range: "18~21시" },
  { key: "night", label: "밤", from: 21, to: 23, range: "21~24시" }
];

function headlineFor(analysis: RainAnalysis, dayLabel: string) {
  if (analysis.state === "active" && analysis.start && analysis.peak) {
    const weaken = analysis.weaken ? `, ${fmtAmPm(analysis.weaken.hour)}쯤 약화` : ", 밤까지 이어질 수 있어요";
    return {
      title: `${fmtAmPm(analysis.start.hour)} 시작${weaken}`,
      body: `가장 강한 때 ${fmtAmPm(analysis.peak.hour)} · ${rainAmountText(analysis.peak.precipitation)}/h · ${rainDecision(analysis.peak).action}`
    };
  }
  if (analysis.state === "possible" && analysis.peak) {
    return {
      title: `${fmtAmPm(analysis.peak.hour)}부터 비 가능성`,
      body: `최대 ${analysis.maxProbability}% · ${rainDecision(analysis.peak).action}`
    };
  }
  return {
    title: `${dayLabel} 비 걱정 낮음`,
    body: "24시간 동안 뚜렷한 강수 신호가 없어요."
  };
}

function periodSummary(slots: RunningSlot[]) {
  const analysis = analyzeRain(slots);
  const peakProb = Math.round(slots.reduce((max, slot) => Math.max(max, slot.precipitationProbability ?? 0), 0));
  if (analysis.state === "active" && analysis.start) {
    return { text: `${analysis.start.hour}시 비 시작 · 최대 ${rainAmountText(analysis.maxAmount)}`, tone: rainDecision(analysis.peak ?? analysis.start).tone };
  }
  if (analysis.state === "possible") {
    return { text: `비 가능성 최대 ${peakProb}%`, tone: "normal" as const };
  }
  return { text: "비 신호 없음", tone: "good" as const };
}

// 24시간 확률(면)·강수량(막대)을 한 화면 폭 SVG로 — 필수 가로 스크롤 없음, 탭으로 시각 선택.
function RainDayChart({
  slots,
  currentTime,
  analysis,
  selected,
  onSelect
}: {
  slots: RunningSlot[];
  currentTime: string | null;
  analysis: RainAnalysis;
  selected: RunningSlot | null;
  onSelect: (slot: RunningSlot) => void;
}) {
  const width = 346;
  const height = 168;
  const padL = 8;
  const padR = 8;
  const top = 18;
  const bottom = 26;
  const chartHeight = height - top - bottom;
  const baseY = height - bottom;
  const step = (width - padL - padR) / 24;
  const xFor = (hour: number) => padL + hour * step + step / 2;
  const probY = (prob: number) => top + chartHeight - (Math.min(prob, 100) / 100) * chartHeight;
  const amountMax = Math.max(analysis.maxAmount, 1);
  const barH = (mm: number) => (Math.min(mm, amountMax) / amountMax) * chartHeight;

  const probPoints = slots.map((slot) => `${xFor(slot.hour).toFixed(1)},${probY(slot.precipitationProbability ?? 0).toFixed(1)}`);
  const probLine = probPoints.join(" ");
  const probArea = `${padL + step / 2},${baseY} ${probLine} ${xFor(slots[slots.length - 1]?.hour ?? 23).toFixed(1)},${baseY}`;

  const nowSlot = currentTime ? slots.find((slot) => slot.time === currentTime) ?? null : null;
  const markers: Array<{ slot: RunningSlot; label: string; cls: string }> = [];
  if (analysis.start) markers.push({ slot: analysis.start, label: "시작", cls: "start" });
  if (analysis.peak && analysis.peak !== analysis.start) markers.push({ slot: analysis.peak, label: "절정", cls: "peak" });
  if (analysis.weaken) markers.push({ slot: analysis.weaken, label: "약화", cls: "weaken" });

  return (
    <div className="precip-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="24시간 강수확률과 강수량 그래프. 자세한 내용은 아래 시간대 요약을 참고하세요.">
        {[0, 50, 100].map((prob) => (
          <line key={prob} className="precip-grid" x1={padL} x2={width - padR} y1={probY(prob)} y2={probY(prob)} />
        ))}

        {slots.map((slot) =>
          slot.precipitation > 0 ? (
            <rect
              key={`bar-${slot.time}`}
              className="precip-bar"
              x={xFor(slot.hour) - step * 0.3}
              y={baseY - barH(slot.precipitation)}
              width={step * 0.6}
              height={barH(slot.precipitation)}
              rx={1.5}
            />
          ) : null
        )}

        <polygon className="precip-area" points={probArea} />
        <polyline className="precip-line" points={probLine} fill="none" />

        {nowSlot ? (
          <>
            <line className="precip-now-line" x1={xFor(nowSlot.hour)} x2={xFor(nowSlot.hour)} y1={top - 4} y2={baseY} />
            <text className="precip-now-tag" x={xFor(nowSlot.hour)} y={top - 7} textAnchor="middle">지금</text>
          </>
        ) : null}

        {markers.map((marker) => (
          <g key={marker.cls}>
            <circle
              className={`precip-mark precip-mark-${marker.cls}`}
              cx={xFor(marker.slot.hour)}
              cy={probY(marker.slot.precipitationProbability ?? 0)}
              r={4}
            />
          </g>
        ))}

        {selected ? (
          <line className="precip-sel-line" x1={xFor(selected.hour)} x2={xFor(selected.hour)} y1={top - 4} y2={baseY} />
        ) : null}

        {[0, 4, 8, 12, 16, 20].map((hour) => (
          <text key={hour} className="precip-axis" x={xFor(hour)} y={baseY + 16} textAnchor="middle">
            {hour}
          </text>
        ))}
        <text className="precip-axis" x={width - padR} y={baseY + 16} textAnchor="end">24시</text>

        {slots.map((slot) => (
          <rect
            key={`tap-${slot.time}`}
            x={xFor(slot.hour) - step / 2}
            y={top - 6}
            width={step}
            height={chartHeight + 12}
            fill="transparent"
            style={{ cursor: "pointer" }}
            onClick={() => onSelect(slot)}
          />
        ))}
      </svg>
      {markers.length > 0 ? (
        <p className="precip-marker-legend" aria-hidden="true">
          {markers.map((marker) => (
            <span key={marker.cls} className={`legend-${marker.cls}`}>
              <i /> {marker.label} {marker.slot.hour}시
            </span>
          ))}
        </p>
      ) : null}
    </div>
  );
}

export function PrecipitationSheet({
  slots,
  currentTime,
  dayLabel,
  onClose
}: {
  slots: RunningSlot[];
  currentTime: string | null;
  dayLabel: string;
  onClose: () => void;
}) {
  const analysis = analyzeRain(slots);
  const headline = headlineFor(analysis, dayLabel);
  const noRain = analysis.state === "none";
  const [selectedTime, setSelectedTime] = useState<string | null>(currentTime);
  const [openPeriod, setOpenPeriod] = useState<string | null>(null);
  const selected = selectedTime ? slots.find((slot) => slot.time === selectedTime) ?? null : null;
  const selectedDecision = selected ? rainDecision(selected) : null;
  const totalAmount = slots.reduce((sum, slot) => sum + slot.precipitation, 0);
  const umbrella = rainDecision(analysis.peak ?? slots[0]);

  const sheetRef = useRef<HTMLDivElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  // 열릴 때 제목으로 focus 이동, 닫히면 연 버튼으로 focus 복귀. Tab은 시트 안에서 순환.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    headingRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const items = Array.from(
        sheetRef.current?.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])') ?? []
      );
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
      opener?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-label={`${dayLabel} 강수 상세`} onClick={onClose}>
      <div ref={sheetRef} className="sheet precip-sheet" onClick={(event) => event.stopPropagation()}>
        <div className="sheet-topbar">
          <div className="sheet-grip" aria-hidden="true" />
          <button className="sheet-close" type="button" onClick={onClose} aria-label="닫기">
            <X size={18} />
          </button>
        </div>

        <div className={`precip-head tone-${noRain ? "good" : umbrella.tone}`}>
          <p className="precip-kicker">{dayLabel} 강수</p>
          <h2 ref={headingRef} tabIndex={-1}>{headline.title}</h2>
          <p>{headline.body}</p>
        </div>

        <RainDayChart slots={slots} currentTime={currentTime} analysis={analysis} selected={selected} onSelect={(slot) => setSelectedTime(slot.time)} />

        {selected && selectedDecision ? (
          <div className={`precip-selected tone-${selectedDecision.tone}`}>
            <b>{fmtAmPm(selected.hour)}</b>
            <span>
              {Math.round(selected.precipitationProbability ?? 0)}% · {rainAmountText(selected.precipitation)} · {selectedDecision.action}
            </span>
          </div>
        ) : null}

        {/* 스크린리더용 하루 요약 */}
        <p className="sr-only">
          {noRain
            ? `${dayLabel} 최대 강수확률 ${analysis.maxProbability}%, 뚜렷한 비 신호가 없어요.`
            : `${headline.title}. ${headline.body}`}
        </p>

        {noRain ? (
          <div className="precip-calm" aria-label="비 없는 날 요약">
            <span><small>최대 확률</small><b>{analysis.maxProbability}%</b></span>
            <span><small>예상 강수량</small><b>{rainAmountText(totalAmount)}</b></span>
            <span><small>우산 판단</small><b>{umbrella.action}</b></span>
          </div>
        ) : (
          <div className="precip-periods" aria-label={`${dayLabel} 시간대 강수 요약`}>
            {PERIODS.flatMap((period) => {
              const periodSlots = slots.filter((slot) => slot.hour >= period.from && slot.hour <= period.to);
              if (periodSlots.length === 0) return [];
              const summary = periodSummary(periodSlots);
              const open = openPeriod === period.key;
              return [
                <div className="precip-period" key={period.key}>
                  <button
                    type="button"
                    className={`precip-period-row tone-${summary.tone}${open ? " open" : ""}`}
                    aria-expanded={open}
                    onClick={() => setOpenPeriod(open ? null : period.key)}
                  >
                    <span className="precip-period-label">
                      {period.label}
                      <small>{period.range}</small>
                    </span>
                    <span className="precip-period-summary">{summary.text}</span>
                  </button>
                  {open ? (
                    <ul className="precip-hours">
                      {periodSlots.map((slot) => (
                        <li key={slot.time} className={slot.time === selectedTime ? "is-selected" : ""}>
                          <button type="button" onClick={() => setSelectedTime(slot.time)}>
                            <b>{slot.hour}시</b>
                            <span>{Math.round(slot.precipitationProbability ?? 0)}%</span>
                            <span>{rainAmountText(slot.precipitation)}</span>
                            <small>{rainDecision(slot).short}</small>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ];
            })}
          </div>
        )}
      </div>
    </div>
  );
}
