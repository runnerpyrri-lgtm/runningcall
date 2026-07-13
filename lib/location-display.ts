// 위치 표시 모델 — 화면은 항상 이 모듈이 만든 문자열만 렌더한다.
// 원본 주소(API·저장값)는 보존하고, 사용자에게는 "고척동 · 서울 구로구" 한 줄로 정리한다.
import { neighborhoodMatch } from "@/lib/search";

export type LocationDisplayModel = {
  title: string; // 고척동
  region: string; // 서울 구로구
  inline: string; // 고척동 · 서울 구로구
  fullAddress: string; // 서울특별시 구로구 고척동 (원문 보존)
  pending: boolean;
};

// 광역 행정구역 축약 — 화면 표시에만 사용하고 원문 데이터는 그대로 둔다.
const REGION_SHORT: Array<[RegExp, string]> = [
  [/^서울특별시$/, "서울"],
  [/^부산광역시$/, "부산"],
  [/^대구광역시$/, "대구"],
  [/^인천광역시$/, "인천"],
  [/^광주광역시$/, "광주"],
  [/^대전광역시$/, "대전"],
  [/^울산광역시$/, "울산"],
  [/^세종특별자치시$/, "세종"],
  [/^제주특별자치도$/, "제주"],
  [/^경기도$/, "경기"],
  [/^강원특별자치도$|^강원도$/, "강원"],
  [/^전북특별자치도$|^전라북도$/, "전북"],
  [/^전라남도$/, "전남"],
  [/^충청북도$/, "충북"],
  [/^충청남도$/, "충남"],
  [/^경상북도$/, "경북"],
  [/^경상남도$/, "경남"]
];

export function shortenRegionWord(word: string) {
  for (const [pattern, short] of REGION_SHORT) {
    if (pattern.test(word)) return short;
  }
  return word;
}

function splitAddressParts(joined: string) {
  return joined
    .replace(/\([^)]*\)/g, " ")
    .replace(/[(),]/g, " ")
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

// name(제목)과 detail(원문 주소)에서 동 이름과 축약 지역을 뽑는다.
export function buildLocationDisplay(name: string, detail = "", pending = false): LocationDisplayModel {
  const joined = `${name} ${detail}`.trim();
  const matches = neighborhoodMatch(joined);
  const titleFromDong = matches && matches.length > 0 ? matches[matches.length - 1] : "";
  const parts = splitAddressParts(joined);
  // 주소 detail이 없으면 name("내 위치" 같은 복합어 포함)을 쪼개지 않고 그대로 제목으로 쓴다.
  const title = titleFromDong || (detail ? parts[parts.length - 1] : name.trim()) || name;
  const titleIndex = parts.lastIndexOf(title);
  const regionParts = (titleIndex > 0 ? parts.slice(0, titleIndex) : parts.slice(0, -1))
    .filter((part) => /(특별시|광역시|자치시|자치도|도|시|군|구)$/.test(part))
    .slice(-2)
    .map(shortenRegionWord);
  const region = regionParts.filter((part) => part !== title).join(" ");
  return {
    title,
    region,
    inline: region ? `${title} · ${region}` : title,
    fullAddress: detail && detail !== title ? detail : joined,
    pending
  };
}

// reverse-location API의 구조화 응답과 기존 { name } 응답을 모두 읽는 adapter.
export type ReverseLocationResponse = {
  name?: string;
  district?: string;
  region?: string;
  shortRegion?: string;
  fullAddress?: string;
};

export function readReverseLocation(data: ReverseLocationResponse): { name: string; detail?: string } {
  const name = data.name?.trim() || "내 위치";
  const detail = data.fullAddress?.trim() || undefined;
  return { name, detail };
}
