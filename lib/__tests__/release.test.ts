// 패키지 버전과 PWA 캐시 버전이 배포마다 함께 올라가는지 검증한다.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import packageInfo from "../../package.json";

describe("release metadata", () => {
  it("0.25.2 패키지와 공식 저장소 홈페이지를 함께 공개한다", () => {
    expect(packageInfo.version).toBe("0.25.2");
    expect(packageInfo.homepage).toBe("https://robom-labs.github.io/outbom/");
    expect(packageInfo.repository.url).toBe("https://github.com/robom-labs/outbom.git");
  });

  it("서비스워커 캐시가 패키지 버전과 일치한다", () => {
    const serviceWorker = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");
    expect(serviceWorker).toContain(`const CACHE_NAME = "outbom-v${packageInfo.version}"`);
    for (const asset of ["manifest.webmanifest", "icon-192.png", "icon-512.png", "maskable-512.png"]) {
      expect(serviceWorker).toContain(asset);
    }
    expect(serviceWorker).toContain('event.data?.type === "CACHE_APP_SHELL"');
    const registration = readFileSync(new URL("../../app/pwa-register.tsx", import.meta.url), "utf8");
    expect(registration).toContain('script[src], link[href], img[src]');
  });

  it("중앙 생성 봄 마크를 사용하고 랜덤 릴 진입점은 남기지 않는다", () => {
    const page = readFileSync(new URL("../../app/page.tsx", import.meta.url), "utf8");
    const wordmark = readFileSync(new URL("../../app/family-wordmark.tsx", import.meta.url), "utf8");
    const bomAsset = readFileSync(new URL("../../src/generated/robom-family/wordmark.svg", import.meta.url), "utf8");
    expect(page).toContain("<FamilyWordmark />");
    expect(page).not.toContain("TimeReel");
    expect(wordmark).toContain('<span className="sr-only">야외봄</span>');
    expect(wordmark).toContain('generated/robom-family/wordmark.svg');
    expect(bomAsset).toContain("#2f95a0");
  });

  it("immutable family lock과 여덟 생성물 hash가 일치한다", () => {
    const lock = JSON.parse(readFileSync(new URL("../../family.lock.json", import.meta.url), "utf8")) as {
      sourceCommit: string;
      familySpecVersion: string;
      files: Record<string, string>;
    };
    expect(lock.sourceCommit).toBe("ee0fd5dc5d98e0ced95c57897c20d2467289829b");
    expect(lock.familySpecVersion).toBe("1.0.0");
    expect(Object.keys(lock.files)).toHaveLength(8);
    for (const [name, expected] of Object.entries(lock.files)) {
      const content = readFileSync(new URL(`../../src/generated/robom-family/${name}`, import.meta.url));
      expect(`sha256:${createHash("sha256").update(content).digest("hex")}`).toBe(expected);
    }

    const appMeta = JSON.parse(readFileSync(new URL("../../src/generated/robom-family/app-meta.json", import.meta.url), "utf8")) as {
      id: string;
      familyApps: unknown[];
    };
    expect(appMeta.id).toBe("outbom");
    expect(appMeta.familyApps).toHaveLength(5);
  });

  it("설치 프롬프트와 iOS fallback을 앱 시작부터 연결한다", () => {
    const provider = readFileSync(new URL("../../app/pwa-install.tsx", import.meta.url), "utf8");
    const installCard = readFileSync(new URL("../../components/PwaInstallCard.tsx", import.meta.url), "utf8");
    expect(provider).toContain('window.addEventListener("beforeinstallprompt"');
    expect(provider).toContain('window.addEventListener("appinstalled"');
    expect(installCard).toContain("홈 화면에 추가");
    expect(installCard).toContain("업데이트 확인");
  });

  it("광고 SDK와 빈 광고 슬롯을 앱 셸에 포함하지 않는다", () => {
    const page = readFileSync(new URL("../../app/page.tsx", import.meta.url), "utf8");
    const dependencies = Object.keys(packageInfo.dependencies).join(" ");
    expect(page).not.toMatch(/AdSlot|adsbygoogle|doubleclick/i);
    expect(dependencies).not.toMatch(/adsense|admob|doubleclick/i);
  });
});
