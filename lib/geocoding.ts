// 좌표 검증과 OpenStreetMap Nominatim 요청 간격을 관리하는 지오코딩 공용 모듈.
import packageJson from "@/package.json";

const NOMINATIM_INTERVAL_MS = 1_100;
const NOMINATIM_USER_AGENT =
  `outbom/${packageJson.version} (+https://github.com/robom-labs/outbom; contact=hello.robom@gmail.com)`;

let nominatimQueue: Promise<void> = Promise.resolve();
let lastNominatimStartedAt = 0;

export function readCoordinate(value: string | null, min: number, max: number): number | null {
  if (value === null || value.trim() === "") return null;
  const coordinate = Number(value);
  return Number.isFinite(coordinate) && coordinate >= min && coordinate <= max ? coordinate : null;
}

export async function fetchNominatim(url: URL, signal: AbortSignal): Promise<Response> {
  let release: () => void = () => undefined;
  const previous = nominatimQueue;
  nominatimQueue = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previous;
  const waitMs = Math.max(0, NOMINATIM_INTERVAL_MS - (Date.now() - lastNominatimStartedAt));
  if (waitMs > 0) {
    await new Promise((resolve) => globalThis.setTimeout(resolve, waitMs));
  }
  lastNominatimStartedAt = Date.now();

  try {
    return await fetch(url, {
      signal,
      headers: {
        Accept: "application/json",
        "User-Agent": NOMINATIM_USER_AGENT
      }
    });
  } finally {
    release();
  }
}
