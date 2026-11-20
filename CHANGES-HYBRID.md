# Hybrid AI changes

Running log of work done during the #BuildHybridAI hackathon. One section per stage.

The upstream RedFlagged code and the MIT LICENSE are kept as-is unless a stage explicitly says otherwise.

## Stage 1 — App Check and cloud-path smoke test

**Built**

- Initialized Firebase App Check in `frontend/src/firebase.js` before the AI client is created.
  - Development builds set `self.FIREBASE_APPCHECK_DEBUG_TOKEN = true` so localhost works without registering a reCAPTCHA domain. The token is printed by Firebase in the browser console.
  - Production builds use `ReCaptchaEnterpriseProvider` with `VITE_RECAPTCHA_SITE_KEY` and auto-refresh App Check tokens.
- Extended the AI test page with a second button that calls the same prompt with `InferenceMode.ONLY_IN_CLOUD`, alongside the existing `ONLY_ON_DEVICE` test.
- Added `frontend/.env.example` with empty variable names (no values committed).
- Updated `frontend/.gitignore` so the checked-in `.env.example` template is not ignored.

**Why**

App Check must be active before Firebase AI Logic requests so the cloud path is protected. Having both an on-device and a cloud smoke-test button verifies each inference path independently before the app logic is wired up.

**Files changed**

- `frontend/src/firebase.js`
- `frontend/src/ai-test.js`
- `frontend/ai-test.html`
- `frontend/.env.example`
- `frontend/.gitignore`
- `CHANGES-HYBRID.md`

**How to test**

1. Copy `frontend/.env.example` to `frontend/.env.local` and fill in the existing Firebase values plus `VITE_RECAPTCHA_SITE_KEY`.
2. Run `cd frontend && npm run dev`.
3. Open `http://localhost:5173/ai-test.html`.
4. Click **Run on-device test**. The first run may download the on-device model and should show progress, then return a sentence.
5. Click **Run cloud test**. It should return a sentence without downloading an on-device model.
6. Open the browser console. In development, Firebase prints a debug token. If App Check enforcement is enabled in the Firebase console, register that token under App Check > Apps > Manage debug tokens.
7. Run `npm run build` to confirm the production bundle builds. Production uses the reCAPTCHA Enterprise provider from `VITE_RECAPTCHA_SITE_KEY`, not the debug token.

### Stage 1 follow-up — reCAPTCHA Enterprise provider

**Built**

- Switched the production App Check provider from `ReCaptchaV3Provider` to `ReCaptchaEnterpriseProvider` in `frontend/src/firebase.js`, matching the `redflagged-web` registration in Firebase App Check.
- Kept the development debug-token flow unchanged: `import.meta.env.DEV` still enables `self.FIREBASE_APPCHECK_DEBUG_TOKEN = true`, and the site key is not required locally.
- Documented that `VITE_RECAPTCHA_SITE_KEY` is a reCAPTCHA Enterprise score-based site key.

**Why**

Firebase App Check rejects a v3 token for an app registered with reCAPTCHA Enterprise. The provider type must match the App Check registration in the Firebase console.

**Files changed**

- `frontend/src/firebase.js`
- `frontend/.env.example`
- `CHANGES-HYBRID.md`

**How to test**

1. Local: run `npm run dev`, open `/ai-test.html`, and confirm both test buttons still work with the debug token.
2. Production: set `VITE_RECAPTCHA_SITE_KEY` to the reCAPTCHA Enterprise score-based site key, build, serve the app, and confirm the cloud test succeeds with App Check enforcement enabled.

## Stage 2 — Rule engine in the browser via Pyodide

**Built**

- Pinned Pyodide `0.27.8`, which runs CPython `3.12.7` — the same version as the local backend.
- Added a lazy-loaded Web Worker (`frontend/src/pyodide/rulesWorker.js`) that loads Pyodide from the jsDelivr CDN only on the first analysis request.
- Loaded `backend/rules.py` and `backend/knowledge.py` **unchanged** through Vite `?raw` imports, writing the exact source into Pyodide’s virtual filesystem. There is no second copy of the rule logic.
- Added `frontend/src/pyodide/dispatch.py`, a thin JSON bridge that imports `analyze_rules` and `retrieve_context`.
- Exposed `analyzeRules(text, { lang, onStatus })` from `frontend/src/pyodide/rulesEngine.js`. It returns the same dictionary as Python, with the result transferred as JSON text before parsing.
- Added loading, analyzing, done, and error states through the `onStatus` callback, including the measured engine load time and Python/Pyodide versions.
- Added `frontend/rules-test.html` and `frontend/src/rules-test.js` to exercise the Worker in a browser and display the result JSON and timings.
- Added `frontend/scripts/check-rules-parity.mjs` and the `npm run check:rules-parity` script. It extracts the 30 samples from `backend/t.py`, runs them through native Python and Pyodide, and compares results.
- Added `pyodide` as an exact dev dependency and allowed Vite to read the backend sources from the repository root.

**Why**

Running the existing Python rule engine unchanged keeps one source of truth for scores and risk levels while moving deterministic checks into the browser. Pyodide runs in a Worker, so the UI stays responsive and the LLM is never responsible for the score.

**Verification results**

- Samples: 30
- Score/level/flags parity: **30/30**
- Full result parity: **30/30**
- Expected-level checks from `t.py`: **30/30**
- `retrieve_context` parity: **match**
- Pyodide load + module import in Node: **1.6–2.8 s**
- Browser Worker cold load from CDN: **6.6 s**
- Analysis time after load: **1.2–5.5 ms per sample** in Node; one browser sample took about 129 ms on the first call.

**Files changed**

- `frontend/package.json`
- `frontend/package-lock.json`
- `frontend/vite.config.js`
- `frontend/src/pyodide/config.js`
- `frontend/src/pyodide/dispatch.py`
- `frontend/src/pyodide/rulesEngine.js`
- `frontend/src/pyodide/rulesWorker.js`
- `frontend/rules-test.html`
- `frontend/src/rules-test.js`
- `frontend/scripts/check-rules-parity.mjs`
- `CHANGES-HYBRID.md`

**How to test**

1. Run `cd frontend && npm run check:rules-parity`. It should report 30/30 parity for scores, levels, and flags.
2. Run `npm run dev` and open `http://localhost:5173/rules-test.html`.
3. Click **Analyze rules**. The first click shows the Pyodide loading state, then the score, level, flags, and full JSON. The status line shows engine load and analysis times.
4. Optional: open `http://localhost:5173/rules-test.html?auto=1` to run the sample automatically.
5. Run `npm run build` to confirm the normal app still builds. The Worker bundle was also checked separately with the backend `?raw` imports included.

## Stage 3 — JavaScript analysis layer

**Built**

- Added a pure JavaScript analysis layer under `frontend/src/analysis/`.
- Ported the backend narrative and knowledge helpers:
  - `retrieveContext()` from `knowledge.py`
  - `buildPrompt()` from `_build_prompt()`
  - `linkAssessment()` from `_link_assessment()`
  - `ruleRows()` from `_rule_rows()`
  - `fallbackResponse()` from `_fallback_response()`
  - `FALLBACK_TEXT` constants
- Added `buildAnalysisResponse()`, which merges AI narrative fields with rule-engine results while always taking `risk_level` and `calculated_score` from the rule engine.
- Added JSON schema constants for the Gemini response, rule rows, red flags, and the final `NoticeAnalysisResponse`.
- Confirmed the raw Python rule result uses **`rule_score`**; the final API-compatible object maps it to **`calculated_score`**.
- Preserved `rule_breakdown[].evidence` from the raw Python rule result. The existing Pydantic model omits it, but `App.jsx` uses it for evidence highlighting.
- Kept Hindi/English behavior, prompt wording, URL classification, and fallback messages aligned with the Python implementation.
- Did not modify `App.jsx`, `backend/main.py`, `backend/rules.py`, `backend/knowledge.py`, PDF extraction, or any backend endpoint.

**Why**

Stage 4 needs the prompt, knowledge, and response-building logic available in the browser before adding Firebase AI Logic routing. Keeping these functions pure and separately tested lets the hybrid path reuse the existing backend behavior without changing the UI yet.

**Verification results**

- `npm run test:analysis`: **10/10 passing**
- Tests cover English prompt generation, Hindi prompt generation, knowledge retrieval, URL assessment, normal response construction, rules-only fallback, evidence preservation, Hindi fallback, and App.jsx response-shape compatibility.
- `npm run lint`: passes; only the pre-existing `App.jsx` warnings remain.
- `npm run build`: passes.

**Files changed**

- `frontend/src/analysis/fallbackText.js`
- `frontend/src/analysis/knowledge.js`
- `frontend/src/analysis/prompt.js`
- `frontend/src/analysis/response.js`
- `frontend/src/analysis/schemas.js`
- `frontend/src/analysis/index.js`
- `frontend/test/analysis.test.js`
- `frontend/package.json`
- `CHANGES-HYBRID.md`

**How to test**

1. Run `cd frontend && npm run test:analysis`. All 10 analysis tests should pass.
2. Run `npm run lint` and `npm run build`.
3. Stage 3 is not wired into the UI yet; Stage 5 will replace the `/api/analyze` fetch and add the visible routing badge.

## Stage 4 Part 1 — Firebase AI Logic inference service

**Built**

- Added `frontend/src/analysis/firebaseInference.js`, a standalone inference service with no routing decisions and no UI wiring.
- Added separate model configurations:
  - On-device: `InferenceMode.ONLY_ON_DEVICE`
  - Cloud: `InferenceMode.ONLY_IN_CLOUD`
  - Cloud model: `gemini-3.5-flash-lite`
- Added `GEMINI_ANALYSIS_AI_SCHEMA`, a simplified version of the Stage 3 Gemini schema using only the documented structured-output fields (`type`, `properties`, `required`, `items`, `enum`).
- Configured on-device structured output through `onDeviceParams.promptOptions.responseConstraint`.
- Configured cloud structured output through `inCloudParams.generationConfig.responseMimeType` and `responseSchema`.
- Added on-device availability detection using the public Chrome `LanguageModel.availability()` API. Firebase’s internal `ChromeAdapter` is not called.
- Used the same language options for availability and model creation:
  - `expectedInputs: [{ type: "text", languages: ["en"] }]`
  - `expectedOutputs: [{ type: "text", languages: ["en"] }]`
- Added `initializeDeviceInference(model, onProgress)` which forwards `initializeDeviceModel` progress values from 0 to 1. It is documented as requiring a user interaction.
- Added `generateAiJson(model, prompt)` which:
  - reads `result.response.inferenceSource` after every successful generation,
  - parses JSON,
  - validates the full AI response structure,
  - rejects invalid JSON, missing required fields, and wrong data types,
  - accepts contract-valid empty strings and empty arrays,
  - strips unexpected AI fields.
- Aligned runtime validation with the Python/Stage 3 contract:
  - empty `red_flags`, `safe_next_steps`, and `verification_guidance` arrays are accepted,
  - empty strings are accepted in required text fields, red-flag fields, and string arrays,
  - any string is accepted for the AI `risk_level` (the final risk still comes from Python),
  - missing fields and incorrect types are still rejected.
- Added `AiResponseError` with codes `invalid-json` and `invalid-response`, retaining the SDK-reported `inferenceSource` for debugging and fallback reporting.
- Did not make routing decisions, modify `App.jsx`, change backend files, or alter the Python rule engine.

**Why**

Stage 4 Part 2 needs a tested inference service before routing can be added. Keeping model creation, availability detection, initialization, generation, JSON validation, and actual-source reporting separate makes the routing layer smaller and easier to test.

**Verification results**

- `npm test`: **29/29 passing** across Stage 3 and Stage 4 Part 1 tests.
- `npm run test:inference`: **19/19 passing**
- `npm run test:analysis`: **10/10 passing**
- `npm run lint`: passes; only the pre-existing `App.jsx` warnings remain.
- `npm run build`: passes.
- Tests cover device configuration, cloud configuration, model factory injection, schema restrictions, availability options, missing API handling, download progress, initialization failure, device success, cloud success, actual `inferenceSource` reporting, invalid JSON, invalid structure, contract-valid empty values, missing-field rejection, wrong-type rejection, extra-field removal, and direct parse/validate helpers.

**Files changed**

- `frontend/src/analysis/firebaseInference.js`
- `frontend/src/analysis/schemas.js`
- `frontend/src/analysis/index.js`
- `frontend/test/firebaseInference.test.js`
- `frontend/package.json`
- `CHANGES-HYBRID.md`

**How to test**

1. Run `cd frontend && npm run test:inference`. All 19 inference-service tests should pass.
2. Run `npm run test:analysis` to confirm Stage 3 remains intact.
3. Run `npm run lint` and `npm run build`.
4. Part 1 is not wired into the UI yet. Part 2 adds routing and requested/actual path reporting.

## Stage 4 Part 2 — Hybrid routing layer

**Built**

- Added `frontend/src/hybridAnalyze.js`, which orchestrates:
  - the Stage 2 Python rule engine through `analyzeRules()`,
  - the Stage 3 knowledge, prompt, and response builders,
  - the Stage 4 Part 1 Firebase inference service.
- Added `chooseRequestedPath()` with these rules:
  - PDF source: cloud.
  - Detected language not `en`: cloud.
  - Message longer than 8,000 characters: cloud.
  - Estimated prompt + schema tokens above the on-device budget: cloud.
  - Otherwise: device.
- Derived the on-device budget from the 9,216-token limit:
  - 2,500 tokens reserved for output.
  - 15% safety factor.
  - `ON_DEVICE_INPUT_TOKEN_BUDGET = 5708`.
  - Conservative estimator: `ceil(code points / 3)`.
- Added explicit manual fallback:
  - device eligibility + availability → call device once,
  - any device initialization, generation, parsing, or validation failure → call cloud once,
  - cloud-only route failure → rules-only fallback,
  - both paths failing → rules-only fallback.
- Starts device availability/initialization before the Pyodide rule engine resolves for short input that is unlikely to be classified as Hindi (using the same >20% Devanagari threshold) so Chrome's user-activation requirement is met. The final routing decision still uses the Python-detected language and full prompt size.
- Reads the SDK-reported `result.response.inferenceSource` for every successful AI call and maps it to `actualPath`.
- Returns metadata separately:
  - `path`: `"device" | "cloud" | "rules-only"`
  - `requestedPath`: `"device" | "cloud"`
  - `actualPath`: `"device" | "cloud" | null`
  - `inferenceSource`: raw SDK value
  - `reason`: human-readable explanation
  - `deviceAvailability`, `deviceError`, `cloudError`
- The final `analysis` object always takes score, risk level, flags, evidence, and URL classification from the Python rule result.
- Added status events for rules, device availability, initialization, download progress, generation, fallback, and completion.
- Did not modify `App.jsx`, backend files, the Python rule engine, or the Stage 3 response builder.

**Verification results**

- `npm test`: **41/41 passing**
- `npm run test:hybrid`: **12/12 passing**
- `npm run test:inference`: **19/19 passing**
- `npm run test:analysis`: **10/10 passing**
- `npm run lint`: passes; only the pre-existing `App.jsx` warnings remain.
- `npm run build`: passes.
- Hybrid tests cover short English device success, Hindi cloud routing, long English cloud routing, PDF routing, requested vs actual source reporting, device initialization failure, device JSON failure, both paths failing, cloud-only failure, and rule-engine score/risk preservation.

**Files changed**

- `frontend/src/hybridAnalyze.js`
- `frontend/test/hybridAnalyze.test.js`
- `frontend/package.json`
- `CHANGES-HYBRID.md`

**How to test**

1. Run `cd frontend && npm run test:hybrid`. All 12 routing tests should pass.
2. Run `npm test` to confirm all 41 tests pass.
3. Run `npm run lint` and `npm run build`.
4. Part 2 is still not connected to `App.jsx`. Stage 5 will replace the `/api/analyze` fetch, pass the Firebase `ai` instance, and add the visible path badge.

### Stage 4 Part 2 hardening

**Built**

- Mirrored the exact Python language precheck from `backend/rules.py detect_language()`:
  - collect alphabetic characters (`isalpha()` in Python, Unicode letter matching in JS),
  - count Devanagari characters in the `0x0900–0x097F` range,
  - classify as likely Hindi only when the ratio is strictly greater than `0.20`.
- Updated the early device-initialization candidate check to use that ratio instead of skipping any text containing Devanagari. Mixed-script messages that Python classifies as English now start device initialization early.
- Normalized PDF source values with `isPdfSource()`:
  - `pdf`, `PDF`, `application/pdf`, and `application/pdf; ...` all select cloud.
  - PDF extraction remains on FastAPI; extracted PDF text can enter hybrid analysis and is never eligible for device inference.
- Added a final response-construction safety net:
  - if `buildAnalysisResponse()` throws, the result switches to `path: "rules-only"`,
  - `actualPath` and `inferenceSource` are cleared,
  - the existing rules-only fallback is returned,
  - the construction error is exposed as `responseError`.
- Preserved fallback behavior:
  - at most one explicit cloud attempt after a device failure,
  - rules-only fallback if inference or final response construction fails.
- Did not modify `App.jsx`, backend behavior, Python rules, or the Stage 3 response builder.

**Verification results**

- `npm test`: **51/51 passing**
- `npm run test:analysis`: **10/10 passing**
- `npm run test:inference`: **19/19 passing**
- `npm run test:hybrid`: **22/22 passing**
- `npm run check:rules-parity`: 30/30 score/level/flags parity; full result parity; knowledge parity
- `npm run lint`: passes; only the pre-existing `App.jsx` warnings remain
- `npm run build`: passes
- New hybrid tests cover mixed-script English early initialization, pure Hindi non-initialization, missing/unexpected `inferenceSource` on device and cloud, structurally invalid device JSON, cloud responses reporting `on_device`, PDF source variants, AI override attempts against Python-owned fields, and final response-construction failure.

**Files changed**

- `frontend/src/hybridAnalyze.js`
- `frontend/test/hybridAnalyze.test.js`
- `CHANGES-HYBRID.md`

**How to test**

1. Run `cd frontend && npm run test:hybrid`. All 22 routing tests should pass.
2. Run `npm test` to confirm all 51 tests pass.
3. Run `npm run check:rules-parity`, `npm run lint`, and `npm run build`.

## Stage 5 — Hybrid analysis integrated into App.jsx

**Built**

- Replaced the ordinary-text `/api/analyze` fetch with a direct `hybridAnalyze()` call from the Analyze click handler.
- Passed the Firebase AI instance from `firebase.js` into both hybrid text analysis and image extraction.
- Preserved the existing input, sample-message, speech, share/export, validation, loading, and results-rendering flows.
- Added actual-path inference badges in the existing results area:
  - `Checked on your device`
  - `Sent to cloud` with the returned reason and requested/actual path when they differ
  - `Rules only (AI unavailable)`
- Added a visible reason line under the results summary. The badge always uses `path`, never `requestedPath`.
- Added device model download progress using `onStatus`, including a progress bar and percentage status text.
- Forwarded Pyodide rule-engine loading status from `hybridAnalyze()` into the App so first-use engine loading is visible.
- Added image handling for JPEG/PNG:
  - validates the upload type,
  - extracts text with Firebase AI Logic using cloud multimodal inference (`generateContent` with an `inlineData` JPEG/PNG part),
  - sends only the extracted text into `hybridAnalyze()`,
  - keeps the final text-analysis path independent from the image-extraction path.
- Added a note that image text was extracted in the cloud while the final analysis may run on-device or in the cloud.
- Kept PDF handling on FastAPI `/api/extract-text`.
- Added `sourceType: "pdf"` for extracted PDF text, forcing cloud analysis.
- Added a PDF note that extraction happens on the server before analysis.
- Added `uploadPipeline.js` to classify PDF/image/unsupported uploads and keep upload processing separate from the App UI.
- Added `inferenceStatus.js` for badge and status-message mapping.
- Extended `extractImageText()` and `createCloudVisionModel()` in the Firebase inference service.
- Did not modify `backend/`, the Python rule engine, the Stage 3 response builder, or existing Learn/Practice flows.

**Verification results**

- `npm test`: **65/65 passing**
- `npm run test:analysis`: **10/10 passing**
- `npm run test:inference`: **23/23 passing**
- `npm run test:hybrid`: **23/23 passing**
- `npm run test:integration`: **9/9 passing**
- `npm run lint`: passes; only pre-existing `App.jsx` warnings remain
- `npm run build`: passes
- New integration tests cover `hybridAnalyze()` usage instead of `/api/analyze`, PDF extraction through `/api/extract-text`, image extraction through cloud vision, badge actual-path behavior, and status messages for first-use rule loading and device download progress.

**Files changed**

- `frontend/src/App.jsx`
- `frontend/src/hybridAnalyze.js`
- `frontend/src/analysis/firebaseInference.js`
- `frontend/src/analysis/index.js`
- `frontend/src/inferenceStatus.js`
- `frontend/src/uploadPipeline.js`
- `frontend/test/firebaseInference.test.js`
- `frontend/test/hybridAnalyze.test.js`
- `frontend/test/inferenceStatus.test.js`
- `frontend/test/uploadPipeline.test.js`
- `frontend/test/appIntegration.test.js`
- `frontend/package.json`
- `CHANGES-HYBRID.md`

**How to test**

1. Run `cd frontend && npm test`.
2. Run the individual test scripts: `npm run test:analysis`, `npm run test:inference`, `npm run test:hybrid`, `npm run test:integration`.
3. Run `npm run lint` and `npm run build`.
4. Browser checks:
   - Short English text: verify the badge says **Checked on your device** when the SDK reports `on_device`.
   - Hindi text: verify **Sent to cloud** with a language reason.
   - Long English text: verify **Sent to cloud** with a length reason.
   - JPEG/PNG upload: verify the cloud extraction status and note, then verify the final badge reflects the final text-analysis path.
   - PDF upload: verify the server-extraction note and that the final badge is cloud.
   - Device unavailable or failure: verify one cloud fallback and **Sent to cloud**.
   - Both AI paths fail: verify **Rules only (AI unavailable)** and that the rule-based score/risk remain visible.
   - First analysis: verify the Pyodide loading status appears.
   - Model download: verify the download progress bar and percentage appear.

## Stage 6 — Deployment preparation

### Step 1 — Branch switch

- Confirmed a clean working tree and switched from `main` to `hybrid-inference`.
- No code changes were made in this step.

### Step 2 — Make Gemini optional in the FastAPI backend

**Built**

- Removed the import-time failure when `GEMINI_API_KEY` is missing.
- The Gemini client is now created only when the key is configured.
- FastAPI can start and serve PDF extraction without a Gemini key.
- Added `_require_gemini_client()`:
  - returns the configured client when available,
  - raises a clear HTTP 503 when a legacy Gemini-backed feature is requested without a key.
- Preserved:
  - `/api/extract-text` raw text behavior,
  - `/api/extract-text` PDF extraction through `pypdf`,
  - `/api/extract-text` image extraction through Gemini when configured,
  - `/api/analyze` Gemini analysis and rules-only fallback when Gemini is configured.
- When the key is missing:
  - image extraction returns HTTP 503 with a configuration message,
  - `/api/analyze` returns HTTP 503 with a configuration message,
  - PDF extraction still works normally.
- Did not change Python rules, scoring, prompts, frontend files, routes, request formats, or response formats.

**Verification results**

- Mocked backend import and endpoint checks: **6/6 passed**
  - imports without `GEMINI_API_KEY`,
  - PDF extraction works without Gemini,
  - image extraction returns 503 without Gemini,
  - `/api/analyze` returns 503 without Gemini,
  - image extraction uses Gemini when configured,
  - `/api/analyze` uses Gemini when configured.
- `backend/t.py`: **30/30 samples passed**, `failures: 0`.
- `pytest` is not installed in the current environment, so the existing pytest-based backend tests could not be run without installing dependencies.

**Files changed**

- `backend/main.py`
- `CHANGES-HYBRID.md`

**Important limitation**

Full FastAPI startup was not executed against the real installed backend dependencies because `fastapi`, `pypdf`, `PIL`, `dotenv`, and `google-genai` are not installed in this environment. The import and endpoint behavior was verified with equivalent mocked modules; full dependency installation remains a deployment-environment step.

### Step 3 — Finalize production Vercel origin in CORS

**Built**

- Final FastAPI CORS `allow_origins` list:
  - `https://red-flagged-hybrid.vercel.app`
  - `http://localhost:5173`
  - `http://127.0.0.1:5173`
- Removed the older `https://red-flagged-nu.vercel.app` origin.
- Did not use wildcard origins.
- Preserved `allow_credentials`, `allow_methods`, and `allow_headers` unchanged.
- No frontend files, Python rules, scoring, prompts, or other backend behavior changed.

**Verification results**

- Python syntax/compile check passed.
- `python -B t.py`: 30/30 samples passed, `failures: 0`.

**Files changed**

- `backend/main.py`
- `CHANGES-HYBRID.md`

**Still required**

- Confirm the Vercel production deployment uses exactly `https://red-flagged-hybrid.vercel.app` as its origin.
- Ensure the backend service is redeployed for the CORS change to take effect.
