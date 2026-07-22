// 야외봄 서비스워커 업데이트 확인을 설정 카드에 제공한다. (스토어 출시 전이라 설치 유도 UI는 노출하지 않는다.)
"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { usePwaInstall, type PwaUpdateOutcome } from "@/app/pwa-install";

const updateMessages: Record<PwaUpdateOutcome, string> = {
  updated: "새 버전을 적용하고 있어요. 잠시 뒤 화면이 새로고침됩니다.",
  current: "현재 최신 버전을 사용 중이에요.",
  development: "업데이트 확인은 배포된 야외봄에서 사용할 수 있어요.",
  unsupported: "이 브라우저에서는 자동 업데이트 확인을 지원하지 않아요.",
  failed: "업데이트를 확인하지 못했어요. 네트워크 연결 뒤 다시 시도해 주세요."
};

export function PwaInstallCard() {
  const { checkForUpdate } = usePwaInstall();
  const [message, setMessage] = useState("");
  const [checking, setChecking] = useState(false);

  const update = async () => {
    setChecking(true);
    const outcome = await checkForUpdate();
    setMessage(updateMessages[outcome]);
    setChecking(false);
  };

  return (
    <section className="settings-card install-card" aria-labelledby="update-outbom-title">
      <div className="settings-card-head">
        <span className="settings-chip" aria-hidden="true"><RefreshCw size={16} strokeWidth={1.9} /></span>
        <h3 id="update-outbom-title">업데이트</h3>
      </div>
      <p className="settings-note">
        야외봄은 접속할 때마다 최신 버전으로 유지돼요. 저장된 위치·활동·알림 설정은 그대로 유지됩니다.
      </p>
      <div className="install-actions">
        <button type="button" className="ghost-action" disabled={checking} onClick={() => void update()}>
          <RefreshCw className={checking ? "spin" : undefined} size={18} aria-hidden="true" />
          {checking ? "확인 중" : "업데이트 확인"}
        </button>
      </div>
      {message ? <p className="install-message" role="status" aria-live="polite">{message}</p> : null}
    </section>
  );
}
