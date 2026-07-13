import { calculateSlot, type HourlyInput, type RunningSlot } from "@/lib/scoring";
import { ACTIVITIES, type ActivityProfile } from "@/lib/activity";

export type LocationPoint = {
  name: string;
  detail?: string;
  latitude: number;
  longitude: number;
  source: "city" | "gps" | "search";
};

// 점수화 전 원본 예보 — API는 이걸 반환하고, 활동별 점수화는 클라이언트에서 한다.
export type RawForecast = {
  location: LocationPoint;
  timezone: string;
  generatedAt: string;
  today: HourlyInput[];
  yesterday: HourlyInput[];
  tomorrow: HourlyInput[];
  sunrise: string | null;
  sunset: string | null;
  // 내일 산행(등산 하산 마감 등)용 — 내일 탭에서 오늘 일몰로 계산되는 버그 방지
  sunriseTomorrow: string | null;
  sunsetTomorrow: string | null;
  // 대기질(pm2.5·pm10) 데이터를 하나라도 받았는지 — false면 UI가 "점수 미반영" 안내를 띄운다.
  airQualityAvailable: boolean;
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
  sunriseTomorrow: string | null;
  sunsetTomorrow: string | null;
  airQualityAvailable: boolean;
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
    wind_gusts_10m?: Array<number | null>;
    weather_code?: Array<number | null>;
    visibility?: Array<number | null>;
    cloud_cover?: Array<number | null>;
    snowfall?: Array<number | null>;
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

// 결측을 fallback으로 뭉개지 않고 null로 보존한다 (대기질·강수확률 등 "모르면 모른다"가 맞는 지표용).
function numberOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function numberOrUndefined(value: number | null | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function hourInTimezone(date: Date, timezone: string | undefined): number {
  try {
    const hour = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone && timezone !== "auto" ? timezone : "UTC",
      hour: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date).find((part) => part.type === "hour")?.value;
    return Number(hour ?? "0");
  } catch {
    return date.getUTCHours();
  }
}

/** timezone 없는 Open-Meteo 현지 시각을 해당 지역의 epoch ms로 변환한다. */
export function zonedDateTimeToMs(value: string, timezone: string | undefined): number {
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(value)) return Date.parse(value);
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return Number.NaN;
  const [, y, m, d, hh, mm, ss = "00"] = match;
  const wanted = Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss));
  const tz = timezone && timezone !== "auto" ? timezone : "UTC";

  try {
    let candidate = wanted;
    for (let pass = 0; pass < 2; pass += 1) {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      }).formatToParts(new Date(candidate));
      const get = (type: Intl.DateTimeFormatPartTypes) =>
        Number(parts.find((part) => part.type === type)?.value ?? "0");
      const represented = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
      candidate += wanted - represented;
    }
    return candidate;
  } catch {
    return wanted;
  }
}

export function dateKeyInTimezone(date: Date, timezone: string | undefined): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone && timezone !== "auto" ? timezone : "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  }
}

export function shiftDateKey(ymd: string, days: number): string {
  const date = new Date(`${ymd}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
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

export async function fetchRawForecast(location: LocationPoint): Promise<RawForecast> {
  const forecastUrl = buildUrl("https://api.open-meteo.com/v1/forecast", {
    latitude: location.latitude,
    longitude: location.longitude,
    hourly:
      "temperature_2m,apparent_temperature,relative_humidity_2m,uv_index,precipitation,precipitation_probability,wind_speed_10m,wind_gusts_10m,weather_code,visibility,cloud_cover,snowfall",
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

  // 대기질 API 장애는 예보 전체를 막지 않는다 — 대신 pm 값이 null로 남고 airQualityAvailable=false가 된다.
  const [weather, airQuality] = await Promise.all([
    fetchJson<WeatherResponse>(forecastUrl),
    fetchJson<AirQualityResponse>(airUrl).catch(() => null)
  ]);

  const times = weather.hourly?.time ?? [];
  const airTimes = airQuality?.hourly?.time ?? [];
  const airIndexByTime = new Map(airTimes.map((time, index) => [time, index]));

  const allInputs = times.flatMap((time, index) => {
    const airIndex = airIndexByTime.get(time);
    const temperature = numberOrUndefined(weather.hourly?.temperature_2m?.[index]);
    const humidity = numberOrUndefined(weather.hourly?.relative_humidity_2m?.[index]);
    const uvIndex = numberOrUndefined(weather.hourly?.uv_index?.[index]);
    const precipitation = numberOrUndefined(weather.hourly?.precipitation?.[index]);
    const windSpeed = numberOrUndefined(weather.hourly?.wind_speed_10m?.[index]);
    if (
      temperature === undefined ||
      humidity === undefined ||
      uvIndex === undefined ||
      precipitation === undefined ||
      windSpeed === undefined
    ) {
      return [];
    }
    const input: HourlyInput = {
      time,
      temperature,
      apparentTemperature: ensureNumber(
        weather.hourly?.apparent_temperature?.[index],
        temperature
      ),
      humidity,
      uvIndex,
      precipitation,
      precipitationProbability: numberOrNull(weather.hourly?.precipitation_probability?.[index]),
      windSpeed,
      pm10: airIndex === undefined ? null : numberOrNull(airQuality?.hourly?.pm10?.[airIndex]),
      pm25: airIndex === undefined ? null : numberOrNull(airQuality?.hourly?.pm2_5?.[airIndex]),
      windGust: ensureNumber(weather.hourly?.wind_gusts_10m?.[index]),
      weatherCode: ensureNumber(weather.hourly?.weather_code?.[index]),
      visibility: ensureNumber(weather.hourly?.visibility?.[index], 20000),
      cloudCover: ensureNumber(weather.hourly?.cloud_cover?.[index]),
      snowfall: ensureNumber(weather.hourly?.snowfall?.[index])
    };

    return [input];
  });

  if (allInputs.length === 0) {
    throw new Error("No hourly forecast data returned");
  }

  // API 배열 순서가 아니라 응답 timezone의 실제 날짜 키로 오늘·어제·내일을 찾는다.
  const byDay = new Map<string, HourlyInput[]>();
  for (const input of allInputs) {
    const day = input.time.slice(0, 10);
    const group = byDay.get(day);
    if (group) {
      group.push(input);
    } else {
      byDay.set(day, [input]);
    }
  }

  const todayKey = dateKeyInTimezone(new Date(), weather.timezone);
  const yesterdayKey = shiftDateKey(todayKey, -1);
  const tomorrowKey = shiftDateKey(todayKey, 1);
  const yesterday = byDay.get(yesterdayKey) ?? [];
  const today = byDay.get(todayKey) ?? [];
  const tomorrow = byDay.get(tomorrowKey) ?? [];
  if (today.length === 0) throw new Error(`No forecast data returned for local date ${todayKey}`);

  const dailyTimes = weather.daily?.time ?? [];
  const todayDailyIndex = dailyTimes.indexOf(todayKey);
  const tomorrowDailyIndex = dailyTimes.indexOf(tomorrowKey);

  return {
    location,
    timezone: weather.timezone ?? "auto",
    generatedAt: new Date().toISOString(),
    today,
    yesterday,
    tomorrow,
    sunrise: todayDailyIndex >= 0 ? weather.daily?.sunrise?.[todayDailyIndex] ?? null : null,
    sunset: todayDailyIndex >= 0 ? weather.daily?.sunset?.[todayDailyIndex] ?? null : null,
    sunriseTomorrow: tomorrowDailyIndex >= 0 ? weather.daily?.sunrise?.[tomorrowDailyIndex] ?? null : null,
    sunsetTomorrow: tomorrowDailyIndex >= 0 ? weather.daily?.sunset?.[tomorrowDailyIndex] ?? null : null,
    airQualityAvailable: allInputs.some((input) => input.pm25 !== null || input.pm10 !== null)
  };
}

// 원본 예보를 활동 프로필로 점수화한다. 활동 전환 시 재요청 없이 이 함수만 다시 돈다.
export function scoreForecast(raw: RawForecast, profile: ActivityProfile): RunningForecast {
  return {
    location: raw.location,
    timezone: raw.timezone,
    generatedAt: raw.generatedAt,
    slots: raw.today.map((input) => calculateSlot(input, profile)),
    yesterday: raw.yesterday.map((input) => calculateSlot(input, profile)),
    tomorrow: raw.tomorrow.map((input) => calculateSlot(input, profile)),
    sunrise: raw.sunrise,
    sunset: raw.sunset,
    sunriseTomorrow: raw.sunriseTomorrow,
    sunsetTomorrow: raw.sunsetTomorrow,
    airQualityAvailable: raw.airQualityAvailable
  };
}

// 기존 호환 별칭 — run 프로필 점수화 결과 (기존 러닝콜과 동일)
export async function fetchRunningForecast(location: LocationPoint): Promise<RunningForecast> {
  return scoreForecast(await fetchRawForecast(location), ACTIVITIES.run);
}

export function findCurrentSlot(slots: RunningSlot[], hour: number) {
  let candidate = slots[0];

  for (const slot of slots) {
    if (slot.hour <= hour) {
      candidate = slot;
    }
  }

  return candidate;
}

export function findBestRemainingSlot(slots: RunningSlot[], hour: number) {
  const remaining = slots.filter((slot) => slot.hour >= hour);
  const targetSlots = remaining.length > 0 ? remaining : slots;

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
