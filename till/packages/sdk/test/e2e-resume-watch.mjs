/**
 * Resume the week-15 E2E watch after the harness died on a transient RPC
 * error mid-poll. The payment is already on-chain; the invoice is
 * reconstructed from its known parameters (detection depends only on
 * network/to/amount/sinceBlock) and the detector must settle it with the
 * exact transaction the harness sent.
 */
import {
  detectSettlement,
  encodeInvoiceFragment,
  validateInvoice,
  PUBLIC_RPC,
  RpcClient,
} from "../src/index.ts";

const EXPECTED_TX =
  "0xc38a3b15d7b85c0baa048cdf5c94fe83314d4f22844c673b3e305747c62bea56";

const invoice = validateInvoice({
  v: 1,
  network: "ckt",
  asset: "ckb",
  to: "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqwnlxxrcyah5hmapw5vf6wxagaznf7ljqq9sn0rx",
  amount: "250.00094531",
  label: "Week 15 end-to-end proof",
  createdAt: Math.floor(Date.now() / 1000) - 600,
  sinceBlock: 22_270_000,
});

const rpc = new RpcClient(PUBLIC_RPC.ckt);
let lastStatus = "";
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
      `detector: ${s.status}` +
        (s.confirmations !== undefined ? ` (${s.confirmations} conf)` : ""),
    );
    lastStatus = s.status;
  }
  if (s.status === "settled") {
    if (s.txHash !== EXPECTED_TX) {
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
    console.log("invoice fragment for the /invoice page:");
    console.log(encodeInvoiceFragment(invoice));
    console.log("PASS: fresh invoice paid and settled end-to-end on testnet");
    process.exit(0);
  }
  await new Promise((r) => setTimeout(r, 5000));
}
console.error("FAIL: never settled within the polling window");
process.exit(1);
