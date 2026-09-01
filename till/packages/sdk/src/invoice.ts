/**
 * The invoice: schema, strict validation, and creation.
 *
 * Validation is structural and fail-closed, in the discipline Action Links
 * established: nothing is coerced, unknown fields are refused, and text that
 * could disguise itself (control characters, zero-width, bidirectional
 * overrides) is rejected outright. An invoice that cannot be fully understood
 * must never reach a payer.
 */

import {
  CKB_DECIMALS,
  applyDetectionNonce,
  formatDecimal,
  parseDecimal,
} from "./amounts.ts";
import { TillError } from "./errors.ts";

export type Network = "ckb" | "ckt";

export interface UdtDescriptor {
  /** Type script of the token, verified against the chain at detection time. */
  codeHash: string;
  hashType: "type" | "data" | "data1" | "data2";
  args: string;
  /** Display hints. Never used for verification. */
  symbol: string;
  decimals: number;
}

export interface Invoice {
  v: 1;
  network: Network;
  asset: "ckb" | "udt";
  udt?: UdtDescriptor;
  /** Merchant receiving address. */
  to: string;
  /** Final amount including the detection nonce, as a decimal string. */
  amount: string;
  label?: string;
  memo?: string;
  /** Unix seconds at creation. */
  createdAt: number;
  /** Chain height at creation; the settlement scan starts here. */
  sinceBlock: number;
  /** Optional unix seconds after which the invoice must not be paid. */
  expiry?: number;
}

export const MAX_LABEL = 64;
export const MAX_MEMO = 256;

const HEX32_RE = /^0x[0-9a-f]{64}$/;
const HEX_RE = /^0x(?:[0-9a-f][0-9a-f])*$/;
const BECH32_BODY = /^[qpzry9x8gf2tvdw0s3jn54khce6mua7l]+$/;

export function decimalsOf(invoice: Invoice): number {
  return invoice.asset === "udt" ? invoice.udt!.decimals : CKB_DECIMALS;
}

/** Raw units the settlement detector must match exactly. */
export function rawAmountOf(invoice: Invoice): bigint {
  return parseDecimal(invoice.amount, decimalsOf(invoice));
}

export function assetLabelOf(invoice: Invoice): string {
  return invoice.asset === "udt" ? invoice.udt!.symbol : "CKB";
}

function fail(code: ConstructorParameters<typeof TillError>[0], msg: string): never {
  throw new TillError(code, msg);
}

function requireCleanText(
  value: unknown,
  field: string,
  maxLength: number,
): string {
  if (typeof value !== "string") {
    fail("INVALID_FIELD", `${field} must be a string.`);
  }
  if (value.length === 0 || value.length > maxLength) {
    fail(
      "INVALID_FIELD",
      `${field} must be 1–${maxLength} characters, got ${value.length}.`,
    );
  }
  for (const ch of value) {
    const cp = ch.codePointAt(0)!;
    const isControl = cp < 0x20 || (cp >= 0x7f && cp <= 0x9f);
    const isZeroWidth =
      (cp >= 0x200b && cp <= 0x200f) || cp === 0xfeff || cp === 0x2060;
    const isBidi =
      (cp >= 0x202a && cp <= 0x202e) || (cp >= 0x2066 && cp <= 0x2069);
    if (isControl || isZeroWidth || isBidi) {
      fail(
        "INVALID_FIELD",
        `${field} contains characters that can disguise text (control, zero-width, or direction overrides).`,
      );
    }
  }
  return value;
}

/** Structural address check. Checksum resolution happens where a client exists. */
export function checkAddressShape(to: unknown, network: Network): string {
  if (typeof to !== "string") {
    fail("INVALID_FIELD", "to must be a string address.");
  }
  const prefix = network === "ckb" ? "ckb1" : "ckt1";
  if (!to.startsWith(prefix)) {
    const otherPrefix = network === "ckb" ? "ckt1" : "ckb1";
    if (to.startsWith(otherPrefix)) {
      fail(
        "NETWORK_MISMATCH",
        `This invoice declares ${network === "ckb" ? "mainnet" : "testnet"} but the address is for the other network.`,
      );
    }
    fail("INVALID_FIELD", `Address must start with ${prefix}.`);
  }
  const body = to.slice(4);
  if (body.length < 40 || body.length > 200 || !BECH32_BODY.test(body)) {
    fail("INVALID_FIELD", "Address is not a well-formed CKB address.");
  }
  return to;
}

function checkUdt(value: unknown): UdtDescriptor {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail("INVALID_FIELD", "udt must be an object.");
  }
  const record = value as Record<string, unknown>;
  const allowed = new Set(["codeHash", "hashType", "args", "symbol", "decimals"]);
  for (const k of Object.keys(record)) {
    if (!allowed.has(k)) {
      fail("UNKNOWN_FIELD", `udt carries an unknown field "${k}".`);
    }
  }
  const { codeHash, hashType, args, symbol, decimals } = record;
  if (typeof codeHash !== "string" || !HEX32_RE.test(codeHash)) {
    fail("INVALID_FIELD", "udt.codeHash must be a 32-byte 0x hex string.");
  }
  if (
    hashType !== "type" &&
    hashType !== "data" &&
    hashType !== "data1" &&
    hashType !== "data2"
  ) {
    fail("INVALID_FIELD", "udt.hashType must be type|data|data1|data2.");
  }
  if (typeof args !== "string" || !HEX_RE.test(args) || args.length > 2 + 128) {
    fail("INVALID_FIELD", "udt.args must be a 0x hex string of at most 64 bytes.");
  }
  const sym = requireCleanText(symbol, "udt.symbol", 16);
  if (
    typeof decimals !== "number" ||
    !Number.isInteger(decimals) ||
    decimals < 0 ||
    decimals > 38
  ) {
    fail("INVALID_FIELD", "udt.decimals must be an integer between 0 and 38.");
  }
  return { codeHash, hashType, args, symbol: sym, decimals };
}

/**
 * Validate an untrusted decoded payload into an Invoice, or throw TillError.
 * Every rule here is load-bearing; see the PRD's security model.
 */
export function validateInvoice(payload: unknown): Invoice {
  if (
    typeof payload !== "object" ||
    payload === null ||
    Array.isArray(payload)
  ) {
    fail("MALFORMED_PAYLOAD", "Invoice payload is not an object.");
  }
  const record = payload as Record<string, unknown>;

  const allowed = new Set([
    "v",
    "network",
    "asset",
    "udt",
    "to",
    "amount",
    "label",
    "memo",
    "createdAt",
    "sinceBlock",
    "expiry",
  ]);
  for (const k of Object.keys(record)) {
    if (!allowed.has(k)) {
      fail(
        "UNKNOWN_FIELD",
        `Invoice carries an unknown field "${k}". Refusing rather than partially obeying it.`,
      );
    }
  }

  if (record.v !== 1) {
    fail("UNSUPPORTED_VERSION", "This is not a version-1 invoice.");
  }
  if (record.network !== "ckb" && record.network !== "ckt") {
    fail("INVALID_FIELD", "network must be \"ckb\" or \"ckt\".");
  }
  const network = record.network as Network;

  if (record.asset !== "ckb" && record.asset !== "udt") {
    fail("INVALID_FIELD", "asset must be \"ckb\" or \"udt\".");
  }
  let udt: UdtDescriptor | undefined;
  if (record.asset === "udt") {
    if (record.udt === undefined) {
      fail("INVALID_FIELD", "A token invoice must carry its udt descriptor.");
    }
    udt = checkUdt(record.udt);
  } else if (record.udt !== undefined) {
    fail("INVALID_FIELD", "A CKB invoice must not carry a udt descriptor.");
  }

  const to = checkAddressShape(record.to, network);

  const decimals = udt ? udt.decimals : CKB_DECIMALS;
  if (typeof record.amount !== "string") {
    fail("INVALID_FIELD", "amount must be a decimal string, never a number.");
  }
  parseDecimal(record.amount, decimals); // throws on any defect

  let label: string | undefined;
  if (record.label !== undefined) {
    label = requireCleanText(record.label, "label", MAX_LABEL);
  }
  let memo: string | undefined;
  if (record.memo !== undefined) {
    memo = requireCleanText(record.memo, "memo", MAX_MEMO);
  }

  const { createdAt, sinceBlock, expiry } = record;
  if (
    typeof createdAt !== "number" ||
    !Number.isInteger(createdAt) ||
    createdAt <= 1_500_000_000 ||
    createdAt >= 100_000_000_000
  ) {
    fail("INVALID_FIELD", "createdAt must be a plausible unix-seconds integer.");
  }
  if (
    typeof sinceBlock !== "number" ||
    !Number.isInteger(sinceBlock) ||
    sinceBlock < 0 ||
    sinceBlock > 1_000_000_000
  ) {
    fail("INVALID_FIELD", "sinceBlock must be a plausible block number.");
  }
  if (expiry !== undefined) {
    if (
      typeof expiry !== "number" ||
      !Number.isInteger(expiry) ||
      expiry <= createdAt
    ) {
      fail("INVALID_FIELD", "expiry must be a unix-seconds integer after createdAt.");
    }
  }

  return {
    v: 1,
    network,
    asset: record.asset,
    ...(udt ? { udt } : {}),
    to,
    amount: record.amount,
    ...(label !== undefined ? { label } : {}),
    ...(memo !== undefined ? { memo } : {}),
    createdAt,
    sinceBlock,
    ...(expiry !== undefined ? { expiry } : {}),
  };
}

export interface CreateInvoiceParams {
  network: Network;
  asset: "ckb" | "udt";
  udt?: UdtDescriptor;
  to: string;
  /** Base amount the merchant asked for, before the detection nonce. */
  amount: string;
  label?: string;
  memo?: string;
  /** Unix seconds now (injected — the SDK never reads a clock it can't test). */
  now: number;
  /** Current chain tip; the settlement scan will start here. */
  tipBlock: number;
  /** Seconds until expiry, if any. */
  expiresInSeconds?: number;
  /** Raw amounts of the merchant's other open invoices for this asset. */
  openAmounts?: readonly bigint[];
}

/**
 * Create an invoice: applies the detection nonce and returns the final
 * invoice (already validated) plus the exact raw amount to detect.
 */
export function createInvoice(params: CreateInvoiceParams): {
  invoice: Invoice;
  raw: bigint;
  nonce: number;
} {
  const decimals = params.asset === "udt" ? (params.udt?.decimals ?? NaN) : CKB_DECIMALS;
  const baseRaw = parseDecimal(params.amount, decimals);
  const { raw, nonce } = applyDetectionNonce(
    baseRaw,
    decimals,
    params.openAmounts ?? [],
  );
  const candidate = {
    v: 1 as const,
    network: params.network,
    asset: params.asset,
    ...(params.udt ? { udt: params.udt } : {}),
    to: params.to,
    amount: formatDecimal(raw, decimals),
    ...(params.label !== undefined ? { label: params.label } : {}),
    ...(params.memo !== undefined ? { memo: params.memo } : {}),
    createdAt: params.now,
    sinceBlock: params.tipBlock,
    ...(params.expiresInSeconds !== undefined
      ? { expiry: params.now + params.expiresInSeconds }
      : {}),
  };
  // The invoice a merchant hands out passes the exact validation a payer will
  // run. Creating something the other side would refuse is a defect at
  // creation time, not at the moment someone else discovers it.
  const invoice = validateInvoice(candidate);
  return { invoice, raw, nonce };
}
