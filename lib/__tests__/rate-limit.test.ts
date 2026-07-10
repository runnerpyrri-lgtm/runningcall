// in-memory 레이트리밋 + origin 검증 헬퍼 단위 테스트
import { describe, it, expect, vi, afterEach } from "vitest";
import { checkRateLimit, isAllowedOrigin, getClientKey } from "@/lib/rate-limit";

afterEach(() => {
  vi.useRealTimers();
});

describe("checkRateLimit", () => {
  it("한도 내에서는 true를 반환한다", () => {
    const key = `test-${Math.random()}`;
    expect(checkRateLimit(key, 3, 60_000)).toBe(true);
    expect(checkRateLimit(key, 3, 60_000)).toBe(true);
    expect(checkRateLimit(key, 3, 60_000)).toBe(true);
  });

  it("한도를 초과하면 false를 반환한다", () => {
    const key = `test-${Math.random()}`;
    expect(checkRateLimit(key, 2, 60_000)).toBe(true);
    expect(checkRateLimit(key, 2, 60_000)).toBe(true);
    expect(checkRateLimit(key, 2, 60_000)).toBe(false);
  });

  it("윈도우가 지나면 카운트가 리셋된다", () => {
    const key = `test-${Math.random()}`;
    vi.useFakeTimers();
    vi.setSystemTime(0);

    expect(checkRateLimit(key, 1, 1000)).toBe(true);
    expect(checkRateLimit(key, 1, 1000)).toBe(false);

    vi.setSystemTime(1500);
    expect(checkRateLimit(key, 1, 1000)).toBe(true);
  });

  it("서로 다른 key는 독립적으로 카운트된다", () => {
    const keyA = `test-a-${Math.random()}`;
    const keyB = `test-b-${Math.random()}`;
    expect(checkRateLimit(keyA, 1, 60_000)).toBe(true);
    expect(checkRateLimit(keyA, 1, 60_000)).toBe(false);
    expect(checkRateLimit(keyB, 1, 60_000)).toBe(true);
  });
});

describe("isAllowedOrigin", () => {
  it("Origin이 host와 같으면 true", () => {
    const request = new Request("https://example.com/api/forecast", {
      headers: { host: "example.com", origin: "https://example.com" }
    });
    expect(isAllowedOrigin(request)).toBe(true);
  });

  it("Origin이 host와 다르면 false", () => {
    const request = new Request("https://example.com/api/forecast", {
      headers: { host: "example.com", origin: "https://evil.com" }
    });
    expect(isAllowedOrigin(request)).toBe(false);
  });

  it("Referer만 있고 host와 일치하면 true", () => {
    const request = new Request("https://example.com/api/forecast", {
      headers: { host: "example.com", referer: "https://example.com/page" }
    });
    expect(isAllowedOrigin(request)).toBe(true);
  });

  it("Origin·Referer가 없어도 same-origin 브라우저 요청이면 true", () => {
    const request = new Request("https://example.com/api/forecast", {
      headers: { host: "example.com", "sec-fetch-site": "same-origin" }
    });
    expect(isAllowedOrigin(request)).toBe(true);
  });

  it("출처 판단 헤더가 없거나 cross-site면 false", () => {
    const noSource = new Request("https://example.com/api/forecast", {
      headers: { host: "example.com" }
    });
    const crossSite = new Request("https://example.com/api/forecast", {
      headers: { host: "example.com", "sec-fetch-site": "cross-site" }
    });
    const request = new Request("https://example.com/api/forecast");
    expect(isAllowedOrigin(noSource)).toBe(false);
    expect(isAllowedOrigin(crossSite)).toBe(false);
    expect(isAllowedOrigin(request)).toBe(false);
  });
});

describe("getClientKey", () => {
  it("x-forwarded-for의 첫 IP를 사용한다", () => {
    const request = new Request("https://example.com/api/forecast", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" }
    });
    expect(getClientKey(request)).toBe("1.2.3.4");
  });

  it("x-forwarded-for가 없으면 x-real-ip를 사용한다", () => {
    const request = new Request("https://example.com/api/forecast", {
      headers: { "x-real-ip": "9.9.9.9" }
    });
    expect(getClientKey(request)).toBe("9.9.9.9");
  });

  it("둘 다 없으면 unknown을 반환한다", () => {
    const request = new Request("https://example.com/api/forecast");
    expect(getClientKey(request)).toBe("unknown");
  });
});
