# Insure — frontend

Next.js (App Router) dApp for buying cover, filing claims, verifying payouts and running vaults.
See the [root README](../README.md) for the protocol, the oracle and the full local stack.

## Run

```bash
cp .env.example .env.local   # RPC, cluster, USDC mint, backend URL
npm install
npm run dev                  # http://localhost:3000
```

Checks CI runs: `npx eslint src`, `npx tsc --noEmit`, `npm run build`.

To run against a local validator with test funds and time travel, use `../e2e/stack.sh up`
(serves this app on :3100 wired to the local chain and oracle).

## Pages

| Route | What it does |
|---|---|
| `/` | Live protocol stats and latest claims, read from chain |
| `/vaults` | Marketplace: status tabs, type filter, sort, capacity, countdowns |
| `/vaults/[pubkey]` | Buy (map pin + 10-year backtest, or flight), renew, file a claim with live settlement; underwriter panel |
| `/claims/[pubkey]` | Verdict, in-browser SHA-256 check of the evidence against the on-chain hash, the data behind the decision |
| `/my-insurance` | Your policies and claims |
| `/creator` | Underwriter dashboard and vault creation (region picker, suggested premium) |
| `/how-it-works` | Rules, trust model, how to verify a claim |
| `/actions.json` | Solana Actions discovery so vault links unfurl as Blinks |

## Where things live

- `src/lib/anchor.ts`: program client, PDAs, exact account sizes, money/time formatting, error decoding.
- `src/lib/data.ts`: account lists. Reads cached raw accounts from the backend, decodes them with the IDL, and falls back to RPC scans if the backend is down.
- `src/lib/useChainNow.ts`: time from the Clock sysvar, so eligibility messages match what the program enforces.
- `src/lib/backtest.ts`: replays a drought rule over 10 years of Open-Meteo ERA5 data; pricing helpers.
- `src/lib/demoWallet.ts`: devnet-only in-browser wallet (disabled on mainnet, or with `NEXT_PUBLIC_DEMO_WALLET=false`).
- `src/components/charts`: chart components. Colours are validated for colour-blind separation and contrast; every chart has hover/focus tooltips and a table view.
- `idl/`: copied from `../insure/target/idl` and `../insure/target/types` after `anchor build`.
