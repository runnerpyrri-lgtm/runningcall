// 패키지 버전과 PWA 캐시 버전이 배포마다 함께 올라가는지 검증한다.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import packageInfo from "../../package.json";

describe("release metadata", () => {
  it("서비스워커 캐시가 패키지 버전과 일치한다", () => {
    const serviceWorker = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");
    expect(serviceWorker).toContain(`const CACHE_NAME = "outbom-v${packageInfo.version}"`);
  });
});
