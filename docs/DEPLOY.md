# 러닝콜 배포 가이드 (1단계: 컴퓨터 꺼져도 작동)

이 문서만 따라 하면 러닝콜이 클라우드에서 24시간 작동합니다.
Claude가 코드는 준비해두고, **로그인이 필요한 부분만 당신이** 클릭하면 됩니다.

---

## 1단계 · GitHub에 코드 올리기

1. https://github.com 로그인 → 우측 상단 `+` → **New repository**
2. Repository name: `runningcall` / **Private** 선택 / 나머지 체크박스는 다 끄고 → **Create repository**
3. 생성 후 나오는 저장소 주소(HTTPS 또는 SSH)를 복사해서 Claude에게 붙여넣기.
   그러면 Claude가 아래 명령으로 push합니다 (예시):
   ```
   git remote add origin <복사한 주소>
   git push -u origin main
   git push origin v0.1.0
   ```
   ※ push 시 GitHub 로그인/토큰이 필요할 수 있어요. 물어보면 화면 안내대로 인증하세요.

## 2단계 · Vercel에 연결 (자동 배포)

1. https://vercel.com → **Continue with GitHub** (같은 계정으로 로그인)
2. **Add New… → Project** → 방금 만든 `runningcall` 저장소 **Import**
3. 설정은 **건드리지 말고** (Next.js 자동 감지됨) → **Deploy** 클릭
4. 1~2분 후 `https://runningcall-xxxx.vercel.app` 주소가 나옵니다 → **이게 상시 주소**
5. 폰에서 접속 → Chrome 메뉴 → **앱 설치** 로 PWA 설치 테스트
   → 이제 컴퓨터를 꺼도 이 주소는 계속 열립니다. ✅

> 앞으로 코드가 바뀔 때: Claude가 `git push` 하면 Vercel이 **자동으로 재배포**합니다. 별도 작업 없음.

## 3단계 · 카카오 REST 키 (위치 검색 기능용)

키가 없으면 위치 검색 기능이 비활성화되고 앱이 "위치 검색 연결을 준비 중"이라고 안내합니다(현재 위치·기본 도시는 계속 작동). 검색을 쓰려면 카카오 키가 필요합니다.

1. https://developers.kakao.com 로그인 → **내 애플리케이션 → 애플리케이션 추가하기**
   - 앱 이름: `러닝콜` / 사업자명: 아무거나(본인 이름 가능) → 저장
2. 생성된 앱 클릭 → **앱 키** 화면에서 **REST API 키** 복사
3. **플랫폼 → Web 플랫폼 등록**에 사이트 도메인 추가:
   - `https://runningcall-xxxx.vercel.app` (2단계에서 받은 실제 주소)
   - (로컬 테스트용) `http://localhost:3000`
4. Vercel → 프로젝트 → **Settings → Environment Variables**:
   - Key: `KAKAO_REST_API_KEY` / Value: 복사한 REST 키 / Environment: Production, Preview, Development 모두 체크 → **Save**
5. Vercel → **Deployments → 최신 → ⋯ → Redeploy** (환경변수 적용을 위해 한 번 재배포)

---

## 참고
- 무료 범위로 충분합니다 (Vercel Hobby 플랜).
- 도메인 연결(2단계 로드맵)은 이 배포가 안정화된 뒤 진행합니다.
- 문제가 생기면 Vercel 프로젝트 → **Deployments → 로그**를 Claude에게 보여주세요.
