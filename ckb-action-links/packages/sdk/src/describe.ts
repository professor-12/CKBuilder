/**
 * A wallet-free reading of what a link *claims*.
 *
 * This exists because there is a real gap in the flow: before a wallet is
 * connected there is no transaction, so there is nothing SEC-1 can derive a
 * preview from — yet the page still has to show the visitor something, and
 * `/inspect` has to work for someone who has no intention of connecting at all.
 *
 * The danger is that a description like this quietly becomes the preview. It
 * must not. Everything below is read from attacker-controlled JSON and is
 * therefore a *claim*, not a fact about any transaction. It carries no fee, no
 * total, and no signing affordance, and the type is named to keep that
 * distinction visible at every call site. `ActionSummary` from build.ts is the
 * only thing that may sit next to a sign button.
 */

import {
  networkName,
  type ActionIntent,
  type ActionType,
  type Network,
} from "./intent.ts";
import {
  formatShannonsToCkb,
  secondsUntilExpiry,
  totalOfPayments,
  warnsBelowTypicalMinimum,
} from "./validate.ts";

/** The bounds a payer-priced link places on the figure the payer chooses. */
export interface ClaimedBounds {
  min?: string;
  max?: string;
  suggested?: string;
}

/** One recipient a link names, with the amount claimed for it. */
export interface ClaimedRecipient {
  /** Display in full — never truncated. */
  address: string;
  /** The amount claimed for this recipient, or null when the payer chooses. */
  amount: string | null;
  /**
   * True when this amount clears the floor every lock must clear but not the
   * one a standard address needs, so the build may still refuse it. A warning
   * about a script that has not been resolved, never a refusal.
   */
  belowTypicalMinimum: boolean;
}

export interface IntentClaim {
  action: ActionType;
  network: Network;
  /** "Mainnet" or "Testnet", for display. */
  networkLabel: string;
  /** Whether real funds are at stake. */
  isMainnet: boolean;
  /** A short, first-person-neutral statement of what the link asks for. */
  headline: string;
  /**
   * Every address the link names, in the order it names them. A list rather
   * than one address because a `split` names several, and a reader has to check
   * all of them.
   */
  recipients: ClaimedRecipient[];
  /**
   * The total the link fixes, or null when the payer chooses it. For a split
   * this is the sum of its legs — still only what the link *claims*, with no
   * fee in it, because no transaction exists yet.
   */
  amount: string | null;
  /** Present only for payer-priced actions. */
  bounds: ClaimedBounds | null;
  /** Unix seconds, or null when the link never expires. */
  expiresAt: number | null;
  /** Seconds remaining, or null when the link never expires. */
  secondsRemaining: number | null;
  expired: boolean;
  /** Attacker-controlled. Render as text, never as markup. */
  label?: string;
  note?: string;
}

/**
 * Describe an already-validated intent.
 *
 * Takes a validated `ActionIntent` rather than raw input on purpose: anything
 * that reaches here has already been through the fail-closed path, so this
 * function has no rejection of its own to make and cannot become a second,
 * laxer entry point into the schema.
 */
export function describeIntent(
  intent: ActionIntent,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): IntentClaim {
  const remaining = secondsUntilExpiry(intent, nowSeconds);

  const common = {
    action: intent.action,
    network: intent.network,
    networkLabel: networkName(intent.network),
    isMainnet: intent.network === "ckb",
    expiresAt: intent.expiry ?? null,
    secondsRemaining: remaining,
    expired: remaining === 0 && intent.expiry !== undefined,
    ...(intent.label !== undefined ? { label: intent.label } : {}),
    ...(intent.note !== undefined ? { note: intent.note } : {}),
  };

  switch (intent.action) {
    case "transfer":
      return {
        ...common,
        headline: `Send ${intent.amount} CKB`,
        recipients: [
          {
            address: intent.to,
            amount: intent.amount,
            belowTypicalMinimum: warnsBelowTypicalMinimum(intent.amount),
          },
        ],
        amount: intent.amount,
        bounds: null,
      };
    case "request": {
      const bounds: ClaimedBounds = {
        ...(intent.min !== undefined ? { min: intent.min } : {}),
        ...(intent.max !== undefined ? { max: intent.max } : {}),
        ...(intent.suggested !== undefined ? { suggested: intent.suggested } : {}),
      };
      return {
        ...common,
        headline: describeRange(bounds),
        recipients: [{ address: intent.to, amount: null, belowTypicalMinimum: false }],
        amount: null,
        bounds,
      };
    }
    case "split": {
      const total = formatShannonsToCkb(totalOfPayments(intent.payments));
      return {
        ...common,
        headline: `Send ${total} CKB to ${intent.payments.length} recipients`,
        recipients: intent.payments.map((payment) => ({
          address: payment.to,
          amount: payment.amount,
          belowTypicalMinimum: warnsBelowTypicalMinimum(payment.amount),
        })),
        amount: total,
        bounds: null,
      };
    }
  }
}

/** Phrase a request's bounds without implying the payer must pay anything. */
function describeRange(bounds: ClaimedBounds): string {
  const { min, max } = bounds;
  if (min !== undefined && max !== undefined) {
    return min === max
      ? `Send exactly ${min} CKB`
      : `Send between ${min} and ${max} CKB`;
  }
  if (min !== undefined) return `Send at least ${min} CKB`;
  if (max !== undefined) return `Send up to ${max} CKB`;
  return "Send an amount you choose";
}

/** Render a remaining-seconds count as a short, non-ticking phrase. */
export function formatRemaining(seconds: number): string {
  if (seconds <= 0) return "expired";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3_600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) {
    const hours = Math.floor(seconds / 3_600);
    const minutes = Math.floor((seconds % 3_600) / 60);
    return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  return `${Math.floor(seconds / 86_400)}d`;
}
