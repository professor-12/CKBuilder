<!-- DRAFT — prepared for Emmanuel's review, like week-14. Everything below
is reproducible from the till/ workspace: the E2E harness is
packages/sdk/test/e2e-testnet.mjs, the browser drive is apps/web/e2e/drive.mjs,
and the screenshots it captured are in till/docs/screenshots/. The settling
transaction is publicly checkable: 0xc38a3b15d7b85c0baa048cdf5c94fe83314d4f22844c673b3e305747c62bea56
on the testnet explorer. Edit the voice where it isn't yours, then commit. -->

# Builder Track Weekly Report — Week 15

**Name:** Emmanuel Badejo
**Week Ending:** 08-09-2026

# Independent Project

## Till — Paying the Invoice: Turning the Not-Yet-Verified List into Evidence

## Overview

Spent the week converting week 14's "What Is Not Yet Verified" section into
verified items, on the principle that a claims list is a to-do list.

Paid a fresh Till invoice end-to-end on testnet with real money from a real
second wallet, and watched the detector take it from unpaid to settled — the
full merchant loop, against the live network, for the first time.

Drove the production static export in a real browser against the live chain:
the receipt page derived "Settled" from the committed transaction, the
creation form built an invoice against the live tip, and the payer page
refused to offer payment for both a settled invoice and a mangled link.

Found and fixed one dishonesty in my own tooling — a verification harness
that was less fault-tolerant than the product it verifies — and kept both
harnesses in the repository as permanent artifacts.

---

## Funding a Second Wallet Without Owning One

Generated two throwaway testnet identities: a payer and a merchant, distinct
keys, so the payment genuinely crosses wallets rather than moving money
inside one.

Located the faucet's actual API by reading the deployed frontend's bundle,
since the documented repository is deprecated: the form at faucet.nervos.org
posts to `faucet-api.nervos.org/claim_events`, and the claim only succeeds
when an explicit `amount` accompanies the address. Claimed 10,000 CKB and
polled until the payer's balance confirmed.

---

## The End-to-End Proof

Wrote the M6 harness (`test/e2e-testnet.mjs`) to walk the whole loop:

* Created a fresh invoice for 250 CKB through `createInvoice` — the dust
  came out as `250.00094531`, nonce 94531, anchored at the live tip block.
* Asserted the detector reports the fresh invoice **unpaid** before any
  payment exists, so the settled result later cannot be a false positive.
* Paid it from the payer key with CCC, applying the same read-back checks
  the web page applies before signing: the built output must carry exactly
  the invoiced capacity to exactly the invoice's lock, or the harness
  refuses to send (SEC-8 pointed at my own transaction).
* Watched the detector flip to **settled**: transaction
  `0xc38a3b15…c62bea56`, output 0, block 22,270,357, thirteen
  confirmations at detection, the payer's real lock resolved from the
  transaction's first input — every line chain-derived, and the settling
  hash equal to the one the harness sent.

The first run died before the flip. The payment was already on-chain when a
transient public-node failure made `detectSettlement` throw, and the
harness's watch loop — unlike the product's — treated one failed poll as
fatal. The web watcher had been written to report, retry, and keep the loop
alive; the harness had not. A verification tool holding itself to a lower
standard than the thing it verifies is a quiet way to fail an honest test,
so the tolerance now lives in both.

Recovered without re-paying, which taught the week's best property by
accident: an invoice is reconstructable from its public parameters alone.
Detection depends only on network, recipient, exact amount and starting
height, so a second script rebuilt the invoice, resumed the watch, and
settled against the payment already made. Nothing about a Till receipt
depends on state that can be lost.

---

## Driving the Real Pages Against the Real Chain

Ran the production export — the same static files a host would serve — in
headless Chromium, pointed at the live testnet, in four legs
(`apps/web/e2e/drive.mjs`, screenshots in `docs/screenshots/`):

* **The receipt page earns its name.** `/invoice/#…` with the settled
  invoice's fragment reached "Settled" on its own polling, rendered the
  settling transaction hash, flipped its heading from Invoice to Receipt,
  and offered printing. The page did the verifying, not the harness.
* **The form creates real invoices.** `/new/` filled and submitted against
  the live tip block; the generated link carried the dust in the reserved
  digits.
* **A settled invoice cannot be paid again from this page.** `/pay/#…`
  showed the on-chain settled banner and withheld both the copy-amount and
  connect-wallet affordances.
* **A mangled link is a refusal, not a form.** `/pay/#v1.garbage!!!`
  rendered the explanation and no payment affordance of any kind.

Getting a browser to run in the build environment took a small detour worth
recording: no root access for the missing system libraries, so the packages
were extracted locally with `dpkg-deb -x` and supplied through
`LD_LIBRARY_PATH` — the browser's requirements didn't change, only who was
allowed to satisfy them.

---

## Verification

Reconfirmed the full suite after the week's changes: seventy SDK tests
passing, both packages typechecking clean, the static export building with
all six routes prerendered.

Kept all three verification artifacts in the repository — the live
historic-payment proof from week 14, the fresh-payment E2E harness, and the
browser drive — so M6 is re-runnable by anyone with a faucet claim, not a
one-time anecdote.

---

## What Is Not Yet Verified

In-app wallet signing has still not run against a real wallet. The
transaction the harness sent was built with the same CCC calls and the same
read-back refusals as `lib/pay.ts`, but a browser-extension wallet clicking
through connect → preview → sign remains undriven, because a headless
browser has no extension. This is now the oldest unverified claim and the
first thing to close with a human hand on a real wallet.

Token settlement is fixture-tested only: no USDI invoice has been settled
against mainnet, and the token presets should be re-verified the day real
money uses them.

The point-of-sale flow has not been driven — its watch mechanics are the
same code the receipt page just proved, but "same code" is an argument, not
a verification.

Nothing is deployed yet. The export is static and host-agnostic; publishing
it (and paying one mainnet CKB invoice with a tiny amount) is the natural
next milestone.

---

## Key Learnings

* A "not yet verified" section is a to-do list, and the cheapest week to
  clear it is the one right after writing it, while every decision is warm.
* A verification harness must be at least as fault-tolerant as the product
  it verifies, or it fails honest tests for dishonest reasons.
* Asserting the negative first — the fresh invoice reads unpaid — is what
  makes the positive result mean something.
* An invoice that is reconstructable from public parameters makes receipts
  independent of any device's survival; the property was designed for
  privacy and turned out to be the recovery story too.
* The strongest browser test is one where the page does the verifying and
  the harness only reads what the page concluded from the chain.
* Frontends hide their real APIs in their bundles; when documentation is
  deprecated, the shipped JavaScript is the documentation.
* Root access is often just a convenience: a userland library extraction
  and a loader path did what a package installer would have, without
  touching the system.
