import { InferenceSource } from "firebase/ai";

import {
  AiResponseError,
  buildAnalysisResponse as defaultBuildAnalysisResponse,
  buildPrompt as defaultBuildPrompt,
  checkDeviceAvailability as defaultCheckDeviceAvailability,
  createCloudModel as defaultCreateCloudModel,
  createDeviceModel as defaultCreateDeviceModel,
  fallbackResponse as defaultFallbackResponse,
  GEMINI_ANALYSIS_AI_SCHEMA,
  generateAiJson as defaultGenerateAiJson,
  initializeDeviceInference as defaultInitializeDeviceInference,
  retrieveContext as defaultRetrieveContext,
} from "./analysis/index.js";
import { analyzeRules as defaultAnalyzeRules } from "./pyodide/rulesEngine.js";

export const ON_DEVICE_CONTEXT_LIMIT = 9216;
export const ON_DEVICE_OUTPUT_RESERVE_TOKENS = 2500;
export const ON_DEVICE_SAFETY_FACTOR = 0.85;
export const ON_DEVICE_INPUT_TOKEN_BUDGET = Math.floor(
  (ON_DEVICE_CONTEXT_LIMIT - ON_DEVICE_OUTPUT_RESERVE_TOKENS) *
    ON_DEVICE_SAFETY_FACTOR,
);
export const ON_DEVICE_MAX_MESSAGE_CHARS = 8000;

export function estimateTokens(text) {
  return Math.ceil(Array.from(String(text ?? "")).length / 3);
}

/**
 * Mirrors backend/rules.py detect_language() for the early-init precheck.
 * Python remains authoritative; this helper only decides whether device
 * initialization is likely to be needed before the rule engine finishes.
 */
export function isLikelyHindiText(text) {
  const input = String(text ?? "");
  if (!input) return false;

  const letters = [];
  for (const character of input) {
    if (/\p{L}/u.test(character)) letters.push(character);
  }

  if (letters.length === 0) return false;

  let devanagari = 0;
  for (const character of letters) {
    const codePoint = character.codePointAt(0);
    if (codePoint >= 0x0900 && codePoint <= 0x097f) {
      devanagari += 1;
    }
  }

  return devanagari / letters.length > 0.2;
}

/**
 * Normalize MIME-like source values so PDF text never selects device.
 */
export function isPdfSource(sourceType = "text") {
  const normalized = String(sourceType ?? "")
    .trim()
    .toLowerCase()
    .split(";")[0]
    .trim();
  return normalized === "pdf" || normalized === "application/pdf";
}

/**
 * Decide the requested inference path before any AI call.
 * This does not inspect Chrome availability; that is handled separately so
 * requestedPath and actual inferenceSource stay independent.
 */
export function chooseRequestedPath({
  text,
  language,
  prompt,
  schema = GEMINI_ANALYSIS_AI_SCHEMA,
  sourceType = "text",
} = {}) {
  if (isPdfSource(sourceType)) {
    return {
      path: "cloud",
      reason: "PDF input is not eligible for on-device inference.",
    };
  }

  if (language !== "en") {
    return {
      path: "cloud",
      reason: "Only English is supported for on-device inference.",
    };
  }

  if (Array.from(String(text ?? "")).length > ON_DEVICE_MAX_MESSAGE_CHARS) {
    return {
      path: "cloud",
      reason: `Message is longer than the ${ON_DEVICE_MAX_MESSAGE_CHARS}-character on-device limit.`,
    };
  }

  const estimatedPromptTokens =
    estimateTokens(prompt) + estimateTokens(JSON.stringify(schema));

  if (estimatedPromptTokens > ON_DEVICE_INPUT_TOKEN_BUDGET) {
    return {
      path: "cloud",
      reason: `Estimated prompt and schema use ${estimatedPromptTokens} tokens; the on-device input budget is ${ON_DEVICE_INPUT_TOKEN_BUDGET}.`,
    };
  }

  return {
    path: "device",
    reason: "Short English text fits the on-device budget.",
  };
}

function errorMessage(error) {
  if (!error) return null;
  const prefix = error.code ? `${error.code}: ` : "";
  return `${prefix}${error.message || String(error)}`;
}

function sourceToPath(source) {
  if (source === InferenceSource.ON_DEVICE) return "device";
  if (source === InferenceSource.IN_CLOUD) return "cloud";
  throw new AiResponseError(
    "invalid-response",
    "AI SDK did not report a valid inferenceSource",
    { inferenceSource: source ?? null },
  );
}

export function createHybridAnalyzer(dependencies = {}) {
  const {
    analyzeRules = defaultAnalyzeRules,
    retrieveContext = defaultRetrieveContext,
    buildPrompt = defaultBuildPrompt,
    fallbackResponse = defaultFallbackResponse,
    buildAnalysisResponse = defaultBuildAnalysisResponse,
    createDeviceModel = defaultCreateDeviceModel,
    createCloudModel = defaultCreateCloudModel,
    checkDeviceAvailability = defaultCheckDeviceAvailability,
    initializeDeviceInference = defaultInitializeDeviceInference,
    generateAiJson = defaultGenerateAiJson,
    schema = GEMINI_ANALYSIS_AI_SCHEMA,
  } = dependencies;

  return async function analyzeHybrid(text, options = {}) {
    const {
      ai,
      models = {},
      sourceType = "text",
      onStatus = () => {},
    } = options;

    const notify = (event) => {
      try {
        onStatus(event);
      } catch {
        // Status callbacks must not break analysis.
      }
    };

    const input = String(text ?? "");

    let deviceModel = models.device ?? null;
    let cloudModel = models.cloud ?? null;

    const getDeviceModel = () => {
      if (!deviceModel) {
        deviceModel = createDeviceModel(ai, { schema });
      }
      return deviceModel;
    };

    const getCloudModel = () => {
      if (!cloudModel) {
        cloudModel = createCloudModel(ai, { schema });
      }
      return cloudModel;
    };

    let deviceAvailability = null;
    let deviceError = null;
    let cloudError = null;
    let responseError = null;
    let aiData = null;
    let inferenceSource = null;
    let actualPath = null;
    let path = null;

    const prepareDevice = async () => {
      notify({ state: "device-availability" });
      deviceAvailability = await checkDeviceAvailability();

      if (!deviceAvailability.supported) {
        throw new Error(
          `On-device unavailable (${deviceAvailability.status}).`,
        );
      }

      const model = getDeviceModel();

      notify({
        state: "device-initialize",
        availability: deviceAvailability.status,
      });
      await initializeDeviceInference(model, (progress) => {
        notify({ state: "device-download", progress });
      });

      return model;
    };

    // Start device initialization before the Pyodide rule engine finishes so
    // the Chrome user-activation requirement is satisfied. The actual routing
    // decision below still uses the Python-detected language and prompt size.
    const likelyDeviceCandidate =
      !isPdfSource(sourceType) &&
      Array.from(input).length <= ON_DEVICE_MAX_MESSAGE_CHARS &&
      !isLikelyHindiText(input);

    let preparedDevicePromise = null;

    notify({ state: "rules" });

    if (likelyDeviceCandidate) {
      preparedDevicePromise = prepareDevice();
      preparedDevicePromise.catch(() => {
        // The routing branch below will observe and report the rejection.
      });
    }

    const ruleResults = await analyzeRules(input, {
      onStatus: (status) => {
        notify({
          state: "rule-engine",
          ruleState: status.state,
          loadMs: status.loadMs,
          pythonVersion: status.pythonVersion,
          message: status.message,
        });
      },
    });
    const language = ruleResults.language === "hi" ? "hi" : "en";

    const knowledge = retrieveContext(input);
    const prompt = buildPrompt(input, ruleResults, knowledge, language);

    const requested = chooseRequestedPath({
      text: input,
      language,
      prompt,
      schema,
      sourceType,
    });
    const requestedPath = requested.path;
    let reason = requested.reason;

    const attemptDevice = async () => {
      const model = preparedDevicePromise
        ? await preparedDevicePromise
        : await prepareDevice();

      notify({ state: "device-generate" });
      const result = await generateAiJson(model, prompt);
      const detectedPath = sourceToPath(result.inferenceSource);

      aiData = result.data;
      inferenceSource = result.inferenceSource;
      actualPath = detectedPath;
      path = detectedPath;

      if (detectedPath !== "device") {
        reason = "The on-device request was handled in the cloud.";
      }

      return result;
    };

    const attemptCloud = async (cloudReason) => {
      reason = cloudReason;
      notify({ state: "cloud-generate", reason: cloudReason });

      const result = await generateAiJson(getCloudModel(), prompt);
      const detectedPath = sourceToPath(result.inferenceSource);

      aiData = result.data;
      inferenceSource = result.inferenceSource;
      actualPath = detectedPath;
      path = detectedPath;

      if (detectedPath !== "cloud") {
        reason = "The cloud request was handled on-device.";
      }

      return result;
    };

    if (requestedPath === "device") {
      try {
        await attemptDevice();
      } catch (error) {
        deviceError = error;
        notify({ state: "device-error", error: errorMessage(error) });

        try {
          await attemptCloud(
            `On-device inference failed (${errorMessage(error)}); sent to cloud.`,
          );
        } catch (cloudFailure) {
          cloudError = cloudFailure;
          notify({ state: "cloud-error", error: errorMessage(cloudFailure) });
        }
      }
    } else {
      try {
        await attemptCloud(requested.reason);
      } catch (error) {
        cloudError = error;
        notify({ state: "cloud-error", error: errorMessage(error) });
      }
    }

    const buildRulesOnlyResponse = (fallbackReason) => {
      path = "rules-only";
      actualPath = null;
      inferenceSource = null;
      reason = fallbackReason;
      notify({ state: "rules-only", reason });
      return fallbackResponse(input, ruleResults, language);
    };

    let analysis;
    if (aiData && path) {
      try {
        analysis = buildAnalysisResponse(input, ruleResults, language, aiData);
      } catch (error) {
        responseError = error;
        notify({ state: "response-error", error: errorMessage(error) });
        analysis = buildRulesOnlyResponse(
          "Final response construction failed; showing the rule-based result.",
        );
      }
    } else {
      analysis = buildRulesOnlyResponse(
        requestedPath === "cloud"
          ? "Cloud inference failed; showing the rule-based result."
          : "Both AI paths failed; showing the rule-based result.",
      );
    }

    const result = {
      analysis,
      path,
      requestedPath,
      actualPath,
      inferenceSource,
      reason,
      deviceAvailability,
      deviceError: errorMessage(deviceError),
      cloudError: errorMessage(cloudError),
      responseError: errorMessage(responseError),
    };

    notify({
      state: "done",
      path,
      requestedPath,
      actualPath,
      inferenceSource,
      reason,
      responseError: errorMessage(responseError),
    });
    return result;
  };
}

export const hybridAnalyze = createHybridAnalyzer();
