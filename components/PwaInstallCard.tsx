// 야외봄 설치 프롬프트와 iPhone 홈 화면 추가, 서비스워커 업데이트 확인을 한 카드에 제공한다.
"use client";

import { useState } from "react";
import { CheckCircle2, Download, RefreshCw, Share2 } from "lucide-react";
import { usePwaInstall, type PwaUpdateOutcome } from "@/app/pwa-install";
import familyMeta from "@/src/generated/robom-family/app-meta.json";

const updateMessages: Record<PwaUpdateOutcome, string> = {
  updated: "새 버전을 적용하고 있어요. 잠시 뒤 화면이 새로고침됩니다.",
  current: "현재 최신 버전을 사용 중이에요.",
  development: "업데이트 확인은 배포된 야외봄에서 사용할 수 있어요.",
  unsupported: "이 브라우저에서는 자동 업데이트 확인을 지원하지 않아요.",
  failed: "업데이트를 확인하지 못했어요. 네트워크 연결 뒤 다시 시도해 주세요."
};

export function PwaInstallCard() {
  const { mode, install, checkForUpdate } = usePwaInstall();
  const [message, setMessage] = useState("");
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [checking, setChecking] = useState(false);

  const promptInstall = async () => {
    if (mode === "ios") {
      setShowIosGuide(true);
      setMessage("Safari의 공유 메뉴에서 홈 화면에 추가를 선택해 주세요.");
      return;
    }
    const outcome = await install();
    setMessage(
      outcome === "accepted"
        ? "야외봄 설치를 시작했어요."
        : outcome === "dismissed"
          ? "설치를 취소했어요. 필요할 때 다시 설치 안내를 열어주세요."
          : "브라우저 메뉴의 앱 설치 또는 홈 화면에 추가를 이용해 주세요."
    );
  };

  const update = async () => {
    setChecking(true);
    const outcome = await checkForUpdate();
    setMessage(updateMessages[outcome]);
    setChecking(false);
  };

  return (
    <section className="settings-card install-card" aria-labelledby="install-outbom-title">
      <div className="settings-card-head">
        <span className="settings-chip" aria-hidden="true"><Download size={16} strokeWidth={1.9} /></span>
        <h3 id="install-outbom-title">설치와 업데이트</h3>
      </div>
      <p className="settings-note">
        야외봄을 홈 화면에 설치하면 전체 화면으로 더 빠르게 열 수 있어요. 설치 여부와 관계없이 저장된 위치·활동·알림 설정은 그대로 유지됩니다.
      </p>
      <div className="install-actions">
        {mode === "installed" ? (
          <span className="install-state"><CheckCircle2 size={19} aria-hidden="true" /> 이 기기에 설치됨</span>
        ) : mode === "manual" ? (
          <a className="primary-action" href={familyMeta.stableInstallUrl} target="_blank" rel="noopener noreferrer">
            <Download size={18} aria-hidden="true" /> 설치 안내 열기
          </a>
        ) : (
          <button type="button" className="primary-action" onClick={() => void promptInstall()}>
            {mode === "ios" ? <Share2 size={18} aria-hidden="true" /> : <Download size={18} aria-hidden="true" />}
            {mode === "ios" ? "iPhone 설치 방법" : "야외봄 설치하기"}
          </button>
        )}
        <button type="button" className="ghost-action" disabled={checking} onClick={() => void update()}>
          <RefreshCw className={checking ? "spin" : undefined} size={18} aria-hidden="true" />
          {checking ? "확인 중" : "업데이트 확인"}
        </button>
      </div>
      {mode === "manual" ? (
        <p className="install-guide">Chrome·Edge 메뉴에서 <strong>앱 설치</strong>를 선택해도 됩니다.</p>
      ) : null}
      {showIosGuide ? (
        <ol className="install-guide ios-install-guide">
          <li>Safari에서 야외봄을 엽니다.</li>
          <li>아래쪽 공유 버튼을 누릅니다.</li>
          <li><strong>홈 화면에 추가</strong>를 선택합니다.</li>
        </ol>
      ) : null}
      {message ? <p className="install-message" role="status" aria-live="polite">{message}</p> : null}
    </section>
  );
}
