# 러닝콜 개발 로그

날짜별로 무엇을 했는지 기록합니다. 최신이 위로.

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
