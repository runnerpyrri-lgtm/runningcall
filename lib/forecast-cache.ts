// 위치별 최근 예보를 제한된 시간 동안 보관해 네트워크 장애에도 다른 지역 데이터가 섞이지 않게 한다.
import type { LocationPoint, RawForecast } from "@/lib/weather";

export const FORECAST_CACHE_STORAGE_KEY = "outbom:forecast-cache:v1";
export const FORECAST_CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000;

type ForecastCacheEntry = {
  locationKey: string;
  savedAt: number;
  forecast: RawForecast;
};

type ForecastCacheData = {
  version: 1;
  entries: ForecastCacheEntry[];
};

type CacheStorage = Pick<Storage, "getItem" | "setItem">;

export function forecastLocationKey(location: Pick<LocationPoint, "latitude" | "longitude">): string {
  return `${location.latitude.toFixed(3)},${location.longitude.toFixed(3)}`;
}

function readData(storage: CacheStorage): ForecastCacheData {
  try {
    const parsed = JSON.parse(storage.getItem(FORECAST_CACHE_STORAGE_KEY) ?? "null") as ForecastCacheData | null;
    if (parsed?.version === 1 && Array.isArray(parsed.entries)) return parsed;
  } catch {
    // 깨진 캐시는 사용하지 않고 다음 정상 응답에서 교체한다.
  }
  return { version: 1, entries: [] };
}

export function readForecastCache(
  storage: CacheStorage,
  location: LocationPoint,
  now = Date.now(),
): ForecastCacheEntry | null {
  const entry = readData(storage).entries.find((item) => item.locationKey === forecastLocationKey(location));
  if (!entry || !Number.isFinite(entry.savedAt) || now - entry.savedAt > FORECAST_CACHE_MAX_AGE_MS) return null;
  if (!entry.forecast || !Array.isArray(entry.forecast.today) || !Array.isArray(entry.forecast.tomorrow)) return null;
  if (forecastLocationKey(entry.forecast.location) !== entry.locationKey) return null;
  return entry;
}

export function saveForecastCache(
  storage: CacheStorage,
  location: LocationPoint,
  forecast: RawForecast,
  savedAt = Date.now(),
): void {
  try {
    const locationKey = forecastLocationKey(location);
    const entries = readData(storage).entries.filter((item) => item.locationKey !== locationKey);
    const next: ForecastCacheData = {
      version: 1,
      entries: [{ locationKey, savedAt, forecast }, ...entries].slice(0, 5),
    };
    storage.setItem(FORECAST_CACHE_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // 사생활 보호 모드나 저장 공간 부족에서는 실시간 예보만 사용한다.
  }
}

export function forecastCacheAgeLabel(savedAt: number, now = Date.now()): string {
  const minutes = Math.max(1, Math.round((now - savedAt) / 60000));
  if (minutes < 60) return `${minutes}분 전`;
  return `${Math.round(minutes / 60)}시간 전`;
}
