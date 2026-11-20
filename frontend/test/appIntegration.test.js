import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appSource = readFileSync(
  new URL("../src/App.jsx", import.meta.url),
  "utf8",
);
const uploadSource = readFileSync(
  new URL("../src/uploadPipeline.js", import.meta.url),
  "utf8",
);

test("App text analysis uses hybridAnalyze instead of /api/analyze", () => {
  assert.match(appSource, /from ['"]\.\/hybridAnalyze\.js['"]/);
  assert.match(appSource, /hybridAnalyze\(/);
  assert.doesNotMatch(appSource, /\/api\/analyze/);
});

test("App upload flow keeps PDF extraction and image processing distinct", () => {
  assert.match(appSource, /processUploadedFile/);
  assert.match(uploadSource, /\/api\/extract-text/);
  assert.match(appSource, /sourceType/);
  assert.match(appSource, /getInferenceBadge/);
  assert.match(appSource, /getHybridStatusMessage/);
  assert.match(appSource, /from ['"]\.\/firebase\.js['"]/);
});

test("App keeps the existing demo examples and file input", () => {
  assert.match(appSource, /DEMO_EXAMPLES/);
  assert.match(appSource, /Government impersonation/);
  assert.match(appSource, /Payment scam/);
  assert.match(appSource, /accept="\.pdf,image\/\*"/);
});
