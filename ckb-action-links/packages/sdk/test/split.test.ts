/**
 * The `split` action — several recipients, one link.
 *
 * Two things are being tested here beyond the obvious round trip.
 *
 * First, that a split is not a weaker transfer: every leg gets the same address
 * check, the same amount check and the same cell floor a single transfer gets,
 * so nothing can be smuggled in by putting it inside a list.
 *
 * Second, that the list stays readable. A recipient cap and a duplicate-address
 * refusal are not format constraints — they exist because the payer has to
 * check every address before signing, and a list nobody finishes reading is a
 * place to hide one.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  LIMITS,
  decodePayload,
  describeIntent,
  encodeIntent,
  totalOfPayments,
  validateIntent,
  type ActionIntent,
  type SplitIntent,
} from "../src/index.ts";

const A =
  "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqt4z78ng4yutl5u6xsv27ht6q08mhujf8s2r0n40";
const B =
  "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqt4z78ng4yutl5u6xsv27ht6q08mhujgqg84wylt";
const C =
  "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqt4z78ng4yutl5u6xsv27ht6q08mhujgqsvqzs59";
const MAINNET =
  "ckb1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqt4z78ng4yutl5u6xsv27ht6q08mhujf8sy3yulh";

const split = (overrides: Partial<SplitIntent> = {}): SplitIntent => ({
  v: 1,
  network: "ckt",
  action: "split",
  payments: [
    { to: A, amount: "100" },
    { to: B, amount: "200" },
  ],
  ...overrides,
});

const rejectsWith = (code: string, fn: () => unknown): void => {
  try {
    fn();
    assert.fail(`expected ${code}, but nothing was thrown`);
  } catch (error) {
    const actual = (error as { code?: string }).code;
    assert.equal(actual, code, `expected ${code}, got ${actual ?? String(error)}`);
  }
};

describe("split — round trip", () => {
  it("survives encoding and decoding unchanged", () => {
    const intent = split({ label: "Team payout" });
    assert.deepEqual(decodePayload(encodeIntent(intent)), intent);
  });

  it("keeps recipients in the order the link states them", () => {
    const decoded = decodePayload(
      encodeIntent(
        split({
          payments: [
            { to: C, amount: "70" },
            { to: A, amount: "80" },
            { to: B, amount: "90" },
          ],
        }),
      ),
    ) as Extract<ActionIntent, { action: "split" }>;
    assert.deepEqual(
      decoded.payments.map((p) => p.to),
      [C, A, B],
      "reordering the list would reorder what the payer checks against",
    );
  });

  it("sums its legs with string arithmetic, not floats", () => {
    const total = totalOfPayments([
      { to: A, amount: "0.1" },
      { to: B, amount: "0.2" },
    ]);
    // 0.1 + 0.2 in binary floating point is famously not 0.3.
    assert.equal(total, 30_000_000n);
  });
});

describe("split — the list itself", () => {
  it("refuses a single recipient, which is a transfer", () => {
    rejectsWith("INVALID_FIELD", () =>
      validateIntent(split({ payments: [{ to: A, amount: "100" }] })),
    );
  });

  it("refuses an empty list", () => {
    rejectsWith("INVALID_FIELD", () => validateIntent(split({ payments: [] })));
  });

  it("refuses more recipients than a person will check", () => {
    const payments = Array.from({ length: LIMITS.maxPayments + 1 }, (_, i) => ({
      to: [A, B, C][i % 3]!,
      amount: "100",
    }));
    rejectsWith("INVALID_FIELD", () => validateIntent(split({ payments })));
  });

  it("refuses the same address twice", () => {
    rejectsWith("INVALID_FIELD", () =>
      validateIntent(
        split({
          payments: [
            { to: A, amount: "100" },
            { to: A, amount: "200" },
          ],
        }),
      ),
    );
  });

  it("refuses a list that is not a list", () => {
    rejectsWith("INVALID_FIELD", () =>
      validateIntent({ ...split(), payments: "not an array" } as unknown),
    );
  });

  it("refuses a leg that is not an object", () => {
    rejectsWith("INVALID_FIELD", () =>
      validateIntent(split({ payments: ["nope", { to: B, amount: "1" }] as never })),
    );
  });
});

describe("split — every leg gets a full transfer's scrutiny", () => {
  it("refuses an unknown field inside a leg", () => {
    rejectsWith("UNKNOWN_FIELD", () =>
      validateIntent(
        split({
          payments: [
            { to: A, amount: "100", memo: "hi" },
            { to: B, amount: "200" },
          ] as never,
        }),
      ),
    );
  });

  it("refuses a mainnet address inside a testnet split", () => {
    rejectsWith("NETWORK_MISMATCH", () =>
      validateIntent(
        split({
          payments: [
            { to: A, amount: "100" },
            { to: MAINNET, amount: "200" },
          ],
        }),
      ),
    );
  });

  it("refuses an amount supplied as a number", () => {
    rejectsWith("INVALID_FIELD", () =>
      validateIntent(
        split({
          payments: [
            { to: A, amount: 100 },
            { to: B, amount: "200" },
          ] as never,
        }),
      ),
    );
  });

  it("refuses a leg below the floor no cell can go under", () => {
    rejectsWith("BELOW_MIN_CAPACITY", () =>
      validateIntent(
        split({
          payments: [
            { to: A, amount: "100" },
            { to: B, amount: "5" },
          ],
        }),
      ),
    );
  });

  it("refuses a zero amount in a leg", () => {
    rejectsWith("INVALID_FIELD", () =>
      validateIntent(
        split({
          payments: [
            { to: A, amount: "100" },
            { to: B, amount: "0" },
          ],
        }),
      ),
    );
  });

  it("refuses a leg missing its amount", () => {
    rejectsWith("INVALID_FIELD", () =>
      validateIntent(split({ payments: [{ to: A }, { to: B, amount: "200" }] as never })),
    );
  });

  it("refuses the transfer fields when they appear on a split", () => {
    rejectsWith("UNKNOWN_FIELD", () =>
      validateIntent({ ...split(), to: A, amount: "100" } as unknown),
    );
  });
});

describe("split — what it claims without a wallet", () => {
  it("names every recipient, not just the first", () => {
    const claim = describeIntent(
      split({
        payments: [
          { to: A, amount: "100" },
          { to: B, amount: "200" },
          { to: C, amount: "300" },
        ],
      }),
      1_000,
    );
    assert.deepEqual(
      claim.recipients.map((r) => r.address),
      [A, B, C],
    );
    assert.deepEqual(
      claim.recipients.map((r) => r.amount),
      ["100", "200", "300"],
    );
  });

  it("totals its legs in the headline", () => {
    const claim = describeIntent(split(), 1_000);
    assert.equal(claim.headline, "Send 300 CKB to 2 recipients");
    assert.equal(claim.amount, "300");
  });

  it("flags a leg that clears the absolute floor but not a standard lock's", () => {
    const claim = describeIntent(
      split({
        payments: [
          { to: A, amount: "45" },
          { to: B, amount: "200" },
        ],
      }),
      1_000,
    );
    assert.deepEqual(
      claim.recipients.map((r) => r.belowTypicalMinimum),
      [true, false],
      "45 CKB is constructible under some lock but not under a standard address",
    );
  });

  it("still carries nothing only a built transaction could know", () => {
    const claim = describeIntent(split(), 1_000) as unknown as Record<string, unknown>;
    for (const forbidden of ["fee", "feeShannons", "totalDebit", "payments"]) {
      assert.equal(
        forbidden in claim,
        false,
        `a claim must not carry "${forbidden}" — that belongs to the signing summary`,
      );
    }
  });
});
