// 분석 동의 기본값과 개인정보 필드 제거가 공급자 연결 여부와 무관하게 유지되는지 검증한다.
import { describe, expect, it, vi } from "vitest";
import {
  ANALYTICS_CONSENT_KEY,
  createFamilyAnalyticsAdapter,
  type FamilyAnalyticsPayload
} from "../family-analytics";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key)
  };
}

describe("family analytics adapter", () => {
  it("명시적 동의 전에는 이벤트를 만들지 않는다", () => {
    const storage = memoryStorage();
    const send = vi.fn();
    const adapter = createFamilyAnalyticsAdapter({ getStorage: () => storage, provider: { send } });

    expect(adapter.track("activity_selected", { surface: "activity-selector" })).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it("동의 뒤 필수 메타만 붙이고 금지 필드는 제거한다", () => {
    const storage = memoryStorage();
    const events: FamilyAnalyticsPayload[] = [];
    const adapter = createFamilyAnalyticsAdapter({
      getStorage: () => storage,
      provider: { send: (payload) => { events.push(payload); } },
      now: () => new Date("2026-07-16T00:00:00.000Z"),
      createAnonymousId: () => "anonymous-session",
      platform: () => "ios",
      sessionKind: () => "standalone"
    });

    expect(adapter.setConsent(true)).toBe(true);
    expect(storage.getItem(ANALYTICS_CONSENT_KEY)).toBe("granted");
    expect(
      adapter.track("location_method_selected", {
        surface: "location-sheet",
        properties: {
          method: "gps",
          latitude: 37.5,
          address: "비공개",
          raw_query: "비공개",
          user_address: "비공개",
          preciseLatitude: 37.5
        }
      })
    ).toBe(true);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      event_name: "location_method_selected",
      app_id: "outbom",
      app_version: "0.25.2",
      platform: "ios",
      session_kind: "standalone",
      anonymous_id: "anonymous-session",
      family_spec_version: "1.0.0",
      properties: { method: "gps" }
    });
    expect(events[0].properties).not.toHaveProperty("latitude");
    expect(events[0].properties).not.toHaveProperty("address");
    expect(events[0].properties).not.toHaveProperty("raw_query");
    expect(events[0].properties).not.toHaveProperty("user_address");
    expect(events[0].properties).not.toHaveProperty("preciseLatitude");
  });

  it("동의 철회와 공급자 오류가 앱 흐름을 깨지 않는다", () => {
    const storage = memoryStorage();
    const adapter = createFamilyAnalyticsAdapter({
      getStorage: () => storage,
      provider: { send: () => { throw new Error("provider unavailable"); } }
    });

    adapter.setConsent(true);
    expect(adapter.track("recommendation_viewed", { surface: "time-tab" })).toBe(false);
    expect(adapter.setConsent(false)).toBe(true);
    expect(adapter.hasConsent()).toBe(false);
  });
});
