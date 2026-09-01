import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { detectSettlement, matchSettlingOutput } from "../src/detect.ts";
import { validateInvoice, type Invoice } from "../src/invoice.ts";
import { RpcClient, type RpcScript } from "../src/rpc.ts";
import { addressToLockScript } from "../src/address.ts";

/**
 * The detector runs against a scripted fake node. Every scenario is a full
 * request/response conversation — the same JSON the public nodes return,
 * recorded shapes, no network.
 */

import { TESTNET_ADDR } from "./helpers.ts";

const MERCHANT_LOCK = addressToLockScript(TESTNET_ADDR, "ckt");
const OTHER_LOCK: RpcScript = {
  code_hash:
    "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8",
  hash_type: "type",
  args: "0x" + "77".repeat(20),
};
const USDI = {
  codeHash:
    "0xbfa35a9c38a676682b65ade8f02be164d48632281477e36f8dc2f41f79e56bfc",
  hashType: "type" as const,
  args: "0xd591ebdc69626647e056e13345fd830c8b876bb06aa07ba610479eb77153ea9f",
  symbol: "USDI",
  decimals: 6,
};

function merchantRpcLock(): RpcScript {
  return {
    code_hash: MERCHANT_LOCK.codeHash,
    hash_type: MERCHANT_LOCK.hashType,
    args: MERCHANT_LOCK.args,
  };
}

function ckbInvoice(amount: string, extra: Partial<Invoice> = {}): Invoice {
  return validateInvoice({
    v: 1,
    network: "ckt",
    asset: "ckb",
    to: TESTNET_ADDR,
    amount,
    createdAt: 1_788_230_000,
    sinceBlock: 100,
    ...extra,
  });
}

function usdiInvoice(amount: string): Invoice {
  return validateInvoice({
    v: 1,
    network: "ckt",
    asset: "udt",
    udt: USDI,
    to: TESTNET_ADDR,
    amount,
    createdAt: 1_788_230_000,
    sinceBlock: 100,
  });
}

/** uint128 little-endian hex for UDT cell data. */
function udtData(raw: bigint): string {
  let hex = "";
  let v = raw;
  for (let i = 0; i < 16; i++) {
    hex += (v & 0xffn).toString(16).padStart(2, "0");
    v >>= 8n;
  }
  return "0x" + hex;
}

interface FakeChain {
  tip: number;
  txPage: { tx_hash: string; block_number: string; cells: ["input" | "output", string][] }[];
  transactions: Record<string, unknown>;
  headers?: Record<string, { timestamp: string }>;
}

function fakeRpc(chain: FakeChain): RpcClient {
  const fetchImpl = async (_url: string, init: { body: string }) => {
    const req = JSON.parse(init.body) as { id: number; method: string; params: unknown[] };
    const respond = (result: unknown) => ({
      ok: true,
      status: 200,
      json: async () => ({ jsonrpc: "2.0", id: req.id, result }),
    });
    switch (req.method) {
      case "get_tip_block_number":
        return respond(`0x${chain.tip.toString(16)}`);
      case "get_transactions":
        return respond({ last_cursor: "0x", objects: chain.txPage });
      case "get_transaction":
        return respond(chain.transactions[req.params[0] as string] ?? {
          transaction: null,
          tx_status: { status: "unknown" },
        });
      case "get_header":
        return respond(
          chain.headers?.[req.params[0] as string] ?? { timestamp: "0x0" },
        );
      default:
        throw new Error(`unexpected method ${req.method}`);
    }
  };
  return new RpcClient("fake://", fetchImpl as never);
}

function committedTx(
  outputs: { capacity: string; lock: RpcScript; type?: RpcScript | null }[],
  outputsData: string[],
  blockHash = "0x" + "bb".repeat(32),
) {
  return {
    transaction: {
      inputs: [
        {
          previous_output: {
            tx_hash: "0x" + "cc".repeat(32),
            index: "0x0",
          },
        },
      ],
      outputs,
      outputs_data: outputsData,
    },
    tx_status: {
      status: "committed",
      block_hash: blockHash,
      block_number: "0x96",
    },
  };
}

describe("matchSettlingOutput", () => {
  const invoice = ckbInvoice("125.00073191");
  const raw = 12_500_073_191n;

  it("matches the exact capacity on the merchant lock", () => {
    const tx = committedTx(
      [
        { capacity: "0x2e90edd000", lock: OTHER_LOCK }, // change to payer
        { capacity: `0x${raw.toString(16)}`, lock: merchantRpcLock() },
      ],
      ["0x", "0x"],
    ).transaction!;
    assert.equal(matchSettlingOutput(tx, MERCHANT_LOCK, invoice, raw), 1);
  });

  it("does not match a near-miss amount — no tolerance exists", () => {
    const tx = committedTx(
      [{ capacity: `0x${(raw + 1n).toString(16)}`, lock: merchantRpcLock() }],
      ["0x"],
    ).transaction!;
    assert.equal(matchSettlingOutput(tx, MERCHANT_LOCK, invoice, raw), undefined);
  });

  it("does not match the right amount on the wrong lock", () => {
    const tx = committedTx(
      [{ capacity: `0x${raw.toString(16)}`, lock: OTHER_LOCK }],
      ["0x"],
    ).transaction!;
    assert.equal(matchSettlingOutput(tx, MERCHANT_LOCK, invoice, raw), undefined);
  });

  it("ignores a typed cell for a plain-CKB invoice", () => {
    const tx = committedTx(
      [
        {
          capacity: `0x${raw.toString(16)}`,
          lock: merchantRpcLock(),
          type: {
            code_hash: USDI.codeHash,
            hash_type: USDI.hashType,
            args: USDI.args,
          },
        },
      ],
      [udtData(999n)],
    ).transaction!;
    assert.equal(matchSettlingOutput(tx, MERCHANT_LOCK, invoice, raw), undefined);
  });

  it("matches a token payment by type script and uint128 data", () => {
    const tokenInvoice = usdiInvoice("12.000731");
    const tokenRaw = 12_000_731n;
    const tx = committedTx(
      [
        {
          capacity: "0x34e62ce00", // capacity is irrelevant for UDT invoices
          lock: merchantRpcLock(),
          type: {
            code_hash: USDI.codeHash,
            hash_type: USDI.hashType,
            args: USDI.args,
          },
        },
      ],
      [udtData(tokenRaw)],
    ).transaction!;
    assert.equal(
      matchSettlingOutput(tx, MERCHANT_LOCK, tokenInvoice, tokenRaw),
      0,
    );
  });

  it("does not match a different token under the same lock", () => {
    const tokenInvoice = usdiInvoice("12.000731");
    const tokenRaw = 12_000_731n;
    const tx = committedTx(
      [
        {
          capacity: "0x34e62ce00",
          lock: merchantRpcLock(),
          type: { ...OTHER_LOCK }, // different type script entirely
        },
      ],
      [udtData(tokenRaw)],
    ).transaction!;
    assert.equal(
      matchSettlingOutput(tx, MERCHANT_LOCK, tokenInvoice, tokenRaw),
      undefined,
    );
  });

  it("treats malformed token data as not-a-payment, not an error", () => {
    const tokenInvoice = usdiInvoice("12.000731");
    const tx = committedTx(
      [
        {
          capacity: "0x34e62ce00",
          lock: merchantRpcLock(),
          type: {
            code_hash: USDI.codeHash,
            hash_type: USDI.hashType,
            args: USDI.args,
          },
        },
      ],
      ["0x0102"], // 2 bytes — cannot hold a uint128
    ).transaction!;
    assert.equal(
      matchSettlingOutput(tx, MERCHANT_LOCK, tokenInvoice, 12_000_731n),
      undefined,
    );
  });
});

describe("detectSettlement", () => {
  const invoice = ckbInvoice("125.00073191");
  const raw = 12_500_073_191n;
  const payTx = "0x" + "aa".repeat(32);
  const blockHash = "0x" + "bb".repeat(32);

  function settledChain(tip: number): FakeChain {
    return {
      tip,
      txPage: [
        {
          tx_hash: payTx,
          block_number: "0x96", // block 150
          cells: [["output", "0x0"]],
        },
      ],
      transactions: {
        [payTx]: committedTx(
          [{ capacity: `0x${raw.toString(16)}`, lock: merchantRpcLock() }],
          ["0x"],
          blockHash,
        ),
      },
      headers: { [blockHash]: { timestamp: "0x19c8e5d2c00" } },
    };
  }

  it("reports settled at the confirmation threshold", async () => {
    const settlement = await detectSettlement(invoice, fakeRpc(settledChain(155)), {
      now: 1_788_231_000,
    });
    assert.equal(settlement.status, "settled");
    assert.equal(settlement.txHash, payTx);
    assert.equal(settlement.outputIndex, 0);
    assert.equal(settlement.blockNumber, 150);
    assert.equal(settlement.confirmations, 6);
    assert.equal(settlement.blockTimestampMs, 0x19c8e5d2c00);
  });

  it("reports seen below the threshold", async () => {
    const settlement = await detectSettlement(invoice, fakeRpc(settledChain(151)), {
      now: 1_788_231_000,
    });
    assert.equal(settlement.status, "seen");
    assert.equal(settlement.confirmations, 2);
  });

  it("ignores uncommitted transactions entirely", async () => {
    const chain = settledChain(200);
    (chain.transactions[payTx] as { tx_status: { status: string } }).tx_status.status =
      "pending";
    const settlement = await detectSettlement(invoice, fakeRpc(chain), {
      now: 1_788_231_000,
    });
    assert.equal(settlement.status, "unpaid");
  });

  it("reports unpaid when nothing matches", async () => {
    const settlement = await detectSettlement(
      invoice,
      fakeRpc({ tip: 200, txPage: [], transactions: {} }),
      { now: 1_788_231_000 },
    );
    assert.equal(settlement.status, "unpaid");
    assert.equal(settlement.checkedAtTip, 200);
  });

  it("reports expired only after checking the chain", async () => {
    const expiring = ckbInvoice("125.00073191", { expiry: 1_788_230_100 });
    const settlement = await detectSettlement(
      expiring,
      fakeRpc({ tip: 200, txPage: [], transactions: {} }),
      { now: 1_788_239_999 },
    );
    assert.equal(settlement.status, "expired");
  });

  it("a payment beats expiry, flagged as paid after it", async () => {
    // expiry is after creation (valid) but before the block's timestamp.
    const expiring = ckbInvoice("125.00073191", { expiry: 1_788_230_100 });
    const chain = settledChain(400);
    chain.headers = {
      [blockHash]: {
        timestamp: `0x${(1_788_230_200_000n).toString(16)}`,
      },
    };
    const settlement = await detectSettlement(expiring, fakeRpc(chain), {
      now: 1_788_239_999,
    });
    assert.equal(settlement.status, "settled");
    assert.equal(settlement.paidAfterExpiry, true);
  });

  it("resolves the payer's lock from the first input, best-effort", async () => {
    const chain = settledChain(200);
    chain.transactions["0x" + "cc".repeat(32)] = committedTx(
      [{ capacity: "0xffffffff", lock: OTHER_LOCK }],
      ["0x"],
    );
    const settlement = await detectSettlement(invoice, fakeRpc(chain), {
      now: 1_788_231_000,
    });
    assert.equal(settlement.payerAddressScript?.args, OTHER_LOCK.args);
  });
});
