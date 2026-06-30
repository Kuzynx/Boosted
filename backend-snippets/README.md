# Backend snippets (optional, deployed separately)

This folder holds **optional** server code that is **not** deployed by this
repository. This repo deploys **hosting only** (`firebase deploy --only hosting`,
see `.github/workflows/firebase-hosting.yml`). Cloud Functions live in your
separate functions codebase.

Everything the Client Manager, billing links, and request form need works
**without** anything in this folder. These snippets add convenience automation
when you're ready.

| File | What it does | Needs |
|------|--------------|-------|
| `stripe-webhook.js` | Auto-updates each client's **billing status** in the Client Manager when their Stripe subscription changes. | Stripe secret + webhook signing secret, deployed in your functions project. |

## Important: don't clobber existing functions

Your project already has at least one function (`shareLink`). When you deploy,
target the specific function so you don't remove the others:

```bash
firebase deploy --only functions:stripeWebhook
```

If your functions project doesn't exist yet, create one with
`firebase init functions` **in that separate project**, add the snippet, then
deploy as above.

See `stripe-webhook.js` for step-by-step setup, and `../SETUP.md` for the full
picture.
