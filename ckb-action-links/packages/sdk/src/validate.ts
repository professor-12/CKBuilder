/**
 * Strict, fail-closed validation of a decoded intent.
 *
 * Two principles drive everything here:
 *
 *  - Unknown fields are rejected, not ignored. A link carrying a field this
 *    version does not understand may be relying on it for meaning we would not
 *    honour, and honouring it partially is worse than refusing.
 *  - Nothing is coerced. A number where a string was specified is an error, not
 *    something to `String()` and move on with.
 *
 * Address checksums are NOT verified here — that needs a client and happens in
 * build.ts. This layer applies structural gates only.
 */

import { ActionLinkError } from "./errors.ts";
import {
  KNOWN_ACTIONS,
  LIMITS,
  NETWORKS,
  PROTOCOL_VERSION,
  SHANNONS_PER_CKB,
  type ActionIntent,
  type Network,
} from "./intent.ts";

/** Allowed keys per action, so unknown keys can be rejected precisely. */
const FIELD_SPEC: Record<(typeof KNOWN_ACTIONS)[number], readonly string[]> = {
  transfer: ["v", "network", "action", "to", "amount", "label", "note", "expiry"],
};

/** Bech32 data-part charset. Excludes the visually ambiguous 1, b, i and o. */
const BECH32_CHARS = /^[qpzry9x8gf2tvdw0s3jn54khce6mua7l]+$/;

/** Decimal CKB: no leading zeros, no exponent, no sign, at most 8 decimals. */
const AMOUNT_PATTERN = new RegExp(
  `^(0|[1-9][0-9]{0,${LIMITS.maxAmountIntegerDigits - 1}})` +
    `(\\.[0-9]{1,${LIMITS.maxAmountDecimals}})?$`,
);

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Reject strings that cannot be safely rendered as a single line of text.
 * Control characters, and the bidirectional overrides that let an attacker
 * make "pay alice" render over a payload that says something else.
 */
const UNSAFE_CHARS = new RegExp(
  [
    "[\\u0000-\\u001F\\u007F]", // C0 controls and DEL
    "[\\u200B-\\u200F]", // zero-width characters and LTR/RTL marks
    "[\\u202A-\\u202E]", // bidi embedding and override
    "[\\u2066-\\u2069]", // bidi isolates
  ].join("|"),
);

const hasUnsafeChars = (s: string): boolean => UNSAFE_CHARS.test(s);

function checkDisplayString(value: unknown, field: string, max: number): string {
  if (typeof value !== "string") {
    throw new ActionLinkError(
      "INVALID_FIELD",
      `The "${field}" in this link is not valid text.`,
      `expected string, got ${typeof value}`,
    );
  }
  if (value.length > max) {
    throw new ActionLinkError(
      "INVALID_FIELD",
      `The "${field}" in this link is too long.`,
      `${value.length} > ${max}`,
    );
  }
  if (hasUnsafeChars(value)) {
    throw new ActionLinkError(
      "INVALID_FIELD",
      `The "${field}" in this link contains characters that could disguise what it says.`,
    );
  }
  return value;
}

function checkNetwork(value: unknown): Network {
  if (typeof value !== "string" || !NETWORKS.includes(value as Network)) {
    throw new ActionLinkError(
      "INVALID_FIELD",
      "This link does not say which CKB network it is for.",
      `network=${JSON.stringify(value)}`,
    );
  }
  return value as Network;
}

function checkAddress(value: unknown, network: Network): string {
  if (typeof value !== "string") {
    throw new ActionLinkError("INVALID_ADDRESS", "This link has no valid recipient address.");
  }
  if (value.length < LIMITS.minAddressChars || value.length > LIMITS.maxAddressChars) {
    throw new ActionLinkError(
      "INVALID_ADDRESS",
      "The recipient address in this link is not a valid CKB address.",
      `length ${value.length}`,
    );
  }
  const prefix = value.slice(0, 4);
  if (prefix !== `${network}1`) {
    // A mainnet address inside a testnet link (or the reverse) is never a typo
    // worth guessing at. Refuse.
    throw new ActionLinkError(
      "NETWORK_MISMATCH",
      "This link's recipient address does not match the network the link declares.",
      `address prefix ${prefix}, network ${network}`,
    );
  }
  if (!BECH32_CHARS.test(value.slice(4))) {
    throw new ActionLinkError(
      "INVALID_ADDRESS",
      "The recipient address in this link is not a valid CKB address.",
      "invalid bech32 characters",
    );
  }
  return value;
}

function checkAmount(value: unknown): string {
  if (typeof value !== "string") {
    throw new ActionLinkError(
      "INVALID_FIELD",
      "The amount in this link is not in a valid format.",
      `expected decimal string, got ${typeof value}`,
    );
  }
  if (!AMOUNT_PATTERN.test(value)) {
    throw new ActionLinkError(
      "INVALID_FIELD",
      "The amount in this link is not a valid CKB amount.",
      `amount=${JSON.stringify(value)}`,
    );
  }
  if (parseAmountToShannons(value) <= 0n) {
    throw new ActionLinkError("INVALID_FIELD", "This link asks for an amount of zero.");
  }
  return value;
}

function checkExpiry(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new ActionLinkError(
      "INVALID_FIELD",
      "The expiry time in this link is not valid.",
      `expiry=${JSON.stringify(value)}`,
    );
  }
  return value;
}

/**
 * Convert a validated decimal CKB string to shannons.
 * String arithmetic throughout — no float ever touches a monetary value.
 */
export function parseAmountToShannons(amount: string): bigint {
  const [whole = "0", fraction = ""] = amount.split(".");
  const padded = fraction.padEnd(LIMITS.maxAmountDecimals, "0");
  return BigInt(whole) * SHANNONS_PER_CKB + BigInt(padded || "0");
}

/** Format shannons back to a decimal CKB string, trimming trailing zeros. */
export function formatShannonsToCkb(shannons: bigint): string {
  const negative = shannons < 0n;
  const abs = negative ? -shannons : shannons;
  const whole = abs / SHANNONS_PER_CKB;
  const fraction = (abs % SHANNONS_PER_CKB)
    .toString()
    .padStart(LIMITS.maxAmountDecimals, "0")
    .replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

/**
 * Validate an arbitrary decoded value as an ActionIntent.
 * Throws ActionLinkError on any deviation; returns a typed intent on success.
 */
export function validateIntent(value: unknown): ActionIntent {
  if (!isPlainObject(value)) {
    throw new ActionLinkError("MALFORMED_PAYLOAD", "This link does not contain a valid action.");
  }

  if (value.v !== PROTOCOL_VERSION) {
    throw new ActionLinkError(
      "UNSUPPORTED_VERSION",
      "This link was made for a newer version of CKB Action Links.",
      `v=${JSON.stringify(value.v)}`,
    );
  }

  const action = value.action;
  if (typeof action !== "string" || !(KNOWN_ACTIONS as readonly string[]).includes(action)) {
    throw new ActionLinkError(
      "UNKNOWN_ACTION",
      "This link asks for an action this app does not know how to perform.",
      `action=${JSON.stringify(action)}`,
    );
  }

  const allowed = FIELD_SPEC[action as (typeof KNOWN_ACTIONS)[number]];
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      throw new ActionLinkError(
        "UNKNOWN_FIELD",
        "This link contains information this app does not understand.",
        `unexpected field "${key}"`,
      );
    }
  }

  const network = checkNetwork(value.network);

  const common = {
    v: PROTOCOL_VERSION as typeof PROTOCOL_VERSION,
    network,
    ...(value.label !== undefined
      ? { label: checkDisplayString(value.label, "label", LIMITS.maxLabelChars) }
      : {}),
    ...(value.note !== undefined
      ? { note: checkDisplayString(value.note, "note", LIMITS.maxNoteChars) }
      : {}),
    ...(value.expiry !== undefined ? { expiry: checkExpiry(value.expiry) } : {}),
  };

  switch (action) {
    case "transfer":
      return {
        ...common,
        action: "transfer",
        to: checkAddress(value.to, network),
        amount: checkAmount(value.amount),
      };
    default:
      // Unreachable while KNOWN_ACTIONS and this switch agree; kept so that
      // adding an action without a branch fails loudly instead of silently.
      throw new ActionLinkError(
        "UNKNOWN_ACTION",
        "This link asks for an action this app does not know how to perform.",
      );
  }
}

/** True when the intent carries an expiry that has already passed. */
export function isExpired(intent: ActionIntent, nowSeconds: number): boolean {
  return intent.expiry !== undefined && nowSeconds > intent.expiry;
}

/** Throws EXPIRED if the link is past its expiry. */
export function assertNotExpired(intent: ActionIntent, nowSeconds: number): void {
  if (isExpired(intent, nowSeconds)) {
    throw new ActionLinkError(
      "EXPIRED",
      "This link has expired and can no longer be used.",
      `expiry=${intent.expiry}, now=${nowSeconds}`,
    );
  }
}
