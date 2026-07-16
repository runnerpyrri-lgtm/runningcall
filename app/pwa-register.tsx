"use client";

import { useEffect } from "react";
import { publicPath } from "@/lib/public-path";

function collectLoadedAppShell() {
  const urls = new Set<string>([new URL(publicPath("/"), window.location.origin).href]);
  document.querySelectorAll<HTMLScriptElement | HTMLLinkElement | HTMLImageElement>("script[src], link[href], img[src]").forEach((element) => {
    const candidate = element.getAttribute("src") ?? element.getAttribute("href");
    if (!candidate) return;
    const url = new URL(candidate, window.location.href);
    if (url.origin === window.location.origin) urls.add(url.href);
  });
  return [...urls];
}

export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    // 첫 방문 설치(clients.claim) 때도 controllerchange가 발생한다 —
    // 이미 controller가 있던 세션(=실제 새 버전 교체)에서만 리로드한다.
    const hadController = Boolean(navigator.serviceWorker.controller);
    let refreshing = false;
    const onControllerChange = () => {
      if (!hadController || refreshing) return;
      refreshing = true;
      window.location.reload();
    };
    const register = () => {
      void navigator.serviceWorker.register(publicPath("/sw.js")).then(async (registration) => {
        if (registration.waiting) registration.waiting.postMessage({ type: "SKIP_WAITING" });
        registration.addEventListener("updatefound", () => {
          registration.installing?.addEventListener("statechange", () => {
            if (registration.waiting) registration.waiting.postMessage({ type: "SKIP_WAITING" });
          });
        });
        const ready = await navigator.serviceWorker.ready;
        ready.active?.postMessage({ type: "CACHE_APP_SHELL", urls: collectLoadedAppShell() });
      }).catch(() => {
        // 설치 가능성만 보강하는 용도라 실패해도 앱 사용은 유지합니다.
      });
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
    return () => {
      window.removeEventListener("load", register);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  return null;
}
