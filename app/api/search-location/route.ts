import { NextResponse } from "next/server";

import { isMountain, type SearchResultKind } from "@/lib/search";
import { checkRateLimit, getClientKey, isAllowedOrigin } from "@/lib/rate-limit";

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

// 각 검색 레그(주소/키워드)의 결과 — 실패(비정상 응답·네트워크 오류·타임아웃)를 삼키지 않고 구분한다.
type LegOutcome<T> = { ok: true; documents: T[] } | { ok: false };

async function fetchLeg<T>(
  url: URL,
  headers: Record<string, string>,
  signal: AbortSignal
): Promise<LegOutcome<T>> {
  try {
    const response = await fetch(url, { headers, signal });
    if (!response.ok) {
      return { ok: false };
    }
    const data = (await response.json()) as { documents?: T[] };
    return { ok: true, documents: data.documents ?? [] };
  } catch {
    return { ok: false };
  }
}

type KakaoSearchOutcome = {
  results: SearchResult[];
  addressOk: boolean;
  keywordOk: boolean;
};

async function searchKakao(query: string, apiKey: string): Promise<KakaoSearchOutcome> {
  const headers = { Authorization: `KakaoAK ${apiKey}`, Accept: "application/json" };
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 4_500);

  // 1) 주소 검색 (지번·도로명 모두 지원)
  const addressUrl = new URL("https://dapi.kakao.com/v2/local/search/address.json");
  addressUrl.searchParams.set("query", query);
  addressUrl.searchParams.set("size", "8");

  // 2) 키워드 검색 (건물·랜드마크·시설)
  const keywordUrl = new URL("https://dapi.kakao.com/v2/local/search/keyword.json");
  keywordUrl.searchParams.set("query", query);
  keywordUrl.searchParams.set("size", "8");

  const [addressLeg, keywordLeg] = await Promise.all([
    fetchLeg<KakaoAddressDoc>(addressUrl, headers, controller.signal),
    fetchLeg<KakaoKeywordDoc>(keywordUrl, headers, controller.signal)
  ]).finally(() => globalThis.clearTimeout(timeout));

  const results: SearchResult[] = [];

  if (addressLeg.ok) {
    for (const doc of addressLeg.documents) {
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

  if (keywordLeg.ok) {
    for (const doc of keywordLeg.documents) {
      const primary = doc.place_name || doc.address_name || "";
      const detail = doc.road_address_name || doc.address_name || "";
      const kind: SearchResult["kind"] = isMountain(primary, doc.category_name) ? "mountain" : "place";
      const result = toResult(primary, detail, doc.x, doc.y, kind, doc.category_name);
      if (result) {
        results.push(result);
      }
    }
  }

  return { results, addressOk: addressLeg.ok, keywordOk: keywordLeg.ok };
}

export async function GET(request: Request) {
  if (!isAllowedOrigin(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!checkRateLimit(`search-location:${getClientKey(request)}`, 20, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const url = new URL(request.url);
  const query = (url.searchParams.get("query") || "").trim();

  if (query.length < 2 || query.length > 80) {
    return NextResponse.json({ results: [] });
  }

  const apiKey = process.env.KAKAO_REST_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { results: [], error: "Location search is not configured" },
      { status: 503 }
    );
  }
  const wantMountain = url.searchParams.get("mountain") === "1";

  try {
    const { results: rawResults, addressOk, keywordOk } = await searchKakao(query, apiKey);

    // 두 레그 모두 실패 — 200 + 빈 결과로 숨기지 않고 502로 알리고, CDN에 캐시되지 않게 한다.
    if (!addressOk && !keywordOk) {
      return NextResponse.json(
        { results: [], error: "upstream_error" },
        { status: 502, headers: { "Cache-Control": "no-store" } }
      );
    }

    let results = rawResults;
    // 등산 모드 — 산 결과를 위로, 그다음 장소, 주소 순
    if (wantMountain) {
      const rank = (r: SearchResult) => (r.kind === "mountain" ? 0 : r.kind === "place" ? 1 : 2);
      results = [...results].sort((a, b) => rank(a) - rank(b));
    }

    const deduped = dedupe(results).slice(0, 8);
    const partial = !addressOk || !keywordOk;

    // 캐시 정책:
    // - 부분 실패 + 빈 결과: 열화된 빈 응답이므로 절대 캐시하지 않는다.
    // - 부분 실패 + 결과 있음: 성공한 레그의 결과는 정상 캐시.
    // - 두 레그 성공 + 진짜 결과 없음: 짧게만 캐시 (오래 굳지 않게).
    const cacheControl =
      partial && deduped.length === 0
        ? "no-store"
        : deduped.length > 0
        ? "s-maxage=300, stale-while-revalidate=1800"
        : "s-maxage=60, stale-while-revalidate=300";

    return NextResponse.json({ results: deduped }, { headers: { "Cache-Control": cacheControl } });
  } catch {
    // 예기치 못한 실패도 200으로 위장하지 않는다.
    return NextResponse.json(
      { results: [], error: "upstream_error" },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }
}
