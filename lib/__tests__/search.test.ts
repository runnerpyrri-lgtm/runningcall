// 산 검색 판정(isMountain) 단위 테스트
import { describe, it, expect } from "vitest";
import { isMountain, neighborhoodMatch } from "@/lib/search";

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

describe("isMountain 꼬리표", () => {
  it("괄호·꼬리표가 붙어도 산으로 판정한다", () => {
    expect(isMountain("북한산(백운대)")).toBe(true);
    expect(isMountain("관악산 정상")).toBe(true);
    expect(isMountain("지리산 국립공원")).toBe(true);
  });
});

describe("neighborhoodMatch (동네명 추출)", () => {
  // 0.13.4부터 이 함수는 검색 게이트가 아니라 위치 "표시 이름"(주소에서 동네명 뽑기)에만 쓰인다.
  // 회귀 방지: 예전엔 트레일링 \b 때문에 한글로 끝나는 동네명이 전부 null이 됐다.
  it("한글로 끝나는 동네명을 매치한다", () => {
    ["성수동", "독산1동", "연남동", "서초동", "종로1가", "삼평동", "역삼동"].forEach((n) => {
      expect(neighborhoodMatch(n), n).not.toBeNull();
    });
  });

  it("문장 속 동네명도 마지막 것을 뽑는다", () => {
    const m = neighborhoodMatch("서울 성동구 성수동");
    expect(m).not.toBeNull();
    expect(m![m!.length - 1]).toBe("성수동");
  });

  it("동네명이 아닌 입력은 null (표시 이름 추출 실패일 뿐, 검색은 막지 않는다)", () => {
    ["강남역", "추가하기", "서울특별시", "구리시"].forEach((n) => {
      expect(neighborhoodMatch(n), n).toBeNull();
    });
  });
});
