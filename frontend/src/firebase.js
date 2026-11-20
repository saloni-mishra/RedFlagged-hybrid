import { initializeApp } from "firebase/app";
import { getAI, GoogleAIBackend } from "firebase/ai";
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
} from "firebase/app-check";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseApp = initializeApp(firebaseConfig);

// App Check must be configured before the first AI request. In development we
// use a debug token so localhost does not need to be registered with reCAPTCHA.
// Firebase prints the token in the browser console; register it once in the
// Firebase console under App Check > Apps > Manage debug tokens.
if (import.meta.env.DEV) {
  self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
}

const recaptchaSiteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;

if (!import.meta.env.DEV && !recaptchaSiteKey) {
  console.error(
    "VITE_RECAPTCHA_SITE_KEY is missing. App Check requests will fail in this production build.",
  );
}

export const appCheck = initializeAppCheck(firebaseApp, {
  // redflagged-web is registered in Firebase App Check with reCAPTCHA
  // Enterprise, so the site key must be an Enterprise score-based key.
  provider: new ReCaptchaEnterpriseProvider(recaptchaSiteKey || ""),
  isTokenAutoRefreshEnabled: true,
});

export const ai = getAI(firebaseApp, { backend: new GoogleAIBackend() });
