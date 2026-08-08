/**
 * The `request` action — a payment whose amount the payer chooses.
 *
 * Two things are being proved here. First, that the action registry really is
 * per-action: a field that is legal on one action must be rejected on the
 * other, rather than tolerated because it is legal somewhere. Second, that the
 * one number in the system that does not come from the link is validated as
 * strictly as the numbers that do.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ActionLinkError,
  decodePayload,
  encodeIntent,
  validateIntent,
  validatePayerAmount,
  type RequestIntent,
} from "../src/index.ts";

const TESTNET_ADDRESS =
  "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqt4z78ng4yutl5u6xsv27ht6q08mhujf8s2r0n40";

const request = (overrides: Partial<RequestIntent> = {}): RequestIntent => ({
  v: 1,
  network: "ckt",
  action: "request",
  to: TESTNET_ADDRESS,
  ...overrides,
});

const rejectsWith = (code: string, fn: () => unknown): void => {
  try {
    fn();
  } catch (error) {
    assert.ok(error instanceof ActionLinkError, `expected ActionLinkError, got ${error}`);
    assert.equal(error.code, code);
    assert.ok(error.userMessage.length > 0, "every error must carry a user-facing message");
    return;
  }
  assert.fail(`expected ${code} but nothing was thrown`);
};

describe("request round trip", () => {
  it("preserves a request with no bounds at all", () => {
    const intent = request();
    assert.deepEqual(decodePayload(encodeIntent(intent)), intent);
  });

  it("preserves bounds and a suggested figure", () => {
    const intent = request({ min: "61", max: "1000", suggested: "100", label: "Tip jar" });
    assert.deepEqual(decodePayload(encodeIntent(intent)), intent);
  });
});

describe("the field spec is per action, not shared", () => {
  it("rejects a fixed amount smuggled into a request", () => {
    // `amount` is legal on a transfer. On a request it would look like the
    // payer's figure while being under the creator's control.
    rejectsWith("UNKNOWN_FIELD", () =>
      validateIntent({ ...request(), amount: "100" } as unknown),
    );
  });

  it("rejects request bounds smuggled into a transfer", () => {
    rejectsWith("UNKNOWN_FIELD", () =>
      validateIntent({
        v: 1,
        network: "ckt",
        action: "transfer",
        to: TESTNET_ADDRESS,
        amount: "100",
        max: "1",
      } as unknown),
    );
  });
});

describe("request bounds have to be satisfiable", () => {
  it("rejects a minimum above the maximum", () => {
    rejectsWith("INVALID_FIELD", () => validateIntent(request({ min: "500", max: "100" })));
  });

  it("allows a minimum equal to the maximum", () => {
    const intent = request({ min: "100", max: "100" });
    assert.deepEqual(validateIntent(intent), intent);
  });

  it("rejects a suggestion outside the link's own limits", () => {
    rejectsWith("INVALID_FIELD", () => validateIntent(request({ max: "100", suggested: "500" })));
    rejectsWith("INVALID_FIELD", () => validateIntent(request({ min: "100", suggested: "50" })));
  });

  it("rejects bounds that are not decimal strings", () => {
    rejectsWith("INVALID_FIELD", () => validateIntent(request({ min: 100 as never })));
    rejectsWith("INVALID_FIELD", () => validateIntent(request({ max: "1e3" })));
    rejectsWith("INVALID_FIELD", () => validateIntent(request({ suggested: "-5" })));
    rejectsWith("INVALID_FIELD", () => validateIntent(request({ min: "0" })));
  });
});

describe("the payer's amount is validated like any other", () => {
  it("accepts a figure inside the bounds", () => {
    assert.equal(validatePayerAmount(request({ min: "61", max: "1000" }), "100"), "100");
  });

  it("accepts any positive figure when the link sets no bounds", () => {
    assert.equal(validatePayerAmount(request(), "0.00000001"), "0.00000001");
  });

  it("rejects a figure below the minimum", () => {
    rejectsWith("AMOUNT_OUT_OF_RANGE", () => validatePayerAmount(request({ min: "61" }), "60"));
  });

  it("rejects a figure above the maximum", () => {
    rejectsWith("AMOUNT_OUT_OF_RANGE", () =>
      validatePayerAmount(request({ max: "1000" }), "1000.00000001"),
    );
  });

  it("holds the bounds exactly, without float slack", () => {
    const bounded = request({ min: "0.1", max: "0.3" });
    assert.equal(validatePayerAmount(bounded, "0.3"), "0.3");
    rejectsWith("AMOUNT_OUT_OF_RANGE", () => validatePayerAmount(bounded, "0.30000001"));
  });

  it("applies the same format rules the link's own amounts get", () => {
    rejectsWith("INVALID_FIELD", () => validatePayerAmount(request(), "1e3"));
    rejectsWith("INVALID_FIELD", () => validatePayerAmount(request(), "1.000000001"));
    rejectsWith("INVALID_FIELD", () => validatePayerAmount(request(), 100 as never));
    rejectsWith("INVALID_FIELD", () => validatePayerAmount(request(), "0"));
  });
});
