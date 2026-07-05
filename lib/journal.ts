// 운동 일지 저장 구조 — 날짜별 활동 기록(거리·시간·장소) + 기분 + 자유 일기 (다이어리 뷰)
import type { ActivityKey } from "@/lib/activity";

export type MoodKey = "great" | "good" | "soso" | "tired" | "hard";

export const MOODS: Array<{ key: MoodKey; emoji: string; label: string }> = [
  { key: "great", emoji: "😄", label: "최고" },
  { key: "good", emoji: "🙂", label: "좋음" },
  { key: "soso", emoji: "😐", label: "보통" },
  { key: "tired", emoji: "😪", label: "지침" },
  { key: "hard", emoji: "😣", label: "힘듦" }
];

// 활동 하나의 가벼운 기록 — 필드는 전부 선택 입력
export type ActivityRecord = {
  key: ActivityKey;
  distanceKm?: number; // run, bike
  durationMin?: number; // 전 활동
  place?: string; // hike (다녀온 산)
};

export type JournalEntry = { activities: ActivityRecord[]; mood?: MoodKey; note: string };
export type Journal = Record<string, JournalEntry>;

export const JOURNAL_KEY = "running-alarm:journal:v2";
const LEGACY_KEY = "running-alarm:journal:v1";

// 활동별 일지 입력 필드 정의 (편집기에서 활동 켜면 노출)
export type JournalField = {
  key: "distanceKm" | "durationMin" | "place";
  label: string;
  kind: "number" | "text";
  unit?: string;
  placeholder?: string;
};

export const ACTIVITY_JOURNAL_FIELDS: Record<ActivityKey, JournalField[]> = {
  walk: [{ key: "durationMin", label: "시간", kind: "number", unit: "분" }],
  dog: [{ key: "durationMin", label: "시간", kind: "number", unit: "분" }],
  run: [
    { key: "distanceKm", label: "거리", kind: "number", unit: "km" },
    { key: "durationMin", label: "시간", kind: "number", unit: "분" }
  ],
  hike: [
    { key: "place", label: "다녀온 산", kind: "text", placeholder: "예: 북한산" },
    { key: "durationMin", label: "시간", kind: "number", unit: "분" }
  ],
  bike: [
    { key: "distanceKm", label: "거리", kind: "number", unit: "km" },
    { key: "durationMin", label: "시간", kind: "number", unit: "분" }
  ]
};

const VALID_ACTIVITIES: ActivityKey[] = ["walk", "dog", "run", "hike", "bike"];
const VALID_MOODS: MoodKey[] = ["great", "good", "soso", "tired", "hard"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PLACE_MAX = 40;

export function emptyJournal(): Journal {
  return {};
}

export function emptyEntry(): JournalEntry {
  return { activities: [], note: "" };
}

// 0 이상 유한 숫자만 통과 (소수 1자리 반올림)
function sanitizeNumber(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.round(n * 10) / 10;
}

// 활동 하나를 정규화 — 문자열(v1) 또는 객체(v2) 모두 수용
function normalizeActivity(raw: unknown): ActivityRecord | null {
  if (typeof raw === "string") {
    return VALID_ACTIVITIES.includes(raw as ActivityKey) ? { key: raw as ActivityKey } : null;
  }
  if (!raw || typeof raw !== "object") return null;
  const key = (raw as { key?: unknown }).key;
  if (!VALID_ACTIVITIES.includes(key as ActivityKey)) return null;
  const rec: ActivityRecord = { key: key as ActivityKey };
  const distanceKm = sanitizeNumber((raw as { distanceKm?: unknown }).distanceKm);
  const durationMin = sanitizeNumber((raw as { durationMin?: unknown }).durationMin);
  const place = (raw as { place?: unknown }).place;
  if (distanceKm !== undefined) rec.distanceKm = distanceKm;
  if (durationMin !== undefined) rec.durationMin = durationMin;
  if (typeof place === "string" && place.trim()) rec.place = place.trim().slice(0, PLACE_MAX);
  return rec;
}

export function normalizeJournal(value: unknown): Journal {
  const out: Journal = {};
  if (value && typeof value === "object") {
    for (const [date, raw] of Object.entries(value as Record<string, unknown>)) {
      if (!DATE_RE.test(date)) continue;
      if (!raw || typeof raw !== "object") continue;
      const activities = (raw as { activities?: unknown }).activities;
      const note = (raw as { note?: unknown }).note;
      const mood = (raw as { mood?: unknown }).mood;
      const entry: JournalEntry = {
        activities: Array.isArray(activities)
          ? activities.map(normalizeActivity).filter((a): a is ActivityRecord => a !== null)
          : [],
        note: typeof note === "string" ? note : ""
      };
      if (VALID_MOODS.includes(mood as MoodKey)) entry.mood = mood as MoodKey;
      out[date] = entry;
    }
  }
  return out;
}

export function setEntry(journal: Journal, date: string, entry: JournalEntry): Journal {
  return { ...journal, [date]: entry };
}

export function deleteEntry(journal: Journal, date: string): Journal {
  if (!(date in journal)) return journal;
  const next = { ...journal };
  delete next[date];
  return next;
}

export function isEntryEmpty(entry: JournalEntry): boolean {
  return entry.activities.length === 0 && !entry.note.trim() && !entry.mood;
}

export function loadJournal(): Journal {
  if (typeof window === "undefined") return emptyJournal();
  try {
    const raw = window.localStorage.getItem(JOURNAL_KEY);
    if (raw) return normalizeJournal(JSON.parse(raw));
    // v2가 없으면 기존 v1에서 1회 마이그레이션
    const legacy = window.localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const migrated = normalizeJournal(JSON.parse(legacy));
      saveJournal(migrated);
      return migrated;
    }
    return emptyJournal();
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
