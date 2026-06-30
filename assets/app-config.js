// =============================================================================
//  Boosted Platforms — web app configuration
//
//  Everything in this file is PUBLIC, client-side configuration and is safe to
//  commit. Do NOT put secret keys here (Stripe *secret* key, service accounts,
//  webhook signing secrets, etc.) — those only ever live on a server.
//
//  See SETUP.md for where each value comes from. Until you fill these in:
//    • the Client Manager (/admin/) runs in local "this-browser" mode, and
//    • the edit-request form (/request/) falls back to opening an email.
// =============================================================================

// --- Firebase web config ---------------------------------------------------
//  Firebase console → Project settings → General → Your apps → SDK setup → Config
export const firebaseConfig = {
  apiKey: "PASTE_FIREBASE_API_KEY",
  authDomain: "PASTE_PROJECT.firebaseapp.com",
  projectId: "PASTE_PROJECT_ID",
  storageBucket: "PASTE_PROJECT.appspot.com",
  messagingSenderId: "PASTE_SENDER_ID",
  appId: "PASTE_APP_ID"
};

// Firestore collection names. Namespaced so they won't collide with the Boosted
// app's own data if you reuse the same Firebase project.
export const COLLECTIONS = {
  clients: "webClients",
  requests: "editRequests"
};

// --- Stripe (no-code links) ------------------------------------------------
//  PAYMENT_LINK : a $100/mo recurring Payment Link → used by "Get Started".
//  PORTAL_LINK  : the Customer Portal login link → clients manage card / cancel.
//  Leave blank to fall back to the contact page.
export const STRIPE = {
  PAYMENT_LINK: "",   // e.g. "https://buy.stripe.com/xxxxxxxxxxxx"
  PORTAL_LINK: ""     // e.g. "https://billing.stripe.com/p/login/xxxxxxxxxxxx"
};

// Where edit requests are emailed if Firebase isn't configured yet (the form
// opens the visitor's email app addressed here).
export const SUPPORT_EMAIL = "support@boostedapp.org";

// Pinned Firebase JS SDK (loaded on demand, only when configured).
export const FIREBASE_SDK = "https://www.gstatic.com/firebasejs/10.12.5";

// True once real Firebase values have been pasted in above.
export function firebaseReady() {
  return !!firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith("PASTE");
}
