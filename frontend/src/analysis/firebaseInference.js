import { getGenerativeModel, InferenceMode, InferenceSource } from "firebase/ai";

import { GEMINI_ANALYSIS_AI_SCHEMA } from "./schemas.js";

export const CLOUD_MODEL = "gemini-3.5-flash-lite";
export const DEVICE_LANGUAGE = "en";
export const SUPPORTED_IMAGE_MIME_TYPES = ["image/jpeg", "image/png"];
export const IMAGE_EXTRACTION_PROMPT =
  "Extract and transcribe all readable text from this image verbatim. Return only the extracted text and nothing else.";

const REQUIRED_TEXT_FIELDS = ["situation_type", "summary", "disclaimer"];
const REQUIRED_ARRAY_FIELDS = ["safe_next_steps", "verification_guidance"];

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/**
 * Chrome Prompt API options used for both availability and session creation.
 * These map to LanguageModelCreateCoreOptions in the installed SDK types:
 * - expectedInputs: LanguageModelExpected[] with type "text" and languages ["en"]
 * - expectedOutputs: LanguageModelExpected[] with type "text" and languages ["en"]
 */
export function buildDeviceCreateOptions(language = DEVICE_LANGUAGE) {
  return {
    expectedInputs: [{ type: "text", languages: [language] }],
    expectedOutputs: [{ type: "text", languages: [language] }],
  };
}

export function buildDeviceModelParams({
  schema = GEMINI_ANALYSIS_AI_SCHEMA,
  language = DEVICE_LANGUAGE,
} = {}) {
  return {
    mode: InferenceMode.ONLY_ON_DEVICE,
    onDeviceParams: {
      createOptions: buildDeviceCreateOptions(language),
      promptOptions: {
        responseConstraint: schema,
      },
    },
  };
}

export function buildCloudModelParams({
  schema = GEMINI_ANALYSIS_AI_SCHEMA,
  model = CLOUD_MODEL,
} = {}) {
  return {
    mode: InferenceMode.ONLY_IN_CLOUD,
    inCloudParams: {
      model,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: schema,
      },
    },
  };
}

export function createDeviceModel(
  ai,
  {
    schema = GEMINI_ANALYSIS_AI_SCHEMA,
    language = DEVICE_LANGUAGE,
    modelFactory = getGenerativeModel,
  } = {},
) {
  return modelFactory(ai, buildDeviceModelParams({ schema, language }));
}

export function createCloudModel(
  ai,
  {
    schema = GEMINI_ANALYSIS_AI_SCHEMA,
    model = CLOUD_MODEL,
    modelFactory = getGenerativeModel,
  } = {},
) {
  return modelFactory(ai, buildCloudModelParams({ schema, model }));
}

export function createCloudVisionModel(
  ai,
  { model = CLOUD_MODEL, modelFactory = getGenerativeModel } = {},
) {
  return modelFactory(ai, {
    mode: InferenceMode.ONLY_IN_CLOUD,
    inCloudParams: { model },
  });
}

function defaultReadFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error || new Error("Could not read image"));
    reader.readAsDataURL(file);
  });
}

function stripDataUrlPrefix(dataUrl) {
  const comma = dataUrl.indexOf(",");
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}

/**
 * Extract visible text from a JPEG/PNG using Firebase AI Logic cloud inference.
 * The image itself never enters Pyodide or the Python text rule engine.
 */
export async function extractImageText(
  ai,
  file,
  {
    mimeType = file?.type,
    model = CLOUD_MODEL,
    modelFactory = getGenerativeModel,
    readFileAsDataUrl = defaultReadFileAsDataUrl,
  } = {},
) {
  const normalizedMimeType = String(mimeType ?? "").toLowerCase();

  if (!SUPPORTED_IMAGE_MIME_TYPES.includes(normalizedMimeType)) {
    throw new Error("Only JPEG and PNG images are supported.");
  }

  const dataUrl = String(await readFileAsDataUrl(file));
  const data = stripDataUrlPrefix(dataUrl);

  if (!data) {
    throw new Error("Could not read image data.");
  }

  const visionModel = createCloudVisionModel(ai, { model, modelFactory });
  const result = await visionModel.generateContent([
    IMAGE_EXTRACTION_PROMPT,
    {
      type: "inlineData",
      inlineData: {
        mimeType: normalizedMimeType,
        data,
      },
    },
  ]);

  const response = result?.response;

  if (!response || typeof response.text !== "function") {
    throw new Error("Image extraction response was missing text().");
  }

  const inferenceSource = response.inferenceSource ?? null;

  if (inferenceSource !== InferenceSource.IN_CLOUD) {
    throw new Error("Image extraction did not use cloud inference.");
  }

  return {
    text: response.text().trim(),
    inferenceSource,
  };
}

/**
 * Detect Chrome on-device support using the public Prompt API.
 * This intentionally does not call Firebase's internal ChromeAdapter.
 */
export async function checkDeviceAvailability({
  languageModel = globalThis.LanguageModel,
  language = DEVICE_LANGUAGE,
} = {}) {
  const options = buildDeviceCreateOptions(language);

  if (!languageModel || typeof languageModel.availability !== "function") {
    return {
      status: "unsupported",
      supported: false,
      options,
    };
  }

  try {
    const status = await languageModel.availability(options);
    return {
      status,
      supported:
        status === "available" ||
        status === "downloadable" ||
        status === "downloading",
      options,
    };
  } catch (error) {
    return {
      status: "unavailable",
      supported: false,
      options,
      error: error?.message || String(error),
    };
  }
}

/**
 * Must be called from a user interaction (for example, a button click).
 * The progress callback receives a value from 0 to 1.
 */
export async function initializeDeviceInference(model, onProgress) {
  if (!model || typeof model.initializeDeviceModel !== "function") {
    throw new Error("Device model does not support initializeDeviceModel()");
  }
  await model.initializeDeviceModel(onProgress);
}

export class AiResponseError extends Error {
  constructor(
    code,
    message,
    { inferenceSource = null, rawText = null, cause } = {},
  ) {
    super(message);
    this.name = "AiResponseError";
    this.code = code;
    this.inferenceSource = inferenceSource;
    this.rawText = rawText;
    if (cause !== undefined) this.cause = cause;
  }
}

export function validateAiResponse(value, { inferenceSource = null } = {}) {
  if (!isPlainObject(value)) {
    throw new AiResponseError(
      "invalid-response",
      "AI response must be a JSON object",
      { inferenceSource, rawText: JSON.stringify(value) },
    );
  }

  for (const field of REQUIRED_TEXT_FIELDS) {
    if (typeof value[field] !== "string") {
      throw new AiResponseError(
        "invalid-response",
        `AI response field "${field}" must be a string`,
        { inferenceSource, rawText: JSON.stringify(value) },
      );
    }
  }

  if (typeof value.risk_level !== "string") {
    throw new AiResponseError(
      "invalid-response",
      'AI response field "risk_level" must be a string',
      { inferenceSource, rawText: JSON.stringify(value) },
    );
  }

  if (!Array.isArray(value.red_flags)) {
    throw new AiResponseError(
      "invalid-response",
      'AI response field "red_flags" must be an array',
      { inferenceSource, rawText: JSON.stringify(value) },
    );
  }

  for (const flag of value.red_flags) {
    if (!isPlainObject(flag)) {
      throw new AiResponseError(
        "invalid-response",
        "Each red flag must be an object",
        { inferenceSource, rawText: JSON.stringify(value) },
      );
    }

    for (const field of ["indicator", "evidence", "explanation"]) {
      if (typeof flag[field] !== "string") {
        throw new AiResponseError(
          "invalid-response",
          `Each red flag field "${field}" must be a string`,
          { inferenceSource, rawText: JSON.stringify(value) },
        );
      }
    }
  }

  for (const field of REQUIRED_ARRAY_FIELDS) {
    if (!isStringArray(value[field])) {
      throw new AiResponseError(
        "invalid-response",
        `AI response field "${field}" must be an array of strings`,
        { inferenceSource, rawText: JSON.stringify(value) },
      );
    }
  }

  return {
    situation_type: value.situation_type,
    risk_level: value.risk_level,
    summary: value.summary,
    red_flags: value.red_flags.map((flag) => ({
      indicator: flag.indicator,
      evidence: flag.evidence,
      explanation: flag.explanation,
    })),
    safe_next_steps: [...value.safe_next_steps],
    verification_guidance: [...value.verification_guidance],
    disclaimer: value.disclaimer,
  };
}

export function parseAiJson(text, { inferenceSource = null } = {}) {
  if (typeof text !== "string" || text.trim() === "") {
    throw new AiResponseError(
      "invalid-json",
      "AI response text was empty",
      { inferenceSource, rawText: text },
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new AiResponseError(
      "invalid-json",
      "AI response was not valid JSON",
      { inferenceSource, rawText: text, cause: error },
    );
  }

  return validateAiResponse(parsed, { inferenceSource });
}

/**
 * Generate a single non-streaming response and return validated JSON plus the
 * SDK-reported inference source. The source is never inferred from the mode.
 */
export async function generateAiJson(model, prompt) {
  const result = await model.generateContent(prompt);
  const response = result?.response;

  if (!response || typeof response.text !== "function") {
    throw new AiResponseError(
      "invalid-response",
      "AI SDK response is missing response.text()",
    );
  }

  const inferenceSource = response.inferenceSource ?? null;

  let text;
  try {
    text = response.text();
  } catch (error) {
    throw new AiResponseError(
      "invalid-response",
      "AI response text was not available",
      { inferenceSource, cause: error },
    );
  }

  const data = parseAiJson(text, { inferenceSource });

  return {
    data,
    inferenceSource,
    rawText: text,
  };
}
