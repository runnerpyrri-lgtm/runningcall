// Expo SDK 57 기본 flat config로 네이티브 TypeScript 소스를 검사한다.
const { defineConfig, globalIgnores } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  globalIgnores(["dist/*"]),
  expoConfig
]);
