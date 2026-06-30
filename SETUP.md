# Setup — Client Manager, Billing & Edit Requests

This guide turns on the three commissionable-coding features:

1. **Client Manager backend + login** (Firebase Auth + Firestore)
2. **Recurring $100/mo billing** (Stripe, no-code)
3. **Edit-request intake form** (Firestore)

**Nothing is required to keep the site running.** Until you complete a section,
that feature falls back gracefully:

| Feature | Before setup (fallback) | After setup |
|---|---|---|
| `/admin/` Client Manager | Works in **local mode** (this-browser storage, no login) | Login + live cloud sync across devices |
| `/request/` form | Opens the visitor's **email app** to `support@boostedapp.org` | Saves to your inbox in the dashboard |
| Services "Get Started" | Goes to the **contact page** | Goes to your Stripe checkout |

All configuration lives in **`assets/app-config.js`** (public values, safe to
commit). Never put Stripe *secret* keys there.

---

## 0. Choose a Firebase project

- **Recommended:** create a **new, dedicated** Firebase project (e.g. `boosted-web`)
  so your client CRM is isolated from the Boosted app's data and rules.
- **Or reuse** the app project `boosted-2c2a6`. If you do, you must **merge** the
  rules in `firestore.rules` into that project's existing ruleset (its Firestore
  is managed separately from this repo).

The collections are namespaced (`webClients`, `editRequests`) so they won't
collide either way.

---

## 1. Client Manager backend + login

### 1a. Enable Firebase services
1. In the [Firebase console](https://console.firebase.google.com/), open (or create) your project.
2. **Build → Authentication → Get started → Sign-in method → Email/Password → Enable.**
3. **Authentication → Users → Add user** — create your owner account (email + password). This is what you'll sign in to `/admin/` with.
4. **Build → Firestore Database → Create database** (Production mode, pick a region).

### 1b. Add the web config
1. **Project settings (gear) → General → Your apps →** add a **Web app** (`</>`) if there isn't one.
2. Copy the `firebaseConfig` values into **`assets/app-config.js`** → `firebaseConfig`.

### 1c. Apply security rules
1. Open `firestore.rules` in this repo and set `OWNER_EMAILS` to your owner email (replace `owner@example.com`).
2. Apply them:
   - **Dedicated project:** paste the whole file into **Firestore → Rules → Publish**, or run `firebase deploy --only firestore:rules` from a checkout of *that* project.
   - **Reusing `boosted-2c2a6`:** merge the two `match` blocks (and the `isOwner` / `isValidRequest` functions) into that project's existing `firestore.rules`, then deploy from wherever those rules are managed. ⚠️ Don't deploy these partial rules over the app's full ruleset — you'd drop the app's own rules.

### 1d. Verify
- Visit `/admin/`. You should now get a **login screen**. Sign in with the owner account.
- The local-mode banner is gone; data now syncs to Firestore.
- If you'd used local mode before, click **"↑ Import from this browser"** once to upload those clients to your account.

---

## 2. Recurring $100/mo billing (Stripe)

No server code needed — this uses Stripe's hosted pages.

### 2a. Create the plan + Payment Link
1. In the [Stripe Dashboard](https://dashboard.stripe.com/) (start in **Test mode**):
   **Product catalog → Add product** → name "Website Care Plan", price **$100 / month, recurring**.
2. **Payment Links → New** → select that price → **After payment**, set the
   confirmation/redirect URL to `https://boostedapp.org/thank-you.html`.
3. Copy the Payment Link URL into `assets/app-config.js` → `STRIPE.PAYMENT_LINK`.

### 2b. Turn on the Customer Portal
1. **Settings → Billing → Customer portal** → activate; allow customers to update
   payment method and cancel.
2. Copy the portal **login link** into `assets/app-config.js` → `STRIPE.PORTAL_LINK`.
   ("Manage billing" appears on the Services page and "Manage in Stripe" on each client.)

### 2c. (Optional) Auto-sync billing status
Without this you set each client's billing status by hand in the dashboard. To
automate it, deploy `backend-snippets/stripe-webhook.js` in your functions
project — see that file and `backend-snippets/README.md`.

### 2d. Go live
Recreate the product/price/Payment Link in **Live mode**, swap the live URLs into
`app-config.js`, and do one real (or test-card) end-to-end check.

---

## 3. Edit-request intake form

Once **section 1** is done, `/request/` writes straight to Firestore (the
`editRequests` collection) under the create-only rule, and submissions appear in
the **Incoming Requests** inbox at the bottom of `/admin/`. No extra steps.

- Link it where clients will see it (already linked from the Services page).
- **Spam hardening (recommended):** enable **Firebase App Check** (reCAPTCHA) for
  Firestore so only your pages can write. The form also has a honeypot field and
  length validation, and the rules reject malformed submissions.
- **Email notifications (optional):** install the **Firestore "Trigger Email"**
  extension (or your own function) to email yourself when a new request lands.

---

## Quick reference — `assets/app-config.js`

```js
firebaseConfig = { apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId }
STRIPE.PAYMENT_LINK = "https://buy.stripe.com/…"      // Get Started button
STRIPE.PORTAL_LINK  = "https://billing.stripe.com/p/login/…"  // Manage billing
SUPPORT_EMAIL       = "support@boostedapp.org"        // request-form email fallback
```

## Test checklist

- [ ] `/admin/` shows a login screen and you can sign in.
- [ ] Add a client; reload — it persists (now in Firestore).
- [ ] Submit a test request at `/request/`; it appears in the Incoming Requests inbox.
- [ ] Services "Get Started" opens Stripe checkout; a test payment redirects to `/thank-you.html`.
- [ ] (If using the webhook) the test subscription flips that client's billing status.
