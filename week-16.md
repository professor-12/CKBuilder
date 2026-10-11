# Builder Track Weekly Report — Week 16

**Name:** Emmanuel Badejo
**Week Ending:** 11-10-2026

# Independent Project

## Research Week — Screening the Fiber Opportunity Map, and Choosing Quarry

## Overview

Resumed the series after September, which went to university exams.

Took Neon's last two rounds of feedback as the brief: Action Links overlapped a [draft protocol](https://talk.nervos.org/t/10315) another builder had already published, Till overlapped the payment polling Blackbox POS already does, and the next idea should come out of the [opportunity map](https://talk.nervos.org/t/10665) and reach an MVP by the end of the month.

Spent the week on research only: the opportunity map end to end, the Spark committee's August guidance, both hackathon results, core-developer reviews on the CKBuilder tracker, the 9 October DevRel AMA, and about 80 Fiber, payments and infrastructure threads posted since May.

Screened twelve directions against five tests. Eleven failed, almost all because someone is already building them — nine of the twelve gained a new project after 22 August, the map's evidence date.

Selected **Quarry**: CKB chain data (JSON-RPC and indexer queries) sold per request by independent node operators, paid over Fiber, and consumed by dApps, bots and AI agents through a drop-in CCC transport. phroi asked for it in writing, Jan Xie called it "an interesting use case for Fiber", it sits on the problem DevRel names first (data access), it needs Fiber for reasons that can be stated in numbers, and searches found nobody building it.

Wrote no code. The MVP plan below runs from 12 to 31 October and ends with a Spark proposal.

---

## What I Read

| Area | Sources |
|---|---|
| Programme guidance | [Opportunity map](https://talk.nervos.org/t/10665); Spark committee [August post](https://talk.nervos.org/t/10576) and [Q2 report](https://talk.nervos.org/t/10396); NCC [quarterly reports](https://talk.nervos.org/t/8822); [CKBuilders update](https://talk.nervos.org/t/10329) |
| Builder output | [Gone in 60ms results](https://talk.nervos.org/t/10671) (66 submissions, 16 shortlisted); [Claw & Order roundup](https://talk.nervos.org/t/10154) (22 submissions); [CKBuilder tracker](https://github.com/Nervos-Community-Catalyst/CKBuilder-projects) (59 projects, ~40 review issues) |
| Reviewer feedback | Core reviews on tracker issues [#13](https://github.com/Nervos-Community-Catalyst/CKBuilder-projects/issues/13), [#38](https://github.com/Nervos-Community-Catalyst/CKBuilder-projects/issues/38), [#41](https://github.com/Nervos-Community-Catalyst/CKBuilder-projects/issues/41); [DevRel AMA](https://talk.nervos.org/t/10794/5) |
| Code and docs | FNN [v0.9.1 RPC reference](https://github.com/nervosnetwork/fiber/blob/v0.9.1/crates/fiber-lib/src/rpc/README.md) and [public-node guide](https://github.com/nervosnetwork/fiber/blob/v0.9.1/docs/public-nodes.md); [releases](https://github.com/nervosnetwork/fiber/releases) to v0.10.0-rc1; CCC 1.19.1 and 1.23.0 client source; [docs.nervos.org RPC page](https://docs.nervos.org/docs/getting-started/rpcs) |
| Outside CKB | [QuickNode x402 RPC](https://www.quicknode.com/blog/x402-micropayments-quicknode-rpc-endpoints); [NodeFlare x402](https://nodeflare.app/blog/pay-per-request-rpc-x402); [GetBlock CKB plans](https://getblock.io/nodes/ckb/); Lightning L402 ([Aperture](https://github.com/lightninglabs/aperture)) |

---

## The Rules I Screened Against

Read five sources as the rules rather than as background:

| Source | What it says |
|---|---|
| Opportunity map (26 Aug) | Generic metering and paid-access receipts are "reuse now". Routed CKB-asset sessions (RCS) and browser sessions (BSS) are "validate next". Useful projects bring "a provider or user who was not created for the demo" and measure completion, latency, retries, locked capital and recovery. |
| Spark committee (Aug) | The standard grant is $1,000 over one to two months. Fiber proposals cluster on moving money — gateways, swaps, plugins — rather than giving anyone a reason to transact, and few can say why they need Fiber. Every proposal needs a reproducible verification plan. Unchecked AI-written proposals are rejected. |
| chenyukang, on [Spindle](https://github.com/Nervos-Community-Catalyst/CKBuilder-projects/issues/13) | "Now seems there is no actual need for a gateway in front of Fiber node" — Fiber already scopes its RPC with Biscuit. |
| jjyr, on [FiberContinuity](https://github.com/Nervos-Community-Catalyst/CKBuilder-projects/issues/41) | fiber-js has no public checkpoint API, and Fiber's own checks after a restore "do not guarantee that recovery succeeded, especially if peers are unavailable or have advanced beyond the backed-up state". |
| Hanssen, [DevRel AMA](https://talk.nervos.org/t/10794/5) (9 Oct) | "Among the unresolved issues, the first thing that comes to mind is data indexing on CKB … Almost every application needs to query complex, aggregated data on CKB." |

Turned them into five tests:

1. **Asked for** — someone other than me has written that they want it.
2. **Absent** — Nervos Talk, the CKBuilder tracker and GitHub show nobody building it.
3. **Needs Fiber** — for a property the map names (CKB or UDT assets, multi-hop routing, bidirectional sessions, browser custody, CKB-linked rights, Lightning interop), not because Fiber is fast.
4. **Creates value** — someone pays for something produced, not just a more convenient way to move money.
5. **Buildable and checkable by 31 October** — one developer, testnet, with a verification plan a reviewer can run.

---

## Twelve Directions, Screened

| # | Direction (map ID) | Already being built | Failed |
|---|---|---|---|
| 1 | Agent spending sessions and policy (RCS) | [FiberPass](https://talk.nervos.org/t/10679) (Spark), [Trickle](https://talk.nervos.org/t/10493), Clasp and FiberGuard Session (hackathon 1st and 3rd), [Routed Machine Payment Sessions](https://talk.nervos.org/t/10694) (9 Sep) | 2 |
| 2 | Paid HTTP, L402, x402 (RPA) | Fiber Paid HTTP (hackathon 3rd), [FiberLatch](https://talk.nervos.org/t/10414) (DAO passed), [fiber-l402](https://talk.nervos.org/t/10140), Fiber402; the map rates it "reuse now" | 2, 4 |
| 3 | Browser sessions with recovery (BSS) | CKB KeyWay (hackathon 2nd), [Scryve Reads](https://talk.nervos.org/t/10304), FiberContinuity (8 Oct); jjyr's review shows recovery is a protocol problem | 2, 5 |
| 4 | Inbound liquidity and LSPs (PCO) | Fiber LSP Kit (hackathon 2nd), [LiquidLane](https://talk.nervos.org/t/10796), [submarine swaps](https://talk.nervos.org/t/10516), [rebalancing RFC](https://talk.nervos.org/t/10691), the core team's unreleased liquidity work | 2 |
| 5 | Lightning–Fiber bridging (LFB) | CCH inside FNN, [self-hosted CCH](https://talk.nervos.org/t/10599); needs an operator and liquidity on both sides | 5 |
| 6 | Portable rights (PPR) | [SkillPass](https://talk.nervos.org/t/10706), a CKBuilder project heading to the DAO | 2 |
| 7 | Games and device events (CGE) | [FiberSurvivors](https://talk.nervos.org/t/10898), FiberQuest, OpenStrike | 2 |
| 8 | Merchant checkout and POS | Blackbox POS, FiberFlow, FiberGate, [Zedify](https://talk.nervos.org/t/10751), fiber-checkout — and my own Till | 2 |
| 9 | Tipping on Nervos Talk | [Fiber Link](https://talk.nervos.org/t/9845): DAO vote passed with 98.29%, all three milestones delivered | 2 |
| 10 | Test, compatibility and recovery tooling | fiber-forge and Fiber Test Lab (hackathon 1st and 2nd), [Compatibility Kit](https://talk.nervos.org/t/10737), [FNN Safeguard](https://talk.nervos.org/t/10712) | 2, 4 |
| 11 | Streaming content and paywalls | [Fiber Audio Player](https://talk.nervos.org/t/10073), [Backr](https://talk.nervos.org/t/10191), [FiberTap](https://talk.nervos.org/t/10655), [FiberSplit](https://talk.nervos.org/t/10579) | 2 |
| 12 | P2P fiat ramp and mobile money | [Twine](https://talk.nervos.org/t/10741), [Dular](https://talk.nervos.org/t/10717) | 2 |

Set two more aside for scope rather than merit:

* Jan Xie's [fiberized DHT](https://talk.nervos.org/t/8957/6), where every peer pays per chunk downloaded and earns per chunk uploaded — the clearest bidirectional workload I found, and the answer to one of the map's open questions, but too large for one month.
* Agents paying people for micro-tasks — attractive, but I could not name a buyer.

Learned that "absent" is the test that kills ideas, and that it cannot be checked once: the field moved during the week I was checking it.

---

## The Selected Project: Quarry

**Pay-per-query CKB data from independent node operators, settled over Fiber.** Operators sell RPC and indexer queries per request; clients pay over Fiber; any CCC app switches by passing a transport.

### The problem, in facts

* The official RPC page lists two community endpoints per network plus Ankr, and says of the community nodes: "use at your own risk. You may use these nodes to try out or test some features, but you should not use them for production" ([docs.nervos.org](https://docs.nervos.org/docs/getting-started/rpcs)).
* CCC's public clients default to exactly those two endpoints — `testnet.ckb.dev`, falling back to `testnet.ckbapp.dev` — in the current release, @ckb-ccc/core 1.23.0 ([source](https://unpkg.com/@ckb-ccc/core@1.23.0/src/client/clientPublicTestnet.ts)). Every CCC app that does not configure an endpoint reads the chain through them.
* Fiber's testnet config points FNN itself at `testnet.ckbapp.dev` ([public-node guide](https://github.com/nervosnetwork/fiber/blob/v0.9.1/docs/public-nodes.md)).
* The alternatives are running a node or opening an account. GetBlock serves CKB with a 40,000-request daily free tier and pay-as-you-go plans from $29, behind an account ([GetBlock](https://getblock.io/nodes/ckb/)). Cellora, a CKBuilder project, is building a managed CKB index behind Argon2-hashed API keys ([thread](https://talk.nervos.org/t/10199)).
* An API key in a static frontend is public to every visitor, and an unattended agent cannot sign up for one.

### Who asked for it

* **phroi**, September 2025: "there are exactly 2 publicly available full nodes that I can RPC query against in my web DApps", and of Fiber micropayments, "Should also be applied to RPC requests?" — preferring "a pool of them and cross-check the results" ([#10](https://talk.nervos.org/t/8957/10), [#14](https://talk.nervos.org/t/8957/14)).
* **Jan Xie**, same thread: "that would be an interesting use case for Fiber", and RPC services "should operate as independent businesses rather than being continuously supported by the network treasury" ([#13](https://talk.nervos.org/t/8957/13)).
* **Node runners**, September–October 2026: a 22-post thread on [a revenue layer for CKB nodes](https://talk.nervos.org/t/10734). Its author has since started [ckb-service-runner](https://github.com/psawyerberlin/ckb-service-runner), which defers any paid service until twelve months of node ranking.
* **DevRel**, 9 October 2026: data access is the first unresolved problem Hanssen names.

### Why I care

Both of my projects read the chain through `ckb.dev`. Till hard-codes `mainnet.ckb.dev` and `testnet.ckb.dev` in its SDK; Action Links uses CCC's defaults. In week 15 the end-to-end proof died because a transient public-node failure made the detector throw after the payment was already on chain, and I wrote then that a harness must be at least as fault-tolerant as the product. The honest follow-up is that both products are only as available as two endpoints nobody is paid to keep up.

### What already exists, and the exact gap

| Option | Pays in | Account | Serves CKB |
|---|---|---|---|
| Community endpoints | free | no | yes — "not for production" |
| GetBlock, Ankr | card, plans | yes | yes |
| QuickNode x402 (Feb 2026), NodeFlare x402 | USDC on Base, Solana, Polygon or Arbitrum | no (wallet sign-in) | not listed |
| Lightning L402 (Aperture) | BTC | no | no |
| ckb-service-runner | paid services deferred | — | planned |
| **Gap** | **CKB, over Fiber** | **no** | — |

The pattern — pay per request, no account — is proven elsewhere, and agents already buy RPC that way in USDC. What does not exist is a version where any independent CKB node runner is the operator and the payment is the asset both sides already hold. Searches of Nervos Talk, the CKBuilder tracker and GitHub on 11 October found no CKB data service paid per request.

### Why Fiber, in numbers

* **Below the L1 floor.** A standard secp256k1 cell needs 61 CKB of capacity — about $0.07 at the $0.001186 reference rate in [a September DAO proposal](https://talk.nervos.org/t/10712). A request priced at a fraction of a CKB, or a credit bundle of a few CKB, cannot be an L1 transfer at all. I met this floor as a bug in week 13, when CCC silently raised a 1 CKB output to 61.
* **Credits fragment; channels route.** Prepaid credit with three operators means three deposits held by three operators. One Fiber channel to a public hub reaches any operator on the network — the map's RCS case, where "one funded route reaches several providers".
* **No stablecoin dependency.** USDI's operator announced its shutdown in June ([thread](https://talk.nervos.org/t/10417)), and the map notes no public mainnet UDT route. Operators run CKB nodes and clients already pay CKB fees, so pricing in CKB waits on nothing.
* **Proof of payment built in.** A successful Fiber payment returns the preimage to the payer ([RPC reference](https://github.com/nervosnetwork/fiber/blob/v0.9.1/crates/fiber-lib/src/rpc/README.md)) — the proof a 402 retry needs.

### Why it fits the machine-payments brief

The map's RCS buyer is "an unattended agent or service" with an ongoing relationship with providers, where "repeated calls can make per-payment approval the bottleneck". Bots and agents on CKB — keepers like CrowdCell's finalisation bot, schedulers like [CKAutomata](https://talk.nervos.org/t/10813), the agents from Claw & Order — read the chain continuously. Quarry lets them buy reads within a budget, from more than one operator, without anyone opening an account for them.

### How it works

```
  dApp / bot / agent (any CCC app)
        │  ccc.ClientPublicTestnet.new({ transport: quarry })
        ▼
  Quarry transport ── JSON-RPC over HTTPS ──▶ Quarry gate (operator)
        │                                       │ price table, credit ledger,
        │ pays invoices                         │ replay check
        ▼                                       ▼
  client FNN ──▶ public Fiber hub ──▶ operator FNN      CKB node (RPC + indexer)
              (multi-hop payment)
```

One call, start to finish:

1. A bot calls CCC's `findCellsByLock`; the transport receives the underlying `get_cells` request and sends it to operator A with no credit.
2. The gate answers HTTP 402 with a Fiber invoice for a credit bundle — for example, 1 CKB for 500 calls — and its price table.
3. The transport checks the bundle price against its per-operator cap and total budget, then pays from the client's own FNN with `send_payment`, bounded by `max_fee_amount`.
4. It retries with the payment hash and preimage. The gate confirms the invoice is paid on its own node, issues a credit, debits one call and forwards the request to its CKB node.
5. The next 499 calls ride the credit. If operator A errors or times out, the transport moves to operator B, which the same channel can already pay.

Reused rather than rebuilt, as the map asks: FNN v0.9.1 invoices and routing; the 402 exchange shape already proven by [Fiber Paid HTTP](https://github.com/a19q3/fiber-paid-http) (MIT) and fiber-l402; and `@fiberlatch/access` (ISC) for signed limited-use receipts where it fits. Will not use FNN's x402 module: it exists only in [draft PR #1301](https://github.com/nervosnetwork/fiber/pull/1301), unmerged.

New code is three pieces: the CCC transport (budget, price caps, operator choice, failover); the operator gate (price table, credit ledger, upstream forwarding); and the measurement harness.

### Trust model

* **Bounded prepayment.** The most a client can lose to a dishonest operator is one unused credit bundle. It never pays above its cap, and never pays an invoice whose amount differs from the quoted price — the week-13 rule that no figure a human chose is silently rewritten, applied to prices.
* **Data correctness.** The MVP trusts an operator's answers the way CCC trusts any RPC today; Hanssen describes that as current practice and recommends it for now. Cross-checking critical reads across two operators, which phroi asked for, is a later milestone, and phroi's [light-client snapshots](https://github.com/phroi/light-client-snapshots) are the first place to look for verifiable data.
* **No custody.** Clients keep their own Fiber node and keys; operators hold nothing beyond the bundle.
* **Fiber RPC stays private.** The gate talks to its own FNN locally, with [Biscuit auth](https://github.com/nervosnetwork/fiber/blob/develop/docs/biscuit-auth.md) enabled.

### What the MVP will measure

Each measure answers a question the map says the ecosystem cannot yet answer:

| Measure | Map question |
|---|---|
| Payment success and retries over at least 200 credit renewals and 10,000 paid calls | payment completion, retry behaviour |
| Added latency per call (p50 and p95) against the same node unpaid, at several bundle sizes | latency |
| Routing fees per CKB paid, and CKB locked in channels on each side | locked capital |
| Steps an operator needed before receiving the first payment | "Can an independent provider receive repeated payments without manually solving inbound liquidity?" |
| Calls served by an operator I do not run | "a provider … who was not created for the demo" |

Bundle size is the experiment's main dial: one call per payment is no prepayment risk and maximum latency, 500 calls per payment is the reverse. The trial will publish the curve between them.

### How I would know I am wrong

Will stop and publish the negative result if any of these holds by 31 October:

* More than 5% of credit renewals fail after retries on testnet, so clients would stall.
* No operator other than me will run the gate for a testnet trial.
* No consumer other than my own bot will try it.

---

## MVP Plan to 31 October

| Dates | Milestone | Done when |
|---|---|---|
| 12–14 Oct | **M0 spike.** Client and operator FNN v0.9.1 nodes on testnet, each with a channel to a public hub; pay an operator invoice across the hub. | A routed payment's hash and fee are recorded; per-payment latency is measured; the choice between reusing Fiber Paid HTTP and a thin TypeScript gate is written down with reasons. |
| 15–21 Oct | **M1 build.** Operator gate and CCC transport, with fixture tests in the Till style. | Tests cover 402 → pay → retry → serve; an overpriced invoice is refused; a replayed proof is refused; an exhausted budget is refused; a failing operator triggers failover. |
| 22–28 Oct | **M2 live trial.** Gate on a VPS beside a synced testnet node; Till's settlement watcher re-pointed through Quarry as the first consumer. | The measurement table above is filled from real runs; raw data and harness are committed; independent operators invited (NNCBN, the Atlantic node, the Service Runner author). |
| 29–31 Oct | **M3 write-up.** Nervos Talk post, CKBuilder tracker issue, Spark draft. | Anyone with a faucet claim can re-run the trial from the README. |

The operator side needs a VPS: a synced CKB node will not fit on my development machine. Until M2 the gate may front a public endpoint, and every result produced that way will say so.

---

## Grant Path

* **CKBuilder tracker issue** at M1, asking core reviewers one question first: is per-request paid data a need they recognise, or a gateway nobody needs? That is chenyukang's question to Spindle, asked of myself before anyone else has to.
* **Spark** after M3, for six to eight weeks: a mainnet trial with at least two independent operators, cross-checked reads, and an agent-facing MCP tool server. The budget will be derived from those deliverables, within the $1,000 standard. The verification plan is the committed harness, run against named operators, reproducing the published numbers.
* **Community Fund DAO** only if the Spark trial shows independent operators and consumers using it — the path the [Spark Q2 report](https://talk.nervos.org/t/10396) describes for ckb-probe.

---

## Housekeeping

* Till's USDI token preset is obsolete since IPN announced USDI's shutdown; it will be marked deprecated and the README corrected.
* Neither Action Links nor Till is on the [CKBuilder project tracker](https://github.com/Nervos-Community-Catalyst/CKBuilder-projects). Both will be added, with Quarry, so their status sits next to everyone else's.

---

## What Is Not Yet Verified

* No code exists. Every design statement above is a plan.
* Demand is inferred from written requests, not observed use. Nobody has yet paid for a CKB read.
* No independent operator has agreed to run the gate.
* Per-payment latency on testnet is unmeasured. If Fiber payments are too slow even with bundles, the design changes.
* Whether a public hub contributes inbound capacity to every new operator channel is unconfirmed. The public-node guide's worked example shows the hub contributing 250 CKB to a 499 CKB channel; M0 will check it.
* The novelty searches are a snapshot of 11 October.

---

## Key Learnings

* Novelty decays. Nine of twelve directions gained a new project after the map's evidence date, so "nobody is building this" has to be re-checked the week a proposal goes out, not the week the idea arrives.
* The tests that matter were already written by the reviewers: the map's "why Fiber", Spark's line between moving money and creating value, and chenyukang's "is there an actual need". Screening against them replaced guessing.
* The best candidate was not in a hot category but in an old thread, where a respected developer described a real pain and a co-founder agreed — and a year passed without anyone building it.
* The L1 minimum cell is Fiber's plainest argument for small payments: anything under 61 CKB cannot be a transfer at all. I first met that number as a bug.
* Check facts at the source. A demo README describes Fiber's "native x402 module"; the code shows an unmerged draft PR, so the plan does not depend on it.
