// 한글 동네명(동/읍/면/리/가) 추출.
// 주의: 예전엔 끝에 \b(단어 경계)를 썼는데, JS의 \b는 \w(=[A-Za-z0-9_]) 기준이라
// 한글 뒤에서는 경계로 인식되지 않는다. 그 결과 "성수동" 같은 입력이 하나도 매치되지 않아
// 동네 검색이 전면 차단됐다. (?![가-힣]) 로 "뒤에 한글 음절이 오지 않을 때"를 경계로 잡아 고친다.
const NEIGHBORHOOD_RE = /[가-힣0-9]+(?:동|읍|면|리|가)(?![가-힣])/g;

export function neighborhoodMatch(value: string): RegExpMatchArray | null {
  return value.match(NEIGHBORHOOD_RE);
}

export function hasNeighborhoodName(value: string): boolean {
  return Boolean(neighborhoodMatch(value));
}
