# RedFlagged Hybrid

**Understand. Check. Verify.**

RedFlagged Hybrid helps people identify warning signs in suspicious messages that imitate legal notices, police communications, government departments, banks, or payment services.

The project combines a deterministic Python rule engine with hybrid AI inference:

- the Python rule engine remains the source of truth for score, risk level, flags, evidence, and URL classification;
- Firebase AI Logic provides explanatory narrative through on-device or cloud inference;
- Pyodide runs the existing Python rules in a browser Web Worker;
- a small FastAPI service handles PDF text extraction.

## Try it live

- **Live application:** https://red-flagged-hybrid.vercel.app/
- **Backend API documentation:** https://redflagged-hybrid-backend.onrender.com/docs

> RedFlagged does not determine the legal validity or authenticity of a document and does not provide legal advice. It highlights warning signs and suggests safer verification steps.

## What it does

- Accepts pasted text, JPEG/PNG images, and PDFs.
- Runs deterministic checks for urgency, payment demands, OTP/credential requests, suspicious links, brand impersonation, lookalike domains, courier scams, and job/recruitment lures.
- Calculates a 0–100 risk score and a LOW/MEDIUM/HIGH risk level in Python.
- Uses AI only for the explanatory narrative: situation type, summary, red flags, safety steps, verification guidance, and disclaimer.
- Shows whether the final analysis actually ran on-device, in the cloud, or used the rules-only fallback.
- Preserves the existing read-aloud, share/copy, export, sample-message, and results-display flows.

## Hybrid architecture

```text
User input
   |
   +-- Text ------------------------------+
   |                                      |
   +-- Image -> Firebase AI Logic         |
   |            cloud text extraction     |
   |                                      |
   +-- PDF ---> FastAPI /api/extract-text |
                pypdf text extraction     |
                                          v
                              Extracted/entered text
                                          |
                                          v
                         Pyodide Web Worker (browser)
                         existing backend/rules.py +
                         backend/knowledge.py
                                          |
                          rules, score, level, evidence,
                          URL classification, language
                                          |
                                          v
                         Stage 3 prompt/response layer
                                          |
                        +-----------------+-----------------+
                        |                                   |
                 On-device AI                        Cloud AI
              Chrome Prompt API               Firebase AI Logic
              (short English)          (Hindi, long text, PDF, fallback)
                        |                                   |
                        +-----------------+-----------------+
                                          |
                                 Validated JSON narrative
                                          |
                                          v
                          Python-owned final response
                     (score/risk/evidence never from AI)
                                          |
                                          v
                                  Existing results UI
```

### Why Python remains authoritative

The browser runs the original `backend/rules.py` unchanged through Pyodide. The Python result is the sole source for:

- `rule_score`
- `risk_level`
- rule flags
- evidence
- URL classification
- detected language

The AI response may contain a `risk_level`, but the frontend response builder ignores it. AI failures cannot change the score or risk classification.

### Risk scoring

Triggered rule weights are summed into raw points, then converted to a 0–100 score:

```text
score = round(100 * (1 - exp(-raw_points / 38)))
```

- Below 25: LOW
- 25 to 64: MEDIUM
- 65 and above: HIGH

The score and level are derived from the same Python result, so they always agree. The AI narrative cannot change either value.

### Routing rules

| Input | Requested path |
|---|---|
| Short English text within the conservative on-device budget | On-device first |
| Hindi/Devanagari text | Cloud |
| Long text | Cloud |
| PDF-derived text | Cloud |
| Image text after cloud extraction | Follows the extracted text's normal routing |

If on-device inference fails or is unavailable, one cloud attempt is made. If the AI path still fails, the app returns the rules-only fallback. The displayed badge uses the SDK-reported actual inference source, not the requested route:

- **Checked on your device**
- **Sent to cloud**
- **Rules only (AI unavailable)**

The on-device path is available only in supported Chrome desktop environments. The app never claims device inference succeeded just because it was requested.

## Image and PDF processing

### Images

JPEG and PNG uploads are sent to Firebase AI Logic cloud inference for text extraction. Only the extracted text enters the browser rule engine and hybrid analysis pipeline. Image data is not sent to Pyodide.

### PDFs

PDF uploads go to the FastAPI `/api/extract-text` endpoint, which uses `pypdf`. The PDF binary is not sent to Firebase AI Logic. The extracted text is then analyzed with `sourceType: "pdf"`, which routes the final analysis to cloud inference.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 8, Tailwind CSS 4 |
| Browser rule engine | Pyodide 0.27.8 with Python 3.12.7 |
| AI | Firebase AI Logic (Gemini 3.5 Flash-Lite cloud model; Chrome Prompt API on-device) |
| Backend | FastAPI, `pypdf`, `python-multipart` |
| Security | Firebase App Check with reCAPTCHA Enterprise |
| Frontend deployment | Vercel |
| Backend deployment | Render  |

## Repository structure

```text
RedFlagged-hybrid/
├─ frontend/
│  ├─ src/
│  │  ├─ App.jsx                    # Existing analysis UI
│  │  ├─ firebase.js                # Firebase, App Check, AI client
│  │  ├─ hybridAnalyze.js           # Routing, fallback, actual-path metadata
│  │  ├─ analysis/                  # Shared prompt, schema, response, AI service
│  │  ├─ pyodide/                   # Web Worker and Python bridge
│  │  ├─ uploadPipeline.js          # PDF/image upload processing
│  │  └─ inferenceStatus.js         # Badge and loading status mapping
│  ├─ test/                         # Node test suite
│  ├─ scripts/check-rules-parity.mjs
│  ├─ ai-test.html                  # Development-only Firebase AI test
│  └─ rules-test.html               # Development-only Pyodide test
├─ backend/
│  ├─ main.py                       # FastAPI, PDF extraction, legacy Gemini routes
│  ├─ rules.py                      # Authoritative Python rule engine
│  ├─ knowledge.py                  # Curated knowledge retrieval
│  ├─ t.py                          # 30-message rule regression script
│  └─ test_*.py                     # Pytest regression tests
├─ LICENSE
└─ README.md
```

## Local setup

### Prerequisites

- Python 3.12
- Node.js and npm (the project was developed with Node 24)
- Google Chrome desktop for on-device testing
- A Firebase project with AI Logic and App Check configured

### 1. Backend setup

```bash
cd backend
python -m venv venv
```

Activate the environment:

```bat
rem Windows Command Prompt
venv\Scripts\activate
```

```powershell
# Windows PowerShell
.\venv\Scripts\Activate.ps1
```

```bash
# macOS/Linux
source venv/bin/activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Start the API:

```bash
uvicorn main:app --reload --port 8000
```

`GEMINI_API_KEY` is **optional** for PDF extraction. If it is not set, the legacy `/api/analyze` route and the image branch of `/api/extract-text` return HTTP 503. Existing behavior is preserved when a key is configured.

### 2. Frontend setup

```bash
cd frontend
npm install
cp .env.example .env.local
```

Fill in `frontend/.env.local` with your own Firebase values. Do not commit this file.

Start Vite:

```bash
npm run dev
```

The frontend usually runs at `http://localhost:5173`.

For local PDF extraction, set:

```env
VITE_API_URL=http://127.0.0.1:8000
Use this URL when running the backend locally. For the deployed backend, use https://redflagged-hybrid-backend.onrender.com instead.
```

## Environment variables

| Variable | Location | Required | Purpose |
|---|---|---|---|
| `VITE_FIREBASE_API_KEY` | `frontend/.env.local` / Vercel | Yes | Firebase web app configuration |
| `VITE_FIREBASE_AUTH_DOMAIN` | `frontend/.env.local` / Vercel | Yes | Firebase web app configuration |
| `VITE_FIREBASE_PROJECT_ID` | `frontend/.env.local` / Vercel | Yes | Firebase project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | `frontend/.env.local` / Vercel | Yes | Firebase storage bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `frontend/.env.local` / Vercel | Yes | Firebase messaging sender ID |
| `VITE_FIREBASE_APP_ID` | `frontend/.env.local` / Vercel | Yes | Firebase web app ID |
| `VITE_RECAPTCHA_SITE_KEY` | `frontend/.env.local` / Vercel | Production: yes | reCAPTCHA Enterprise score-based site key for App Check |
| `VITE_API_URL` | `frontend/.env.local` / Vercel | For PDFs | FastAPI backend base URL |
| `GEMINI_API_KEY` | `backend/.env` / host | No | Enables legacy `/api/analyze` and backend image extraction |
| `GEMINI_MODEL` | `backend/.env` / host | No | Legacy Gemini model override |

Never commit `.env`, `.env.local`, API keys, debug tokens, or credentials.

## Firebase App Check

`frontend/src/firebase.js` initializes App Check before the AI client:

- **Development:** `self.FIREBASE_APPCHECK_DEBUG_TOKEN = true` is set only when `import.meta.env.DEV` is true. Firebase prints the debug token in the browser console. Register it in Firebase App Check if enforcement is enabled.
- **Production:** `ReCaptchaEnterpriseProvider` is used with `VITE_RECAPTCHA_SITE_KEY`, and automatic token refresh is enabled.

Production setup requires:

1. Register the Vercel domain in Firebase App Check.
2. Add the production domain to the reCAPTCHA Enterprise site-key allowlist.
3. Set `VITE_RECAPTCHA_SITE_KEY` in Vercel.
4. Do not ship the development debug token.

Production App Check configuration must be verified against the current Firebase and Google Cloud project settings.

## Deployment overview

### Frontend: Vercel

Suggested project settings:

- Root directory: `frontend`
- Build command: `npm run build`
- Output directory: `dist`
- Environment variables: all `VITE_*` names above

Frontend deployment target:

```text
https://red-flagged-hybrid.vercel.app/
```

Confirm the current deployment status separately. The repository does not contain a `vercel.json`.

### Backend: Render 

Deploy the `backend/` folder as a Python web service.

```bash
uvicorn main:app --host 0.0.0.0 --port $PORT
```

Required backend environment variables:

- None for PDF-only extraction.
- `GEMINI_API_KEY` only if legacy `/api/analyze` or backend image extraction must remain available.

Set `VITE_API_URL` in Vercel to the deployed backend base URL.

### CORS

The backend currently allows:

```text
https://red-flagged-hybrid.vercel.app
http://localhost:5173
http://127.0.0.1:5173
```

CORS uses explicit origins with credentials; no wildcard origin is used.

## Testing

### Frontend

```bash
cd frontend
npm test
npm run check:rules-parity
npm run lint
npm run build
```

Current automated results:

- `npm test`: **65/65 passed**
- Rule parity: **30/30** score/level/flags, full result parity, expected-level checks, and knowledge retrieval
- `npm run lint`: passes with existing warnings in `App.jsx`
- `npm run build`: passes

Individual test scripts are also available:

```bash
npm run test:analysis
npm run test:inference
npm run test:hybrid
npm run test:integration
```

### Backend rules

```bash
cd backend
python -B t.py
```

The 30-message regression script currently passes with `failures: 0`.

The pytest files in `backend/` require `pytest` (not listed in `backend/requirements.txt` in this environment). They were not run as part of the final checks.

## Historical regression notes

- **Negation-aware urgency detection:** A nearby negation in the same clause can prevent a false urgency match. A benign “no urgent deadline” message remains LOW.
- **Shortened URLs:** Common shorteners written without an `http://` scheme are detected.
- **Image extraction evolution:** The original deployment used Tesseract OCR, then Gemini vision. The hybrid version now uses Firebase AI Logic cloud inference for JPEG/PNG extraction, followed by the browser rule engine.
- **Hindi and job-scam coverage:** Hindi-safe word boundaries and additional Hindi/Hinglish payment, OTP, courier, and job-fee patterns were added. The 30-message regression suite covers these cases.

These are regression notes, not a claim of exhaustive validation.

## Known limitations and untested areas

- **Live integration testing:** The automated tests use mocked AI models and responses. Real browser, Firebase AI Logic, App Check, image upload, and PDF upload tests still require a configured environment.
- **On-device availability:** Chrome desktop support, Gemini Nano availability, model download, and user-activation behavior vary by device and browser version.
- **On-device language support:** Hindi/Devanagari text is routed to cloud inference. Short English text is the on-device candidate.
- **On-device limits:** The app uses a conservative estimate against the 9,216-token on-device limit because the SDK does not expose an exact on-device token count. The limits are not exact tokenization.
- **Cloud dependency:** Cloud inference and image extraction require Firebase AI Logic, App Check, network access, and configured quotas.
- **Pyodide loading:** The first rule-engine use downloads Pyodide from a CDN and can take several seconds.
- **AI reliability:** AI narrative can be incomplete or incorrect. The rule engine remains authoritative, and invalid AI output falls back to cloud or rules-only analysis.
- **Backup mode:** Rules-only fallback text is fixed and less detailed than a successful AI explanation.
- **Rule coverage:** The rule engine only detects patterns for which checks have been implemented. Unfamiliar scam wording may not be recognized.
- **Curated domain coverage:** Lookalike-domain detection depends on the curated institution list; unlisted institutions may receive fewer similarity checks.
- **Language support:** English and Hindi (Devanagari) are supported. Roman-script Hindi is detected by the rules but its explanation is in English. Gujarati is not supported.
- **Legacy backend routes:** `/api/analyze` and backend image extraction still depend on Gemini. They are not used by the hybrid frontend. Without a key they return HTTP 503.
- **PDF dependency:** PDF extraction requires the FastAPI backend and `pypdf`.
- **Verification is not authentication:** The app recommends safer verification; it does not independently authenticate a message or document.
- **No separate Learn/Practice screens** exist in this repository snapshot; the existing analysis, sample-message, speech, share, and export flows were preserved.
- **Knowledge coverage:** The curated knowledge base and domain list cover selected scenarios, not every institution or scam pattern.
- **Read-aloud voices:** Browser voice availability depends on the user's installed voices.
- **Production configuration:** App Check domain allowlisting, Vercel environment variables, the backend URL, and CORS must be configured and verified for the production deployment.

## Roadmap

- Add broader language coverage and better Roman-script Hindi handling.
- Expand the knowledge base and institutional domain coverage.
- Add more end-to-end browser tests for on-device, cloud, image, and PDF paths.
- Add a transparency panel for rule weights and knowledge sources.
- Expand benign, ambiguous, and malicious regression examples.

## Documentation

- [Technical Design Document](TECHNICAL_DESIGN.md) — architecture, request flow, rule design, hybrid routing, API contract, deployment, and limitations.

## Disclaimer

RedFlagged identifies potential warning signs and provides verification guidance. It does not establish whether a message or document is legally genuine, does not replace professional legal advice, and cannot guarantee that every scam will be detected.

If you receive a suspicious legal or government communication, do not rely solely on its contact details, links, or payment instructions. Find the relevant institution's official contact channel independently and verify the communication before acting.

## License

This project is licensed under the MIT License. See the `LICENSE` file for details.
