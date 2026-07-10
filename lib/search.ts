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

// 동네명(행정동/읍/면/리/가) 추출. 위치 검색이 진짜 동네 입력인지 판정할 때 쓴다.
// ★ 주의: 트레일링 경계에 ASCII `\b` 를 쓰면 안 된다 — JS 정규식에서 한글은 단어문자(\w)가
// 아니라, "성수동"처럼 한글로 끝나면 `\b` 가 성립하지 않아 매치가 항상 실패한다.
// (그 결과 hike 외 모든 활동에서 위치 검색이 전면 차단됐다.) 대신 "바로 뒤에 한글이
// 오지 않음"을 부정 룩어헤드로 판정한다. → "성수동"·"독산1동"·"종로1가" 매치, "구리시"·"강남역" 거부.
export function neighborhoodMatch(value: string): RegExpMatchArray | null {
  return value.match(/[가-힣0-9]+(?:동|읍|면|리|가)(?![가-힣])/g);
}
