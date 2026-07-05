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
export type DayPartKey = "morning" | "day" | "evening";

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
const DAY_PART_DESC: Record<ActivityKey, [string, string, string]> = {
  run: ["상쾌한 아침", "한낮 러닝", "선선한 저녁"],
  walk: ["상쾌한 아침", "한낮 걷기", "선선한 저녁"],
  dog: ["아침 산책", "한낮 산책", "저녁 산책"],
  commute: ["출근길", "한낮 이동", "퇴근길"]
};

const DAY_PARTS: Array<{ key: DayPartKey; label: string; icon: string; desc: string; range: [number, number] }> = [
  { key: "morning", label: "아침", icon: "sunrise", desc: "상쾌한 아침", range: [6, 11] },
  { key: "day", label: "낮", icon: "day", desc: "한낮 러닝", range: [12, 17] },
  { key: "evening", label: "저녁", icon: "sunset", desc: "선선한 저녁", range: [18, 23] }
];

// 강수 1mm 이상이면 러닝 불가로 보고 추천에서 제외. 약한 비(우중런)는 점수와 함께 표시.
function isRunnable(slot: RunningSlot) {
  return slot.precipitation < 1 && slot.totalScore >= 42;
}

function isRainy(slot: RunningSlot) {
  return slot.precipitation >= 0.2 || slot.precipitationProbability >= 60;
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

export function getRankedWindows(slots: RunningSlot[], isToday: boolean, nowHour: number): RankedWindow[] {
  const byHour = new Map(slots.map((s) => [s.hour, s]));
  const candidates: Array<{ h: number; avg: number; a: RunningSlot; b: RunningSlot }> = [];

  // 오전 6시 ~ 자정(24시) 안의 2시간 구간만 (새벽 제외)
  for (let h = 6; h <= 22; h += 1) {
    const a = byHour.get(h);
    const b = byHour.get(h + 1);
    if (!a || !b) continue;
    if (isToday && h < nowHour) continue; // 이미 지난(또는 진행 중) 시간대 제외
    const rainy =
      a.precipitation >= 0.2 || b.precipitation >= 0.2 || a.precipitationProbability >= 60 || b.precipitationProbability >= 60;
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
      precipProb: Math.round(Math.max(c.a.precipitationProbability, c.b.precipitationProbability)),
      dustLabel: gradePm25(peak.pm25).label,
      windLabel: gradeWind(peak.windSpeed).label
    };
  });
}

export function getDayParts(slots: RunningSlot[], isToday: boolean, nowHour: number, activity: ActivityKey = "run"): DayPart[] {
  return DAY_PARTS.map((part, index) => {
    const desc = DAY_PART_DESC[activity][index];
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

/* ------------------------------------------------------------------ *
 * 4줄 코치 브리핑 (AI 없이 로컬 생성)
 * ------------------------------------------------------------------ */
export type Briefing = {
  verdict: string;
  timing: string;
  caution: string;
  tip: string;
};

type Factor = {
  score: number;
  strong: string;
  key: "precip" | "dust" | "temp" | "uv" | "wind" | "humidity";
};

function factorsOf(slot: RunningSlot): Factor[] {
  return [
    { score: slot.precipitationScore, strong: "비 없음", key: "precip" },
    { score: slot.dustScore, strong: "공기 맑음", key: "dust" },
    { score: slot.temperatureScore, strong: "선선함", key: "temp" },
    { score: slot.uvScore, strong: "자외선 약함", key: "uv" },
    { score: slot.windScore, strong: "바람 잔잔", key: "wind" },
    { score: slot.humidityScore, strong: "습도 적당", key: "humidity" }
  ];
}

function pick(list: string[], seed: number) {
  return list[Math.abs(seed) % list.length];
}

function hourLabel(slot: RunningSlot) {
  return `${String(slot.hour).padStart(2, "0")}시`;
}

// 히어로용 짧은 이유 (강점 2개)
export function shortReason(slot: RunningSlot) {
  const strengths = [...factorsOf(slot)].sort((a, b) => b.score - a.score);
  return `${strengths[0].strong} · ${strengths[1].strong}`;
}

// 히어로 코멘트 아래 한 줄 이유 문장 ("선선하고 공기가 맑아요" 식)
const REASON_FORMS: Record<Factor["key"], { mid: string; end: string }> = {
  precip: { mid: "비 걱정 없", end: "비 걱정 없어요" },
  dust: { mid: "공기가 맑", end: "공기가 맑아요" },
  temp: { mid: "선선하", end: "기온이 딱 좋아요" },
  uv: { mid: "자외선이 약하", end: "자외선이 약해요" },
  wind: { mid: "바람이 잔잔하", end: "바람이 잔잔해요" },
  humidity: { mid: "습도가 알맞", end: "습도가 알맞아요" }
};

export function heroReason(slot: RunningSlot) {
  const factors = factorsOf(slot);

  if (slot.totalScore >= 55) {
    const [a, b] = [...factors].sort((x, y) => y.score - x.score);
    return `${REASON_FORMS[a.key].mid}고 ${REASON_FORMS[b.key].end}`;
  }

  const weakest = [...factors].sort((x, y) => x.score - y.score)[0];
  switch (weakest.key) {
    case "precip":
      return "비 소식이 변수예요";
    case "dust":
      return "미세먼지가 아쉬워요";
    case "temp":
      return slot.apparentTemperature >= 19 ? "더위가 부담이에요" : "쌀쌀한 시간이에요";
    case "uv":
      return "자외선이 강한 시간이에요";
    case "wind":
      return "바람이 강한 편이에요";
    default:
      return slot.humidity >= 60 ? "습도가 높은 편이에요" : "공기가 건조해요";
  }
}

// 점수대별 헤드라인 — 활동 전용 카피 (run은 기존 문구 그대로)
const HEADLINE_SCORE: Record<ActivityKey, Array<[number, string[]]>> = {
  run: [
    [88, ["지금 뛰기 최고예요", "완벽한 날이에요", "달리기 딱 좋아요"]],
    [80, ["지금 뛰기 좋아요", "컨디션 좋아요", "기분 좋은 날이에요"]],
    [72, ["뛰기 무난해요", "달리기 괜찮아요", "나쁘지 않아요"]],
    [55, ["보통이에요", "무난한 편이에요", "달릴 만해요"]],
    [38, ["살짝 아쉬워요", "컨디션 별로예요", "무리는 금물이에요"]],
    [0, ["오늘은 쉬어가요", "실내가 나아요", "달리기 어려워요"]]
  ],
  walk: [
    [88, ["지금 걷기 최고예요", "산책하기 완벽해요", "나가기 딱 좋아요"]],
    [80, ["지금 걷기 좋아요", "산책하기 좋아요", "기분 좋은 날이에요"]],
    [72, ["걷기 무난해요", "산책 괜찮아요", "나쁘지 않아요"]],
    [55, ["보통이에요", "무난한 편이에요", "걸을 만해요"]],
    [38, ["살짝 아쉬워요", "날이 좀 별로예요", "긴 산책은 아쉬워요"]],
    [0, ["오늘은 실내가 나아요", "나가기 아쉬워요", "쉬어가는 날이에요"]]
  ],
  dog: [
    [88, ["산책 나가기 최고예요", "완벽한 산책 날씨예요", "강아지가 신나겠어요"]],
    [80, ["산책하기 좋아요", "산책 컨디션 좋아요", "기분 좋은 산책 날이에요"]],
    [72, ["산책 무난해요", "산책 괜찮아요", "나쁘지 않아요"]],
    [55, ["보통이에요", "무난한 편이에요", "짧게 걸을 만해요"]],
    [38, ["살짝 아쉬워요", "산책엔 좀 별로예요", "긴 산책은 무리예요"]],
    [0, ["오늘 산책은 쉬어가요", "실내 놀이가 나아요", "산책이 어려워요"]]
  ],
  commute: [
    [88, ["이동하기 최고예요", "걸어 다니기 완벽해요", "쾌적한 출퇴근길이에요"]],
    [80, ["이동하기 좋아요", "걸어 다니기 좋아요", "출퇴근길 쾌적해요"]],
    [72, ["이동 무난해요", "다니기 괜찮아요", "나쁘지 않아요"]],
    [55, ["보통이에요", "무난한 편이에요", "다닐 만해요"]],
    [38, ["이동이 좀 번거로워요", "날씨가 아쉬워요", "대비가 필요해요"]],
    [0, ["이동이 힘든 날이에요", "대중교통이 나아요", "날씨가 궂어요"]]
  ]
};

export function heroHeadline(slot: RunningSlot, activity: ActivityKey = "run") {
  const seed = slot.hour * 17 + Math.round(slot.totalScore);

  // 큰 제목 = "상태" (행동/팁 단어 배제). 작은 제목과 주제가 겹치지 않게.
  if (slot.precipitation >= 1) return pick(["비가 와요", "궂은 날이에요", "젖은 노면이에요"], seed);
  if (slot.precipitationProbability >= 70) return pick(["비 올 수 있어요", "하늘이 흐려요", "곧 비 소식이에요"], seed);
  if (slot.pm25 > 75) return pick(["공기가 나빠요", "미세먼지 심해요", "탁한 공기예요"], seed);
  if (slot.pm25 > 35) return pick(["미세먼지 있어요", "공기가 탁해요", "먼지가 좀 껴요"], seed);
  if (slot.apparentTemperature >= 30) return pick(["많이 더워요", "한낮 무더위예요", "푹푹 쪄요"], seed);
  if (slot.apparentTemperature >= 26) return pick(["조금 더워요", "살짝 무더워요", "기온이 높아요"], seed);
  if (slot.apparentTemperature <= -5) return pick(["많이 추워요", "한파예요", "매섭게 추워요"], seed);
  if (slot.apparentTemperature <= 3) return pick(["쌀쌀해요", "제법 추워요", "찬 바람 불어요"], seed);
  if (slot.windSpeed >= 12) return pick(["바람이 강해요", "강풍이 불어요", "바람 많이 불어요"], seed);
  if (slot.uvIndex >= 7) return pick(["햇살이 강해요", "볕이 뜨거워요", "자외선 세요"], seed);
  if (slot.humidity >= 80) return pick(["습도가 높아요", "눅눅한 날이에요", "끈적이는 날이에요"], seed);

  for (const [threshold, variants] of HEADLINE_SCORE[activity]) {
    if (slot.totalScore >= threshold) return pick(variants, seed);
  }
  return pick(HEADLINE_SCORE[activity][HEADLINE_SCORE[activity].length - 1][1], seed);
}

// 작은 제목 = "행동/팁". 활동별 테이블 — 날씨 조건 11종 + 점수대 6단.
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
      [88, ["초반 10분만 천천히요", "기록 도전 해볼 만해요", "끝나고 스트레칭 잊지 마요"]],
      [80, ["편한 페이스로 즐겨요", "리듬 잡기 좋아요", "가볍게 몸 풀고 가요"]],
      [72, ["부담 없이 다녀와요", "짧게라도 좋아요", "자세에 집중해봐요"]],
      [55, ["짧은 코스 추천해요", "20분 조깅이면 충분해요", "컨디션 보며 가요"]],
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
      [88, ["오래 걸어도 좋아요", "새 길로 걸어봐요", "산책하며 기분 전환해요"]],
      [80, ["느긋하게 즐겨요", "동네 한 바퀴 어때요", "가볍게 걸어봐요"]],
      [72, ["부담 없이 다녀와요", "짧게라도 좋아요", "바람 쐬고 와요"]],
      [55, ["짧은 산책 추천해요", "20분이면 충분해요", "가까운 곳으로 가요"]],
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
      [88, ["신나게 뛰어놀기 좋아요", "긴 산책 코스 어때요", "노즈워크 하기 좋아요"]],
      [80, ["여유롭게 한 바퀴 돌아요", "공원 나들이 좋아요", "냄새 실컷 맡게 해줘요"]],
      [72, ["평소 코스면 충분해요", "부담 없이 다녀와요", "가볍게 걸어요"]],
      [55, ["짧은 산책 추천해요", "배변 산책 정도가 좋아요", "상태 보며 걸어요"]],
      [38, ["아주 짧게만 다녀와요", "무리하지 않는 게 좋아요", "실내 놀이를 섞어요"]],
      [0, ["오늘은 실내 놀이해요", "터그·노즈워크 어때요", "내일 나가는 게 나아요"]]
    ]
  },
  commute: {
    rain: ["우산 꼭 챙기세요", "방수 신발이 좋아요", "여유 있게 출발해요"],
    rainMaybe: ["접이식 우산 챙겨요", "나가기 전 하늘 확인해요", "비 오기 전에 이동해요"],
    dustBad: ["마스크 챙기면 좋아요", "지하 구간을 활용해요", "야외 대기는 짧게요"],
    dustSoso: ["큰길보단 골목길로요", "마스크 있으면 든든해요", "환기는 실내에서요"],
    hot2: ["시원한 옷차림으로요", "그늘 쪽 인도로 걸어요", "물 한 병 챙겨요"],
    hot1: ["겉옷은 가볍게요", "그늘길이 편해요", "천천히 걸어요"],
    cold2: ["단단히 껴입고 나가요", "장갑·목도리 챙겨요", "실내 대기를 활용해요"],
    cold1: ["따뜻하게 입고 나가요", "핫팩 있으면 좋아요", "종종걸음이 답이에요"],
    windy: ["우산이 뒤집힐 수 있어요", "모자 눌러 쓰세요", "건물 사이 돌풍 조심해요"],
    uv: ["양산도 방법이에요", "선크림 바르고 나가요", "그늘 쪽으로 걸어요"],
    humid: ["겉옷은 통풍 좋게요", "지하철이 쾌적해요", "여유 있게 이동해요"],
    score: [
      [88, ["한 정거장 걸어봐요", "걷기 좋은 날이에요", "산책 겸 걸어서 가요"]],
      [80, ["걸어서 이동 괜찮아요", "쾌적하게 다녀올 수 있어요", "가볍게 걸어요"]],
      [72, ["평소대로 다니면 돼요", "무난한 이동길이에요", "부담 없이 나가요"]],
      [55, ["평소대로 준비해요", "크게 신경 쓸 건 없어요", "무난하게 다녀와요"]],
      [38, ["대비하고 나가요", "이동 시간을 아껴요", "필요한 것만 챙겨요"]],
      [0, ["대중교통이 편해요", "이동은 최소로요", "날씨 앱 확인하며 다녀요"]]
    ]
  }
};

export function heroSubline(slot: RunningSlot, activity: ActivityKey = "run") {
  const seed = slot.hour * 17 + Math.round(slot.totalScore);
  const t = SUBLINES[activity];

  if (slot.precipitation >= 1) return pick(t.rain, seed);
  if (slot.precipitationProbability >= 70) return pick(t.rainMaybe, seed);
  if (slot.pm25 > 75) return pick(t.dustBad, seed);
  if (slot.pm25 > 35) return pick(t.dustSoso, seed);
  if (slot.apparentTemperature >= 30) return pick(t.hot2, seed);
  if (slot.apparentTemperature >= 26) return pick(t.hot1, seed);
  if (slot.apparentTemperature <= -5) return pick(t.cold2, seed);
  if (slot.apparentTemperature <= 3) return pick(t.cold1, seed);
  if (slot.windSpeed >= 12) return pick(t.windy, seed);
  if (slot.uvIndex >= 7) return pick(t.uv, seed);
  if (slot.humidity >= 80) return pick(t.humid, seed);

  for (const [threshold, variants] of t.score) {
    if (slot.totalScore >= threshold) return pick(variants, seed);
  }
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
      "노면이 젖어 발목 부담이 있어요. 나간다면 천천히 걷듯 시작하고 무리하지 마세요."
    ],
    rainMaybe: [
      "비 올 확률이 높아 멀리 가기엔 애매해요. 집 근처 짧은 코스로 잡아보세요.",
      "비 소식이 있어요. 방수 자켓을 가볍게 걸치고, 처음부터 편한 페이스로 가세요."
    ],
    dust: [
      "미세먼지가 있어 강한 러닝은 아쉬워요. 호흡 편한 조깅으로 낮추고 답답하면 걸으세요.",
      "공기가 조금 아쉬운 날이에요. 큰길보다 공원 안쪽으로, 평소보다 짧게 다녀오세요."
    ],
    hot: [
      "더위가 있어 심박이 빨리 오를 수 있어요. 페이스를 낮추고 물 한 컵 챙기세요.",
      "몸에 열이 빨리 쌓이는 날씨예요. 그늘 많은 코스로 돌고, 숨이 거칠면 쉬어가세요."
    ],
    uv: [
      "햇살이 강한 시간이에요. 모자와 선크림을 챙기고, 그늘 많은 길로 돌아보세요.",
      "자외선이 강해 피부와 눈이 쉽게 지쳐요. 선글라스와 모자를 챙기고 한낮은 피하세요."
    ],
    wind: [
      "바람이 있으니 나갈 때 맞바람으로 시작해보세요. 돌아올 땐 등바람이라 더 편해요.",
      "바람이 강해 체감온도가 쉽게 떨어져요. 얇은 바람막이 하나면 후반이 훨씬 편합니다."
    ],
    humid: [
      "습도가 높아 같은 속도여도 심박이 빨리 올라요. 평소보다 10% 느리게 조깅하세요.",
      "끈적한 날씨라 땀이 잘 마르지 않아요. 통풍 잘 되는 옷에 편한 조깅이 좋아요."
    ],
    cold: [
      "쌀쌀하니 실내에서 몸을 살짝 데우고 나가세요. 첫 1km는 워밍업처럼 천천히요.",
      "추운 날은 장갑과 워밍업이 러닝의 절반이에요. 초반엔 여유 있게 시작하세요."
    ],
    good: [
      "컨디션이 좋아요. 초반 10분만 천천히 올리고, 후반엔 리듬을 믿고 가볍게 밀어보세요.",
      "달리기 좋은 조건이에요. 기록 욕심보다 호흡 리듬에 집중하면 끝까지 기분 좋게 이어져요.",
      "몸이 가볍게 느껴질 날씨예요. 꾸준히 달리고, 끝나고 5분 스트레칭까지 챙겨보세요."
    ],
    ok: [
      "무난한 컨디션이에요. 거리 욕심보다 자세와 호흡에 집중하며 20~30분 가볍게 뛰어보세요.",
      "나쁘지 않은 조건이에요. 처음 10분은 편하게 시작하고, 몸이 풀리면 조금만 올려보세요."
    ],
    bad: [
      "컨디션이 아쉬운 날이에요. 무리해서 나가기보다 실내 스트레칭이나 가벼운 근력이 좋아요.",
      "굳이 나간다면 15분 이내로 아주 가볍게만 다녀오세요. 쉬어가는 날도 훈련이에요."
    ]
  },
  walk: {
    rain: [
      "비가 와서 길이 미끄러워요. 꼭 나가야 하면 우산 들고 가까운 곳만 다녀오세요.",
      "노면이 젖은 날이에요. 밑창 접지 좋은 신발을 신고 천천히 걸으세요."
    ],
    rainMaybe: [
      "비 올 확률이 높아요. 멀리 가지 말고 집 근처로 짧게 다녀오세요.",
      "비 소식이 있어요. 접이식 우산 하나 들고 나가면 마음이 편해요."
    ],
    dust: [
      "미세먼지가 있는 날이에요. 오래 걷기보다 짧게, 큰길보다 공원 안쪽으로 걸으세요.",
      "공기가 아쉬운 날이에요. 마스크를 챙기고 평소보다 짧게 다녀오세요."
    ],
    hot: [
      "더운 시간이에요. 그늘 많은 길로 천천히 걷고, 물을 꼭 챙기세요.",
      "열이 쌓이기 쉬운 날씨예요. 한낮보다 아침저녁 산책이 훨씬 쾌적해요."
    ],
    uv: [
      "햇살이 강한 시간이에요. 모자와 선크림을 챙기고 그늘 쪽으로 걸으세요.",
      "자외선이 강해요. 선글라스와 양산이 있으면 눈과 피부가 편해요."
    ],
    wind: [
      "바람이 부는 날이에요. 얇은 겉옷 하나 걸치면 체감이 훨씬 낫습니다.",
      "바람이 강해 체감온도가 낮아요. 바람 덜 부는 골목길 코스가 좋아요."
    ],
    humid: [
      "습도가 높아 걷기만 해도 끈적여요. 천천히 걷고 물을 자주 마시세요.",
      "눅눅한 날씨예요. 통풍 잘 되는 옷을 입고 무리하지 않게 걸으세요."
    ],
    cold: [
      "쌀쌀한 날이에요. 따뜻하게 입고, 해 있는 시간에 걷는 게 좋아요.",
      "추울 땐 목과 손이 먼저 시려요. 목도리와 장갑을 챙기고 짧게 다녀오세요."
    ],
    good: [
      "걷기 좋은 날이에요. 평소보다 한 블록 더 걸어도 기분 좋게 다녀올 수 있어요.",
      "산책하기 딱 좋은 조건이에요. 새로운 길로 걸으며 기분 전환해보세요.",
      "몸도 마음도 가벼워질 날씨예요. 느긋하게 30분 걷고 오면 딱 좋아요."
    ],
    ok: [
      "무난한 산책 컨디션이에요. 20~30분 가볍게 동네 한 바퀴 어때요.",
      "나쁘지 않은 날이에요. 부담 없이 나가서 바람 쐬고 오세요."
    ],
    bad: [
      "날씨가 아쉬운 날이에요. 무리해서 나가기보다 실내 스트레칭이 나아요.",
      "꼭 나가야 하면 15분 이내로 짧게만 다녀오세요. 쉬는 날도 필요해요."
    ]
  },
  dog: {
    rain: [
      "비 오는 날 산책은 배변 위주로 짧게만요. 다녀와서 발과 배를 잘 닦아주세요.",
      "젖은 길은 강아지 발에도 부담이에요. 우비를 입히고 가까운 곳만 다녀오세요."
    ],
    rainMaybe: [
      "비 소식이 있어요. 하늘 보고 짧은 코스로, 비 오면 바로 들어오세요.",
      "비 올 확률이 높은 날이에요. 배변 산책만 얼른 다녀오는 게 좋아요."
    ],
    dust: [
      "미세먼지는 강아지 호흡기에도 안 좋아요. 오늘 산책은 짧게, 실내 놀이로 채워주세요.",
      "공기가 탁한 날이에요. 냄새 맡기는 줄이고 빠르게 한 바퀴만 도세요."
    ],
    hot: [
      "강아지는 사람보다 더위에 훨씬 약해요. 그늘길로 짧게 돌고 물을 꼭 챙기세요.",
      "더운 시간 아스팔트는 발바닥에 위험해요. 손등을 5초 대보고 뜨거우면 미루세요."
    ],
    uv: [
      "볕이 강한 시간이에요. 지면 열기가 올라오니 흙길·그늘길 위주로 걸으세요.",
      "자외선이 강한 낮이에요. 산책은 아침저녁으로 옮기는 게 강아지에게 편해요."
    ],
    wind: [
      "바람 소리에 예민한 아이들은 놀랄 수 있어요. 리드줄을 짧게 잡고 걸으세요.",
      "바람이 강한 날이에요. 날리는 물건에 놀라지 않게 조용한 길로 다녀오세요."
    ],
    humid: [
      "습한 날은 헥헥거림이 빨라져요. 천천히 걷고 힘들어하면 바로 쉬어가세요.",
      "끈적한 날씨예요. 물을 챙기고, 산책 후엔 발가락 사이까지 말려주세요."
    ],
    cold: [
      "추운 날은 소형견·단모종에게 옷이 필요해요. 짧고 굵게 다녀오세요.",
      "찬 바닥에 발이 시릴 수 있어요. 해 있는 시간에 빠르게 한 바퀴만요."
    ],
    good: [
      "산책하기 최고의 날이에요. 평소보다 길게 돌면서 냄새도 실컷 맡게 해주세요.",
      "강아지가 신날 날씨예요. 새 코스로 노즈워크 산책 어때요.",
      "완벽한 산책 타이밍이에요. 여유 있게 걷고 물 한 번 쉬어가면 딱 좋아요."
    ],
    ok: [
      "무난한 산책 날이에요. 평소 코스로 20~30분이면 충분해요.",
      "나쁘지 않은 컨디션이에요. 강아지 상태를 보며 여유롭게 다녀오세요."
    ],
    bad: [
      "오늘은 산책보다 실내 놀이가 나아요. 노즈워크나 터그로 에너지를 풀어주세요.",
      "날이 궂어요. 배변만 짧게 해결하고 실내에서 놀아주는 게 좋아요."
    ]
  },
  commute: {
    rain: [
      "비가 와요. 우산은 기본, 방수 신발이면 발이 뽀송하게 다녀올 수 있어요.",
      "출퇴근길 비 소식이에요. 평소보다 10분 여유 있게 출발하세요."
    ],
    rainMaybe: [
      "오늘 중 비 올 확률이 높아요. 가방에 접이식 우산 하나 꼭 넣어가세요.",
      "지금은 괜찮아도 이따 비가 올 수 있어요. 퇴근길까지 생각해 우산 챙기세요."
    ],
    dust: [
      "미세먼지가 있는 날이에요. 야외 대기 시간은 줄이고 마스크가 있으면 좋아요.",
      "공기가 탁해요. 지하상가나 실내 통로를 활용해 이동하세요."
    ],
    hot: [
      "더운 날 이동은 그늘 쪽 인도가 답이에요. 시원한 옷차림으로 나서세요.",
      "한낮 이동은 땀나기 딱 좋아요. 물 한 병 챙기고 여유 있게 걸으세요."
    ],
    uv: [
      "볕이 강한 시간이에요. 선크림 바르고 그늘 쪽으로 걸으면 한결 나아요.",
      "자외선이 강해요. 양산이나 모자가 있으면 이동이 훨씬 편해요."
    ],
    wind: [
      "바람이 강해 우산이 뒤집힐 수 있어요. 모자나 후드가 더 실용적이에요.",
      "건물 사이 돌풍을 조심하세요. 자전거·킥보드는 오늘 특히 주의가 필요해요."
    ],
    humid: [
      "습한 날은 걷기만 해도 땀이 나요. 겉옷은 벗기 쉬운 걸로 입으세요.",
      "끈적한 날씨예요. 이동은 천천히, 실내에선 시원하게 정리하세요."
    ],
    cold: [
      "출근길이 쌀쌀해요. 장갑과 목도리, 주머니 속 핫팩이 효자예요.",
      "아침저녁 기온차가 커요. 벗기 쉬운 겉옷으로 조절하세요."
    ],
    good: [
      "이동하기 좋은 날이에요. 한 정거장 먼저 내려 걸으면 하루 운동량이 채워져요.",
      "쾌적한 출퇴근길이에요. 오늘은 걸어서 이동해도 기분 좋게 도착해요.",
      "날씨 부담이 없는 날이에요. 산책 겸 조금 돌아가는 길도 괜찮아요."
    ],
    ok: [
      "무난한 이동 컨디션이에요. 평소대로 다니면 충분해요.",
      "나쁘지 않은 날씨예요. 특별한 준비 없이 나서도 괜찮아요."
    ],
    bad: [
      "이동이 번거로운 날씨예요. 오늘은 대중교통이 몸도 마음도 편해요.",
      "날이 궂어요. 도보 구간은 최소로 줄이고 실내 경로를 활용하세요."
    ]
  }
};

export function composeOneLiner(slot: RunningSlot, isTomorrow: boolean, activity: ActivityKey = "run") {
  const seed = slot.hour * 13 + Math.round(slot.totalScore) + (isTomorrow ? 500 : 0);
  const prefix = isTomorrow ? "내일은 " : "";
  const t = ONE_LINERS[activity];

  if (slot.precipitation >= 0.5) return prefix + pick(t.rain, seed);
  if (slot.precipitationProbability >= 60) return prefix + pick(t.rainMaybe, seed);
  if (slot.pm25 > 35) return prefix + pick(t.dust, seed);
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
    { key: "dust", score: slot.dustScore, good: "공기 맑음", warn: "미세먼지" },
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

// 4줄 코치 브리핑 — 활동별 verdict/caution/tip 테이블
const BRIEFING_VERDICT: Record<ActivityKey, Array<[number, string[]]>> = {
  run: [
    [88, ["완벽한 러닝 날씨예요", "오늘 안 뛰면 아까워요", "달리기 최고의 날이에요", "지금 이 컨디션 흔치 않아요"]],
    [72, ["달리기 좋은 날이에요", "가볍게 뛰기 딱 좋아요", "기분 좋게 달릴 수 있어요", "부담 없이 나가기 좋아요"]],
    [55, ["무난한 편이에요", "짧은 조깅은 충분해요", "컨디션 보며 달려봐요", "가볍게라면 괜찮아요"]],
    [38, ["가볍게만 추천해요", "오늘은 몸만 풀어요", "무리는 살짝 아쉬워요", "짧게 다녀오는 게 좋아요"]],
    [0, ["오늘은 실내가 나아요", "쉬어가도 괜찮아요", "무리할 날은 아니에요", "회복도 훈련이에요"]]
  ],
  walk: [
    [88, ["완벽한 산책 날씨예요", "오늘 안 걸으면 아까워요", "걷기 최고의 날이에요", "이런 날이 흔치 않아요"]],
    [72, ["걷기 좋은 날이에요", "가볍게 걷기 딱 좋아요", "기분 좋게 걸을 수 있어요", "부담 없이 나가기 좋아요"]],
    [55, ["무난한 편이에요", "짧은 산책은 충분해요", "컨디션 보며 걸어봐요", "가볍게라면 괜찮아요"]],
    [38, ["짧게만 추천해요", "바람만 쐬고 와요", "긴 산책은 아쉬워요", "가까운 곳만 다녀와요"]],
    [0, ["오늘은 실내가 나아요", "쉬어가도 괜찮아요", "무리할 날은 아니에요", "내일이 더 나아요"]]
  ],
  dog: [
    [88, ["완벽한 산책 날씨예요", "강아지가 기다렸을 날이에요", "산책 최고의 날이에요", "오늘은 길게 돌아도 좋아요"]],
    [72, ["산책하기 좋은 날이에요", "여유롭게 걷기 좋아요", "기분 좋은 산책이 될 거예요", "부담 없이 나가기 좋아요"]],
    [55, ["무난한 편이에요", "평소 코스면 충분해요", "상태 보며 걸어봐요", "짧게라면 괜찮아요"]],
    [38, ["배변 산책만 짧게요", "오늘은 살짝 아쉬워요", "그늘길로 잠깐만요", "무리하지 않는 게 좋아요"]],
    [0, ["오늘 산책은 쉬어가요", "실내 놀이가 나아요", "강아지 건강이 우선이에요", "내일을 노려봐요"]]
  ],
  commute: [
    [88, ["쾌적한 출퇴근길이에요", "걸어 다니기 완벽해요", "이동 최고의 날이에요", "오늘은 걸어서 가도 좋아요"]],
    [72, ["이동하기 좋은 날이에요", "걸어 다니기 무난해요", "쾌적하게 다닐 수 있어요", "부담 없는 날씨예요"]],
    [55, ["무난한 편이에요", "평소대로 다니면 돼요", "특별한 준비는 없어도 돼요", "괜찮은 이동 컨디션이에요"]],
    [38, ["대비하고 나가요", "날씨가 살짝 아쉬워요", "이동은 간단히 하세요", "필요한 것만 챙겨요"]],
    [0, ["대중교통이 나은 날이에요", "도보 이동은 줄이세요", "날이 궂은 날이에요", "실내 경로를 활용하세요"]]
  ]
};

export function composeBriefing(reference: RunningSlot, best: RunningSlot, isTomorrow: boolean, activity: ActivityKey = "run"): Briefing {
  const seed = (isTomorrow ? 1000 : 0) + best.hour * 7 + Math.round(best.totalScore);
  const isRun = activity === "run";
  const isDog = activity === "dog";

  const verdict = (() => {
    for (const [threshold, variants] of BRIEFING_VERDICT[activity]) {
      if (best.totalScore >= threshold) return pick(variants, seed);
    }
    return pick(BRIEFING_VERDICT[activity][BRIEFING_VERDICT[activity].length - 1][1], seed);
  })();

  const timing = pick(
    [
      `${hourLabel(best)} 전후가 가장 좋아요`,
      `${hourLabel(best)}쯤 나가면 딱이에요`,
      `오늘은 ${hourLabel(best)}가 골든타임`,
      `${hourLabel(best)} 무렵을 노려보세요`
    ],
    seed
  );

  const weakest = [...factorsOf(reference)].sort((a, b) => a.score - b.score)[0];
  const caution = (() => {
    if (weakest.score >= 62) return "특별한 주의사항 없어요";
    switch (weakest.key) {
      case "precip":
        return isRun ? "비 예보, 짧은 코스로" : "비 예보, 우산 챙기기";
      case "dust":
        return isDog ? "미세먼지, 산책 짧게" : isRun ? "미세먼지, 강도 낮게" : "미세먼지, 마스크 챙기기";
      case "temp":
        if (reference.apparentTemperature >= 22) {
          return isDog ? "더위 주의, 발바닥 확인" : "더위 주의, 수분 챙기기";
        }
        return isRun ? "쌀쌀함, 워밍업 충분히" : "쌀쌀함, 따뜻하게 입기";
      case "uv":
        return "자외선 강함, 모자 챙기기";
      case "wind":
        return isRun ? "바람 강함, 맞바람 먼저" : "바람 강함, 겉옷 챙기기";
      case "humidity":
        return isRun ? "습해요, 페이스 낮게" : "습해요, 천천히 걷기";
      default:
        return "컨디션 보며 조절하기";
    }
  })();

  const tip = (() => {
    if (reference.precipitation >= 0.5) return isDog ? "다녀와서 발 잘 닦기" : "젖은 노면 미끄럼 주의";
    if (reference.apparentTemperature >= 25) return isDog ? "물그릇 꼭 챙기기" : "출발 전 수분 보충";
    if (reference.apparentTemperature <= 5) return isDog ? "소형견은 옷 입히기" : "장갑·보온 챙기기";
    if (reference.uvIndex >= 6) return isDog ? "흙길·그늘길 위주로" : "그늘 코스 추천";
    if (reference.windSpeed >= 8) return isRun ? "바람막이 한 겹" : "겉옷 한 겹 챙기기";
    const generic: Record<ActivityKey, string[]> = {
      run: ["초반 10분은 천천히", "끝나고 5분 스트레칭", "편한 페이스 유지", "물 한 모금 챙기기", "호흡에 집중해봐요", "무릎 아프면 거리 줄이기"],
      walk: ["편한 신발이 반이에요", "끝나고 가볍게 스트레칭", "물 한 모금 챙기기", "바른 자세로 걸어봐요", "햇볕 쬐면 기분 좋아요", "한 정거장 더 걸어봐요"],
      dog: ["리드줄 점검하고 출발", "배변봉투 챙기기", "물그릇 하나 챙기기", "냄새 맡을 시간 주기", "다녀와서 발 닦아주기", "간식으로 칭찬해주기"],
      commute: ["편한 신발이 반이에요", "이어폰 볼륨은 적당히", "물 한 병 챙기기", "한 정거장 걸어보기", "계단으로 가면 운동 끝", "여유 있게 출발하기"]
    };
    return pick(generic[activity], seed);
  })();

  return { verdict, timing, caution, tip };
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
  commute: { doing: "이동", doingGood: "도보 이동", hard: "오래 걷기" }
};

export function getMetricDetail(key: MetricKey, slot: RunningSlot, activity: ActivityKey = "run"): MetricDetail {
  const isRun = activity === "run";
  const isDog = activity === "dog";
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
            ? `${words.doing}하기 딱 좋은 체감온도예요. 몸이 가볍게 느껴질 거예요.`
            : grade.tone === "normal"
            ? `무난한 온도예요. 평소 ${words.doing} 복장이면 충분해요.`
            : grade.tone === "caution"
            ? hot
              ? isRun
                ? "살짝 더워요. 페이스를 낮추고 수분을 자주 챙기세요."
                : isDog
                ? "살짝 더워요. 그늘길로 천천히 걷고 물을 챙기세요."
                : "살짝 더워요. 천천히 걷고 수분을 자주 챙기세요."
              : "조금 쌀쌀해요. 따뜻하게 겹쳐 입고 나가세요."
            : hot
            ? `폭염 수준이에요. 한낮 ${words.doing}은 피하는 게 안전해요.`
            : "한파예요. 무리하지 말고 짧게, 보온을 철저히 하세요.",
        tip: hot
          ? isRun
            ? "달리기는 걷기보다 체감이 5~8°C 더 높게 느껴져요. 얇게 입으세요."
            : isDog
            ? "아스팔트는 기온보다 훨씬 뜨거워요. 손등을 5초 대보고 확인하세요."
            : "한낮보다 아침저녁이 체감 5°C 이상 시원해요. 시간을 옮겨보세요."
          : isRun
          ? "출발 전 실내에서 가볍게 몸을 데우면 부상 위험이 줄어요."
          : "나가기 전 가볍게 몸을 풀면 추위가 덜 느껴져요."
      };
    }
    case "precip": {
      const prob = slot.precipitationProbability;
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
              ? "비가 내려요. 빗길 러닝은 미끄러짐·저체온 위험이 커요."
              : isDog
              ? "비가 내려요. 산책은 배변 위주로 짧게 하는 게 좋아요."
              : "비가 내려요. 우산 없이 나가면 젖어요."
            : grade.tone === "good"
            ? `비 걱정 없이 마음껏 ${words.doingGood} 할 수 있어요.`
            : grade.tone === "normal"
            ? "약한 비 가능성이 있어요. 하늘을 한 번 확인하세요."
            : isRun
            ? "비가 올 수 있어요. 짧은 코스나 실내를 고려하세요."
            : "비가 올 수 있어요. 우산을 챙기는 게 안전해요.",
        tip:
          amount >= 0.5 || prob >= 60
            ? isRun
              ? "방수 자켓과 챙 모자가 있으면 가벼운 비는 견딜 만해요."
              : isDog
              ? "우비를 입히고, 다녀와서 발과 배를 잘 닦아주세요."
              : "접이식 우산 하나면 갑작스러운 비에도 든든해요."
            : "강수확률 30% 미만이면 대체로 안심하고 나가도 좋아요."
      };
    }
    case "dust": {
      const value = slot.pm25;
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
            ? `공기가 깨끗해요. ${words.hard}도 문제없어요.`
            : grade.tone === "normal"
            ? "보통 수준이에요. 대부분에게 무난하지만 민감하면 시간만 줄이세요."
            : grade.tone === "caution"
            ? isDog
              ? "미세먼지가 나빠요. 강아지 호흡기에도 안 좋으니 짧게만 도세요."
              : `미세먼지가 나빠요. ${words.hard}는 피하세요.`
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
            ? `자외선이 약해요. 햇볕 걱정 없이 ${words.doingGood} 해도 좋아요.`
            : grade.tone === "normal"
            ? `보통 수준이에요. 오래 ${words.doing}할 거면 선크림을 챙기세요.`
            : grade.tone === "caution"
            ? isDog
              ? "자외선이 강해요. 지면 열기도 오르니 그늘길·흙길로 걸으세요."
              : "자외선이 강해요. 모자·선크림에 그늘 코스를 추천해요."
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
              ? "바람이 잔잔해요. 페이스 유지가 편할 거예요."
              : "바람이 잔잔해요. 쾌적하게 다닐 수 있어요."
            : grade.tone === "normal"
            ? "적당한 바람이에요. 더운 날엔 오히려 시원해요."
            : grade.tone === "caution"
            ? isRun
              ? "바람이 강해요. 맞바람 구간에서 체력 소모가 커요."
              : isDog
              ? "바람이 강해요. 소리에 예민한 아이는 놀랄 수 있어요."
              : "바람이 강해요. 체감온도가 뚝 떨어지고 우산이 뒤집혀요."
            : isRun
            ? "매우 강한 바람이에요. 기록보다 안전한 러닝에 집중하세요."
            : "매우 강한 바람이에요. 야외 활동은 줄이는 게 안전해요.",
        tip: isRun
          ? "나갈 때 맞바람, 돌아올 때 뒷바람 코스면 후반이 훨씬 수월해요."
          : isDog
          ? "바람 강한 날은 리드줄을 평소보다 짧게 잡는 게 안전해요."
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
            ? "땀이 잘 마르는 쾌적한 습도예요."
            : grade.tone === "normal"
            ? "무난한 습도예요. 크게 신경 쓰지 않아도 돼요."
            : value >= 70
            ? isRun
              ? "습해서 땀이 안 말라요. 체온이 잘 안 떨어지니 페이스를 낮추세요."
              : isDog
              ? "습해요. 강아지 헥헥거림이 빨라지니 천천히, 물을 챙기세요."
              : "습해서 걷기만 해도 끈적여요. 천천히 이동하세요."
            : "건조해요. 목이 마르기 쉬우니 수분을 조금씩 자주 마시세요.",
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
