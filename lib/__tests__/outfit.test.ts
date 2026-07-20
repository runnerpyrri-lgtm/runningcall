// 활동과 현재 예보에 맞는 준비물 우선순위를 검증한다.
import { describe, expect, it } from "vitest";
import { getOutfitPlan, getPackingPlan } from "@/lib/outfit";
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

    expect(plan.packing.items.filter((item) => item.category === "required").map((item) => item.id)).toEqual(["run-shoes", "run-socks"]);
    // 더운 날 물은 한 항목으로만: 낯선 '전해질' 대신 '이온음료'로 표기한다.
    const water = plan.packing.items.filter((item) => item.emoji === "💧");
    expect(water).toHaveLength(1);
    expect(water[0]?.label).toBe("물·이온음료");
    expect(plan.packing.items.some((item) => /전해질/.test(item.label) || /전해질/.test(item.reason))).toBe(false);
    expect(plan.packing.items.some((item) => item.label === "러닝 고글")).toBe(true);
  });

  it("더운데 길게 러닝해도 물 항목은 딱 하나만 나온다(중복 제거)", () => {
    const slot = makeSlot({ apparentTemperature: 30, uvIndex: 7 });
    const long = getPackingPlan(slot, "run", "long");
    expect(long.items.filter((item) => item.emoji === "💧")).toHaveLength(1);
    // 물과 간식은 별개 항목으로 분리한다.
    expect(long.items.some((item) => item.id === "run-snack")).toBe(true);
  });

  it("비 오는 저녁 라이딩에는 헬멧을 고정하고 방수·조명 장비를 추가한다", () => {
    const slot = makeSlot({ hour: 20, uvIndex: 0, precipitation: 1, precipitationProbability: 80 });
    const plan = getOutfitPlan([slot], slot, "bike");

    expect(plan.packing.items.some((item) => item.id === "bike-helmet" && item.category === "required")).toBe(true);
    expect(plan.packing.items.some((item) => item.label === "방수 재킷·라이트")).toBe(true);
    expect(plan.packing.items.some((item) => item.label === "전조등·후미등")).toBe(true);
  });

  it("추운 등산에는 수분·발 장비를 고정하고 정상용 겉옷을 더한다", () => {
    const slot = makeSlot({ apparentTemperature: 4, windSpeed: 9 });
    const plan = getOutfitPlan([slot], slot, "hike");

    expect(plan.packing.items.filter((item) => item.category === "required").map((item) => item.id)).toEqual(["hike-foot", "hike-water", "hike-food"]);
    expect(plan.packing.items.some((item) => item.label === "정상용 겉옷")).toBe(true);
  });

  it("짧게·보통·길게 선택에 따라 추가 준비물을 늘린다", () => {
    const slot = makeSlot({ apparentTemperature: 18, uvIndex: 1, precipitation: 0, precipitationProbability: 0 });
    const short = getPackingPlan(slot, "walk", "short");
    const normal = getPackingPlan(slot, "walk", "normal");
    const long = getPackingPlan(slot, "walk", "long");

    expect(short.items.some((item) => item.id === "walk-battery")).toBe(false);
    expect(normal.items.some((item) => item.id === "walk-battery")).toBe(true);
    expect(long.items.some((item) => item.id === "walk-snack")).toBe(true);
    // 물은 길이와 상관없이 항상 한 항목만.
    expect(long.items.filter((item) => item.emoji === "💧")).toHaveLength(1);
  });

  it("다섯 활동 모두 준비물을 명시적 분류로 제공한다", () => {
    const slot = makeSlot({ apparentTemperature: 30, uvIndex: 8, precipitation: 1, precipitationProbability: 80, hour: 20 });
    for (const activity of ["walk", "run", "dog", "hike", "bike"] as const) {
      const plan = getPackingPlan(slot, activity, "long");
      expect(plan.items.length).toBeGreaterThanOrEqual(7);
      expect(plan.items.every((item) => ["required", "weather", "safety", "optional"].includes(item.category))).toBe(true);
      expect(plan.items.some((item) => item.category === "required")).toBe(true);
      expect(plan.items.some((item) => item.category === "safety")).toBe(true);
      expect(plan.items.some((item) => item.category === "optional")).toBe(true);
    }
  });
});
