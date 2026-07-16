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

  it("자정을 넘긴 캐시는 6시간 이내라도 버린다 — 어제 예보가 오늘로 보이면 안 된다", () => {
    const store = storage();
    const target = location();
    const data = forecast(target);
    // 2026-07-15 22:00 KST에 저장된 "오늘(7/15)" 예보
    data.today = [{ time: "2026-07-15T22:00" } as RawForecast["today"][number]];
    const savedAt = Date.parse("2026-07-15T13:00:00.000Z"); // 22:00 KST
    saveForecastCache(store, target, data, savedAt);
    // 같은 날 밤 23:30 KST → 유효
    expect(readForecastCache(store, target, Date.parse("2026-07-15T14:30:00.000Z"))).not.toBeNull();
    // 다음 날 새벽 03:00 KST (5시간 경과, 6시간 이내) → 날짜가 달라 폐기
    expect(readForecastCache(store, target, Date.parse("2026-07-15T18:00:00.000Z"))).toBeNull();
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
