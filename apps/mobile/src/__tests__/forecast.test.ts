// 네이티브 걷기 출발 판단이 정상 예보와 결측 예보에서 안정적으로 동작하는지 검증한다.
import { describe, expect, it } from "vitest";
import { buildForecastSnapshot, scoreWalkingConditions, type ForecastApiResponse } from "../lib/forecast";

function response(): ForecastApiResponse {
  return {
    timezone: "UTC",
    hourly: {
      time: ["2026-07-16T01:00", "2026-07-16T02:00", "2026-07-16T03:00"],
      temperature_2m: [18, 19, 20],
      apparent_temperature: [18, 19, 20],
      precipitation: [0, 0, 0],
      precipitation_probability: [10, 5, 0],
      wind_speed_10m: [2, 1, 1],
      uv_index: [1, 1, 1]
    }
  };
}

describe("native forecast judgment", () => {
  it("현재 슬롯과 앞으로의 추천 슬롯을 저장 가능한 요약으로 만든다", () => {
    const snapshot = buildForecastSnapshot(response(), "현재 위치", new Date("2026-07-16T01:30:00.000Z"));
    expect(snapshot).toMatchObject({
      schemaVersion: 1,
      locationName: "현재 위치",
      forecastTime: "2026-07-16T01:00",
      judgment: "지금 출발하기 좋아요"
    });
    expect(snapshot.score).toBeGreaterThanOrEqual(80);
    expect(snapshot).not.toHaveProperty("latitude");
    expect(snapshot).not.toHaveProperty("longitude");
  });

  it("폭우에는 출발 점수 상한을 적용한다", () => {
    const scored = scoreWalkingConditions({
      temperature: 20,
      apparentTemperature: 20,
      precipitation: 5,
      precipitationProbability: 95,
      windSpeed: 1,
      uvIndex: 1
    });
    expect(scored.score).toBeLessThanOrEqual(25);
    expect(scored.judgment).toContain("미루는");
  });

  it("필수 시간별 값이 없으면 명확히 실패하고 이전 저장값을 덮지 않게 한다", () => {
    expect(() => buildForecastSnapshot({ hourly: { time: [] } }, "서울")).toThrow("시간별 예보");
  });
});
