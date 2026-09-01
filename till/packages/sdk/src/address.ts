/**
 * CKB address decoding (RFC 0021), implemented pure so the settlement
 * detector needs no SDK client and no network round-trip to turn a merchant
 * address into the lock script it must watch.
 *
 * Supported:
 *  - Full format (bech32m, payload type 0x00): any lock script.
 *  - Deprecated short format (bech32, type 0x01) for the three system locks
 *    it was ever defined for — these still circulate widely.
 * Anything else is refused with an explanation, never guessed at.
 */

import { bytesToHex, type Hex } from "./bytes.ts";
import { TillError } from "./errors.ts";
import type { Network } from "./invoice.ts";

export interface LockScript {
  codeHash: Hex;
  hashType: "data" | "type" | "data1" | "data2";
  args: Hex;
}

const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const BECH32_CONST = 1;
const BECH32M_CONST = 0x2bc830a3;

function polymod(values: number[]): number {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) {
      if ((top >>> i) & 1) {
        chk ^= GEN[i]!;
      }
    }
  }
  return chk >>> 0;
}

function hrpExpand(hrp: string): number[] {
  const out: number[] = [];
  for (const c of hrp) {
    out.push(c.charCodeAt(0) >>> 5);
  }
  out.push(0);
  for (const c of hrp) {
    out.push(c.charCodeAt(0) & 31);
  }
  return out;
}

function fiveToEight(data: number[]): Uint8Array {
  let acc = 0;
  let bits = 0;
  const out: number[] = [];
  for (const value of data) {
    acc = (acc << 5) | value;
    bits += 5;
    while (bits >= 8) {
      bits -= 8;
      out.push((acc >>> bits) & 0xff);
    }
  }
  if (bits >= 5 || (acc << (8 - bits)) & 0xff) {
    throw new TillError("INVALID_FIELD", "Address has invalid padding.");
  }
  return new Uint8Array(out);
}

/** Short-format code hash table (RFC 0021). ACP differs per network. */
const SHORT_INDEX: Record<
  number,
  (network: Network) => { codeHash: Hex; hashType: "type" }
> = {
  0x00: () => ({
    codeHash:
      "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8",
    hashType: "type",
  }),
  0x01: () => ({
    codeHash:
      "0x5c5069eb0857efc65e1bca0c07df34c31663b3622fd3876c876320fc9634e2a8",
    hashType: "type",
  }),
  0x02: (network) => ({
    codeHash:
      network === "ckb"
        ? "0xd369597ff47f29fbc0d47d2e3775370d1250b85140c670e4718af712983a2354"
        : "0x3419a1c09eb2567f6552ee7a8ecffd64155cffe0f1796e6e61ec088d740c1356",
    hashType: "type",
  }),
};

const HASH_TYPE_BYTE: Record<number, LockScript["hashType"]> = {
  0: "data",
  1: "type",
  2: "data1",
  4: "data2",
};

/**
 * Decode a CKB address into its lock script, verifying the checksum and that
 * the address belongs to `network`.
 */
export function addressToLockScript(
  address: string,
  network: Network,
): LockScript {
  if (typeof address !== "string" || address.length < 8 || address.length > 1024) {
    throw new TillError("INVALID_FIELD", "Address is not a well-formed string.");
  }
  const lower = address.toLowerCase();
  if (address !== lower && address !== address.toUpperCase()) {
    throw new TillError("INVALID_FIELD", "Address mixes upper and lower case.");
  }
  const sep = lower.lastIndexOf("1");
  if (sep < 1) {
    throw new TillError("INVALID_FIELD", "Address has no hrp separator.");
  }
  const hrp = lower.slice(0, sep);
  if (hrp !== "ckb" && hrp !== "ckt") {
    throw new TillError("INVALID_FIELD", `Unknown address prefix "${hrp}".`);
  }
  if (hrp !== network) {
    throw new TillError(
      "NETWORK_MISMATCH",
      `This address belongs to ${hrp === "ckb" ? "mainnet" : "testnet"}, not the invoice's network.`,
    );
  }
  const body = lower.slice(sep + 1);
  if (body.length < 6) {
    throw new TillError("INVALID_FIELD", "Address is too short.");
  }
  const values: number[] = [];
  for (const ch of body) {
    const v = CHARSET.indexOf(ch);
    if (v === -1) {
      throw new TillError("INVALID_FIELD", "Address contains invalid characters.");
    }
    values.push(v);
  }
  const checksum = polymod([...hrpExpand(hrp), ...values]);
  const encoding =
    checksum === BECH32M_CONST
      ? "bech32m"
      : checksum === BECH32_CONST
        ? "bech32"
        : undefined;
  if (encoding === undefined) {
    throw new TillError(
      "INVALID_FIELD",
      "Address checksum does not verify — it has likely been mistyped.",
    );
  }
  const payload = fiveToEight(values.slice(0, -6));
  if (payload.length === 0) {
    throw new TillError("INVALID_FIELD", "Address carries no payload.");
  }
  const formatType = payload[0]!;

  if (formatType === 0x00) {
    if (encoding !== "bech32m") {
      throw new TillError(
        "INVALID_FIELD",
        "Full-format addresses must use bech32m; this one does not.",
      );
    }
    if (payload.length < 1 + 32 + 1) {
      throw new TillError("INVALID_FIELD", "Full-format address is truncated.");
    }
    const hashType = HASH_TYPE_BYTE[payload[33]!];
    if (hashType === undefined) {
      throw new TillError(
        "INVALID_FIELD",
        `Address carries an unknown hash type byte ${payload[33]}.`,
      );
    }
    return {
      codeHash: bytesToHex(payload.subarray(1, 33)),
      hashType,
      args: bytesToHex(payload.subarray(34)),
    };
  }

  if (formatType === 0x01) {
    if (encoding !== "bech32") {
      throw new TillError("INVALID_FIELD", "Short-format addresses must use bech32.");
    }
    if (payload.length !== 22) {
      throw new TillError(
        "INVALID_FIELD",
        "Short-format address must carry exactly a 20-byte hash.",
      );
    }
    const entry = SHORT_INDEX[payload[1]!];
    if (entry === undefined) {
      throw new TillError(
        "INVALID_FIELD",
        `Short-format address uses unknown code hash index ${payload[1]}.`,
      );
    }
    return { ...entry(network), args: bytesToHex(payload.subarray(2)) };
  }

  throw new TillError(
    "INVALID_FIELD",
    `Address format 0x${formatType.toString(16).padStart(2, "0")} is deprecated and not supported. Ask for a current (full-format) address.`,
  );
}

/** Case-insensitive structural equality of scripts. */
export function scriptEquals(
  a: { codeHash: string; hashType: string; args: string },
  b: { codeHash: string; hashType: string; args: string },
): boolean {
  return (
    a.codeHash.toLowerCase() === b.codeHash.toLowerCase() &&
    a.hashType === b.hashType &&
    a.args.toLowerCase() === b.args.toLowerCase()
  );
}
