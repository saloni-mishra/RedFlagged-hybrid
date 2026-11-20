import test from "node:test";
import assert from "node:assert/strict";

import { InferenceMode, InferenceSource } from "firebase/ai";

import {
  AiResponseError,
  buildCloudModelParams,
  buildDeviceCreateOptions,
  buildDeviceModelParams,
  checkDeviceAvailability,
  CLOUD_MODEL,
  createCloudModel,
  createCloudVisionModel,
  createDeviceModel,
  extractImageText,
  generateAiJson,
  GEMINI_ANALYSIS_AI_SCHEMA,
  IMAGE_EXTRACTION_PROMPT,
  initializeDeviceInference,
  parseAiJson,
  SUPPORTED_IMAGE_MIME_TYPES,
  validateAiResponse,
} from "../src/analysis/index.js";

const VALID_AI_RESULT = {
  situation_type: "Likely scam",
  risk_level: "HIGH",
  summary: "This message contains urgency and payment demands.",
  red_flags: [
    {
      indicator: "Urgency",
      evidence: "URGENT",
      explanation: "Creates a deadline to pressure the reader.",
    },
  ],
  safe_next_steps: ["Do not pay or click any link."],
  verification_guidance: ["Use the organisation's official website."],
  disclaimer: "Not legal or financial advice.",
};

function makeModel({
  text = JSON.stringify(VALID_AI_RESULT),
  inferenceSource = InferenceSource.ON_DEVICE,
  initialize = async (onProgress) => onProgress?.(0.5),
} = {}) {
  return {
    initializeDeviceModel: initialize,
    generateContent: async () => ({
      response: {
        text: () => text,
        inferenceSource,
      },
    }),
  };
}

test("device model configuration uses ONLY_ON_DEVICE and English text options", () => {
  const params = buildDeviceModelParams();

  assert.equal(params.mode, InferenceMode.ONLY_ON_DEVICE);
  assert.deepEqual(params.onDeviceParams.createOptions, {
    expectedInputs: [{ type: "text", languages: ["en"] }],
    expectedOutputs: [{ type: "text", languages: ["en"] }],
  });
  assert.equal(
    params.onDeviceParams.promptOptions.responseConstraint,
    GEMINI_ANALYSIS_AI_SCHEMA,
  );
});

test("cloud model configuration uses ONLY_IN_CLOUD and the pinned cloud model", () => {
  const params = buildCloudModelParams();

  assert.equal(params.mode, InferenceMode.ONLY_IN_CLOUD);
  assert.equal(params.inCloudParams.model, CLOUD_MODEL);
  assert.equal(params.inCloudParams.model, "gemini-3.5-flash-lite");
  assert.equal(
    params.inCloudParams.generationConfig.responseMimeType,
    "application/json",
  );
  assert.equal(
    params.inCloudParams.generationConfig.responseSchema,
    GEMINI_ANALYSIS_AI_SCHEMA,
  );
});

test("model factories can create both configured models", () => {
  const calls = [];
  const modelFactory = (ai, params) => {
    calls.push({ ai, params });
    return { fake: true };
  };

  const fakeAi = { name: "fake-ai" };
  const device = createDeviceModel(fakeAi, { modelFactory });
  const cloud = createCloudModel(fakeAi, { modelFactory });

  assert.deepEqual(device, { fake: true });
  assert.deepEqual(cloud, { fake: true });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].params.mode, InferenceMode.ONLY_ON_DEVICE);
  assert.equal(calls[1].params.mode, InferenceMode.ONLY_IN_CLOUD);
  assert.equal(calls[1].params.inCloudParams.model, "gemini-3.5-flash-lite");
});

test("AI schema uses only documented structured-output fields", () => {
  const serialized = JSON.stringify(GEMINI_ANALYSIS_AI_SCHEMA);
  assert.equal(serialized.includes("additionalProperties"), false);
  assert.deepEqual(GEMINI_ANALYSIS_AI_SCHEMA.required, [
    "situation_type",
    "risk_level",
    "summary",
    "red_flags",
    "safe_next_steps",
    "verification_guidance",
    "disclaimer",
  ]);
  assert.deepEqual(
    GEMINI_ANALYSIS_AI_SCHEMA.properties.risk_level.enum,
    ["LOW", "MEDIUM", "HIGH"],
  );
});

test("device availability uses the public LanguageModel API and exact options", async () => {
  const calls = [];
  const languageModel = {
    availability: async (options) => {
      calls.push(options);
      return "downloadable";
    },
  };

  const result = await checkDeviceAvailability({ languageModel });

  assert.equal(result.status, "downloadable");
  assert.equal(result.supported, true);
  assert.deepEqual(calls, [buildDeviceCreateOptions()]);
  assert.deepEqual(calls[0], {
    expectedInputs: [{ type: "text", languages: ["en"] }],
    expectedOutputs: [{ type: "text", languages: ["en"] }],
  });
});

test("missing LanguageModel API is reported as unsupported", async () => {
  const result = await checkDeviceAvailability({ languageModel: null });
  assert.equal(result.status, "unsupported");
  assert.equal(result.supported, false);
});

test("unavailable on-device model is not marked supported", async () => {
  const result = await checkDeviceAvailability({
    languageModel: { availability: async () => "unavailable" },
  });
  assert.equal(result.status, "unavailable");
  assert.equal(result.supported, false);
});

test("device initialization forwards download progress", async () => {
  let progress = null;
  const model = makeModel({
    initialize: async (onProgress) => onProgress(0.42),
  });

  await initializeDeviceInference(model, (value) => {
    progress = value;
  });

  assert.equal(progress, 0.42);
});

test("device initialization failure is propagated", async () => {
  const model = makeModel({
    initialize: async () => {
      throw new Error("model download failed");
    },
  });

  await assert.rejects(
    () => initializeDeviceInference(model, () => {}),
    /model download failed/,
  );
});

test("device success returns validated JSON and on_device source", async () => {
  let progress = null;
  const model = makeModel();

  await initializeDeviceInference(model, (value) => {
    progress = value;
  });
  const result = await generateAiJson(model, "test prompt");

  assert.equal(progress, 0.5);
  assert.deepEqual(result.data, VALID_AI_RESULT);
  assert.equal(result.inferenceSource, InferenceSource.ON_DEVICE);
  assert.equal(result.rawText, JSON.stringify(VALID_AI_RESULT));
});

test("cloud success returns validated JSON and in_cloud source", async () => {
  const model = makeModel({
    inferenceSource: InferenceSource.IN_CLOUD,
  });

  const result = await generateAiJson(model, "test prompt");

  assert.deepEqual(result.data, VALID_AI_RESULT);
  assert.equal(result.inferenceSource, InferenceSource.IN_CLOUD);
});

test("actual inference source is read from the response, not the requested mode", async () => {
  const deviceParams = buildDeviceModelParams();
  assert.equal(deviceParams.mode, InferenceMode.ONLY_ON_DEVICE);

  const model = makeModel({
    inferenceSource: InferenceSource.IN_CLOUD,
  });
  const result = await generateAiJson(model, "test prompt");

  assert.equal(result.inferenceSource, InferenceSource.IN_CLOUD);
  assert.notEqual(
    result.inferenceSource,
    deviceParams.mode === InferenceMode.ONLY_ON_DEVICE
      ? InferenceSource.ON_DEVICE
      : InferenceSource.IN_CLOUD,
  );
});

test("extra AI fields are ignored when the required structure is valid", async () => {
  const model = makeModel({
    text: JSON.stringify({
      ...VALID_AI_RESULT,
      calculated_score: 1,
      extra: "ignored",
      red_flags: [
        {
          ...VALID_AI_RESULT.red_flags[0],
          extra: "ignored",
        },
      ],
    }),
  });

  const result = await generateAiJson(model, "test prompt");

  assert.deepEqual(result.data, VALID_AI_RESULT);
  assert.equal("calculated_score" in result.data, false);
  assert.equal("extra" in result.data, false);
});

test("invalid JSON is rejected and the SDK source is retained", async () => {
  const model = makeModel({
    text: "not valid json",
    inferenceSource: InferenceSource.ON_DEVICE,
  });

  await assert.rejects(
    () => generateAiJson(model, "test prompt"),
    (error) => {
      assert.ok(error instanceof AiResponseError);
      assert.equal(error.code, "invalid-json");
      assert.equal(error.inferenceSource, InferenceSource.ON_DEVICE);
      assert.equal(error.rawText, "not valid json");
      return true;
    },
  );
});

test("contract-valid empty values are accepted", () => {
  const compatibleCases = [
    { ...VALID_AI_RESULT, situation_type: "" },
    { ...VALID_AI_RESULT, summary: "" },
    { ...VALID_AI_RESULT, disclaimer: "" },
    { ...VALID_AI_RESULT, summary: "   " },
    { ...VALID_AI_RESULT, risk_level: "SUSPICIOUS" },
    { ...VALID_AI_RESULT, risk_level: "" },
    { ...VALID_AI_RESULT, red_flags: [] },
    {
      ...VALID_AI_RESULT,
      red_flags: [{ indicator: "", evidence: "", explanation: "" }],
    },
    { ...VALID_AI_RESULT, safe_next_steps: [] },
    { ...VALID_AI_RESULT, verification_guidance: [] },
    { ...VALID_AI_RESULT, safe_next_steps: [""] },
    { ...VALID_AI_RESULT, verification_guidance: ["", "  "] },
  ];

  for (const value of compatibleCases) {
    assert.deepEqual(validateAiResponse(value), value);
  }
});

test("missing required fields are rejected", () => {
  for (const field of [
    "situation_type",
    "risk_level",
    "summary",
    "red_flags",
    "safe_next_steps",
    "verification_guidance",
    "disclaimer",
  ]) {
    const invalid = { ...VALID_AI_RESULT };
    delete invalid[field];

    assert.throws(
      () => validateAiResponse(invalid),
      (error) => {
        assert.ok(error instanceof AiResponseError);
        assert.equal(error.code, "invalid-response");
        return true;
      },
      `missing field ${field} should be rejected`,
    );
  }
});

test("incorrect data types are rejected", () => {
  const invalids = [
    null,
    [],
    { ...VALID_AI_RESULT, situation_type: 42 },
    { ...VALID_AI_RESULT, risk_level: null },
    { ...VALID_AI_RESULT, summary: {} },
    { ...VALID_AI_RESULT, red_flags: "not-an-array" },
    { ...VALID_AI_RESULT, red_flags: [null] },
    {
      ...VALID_AI_RESULT,
      red_flags: [{ indicator: "Urgency" }],
    },
    {
      ...VALID_AI_RESULT,
      red_flags: [{ ...VALID_AI_RESULT.red_flags[0], evidence: 42 }],
    },
    { ...VALID_AI_RESULT, safe_next_steps: "not-an-array" },
    { ...VALID_AI_RESULT, safe_next_steps: [42] },
    { ...VALID_AI_RESULT, verification_guidance: [null] },
    { ...VALID_AI_RESULT, disclaimer: 42 },
  ];

  for (const invalid of invalids) {
    assert.throws(
      () => validateAiResponse(invalid),
      (error) => {
        assert.ok(error instanceof AiResponseError);
        assert.equal(error.code, "invalid-response");
        return true;
      },
    );
  }
});

test("invalid response structure from the SDK is rejected with its source", async () => {
  const model = makeModel({
    text: JSON.stringify({
      ...VALID_AI_RESULT,
      red_flags: "not-an-array",
    }),
    inferenceSource: InferenceSource.ON_DEVICE,
  });

  await assert.rejects(
    () => generateAiJson(model, "test prompt"),
    (error) => {
      assert.ok(error instanceof AiResponseError);
      assert.equal(error.code, "invalid-response");
      assert.equal(error.inferenceSource, InferenceSource.ON_DEVICE);
      return true;
    },
  );
});

test("parseAiJson and validateAiResponse are usable directly", () => {
  assert.deepEqual(
    parseAiJson(JSON.stringify(VALID_AI_RESULT)),
    VALID_AI_RESULT,
  );

  assert.throws(
    () => validateAiResponse({}),
    (error) =>
      error instanceof AiResponseError &&
      error.code === "invalid-response",
  );

  assert.throws(
    () => parseAiJson("{broken"),
    (error) =>
      error instanceof AiResponseError && error.code === "invalid-json",
  );
});

test("cloud vision model config uses ONLY_IN_CLOUD and the pinned model", () => {
  const calls = [];
  const modelFactory = (ai, params) => {
    calls.push({ ai, params });
    return { fake: true };
  };

  const model = createCloudVisionModel({ name: "fake-ai" }, { modelFactory });

  assert.deepEqual(model, { fake: true });
  assert.equal(calls[0].params.mode, InferenceMode.ONLY_IN_CLOUD);
  assert.equal(calls[0].params.inCloudParams.model, CLOUD_MODEL);
  assert.equal(calls[0].params.inCloudParams.generationConfig, undefined);
});

test("image extraction sends JPEG/PNG inline data through cloud vision", async () => {
  const generateCalls = [];
  let modelParams = null;
  const model = {
    generateContent: async (parts) => {
      generateCalls.push(parts);
      return {
        response: {
          text: () => "  extracted image text  ",
          inferenceSource: InferenceSource.IN_CLOUD,
        },
      };
    },
  };
  const modelFactory = (ai, params) => {
    modelParams = params;
    return model;
  };

  const result = await extractImageText(
    { name: "fake-ai" },
    { name: "notice.png", type: "image/png" },
    {
      mimeType: "image/png",
      modelFactory,
      readFileAsDataUrl: async () => "data:image/png;base64,QUJD",
    },
  );

  assert.equal(result.text, "extracted image text");
  assert.equal(result.inferenceSource, InferenceSource.IN_CLOUD);
  assert.equal(modelParams.mode, InferenceMode.ONLY_IN_CLOUD);
  assert.equal(modelParams.inCloudParams.model, CLOUD_MODEL);
  assert.equal(generateCalls.length, 1);
  assert.equal(generateCalls[0][0], IMAGE_EXTRACTION_PROMPT);
  assert.deepEqual(generateCalls[0][1], {
    type: "inlineData",
    inlineData: {
      mimeType: "image/png",
      data: "QUJD",
    },
  });
  assert.deepEqual(SUPPORTED_IMAGE_MIME_TYPES, ["image/jpeg", "image/png"]);
});

test("image extraction rejects unsupported image types", async () => {
  await assert.rejects(
    () =>
      extractImageText(
        {},
        { name: "anim.gif", type: "image/gif" },
        {
          mimeType: "image/gif",
          readFileAsDataUrl: async () => "data:image/gif;base64,QUJD",
        },
      ),
    /JPEG and PNG/,
  );
});

test("image extraction rejects a non-cloud inference source", async () => {
  const model = {
    generateContent: async () => ({
      response: {
        text: () => "text",
        inferenceSource: InferenceSource.ON_DEVICE,
      },
    }),
  };

  await assert.rejects(
    () =>
      extractImageText(
        {},
        { name: "notice.png", type: "image/png" },
        {
          mimeType: "image/png",
          modelFactory: () => model,
          readFileAsDataUrl: async () => "data:image/png;base64,QUJD",
        },
      ),
    /cloud inference/,
  );
});
