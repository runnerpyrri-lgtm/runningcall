// 활동별 기록 저장·마이그레이션·목표·정규화 테스트
import { describe, it, expect } from "vitest";
import {
  emptyLog,
  migrateLog,
  toggleDay,
  normalizeLog,
  normalizeGoals,
  DEFAULT_GOALS,
  recordButtonLabel
} from "@/lib/activity-record";

describe("activity-record", () => {
  it("빈 로그는 5개 활동 배열", () => {
    const log = emptyLog();
    expect(Object.keys(log).sort()).toEqual(["bike", "dog", "hike", "run", "walk"]);
    expect(log.run).toEqual([]);
  });

  it("기존 runlog를 run으로 마이그레이션한다", () => {
    const log = migrateLog(["2026-01-01", "2026-01-02"], null);
    expect(log.run).toEqual(["2026-01-01", "2026-01-02"]);
    expect(log.walk).toEqual([]);
  });

  it("신규 로그가 이미 있으면 마이그레이션하지 않는다 (데이터 보존)", () => {
    const existing = { ...emptyLog(), walk: ["2026-02-02"] };
    const log = migrateLog(["2026-01-01"], existing);
    expect(log).toEqual(existing);
  });

  it("toggleDay는 해당 활동만 토글하고 다른 활동은 그대로", () => {
    let log = emptyLog();
    log = toggleDay(log, "hike", "2026-03-03");
    expect(log.hike).toEqual(["2026-03-03"]);
    expect(log.run).toEqual([]);
    log = toggleDay(log, "hike", "2026-03-03");
    expect(log.hike).toEqual([]);
  });

  it("normalizeLog는 누락 키를 보강하고 잘못된 값을 거른다", () => {
    const log = normalizeLog({ run: ["2026-01-01", 5, null], walk: "nope" });
    expect(log.run).toEqual(["2026-01-01"]);
    expect(log.walk).toEqual([]);
    expect(log.hike).toEqual([]);
  });

  it("활동별 기본 목표 — 걷기 주5·애견 주7·러닝 주3·등산 월2·자전거 주2", () => {
    expect(DEFAULT_GOALS.walk).toEqual({ count: 5, period: "week" });
    expect(DEFAULT_GOALS.dog).toEqual({ count: 7, period: "week" });
    expect(DEFAULT_GOALS.run).toEqual({ count: 3, period: "week" });
    expect(DEFAULT_GOALS.hike).toEqual({ count: 2, period: "month" });
    expect(DEFAULT_GOALS.bike).toEqual({ count: 2, period: "week" });
  });

  it("normalizeGoals는 잘못된 값에 기본값을 쓴다", () => {
    const goals = normalizeGoals({ walk: { count: 3, period: "week" }, dog: { count: 0 }, run: "bad" });
    expect(goals.walk).toEqual({ count: 3, period: "week" });
    expect(goals.dog).toEqual(DEFAULT_GOALS.dog);
    expect(goals.run).toEqual(DEFAULT_GOALS.run);
  });

  it("기록 버튼 문구는 활동별로 다르다", () => {
    expect(recordButtonLabel("dog")).toContain("산책");
    expect(recordButtonLabel("hike")).toContain("산행");
    expect(recordButtonLabel("run")).toContain("뛰");
  });
});
