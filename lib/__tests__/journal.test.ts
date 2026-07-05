// 운동 일지 v2(활동별 기록+기분+메모) 저장 구조 + v1 마이그레이션 테스트
import { describe, it, expect } from "vitest";
import {
  emptyJournal,
  emptyEntry,
  normalizeJournal,
  setEntry,
  deleteEntry,
  isEntryEmpty,
  type JournalEntry
} from "@/lib/journal";

describe("journal v2", () => {
  it("빈 일지·빈 항목", () => {
    expect(emptyJournal()).toEqual({});
    expect(emptyEntry()).toEqual({ activities: [], note: "" });
  });

  it("setEntry로 활동 기록+기분+메모 저장", () => {
    const entry: JournalEntry = {
      activities: [{ key: "run", distanceKm: 5.2, durationMin: 30 }],
      mood: "great",
      note: "좋았다"
    };
    const j = setEntry(emptyJournal(), "2026-03-01", entry);
    expect(j["2026-03-01"]).toEqual(entry);
  });

  it("등산은 산 이름을 기록한다", () => {
    const j = setEntry(emptyJournal(), "2026-03-02", {
      activities: [{ key: "hike", place: "북한산", durationMin: 180 }],
      note: ""
    });
    expect(j["2026-03-02"].activities[0].place).toBe("북한산");
  });

  it("deleteEntry는 해당 날짜를 제거", () => {
    let j = setEntry(emptyJournal(), "2026-03-03", emptyEntry());
    j = deleteEntry(j, "2026-03-03");
    expect(j["2026-03-03"]).toBeUndefined();
  });

  it("isEntryEmpty는 활동·메모·기분이 전부 없을 때만 true", () => {
    expect(isEntryEmpty({ activities: [], note: "  " })).toBe(true);
    expect(isEntryEmpty({ activities: [], note: "", mood: "good" })).toBe(false);
    expect(isEntryEmpty({ activities: [{ key: "walk" }], note: "" })).toBe(false);
    expect(isEntryEmpty({ activities: [], note: "메모" })).toBe(false);
  });

  it("v1(활동=문자열 배열)을 v2(활동=객체)로 마이그레이션하며 메모 유지", () => {
    const v1 = { "2026-01-01": { activities: ["run", "hike"], note: "옛 메모" } };
    const j = normalizeJournal(v1);
    expect(j["2026-01-01"].activities).toEqual([{ key: "run" }, { key: "hike" }]);
    expect(j["2026-01-01"].note).toBe("옛 메모");
  });

  it("normalize는 손상된 값을 걸러낸다", () => {
    const j = normalizeJournal({
      "2026-01-02": {
        activities: [{ key: "run", distanceKm: -3, durationMin: 20 }, { key: "bad" }, "walk"],
        mood: "invalid",
        note: 5
      }
    });
    // 음수 거리는 버리고 시간은 유지, bad 활동 제거, 문자열 walk는 객체로
    expect(j["2026-01-02"].activities).toEqual([{ key: "run", durationMin: 20 }, { key: "walk" }]);
    expect(j["2026-01-02"].mood).toBeUndefined();
    expect(j["2026-01-02"].note).toBe("");
  });

  it("과도하게 긴 산 이름은 40자로 자른다", () => {
    const long = "산".repeat(60);
    const j = normalizeJournal({ "2026-01-03": { activities: [{ key: "hike", place: long }], note: "" } });
    expect(j["2026-01-03"].activities[0].place?.length).toBe(40);
  });

  it("날짜 형식이 아닌 키는 건너뛴다", () => {
    expect(Object.keys(normalizeJournal({ "not-a-date": { activities: [], note: "" } }))).toEqual([]);
  });
});
