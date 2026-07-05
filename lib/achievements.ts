// 도전과제 — 지표별 시리즈로 3000+ 뱃지를 생성·소급 판정 (순수 함수)
import type { ActivityKey } from "@/lib/activity";
import type { Journal } from "@/lib/journal";
import type { ActivityLog } from "@/lib/activity-record";

const ACTIVITY_KEYS: ActivityKey[] = ["walk", "dog", "run", "hike", "bike"];

const ACT_META: Record<ActivityKey, { emoji: string; name: string }> = {
  walk: { emoji: "🚶", name: "걷기" },
  dog: { emoji: "🐕", name: "애견산책" },
  run: { emoji: "🏃", name: "러닝" },
  hike: { emoji: "⛰️", name: "등산" },
  bike: { emoji: "🚴", name: "자전거" }
};

export type AchievementStats = {
  totalSessions: number;
  sessionsByActivity: Record<ActivityKey, number>;
  distanceByActivity: Record<ActivityKey, number>;
  durationByActivity: Record<ActivityKey, number>;
  maxSingle: Record<ActivityKey, number>;
  maxSingleDurationByActivity: Record<ActivityKey, number>;
  totalDistance: number;
  totalDuration: number;
  uniqueMountains: number;
  bestStreak: number;
  moodDays: number;
  greatDays: number;
  diaryEntries: number;
  bestMonthDays: number;
  triedActivities: number;
  maxDayVariety: number;
  maxWeekVariety: number;
};

function zeroByActivity(): Record<ActivityKey, number> {
  return { walk: 0, dog: 0, run: 0, hike: 0, bike: 0 };
}

function epochDay(ds: string): number {
  const [y, m, d] = ds.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

export function computeStats(journal: Journal, log: ActivityLog): AchievementStats {
  // 날짜별 활동 집합 = 일지 활동 ∪ 기록탭 날짜
  const dayActs = new Map<string, Set<ActivityKey>>();
  const add = (date: string, key: ActivityKey) => {
    let set = dayActs.get(date);
    if (!set) {
      set = new Set();
      dayActs.set(date, set);
    }
    set.add(key);
  };
  for (const [date, entry] of Object.entries(journal)) {
    for (const a of entry.activities) add(date, a.key);
  }
  for (const act of ACTIVITY_KEYS) {
    for (const date of log[act]) add(date, act);
  }

  const sessionsByActivity = zeroByActivity();
  let maxDayVariety = 0;
  for (const set of dayActs.values()) {
    for (const act of set) sessionsByActivity[act] += 1;
    if (set.size > maxDayVariety) maxDayVariety = set.size;
  }

  // 거리·시간·산·기분·일기는 일지에서만
  const distanceByActivity = zeroByActivity();
  const durationByActivity = zeroByActivity();
  const maxSingle = zeroByActivity();
  const maxSingleDurationByActivity = zeroByActivity();
  const mountains = new Set<string>();
  let moodDays = 0;
  let greatDays = 0;
  let diaryEntries = 0;
  for (const entry of Object.values(journal)) {
    for (const a of entry.activities) {
      if (typeof a.distanceKm === "number") {
        distanceByActivity[a.key] += a.distanceKm;
        if (a.distanceKm > maxSingle[a.key]) maxSingle[a.key] = a.distanceKm;
      }
      if (typeof a.durationMin === "number") {
        durationByActivity[a.key] += a.durationMin;
        if (a.durationMin > maxSingleDurationByActivity[a.key]) maxSingleDurationByActivity[a.key] = a.durationMin;
      }
      if (a.key === "hike" && a.place) mountains.add(a.place.trim().toLowerCase());
    }
    if (entry.mood) {
      moodDays += 1;
      if (entry.mood === "great") greatDays += 1;
    }
    if (entry.note.trim()) diaryEntries += 1;
  }

  const totalDistance = Math.round((distanceByActivity.run + distanceByActivity.bike) * 10) / 10;
  const totalDuration = ACTIVITY_KEYS.reduce((sum, k) => sum + durationByActivity[k], 0);

  // 연속일 최장
  const days = [...dayActs.keys()].map(epochDay).sort((a, b) => a - b);
  let bestStreak = 0;
  let run = 0;
  for (let i = 0; i < days.length; i += 1) {
    run = i > 0 && days[i] - days[i - 1] === 1 ? run + 1 : 1;
    if (run > bestStreak) bestStreak = run;
  }

  // 월별 최다 활동일
  const monthCounts = new Map<string, number>();
  for (const date of dayActs.keys()) {
    const ym = date.slice(0, 7);
    monthCounts.set(ym, (monthCounts.get(ym) ?? 0) + 1);
  }
  const bestMonthDays = monthCounts.size ? Math.max(...monthCounts.values()) : 0;

  // 주별 최다 종목 (7일 버킷)
  const weekActs = new Map<number, Set<ActivityKey>>();
  for (const [date, set] of dayActs) {
    const bucket = Math.floor(epochDay(date) / 7);
    let w = weekActs.get(bucket);
    if (!w) {
      w = new Set();
      weekActs.set(bucket, w);
    }
    for (const act of set) w.add(act);
  }
  let maxWeekVariety = 0;
  for (const w of weekActs.values()) if (w.size > maxWeekVariety) maxWeekVariety = w.size;

  const triedActivities = ACTIVITY_KEYS.filter((k) => sessionsByActivity[k] > 0).length;

  return {
    totalSessions: dayActs.size,
    sessionsByActivity,
    distanceByActivity,
    durationByActivity,
    maxSingle,
    maxSingleDurationByActivity,
    totalDistance,
    totalDuration,
    uniqueMountains: mountains.size,
    bestStreak,
    moodDays,
    greatDays,
    diaryEntries,
    bestMonthDays,
    triedActivities,
    maxDayVariety,
    maxWeekVariety
  };
}

/* ------------------------------------------------------------------ *
 * 시리즈 → 뱃지 생성 (초반 촘촘, 뒤로 갈수록 넓게)
 * ------------------------------------------------------------------ */
export type BadgeTier = "bronze" | "silver" | "gold" | "diamond";

export type BadgeSeries = {
  id: string;
  group: string;
  emoji: string;
  name: string;
  unit: string;
  metric: (s: AchievementStats) => number;
  thresholds: number[];
  titleFor: (t: number) => string;
};

// 연속 구간 [from, to, step]들을 오름차순 유니크 배열로
function ladder(segments: Array<[number, number, number]>): number[] {
  const out: number[] = [];
  for (const [from, to, step] of segments) {
    for (let v = from; v <= to; v += step) out.push(v);
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

// 초반 1단위(1~50) → 5 → 10 → 50 → 100 단위로 벌어지는 표준 사다리
function bigLadder(max: number): number[] {
  return ladder([
    [1, Math.min(50, max), 1],
    [55, Math.min(100, max), 5],
    [110, Math.min(300, max), 10],
    [350, Math.min(1000, max), 50],
    [1100, max, 100]
  ]);
}

function streakLadder(max: number): number[] {
  return ladder([
    [2, Math.min(50, max), 1],
    [55, Math.min(100, max), 5],
    [110, max, 10]
  ]);
}

export const GROUP_ORDER = ["누적 횟수", "거리", "시간", "꾸준함", "탐험", "한 방 기록", "마음", "다양성"];

export const SERIES: BadgeSeries[] = [
  // 누적 횟수
  {
    id: "total_sessions",
    group: "누적 횟수",
    emoji: "🏆",
    name: "총 운동",
    unit: "회",
    metric: (s) => s.totalSessions,
    thresholds: bigLadder(1000),
    titleFor: (t) => `총 운동 ${t}회`
  },
  ...ACTIVITY_KEYS.map((k) => ({
    id: `sess_${k}`,
    group: "누적 횟수",
    emoji: ACT_META[k].emoji,
    name: `${ACT_META[k].name} 횟수`,
    unit: "회",
    metric: (s: AchievementStats) => s.sessionsByActivity[k],
    thresholds: bigLadder(500),
    titleFor: (t: number) => `${ACT_META[k].name} ${t}회`
  })),
  // 거리
  {
    id: "dist_run",
    group: "거리",
    emoji: "👟",
    name: "러닝 거리",
    unit: "km",
    metric: (s) => s.distanceByActivity.run,
    thresholds: bigLadder(3000),
    titleFor: (t) => `러닝 누적 ${t}km`
  },
  {
    id: "dist_bike",
    group: "거리",
    emoji: "🚴",
    name: "자전거 거리",
    unit: "km",
    metric: (s) => s.distanceByActivity.bike,
    thresholds: bigLadder(5000),
    titleFor: (t) => `자전거 누적 ${t}km`
  },
  {
    id: "dist_total",
    group: "거리",
    emoji: "🌍",
    name: "총 거리",
    unit: "km",
    metric: (s) => s.totalDistance,
    thresholds: bigLadder(8000),
    titleFor: (t) => `총 누적 ${t}km`
  },
  // 시간
  ...ACTIVITY_KEYS.map((k) => ({
    id: `dur_${k}`,
    group: "시간",
    emoji: ACT_META[k].emoji,
    name: `${ACT_META[k].name} 시간`,
    unit: "분",
    metric: (s: AchievementStats) => s.durationByActivity[k],
    thresholds: bigLadder(k === "hike" ? 12000 : 6000),
    titleFor: (t: number) => `${ACT_META[k].name} 누적 ${t}분`
  })),
  {
    id: "dur_total",
    group: "시간",
    emoji: "⏱️",
    name: "총 운동 시간",
    unit: "분",
    metric: (s) => s.totalDuration,
    thresholds: bigLadder(30000),
    titleFor: (t) => `총 ${t}분 운동`
  },
  // 꾸준함
  {
    id: "streak",
    group: "꾸준함",
    emoji: "🔥",
    name: "연속 기록",
    unit: "일",
    metric: (s) => s.bestStreak,
    thresholds: streakLadder(366),
    titleFor: (t) => `${t}일 연속 기록`
  },
  {
    id: "month_days",
    group: "꾸준함",
    emoji: "📅",
    name: "한 달 기록",
    unit: "일",
    metric: (s) => s.bestMonthDays,
    thresholds: ladder([[1, 31, 1]]),
    titleFor: (t) => `한 달에 ${t}일 기록`
  },
  // 탐험
  {
    id: "mountains",
    group: "탐험",
    emoji: "🏔️",
    name: "산 정복",
    unit: "곳",
    metric: (s) => s.uniqueMountains,
    thresholds: bigLadder(100),
    titleFor: (t) => `서로 다른 산 ${t}곳`
  },
  // 한 방 기록
  {
    id: "single_run",
    group: "한 방 기록",
    emoji: "⚡",
    name: "최고 러닝 거리",
    unit: "km",
    metric: (s) => s.maxSingle.run,
    thresholds: ladder([[1, 42, 1]]),
    titleFor: (t) => `한 번에 ${t}km 러닝`
  },
  {
    id: "single_bike",
    group: "한 방 기록",
    emoji: "⚡",
    name: "최고 자전거 거리",
    unit: "km",
    metric: (s) => s.maxSingle.bike,
    thresholds: bigLadder(200),
    titleFor: (t) => `한 번에 ${t}km 라이딩`
  },
  ...ACTIVITY_KEYS.map((k) => ({
    id: `sdur_${k}`,
    group: "한 방 기록",
    emoji: ACT_META[k].emoji,
    name: `최장 ${ACT_META[k].name} 시간`,
    unit: "분",
    metric: (s: AchievementStats) => s.maxSingleDurationByActivity[k],
    thresholds: bigLadder(600),
    titleFor: (t: number) => `한 번에 ${ACT_META[k].name} ${t}분`
  })),
  // 마음
  {
    id: "diary",
    group: "마음",
    emoji: "📔",
    name: "일기",
    unit: "편",
    metric: (s) => s.diaryEntries,
    thresholds: bigLadder(500),
    titleFor: (t) => `일기 ${t}편`
  },
  {
    id: "mood",
    group: "마음",
    emoji: "🙂",
    name: "기분 기록",
    unit: "일",
    metric: (s) => s.moodDays,
    thresholds: bigLadder(500),
    titleFor: (t) => `기분 ${t}일 기록`
  },
  {
    id: "great",
    group: "마음",
    emoji: "😄",
    name: "최고의 날",
    unit: "일",
    metric: (s) => s.greatDays,
    thresholds: bigLadder(366),
    titleFor: (t) => `'최고' 기분 ${t}번`
  },
  // 다양성
  {
    id: "variety_day",
    group: "다양성",
    emoji: "🌈",
    name: "하루 다종목",
    unit: "종목",
    metric: (s) => s.maxDayVariety,
    thresholds: ladder([[2, 5, 1]]),
    titleFor: (t) => `하루 ${t}종목`
  },
  {
    id: "variety_week",
    group: "다양성",
    emoji: "🌈",
    name: "한 주 다종목",
    unit: "종목",
    metric: (s) => s.maxWeekVariety,
    thresholds: ladder([[2, 5, 1]]),
    titleFor: (t) => `한 주 ${t}종목`
  },
  {
    id: "tried",
    group: "다양성",
    emoji: "🎯",
    name: "종목 경험",
    unit: "종목",
    metric: (s) => s.triedActivities,
    thresholds: ladder([[1, 5, 1]]),
    titleFor: (t) => `${t}종목 경험`
  }
];

function tierByPos(idx: number, len: number): BadgeTier {
  const r = (idx + 1) / len;
  if (r <= 0.25) return "bronze";
  if (r <= 0.55) return "silver";
  if (r <= 0.85) return "gold";
  return "diamond";
}

export type Badge = {
  id: string;
  seriesId: string;
  group: string;
  emoji: string;
  title: string;
  desc: string;
  tier: BadgeTier;
  target: number;
  progress: (s: AchievementStats) => number;
};

export const BADGES: Badge[] = SERIES.flatMap((series) =>
  series.thresholds.map((t, i) => ({
    id: `${series.id}@${t}`,
    seriesId: series.id,
    group: series.group,
    emoji: series.emoji,
    title: series.titleFor(t),
    desc: series.titleFor(t),
    tier: tierByPos(i, series.thresholds.length),
    target: t,
    progress: series.metric
  }))
);

export type EvaluatedBadge = { badge: Badge; current: number; earned: boolean };

export function evaluateBadges(stats: AchievementStats): EvaluatedBadge[] {
  return BADGES.map((badge) => {
    const raw = badge.progress(stats);
    return { badge, current: Math.min(raw, badge.target), earned: raw >= badge.target };
  });
}

export function earnedCount(evs: EvaluatedBadge[]): number {
  return evs.filter((e) => e.earned).length;
}

export function newlyEarned(evs: EvaluatedBadge[], seen: string[]): Badge[] {
  const seenSet = new Set(seen);
  return evs.filter((e) => e.earned && !seenSet.has(e.badge.id)).map((e) => e.badge);
}

// 시리즈 단위 진행(카드용) — 레벨=달성 단계 수, 다음 목표
export type SeriesProgress = {
  series: BadgeSeries;
  value: number;
  level: number;
  total: number;
  nextThreshold: number | null;
  earnedIds: string[];
};

export function evaluateSeries(stats: AchievementStats): SeriesProgress[] {
  return SERIES.map((series) => {
    const value = series.metric(stats);
    const earnedIds: string[] = [];
    let level = 0;
    for (const t of series.thresholds) {
      if (value >= t) {
        level += 1;
        earnedIds.push(`${series.id}@${t}`);
      }
    }
    const nextThreshold = series.thresholds.find((t) => value < t) ?? null;
    return { series, value, level, total: series.thresholds.length, nextThreshold, earnedIds };
  });
}

export const BADGES_SEEN_KEY = "running-alarm:badges-seen:v1";

export function loadSeen(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(BADGES_SEEN_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function saveSeen(ids: string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(BADGES_SEEN_KEY, JSON.stringify(ids));
  } catch {
    // 무시
  }
}
