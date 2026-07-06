# v0.8.0 "출발선" 디자인 업그레이드 체크리스트

방향: 어두운 아스팔트 네이비 + 신호등 시그널 컬러(초록 GO / 앰버 주의 / 오렌지·레드 나쁨).
점수는 대형 신호 다이얼 정중앙, 활동별 픽토그램이 신호등처럼 바뀜.

## 준비

- [x] main에 `v0.7.1-golden` 태그 (롤백 지점)
- [x] `design/v0.8-departure` 브랜치 생성
- [x] checklist.md / context-notes.md 작성

## 구현

- [x] `lib/pictograms.tsx` — 활동 5종(run/walk/dog/hike/bike) SVG 픽토그램 컴포넌트
- [x] 히어로 → 신호 다이얼(conic 링 + 픽토그램 + 대형 점수 + 등급칩) 재설계
- [x] `:root` 토큰 다크 플립 + body 배경 교체
- [x] 히어로 주변(칩·타임라인 패널·랭킹·탭) 하드코딩 라이트 색 스윕
- [x] ActivityRail/탭/드로어 이모지 → 픽토그램 교체
- [x] 보조 화면(저널·도전과제·시트·드로어) 다크 깨짐 스윕

## 마무리

- [x] package.json 0.8.0 + CHANGELOG
- [x] typecheck / vitest(47) / build 통과
- [x] dev 서버에서 판단·준비·기록·가이드·일지·도전과제·지표시트·데스크탑 확인
- [ ] 시맨틱 커밋 (픽토그램 / 디자인 / 릴리스 분리)
- [ ] 사용자 최종 컨펌 후 main 머지
