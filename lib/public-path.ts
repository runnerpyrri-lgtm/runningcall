// GitHub Pages 하위 경로와 기존 Vercel 루트 배포가 같은 클라이언트 코드를 쓰도록 공개 경로를 정규화한다.
const rawBasePath = process.env.NEXT_PUBLIC_APP_BASE_PATH ?? "";

export const APP_BASE_PATH = rawBasePath
  ? `/${rawBasePath.replace(/^\/+|\/+$/g, "")}`
  : "";

export const PUBLIC_ORIGIN = (
  process.env.NEXT_PUBLIC_PUBLIC_ORIGIN ?? "https://robom-labs.github.io/outbom"
).replace(/\/+$/, "");

export const API_ORIGIN = (process.env.NEXT_PUBLIC_API_ORIGIN ?? "").replace(/\/+$/, "");

export function publicPath(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${APP_BASE_PATH}${normalized}`;
}

export function apiPath(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${API_ORIGIN}${normalized}`;
}
