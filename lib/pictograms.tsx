// 활동별 신호등 픽토그램 — 히어로 신호 다이얼과 활동 탭에서 쓰는 SVG (currentColor로 시그널 색 상속)
import type { ActivityKey } from "@/lib/activity";
import type { ReactElement } from "react";

// 좌표계: viewBox 0 0 100 100, 라운드 캡 스트로크. 포즈는 신호등/올림픽 픽토그램 문법.
const PICTOGRAMS: Record<ActivityKey, ReactElement> = {
  // 스프린트 — 상체 전경, 팔 90도 크로스 스윙, 앞무릎 드라이브 + 뒷다리 힐킥
  run: (
    <>
      <circle cx="65" cy="16" r="8.5" fill="currentColor" />
      <path d="M59 25 L48 53" strokeWidth="9.5" />
      <path d="M57 29 L68 37 L75 27" strokeWidth="8" />
      <path d="M57 30 L47 38 L40 48" strokeWidth="8" />
      <path d="M48 53 L63 59 L60 76" strokeWidth="9.5" />
      <path d="M60 76 L68 79" strokeWidth="8" />
      <path d="M48 53 L36 68 L24 61" strokeWidth="9.5" />
    </>
  ),
  // 직립 보행 — 완만한 보폭, 자연스러운 팔 스윙, 앞발 착지
  walk: (
    <>
      <circle cx="52" cy="14" r="8.5" fill="currentColor" />
      <path d="M51 23 L49 52" strokeWidth="9.5" />
      <path d="M51 28 L59 40 L62 50" strokeWidth="8" />
      <path d="M51 28 L43 40 L41 50" strokeWidth="8" />
      <path d="M49 52 L60 66 L63 84" strokeWidth="9.5" />
      <path d="M63 84 L71 84" strokeWidth="8" />
      <path d="M49 52 L41 68 L33 83" strokeWidth="9.5" />
    </>
  ),
  // 애견산책 — 보행자 + 처진 리드줄 + 꼬리 올린 트로팅 강아지
  dog: (
    <>
      <circle cx="31" cy="13" r="7.5" fill="currentColor" />
      <path d="M30 21 L29 46" strokeWidth="8.5" />
      <path d="M30 26 L39 34 L46 40" strokeWidth="7" />
      <path d="M30 26 L22 36" strokeWidth="7" />
      <path d="M29 46 L38 59 L41 76" strokeWidth="8.5" />
      <path d="M41 76 L48 76" strokeWidth="7" />
      <path d="M29 46 L23 61 L16 75" strokeWidth="8.5" />
      <path d="M46 40 Q57 53 64 58" strokeWidth="3.5" />
      <path d="M65 64 L85 64" strokeWidth="9" />
      <circle cx="89" cy="57" r="5.5" fill="currentColor" />
      <path d="M92 52 L95 57" strokeWidth="4" />
      <path d="M65 64 Q58 58 57 50" strokeWidth="4.5" />
      <path d="M68 67 L64 78" strokeWidth="5" />
      <path d="M73 67 L75 78" strokeWidth="5" />
      <path d="M80 67 L78 78" strokeWidth="5" />
      <path d="M85 67 L88 77" strokeWidth="5" />
    </>
  ),
  // 등산 — 배낭 혹, 스틱 플랜트(경사면 접지), 오르막 하이 스텝
  hike: (
    <>
      <circle cx="55" cy="13" r="8.5" fill="currentColor" />
      <path d="M50 22 L43 50" strokeWidth="9.5" />
      <path d="M46 26 L38 43" strokeWidth="11" />
      <path d="M50 27 L60 35 L66 43" strokeWidth="8" />
      <path d="M68 31 L74 70" strokeWidth="4.5" />
      <path d="M43 50 L59 57 L57 75" strokeWidth="9.5" />
      <path d="M57 75 L66 73" strokeWidth="8" />
      <path d="M43 50 L33 65 L27 83" strokeWidth="9.5" />
      <path d="M14 90 L86 66" strokeWidth="3" opacity="0.45" />
    </>
  ),
  // 자전거 — 두 바퀴 + 다이아 프레임 + 크라우칭 라이더, 페달 위 양발
  bike: (
    <>
      <circle cx="27" cy="74" r="13.5" strokeWidth="5" />
      <circle cx="79" cy="74" r="13.5" strokeWidth="5" />
      <path d="M27 74 L51 74 L44 55 L67 55 L79 74" strokeWidth="5" />
      <path d="M51 74 L67 55" strokeWidth="5" />
      <path d="M37 52 L47 52" strokeWidth="6" />
      <path d="M67 55 L71 47 L77 47" strokeWidth="5" />
      <circle cx="61" cy="21" r="7.5" fill="currentColor" />
      <path d="M44 51 L57 31" strokeWidth="8.5" />
      <path d="M56 33 L72 45" strokeWidth="7" />
      <path d="M44 51 L57 60 L57 71" strokeWidth="8.5" />
      <path d="M44 51 L45 64 L45 77" strokeWidth="8.5" />
    </>
  )
};

export function ActivityPictogram({ activity, className }: { activity: ActivityKey; className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PICTOGRAMS[activity]}
    </svg>
  );
}
