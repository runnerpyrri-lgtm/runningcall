// 패키지 버전과 PWA 캐시 버전이 배포마다 함께 올라가는지 검증한다.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import packageInfo from "../../package.json";

describe("release metadata", () => {
  it("서비스워커 캐시가 패키지 버전과 일치한다", () => {
    const serviceWorker = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");
    expect(serviceWorker).toContain(`const CACHE_NAME = "outbom-v${packageInfo.version}"`);
  });

  it("커스텀 봄 마크를 사용하고 랜덤 릴 진입점은 남기지 않는다", () => {
    const page = readFileSync(new URL("../../app/page.tsx", import.meta.url), "utf8");
    const wordmark = readFileSync(new URL("../../app/family-wordmark.tsx", import.meta.url), "utf8");
    const bomAsset = readFileSync(new URL("../../public/bom-outbom.svg", import.meta.url), "utf8");
    expect(page).toContain("<FamilyWordmark />");
    expect(page).not.toContain("TimeReel");
    expect(wordmark).toContain('aria-label="야외봄"');
    expect(bomAsset).toContain("#2f95a0");
  });
});
