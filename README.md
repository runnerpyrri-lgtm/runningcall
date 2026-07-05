# 오늘 러닝 적기

기온, 습도, 미세먼지, 자외선지수를 합산해 오늘 남은 시간 중 러닝하기 좋은 시간을 0~100점으로 보여주는 모바일 반응형 웹사이트입니다.

## 실행

```bash
pnpm install
pnpm dev
```

## 데이터

- 날씨: Open-Meteo Forecast API
- 미세먼지: Open-Meteo Air Quality API
- 좌표 기반 hourly 데이터를 받아 24시간 점수를 계산합니다.

## 점수 로직

- 미세먼지 40%: PM2.5 0~15, PM10 0~30을 가장 좋게 평가
- 자외선 25%: UVI 0~2 최상, 높을수록 감점
- 기온 20%: 10~18°C 최상, 더위와 추위 모두 감점
- 습도 15%: 40~60% 최상, 건조와 다습 모두 감점

## Vercel AI Gateway 설정

AI 키가 없으면 로컬 기본 문구로 동작합니다. 키를 넣으면 `/api/tip` 라우트가 Vercel AI Gateway를 통해 Claude 모델로 오늘의 한마디를 생성합니다.

1. Vercel 대시보드에서 AI Gateway API Keys 페이지로 이동
2. Create key를 눌러 키 생성
3. 로컬 `.env.local`에 추가

```bash
AI_GATEWAY_API_KEY=your_ai_gateway_api_key
AI_GATEWAY_MODEL=anthropic/claude-sonnet-4.6
```

Vercel 배포 시에도 Project Settings의 Environment Variables에 같은 값을 추가하면 됩니다.

## 배포

Vercel에 프로젝트를 연결한 뒤 기본 Next.js 설정으로 배포하면 됩니다. 애드센스 스크립트는 심사 통과 후 `app/page.tsx`의 광고 슬롯 위치에 삽입하면 됩니다.
