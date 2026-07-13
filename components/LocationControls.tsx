// 위치 control — 전체 폭 한 줄 bar. 위치 변경 행동은 이 bar 한 곳에만 둔다.
"use client";

import { ChevronRight, MapPin, RefreshCw } from "lucide-react";
import type { LocationDisplayModel } from "@/lib/location-display";

export function LocationBar({
  display,
  pending,
  onOpen
}: {
  display: LocationDisplayModel;
  pending: boolean;
  onOpen: (trigger: HTMLElement) => void;
}) {
  // 세부 지역을 아직 모르면 두 번째 조각을 아예 만들지 않아 빈 공간·layout shift가 없다.
  const inline = pending
    ? display.title
      ? `${display.title} · 위치 확인 중`
      : "위치 확인 중"
    : display.inline;

  return (
    <button
      className="location-bar"
      type="button"
      onClick={(event) => onOpen(event.currentTarget)}
      aria-label={`위치 변경, 현재 ${inline}`}
    >
      <span className="location-bar-icon" aria-hidden="true">
        {pending ? <RefreshCw size={19} className="spin" /> : <MapPin size={19} />}
      </span>
      <span className="location-bar-text" aria-live="polite">{inline}</span>
      <ChevronRight size={18} aria-hidden="true" />
    </button>
  );
}
