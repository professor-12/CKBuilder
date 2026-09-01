# Till — Product Requirements Document

**Author:** Emmanuel Badejo
**Status:** Draft v0.1
**Date:** 1 September 2026
**Working name:** Till — the self-custodial till for CKB

---

## 1. Summary

Till is a merchant payment suite for CKB Layer 1: create an invoice, share it as a
link or QR code, watch it settle on-chain, and hand over a receipt whose every line
is derived from the chain. It supports CKB and fungible tokens (USDI and any xUDT),
runs as a fully static web app with a reusable TypeScript SDK underneath, and at no
point takes custody, requires a server, or asks the merchant to run anything.

One sentence: **Stripe's invoice-and-checkout loop, rebuilt on CKB's L1, with the
chain itself as the source of truth and nobody in the middle.**

---

## 2. Why this project

### The ecosystem is explicitly asking for it

- The Fiber team's hackathon retrospective (July 2026) announced that the next
  phase "will shift toward **user and market-facing product solutions**", naming
  "**merchant checkouts, stablecoin flows**, liquidity dashboards, micropayment
  metering" as the wanted categories.
- The CKB Anywhere Card discussion (Community Fund DAO, July 2026) observed that
  existing crypto payment products are "vertically integrated" and asked directly
  whether Nervos has **reusable payment infrastructure** its wallets and merchants
  could adopt.
- The Community Catalyst's stated bottleneck: "applications, not infrastructure" —
  products that reach users rather than developers.

### Nobody has built it on L1

fiber-checkout (Spark grant, 2026) is a React library for **Fiber channel**
payments — L2, developer-facing, and dependent on channel liquidity and node
infrastructure. There is no invoice/point-of-sale/receipt product for plain CKB
L1 payments: the case where the payer is any person with any CKB wallet and the
merchant wants proof of settlement. Searches for a CKB payment gateway, invoicing
tool, or merchant solution surface only wallets and fiat on-ramps.

### It is the right scope for one developer

Till needs **no custom on-chain script** (payments are ordinary transfers), **no
daemon** (settlement detection uses the indexer built into every public CKB node),
and **no cross-chain integration**. Those are the three cost drivers that sink solo
CKB projects. Everything hard about Till is product and correctness work — the kind
of work a careful web developer can actually finish.

### It grows toward Fiber rather than competing with it

An invoice is settlement-method-agnostic by design. When Fiber's merchant story
matures, a Fiber settlement adapter slots in next to the L1 detector, and Till
becomes a front door to both. Building the merchant surface now positions the
project exactly where the announced "Fiber Hackathon Part 2" is pointing.

---

## 3. Users

**Merchants / freelancers / stall-holders** — create invoices, show a QR at a
counter, export their takings. They may know nothing about CKB internals. Their
requirement is confidence: "has this specific invoice been paid, yes or no?"

**Payers** — anyone with a CKB wallet: JoyID passkey, MetaMask via account
abstraction, a Bitcoin wallet, Neuron. They may not trust the merchant's link.
The payer page's security model is written for them.

**Integrating developers** — CKB apps that want "request payment, detect
settlement, produce receipt" as a library call. They consume `@till/sdk`.

---

## 4. Product

### 4.1 The invoice

An invoice is a small, self-contained JSON intent, carried in a URL fragment —
never sent to any server:

```
https://<host>/pay#v1.<base64url(invoice JSON)>
```

```jsonc
{
  "v": 1,
  "network": "ckt",            // "ckb" | "ckt" — mandatory, enforced
  "asset": "ckb",              // "ckb" | "udt"
  // when asset = "udt":
  "udt": {
    "codeHash": "0x…", "hashType": "type", "args": "0x…",
    "symbol": "USDI", "decimals": 6   // display hints; amounts verify on-chain
  },
  "to": "ckt1…",               // merchant address (the receiving lock)
  "amount": "125.000731",      // decimal string, never a float
  "label": "Table 4",          // optional, ≤64 chars, rendered as text
  "memo": "2× espresso",       // optional, ≤256 chars, rendered as text
  "createdAt": 1788230000,     // unix seconds — anchors the chain scan
  "expiry": 1788233600         // optional; watched continuously
}
```

The rules Action Links established carry over verbatim: `network` mismatches are a
hard block; amounts are decimal strings converted with BigInt string arithmetic;
unknown fields and unknown versions are rejected, not ignored; display text is
length-capped, control/bidi-stripped, and never rendered as markup or given the
page's own voice.

### 4.2 Settlement detection — the heart of the product

**Design problem.** A merchant address receives many payments. Which transaction
settles *this* invoice, with no server assigning IDs and no custom script tagging
outputs?

**Design answer: amount uniqueness** (the pattern BTCPay Server proved for
Bitcoin). At creation, Till appends a small random *detection nonce* to the amount
in the currency's least significant digits — `125 CKB` becomes `125.00073191 CKB`
(≤ 0.001 CKB, about a hundredth of a cent; for USDI ≤ $0.001). An invoice is
settled by exactly the transaction that creates an output paying the merchant's
lock the exact nonced amount at or after the invoice's creation block. The nonce
makes the amount unique among the merchant's open invoices (checked locally at
creation), so detection is unambiguous — and because the payment is just "send
this amount to this address", **every CKB wallet in existence can settle a Till
invoice**, not only wallets that open the payer page.

**Detection mechanics.** Pure JSON-RPC against public nodes, entirely client-side:

1. `get_transactions` (built-in indexer) filtered by the merchant lock and the
   invoice's block range, newest first.
2. For each candidate, `get_transaction` and inspect real outputs: the lock must
   equal the merchant's, and the capacity (CKB) or the uint128 amount in cell
   data (xUDT) must equal the invoice's exact raw amount.
3. Confirmations derived from `get_tip_header`. States: `unpaid → seen (0-conf)
   → settled (N confirmations, default 6) → expired`.

The detector never trusts a wallet callback, a URL parameter, or the payer's
claim: **a receipt exists only if the chain shows the output.**

### 4.3 The payer page (`/pay#…`)

- Decodes and validates the invoice; anything not fully understood renders an
  explanation and **no payment affordance** (fail closed, as Action Links).
- Shows what is being asked: full recipient address (grouped, never
  truncated), amount, the provenance banner, and the expiry countdown, watched
  continuously.
- Two ways to pay:
  - **In-app (CKB invoices):** connect any CCC-supported wallet; the
    transaction is built with CCC, the on-screen summary is derived from the
    built transaction's actual outputs (SEC-1 discipline), amount adjustments
    are refusals (SEC-8), and the total that leaves the wallet is shown
    including fee. Token invoices do not get an in-app sign button in v1:
    building token transfers needs per-token cell-dep resolution that has not
    been verified end-to-end, and an unverified signing path is not a feature.
  - **External wallet (all invoices):** copy-exact-amount and copy-address
    buttons and a QR — for payers on mobile wallets that will never see this
    page. Detection verifies these payments identically.
- After sending — or independently, if the payer paid externally — the page
  watches the chain and flips to the settled state with the transaction hash.

### 4.4 The merchant surface

- **`/new`** — create an invoice: asset (CKB / USDI / custom xUDT by script),
  amount, label/memo, expiry; address from a connected wallet or pasted (watch-only
  — the merchant never has to connect a key to get paid). Produces link + QR.
- **`/pos`** — point-of-sale mode: full-screen amount pad → full-screen QR →
  live payment watch → full-screen PAID confirmation. A phone on a counter is a
  CKB terminal.
- **`/invoice#…`** — the status/receipt view for any invoice: live state, then a
  printable receipt: amount, asset, payer lock, transaction hash, block, time,
  confirmations — every field chain-derived.
- **Dashboard (`/`)** — local-first ledger of the merchant's invoices
  (localStorage; import/export JSON; CSV export for bookkeeping). No account, no
  sync, nothing leaves the device.

### 4.5 The SDK (`@till/sdk`)

Framework-agnostic TypeScript, no build step, same layout as the Action Links SDK:
invoice schema + validation, URL codec, nonce generation, RPC client (plain
`fetch`), settlement detector, receipt derivation, known-script registry, exact
amount arithmetic. The web app is one consumer; any CKB project can be another.

---

## 5. Security model

A payment product's security model is the product. The obligations differ by side:

**To the payer** (untrusted link, same threat model as Action Links):
- SEC-1: any in-app signing summary is derived from the built transaction.
- SEC-2: fail closed on anything not fully understood; no override.
- SEC-4: provenance stated; payload text never speaks in the page's voice.
- SEC-5: no wallet interaction without explicit action.
- SEC-6: expiry watched continuously, re-checked at send.
- SEC-8: an amount silently adjusted by the builder is a refusal.

**To the merchant** (the new surface Till adds):
- SET-1 (settlement truth): paid/settled states derive exclusively from on-chain
  outputs read back via RPC — never from the payer's browser, a callback, or a
  URL parameter.
- SET-2 (exactness): detection matches the exact raw amount — capacity in
  shannons, UDT amounts in raw uint128 — with BigInt equality, never a tolerance.
- SET-3 (uniqueness): the detection nonce is collision-checked against the
  merchant's open invoices at creation; a collision regenerates the nonce.
- SET-4 (reorg honesty): states below the confirmation threshold are labelled as
  such; a receipt is only offered at the threshold, and re-verification re-reads
  the chain rather than trusting stored state.
- SET-5 (watch-only): receiving requires no key material — an address is enough.
  The dashboard is bookkeeping, not custody.

**Accepted risks, stated plainly:** a payer who sends a wrong amount from an
external wallet is detected as "unrecognised payment to this address" at best, not
matched to the invoice — the flow surfaces it rather than guessing. Public RPC
nodes can lie by omission (delay detection) but cannot forge a settlement, since
outputs are verified structurally; paranoid merchants can point Till at their own
node with one setting.

---

## 6. Non-goals (v1)

| Non-goal | Why |
|---|---|
| Fiber channel settlement | Needs node/liquidity infra; the invoice format is designed so a Fiber adapter can be added without changing the product's shape. |
| Refunds / payouts | Sending money is the wallets' job; Till asks for and proves payments. |
| Fiat quoting | Price oracles are a trust decision that deserves its own design pass. |
| Hosted merchant accounts / sync | Local-first is the point; sync can be layered later without a server (export/import first). |
| Custom on-chain scripts | Nothing in v1 requires one. |

---

## 7. Architecture

```
till/
├── packages/sdk/          @till/sdk — framework-agnostic TypeScript
│   ├── invoice.ts         schema, validation, nonce, states
│   ├── codec.ts           fragment-URL encode/decode, fail-closed
│   ├── amounts.ts         decimal-string ↔ bigint, exact
│   ├── rpc.ts             minimal JSON-RPC client over fetch
│   ├── detect.ts          settlement detector + receipt derivation
│   ├── address.ts         pure bech32/bech32m address → lock script (RFC 0021)
│   ├── tokens.ts          curated token seed list (USDI, Seal)
│   └── errors.ts          typed, user-presentable errors
└── apps/web/              Next.js, static export
    ├── /                  dashboard (local-first ledger)
    ├── /new               invoice builder
    ├── /pos               point-of-sale mode
    ├── /pay#v1.…          payer page
    └── /invoice#v1.…      status + receipt
```

Dependencies: the SDK has **zero runtime dependencies** (CCC appears only in
its test suite, as the differential-testing oracle for address decoding). The
web app adds `@ckb-ccc/core` and `@ckb-ccc/connector-react` for wallet
connection and in-app signing. Deployment: any static host; self-hostable by
design since the fragment keeps invoices off the wire.

---

## 8. Milestones

| Milestone | Definition of done |
|---|---|
| M1 — SDK core | invoice schema, codec, amounts, nonce: round-trip + adversarial tests pass |
| M2 — Detection | settlement detector passes fixture tests (mocked RPC) for CKB + xUDT, incl. reorg/confirmation edges |
| M3 — Payer page | `/pay` renders, fails closed, pays in-app on testnet |
| M4 — Merchant surface | `/new`, `/invoice`, dashboard, CSV export |
| M5 — POS mode | counter flow usable on a phone |
| M6 — Verified end-to-end | a testnet invoice created, paid from an unrelated wallet, detected, and receipted |

---

## 9. Success metrics

- A merchant with no CKB knowledge collects a payment and produces a receipt
  without reading documentation.
- At least one other CKB project consumes `@till/sdk` for payment detection.
- Zero incidents of a receipt asserting a settlement the chain does not show.
  This number must stay zero; one occurrence invalidates the product.
