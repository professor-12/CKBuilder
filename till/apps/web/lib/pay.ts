"use client";

/**
 * In-app payment building (CCC), under the Action Links discipline:
 *
 *  - SEC-1: the summary shown beside the sign button is derived from the
 *    built transaction's actual outputs, never from the invoice.
 *  - SEC-8: CCC raises a below-minimum output to the cell floor instead of
 *    refusing it; any difference between the built output and the requested
 *    figure — either direction — is a refusal, because the detector would
 *    never match an adjusted payment and the payer would lose the excess.
 *
 * Scope note: in-app signing covers CKB invoices. Token invoices settle
 * through the payer's own wallet (exact amount + address, both one tap to
 * copy); the detector verifies those identically. Building token transfers
 * in-page needs per-token cell-dep resolution that is not verifiable
 * end-to-end yet, and an unverified signing path is not a feature.
 */

import { ccc } from "@ckb-ccc/connector-react";
import {
  TillError,
  rawAmountOf,
  shannonsToCkb,
  type Invoice,
} from "@till/sdk";

export interface PaymentPlan {
  tx: ccc.Transaction;
  /** Every figure below is read back off the built transaction (SEC-1). */
  summary: {
    payAmountCkb: string;
    feeCkb: string;
    totalDebitCkb: string;
  };
}

export async function buildCkbPayment(
  invoice: Invoice,
  signer: ccc.Signer,
): Promise<PaymentPlan> {
  if (invoice.asset !== "ckb") {
    throw new TillError(
      "INVALID_FIELD",
      "In-app signing covers CKB invoices; pay token invoices from your wallet with the exact amount shown.",
    );
  }
  const raw = rawAmountOf(invoice);
  const client = signer.client;

  const expectedPrefix = invoice.network === "ckb" ? "ckb" : "ckt";
  if (client.addressPrefix !== expectedPrefix) {
    throw new TillError(
      "NETWORK_MISMATCH",
      `This invoice is for ${invoice.network === "ckb" ? "mainnet" : "testnet"} but the connected wallet is on the other network.`,
    );
  }

  const { script: toLock } = await ccc.Address.fromString(invoice.to, client);

  const tx = ccc.Transaction.from({
    outputs: [{ lock: toLock, capacity: raw }],
  });

  // SEC-8 precheck: an output below its own storage floor would be raised by
  // the builder rather than refused; refuse first, with the real number.
  const floor = ccc.fixedPointFrom(tx.outputs[0]!.occupiedSize);
  if (raw < floor) {
    throw new TillError(
      "AMOUNT_TOO_SMALL",
      `${invoice.amount} CKB is below the ${tx.outputs[0]!.occupiedSize} CKB minimum a payment cell can hold. Ask the merchant for a larger invoice.`,
    );
  }

  await tx.completeInputsByCapacity(signer);
  await tx.completeFeeBy(signer, 1000);

  // ---- Read-back verification (SEC-1 + SEC-8) ----
  const paid = tx.outputs[0]!;
  if (
    paid.lock.codeHash !== toLock.codeHash ||
    paid.lock.hashType !== toLock.hashType ||
    paid.lock.args !== toLock.args
  ) {
    throw new TillError(
      "INVALID_FIELD",
      "The built transaction does not pay the invoice address. Refused.",
    );
  }
  if (paid.capacity !== raw) {
    throw new TillError(
      "AMOUNT_PRECISION",
      `The wallet builder adjusted the payment from ${invoice.amount} to ${shannonsToCkb(paid.capacity)} CKB. A payment differing from the invoice would never be recognised, so it is refused.`,
    );
  }

  const inputCapacity = await tx.getInputsCapacity(client);
  const outputCapacity = tx.getOutputsCapacity();
  const fee = inputCapacity - outputCapacity;
  // Outputs after the first are the signer's change; verify that claim
  // rather than assume it (SEC-7's spirit: every output accounted for).
  const signerScripts = (await signer.getAddressObjs()).map((a) => a.script);
  let changeBack = 0n;
  for (let i = 1; i < tx.outputs.length; i++) {
    const output = tx.outputs[i]!;
    const isMine = signerScripts.some(
      (s) =>
        s.codeHash === output.lock.codeHash &&
        s.hashType === output.lock.hashType &&
        s.args === output.lock.args,
    );
    if (!isMine) {
      throw new TillError(
        "INVALID_FIELD",
        "The built transaction contains an output that pays neither the invoice nor the connected wallet. Refused.",
      );
    }
    changeBack += output.capacity;
  }
  const totalDebit = inputCapacity - changeBack;

  return {
    tx,
    summary: {
      payAmountCkb: shannonsToCkb(paid.capacity),
      feeCkb: shannonsToCkb(fee),
      totalDebitCkb: shannonsToCkb(totalDebit),
    },
  };
}
