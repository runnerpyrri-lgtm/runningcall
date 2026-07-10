// 서버리스 인스턴스별 in-memory 슬라이딩 윈도우 레이트리밋 + same-origin 검증.
// "완벽 방어"가 아니라 Kakao 유료 API 키 소진을 막는 저비용 첫 방어선이 목표.

type Bucket = { timestamps: number[] };

const buckets = new Map<string, Bucket>();

/**
 * key(보통 "라우트:클라이언트IP")에 대해 windowMs 동안 limit회까지 허용한다.
 * 슬라이딩 윈도우 방식 — 윈도우를 벗어난 오래된 요청 기록은 매 호출마다 정리한다.
 * @returns true=허용, false=한도초과
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key) ?? { timestamps: [] };

  bucket.timestamps = bucket.timestamps.filter((timestamp) => now - timestamp < windowMs);

  if (bucket.timestamps.length >= limit) {
    buckets.set(key, bucket);
    return false;
  }

  bucket.timestamps.push(now);
  buckets.set(key, bucket);
  return true;
}

/**
 * Origin/Referer 헤더가 요청 host와 같은 오리진인지 검증한다.
 * Origin 헤더가 있는데 host와 다르면 false, 아예 없으면(직접 API 호출 도구·헬스체크 등
 * 정상 트래픽 오탐 방지) 관대하게 true를 반환한다.
 */
export function isAllowedOrigin(request: Request): boolean {
  const host = request.headers.get("host");
  if (!host) {
    // host 헤더조차 없으면 판단 근거가 없다 — 관대하게 통과
    return true;
  }

  const origin = request.headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }

  const referer = request.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).host === host;
    } catch {
      return false;
    }
  }

  // Origin/Referer 둘 다 없으면(서버사이드 렌더링, curl, 헬스체크 등) 통과시킨다.
  return true;
}

/** 요청 헤더에서 레이트리밋 키로 쓸 클라이언트 IP를 뽑아낸다. */
export function getClientKey(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }
  return "unknown";
}
