# Builder Track Weekly Report — Week 13

**Name:** Emmanuel Badejo
**Week Ending:** 15-08-2026

# Independent Project

## CKB Action Links — v1.2: A Third Action, and a Check That Was Working by Accident

## Overview

Continued the project as a product release rather than a demonstration, on the same footing as last week: a new capability, a review of what was already there, and the interface work both of those made necessary.

Added `split`, a third action that pays several recipients from one link, chosen because it was the first addition that could not fit the shape the summary had been written in.

Found, while making room for it, that the transaction builder silently rewrites an amount rather than refusing it, and that the guard against this had been holding for a reason nobody had chosen.

Moved the cell-capacity floor forward from signing time to creation time, closing a gap where a link that could never be signed by anyone could still be created, shared and turned into a QR code.

Fixed three interface defects, one of which was last week's accessibility fix, which had not worked.

Grew the test suite from sixty-four tests to eighty-seven. Typechecking, tests and the production build are clean, and all four routes plus the not-found page still prerender as static.

---

## Choosing the Third Action

Added `split`, which pays a list of recipients from one link, each receiving a fixed amount.

Took it ahead of the xUDT transfer the roadmap had listed next, for the same reason `request` was promoted last week: it needs no new on-chain knowledge, and it tests something the roadmap could not.

Recognised that the two existing actions had never disagreed about shape. Both paid exactly one address, so every decision made on that basis had gone unexamined — not because it had been considered and found safe, but because nothing had ever contradicted it.

Understood that a third action which pays several addresses was therefore worth more than a third action which pays one in a new denomination, because it forces the assumption into the open rather than confirming it again.

Learned that splitting a payment is genuinely useful on its own terms — a bill divided, contributors paid, a refund shared — and that doing it in one transaction means everyone is paid or nobody is, which is a property a sequence of separate links cannot offer.

---

## Capping the Recipient List, and Why the Cap Is Not About Bytes

Limited a split to eight recipients, and refused any link naming more.

Chose that number for reviewability rather than for payload size. Whoever signs has to check every address on the list against where they meant to send funds, and a list longer than anyone reads to the end is not a richer feature — it is somewhere to put an address that will not be looked at.

Refused a split naming only one recipient, since that is a `transfer`, and two ways of expressing one thing is one too many.

Refused a list that names the same address twice. Two outputs to one lock are perfectly legal on chain, but inside a link they are either a mistake or an attempt to make a list harder to read to the end, and neither is worth honouring.

Preserved the order of the list through encoding and decoding, and wrote a test asserting it, because the order a payer checks the addresses in should be the order the creator wrote them in.

Applied every check a single transfer gets to each leg individually — the same address validation, the same network agreement, the same amount format, the same capacity floor — so that nothing can be smuggled through by putting it inside a list.

---

## What the Third Action Broke

Found that the summary carried a single `payment` field, and that the accounting rule enforcing SEC-7 was expressed in terms of it: one intended output, everything else belonging to the signer, anything else a refusal.

Recognised that the singular had never been a decision. It was the shape the code took when there was only one action, and it had survived the second only because that action also paid one address.

Generalised it to a list of intended outputs, each identified by the position the builder created it at and confirmed against the lock the builder resolved, with every remaining output still required to belong to the signer.

Kept the refusal exactly as strict: an output that is neither an intended recipient nor the signer's own is still a build that will not be offered for signing, whether the action has one leg or eight.

Learned that a payment to an address the signer already controls needed care again here, since a split can have one leg returning to the payer and the rest leaving. Counted such a leg towards what comes back while still showing it as a payment, so the total is right and the list is complete.

Added a `paid` figure alongside the existing total, because with several recipients the sum of the amounts and the cost of the transaction are two numbers a reader will now look for separately.

---

## The Check That Was Working by Accident

Rewrote the minimum-capacity check while generalising the builder, reading each output's capacity off the built transaction rather than from the amount that had been requested — which is the discipline this project states everywhere else, since the transaction is what actually gets signed.

Watched an existing test stop passing. A link asking to send one CKB, which had been refused for two weeks, was suddenly building without complaint.

Traced it to CCC, which does not refuse an output below the cell minimum. It silently raises the output to that minimum instead.

Measured the behaviour rather than assuming its bounds: requesting one shannon, forty CKB, or one shannon under the threshold all produce an output of exactly the minimum, and anything at or above it passes through untouched.

Recognised what that means here. Ask for one CKB and the built transaction carries sixty-one. The summary reads amounts off the transaction, deliberately and by design, so it would report sixty-one CKB — entirely accurately — for a payment nobody had agreed to.

Learned that the previous version had been safe only because it compared the amount that was requested, held in a local variable, rather than the capacity the built output ended up with. That was the correct comparison, and nothing in the code recorded that it was load-bearing.

Understood the shape of the problem: SEC-1 says derive everything from the built transaction because the transaction cannot lie about what will be signed, and this is the case where the transaction is telling the truth about something the link never asked for.

Fixed it in two parts. The floor is checked against the requested figure, and the built output is then compared against that same figure, so any silent adjustment in either direction is a refusal rather than something the preview quietly inherits.

Wrote it up as SEC-8 in the requirements document, because a rule discovered by accident and left in the code is a rule that will be refactored away again.

---

## Moving the Floor to Where Links Are Made

Identified a gap this made obvious: the capacity floor was enforced when a transaction was built, which is the only place the exact figure can be known, and nowhere else.

Traced the consequence. Someone could create a link asking for five CKB, generate its QR code, share it, and never learn anything was wrong, because the refusal happens on the payer's screen and only after a wallet is connected.

Recognised that a link nobody can sign is a defect at the moment it is created, not at the moment it is opened.

Learned that the true minimum depends on the recipient's lock args, which the validation layer cannot resolve because it has no client — so a single number would either be wrong or too strict.

Split it into two figures instead. A cell with empty args occupies forty-one bytes, so no cell under any lock can ever hold less than forty-one CKB, which is safe to refuse outright without resolving anything. A standard secp256k1 address carries twenty bytes of args and needs sixty-one, which covers effectively every real address but is a guess about a script that has not been resolved — so it only ever produces a warning.

Enforced the absolute floor at decode time, at link creation, and against the figure a payer types into a request, so all three learn about it at the moment they are still able to do something.

Surfaced the gap between the two on the confirmation page and on the inspect route, naming it as a likely refusal rather than a certain one.

Extended the same reasoning to a request's bounds. A maximum below the absolute floor describes a well-formed range containing no figure anyone could sign, which is the satisfiability check written last week, one level deeper than it had been taken.

---

## Bug — Last Week's Accessibility Fix Did Not Work

Re-examined the fix made last week for addresses being announced in four-character fragments, which had hidden the visual grouping from assistive technology and given the containing element the whole address as its accessible name.

Learned that a plain `div` carries the generic role, that ARIA does not permit a name on it, and that assistive technology is therefore free to ignore one.

Recognised the consequence as worse than the bug it replaced. The groups were hidden, and the name that was supposed to replace them may never be announced, so an address could be read out as nothing at all.

Replaced the name with a visually hidden copy of the address as actual text, which is announced because it is content rather than because a name was asserted about a container.

Learned the general lesson, which is that a fix aimed at assistive technology and verified by reading the markup is not verified. Both versions of this look correct in the source, and only one of them works.

---

## Bug — A Hydration Mismatch in the Share Button

Found that the link builder decided whether to show its share button by testing for the browser's share API inline while rendering.

Recognised that the page is prerendered as static, so that test is false when the markup is generated and true when the browser takes over — a hydration mismatch on every render of the page, inside the same tree that holds the generated link.

Moved the check into state set after mount, so the server and the browser agree on the first render and the button appears on the second.

---

## Bug — The Network Prefix Marked Things That Had No Network

Found that the address component gives its first group extra weight, which was added last week so that `ckb1` against `ckt1` — the one part of an address whose meaning a reader can check at a glance — leads the eye.

Traced that the same component renders the transaction hash on the success screen, where the first four characters are `0x` and two digits and mean nothing at all.

Made the emphasis something a caller asks for rather than something every value gets, and turned it off for hashes.

---

## Interface Work

Built a recipient list component that numbers each address, shows every one in full, and gives them equal weight, with nothing that collapses or scrolls — a list that hides a row is a list with somewhere to hide a recipient.

Used it for the pre-connect view, the signed summary and the inspect route, so a split is presented the same way in all three places and a single recipient is not a special case in any of them.

Built the split editor as rows that can be added and removed, with a running total, bounded by the same limits the schema enforces so the form cannot offer to make a link the SDK will refuse.

Labelled each row's inputs for assistive technology individually, since a column of unlabelled address boxes is only navigable if you can see the layout.

Replaced the raw action name on the inspect route with human wording, because `transfer` and `split` are registry keys and a reader should never be shown one.

Reported a leg below the typical minimum next to the recipient it belongs to rather than as a page-level warning, so the number and the complaint about it are in the same place.

---

## Measuring What a Split Costs a QR Code

Measured real link lengths against the QR encoder rather than assuming the cap of eight was safe:

| Link | Payload | Full URL | QR grid |
|---|---|---|---|
| Single transfer | 221 chars | 259 | 65 × 65 |
| Split, 2 recipients | 399 | 437 | 81 × 81 |
| Split, 3 recipients | 562 | 600 | 93 × 93 |
| Split, 4 recipients | 725 | 763 | 105 × 105 |
| Split, 6 recipients | 1050 | 1088 | 125 × 125 |
| Split, 8 recipients | 1375 | 1413 | 141 × 141 |

Learned that the recipient cap chosen for reviewability also happens to keep every split inside QR capacity, which was luck rather than design.

Recognised that fitting the format and being scannable are different claims. A 141-module grid is a valid QR code and is also dense enough that a phone camera at arm's length will struggle with it, so the honest position is that large splits are shareable as text and only sometimes as a code.

Noted that the host name is part of the encoded string, so a project deploying this on a longer domain gets a denser code for the same link.

---

## Verification

Ran the full suite: eighty-seven tests passing, up from sixty-four, with twenty-three new ones covering the split round trip, its list constraints, the per-leg scrutiny, the capacity floors and the claims a split makes without a wallet.

Asserted that a split's claim still carries no fee, no total debit and no `payments` field, extending last week's guard that a wallet-free description must remain structurally incapable of impersonating a signing summary.

Confirmed the per-action field specification holds in both directions for the new action too, by asserting that `to` and `amount` are refused on a split and that `payments` is refused on a transfer.

Verified the amount arithmetic stays exact by summing legs of 0.1 and 0.2 CKB and asserting the total in shannons, since that is the addition floating point is famously wrong about.

Generated the extra addresses these tests needed with CCC rather than editing characters in the existing one, so every address in the suite carries a real checksum.

Typechecked both packages clean and built the web application: four routes plus the not-found page, all still prerendered as static.

Served the production build and confirmed every route responds, that the confirmation route still sends no payload-derived markup from the server, and that a three-recipient split link round-trips through encoding, decoding and description with its amounts and order intact.

---

## What Is Not Yet Verified

No transaction has been signed or broadcast. That was true in week eleven, true in week twelve, and is still true.

The successful path — collecting inputs, estimating a fee and summarising a real transaction — has never run against a funded account, which now covers a multi-output transaction as well as a single-output one. It needs a funded Devnet account through OffCKB.

Nothing was driven through a browser this week. The split editor, the recipient list and the three bug fixes are verified as far as types, markup and a served production build, and no further.

The accessibility fix in particular has been reasoned about and corrected, but it has not been tested with a screen reader — which is precisely the mistake that produced the bug it replaces, so it should not be treated as closed.

Mainnet remains closed. The checklist gained three items this week and checked all three, and the same three from last week remain the gate: devnet signing, testnet signing from a shared link, and a review of the build and summary path by someone other than me.

---

## Key Learnings

* An assumption that has never been contradicted has not been tested, and the cheapest way to find one is to add the case that cannot fit it.
* A limit can be a security decision rather than a technical one: the recipient cap exists because a list nobody reads to the end is somewhere to hide a recipient, not because of any constraint in the format.
* A transaction builder may silently rewrite a value rather than refusing it, so "derive the preview from the built transaction" needs a companion rule — the built transaction must also be checked against what was actually asked for.
* A check can be correct for a reason nobody chose, and a refactor toward the codebase's own stated discipline is exactly what turns that kind of correctness off.
* When a rule is discovered rather than designed, writing it into the requirements is part of fixing it; otherwise it gets refactored away a second time.
* A constraint enforced only where the exact figure is knowable will be enforced too late, and splitting it into a floor that always holds and a warning that usually holds is better than picking one number and being either wrong or too strict.
* A defect in something created is a defect at creation time, not at the time someone else discovers they cannot use it.
* `aria-label` on a generic element is not a label; a fix aimed at assistive technology and verified by reading the markup has not been verified at all.
* Capability detection during render is a hydration mismatch on a prerendered page, and belongs in state set after mount.
* Emphasis that carries meaning for one kind of value becomes noise when the component is reused for another, so it should be something a caller asks for.
* Fitting inside a format and being usable in practice are separate claims, and a QR code can satisfy the first while failing the second.
