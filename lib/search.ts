// 위치 검색 공용 타입·산 판정 (검색 API 라우트와 테스트에서 공유)
export type SearchResultKind = "address" | "place" | "mountain";

// 산 판정 — 이름 접미(산·봉·악·오름·고개·령) + 카카오 카테고리. `대`는 대학 오판 방지 위해 제외.
// "북한산(백운대)", "관악산 정상" 같은 꼬리표는 떼고 판정한다.
export function isMountain(name: string, category?: string): boolean {
  const core = name
    .trim()
    .replace(/\([^)]*\)\s*$/, "")
    .replace(/\s+(정상|입구|둘레길|국립공원|도립공원)$/, "")
    .trim();
  if (/(산|봉|악|오름|고개|령)$/.test(core)) return true;
  if (category && /(산|공원|관광|명소|자연)/.test(category)) return true;
  return false;
}
