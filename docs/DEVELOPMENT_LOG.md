# 러닝콜 개발 로그

날짜별로 무엇을 했는지 기록합니다. 최신이 위로.

## 2026-07-05 (심야 6) — v0.7.0 뱃지 3070개 시리즈 + 컬렉션 화면

사용자: 뱃지 3000개·초반 밀도로 포기 방지. 슈퍼스.
- **시리즈 생성기**(achievements.ts): 지표별 BadgeSeries + ladder(초반 1단위 촘촘→넓게) → 31시리즈 × 단계 = **3070 뱃지**. 통계 확장(durationByActivity·maxSingleDurationByActivity·totalDistance·totalDuration). evaluateSeries(레벨·다음 목표·완주). 개수·초반밀도 테스트
- **AchievementsView 재작성**: 진행 링(conic-gradient) + N/3070 + 시리즈 카드(Lv·다음·진행바) + 아코디언 사다리(펼칠 때만 렌더 → 성능). GROUP_ORDER 그룹핑
- **CelebrationModal**: 다수 달성 시 상위 4 + "외 N개". 브라우저: 393 소급·baseline 무팝업, 러닝 25km→68개 동시 축하, 러닝거리 시리즈 14/114·다음 15km, 360/1440, 콘솔 0
- 이 화면이 v0.7.1 세련미의 선발대 역할

배포: v0.7.0 태그 + push → Vercel.

## 2026-07-05 (심야 5) — v0.6.0 도전과제/뱃지 + 캘린더 성과 요약

슈퍼스(브레인스토밍→플랜→실행). 사용자 요청: 날짜 누르면 성과 확인, 기록일 빨간 링, 뱃지 수집 시스템("모으는 맛").
- **달성 엔진**(lib/achievements.ts): journal+activity-log 합산 통계(세션·거리·산·streak·variety·기분·일기) + 36뱃지 카탈로그 + 소급 판정 + newlyEarned/seen. 순수 함수, 테스트 10개
- **도전과제 화면**(AchievementsView): N/36 진행률, 그룹별 뱃지 카드(달성 등급색/미달성 진행바), NEW. 레일+드로어 진입
- **축하 팝업**(CelebrationModal): 새 달성 시 큰 팝업(여러 개 동시), baseline 조용히(첫 실행 폭탄 방지), seen 저장 중복 방지. useRef로 seen 미러링해 effect 루프 회피
- **캘린더 성과 요약**: 기록일 탭→요약 패널(활동·거리·산·기분·일기)+편집, 빈 날은 편집기, 저장 후 요약 복귀. 기록일 빨간 링(오늘 파란 점)
- 브라우저 검증: 소급 11개 달성·baseline 무팝업, 자전거 추가→"첫 라이딩"+"완전 정복" 2개 동시 축하, 재방문 무재축하, 요약·빨간 링, 360/1440, 콘솔 0

배포: v0.6.0 태그 + push → Vercel 자동배포.

## 2026-07-05 (심야 4) — v0.5.0 운동 일지 다이어리 심화 + UI 폴리시

슈퍼스(브레인스토밍→플랜→실행)로 진행. 사용자 피드백: 일지 빈약·캘린더 짤림·애견 두 줄·준비 밋밋·드로어 장황·이모지 임팩트.
- **journal v2**: 활동별 기록(거리·시간·산이름) + 기분 + 자유 일기. v1 무손실 마이그레이션(활동 문자열→객체). 소수점 보존 위해 편집 중엔 문자열 draft, 저장 시 숫자 변환. 테스트 39개
- **JournalView 재작성**: 캘린더↔편집기 2화면, draft + 저장/취소, 이번 달 N일 기록, 미래 잠금. 캘린더 셀 고정·아이콘 클리핑(최대 2+N)으로 짤림 해결, 시트 90vh 스크롤
- **애견 체크리스트**: nowrap 가로 스크롤 한 줄 + 오른쪽 페이드
- **준비 탭**: 🔑 오늘 준비 핵심 강조 카드(dynamic block 재활용) + 블록 컬러 액센트
- **드로어**: tagline 제거·이름만 큼직. 이모지 전반 확대(캘린더·기분·칩·탭·드로어)
- 브라우저 검증: v1→v2 마이그레이션 라이브, 일지 저장(러닝 5.2km·북한산·기분·일기)→새로고침 유지, 캘린더 360/1440 안 짤림·5활동 +N, 애견 한 줄, 준비 핵심, 콘솔 0

배포: v0.5.0 태그 + push → Vercel 자동배포.

## 2026-07-05 (심야 3) — v0.4.2 운동 일지 + 동적 가이드 + UI 정리

- **운동 일지**(lib/journal.ts): 날짜별 활동 다중체크+메모, 정규화·안전 저장. JournalView(캘린더+상세). 좌측 레일 하단 진입. 브라우저에서 저장→새로고침 후 유지 검증
- **동적 가이드**: getDynamicGuideBlock — 비/강풍/자외선/폭염/미세먼지 조건별 활동 맞춤 블록을 정적 가이드 위에
- **애견 플랜 심화**: reason(판정 이유)·alternative(대안)·careTip(케어) 추가
- **레일 정리**: 큰 글자만(tagline 제거), 운동일지 버튼 추가. activity-tagline 완전 삭제
- **활동별 위치 기억**: running-alarm:activity-location:v1 — 활동 전환 시 그 활동 마지막 위치로. 브라우저에서 dog=부산/run=인천 분리 검증
- **등산 4구간 재확정**: 사용자 재검토로 저녁 제거 결정 철회 — 새벽만 있고 저녁 없는 비대칭이 이상하다는 지적이 맞음. 4구간(새벽/아침/낮/저녁) 유지 + 회귀 테스트로 고정
- **죽은 코드 제거**: composeBriefing/Briefing/BRIEFING_VERDICT, findTomorrowMorningBest, shortReason/heroReason, 미사용 import
- 히어로 조건 칩 모바일 2열 그리드
- 테스트 36개로 확대(journal 6개, 등산 회귀 2개 추가)

배포: v0.4.2 태그 + push → Vercel 자동배포.

## 2026-07-05 (심야 2) — v0.4.1 활동별 허브 구조 재설계

외부 AI 리뷰 + 자체 코드 리뷰 통합. "점수만 바뀌는 구조" → 활동별 허브.
- **활동별 기록**(lib/activity-record.ts): `running-alarm:activity-log:v1`에 5활동 날짜 배열 분리 저장, 기존 runlog→run 무손실 마이그레이션, 활동별 목표(주/월). 저장 안전 래퍼(정규화·quota 방어)
- **내부 탭**: 판단/준비/기록/가이드 세그먼트. RecordView(활동별 오늘체크·달력·연속일·목표), PrepView(복장+준비), GuideView(실전 팁). OutfitPlanBody로 복장 렌더 공유
- **실전 콘텐츠**(lib/activity-guide.ts): 5활동 prep/guide 블록
- **PC 좌측 레일** 부활(≥1200px, 이모지+이름+설명), 모바일 상단 5탭
- 정리: tips.ts 삭제, 공유/드로어/README 등산 포함
- 브라우저 검증: **활동별 기록 저장→재시작 유지 확인**(핵심), 마이그레이션 라이브 확인, PC레일, 콘솔0. 테스트 29개

배포: v0.4.1 태그 + push → Vercel 자동배포.

## 2026-07-05 (심야) — v0.4.0 등산 카테고리 + 전면 심화 ⛰️

외부 AI 리뷰 7건(내일 일출일몰·04시 새벽·산검색 품질·확장 문구·가이드·5탭·테스트) 전부 반영.
- **등산**: hike 프로필, getHikePlan(하산마감 = 일몰-2.5h, 내일 탭은 sunsetTomorrow로 정확 계산), 낙뢰/돌풍/결빙/능선바람 신호, 조망 예보, 상황별 준비물(헤드랜턴·아이젠)
- 날씨 확장: weather_code·wind_gusts·visibility·cloud_cover·snowfall (점수 미사용 → 골든마스터 불변)
- **산 우선 검색**: lib/search.ts isMountain(대 제외), kind/categoryName, mountain=1 정렬
- **시간대**: 등산 추천창 04시~, 데이파트 4구간(새벽 포함), 섹션 제목 동적
- **오늘의 한마디 전면 심화**: 5개 활동 × 조건별 3~4개 수요밀착 (애견 진심 톤 기준)
- 순서 확정(수요순): 걷기→애견→러닝→등산→자전거, 기본탭 걷기, 탭 short 라벨
- 가이드 7종 전면 개편, layout/manifest 확장 문구, tip API 제거
- 검증: 테스트 17개 통과, 360/375/1440 브라우저 확인(등산 카드·2×2 데이파트·5탭 균등·콘솔 0)

배포: v0.4.0 태그 + push → Vercel 자동배포.

## 2026-07-05 (밤) — v0.3.0 자전거·정비

사용자 피드백 5건 기반 개선.
- 출퇴근 → **자전거** 교체: bike 프로필(precip0.24/wind0.22, windCap 11m/s→38), 라이딩 콘텐츠·복장 전면, 강풍 안내 배너
- **텍스트 전면 활동화**: "우중런/러닝복장/러닝알림/러닝기록" 등 공용 문구를 `terms`로 중앙관리 → 4개 활동에 맞게 표시. 지표 상세·차트·데이파트·알림까지 반영
- **색상 재설계**: 1등 카드 앰버 색면 제거→흰바탕+골드 액센트바(일출 카드와 충돌 해소). 브라우저에서 rank-1 배경 white 확인, 데이파트 "우중 걷기" 확인
- **애견 강화**: getDogPlan(신호등+추천길이+발바닥+체크리스트) 카드
- **선택 UI**: 좌측 레일 제거, 상단 탭 데스크탑까지 통일. 마지막 선택 활동 기억 유지
- 검증: 골든마스터 통과(러닝 불변), build OK, 4활동 브라우저 확인(모바일·데스크탑), 콘솔 에러 0

배포: v0.3.0 태그 + push → Vercel 자동배포.

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
