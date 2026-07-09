import { afterEach, describe, expect, it } from "vitest";

import { __resetRateLimit, clientKey, rateLimit } from "@/lib/rate-limit";

afterEach(() => {
  __resetRateLimit();
});

describe("rateLimit", () => {
  it("allows requests up to the limit, then blocks", () => {
    const key = "1.1.1.1";
    for (let i = 0; i < 3; i += 1) {
      expect(rateLimit(key, 3, 10_000).ok).toBe(true);
    }
    const blocked = rateLimit(key, 3, 10_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });

  it("keeps separate counters per key", () => {
    expect(rateLimit("a", 1, 10_000).ok).toBe(true);
    expect(rateLimit("a", 1, 10_000).ok).toBe(false);
    // 다른 IP는 영향 없음
    expect(rateLimit("b", 1, 10_000).ok).toBe(true);
  });
});

describe("clientKey", () => {
  it("reads the first x-forwarded-for hop", () => {
    const req = new Request("https://x.test", {
      headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" }
    });
    expect(clientKey(req)).toBe("203.0.113.9");
  });

  it("falls back to unknown when no ip header", () => {
    expect(clientKey(new Request("https://x.test"))).toBe("unknown");
  });
});
