/**
 * Guard-path tests for buildAction.
 *
 * These cover every refusal that happens before cell collection, so they need
 * no funded wallet and make no RPC calls. The happy path — collecting inputs,
 * estimating a fee and summarising a real transaction — needs a funded devnet
 * account and lives in the OffCKB integration run (M2).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ccc } from "@ckb-ccc/core";

import { ActionLinkError, buildAction, type TransferIntent } from "../src/index.ts";

const PRIVATE_KEY = "0x0000000000000000000000000000000000000000000000000000000000000001";

const TESTNET_ADDRESS =
  "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqt4z78ng4yutl5u6xsv27ht6q08mhujf8s2r0n40";
const MAINNET_ADDRESS =
  "ckb1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqt4z78ng4yutl5u6xsv27ht6q08mhujf8sy3yulh";

const testnetSigner = () =>
  new ccc.SignerCkbPrivateKey(new ccc.ClientPublicTestnet(), PRIVATE_KEY);

const transfer = (overrides: Partial<TransferIntent> = {}): TransferIntent => ({
  v: 1,
  network: "ckt",
  action: "transfer",
  to: TESTNET_ADDRESS,
  amount: "100",
  ...overrides,
});

const rejectsWith = async (code: string, fn: () => Promise<unknown>): Promise<void> => {
  try {
    await fn();
  } catch (error) {
    assert.ok(error instanceof ActionLinkError, `expected ActionLinkError, got ${error}`);
    assert.equal(error.code, code);
    assert.ok(error.userMessage.length > 0, "every error must carry a user-facing message");
    return;
  }
  assert.fail(`expected ${code} but nothing was thrown`);
};

describe("buildAction refuses before touching the chain", () => {
  it("blocks a mainnet link signed by a testnet wallet", async () => {
    await rejectsWith("NETWORK_MISMATCH", () =>
      buildAction(
        transfer({ network: "ckb", to: MAINNET_ADDRESS }),
        testnetSigner(),
      ),
    );
  });

  it("blocks an expired link", async () => {
    await rejectsWith("EXPIRED", () =>
      buildAction(transfer({ expiry: 1_000 }), testnetSigner(), { nowSeconds: 1_001 }),
    );
  });

  it("blocks an amount below the recipient cell's minimum capacity", async () => {
    // A secp256k1 cell cannot hold less than 61 CKB — it must pay for its own
    // storage. Caught here rather than as a raw RPC rejection after signing.
    await rejectsWith("BELOW_MIN_CAPACITY", () =>
      buildAction(transfer({ amount: "1" }), testnetSigner()),
    );
  });

  it("blocks an address whose checksum does not verify", async () => {
    // Structurally plausible — right prefix, right charset, right length — but
    // one character altered, which validate.ts cannot catch without a client.
    const corrupted = `${TESTNET_ADDRESS.slice(0, 20)}q${TESTNET_ADDRESS.slice(21)}`;
    assert.notEqual(corrupted, TESTNET_ADDRESS);
    await rejectsWith("INVALID_ADDRESS", () =>
      buildAction(transfer({ to: corrupted }), testnetSigner()),
    );
  });
});
