<!-- DRAFT — prepared overnight for Emmanuel's review. Verify the claims
against the till/ workspace (all are reproducible: pnpm test / typecheck /
build, and packages/sdk/test/live-detect.mjs), edit the voice where it isn't
yours, then commit. -->

# Builder Track Weekly Report — Week 14

**Name:** Emmanuel Badejo
**Week Ending:** 01-09-2026

# Independent Project

## Till — Self-Custodial Payments for CKB: Choosing Again, and Building the Second Product

## Overview

Received the feedback that Action Links overlapped with work that already
existed, and treated it as a research failure rather than a build failure:
the thirty-idea evaluation in week 11 ranked candidates by cost, never by
whether the ecosystem had already produced them.

Repeated the selection process with novelty as a first-class criterion this
time, surveying what the ecosystem is explicitly asking for before choosing
what to build.

Chose a merchant payment suite for CKB L1 — invoices shared as links,
settlement detected on-chain, receipts derived from the chain — because the
demand is documented, the niche is verifiably empty, and it extends the
Action Links security model into new territory instead of abandoning it.

Shipped a working v1: a zero-dependency TypeScript SDK (70 tests, all
passing), a five-route static web application, and a live proof that the
settlement detector finds a real historic payment on the public testnet RPC.

---

## Choosing With Evidence This Time

Surveyed the ecosystem's stated wants rather than guessing at gaps. Three
sources converged on the same answer:

* The Fiber hackathon retrospective announced its next phase would target
  "user and market-facing product solutions", naming merchant checkouts and
  stablecoin flows as wanted categories.
* The CKB Anywhere Card discussion in the Community Fund DAO asked whether
  Nervos has reusable payment infrastructure, observing that existing crypto
  payment products are vertically integrated.
* The Community Catalyst's stated bottleneck is applications that reach
  users, not more developer infrastructure.

Checked the negative space as carefully as the demand: fiber-checkout is a
Fiber-channel React library, L2 and developer-facing; searches for a CKB L1
payment gateway, invoicing tool, or point of sale surface only wallets and
fiat on-ramps. Also learned the Spore/DOB repositories have been dormant for
over a year, which removed an entire category of candidate projects and
would have been worth knowing before week 11.

Kept the three cost-driver rules from the original evaluation: no custom
on-chain script, no daemon, no cross-chain integration. Payments are
ordinary transfers; detection uses the indexer built into every public node.

---

## The Design Problem That Makes This a Product

Identified the one hard question early: a merchant address receives many
payments — which committed transaction settles *this* invoice, with no
server issuing IDs and no on-chain tagging?

Adopted the answer Bitcoin's BTCPay Server proved: amount uniqueness. At
creation, Till fills the last few decimal places with random detection dust
— at most 0.001 CKB, or $0.000999 on a six-decimal stablecoin — and an
invoice is settled by exactly the transaction that creates an output paying
the merchant's lock that exact amount at or after the invoice's creation
height.

Understood the consequence that makes it worth the dust: the payment is just
"send this amount to this address", so any CKB wallet in existence can
settle a Till invoice, including wallets that never open the payer page.

Enforced uniqueness rather than assuming it: the dust is collision-checked
against the merchant's other open invoices, drawn by rejection sampling, and
falls back to a deterministic scan from a random origin — so exhaustion is a
fact about the space being full, never bad luck. A first version that only
sampled could report exhaustion spuriously; a test that occupied every value
but one exposed the difference between the two claims.

Refused, rather than rounded, a base amount that intrudes on the dust
digits. The rule is SEC-8 from Action Links pointed the other way: no figure
a human chose is ever silently rewritten.

---

## Settlement Truth

Wrote the merchant-side security model before the merchant-side code, as
SET-1 through SET-5 in the PRD. The one that shapes everything: paid and
settled states derive exclusively from committed outputs read back over
RPC. A wallet's success callback, the payer's browser, and the URL are not
evidence. A receipt exists only if the chain shows the output.

Matched amounts by BigInt equality on raw units — shannons for CKB, uint128
cell data for tokens — with no tolerance, because a matcher with a tolerance
is a matcher that can be argued with.

Required a plain-CKB payment to be a plain cell: an output carrying a type
script is some other protocol's cell that happens to sit on the merchant's
lock, not a payment, even when its capacity matches exactly.

Identified tokens by their full type script, never by a code-hash family.
USDI — the most important stablecoin on the network — is xudt-compatible but
deployed under its own code hash, so a "is this the xUDT code hash?" check
would wrongly reject it. Its script details in the token presets were read
from the explorer's verified registry, and detection verifies them on-chain
regardless.

---

## Building the SDK Down to Zero Dependencies

Implemented CKB address decoding (RFC 0021) pure: bech32 and bech32m
checksums, full-format addresses, and the three short-format system locks,
each refusal explaining itself. This removed the last runtime dependency
from the SDK — CCC now appears only in the test suite.

Tested the decoder differentially against CCC: for a set of scripts across
both networks, every address CCC generates must decode to the identical
script. Agreement with the SDK that wallets actually use is the property
that matters, not agreement with my reading of the RFC.

Found one bug this week that the type system could never have caught:
storing `globalThis.fetch` as a class field detaches its `this` binding, and
every RPC call throws "Illegal invocation" — which my own error handling
then masked as "could not reach the node". The masking was the worse half of
the bug: a wrapper that converts every failure into one message converts a
programming error into a network complaint. The fix stores a closure; the
lesson is that catch-all translation earns its keep only when the original
error still reaches the log.

---

## The Web Application

Built five routes, all prerendered static: a local-first ledger with CSV
export, the invoice builder, a point-of-sale mode (amount → full-screen QR →
live watch → PAID), the payer page, and the status/receipt page. The
fragment keeps every invoice off the wire, so the same static bundle serves
every merchant and anyone can self-host it.

Carried the Action Links rules over to the payer page verbatim: fail-closed
decoding with no override, provenance banner, payload text quoted and never
in the page's voice, addresses shown in full with the grouping hidden from
assistive technology and a visually-hidden plain-text copy that is actually
announced — the week-13 accessibility lesson, applied from the start this
time.

Limited in-app signing to CKB invoices in v1. Building token transfers
in-page needs per-token cell-dep resolution I could not verify end-to-end
this week, and an unverified signing path is not a feature — token invoices
route through the payer's own wallet with one-tap copies of the exact amount
and address, which detection verifies identically.

Learned two static-export lessons the build surfaced: capability tests and
fragment reads belong in effects, not render (the week-13 hydration lesson,
now a habit rather than a fix), and Next's default export writes `pay.html`,
which only works on hosts that rewrite paths — directory-style routes make
the bundle serve correctly from any static file server.

---

## Verification

Ran seventy tests across the SDK: adversarial codec inputs (unknown fields,
future versions, bidi and zero-width text, oversized payloads, junk base64),
exact-amount arithmetic including the float-famous 0.1 + 0.2 case, dust
allocation and exhaustion, differential address decoding, and the detector
against scripted node conversations — exact match, near-miss, wrong lock,
wrong token, malformed token data, uncommitted transactions, confirmation
thresholds, expiry, and payment-after-expiry.

Proved the detector against the real network without signing anything:
a script reconstructs an invoice for a historic testnet payment and the
detector finds it over the public RPC — transaction hash, block, chain
timestamp, confirmations, and the payer's lock, all read back from the
chain. This is the strongest verification available without a funded key.

Typechecked both packages clean and confirmed all six routes prerender as
static and respond when served from a plain file server.

---

## What Is Not Yet Verified

No new payment has been made against a Till invoice end-to-end. The live
proof detects a historic payment; a fresh invoice paid by a second wallet,
watched from unpaid through seen to settled, needs a funded testnet account
and has not happened.

In-app signing has not run against a real wallet. The builder's read-back
checks are tested, but the connector flow — connect, preview, sign, send —
has only been reasoned about and typechecked.

Token detection is fixture-tested, not chain-tested: no USDI invoice has
been settled against mainnet, and the token presets, though read from the
explorer's verified registry, should be re-verified the day real money uses
them.

The point-of-sale flow has not been driven on a phone, and the printable
receipt has not met a printer.

---

## Key Learnings

* A project evaluation that ranks by cost but not by novelty answers the
  wrong question; "has someone already built this" is a research task with
  documentary answers, and it belongs before the first line of code.
* The strongest position for a solo builder is documented demand plus
  verified absence: the ecosystem asking for a thing in writing, and
  searches showing nobody has shipped it.
* An exact-amount match with random dust turns "which payment is mine" from
  an infrastructure problem into an arithmetic one, and its price — a
  thousandth of a cent of dust — is the cheapest protocol I have seen.
* A matcher with a tolerance can be argued with; BigInt equality on raw
  units cannot.
* Token identity is a full type script, not a code-hash family — the
  network's most important stablecoin is the counterexample to the family
  assumption.
* Randomized allocation needs a deterministic fallback before "exhausted" is
  an honest word.
* A catch-all error wrapper that hides the original failure converts
  programming errors into network complaints; translation is only safe when
  the original still reaches the log.
* Cutting a feature that cannot be verified (in-app token signing, the
  script registry) is scope discipline, not loss — dead code in a project
  claiming robustness is a standing contradiction.
