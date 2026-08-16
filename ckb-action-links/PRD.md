# CKB Action Links — Product Requirements Document

**Author:** Emmanuel Badejo
**Status:** Draft v0.2
**Date:** 26 July 2026 · revised 8 August 2026
**Project ID:** Idea #22 — Transaction as URL

---

## 1. Summary

CKB Action Links turn a CKB transaction into a shareable URL. A creator generates a
link; anyone who opens it sees a human-readable preview of exactly what will happen
on-chain, connects their wallet, and signs — in one page, with no dApp to navigate.

The link is self-contained: the transaction intent is encoded in the URL itself. There
is no backend, no database, and no custom on-chain Script. The entire product is a
TypeScript SDK plus a static web page built on the CCC SDK.

**Inspiration:** Solana Blinks / Actions. **Adaptation:** CKB's Cell model, where the
link describes Cells to be created rather than an account-state mutation, and CKB's
protocol-level account abstraction, which means the same link is signable by a
JoyID passkey, MetaMask, or a Bitcoin wallet without per-wallet code.

---

## 2. Problem

Sharing a payment or mint request on CKB today means one of:

- Pasting a raw `ckb1...` address and a number, and trusting the recipient to type
  both correctly.
- Sending someone to a dApp, where they must find the right page, fill a form, and
  re-enter the details that the sender already knew.

Both push transaction construction onto the *least informed* party. The sender knows
the exact intent; the receiver has to reconstruct it by hand. Every manual step is a
chance to send funds to the wrong place.

There is no standard way to express "here is a CKB transaction I want you to sign"
as something you can paste into Discord, X, an email, or a blog post.

---

## 3. Goals and non-goals

### Goals

| # | Goal |
|---|---|
| G1 | Encode a complete transaction intent into a single URL, with no server round-trip |
| G2 | Render a preview that is provably identical to what gets signed |
| G3 | Work with any CCC-supported wallet, exploiting CKB's account abstraction |
| G4 | Ship a reusable SDK so other CKB apps can generate and consume links |
| G5 | Fail loudly and refuse to sign anything the page cannot fully explain |

### Non-goals (v1)

| # | Non-goal | Why |
|---|---|---|
| N1 | OTX / partial transactions | The collector infrastructure (Idea #21) does not exist yet. v1 links are complete transaction templates where the signer is the sole input provider. |
| N2 | Custom Lock or Type Scripts | Nothing in v1 requires on-chain code. Adding Rust would multiply the build cost for no user-visible gain. |
| N3 | A hosted action-provider API | Reference links (URL points at an API that returns a transaction) are a v2 concern. Self-contained links need no infrastructure. |
| N4 | Link shortening | A shortener hides the payload from the user and is a phishing amplifier. If someone wants one, that is their risk to take, not a feature we ship. |
| N5 | Mobile deep links / native app | Web only for v1. |

---

## 4. Users

**Link creators** — a creator accepting tips, a project running a mint, a freelancer
sending an invoice, a DAO collecting contributions. They need a link they can paste
anywhere, generated from a form or from code.

**Link openers** — anyone with a CKB wallet. They may have never used the creator's
app and may not trust the creator. This is the user the security model is written for.

**Integrating developers** — CKB app builders who want to emit action links from their
own product (e.g. a marketplace generating "buy this" links). They consume the SDK.

---

## 5. The link format

### 5.1 Shape

```
https://<host>/a#v1.<base64url-encoded-intent>
```

The payload lives in the **URL fragment**, after the `#`. Fragments are never sent to
the server by browsers, so the host learns nothing about which action a visitor
opened. This makes the page fully static, cacheable, and self-hosting-friendly — and
it removes an entire class of "the link host logged my payment" concerns.

The `v1.` prefix is outside the encoding so a future version can be detected without
decoding, and a v1-only client can reject a v2 link cleanly instead of misreading it.

### 5.2 Intent schema (v1)

```jsonc
{
  "v": 1,
  "network": "ckt",           // "ckb" (mainnet) | "ckt" (testnet). Required.
  "action": "transfer",       // discriminator. Unknown values are a hard error.
  "to": "ckt1qq...",          // recipient address
  "amount": "100.5",          // decimal CKB string, never a float
  "label": "Coffee",          // optional, ≤64 chars, displayed
  "note": "Thanks!",          // optional, ≤256 chars, displayed
  "expiry": 1785000000        // optional unix seconds; link refuses to build after
}
```

Design rules:

- **`network` is mandatory and enforced.** A link built for testnet must not be
  signable on mainnet, and vice versa. The connected wallet's network is compared
  against the intent and mismatches are a hard block, not a warning.
- **`amount` is a decimal string.** Never a JSON number. Floats silently lose
  precision at CKB's 8 decimal places, and a rounding bug in a payment link is a
  money bug.
- **Unknown fields are rejected**, not ignored. A link carrying a field this version
  does not understand may be relying on it for meaning we are not honouring.
- **Every displayed string is length-capped and rendered as text**, never as markup.
  `label` and `note` are attacker-controlled.

### 5.3 Action types

v1 ships one action. The decoder dispatches on `action` through a registry so that
adding the next one is a single new file plus a registry entry.

| Action | Status | Description |
|---|---|---|
| `transfer` | **v1** | Send a fixed amount of CKB to an address. Covers invoices and fixed prices. |
| `request` | **v1.1** | Ask for a payment without fixing the amount. The payer names the figure, within optional `min`/`max` bounds. Covers tips, donations, pay-what-you-like. |
| `split` | **v1.2** | Pay several recipients in one transaction, each a fixed amount. Covers bill-splitting, contributor payouts, shared refunds. |
| `transfer-udt` | v1.3 | Send an xUDT token amount. |
| `mint-dob` | v2 | Mint a Spore DOB into a Cluster. |
| `attest` | v2 | Create an attestation Cell (depends on Idea #7). |

`request` was promoted ahead of `transfer-udt` because it needs no new on-chain
knowledge — no token script, no decimals, no cell-collection strategy — and because
it exercises the part of the design that had never been tested: whether adding an
action really is a registry entry, a field spec and a builder, or whether that claim
only held while there was one action.

It also raises a question `transfer` does not. A `request` link carries no amount, so
the figure comes from the payer at signing time. That number is validated by the same
code that validates a link's own amounts, and the creator's bounds are enforced on top
of it. Changing the figure discards the built transaction; there is no path where a
summary on screen belongs to an amount that is no longer in the box.

### 5.4 Reading a link without a wallet

`describeIntent(intent)` returns an `IntentClaim`: what the link *says*, with no fee,
no total, and no transaction. It backs `/inspect` and the pre-connect view on `/a`.

The naming is defensive. There is a real gap in the flow — before a wallet is connected
there is no transaction for SEC-1 to derive a preview from, yet the page still has to
show something — and the risk is that whatever fills that gap quietly becomes the
preview. A claim is therefore structurally incapable of impersonating a summary: it
cannot carry the fields a summary carries, and it never appears beside a sign button.

---

## 6. Security model

The engineering here is easy. The security model *is* the product. A URL that
produces a signable transaction is, structurally, a phishing vector — Solana's
Actions ecosystem needed a registry of trusted providers precisely because of this.
The following are requirements, not nice-to-haves.

### SEC-1 — The preview is derived from the transaction, not from the intent

The single most dangerous bug class is preview/sign divergence: rendering a summary
from the intent JSON, then independently rebuilding a transaction for signing. Any
discrepancy between those two code paths is a silent theft.

The SDK therefore exposes exactly one entry point:

```ts
buildAction(intent, signer) -> { tx, summary }
```

`summary` is computed **from the built `tx` object** — walking its actual outputs,
capacities, and lock scripts. The UI renders `summary` and signs `tx`. There is no
API that returns one without the other, and no path where the UI can construct a
transaction on its own.

### SEC-2 — Fail closed

The page refuses to render a sign button when *anything* is not fully understood:

- unknown `v` or `action`
- malformed base64, malformed JSON, unknown fields
- an address that fails checksum validation or belongs to the wrong network
- a wallet connected to a different network than the intent declares
- an expired `expiry`

Each failure shows a plain-language explanation and **no override**. There is no
"sign anyway" affordance. A user who cannot be told what a transaction does must not
be able to sign it.

### SEC-3 — Show the full cost, not the headline number

The preview displays: recipient address (full, not truncated), amount, estimated
network fee, **and the total that leaves the wallet**. Cell capacity requirements
mean the amount debited is not always the amount displayed by a naive UI; the
summary must reflect the real number.

### SEC-4 — Provenance is stated, not implied

Every preview carries an unmissable banner: *this link was created by someone else;
verify the recipient before signing.* The page must never present a link's `label` in
a way that could be mistaken for the page's own branding — no logos from the payload,
no rich text, no links inside `note`.

**Position counts as presentation.** The first implementation rendered `label` as the
page's `<h1>`, which satisfied the escaping rule and broke the intent of it: the
heading is the one line a reader takes as the site speaking. Text from a payload is
now quoted and attributed, and the heading is fixed copy the page owns.

### SEC-6 — Expiry is watched, not sampled

An `expiry` checked once, when the transaction is built, protects nothing: a page left
open past its expiry keeps a live sign button because nothing looks at the clock again.
The countdown runs for as long as the page is open, a lapse discards the built
transaction, and the check is repeated at the moment of sending.

### SEC-8 — The built transaction must carry the amount that was asked for

CCC raises an output below the cell minimum up to that minimum rather than refusing
it. That is a sensible default for a wallet and a dangerous one here: ask for 1 CKB
and the built transaction carries 61. Because SEC-1 requires the preview to be read
off the transaction rather than off the intent, the summary would then report 61 CKB
— accurately — for a payment nobody agreed to.

The floor is therefore checked against the amount that was *requested*, and each
built output is compared against its requested figure afterwards. Any silent
adjustment, in either direction, is a refusal rather than something the preview
inherits.

### SEC-7 — Every output is accounted for

The summary identifies the output the action was built to create, and requires every
other output in the transaction to belong to the signer. An output that is neither is
a refusal, not a footnote. A preview that omits a payment is the same failure as a
preview that misstates one.

### SEC-5 — No auto-connect, no auto-sign

Opening a link never triggers a wallet prompt. Wallet connection is an explicit user
action, and signing is a second explicit action after the preview has rendered.

### Accepted risk

A user who ignores the recipient address and signs anyway can be defrauded. That is
true of every address-paste flow in crypto and is not solvable at this layer. Our
obligation is to make the true destination impossible to miss, and to never let the
page assert something the payload has not proven.

---

## 7. Architecture

```
ckb-action-links/
├── packages/sdk/          @ckb-action-links/sdk — framework-agnostic TypeScript
│   ├── intent.ts          schema, types, action registry
│   ├── codec.ts           encode / decode / parse URLs
│   ├── validate.ts        strict validation, fail-closed
│   ├── build.ts           intent + signer -> { tx, summary }
│   └── errors.ts          typed, user-presentable error codes
└── apps/web/              Next.js — the preview/sign page and link builder
    ├── app/a/             /a — decode, preview, connect, sign
    └── app/new/           /new — form to generate a link
```

**Dependencies:** `@ckb-ccc/core` (transaction building, address parsing),
`@ckb-ccc/connector-react` (wallet connection UI). No other runtime dependencies.

**Deployment:** the web app is statically exportable. Because the payload is in the
fragment, the same static bundle serves every action link. It can be hosted anywhere,
and anyone can self-host a copy — a useful property for a tool asking users to trust
a page.

**Networks:** devnet via OffCKB for development, testnet for the public beta.
Mainnet is gated on completing the security checklist in §9.

---

## 8. Milestones

| Milestone | Contents | Definition of done |
|---|---|---|
| **M1 — SDK core** | intent schema, codec, validation, error types | Round-trip and adversarial-input tests pass |
| **M2 — Transaction building** | `buildAction`, summary derivation | Devnet transfer link signs and confirms via OffCKB |
| **M3 — Preview page** | `/a` route, wallet connect, preview, sign | End-to-end on testnet from a pasted link |
| **M4 — Link builder** | `/new` form, copy-to-clipboard, QR code | A non-developer can create a working link |
| **M5 — Hardening** | security checklist, adversarial payload test suite | §9 fully checked off |
| **M6 — Public beta** | testnet deployment, `/inspect`, documented SDK | A link shared publicly works for someone who has never seen the app |

---

## 9. Security checklist (gate for mainnet)

- [x] Preview and signed transaction are provably the same object (SEC-1)
- [x] Every decode failure path renders an error with no sign affordance (SEC-2)
- [x] Network mismatch between intent and wallet is a hard block
- [x] `label` / `note` render as text under all inputs, incl. markup and RTL overrides
- [x] `label` / `note` are never given a position that reads as the page's own voice (SEC-4)
- [x] Oversized payloads are rejected before parsing
- [x] Total debit including fee is displayed and correct, including when the recipient is the signer
- [x] Expiry is enforced continuously and re-checked at send time (SEC-6)
- [x] Every output in the built transaction is accounted for or the build is refused (SEC-7)
- [x] A payer-supplied amount is validated by the same code as a link-supplied one
- [x] Editing a payer-supplied amount discards the transaction built from the old one
- [x] No wallet interaction occurs before explicit user action
- [x] Adversarial payload suite passes (malformed, hostile, boundary-value)
- [x] An amount no cell could hold is refused when the link is created, not only when it is built
- [x] Every leg of a multi-recipient action gets the same scrutiny as a single transfer
- [x] A built output whose capacity differs from the amount requested is refused
- [ ] End-to-end signing verified on devnet with a funded account
- [ ] End-to-end signing verified on testnet from a shared link
- [ ] Independent review of the build/summary path by someone other than the author

The last three are the remaining gate. Everything above them is checked by the test
suite or by the structure of the code; the three below cannot be checked without
running the thing against a real wallet, and mainnet stays closed until they are.

---

## 10. Success metrics

Honest framing: this is a portfolio and ecosystem project, not a revenue product.
Success is adoption by builders, not transaction volume.

- **Primary:** at least one CKB project other than this one generates action links
  using the SDK.
- **Secondary:** a link created by someone who did not read the documentation works
  on the first try.
- **Health:** zero reported incidents of a preview that misrepresented a signed
  transaction. This metric must stay at zero; a single occurrence invalidates the
  product.

---

## 11. Open questions

1. **Should `/a` support a `?` query fallback for clients that strip fragments?**
   Some chat clients mangle fragments. Adding a query-param path re-exposes the
   payload to the host. Leaning no; revisit if fragment stripping proves common.
2. ~~**QR encoding.** Base64url payloads are alphanumeric-unfriendly for QR density.~~
   **Resolved, partly.** Base64url is mixed-case, so QR must use byte mode; the denser
   alphanumeric mode is uppercase-only and cannot carry the payload. Byte mode is
   shipped, and a link too long to encode says so rather than failing silently. A
   base32 payload would fit alphanumeric mode and roughly halve the module count, but
   it costs ~20% payload length and a version bump, so it waits for evidence that real
   links are hitting the ceiling.
3. **Reference links (v2).** Once a hosted variant exists, an allowlist or reputation
   layer for providers becomes necessary. Out of scope for v1, but the format's
   version prefix must leave room for it.
4. **Do we need a canonical host at all?** Since anyone can self-host, the "official"
   deployment is a convenience. Whether to publish one, and what trust that implies,
   is a decision to make before the public beta.

---

## 12. Why this project

From the 30-idea evaluation, this was the only concept requiring no custom on-chain
Script, no daemon operation, and no cross-chain integration — the three dominant cost
drivers for CKB projects. It composes primitives that already ship (CCC, JoyID,
account abstraction) rather than building new ones, which makes it achievable solo
while still producing something the ecosystem does not currently have.
