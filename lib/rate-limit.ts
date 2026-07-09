// API 남용 방어 — 베스트-에포트 인메모리 레이트리밋.
//
// 목적: /api/* 프록시가 서버의 KAKAO_REST_API_KEY(유료 쿼터)를 쓰므로,
//       외부에서 무한 호출 시 쿼터가 소진되는 것을 막는다.
//
// 한계(솔직히): Vercel 서버리스는 인스턴스마다 메모리가 분리되어 이 카운터가
//       인스턴스별로만 동작한다. 웜 인스턴스로 들어오는 남용에는 실질적 제동을 걸지만
//       완전한 보호는 아니다. 강한 보호가 필요하면 공유 저장소(Vercel KV / Upstash)로
//       교체할 것(후속 과제).

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/** 만료된 버킷 정리(메모리 누수 방지). */
function sweep(now: number) {
  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) {
      buckets.delete(key);
    }
  }
}

/**
 * 고정 윈도 레이트리밋. 실사용자는 절대 닿지 않는 넉넉한 기본값(10초당 30회).
 * @returns ok=false 면 한도 초과, retryAfter(초) 후 재시도.
 */
export function rateLimit(
  key: string,
  limit = 30,
  windowMs = 10_000
): { ok: boolean; retryAfter: number } {
  const now = Date.now();

  if (buckets.size > 5000) {
    sweep(now);
  }

  const bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }

  if (bucket.count >= limit) {
    return { ok: false, retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  }

  bucket.count += 1;
  return { ok: true, retryAfter: 0 };
}

/** 요청자 식별 키(프록시 뒤 실제 IP). 없으면 "unknown". */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0]?.trim() : "";
  return ip || request.headers.get("x-real-ip") || "unknown";
}

/** 테스트용: 내부 상태 초기화. */
export function __resetRateLimit() {
  buckets.clear();
}
