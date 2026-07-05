// 도전과제 시리즈 생성기 — 개수·초반 밀도·통계·시리즈 평가 테스트
import { describe, it, expect } from "vitest";
import {
  computeStats,
  evaluateBadges,
  evaluateSeries,
  newlyEarned,
  earnedCount,
  BADGES,
  SERIES
} from "@/lib/achievements";
import { emptyJournal, type Journal } from "@/lib/journal";
import { emptyLog, type ActivityLog } from "@/lib/activity-record";

function log(partial: Partial<ActivityLog>): ActivityLog {
  return { ...emptyLog(), ...partial };
}

describe("뱃지 시리즈 생성", () => {
  it("뱃지가 3000개 이상", () => {
    expect(BADGES.length).toBeGreaterThanOrEqual(3000);
  });

  it("id 중복 없음", () => {
    const ids = BADGES.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("주요 시리즈는 1·2·3·4·5로 촘촘하게 시작(초반 포기 방지)", () => {
    for (const id of ["total_sessions", "dist_run", "diary"]) {
      const s = SERIES.find((x) => x.id === id)!;
      expect(s.thresholds.slice(0, 5)).toEqual([1, 2, 3, 4, 5]);
    }
  });
});

describe("computeStats 확장", () => {
  it("활동별 시간·총 거리·총 시간·한 번 최장", () => {
    const journal: Journal = {
      "2026-03-01": { activities: [{ key: "run", distanceKm: 5, durationMin: 30 }], note: "" },
      "2026-03-02": { activities: [{ key: "run", distanceKm: 8, durationMin: 50 }, { key: "bike", distanceKm: 20 }], note: "" }
    };
    const s = computeStats(journal, emptyLog());
    expect(s.durationByActivity.run).toBe(80);
    expect(s.maxSingleDurationByActivity.run).toBe(50);
    expect(s.totalDistance).toBe(33); // 5+8+20
    expect(s.totalDuration).toBe(80);
  });
});

describe("evaluateSeries", () => {
  it("러닝 14km면 dist_run 레벨 14, 다음 목표 15", () => {
    const journal: Journal = {
      "2026-03-01": { activities: [{ key: "run", distanceKm: 14 }], note: "" }
    };
    const sp = evaluateSeries(computeStats(journal, emptyLog())).find((x) => x.series.id === "dist_run")!;
    expect(sp.value).toBe(14);
    expect(sp.level).toBe(14);
    expect(sp.nextThreshold).toBe(15);
  });

  it("최고 단계 도달 시 다음 목표는 null(완주)", () => {
    const l = log({ run: ["a"], walk: ["a"], dog: ["a"], hike: ["a"], bike: ["a"] });
    // 위 로그는 날짜가 아니지만 tried 계산엔 activity 존재만 봄 → 5종목 경험
    const sp = evaluateSeries(computeStats(emptyJournal(), l)).find((x) => x.series.id === "tried")!;
    expect(sp.value).toBe(5);
    expect(sp.nextThreshold).toBeNull();
    expect(sp.level).toBe(sp.total);
  });
});

describe("evaluateBadges / newlyEarned", () => {
  it("빈 데이터는 달성 0", () => {
    expect(earnedCount(evaluateBadges(computeStats(emptyJournal(), emptyLog())))).toBe(0);
  });

  it("러닝 5km면 관련 초반 뱃지들이 달성되고 seen으로 걸러진다", () => {
    const journal: Journal = { "2026-03-01": { activities: [{ key: "run", distanceKm: 5 }], note: "" } };
    const evs = evaluateBadges(computeStats(journal, emptyLog()));
    const fresh = newlyEarned(evs, []);
    expect(fresh.some((b) => b.id === "dist_run@5")).toBe(true);
    expect(fresh.some((b) => b.id === "single_run@5")).toBe(true);
    const afterSeen = newlyEarned(evs, ["dist_run@5"]);
    expect(afterSeen.some((b) => b.id === "dist_run@5")).toBe(false);
  });
});
