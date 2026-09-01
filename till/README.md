# Till — self-custodial payments for CKB

Create an invoice, share it as a link or QR code, watch it settle on-chain,
hand over a receipt derived from the chain itself. No server, no custodian,
no account — the whole product is a static web app and a zero-dependency
TypeScript SDK.

- **Invoices as links.** The invoice rides in the URL fragment
  (`/pay/#v1.…`), which browsers never send to the host. The page is fully
  static and self-hostable.
- **Any wallet can pay.** Detection works by exact-amount matching (a few
  digits of random "detection dust", the pattern BTCPay proved for Bitcoin),
  so a payment from *any* CKB wallet settles the invoice — the payer never
  has to open the page. Opening it gives them a verified preview and
  one-tap payment via any CCC-supported wallet (JoyID, MetaMask, …).
- **Receipts are chain-derived.** Paid/settled states come exclusively from
  committed outputs read back over JSON-RPC. Nothing the payer's browser or
  a wallet callback claims is treated as evidence.
- **CKB and tokens.** Plain CKB and any xUDT-style token by full type script
  (USDI and Seal ship as presets), with exact BigInt arithmetic end to end.

## Layout

```
packages/sdk    @till/sdk — invoice schema/validation, fragment codec, exact
                amounts + detection nonce, pure bech32/bech32m address→lock
                decoding (RFC 0021), JSON-RPC client, settlement detector.
                Zero runtime dependencies.
apps/web        Next.js (static export): / ledger · /new · /pos · /pay · /invoice
```

## Develop

```bash
pnpm install
pnpm test        # 70 SDK tests: adversarial codec, exact amounts, detector fixtures,
                 # differential address decoding against CCC
pnpm typecheck   # both packages
pnpm build       # static export to apps/web/out
```

The SDK also carries a live integration proof that reconstructs an invoice
for a real historic testnet payment and lets the detector find it on the
public RPC:

```bash
cd packages/sdk && node --experimental-strip-types test/live-detect.mjs
```

## Deploy

`apps/web/out` is a plain static directory (directory-style routes). Any
static host serves it; nothing needs environment variables or a backend.

## Security model

See `PRD.md` §5 — the payer-side rules are inherited from CKB Action Links
(fail-closed decoding, summary derived from the built transaction, no silent
amount adjustments), and the merchant-side rules (SET-1…5) define what may
count as settlement evidence. The short version: **a receipt exists only if
the chain shows the output.**
