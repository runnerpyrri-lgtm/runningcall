# 러닝콜 개발 로그

날짜별로 무엇을 했는지 기록합니다. 최신이 위로.

## 2026-07-05 (저녁) — v0.2.0 멀티 활동 출시 🏃🚶🐕☂️

한 일:
- 활동 프로필 시스템(lib/activity.ts) — run/walk/dog/commute 가중치·온도곡선·더위캡
- scoring.ts 파라미터화, calculateSlot(input, profile) 신설. 러닝은 별칭으로 100% 보존
- vitest 도입 + 골든마스터 12케이스 (러닝 점수·톤·멘트 리팩터 전후 완전 일치 검증)
- 예보 원본/점수 분리(fetchRawForecast/scoreForecast) — 활동 전환 시 재요청 없이 즉시 재계산
- insights/outfit 4개 활동 전용 카피 전면 작성
- UI — 데스크탑 좌측 활동 레일, 모바일 상단 탭, 드로어 활동 선택, 활동별 히어로/추천 제목
- 애견산책: 발바닥 화상/지면열 3단계 경고(getPawRisk). 출퇴근: 12시간 우산 안내(getUmbrellaAdvice)
- 브라우저 검증: 4개 활동 점수 분화(러닝55/걷기60/애견35/출퇴근60), 경고 배너, 모바일·데스크탑 반응형, 콘솔 에러 0

결정:
- 앱 이름은 러닝콜 유지 (리브랜딩은 사용자가 나중에 결정)
- dog는 걷기보다 더위에 엄격(hot1=28°C), commute는 강수 가중 0.44로 최우선

배포: v0.2.0 태그 + push → Vercel 자동배포.

## 2026-07-05 (오후) — 웹 상시 배포 완료 🎉

한 일:
- GitHub 저장소 생성(runnerpyrri-lgtm/runningcall) + `gh` CLI 인증 + code·v0.1.0 태그 push
- Vercel에 GitHub 저장소 Import → Deploy 성공
- **고정 주소 확보: https://runningcall.vercel.app** (HTTP 200, manifest·API 정상 검증)
- 이제 push마다 Vercel 자동 재배포되는 파이프라인 가동 → **컴퓨터 꺼도 24시간 작동 달성**

보안:
- 사용자가 실수로 노출한 GitHub PAT를 ~/.zshrc에서 제거(백업 .zshrc.bak) → 사용자에게 GitHub에서 revoke 요청

남은 것 (1단계 마무리):
- 폰에서 PWA 설치 확인
- 카카오 REST 키 발급 → Vercel 환경변수 등록

## 2026-07-05 — v0.1.0 baseline + 배포 체계 착수

한 일:
- 프로젝트 전체 분석 (Next.js 16 / React 19 / 약 6,100줄, git 커밋 0개 상태 발견)
- 목표 확정: 웹 상시배포 → 도메인 → 회원가입 → iOS/Android → 버전기록 체계
- 이번 범위 확정: **0~2단계 (개발체계 → 무료 상시배포 → 도메인)**, 앱은 나중
- `pnpm typecheck` / `pnpm build` 통과 확인 → v0.1.0 baseline 자격 검증
- Vercel 배포 적합성 확인 (API 라우트 서버리스 OK, 워크스페이스 오인 없음, PWA 자산 OK)
- 기록 문서 6종 생성: CHANGELOG, DEVELOPMENT_LOG, ROADMAP, PROJECT_SPEC, TODO, DEPLOY
- 설계 스펙 문서화: `docs/superpowers/specs/2026-07-05-deploy-and-devprocess-design.md`

결정:
- 버전은 v0.1.0 (package.json과 일치, 정식출시 전이라 1.0 아님)
- 회원가입 백엔드는 Supabase로 로드맵 확정 (이번 범위 밖)
- 앱 제작 방식(웹 감싸기 vs Expo)은 3단계 이후 결정으로 보류

다음 할 일:
- v0.1.0 첫 커밋 + git 태그
- GitHub 비공개 저장소 + Vercel 연결 (DEPLOY.md 절차대로)
- 카카오 REST 키 발급 → Vercel 환경변수 등록
