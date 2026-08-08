# CKB Action Links

Share a CKB transaction as a URL.

A link carries the whole transaction intent in its own fragment. Whoever opens it sees
exactly what they would be signing, connects a wallet, and signs. There is no server, no
database, no custom on-chain Script — only the CCC SDK and a static page.

See [PRD.md](PRD.md) for the product requirements, the link format, and the security model.

---

## Status

| Milestone | State |
|---|---|
| M1 — SDK core (schema, codec, validation) | **Done.** 64 tests passing |
| M2 — Transaction building | Guard paths done and tested; happy path needs a funded devnet run |
| M3 — Preview page | Built. Fail-closed paths done; untested against a real wallet |
| M4 — Link builder | **Done.** Form, live validation, QR code, copy and share |
| M5 — Hardening | In progress — see the checklist in [PRD.md](PRD.md) §9 |

Nothing here has been run against a wallet yet. Do not point it at mainnet.

---

## Actions

| Action | What the link says | Who names the amount |
|---|---|---|
| `transfer` | Send exactly this much CKB to this address | The creator |
| `request` | Send what you like to this address, within these limits | The payer |

`request` exists because a link that names no figure cannot commit anyone to one. The
payer's number is validated by the same code that validates the link's own, and the
creator's bounds are enforced on top of it.

---

## Layout

```
packages/sdk/     @ckb-action-links/sdk — framework-agnostic TypeScript
  src/intent.ts   schema, types, action registry, limits
  src/codec.ts    encode / decode / parse URLs
  src/validate.ts strict, fail-closed validation
  src/build.ts    intent + signer -> { tx, summary }
  src/describe.ts wallet-free reading of what a link *claims*
  src/errors.ts   typed, user-presentable error codes
apps/web/         Next.js — preview/sign page and link builder
  app/a/          /a       decode, preview, connect, sign
  app/new/        /new     form to generate a link, with QR
  app/inspect/    /inspect read a link back without a wallet
```

## Running it

```bash
pnpm install
pnpm test          # SDK test suite
pnpm typecheck     # both packages
pnpm dev           # web app on http://localhost:3000
```

Testnet is the default. To try it end to end on a local devnet, run `offckb node`, fund an
account, and switch the client in `apps/web/app/providers.tsx`.

## The one rule

`buildAction` returns the transaction and its summary together, and the summary is computed
by walking the built transaction's outputs — never the intent. The UI renders the summary
and signs that same transaction object.

This is the whole security model in one sentence. The failure this prevents is a preview
that says one thing while the signed transaction does another, which is silent theft and
looks correct in testing because both halves are individually right. If you add an action
type, it goes through `buildAction` or it does not ship.

`describeIntent` is the one thing that reads a link without building anything, and it is
deliberately weaker: it returns a *claim*, carries no fee and no total, and never sits next
to a sign button. `/inspect` and the pre-connect view use it. Nothing else may.
