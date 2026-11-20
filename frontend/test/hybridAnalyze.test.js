import test from "node:test";
import assert from "node:assert/strict";

import { InferenceSource } from "firebase/ai";

import { AiResponseError } from "../src/analysis/index.js";
import {
  chooseRequestedPath,
  createHybridAnalyzer,
  estimateTokens,
  isLikelyHindiText,
  isPdfSource,
  ON_DEVICE_INPUT_TOKEN_BUDGET,
  ON_DEVICE_MAX_MESSAGE_CHARS,
} from "../src/hybridAnalyze.js";

const VALID_AI_RESULT = {
  situation_type: "Likely scam",
  // Deliberately different from the rule engine result.
  risk_level: "LOW",
  summary: "AI summary",
  red_flags: [
    {
      indicator: "Urgency",
      evidence: "URGENT",
      explanation: "Creates pressure.",
    },
  ],
  safe_next_steps: ["Do not pay."],
  verification_guidance: ["Use the official website."],
  disclaimer: "Not legal advice.",
};

function makeRuleBreakdown() {
  return [
    {
      rule: "Urgent deadline or coercion",
      rule_hi: "तुरंत कार्रवाई का दबाव या धमकी",
      points: 35,
      triggered: true,
      evidence: "URGENT",
      explanation: "Coercive urgency indicators detected.",
    },
    {
      rule: "Financial demand or digital payment",
      rule_hi: "पैसे की मांग या डिजिटल भुगतान",
      points: 35,
      triggered: true,
      evidence: "Pay Rs 1,000",
      explanation: "Financial demand detected.",
    },
    {
      rule: "Suspicious external link",
      rule_hi: "संदिग्ध बाहरी लिंक",
      points: 0,
      triggered: false,
      evidence: "",
      explanation: "No deceptive links found.",
      classification: "none",
    },
    {
      rule: "OTP, Aadhaar, or credential request",
      rule_hi: "OTP, आधार या पासवर्ड की मांग",
      points: 0,
      triggered: false,
      evidence: "",
      explanation: "No credential-harvesting language found.",
    },
    {
      rule: "Courier or customs hold scam",
      rule_hi: "कूरियर या कस्टम होल्ड स्कैम",
      points: 0,
      triggered: false,
      evidence: "",
      explanation: "No courier patterns found.",
    },
    {
      rule: "Job or recruitment scam lure",
      rule_hi: "नौकरी या भर्ती स्कैम का लालच",
      points: 0,
      triggered: false,
      evidence: "",
      explanation: "No job-lure patterns found.",
    },
  ];
}

function makeRuleResults(overrides = {}) {
  return {
    rule_score: 82,
    raw_points: 70,
    risk_level: "HIGH",
    flags: ["High-pressure urgency or legal intimidation detected."],
    extracted_urls: [],
    unverified_urls: [],
    amounts: ["Rs 1,000"],
    payment_handles: [],
    urgency_phrases: ["URGENT"],
    rule_breakdown: makeRuleBreakdown(),
    language: "en",
    ...overrides,
  };
}

function makeAnalyzer({
  ruleResults = makeRuleResults(),
  deviceSupported = true,
  deviceSource = InferenceSource.ON_DEVICE,
  cloudSource = InferenceSource.IN_CLOUD,
  deviceError = null,
  cloudError = null,
  initError = null,
  analyzeRulesImpl = null,
  aiResult = VALID_AI_RESULT,
  dependencies = {},
} = {}) {
  const calls = {
    analyze: 0,
    deviceInit: 0,
    deviceGenerate: 0,
    cloudGenerate: 0,
    availability: 0,
  };

  const deviceModel = { kind: "device" };
  const cloudModel = { kind: "cloud" };
  const statuses = [];

  const analyze = createHybridAnalyzer({
    analyzeRules: async (input) => {
      calls.analyze += 1;
      return analyzeRulesImpl ? analyzeRulesImpl(input) : ruleResults;
    },
    checkDeviceAvailability: async () => {
      calls.availability += 1;
      return {
        status: deviceSupported ? "available" : "unavailable",
        supported: deviceSupported,
      };
    },
    initializeDeviceInference: async (model, onProgress) => {
      calls.deviceInit += 1;
      assert.equal(model, deviceModel);
      onProgress?.(0.5);
      if (initError) throw initError;
    },
    generateAiJson: async (model) => {
      if (model === deviceModel) {
        calls.deviceGenerate += 1;
        if (deviceError) throw deviceError;
        return {
          data: aiResult,
          inferenceSource: deviceSource,
          rawText: JSON.stringify(aiResult),
        };
      }

      if (model === cloudModel) {
        calls.cloudGenerate += 1;
        if (cloudError) throw cloudError;
        return {
          data: aiResult,
          inferenceSource: cloudSource,
          rawText: JSON.stringify(aiResult),
        };
      }

      throw new Error("Unexpected model");
    },
    ...dependencies,
  });

  return {
    analyze: (text, options = {}) =>
      analyze(text, {
        models: { device: deviceModel, cloud: cloudModel },
        onStatus: (status) => statuses.push(status),
        ...options,
      }),
    calls,
    statuses,
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function makeSdkModel({ text, inferenceSource }) {
  return {
    initializeDeviceModel: async (onProgress) => {
      onProgress?.(1);
    },
    generateContent: async () => ({
      response: {
        text: () => text,
        inferenceSource,
      },
    }),
  };
}

test("on-device budget constants are derived from the 9216-token cap", () => {
  assert.equal(ON_DEVICE_INPUT_TOKEN_BUDGET, 5708);
  assert.equal(estimateTokens("123456"), 2);
  assert.equal(
    chooseRequestedPath({
      text: "short",
      language: "en",
      prompt: "short prompt",
    }).path,
    "device",
  );
});

test("requested path is cloud for Hindi, long messages, PDFs, and oversized prompts", () => {
  const hindi = chooseRequestedPath({
    text: "आपका खाता ब्लॉक हो जाएगा",
    language: "hi",
    prompt: "prompt",
  });
  assert.equal(hindi.path, "cloud");
  assert.match(hindi.reason, /English/);

  const long = chooseRequestedPath({
    text: "a".repeat(ON_DEVICE_MAX_MESSAGE_CHARS + 1),
    language: "en",
    prompt: "prompt",
  });
  assert.equal(long.path, "cloud");
  assert.match(long.reason, /longer/);

  const pdf = chooseRequestedPath({
    text: "short",
    language: "en",
    prompt: "prompt",
    sourceType: "pdf",
  });
  assert.equal(pdf.path, "cloud");
  assert.match(pdf.reason, /PDF/);

  const oversized = chooseRequestedPath({
    text: "short",
    language: "en",
    prompt: "x".repeat(20000),
  });
  assert.equal(oversized.path, "cloud");
  assert.match(oversized.reason, /budget/);
});

test("short English message uses device and keeps rule score and risk", async () => {
  const rules = makeRuleResults();
  const { analyze, calls, statuses } = makeAnalyzer({ ruleResults: rules });

  const result = await analyze("URGENT: Your account is blocked. Pay Rs 1,000 now.");

  assert.equal(result.requestedPath, "device");
  assert.equal(result.actualPath, "device");
  assert.equal(result.path, "device");
  assert.equal(result.inferenceSource, InferenceSource.ON_DEVICE);
  assert.equal(result.analysis.risk_level, rules.risk_level);
  assert.equal(result.analysis.calculated_score, rules.rule_score);
  assert.equal(result.analysis.summary, VALID_AI_RESULT.summary);
  assert.equal(result.analysis.rule_breakdown[0].evidence, "URGENT");
  assert.equal(calls.deviceInit, 1);
  assert.equal(calls.deviceGenerate, 1);
  assert.equal(calls.cloudGenerate, 0);
  assert.ok(
    statuses.some(
      (status) => status.state === "device-download" && status.progress === 0.5,
    ),
  );
  assert.ok(statuses.some((status) => status.state === "done"));
});

test("Hindi message uses cloud and does not initialize the device", async () => {
  const rules = makeRuleResults({ language: "hi" });
  const { analyze, calls } = makeAnalyzer({ ruleResults: rules });

  const result = await analyze("आपका खाता ब्लॉक हो जाएगा। तुरंत भुगतान करें।");

  assert.equal(result.requestedPath, "cloud");
  assert.equal(result.actualPath, "cloud");
  assert.equal(result.path, "cloud");
  assert.equal(result.inferenceSource, InferenceSource.IN_CLOUD);
  assert.match(result.reason, /English/);
  assert.equal(calls.deviceInit, 0);
  assert.equal(calls.deviceGenerate, 0);
  assert.equal(calls.cloudGenerate, 1);
  assert.equal(result.analysis.risk_level, rules.risk_level);
});

test("long English message uses cloud and does not initialize the device", async () => {
  const rules = makeRuleResults();
  const { analyze, calls } = makeAnalyzer({ ruleResults: rules });

  const result = await analyze("a".repeat(ON_DEVICE_MAX_MESSAGE_CHARS + 1));

  assert.equal(result.requestedPath, "cloud");
  assert.equal(result.actualPath, "cloud");
  assert.equal(result.path, "cloud");
  assert.match(result.reason, /longer/);
  assert.equal(calls.deviceInit, 0);
  assert.equal(calls.deviceGenerate, 0);
  assert.equal(calls.cloudGenerate, 1);
});

test("actual inference source is reported separately from the requested path", async () => {
  const rules = makeRuleResults();
  const { analyze, calls } = makeAnalyzer({
    ruleResults: rules,
    deviceSource: InferenceSource.IN_CLOUD,
  });

  const result = await analyze("URGENT: Your account is blocked.");

  assert.equal(result.requestedPath, "device");
  assert.equal(result.actualPath, "cloud");
  assert.equal(result.path, "cloud");
  assert.equal(result.inferenceSource, InferenceSource.IN_CLOUD);
  assert.match(result.reason, /handled in the cloud/);
  assert.equal(calls.deviceGenerate, 1);
  assert.equal(calls.cloudGenerate, 0);
});

test("device initialization failure falls back to cloud", async () => {
  const rules = makeRuleResults();
  const { analyze, calls } = makeAnalyzer({
    ruleResults: rules,
    initError: new Error("download failed"),
  });

  const result = await analyze("URGENT: Your account is blocked.");

  assert.equal(result.requestedPath, "device");
  assert.equal(result.actualPath, "cloud");
  assert.equal(result.path, "cloud");
  assert.match(result.deviceError, /download failed/);
  assert.match(result.reason, /On-device inference failed/);
  assert.equal(calls.deviceInit, 1);
  assert.equal(calls.deviceGenerate, 0);
  assert.equal(calls.cloudGenerate, 1);
});

test("device JSON failure falls back to cloud", async () => {
  const rules = makeRuleResults();
  const { analyze, calls } = makeAnalyzer({
    ruleResults: rules,
    deviceError: new AiResponseError(
      "invalid-json",
      "AI response was not valid JSON",
      { inferenceSource: InferenceSource.ON_DEVICE },
    ),
  });

  const result = await analyze("URGENT: Your account is blocked.");

  assert.equal(result.path, "cloud");
  assert.equal(result.actualPath, "cloud");
  assert.match(result.deviceError, /invalid-json/);
  assert.equal(calls.deviceGenerate, 1);
  assert.equal(calls.cloudGenerate, 1);
});

test("both AI paths failing returns the rules-only fallback", async () => {
  const rules = makeRuleResults();
  const { analyze, calls } = makeAnalyzer({
    ruleResults: rules,
    initError: new Error("download failed"),
    cloudError: new Error("network failed"),
  });

  const result = await analyze("URGENT: Your account is blocked.");

  assert.equal(result.path, "rules-only");
  assert.equal(result.requestedPath, "device");
  assert.equal(result.actualPath, null);
  assert.equal(result.inferenceSource, null);
  assert.match(result.reason, /Both AI paths failed/);
  assert.match(result.deviceError, /download failed/);
  assert.match(result.cloudError, /network failed/);
  assert.equal(result.analysis.risk_level, rules.risk_level);
  assert.equal(result.analysis.calculated_score, rules.rule_score);
  assert.equal(result.analysis.rule_breakdown[0].evidence, "URGENT");
  assert.equal(calls.cloudGenerate, 1);
});

test("cloud-only failure returns rules-only without retrying device", async () => {
  const rules = makeRuleResults({ language: "hi" });
  const { analyze, calls } = makeAnalyzer({
    ruleResults: rules,
    cloudError: new Error("network failed"),
  });

  const result = await analyze("आपका खाता ब्लॉक हो जाएगा।");

  assert.equal(result.path, "rules-only");
  assert.equal(result.requestedPath, "cloud");
  assert.equal(result.actualPath, null);
  assert.match(result.reason, /Cloud inference failed/);
  assert.equal(calls.deviceInit, 0);
  assert.equal(calls.deviceGenerate, 0);
  assert.equal(calls.cloudGenerate, 1);
});

test("PDF source is routed to cloud", async () => {
  const rules = makeRuleResults();
  const { analyze, calls } = makeAnalyzer({ ruleResults: rules });

  const result = await analyze("Extracted PDF text", { sourceType: "pdf" });

  assert.equal(result.requestedPath, "cloud");
  assert.equal(result.path, "cloud");
  assert.match(result.reason, /PDF/);
  assert.equal(calls.deviceInit, 0);
  assert.equal(calls.cloudGenerate, 1);
});

test("device availability false falls back to cloud", async () => {
  const rules = makeRuleResults();
  const { analyze, calls } = makeAnalyzer({
    ruleResults: rules,
    deviceSupported: false,
  });

  const result = await analyze("URGENT: Your account is blocked.");

  assert.equal(result.requestedPath, "device");
  assert.equal(result.actualPath, "cloud");
  assert.equal(result.path, "cloud");
  assert.match(result.deviceError, /On-device unavailable/);
  assert.equal(calls.deviceInit, 0);
  assert.equal(calls.cloudGenerate, 1);
});

test("early language precheck mirrors Python's Devanagari threshold", () => {
  assert.equal(
    isLikelyHindiText("URGENT: कृपया verify your bank account now."),
    false,
  );
  assert.equal(isLikelyHindiText("आपका खाता ब्लॉक हो जाएगा।"), true);
  assert.equal(isLikelyHindiText("Lunch at 2 tomorrow?"), false);
  assert.equal(isLikelyHindiText(""), false);

  // Python uses a strict > 20% test, not >= 20%.
  assert.equal(isLikelyHindiText(`कख${"a".repeat(8)}`), false);
  assert.equal(isLikelyHindiText(`कख${"a".repeat(7)}`), true);
});

test("mixed-script English text starts device initialization before deferred rules", async () => {
  const gate = deferred();
  const rules = makeRuleResults();
  const { analyze, calls } = makeAnalyzer({
    ruleResults: rules,
    analyzeRulesImpl: async () => {
      await gate.promise;
      return rules;
    },
  });

  const pending = analyze("URGENT: कृपया verify your bank account now.");
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(calls.availability, 1);
  assert.equal(calls.deviceInit, 1);

  gate.resolve();
  const result = await pending;

  assert.equal(result.requestedPath, "device");
  assert.equal(result.path, "device");
  assert.equal(result.actualPath, "device");
});

test("pure Hindi text does not start device initialization early", async () => {
  const gate = deferred();
  const rules = makeRuleResults({ language: "hi" });
  const { analyze, calls } = makeAnalyzer({
    ruleResults: rules,
    analyzeRulesImpl: async () => {
      await gate.promise;
      return rules;
    },
  });

  const pending = analyze("आपका खाता ब्लॉक हो जाएगा। तुरंत भुगतान करें।");
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(calls.availability, 0);
  assert.equal(calls.deviceInit, 0);

  gate.resolve();
  const result = await pending;

  assert.equal(result.requestedPath, "cloud");
  assert.equal(result.path, "cloud");
  assert.equal(calls.deviceInit, 0);
});

test("missing or unexpected device inferenceSource falls back to cloud", async () => {
  for (const source of [null, "unexpected_source"]) {
    const rules = makeRuleResults();
    const { analyze, calls } = makeAnalyzer({
      ruleResults: rules,
      deviceSource: source,
    });

    const result = await analyze("URGENT: Your account is blocked.");

    assert.equal(result.path, "cloud");
    assert.equal(result.actualPath, "cloud");
    assert.equal(result.inferenceSource, InferenceSource.IN_CLOUD);
    assert.match(result.deviceError, /inferenceSource/);
    assert.equal(calls.deviceGenerate, 1);
    assert.equal(calls.cloudGenerate, 1);
  }
});

test("missing or unexpected cloud inferenceSource returns rules-only", async () => {
  for (const source of [null, "unexpected_source"]) {
    const rules = makeRuleResults({ language: "hi" });
    const { analyze, calls } = makeAnalyzer({
      ruleResults: rules,
      cloudSource: source,
    });

    const result = await analyze("आपका खाता ब्लॉक हो जाएगा।");

    assert.equal(result.path, "rules-only");
    assert.equal(result.requestedPath, "cloud");
    assert.equal(result.actualPath, null);
    assert.equal(result.inferenceSource, null);
    assert.match(result.cloudError, /inferenceSource/);
    assert.equal(calls.deviceInit, 0);
    assert.equal(calls.cloudGenerate, 1);
  }
});

test("device response with valid JSON but invalid structure falls back to cloud", async () => {
  const rules = makeRuleResults();
  const invalidStructure = {
    ...VALID_AI_RESULT,
    red_flags: [{ indicator: "Urgency" }],
  };
  let cloudCalls = 0;

  const deviceModel = makeSdkModel({
    text: JSON.stringify(invalidStructure),
    inferenceSource: InferenceSource.ON_DEVICE,
  });
  const cloudModel = makeSdkModel({
    text: JSON.stringify(VALID_AI_RESULT),
    inferenceSource: InferenceSource.IN_CLOUD,
  });
  const originalCloudGenerate = cloudModel.generateContent;
  cloudModel.generateContent = async (...args) => {
    cloudCalls += 1;
    return originalCloudGenerate(...args);
  };

  const analyze = createHybridAnalyzer({
    analyzeRules: async () => rules,
    checkDeviceAvailability: async () => ({
      status: "available",
      supported: true,
    }),
  });

  const result = await analyze("URGENT: Your account is blocked.", {
    models: { device: deviceModel, cloud: cloudModel },
  });

  assert.equal(result.path, "cloud");
  assert.equal(result.actualPath, "cloud");
  assert.match(result.deviceError, /invalid-response/);
  assert.equal(cloudCalls, 1);
  assert.equal(result.analysis.risk_level, rules.risk_level);
  assert.equal(result.analysis.calculated_score, rules.rule_score);
});

test("cloud response reporting on_device sets actualPath to device", async () => {
  const rules = makeRuleResults({ language: "hi" });
  const { analyze, calls } = makeAnalyzer({
    ruleResults: rules,
    cloudSource: InferenceSource.ON_DEVICE,
  });

  const result = await analyze("आपका खाता ब्लॉक हो जाएगा।");

  assert.equal(result.requestedPath, "cloud");
  assert.equal(result.actualPath, "device");
  assert.equal(result.path, "device");
  assert.equal(result.inferenceSource, InferenceSource.ON_DEVICE);
  assert.match(result.reason, /handled on-device/);
  assert.equal(calls.deviceInit, 0);
  assert.equal(calls.cloudGenerate, 1);
});

test("PDF source variants are normalized to cloud", async () => {
  for (const sourceType of [
    "pdf",
    "PDF",
    "application/pdf",
    "application/pdf; charset=utf-8",
  ]) {
    assert.equal(isPdfSource(sourceType), true);
    assert.equal(
      chooseRequestedPath({
        text: "short English",
        language: "en",
        prompt: "prompt",
        sourceType,
      }).path,
      "cloud",
    );
  }

  const rules = makeRuleResults();
  const { analyze, calls } = makeAnalyzer({ ruleResults: rules });
  const result = await analyze("Extracted PDF text", {
    sourceType: "application/pdf",
  });

  assert.equal(result.requestedPath, "cloud");
  assert.equal(result.path, "cloud");
  assert.equal(calls.deviceInit, 0);
  assert.equal(calls.cloudGenerate, 1);
  assert.equal(result.analysis.calculated_score, rules.rule_score);
});

test("AI output cannot override Python-owned score, rule rows, evidence, or classification", async () => {
  const rules = makeRuleResults();
  const aiOverride = {
    ...VALID_AI_RESULT,
    calculated_score: 1,
    rule_score: 1,
    flags: ["AI-generated flag"],
    rule_breakdown: [
      {
        rule: "AI rule",
        points: 999,
        triggered: true,
        evidence: "AI evidence",
        explanation: "AI explanation",
        classification: "suspicious",
      },
    ],
    amounts: ["AI amount"],
    payment_handles: ["ai@upi"],
    urgency_phrases: ["AI urgent"],
    extracted_urls: ["https://ai.example"],
    red_flags: [
      {
        indicator: "AI indicator",
        evidence: "AI evidence",
        explanation: "AI explanation",
        classification: "suspicious",
      },
    ],
  };

  const { analyze } = makeAnalyzer({ ruleResults: rules, aiResult: aiOverride });
  const result = await analyze("URGENT: Your account is blocked.");

  assert.equal(result.analysis.risk_level, rules.risk_level);
  assert.equal(result.analysis.calculated_score, rules.rule_score);
  assert.equal(result.analysis.rule_breakdown[0].evidence, "URGENT");
  assert.equal(result.analysis.rule_breakdown[2].classification, "none");
  assert.deepEqual(result.analysis.amounts, rules.amounts);
  assert.deepEqual(result.analysis.payment_handles, rules.payment_handles);
  assert.deepEqual(result.analysis.urgency_phrases, rules.urgency_phrases);
  assert.deepEqual(result.analysis.extracted_urls, rules.extracted_urls);
  assert.deepEqual(result.analysis.red_flags, [
    {
      indicator: "AI indicator",
      evidence: "AI evidence",
      explanation: "AI explanation",
    },
  ]);
});

test("final response construction failure returns rules-only fallback", async () => {
  const rules = makeRuleResults();
  const { analyze, calls } = makeAnalyzer({
    ruleResults: rules,
    dependencies: {
      buildAnalysisResponse: () => {
        throw new Error("builder failed");
      },
    },
  });

  const result = await analyze("URGENT: Your account is blocked.");

  assert.equal(result.path, "rules-only");
  assert.equal(result.actualPath, null);
  assert.equal(result.inferenceSource, null);
  assert.match(result.responseError, /builder failed/);
  assert.equal(result.analysis.risk_level, rules.risk_level);
  assert.equal(result.analysis.calculated_score, rules.rule_score);
  assert.equal(result.analysis.rule_breakdown[0].evidence, "URGENT");
  assert.equal(calls.deviceGenerate, 1);
  assert.equal(calls.cloudGenerate, 0);
});
