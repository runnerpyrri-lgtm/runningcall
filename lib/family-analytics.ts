// 로봄 패밀리 계약에 맞춰 동의된 최소 이벤트만 공급자 독립적으로 전달한다.
import packageInfo from "../package.json";
import familyMeta from "@/src/generated/robom-family/app-meta.json";
import {
  familyEventNames,
  forbiddenAnalyticsFields,
  type FamilyEventName
} from "@/src/generated/robom-family/analytics-events";

export const ANALYTICS_CONSENT_KEY = "outbom:analytics-consent:v1";

type AnalyticsValue = string | number | boolean | null;
type AnalyticsProperties = Record<string, AnalyticsValue | undefined>;

export type FamilyAnalyticsPayload = {
  event_name: FamilyEventName;
  app_id: string;
  app_version: string;
  platform: string;
  surface: string;
  session_kind: string;
  anonymous_id: string;
  timestamp: string;
  campaign: string;
  family_spec_version: string;
  properties: Record<string, AnalyticsValue>;
};

export type FamilyAnalyticsProvider = {
  send: (payload: FamilyAnalyticsPayload) => void | Promise<void>;
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type AdapterOptions = {
  getStorage?: () => StorageLike | null;
  provider?: FamilyAnalyticsProvider;
  now?: () => Date;
  createAnonymousId?: () => string;
  platform?: () => string;
  sessionKind?: () => string;
};

const forbiddenFields = new Set<string>(forbiddenAnalyticsFields);
const noopProvider: FamilyAnalyticsProvider = { send: () => undefined };

function browserStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function browserPlatform() {
  if (typeof navigator === "undefined") return "unknown";
  if (/iphone|ipad|ipod/i.test(navigator.userAgent)) return "ios";
  if (/android/i.test(navigator.userAgent)) return "android";
  return "web";
}

function browserSessionKind() {
  if (typeof window === "undefined") return "web";
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches
    || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  return standalone ? "standalone" : "web";
}

function randomAnonymousId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function scrubAnalyticsProperties(properties: AnalyticsProperties) {
  return Object.fromEntries(
    Object.entries(properties).filter(
      (entry): entry is [string, AnalyticsValue] => entry[1] !== undefined && !forbiddenFields.has(entry[0].toLowerCase())
    )
  );
}

export function createFamilyAnalyticsAdapter(options: AdapterOptions = {}) {
  const getStorage = options.getStorage ?? browserStorage;
  const now = options.now ?? (() => new Date());
  const createAnonymousId = options.createAnonymousId ?? randomAnonymousId;
  const platform = options.platform ?? browserPlatform;
  const sessionKind = options.sessionKind ?? browserSessionKind;
  let provider = options.provider ?? noopProvider;
  let anonymousId: string | null = null;

  function hasConsent() {
    try {
      return getStorage()?.getItem(ANALYTICS_CONSENT_KEY) === "granted";
    } catch {
      return false;
    }
  }

  function setConsent(granted: boolean) {
    try {
      const storage = getStorage();
      if (!storage) return false;
      if (granted) storage.setItem(ANALYTICS_CONSENT_KEY, "granted");
      else storage.removeItem(ANALYTICS_CONSENT_KEY);
      if (!granted) anonymousId = null;
      return true;
    } catch {
      return false;
    }
  }

  function setProvider(nextProvider: FamilyAnalyticsProvider | null) {
    provider = nextProvider ?? noopProvider;
  }

  function track(
    eventName: FamilyEventName,
    options: { surface: string; campaign?: string; properties?: AnalyticsProperties }
  ) {
    if (!hasConsent()) return false;
    if (!(familyEventNames as readonly string[]).includes(eventName)) return false;

    anonymousId ??= createAnonymousId();
    const payload: FamilyAnalyticsPayload = {
      event_name: eventName,
      app_id: familyMeta.id,
      app_version: packageInfo.version,
      platform: platform(),
      surface: options.surface,
      session_kind: sessionKind(),
      anonymous_id: anonymousId,
      timestamp: now().toISOString(),
      campaign: options.campaign ?? "direct",
      family_spec_version: familyMeta.familySpecVersion,
      properties: scrubAnalyticsProperties(options.properties ?? {})
    };

    try {
      const pending = provider.send(payload);
      if (pending instanceof Promise) void pending.catch(() => undefined);
      return true;
    } catch {
      return false;
    }
  }

  return { hasConsent, setConsent, setProvider, track };
}

export const familyAnalytics = createFamilyAnalyticsAdapter();
