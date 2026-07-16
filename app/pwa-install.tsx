// 설치 프롬프트를 앱 시작부터 보관하고 설치 여부와 업데이트 확인 상태를 설정 화면에 제공한다.
"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { publicPath } from "@/lib/public-path";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export type PwaInstallMode = "installed" | "prompt" | "ios" | "manual";
export type PwaInstallOutcome = "accepted" | "dismissed" | "manual" | "unavailable";
export type PwaUpdateOutcome = "updated" | "current" | "development" | "unsupported" | "failed";

type PwaInstallContextValue = {
  mode: PwaInstallMode;
  install: () => Promise<PwaInstallOutcome>;
  checkForUpdate: () => Promise<PwaUpdateOutcome>;
};

const PwaInstallContext = createContext<PwaInstallContextValue | null>(null);

function detectStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches
    || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

function detectIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
    || (/macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
}

export function PwaInstallProvider({ children }: { children: ReactNode }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    const displayMode = window.matchMedia("(display-mode: standalone)");
    const syncInstalled = () => setInstalled(detectStandalone());
    const onBeforeInstallPrompt = (event: Event) => {
      const promptEvent = event as BeforeInstallPromptEvent;
      promptEvent.preventDefault();
      setDeferredPrompt(promptEvent);
    };
    const onInstalled = () => {
      setDeferredPrompt(null);
      setInstalled(true);
    };

    setIos(detectIos());
    syncInstalled();
    displayMode.addEventListener("change", syncInstalled);
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      displayMode.removeEventListener("change", syncInstalled);
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const mode: PwaInstallMode = installed ? "installed" : deferredPrompt ? "prompt" : ios ? "ios" : "manual";

  const install = useCallback(async () => {
    if (!deferredPrompt) return ios ? "manual" : "unavailable";
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      if (choice.outcome === "accepted") setInstalled(true);
      return choice.outcome;
    } catch {
      setDeferredPrompt(null);
      return "unavailable";
    }
  }, [deferredPrompt, ios]);

  const checkForUpdate = useCallback(async (): Promise<PwaUpdateOutcome> => {
    if (process.env.NODE_ENV !== "production") return "development";
    if (!("serviceWorker" in navigator)) return "unsupported";
    try {
      const registration = await navigator.serviceWorker.getRegistration(publicPath("/"));
      if (!registration) return "unsupported";
      await registration.update();
      if (registration.waiting) {
        registration.waiting.postMessage({ type: "SKIP_WAITING" });
        return "updated";
      }
      return "current";
    } catch {
      return "failed";
    }
  }, []);

  const value = useMemo(() => ({ mode, install, checkForUpdate }), [mode, install, checkForUpdate]);
  return <PwaInstallContext.Provider value={value}>{children}</PwaInstallContext.Provider>;
}

export function usePwaInstall() {
  const value = useContext(PwaInstallContext);
  if (!value) throw new Error("PwaInstallProvider 안에서 사용해야 합니다.");
  return value;
}
