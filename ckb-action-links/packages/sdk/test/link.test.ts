import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ActionLinkError,
  buildActionUrl,
  decodePayload,
  encodeIntent,
  formatShannonsToCkb,
  isExpired,
  parseActionUrl,
  parseAmountToShannons,
  validateIntent,
  type ActionIntent,
  type TransferIntent,
} from "../src/index.ts";

const TESTNET_ADDRESS =
  "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqt4z78ng4yutl5u6xsv27ht6q08mhujf8s2r0n40";
const MAINNET_ADDRESS =
  "ckb1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqt4z78ng4yutl5u6xsv27ht6q08mhujf8sy3yulh";

const transfer = (overrides: Partial<TransferIntent> = {}): TransferIntent => ({
  v: 1,
  network: "ckt",
  action: "transfer",
  to: TESTNET_ADDRESS,
  amount: "100",
  ...overrides,
});

/** Encode an arbitrary object as a payload, bypassing outbound validation. */
const rawPayload = (value: unknown): string => {
  const json = JSON.stringify(value);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const b64 = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `v1.${b64}`;
};

/** Assert that a call throws ActionLinkError with a specific code. */
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

describe("round trip", () => {
  it("preserves a minimal transfer intent", () => {
    const intent = transfer();
    assert.deepEqual(decodePayload(encodeIntent(intent)), intent);
  });

  it("preserves optional display fields", () => {
    const intent = transfer({ label: "Coffee", note: "Thanks!", expiry: 1_785_000_000 });
    assert.deepEqual(decodePayload(encodeIntent(intent)), intent);
  });

  it("puts the payload in the URL fragment so the host never sees it", () => {
    const intent = transfer({ label: "Coffee" });
    const url = new URL(buildActionUrl(intent, "https://links.example/a"));

    assert.equal(url.pathname, "/a");
    assert.equal(url.search, "", "payload must not leak into the query string");
    assert.ok(url.hash.startsWith("#v1."));
    assert.deepEqual(parseActionUrl(url.toString()), intent);
  });

  it("accepts a bare payload or fragment, as a user might paste it", () => {
    const payload = encodeIntent(transfer());
    assert.deepEqual(parseActionUrl(payload), transfer());
    assert.deepEqual(parseActionUrl(`#${payload}`), transfer());
    assert.deepEqual(parseActionUrl(`  ${payload}  `), transfer());
  });
});

describe("fail closed on malformed links", () => {
  it("rejects a payload with no version prefix", () => {
    rejectsWith("MALFORMED_URL", () => decodePayload("bm90aGluZw"));
  });

  it("rejects a future protocol version without decoding it", () => {
    rejectsWith("UNSUPPORTED_VERSION", () => decodePayload("v2.bm90aGluZw"));
  });

  it("rejects a version mismatch inside the payload", () => {
    rejectsWith("UNSUPPORTED_VERSION", () => decodePayload(rawPayload({ ...transfer(), v: 2 })));
  });

  it("rejects non-base64url characters", () => {
    rejectsWith("MALFORMED_PAYLOAD", () => decodePayload("v1.not valid!!"));
  });

  it("rejects base64 that is not JSON", () => {
    rejectsWith("MALFORMED_PAYLOAD", () => decodePayload("v1.bm90IGpzb24"));
  });

  it("rejects JSON that is not an object", () => {
    rejectsWith("MALFORMED_PAYLOAD", () => decodePayload(rawPayload([1, 2, 3])));
    rejectsWith("MALFORMED_PAYLOAD", () => decodePayload(rawPayload("just a string")));
    rejectsWith("MALFORMED_PAYLOAD", () => decodePayload(rawPayload(null)));
  });

  it("rejects an oversized payload before decoding it", () => {
    rejectsWith("PAYLOAD_TOO_LARGE", () => decodePayload(`v1.${"A".repeat(5000)}`));
  });

  it("rejects a URL with no fragment", () => {
    rejectsWith("MALFORMED_URL", () => parseActionUrl("https://links.example/a"));
  });

  it("rejects text that is not a link at all", () => {
    rejectsWith("MALFORMED_URL", () => parseActionUrl("hello"));
  });
});

describe("fail closed on hostile intents", () => {
  it("rejects an unknown action", () => {
    rejectsWith("UNKNOWN_ACTION", () =>
      decodePayload(rawPayload({ v: 1, network: "ckt", action: "drain-wallet" })),
    );
  });

  it("rejects unknown fields rather than ignoring them", () => {
    rejectsWith("UNKNOWN_FIELD", () =>
      decodePayload(rawPayload({ ...transfer(), autoSign: true })),
    );
  });

  it("rejects a missing or unknown network", () => {
    rejectsWith("INVALID_FIELD", () => validateIntent({ ...transfer(), network: undefined }));
    rejectsWith("INVALID_FIELD", () => validateIntent({ ...transfer(), network: "eth" }));
  });

  it("rejects a mainnet address inside a testnet link", () => {
    rejectsWith("NETWORK_MISMATCH", () => validateIntent(transfer({ to: MAINNET_ADDRESS })));
  });

  it("rejects a testnet address inside a mainnet link", () => {
    rejectsWith("NETWORK_MISMATCH", () =>
      validateIntent(transfer({ network: "ckb", to: TESTNET_ADDRESS })),
    );
  });

  it("rejects addresses that are not plausible bech32", () => {
    rejectsWith("INVALID_ADDRESS", () => validateIntent(transfer({ to: "ckt1short" })));
    rejectsWith("INVALID_ADDRESS", () =>
      // 'b', 'i' and 'o' are not in the bech32 charset
      validateIntent(transfer({ to: `ckt1${"b".repeat(60)}` })),
    );
    rejectsWith("INVALID_ADDRESS", () => validateIntent(transfer({ to: 42 as never })));
  });

  it("rejects amounts that are not decimal strings", () => {
    rejectsWith("INVALID_FIELD", () => validateIntent(transfer({ amount: 100 as never })));
    rejectsWith("INVALID_FIELD", () => validateIntent(transfer({ amount: "1e3" })));
    rejectsWith("INVALID_FIELD", () => validateIntent(transfer({ amount: "-5" })));
    rejectsWith("INVALID_FIELD", () => validateIntent(transfer({ amount: "0100" })));
    rejectsWith("INVALID_FIELD", () => validateIntent(transfer({ amount: "1." })));
    rejectsWith("INVALID_FIELD", () => validateIntent(transfer({ amount: "" })));
  });

  it("rejects more precision than CKB has", () => {
    rejectsWith("INVALID_FIELD", () => validateIntent(transfer({ amount: "1.000000001" })));
  });

  it("rejects a zero amount", () => {
    rejectsWith("INVALID_FIELD", () => validateIntent(transfer({ amount: "0" })));
    rejectsWith("INVALID_FIELD", () => validateIntent(transfer({ amount: "0.00000000" })));
  });

  it("rejects display text long enough to push the real details off screen", () => {
    rejectsWith("INVALID_FIELD", () => validateIntent(transfer({ label: "x".repeat(65) })));
    rejectsWith("INVALID_FIELD", () => validateIntent(transfer({ note: "x".repeat(257) })));
  });

  it("rejects text that can disguise what it says", () => {
    // Bidi override — renders as something other than what it contains.
    rejectsWith("INVALID_FIELD", () => validateIntent(transfer({ label: "pay ‮ecila" })));
    // Zero-width characters, used to hide content inside a benign-looking label.
    rejectsWith("INVALID_FIELD", () => validateIntent(transfer({ note: "safe​hidden" })));
    // Newlines and other control characters break single-line rendering.
    rejectsWith("INVALID_FIELD", () => validateIntent(transfer({ label: "line\nbreak" })));
  });

  it("keeps markup as inert text rather than rejecting it", () => {
    // Escaping is the renderer's job; the string itself is legitimate.
    const intent = transfer({ label: "<b>bold</b>" });
    assert.equal(decodePayload(encodeIntent(intent)).label, "<b>bold</b>");
  });

  it("rejects a malformed expiry", () => {
    rejectsWith("INVALID_FIELD", () => validateIntent(transfer({ expiry: -1 })));
    rejectsWith("INVALID_FIELD", () => validateIntent(transfer({ expiry: 1.5 })));
    rejectsWith("INVALID_FIELD", () => validateIntent(transfer({ expiry: "soon" as never })));
  });

  it("refuses to encode an invalid intent, not just to decode one", () => {
    rejectsWith("UNKNOWN_ACTION", () =>
      encodeIntent({ v: 1, network: "ckt", action: "nope" } as unknown as ActionIntent),
    );
  });
});

describe("amount arithmetic", () => {
  it("converts without floating point", () => {
    assert.equal(parseAmountToShannons("1"), 100_000_000n);
    assert.equal(parseAmountToShannons("100.5"), 10_050_000_000n);
    assert.equal(parseAmountToShannons("0.00000001"), 1n);
    // 0.1 + 0.2 in float is 0.30000000000000004; string arithmetic is exact.
    assert.equal(
      parseAmountToShannons("0.1") + parseAmountToShannons("0.2"),
      parseAmountToShannons("0.3"),
    );
  });

  it("round trips through formatting", () => {
    for (const amount of ["1", "100.5", "0.00000001", "61", "123456789.87654321"]) {
      assert.equal(formatShannonsToCkb(parseAmountToShannons(amount)), amount);
    }
  });
});

describe("expiry", () => {
  it("is not expired before its time", () => {
    assert.equal(isExpired(transfer({ expiry: 2_000 }), 1_999), false);
    assert.equal(isExpired(transfer({ expiry: 2_000 }), 2_000), false);
  });

  it("is expired after its time", () => {
    assert.equal(isExpired(transfer({ expiry: 2_000 }), 2_001), true);
  });

  it("never expires without an expiry", () => {
    assert.equal(isExpired(transfer(), Number.MAX_SAFE_INTEGER), false);
  });
});
