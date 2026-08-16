/**
 * Transaction building — the single entry point (SEC-1).
 *
 * The most dangerous bug this project can ship is preview/sign divergence:
 * rendering a summary from the intent JSON, then independently rebuilding a
 * transaction to sign. Any drift between those two code paths is a silent
 * theft, and it is invisible in testing because both halves look correct on
 * their own.
 *
 * So there is exactly one exported builder, it returns the transaction and its
 * summary together, and the summary is computed by walking the built
 * transaction's real outputs — never the intent. The UI renders `summary` and
 * signs `tx`. There is deliberately no API that hands back one without the
 * other, and no way for a caller to assemble a transaction itself.
 */

import { ccc } from "@ckb-ccc/core";

import { ActionLinkError } from "./errors.ts";
import {
  SHANNONS_PER_CKB,
  isPayerPriced,
  type ActionIntent,
  type ActionType,
  type Network,
  type RequestIntent,
} from "./intent.ts";
import {
  assertNotExpired,
  formatShannonsToCkb,
  parseAmountToShannons,
  validatePayerAmount,
} from "./validate.ts";

/** Default fee rate in shannons per KB, matching the CCC examples. */
export const DEFAULT_FEE_RATE = 1000n;

/** A single value moved by this transaction, as read back off the built tx. */
export interface SummaryOutput {
  /** Address derived from the output's actual lock script. */
  address: string;
  /** Amount in decimal CKB. */
  amount: string;
  amountShannons: bigint;
  /**
   * True when this output pays a lock the signer already controls. Such an
   * output still has to be shown — it is simply not a loss (SEC-3).
   */
  toSelf: boolean;
}

/**
 * What this transaction does, derived entirely from the built transaction.
 * Everything a preview displays comes from here.
 */
export interface ActionSummary {
  action: ActionType;
  network: Network;
  /**
   * The outputs this action was built to create, read back off the transaction
   * rather than off the intent. Each address comes from that output's own lock
   * script and each amount from its own capacity.
   *
   * This was a single `payment` until `split` arrived, and the singular was an
   * assumption rather than a decision — the accounting rule it enforced ("one
   * payment, everything else mine") happened to be expressible as one field
   * only because there had never been an action with two legs.
   */
  payments: SummaryOutput[];
  /** Sum of `payments`, in decimal CKB. Not the cost — see `totalDebit`. */
  paid: string;
  paidShannons: bigint;
  /** Network fee in decimal CKB. */
  fee: string;
  feeShannons: bigint;
  /** Capacity returning to the signer: change, plus a payment to themselves. */
  returned: string;
  returnedShannons: bigint;
  /**
   * Everything actually leaving the wallet — every input the transaction
   * spends, minus everything that comes back. This is the number a person
   * cares about, and the one a naive interface gets wrong (SEC-3).
   */
  totalDebit: string;
  totalDebitShannons: bigint;
  /** Attacker-controlled display text. Render as text, never as markup. */
  label?: string;
  note?: string;
}

export interface BuiltAction {
  tx: ccc.Transaction;
  summary: ActionSummary;
}

export interface BuildOptions {
  /** Shannons per KB. Defaults to DEFAULT_FEE_RATE. */
  feeRate?: bigint;
  /** Unix seconds used for the expiry check. Defaults to the current time. */
  nowSeconds?: number;
  /**
   * The payer's chosen amount, for actions that do not fix one. Required for
   * `request`, and refused for actions whose amount the link already states —
   * silently ignoring it would mean signing a figure nobody agreed to.
   */
  amount?: string;
}

/** A transaction plus the bookkeeping needed to summarise it honestly. */
interface Plan {
  tx: ccc.Transaction;
  /**
   * The outputs this action created, by index, with the lock each was built to
   * pay. summarise() cross-checks both rather than trusting either.
   */
  intended: { index: number; recipient: ccc.Script }[];
}

/** Map a CKB address prefix to our network discriminator. */
function networkOfClient(client: ccc.Client): Network {
  const prefix = client.addressPrefix;
  if (prefix !== "ckb" && prefix !== "ckt") {
    throw new ActionLinkError(
      "NETWORK_MISMATCH",
      "Your wallet is connected to a network this app does not recognise.",
      `addressPrefix=${prefix}`,
    );
  }
  return prefix;
}

/**
 * Refuse when the connected wallet is not on the network the link declares.
 * A hard block, never a warning — a mainnet signature on a testnet-intended
 * transfer spends real money (SEC-2).
 */
function assertNetworkMatches(intent: ActionIntent, signer: ccc.Signer): void {
  const walletNetwork = networkOfClient(signer.client);
  if (walletNetwork !== intent.network) {
    throw new ActionLinkError(
      "NETWORK_MISMATCH",
      `This link is for CKB ${intent.network === "ckb" ? "Mainnet" : "Testnet"}, ` +
        `but your wallet is connected to ${walletNetwork === "ckb" ? "Mainnet" : "Testnet"}.`,
    );
  }
}

/**
 * Derive the summary from the built transaction.
 *
 * Every figure here is read off `tx`. The intent contributes only the display
 * text and the action name — never an address and never an amount.
 *
 * Outputs are accounted for exhaustively rather than filtered. The old version
 * reported "everything whose lock is not mine", which quietly produced an empty
 * summary when someone paid an address they already controlled, and would have
 * hidden any extra output a future builder introduced. Now the payment output
 * is identified by position and confirmed by lock, every remaining output must
 * belong to the signer, and anything else is a refusal.
 */
async function summarise(
  plan: Plan,
  intent: ActionIntent,
  signer: ccc.Signer,
): Promise<ActionSummary> {
  const { tx, intended } = plan;
  const client = signer.client;
  const ownLocks = (await signer.getAddressObjs()).map((address) => address.script);
  const isOwn = (lock: ccc.Script) => ownLocks.some((own) => own.eq(lock));

  // Each intended output must still be the cell it was built as. Unreachable
  // unless CCC reorders outputs beneath us — but if it ever did, the summary
  // would describe different cells than the ones being paid, which is exactly
  // the divergence SEC-1 exists to prevent.
  const payments: SummaryOutput[] = intended.map(({ index, recipient }) => {
    const output = tx.outputs[index];
    if (!output || !output.lock.eq(recipient)) {
      throw new ActionLinkError(
        "UNACCOUNTED_OUTPUT",
        "This transaction could not be summarised safely, so it will not be offered for signing.",
        `output ${index} is not the recipient's cell`,
      );
    }
    return {
      address: ccc.Address.fromScript(output.lock, client).toString(),
      amount: formatShannonsToCkb(output.capacity),
      amountShannons: output.capacity,
      toSelf: isOwn(output.lock),
    };
  });

  const intendedIndices = new Set(intended.map((entry) => entry.index));

  let returnedShannons = 0n;
  for (const [index, output] of tx.outputs.entries()) {
    // Own outputs come back to the signer whether they are change or a leg of
    // the split that happens to pay an address they already control.
    if (isOwn(output.lock)) {
      returnedShannons += output.capacity;
      continue;
    }
    if (!intendedIndices.has(index)) {
      // An output paying someone who is neither the signer nor a recipient the
      // link named. Nothing in this SDK creates one, and a preview that did not
      // mention it would be a lie.
      throw new ActionLinkError(
        "UNACCOUNTED_OUTPUT",
        "This transaction contains a payment this app cannot explain, so it will not be offered for signing.",
        `unexpected output at index ${index}`,
      );
    }
  }

  // One resolve for both figures: the fee is what the inputs carry over the
  // outputs, and the debit is what the inputs carry over what comes back.
  const inputsCapacity = await tx.getInputsCapacity(client);
  const feeShannons = inputsCapacity - tx.getOutputsCapacity();
  const totalDebitShannons = inputsCapacity - returnedShannons;
  const paidShannons = payments.reduce((sum, p) => sum + p.amountShannons, 0n);

  return {
    action: intent.action,
    network: intent.network,
    payments,
    paid: formatShannonsToCkb(paidShannons),
    paidShannons,
    fee: formatShannonsToCkb(feeShannons),
    feeShannons,
    returned: formatShannonsToCkb(returnedShannons),
    returnedShannons,
    totalDebit: formatShannonsToCkb(totalDebitShannons),
    totalDebitShannons,
    ...(intent.label !== undefined ? { label: intent.label } : {}),
    ...(intent.note !== undefined ? { note: intent.note } : {}),
  };
}

/**
 * Build a transaction that creates one cell of `capacity` for `to`.
 *
 * Shared by every value-moving action, so `transfer` and `request` cannot drift
 * apart in how they collect inputs, price the fee, or enforce the cell minimum.
 */
async function planPayments(
  legs: readonly { to: string; amount: string }[],
  signer: ccc.Signer,
  feeRate: bigint,
): Promise<Plan> {
  const client = signer.client;

  // Full checksum validation happens here — validate.ts only applies structural
  // gates because it has no client to resolve against.
  const recipients = await Promise.all(
    legs.map(async (leg) => {
      try {
        return await ccc.Address.fromString(leg.to, client);
      } catch (cause) {
        throw new ActionLinkError(
          "INVALID_ADDRESS",
          legs.length > 1
            ? `A recipient address in this link is not a valid CKB address: ${leg.to}`
            : "The recipient address in this link is not a valid CKB address.",
          cause instanceof Error ? cause.message : undefined,
        );
      }
    }),
  );

  const tx = ccc.Transaction.from({
    outputs: recipients.map((recipient, i) => ({
      lock: recipient.script,
      capacity: parseAmountToShannons(legs[i]!.amount),
    })),
    outputsData: legs.map(() => "0x"),
  });

  /*
   * A cell must hold enough capacity to pay for its own storage, and CCC does
   * not refuse one that cannot — it silently raises the output to the minimum.
   *
   * That is a reasonable default for a wallet and a dangerous one here. Ask for
   * 1 CKB and the built transaction carries 61. The summary reads amounts off
   * the transaction rather than off the intent, deliberately, so it would then
   * report 61 CKB — accurately, for a payment nobody agreed to.
   *
   * The floor is therefore checked against what was *requested*, and the built
   * output is then compared against it, so a silent adjustment in any direction
   * is a refusal rather than something the preview inherits. The schema already
   * refuses anything under the floor that holds for every possible lock; this
   * is the exact figure for these specific recipients, and the only place the
   * true number can be known.
   */
  for (const [index, output] of tx.outputs.entries()) {
    const who = legs.length > 1 ? `recipient ${index + 1}` : "this recipient";
    const requested = parseAmountToShannons(legs[index]!.amount);
    const minimum = BigInt(output.occupiedSize) * SHANNONS_PER_CKB;

    if (requested < minimum) {
      throw new ActionLinkError(
        "BELOW_MIN_CAPACITY",
        `This would send ${legs[index]!.amount} CKB to ${who}, but their cell ` +
          `must hold at least ${formatShannonsToCkb(minimum)} CKB.`,
      );
    }
    if (output.capacity !== requested) {
      throw new ActionLinkError(
        "UNACCOUNTED_OUTPUT",
        "This transaction does not carry the amount this link asked for, so it " +
          "will not be offered for signing.",
        `output ${index}: requested ${requested}, built ${output.capacity}`,
      );
    }
  }

  await tx.completeInputsByCapacity(signer);
  await tx.completeFeeBy(signer, feeRate);

  // CCC appends its change cell after ours, so the intended outputs keep their
  // positions. summarise() re-checks that rather than trusting it.
  return {
    tx,
    intended: recipients.map((recipient, index) => ({ index, recipient: recipient.script })),
  };
}

/**
 * Resolve the amount for a payer-priced action.
 *
 * The figure comes from the payer, so it is validated exactly like one that
 * came from the link, and the creator's bounds are enforced on top.
 */
function payerAmountFor(intent: RequestIntent, supplied: string | undefined): string {
  if (supplied === undefined) {
    throw new ActionLinkError(
      "AMOUNT_REQUIRED",
      "This link asks you to choose an amount. Enter one to continue.",
    );
  }
  return validatePayerAmount(intent, supplied);
}

/**
 * Build the transaction for an intent and summarise it.
 *
 * @throws ActionLinkError for every rejection path, each carrying a
 * `userMessage` suitable for display.
 */
export async function buildAction(
  intent: ActionIntent,
  signer: ccc.Signer,
  options: BuildOptions = {},
): Promise<BuiltAction> {
  const feeRate = options.feeRate ?? DEFAULT_FEE_RATE;
  const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1000);

  assertNotExpired(intent, nowSeconds);
  assertNetworkMatches(intent, signer);

  // An amount handed to an action that already fixes its own is refused rather
  // than dropped. Ignoring it would build a transaction for a figure the caller
  // did not ask for while the caller believed otherwise.
  if (options.amount !== undefined && !isPayerPriced(intent.action)) {
    throw new ActionLinkError(
      "AMOUNT_NOT_ACCEPTED",
      "This link already states its amount, so it cannot be changed.",
      `action=${intent.action}`,
    );
  }

  switch (intent.action) {
    case "transfer": {
      const plan = await planPayments([{ to: intent.to, amount: intent.amount }], signer, feeRate);
      return { tx: plan.tx, summary: await summarise(plan, intent, signer) };
    }
    case "request": {
      const amount = payerAmountFor(intent, options.amount);
      const plan = await planPayments([{ to: intent.to, amount }], signer, feeRate);
      return { tx: plan.tx, summary: await summarise(plan, intent, signer) };
    }
    case "split": {
      const plan = await planPayments(intent.payments, signer, feeRate);
      return { tx: plan.tx, summary: await summarise(plan, intent, signer) };
    }
    default: {
      // Exhaustiveness guard: adding an action without a branch fails here
      // rather than falling through to something that looks like it worked.
      const unreachable: never = intent;
      throw new ActionLinkError(
        "UNKNOWN_ACTION",
        "This link asks for an action this app does not know how to perform.",
        String(unreachable),
      );
    }
  }
}
