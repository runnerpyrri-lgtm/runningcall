// 활동별 오늘의 결론 + 강수 분석 — 5칸 grid를 대체한 도메인 모델을 검증한다.
import { describe, expect, it } from "vitest";
import { analyzeRain, buildActivityDaySummary } from "@/lib/insights";
import type { RunningSlot } from "@/lib/scoring";

function makeSlot(hour: number, overrides: Partial<RunningSlot> = {}): RunningSlot {
  return {
    time: `2026-07-10T${String(hour).padStart(2, "0")}:00`,
    temperature: 22,
    apparentTemperature: 18,
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

describe("analyzeRain", () => {
  it("비 없는 날은 state none, 중복 문구 재료를 만들지 않는다", () => {
    const analysis = analyzeRain([makeSlot(9), makeSlot(10)]);
    expect(analysis.state).toBe("none");
    expect(analysis.start).toBeNull();
    expect(analysis.weaken).toBeNull();
  });

  it("확률만 높으면 possible, 확률 최고 시각을 기준으로 삼는다", () => {
    const analysis = analyzeRain([makeSlot(9, { precipitationProbability: 30 }), makeSlot(16, { precipitationProbability: 65 })]);
    expect(analysis.state).toBe("possible");
    expect(analysis.peak?.hour).toBe(16);
    expect(analysis.maxProbability).toBe(65);
  });

  it("실제 비는 시작·절정·약화를 찾는다", () => {
    const slots = [
      makeSlot(14),
      makeSlot(15, { precipitation: 0.4, precipitationProbability: 70 }),
      makeSlot(16, { precipitation: 1.8, precipitationProbability: 80 }),
      makeSlot(17, { precipitation: 0.3, precipitationProbability: 60 }),
      makeSlot(18, { precipitation: 0, precipitationProbability: 20 })
    ];
    const analysis = analyzeRain(slots);
    expect(analysis.state).toBe("active");
    expect(analysis.start?.hour).toBe(15);
    expect(analysis.peak?.hour).toBe(16);
    expect(analysis.weaken?.hour).toBe(18);
  });

  it("자정 근처(밤 슬롯)까지 비가 이어지면 약화 시각이 없다", () => {
    const slots = [makeSlot(22, { precipitation: 1 }), makeSlot(23, { precipitation: 2 })];
    const analysis = analyzeRain(slots);
    expect(analysis.state).toBe("active");
    expect(analysis.weaken).toBeNull();
  });
});

describe("buildActivityDaySummary", () => {
  const base = (activity: Parameters<typeof buildActivityDaySummary>[0]["activity"], slots: RunningSlot[], bestHour: number | null = 9) =>
    buildActivityDaySummary({
      activity,
      slots,
      bestStartHour: bestHour,
      bestSlot: bestHour !== null ? slots.find((slot) => slot.hour === bestHour) ?? slots[0] : null,
      sunsetLabel: "19:54"
    });

  it("활동별 제목을 쓴다", () => {
    const slots = [makeSlot(9), makeSlot(10)];
    expect(base("walk", slots).title).toBe("걷기 좋은 시간");
    expect(base("run", slots).title).toBe("러닝하기 좋은 시간");
    expect(base("dog", slots).title).toBe("산책하기 좋은 시간");
    expect(base("hike", slots).title).toBe("등산 출발 추천");
    expect(base("bike", slots).title).toBe("라이딩하기 좋은 시간");
  });

  it("best window는 2시간 창으로 한 번만 표기한다", () => {
    const summary = base("walk", [makeSlot(22), makeSlot(23)], 22);
    expect(summary.bestWindow).toBe("22:00~00:00");
  });

  it("최저 점수가 60점이어도 주의 섹션을 만들지 않는다", () => {
    const slots = [makeSlot(9, { totalScore: 92 }), makeSlot(15, { totalScore: 60 }), makeSlot(20, { totalScore: 75 })];
    expect(base("walk", slots).caution).toBeNull();
  });

  it("실제 unsafe 시간이 있으면 bad 주의를 만든다", () => {
    const slots = [makeSlot(9), makeSlot(14, { totalScore: 30, apparentTemperature: 39 })];
    const caution = base("walk", slots).caution;
    expect(caution?.tone).toBe("bad");
    expect(caution?.reason).toContain("더위");
  });

  it("비 없는 날은 '비 걱정 낮음' 하나만 만든다 (비 시작/약화 중복 없음)", () => {
    const summary = base("walk", [makeSlot(9), makeSlot(10)]);
    expect(summary.rain.state).toBe("none");
    expect(summary.rain.headline).toBe("비 걱정 낮음");
    expect(summary.rain.detail).toBeNull();
  });

  it("비 예상이면 시작·약화·양을 한 줄에 담는다", () => {
    const slots = [
      makeSlot(15, { precipitation: 0.4, precipitationProbability: 70 }),
      makeSlot(16, { precipitation: 1.8, precipitationProbability: 80 }),
      makeSlot(18, { precipitation: 0, precipitationProbability: 20 })
    ];
    const summary = base("walk", slots, null);
    expect(summary.rain.state).toBe("active");
    expect(summary.rain.headline).toContain("비 시작");
    expect(summary.rain.detail).toContain("1.8mm");
  });

  it("추천 창이 없으면 bestWindow가 null이다", () => {
    const summary = base("walk", [makeSlot(23, { totalScore: 45 })], null);
    expect(summary.bestWindow).toBeNull();
  });

  it("일몰 시각을 담는다", () => {
    expect(base("walk", [makeSlot(9)]).daylight).toBe("19:54");
  });
});
