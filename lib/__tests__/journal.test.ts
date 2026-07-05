// 운동 일지(날짜별 활동+메모) 저장 구조 테스트
import { describe, it, expect } from "vitest";
import { emptyJournal, normalizeJournal, setEntry, toggleJournalActivity, setNote } from "@/lib/journal";

describe("journal", () => {
  it("빈 일지는 빈 객체", () => {
    expect(emptyJournal()).toEqual({});
  });

  it("setEntry로 날짜에 항목을 넣는다", () => {
    let j = emptyJournal();
    j = setEntry(j, "2026-03-01", { activities: ["run"], note: "좋았다" });
    expect(j["2026-03-01"]).toEqual({ activities: ["run"], note: "좋았다" });
  });

  it("toggleJournalActivity는 활동을 추가/제거하고 없던 날짜는 새로 만든다", () => {
    let j = emptyJournal();
    j = toggleJournalActivity(j, "2026-03-02", "hike");
    expect(j["2026-03-02"].activities).toEqual(["hike"]);
    j = toggleJournalActivity(j, "2026-03-02", "hike");
    expect(j["2026-03-02"].activities).toEqual([]);
  });

  it("setNote는 다른 필드를 건드리지 않는다", () => {
    let j = setEntry(emptyJournal(), "2026-03-03", { activities: ["walk"], note: "" });
    j = setNote(j, "2026-03-03", "산책 좋았음");
    expect(j["2026-03-03"]).toEqual({ activities: ["walk"], note: "산책 좋았음" });
  });

  it("normalizeJournal은 손상된 값을 걸러낸다", () => {
    const j = normalizeJournal({ "2026-01-01": { activities: ["run", "bad"], note: 5 }, bad: "x" });
    expect(j["2026-01-01"]).toEqual({ activities: ["run"], note: "" });
    expect(j["bad"]).toBeUndefined();
  });

  it("normalizeJournal은 날짜 형식이 아닌 키를 건너뛴다", () => {
    const j = normalizeJournal({ "not-a-date": { activities: [], note: "" } });
    expect(Object.keys(j)).toEqual([]);
  });
});
