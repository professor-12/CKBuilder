import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  decodeInvoiceFragment,
  encodeInvoiceFragment,
  invoiceUrl,
} from "../src/codec.ts";
import { TillError } from "../src/errors.ts";
import { createInvoice, validateInvoice, type Invoice } from "../src/invoice.ts";

import { TESTNET_ADDR } from "./helpers.ts";

function baseInvoice(overrides: Partial<Record<string, unknown>> = {}): unknown {
  return {
    v: 1,
    network: "ckt",
    asset: "ckb",
    to: TESTNET_ADDR,
    amount: "125.00073191",
    label: "Table 4",
    memo: "2x espresso",
    createdAt: 1_788_230_000,
    sinceBlock: 22_300_000,
    expiry: 1_788_233_600,
    ...overrides,
  };
}

describe("invoice validation", () => {
  it("accepts a complete CKB invoice", () => {
    const inv = validateInvoice(baseInvoice());
    assert.equal(inv.amount, "125.00073191");
    assert.equal(inv.network, "ckt");
  });

  it("accepts a token invoice with a udt descriptor", () => {
    const inv = validateInvoice(
      baseInvoice({
        asset: "udt",
        amount: "12.000731",
        udt: {
          codeHash:
            "0xbfa35a9c38a676682b65ade8f02be164d48632281477e36f8dc2f41f79e56bfc",
          hashType: "type",
          args: "0xd591ebdc69626647e056e13345fd830c8b876bb06aa07ba610479eb77153ea9f",
          symbol: "USDI",
          decimals: 6,
        },
      }),
    );
    assert.equal(inv.udt?.symbol, "USDI");
  });

  const rejections: [string, unknown][] = [
    ["unknown top-level field", baseInvoice({ tip: "1" })],
    ["wrong version", baseInvoice({ v: 2 })],
    ["missing network", baseInvoice({ network: undefined })],
    ["numeric amount", baseInvoice({ amount: 125.5 })],
    ["exponent amount", baseInvoice({ amount: "1e3" })],
    ["udt on a ckb invoice", baseInvoice({ udt: { codeHash: "0x" + "0".repeat(64), hashType: "type", args: "0x", symbol: "X", decimals: 6 } })],
    ["token invoice without udt", baseInvoice({ asset: "udt" })],
    ["mainnet address on testnet invoice", baseInvoice({ to: TESTNET_ADDR.replace(/^ckt/, "ckb") })],
    ["label with bidi override", baseInvoice({ label: "pay‮me" })],
    ["memo with zero-width", baseInvoice({ memo: "a​b" })],
    ["oversized label", baseInvoice({ label: "x".repeat(65) })],
    ["expiry before creation", baseInvoice({ expiry: 1_700_000_000 })],
    ["fractional createdAt", baseInvoice({ createdAt: 1_788_230_000.5 })],
    ["negative sinceBlock", baseInvoice({ sinceBlock: -1 })],
    ["null payload", null],
    ["array payload", []],
  ];
  for (const [name, payload] of rejections) {
    it(`rejects ${name}`, () => {
      assert.throws(() => validateInvoice(payload), TillError);
    });
  }
});

describe("fragment codec", () => {
  it("round-trips an invoice exactly", () => {
    const inv = validateInvoice(baseInvoice()) as Invoice;
    const fragment = encodeInvoiceFragment(inv);
    assert.deepEqual(decodeInvoiceFragment(fragment), inv);
    assert.deepEqual(decodeInvoiceFragment(`#${fragment}`), inv);
  });

  it("survives percent-encoding by chat clients", () => {
    const inv = validateInvoice(baseInvoice()) as Invoice;
    const fragment = encodeInvoiceFragment(inv);
    assert.deepEqual(
      decodeInvoiceFragment(encodeURIComponent(fragment)),
      inv,
    );
  });

  it("rejects future versions cleanly, without decoding", () => {
    assert.throws(
      () => decodeInvoiceFragment("v2.AAAA"),
      (e: unknown) =>
        e instanceof TillError && e.code === "UNSUPPORTED_VERSION",
    );
  });

  const garbage = [
    "",
    "#",
    "v1.",
    "v1.!!!!",
    "v1." + "A".repeat(5000),
    "v1.b3Blbg", // valid base64url, not JSON
    "not-a-fragment",
  ];
  for (const g of garbage) {
    it(`fails closed on ${JSON.stringify(g.slice(0, 20))}`, () => {
      assert.throws(() => decodeInvoiceFragment(g), TillError);
    });
  }

  it("builds a URL that strips existing fragments from the base", () => {
    const inv = validateInvoice(baseInvoice()) as Invoice;
    const url = invoiceUrl("https://example.org/pay#old", inv);
    assert.ok(url.startsWith("https://example.org/pay#v1."));
  });
});

describe("createInvoice", () => {
  it("produces a validated invoice with detection dust applied", () => {
    const { invoice, raw, nonce } = createInvoice({
      network: "ckt",
      asset: "ckb",
      to: TESTNET_ADDR,
      amount: "125",
      label: "Table 4",
      now: 1_788_230_000,
      tipBlock: 22_300_000,
      expiresInSeconds: 3600,
    });
    assert.ok(nonce >= 1);
    assert.equal(invoice.expiry, 1_788_233_600);
    assert.equal(invoice.sinceBlock, 22_300_000);
    // The encoded amount and the raw detection target must agree exactly.
    assert.equal(
      decodeInvoiceFragment(encodeInvoiceFragment(invoice)).amount,
      invoice.amount,
    );
    assert.equal(raw, 12_500_000_000n + BigInt(nonce));
  });

  it("refuses a base amount that intrudes on the detection space", () => {
    assert.throws(
      () =>
        createInvoice({
          network: "ckt",
          asset: "ckb",
          to: TESTNET_ADDR,
          amount: "125.0004",
          now: 1_788_230_000,
          tipBlock: 1,
        }),
      TillError,
    );
  });
});
