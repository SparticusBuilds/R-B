# Roberts & Bumford

Two things in this repo:

## `/site`
Single-page website mockup, built to show R&B what a real site could look like. Not commissioned yet — for review only.

## `/pos`
A **working prototype**, not production software, What it does:

- Sales with batch-level FIFO stock deduction
- Goods-in against purchase orders, with split-batch support
- Returns, tied back to the original sale's batch
- Customer accounts with a derived balance (never stored, always computed from the transaction history)
- Printable monthly billing statements
- Price-change label printing
- PIN-based staff login with an inactivity auto-lock
- Fuzzy duplicate detection on bulk product import (CSV)
- Barcode support for both import and in-app search

### Important limitations — read before assuming this is more than a demo

- **Storage is per-browser.** Deployed here on GitHub Pages, it saves to the browser's own `localStorage` (see the shim in `pos/index.html`). That means:
  - Data does **not** sync between devices or browsers
  - Clearing browser data wipes it
  - It cannot represent two physical locations sharing one stock/accounts picture
- **This is not the target production architecture.** The plan for a real deployment is a centralized PostgreSQL database (e.g. a small managed instance, ~$15/mo, London region) that both locations connect to live over the internet — not SQLite, not this localStorage shim, and not a batch-sync setup between independent copies. Anything built into this prototype should be checked against that target before assuming it'll carry over as-is.
- **No real security.** Staff PINs are stored and compared in plain text, with no lockout on repeated wrong guesses. Fine for testing; not fine for anything real.

### Rebuilding the bundle

`pos/bundle.js` is a pre-built bundle (React + the app + CSV parsing, via esbuild). If `pos/rb-pos-app.jsx` changes, rebuild it:

```
cd pos
npm install
npm run build
```
