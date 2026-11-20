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
4. Part 1 is not wired into the UI yet. Part 2 will add routing and the requested/actual path reporting.
