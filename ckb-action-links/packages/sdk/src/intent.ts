/**
 * The v1 intent schema.
 *
 * An intent is the complete, self-contained description of a transaction that a
 * link carries. It is attacker-controlled data: everything here is validated in
 * validate.ts before any of it reaches a transaction builder or the DOM.
 */

/** Protocol version carried in the link prefix (`v1.<payload>`). */
export const PROTOCOL_VERSION = 1;

/** CKB address prefix, which doubles as the network discriminator. */
export type Network = "ckb" | "ckt";

export const NETWORKS: readonly Network[] = ["ckb", "ckt"];

/** Human label for a network, for display only. */
export const networkName = (n: Network): string =>
  n === "ckb" ? "Mainnet" : "Testnet";

/** Fields shared by every action type. */
interface BaseIntent {
  /** Schema version. Always 1 in this release. */
  v: typeof PROTOCOL_VERSION;
  /** Network this link is valid on. Enforced against the connected wallet. */
  network: Network;
  /** Short display label, e.g. "Coffee". Rendered as text, never as markup. */
  label?: string;
  /** Longer free-text note. Rendered as text, never as markup. */
  note?: string;
  /** Unix seconds after which the link refuses to build. */
  expiry?: number;
}

/** Send a fixed amount of CKB to an address. */
export interface TransferIntent extends BaseIntent {
  action: "transfer";
  /** Recipient address. Must carry the same prefix as `network`. */
  to: string;
  /** Decimal CKB, as a string. Never a JSON number — floats lose precision. */
  amount: string;
}

export type ActionIntent = TransferIntent;

export type ActionType = ActionIntent["action"];

/**
 * The action registry. Adding an action means adding its name here, its
 * interface above, its field spec in validate.ts, and its builder in build.ts.
 * A payload naming an action absent from this list is rejected outright.
 */
export const KNOWN_ACTIONS = ["transfer"] as const satisfies readonly ActionType[];

/** Limits. Applied before parsing where possible, and again during validation. */
export const LIMITS = {
  /** Encoded payload ceiling, checked before any decoding work is done. */
  maxPayloadChars: 4096,
  maxLabelChars: 64,
  maxNoteChars: 256,
  /** Bech32 address bounds — a loose structural gate, not a checksum check. */
  minAddressChars: 40,
  maxAddressChars: 1023,
  /** Largest accepted whole-CKB part; well above total supply. */
  maxAmountIntegerDigits: 18,
  maxAmountDecimals: 8,
} as const;

/** Shannons per CKB. */
export const SHANNONS_PER_CKB = 100_000_000n;
