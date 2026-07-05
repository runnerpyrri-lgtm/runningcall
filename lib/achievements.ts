// 도전과제 달성 엔진 — 운동 일지+기록에서 통계·36개 뱃지를 소급 판정 (순수 함수)
import type { ActivityKey } from "@/lib/activity";
import type { Journal } from "@/lib/journal";
import type { ActivityLog } from "@/lib/activity-record";

const ACTIVITY_KEYS: ActivityKey[] = ["walk", "dog", "run", "hike", "bike"];

export type AchievementStats = {
  totalSessions: number;
  sessionsByActivity: Record<ActivityKey, number>;
  distanceByActivity: Record<ActivityKey, number>;
  maxSingle: Record<ActivityKey, number>;
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
  const distanceByActivity = zeroByActivity();
  const maxSingle = zeroByActivity();
  let maxDayVariety = 0;
  for (const set of dayActs.values()) {
    for (const act of set) sessionsByActivity[act] += 1;
    if (set.size > maxDayVariety) maxDayVariety = set.size;
  }

  // 거리·산·기분·일기는 일지에서만
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
      if (a.key === "hike" && a.place) mountains.add(a.place.trim().toLowerCase());
    }
    if (entry.mood) {
      moodDays += 1;
      if (entry.mood === "great") greatDays += 1;
    }
    if (entry.note.trim()) diaryEntries += 1;
  }

  // 연속일 (활동한 날짜 기준 최장 연속)
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
    maxSingle,
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

export type BadgeTier = "bronze" | "silver" | "gold" | "diamond" | "special";

export type Badge = {
  id: string;
  group: string;
  emoji: string;
  title: string;
  desc: string;
  tier: BadgeTier;
  target: number;
  progress: (s: AchievementStats) => number;
};

export const BADGE_GROUP_LABELS: Record<string, string> = {
  first: "첫 도전",
  streak: "연속 기록",
  total: "누적 횟수",
  run: "러닝",
  single: "한 방 기록",
  bike: "라이딩",
  mountain: "산 정복",
  variety: "다양성",
  monthly: "월간 꾸준함",
  heart: "마음"
};

export const BADGE_GROUP_ORDER = [
  "first",
  "streak",
  "total",
  "run",
  "single",
  "bike",
  "mountain",
  "variety",
  "monthly",
  "heart"
];

export const BADGES: Badge[] = [
  // 첫 도전
  { id: "first_any", group: "first", emoji: "🌱", title: "첫 발걸음", desc: "아무 활동이나 처음 기록", tier: "special", target: 1, progress: (s) => s.totalSessions },
  { id: "first_walk", group: "first", emoji: "🚶", title: "첫 산책길", desc: "걷기 첫 기록", tier: "special", target: 1, progress: (s) => s.sessionsByActivity.walk },
  { id: "first_dog", group: "first", emoji: "🐕", title: "댕댕이와 처음", desc: "애견산책 첫 기록", tier: "special", target: 1, progress: (s) => s.sessionsByActivity.dog },
  { id: "first_run", group: "first", emoji: "🏃", title: "첫 러닝", desc: "러닝 첫 기록", tier: "special", target: 1, progress: (s) => s.sessionsByActivity.run },
  { id: "first_hike", group: "first", emoji: "⛰️", title: "첫 산행", desc: "등산 첫 기록", tier: "special", target: 1, progress: (s) => s.sessionsByActivity.hike },
  { id: "first_bike", group: "first", emoji: "🚴", title: "첫 라이딩", desc: "자전거 첫 기록", tier: "special", target: 1, progress: (s) => s.sessionsByActivity.bike },
  { id: "first_diary", group: "first", emoji: "✍️", title: "첫 일기", desc: "일기 첫 작성", tier: "special", target: 1, progress: (s) => s.diaryEntries },

  // 연속
  { id: "streak_3", group: "streak", emoji: "🔥", title: "3일 연속", desc: "3일 연속 기록", tier: "bronze", target: 3, progress: (s) => s.bestStreak },
  { id: "streak_7", group: "streak", emoji: "🔥", title: "일주일 개근", desc: "7일 연속 기록", tier: "silver", target: 7, progress: (s) => s.bestStreak },
  { id: "streak_14", group: "streak", emoji: "🔥", title: "2주 연속", desc: "14일 연속 기록", tier: "gold", target: 14, progress: (s) => s.bestStreak },
  { id: "streak_30", group: "streak", emoji: "🔥", title: "한 달 개근", desc: "30일 연속 기록", tier: "diamond", target: 30, progress: (s) => s.bestStreak },

  // 누적 횟수
  { id: "total_10", group: "total", emoji: "🥉", title: "운동 10회", desc: "총 10일 운동", tier: "bronze", target: 10, progress: (s) => s.totalSessions },
  { id: "total_50", group: "total", emoji: "🥈", title: "운동 50회", desc: "총 50일 운동", tier: "silver", target: 50, progress: (s) => s.totalSessions },
  { id: "total_100", group: "total", emoji: "🥇", title: "운동 100회", desc: "총 100일 운동", tier: "gold", target: 100, progress: (s) => s.totalSessions },
  { id: "total_200", group: "total", emoji: "💎", title: "운동 200회", desc: "총 200일 운동", tier: "diamond", target: 200, progress: (s) => s.totalSessions },

  // 러닝
  { id: "run_dist_10", group: "run", emoji: "👟", title: "러닝 10km", desc: "러닝 누적 10km", tier: "bronze", target: 10, progress: (s) => s.distanceByActivity.run },
  { id: "run_dist_50", group: "run", emoji: "👟", title: "러닝 50km", desc: "러닝 누적 50km", tier: "silver", target: 50, progress: (s) => s.distanceByActivity.run },
  { id: "run_dist_100", group: "run", emoji: "👟", title: "러닝 100km", desc: "러닝 누적 100km", tier: "gold", target: 100, progress: (s) => s.distanceByActivity.run },
  { id: "run_count_30", group: "run", emoji: "🏃", title: "러닝 30회", desc: "러닝 30일", tier: "silver", target: 30, progress: (s) => s.sessionsByActivity.run },

  // 한 방 기록
  { id: "single_run_5", group: "single", emoji: "⚡", title: "5km 러닝", desc: "한 번에 5km 러닝", tier: "bronze", target: 5, progress: (s) => s.maxSingle.run },
  { id: "single_run_10", group: "single", emoji: "⚡", title: "10km 러닝", desc: "한 번에 10km 러닝", tier: "silver", target: 10, progress: (s) => s.maxSingle.run },
  { id: "single_bike_30", group: "single", emoji: "⚡", title: "30km 라이딩", desc: "한 번에 30km 자전거", tier: "gold", target: 30, progress: (s) => s.maxSingle.bike },

  // 라이딩
  { id: "bike_dist_100", group: "bike", emoji: "🚴", title: "라이딩 100km", desc: "자전거 누적 100km", tier: "silver", target: 100, progress: (s) => s.distanceByActivity.bike },
  { id: "bike_dist_300", group: "bike", emoji: "🚴", title: "라이딩 300km", desc: "자전거 누적 300km", tier: "gold", target: 300, progress: (s) => s.distanceByActivity.bike },

  // 산 정복
  { id: "mtn_3", group: "mountain", emoji: "🏔️", title: "산 3곳", desc: "서로 다른 산 3곳", tier: "bronze", target: 3, progress: (s) => s.uniqueMountains },
  { id: "mtn_5", group: "mountain", emoji: "🏔️", title: "산 5곳", desc: "서로 다른 산 5곳", tier: "silver", target: 5, progress: (s) => s.uniqueMountains },
  { id: "mtn_10", group: "mountain", emoji: "🏔️", title: "산 10곳", desc: "서로 다른 산 10곳", tier: "gold", target: 10, progress: (s) => s.uniqueMountains },

  // 다양성
  { id: "variety_day2", group: "variety", emoji: "🌈", title: "하루 2종목", desc: "하루에 2종목", tier: "bronze", target: 2, progress: (s) => s.maxDayVariety },
  { id: "variety_week3", group: "variety", emoji: "🌈", title: "한 주 3종목", desc: "한 주에 3종목", tier: "silver", target: 3, progress: (s) => s.maxWeekVariety },
  { id: "variety_all5", group: "variety", emoji: "🌈", title: "완전 정복", desc: "5종목 모두 경험", tier: "gold", target: 5, progress: (s) => s.triedActivities },

  // 월간 꾸준함
  { id: "month_10", group: "monthly", emoji: "📅", title: "한 달 10일", desc: "한 달에 10일 기록", tier: "silver", target: 10, progress: (s) => s.bestMonthDays },
  { id: "month_20", group: "monthly", emoji: "📅", title: "한 달 20일", desc: "한 달에 20일 기록", tier: "gold", target: 20, progress: (s) => s.bestMonthDays },

  // 마음
  { id: "great_5", group: "heart", emoji: "😄", title: "최고의 나날", desc: "기분 '최고' 5번", tier: "bronze", target: 5, progress: (s) => s.greatDays },
  { id: "mood_10", group: "heart", emoji: "🙂", title: "마음 기록", desc: "기분 10일 기록", tier: "silver", target: 10, progress: (s) => s.moodDays },
  { id: "diary_10", group: "heart", emoji: "📔", title: "일기 10편", desc: "일기 10편 작성", tier: "silver", target: 10, progress: (s) => s.diaryEntries },
  { id: "diary_30", group: "heart", emoji: "📔", title: "일기 30편", desc: "일기 30편 작성", tier: "gold", target: 30, progress: (s) => s.diaryEntries }
];

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
