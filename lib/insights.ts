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

export function getDayParts(slots: RunningSlot[], isToday: boolean, nowHour: number): DayPart[] {
  return DAY_PARTS.map((part) => {
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
    return { ...part, best, rainy: best ? isRainy(best) : false, past };
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

export function heroHeadline(slot: RunningSlot) {
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

  if (slot.totalScore >= 88) return pick(["지금 뛰기 최고예요", "완벽한 날이에요", "달리기 딱 좋아요"], seed);
  if (slot.totalScore >= 80) return pick(["지금 뛰기 좋아요", "컨디션 좋아요", "기분 좋은 날이에요"], seed);
  if (slot.totalScore >= 72) return pick(["뛰기 무난해요", "달리기 괜찮아요", "나쁘지 않아요"], seed);
  if (slot.totalScore >= 55) return pick(["보통이에요", "무난한 편이에요", "달릴 만해요"], seed);
  if (slot.totalScore >= 38) return pick(["살짝 아쉬워요", "컨디션 별로예요", "무리는 금물이에요"], seed);
  return pick(["오늘은 쉬어가요", "실내가 나아요", "달리기 어려워요"], seed);
}

// 작은 제목 = "행동/팁". 큰 제목과 seed·인덱스를 맞춰 항상 짝이 맞고 주제가 겹치지 않게 설계.
export function heroSubline(slot: RunningSlot) {
  const seed = slot.hour * 17 + Math.round(slot.totalScore);

  if (slot.precipitation >= 1) return pick(["오늘은 실내가 나아요", "짧은 코스만 가볍게요", "미끄러우니 조심해요"], seed);
  if (slot.precipitationProbability >= 70) return pick(["집 근처 코스가 좋아요", "나가기 전 하늘 확인해요", "우산 챙기면 편해요"], seed);
  if (slot.pm25 > 75) return pick(["실내 운동을 권해요", "오래 뛰는 건 피해요", "숨차면 바로 멈춰요"], seed);
  if (slot.pm25 > 35) return pick(["강도는 가볍게 가요", "공원 안쪽이 좋아요", "짧게 뛰고 마쳐요"], seed);
  if (slot.apparentTemperature >= 30) return pick(["물 꼭 챙겨 가요", "그늘 코스로 돌아요", "페이스 확 낮춰요"], seed);
  if (slot.apparentTemperature >= 26) return pick(["초반부터 천천히요", "수분 자주 챙겨요", "무리한 속도 피해요"], seed);
  if (slot.apparentTemperature <= -5) return pick(["보온 단단히 해요", "실내가 안전해요", "워밍업 길게 가요"], seed);
  if (slot.apparentTemperature <= 3) return pick(["첫 1km 천천히요", "장갑 챙기면 좋아요", "몸 데우고 나가요"], seed);
  if (slot.windSpeed >= 12) return pick(["맞바람 구간 조심해요", "바람막이 챙겨요", "기록 욕심 접어둬요"], seed);
  if (slot.uvIndex >= 7) return pick(["모자·선크림 챙겨요", "그늘 많은 길로요", "선글라스면 편해요"], seed);
  if (slot.humidity >= 80) return pick(["땀이 잘 안 말라요", "호흡 편한 속도로요", "조깅이 나아요"], seed);

  if (slot.totalScore >= 88) return pick(["초반 10분만 천천히요", "기록 도전 해볼 만해요", "끝나고 스트레칭 잊지 마요"], seed);
  if (slot.totalScore >= 80) return pick(["편한 페이스로 즐겨요", "리듬 잡기 좋아요", "가볍게 몸 풀고 가요"], seed);
  if (slot.totalScore >= 72) return pick(["부담 없이 다녀와요", "짧게라도 좋아요", "자세에 집중해봐요"], seed);
  if (slot.totalScore >= 55) return pick(["짧은 코스 추천해요", "20분 조깅이면 충분해요", "컨디션 보며 가요"], seed);
  if (slot.totalScore >= 38) return pick(["몸만 풀고 마쳐요", "걷기 섞어 가볍게요", "짧게만 다녀와요"], seed);
  return pick(["휴식도 훈련이에요", "실내 스트레칭 좋아요", "내일을 노려봐요"], seed);
}

// 오늘의 한마디 — 현재(또는 내일 최적) 조건 기준 두 줄 조언
export function composeOneLiner(slot: RunningSlot, isTomorrow: boolean) {
  const seed = slot.hour * 13 + Math.round(slot.totalScore) + (isTomorrow ? 500 : 0);
  const prefix = isTomorrow ? "내일은 " : "";

  if (slot.precipitation >= 0.5) {
    return (
      prefix +
      pick(
        [
          "빗길은 짧은 코스로 가볍게만 다녀오세요. 신발 접지와 밝은 옷을 챙기면 좋아요.",
          "노면이 젖어 발목 부담이 있어요. 나간다면 천천히 걷듯 시작하고 무리하지 마세요."
        ],
        seed
      )
    );
  }

  if (slot.precipitationProbability >= 60) {
    return (
      prefix +
      pick(
        [
          "비 올 확률이 높아 멀리 가기엔 애매해요. 집 근처 짧은 코스로 잡아보세요.",
          "비 소식이 있어요. 방수 자켓을 가볍게 걸치고, 처음부터 편한 페이스로 가세요."
        ],
        seed
      )
    );
  }

  if (slot.pm25 > 35) {
    return (
      prefix +
      pick(
        [
          "미세먼지가 있어 강한 러닝은 아쉬워요. 호흡 편한 조깅으로 낮추고 답답하면 걸으세요.",
          "공기가 조금 아쉬운 날이에요. 큰길보다 공원 안쪽으로, 평소보다 짧게 다녀오세요."
        ],
        seed
      )
    );
  }

  if (slot.apparentTemperature >= 27) {
    return (
      prefix +
      pick(
        [
          "더위가 있어 심박이 빨리 오를 수 있어요. 페이스를 낮추고 물 한 컵 챙기세요.",
          "몸에 열이 빨리 쌓이는 날씨예요. 그늘 많은 코스로 돌고, 숨이 거칠면 쉬어가세요."
        ],
        seed
      )
    );
  }

  if (slot.uvIndex >= 6) {
    return (
      prefix +
      pick(
        [
          "햇살이 강한 시간이에요. 모자와 선크림을 챙기고, 그늘 많은 길로 돌아보세요.",
          "자외선이 강해 피부와 눈이 쉽게 지쳐요. 선글라스와 모자를 챙기고 한낮은 피하세요."
        ],
        seed
      )
    );
  }

  if (slot.windSpeed >= 8) {
    return (
      prefix +
      pick(
        [
          "바람이 있으니 나갈 때 맞바람으로 시작해보세요. 돌아올 땐 등바람이라 더 편해요.",
          "바람이 강해 체감온도가 쉽게 떨어져요. 얇은 바람막이 하나면 후반이 훨씬 편합니다."
        ],
        seed
      )
    );
  }

  if (slot.humidity >= 75) {
    return (
      prefix +
      pick(
        [
          "습도가 높아 같은 속도여도 심박이 빨리 올라요. 평소보다 10% 느리게 조깅하세요.",
          "끈적한 날씨라 땀이 잘 마르지 않아요. 통풍 잘 되는 옷에 편한 조깅이 좋아요."
        ],
        seed
      )
    );
  }

  if (slot.apparentTemperature <= 3) {
    return (
      prefix +
      pick(
        [
          "쌀쌀하니 실내에서 몸을 살짝 데우고 나가세요. 첫 1km는 워밍업처럼 천천히요.",
          "추운 날은 장갑과 워밍업이 러닝의 절반이에요. 초반엔 여유 있게 시작하세요."
        ],
        seed
      )
    );
  }

  if (slot.totalScore >= 72) {
    return (
      prefix +
      pick(
        [
          "컨디션이 좋아요. 초반 10분만 천천히 올리고, 후반엔 리듬을 믿고 가볍게 밀어보세요.",
          "달리기 좋은 조건이에요. 기록 욕심보다 호흡 리듬에 집중하면 끝까지 기분 좋게 이어져요.",
          "몸이 가볍게 느껴질 날씨예요. 꾸준히 달리고, 끝나고 5분 스트레칭까지 챙겨보세요."
        ],
        seed
      )
    );
  }

  if (slot.totalScore >= 55) {
    return (
      prefix +
      pick(
        [
          "무난한 컨디션이에요. 거리 욕심보다 자세와 호흡에 집중하며 20~30분 가볍게 뛰어보세요.",
          "나쁘지 않은 조건이에요. 처음 10분은 편하게 시작하고, 몸이 풀리면 조금만 올려보세요."
        ],
        seed
      )
    );
  }

  return (
    prefix +
    pick(
      [
        "컨디션이 아쉬운 날이에요. 무리해서 나가기보다 실내 스트레칭이나 가벼운 근력이 좋아요.",
        "굳이 나간다면 15분 이내로 아주 가볍게만 다녀오세요. 쉬어가는 날도 훈련이에요."
      ],
      seed
    )
  );
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

// 4줄 코치 브리핑 — 크고 짧고 핵심만
export function composeBriefing(reference: RunningSlot, best: RunningSlot, isTomorrow: boolean): Briefing {
  const seed = (isTomorrow ? 1000 : 0) + best.hour * 7 + Math.round(best.totalScore);

  // 한 줄에 깔끔히 떨어지게 — 짧고 핵심만 (다양하게)
  const verdict = (() => {
    if (best.totalScore >= 88)
      return pick(["완벽한 러닝 날씨예요", "오늘 안 뛰면 아까워요", "달리기 최고의 날이에요", "지금 이 컨디션 흔치 않아요"], seed);
    if (best.totalScore >= 72)
      return pick(["달리기 좋은 날이에요", "가볍게 뛰기 딱 좋아요", "기분 좋게 달릴 수 있어요", "부담 없이 나가기 좋아요"], seed);
    if (best.totalScore >= 55)
      return pick(["무난한 편이에요", "짧은 조깅은 충분해요", "컨디션 보며 달려봐요", "가볍게라면 괜찮아요"], seed);
    if (best.totalScore >= 38)
      return pick(["가볍게만 추천해요", "오늘은 몸만 풀어요", "무리는 살짝 아쉬워요", "짧게 다녀오는 게 좋아요"], seed);
    return pick(["오늘은 실내가 나아요", "쉬어가도 괜찮아요", "무리할 날은 아니에요", "회복도 훈련이에요"], seed);
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
        return "비 예보, 짧은 코스로";
      case "dust":
        return "미세먼지, 강도 낮게";
      case "temp":
        return reference.apparentTemperature >= 22 ? "더위 주의, 수분 챙기기" : "쌀쌀함, 워밍업 충분히";
      case "uv":
        return "자외선 강함, 모자 챙기기";
      case "wind":
        return "바람 강함, 맞바람 먼저";
      case "humidity":
        return "습해요, 페이스 낮게";
      default:
        return "컨디션 보며 조절하기";
    }
  })();

  const tip = (() => {
    if (reference.precipitation >= 0.5) return "젖은 노면 미끄럼 주의";
    if (reference.apparentTemperature >= 25) return "출발 전 수분 보충";
    if (reference.apparentTemperature <= 5) return "장갑·보온 챙기기";
    if (reference.uvIndex >= 6) return "그늘 코스 추천";
    if (reference.windSpeed >= 8) return "바람막이 한 겹";
    return pick(
      ["초반 10분은 천천히", "끝나고 5분 스트레칭", "편한 페이스 유지", "물 한 모금 챙기기", "호흡에 집중해봐요", "무릎 아프면 거리 줄이기"],
      seed
    );
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

export function getMetricDetail(key: MetricKey, slot: RunningSlot): MetricDetail {
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
            ? "러닝하기 딱 좋은 체감온도예요. 몸이 가볍게 느껴질 거예요."
            : grade.tone === "normal"
            ? "무난한 온도예요. 평소 러닝 복장이면 충분해요."
            : grade.tone === "caution"
            ? hot
              ? "살짝 더워요. 페이스를 낮추고 수분을 자주 챙기세요."
              : "조금 쌀쌀해요. 워밍업을 충분히 하고 얇게 겹쳐 입으세요."
            : hot
            ? "폭염 수준이에요. 한낮 러닝은 피하는 게 안전해요."
            : "한파예요. 무리하지 말고 짧게, 보온을 철저히 하세요.",
        tip: hot
          ? "달리기는 걷기보다 체감이 5~8°C 더 높게 느껴져요. 얇게 입으세요."
          : "출발 전 실내에서 가볍게 몸을 데우면 부상 위험이 줄어요."
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
            ? "비가 내려요. 빗길 러닝은 미끄러짐·저체온 위험이 커요."
            : grade.tone === "good"
            ? "비 걱정 없이 마음껏 달릴 수 있어요."
            : grade.tone === "normal"
            ? "약한 비 가능성이 있어요. 하늘을 한 번 확인하세요."
            : "비가 올 수 있어요. 짧은 코스나 실내를 고려하세요.",
        tip:
          amount >= 0.5 || prob >= 60
            ? "방수 자켓과 챙 모자가 있으면 가벼운 비는 견딜 만해요."
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
            ? "공기가 깨끗해요. 강도 높은 러닝도 문제없어요."
            : grade.tone === "normal"
            ? "보통 수준이에요. 대부분에게 무난하지만 민감하면 강도만 조절하세요."
            : grade.tone === "caution"
            ? "미세먼지가 나빠요. 강도를 낮추고 오래 뛰는 건 피하세요."
            : "매우 나빠요. 야외 러닝 대신 실내 운동을 강력히 권해요.",
        tip:
          grade.tone === "good" || grade.tone === "normal"
            ? "러닝은 호흡량이 늘어 공기질 영향을 크게 받아요. 좋은 날 잘 챙겨 뛰세요."
            : "KF 마스크는 격한 러닝엔 호흡을 막아요. 차라리 실내가 나아요."
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
            ? "자외선이 약해요. 햇볕 걱정 없이 달려도 좋아요."
            : grade.tone === "normal"
            ? "보통 수준이에요. 장시간 러닝이면 선크림을 챙기세요."
            : grade.tone === "caution"
            ? "자외선이 강해요. 모자·선크림에 그늘 코스를 추천해요."
            : "매우 강해요. 한낮은 피하고 이른 아침이나 저녁을 노리세요.",
        tip: "자외선은 보통 낮 12~15시에 가장 강해요. 시간대만 옮겨도 크게 줄어요."
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
            ? "바람이 잔잔해요. 페이스 유지가 편할 거예요."
            : grade.tone === "normal"
            ? "적당한 바람이에요. 더운 날엔 오히려 시원해요."
            : grade.tone === "caution"
            ? "바람이 강해요. 맞바람 구간에서 체력 소모가 커요."
            : "매우 강한 바람이에요. 기록보다 안전한 러닝에 집중하세요.",
        tip: "나갈 때 맞바람, 돌아올 때 뒷바람 코스면 후반이 훨씬 수월해요."
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
            ? "습해서 땀이 안 말라요. 체온이 잘 안 떨어지니 페이스를 낮추세요."
            : "건조해요. 목이 마르기 쉬우니 수분을 조금씩 자주 마시세요.",
        tip:
          value >= 70
            ? "습한 날은 심박이 빨리 올라가요. 인터벌보다 편한 조깅이 좋아요."
            : "통풍 잘 되는 기능성 옷이 땀 배출에 도움이 돼요."
      };
    }
  }
}
