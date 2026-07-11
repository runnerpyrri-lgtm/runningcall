import {
  gradeHumidity,
  gradePm25,
  gradePrecipitation,
  gradeTemperature,
  gradeUv,
  gradeWind,
  type GradeTone,
  type MetricGrade,
  type RunningSlot
} from "@/lib/scoring";
import type { ActivityKey } from "@/lib/activity";

/* ------------------------------------------------------------------ *
 * 아침 / 낮 / 저녁 시간대별 최적 추천
 * ------------------------------------------------------------------ */
export type DayPartKey = "dawn" | "morning" | "day" | "evening";

export type DayPart = {
  key: DayPartKey;
  label: string;
  icon: string;
  desc: string;
  range: [number, number];
  best: RunningSlot | null;
  rainy: boolean; // 우중런(약한 비) 여부
  past: boolean;
};

// 아침 06~11 · 낮 12~17 · 저녁 18~23. 아이콘은 일출/한낮/일몰 계열로 구분되면서 통일
const DAY_PART_DESC: Record<ActivityKey, string[]> = {
  run: ["상쾌한 아침", "한낮 러닝", "선선한 저녁"],
  walk: ["상쾌한 아침", "한낮 걷기", "선선한 저녁"],
  dog: ["아침 산책", "한낮 산책", "저녁 산책"],
  hike: ["새벽 산행", "아침 산행", "한낮 산행", "저녁 산행"],
  bike: ["상쾌한 아침 라이딩", "한낮 라이딩", "선선한 저녁 라이딩"]
};

const DAY_PARTS: Array<{ key: DayPartKey; label: string; icon: string; desc: string; range: [number, number] }> = [
  { key: "morning", label: "아침", icon: "sunrise", desc: "상쾌한 아침", range: [6, 11] },
  { key: "day", label: "낮", icon: "day", desc: "한낮 러닝", range: [12, 17] },
  { key: "evening", label: "저녁", icon: "sunset", desc: "선선한 저녁", range: [18, 23] }
];

// 등산 전용 4구간 — 새벽 산행 수요(일출 산행·04시 출발)를 반영
const HIKE_DAY_PARTS: Array<{ key: DayPartKey; label: string; icon: string; desc: string; range: [number, number] }> = [
  { key: "dawn", label: "새벽", icon: "sunrise", desc: "새벽 산행", range: [4, 7] },
  { key: "morning", label: "아침", icon: "sunrise", desc: "아침 산행", range: [8, 10] },
  { key: "day", label: "낮", icon: "day", desc: "한낮 산행", range: [11, 15] },
  { key: "evening", label: "저녁", icon: "sunset", desc: "저녁 산행", range: [16, 19] }
];

// 강수 1mm 이상이면 러닝 불가로 보고 추천에서 제외. 약한 비(우중런)는 점수와 함께 표시.
function isRunnable(slot: RunningSlot) {
  return slot.precipitation < 1 && slot.totalScore >= 42;
}

function isRainy(slot: RunningSlot) {
  return slot.precipitation >= 0.2 || (slot.precipitationProbability ?? 0) >= 60;
}

// 오늘/내일 추천 러닝 시간대 — 2시간 구간을 점수순 1·2·3등으로.
// 조건: 비 안 옴 + 두 시간 모두 55점↑ + 평균 62점↑. 지난 시간(오늘) 제외. 새벽 제외(오전6~자정). 겹치지 않게 최대 3개.
export type RankedWindow = {
  startHour: number; // 표시: startHour ~ startHour+2 (2시간)
  score: number;
  feel: number; // 체감온도
  precipProb: number; // 강수확률(%)
  dustLabel: string; // 미세먼지 등급
  windLabel: string; // 바람 등급
};

const WIN_MIN_AVG = 62;
const WIN_MIN_EACH = 55;

export function getRankedWindows(
  slots: RunningSlot[],
  isToday: boolean,
  nowHour: number,
  activity: ActivityKey = "run"
): RankedWindow[] {
  const byHour = new Map(slots.map((s) => [s.hour, s]));
  const candidates: Array<{ h: number; avg: number; a: RunningSlot; b: RunningSlot }> = [];

  // 등산은 새벽 산행 포함(04~20시), 그 외는 오전 6시~자정 (새벽 제외)
  const startH = activity === "hike" ? 4 : 6;
  const endH = activity === "hike" ? 18 : 22;
  for (let h = startH; h <= endH; h += 1) {
    const a = byHour.get(h);
    const b = byHour.get(h + 1);
    if (!a || !b) continue;
    if (isToday && h < nowHour) continue; // 이미 지난(또는 진행 중) 시간대 제외
    const rainy =
      a.precipitation >= 0.2 || b.precipitation >= 0.2 || (a.precipitationProbability ?? 0) >= 60 || (b.precipitationProbability ?? 0) >= 60;
    if (rainy) continue;
    if (a.totalScore < WIN_MIN_EACH || b.totalScore < WIN_MIN_EACH) continue;
    const avg = (a.totalScore + b.totalScore) / 2;
    if (avg < WIN_MIN_AVG) continue;
    candidates.push({ h, avg, a, b });
  }

  candidates.sort((x, y) => y.avg - x.avg);

  const picked: typeof candidates = [];
  const used = new Set<number>();
  for (const c of candidates) {
    if (used.has(c.h) || used.has(c.h + 1)) continue;
    picked.push(c);
    used.add(c.h);
    used.add(c.h + 1);
    if (picked.length === 3) break;
  }

  return picked.map((c) => {
    const peak = c.a.totalScore >= c.b.totalScore ? c.a : c.b;
    return {
      startHour: c.h,
      score: Math.round(c.avg),
      feel: Math.round(peak.apparentTemperature),
      precipProb: Math.round(Math.max(c.a.precipitationProbability ?? 0, c.b.precipitationProbability ?? 0)),
      dustLabel: peak.pm25 === null ? "정보 없음" : gradePm25(peak.pm25).label,
      windLabel: gradeWind(peak.windSpeed).label
    };
  });
}

export function getDayParts(slots: RunningSlot[], isToday: boolean, nowHour: number, activity: ActivityKey = "run"): DayPart[] {
  const defs = activity === "hike" ? HIKE_DAY_PARTS : DAY_PARTS;
  return defs.map((part, index) => {
    const desc = DAY_PART_DESC[activity][index] ?? part.desc;
    // 각 구간의 진짜 최적 시각이 이미 지났다면 늦은 시간대를 억지 추천하지 않는다.
    const inRange = slots.filter((slot) => slot.hour >= part.range[0] && slot.hour <= part.range[1]);
    const runnable = inRange.filter(isRunnable);
    const bestInRange =
      runnable.length > 0
        ? runnable.reduce((prev, slot) => (slot.totalScore > prev.totalScore ? slot : prev), runnable[0])
        : null;
    const past = isToday && (nowHour > part.range[1] || (!!bestInRange && bestInRange.hour < nowHour));
    const best =
      !past && bestInRange && (!isToday || bestInRange.hour >= nowHour)
        ? bestInRange
        : null;
    return { ...part, desc, best, rainy: best ? isRainy(best) : false, past };
  });
}

function pick(list: string[], seed: number) {
  return list[Math.abs(seed) % list.length];
}

// 점수대별 헤드라인 — 좋은 점수는 긍정 톤이 먼저 보이도록 촘촘히 나눈다.
const HEADLINE_SCORE: Record<ActivityKey, Array<[number, string[]]>> = {
  run: [
    [94, ["러닝하기 거의 완벽해요", "오늘 컨디션 최상이에요", "기록 노려도 좋은 날이에요"]],
    [88, ["지금 뛰기 최고예요", "완벽한 러닝 날씨예요", "달리기 딱 좋은 흐름이에요"]],
    [80, ["지금 뛰기 좋아요", "컨디션 꽤 좋아요", "기분 좋게 달릴 날이에요"]],
    [72, ["충분히 뛰기 좋아요", "부담 없이 나가도 좋아요", "가볍게 달리기 좋아요"]],
    [62, ["짧게 뛰기 괜찮아요", "가볍게 몸 풀기 좋아요", "무난하게 달릴 수 있어요"]],
    [50, ["조심해서 짧게요", "가벼운 조깅 정도예요", "컨디션 보며 나가요"]],
    [38, ["살짝 아쉬워요", "컨디션 별로예요", "무리는 금물이에요"]],
    [0, ["오늘은 쉬어가요", "실내가 나아요", "달리기 어려워요"]]
  ],
  walk: [
    [94, ["걷기엔 거의 완벽해요", "오래 걸어도 좋은 날이에요", "나가기 최고예요"]],
    [88, ["지금 걷기 최고예요", "산책하기 완벽해요", "바깥 공기 즐기기 좋아요"]],
    [80, ["지금 걷기 좋아요", "산책하기 좋아요", "기분 좋은 산책 날이에요"]],
    [72, ["충분히 걷기 좋아요", "부담 없이 나가도 좋아요", "가볍게 걷기 좋아요"]],
    [62, ["짧은 산책 좋아요", "무난하게 걸을 수 있어요", "동네 한 바퀴 괜찮아요"]],
    [50, ["가까운 곳만 좋아요", "짧게 걷기엔 괜찮아요", "컨디션 보며 걸어요"]],
    [38, ["살짝 아쉬워요", "날이 좀 별로예요", "긴 산책은 아쉬워요"]],
    [0, ["오늘은 실내가 나아요", "나가기 아쉬워요", "쉬어가는 날이에요"]]
  ],
  dog: [
    [94, ["산책 나가기 완벽해요", "강아지가 정말 좋아할 날이에요", "긴 산책도 기분 좋겠어요"]],
    [88, ["산책 나가기 최고예요", "완벽한 산책 날씨예요", "강아지가 신나겠어요"]],
    [80, ["산책하기 좋아요", "산책 컨디션 좋아요", "기분 좋은 산책 날이에요"]],
    [72, ["충분히 산책 좋아요", "평소 코스 괜찮아요", "가볍게 나가기 좋아요"]],
    [62, ["짧은 산책 좋아요", "무난하게 걸을 수 있어요", "천천히 돌기 괜찮아요"]],
    [50, ["배변 산책은 괜찮아요", "짧게 상태 보며 걸어요", "가까운 길만 좋아요"]],
    [38, ["살짝 아쉬워요", "산책엔 좀 별로예요", "긴 산책은 무리예요"]],
    [0, ["오늘 산책은 쉬어가요", "실내 놀이가 나아요", "산책이 어려워요"]]
  ],
  hike: [
    [94, ["산행하기 거의 완벽해요", "정상까지 기분 좋겠어요", "조망 노려볼 만해요"]],
    [88, ["산 오르기 최고예요", "완벽한 산행 날씨예요", "조망 트인 날이에요"]],
    [80, ["산행하기 좋아요", "오르기 좋은 날이에요", "기분 좋은 산행이 되겠어요"]],
    [72, ["충분히 산행 좋아요", "낮은 산은 편하게 좋아요", "가벼운 코스 좋겠어요"]],
    [62, ["짧은 코스 괜찮아요", "둘레길까지는 좋아요", "무난한 산행 흐름이에요"]],
    [50, ["낮은 코스만 좋아요", "하산 시간 꼭 보세요", "무리 없는 코스로요"]],
    [38, ["살짝 아쉬워요", "무리는 금물이에요", "둘레길이 나아요"]],
    [0, ["오늘은 위험해요", "실내가 나아요", "산행 어려워요"]]
  ],
  bike: [
    [94, ["라이딩하기 거의 완벽해요", "긴 코스도 기분 좋겠어요", "페달이 가벼울 날이에요"]],
    [88, ["라이딩하기 최고예요", "완벽한 라이딩 날씨예요", "페달 밟기 딱 좋아요"]],
    [80, ["라이딩하기 좋아요", "달리기 좋은 바람이에요", "기분 좋은 라이딩 날이에요"]],
    [72, ["충분히 타기 좋아요", "짧은 코스 좋아요", "가볍게 달리기 좋아요"]],
    [62, ["무난한 라이딩이에요", "가까운 코스 괜찮아요", "안전하게 타기 좋아요"]],
    [50, ["짧게 타는 게 좋아요", "컨디션 보며 타요", "안전 위주로 좋아요"]],
    [38, ["살짝 아쉬워요", "바람이 아쉬워요", "무리는 금물이에요"]],
    [0, ["오늘은 쉬어가요", "실내가 나아요", "라이딩 어려워요"]]
  ]
};

export function heroHeadline(slot: RunningSlot, activity: ActivityKey = "run") {
  const seed = slot.hour * 17 + Math.round(slot.totalScore);

  // 큰 제목 = "상태". 심각 조건만 먼저 말하고, 좋은 점수는 좋은 톤을 우선한다.
  if (slot.precipitation >= 1) return pick(["비가 와요", "궂은 날이에요", "젖은 노면이에요"], seed);
  if ((slot.pm25 ?? 0) > 75) return pick(["공기가 나빠요", "미세먼지 심해요", "탁한 공기예요"], seed);
  if (slot.apparentTemperature >= 32) return pick(["많이 더워요", "한낮 무더위예요", "푹푹 쪄요"], seed);
  if (slot.apparentTemperature <= -5) return pick(["많이 추워요", "한파예요", "매섭게 추워요"], seed);
  if (slot.windSpeed >= 14) return pick(["바람이 강해요", "강풍이 불어요", "바람 많이 불어요"], seed);
  if (slot.uvIndex >= 9) return pick(["햇살이 강해요", "볕이 뜨거워요", "자외선 세요"], seed);

  for (const [threshold, variants] of HEADLINE_SCORE[activity]) {
    if (slot.totalScore >= threshold) return pick(variants, seed);
  }

  if ((slot.precipitationProbability ?? 0) >= 70) return pick(["비 올 수 있어요", "하늘이 흐려요", "곧 비 소식이에요"], seed);
  if ((slot.pm25 ?? 0) > 35) return pick(["미세먼지 있어요", "공기가 탁해요", "먼지가 좀 껴요"], seed);
  if (slot.apparentTemperature >= 26) return pick(["조금 더워요", "살짝 무더워요", "기온이 높아요"], seed);
  if (slot.apparentTemperature <= 3) return pick(["쌀쌀해요", "제법 추워요", "찬 바람 불어요"], seed);
  if (slot.windSpeed >= 12) return pick(["바람이 좀 있어요", "바람 체크해요", "맞바람 주의예요"], seed);
  if (slot.uvIndex >= 7) return pick(["햇살이 강해요", "볕이 뜨거워요", "자외선 세요"], seed);
  if (slot.humidity >= 80) return pick(["습도가 높아요", "눅눅한 날이에요", "끈적이는 날이에요"], seed);

  return pick(HEADLINE_SCORE[activity][HEADLINE_SCORE[activity].length - 1][1], seed);
}

// 작은 제목 = "행동/팁". 활동별 테이블 — 날씨 조건 11종 + 점수대 8단.
type SublineTable = {
  rain: string[]; rainMaybe: string[]; dustBad: string[]; dustSoso: string[];
  hot2: string[]; hot1: string[]; cold2: string[]; cold1: string[];
  windy: string[]; uv: string[]; humid: string[];
  score: Array<[number, string[]]>;
};

const SUBLINES: Record<ActivityKey, SublineTable> = {
  run: {
    rain: ["오늘은 실내가 나아요", "짧은 코스만 가볍게요", "미끄러우니 조심해요"],
    rainMaybe: ["집 근처 코스가 좋아요", "나가기 전 하늘 확인해요", "우산 챙기면 편해요"],
    dustBad: ["실내 운동을 권해요", "오래 뛰는 건 피해요", "숨차면 바로 멈춰요"],
    dustSoso: ["강도는 가볍게 가요", "공원 안쪽이 좋아요", "짧게 뛰고 마쳐요"],
    hot2: ["물 꼭 챙겨 가요", "그늘 코스로 돌아요", "페이스 확 낮춰요"],
    hot1: ["초반부터 천천히요", "수분 자주 챙겨요", "무리한 속도 피해요"],
    cold2: ["보온 단단히 해요", "실내가 안전해요", "워밍업 길게 가요"],
    cold1: ["첫 1km 천천히요", "장갑 챙기면 좋아요", "몸 데우고 나가요"],
    windy: ["맞바람 구간 조심해요", "바람막이 챙겨요", "기록 욕심 접어둬요"],
    uv: ["모자·선크림 챙겨요", "그늘 많은 길로요", "선글라스면 편해요"],
    humid: ["땀이 잘 안 말라요", "호흡 편한 속도로요", "조깅이 나아요"],
    score: [
      [94, ["기록 도전도 좋아요", "긴 코스도 기분 좋겠어요", "오늘 페이스 기대돼요"]],
      [88, ["초반 10분만 천천히요", "기분 좋게 밀어붙여도 좋아요", "끝나고 스트레칭만 챙겨요"]],
      [80, ["편한 페이스로 즐겨요", "리듬 잡기 좋아요", "가볍게 몸 풀고 가요"]],
      [72, ["부담 없이 다녀와요", "짧게라도 좋아요", "자세에 집중해봐요"]],
      [62, ["짧은 코스 추천해요", "20분 조깅이면 충분해요", "컨디션 보며 가요"]],
      [50, ["무리 없는 조깅으로요", "걷기 섞어도 좋아요", "짧게 몸만 풀어요"]],
      [38, ["몸만 풀고 마쳐요", "걷기 섞어 가볍게요", "짧게만 다녀와요"]],
      [0, ["휴식도 훈련이에요", "실내 스트레칭 좋아요", "내일을 노려봐요"]]
    ]
  },
  walk: {
    rain: ["오늘은 실내가 나아요", "우산 들고 잠깐만요", "미끄러우니 조심해요"],
    rainMaybe: ["집 근처만 걷는 게 좋아요", "나가기 전 하늘 확인해요", "우산 챙기면 편해요"],
    dustBad: ["오늘은 실내가 나아요", "오래 걷는 건 피해요", "마스크가 도움돼요"],
    dustSoso: ["짧게 걷고 마쳐요", "공원 안쪽이 좋아요", "큰길은 피해서 걸어요"],
    hot2: ["물 꼭 챙겨 가요", "그늘길로 다녀요", "한낮은 피해요"],
    hot1: ["천천히 걸어요", "수분 자주 챙겨요", "그늘 쪽이 편해요"],
    cold2: ["보온 단단히 해요", "실내가 안전해요", "목도리 챙겨요"],
    cold1: ["따뜻하게 입고 나가요", "장갑 챙기면 좋아요", "해 있을 때 걸어요"],
    windy: ["바람막이 챙겨요", "체감이 더 추워요", "골목길이 덜 불어요"],
    uv: ["모자·선크림 챙겨요", "그늘 많은 길로요", "선글라스면 편해요"],
    humid: ["끈적일 수 있어요", "천천히 걸어요", "물 한 병 챙겨요"],
    score: [
      [94, ["오래 걸어도 좋아요", "새 길로 걸어봐요", "산책하며 기분 전환해요"]],
      [88, ["조금 멀리 가도 좋아요", "바깥 공기 즐겨요", "기분 전환 제대로 돼요"]],
      [80, ["느긋하게 즐겨요", "동네 한 바퀴 어때요", "가볍게 걸어봐요"]],
      [72, ["부담 없이 다녀와요", "짧게라도 좋아요", "바람 쐬고 와요"]],
      [62, ["짧은 산책 추천해요", "20분이면 충분해요", "가까운 곳으로 가요"]],
      [50, ["잠깐 걷기 좋아요", "가까운 길만 돌아요", "무리 없이 천천히요"]],
      [38, ["잠깐만 걸어요", "바람만 쐬고 와요", "짧게만 다녀와요"]],
      [0, ["실내 스트레칭 좋아요", "오늘은 쉬어가요", "내일을 노려봐요"]]
    ]
  },
  dog: {
    rain: ["오늘 산책은 미뤄요", "배변만 짧게 다녀와요", "발 닦을 수건 준비해요"],
    rainMaybe: ["집 근처만 도는 게 좋아요", "나가기 전 하늘 확인해요", "비 오면 바로 들어와요"],
    dustBad: ["오늘은 실내 놀이가 나아요", "산책은 아주 짧게만요", "강아지 호흡기를 지켜요"],
    dustSoso: ["짧은 코스로 다녀와요", "공원 안쪽이 좋아요", "냄새 맡기는 짧게요"],
    hot2: ["지금은 발바닥이 위험해요", "해 지고 나가요", "물그릇 꼭 챙겨요"],
    hot1: ["아스팔트 확인하고 나가요", "그늘길·흙길로 걸어요", "물 챙기고 짧게 도세요"],
    cold2: ["소형견은 옷 입혀요", "산책은 아주 짧게만요", "발 시림 조심해요"],
    cold1: ["짧고 굵게 다녀와요", "해 있을 때 나가요", "따뜻하게 챙겨 나가요"],
    windy: ["강아지가 놀랄 수 있어요", "리드줄 단단히 잡아요", "바람 덜 부는 길로요"],
    uv: ["그늘 많은 길로 걸어요", "지면 열기 확인해요", "한낮은 피해요"],
    humid: ["헥헥거리면 바로 쉬어요", "물 자주 먹여요", "천천히 걸어요"],
    score: [
      [94, ["긴 산책도 좋아요", "공원 나들이 딱이에요", "강아지 기분 최고겠어요"]],
      [88, ["신나게 뛰어놀기 좋아요", "긴 산책 코스 어때요", "노즈워크 하기 좋아요"]],
      [80, ["여유롭게 한 바퀴 돌아요", "공원 나들이 좋아요", "냄새 실컷 맡게 해줘요"]],
      [72, ["평소 코스면 충분해요", "부담 없이 다녀와요", "가볍게 걸어요"]],
      [62, ["짧은 산책 추천해요", "배변 산책 정도가 좋아요", "상태 보며 걸어요"]],
      [50, ["가까운 길만 돌아요", "물 챙기고 짧게요", "강아지 반응 보며 걸어요"]],
      [38, ["아주 짧게만 다녀와요", "무리하지 않는 게 좋아요", "실내 놀이를 섞어요"]],
      [0, ["오늘은 실내 놀이해요", "터그·노즈워크 어때요", "내일 나가는 게 나아요"]]
    ]
  },
  hike: {
    rain: ["오늘 산행은 미뤄요", "바위·계단 미끄럼 위험", "능선은 특히 조심해요"],
    rainMaybe: ["우비 꼭 챙겨요", "정상 날씨 확인해요", "낮은 코스로 짧게요"],
    dustBad: ["조망도 건강도 아쉬워요", "무리한 정상은 피해요", "마스크 챙기면 좋아요"],
    dustSoso: ["조망은 살짝 흐려요", "가벼운 코스로요", "물 자주 마셔요"],
    hot2: ["이른 시간에 올라요", "물 넉넉히 챙겨요", "그늘 코스로요"],
    hot1: ["수분 자주 챙겨요", "천천히 페이스로요", "정상은 시원해요"],
    cold2: ["정상부 저체온 주의", "방한 단단히 해요", "짧게 다녀와요"],
    cold1: ["겹쳐 입고 올라요", "장갑 챙겨요", "능선 바람 대비해요"],
    windy: ["능선·정상 강풍 주의", "돌풍 실족 조심해요", "무리한 능선 피해요"],
    uv: ["모자·선크림 챙겨요", "능선은 그늘 없어요", "선글라스면 편해요"],
    humid: ["땀 많이 나요", "여벌 옷 챙겨요", "천천히 올라요"],
    score: [
      [94, ["일출·조망 노려봐요", "정상까지 여유 있어요", "하산 시간만 챙기면 완벽"]],
      [88, ["능선까지 기분 좋겠어요", "사진 찍기 좋은 날이에요", "물·간식만 챙겨요"]],
      [80, ["편한 코스로 즐겨요", "중간 봉우리도 좋아요", "기분 좋은 산행이에요"]],
      [72, ["부담 없이 다녀와요", "낮은 산도 좋아요", "하산 시간 확인해요"]],
      [62, ["둘레길 추천해요", "짧은 코스로요", "무리하지 말아요"]],
      [50, ["낮은 코스만 좋아요", "정상 욕심은 줄여요", "안전 위주로 가요"]],
      [38, ["가볍게만 걸어요", "정상은 다음에요", "안전 위주로요"]],
      [0, ["실내가 나아요", "오늘은 쉬어가요", "다음 기회에요"]]
    ]
  },
  bike: {
    rain: ["젖은 노면은 위험해요", "타이어 미끄럼 조심해요", "오늘은 실내가 나아요"],
    rainMaybe: ["비 오기 전 짧게 타요", "노면 상태 확인해요", "라이트 챙기면 좋아요"],
    dustBad: ["오래 타는 건 피해요", "마스크 쓰기 애매해요", "강도 낮춰서 타요"],
    dustSoso: ["큰길보다 강변길로요", "짧게 타고 마쳐요", "숨차면 속도 낮춰요"],
    hot2: ["물 꼭 챙겨요", "그늘 코스로 돌아요", "속도 낮춰서 타요"],
    hot1: ["수분 자주 챙겨요", "초반부터 천천히요", "무리한 언덕 피해요"],
    cold2: ["방풍 단단히 해요", "장갑 꼭 껴요", "손발 시림 조심해요"],
    cold1: ["바람막이 챙겨요", "귀·손 보온해요", "초반 천천히 데워요"],
    windy: ["맞바람 구간 주의해요", "강풍엔 무리 말아요", "다리·둑길 조심해요"],
    uv: ["아이웨어 챙겨요", "선크림 바르고요", "그늘 코스로요"],
    humid: ["끈적여도 통풍 유지해요", "물 자주 마셔요", "편한 속도로요"],
    score: [
      [94, ["긴 코스 도전 좋아요", "페달이 잘 도는 날이에요", "새 코스도 좋겠어요"]],
      [88, ["맞바람도 즐길 만해요", "기분 좋은 속도 나겠어요", "끝나고 스트레칭 잊지 마요"]],
      [80, ["편한 기어로 즐겨요", "리듬 잡기 좋아요", "가볍게 몸 풀고 가요"]],
      [72, ["부담 없이 다녀와요", "짧게라도 좋아요", "안전 장비 챙겨요"]],
      [62, ["짧은 코스 추천해요", "가까운 강변 어때요", "상태 보며 타요"]],
      [50, ["가볍게만 타요", "안전 위주로요", "짧게만 다녀와요"]],
      [38, ["가볍게만 타요", "안전 위주로요", "짧게만 다녀와요"]],
      [0, ["실내 자전거가 나아요", "오늘은 쉬어가요", "내일을 노려봐요"]]
    ]
  }
};

export function heroSubline(slot: RunningSlot, activity: ActivityKey = "run") {
  const seed = slot.hour * 17 + Math.round(slot.totalScore);
  const t = SUBLINES[activity];

  if (slot.precipitation >= 1) return pick(t.rain, seed);
  if ((slot.pm25 ?? 0) > 75) return pick(t.dustBad, seed);
  if (slot.apparentTemperature >= 32) return pick(t.hot2, seed);
  if (slot.apparentTemperature <= -5) return pick(t.cold2, seed);
  if (slot.windSpeed >= 14) return pick(t.windy, seed);
  if (slot.uvIndex >= 9) return pick(t.uv, seed);

  for (const [threshold, variants] of t.score) {
    if (slot.totalScore >= threshold) return pick(variants, seed);
  }

  if ((slot.precipitationProbability ?? 0) >= 70) return pick(t.rainMaybe, seed);
  if ((slot.pm25 ?? 0) > 35) return pick(t.dustSoso, seed);
  if (slot.apparentTemperature >= 26) return pick(t.hot1, seed);
  if (slot.apparentTemperature <= 3) return pick(t.cold1, seed);
  if (slot.windSpeed >= 12) return pick(t.windy, seed);
  if (slot.uvIndex >= 7) return pick(t.uv, seed);
  if (slot.humidity >= 80) return pick(t.humid, seed);

  return pick(t.score[t.score.length - 1][1], seed);
}

// 오늘의 한마디 — 활동별 두 줄 조언 테이블
type OneLinerTable = {
  rain: string[]; rainMaybe: string[]; dust: string[]; hot: string[];
  uv: string[]; wind: string[]; humid: string[]; cold: string[];
  good: string[]; ok: string[]; bad: string[];
};

const ONE_LINERS: Record<ActivityKey, OneLinerTable> = {
  run: {
    rain: [
      "빗길은 짧은 코스로 가볍게만 다녀오세요. 신발 접지와 밝은 옷을 챙기면 좋아요.",
      "노면이 젖어 발목 부담이 있어요. 나간다면 천천히 걷듯 시작하고 무리하지 마세요.",
      "비 오는 날은 시야도 접지도 나빠요. 오늘은 실내 트레드밀이 기록에도 안전에도 나아요."
    ],
    rainMaybe: [
      "비 올 확률이 높아 멀리 가기엔 애매해요. 집 근처 짧은 코스로 잡아보세요.",
      "비 소식이 있어요. 방수 자켓을 가볍게 걸치고, 처음부터 편한 페이스로 가세요.",
      "하늘이 변덕스러운 날이에요. 언제든 끊고 돌아올 수 있는 순환 코스가 마음 편해요."
    ],
    dust: [
      "미세먼지가 있어 강한 러닝은 아쉬워요. 호흡 편한 조깅으로 낮추고 답답하면 걸으세요.",
      "공기가 조금 아쉬운 날이에요. 큰길보다 공원 안쪽으로, 평소보다 짧게 다녀오세요.",
      "러닝은 호흡량이 평소의 몇 배라 공기질 영향이 커요. 오늘은 거리 욕심을 접어두세요."
    ],
    hot: [
      "더위가 있어 심박이 빨리 오를 수 있어요. 페이스를 낮추고 물 한 컵 챙기세요.",
      "몸에 열이 빨리 쌓이는 날씨예요. 그늘 많은 코스로 돌고, 숨이 거칠면 쉬어가세요.",
      "더운 날 무리한 페이스는 다음 일주일을 망쳐요. 오늘은 회복 조깅이라 생각하세요."
    ],
    uv: [
      "햇살이 강한 시간이에요. 모자와 선크림을 챙기고, 그늘 많은 길로 돌아보세요.",
      "자외선이 강해 피부와 눈이 쉽게 지쳐요. 선글라스와 모자를 챙기고 한낮은 피하세요.",
      "볕이 강할 땐 이른 아침이나 해 질 무렵 러닝이 훨씬 쾌적해요. 시간을 옮겨보세요."
    ],
    wind: [
      "바람이 있으니 나갈 때 맞바람으로 시작해보세요. 돌아올 땐 등바람이라 더 편해요.",
      "바람이 강해 체감온도가 쉽게 떨어져요. 얇은 바람막이 하나면 후반이 훨씬 편합니다.",
      "맞바람 구간에선 기록 욕심을 접고 자세 유지에 집중하세요. 그게 더 빠른 길이에요."
    ],
    humid: [
      "습도가 높아 같은 속도여도 심박이 빨리 올라요. 평소보다 10% 느리게 조깅하세요.",
      "끈적한 날씨라 땀이 잘 마르지 않아요. 통풍 잘 되는 옷에 편한 조깅이 좋아요.",
      "습한 날은 몸이 무겁게 느껴지는 게 정상이에요. 컨디션 탓하지 말고 가볍게 뛰세요."
    ],
    cold: [
      "쌀쌀하니 실내에서 몸을 살짝 데우고 나가세요. 첫 1km는 워밍업처럼 천천히요.",
      "추운 날은 장갑과 워밍업이 러닝의 절반이에요. 초반엔 여유 있게 시작하세요.",
      "찬 공기에 기관지가 놀랄 수 있어요. 코로 들이쉬고 입으로 내쉬는 호흡이 도움돼요."
    ],
    good: [
      "컨디션이 좋아요. 초반 10분만 천천히 올리고, 후반엔 리듬을 믿고 가볍게 밀어보세요.",
      "달리기 좋은 조건이에요. 기록 욕심보다 호흡 리듬에 집중하면 끝까지 기분 좋게 이어져요.",
      "몸이 가볍게 느껴질 날씨예요. 꾸준히 달리고, 끝나고 5분 스트레칭까지 챙겨보세요.",
      "이런 날 기록이 나와요. 워밍업 충분히 하고 후반 빌드업에 도전해보세요."
    ],
    ok: [
      "무난한 컨디션이에요. 거리 욕심보다 자세와 호흡에 집중하며 20~30분 가볍게 뛰어보세요.",
      "나쁘지 않은 조건이에요. 처음 10분은 편하게 시작하고, 몸이 풀리면 조금만 올려보세요.",
      "평범한 날씨지만 꾸준함이 실력이에요. 짧게라도 나가면 오늘 몫은 채운 거예요."
    ],
    bad: [
      "컨디션이 아쉬운 날이에요. 무리해서 나가기보다 실내 스트레칭이나 가벼운 근력이 좋아요.",
      "굳이 나간다면 15분 이내로 아주 가볍게만 다녀오세요. 쉬어가는 날도 훈련이에요.",
      "오늘 쉬는 게 내일 더 잘 뛰는 비결이에요. 폼롤러로 다리를 풀어주는 건 어때요."
    ]
  },
  walk: {
    rain: [
      "비가 와서 길이 미끄러워요. 꼭 나가야 하면 우산 들고 가까운 곳만 다녀오세요.",
      "노면이 젖은 날이에요. 밑창 접지 좋은 신발을 신고 천천히 걸으세요.",
      "비 오는 날 무리해서 걷기보다, 실내에서 가볍게 몸을 풀고 내일 두 배로 걸어요."
    ],
    rainMaybe: [
      "비 올 확률이 높아요. 멀리 가지 말고 집 근처로 짧게 다녀오세요.",
      "비 소식이 있어요. 접이식 우산 하나 들고 나가면 마음이 편해요.",
      "하늘 보고 나가되, 돌아오는 길이 짧은 코스로 잡으면 비가 와도 걱정 없어요."
    ],
    dust: [
      "미세먼지가 있는 날이에요. 오래 걷기보다 짧게, 큰길보다 공원 안쪽으로 걸으세요.",
      "공기가 아쉬운 날이에요. 마스크를 챙기고 평소보다 짧게 다녀오세요.",
      "호흡기가 예민하다면 오늘은 실내 걷기로 바꾸는 것도 현명한 선택이에요."
    ],
    hot: [
      "더운 시간이에요. 그늘 많은 길로 천천히 걷고, 물을 꼭 챙기세요.",
      "열이 쌓이기 쉬운 날씨예요. 한낮보다 아침저녁 산책이 훨씬 쾌적해요.",
      "더위엔 30분 걷기도 운동량이 충분해요. 무리하지 말고 시원할 때 걸으세요."
    ],
    uv: [
      "햇살이 강한 시간이에요. 모자와 선크림을 챙기고 그늘 쪽으로 걸으세요.",
      "자외선이 강해요. 선글라스와 양산이 있으면 눈과 피부가 편해요.",
      "볕 좋은 날 걷기는 기분에 최고지만, 피부엔 선크림이 필수예요. 바르고 나가세요."
    ],
    wind: [
      "바람이 부는 날이에요. 얇은 겉옷 하나 걸치면 체감이 훨씬 낫습니다.",
      "바람이 강해 체감온도가 낮아요. 바람 덜 부는 골목길 코스가 좋아요.",
      "바람 부는 날은 모자가 날아가기 쉬워요. 끈 있는 모자나 후드가 편해요."
    ],
    humid: [
      "습도가 높아 걷기만 해도 끈적여요. 천천히 걷고 물을 자주 마시세요.",
      "눅눅한 날씨예요. 통풍 잘 되는 옷을 입고 무리하지 않게 걸으세요.",
      "습한 날은 그늘도 덥게 느껴져요. 물가나 바람 통하는 길이 그나마 낫습니다."
    ],
    cold: [
      "쌀쌀한 날이에요. 따뜻하게 입고, 해 있는 시간에 걷는 게 좋아요.",
      "추울 땐 목과 손이 먼저 시려요. 목도리와 장갑을 챙기고 짧게 다녀오세요.",
      "추운 날 걷기 전 실내에서 가볍게 몸을 풀면 훨씬 덜 춥게 느껴져요."
    ],
    good: [
      "걷기 좋은 날이에요. 평소보다 한 블록 더 걸어도 기분 좋게 다녀올 수 있어요.",
      "산책하기 딱 좋은 조건이에요. 새로운 길로 걸으며 기분 전환해보세요.",
      "몸도 마음도 가벼워질 날씨예요. 느긋하게 30분 걷고 오면 딱 좋아요.",
      "이런 날 걷기는 보약이에요. 좋아하는 음악이나 팟캐스트 들으며 천천히 걸어보세요."
    ],
    ok: [
      "무난한 산책 컨디션이에요. 20~30분 가볍게 동네 한 바퀴 어때요.",
      "나쁘지 않은 날이에요. 부담 없이 나가서 바람 쐬고 오세요.",
      "특별할 것 없는 날씨지만, 걷고 나면 기분은 특별해질 거예요."
    ],
    bad: [
      "날씨가 아쉬운 날이에요. 무리해서 나가기보다 실내 스트레칭이 나아요.",
      "꼭 나가야 하면 15분 이내로 짧게만 다녀오세요. 쉬는 날도 필요해요.",
      "오늘은 창밖 구경으로 충분해요. 내일 더 좋은 날씨에 두 배로 걸어요."
    ]
  },
  dog: {
    rain: [
      "비 오는 날 산책은 배변 위주로 짧게만요. 다녀와서 발과 배를 잘 닦아 주세요.",
      "젖은 길은 강아지도 미끄러워요. 우비를 입히고 가까운 곳만 얼른 다녀오세요.",
      "천둥을 무서워하는 아이라면 오늘은 실내 놀이로 스트레스를 풀어 주세요.",
      "비 맞은 털은 감기·피부염의 원인이 돼요. 다녀오면 드라이기로 뽀송하게 말려 주세요."
    ],
    rainMaybe: [
      "비 소식이 있어요. 하늘 보고 짧은 코스로, 비 오면 바로 들어오세요.",
      "비 올 확률이 높은 날이에요. 배변 산책만 얼른 다녀오는 게 좋아요.",
      "언제 쏟아질지 모르는 하늘이에요. 집에서 먼 코스는 내일로 미뤄 주세요."
    ],
    dust: [
      "미세먼지는 강아지 호흡기에도 안 좋아요. 오늘 산책은 짧게, 실내 놀이로 채워 주세요.",
      "공기가 탁한 날이에요. 강아지는 마스크를 못 쓰니 냄새 맡기는 줄이고 빠르게 한 바퀴만요.",
      "코가 예민한 아이들에게 먼지 낀 공기는 더 힘들어요. 노즈워크는 실내에서 해 주세요."
    ],
    hot: [
      "지금 아스팔트는 발바닥에 화상이에요. 손등을 5초 대봐서 뜨거우면 해 지고 나가는 게 안전해요.",
      "더운 날 강아지는 사람보다 훨씬 빨리 지쳐요. 그늘길로 짧게 돌고, 헥헥거림이 심하면 바로 쉬어 주세요.",
      "물을 꼭 챙기세요. 혀가 축 늘어지거나 침이 끈적해지면 열사병 신호예요. 즉시 그늘로 데려가세요.",
      "산책은 해 뜨기 전이나 해 진 후가 강아지에게 훨씬 편해요. 한낮은 피해 주세요."
    ],
    uv: [
      "볕이 강한 시간이에요. 지면 열기가 올라오니 흙길·그늘길 위주로 걸어 주세요.",
      "자외선 강한 낮 산책은 아침저녁으로 옮기는 게 강아지에게 편해요.",
      "털 짧은 아이나 밝은 털 아이는 피부가 탈 수 있어요. 그늘 위주로 짧게 걸어요."
    ],
    wind: [
      "바람 소리에 예민한 아이들은 놀랄 수 있어요. 리드줄을 짧게 잡고 걸으세요.",
      "바람이 강한 날이에요. 날리는 물건에 놀라지 않게 조용한 길로 다녀오세요.",
      "바람에 온갖 냄새가 실려 와서 강아지는 오히려 신나는 날이에요. 리드줄만 단단히요."
    ],
    humid: [
      "습한 날은 헥헥거림이 빨라져요. 천천히 걷고 힘들어하면 바로 쉬어 주세요.",
      "끈적한 날씨예요. 물을 챙기고, 산책 후엔 발가락 사이까지 말려 주세요.",
      "습할 때 무리하면 강아지가 더 힘들어요. 오늘은 거리보다 냄새 맡는 시간을 늘려 주세요."
    ],
    cold: [
      "쌀쌀해요. 소형견·단모종이라면 옷을 입혀 주고, 발이 시리지 않게 짧고 굵게 다녀오세요.",
      "찬 바닥은 발바닥과 관절에 부담이에요. 해 있는 따뜻한 시간에 다녀오는 게 좋아요.",
      "추운 날 산책 후엔 발과 배를 닦아 주면 감기·피부염을 막을 수 있어요.",
      "나이 많은 아이라면 추위에 관절이 더 아파요. 오늘은 무리 말고 짧게만요."
    ],
    good: [
      "오늘 같은 날은 강아지도 꼬리부터 흔들 거예요. 좋아하는 냄새 실컷 맡게 여유 있게 걸어 주세요.",
      "산책하기 딱 좋아요. 평소보다 조금 더 걸으며 새 골목을 탐험시켜 주면 강아지가 정말 행복해해요.",
      "날씨가 순해요. 물 한 통 챙겨서 중간중간 쉬어 가며 천천히 둘러보세요.",
      "강아지랑 눈 맞추며 걷기 좋은 날이에요. 서두르지 말고 강아지 속도에 맞춰 주세요."
    ],
    ok: [
      "무난한 산책 날이에요. 평소 코스로 20~30분이면 충분해요.",
      "나쁘지 않은 컨디션이에요. 강아지 상태를 보며 여유롭게 다녀오세요.",
      "평범한 날씨도 강아지에겐 신나는 외출이에요. 배변봉투 챙기고 출발해요."
    ],
    bad: [
      "오늘은 산책보다 실내 놀이가 나아요. 노즈워크나 터그로 에너지를 풀어 주세요.",
      "날이 궂어요. 배변만 짧게 해결하고 실내에서 놀아 주는 게 좋아요.",
      "산책 못 나가는 날엔 간식 숨기기 놀이가 최고예요. 후각 놀이 10분이 산책 30분만큼 지쳐요."
    ]
  },
  hike: {
    rain: [
      "비 오는 산은 바위·계단·나무뿌리 전부 미끄럼 구간이에요. 오늘 산행은 미루는 게 정답이에요.",
      "젖은 하산길이 산행 사고의 대부분이에요. 이미 산이라면 속도를 늦추고 스틱에 의지하세요.",
      "산의 비는 평지보다 굵고 차가워요. 저체온이 순식간이니 무리하지 마세요."
    ],
    rainMaybe: [
      "산 날씨는 평지보다 변덕이 심해요. 우비를 꼭 챙기고 능선에선 하늘을 자주 보세요.",
      "비 올 확률이 높아요. 오늘은 정상 대신 계곡·둘레길 같은 낮은 코스가 안전해요.",
      "비 소식이 있으면 하산 시간을 평소보다 1시간 당겨 잡으세요. 젖기 전에 내려와야 해요."
    ],
    dust: [
      "미세먼지가 많아 정상에 올라도 조망이 아쉬워요. 오늘은 숲길 위주 코스가 나아요.",
      "공기가 탁한 날 오르막은 호흡 부담이 커요. 페이스를 낮추고 물을 자주 마시세요.",
      "조망 산행은 미세먼지 걷힌 날로 아껴두세요. 오늘은 가볍게 몸만 풀어요."
    ],
    hot: [
      "더운 날 산행은 해 뜨기 전 출발이 정석이에요. 물은 평소의 1.5배로 챙기세요.",
      "한낮 오르막은 탈진 위험이 커요. 그늘 숲길로 다니고 정상은 시원할 때 노리세요.",
      "땀을 많이 흘리는 날엔 소금사탕·이온음료가 쥐 방지에 도움돼요."
    ],
    uv: [
      "능선과 정상엔 그늘이 없어요. 모자·선크림·선글라스 셋 다 챙기세요.",
      "자외선이 강한 날 바위 지대는 반사광까지 더해져요. 목덜미까지 꼼꼼히 바르세요.",
      "볕이 강할수록 수분도 빨리 말라요. 물 마시는 타이밍을 놓치지 마세요."
    ],
    wind: [
      "능선 바람은 평지의 두 배예요. 정상 인증샷 찍을 때 모자와 폰을 꽉 잡으세요.",
      "바람 강한 날 정상부는 한겨울처럼 느껴져요. 방풍 자켓 없인 오래 못 버텨요.",
      "돌풍이 부는 날 바위 구간은 특히 위험해요. 낮은 자세로, 무리하면 우회하세요."
    ],
    humid: [
      "습한 날 오르막은 땀이 비 오듯 해요. 여벌 상의를 챙기면 정상에서 행복해져요.",
      "끈적한 날씨엔 페이스를 평소의 80%로요. 땀 식을 때 한기가 오니 겉옷도 챙기세요.",
      "습도 높은 날은 물을 자주, 조금씩요. 한 번에 들이켜면 오히려 몸이 무거워져요."
    ],
    cold: [
      "산 위는 여기보다 6~10°C 낮아요. 얇은 옷 여러 겹이 두꺼운 옷 하나보다 나아요.",
      "추운 날 땀 젖은 몸으로 능선에 서면 순식간에 저체온이에요. 쉴 땐 겉옷부터 걸치세요.",
      "겨울 산은 아이젠·장갑·귀마개가 필수예요. 응달엔 얼음이 숨어 있어요."
    ],
    good: [
      "산행하기 완벽한 날이에요. 정상 조망까지 트였으니 카메라 챙기는 거 잊지 마세요.",
      "이런 날 산에 가면 왜 등산하는지 알게 돼요. 하산 시간만 여유 있게 잡고 출발하세요.",
      "공기 좋고 바람 좋은 산행 날이에요. 평소 눈여겨본 코스에 도전해보세요.",
      "날씨가 도와주는 날이에요. 물·간식 챙기고 무릎 아끼며 천천히 즐기세요."
    ],
    ok: [
      "무난한 산행 컨디션이에요. 익숙한 코스로 부담 없이 다녀오세요.",
      "정상 욕심만 안 내면 좋은 하루 산행이 될 거예요. 하산 시간 확인하고 출발하세요.",
      "특별하진 않지만 산은 늘 좋죠. 가벼운 코스로 몸 상태 봐가며 올라요."
    ],
    bad: [
      "오늘 산은 위험해요. 산은 도망가지 않으니 다음 좋은 날을 노리세요.",
      "이런 날 무리한 산행이 사고로 이어져요. 실내 운동으로 체력을 아껴두세요.",
      "산행 대신 다음 산행 코스를 계획해보는 건 어때요. 준비된 산행이 안전한 산행이에요."
    ]
  },
  bike: {
    rain: [
      "비 오는 날 라이딩은 제동거리가 길어지고 미끄러워요. 오늘은 실내 자전거가 안전해요.",
      "노면이 젖으면 코너와 브레이크가 위험해요. 꼭 타야 하면 속도를 크게 낮추세요.",
      "비 온 뒤 도로 가장자리엔 모래·낙엽이 쓸려 있어요. 코너에서 특히 조심하세요."
    ],
    rainMaybe: [
      "비 올 확률이 높아요. 짧은 코스로 잡고 라이트와 방수 겉옷을 챙기세요.",
      "비 소식이 있어요. 나간다면 젖은 노면 대비해 여유 있게 타세요.",
      "돌아오는 길에 비 맞을 수 있어요. 멀리 가지 말고 집 근처 순환 코스로요."
    ],
    dust: [
      "미세먼지가 있어 오래 타긴 아쉬워요. 강변 코스로 짧게, 숨차면 속도를 낮추세요.",
      "공기가 탁한 날이에요. 큰길보다 자전거도로로, 평소보다 짧게 다녀오세요.",
      "라이딩은 호흡량이 많아 먼지 영향이 커요. 오늘은 가볍게 몸만 푸는 정도로요."
    ],
    hot: [
      "더위엔 라이딩 중 탈수가 빨라요. 물통을 꼭 챙기고 그늘 많은 코스로 도세요.",
      "한낮 더위는 체력 소모가 커요. 아침저녁 시원할 때 타는 게 훨씬 좋아요.",
      "아스팔트 열기가 올라오는 시간이에요. 강변·숲길 코스가 몇 도는 시원해요."
    ],
    uv: [
      "햇살이 강한 시간이에요. 아이웨어와 선크림을 챙기고 그늘 코스로 도세요.",
      "자외선이 강해 눈이 쉽게 지쳐요. 선글라스는 라이딩 안전에도 도움이 돼요.",
      "장갑 안 낀 손등, 목 뒤가 제일 잘 타요. 선크림 꼼꼼히 바르고 출발하세요."
    ],
    wind: [
      "바람이 강해요. 나갈 때 맞바람으로 시작하면 돌아올 때 등바람이라 편해요.",
      "강풍엔 자전거가 휘청여 위험해요. 다리·둑길·트인 구간을 특히 조심하세요.",
      "옆바람은 맞바람보다 위험해요. 트럭 지나갈 때 핸들 꽉 잡으세요."
    ],
    humid: [
      "습한 날은 땀이 안 말라 끈적여요. 통풍 되는 저지에 편한 기어로 타세요.",
      "끈적한 날씨예요. 물을 자주 마시고 무리한 언덕은 피하세요.",
      "습도 높은 날은 체인도 사람도 무거워요. 오늘은 순위 없는 편한 라이딩으로요."
    ],
    cold: [
      "쌀쌀한데 라이딩은 체감이 더 떨어져요. 방풍 자켓과 장갑은 필수예요.",
      "추운 날은 손발이 먼저 시려요. 방풍 장갑과 넥워머로 초반을 버티세요.",
      "겨울 라이딩은 귀가 제일 아파요. 귀 덮는 헤어밴드 하나면 세상이 달라져요."
    ],
    good: [
      "라이딩하기 좋아요. 초반은 편한 기어로 몸을 풀고 후반에 리듬을 올려보세요.",
      "바람도 적당한 좋은 날이에요. 안전 장비 챙기고 즐겁게 페달을 밟아보세요.",
      "몸이 가볍게 느껴질 날씨예요. 긴 코스도 부담 없이 다녀올 수 있어요.",
      "이런 날은 평속이 저절로 올라요. 새 코스 개척하기 딱 좋은 날이에요."
    ],
    ok: [
      "무난한 라이딩 컨디션이에요. 가까운 강변 코스로 가볍게 다녀오세요.",
      "나쁘지 않은 날이에요. 안전 위주로 짧게 타고 오면 딱 좋아요.",
      "평범한 날씨지만 페달 밟는 기분은 언제나 좋죠. 타이어 공기만 확인하고 출발해요."
    ],
    bad: [
      "라이딩엔 아쉬운 날이에요. 무리하기보다 실내 자전거나 휴식이 나아요.",
      "굳이 탄다면 아주 짧게, 안전 장비를 꼭 갖추고 다녀오세요.",
      "이런 날은 자전거 정비의 날로 써보세요. 체인 닦고 기름칠하면 다음 라이딩이 즐거워요."
    ]
  }
};

export function composeOneLiner(slot: RunningSlot, isTomorrow: boolean, activity: ActivityKey = "run") {
  const seed = slot.hour * 13 + Math.round(slot.totalScore) + (isTomorrow ? 500 : 0);
  const prefix = isTomorrow ? "내일은 " : "";
  const t = ONE_LINERS[activity];

  if (slot.precipitation >= 0.5) return prefix + pick(t.rain, seed);
  if ((slot.precipitationProbability ?? 0) >= 60) return prefix + pick(t.rainMaybe, seed);
  if ((slot.pm25 ?? 0) > 35) return prefix + pick(t.dust, seed);
  if (slot.apparentTemperature >= 27) return prefix + pick(t.hot, seed);
  if (slot.uvIndex >= 6) return prefix + pick(t.uv, seed);
  if (slot.windSpeed >= 8) return prefix + pick(t.wind, seed);
  if (slot.humidity >= 75) return prefix + pick(t.humid, seed);
  if (slot.apparentTemperature <= 3) return prefix + pick(t.cold, seed);
  if (slot.totalScore >= 72) return prefix + pick(t.good, seed);
  if (slot.totalScore >= 55) return prefix + pick(t.ok, seed);
  return prefix + pick(t.bad, seed);
}

// 히어로 조건 칩 (아이콘 + 라벨 + 색) — 가장 눈에 띄는 3가지
export type ConditionChip = {
  key: "precip" | "dust" | "temp" | "uv" | "wind" | "humidity";
  label: string;
  tone: GradeTone;
};

export function getConditionChips(slot: RunningSlot): ConditionChip[] {
  const hot = slot.apparentTemperature >= 19;
  const defs: Array<{ key: ConditionChip["key"]; score: number; good: string; warn: string }> = [
    { key: "precip", score: slot.precipitationScore, good: "비 없음", warn: "비 주의" },
    // 대기질 결측(dustScore=null)이면 미세먼지 칩은 아예 다루지 않는다 — "공기 맑음"으로 위장 금지.
    ...(slot.dustScore === null ? [] : [{ key: "dust" as const, score: slot.dustScore, good: "공기 맑음", warn: "미세먼지" }]),
    { key: "temp", score: slot.temperatureScore, good: "선선함", warn: hot ? "더움" : "쌀쌀함" },
    { key: "uv", score: slot.uvScore, good: "자외선 낮음", warn: "자외선 강함" },
    { key: "wind", score: slot.windScore, good: "바람 잔잔", warn: "바람 강함" },
    { key: "humidity", score: slot.humidityScore, good: "습도 쾌적", warn: slot.humidity >= 60 ? "습함" : "건조" }
  ];

  // 아주 좋거나 아주 나쁜(70에서 먼) 것부터 = 가장 말할 가치 있는 조건
  const sorted = [...defs].sort((a, b) => Math.abs(b.score - 70) - Math.abs(a.score - 70));

  return sorted.slice(0, 3).map((item) => {
    const isGood = item.score >= 65;
    const tone: GradeTone = isGood ? "good" : item.score < 40 ? "bad" : "caution";
    return { key: item.key, label: isGood ? item.good : item.warn, tone };
  });
}

/* ------------------------------------------------------------------ *
 * 근거 카드 상세 (바텀시트용) — 등급 스케일 + 러닝 의미 + 팁
 * ------------------------------------------------------------------ */
export type MetricKey = "feel" | "precip" | "dust" | "uv" | "wind" | "humidity";

export type ScaleSegment = {
  label: string;
  tone: GradeTone;
  from: number;
  to: number;
};

export type MetricDetail = {
  key: MetricKey;
  title: string;
  valueText: string;
  unit: string;
  grade: MetricGrade;
  rangeMin: number;
  rangeMax: number;
  segments: ScaleSegment[];
  marker: number; // 0~1
  meaning: string;
  tip: string;
};

function markerRatio(value: number, min: number, max: number) {
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

// 활동별 지표 문구 — meaning/tip에서 러닝 표현이 다른 활동에 새지 않게 분리
const METRIC_WORDS: Record<ActivityKey, { doing: string; doingGood: string; hard: string }> = {
  run: { doing: "러닝", doingGood: "달리기", hard: "강도 높은 러닝" },
  walk: { doing: "걷기", doingGood: "산책", hard: "오래 걷기" },
  dog: { doing: "산책", doingGood: "산책", hard: "긴 산책" },
  hike: { doing: "산행", doingGood: "산행", hard: "긴 산행" },
  bike: { doing: "라이딩", doingGood: "라이딩", hard: "오래 라이딩" }
};

export function getMetricDetail(key: MetricKey, slot: RunningSlot, activity: ActivityKey = "run"): MetricDetail {
  const isRun = activity === "run";
  const isDog = activity === "dog";
  const isBike = activity === "bike";
  const isHike = activity === "hike";
  const words = METRIC_WORDS[activity];
  switch (key) {
    case "feel": {
      const value = slot.apparentTemperature;
      const grade = gradeTemperature(value);
      const hot = value >= 19;
      return {
        key,
        title: "체감온도",
        valueText: value.toFixed(1),
        unit: "°C",
        grade,
        rangeMin: -10,
        rangeMax: 40,
        segments: [
          { label: "한파", tone: "bad", from: -10, to: 0 },
          { label: "쌀쌀", tone: "caution", from: 0, to: 8 },
          { label: "쾌적", tone: "good", from: 8, to: 18 },
          { label: "더움", tone: "caution", from: 18, to: 28 },
          { label: "폭염", tone: "bad", from: 28, to: 40 }
        ],
        marker: markerRatio(value, -10, 40),
        meaning:
          grade.tone === "good"
            ? `${words.doing}하기 편한 체감온도예요. 덥거나 춥다는 부담이 적어 몸이 가볍게 느껴질 거예요.`
            : grade.tone === "normal"
            ? `무난한 온도예요. 평소 ${words.doing} 복장이면 충분하고, 오래 나갈 때만 한 겹을 조절하세요.`
            : grade.tone === "caution"
            ? hot
              ? isRun
                ? "살짝 더워요. 점수는 괜찮아도 후반에 체온이 오를 수 있으니 초반 페이스를 낮추세요."
                : isDog
                ? "살짝 더워요. 그늘길로 천천히 걷고 물을 챙기면 산책은 괜찮아요."
                : "살짝 더워요. 한낮은 줄이고 아침저녁으로 옮기면 훨씬 편해요."
              : "조금 쌀쌀해요. 시작 10분만 버티면 괜찮지만 손·목 보온은 챙기세요."
            : hot
            ? `폭염 수준이에요. 한낮 ${words.doing}은 피하는 게 안전해요.`
            : "한파예요. 무리하지 말고 짧게, 보온을 철저히 하세요.",
        tip: hot
          ? isRun
            ? "달리기는 걷기보다 체감이 5~8°C 더 높게 느껴져요. 얇게 입으세요."
            : isDog
            ? "아스팔트는 기온보다 훨씬 뜨거워요. 손등을 5초 대보고 확인하세요."
            : isHike
            ? "산 정상은 여기보다 6~10°C 낮아요. 오를 땐 얇게, 정상에선 한 겹 더."
            : "한낮보다 아침저녁이 체감 5°C 이상 시원해요. 시간을 옮겨보세요."
          : isHike
          ? "정상부는 여기보다 6~10°C 낮아요. 레이어링이 답이에요."
          : isRun
          ? "출발 전 실내에서 가볍게 몸을 데우면 부상 위험이 줄어요."
          : "나가기 전 가볍게 몸을 풀면 추위가 덜 느껴져요."
      };
    }
    case "precip": {
      const prob = slot.precipitationProbability ?? 0;
      const amount = slot.precipitation;
      const grade = gradePrecipitation(amount, prob);
      return {
        key,
        title: "강수",
        valueText: amount >= 0.1 ? amount.toFixed(1) : `${Math.round(prob)}`,
        unit: amount >= 0.1 ? "mm" : "%",
        grade,
        rangeMin: 0,
        rangeMax: 100,
        segments: [
          { label: "없음", tone: "good", from: 0, to: 20 },
          { label: "약간", tone: "normal", from: 20, to: 50 },
          { label: "주의", tone: "caution", from: 50, to: 70 },
          { label: "비", tone: "bad", from: 70, to: 100 }
        ],
        marker: markerRatio(prob, 0, 100),
        meaning:
          amount >= 1
            ? isRun
              ? "비가 실제로 내려요. 노면 미끄럼과 체온 저하가 같이 오니 강도 높은 러닝은 피하세요."
              : isDog
              ? "비가 실제로 내려요. 산책은 배변 위주로 짧게 하고 다녀와서 발과 배를 닦아주세요."
              : isBike
              ? "비가 실제로 내려요. 노면이 미끄럽고 제동거리가 길어져 라이딩 위험이 커요."
              : isHike
              ? "비가 실제로 내려요. 바위·계단이 미끄러워 하산 구간 위험이 크게 올라가요."
              : "비가 내려요. 우산 없이 나가면 젖어요."
            : grade.tone === "good"
            ? `비 걱정이 거의 없어요. 시간대만 맞추면 ${words.doingGood}하기 편한 흐름이에요.`
            : grade.tone === "normal"
            ? "약한 비 가능성이 있어요. 지금 당장보다 뒤쪽 시간대가 바뀔 수 있어요."
            : isRun
            ? "비 신호가 뚜렷해요. 짧은 코스나 실내 대안을 같이 생각하세요."
            : "비 신호가 뚜렷해요. 우산이나 방수 준비를 챙기는 게 안전해요.",
        tip:
          amount >= 0.5 || prob >= 60
            ? isRun
              ? "아래 막대에서 굵은 구간을 먼저 보세요. 비가 오는 시간만 피하면 점수가 훨씬 좋아질 수 있어요."
              : isDog
              ? "아래 막대에서 비가 굵은 시간을 피하고, 젖은 뒤엔 발가락 사이까지 말려주세요."
              : "아래 막대에서 굵은 구간을 확인하고, 그 시간 전후로 이동 계획을 잡으세요."
            : "강수확률이 낮고 mm도 거의 없으면 실제로 젖을 가능성은 낮아요."
      };
    }
    case "dust": {
      const value = slot.pm25;
      // 대기질 결측 — 0(좋음)으로 위장하지 않고 "정보 없음"으로 정직하게 안내한다.
      if (value === null) {
        return {
          key,
          title: "미세먼지 (PM2.5)",
          valueText: "—",
          unit: "",
          grade: { label: "정보 없음", tone: "normal" },
          rangeMin: 0,
          rangeMax: 150,
          segments: [
            { label: "좋음", tone: "good", from: 0, to: 15 },
            { label: "보통", tone: "normal", from: 15, to: 35 },
            { label: "나쁨", tone: "caution", from: 35, to: 75 },
            { label: "매우 나쁨", tone: "bad", from: 75, to: 150 }
          ],
          marker: 0,
          meaning: "대기질 정보를 불러오지 못했어요. 이 시간대 점수에는 미세먼지가 반영되지 않았어요.",
          tip: "잠시 후 새로고침하면 대기질 정보를 다시 불러올 수 있어요."
        };
      }
      const grade = gradePm25(value);
      return {
        key,
        title: "미세먼지 (PM2.5)",
        valueText: value.toFixed(0),
        unit: "㎍/m³",
        grade,
        rangeMin: 0,
        rangeMax: 150,
        segments: [
          { label: "좋음", tone: "good", from: 0, to: 15 },
          { label: "보통", tone: "normal", from: 15, to: 35 },
          { label: "나쁨", tone: "caution", from: 35, to: 75 },
          { label: "매우 나쁨", tone: "bad", from: 75, to: 150 }
        ],
        marker: markerRatio(value, 0, 150),
        meaning:
          grade.tone === "good"
            ? `공기가 깨끗해요. 호흡 부담이 적어서 ${words.hard}도 비교적 편해요.`
            : grade.tone === "normal"
            ? "보통 수준이에요. 대부분은 무난하지만 민감하면 큰길보다 공원·하천길이 좋아요."
            : grade.tone === "caution"
            ? isDog
              ? "미세먼지가 나빠요. 강아지는 마스크를 못 쓰니 산책 길이를 줄이는 게 좋아요."
              : isHike
              ? "미세먼지가 나빠요. 정상 조망도 흐리고 오르막 호흡 부담이 커져요."
              : `미세먼지가 나빠요. 숨이 차는 ${words.hard}는 피하고 강도를 낮추세요.`
            : isDog
            ? "매우 나빠요. 오늘 산책은 실내 놀이로 바꾸는 게 좋아요."
            : `매우 나빠요. 야외 ${words.doing} 대신 실내를 권해요.`,
        tip:
          grade.tone === "good" || grade.tone === "normal"
            ? isRun
              ? "러닝은 호흡량이 늘어 공기질 영향을 크게 받아요. 좋은 날 잘 챙겨 뛰세요."
              : isDog
              ? "강아지는 코가 예민해요. 공기 좋은 날 실컷 냄새 맡게 해주세요."
              : "공기 좋은 날엔 한 정거장 더 걷는 것도 좋아요."
            : isRun
            ? "KF 마스크는 격한 러닝엔 호흡을 막아요. 차라리 실내가 나아요."
            : isDog
            ? "강아지는 마스크를 못 써요. 나쁜 날은 실내 놀이가 답이에요."
            : "이동해야 하면 KF 마스크와 지하 구간 활용이 도움돼요."
      };
    }
    case "uv": {
      const value = slot.uvIndex;
      const grade = gradeUv(value);
      return {
        key,
        title: "자외선",
        valueText: value.toFixed(1),
        unit: "UVI",
        grade,
        rangeMin: 0,
        rangeMax: 12,
        segments: [
          { label: "낮음", tone: "good", from: 0, to: 2 },
          { label: "보통", tone: "normal", from: 2, to: 5 },
          { label: "높음", tone: "caution", from: 5, to: 7 },
          { label: "매우 높음", tone: "bad", from: 7, to: 12 }
        ],
        marker: markerRatio(value, 0, 12),
        meaning:
          grade.tone === "good"
            ? `자외선이 약해요. 햇볕 부담 없이 ${words.doingGood}하기 편한 시간이에요.`
            : grade.tone === "normal"
            ? `보통 수준이에요. 짧게는 괜찮고, 오래 ${words.doing}할 거면 선크림을 챙기세요.`
            : grade.tone === "caution"
            ? isDog
              ? "자외선이 강해요. 지면 열기도 오르니 그늘길·흙길로 걸으세요."
              : "자외선이 강해요. 점수가 좋아도 피부와 눈 피로는 따로 챙겨야 해요."
            : "매우 강해요. 한낮은 피하고 이른 아침이나 저녁을 노리세요.",
        tip: isDog
          ? "볕 강한 낮엔 아스팔트가 발바닥을 데울 수 있어요. 손등 5초 테스트를 하세요."
          : "자외선은 보통 낮 12~15시에 가장 강해요. 시간대만 옮겨도 크게 줄어요."
      };
    }
    case "wind": {
      const value = slot.windSpeed;
      const grade = gradeWind(value);
      return {
        key,
        title: "바람",
        valueText: value.toFixed(1),
        unit: "m/s",
        grade,
        rangeMin: 0,
        rangeMax: 18,
        segments: [
          { label: "약함", tone: "good", from: 0, to: 4 },
          { label: "보통", tone: "normal", from: 4, to: 8 },
          { label: "강함", tone: "caution", from: 8, to: 14 },
          { label: "매우 강함", tone: "bad", from: 14, to: 18 }
        ],
        marker: markerRatio(value, 0, 18),
        meaning:
          grade.tone === "good"
            ? isRun
              ? "바람이 잔잔해요. 페이스가 흔들리지 않아 리듬 잡기 편해요."
              : "바람이 잔잔해요. 체감 부담이 적어 쾌적하게 다닐 수 있어요."
            : grade.tone === "normal"
            ? "적당한 바람이에요. 더운 날엔 시원하게 느껴지고, 기록이나 이동에도 큰 방해는 아니에요."
            : grade.tone === "caution"
            ? isRun
              ? "바람이 강해요. 맞바람 구간에서 체력 소모가 커요."
              : isDog
              ? "바람이 강해요. 소리에 예민한 아이는 놀랄 수 있어요."
              : isBike
              ? "바람이 강해요. 자전거가 휘청여 위험할 수 있어요."
              : isHike
              ? "바람이 강해요. 능선·정상은 여기보다 훨씬 세게 불어요."
              : "바람이 강해요. 체감온도가 뚝 떨어지고 우산이 뒤집혀요."
            : isRun
            ? "매우 강한 바람이에요. 기록보다 안전한 러닝에 집중하세요."
            : isBike
            ? "매우 강한 바람이에요. 라이딩은 미루는 게 안전해요."
            : "매우 강한 바람이에요. 야외 활동은 줄이는 게 안전해요.",
        tip: isRun
          ? "나갈 때 맞바람, 돌아올 때 뒷바람 코스면 후반이 훨씬 수월해요."
          : isDog
          ? "바람 강한 날은 리드줄을 평소보다 짧게 잡는 게 안전해요."
          : isBike
          ? "강풍엔 다리·둑길·트인 구간이 특히 위험해요. 감속하세요."
          : isHike
          ? "능선 바람은 평지의 1.5~2배예요. 방풍 자켓이 산행의 절반이에요."
          : "골목·건물 사이 돌풍이 제일 세요. 큰길 쪽이 오히려 나을 때도 있어요."
      };
    }
    case "humidity":
    default: {
      const value = slot.humidity;
      const grade = gradeHumidity(value);
      return {
        key: "humidity",
        title: "습도",
        valueText: `${Math.round(value)}`,
        unit: "%",
        grade,
        rangeMin: 0,
        rangeMax: 100,
        segments: [
          { label: "건조", tone: "caution", from: 0, to: 30 },
          { label: "보통", tone: "normal", from: 30, to: 45 },
          { label: "쾌적", tone: "good", from: 45, to: 60 },
          { label: "눅눅", tone: "caution", from: 60, to: 78 },
          { label: "습함", tone: "bad", from: 78, to: 100 }
        ],
        marker: markerRatio(value, 0, 100),
        meaning:
          grade.tone === "good"
            ? "땀이 잘 마르는 쾌적한 습도예요. 같은 온도라도 훨씬 가볍게 느껴질 수 있어요."
            : grade.tone === "normal"
            ? "무난한 습도예요. 오래 움직일 때만 수분을 조금 더 챙기면 충분해요."
            : value >= 70
            ? isRun
              ? "습해서 땀이 잘 안 말라요. 점수가 괜찮아도 후반 체감은 더 무거워질 수 있어요."
              : isDog
              ? "습해요. 강아지 헥헥거림이 빨라지니 천천히 걷고 물을 챙기세요."
              : "습해서 걷기만 해도 끈적일 수 있어요. 속도를 낮추면 훨씬 편해요."
            : "건조해요. 목과 피부가 마르기 쉬우니 수분을 조금씩 자주 마시세요.",
        tip:
          value >= 70
            ? isRun
              ? "습한 날은 심박이 빨리 올라가요. 인터벌보다 편한 조깅이 좋아요."
              : isDog
              ? "습한 날 산책 후엔 발가락 사이까지 잘 말려줘야 피부병을 막아요."
              : "습한 날은 여유 있게 움직이는 게 답이에요. 갈아입을 옷도 방법이에요."
            : "통풍 잘 되는 옷이 땀 배출에 도움이 돼요."
      };
    }
  }
}
