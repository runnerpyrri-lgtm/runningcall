// 다른 추천 시간 — 결론 카드의 best와 겹치지 않는 대안만 compact row로 보여준다.
"use client";

import { BellRing } from "lucide-react";
import type { RankedWindow } from "@/lib/insights";
import { formatTwoHourWindow } from "@/lib/insights";
import type { RunningSlot } from "@/lib/scoring";

export type RecommendationEntry = { win: RankedWindow; start: RunningSlot; label: string };

export function RecommendationList({
  entries,
  onAlarm
}: {
  entries: RecommendationEntry[];
  onAlarm: (entry: RecommendationEntry) => void;
}) {
  // 대안이 없으면 section 자체를 만들지 않는다 — best 중복도, 빈 목록도 없다.
  if (entries.length === 0) return null;

  return (
    <section className="alt-windows" aria-label="다른 추천 시간">
      <h3>다른 추천 시간</h3>
      <div className="alt-windows-list">
        {entries.map((entry) => (
          <article key={entry.win.startHour}>
            <div>
              <strong>{formatTwoHourWindow(entry.win.startHour)}</strong>
              <span>
                2시간 평균 {Math.round(entry.win.score)}점 · 체감 {entry.win.feel}° · 비 {entry.win.precipProb}%
              </span>
            </div>
            <button
              type="button"
              onClick={() => onAlarm(entry)}
              aria-label={`${formatTwoHourWindow(entry.win.startHour)} 알림 켜기`}
            >
              <BellRing size={18} />
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
