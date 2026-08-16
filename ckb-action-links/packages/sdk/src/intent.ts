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

/**
 * Ask for a payment without fixing the amount — the payer decides.
 *
 * The link cannot name a figure the payer has not agreed to, which makes this
 * the safer half of the pair: a tip jar or donation link carries no number the
 * signer did not type themselves. Bounds are advisory limits set by the
 * creator, and are enforced before a transaction is built.
 */
export interface RequestIntent extends BaseIntent {
  action: "request";
  /** Recipient address. Must carry the same prefix as `network`. */
  to: string;
  /** Optional lower bound, decimal CKB string. */
  min?: string;
  /** Optional upper bound, decimal CKB string. */
  max?: string;
  /** Optional pre-filled figure. The payer may always change it. */
  suggested?: string;
}

/** One leg of a split: an address and the amount it receives. */
export interface SplitPayment {
  /** Recipient address. Must carry the same prefix as the intent's `network`. */
  to: string;
  /** Decimal CKB, as a string. */
  amount: string;
}

/**
 * Pay several recipients from one link, each a fixed amount.
 *
 * Kept deliberately small — see `LIMITS.maxPayments`. The payer has to check
 * every address in the list before signing, so a link carrying more recipients
 * than a person will actually read is not a feature, it is a place to hide one.
 */
export interface SplitIntent extends BaseIntent {
  action: "split";
  /** Two or more recipients. One recipient is a `transfer`, not a split. */
  payments: SplitPayment[];
}

export type ActionIntent = TransferIntent | RequestIntent | SplitIntent;

export type ActionType = ActionIntent["action"];

/**
 * The action registry. Adding an action means adding its name here, its
 * interface above, its field spec in validate.ts, and its builder in build.ts.
 * A payload naming an action absent from this list is rejected outright.
 */
export const KNOWN_ACTIONS = [
  "transfer",
  "request",
  "split",
] as const satisfies readonly ActionType[];

/** True when the payer supplies the amount rather than the link. */
export const isPayerPriced = (action: ActionType): boolean => action === "request";

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
  /** A split with one leg is a transfer; two ways to say one thing is one too many. */
  minPayments: 2,
  /**
   * A ceiling on reviewability rather than on the format. Every address in a
   * split has to be checked by the person signing, and a list longer than this
   * stops being something anyone reads to the end.
   */
  maxPayments: 8,
} as const;

/** Shannons per CKB. */
export const SHANNONS_PER_CKB = 100_000_000n;

/*
 * Cell capacity floors.
 *
 * A CKB cell pays for its own storage, so it cannot hold less capacity than it
 * occupies bytes. Its occupied size is 8 bytes of capacity field plus the lock
 * script — 32 bytes of code hash, 1 of hash type, and however many bytes of
 * args the lock takes.
 *
 * That gives two useful numbers rather than one. With empty args no cell can
 * ever be smaller than 41 bytes, which makes 41 CKB a floor that holds for any
 * lock that could exist and is therefore safe to *refuse* below without knowing
 * the recipient's lock. The standard secp256k1 lock carries 20 bytes of args
 * and so needs 61, which covers virtually every real address but is a guess
 * about a script we have not resolved — so it is only ever a *warning*.
 *
 * The exact figure comes from the built transaction's own `occupiedSize` in
 * build.ts. These two exist for everything that happens before a client is
 * available: creating a link, and reading one.
 */

/** Below this, no cell can exist under any lock. Safe to refuse without a client. */
export const ABSOLUTE_MIN_CELL_CKB = 41n;

/** What a standard secp256k1 address needs. Warn below this, never refuse. */
export const TYPICAL_MIN_CELL_CKB = 61n;
