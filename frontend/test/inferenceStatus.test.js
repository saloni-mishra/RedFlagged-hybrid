import test from "node:test";
import assert from "node:assert/strict";

import {
  getHybridStatusMessage,
  getInferenceBadge,
} from "../src/inferenceStatus.js";

test("inference badge uses the actual path", () => {
  const device = getInferenceBadge({
    path: "device",
    requestedPath: "device",
    actualPath: "device",
    reason: "Short English text fits the on-device budget.",
  });
  assert.equal(device.label, "Checked on your device");
  assert.equal(device.tone, "device");

  const cloud = getInferenceBadge({
    path: "cloud",
    requestedPath: "device",
    actualPath: "cloud",
    reason: "On-device inference failed; sent to cloud.",
  });
  assert.equal(cloud.label, "Sent to cloud");
  assert.equal(cloud.tone, "cloud");
  assert.match(cloud.detail, /On-device inference failed/);
  assert.match(cloud.detail, /Requested device; actual cloud/);

  const rulesOnly = getInferenceBadge({
    path: "rules-only",
    requestedPath: "cloud",
    actualPath: null,
    reason: "Cloud inference failed.",
  });
  assert.equal(rulesOnly.label, "Rules only (AI unavailable)");
  assert.equal(rulesOnly.tone, "rules");
  assert.match(rulesOnly.detail, /Cloud inference failed/);
});

test("hybrid status messages cover rules loading and device download progress", () => {
  assert.match(
    getHybridStatusMessage({ state: "rule-engine", ruleState: "loading" }),
    /first use/,
  );
  assert.match(
    getHybridStatusMessage({ state: "rule-engine", ruleState: "analyzing" }),
    /deterministic rules/,
  );
  assert.equal(
    getHybridStatusMessage({ state: "device-download", progress: 0.426 }),
    "Downloading on-device model: 43%",
  );
  assert.match(
    getHybridStatusMessage({ state: "device-generate" }),
    /on your device/,
  );
  assert.match(
    getHybridStatusMessage({
      state: "cloud-generate",
      reason: "PDF input is not eligible for on-device inference.",
    }),
    /PDF text to cloud/,
  );
  assert.match(
    getHybridStatusMessage({ state: "rules-only" }),
    /rule-based result/,
  );
  assert.equal(getHybridStatusMessage({ state: "done" }), "");
  assert.equal(getHybridStatusMessage({ state: "unknown" }), null);
});
