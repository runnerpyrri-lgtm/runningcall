# 러닝콜 로드맵

상태 표시: ✅ 완료 · 🔨 진행중 · ⏳ 예정 · ⏸️ 보류/미결정

## 목표 구조 (최종)
러닝콜을 하나의 서비스로 → iOS 앱 · Android 앱 · 웹 · 도메인 · 회원가입 · 클라우드 상시작동 · 버전기록 체계.

---

## 0단계 — 개발 체계 🔨
- ✅ v0.1.0 baseline 빌드/타입체크 검증
- 🔨 기록 문서 6종 생성 (CHANGELOG / DEVELOPMENT_LOG / ROADMAP / PROJECT_SPEC / TODO / DEPLOY)
- ⏳ v0.1.0 첫 커밋 + git 태그
- ⏳ 버전 리듬 정착 (변경 → CHANGELOG → 커밋 → 태그)

## 1단계 — 웹 상시 배포 (핵심) ⏳
> 목표: **컴퓨터 꺼져도 24시간 작동.** 이 단계에서 달성.
- ⏳ GitHub 비공개 저장소 생성 + push
- ⏳ Vercel 연결 (push마다 자동 재배포)
- ⏳ 무료 주소 `*.vercel.app` 확보
- ⏳ 카카오 REST 키 발급 → Vercel 환경변수 `KAKAO_REST_API_KEY` 등록
- ⏳ 배포본 폰에서 접속·PWA 설치 확인

## 2단계 — 도메인 ⏳
- ⏳ 이름 확정 (후보: runningcall / ttwigo / runcall …)
- ⏳ 등록업체 구매 + Vercel 연결 + HTTPS
- ⏳ 카카오 플랫폼 허용 도메인에 실주소 추가

## 3단계 — 회원가입/로그인 (Supabase) ⏳
- ⏳ Supabase 프로젝트 생성, Auth 켜기
- ⏳ users/profile 테이블 + Row Level Security
- ⏳ 웹에서 로그인 붙이기 (러닝 기록을 계정에 동기화)

## 4단계 — Android 앱 (Google Play) ⏳
- ⏸️ 방식 결정: **웹 감싸기(TWA/PWABuilder)** vs Expo 재제작
- ⏳ 앱 아이콘/스크린샷/설명/개인정보처리방침 URL 준비
- ⏳ Play Console($25) 등록 + 심사 제출

## 5단계 — iOS 앱 (App Store) ⏳
- ⏸️ 방식 결정 (위와 동일)
- ⏳ Apple Developer($99/년) + Xcode 빌드 + TestFlight
- ⏳ 심사 제출

## 앱스토어 공통 준비물 (3~5단계 전제) ⏳
- ⏳ 웹에 페이지 추가: `/privacy` `/terms` `/support` `/delete-account`
- ⏳ 지원 이메일, 카테고리, 심사용 테스트 계정

## 미래 후보 (백로그)
- 대회 일정, 러닝화 가이드, 주간 러닝날씨, 코스 팁, 공유 카드
- 에러 추적(Sentry), 정기작업(Vercel Cron / Supabase Edge Functions)
- 수익화(AdSense / 인앱)

---
### 주요 아키텍처 미결정 (기록용)
- **앱 제작 방식**: 웹 감싸기(현 Next.js UI 재활용, 빠름) vs Expo(네이티브 UX, 재제작 비용). 3단계 끝나고 결정.
