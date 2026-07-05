// 활동(걷기·애견산책·러닝·등산·자전거)별 점수 프로필과 표시 설정
export type ActivityKey = "run" | "walk" | "dog" | "hike" | "bike";

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
  /** 탭용 짧은 라벨 (5개 탭이 좁은 화면에 딱 맞게) */
  short: string;
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
    short: "러닝",
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
    short: "걷기",
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
    short: "산책",
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
  hike: {
    key: "hike",
    label: "등산",
    short: "등산",
    emoji: "⛰️",
    tagline: "산 오르기 좋은 시간과 하산 여유까지",
    ready: true,
    resultMode: "score",
    weights: { dust: 0.12, temperature: 0.18, precipitation: 0.28, uv: 0.1, humidity: 0.1, wind: 0.22 },
    temp: { optimalLo: 6, optimalHi: 18, coldSlope: 4.5, hotSlope: 5 },
    heat: { hot1: 31, hot1Cap: 55, hot2: 34, hot2Cap: 38 },
    windCap: { speed: 12, cap: 38 },
    terms: {
      verbDo: "등산하",
      outfitTitle: "등산 준비물",
      alarmTitle: "산행 알림",
      rainyTag: "우중 산행",
      blockedTag: "산행 위험",
      nowTag: "지금 산행 딱!",
      notifReady: "산 오르기 좋은 시간이에요"
    }
  },
  bike: {
    key: "bike",
    label: "자전거",
    short: "자전거",
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

// 수요 기준 확정 순서 — 걷기 → 애견산책 → 러닝 → 등산 → 자전거
export const ACTIVITY_ORDER: ActivityKey[] = ["walk", "dog", "run", "hike", "bike"];

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
  reason: string;
  alternative: string;
  careTip: string;
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

  // 판정 근거 — 가장 나쁜 요인을 우선순위로 짚어준다
  const rainy = input.precipitation >= 0.3 || input.precipitationProbability >= 60;
  const reason =
    paw.level === "danger"
      ? "지면이 너무 뜨거워요(발바닥 화상 위험)"
      : rainy
      ? "비 소식이 있어요"
      : input.apparentTemperature >= 28
      ? "더위가 심해요"
      : input.apparentTemperature <= -5
      ? "한파예요"
      : signal === "go"
      ? "날씨 조건이 좋아요"
      : "컨디션이 애매한 날씨예요";

  const alternative =
    signal === "avoid"
      ? "배변만 짧게 다녀오고, 실내 노즈워크·터그 놀이로 에너지를 풀어주세요"
      : signal === "caution"
      ? "평소보다 짧은 코스로, 강아지 반응을 보며 다녀오세요"
      : "";

  const careTip = rainy
    ? "다녀오면 발과 배를 꼼꼼히 닦아주세요"
    : paw.level !== "safe"
    ? "그늘길로 걷고, 자주 발바닥 상태를 확인하세요"
    : input.apparentTemperature <= 3
    ? "다녀와서 몸을 따뜻하게 해주세요"
    : "물을 챙겨 중간중간 마시게 해주세요";

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
  if (rainy) checklist.push("🧻 발 닦을 수건");
  if (paw.level !== "safe") checklist.push("🐾 지면 온도 확인");

  return { signal, signalText, reason, alternative, careTip, walkLength, paw, checklist };
}

/* ------------------------------------------------------------------ *
 * 등산 종합 플랜 — 하산 마감 + 일출 산행 + 안전 신호 + 조망 + 준비물
 * 등산은 목적지 산 중심 활동이라 안전 정보가 점수보다 중요하다.
 * ------------------------------------------------------------------ */
export type HikeSignal = { level: "danger" | "caution"; emoji: string; text: string };

export type HikePlan = {
  sunsetText: string | null;
  descentDeadline: string | null;
  sunrisePlan: string | null;
  signals: HikeSignal[];
  view: string;
  summitNote: string;
  checklist: string[];
};

function fmtAmPmKo(hour: number, minute: number) {
  const ap = hour < 12 ? "오전" : "오후";
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${ap} ${h}시${minute > 0 ? ` ${minute}분` : ""}`;
}

function parseClock(iso: string | null): { h: number; m: number } | null {
  if (!iso) return null;
  const h = Number(iso.slice(11, 13));
  const m = Number(iso.slice(14, 16));
  if (!Number.isFinite(h)) return null;
  return { h, m: Number.isFinite(m) ? m : 0 };
}

export function getHikePlan(input: {
  hour: number;
  temperature: number;
  apparentTemperature: number;
  humidity: number;
  uvIndex: number;
  windSpeed: number;
  windGust?: number;
  precipitation: number;
  precipitationProbability: number;
  weatherCode?: number;
  visibility?: number;
  cloudCover?: number;
  snowfall?: number;
  pm25: number;
  sunrise: string | null;
  sunset: string | null;
}): HikePlan {
  // 하산 마감 = 일몰 2시간 30분 전 (해 지기 전 여유 확보)
  const set = parseClock(input.sunset);
  let sunsetText: string | null = null;
  let descentDeadline: string | null = null;
  if (set) {
    sunsetText = `일몰 ${fmtAmPmKo(set.h, set.m)}`;
    let dh = set.h - 2;
    let dm = set.m - 30;
    if (dm < 0) {
      dm += 60;
      dh -= 1;
    }
    descentDeadline = `늦어도 ${fmtAmPmKo((dh + 24) % 24, dm)}엔 하산을 시작하세요`;
  }

  // 일출 산행 (새벽·이른 아침에만 안내)
  const rise = parseClock(input.sunrise);
  const sunrisePlan =
    rise && input.hour <= 8 ? `일출 ${fmtAmPmKo(rise.h, rise.m)} · 정상 일출을 보려면 여유 있게 출발하세요` : null;

  // 안전 신호 — 낙뢰 > 돌풍 > 비 > 결빙 > 능선 바람 순
  const signals: HikeSignal[] = [];
  if (input.weatherCode !== undefined && input.weatherCode >= 95) {
    signals.push({ level: "danger", emoji: "⛈️", text: "낙뢰 위험. 능선·정상은 매우 위험하니 산행을 미루세요." });
  }
  const gust = input.windGust ?? input.windSpeed;
  if (gust >= 14) {
    signals.push({ level: "danger", emoji: "💨", text: "돌풍이 강해요. 정상부 저체온·실족 위험이 커요." });
  } else if (input.windSpeed >= 9) {
    signals.push({ level: "caution", emoji: "🌬️", text: "능선 바람이 강해요. 정상부는 체감이 더 낮아요." });
  }
  if (input.precipitation >= 0.5 || input.precipitationProbability >= 60) {
    signals.push({ level: "caution", emoji: "🌧️", text: "비 소식이 있어요. 바위·흙길·계단 미끄럼을 조심하세요." });
  }
  if ((input.snowfall ?? 0) > 0 || (input.temperature <= 0 && input.humidity >= 70)) {
    signals.push({ level: "caution", emoji: "❄️", text: "결빙·눈 가능. 아이젠과 스틱을 챙기세요." });
  }

  // 조망 — 시정·구름·미세먼지 종합
  const vis = input.visibility ?? 20000;
  const view =
    vis < 5000 || input.pm25 > 55
      ? "오늘은 조망이 흐릴 수 있어요."
      : (input.cloudCover ?? 0) >= 80
      ? "구름이 많아 조망은 아쉬울 수 있어요."
      : vis >= 15000 && input.pm25 <= 35
      ? "조망이 트인 맑은 날이에요."
      : "조망은 무난한 편이에요.";

  const summitNote = "정상부는 기온보다 6~10°C 낮고 바람이 강해요. 겹쳐 입으세요.";

  const checklist: string[] = ["💧 충분한 물", "🧥 바람막이", "🔋 보조배터리"];
  if (input.uvIndex >= 5) checklist.push("🧢 모자·선크림");
  if (input.precipitation >= 0.3 || input.precipitationProbability >= 60) checklist.push("🌂 우비");
  if (input.hour >= 14 || (set && input.hour >= set.h - 3)) checklist.push("🔦 헤드랜턴");
  if ((input.snowfall ?? 0) > 0 || input.temperature <= 2) checklist.push("🧊 아이젠·장갑");

  return { sunsetText, descentDeadline, sunrisePlan, signals: signals.slice(0, 4), view, summitNote, checklist };
}
