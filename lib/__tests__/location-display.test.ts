// 위치 표시 모델 — 축약·한 줄 조합·pending·구주소 호환을 검증한다.
import { describe, expect, it } from "vitest";
import { buildLocationDisplay, readReverseLocation, shortenRegionWord } from "@/lib/location-display";

describe("buildLocationDisplay", () => {
  it("고척동 + 서울특별시 구로구 → 고척동 · 서울 구로구", () => {
    const display = buildLocationDisplay("고척동", "서울특별시 구로구 고척동");
    expect(display.title).toBe("고척동");
    expect(display.region).toBe("서울 구로구");
    expect(display.inline).toBe("고척동 · 서울 구로구");
    expect(display.fullAddress).toBe("서울특별시 구로구 고척동");
  });

  it("subtitle 정보가 없으면 한 조각만 만든다 (빈 두 번째 줄 없음)", () => {
    const display = buildLocationDisplay("성수동", "");
    expect(display.title).toBe("성수동");
    expect(display.region).toBe("");
    expect(display.inline).toBe("성수동");
  });

  it("검색 결과 full address에서도 동과 축약 지역을 뽑는다", () => {
    const display = buildLocationDisplay("강남역", "서울특별시 강남구 역삼동");
    expect(display.title).toBe("역삼동");
    expect(display.inline).toBe("역삼동 · 서울 강남구");
  });

  it("제주·세종·강원·전북 광역명을 축약한다", () => {
    expect(buildLocationDisplay("애월읍", "제주특별자치도 제주시 애월읍").inline).toBe("애월읍 · 제주 제주시");
    expect(shortenRegionWord("세종특별자치시")).toBe("세종");
    expect(shortenRegionWord("강원특별자치도")).toBe("강원");
    expect(shortenRegionWord("전북특별자치도")).toBe("전북");
    expect(shortenRegionWord("경기도")).toBe("경기");
  });

  it("기존 localStorage 단일 문자열 위치(name만)도 그대로 표시한다", () => {
    const display = buildLocationDisplay("내 위치");
    expect(display.title).toBe("내 위치");
    expect(display.inline).toBe("내 위치");
  });

  it("긴 읍·면·동 이름도 마지막 동네명을 제목으로 삼는다", () => {
    const display = buildLocationDisplay("풍무동", "경기도 김포시 풍무동");
    expect(display.title).toBe("풍무동");
    expect(display.inline).toBe("풍무동 · 경기 김포시");
  });

  it("pending 플래그를 그대로 전달한다", () => {
    expect(buildLocationDisplay("고척동", "", true).pending).toBe(true);
  });
});

describe("readReverseLocation", () => {
  it("구조화 응답에서 name과 fullAddress를 읽는다", () => {
    const parsed = readReverseLocation({ name: "고척동", shortRegion: "서울 구로구", fullAddress: "서울특별시 구로구 고척동" });
    expect(parsed.name).toBe("고척동");
    expect(parsed.detail).toBe("서울특별시 구로구 고척동");
  });

  it("기존 { name } 단일 응답도 읽는다", () => {
    const parsed = readReverseLocation({ name: "서울특별시 구로구 고척동" });
    expect(parsed.name).toBe("서울특별시 구로구 고척동");
    expect(parsed.detail).toBeUndefined();
  });

  it("API 실패(빈 응답)면 내 위치로 대체한다", () => {
    expect(readReverseLocation({}).name).toBe("내 위치");
  });
});
