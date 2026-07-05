export type ScoreTone = "excellent" | "good" | "fair" | "caution" | "bad";
export type GradeTone = "good" | "normal" | "caution" | "bad";

export type HourlyInput = {
  time: string;
  temperature: number;
  apparentTemperature: number;
  humidity: number;
  pm10: number;
  pm25: number;
  uvIndex: number;
  precipitation: number;
  precipitationProbability: number;
  windSpeed: number;
};

export type RunningSlot = HourlyInput & {
  hour: number;
  totalScore: number;
  dustScore: number;
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

const WEIGHTS = {
  dust: 0.28,
  temperature: 0.22,
  precipitation: 0.16,
  uv: 0.12,
  humidity: 0.11,
  wind: 0.11
} as const;

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

export function scoreDust(pm25: number, pm10: number) {
  const pm25Score = linearScore(pm25, [
    [0, 100],
    [15, 100],
    [35, 78],
    [55, 48],
    [75, 22],
    [100, 0]
  ]);

  const pm10Score = linearScore(pm10, [
    [0, 100],
    [30, 100],
    [80, 76],
    [150, 36],
    [250, 0]
  ]);

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

// 체감온도 기준. 러닝 최적 구간은 8~16°C.
export function scoreTemperature(apparent: number) {
  if (apparent >= 8 && apparent <= 16) {
    return 100;
  }

  if (apparent < 8) {
    return clampScore(100 - (8 - apparent) * 6);
  }

  return clampScore(100 - (apparent - 16) * 5.2);
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

export function scorePrecipitation(amountMm: number, probability: number) {
  const amountScore = linearScore(amountMm, [
    [0, 100],
    [0.2, 86],
    [1, 52],
    [3, 22],
    [6, 0]
  ]);

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

// 위험 조건에서는 아무리 다른 지표가 좋아도 총점 상한을 건다.
function applyCaps(total: number, input: HourlyInput) {
  let cap = 100;

  if (input.precipitation >= 4) {
    cap = Math.min(cap, 25);
  } else if (input.precipitation >= 1) {
    cap = Math.min(cap, 45);
  } else if (input.precipitationProbability >= 80) {
    cap = Math.min(cap, 60);
  }

  if (input.apparentTemperature >= 33) {
    cap = Math.min(cap, 35);
  } else if (input.apparentTemperature >= 30) {
    cap = Math.min(cap, 55);
  }

  if (input.apparentTemperature <= -10) {
    cap = Math.min(cap, 35);
  } else if (input.apparentTemperature <= -5) {
    cap = Math.min(cap, 55);
  }

  if (input.pm25 > 75 || input.pm10 > 150) {
    cap = Math.min(cap, 30);
  }

  if (input.windSpeed >= 14) {
    cap = Math.min(cap, 40);
  }

  if (input.uvIndex >= 11) {
    cap = Math.min(cap, 50);
  }

  return Math.min(total, cap);
}

// 히어로 우측 두 줄에 자연스럽게 떨어지는 길이
const COMMENTS: Record<ScoreTone, string[]> = {
  excellent: ["지금 뛰기 아주 좋아요", "완벽한 러닝 타이밍이에요", "이런 날 안 뛰면 아까워요", "최고의 컨디션이에요"],
  good: ["지금 뛰기 좋아요", "무리 없이 달리기 좋아요", "가볍게 나가기 좋은 때예요", "평소 페이스면 충분해요"],
  fair: ["무난한 컨디션이에요", "가볍게 뛸 만해요", "짧은 코스가 어울려요", "컨디션 보며 달려봐요"],
  caution: ["오늘은 가볍게 짧게만", "무리하지 않는 게 좋아요", "조깅 정도만 추천해요", "몸 푸는 정도가 좋아요"],
  bad: ["오늘은 실내 운동이 나아요", "무리해서 나갈 날은 아니에요", "쉬어가도 괜찮은 날이에요", "회복에 집중할 날이에요"]
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

export function scoreComment(score: number, seed = 0) {
  return pickVariant(COMMENTS[scoreTone(score)], seed);
}

export function calculateRunningSlot(input: HourlyInput): RunningSlot {
  const dustScore = scoreDust(input.pm25, input.pm10);
  const uvScore = scoreUv(input.uvIndex);
  const temperatureScore = scoreTemperature(input.apparentTemperature);
  const humidityScore = scoreHumidity(input.humidity);
  const precipitationScore = scorePrecipitation(input.precipitation, input.precipitationProbability);
  const windScore = scoreWind(input.windSpeed);

  const weighted =
    dustScore * WEIGHTS.dust +
    temperatureScore * WEIGHTS.temperature +
    precipitationScore * WEIGHTS.precipitation +
    uvScore * WEIGHTS.uv +
    humidityScore * WEIGHTS.humidity +
    windScore * WEIGHTS.wind;

  const totalScore = clampScore(applyCaps(weighted, input));
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
    comment: scoreComment(totalScore, seed),
    tone: scoreTone(totalScore)
  };
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
