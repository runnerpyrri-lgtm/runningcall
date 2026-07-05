// 도전과제 달성 엔진 — 통계 계산·뱃지 판정·신규 감지 테스트
import { describe, it, expect } from "vitest";
import { computeStats, evaluateBadges, earnedCount, newlyEarned, BADGES } from "@/lib/achievements";
import { emptyJournal, type Journal } from "@/lib/journal";
import { emptyLog, type ActivityLog } from "@/lib/activity-record";

function log(partial: Partial<ActivityLog>): ActivityLog {
  return { ...emptyLog(), ...partial };
}

describe("computeStats", () => {
  it("빈 데이터는 전부 0", () => {
    const s = computeStats(emptyJournal(), emptyLog());
    expect(s.totalSessions).toBe(0);
    expect(s.triedActivities).toBe(0);
    expect(s.bestStreak).toBe(0);
  });

  it("일지+기록탭 날짜를 합집합으로 센다", () => {
    const journal: Journal = { "2026-03-01": { activities: [{ key: "run" }], note: "" } };
    const l = log({ walk: ["2026-03-01", "2026-03-02"] });
    const s = computeStats(journal, l);
    // 3/1은 run+walk, 3/2는 walk → 서로 다른 날 2일
    expect(s.totalSessions).toBe(2);
    expect(s.sessionsByActivity.run).toBe(1);
    expect(s.sessionsByActivity.walk).toBe(2);
    expect(s.maxDayVariety).toBe(2); // 3/1에 run+walk
  });

  it("러닝 누적 거리·한 방 최고·산 unique", () => {
    const journal: Journal = {
      "2026-03-01": { activities: [{ key: "run", distanceKm: 5 }], note: "" },
      "2026-03-02": { activities: [{ key: "run", distanceKm: 8 }, { key: "hike", place: "북한산" }], note: "" },
      "2026-03-03": { activities: [{ key: "hike", place: "관악산" }], note: "" },
      "2026-03-10": { activities: [{ key: "hike", place: "북한산" }], note: "" }
    };
    const s = computeStats(journal, emptyLog());
    expect(s.distanceByActivity.run).toBe(13);
    expect(s.maxSingle.run).toBe(8);
    expect(s.uniqueMountains).toBe(2); // 북한산(중복)·관악산
  });

  it("연속일 최장 계산 (3일 연속)", () => {
    const l = log({ run: ["2026-03-01", "2026-03-02", "2026-03-03", "2026-03-10"] });
    const s = computeStats(emptyJournal(), l);
    expect(s.bestStreak).toBe(3);
  });

  it("한 주 3종목 · 월간 최다일", () => {
    const l = log({
      run: ["2026-03-02"],
      walk: ["2026-03-03"],
      bike: ["2026-03-04"],
      hike: ["2026-04-01", "2026-04-05"]
    });
    const s = computeStats(emptyJournal(), l);
    expect(s.maxWeekVariety).toBeGreaterThanOrEqual(3); // 3/2~3/4 같은 주에 3종목
    expect(s.bestMonthDays).toBe(3); // 3월에 3일
  });

  it("기분·일기 집계", () => {
    const journal: Journal = {
      "2026-03-01": { activities: [{ key: "run" }], mood: "great", note: "좋았다" },
      "2026-03-02": { activities: [{ key: "walk" }], mood: "soso", note: "" }
    };
    const s = computeStats(journal, emptyLog());
    expect(s.moodDays).toBe(2);
    expect(s.greatDays).toBe(1);
    expect(s.diaryEntries).toBe(1);
  });
});

describe("evaluateBadges", () => {
  it("36개 뱃지, current는 target로 클램프", () => {
    const evs = evaluateBadges(computeStats(emptyJournal(), emptyLog()));
    expect(evs.length).toBe(36);
    expect(evs.every((e) => e.current <= e.badge.target)).toBe(true);
    expect(earnedCount(evs)).toBe(0);
  });

  it("첫 러닝·10회 달성 판정", () => {
    const dates = Array.from({ length: 10 }, (_, i) => `2026-03-${String(i + 1).padStart(2, "0")}`);
    const s = computeStats(emptyJournal(), { ...emptyLog(), run: dates });
    const evs = evaluateBadges(s);
    const byId = Object.fromEntries(evs.map((e) => [e.badge.id, e]));
    expect(byId["first_run"].earned).toBe(true);
    expect(byId["total_10"].earned).toBe(true);
    expect(byId["total_50"].earned).toBe(false);
    expect(byId["total_50"].current).toBe(10);
  });
});

describe("newlyEarned", () => {
  it("seen에 없는 달성 뱃지만 반환", () => {
    const s = computeStats(emptyJournal(), { ...emptyLog(), run: ["2026-03-01"] });
    const evs = evaluateBadges(s);
    const already = newlyEarned(evs, []);
    expect(already.some((b) => b.id === "first_run")).toBe(true);
    const afterSeen = newlyEarned(evs, ["first_run", "first_any"]);
    expect(afterSeen.some((b) => b.id === "first_run")).toBe(false);
  });
});

describe("catalog 무결성", () => {
  it("id 중복 없음", () => {
    const ids = BADGES.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
