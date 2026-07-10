import { NextResponse } from "next/server";
import { checkRateLimit, getClientKey, isAllowedOrigin } from "@/lib/rate-limit";
import { fetchNominatim, readCoordinate } from "@/lib/geocoding";

type NominatimAddress = {
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  county?: string;
  borough?: string;
  city_district?: string;
  district?: string;
  suburb?: string;
  quarter?: string;
  neighbourhood?: string;
  hamlet?: string;
  state?: string;
};

type NominatimResponse = {
  address?: NominatimAddress;
  display_name?: string;
};

type KakaoRegion = {
  region_1depth_name?: string;
  region_2depth_name?: string;
  region_3depth_name?: string;
};

type KakaoResponse = {
  documents?: KakaoRegion[];
};

function compact(parts: Array<string | undefined>) {
  return [...new Set(parts.filter(Boolean))].join(" ");
}

function formatAddress(address: NominatimAddress | undefined, fallback: string) {
  if (!address) {
    return fallback;
  }

  const city = address.city || address.town || address.village || address.municipality || address.state;
  const district = address.borough || address.city_district || address.county || address.district;
  const dong = address.suburb || address.quarter || address.neighbourhood || address.hamlet;

  return compact([city, district, dong]) || fallback;
}

async function fetchKakaoName(latitude: number, longitude: number) {
  const apiKey = process.env.KAKAO_REST_API_KEY;
  if (!apiKey) {
    return null;
  }

  const url = new URL("https://dapi.kakao.com/v2/local/geo/coord2regioncode.json");
  url.searchParams.set("x", String(longitude));
  url.searchParams.set("y", String(latitude));

  const response = await fetch(url, {
    headers: {
      Authorization: `KakaoAK ${apiKey}`,
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as KakaoResponse;
  const region = data.documents?.find((item) => item.region_3depth_name) ?? data.documents?.[0];
  return compact([region?.region_1depth_name, region?.region_2depth_name, region?.region_3depth_name]) || null;
}

export async function GET(request: Request) {
  if (!isAllowedOrigin(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!checkRateLimit(`reverse-location:${getClientKey(request)}`, 20, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const url = new URL(request.url);
  const latitude = readCoordinate(url.searchParams.get("latitude"), -90, 90);
  const longitude = readCoordinate(url.searchParams.get("longitude"), -180, 180);

  if (latitude === null || longitude === null) {
    return NextResponse.json({ name: "내 위치" }, { status: 400 });
  }

  const kakaoName = await fetchKakaoName(latitude, longitude).catch(() => null);
  if (kakaoName) {
    return NextResponse.json(
      { name: kakaoName },
      { headers: { "Cache-Control": "s-maxage=86400, stale-while-revalidate=604800" } }
    );
  }

  const reverseUrl = new URL("https://nominatim.openstreetmap.org/reverse");
  reverseUrl.searchParams.set("format", "jsonv2");
  reverseUrl.searchParams.set("lat", String(latitude));
  reverseUrl.searchParams.set("lon", String(longitude));
  reverseUrl.searchParams.set("zoom", "18");
  reverseUrl.searchParams.set("addressdetails", "1");
  reverseUrl.searchParams.set("accept-language", "ko");

  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 4500);

  try {
    const response = await fetchNominatim(reverseUrl, controller.signal).finally(() =>
      globalThis.clearTimeout(timeout)
    );

    if (!response.ok) {
      return NextResponse.json({ name: "내 위치" });
    }

    const data = (await response.json()) as NominatimResponse;
    return NextResponse.json(
      { name: formatAddress(data.address, "내 위치") },
      { headers: { "Cache-Control": "s-maxage=86400, stale-while-revalidate=604800" } }
    );
  } catch {
    return NextResponse.json({ name: "내 위치" });
  }
}
