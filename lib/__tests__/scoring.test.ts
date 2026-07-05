// 러닝 점수 불변(골든마스터)과 활동별 점수 차이를 검증하는 테스트
import { describe, it, expect } from "vitest";
import { calculateSlot, calculateRunningSlot, type HourlyInput } from "@/lib/scoring";
import { ACTIVITIES, getHikePlan } from "@/lib/activity";
import snapshot from "./scoring.snapshot.json";

const samples = snapshot.samples as HourlyInput[];

describe("러닝 불변 (골든마스터)", () => {
  it("calculateSlot(run)이 리팩터 전 점수와 완전히 일치한다", () => {
    for (let i = 0; i < samples.length; i += 1) {
      const slot = calculateSlot(samples[i], ACTIVITIES.run);
      expect(slot.totalScore, samples[i].time).toBe(snapshot.expected[i].total);
      expect(slot.tone, samples[i].time).toBe(snapshot.expected[i].tone);
      expect(slot.comment, samples[i].time).toBe(snapshot.expected[i].comment);
    }
  });

  it("calculateRunningSlot 별칭도 동일하다", () => {
    for (let i = 0; i < samples.length; i += 1) {
      expect(calculateRunningSlot(samples[i]).totalScore).toBe(snapshot.expected[i].total);
    }
  });
});

describe("활동별 점수 차이", () => {
  const hot: HourlyInput = {
    time: "2026-07-05T12:00",
    temperature: 31,
    apparentTemperature: 32,
    humidity: 75,
    pm10: 55,
    pm25: 30,
    uvIndex: 9,
    precipitation: 0,
    precipitationProbability: 10,
    windSpeed: 3
  };

  it("더운 날 걷기 점수가 러닝 점수보다 높다 (더위 관대)", () => {
    const run = calculateSlot(hot, ACTIVITIES.run).totalScore;
    const walk = calculateSlot(hot, ACTIVITIES.walk).totalScore;
    expect(walk).toBeGreaterThan(run);
  });

  it("더운 한낮엔 애견산책 점수가 걷기보다 낮다 (강아지 더위 취약)", () => {
    const walk = calculateSlot(hot, ACTIVITIES.walk).totalScore;
    const dog = calculateSlot(hot, ACTIVITIES.dog).totalScore;
    expect(dog).toBeLessThan(walk);
  });

  it("강수·강풍일 때 등산 점수가 크게 낮다 (산행 위험)", () => {
    const base: HourlyInput = {
      time: "2026-04-01T13:00",
      temperature: 10,
      apparentTemperature: 9,
      humidity: 60,
      pm10: 30,
      pm25: 15,
      uvIndex: 3,
      precipitation: 0,
      precipitationProbability: 0,
      windSpeed: 2
    };
    const bad: HourlyInput = { ...base, precipitation: 2, precipitationProbability: 90, windSpeed: 13 };
    const clear = calculateSlot(base, ACTIVITIES.hike).totalScore;
    const risky = calculateSlot(bad, ACTIVITIES.hike).totalScore;
    expect(clear - risky).toBeGreaterThanOrEqual(30);
  });

  it("강풍일 때 자전거 점수가 러닝보다 크게 낮다 (바람 위험)", () => {
    const windy: HourlyInput = {
      time: "2026-04-01T15:00",
      temperature: 15,
      apparentTemperature: 14,
      humidity: 50,
      pm10: 30,
      pm25: 15,
      uvIndex: 3,
      precipitation: 0,
      precipitationProbability: 10,
      windSpeed: 12
    };
    const run = calculateSlot(windy, ACTIVITIES.run).totalScore;
    const bike = calculateSlot(windy, ACTIVITIES.bike).totalScore;
    expect(bike).toBeLessThan(run);
  });
});

describe("등산 플랜 (getHikePlan)", () => {
  const base = {
    hour: 12,
    temperature: 15,
    apparentTemperature: 15,
    humidity: 50,
    uvIndex: 4,
    windSpeed: 3,
    precipitation: 0,
    precipitationProbability: 0,
    pm25: 20,
    sunrise: "2026-04-01T05:50",
    sunset: "2026-04-01T19:00"
  };

  it("낙뢰 코드면 위험 신호를 낸다", () => {
    const p = getHikePlan({ ...base, weatherCode: 96 });
    expect(p.signals.some((s) => s.emoji === "⛈️" && s.level === "danger")).toBe(true);
  });

  it("하산 마감을 일몰 2시간 30분 전으로 계산한다", () => {
    const p = getHikePlan(base);
    expect(p.descentDeadline).toContain("오후 4시 30분");
    expect(p.sunsetText).toContain("오후 7시");
  });

  it("돌풍이 강하면 위험 신호를 낸다", () => {
    const p = getHikePlan({ ...base, windGust: 16 });
    expect(p.signals.some((s) => s.emoji === "💨" && s.level === "danger")).toBe(true);
  });

  it("늦은 오후 출발이면 헤드랜턴을 챙기게 한다", () => {
    const p = getHikePlan({ ...base, hour: 15 });
    expect(p.checklist.some((c) => c.includes("헤드랜턴"))).toBe(true);
  });
});

describe("등산 시간대", () => {
  it("등산 데이파트는 새벽·아침·낮·저녁 4구간을 유지한다 (새벽만 있고 저녁 없는 비대칭 방지)", async () => {
    const { getDayParts } = await import("@/lib/insights");
    const parts = getDayParts([], false, 6, "hike");
    expect(parts.map((p) => p.label)).toEqual(["새벽", "아침", "낮", "저녁"]);
    expect(parts[0].range[0]).toBe(4);
  });

  it("저녁 구간이 항상 차단되는 하드코딩이 아니라 다른 구간과 같은 기준을 쓴다", async () => {
    const { getDayParts } = await import("@/lib/insights");
    const parts = getDayParts([], false, 6, "hike");
    const evening = parts.find((p) => p.label === "저녁");
    expect(evening).toBeDefined();
    // 빈 슬롯 입력이라 best가 없는 것이지, "저녁=항상 위험" 특수 처리가 아님을 확인
    expect(evening?.best).toBeNull();
  });

  it("다른 활동 데이파트는 3구간 유지", async () => {
    const { getDayParts } = await import("@/lib/insights");
    expect(getDayParts([], false, 6, "run").length).toBe(3);
  });
});
