// getRankedWindows 추천 시간대 선별·정렬·중복 제거·활동별 시작시각 로직을 잠그는 회귀 테스트
import { describe, it, expect } from "vitest";
import { getRankedWindows } from "@/lib/insights";
import type { RunningSlot } from "@/lib/scoring";

function slot(hour: number, totalScore: number, over: Partial<RunningSlot> = {}): RunningSlot {
  return {
    time: `2026-07-11T${String(hour).padStart(2, "0")}:00`,
    temperature: 20,
    apparentTemperature: 20,
    humidity: 50,
    pm10: 20,
    pm25: 10,
    uvIndex: 2,
    precipitation: 0,
    precipitationProbability: 0,
    windSpeed: 2,
    hour,
    totalScore,
    dustScore: 80,
    uvScore: 80,
    temperatureScore: 80,
    humidityScore: 80,
    precipitationScore: 80,
    windScore: 80,
    comment: "",
    tone: "good",
    ...over
  };
}

// 0~23시를 기본 80점으로 채우고 일부만 덮어쓴다.
function fill(overrides: Record<number, RunningSlot> = {}): RunningSlot[] {
  const arr: RunningSlot[] = [];
  for (let h = 0; h < 24; h += 1) arr.push(overrides[h] ?? slot(h, 80));
  return arr;
}

describe("getRankedWindows", () => {
  it("겹치지 않는 상위 구간을 평균 점수순으로 최대 3개 반환한다", () => {
    const slots = fill({ 12: slot(12, 95), 13: slot(13, 95) });
    const r = getRankedWindows(slots, false, 0, "walk");
    expect(r.length).toBe(3);
    expect(r[0].startHour).toBe(12); // 최고 평균이 1순위
    const used = new Set<number>();
    for (const w of r) {
      expect(used.has(w.startHour)).toBe(false);
      expect(used.has(w.startHour + 1)).toBe(false);
      used.add(w.startHour);
      used.add(w.startHour + 1);
    }
  });

  it("비 오는 구간(강수확률 60%+ 또는 강수량 0.2+)은 제외한다", () => {
    const slots = fill({ 6: slot(6, 80, { precipitationProbability: 70 }) });
    const r = getRankedWindows(slots, false, 0, "walk");
    expect(r.some((w) => w.startHour === 6)).toBe(false);
  });

  it("한쪽 시간이라도 55점 미만이면 그 구간을 제외한다", () => {
    const slots = fill({ 8: slot(8, 50) });
    const r = getRankedWindows(slots, false, 0, "walk");
    expect(r.some((w) => w.startHour === 7 || w.startHour === 8)).toBe(false);
  });

  it("오늘 탭에서는 현재 시각 이전 구간을 제외한다", () => {
    const slots = fill();
    const r = getRankedWindows(slots, true, 15, "walk");
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((w) => w.startHour >= 15)).toBe(true);
  });

  it("등산은 새벽 4시 구간부터, 그 외 활동은 6시부터 추천한다", () => {
    const slots = fill();
    const hike = getRankedWindows(slots, false, 0, "hike");
    const walk = getRankedWindows(slots, false, 0, "walk");
    expect(hike.some((w) => w.startHour === 4)).toBe(true);
    expect(walk.every((w) => w.startHour >= 6)).toBe(true);
  });

  it("대기질 결측(pm2.5 null)이면 미세 라벨을 '정보 없음'으로 표기한다", () => {
    const slots = fill({ 12: slot(12, 95, { pm25: null }), 13: slot(13, 90, { pm25: null }) });
    const r = getRankedWindows(slots, false, 0, "walk");
    const top = r.find((w) => w.startHour === 12);
    expect(top?.dustLabel).toBe("정보 없음");
  });
});
