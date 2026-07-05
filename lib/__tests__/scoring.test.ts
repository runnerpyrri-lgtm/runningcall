// 러닝 점수 불변(골든마스터)과 활동별 점수 차이를 검증하는 테스트
import { describe, it, expect } from "vitest";
import { calculateSlot, calculateRunningSlot, type HourlyInput } from "@/lib/scoring";
import { ACTIVITIES } from "@/lib/activity";
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

  it("비 오는 날 출퇴근 점수가 크게 깎인다 (강수 가중 최상)", () => {
    const rainy: HourlyInput = { ...hot, apparentTemperature: 20, uvIndex: 2, precipitation: 2, precipitationProbability: 90 };
    const dry: HourlyInput = { ...rainy, precipitation: 0, precipitationProbability: 0 };
    const wet = calculateSlot(rainy, ACTIVITIES.commute).totalScore;
    const fine = calculateSlot(dry, ACTIVITIES.commute).totalScore;
    expect(fine - wet).toBeGreaterThanOrEqual(30);
  });
});
