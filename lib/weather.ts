import { calculateRunningSlot, type HourlyInput, type RunningSlot } from "@/lib/scoring";

export type LocationPoint = {
  name: string;
  latitude: number;
  longitude: number;
  source: "city" | "gps" | "search";
};

export type RunningForecast = {
  location: LocationPoint;
  timezone: string;
  generatedAt: string;
  slots: RunningSlot[];
  yesterday: RunningSlot[];
  tomorrow: RunningSlot[];
  sunrise: string | null;
  sunset: string | null;
};

type WeatherResponse = {
  timezone?: string;
  hourly?: {
    time?: string[];
    temperature_2m?: Array<number | null>;
    apparent_temperature?: Array<number | null>;
    relative_humidity_2m?: Array<number | null>;
    uv_index?: Array<number | null>;
    precipitation?: Array<number | null>;
    precipitation_probability?: Array<number | null>;
    wind_speed_10m?: Array<number | null>;
  };
  daily?: {
    time?: string[];
    sunrise?: string[];
    sunset?: string[];
  };
};

type AirQualityResponse = {
  hourly?: {
    time?: string[];
    pm10?: Array<number | null>;
    pm2_5?: Array<number | null>;
  };
};

function ensureNumber(value: number | null | undefined, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function buildUrl(base: string, params: Record<string, string | number>) {
  const url = new URL(base);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, String(value));
  });
  return url.toString();
}

async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 9000);

  const response = await fetch(url, {
    signal: controller.signal,
    headers: {
      Accept: "application/json"
    }
  }).finally(() => globalThis.clearTimeout(timeout));

  if (!response.ok) {
    throw new Error(`Open-Meteo request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function fetchRunningForecast(location: LocationPoint): Promise<RunningForecast> {
  const forecastUrl = buildUrl("https://api.open-meteo.com/v1/forecast", {
    latitude: location.latitude,
    longitude: location.longitude,
    hourly:
      "temperature_2m,apparent_temperature,relative_humidity_2m,uv_index,precipitation,precipitation_probability,wind_speed_10m",
    daily: "sunrise,sunset",
    wind_speed_unit: "ms",
    past_days: 1,
    forecast_days: 2,
    timezone: "auto"
  });

  const airUrl = buildUrl("https://air-quality-api.open-meteo.com/v1/air-quality", {
    latitude: location.latitude,
    longitude: location.longitude,
    hourly: "pm10,pm2_5",
    past_days: 1,
    forecast_days: 2,
    timezone: "auto"
  });

  const [weather, airQuality] = await Promise.all([
    fetchJson<WeatherResponse>(forecastUrl),
    fetchJson<AirQualityResponse>(airUrl)
  ]);

  const times = weather.hourly?.time ?? [];
  const airTimes = airQuality.hourly?.time ?? [];
  const airIndexByTime = new Map(airTimes.map((time, index) => [time, index]));

  const allSlots = times.map((time, index) => {
    const airIndex = airIndexByTime.get(time) ?? index;
    const input: HourlyInput = {
      time,
      temperature: ensureNumber(weather.hourly?.temperature_2m?.[index]),
      apparentTemperature: ensureNumber(
        weather.hourly?.apparent_temperature?.[index],
        ensureNumber(weather.hourly?.temperature_2m?.[index])
      ),
      humidity: ensureNumber(weather.hourly?.relative_humidity_2m?.[index]),
      uvIndex: ensureNumber(weather.hourly?.uv_index?.[index]),
      precipitation: ensureNumber(weather.hourly?.precipitation?.[index]),
      precipitationProbability: ensureNumber(weather.hourly?.precipitation_probability?.[index]),
      windSpeed: ensureNumber(weather.hourly?.wind_speed_10m?.[index]),
      pm10: ensureNumber(airQuality.hourly?.pm10?.[airIndex]),
      pm25: ensureNumber(airQuality.hourly?.pm2_5?.[airIndex])
    };

    return calculateRunningSlot(input);
  });

  if (allSlots.length === 0) {
    throw new Error("No hourly forecast data returned");
  }

  // past_days=1 + forecast_days=2 → [어제, 오늘, 내일] 순서의 날짜 그룹
  const byDay = new Map<string, RunningSlot[]>();
  for (const slot of allSlots) {
    const day = slot.time.slice(0, 10);
    const group = byDay.get(day);
    if (group) {
      group.push(slot);
    } else {
      byDay.set(day, [slot]);
    }
  }

  const dayKeys = [...byDay.keys()].sort();
  const todayKey = dayKeys.length >= 2 ? dayKeys[1] : dayKeys[0];
  const yesterday = dayKeys.length >= 2 ? byDay.get(dayKeys[0]) ?? [] : [];
  const slots = byDay.get(todayKey) ?? allSlots.slice(0, 24);
  const tomorrow = dayKeys.length >= 3 ? byDay.get(dayKeys[2]) ?? [] : [];

  const dailyTimes = weather.daily?.time ?? [];
  const todayDailyIndex = Math.max(0, dailyTimes.indexOf(todayKey));

  return {
    location,
    timezone: weather.timezone ?? "auto",
    generatedAt: new Date().toISOString(),
    slots,
    yesterday,
    tomorrow,
    sunrise: weather.daily?.sunrise?.[todayDailyIndex] ?? null,
    sunset: weather.daily?.sunset?.[todayDailyIndex] ?? null
  };
}

export function findCurrentSlot(slots: RunningSlot[]) {
  const hour = new Date().getHours();
  let candidate = slots[0];

  for (const slot of slots) {
    if (slot.hour <= hour) {
      candidate = slot;
    }
  }

  return candidate;
}

export function findBestRemainingSlot(slots: RunningSlot[]) {
  const hour = new Date().getHours();
  const remaining = slots.filter((slot) => slot.hour >= hour);
  const targetSlots = remaining.length > 0 ? remaining : slots;

  return targetSlots.reduce((best, slot) => {
    return slot.totalScore > best.totalScore ? slot : best;
  }, targetSlots[0]);
}

// 내일 새벽~오전(5~10시) 중 최고 슬롯
export function findTomorrowMorningBest(tomorrow: RunningSlot[]) {
  if (tomorrow.length === 0) {
    return null;
  }

  const morning = tomorrow.filter((slot) => slot.hour >= 5 && slot.hour <= 10);
  const targetSlots = morning.length > 0 ? morning : tomorrow;

  return targetSlots.reduce((best, slot) => {
    return slot.totalScore > best.totalScore ? slot : best;
  }, targetSlots[0]);
}

// 어제 같은 시각과 점수 비교 (없으면 null)
export function compareWithYesterday(current: RunningSlot, yesterday: RunningSlot[]) {
  const match = yesterday.find((slot) => slot.hour === current.hour);
  if (!match) {
    return null;
  }

  return current.totalScore - match.totalScore;
}
