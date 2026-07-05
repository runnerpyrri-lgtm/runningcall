import { NextResponse } from "next/server";

import { isMountain, type SearchResultKind } from "@/lib/search";

export type SearchResult = {
  name: string;
  detail: string;
  latitude: number;
  longitude: number;
  kind?: SearchResultKind;
  categoryName?: string;
};

type KakaoAddressDoc = {
  address_name?: string;
  x?: string;
  y?: string;
  road_address?: { address_name?: string } | null;
  address?: { address_name?: string } | null;
};

type KakaoKeywordDoc = {
  place_name?: string;
  address_name?: string;
  road_address_name?: string;
  category_name?: string;
  x?: string;
  y?: string;
};

type NominatimDoc = {
  display_name?: string;
  lat?: string;
  lon?: string;
  name?: string;
};

function toResult(
  name: string,
  detail: string,
  x?: string,
  y?: string,
  kind?: SearchResult["kind"],
  categoryName?: string
): SearchResult | null {
  const latitude = Number(y);
  const longitude = Number(x);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }
  return { name: name.trim(), detail: detail.trim(), latitude, longitude, kind, categoryName };
}

function dedupe(results: SearchResult[]) {
  const seen = new Set<string>();
  const out: SearchResult[] = [];
  for (const item of results) {
    const key = `${item.latitude.toFixed(4)},${item.longitude.toFixed(4)}`;
    if (seen.has(key) || !item.name) {
      continue;
    }
    seen.add(key);
    out.push(item);
  }
  return out;
}

async function searchKakao(query: string, apiKey: string): Promise<SearchResult[]> {
  const headers = { Authorization: `KakaoAK ${apiKey}`, Accept: "application/json" };

  // 1) 주소 검색 (지번·도로명 모두 지원)
  const addressUrl = new URL("https://dapi.kakao.com/v2/local/search/address.json");
  addressUrl.searchParams.set("query", query);
  addressUrl.searchParams.set("size", "8");

  // 2) 키워드 검색 (건물·랜드마크·시설)
  const keywordUrl = new URL("https://dapi.kakao.com/v2/local/search/keyword.json");
  keywordUrl.searchParams.set("query", query);
  keywordUrl.searchParams.set("size", "8");

  const [addressRes, keywordRes] = await Promise.all([
    fetch(addressUrl, { headers }).catch(() => null),
    fetch(keywordUrl, { headers }).catch(() => null)
  ]);

  const results: SearchResult[] = [];

  if (addressRes?.ok) {
    const data = (await addressRes.json()) as { documents?: KakaoAddressDoc[] };
    for (const doc of data.documents ?? []) {
      const road = doc.road_address?.address_name;
      const jibun = doc.address?.address_name;
      // 항상 시/도부터 이어지는 전체 주소를 이름으로
      const full = road || jibun || doc.address_name || "";
      const other = road && jibun && road !== jibun ? (full === road ? jibun : road) : "";
      const result = toResult(full, other, doc.x, doc.y, "address");
      if (result) {
        results.push(result);
      }
    }
  }

  if (keywordRes?.ok) {
    const data = (await keywordRes.json()) as { documents?: KakaoKeywordDoc[] };
    for (const doc of data.documents ?? []) {
      const primary = doc.place_name || doc.address_name || "";
      const detail = doc.road_address_name || doc.address_name || "";
      const kind: SearchResult["kind"] = isMountain(primary, doc.category_name) ? "mountain" : "place";
      const result = toResult(primary, detail, doc.x, doc.y, kind, doc.category_name);
      if (result) {
        results.push(result);
      }
    }
  }

  return results;
}

async function searchNominatim(query: string): Promise<SearchResult[]> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("q", query);
  url.searchParams.set("countrycodes", "kr");
  url.searchParams.set("accept-language", "ko");
  url.searchParams.set("addressdetails", "0");
  url.searchParams.set("limit", "8");

  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 4500);

  const response = await fetch(url, {
    signal: controller.signal,
    headers: {
      Accept: "application/json",
      "User-Agent": "running-alarm/0.1 (contact: support@running-alarm.app)"
    }
  }).finally(() => globalThis.clearTimeout(timeout));

  if (!response.ok) {
    return [];
  }

  const data = (await response.json()) as NominatimDoc[];
  const results: SearchResult[] = [];
  for (const doc of data) {
    // display_name은 상세→광역 순. 국가·우편번호 빼고 광역→상세로 뒤집어 전체 주소를 만든다.
    const parts = (doc.display_name || "")
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part && part !== "대한민국" && part !== "South Korea" && !/^\d{3,}$/.test(part));
    const full = parts
      .reverse()
      .slice(0, 4)
      .join(" ")
      .replace("특별시", "")
      .replace("광역시", "")
      .trim();
    const name = full || doc.name || "";
    // 폴백에서도 산 우선 정렬이 동작하게 원래 지명(doc.name)으로 산 판정
    const kind: SearchResult["kind"] = isMountain(doc.name || name) ? "mountain" : "place";
    const result = toResult(name, "", doc.lon, doc.lat, kind);
    if (result) {
      results.push(result);
    }
  }
  return results;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = (url.searchParams.get("query") || "").trim();

  if (query.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const apiKey = process.env.KAKAO_REST_API_KEY;
  const wantMountain = url.searchParams.get("mountain") === "1";

  try {
    let results: SearchResult[] = [];
    if (apiKey) {
      results = await searchKakao(query, apiKey);
    }
    if (results.length === 0) {
      results = await searchNominatim(query).catch(() => []);
    }
    // 등산 모드 — 산 결과를 위로, 그다음 장소, 주소 순
    if (wantMountain) {
      const rank = (r: SearchResult) => (r.kind === "mountain" ? 0 : r.kind === "place" ? 1 : 2);
      results = [...results].sort((a, b) => rank(a) - rank(b));
    }
    return NextResponse.json({ results: dedupe(results).slice(0, 8) });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
