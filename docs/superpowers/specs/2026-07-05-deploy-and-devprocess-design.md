# 러닝콜 상시배포 + 개발체계 설계 (v0.1.0)

- 작성일: 2026-07-05
- 상태: 승인됨
- 범위: 0~2단계 (개발체계 → 무료 웹 상시배포 → 도메인)

## 배경 / 문제

현재 러닝콜은 로컬 `pnpm start` + cloudflared 퀵터널로만 접속 가능해서,
**컴퓨터가 꺼지거나 터널 프로세스가 죽으면 앱이 죽고 주소도 매번 바뀐다.**
git 저장소는 있으나 커밋이 0개라 버전 이력도 없다.

## 목표

1. 컴퓨터가 꺼져도 24시간 작동하는 상시 배포 (핵심)
2. 고정 주소
3. 버전이 쌓이는 개발 체계 (기록 문서 + 커밋/태그 리듬)

## 핵심 구조 결정

> **웹앱 하나 = 진실의 원천(single source of truth).**
> Vercel에 배포된 Next.js 앱이 웹·(향후)안드로이드·(향후)iOS의 공통 기반이 된다.
> 향후 앱은 이 배포를 감싸는 얇은 껍데기(TWA/Capacitor)로 만들어 코드를 하나로 유지한다.
> (대안: Expo로 앱을 새로 제작 — 네이티브 UX는 낫지만 기존 Next.js UI를 버려야 함. 3~4단계에서 최종 결정.)

## 단계 설계

### 0단계 — 개발 체계 (무료)
- 빌드/타입체크 통과 검증 후 현재 코드를 **v0.1.0** 첫 커밋 + git 태그
- 기록 문서 생성: `CHANGELOG.md`, `docs/DEVELOPMENT_LOG.md`, `docs/ROADMAP.md`,
  `docs/PROJECT_SPEC.md`, `docs/TODO.md`, `docs/DEPLOY.md`
- 버전 규칙: 의미있는 변경마다 커밋 → CHANGELOG 기록 → 필요시 태그 (SemVer)

### 1단계 — 웹 상시 배포 (무료, 핵심)
- GitHub 비공개 저장소 생성 → push
- Vercel을 저장소에 연결 → push마다 자동 재배포
- 무료 주소 `*.vercel.app` 발급 → "컴퓨터 꺼져도 작동" 목표 달성
- 카카오 REST 키 발급(사용자) → Vercel 환경변수 `KAKAO_REST_API_KEY` 등록

### 2단계 — 도메인 (연 ~1.5만원, 나중)
- 이름 확정 → 등록업체 구매 → Vercel 연결 → HTTPS 자동

## 기술 검증 결과 (2026-07-05)
- `pnpm build` / `pnpm typecheck` 통과
- API 라우트 4개 = Vercel 서버리스로 정상 동작 (정적변환 문제 없음)
- `pnpm-workspace.yaml`에 `packages:` 없음 → 모노레포 오인 없음
- PWA 아이콘 3종 + manifest + sw.js 준비됨

## 향후(로드맵으로 이관, 이번 범위 아님)
- 회원가입/로그인 백엔드: **Supabase** (Auth + DB)
- iOS/Android 출시: 웹 감싸기(TWA/Capacitor) vs Expo 재제작 — 미결정
- 앱스토어 필수: 개인정보처리방침/이용약관/지원 페이지
