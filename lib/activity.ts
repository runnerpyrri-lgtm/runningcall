// 활동(걷기·러닝·애견산책·출퇴근)별 점수 프로필과 표시 설정
export type ActivityKey = "walk" | "run" | "dog" | "commute";

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

export type ActivityProfile = {
  key: ActivityKey;
  label: string;
  emoji: string;
  /** 히어로 아래 짧은 설명 (활동 전환 시 맥락 제공) */
  tagline: string;
  ready: boolean;
  /** score = 점수 중심 표기, advisory = 상태/조언 중심 표기(출퇴근) */
  resultMode: "score" | "advisory";
  weights: ActivityWeights;
  temp: TempCurve;
  heat: HeatCaps;
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
    heat: { hot1: 30, hot1Cap: 55, hot2: 33, hot2Cap: 35 }
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
    heat: { hot1: 33, hot1Cap: 60, hot2: 36, hot2Cap: 40 }
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
    heat: { hot1: 28, hot1Cap: 55, hot2: 31, hot2Cap: 35 }
  },
  commute: {
    key: "commute",
    label: "출퇴근",
    emoji: "☂️",
    tagline: "우산이 필요한지 먼저 알려드려요",
    ready: true,
    resultMode: "advisory",
    weights: { dust: 0.14, temperature: 0.16, precipitation: 0.44, uv: 0.06, humidity: 0.08, wind: 0.12 },
    temp: { optimalLo: 8, optimalHi: 24, coldSlope: 4, hotSlope: 3.5 },
    heat: { hot1: 34, hot1Cap: 65, hot2: 37, hot2Cap: 45 }
  }
};

export const ACTIVITY_ORDER: ActivityKey[] = ["run", "walk", "dog", "commute"];

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
 * 출퇴근 — 우산/비 회피 조언 (점수보다 이게 핵심 정보)
 * ------------------------------------------------------------------ */
export type UmbrellaAdvice = {
  level: "none" | "maybe" | "need" | "rain";
  title: string;
  detail: string;
};

export function getUmbrellaAdvice(slots: Array<{ hour: number; precipitation: number; precipitationProbability: number }>, nowHour: number): UmbrellaAdvice {
  // 지금부터 12시간 안의 비 소식을 본다 (출근+퇴근 왕복 커버)
  const ahead = slots.filter((s) => s.hour >= nowHour && s.hour <= nowHour + 12);
  const now = ahead[0];
  const raining = now && now.precipitation >= 0.2;
  const firstRain = ahead.find((s) => s.precipitation >= 0.5 || s.precipitationProbability >= 70);
  const maybeRain = ahead.find((s) => s.precipitationProbability >= 40);

  if (raining) {
    return {
      level: "rain",
      title: "지금 비가 와요",
      detail: "우산 없이 나가면 젖어요. 방수 신발이면 더 든든해요."
    };
  }

  if (firstRain) {
    const label = firstRain.hour <= 12 ? `오전 ${firstRain.hour}시` : `오후 ${firstRain.hour - 12 === 0 ? 12 : firstRain.hour - 12}시`;
    return {
      level: "need",
      title: "우산 챙기세요",
      detail: `${label}쯤 비 소식이 있어요. 지금은 괜찮아도 돌아올 때 맞을 수 있어요.`
    };
  }

  if (maybeRain) {
    return {
      level: "maybe",
      title: "접이식 우산 정도",
      detail: "비 올 확률이 조금 있어요. 가방에 작은 우산 하나면 마음 편해요."
    };
  }

  return {
    level: "none",
    title: "우산 없이 OK",
    detail: "오늘 이동 시간대엔 비 걱정이 없어요."
  };
}
