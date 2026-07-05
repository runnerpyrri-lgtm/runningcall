// 산 검색 판정(isMountain) 단위 테스트
import { describe, it, expect } from "vitest";
import { isMountain } from "@/lib/search";

describe("isMountain", () => {
  it("산·봉·악·오름·고개·령 접미는 산이다", () => {
    ["북한산", "백운봉", "관악", "성산일출봉오름", "미시령", "대관령", "진고개"].forEach((n) => {
      expect(isMountain(n), n).toBe(true);
    });
  });

  it("대학·아파트는 산이 아니다", () => {
    ["건국대", "경희대", "래미안아파트", "강남역"].forEach((n) => {
      expect(isMountain(n), n).toBe(false);
    });
  });

  it("카테고리에 산·공원·관광이 있으면 산으로 본다", () => {
    expect(isMountain("도봉", "여행 > 관광,명소 > 산")).toBe(true);
    expect(isMountain("올림픽공원 둘레길", "여행 > 공원")).toBe(true);
  });
});
