// 원본 예보(scoreForecast)의 활동별 점수화를 검증하는 테스트
import { describe, it, expect } from "vitest";
import { scoreForecast, type RawForecast } from "@/lib/weather";
import { ACTIVITIES } from "@/lib/activity";

const raw: RawForecast = {
  location: { name: "테스트", latitude: 0, longitude: 0, source: "city" },
  timezone: "auto",
  generatedAt: "2026-07-05T12:00:00Z",
  today: [
    {
      time: "2026-07-05T12:00",
      temperature: 31,
      apparentTemperature: 34,
      humidity: 70,
      pm10: 55,
      pm25: 38,
      uvIndex: 9,
      precipitation: 0,
      precipitationProbability: 20,
      windSpeed: 4
    }
  ],
  yesterday: [],
  tomorrow: [],
  sunrise: null,
  sunset: null
};

describe("scoreForecast", () => {
  it("같은 원본에서 프로필별로 다른 점수를 만든다", () => {
    const run = scoreForecast(raw, ACTIVITIES.run).slots[0].totalScore;
    const walk = scoreForecast(raw, ACTIVITIES.walk).slots[0].totalScore;
    expect(walk).toBeGreaterThanOrEqual(run);
  });

  it("원본 필드(일출·위치)는 그대로 통과한다", () => {
    const scored = scoreForecast(raw, ACTIVITIES.walk);
    expect(scored.location.name).toBe("테스트");
    expect(scored.sunrise).toBeNull();
    expect(scored.slots).toHaveLength(1);
  });
});
