# Builder Track Weekly Report — Week 12

**Name:** Emmanuel Badejo
**Week Ending:** 08-08-2026

# Independent Project

## CKB Action Links — v1.1: A Second Action, Six Fixes, and a Finished Builder

## Overview

Continued last week's project instead of starting a new one, treating it as a product that needed a release rather than a demo that was already finished.

Re-read every line written last week on the assumption that something in it was wrong, and found six defects, one of which made the confirmation page display a payment summary with the payment missing from it.

Added the second action type to the schema, which was the first real test of last week's claim that adding an action would be cheap.

Finished the link builder milestone, added a route for reading a link without a wallet, and rebuilt the confirmation page around the things the review had exposed.

Grew the test suite from thirty-six tests to sixty-four. Typechecking, tests, and the production build are all clean, and all four routes plus the not-found page still prerender as static.

---

## Reviewing Last Week's Code Before Adding to It

Started the week by reviewing the existing code rather than extending it, because a security-shaped project that has never been reviewed is a project whose security is a guess.

Read each file asking what an attacker would do with it and what an ordinary user would do with it, since those turned out to find different bugs.

Learned that the review found more than the writing did, and that everything it found had been written deliberately — none of the six defects were typos, and all six looked correct in isolation.

Recognised that the pattern in the findings was consistent: each one was a rule that had been applied to the code without being applied to the interface the code produced.

---

## Bug One — A Payment to Yourself Disappeared From the Summary

Found that the summary was built by walking the transaction's outputs and keeping only those whose Lock Script did not belong to the signer.

Understood that this was written to exclude the change Cell, which it did correctly, and that it excluded the recipient's Cell too whenever the recipient was an address the signer already controlled.

Traced the consequence: opening a link that paid one of your own addresses produced a confirmation screen listing no recipient at all, with the headline total reading as the network fee alone.

Recognised that the figure was technically true — a payment to yourself costs you only the fee — while the screen it appeared on was describing a transaction it had not mentioned.

Learned that the root cause was filtering rather than accounting. Filtering answers "which outputs are not mine", which is a different question from "what does this transaction do", and only the second one is safe to render above a sign button.

Rewrote the summary to identify the payment Cell by the position the builder created it at, confirm it by comparing its Lock Script against the recipient the builder resolved, and then require every remaining output in the transaction to belong to the signer.

Made an output that is neither of those a refusal rather than an omission, since a preview that leaves out a payment is the same class of failure as one that misstates it.

Added a summary field marking whether the payment goes to an address the signer controls, and a notice on the page explaining that the capacity returns to them and only the fee is spent.

---

## Bug Two — The Link's Own Words Were the Page's Heading

Found that the confirmation page rendered the link's `label` as its `<h1>`, falling back to fixed copy only when no label was present.

Understood that this satisfied the rule written last week — the label was escaped, capped in length, and stripped of characters that can disguise it — while defeating the reason the rule existed.

Learned that position is a form of presentation. The heading is the one line on a page a reader attributes to the site rather than to a stranger, and handing attacker-controlled text that slot is exactly the branding confusion the security model forbids.

Fixed the heading to be copy the page owns in every case, and moved the label and note into a quotation block attributed in as many words to whoever created the link.

Extended the requirement in the PRD so it constrains where payload text may appear, not only how it is escaped.

---

## Bug Three — Expiry Was Checked Once and Never Again

Found that a link's expiry was tested when the transaction was built, and never afterwards.

Traced the consequence: a link opened one minute before it lapsed kept a working sign button for as long as the tab stayed open, because nothing looked at the clock a second time.

Recognised that this is the failure mode of every check written as a gate on a code path rather than as a property of a screen, and that a signing surface is a screen people leave open.

Added a countdown that runs for the whole time the page is open, shown as a chip that changes tone as the remaining time falls.

Made a lapse discard the built transaction rather than merely hide it, so there is no object left in memory that could still be sent.

Repeated the check inside the sign handler, immediately before the wallet is asked for a signature, since that is the last moment at which refusing still costs nothing.

Wrote the clock as a hook that returns nothing until its first reading in the browser, because a time sampled while the page was being prerendered would disagree with the browser's on hydration.

---

## Bug Four — A Failed Copy Looked Exactly Like Nothing

Found that the copy button awaited `navigator.clipboard.writeText` with no error handling.

Learned that the clipboard API is undefined outside a secure context and that its write can be refused outright, so on plain HTTP the button threw an unhandled rejection and then sat there unchanged.

Understood that the visible result of this is a person pasting a link they believe they copied, which is worse than a visible failure.

Rewrote it to catch the refusal, report it on the button, and tell the reader to select the text and copy it by hand.

Added a polite live region so the outcome is announced rather than only shown, since the state change is a colourless word swap that assistive technology would otherwise miss.

---

## Bug Five — A Damaged Link Was Blamed on the Wrong Thing

Found that base64 decoding and UTF-8 decoding shared a single `try` block reporting "payload is not valid UTF-8".

Recognised that the common cause of a broken link is a share that truncated it, which fails base64 decoding, so the diagnostic was pointing at the wrong stage every time it mattered.

Separated the two, leaving the message shown to the reader identical and correcting only the detail carried on the error.

Learned that a message written for a person and a message written for whoever debugs it are two different fields, and that collapsing them costs nothing until the day it costs an afternoon.

---

## Bug Six — The Address Was Read Aloud in Fragments

Found that the address component splits the string into groups of four characters so that comparing two addresses by eye is realistic.

Understood that the same markup reaches assistive technology, which then announces a CKB address as roughly two dozen separate four-character chunks.

Recognised that the grouping helps precisely because eyes scan and hurts for the same reason a screen reader does not.

Hid the visual grouping from assistive technology and gave the container the whole address as its accessible name, so the display stays chunked and the announcement stays whole.

---

## Adding the Second Action

Added `request`, a payment whose amount the payer chooses, with optional minimum, maximum, and suggested figures set by the creator.

Chose it ahead of the xUDT transfer the roadmap had listed next, because it needs no new on-chain knowledge — no token Script, no decimals, no collection strategy — and because it tests something the roadmap could not.

Learned that last week's claim that adding an action costs a registry entry, a field specification, and a builder was true, and that it was only true because the second action was value-moving like the first.

Recognised that the interesting property of a request link is that it names no figure, so it cannot commit anyone to one. The number comes from the person spending the money.

Understood that this introduces the one input in the system that does not come from the link, and routed it through the same validation the link's own amounts get, with the creator's bounds enforced on top.

Made bounds satisfiability a decode-time check, so a link whose minimum exceeds its maximum is refused once rather than rejecting every figure the payer tries.

Made the builder refuse an amount supplied for an action that already fixes its own, instead of ignoring it. Ignoring it would build a transaction for the link's figure while the caller believed it had chosen a different one.

Made editing the amount discard the transaction built from the previous one, since a summary describing a figure that is no longer in the input box is the same divergence the whole design exists to prevent.

Ordered the checks so an expired request refuses outright rather than first inviting the payer to type a figure it was never going to accept.

---

## Describing a Link Without a Wallet

Identified a gap that had been papered over: before a wallet is connected there is no transaction, so there is nothing for the summary rule to derive a preview from, yet the page still has to show the visitor something.

Recognised the risk that whatever fills that gap quietly becomes the preview, at which point the guarantee is gone and nothing in the code says so.

Wrote a separate function returning a deliberately weaker type, named a claim rather than a summary, carrying what the link says and nothing a transaction would be needed to know.

Gave it no fee, no total, and no path to a sign button, and wrote a test asserting that those fields are absent — so the moment someone adds one, the suite says why they should not have.

Used it for the pre-connect view and for the new inspect route, and for nothing else.

---

## Finishing the Link Builder

Replaced the generate button with live derivation, so the link and its QR code are produced from the form on every keystroke.

Learned that this makes the outbound validation visible: the form can now say why a link cannot be made while it is being filled in, and a link that appears at all is one the SDK has already accepted.

Suppressed the error until the required fields have something in them, because telling someone their address is invalid before they have typed one is noise rather than help.

Added expiry as presets rather than a date picker, and captured the absolute timestamp once when the preset is chosen.

Learned that deriving the timestamp on every render would have been the natural way to write it and would have meant the link, and its QR code, changed silently between looking at it and sharing it.

Added an action selector, bounds inputs for payer-priced links, a share button that uses the native share sheet where one exists, and the copy button rebuilt around its failure path.

---

## The QR Code

Added QR codes to the builder, drawn as a single SVG path from the module grid so the output scales cleanly and inherits nothing that could break it.

Used a QR library rather than implementing the encoder, on the grounds that the error-correction maths has no user-visible upside when written by hand and a silent mistake in it is not something the test suite could catch.

Learned that a base64url payload has to be encoded in byte mode, because the denser alphanumeric mode is uppercase-only and the payload is deliberately case-sensitive.

Measured the result: a typical transfer link is a 69-by-69 module grid, one carrying a full-length label and note reaches 93 by 93, and a payload near the schema's 4096-character ceiling exceeds QR capacity entirely.

Recognised that the schema's limit and the QR format's limit therefore disagree, and made the component report that a link is too long to encode rather than fail silently.

Made the QR the only element on the site that ignores the colour scheme, since a code rendered light-on-dark is not reliably scannable and correctness beats consistency here.

---

## Reading a Link Without Opening It

Added an inspect route where a link can be pasted and read back — full URL, bare fragment, or bare payload.

Gave it no wallet connection, no transaction building, and no signing affordance of any kind, and said so on the page.

Learned that this is a better answer to "how do I check this link" than "open it and look", because the confirmation page is a signing surface and the answer should not require standing on one.

Made a refused link show the error code alongside the plain-language message, so a broken link can be diagnosed without opening the console.

---

## Interface Work

Rebuilt the confirmation page around the review findings: a fixed heading, quoted payload text, a chip row carrying the network and the countdown, and a details list ending in the true total rather than opening with it.

Made the sign and cancel buttons a sticky bar at the bottom of the viewport, because most of these links will be opened on a phone and the decision should not require scrolling back to find it.

Added a copy button to every address and hash shown on the site, since an address displayed in full is only useful if it can be taken somewhere to be compared.

Added inline validation styling to the payer's amount input, wired to the accessible invalid state rather than colour alone.

Extended the home page to explain the two kinds of link and to point at the inspect route.

---

## Rebuilding the Visual Design

Threw out the original stylesheet after concluding that it looked like a default rather than a decision — a blue accent, rounded cards, and the generic spacing that every framework starter ships with.

Rebuilt it as a monochrome system with no hue anywhere, which forced hierarchy to be carried by weight, scale, and inversion instead of by tinted panels.

Learned that this suits a signing surface better than colour did. The reader's entire job on that page is to check an address and a number, and every coloured panel competing for attention was contrast taken away from those two things.

Reserved solid black fill for exactly one meaning — a refusal — so the loudest thing the interface can do is also the rarest.

Replaced the system font stack with three typefaces, each given one job: a serif for headings, a tight grotesque for interface text, and a monospace for anything that is a value.

Learned that monospace on addresses and amounts is a correctness decision rather than a stylistic one, since tabular figures keep digits aligned between two amounts and an unambiguous face keeps a zero from reading as an O.

Self-hosted all three at build time through the framework's font pipeline, because a page that makes a point of contacting no server should not be fetching its typefaces from someone else's.

Verified that the fonts ship with metric-compatible fallbacks generated at build time, so the page does not reflow when they finish loading.

Rebuilt the components that had been carrying the old look: buttons with a real inverted primary state, a segmented control that fills solid when selected, inputs that thicken rather than redden when invalid, and hairline borders throughout instead of filled cards.

Gave the network prefix of every address its own weight and rule, since `ckb1` against `ckt1` is the one part of an address whose meaning a reader can check at a glance.

Kept the QR code dark-on-light in both colour schemes, which stopped being a compromise once the rest of the palette was monochrome too.

---

## Verification

Ran the full suite: sixty-four tests passing, up from thirty-six, covering the new action's round trip, its bounds, the payer's amount, the claim type, and five new builder refusals.

Confirmed that the per-action field specification really is per action, by asserting that a fixed amount is rejected inside a request and that request bounds are rejected inside a transfer.

Typechecked both packages clean, and found that the typecheck caught a bad cast inside a test file that the passing test run had not — a reminder that a green suite is not a green build.

Built the web application: four routes plus the not-found page, all prerendered as static, which confirms that none of this week's work introduced a server dependency.

Served the production build and checked that every route responds and renders its expected content, including that the confirmation route sends no payload-derived markup from the server, which is the fragment design working as intended.

Measured the QR encoder against real link lengths to establish where its ceiling actually is rather than assuming.

---

## What Is Not Yet Verified

No transaction has been signed or broadcast. That was true last week and is still true.

The successful path through the builder — collecting inputs, estimating the fee, and summarising a real transaction — has still never run against a funded account, which means this week's summary rewrite is reasoned and typed but not observed. It needs a funded Devnet account through OffCKB.

Nothing was driven through a browser this week. The pages were checked by serving the production build and reading what they render, not by clicking through them, so the interface work is verified as far as markup, types, and shipped assets, and no further.

The redesign in particular has been verified structurally — the stylesheet compiles, the three typefaces download and are served from the app's own origin, and every route responds — but nobody has looked at it. That is the next thing to do, not something to assume.

Mainnet remains closed. The security checklist now has every item checked except the three that require running against a real wallet, and those three are the gate.

---

## Key Learnings

* Reviewing code written days earlier found six defects, none of which were typos, and all of which had looked correct when they were written.
* Filtering outputs by "not mine" answers a different question from "what does this transaction do", and only the second one is safe to display above a sign button.
* A summary should account for every output and refuse what it cannot explain, because an omitted payment is as dangerous as a misstated one.
* Where text appears is part of how it is presented, so escaping attacker-controlled text is not enough if it is then given the page's own heading.
* A check written as a gate on a code path is not a property of the screen; expiry has to be watched for as long as the page is open and re-checked at the moment of signing.
* An unhandled clipboard failure produces a button that silently does nothing, which is worse than one that says it failed.
* The message shown to a person and the detail kept for whoever debugs it are two different fields, and collapsing them hides the real cause.
* Visual grouping that helps the eye read an address hurts a screen reader, so the two need separate treatment rather than one compromise.
* A link that names no amount cannot commit anyone to one, which makes the payer-priced action structurally safer than the fixed one.
* An input that does not come from the link still has to be validated as if it did, and it has to invalidate any transaction built before it changed.
* Deriving state from the current time on every render silently changes a link between the moment it is read and the moment it is shared.
* A base64url payload cannot use QR's alphanumeric mode, so the schema's size limit and the QR format's capacity are two different ceilings that have to be reconciled in the interface.
* A passing test suite is not a passing build; the typecheck found an error in a test file that the test run had reported as green.
* Removing colour from a signing surface increased its clarity rather than reducing it, because hierarchy built from weight, scale, and inversion leaves the address and the amount as the only things competing for attention.
* Reserving one visual treatment — solid fill — for one meaning makes the interface's loudest signal trustworthy, which a palette of tinted panels cannot do.
* Choosing a typeface for a money interface is partly a correctness decision: tabular figures align digits between two amounts, and an unambiguous monospace stops a zero reading as a letter.
