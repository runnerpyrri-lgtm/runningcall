// 예보 지역 기준 시각 표기 — 기기 timezone과 무관해야 한다.
import { describe, expect, it } from "vitest";
import { formatLocalClock } from "@/lib/weather";

describe("formatLocalClock", () => {
  it("offset 없는 Open-Meteo 현지 시각은 문자열 그대로 자른다 (기기 TZ 무관)", () => {
    expect(formatLocalClock("2026-07-13T05:17")).toBe("05:17");
    expect(formatLocalClock("2026-07-13T19:54", "Asia/Seoul")).toBe("19:54");
  });

  it("offset 있는 값은 지정 timezone으로 변환한다", () => {
    expect(formatLocalClock("2026-07-13T10:00:00Z", "Asia/Seoul")).toBe("19:00");
    expect(formatLocalClock("2026-07-13T10:00:00Z", "America/New_York")).toBe("06:00");
  });

  it("잘못된 값은 null", () => {
    expect(formatLocalClock(null)).toBeNull();
    expect(formatLocalClock("nonsense")).toBeNull();
  });
});
