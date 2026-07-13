"use client";

import { useEffect } from "react";
import { publicPath } from "@/lib/public-path";

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
      void navigator.serviceWorker.register(publicPath("/sw.js")).then((registration) => {
        if (registration.waiting) registration.waiting.postMessage({ type: "SKIP_WAITING" });
        registration.addEventListener("updatefound", () => {
          registration.installing?.addEventListener("statechange", () => {
            if (registration.waiting) registration.waiting.postMessage({ type: "SKIP_WAITING" });
          });
        });
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
