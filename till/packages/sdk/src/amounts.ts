/**
 * Exact decimal amount handling.
 *
 * Amounts exist in two representations and only two:
 *  - decimal strings, for humans and for the invoice payload;
 *  - bigint raw units (shannons for CKB, base units for UDTs), for arithmetic
 *    and for comparing against the chain.
 *
 * No floating point value ever touches an amount, in either direction. A
 * settlement detector that matches with a tolerance is a detector that can be
 * argued with; SET-2 requires BigInt equality on exact raw units.
 */

import { TillError } from "./errors.ts";

export const CKB_DECIMALS = 8;

/** Strict decimal-string check: no signs, no exponents, no leading zeros. */
const DECIMAL_RE = /^(0|[1-9][0-9]*)(\.([0-9]+))?$/;

/**
 * Parse a decimal string into raw units at the given precision.
 * Rejects rather than rounds: an amount with more precision than the asset
 * carries is a mistake, not something to quietly truncate.
 */
export function parseDecimal(amount: string, decimals: number): bigint {
  if (typeof amount !== "string" || amount.length === 0 || amount.length > 40) {
    throw new TillError("INVALID_AMOUNT", "Amount must be a decimal string.");
  }
  const m = DECIMAL_RE.exec(amount);
  if (!m) {
    throw new TillError(
      "INVALID_AMOUNT",
      `"${amount}" is not a plain decimal number.`,
    );
  }
  const whole = m[1]!;
  const frac = m[3] ?? "";
  if (frac.length > decimals) {
    throw new TillError(
      "AMOUNT_PRECISION",
      `This asset carries ${decimals} decimal places; "${amount}" has ${frac.length}.`,
    );
  }
  const raw =
    BigInt(whole) * 10n ** BigInt(decimals) +
    BigInt(frac.padEnd(decimals, "0") || "0");
  if (raw <= 0n) {
    throw new TillError("AMOUNT_TOO_SMALL", "Amount must be greater than zero.");
  }
  return raw;
}

/** Format raw units back to a decimal string, exact, no trailing zeros. */
export function formatDecimal(raw: bigint, decimals: number): string {
  const negative = raw < 0n;
  const abs = negative ? -raw : raw;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const frac = abs % base;
  const fracStr =
    decimals === 0
      ? ""
      : frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  const body = fracStr === "" ? `${whole}` : `${whole}.${fracStr}`;
  return negative ? `-${body}` : body;
}

/**
 * How many trailing decimal digits the detection nonce may occupy for an
 * asset. Chosen so the dust is always negligible:
 *  - CKB (8 decimals): 5 digits → at most 0.00099999 CKB.
 *  - UDTs: everything below the third-most-significant decimal place, capped
 *    at 4 digits → for a 6-decimal stablecoin, at most $0.000999.
 *  - Assets with 3 or fewer decimals get no nonce; uniqueness must come from
 *    the base amounts themselves.
 */
export function nonceDigitsFor(decimals: number): number {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 38) {
    throw new TillError("INVALID_FIELD", `Unreasonable decimals: ${decimals}.`);
  }
  if (decimals <= 3) {
    return 0;
  }
  return Math.min(decimals - 3, decimals === CKB_DECIMALS ? 5 : 4);
}

/** Cryptographically random integer in [1, max], rejection-sampled. */
function randomNonce(max: number): number {
  if (max < 1) {
    throw new TillError("NONCE_EXHAUSTED", "No nonce space available.");
  }
  const range = max; // values 1..max
  const buf = new Uint32Array(1);
  const limit = Math.floor(0xffffffff / range) * range;
  for (;;) {
    globalThis.crypto.getRandomValues(buf);
    const v = buf[0]!;
    if (v < limit) {
      return (v % range) + 1;
    }
  }
}

/**
 * Apply a detection nonce to a base amount.
 *
 * The base amount must leave the nonce digits empty — an invoice for
 * 125.0004 CKB would collide with its own detection space, so it is refused
 * with an explanation rather than silently rounded (the same rule SEC-8
 * applies to builders that adjust amounts: any silent rewrite of a figure a
 * human chose is a bug farm).
 *
 * `taken` carries the raw amounts of the merchant's other open invoices for
 * the same asset; the nonce is re-drawn until the result collides with none
 * of them. With 5 digits of space and a handful of open invoices, exhaustion
 * is not a practical concern, but the loop is still bounded and fails loudly.
 */
export function applyDetectionNonce(
  baseRaw: bigint,
  decimals: number,
  taken: readonly bigint[],
): { raw: bigint; nonce: number } {
  const digits = nonceDigitsFor(decimals);
  if (digits === 0) {
    if (taken.includes(baseRaw)) {
      throw new TillError(
        "NONCE_SPACE_OCCUPIED",
        "Another open invoice already asks for exactly this amount. This asset has too few decimals for automatic uniqueness — vary the amount slightly.",
      );
    }
    return { raw: baseRaw, nonce: 0 };
  }
  const space = 10n ** BigInt(digits);
  if (baseRaw % space !== 0n) {
    throw new TillError(
      "NONCE_SPACE_OCCUPIED",
      `The last ${digits} decimal places are reserved for payment detection. Round the amount and let Till fill them.`,
    );
  }
  const takenSet = new Set(taken.map((t) => t.toString()));
  const max = Number(space) - 1;
  for (let attempt = 0; attempt < 32; attempt++) {
    const nonce = randomNonce(max);
    const raw = baseRaw + BigInt(nonce);
    if (!takenSet.has(raw.toString())) {
      return { raw, nonce };
    }
  }
  // Randomness has missed 32 times, which only happens when the space is
  // crowded. Fall back to a scan from a random origin: if any free amount
  // exists, it is found; exhaustion is a fact, never bad luck.
  const start = randomNonce(max);
  for (let step = 0; step < max; step++) {
    const nonce = ((start - 1 + step) % max) + 1;
    const raw = baseRaw + BigInt(nonce);
    if (!takenSet.has(raw.toString())) {
      return { raw, nonce };
    }
  }
  throw new TillError(
    "NONCE_EXHAUSTED",
    "Every detection amount for this figure is taken by another open invoice; settle or void some first.",
  );
}
