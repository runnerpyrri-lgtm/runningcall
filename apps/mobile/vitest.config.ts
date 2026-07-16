// 네이티브 순수 로직과 설정 계약 테스트만 모바일 프로젝트 안에서 실행한다.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"]
  }
});
