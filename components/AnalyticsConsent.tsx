// 익명 사용 통계 동의를 기본 꺼짐으로 보여주고 로컬 consent 상태만 변경한다.
"use client";

import { useEffect, useState } from "react";
import { familyAnalytics } from "@/lib/family-analytics";

export function AnalyticsConsent() {
  const [granted, setGranted] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setGranted(familyAnalytics.hasConsent());
    setReady(true);
  }, []);

  const changeConsent = (next: boolean) => {
    if (familyAnalytics.setConsent(next)) setGranted(next);
  };

  return (
    <div className="analytics-consent">
      <label>
        <span>
          <strong>익명 사용 통계</strong>
          <small>기본 꺼짐 · 위치 좌표·주소·검색어는 수집하지 않아요.</small>
        </span>
        <input
          type="checkbox"
          checked={granted}
          disabled={!ready}
          onChange={(event) => changeConsent(event.target.checked)}
        />
      </label>
      <p>현재 분석 SDK와 외부 공급자가 연결되지 않아 동의 여부와 관계없이 네트워크 전송은 발생하지 않습니다.</p>
    </div>
  );
}
