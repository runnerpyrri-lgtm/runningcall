// 위치 검색 공용 타입·산 판정 (검색 API 라우트와 테스트에서 공유)
export type SearchResultKind = "address" | "place" | "mountain";

// 산 판정 — 이름 접미(산·봉·악·오름·고개·령) + 카카오 카테고리. `대`는 대학 오판 방지 위해 제외.
export function isMountain(name: string, category?: string): boolean {
  if (/(산|봉|악|오름|고개|령)$/.test(name.trim())) return true;
  if (category && /(산|공원|관광|명소|자연)/.test(category)) return true;
  return false;
}
