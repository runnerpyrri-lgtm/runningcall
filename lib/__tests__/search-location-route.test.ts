// /api/search-location 오류 경로 테스트 — 카카오 장애를 "결과 없음"(200+장기 캐시)으로 숨기지 않는지 검증
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";

// same-origin·레이트리밋 검사는 이 테스트의 관심사가 아니므로 통과시킨다
vi.mock("@/lib/rate-limit", () => ({
  isAllowedOrigin: () => true,
  checkRateLimit: () => true,
  getClientKey: () => "test-client"
}));

import { GET } from "@/app/api/search-location/route";

function makeRequest(query = "강남역") {
  return new Request(`http://localhost/api/search-location?query=${encodeURIComponent(query)}`);
}

function kakaoOk(documents: unknown[]) {
  return new Response(JSON.stringify({ documents }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

const keywordDoc = {
  place_name: "강남역 2호선",
  address_name: "서울 강남구 역삼동 858",
  road_address_name: "서울 강남구 강남대로 지하 396",
  category_name: "교통,수송 > 지하철,전철 > 수도권2호선",
  x: "127.028461",
  y: "37.497942"
};

describe("search-location 오류 경로", () => {
  beforeEach(() => {
    // 실제 키를 절대 쓰지 않는다 — 테스트 전용 더미 키
    vi.stubEnv("KAKAO_REST_API_KEY", "test-dummy-key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("두 레그 모두 401이면 502 + no-store (장애를 캐시 가능한 빈 결과로 위장하지 않음)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 401 })));

    const response = await GET(makeRequest());
    expect(response.status).toBe(502);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = (await response.json()) as { results: unknown[]; error?: string };
    expect(body.results).toEqual([]);
    expect(body.error).toBe("upstream_error");
  });

  it("두 레그 모두 네트워크 오류여도 502 + no-store", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      })
    );

    const response = await GET(makeRequest());
    expect(response.status).toBe(502);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("한 레그 실패·한 레그 성공(결과 있음)이면 200 + 성공 레그 결과 + 정상 캐시", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/search/address.json")) {
          return new Response("{}", { status: 429 });
        }
        return kakaoOk([keywordDoc]);
      })
    );

    const response = await GET(makeRequest());
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("s-maxage=300, stale-while-revalidate=1800");
    const body = (await response.json()) as { results: Array<{ name: string }>; error?: string };
    expect(body.error).toBeUndefined();
    expect(body.results.length).toBe(1);
    expect(body.results[0].name).toBe("강남역 2호선");
  });

  it("한 레그 실패·한 레그 성공인데 결과가 비면 no-store (열화된 빈 응답 캐시 금지)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/search/keyword.json")) {
          return new Response("{}", { status: 500 });
        }
        return kakaoOk([]);
      })
    );

    const response = await GET(makeRequest());
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = (await response.json()) as { results: unknown[] };
    expect(body.results).toEqual([]);
  });

  it("두 레그 성공 + 진짜 결과 없음이면 200 + 짧은 캐시(s-maxage=60)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => kakaoOk([])));

    const response = await GET(makeRequest("존재하지않는곳12345"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("s-maxage=60, stale-while-revalidate=300");
    const body = (await response.json()) as { results: unknown[]; error?: string };
    expect(body.results).toEqual([]);
    expect(body.error).toBeUndefined();
  });

  it("KAKAO_REST_API_KEY 미설정이면 기존대로 503", async () => {
    vi.stubEnv("KAKAO_REST_API_KEY", "");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const response = await GET(makeRequest());
    expect(response.status).toBe(503);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
