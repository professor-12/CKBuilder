# Builder Track Weekly Report — Week 11

**Name:** Emmanuel Badejo
**Week Ending:** 26-07-2026

# Independent Project

## CKB Action Links — Sharing a Transaction as a URL

## Overview

Moved from following tutorials to designing and starting an original CKB project.

Evaluated thirty candidate project ideas against the CKB properties each one would need, then selected the one that could realistically be completed alone.

Wrote a Product Requirements Document covering the link format, the security model, and the delivery milestones before writing any code.

Implemented the first milestone as a TypeScript SDK with a full test suite, and scaffolded the web application that consumes it.

---

## Evaluating the Project Ideas

Reviewed thirty proposed CKB project ideas and ranked them by how much work each would actually require rather than by how interesting each sounded.

Identified the three factors that dominate the cost of a CKB project: writing a custom Lock or Type Script, operating a daemon such as a Fiber node, and integrating a second chain through RGB++.

Selected idea 22, CKB Action Links, because it was the only concept that required none of the three.

Learned that ideas which sound simple are not always simple, since a Fiber payment gateway is mostly node operation and a visual debugger is mostly parsing RISC-V execution traces.

Recognised that the project composes primitives that already exist — CCC, JoyID, and protocol-level account abstraction — instead of building new ones.

---

## Defining the Problem

Studied how a payment request is shared on CKB today and found that it is either a pasted address and a number, or a link to a dApp where the receiver re-enters details the sender already knew.

Understood that both approaches push transaction construction onto the least informed party, since the sender knows the exact intent and the receiver has to reconstruct it by hand.

Concluded that every manual step in that process is an opportunity to send funds to the wrong place.

---

## Writing the Product Requirements Document

Wrote the PRD before implementation so that the scope, the format, and the security requirements were settled in advance.

Documented explicit non-goals, including OTX partial transactions, custom on-chain Scripts, and a hosted action-provider API.

Learned that removing the OTX framing from version one was necessary because the collector infrastructure it depends on does not exist yet.

Reduced version one to a complete transaction template where the signer is the only input provider, which delivers the same visible product for a fraction of the work.

---

## Designing the Link Format

Designed the wire format as `https://<host>/a#v1.<base64url(JSON)>`.

Learned that placing the payload in the URL fragment means browsers never transmit it to the server, so the host cannot observe which action a visitor opened, who it pays, or how much.

Understood that this also makes every page fully static, so the same bundle serves every link and anyone can host their own copy.

Placed the version prefix outside the encoded payload so that a future version can be detected and rejected cleanly without decoding anything first.

---

## Defining the Intent Schema

Defined the version one schema with a required network field, an action discriminator, a recipient address, an amount, and optional label, note, and expiry fields.

Made the network field mandatory and enforced, so a link built for Testnet cannot be signed on Mainnet.

Learned that the amount must be carried as a decimal string rather than a JSON number, because floating point silently loses precision at CKB's eight decimal places and a rounding error in a payment link is a money bug.

Decided that unknown fields are rejected rather than ignored, since a link relying on a field the reader does not honour is better refused than partially obeyed.

Built the action registry so that adding a new action type requires a new entry, a new field specification, and a new builder, rather than a change scattered across the codebase.

---

## Understanding the Security Model

Learned that the engineering in this project is straightforward and the security model is the actual product, because a URL that produces a signable transaction is structurally a phishing vector.

Studied how Solana's Actions ecosystem needed a registry of trusted providers for exactly this reason.

Identified preview and signing divergence as the most dangerous possible bug, where a summary is rendered from the intent and a transaction is independently rebuilt for signing.

Understood that any drift between those two code paths is silent theft, and that it survives testing because both halves look correct in isolation.

Resolved this by exposing a single builder that returns the transaction and its summary together, where the summary is computed by walking the built transaction's real outputs and never the intent.

Established that the interface must fail closed, refusing to offer a sign button whenever the version, action, payload, address, network, or expiry cannot be fully understood, with no override.

---

## Setting Up the Project Structure

Created a pnpm workspace containing a framework-agnostic SDK package and a Next.js web application.

Configured the SDK to ship raw TypeScript so the workspace needs no build step, with the web application transpiling it directly.

Verified the current published versions of `@ckb-ccc/core` and `@ckb-ccc/connector-react` before writing against them rather than relying on remembered API shapes.

---

## Implementing Validation

Implemented strict structural validation that coerces nothing, so a number supplied where a string was specified is an error rather than something to convert and continue with.

Learned that display text carried by a link is attacker-controlled and must be length-capped and checked for characters that can disguise it.

Rejected control characters, zero-width characters, and bidirectional override characters, because those allow a label to render as something other than what it contains.

Allowed markup through as inert text, since escaping is the renderer's responsibility and the string itself is legitimate.

Implemented amount conversion using string arithmetic and BigInt throughout, so no floating point value ever touches a monetary amount.

---

## Building Transactions with CCC

Used `ccc.Address.fromString` to perform full checksum validation at build time, since the structural checks in the validation layer have no client to resolve against.

Constructed the output Cell with `ccc.Transaction.from`, then completed inputs with `completeInputsByCapacity` and the fee with `completeFeeBy`.

Learned that a Cell must hold enough capacity to pay for its own storage, and used the output's `occupiedSize` to reject amounts below that minimum with a clear explanation rather than a raw RPC error after signing.

Derived the summary by comparing each output's Lock Script against the signer's own Lock Scripts, which correctly excludes the change Cell without assuming where CCC placed it.

Calculated the total leaving the wallet as the outgoing outputs plus the fee, because the amount actually debited is not the headline amount a naive interface would display.

---

## Testing

Wrote thirty-six tests using Node's built-in test runner, covering round-trip encoding, malformed links, and hostile payloads.

Verified that the decoder rejects unknown actions, unknown fields, future versions, invalid base64, non-JSON payloads, oversized payloads, and addresses whose prefix disagrees with the declared network.

Verified that amounts are rejected when supplied as numbers, in exponent notation, as negatives, with leading zeros, with more than eight decimal places, or as zero.

Confirmed that the transaction builder refuses a Mainnet link signed by a Testnet wallet, an expired link, an amount below the minimum Cell capacity, and an address whose checksum does not verify.

Learned that all four of those refusals occur before any network call, so they can be tested without a funded account.

---

## Building the Web Application

Built the confirmation page as a client component that reads the payload from `window.location.hash`, since the fragment only exists in the browser.

Used the `Provider`, `useSigner`, and `useCcc` hooks from `@ckb-ccc/connector-react` to handle wallet connection.

Learned that CKB's protocol-level account abstraction means the same link is signable from JoyID, MetaMask, or a Bitcoin wallet without writing any per-wallet code.

Ensured that opening a link never triggers a wallet prompt, that connecting is an explicit action, and that signing is a second explicit action after the summary has rendered.

Displayed the recipient address in full and chunked into groups rather than truncated, because truncation is what an address-substitution attack relies on.

Verified that all four routes build as static pages, which confirms that the fragment-based design requires no server rendering.

---

## What Is Not Yet Verified

The web application has not been run against a real wallet, and no transaction has been signed or broadcast.

The transaction builder's refusal paths are tested, but the successful path still needs a funded Devnet account through OffCKB.

Nothing in the project has been pointed at Mainnet, and the PRD gates that behind a security checklist that is not yet complete.

---

## Key Learnings

* The cost of a CKB project is driven mainly by custom on-chain Scripts, daemon operation, and cross-chain integration, and avoiding all three makes a project achievable alone.
* Writing the requirements and the security model before the code prevented scope that would have depended on infrastructure that does not exist yet.
* Placing a payload in the URL fragment keeps it away from the server and allows the entire application to remain static.
* A transaction summary must be derived from the built transaction rather than from its source data, otherwise the preview and the signed object can silently disagree.
* Monetary amounts must be handled as strings and BigInt, never as floating point numbers.
* Validation should reject unknown input rather than ignore it, and should fail closed with no override.
* Text supplied by a link is attacker-controlled and can be made to render as something other than what it contains.
* A Cell must hold enough capacity to pay for its own storage, which sets a practical minimum on any transfer.
* CCC handles input collection, fee estimation, and change automatically, but the resulting transaction still has to be inspected to report the true cost to the user.
* Account abstraction on CKB removes the need for per-wallet integration code, so one signing flow serves every supported wallet.
