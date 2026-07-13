// 활동과 현재 예보에 맞는 준비물 우선순위를 검증한다.
import { describe, expect, it } from "vitest";
import { getOutfitPlan } from "@/lib/outfit";
import type { RunningSlot } from "@/lib/scoring";

function makeSlot(overrides: Partial<RunningSlot> = {}): RunningSlot {
  return {
    time: "2026-07-12T14:00",
    hour: 14,
    temperature: 24,
    apparentTemperature: 24,
    humidity: 55,
    pm10: 20,
    pm25: 12,
    uvIndex: 4,
    precipitation: 0,
    precipitationProbability: 5,
    windSpeed: 3,
    totalScore: 80,
    dustScore: 90,
    uvScore: 80,
    temperatureScore: 80,
    humidityScore: 80,
    precipitationScore: 95,
    windScore: 95,
    comment: "좋음",
    tone: "good",
    ...overrides
  };
}

describe("활동별 최적 준비물", () => {
  it("더운 낮 러닝에는 러닝화·벨트와 물·러닝 고글을 분리해 추천한다", () => {
    const slot = makeSlot({ apparentTemperature: 29, uvIndex: 7 });
    const plan = getOutfitPlan([slot], slot, "run");

    expect(plan.packing.essential.map((item) => item.id)).toEqual(["run-shoes", "run-socks", "run-belt"]);
    expect(plan.packing.conditional.map((item) => item.id)).toContain("hot-hydration");
    expect(plan.packing.conditional.some((item) => item.label === "러닝 고글")).toBe(true);
  });

  it("비 오는 저녁 라이딩에는 헬멧을 고정하고 방수·조명 장비를 추가한다", () => {
    const slot = makeSlot({ hour: 20, uvIndex: 0, precipitation: 1, precipitationProbability: 80 });
    const plan = getOutfitPlan([slot], slot, "bike");

    expect(plan.packing.essential.some((item) => item.id === "bike-helmet")).toBe(true);
    expect(plan.packing.conditional.some((item) => item.label === "방수 재킷·라이트")).toBe(true);
    expect(plan.packing.conditional.some((item) => item.label === "전조등·후미등")).toBe(true);
  });

  it("추운 등산에는 수분·발 장비를 고정하고 정상용 겉옷을 더한다", () => {
    const slot = makeSlot({ apparentTemperature: 4, windSpeed: 9 });
    const plan = getOutfitPlan([slot], slot, "hike");

    expect(plan.packing.essential.map((item) => item.id)).toEqual(["hike-water", "hike-foot", "hike-route"]);
    expect(plan.packing.conditional.some((item) => item.label === "정상용 겉옷")).toBe(true);
  });

  it("맑고 선선한 출발에는 방수 장비를 생략 후보로 안내한다", () => {
    const slot = makeSlot({ apparentTemperature: 18, uvIndex: 1, precipitation: 0, precipitationProbability: 0 });
    const plan = getOutfitPlan([slot], slot, "walk");

    expect(plan.packing.skip.some((item) => item.id === "skip-rain")).toBe(true);
    expect(plan.packing.skip.some((item) => item.id === "skip-sun")).toBe(true);
  });
});
