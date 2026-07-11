// 추천 시간대 계산의 모바일 CTA 노출 경계를 검증하는 단위 테스트
import { describe, expect, it } from "vitest";
import { getRankedWindows } from "@/lib/insights";
import type { RunningSlot } from "@/lib/scoring";

function slot(hour: number, totalScore = 80, overrides: Partial<RunningSlot> = {}): RunningSlot {
  return {
    time: `2026-07-11T${String(hour).padStart(2, "0")}:00`,
    hour,
    totalScore,
    temperature: 20,
    apparentTemperature: 20,
    humidity: 50,
    pm10: 20,
    pm25: 10,
    uvIndex: 2,
    precipitation: 0,
    precipitationProbability: 0,
    windSpeed: 2,
    dustScore: 100,
    uvScore: 100,
    temperatureScore: 100,
    humidityScore: 100,
    precipitationScore: 100,
    windScore: 100,
    comment: "좋아요",
    tone: "good",
    ...overrides
  };
}

describe("추천 시간대 CTA 경계", () => {
  it("오늘은 이미 지난 시작 시간대를 제외한다", () => {
    const ranked = getRankedWindows([slot(8, 95), slot(9, 95), slot(10, 80), slot(11, 80)], true, 10, "walk");
    expect(ranked.map((window) => window.startHour)).toEqual([10]);
  });

  it("내일은 현재 시각과 무관하게 이른 추천을 유지한다", () => {
    const ranked = getRankedWindows([slot(6, 82), slot(7, 84)], false, 20, "run");
    expect(ranked[0]?.startHour).toBe(6);
  });

  it("비 임계값이나 한 시간의 낮은 점수면 CTA 결과를 만들지 않는다", () => {
    expect(
      getRankedWindows([slot(10, 90, { precipitationProbability: 60 }), slot(11, 90)], false, 0, "walk")
    ).toEqual([]);
    expect(getRankedWindows([slot(10, 54), slot(11, 90)], false, 0, "walk")).toEqual([]);
  });

  it("등산만 새벽 4시 시작 추천을 허용한다", () => {
    const dawn = [slot(4, 84), slot(5, 86)];
    expect(getRankedWindows(dawn, false, 0, "hike")[0]?.startHour).toBe(4);
    expect(getRankedWindows(dawn, false, 0, "run")).toEqual([]);
  });
});
