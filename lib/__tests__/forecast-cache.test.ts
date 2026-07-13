// 위치별 예보 캐시의 일치 조건, 만료, 보관 개수와 사용자용 경과 시간을 검증한다.
import { describe, expect, it } from "vitest";
import {
  FORECAST_CACHE_MAX_AGE_MS,
  forecastCacheAgeLabel,
  readForecastCache,
  saveForecastCache,
} from "@/lib/forecast-cache";
import type { LocationPoint, RawForecast } from "@/lib/weather";

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  };
}

function location(index = 0): LocationPoint {
  return { name: `위치 ${index}`, latitude: 37.5 + index, longitude: 127 + index, source: "city" };
}

function forecast(target: LocationPoint): RawForecast {
  return {
    location: target,
    timezone: "Asia/Seoul",
    generatedAt: "2026-07-13T00:00:00.000Z",
    today: [],
    yesterday: [],
    tomorrow: [],
    sunrise: null,
    sunset: null,
    sunriseTomorrow: null,
    sunsetTomorrow: null,
    airQualityAvailable: true,
  };
}

describe("forecast cache", () => {
  it("같은 좌표의 6시간 이내 예보만 복원한다", () => {
    const store = storage();
    const target = location();
    saveForecastCache(store, target, forecast(target), 1_000);
    expect(readForecastCache(store, target, 1_000 + FORECAST_CACHE_MAX_AGE_MS)?.forecast.location.name).toBe("위치 0");
    expect(readForecastCache(store, location(1), 2_000)).toBeNull();
    expect(readForecastCache(store, target, 1_001 + FORECAST_CACHE_MAX_AGE_MS)).toBeNull();
  });

  it("최근 위치 다섯 곳만 남기고 경과 시간을 읽기 쉽게 표시한다", () => {
    const store = storage();
    for (let index = 0; index < 6; index += 1) {
      const target = location(index);
      saveForecastCache(store, target, forecast(target), 1_000 + index);
    }
    expect(readForecastCache(store, location(0), 2_000)).toBeNull();
    expect(readForecastCache(store, location(5), 2_000)).not.toBeNull();
    expect(forecastCacheAgeLabel(0, 30 * 60 * 1000)).toBe("30분 전");
    expect(forecastCacheAgeLabel(0, 90 * 60 * 1000)).toBe("2시간 전");
  });
});
