// immutable 로봄 정본에서 생성된 패밀리 파일과 lock 해시를 앱 CI에서 재검증한다.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

const EXPECTED_SOURCE_COMMIT = "916477ce665a73d2f91c29d4bae510f111a57047";
const EXPECTED_FILES = [
  "analytics-events.ts",
  "app-meta.json",
  "auth-config.json",
  "feature-flags.json",
  "icons.svg",
  "settings-contract.json",
  "tokens.css",
  "wordmark.svg"
];

const [generatedDirArg, lockFileArg] = process.argv.slice(2);
if (!generatedDirArg || !lockFileArg) {
  throw new Error("사용법: verify-family.mjs <generated-dir> <lock-file>");
}

const generatedDir = resolve(generatedDirArg);
const lockFile = resolve(lockFileArg);
const lock = JSON.parse(await readFile(lockFile, "utf8"));

if (lock.sourceCommit !== EXPECTED_SOURCE_COMMIT) {
  throw new Error(`family sourceCommit 불일치: ${lock.sourceCommit}`);
}
if (lock.familySpecVersion !== "1.0.0") {
  throw new Error(`지원하지 않는 familySpecVersion: ${lock.familySpecVersion}`);
}

const lockedFiles = Object.keys(lock.files ?? {}).sort();
if (JSON.stringify(lockedFiles) !== JSON.stringify(EXPECTED_FILES)) {
  throw new Error(`생성 파일 목록 불일치: ${lockedFiles.join(", ")}`);
}

for (const name of EXPECTED_FILES) {
  if (basename(name) !== name) throw new Error(`잘못된 생성 파일 경로: ${name}`);
  const content = await readFile(resolve(generatedDir, name));
  const actual = `sha256:${createHash("sha256").update(content).digest("hex")}`;
  if (lock.files[name] !== actual) throw new Error(`${name} hash 불일치`);
}

const appMeta = JSON.parse(await readFile(resolve(generatedDir, "app-meta.json"), "utf8"));
if (appMeta.id !== "outbom" || appMeta.familySpecVersion !== lock.familySpecVersion) {
  throw new Error("OutBom 앱 메타와 family lock이 일치하지 않습니다.");
}
if (!Array.isArray(appMeta.familyApps) || appMeta.familyApps.length !== 6) {
  throw new Error("여섯 앱 메타가 모두 생성되지 않았습니다.");
}

console.log(`family ${lock.familySpecVersion} verified at ${lock.sourceCommit}`);
