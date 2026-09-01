import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyDetectionNonce,
  formatDecimal,
  nonceDigitsFor,
  parseDecimal,
} from "../src/amounts.ts";
import { TillError } from "../src/errors.ts";

describe("parseDecimal", () => {
  it("parses whole and fractional CKB exactly", () => {
    assert.equal(parseDecimal("1", 8), 100_000_000n);
    assert.equal(parseDecimal("0.00000001", 8), 1n);
    assert.equal(parseDecimal("125.5", 8), 12_550_000_000n);
    // The float-famous case: 0.1 + 0.2 must be exact in raw units.
    assert.equal(
      parseDecimal("0.1", 8) + parseDecimal("0.2", 8),
      parseDecimal("0.3", 8),
    );
  });

  it("parses at non-CKB precisions (USDI has 6)", () => {
    assert.equal(parseDecimal("12.345678", 6), 12_345_678n);
    assert.equal(parseDecimal("1", 0), 1n);
  });

  it("rejects floats, negatives, exponents, leading zeros, and empties", () => {
    for (const bad of [
      "1e8",
      "-1",
      "+1",
      "01",
      "1.",
      ".5",
      "",
      "0x10",
      "1,5",
      "NaN",
      "Infinity",
      " 1",
    ]) {
      assert.throws(() => parseDecimal(bad, 8), TillError, bad);
    }
  });

  it("rejects zero — an invoice for nothing is a mistake", () => {
    assert.throws(() => parseDecimal("0", 8), TillError);
    assert.throws(() => parseDecimal("0.0", 8), TillError);
  });

  it("rejects excess precision rather than rounding", () => {
    assert.throws(() => parseDecimal("1.000000001", 8), TillError);
    assert.throws(() => parseDecimal("1.0000001", 6), TillError);
  });

  it("round-trips with formatDecimal", () => {
    for (const [s, d] of [
      ["125.00073191", 8],
      ["0.00000001", 8],
      ["12.345678", 6],
      ["7", 0],
    ] as const) {
      assert.equal(formatDecimal(parseDecimal(s, d), d), s);
    }
  });
});

describe("detection nonce", () => {
  it("allocates 5 digits for CKB, 3 for USDI, none for coarse assets", () => {
    assert.equal(nonceDigitsFor(8), 5);
    assert.equal(nonceDigitsFor(6), 3);
    assert.equal(nonceDigitsFor(3), 0);
    assert.equal(nonceDigitsFor(0), 0);
  });

  it("keeps the base amount intact and adds only dust", () => {
    const base = parseDecimal("125", 8);
    const { raw, nonce } = applyDetectionNonce(base, 8, []);
    assert.ok(nonce >= 1 && nonce <= 99_999);
    assert.equal(raw - base, BigInt(nonce));
    assert.ok(raw - base < 100_000n); // < 0.001 CKB
  });

  it("refuses a base amount that occupies the nonce space", () => {
    assert.throws(
      () => applyDetectionNonce(parseDecimal("125.0004", 8), 8, []),
      TillError,
    );
  });

  it("finds the single free amount even in a fully crowded space", () => {
    const base = parseDecimal("125", 8);
    // Occupy every nonce value except 77 — allocation must land on 77.
    const taken: bigint[] = [];
    for (let i = 1; i <= 99_999; i++) {
      if (i !== 77) {
        taken.push(base + BigInt(i));
      }
    }
    const { raw } = applyDetectionNonce(base, 8, taken);
    assert.equal(raw, base + 77n);
  });

  it("reports exhaustion only when every amount truly is taken", () => {
    const base = parseDecimal("2", 4); // decimals 4 → 1 nonce digit, values 1..9
    const taken = Array.from({ length: 9 }, (_, i) => base + BigInt(i + 1));
    assert.throws(() => applyDetectionNonce(base, 4, taken), TillError);
  });

  it("with no nonce space, enforces uniqueness of the base amounts", () => {
    const base = parseDecimal("5", 0);
    assert.equal(applyDetectionNonce(base, 0, []).raw, base);
    assert.throws(() => applyDetectionNonce(base, 0, [base]), TillError);
  });
});
