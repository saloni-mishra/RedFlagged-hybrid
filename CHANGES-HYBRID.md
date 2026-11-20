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
