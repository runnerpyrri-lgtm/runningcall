import { ACTIVITIES, type ActivityKey, type ActivityProfile, type HeatCaps, type TempCurve } from "@/lib/activity";

export type ScoreTone = "excellent" | "good" | "fair" | "caution" | "bad";
export type GradeTone = "good" | "normal" | "caution" | "bad";

export type HourlyInput = {
  time: string;
  temperature: number;
  apparentTemperature: number;
  humidity: number;
  // 결측(null)은 0으로 뭉개지 않고 그대로 전달한다 — 대기질 API 장애가 "공기 최상"으로 둔갑하는 것을 막는다.
  pm10: number | null;
  pm25: number | null;
  uvIndex: number;
  precipitation: number;
  precipitationProbability: number | null;
  windSpeed: number;
  // 등산 안전용 (optional, 점수 계산엔 미사용 — 러닝 골든마스터 불변 보장)
  weatherCode?: number;
  windGust?: number;
  visibility?: number;
  cloudCover?: number;
  snowfall?: number;
};

export type RunningSlot = HourlyInput & {
  hour: number;
  totalScore: number;
  // 대기질(pm2.5·pm10) 모두 결측이면 null — 이 시간 점수에서 미세먼지 요인이 제외됐다는 표시.
  dustScore: number | null;
  uvScore: number;
  temperatureScore: number;
  humidityScore: number;
  precipitationScore: number;
  windScore: number;
  comment: string;
  tone: ScoreTone;
};

export type MetricGrade = {
  label: string;
  tone: GradeTone;
};

// 가중치·온도곡선·더위캡은 활동 프로필(lib/activity.ts)에서 온다. run = 기존 러닝콜 값 그대로.

function clampScore(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function linearScore(value: number, points: Array<[number, number]>) {
  if (value <= points[0][0]) {
    return points[0][1];
  }

  for (let index = 1; index < points.length; index += 1) {
    const [x2, y2] = points[index];
    const [x1, y1] = points[index - 1];

    if (value <= x2) {
      const ratio = (value - x1) / (x2 - x1);
      return y1 + ratio * (y2 - y1);
    }
  }

  return points[points.length - 1][1];
}

// 결측 처리: 둘 다 null이면 null(요인 제외), 하나만 있으면 있는 값만으로 계산(가중치 재정규화).
// 결측을 0(=최상 공기)으로 취급하지 않는다.
export function scoreDust(pm25: number | null, pm10: number | null): number | null {
  const pm25Score =
    pm25 === null
      ? null
      : linearScore(pm25, [
          [0, 100],
          [15, 100],
          [35, 78],
          [55, 48],
          [75, 22],
          [100, 0]
        ]);

  const pm10Score =
    pm10 === null
      ? null
      : linearScore(pm10, [
          [0, 100],
          [30, 100],
          [80, 76],
          [150, 36],
          [250, 0]
        ]);

  if (pm25Score === null && pm10Score === null) {
    return null;
  }
  if (pm25Score === null) {
    return clampScore(pm10Score as number);
  }
  if (pm10Score === null) {
    return clampScore(pm25Score);
  }
  return clampScore(pm25Score * 0.65 + pm10Score * 0.35);
}

export function scoreUv(uvIndex: number) {
  return clampScore(
    linearScore(uvIndex, [
      [0, 100],
      [2, 100],
      [5, 82],
      [7, 54],
      [10, 20],
      [12, 0]
    ])
  );
}

// 체감온도 기준. 최적 구간·기울기는 활동 프로필에서 (러닝 8~16°C).
export function scoreTemperature(apparent: number, temp: TempCurve = ACTIVITIES.run.temp) {
  if (apparent >= temp.optimalLo && apparent <= temp.optimalHi) {
    return 100;
  }

  if (apparent < temp.optimalLo) {
    return clampScore(100 - (temp.optimalLo - apparent) * temp.coldSlope);
  }

  return clampScore(100 - (apparent - temp.optimalHi) * temp.hotSlope);
}

export function scoreHumidity(humidity: number) {
  if (humidity >= 40 && humidity <= 60) {
    return 100;
  }

  if (humidity < 40) {
    return clampScore(100 - (40 - humidity) * 2.5);
  }

  return clampScore(100 - (humidity - 60) * 3);
}

export function scorePrecipitation(amountMm: number, probability: number | null) {
  const amountScore = linearScore(amountMm, [
    [0, 100],
    [0.2, 86],
    [1, 52],
    [3, 22],
    [6, 0]
  ]);

  // 확률 결측 시 실측 강수량만으로 판정 (결측을 "확률 0%"로 취급하지 않음).
  if (probability === null) {
    return clampScore(amountScore);
  }

  const probabilityScore = linearScore(probability, [
    [0, 100],
    [30, 90],
    [50, 68],
    [70, 42],
    [90, 12],
    [100, 0]
  ]);

  return clampScore(amountScore * 0.6 + probabilityScore * 0.4);
}

export function scoreWind(speedMs: number) {
  return clampScore(
    linearScore(speedMs, [
      [0, 100],
      [2, 100],
      [4, 88],
      [6, 72],
      [9, 50],
      [12, 28],
      [15, 8],
      [18, 0]
    ])
  );
}

// 위험 조건에서는 아무리 다른 지표가 좋아도 총점 상한을 건다. 더위·바람 상한은 활동별.
function applyCaps(
  total: number,
  input: HourlyInput,
  heat: HeatCaps = ACTIVITIES.run.heat,
  windCap: { speed: number; cap: number } = ACTIVITIES.run.windCap
) {
  let cap = 100;

  if (input.precipitation >= 4) {
    cap = Math.min(cap, 25);
  } else if (input.precipitation >= 1) {
    cap = Math.min(cap, 45);
  } else if ((input.precipitationProbability ?? 0) >= 80) {
    cap = Math.min(cap, 60);
  }

  if (input.apparentTemperature >= heat.hot2) {
    cap = Math.min(cap, heat.hot2Cap);
  } else if (input.apparentTemperature >= heat.hot1) {
    cap = Math.min(cap, heat.hot1Cap);
  }

  if (input.apparentTemperature <= -10) {
    cap = Math.min(cap, 35);
  } else if (input.apparentTemperature <= -5) {
    cap = Math.min(cap, 55);
  }

  if ((input.pm25 ?? 0) > 75 || (input.pm10 ?? 0) > 150) {
    cap = Math.min(cap, 30);
  }

  if (input.windSpeed >= windCap.speed) {
    cap = Math.min(cap, windCap.cap);
  }

  if (input.uvIndex >= 11) {
    cap = Math.min(cap, 50);
  }

  return Math.min(total, cap);
}

// 히어로 우측 두 줄에 자연스럽게 떨어지는 길이. run 문구는 기존 값 그대로 (골든마스터 잠금).
const COMMENTS: Record<ActivityKey, Record<ScoreTone, string[]>> = {
  run: {
    excellent: ["지금 뛰기 아주 좋아요", "완벽한 러닝 타이밍이에요", "이런 날 안 뛰면 아까워요", "최고의 컨디션이에요"],
    good: ["지금 뛰기 좋아요", "무리 없이 달리기 좋아요", "가볍게 나가기 좋은 때예요", "평소 페이스면 충분해요"],
    fair: ["무난한 컨디션이에요", "가볍게 뛸 만해요", "짧은 코스가 어울려요", "컨디션 보며 달려봐요"],
    caution: ["오늘은 가볍게 짧게만", "무리하지 않는 게 좋아요", "조깅 정도만 추천해요", "몸 푸는 정도가 좋아요"],
    bad: ["오늘은 실내 운동이 나아요", "무리해서 나갈 날은 아니에요", "쉬어가도 괜찮은 날이에요", "회복에 집중할 날이에요"]
  },
  walk: {
    excellent: ["지금 걷기 아주 좋아요", "산책하기 완벽한 날이에요", "이런 날 집에만 있긴 아까워요", "바깥 공기가 최고예요"],
    good: ["지금 걷기 좋아요", "가볍게 산책 나가기 좋아요", "동네 한 바퀴 딱 좋아요", "느긋하게 걷기 좋은 때예요"],
    fair: ["무난하게 걸을 만해요", "짧은 산책은 충분해요", "가볍게 다녀오기 좋아요", "천천히 걸어봐요"],
    caution: ["오늘은 짧게만 걸어요", "무리하지 않는 게 좋아요", "잠깐 바람만 쐬고 와요", "가까운 곳만 다녀와요"],
    bad: ["오늘은 실내가 나아요", "나가기 아쉬운 날이에요", "꼭 나가야 하면 짧게만요", "쉬어가도 괜찮은 날이에요"]
  },
  dog: {
    excellent: ["산책 나가기 최고예요", "강아지가 신날 날씨예요", "이런 날 산책 안 하면 서운해요", "꼬리 흔들 컨디션이에요"],
    good: ["산책하기 좋아요", "기분 좋게 걸을 수 있어요", "여유롭게 한 바퀴 어때요", "강아지도 좋아할 날씨예요"],
    fair: ["무난한 산책 컨디션이에요", "평소 코스로 가볍게요", "짧은 산책은 충분해요", "상태 보며 걸어봐요"],
    caution: ["오늘은 짧은 산책만요", "배변 산책 정도만 추천해요", "그늘길 위주로 잠깐만요", "무리한 산책은 피해요"],
    bad: ["오늘 산책은 쉬어가요", "실내 놀이가 나은 날이에요", "꼭 나가야 하면 아주 짧게만요", "강아지 건강이 우선이에요"]
  },
  hike: {
    excellent: ["산 오르기 최고예요", "완벽한 산행 날씨예요", "조망까지 트인 날이에요", "이런 날 산 안 가면 아까워요"],
    good: ["산행하기 좋아요", "오르기 좋은 날이에요", "기분 좋은 산행이 될 거예요", "부담 없이 다녀오기 좋아요"],
    fair: ["무난한 산행이에요", "가벼운 코스가 어울려요", "낮은 산은 괜찮아요", "컨디션 보며 올라요"],
    caution: ["짧은 코스만 추천해요", "무리한 정상은 피해요", "날씨 변화 주의해요", "가까운 둘레길이 좋아요"],
    bad: ["오늘 산행은 위험해요", "무리할 날은 아니에요", "다음 기회를 노려요", "안전이 우선이에요"]
  },
  bike: {
    excellent: ["라이딩하기 최고예요", "완벽한 라이딩 날씨예요", "바람 없이 시원하게 달려요", "지금 페달 밟기 딱이에요"],
    good: ["라이딩하기 좋아요", "가볍게 달리기 좋아요", "기분 좋게 탈 수 있어요", "부담 없이 나가기 좋아요"],
    fair: ["무난한 라이딩이에요", "짧은 코스는 괜찮아요", "바람 보며 달려봐요", "가볍게라면 좋아요"],
    caution: ["짧게만 타는 게 좋아요", "바람·노면 주의해요", "무리한 코스는 피해요", "가까운 길만 돌아요"],
    bad: ["오늘 라이딩은 위험해요", "실내 운동이 나아요", "바람·비가 부담이에요", "쉬어가는 날이에요"]
  }
};

function pickVariant(variants: string[], seed: number) {
  const index = Math.abs(seed) % variants.length;
  return variants[index];
}

export function scoreTone(score: number): ScoreTone {
  if (score >= 88) {
    return "excellent";
  }

  if (score >= 72) {
    return "good";
  }

  if (score >= 55) {
    return "fair";
  }

  if (score >= 38) {
    return "caution";
  }

  return "bad";
}

export function scoreComment(score: number, activity: ActivityKey = "run", seed = 0) {
  return pickVariant(COMMENTS[activity][scoreTone(score)], seed);
}

export function calculateSlot(input: HourlyInput, profile: ActivityProfile): RunningSlot {
  const dustScore = scoreDust(input.pm25, input.pm10);
  const uvScore = scoreUv(input.uvIndex);
  const temperatureScore = scoreTemperature(input.apparentTemperature, profile.temp);
  const humidityScore = scoreHumidity(input.humidity);
  const precipitationScore = scorePrecipitation(input.precipitation, input.precipitationProbability);
  const windScore = scoreWind(input.windSpeed);

  const w = profile.weights;
  // 대기질 결측(dustScore=null) 시 미세먼지 요인을 제외하고 남은 가중치로 재정규화한다.
  // 결측을 만점으로 치지 않으면서 점수는 항상 0~100 범위를 유지한다.
  // 데이터가 완전할 때는 기존 식 그대로 (러닝 골든마스터 불변).
  const restWeighted =
    temperatureScore * w.temperature +
    precipitationScore * w.precipitation +
    uvScore * w.uv +
    humidityScore * w.humidity +
    windScore * w.wind;
  const weighted =
    dustScore === null
      ? restWeighted / (w.temperature + w.precipitation + w.uv + w.humidity + w.wind)
      : dustScore * w.dust + restWeighted;

  const totalScore = clampScore(applyCaps(weighted, input, profile.heat, profile.windCap));
  const hour = Number(input.time.slice(11, 13));
  const day = Number(input.time.slice(8, 10));
  const seed = day * 31 + hour;

  return {
    ...input,
    hour,
    totalScore,
    dustScore,
    uvScore,
    temperatureScore,
    humidityScore,
    precipitationScore,
    windScore,
    comment: scoreComment(totalScore, profile.key, seed),
    tone: scoreTone(totalScore)
  };
}

// 기존 러닝콜 호환 별칭 — run 프로필로 계산 (삭제 금지)
export function calculateRunningSlot(input: HourlyInput): RunningSlot {
  return calculateSlot(input, ACTIVITIES.run);
}

export function gradePm25(value: number): MetricGrade {
  if (value <= 15) {
    return { label: "좋음", tone: "good" };
  }

  if (value <= 35) {
    return { label: "보통", tone: "normal" };
  }

  if (value <= 75) {
    return { label: "나쁨", tone: "caution" };
  }

  return { label: "매우 나쁨", tone: "bad" };
}

export function gradePm10(value: number): MetricGrade {
  if (value <= 30) {
    return { label: "좋음", tone: "good" };
  }

  if (value <= 80) {
    return { label: "보통", tone: "normal" };
  }

  if (value <= 150) {
    return { label: "나쁨", tone: "caution" };
  }

  return { label: "매우 나쁨", tone: "bad" };
}

export function gradeUv(value: number): MetricGrade {
  if (value <= 2) {
    return { label: "낮음", tone: "good" };
  }

  if (value <= 5) {
    return { label: "보통", tone: "normal" };
  }

  if (value <= 7) {
    return { label: "높음", tone: "caution" };
  }

  return { label: "매우 높음", tone: "bad" };
}

export function gradeTemperature(value: number): MetricGrade {
  if (value >= 8 && value <= 18) {
    return { label: "쾌적", tone: "good" };
  }

  if (value >= 2 && value <= 25) {
    return { label: "보통", tone: "normal" };
  }

  if (value >= -5 && value <= 30) {
    return { label: "주의", tone: "caution" };
  }

  return { label: "위험", tone: "bad" };
}

export function gradeHumidity(value: number): MetricGrade {
  if (value >= 45 && value <= 60) {
    return { label: "쾌적", tone: "good" };
  }

  if (value >= 30 && value < 78) {
    return { label: "보통", tone: "normal" };
  }

  if (value >= 78 && value < 85) {
    return { label: "습함", tone: "caution" };
  }

  if (value >= 85) {
    return { label: "매우 습함", tone: "bad" };
  }

  return { label: "건조", tone: "caution" };
}

export function gradePrecipitation(amountMm: number, probability: number): MetricGrade {
  if (amountMm >= 3) {
    return { label: "강한 비", tone: "bad" };
  }

  if (amountMm >= 0.5) {
    return { label: "비", tone: "caution" };
  }

  if (probability >= 60) {
    return { label: "비 올 듯", tone: "caution" };
  }

  if (probability >= 30) {
    return { label: "흐림 주의", tone: "normal" };
  }

  return { label: "없음", tone: "good" };
}

export function gradeWind(speedMs: number): MetricGrade {
  if (speedMs < 4) {
    return { label: "약함", tone: "good" };
  }

  if (speedMs < 8) {
    return { label: "보통", tone: "normal" };
  }

  if (speedMs < 14) {
    return { label: "강함", tone: "caution" };
  }

  return { label: "매우 강함", tone: "bad" };
}
