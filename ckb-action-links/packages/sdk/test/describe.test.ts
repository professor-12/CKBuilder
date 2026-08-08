/**
 * describeIntent reads a link's claims without a wallet.
 *
 * The test that matters most is the last one: a claim must not carry a fee or a
 * total, because those cannot exist before a transaction does. If they ever
 * appear here, the description has started impersonating the signing summary.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  describeIntent,
  formatRemaining,
  secondsUntilExpiry,
  type ActionIntent,
} from "../src/index.ts";

const TESTNET_ADDRESS =
  "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqt4z78ng4yutl5u6xsv27ht6q08mhujf8s2r0n40";

const transfer = (overrides: Partial<Extract<ActionIntent, { action: "transfer" }>> = {}) =>
  ({
    v: 1,
    network: "ckt",
    action: "transfer",
    to: TESTNET_ADDRESS,
    amount: "100",
    ...overrides,
  }) as ActionIntent;

const request = (overrides: Partial<Extract<ActionIntent, { action: "request" }>> = {}) =>
  ({
    v: 1,
    network: "ckt",
    action: "request",
    to: TESTNET_ADDRESS,
    ...overrides,
  }) as ActionIntent;

describe("describeIntent", () => {
  it("states a fixed transfer plainly", () => {
    const claim = describeIntent(transfer(), 1_000);
    assert.equal(claim.headline, "Send 100 CKB");
    assert.equal(claim.amount, "100");
    assert.equal(claim.bounds, null);
    assert.equal(claim.recipient, TESTNET_ADDRESS);
  });

  it("phrases every shape of request bound", () => {
    assert.equal(describeIntent(request(), 1_000).headline, "Send an amount you choose");
    assert.equal(describeIntent(request({ min: "10" }), 1_000).headline, "Send at least 10 CKB");
    assert.equal(describeIntent(request({ max: "10" }), 1_000).headline, "Send up to 10 CKB");
    assert.equal(
      describeIntent(request({ min: "10", max: "50" }), 1_000).headline,
      "Send between 10 and 50 CKB",
    );
    assert.equal(
      describeIntent(request({ min: "10", max: "10" }), 1_000).headline,
      "Send exactly 10 CKB",
    );
  });

  it("reports no fixed amount for a payer-priced link", () => {
    const claim = describeIntent(request({ suggested: "25" }), 1_000);
    assert.equal(claim.amount, null, "a request must never claim an amount of its own");
    assert.deepEqual(claim.bounds, { suggested: "25" });
  });

  it("marks mainnet links as carrying real funds", () => {
    assert.equal(describeIntent(transfer(), 1_000).isMainnet, false);
    assert.equal(describeIntent(transfer(), 1_000).networkLabel, "Testnet");
  });

  it("tracks expiry against the supplied time rather than the clock", () => {
    assert.equal(describeIntent(transfer({ expiry: 2_000 }), 1_400).secondsRemaining, 600);
    assert.equal(describeIntent(transfer({ expiry: 2_000 }), 1_400).expired, false);
    assert.equal(describeIntent(transfer({ expiry: 2_000 }), 9_000).expired, true);
    assert.equal(describeIntent(transfer(), 9_000).secondsRemaining, null);
    assert.equal(describeIntent(transfer(), 9_000).expired, false);
  });

  it("passes display text through untouched, for the renderer to escape", () => {
    const claim = describeIntent(transfer({ label: "<b>Coffee</b>", note: "Thanks!" }), 1_000);
    assert.equal(claim.label, "<b>Coffee</b>");
    assert.equal(claim.note, "Thanks!");
  });

  it("carries nothing that only a built transaction could know", () => {
    const claim = describeIntent(transfer(), 1_000) as unknown as Record<string, unknown>;
    for (const forbidden of ["fee", "feeShannons", "totalDebit", "totalDebitShannons"]) {
      assert.equal(
        forbidden in claim,
        false,
        `a claim must not carry "${forbidden}" — that belongs to the signing summary`,
      );
    }
  });
});

describe("countdown formatting", () => {
  it("clamps a lapsed expiry at zero instead of going negative", () => {
    assert.equal(secondsUntilExpiry(transfer({ expiry: 1_000 }), 9_999), 0);
  });

  it("shortens each magnitude", () => {
    assert.equal(formatRemaining(0), "expired");
    assert.equal(formatRemaining(45), "45s");
    assert.equal(formatRemaining(90), "1m");
    assert.equal(formatRemaining(3_600), "1h");
    assert.equal(formatRemaining(5_400), "1h 30m");
    assert.equal(formatRemaining(90_000), "1d");
  });
});
