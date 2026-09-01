/**
 * Byte-level helpers.
 *
 * Everything in this file operates on hex strings ("0x…") or Uint8Array and
 * returns bigint/string — never a JavaScript number for anything that could
 * exceed 2^53 or represent money. Amounts on CKB are uint64 (capacity,
 * shannons) and uint128 (UDT amounts); both overflow Number silently.
 */

export type Hex = `0x${string}`;

export function isHex(value: unknown): value is Hex {
  return (
    typeof value === "string" &&
    value.startsWith("0x") &&
    /^0x[0-9a-fA-F]*$/.test(value)
  );
}

export function hexToBytes(hex: string): Uint8Array {
  if (!isHex(hex)) {
    throw new Error(`not a hex string: ${String(hex).slice(0, 40)}`);
  }
  const body = hex.slice(2);
  if (body.length % 2 !== 0) {
    throw new Error(`hex string has odd length: ${hex.slice(0, 40)}`);
  }
  const out = new Uint8Array(body.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(body.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function bytesToHex(bytes: Uint8Array): Hex {
  let s = "0x";
  for (const b of bytes) {
    s += b.toString(16).padStart(2, "0");
  }
  return s as Hex;
}

/** Little-endian unsigned integer of arbitrary byte length. */
export function uintLE(bytes: Uint8Array): bigint {
  let v = 0n;
  for (let i = bytes.length - 1; i >= 0; i--) {
    v = (v << 8n) | BigInt(bytes[i]!);
  }
  return v;
}

/** uint128 little-endian — the xUDT/sUDT amount encoding. */
export function uint128LE(bytes: Uint8Array): bigint {
  if (bytes.length < 16) {
    throw new Error(
      `uint128 needs 16 bytes, got ${bytes.length} — not a UDT amount`,
    );
  }
  return uintLE(bytes.subarray(0, 16));
}

/** uint32 little-endian as a plain number (safe: < 2^32). */
export function uint32LE(bytes: Uint8Array): number {
  if (bytes.length < 4) {
    throw new Error(`uint32 needs 4 bytes, got ${bytes.length}`);
  }
  return (
    (bytes[0]! | (bytes[1]! << 8) | (bytes[2]! << 16)) + bytes[3]! * 0x1000000
  );
}

/** uint64 little-endian — block numbers, capacities in raw cell data. */
export function uint64LE(bytes: Uint8Array): bigint {
  if (bytes.length < 8) {
    throw new Error(`uint64 needs 8 bytes, got ${bytes.length}`);
  }
  return uintLE(bytes.subarray(0, 8));
}

/**
 * Decode bytes as UTF-8, replacing invalid sequences rather than throwing.
 * On-chain text is untrusted input; a decoder that throws on it hands the
 * attacker a denial-of-service against the page.
 */
export function utf8Lossy(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

/**
 * Strip characters that let on-chain text impersonate interface text when
 * rendered: control characters, zero-width characters, and bidirectional
 * overrides. Same rule Action Links applies to link labels — anything the
 * chain supplies is attacker-controlled.
 */
export function sanitizeDisplayText(text: string, maxLength = 256): string {
  let out = "";
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    const isControl = cp < 0x20 || (cp >= 0x7f && cp <= 0x9f);
    const isZeroWidth =
      (cp >= 0x200b && cp <= 0x200f) || cp === 0xfeff || cp === 0x2060;
    const isBidi = cp >= 0x202a && cp <= 0x202e;
    const isBidiIsolate = cp >= 0x2066 && cp <= 0x2069;
    if (isControl || isZeroWidth || isBidi || isBidiIsolate) {
      continue;
    }
    out += ch;
    if (out.length >= maxLength) {
      break;
    }
  }
  return out;
}

/** Shannons → decimal CKB string, exact. 1 CKB = 10^8 shannons. */
export function shannonsToCkb(shannons: bigint): string {
  const negative = shannons < 0n;
  const abs = negative ? -shannons : shannons;
  const whole = abs / 100_000_000n;
  const frac = abs % 100_000_000n;
  const fracStr = frac.toString().padStart(8, "0").replace(/0+$/, "");
  const body = fracStr === "" ? `${whole}` : `${whole}.${fracStr}`;
  return negative ? `-${body}` : body;
}

/**
 * UDT raw amount → decimal string using the token's declared decimals.
 * Exact string arithmetic; no floating point ever touches an amount.
 */
export function udtAmountToDecimal(raw: bigint, decimals: number): string {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 38) {
    throw new Error(`unreasonable decimals: ${decimals}`);
  }
  if (decimals === 0) {
    return raw.toString();
  }
  const negative = raw < 0n;
  const abs = negative ? -raw : raw;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const frac = abs % base;
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  const body = fracStr === "" ? `${whole}` : `${whole}.${fracStr}`;
  return negative ? `-${body}` : body;
}
