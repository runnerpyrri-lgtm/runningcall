// 활동별 오늘의 결론 — best 시간 하나, 이유 한 문장, 조건부 비·주의 정보만 담는 단일 카드.
"use client";

import { BellRing, CloudRain, Sun } from "lucide-react";
import type { ActivityDaySummary } from "@/lib/insights";

export function ActivityDaySummaryCard({
  summary,
  dayLabel,
  onAlarm
}: {
  summary: ActivityDaySummary;
  dayLabel: string;
  onAlarm: (() => void) | null;
}) {
  return (
    <section className="day-conclusion" aria-label={`${dayLabel} ${summary.title}`}>
      <div className="day-conclusion-head">
        <h3>{summary.title}</h3>
        {onAlarm && summary.bestWindow ? (
          <button type="button" className="day-conclusion-bell" onClick={onAlarm} aria-label={`${summary.bestWindow} 알림 켜기`}>
            <BellRing size={19} />
          </button>
        ) : null}
      </div>

      {summary.bestWindow ? (
        <p className="day-conclusion-window">{summary.bestWindow}</p>
      ) : (
        <p className="day-conclusion-window is-empty">추천 시간 없음</p>
      )}
      <p className="day-conclusion-reason">{summary.reason}</p>

      <div className="day-conclusion-chips" aria-label="핵심 조건">
        <span className={`day-chip rain-${summary.rain.state}`}>
          <CloudRain size={14} aria-hidden="true" />
          {summary.rain.headline}
        </span>
        {summary.daylight ? (
          <span className="day-chip">
            <Sun size={14} aria-hidden="true" />
            일몰 {summary.daylight}
          </span>
        ) : null}
      </div>
      {summary.rain.detail ? <p className="day-conclusion-rain-detail">{summary.rain.detail}</p> : null}

      {summary.caution ? (
        <div className={`day-conclusion-caution tone-${summary.caution.tone}`} role="note">
          <strong>{summary.caution.label}</strong>
          <span>
            {summary.caution.time} · {summary.caution.reason}
          </span>
        </div>
      ) : null}
    </section>
  );
}
