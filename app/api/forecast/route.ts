import { NextResponse } from "next/server";
import { fetchRawForecast, type LocationPoint } from "@/lib/weather";
import { checkRateLimit, getClientKey, isAllowedOrigin } from "@/lib/rate-limit";
import { readCoordinate } from "@/lib/geocoding";

export async function GET(request: Request) {
  if (!isAllowedOrigin(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!checkRateLimit(`forecast:${getClientKey(request)}`, 20, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const url = new URL(request.url);
  const latitude = readCoordinate(url.searchParams.get("latitude"), -90, 90);
  const longitude = readCoordinate(url.searchParams.get("longitude"), -180, 180);
  const rawSource = url.searchParams.get("source");
  const source: LocationPoint["source"] =
    rawSource === "gps" ? "gps" : rawSource === "search" ? "search" : "city";
  const name = url.searchParams.get("name") || (source === "city" ? "서울" : "내 위치");

  if (latitude === null || longitude === null) {
    return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });
  }

  const location: LocationPoint = {
    name,
    latitude,
    longitude,
    source
  };

  try {
    const forecast = await fetchRawForecast(location);
    return NextResponse.json(forecast, {
      headers: {
        "Cache-Control": "s-maxage=600, stale-while-revalidate=1800"
      }
    });
  } catch {
    return NextResponse.json({ error: "Forecast unavailable" }, { status: 502 });
  }
}
