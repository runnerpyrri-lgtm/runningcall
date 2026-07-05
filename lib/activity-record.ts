// 활동별 운동 기록 저장 구조·마이그레이션·목표 (localStorage에 안전하게 유지)
import type { ActivityKey } from "@/lib/activity";

export type ActivityLog = Record<ActivityKey, string[]>;
export type GoalPeriod = "week" | "month";
export type ActivityGoal = { count: number; period: GoalPeriod };

export const LOG_KEY = "running-alarm:activity-log:v1";
export const GOALS_KEY = "running-alarm:activity-goals:v1";
export const OLD_LOG_KEY = "running-alarm:runlog";
export const OLD_GOAL_KEY = "running-alarm:goal";

const ACTIVITY_KEYS: ActivityKey[] = ["walk", "dog", "run", "hike", "bike"];

export function emptyLog(): ActivityLog {
  return { walk: [], dog: [], run: [], hike: [], bike: [] };
}

// 저장된 임의 JSON을 안전한 ActivityLog로 정규화 (누락 키 보강, 잘못된 값 무시)
export function normalizeLog(value: unknown): ActivityLog {
  const log = emptyLog();
  if (value && typeof value === "object") {
    for (const key of ACTIVITY_KEYS) {
      const arr = (value as Record<string, unknown>)[key];
      if (Array.isArray(arr)) {
        log[key] = arr.filter((d): d is string => typeof d === "string");
      }
    }
  }
  return log;
}

// 기존 러닝 로그(running-alarm:runlog)를 run으로 옮긴다. 신규 로그가 이미 있으면 유지.
export function migrateLog(oldRunlog: string[] | null, existingNew: ActivityLog | null): ActivityLog {
  if (existingNew) return existingNew;
  const log = emptyLog();
  if (oldRunlog && Array.isArray(oldRunlog)) {
    log.run = oldRunlog.filter((d) => typeof d === "string");
  }
  return log;
}

export function toggleDay(log: ActivityLog, activity: ActivityKey, date: string): ActivityLog {
  const days = log[activity];
  const next = days.includes(date) ? days.filter((d) => d !== date) : [...days, date];
  return { ...log, [activity]: next };
}

export const DEFAULT_GOALS: Record<ActivityKey, ActivityGoal> = {
  walk: { count: 5, period: "week" },
  dog: { count: 7, period: "week" },
  run: { count: 3, period: "week" },
  hike: { count: 2, period: "month" },
  bike: { count: 2, period: "week" }
};

export function normalizeGoals(value: unknown): Record<ActivityKey, ActivityGoal> {
  const goals = { ...DEFAULT_GOALS };
  if (value && typeof value === "object") {
    for (const key of ACTIVITY_KEYS) {
      const g = (value as Record<string, unknown>)[key];
      if (g && typeof g === "object") {
        const count = Number((g as { count?: unknown }).count);
        const period = (g as { period?: unknown }).period;
        if (Number.isFinite(count) && count >= 1 && (period === "week" || period === "month")) {
          goals[key] = { count, period };
        }
      }
    }
  }
  return goals;
}

export function recordButtonLabel(activity: ActivityKey): string {
  switch (activity) {
    case "walk":
      return "오늘 걸었어요 🚶";
    case "dog":
      return "오늘 산책했어요 🐕";
    case "run":
      return "오늘 뛰었어요 🏃";
    case "hike":
      return "오늘 산행했어요 ⛰️";
    case "bike":
      return "오늘 탔어요 🚴";
  }
}

/* ----- localStorage 안전 래퍼 (SSR·quota·손상 데이터 방어) ----- */

// 신규 키가 없으면 기존 runlog에서 1회 마이그레이션한 뒤 반환
export function loadLog(): ActivityLog {
  if (typeof window === "undefined") return emptyLog();
  try {
    const raw = window.localStorage.getItem(LOG_KEY);
    if (raw) return normalizeLog(JSON.parse(raw));
    const oldRaw = window.localStorage.getItem(OLD_LOG_KEY);
    const old = oldRaw ? (JSON.parse(oldRaw) as unknown) : null;
    const migrated = migrateLog(Array.isArray(old) ? (old as string[]) : null, null);
    window.localStorage.setItem(LOG_KEY, JSON.stringify(migrated));
    return migrated;
  } catch {
    return emptyLog();
  }
}

export function saveLog(log: ActivityLog): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOG_KEY, JSON.stringify(log));
  } catch {
    // quota 등 실패는 조용히 무시 (다음 저장 때 재시도)
  }
}

export function loadGoals(): Record<ActivityKey, ActivityGoal> {
  if (typeof window === "undefined") return { ...DEFAULT_GOALS };
  try {
    const raw = window.localStorage.getItem(GOALS_KEY);
    if (raw) return normalizeGoals(JSON.parse(raw));
    // 기존 단일 목표(running-alarm:goal)가 있으면 run 주간 목표로 승계
    const oldGoal = Number(window.localStorage.getItem(OLD_GOAL_KEY));
    const goals = { ...DEFAULT_GOALS };
    if (Number.isFinite(oldGoal) && oldGoal >= 1) goals.run = { count: oldGoal, period: "week" };
    return goals;
  } catch {
    return { ...DEFAULT_GOALS };
  }
}

export function saveGoals(goals: Record<ActivityKey, ActivityGoal>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GOALS_KEY, JSON.stringify(goals));
  } catch {
    // 무시
  }
}
