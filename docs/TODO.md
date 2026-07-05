# 러닝콜 TODO (당장 할 일)

지금 집중: **1단계 — 웹 상시 배포 (컴퓨터 꺼져도 작동)**

## 내가(사용자) 할 일 — 순서대로
1. [ ] GitHub 로그인 → 비공개 저장소 `runningcall` 생성 (DEPLOY.md 1단계)
2. [ ] Claude가 준 명령으로 코드 push
3. [ ] Vercel 로그인(GitHub 계정으로) → 저장소 Import → Deploy (DEPLOY.md 2단계)
4. [ ] `*.vercel.app` 주소 폰에서 접속 확인 + PWA 설치 테스트
5. [ ] 카카오 REST 키 발급 (DEPLOY.md 3단계)
6. [ ] Vercel 환경변수 `KAKAO_REST_API_KEY` 등록 → 재배포

## Claude가 할 일
- [x] v0.1.0 빌드 검증
- [x] 기록 문서 체계 생성
- [x] v0.1.0 첫 커밋 + 태그
- [x] .env.example에 KAKAO_REST_API_KEY 문서화
- [x] push용 원격 연결 명령 안내 (DEPLOY.md 1단계)
- [ ] 배포 후 각 문서 상태 갱신

## 나중 (이번 아님)
- 도메인 확정·구매 (2단계)
- Supabase 회원가입 (3단계)
- 앱스토어/플레이 (4~5단계) + 개인정보처리방침 페이지
