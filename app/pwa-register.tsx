"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    window.addEventListener("load", () => {
      void navigator.serviceWorker.register("/sw.js").catch(() => {
        // 설치 가능성만 보강하는 용도라 실패해도 앱 사용은 유지합니다.
      });
    });
  }, []);

  return null;
}
