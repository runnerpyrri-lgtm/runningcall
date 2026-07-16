// 위치 좌표를 제외한 마지막 출발 판단과 예보 요약만 기기 로컬 저장소에 보존한다.
import Storage from "expo-sqlite/kv-store";
import type { ForecastSnapshot } from "./forecast";

export const LAST_FORECAST_KEY = "outbom:native:last-forecast:v1";

function isForecastSnapshot(value: unknown): value is ForecastSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<ForecastSnapshot>;
  const metrics = snapshot.metrics as Partial<ForecastSnapshot["metrics"]> | undefined;
  return snapshot.schemaVersion === 1
    && typeof snapshot.locationName === "string"
    && typeof snapshot.generatedAt === "string"
    && typeof snapshot.forecastTime === "string"
    && typeof snapshot.judgment === "string"
    && typeof snapshot.detail === "string"
    && typeof snapshot.bestTime === "string"
    && typeof snapshot.score === "number"
    && Number.isFinite(snapshot.score)
    && typeof snapshot.bestScore === "number"
    && Number.isFinite(snapshot.bestScore)
    && typeof metrics?.temperature === "number"
    && typeof metrics.apparentTemperature === "number"
    && typeof metrics.precipitation === "number"
    && (metrics.precipitationProbability === null || typeof metrics.precipitationProbability === "number")
    && typeof metrics.windSpeed === "number"
    && typeof metrics.uvIndex === "number";
}

export async function loadForecastSnapshot() {
  try {
    const raw = await Storage.getItem(LAST_FORECAST_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isForecastSnapshot(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function saveForecastSnapshot(snapshot: ForecastSnapshot) {
  try {
    await Storage.setItem(LAST_FORECAST_KEY, JSON.stringify(snapshot));
    return true;
  } catch {
    return false;
  }
}
