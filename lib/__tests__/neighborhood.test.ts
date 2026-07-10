// 동네명 추출(neighborhoodMatch/hasNeighborhoodName) 단위 테스트.
// 회귀 방지: \b 버그로 한글 동네가 하나도 매치되지 않아 검색이 막혔던 사고를 다시는 못 내게 한다.
import { describe, it, expect } from "vitest";
import { neighborhoodMatch, hasNeighborhoodName } from "@/lib/neighborhood";

describe("neighborhoodMatch", () => {
  it("한글 동/읍/면/리/가 동네명을 잡는다 (끝/공백/구두점 뒤 모두)", () => {
    expect(neighborhoodMatch("성수동")).toEqual(["성수동"]);
    expect(neighborhoodMatch("독산1동")).toEqual(["독산1동"]);
    expect(neighborhoodMatch("서울특별시 강남구 역삼동")).toEqual(["역삼동"]);
    expect(neighborhoodMatch("연남동 카페")).toEqual(["연남동"]);
    expect(neighborhoodMatch("회기동, 서울")).toEqual(["회기동"]);
    expect(neighborhoodMatch("명동2가")).toEqual(["명동2가"]);
  });

  it("동네명이 다른 낱말 중간이면 잡지 않는다 (오탐 방지)", () => {
    expect(neighborhoodMatch("중동초등학교")).toBeNull(); // '동' 뒤에 한글이 이어짐
    expect(neighborhoodMatch("동대문구")).toBeNull(); // 앞에 글자 없음
    expect(neighborhoodMatch("북한산")).toBeNull(); // 동네 접미 없음
  });
});

describe("hasNeighborhoodName", () => {
  it("동네명이 있으면 true, 없으면 false", () => {
    expect(hasNeighborhoodName("성수동")).toBe(true);
    expect(hasNeighborhoodName("서울특별시 강남구 역삼동")).toBe(true);
    expect(hasNeighborhoodName("북한산")).toBe(false);
    expect(hasNeighborhoodName("강남역")).toBe(false);
  });
});
