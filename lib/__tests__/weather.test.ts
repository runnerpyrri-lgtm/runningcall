// 원본 예보(scoreForecast)의 활동별 점수화 + 대기질 결측 전파를 검증하는 테스트
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import {
  dateKeyInTimezone,
  fetchRawForecast,
  hourInTimezone,
  scoreForecast,
  shiftDateKey,
  zonedDateTimeToMs,
  type RawForecast,
} from "@/lib/weather";
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
  sunset: null,
  sunriseTomorrow: null,
  sunsetTomorrow: null,
  airQualityAvailable: true
};

describe("scoreForecast", () => {
  it("같은 원본에서 프로필별로 다른 점수를 만든다", () => {
    const run = scoreForecast(raw, ACTIVITIES.run).slots[0].totalScore;
    const walk = scoreForecast(raw, ACTIVITIES.walk).slots[0].totalScore;
    expect(walk).toBeGreaterThanOrEqual(run);
  });

  it("원본 필드(일출·위치·대기질 가용 여부)는 그대로 통과한다", () => {
    const scored = scoreForecast(raw, ACTIVITIES.walk);
    expect(scored.location.name).toBe("테스트");
    expect(scored.sunrise).toBeNull();
    expect(scored.slots).toHaveLength(1);
    expect(scored.airQualityAvailable).toBe(true);
  });
});

describe("fetchRawForecast 대기질 결측 처리", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-10T03:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const weatherBody = {
    timezone: "Asia/Seoul",
    hourly: {
      time: ["2026-07-09T09:00", "2026-07-10T09:00", "2026-07-11T09:00"],
      temperature_2m: [20, 21, 22],
      apparent_temperature: [20, 21, 22],
      relative_humidity_2m: [50, 50, 50],
      uv_index: [3, 3, 3],
      precipitation: [0, 0, 0],
      precipitation_probability: [10, null, 10],
      wind_speed_10m: [2, 2, 2],
      wind_gusts_10m: [3, 3, 3],
      weather_code: [0, 0, 0],
      visibility: [20000, 20000, 20000],
      cloud_cover: [10, 10, 10],
      snowfall: [0, 0, 0]
    },
    daily: { time: ["2026-07-09", "2026-07-10", "2026-07-11"], sunrise: [], sunset: [] }
  };

  it("대기질 API 장애 시 pm은 null, airQualityAvailable=false (예보 자체는 성공)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("air-quality")) {
          throw new Error("air quality down");
        }
        return new Response(JSON.stringify(weatherBody), { status: 200 });
      })
    );

    const forecast = await fetchRawForecast({ name: "테스트", latitude: 37, longitude: 127, source: "city" });
    expect(forecast.airQualityAvailable).toBe(false);
    expect(forecast.today[0].pm25).toBeNull();
    expect(forecast.today[0].pm10).toBeNull();
    // 결측 강수확률(null)도 0으로 뭉개지 않고 null로 보존한다
    expect(forecast.today[0].precipitationProbability).toBeNull();
  });

  it("대기질 응답이 정상이면 값이 채워지고 airQualityAvailable=true", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("air-quality")) {
          return new Response(
            JSON.stringify({
              hourly: {
                time: weatherBody.hourly.time,
                pm10: [30, 30, 30],
                pm2_5: [12, 12, 12]
              }
            }),
            { status: 200 }
          );
        }
        return new Response(JSON.stringify(weatherBody), { status: 200 });
      })
    );

    const forecast = await fetchRawForecast({ name: "테스트", latitude: 37, longitude: 127, source: "city" });
    expect(forecast.airQualityAvailable).toBe(true);
    expect(forecast.today[0].pm25).toBe(12);
  });

  it("대기질 timestamp가 없으면 같은 배열 index 값을 잘못 붙이지 않는다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes("air-quality")) {
          return new Response(JSON.stringify({ hourly: { time: ["2026-07-09T09:00"], pm10: [99], pm2_5: [88] } }));
        }
        return new Response(JSON.stringify(weatherBody));
      }),
    );
    const forecast = await fetchRawForecast({ name: "테스트", latitude: 37, longitude: 127, source: "city" });
    expect(forecast.today[0].pm10).toBeNull();
    expect(forecast.today[0].pm25).toBeNull();
  });

  it("핵심 기상값이 빠진 시간은 0으로 위장하지 않고 제외한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes("air-quality")) {
          return new Response(JSON.stringify({ hourly: { time: weatherBody.hourly.time, pm10: [10, 10, 10], pm2_5: [5, 5, 5] } }));
        }
        const incomplete = structuredClone(weatherBody);
        incomplete.hourly.temperature_2m[1] = null as unknown as number;
        return new Response(JSON.stringify(incomplete));
      }),
    );
    await expect(
      fetchRawForecast({ name: "테스트", latitude: 37, longitude: 127, source: "city" }),
    ).rejects.toThrow("No forecast data returned for local date");
  });
});

describe("timezone 날짜 선택", () => {
  it("KST의 실제 오늘과 전후 날짜를 계산한다", () => {
    const now = new Date("2026-07-10T16:30:00Z");
    expect(dateKeyInTimezone(now, "Asia/Seoul")).toBe("2026-07-11");
    expect(shiftDateKey("2026-07-11", -1)).toBe("2026-07-10");
    expect(shiftDateKey("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("같은 순간의 현지 시각을 지역별로 정확히 계산한다", () => {
    const now = new Date("2026-07-10T16:30:00Z");
    expect(hourInTimezone(now, "Asia/Seoul")).toBe(1);
    expect(hourInTimezone(now, "UTC")).toBe(16);
    expect(hourInTimezone(now, "America/New_York")).toBe(12);
  });

  it("timezone 없는 예보 시각을 해당 지역의 epoch로 변환한다", () => {
    expect(new Date(zonedDateTimeToMs("2026-07-11T01:30", "Asia/Seoul")).toISOString()).toBe(
      "2026-07-10T16:30:00.000Z",
    );
    expect(new Date(zonedDateTimeToMs("2026-07-10T16:30", "UTC")).toISOString()).toBe(
      "2026-07-10T16:30:00.000Z",
    );
    expect(new Date(zonedDateTimeToMs("2026-07-10T12:30", "America/New_York")).toISOString()).toBe(
      "2026-07-10T16:30:00.000Z",
    );
  });
});
