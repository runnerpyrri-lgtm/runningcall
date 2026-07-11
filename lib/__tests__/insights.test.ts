// lib/insights.ts 순수함수(추천 시간대·조건 칩·지표 상세) 단위 테스트.
// 문구 테이블(HEADLINE_SCORE 등) 전체가 아니라, 선택/필터/정렬 로직을 검증한다.
import { describe, it, expect } from "vitest";
import { getRankedWindows, getDayParts, getConditionChips, getMetricDetail } from "@/lib/insights";
import type { RunningSlot } from "@/lib/scoring";

function makeSlot(hour: number, overrides: Partial<RunningSlot> = {}): RunningSlot {
  return {
    time: `2026-07-10T${String(hour).padStart(2, "0")}:00`,
    temperature: 22,
    apparentTemperature: 22,
    humidity: 50,
    pm10: 20,
    pm25: 10,
    uvIndex: 3,
    precipitation: 0,
    precipitationProbability: 5,
    windSpeed: 2,
    hour,
    totalScore: 85,
    dustScore: 90,
    uvScore: 90,
    temperatureScore: 90,
    humidityScore: 90,
    precipitationScore: 95,
    windScore: 95,
    comment: "",
    tone: "good",
    ...overrides
  };
}

describe("getRankedWindows", () => {
  it("2시간 연속 55점↑ · 평균 62점↑인 창만 고른다", () => {
    const slots = [makeSlot(9, { totalScore: 80 }), makeSlot(10, { totalScore: 80 })];
    const windows = getRankedWindows(slots, false, 0);
    expect(windows).toHaveLength(1);
    expect(windows[0].startHour).toBe(9);
  });

  it("비 오는(강수확률 60%↑) 시간대는 제외한다", () => {
    const slots = [
      makeSlot(9, { totalScore: 90, precipitationProbability: 70 }),
      makeSlot(10, { totalScore: 90, precipitationProbability: 70 })
    ];
    expect(getRankedWindows(slots, false, 0)).toHaveLength(0);
  });

  it("한 시간이라도 55점 미만이면 창에서 제외한다", () => {
    const slots = [makeSlot(9, { totalScore: 90 }), makeSlot(10, { totalScore: 40 })];
    expect(getRankedWindows(slots, false, 0)).toHaveLength(0);
  });

  it("오늘이면 이미 지난 시간대는 제외한다", () => {
    const slots = [makeSlot(9, { totalScore: 90 }), makeSlot(10, { totalScore: 90 })];
    expect(getRankedWindows(slots, true, 11)).toHaveLength(0);
    expect(getRankedWindows(slots, true, 8)).toHaveLength(1);
  });

  it("점수 높은 순으로 정렬하고 겹치지 않게 최대 3개만 고른다", () => {
    const slots = Array.from({ length: 17 }, (_, i) => makeSlot(6 + i, { totalScore: 70 + i }));
    const windows = getRankedWindows(slots, false, 0);
    expect(windows.length).toBeLessThanOrEqual(3);
    for (let i = 1; i < windows.length; i += 1) {
      expect(windows[i - 1].score).toBeGreaterThanOrEqual(windows[i].score);
    }
    const hoursUsed = windows.flatMap((w) => [w.startHour, w.startHour + 1]);
    expect(new Set(hoursUsed).size).toBe(hoursUsed.length);
  });

  it("등산은 새벽(4시)부터 창을 허용하고, 러닝은 6시 이전은 제외한다", () => {
    const slots = [makeSlot(4, { totalScore: 90 }), makeSlot(5, { totalScore: 90 })];
    expect(getRankedWindows(slots, false, 0, "hike")).toHaveLength(1);
    expect(getRankedWindows(slots, false, 0, "run")).toHaveLength(0);
  });
});

describe("getDayParts", () => {
  it("일반 활동은 아침/낮/저녁 3구간, 등산은 새벽 포함 4구간을 반환한다", () => {
    const slots = Array.from({ length: 24 }, (_, h) => makeSlot(h));
    expect(getDayParts(slots, false, 0, "run")).toHaveLength(3);
    expect(getDayParts(slots, false, 0, "hike")).toHaveLength(4);
  });

  it("구간 안에 조건(강수<1, 총점>=42) 만족 슬롯이 없으면 best가 null이다", () => {
    const rainySlots = Array.from({ length: 24 }, (_, h) => makeSlot(h, { precipitation: 5, totalScore: 20 }));
    const parts = getDayParts(rainySlots, false, 0, "run");
    expect(parts.every((p) => p.best === null)).toBe(true);
  });

  it("구간 안 최고점 슬롯을 best로 고른다", () => {
    const slots = Array.from({ length: 24 }, (_, h) => makeSlot(h, { totalScore: 50 }));
    slots[8] = makeSlot(8, { totalScore: 95 }); // 아침 구간(6~11) 안
    const morning = getDayParts(slots, false, 0, "run").find((p) => p.key === "morning");
    expect(morning?.best?.hour).toBe(8);
  });
});

describe("getConditionChips", () => {
  it("항상 정확히 3개를 반환한다", () => {
    expect(getConditionChips(makeSlot(9))).toHaveLength(3);
  });

  it("가장 극단적인(70점에서 먼) 지표부터 고른다", () => {
    const slot = makeSlot(9, { dustScore: 10, temperatureScore: 68, windScore: 69, uvScore: 71, humidityScore: 69 });
    const chips = getConditionChips(slot);
    expect(chips[0].key).toBe("dust");
    expect(chips[0].tone).toBe("bad");
  });

  it("65점 이상은 good, 40점 미만은 bad, 그 사이는 caution 톤이다", () => {
    const slot = makeSlot(9, { precipitationScore: 80, dustScore: 30, temperatureScore: 50 });
    const chips = getConditionChips(slot);
    const byKey = Object.fromEntries(chips.map((c) => [c.key, c.tone]));
    if (byKey.precip) expect(byKey.precip).toBe("good");
    if (byKey.dust) expect(byKey.dust).toBe("bad");
  });
});

describe("getMetricDetail", () => {
  it("marker는 항상 0~1 범위로 clamp된다 (범위 밖 값 포함)", () => {
    const cold = makeSlot(9, { apparentTemperature: -50 });
    const hot = makeSlot(9, { apparentTemperature: 90 });
    expect(getMetricDetail("feel", cold).marker).toBe(0);
    expect(getMetricDetail("feel", hot).marker).toBe(1);
  });

  it("체감온도가 rangeMin/rangeMax 사이일 때 marker가 비례한다", () => {
    // range -10~40, 값 15 → (15-(-10))/(40-(-10)) = 0.5
    const detail = getMetricDetail("feel", makeSlot(9, { apparentTemperature: 15 }));
    expect(detail.marker).toBeCloseTo(0.5, 5);
  });

  it("각 지표 키가 올바른 title과 unit을 반환한다", () => {
    expect(getMetricDetail("dust", makeSlot(9)).unit).toBe("㎍/m³");
    expect(getMetricDetail("uv", makeSlot(9)).unit).toBe("UVI");
    expect(getMetricDetail("wind", makeSlot(9)).unit).toBe("m/s");
    expect(getMetricDetail("humidity", makeSlot(9)).unit).toBe("%");
  });

  it("강수는 실제 비(0.1mm↑)면 mm, 아니면 강수확률(%)을 표시한다", () => {
    const withRain = getMetricDetail("precip", makeSlot(9, { precipitation: 2.5, precipitationProbability: 30 }));
    expect(withRain.unit).toBe("mm");
    expect(withRain.valueText).toBe("2.5");

    const noRain = getMetricDetail("precip", makeSlot(9, { precipitation: 0, precipitationProbability: 40 }));
    expect(noRain.unit).toBe("%");
    expect(noRain.valueText).toBe("40");
  });
});
