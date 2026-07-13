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

// 구조화된 위치 응답 — name은 동 단위 제목, fullAddress는 원문 주소를 보존한다.
// 기존 { name } 소비자(구버전 클라이언트)도 계속 읽을 수 있다.
type StructuredLocation = {
  name: string;
  district?: string;
  region?: string;
  shortRegion?: string;
  fullAddress: string;
};

const REGION_SHORT: Record<string, string> = {
  서울특별시: "서울", 부산광역시: "부산", 대구광역시: "대구", 인천광역시: "인천",
  광주광역시: "광주", 대전광역시: "대전", 울산광역시: "울산", 세종특별자치시: "세종",
  제주특별자치도: "제주", 경기도: "경기", 강원특별자치도: "강원", 강원도: "강원",
  전북특별자치도: "전북", 전라북도: "전북", 전라남도: "전남",
  충청북도: "충북", 충청남도: "충남", 경상북도: "경북", 경상남도: "경남"
};

function buildStructured(region?: string, district?: string, dong?: string): StructuredLocation | null {
  const fullAddress = compact([region, district, dong]);
  if (!fullAddress) return null;
  const shortRegion = compact([region ? REGION_SHORT[region] ?? region : undefined, district]) || undefined;
  return {
    name: dong || district || region || fullAddress,
    district,
    region,
    shortRegion,
    fullAddress
  };
}

function structureNominatim(address: NominatimAddress | undefined): StructuredLocation | null {
  if (!address) return null;
  const city = address.city || address.town || address.village || address.municipality || address.state;
  const district = address.borough || address.city_district || address.county || address.district;
  const dong = address.suburb || address.quarter || address.neighbourhood || address.hamlet;
  return buildStructured(city, district, dong);
}

async function fetchKakaoName(latitude: number, longitude: number) {
  const apiKey = process.env.KAKAO_REST_API_KEY;
  if (!apiKey) {
    return null;
  }

  const url = new URL("https://dapi.kakao.com/v2/local/geo/coord2regioncode.json");
  url.searchParams.set("x", String(longitude));
  url.searchParams.set("y", String(latitude));

  // Kakao가 무응답이면 이 요청이 매달려 역지오코딩 전체가 지연된다(Nominatim 폴백과 동일한 4.5초 타임아웃).
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 4500);
  const response = await fetch(url, {
    headers: {
      Authorization: `KakaoAK ${apiKey}`,
      Accept: "application/json"
    },
    signal: controller.signal
  }).finally(() => globalThis.clearTimeout(timeout));

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as KakaoResponse;
  const region = data.documents?.find((item) => item.region_3depth_name) ?? data.documents?.[0];
  if (!region) return null;
  return buildStructured(region.region_1depth_name, region.region_2depth_name, region.region_3depth_name);
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

  const kakaoLocation = await fetchKakaoName(latitude, longitude).catch(() => null);
  if (kakaoLocation) {
    return NextResponse.json(kakaoLocation, {
      headers: { "Cache-Control": "s-maxage=86400, stale-while-revalidate=604800" }
    });
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
    const structured = structureNominatim(data.address);
    return NextResponse.json(structured ?? { name: "내 위치" }, {
      headers: { "Cache-Control": "s-maxage=86400, stale-while-revalidate=604800" }
    });
  } catch {
    return NextResponse.json({ name: "내 위치" });
  }
}
