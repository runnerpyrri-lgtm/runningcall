// 위도·경도 입력의 숫자 변환과 허용 범위를 검증한다.
import { describe, expect, it } from "vitest";
import { readCoordinate } from "@/lib/geocoding";

describe("readCoordinate", () => {
  it("허용 범위 안의 숫자를 반환한다", () => {
    expect(readCoordinate("37.5665", -90, 90)).toBe(37.5665);
    expect(readCoordinate("126.9780", -180, 180)).toBe(126.978);
  });

  it("빈 값·숫자가 아닌 값·범위 밖 좌표를 거부한다", () => {
    expect(readCoordinate(null, -90, 90)).toBeNull();
    expect(readCoordinate("", -90, 90)).toBeNull();
    expect(readCoordinate("서울", -90, 90)).toBeNull();
    expect(readCoordinate("91", -90, 90)).toBeNull();
    expect(readCoordinate("-181", -180, 180)).toBeNull();
  });
});
