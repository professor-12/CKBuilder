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
import { SHANNONS_PER_CKB, type ActionIntent, type Network } from "./intent.ts";
import { assertNotExpired, formatShannonsToCkb, parseAmountToShannons } from "./validate.ts";

/** Default fee rate in shannons per KB, matching the CCC examples. */
export const DEFAULT_FEE_RATE = 1000n;

/** A single value leaving the signer's control, as read back off the built tx. */
export interface SummaryOutput {
  /** Address derived from the output's actual lock script. */
  address: string;
  /** Amount in decimal CKB. */
  amount: string;
  amountShannons: bigint;
}

/**
 * What this transaction does, derived entirely from the built transaction.
 * Everything a preview displays comes from here.
 */
export interface ActionSummary {
  action: ActionIntent["action"];
  network: Network;
  /** Outputs that leave the signer's control. */
  outputs: SummaryOutput[];
  /** Network fee in decimal CKB. */
  fee: string;
  feeShannons: bigint;
  /**
   * Everything leaving the wallet: outgoing outputs plus fee. This is the
   * number a person actually cares about, and the one a naive UI gets wrong
   * (SEC-3).
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
 * An output counts as "leaving the wallet" when its lock is not one of the
 * signer's own locks — which correctly excludes the change cell without having
 * to assume anything about where CCC placed it.
 */
async function summarise(
  tx: ccc.Transaction,
  intent: ActionIntent,
  signer: ccc.Signer,
): Promise<ActionSummary> {
  const client = signer.client;
  const ownLocks = (await signer.getAddressObjs()).map((address) => address.script);
  const isOwn = (lock: ccc.Script) => ownLocks.some((own) => own.eq(lock));

  const outputs: SummaryOutput[] = [];
  for (const output of tx.outputs) {
    if (isOwn(output.lock)) continue;
    outputs.push({
      address: ccc.Address.fromScript(output.lock, client).toString(),
      amount: formatShannonsToCkb(output.capacity),
      amountShannons: output.capacity,
    });
  }

  const feeShannons = await tx.getFee(client);
  const outgoing = outputs.reduce((sum, output) => sum + output.amountShannons, 0n);
  const totalDebitShannons = outgoing + feeShannons;

  return {
    action: intent.action,
    network: intent.network,
    outputs,
    fee: formatShannonsToCkb(feeShannons),
    feeShannons,
    totalDebit: formatShannonsToCkb(totalDebitShannons),
    totalDebitShannons,
    ...(intent.label !== undefined ? { label: intent.label } : {}),
    ...(intent.note !== undefined ? { note: intent.note } : {}),
  };
}

async function buildTransfer(
  intent: ActionIntent & { action: "transfer" },
  signer: ccc.Signer,
  feeRate: bigint,
): Promise<ccc.Transaction> {
  const client = signer.client;

  // Full checksum validation happens here — validate.ts only applies structural
  // gates because it has no client to resolve against.
  let recipient: ccc.Address;
  try {
    recipient = await ccc.Address.fromString(intent.to, client);
  } catch (cause) {
    throw new ActionLinkError(
      "INVALID_ADDRESS",
      "The recipient address in this link is not a valid CKB address.",
      cause instanceof Error ? cause.message : undefined,
    );
  }

  const capacity = parseAmountToShannons(intent.amount);
  const tx = ccc.Transaction.from({
    outputs: [{ lock: recipient.script, capacity }],
    outputsData: ["0x"],
  });

  // A cell must hold enough capacity to pay for its own storage. Below that the
  // node rejects the transaction, so catch it here with an explanation instead
  // of letting the wallet surface a raw RPC error after the user has signed.
  const minimum = BigInt(tx.outputs[0]!.occupiedSize) * SHANNONS_PER_CKB;
  if (capacity < minimum) {
    throw new ActionLinkError(
      "BELOW_MIN_CAPACITY",
      `This link asks to send ${intent.amount} CKB, but a cell for this recipient ` +
        `must hold at least ${formatShannonsToCkb(minimum)} CKB.`,
    );
  }

  await tx.completeInputsByCapacity(signer);
  await tx.completeFeeBy(signer, feeRate);
  return tx;
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

  switch (intent.action) {
    case "transfer": {
      const tx = await buildTransfer(intent, signer, feeRate);
      return { tx, summary: await summarise(tx, intent, signer) };
    }
    default: {
      // Exhaustiveness guard: adding an action without a branch fails here
      // rather than falling through to something that looks like it worked.
      const unreachable: never = intent.action;
      throw new ActionLinkError(
        "UNKNOWN_ACTION",
        "This link asks for an action this app does not know how to perform.",
        String(unreachable),
      );
    }
  }
}
