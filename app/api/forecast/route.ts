import { NextResponse } from "next/server";
import { fetchRunningForecast, type LocationPoint } from "@/lib/weather";

function readCoordinate(value: string | null) {
  const coordinate = Number(value);
  return Number.isFinite(coordinate) ? coordinate : null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const latitude = readCoordinate(url.searchParams.get("latitude"));
  const longitude = readCoordinate(url.searchParams.get("longitude"));
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
    const forecast = await fetchRunningForecast(location);
    return NextResponse.json(forecast, {
      headers: {
        "Cache-Control": "s-maxage=600, stale-while-revalidate=1800"
      }
    });
  } catch {
    return NextResponse.json({ error: "Forecast unavailable" }, { status: 502 });
  }
}
