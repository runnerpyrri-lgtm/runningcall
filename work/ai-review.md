# 야외봄 모바일 UX·접근성·안정성 교차 검토 (누적 기록)

브랜치: `agent/mobile-ux-a11y` (Draft PR #11 `agent/mobile-primary-action` 위에서 시작 — CTA 상단 이동을 보존)
대상: `app/page.tsx`, `app/gacha.tsx`, `app/globals.css`, `lib/insights.ts`
검증 환경: Next dev(3399), Playwright 390×844·360×800(외부 날씨 API 차단 → `/api/forecast` 합성 목킹)

## 실측 baseline (구현 전, 라이브)

| 지표 | main(PR#11 이전) | PR#11 기반(=이 브랜치 시작점) |
|---|---|---|
| 추천 CTA top (390×844) | **663px** | **543px** |
| 추천 CTA top (360×800) | ~649px | **533px** |
| CTA가 지표보다 위? | 아니오 | 예 (`ctaBeforeMetrics: true`) |
| `.hero-prep`(준비물) 높이 | 32px | 32px |
| `.day-tab` 높이 | 40px | 44px |

→ CTA 상단 이동(약 120px↑)은 PR #11에서 이미 달성·라이브 확인. 이 작업은 그 위에 접근성·일관성·터치 개선을 순증한다.

---

## 담당자 독립 분석 요약

### 기획팀(planner) — 모바일 UX
- 첫 화면 문제: 가챠 카드가 폴드를 거의 다 차지(390에서 ~310px, 2.38s 자동 스핀) → 지표는 짧은 스크롤 아래.
- <44px 터치타깃: `hero-prep` 32(메인 경로), `saved-del` 32, `modal-close` 34, `sheet-close` 36, `saved-star/tag` 34, mobile `icon-button` 40.
- 고정 CTA: 카드 "탭=재개봉" 제스처와 충돌 + 소형 화면 콘텐츠 가림 → **역효과, 제외**.
- 로딩/오류 패널에 `role`/`aria-live` 없음(대기질 notice·카드 멘트는 이미 있음 → 일관성 결여).
- 최우선 3: (E)터치타깃 44px, (D)로딩/오류 aria-live, (C)다이얼로그 포커스+Esc.
- (G)getRankedWindows 중복은 "점수 로직 인접 → 코드 대신 제안/별도 검증" 보류 의견.

### 검사팀(inspector) — 안정성·테스트
- 현행 브랜치: typecheck PASS / test 49 PASS / build PASS.
- CONFIRMED 결함: (1)TimeReel 포커스 이동·트랩·복원·Esc·배경 격리 전무, (2)`.gpod` 공개 전 버튼이 `disabled`/`tabIndex=-1`/`aria-hidden` 없이 노출, (3)`loadForecast` 경합(순번 가드 없음).
- 반박(정상): SW 수명주기 정상(단 캐시 상한 없음 — 경미). 
- 정정: 역지오코딩 타임아웃은 **Nominatim만** 4.5s 존재, **Kakao 경로엔 없음**.
- getRankedWindows 직접 테스트 없음(getDayParts만 있음).
- **강한 반대 의견**: 포커스 트랩+배경 inert+forecast 경합을 한 PR에 몰면 오버레이 탭=스킵/닫기 로직과 얽혀 회귀 위험 큼 → 저위험 a11y만 이번 PR, 트랩·inert·경합·Kakao 타임아웃은 분리.

### 설계팀(architect) — 구조·중복
- `getRankedWindows` 렌더당 2회 호출(`page.tsx:1681`, `:1996`) + `new Date().getHours()` 이중 평가 → **정시 경계 플래키**와 "CTA 보이는데 릴 안 열리는" 죽은 버튼 씨앗. `byHour` 필터는 현재 아무것도 안 거름(오늘은 두 기준 동일).
- 일원화(useMemo 1개, `hasRecommendedWindow = reelRanks.length>0`, nowHour 1회 확정) **채택, 회귀 하**. lib/insights 불변.
- 다이얼로그 a11y는 gacha.tsx 내부 useEffect+ref로 최소 침습 가능(트랩·inert는 회귀 중). aria-live는 속성만.
- **금지**: page.tsx(2148줄) 분해, 전역 live 리전 신설, getRankedWindows 시그니처 변경, focus-trap 공용 유틸 신규 파일(단일 다이얼로그엔 과설계).

---

## Claude Code(리드) 교차 검토 — 채택/반박/보완

- **(C) 다이얼로그 a11y**: 채택. 단 architect(트랩 가능)와 inspector(트랩+inert 분리) 충돌을 조정 →
  - 채택(저위험, 만장일치): 열 때 오버레이 컨테이너(`tabIndex=-1`)로 초기 포커스 이동 + Esc(진행 중 skip / 완료 후 close) + 닫을 때 트리거로 복원 + `.gpod` 미공개 버튼 `aria-hidden`+`tabIndex=-1`.
  - **보완(inspector 반영)**: 배경 DOM `inert` 배선은 다이얼로그가 inert 하위로 들어갈 구조 위험이 있어 **제외**. 대신 `aria-modal="true"`(이미 있음)+포커스 이동+Tab 트랩(오버레이 keydown 한정, onClick 무관)으로 표준 다이얼로그 패턴만 적용. 트랩은 click 로직을 건드리지 않아 스핀 스킵/닫기 UX 회귀 없음.
- **(D) 로딩/오류 aria-live**: 채택(만장일치). loading=`role="status" aria-live="polite"`, error=`role="alert"`. 속성만, 회귀 하.
- **(E) 터치타깃 44px**: 채택. 메인 경로 `hero-prep` 32→44 우선 + 주요 dismiss 버튼(`modal-close`,`sheet-close`,`saved-del`,`saved-star/tag`) 44화. CSS만.
- **(G) getRankedWindows 일원화**: 채택(architect 근거). planner의 "점수 로직 인접" 우려는 **lib/insights를 건드리지 않고 page.tsx 호출부만 통합**하므로 해소. inspector 요청대로 **회귀 테스트를 선행**해 안전망 확보.
- **테스트**: getRankedWindows 회귀 테스트 신규(신규 파일 첫 줄 한국어 주석).
- **(A) CTA 상단 이동**: 유지 확정(되돌리지 않음).
- **(B) 고정 CTA**: 제외(planner 근거 + 카드 재개봉 제스처 충돌).

### 담당자 보완/반대 라운드 (교차)
- planner→ClaudeCode: (G)를 코드로 하는 것에 반대했으나, "lib 불변 + 테스트 선행" 조건이면 죽은 버튼/플래키 제거 효과가 커 **조건부 수용**으로 전환.
- inspector→architect: 트랩을 넣더라도 배경 inert 배선은 빼라 → 리드가 수용(inert 제외).
- architect→inspector: 경합(forecast race)은 실재하나 이번 PR 성격(모바일 a11y)과 무관하고 로딩/에러 흐름 회귀 폭이 크므로 **별도 데이터-신뢰 PR로 분리**에 합의.
- 공통 합의: Kakao 역지오코딩 타임아웃·SW 캐시 상한은 서버/캐시 영역 → 별도 PR.

---

## 각 제안 상세 (근거·영향·터치·난이도·회귀·판정)

| 제안 | 근거(코드) | 사용자 영향 | 모바일 터치 | 난이도 | 회귀 | 판정 |
|---|---|---|---|---|---|---|
| C 다이얼로그 a11y | gacha.tsx:881–924 포커스·Esc·gpod 노출 | 키보드·SR 사용자 조작 가능 | SR 스와이프 순서 정상화 | 중 | 중(트랩) | **채택** |
| D 로딩/오류 aria-live | page.tsx:1905–1917 | 상태 인지(보조기술) | 간접 | 하 | 하 | **채택** |
| E 터치타깃 44px | globals.css:449/1900/3646/3616/1655/1389 | 오탭 감소 | 직접·큼 | 하 | 하 | **채택** |
| G getRankedWindows 일원화 | page.tsx:1681·1996, insights.ts:76 | 죽은 버튼/플래키 제거 | 간접 | 하~중 | 하 | **채택** |
| T getRankedWindows 테스트 | lib/__tests__ 부재 | 회귀 방지 | — | 하 | 하 | **채택** |
| A CTA 상단 이동(PR#11) | globals.css 7345~ | CTA 120px↑ | 큼 | — | — | **유지** |
| B 고정 CTA | — | — | 역효과 | — | — | **제외** |
| S1 forecast 경합 가드 | page.tsx:1169–1214 | 위치 오표시 방지 | 없음 | 중 | 중 | **보류(별도 PR)** |
| S2 Kakao 역지오코딩 타임아웃 | reverse-location:62–67 | 무응답 시 지연 | 없음 | 하 | 하 | **보류(별도 PR)** |
| S3 SW 캐시 상한 | sw.js:34 | 저장공간 | 없음 | 하 | 하 | **보류(별도 PR)** |
| F 날짜 탭 의미론 | page.tsx:1920 | 낮음 | 낮음 | 하 | 중 | **보류** |

---

## 리드 최종 범위 (이번 수술식 PR)

1. 다이얼로그 a11y(초기 포커스+Esc+복원+Tab 트랩+gpod 게이팅, 배경 inert 제외)
2. 로딩/오류 aria-live
3. 메인 경로 터치타깃 44px화
4. getRankedWindows 호출부 useMemo 일원화(lib 불변, CTA 노출=릴 가드 동일화)
5. getRankedWindows 회귀 테스트 신규

보류(별도 PR, 사유 명시): forecast 경합 가드·Kakao 타임아웃·SW 캐시 상한(데이터/서버 영역·회귀 폭), 고정 CTA(역효과), 날짜 탭 의미론(체감 낮음), 배경 inert 배선(구조 위험).

---

## 작업 중 사용자 디자인 피드백 반영 (실측 스크린샷 기반)

사용자가 실기기 화면을 보고 "카드 바로 밑 한 줄 멘트(`🍀 평범하지만 나쁘지 않아요`)가 카드에 바짝 붙어 답답하다. 없애고 지표가 바로 나오게 하거나 카드 안에 넣어라"고 지시.
- 진단: 그 줄은 `gacha.tsx`의 `.gsay`(tier별 say)로, 카드 안 등급 문구(`.gc-odds` "흔하지만 나쁘지 않아요")·판정(`.gc-verdict`)과 의미가 겹치는 **중복 텍스트**.
- 결정(리드): 모바일에서 `.gsay`를 **시각적으로 제거하되 스크린리더 안내(aria-live)는 유지**(sr-only). 카드가 이미 정보를 담고 있어 중복 제거가 옵션(a)에 부합하고, 카드 내부 중복 삽입(옵션 b)보다 깔끔. 데스크톱은 변경하지 않음.
- 효과: 카드 아래 답답한 줄 제거 → CTA·지표가 위로 상승(아래 실측).

## 구현 결과 (최종, 이 PR)

1. 다이얼로그 a11y (`gacha.tsx`): 열 때 오버레이로 포커스 이동, Tab 트랩(오버레이 keydown 한정), Esc(진행 중 skip/완료 후 close), 닫을 때 트리거로 포커스 복원, 미공개 `.gpod` 버튼 `aria-hidden`+`tabIndex=-1`. 배경 inert 배선은 제외(inspector 반영).
2. 로딩/오류 aria-live (`page.tsx`): loading=`role="status" aria-live="polite"`, error 패널·인라인 notice=`role="alert"`.
3. 터치타깃 44px (`globals.css`): 모바일 `hero-prep` 32→44, `sheet-close` 36→44, `modal-close` 34→44, `saved-del` 32→44, `saved-star/tag` 34→44.
4. getRankedWindows 일원화 (`page.tsx`): `recommendation` useMemo 1개로 통합, `hasRecommendedWindow = recommendation.ranks.length>0`, `new Date().getHours()` 1회 확정. lib/insights 불변.
5. 회귀 테스트 신규 (`lib/__tests__/insights-windows.test.ts`): 정렬·중복제거·비/점수 필터·과거시각 제외·활동별 시작시각·pm2.5 결측 라벨 6종.
+ 모바일 `.gsay` sr-only(위 피드백).

## 검증 (라이브, 390×844 / 360×800, `/api/forecast` 목킹)

- typecheck PASS · test **55 passed**(기존 49+신규 6) · build PASS.
- 추천 CTA top: main **663** → PR#11 **543** → 이 PR **519**(390) / 509(360). 지표(hero-metrics) 605→581.
- CTA가 지표보다 위(`ctaBeforeMetrics: true`) 유지. `hero-prep` 높이 32→**44**.
- 다이얼로그 a11y 실측: 열 때 포커스 다이얼로그 내부로 이동(true), 스핀 중 순위 버튼 3개 `aria-hidden`+`tabIndex=-1`(hidden 3/3), 공개 후 3개 탭 가능(3/3), 완료 후 Esc → 닫힘+CTA로 포커스 복원(true).
