# Changelog

러닝콜의 모든 주요 변경사항을 이 파일에 기록합니다.
형식은 [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/), 버전은 [유의적 버전(SemVer)](https://semver.org/lang/ko/)을 따릅니다.

## [Unreleased]
- (다음 배포에 포함될 변경사항을 여기에 쌓습니다)

## [0.1.0] - 2026-07-05
첫 버전 고정. 지금까지 만든 기능을 하나의 baseline으로 확정.

### Added
- 러닝 컨디션 점수 (0~100) — 날씨 + 대기질 기반, 강수/체감온도/바람 하드캡
- 시간대별 최적 러닝 시간 추천 (1·2·3순위, 새벽/야간 제외)
- 6개 지표 상세 시트 + 인터랙티브 차트 (체감온도·강수·미세먼지·자외선·바람·습도)
- 시간대별 복장 추천 (날씨 변화 반영, 자외선 시 선글라스 등)
- 러닝 기록·스트릭·캘린더 + 주간 목표 설정
- 위치 검색 (카카오 Local API, Nominatim 폴백) + 즐겨찾기/최근
- 어제·오늘·내일 연속 타임라인 (Open-Meteo, past_days=1 / forecast_days=2)
- PWA 설치 + 알림 (Notification Triggers, 미지원 시 setTimeout 폴백)
- 브라이트 에너지 디자인 (코발트 + 라임), Pretendard/Black Han Sans

### Tech
- Next.js 16 (Turbopack) + React 19 + TypeScript
- 코드 약 6,100줄, `app/page.tsx`에 UI 집중

[Unreleased]: https://example.com/compare/v0.1.0...HEAD
[0.1.0]: https://example.com/releases/tag/v0.1.0
