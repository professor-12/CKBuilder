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
  ABSOLUTE_MIN_CELL_CKB,
  KNOWN_ACTIONS,
  LIMITS,
  NETWORKS,
  PROTOCOL_VERSION,
  SHANNONS_PER_CKB,
  TYPICAL_MIN_CELL_CKB,
  type ActionIntent,
  type Network,
  type RequestIntent,
  type SplitPayment,
} from "./intent.ts";

/** Allowed keys per action, so unknown keys can be rejected precisely. */
const FIELD_SPEC: Record<(typeof KNOWN_ACTIONS)[number], readonly string[]> = {
  transfer: ["v", "network", "action", "to", "amount", "label", "note", "expiry"],
  request: [
    "v",
    "network",
    "action",
    "to",
    "min",
    "max",
    "suggested",
    "label",
    "note",
    "expiry",
  ],
  split: ["v", "network", "action", "payments", "label", "note", "expiry"],
};

/** Allowed keys inside one leg of a split. Same rule, one level down. */
const PAYMENT_FIELDS: readonly string[] = ["to", "amount"];

/** Absolute cell floor, in shannons. */
const ABSOLUTE_MIN_SHANNONS = ABSOLUTE_MIN_CELL_CKB * SHANNONS_PER_CKB;

/** Standard-lock cell floor, in shannons. */
const TYPICAL_MIN_SHANNONS = TYPICAL_MIN_CELL_CKB * SHANNONS_PER_CKB;

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

function checkAmount(value: unknown, field = "amount"): string {
  if (typeof value !== "string") {
    throw new ActionLinkError(
      "INVALID_FIELD",
      `The ${field} in this link is not in a valid format.`,
      `expected decimal string, got ${typeof value}`,
    );
  }
  if (!AMOUNT_PATTERN.test(value)) {
    throw new ActionLinkError(
      "INVALID_FIELD",
      `The ${field} in this link is not a valid CKB amount.`,
      `${field}=${JSON.stringify(value)}`,
    );
  }
  if (parseAmountToShannons(value) <= 0n) {
    throw new ActionLinkError("INVALID_FIELD", `This link's ${field} is zero.`);
  }
  return value;
}

/**
 * Refuse an amount no cell could ever hold.
 *
 * A cell pays for its own storage, so a transfer of 5 CKB is not merely
 * unusual — it cannot be constructed under any lock. That used to surface only
 * at build time, from `occupiedSize`, which meant a link asking for it could be
 * created, shared and QR-encoded, and would then be refused for every single
 * person who opened it.
 *
 * Only the absolute floor is enforced here. The figure that matters for a real
 * address is higher, but it depends on the recipient's lock args, and this
 * layer has no client to resolve those with — so anything between the two is
 * `warnsBelowTypicalMinimum`'s business, not a refusal.
 */
function checkMinimumCapacity(amount: string, field = "amount"): void {
  if (parseAmountToShannons(amount) < ABSOLUTE_MIN_SHANNONS) {
    throw new ActionLinkError(
      "BELOW_MIN_CAPACITY",
      `This link's ${field} is ${amount} CKB, but a cell must hold at least ` +
        `${ABSOLUTE_MIN_CELL_CKB} CKB to pay for its own storage.`,
      `${amount} < ${ABSOLUTE_MIN_CELL_CKB}`,
    );
  }
}

/**
 * True when an amount clears the absolute floor but not the one a standard
 * address needs. Not a refusal — the recipient's lock might genuinely be
 * smaller — but worth saying out loud before a link is shared.
 */
export function warnsBelowTypicalMinimum(amount: string): boolean {
  const shannons = parseAmountToShannons(amount);
  return shannons >= ABSOLUTE_MIN_SHANNONS && shannons < TYPICAL_MIN_SHANNONS;
}

/**
 * A request's bounds have to describe a range a payer can actually satisfy.
 * An inverted or unsatisfiable range is rejected at decode time rather than
 * leaving the payer to discover it by having every figure they type refused.
 */
function checkBounds(intent: RequestIntent): void {
  const min = intent.min !== undefined ? parseAmountToShannons(intent.min) : undefined;
  const max = intent.max !== undefined ? parseAmountToShannons(intent.max) : undefined;

  if (min !== undefined && max !== undefined && min > max) {
    throw new ActionLinkError(
      "INVALID_FIELD",
      "This link asks for a minimum larger than its maximum, so no amount could satisfy it.",
      `min=${intent.min}, max=${intent.max}`,
    );
  }

  // The same satisfiability question the check above asks, one level deeper. A
  // ceiling under the cell floor leaves a range that is well-formed and still
  // contains no figure anyone could sign.
  if (max !== undefined && max < ABSOLUTE_MIN_SHANNONS) {
    throw new ActionLinkError(
      "INVALID_FIELD",
      `This link accepts at most ${intent.max} CKB, but a cell must hold at least ` +
        `${ABSOLUTE_MIN_CELL_CKB} CKB, so no amount could satisfy it.`,
      `max=${intent.max} < ${ABSOLUTE_MIN_CELL_CKB}`,
    );
  }
  if (intent.suggested === undefined) return;

  const suggested = parseAmountToShannons(intent.suggested);
  if ((min !== undefined && suggested < min) || (max !== undefined && suggested > max)) {
    throw new ActionLinkError(
      "INVALID_FIELD",
      "This link suggests an amount outside its own limits.",
      `suggested=${intent.suggested}, min=${intent.min}, max=${intent.max}`,
    );
  }
}

/**
 * Validate the recipient list of a split.
 *
 * Every leg gets exactly the treatment a single `transfer` gets — same address
 * check, same amount check, same cell floor — because a split is not a weaker
 * transfer, it is several of them.
 */
function checkPayments(value: unknown, network: Network): SplitPayment[] {
  if (!Array.isArray(value)) {
    throw new ActionLinkError(
      "INVALID_FIELD",
      "This link does not contain a valid list of recipients.",
      `expected array, got ${typeof value}`,
    );
  }
  if (value.length < LIMITS.minPayments) {
    throw new ActionLinkError(
      "INVALID_FIELD",
      `A split needs at least ${LIMITS.minPayments} recipients.`,
      `${value.length} < ${LIMITS.minPayments}`,
    );
  }
  if (value.length > LIMITS.maxPayments) {
    throw new ActionLinkError(
      "INVALID_FIELD",
      `This link pays ${value.length} recipients, which is more than the ` +
        `${LIMITS.maxPayments} anyone can reasonably check before signing.`,
      `${value.length} > ${LIMITS.maxPayments}`,
    );
  }

  const seen = new Set<string>();
  return value.map((entry, index) => {
    if (!isPlainObject(entry)) {
      throw new ActionLinkError(
        "INVALID_FIELD",
        `Recipient ${index + 1} in this link is not valid.`,
        `expected object, got ${typeof entry}`,
      );
    }
    for (const key of Object.keys(entry)) {
      if (!PAYMENT_FIELDS.includes(key)) {
        throw new ActionLinkError(
          "UNKNOWN_FIELD",
          "This link contains information this app does not understand.",
          `unexpected field "${key}" on recipient ${index + 1}`,
        );
      }
    }

    const to = checkAddress(entry.to, network);
    const amount = checkAmount(entry.amount, `amount for recipient ${index + 1}`);
    checkMinimumCapacity(amount, `amount for recipient ${index + 1}`);

    // Two legs paying the same address are legal on chain, but in a link they
    // are either a mistake or an attempt to make a list harder to read to the
    // end. Either way, one address should appear once.
    if (seen.has(to)) {
      throw new ActionLinkError(
        "INVALID_FIELD",
        "This link pays the same address more than once.",
        `duplicate recipient at position ${index + 1}`,
      );
    }
    seen.add(to);

    return { to, amount };
  });
}

/** Total of a split, in shannons. */
export function totalOfPayments(payments: readonly SplitPayment[]): bigint {
  return payments.reduce((sum, p) => sum + parseAmountToShannons(p.amount), 0n);
}

/**
 * Validate an amount the payer typed for a `request`.
 *
 * This is the one number in the system that does not come from the link, so it
 * gets the same treatment as one that does: same format rules, same string
 * arithmetic, and the creator's bounds enforced on top.
 */
export function validatePayerAmount(intent: RequestIntent, amount: unknown): string {
  const checked = checkAmount(amount, "amount");
  const shannons = parseAmountToShannons(checked);

  // Said here rather than at build time, so the payer learns it while typing
  // instead of after pressing a button that looked available.
  if (shannons < ABSOLUTE_MIN_SHANNONS) {
    throw new ActionLinkError(
      "BELOW_MIN_CAPACITY",
      `A cell must hold at least ${ABSOLUTE_MIN_CELL_CKB} CKB to pay for its own storage, ` +
        `so ${checked} CKB cannot be sent.`,
      `amount=${checked} < ${ABSOLUTE_MIN_CELL_CKB}`,
    );
  }

  if (intent.min !== undefined && shannons < parseAmountToShannons(intent.min)) {
    throw new ActionLinkError(
      "AMOUNT_OUT_OF_RANGE",
      `This link asks for at least ${intent.min} CKB.`,
      `amount=${checked}, min=${intent.min}`,
    );
  }
  if (intent.max !== undefined && shannons > parseAmountToShannons(intent.max)) {
    throw new ActionLinkError(
      "AMOUNT_OUT_OF_RANGE",
      `This link accepts at most ${intent.max} CKB.`,
      `amount=${checked}, max=${intent.max}`,
    );
  }
  return checked;
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
    case "transfer": {
      const amount = checkAmount(value.amount);
      checkMinimumCapacity(amount);
      return {
        ...common,
        action: "transfer",
        to: checkAddress(value.to, network),
        amount,
      };
    }
    case "split":
      return {
        ...common,
        action: "split",
        payments: checkPayments(value.payments, network),
      };
    case "request": {
      const request: ActionIntent = {
        ...common,
        action: "request",
        to: checkAddress(value.to, network),
        ...(value.min !== undefined ? { min: checkAmount(value.min, "minimum") } : {}),
        ...(value.max !== undefined ? { max: checkAmount(value.max, "maximum") } : {}),
        ...(value.suggested !== undefined
          ? { suggested: checkAmount(value.suggested, "suggested amount") }
          : {}),
      };
      checkBounds(request);
      return request;
    }
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

/**
 * Seconds left before the link expires, or null when it never does.
 * Clamped at zero so a caller counting down never renders a negative figure.
 */
export function secondsUntilExpiry(intent: ActionIntent, nowSeconds: number): number | null {
  if (intent.expiry === undefined) return null;
  return Math.max(0, intent.expiry - nowSeconds);
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
