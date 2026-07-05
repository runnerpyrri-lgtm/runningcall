// 활동(러닝·걷기·애견산책·자전거)별 점수 프로필과 표시 설정
export type ActivityKey = "run" | "walk" | "dog" | "bike";

export type ActivityWeights = {
  dust: number;
  temperature: number;
  precipitation: number;
  uv: number;
  humidity: number;
  wind: number;
};

// 최적 체감온도 구간과 벗어날 때 점수 감소 기울기
export type TempCurve = { optimalLo: number; optimalHi: number; coldSlope: number; hotSlope: number };

// 더위 하드캡 2단계 (발동 체감온도 → 상한 점수)
export type HeatCaps = { hot1: number; hot1Cap: number; hot2: number; hot2Cap: number };

// 공용 컴포넌트가 참조하는 활동별 UI 문구 (하드코딩 방지)
export type ActivityTerms = {
  verbDo: string; // 문장용 동사 어간
  outfitTitle: string; // "러닝 복장" 등
  alarmTitle: string; // "러닝 알림" 등
  rainyTag: string; // "우중런" 등 비 오는 시간대 태그
  blockedTag: string; // "러닝 어려움" 등 불가 태그
  nowTag: string; // "지금 뛰기 딱!" 등
  notifReady: string; // 알림 본문 "러닝하기 좋은 시간이에요" 등
};

export type ActivityProfile = {
  key: ActivityKey;
  label: string;
  emoji: string;
  tagline: string;
  ready: boolean;
  resultMode: "score" | "advisory";
  weights: ActivityWeights;
  temp: TempCurve;
  heat: HeatCaps;
  windCap: { speed: number; cap: number };
  terms: ActivityTerms;
};

// run = 기존 러닝콜 상수 그대로 (러닝 불변 원칙 — 값 변경 금지)
export const ACTIVITIES: Record<ActivityKey, ActivityProfile> = {
  run: {
    key: "run",
    label: "러닝",
    emoji: "🏃",
    tagline: "달리기 좋은 순간을 짚어드려요",
    ready: true,
    resultMode: "score",
    weights: { dust: 0.28, temperature: 0.22, precipitation: 0.16, uv: 0.12, humidity: 0.11, wind: 0.11 },
    temp: { optimalLo: 8, optimalHi: 16, coldSlope: 6, hotSlope: 5.2 },
    heat: { hot1: 30, hot1Cap: 55, hot2: 33, hot2Cap: 35 },
    windCap: { speed: 14, cap: 40 },
    terms: {
      verbDo: "뛰",
      outfitTitle: "러닝 복장",
      alarmTitle: "러닝 알림",
      rainyTag: "우중런",
      blockedTag: "러닝 어려움",
      nowTag: "지금 뛰기 딱!",
      notifReady: "러닝하기 좋은 시간이에요"
    }
  },
  walk: {
    key: "walk",
    label: "걷기",
    emoji: "🚶",
    tagline: "가볍게 걷기 좋은 시간을 알려드려요",
    ready: true,
    resultMode: "score",
    weights: { dust: 0.3, temperature: 0.2, precipitation: 0.16, uv: 0.16, humidity: 0.07, wind: 0.11 },
    temp: { optimalLo: 10, optimalHi: 22, coldSlope: 5, hotSlope: 4 },
    heat: { hot1: 33, hot1Cap: 60, hot2: 36, hot2Cap: 40 },
    windCap: { speed: 14, cap: 40 },
    terms: {
      verbDo: "걷",
      outfitTitle: "걷기 복장",
      alarmTitle: "걷기 알림",
      rainyTag: "우중 걷기",
      blockedTag: "걷기 어려움",
      nowTag: "지금 걷기 딱!",
      notifReady: "걷기 좋은 시간이에요"
    }
  },
  dog: {
    key: "dog",
    label: "애견산책",
    emoji: "🐕",
    tagline: "강아지 발바닥까지 생각한 산책 타이밍",
    ready: true,
    resultMode: "score",
    weights: { dust: 0.32, temperature: 0.2, precipitation: 0.16, uv: 0.16, humidity: 0.06, wind: 0.1 },
    temp: { optimalLo: 8, optimalHi: 20, coldSlope: 5, hotSlope: 4.6 },
    heat: { hot1: 28, hot1Cap: 55, hot2: 31, hot2Cap: 35 },
    windCap: { speed: 14, cap: 40 },
    terms: {
      verbDo: "산책하",
      outfitTitle: "산책 준비물",
      alarmTitle: "산책 알림",
      rainyTag: "비 산책",
      blockedTag: "산책 자제",
      nowTag: "지금 산책 딱!",
      notifReady: "산책하기 좋은 시간이에요"
    }
  },
  bike: {
    key: "bike",
    label: "자전거",
    emoji: "🚴",
    tagline: "바람까지 계산한 라이딩 타이밍",
    ready: true,
    resultMode: "score",
    weights: { dust: 0.16, temperature: 0.18, precipitation: 0.24, uv: 0.12, humidity: 0.08, wind: 0.22 },
    temp: { optimalLo: 12, optimalHi: 24, coldSlope: 6, hotSlope: 4 },
    heat: { hot1: 32, hot1Cap: 60, hot2: 35, hot2Cap: 40 },
    windCap: { speed: 11, cap: 38 },
    terms: {
      verbDo: "라이딩하",
      outfitTitle: "라이딩 복장",
      alarmTitle: "라이딩 알림",
      rainyTag: "빗속 라이딩",
      blockedTag: "라이딩 어려움",
      nowTag: "지금 라이딩 딱!",
      notifReady: "라이딩하기 좋은 시간이에요"
    }
  }
};

export const ACTIVITY_ORDER: ActivityKey[] = ["run", "walk", "dog", "bike"];

/* ------------------------------------------------------------------ *
 * 애견산책 — 지면 열기(발바닥 화상) 경고
 * 아스팔트는 한낮 직사광에서 기온보다 20~30°C 이상 뜨거워진다.
 * ------------------------------------------------------------------ */
export type PawRisk = {
  level: "safe" | "caution" | "danger";
  title: string;
  detail: string;
};

export function getPawRisk(input: { hour: number; temperature: number; uvIndex: number }): PawRisk {
  const daytime = input.hour >= 11 && input.hour <= 16;
  const sunny = input.uvIndex >= 5;

  if (daytime && input.temperature >= 30 && sunny) {
    return {
      level: "danger",
      title: "발바닥 화상 위험",
      detail: "한낮 아스팔트는 50°C를 넘어요. 손등을 5초 대보고 뜨거우면 산책을 미루세요."
    };
  }

  if (daytime && input.temperature >= 26 && input.uvIndex >= 4) {
    return {
      level: "caution",
      title: "지면 열기 주의",
      detail: "볕 받은 아스팔트가 뜨거울 수 있어요. 그늘길·흙길 위주로 짧게 도세요."
    };
  }

  if (input.temperature >= 28 && daytime) {
    return {
      level: "caution",
      title: "더위 주의",
      detail: "강아지는 사람보다 더위에 약해요. 물을 챙기고 헥헥거리면 바로 쉬세요."
    };
  }

  return {
    level: "safe",
    title: "지면 온도 안심",
    detail: "발바닥 걱정 없이 걸을 수 있는 시간이에요."
  };
}

/* ------------------------------------------------------------------ *
 * 애견산책 종합 플랜 — 신호등 + 추천 산책 길이 + 발바닥 + 챙길 것
 * ------------------------------------------------------------------ */
export type DogPlan = {
  signal: "go" | "caution" | "avoid";
  signalText: string;
  walkLength: string;
  paw: PawRisk;
  checklist: string[];
};

export function getDogPlan(input: {
  score: number;
  hour: number;
  temperature: number;
  apparentTemperature: number;
  uvIndex: number;
  precipitation: number;
  precipitationProbability: number;
}): DogPlan {
  const paw = getPawRisk({ hour: input.hour, temperature: input.temperature, uvIndex: input.uvIndex });

  let signal: DogPlan["signal"];
  if (input.score >= 60 && paw.level !== "danger") signal = "go";
  else if (input.score >= 40 && paw.level !== "danger") signal = "caution";
  else signal = "avoid";

  const signalText = signal === "go" ? "산책 가능" : signal === "caution" ? "짧게 주의" : "산책 자제";

  const walkLength =
    signal === "avoid"
      ? "배변만 짧게 (5분 이내)"
      : input.score >= 75 && paw.level === "safe"
      ? "길게 걸어도 좋아요 (40분+)"
      : input.score >= 55
      ? "보통 산책 (20~30분)"
      : "짧게 (10분 이내)";

  const checklist: string[] = ["💧 물", "🛍️ 배변봉투"];
  if (input.apparentTemperature >= 25) checklist.push("🌳 그늘길 코스");
  if (input.apparentTemperature <= 3) checklist.push("🧥 강아지 옷");
  if (input.precipitation >= 0.3 || input.precipitationProbability >= 60) checklist.push("🧻 발 닦을 수건");
  if (paw.level !== "safe") checklist.push("🐾 지면 온도 확인");

  return { signal, signalText, walkLength, paw, checklist };
}
