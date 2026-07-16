// Open-Meteo 시간별 예보를 걷기 중심의 최소 출발 판단과 저장 가능한 요약으로 변환한다.
export type ForecastSnapshot = {
  schemaVersion: 1;
  locationName: string;
  generatedAt: string;
  forecastTime: string;
  score: number;
  judgment: string;
  detail: string;
  bestTime: string;
  bestScore: number;
  metrics: {
    temperature: number;
    apparentTemperature: number;
    precipitation: number;
    precipitationProbability: number | null;
    windSpeed: number;
    uvIndex: number;
  };
};

export type ForecastApiResponse = {
  timezone?: string;
  hourly?: {
    time?: string[];
    temperature_2m?: (number | null)[];
    apparent_temperature?: (number | null)[];
    precipitation?: (number | null)[];
    precipitation_probability?: (number | null)[];
    wind_speed_10m?: (number | null)[];
    uv_index?: (number | null)[];
  };
};

type ScoredSlot = ForecastSnapshot["metrics"] & {
  time: string;
  score: number;
  judgment: string;
  detail: string;
};

const DEFAULT_FORECAST_API = "https://api.open-meteo.com/v1/forecast";

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function linearScore(value: number, points: [number, number][]) {
  if (value <= points[0][0]) return points[0][1];
  for (let index = 1; index < points.length; index += 1) {
    const [rightX, rightY] = points[index];
    const [leftX, leftY] = points[index - 1];
    if (value <= rightX) {
      const ratio = (value - leftX) / (rightX - leftX);
      return leftY + ratio * (rightY - leftY);
    }
  }
  return points[points.length - 1][1];
}

function scoreTemperature(apparentTemperature: number) {
  if (apparentTemperature >= 10 && apparentTemperature <= 22) return 100;
  return clamp(
    apparentTemperature < 10
      ? 100 - (10 - apparentTemperature) * 5
      : 100 - (apparentTemperature - 22) * 4
  );
}

function scorePrecipitation(amount: number, probability: number | null) {
  const amountScore = linearScore(amount, [[0, 100], [0.2, 86], [1, 52], [3, 22], [6, 0]]);
  if (probability === null) return clamp(amountScore);
  const probabilityScore = linearScore(probability, [[0, 100], [30, 90], [50, 68], [70, 42], [90, 12], [100, 0]]);
  return clamp(amountScore * 0.6 + probabilityScore * 0.4);
}

function scoreWind(speed: number) {
  return clamp(linearScore(speed, [[0, 100], [2, 100], [4, 88], [6, 72], [9, 50], [12, 28], [15, 8], [18, 0]]));
}

function scoreUv(uvIndex: number) {
  return clamp(linearScore(uvIndex, [[0, 100], [2, 100], [5, 82], [7, 54], [10, 20], [12, 0]]));
}

function judgmentFor(score: number) {
  if (score >= 80) return "지금 출발하기 좋아요";
  if (score >= 65) return "무난하게 다녀올 수 있어요";
  if (score >= 45) return "준비하고 짧게 다녀오세요";
  return "지금은 미루는 편이 좋아요";
}

function detailFor(metrics: ForecastSnapshot["metrics"]) {
  if (metrics.precipitation >= 1 || (metrics.precipitationProbability ?? 0) >= 70) {
    return "비 가능성이 높아요. 우산과 미끄럼에 대비하세요.";
  }
  if (metrics.apparentTemperature >= 30) return "체감온도가 높아요. 물과 그늘 휴식을 챙기세요.";
  if (metrics.apparentTemperature <= 0) return "체감온도가 낮아요. 보온과 노면 상태를 확인하세요.";
  if (metrics.windSpeed >= 9) return "바람이 강해요. 얇은 겉옷과 낙하물에 주의하세요.";
  if (metrics.uvIndex >= 7) return "자외선이 강해요. 모자와 자외선 차단제를 챙기세요.";
  return "체감온도·비·바람·자외선 기준으로 큰 부담이 적어요.";
}

export function scoreWalkingConditions(metrics: ForecastSnapshot["metrics"]) {
  const raw = scoreTemperature(metrics.apparentTemperature) * 0.38
    + scorePrecipitation(metrics.precipitation, metrics.precipitationProbability) * 0.34
    + scoreWind(metrics.windSpeed) * 0.16
    + scoreUv(metrics.uvIndex) * 0.12;
  let score = clamp(raw);
  if (metrics.precipitation >= 4) score = Math.min(score, 25);
  else if (metrics.precipitation >= 1) score = Math.min(score, 45);
  else if ((metrics.precipitationProbability ?? 0) >= 80) score = Math.min(score, 60);
  if (metrics.apparentTemperature >= 36 || metrics.windSpeed >= 14) score = Math.min(score, 40);
  return { score, judgment: judgmentFor(score), detail: detailFor(metrics) };
}

function finiteNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function hourKey(now: Date, timezone: string | undefined) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone && timezone !== "auto" ? timezone : "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23"
    }).formatToParts(now);
    const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "00";
    return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}`;
  } catch {
    return now.toISOString().slice(0, 13);
  }
}

function readSlot(response: ForecastApiResponse, index: number): ScoredSlot | null {
  const hourly = response.hourly;
  const time = hourly?.time?.[index];
  const temperature = finiteNumber(hourly?.temperature_2m?.[index]);
  const apparentTemperature = finiteNumber(hourly?.apparent_temperature?.[index]);
  const precipitation = finiteNumber(hourly?.precipitation?.[index]);
  const windSpeed = finiteNumber(hourly?.wind_speed_10m?.[index]);
  const uvIndex = finiteNumber(hourly?.uv_index?.[index]);
  if (!time || temperature === null || apparentTemperature === null || precipitation === null || windSpeed === null || uvIndex === null) {
    return null;
  }
  const metrics: ForecastSnapshot["metrics"] = {
    temperature,
    apparentTemperature,
    precipitation,
    precipitationProbability: finiteNumber(hourly?.precipitation_probability?.[index]),
    windSpeed,
    uvIndex
  };
  return { time, ...metrics, ...scoreWalkingConditions(metrics) };
}

export function buildForecastSnapshot(
  response: ForecastApiResponse,
  locationName: string,
  now = new Date()
): ForecastSnapshot {
  const times = response.hourly?.time ?? [];
  if (times.length === 0) throw new Error("시간별 예보가 없습니다.");
  const currentHour = hourKey(now, response.timezone);
  const startIndex = Math.max(0, times.findIndex((time) => time.slice(0, 13) >= currentHour));
  const slots = times
    .slice(startIndex, startIndex + 13)
    .map((_, offset) => readSlot(response, startIndex + offset))
    .filter((slot): slot is ScoredSlot => slot !== null);
  if (slots.length === 0) throw new Error("사용 가능한 예보가 없습니다.");
  const current = slots[0];
  const best = slots.reduce((candidate, slot) => slot.score > candidate.score ? slot : candidate, current);
  return {
    schemaVersion: 1,
    locationName,
    generatedAt: now.toISOString(),
    forecastTime: current.time,
    score: current.score,
    judgment: current.judgment,
    detail: current.detail,
    bestTime: best.time,
    bestScore: best.score,
    metrics: {
      temperature: current.temperature,
      apparentTemperature: current.apparentTemperature,
      precipitation: current.precipitation,
      precipitationProbability: current.precipitationProbability,
      windSpeed: current.windSpeed,
      uvIndex: current.uvIndex
    }
  };
}

export async function fetchForecastSnapshot(options: {
  latitude: number;
  longitude: number;
  locationName: string;
}) {
  const endpoint = process.env.EXPO_PUBLIC_FORECAST_API_URL?.trim() || DEFAULT_FORECAST_API;
  const url = new URL(endpoint);
  url.searchParams.set("latitude", String(options.latitude));
  url.searchParams.set("longitude", String(options.longitude));
  url.searchParams.set(
    "hourly",
    "temperature_2m,apparent_temperature,precipitation,precipitation_probability,wind_speed_10m,uv_index"
  );
  url.searchParams.set("wind_speed_unit", "ms");
  url.searchParams.set("forecast_days", "2");
  url.searchParams.set("timezone", "auto");

  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: { Accept: "application/json" }
    });
    if (!response.ok) throw new Error(`예보 요청 실패 ${response.status}`);
    return buildForecastSnapshot(await response.json() as ForecastApiResponse, options.locationName);
  } finally {
    globalThis.clearTimeout(timeout);
  }
}
