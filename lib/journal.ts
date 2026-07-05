// 운동 일지 저장 구조 — 날짜별 활동 체크 + 한 줄 메모 (activity-log와 별개로 캘린더/메모 뷰 제공)
import type { ActivityKey } from "@/lib/activity";

export type JournalEntry = { activities: ActivityKey[]; note: string };
export type Journal = Record<string, JournalEntry>;

export const JOURNAL_KEY = "running-alarm:journal:v1";

const VALID_ACTIVITIES: ActivityKey[] = ["walk", "dog", "run", "hike", "bike"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function emptyJournal(): Journal {
  return {};
}

export function normalizeJournal(value: unknown): Journal {
  const out: Journal = {};
  if (value && typeof value === "object") {
    for (const [date, raw] of Object.entries(value as Record<string, unknown>)) {
      if (!DATE_RE.test(date)) continue;
      if (!raw || typeof raw !== "object") continue;
      const activities = (raw as { activities?: unknown }).activities;
      const note = (raw as { note?: unknown }).note;
      out[date] = {
        activities: Array.isArray(activities)
          ? activities.filter((a): a is ActivityKey => VALID_ACTIVITIES.includes(a as ActivityKey))
          : [],
        note: typeof note === "string" ? note : ""
      };
    }
  }
  return out;
}

export function setEntry(journal: Journal, date: string, entry: JournalEntry): Journal {
  return { ...journal, [date]: entry };
}

export function toggleJournalActivity(journal: Journal, date: string, activity: ActivityKey): Journal {
  const current = journal[date] ?? { activities: [], note: "" };
  const has = current.activities.includes(activity);
  const activities = has ? current.activities.filter((a) => a !== activity) : [...current.activities, activity];
  return setEntry(journal, date, { ...current, activities });
}

export function setNote(journal: Journal, date: string, note: string): Journal {
  const current = journal[date] ?? { activities: [], note: "" };
  return setEntry(journal, date, { ...current, note });
}

export function loadJournal(): Journal {
  if (typeof window === "undefined") return emptyJournal();
  try {
    const raw = window.localStorage.getItem(JOURNAL_KEY);
    return raw ? normalizeJournal(JSON.parse(raw)) : emptyJournal();
  } catch {
    return emptyJournal();
  }
}

export function saveJournal(journal: Journal): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(JOURNAL_KEY, JSON.stringify(journal));
  } catch {
    // quota 등 실패는 조용히 무시
  }
}
