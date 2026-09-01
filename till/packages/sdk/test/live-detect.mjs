/**
 * Live integration proof (not part of the unit suite): reconstruct an
 * invoice for a real, historic testnet payment and let the detector find it
 * on the public RPC. Run manually:
 *
 *   node --experimental-strip-types test/live-detect.mjs
 */
import { ccc } from "@ckb-ccc/core";

import { detectSettlement } from "../src/detect.ts";
import { RpcClient, PUBLIC_RPC, hexToBigint, hexToNumber } from "../src/rpc.ts";
import { formatDecimal } from "../src/amounts.ts";
import { validateInvoice } from "../src/invoice.ts";

const rpc = new RpcClient(PUBLIC_RPC.ckt);

// A lock observed active on testnet (used throughout the unit suite).
const lock = {
  code_hash:
    "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8",
  hash_type: "type",
  args: "0x8e42b1999f265a0078503c4acec4d5e134534297",
};
const address = ccc.Address.fromScript(
  ccc.Script.from({
    codeHash: lock.code_hash,
    hashType: lock.hash_type,
    args: lock.args,
  }),
  new ccc.ClientPublicTestnet(),
).toString();

// Find a committed transaction that pays this lock a plain-CKB output.
const page = await rpc.getTransactions(lock, 0, "desc", 30);
let target;
for (const obj of page.objects) {
  if (!obj.cells.some(([d]) => d === "output")) continue;
  const txr = await rpc.getTransaction(obj.tx_hash);
  if (txr.tx_status.status !== "committed" || !txr.transaction) continue;
  for (const [direction, idxHex] of obj.cells) {
    if (direction !== "output") continue;
    const i = hexToNumber(idxHex, "index");
    const out = txr.transaction.outputs[i];
    if (!out || out.type) continue;
    target = {
      txHash: obj.tx_hash,
      block: hexToNumber(obj.block_number, "block"),
      amount: hexToBigint(out.capacity, "capacity"),
    };
    break;
  }
  if (target) break;
}
if (!target) {
  console.error("no historic plain-CKB payment found on this lock");
  process.exit(1);
}

console.log("historic payment:", target.txHash, "block", target.block);

const invoice = validateInvoice({
  v: 1,
  network: "ckt",
  asset: "ckb",
  to: address,
  amount: formatDecimal(target.amount, 8),
  createdAt: 1_700_000_001,
  sinceBlock: Math.max(0, target.block - 5),
});

const settlement = await detectSettlement(invoice, rpc);
console.log("detector verdict:", JSON.stringify(settlement, null, 1));

if (settlement.status !== "settled" && settlement.status !== "seen") {
  console.error("FAIL: detector did not find the payment");
  process.exit(1);
}
if (settlement.txHash !== target.txHash) {
  // A different tx paying the identical amount earlier is possible and
  // acceptable — the detector settles on the first match. Report it.
  console.log(
    "note: settled by an earlier identical-amount payment:",
    settlement.txHash,
  );
}
console.log("PASS: live settlement detection against public testnet RPC");
