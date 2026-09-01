/**
 * M6 end-to-end proof: a FRESH invoice, paid by a real second wallet on
 * testnet, watched from unpaid through seen to settled — the full merchant
 * loop against the live network. Run manually:
 *
 *   PAYER_KEY=0x… MERCHANT_ADDR=ckt1… node --experimental-strip-types test/e2e-testnet.mjs
 *
 * The payer key must hold testnet CKB (faucet: https://faucet.nervos.org).
 * The script:
 *   1. creates an invoice with detection dust via createInvoice,
 *   2. asserts the detector reports it unpaid,
 *   3. pays it with CCC using the same read-back checks as the web app
 *      (exact capacity to the exact lock, refuse any builder adjustment),
 *   4. polls the detector until settled (6 confirmations),
 *   5. prints the chain-derived receipt and the invoice's /pay fragment.
 */
import { ccc } from "@ckb-ccc/core";

import {
  addressToLockScript,
  createInvoice,
  detectSettlement,
  encodeInvoiceFragment,
  rawAmountOf,
  PUBLIC_RPC,
  RpcClient,
} from "../src/index.ts";

const payerKey = process.env.PAYER_KEY;
const merchantAddr = process.env.MERCHANT_ADDR;
if (!payerKey || !merchantAddr) {
  console.error("Set PAYER_KEY and MERCHANT_ADDR.");
  process.exit(1);
}

const client = new ccc.ClientPublicTestnet();
const payer = new ccc.SignerCkbPrivateKey(client, payerKey);
const rpc = new RpcClient(PUBLIC_RPC.ckt);

// -- wait for the payer to be funded --------------------------------------
process.stdout.write("waiting for payer balance");
let balance = 0n;
for (let i = 0; i < 120; i++) {
  balance = await payer.getBalance();
  if (balance >= 30_000_000_000n) {
    break;
  }
  process.stdout.write(".");
  await new Promise((r) => setTimeout(r, 5000));
}
console.log(`\npayer balance: ${ccc.fixedPointToString(balance)} CKB`);
if (balance < 30_000_000_000n) {
  console.error("payer never got funded — faucet still pending?");
  process.exit(1);
}

// -- 1. create the invoice -------------------------------------------------
const tipBlock = await rpc.getTipBlockNumber();
const { invoice, raw, nonce } = createInvoice({
  network: "ckt",
  asset: "ckb",
  to: merchantAddr,
  amount: "250",
  label: "Week 15 end-to-end proof",
  now: Math.floor(Date.now() / 1000),
  tipBlock,
  expiresInSeconds: 3600,
});
console.log("invoice created:", invoice.amount, "CKB — dust nonce", nonce);
console.log("fragment:", encodeInvoiceFragment(invoice));

// -- 2. fresh invoice must be unpaid ----------------------------------------
const before = await detectSettlement(invoice, rpc);
console.log("detector before payment:", before.status);
if (before.status !== "unpaid") {
  console.error("FAIL: fresh invoice not reported unpaid");
  process.exit(1);
}

// -- 3. pay it, with the web app's read-back discipline ---------------------
const merchantLock = addressToLockScript(invoice.to, invoice.network);
const { script: toLock } = await ccc.Address.fromString(invoice.to, client);
const tx = ccc.Transaction.from({
  outputs: [{ lock: toLock, capacity: raw }],
});
await tx.completeInputsByCapacity(payer);
await tx.completeFeeBy(payer, 1000);
const paidOut = tx.outputs[0];
if (
  paidOut.capacity !== raw ||
  paidOut.lock.codeHash !== toLock.codeHash ||
  paidOut.lock.args !== toLock.args
) {
  console.error("FAIL: builder adjusted the payment (SEC-8) — refusing to send");
  process.exit(1);
}
const txHash = await payer.sendTransaction(tx);
console.log("payment sent:", txHash);
console.log("(merchant lock watched:", merchantLock.codeHash.slice(0, 10) + "…)");

// -- 4. watch it settle ------------------------------------------------------
// Transient public-node failures must not kill the watch — the same rule the
// web watcher follows: report, retry, keep the loop alive.
let lastStatus = "unpaid";
for (let i = 0; i < 180; i++) {
  let s;
  try {
    s = await detectSettlement(invoice, rpc);
  } catch (e) {
    console.log(`transient: ${e.message} — retrying`);
    await new Promise((r) => setTimeout(r, 5000));
    continue;
  }
  if (s.status !== lastStatus) {
    console.log(
      `detector: ${lastStatus} → ${s.status}` +
        (s.confirmations !== undefined ? ` (${s.confirmations} conf)` : ""),
    );
    lastStatus = s.status;
  }
  if (s.status === "settled") {
    if (s.txHash !== txHash) {
      console.error(`FAIL: settled by unexpected tx ${s.txHash}`);
      process.exit(1);
    }
    console.log("RECEIPT (chain-derived):");
    console.log(
      JSON.stringify(
        {
          txHash: s.txHash,
          outputIndex: s.outputIndex,
          blockNumber: s.blockNumber,
          chainTime: s.blockTimestampMs
            ? new Date(s.blockTimestampMs).toISOString()
            : undefined,
          confirmations: s.confirmations,
          payerLockArgs: s.payerAddressScript?.args,
        },
        null,
        1,
      ),
    );
    console.log("PASS: fresh invoice paid and settled end-to-end on testnet");
    process.exit(0);
  }
  await new Promise((r) => setTimeout(r, 5000));
}
console.error("FAIL: never settled within the polling window");
process.exit(1);
