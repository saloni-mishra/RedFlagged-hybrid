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
