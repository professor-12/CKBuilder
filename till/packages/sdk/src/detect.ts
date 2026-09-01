/**
 * Settlement detection — the heart of Till.
 *
 * The question this module answers is narrow and unforgiving: does the chain
 * contain a committed transaction that creates an output paying the
 * merchant's lock the invoice's exact amount, at or after the invoice's
 * creation height?
 *
 * Rules (SET-1..4 in the PRD):
 *  - Truth comes from outputs read back over RPC. Nothing the payer's
 *    browser, a wallet callback, or a URL parameter says is evidence.
 *  - Amounts match by BigInt equality on raw units. There is no tolerance,
 *    because a tolerance is a matcher that can be argued with.
 *  - The earliest matching payment settles the invoice; scanning is
 *    ascending from the invoice's creation height.
 *  - Below the confirmation threshold the state says so. A receipt is only a
 *    receipt at the threshold, and re-verification re-reads the chain.
 */

import { addressToLockScript, scriptEquals, type LockScript } from "./address.ts";
import { hexToBytes, uint128LE } from "./bytes.ts";
import { TillError } from "./errors.ts";
import { decimalsOf, rawAmountOf, type Invoice } from "./invoice.ts";
import {
  hexToBigint,
  hexToNumber,
  type RpcClient,
  type RpcScript,
  type RpcTxWithStatus,
} from "./rpc.ts";

export const DEFAULT_CONFIRMATIONS = 6;

export type SettlementStatus = "unpaid" | "expired" | "seen" | "settled";

export interface Settlement {
  status: SettlementStatus;
  /** Chain tip at the moment of this check. */
  checkedAtTip: number;
  /** Present for `seen` and `settled`. */
  txHash?: string;
  outputIndex?: number;
  blockNumber?: number;
  blockTimestampMs?: number;
  confirmations?: number;
  /** First input's lock, resolved best-effort — who paid. */
  payerAddressScript?: LockScript;
  /** True when the payment landed after the invoice's expiry. */
  paidAfterExpiry?: boolean;
}

export interface DetectOptions {
  /** Confirmations required before `settled`. */
  confirmations?: number;
  /** Unix seconds now, injected for testability. */
  now?: number;
  /** Indexer page size. */
  pageSize?: number;
  /** Hard cap on pages walked before reporting unpaid (defensive). */
  maxPages?: number;
}

function toRpcScript(lock: LockScript): RpcScript {
  return { code_hash: lock.codeHash, hash_type: lock.hashType, args: lock.args };
}

/**
 * Does this committed transaction settle the invoice? Returns the output
 * index, or undefined. Exported for direct fixture testing.
 */
export function matchSettlingOutput(
  tx: { outputs: { capacity: string; lock: RpcScript; type?: RpcScript | null }[]; outputs_data: string[] },
  merchantLock: LockScript,
  invoice: Invoice,
  raw: bigint,
): number | undefined {
  for (let i = 0; i < tx.outputs.length; i++) {
    const output = tx.outputs[i]!;
    if (
      !scriptEquals(
        {
          codeHash: output.lock.code_hash,
          hashType: output.lock.hash_type,
          args: output.lock.args,
        },
        merchantLock,
      )
    ) {
      continue;
    }
    if (invoice.asset === "ckb") {
      // A CKB payment must be a plain cell: an output with a type script is
      // some other protocol's cell that happens to sit on this lock.
      if (output.type) {
        continue;
      }
      if (hexToBigint(output.capacity, "capacity") === raw) {
        return i;
      }
    } else {
      const udt = invoice.udt!;
      if (
        !output.type ||
        !scriptEquals(
          {
            codeHash: output.type.code_hash,
            hashType: output.type.hash_type,
            args: output.type.args,
          },
          { codeHash: udt.codeHash, hashType: udt.hashType, args: udt.args },
        )
      ) {
        continue;
      }
      const data = tx.outputs_data[i];
      if (typeof data !== "string") {
        continue;
      }
      let amount: bigint;
      try {
        amount = uint128LE(hexToBytes(data));
      } catch {
        continue; // malformed token cell is not a payment
      }
      if (amount === raw) {
        return i;
      }
    }
  }
  return undefined;
}

async function resolvePayerLock(
  rpc: RpcClient,
  tx: { inputs: { previous_output: { tx_hash: string; index: string } }[] },
): Promise<LockScript | undefined> {
  const first = tx.inputs[0];
  if (!first) {
    return undefined;
  }
  try {
    const prev = await rpc.getTransaction(first.previous_output.tx_hash);
    const idx = hexToNumber(first.previous_output.index, "outpoint index");
    const out = prev.transaction?.outputs[idx];
    if (!out) {
      return undefined;
    }
    return {
      codeHash: out.lock.code_hash as LockScript["codeHash"],
      hashType: out.lock.hash_type as LockScript["hashType"],
      args: out.lock.args as LockScript["args"],
    };
  } catch {
    return undefined; // best-effort only; never fails a detection
  }
}

/**
 * Scan the chain for the transaction that settles `invoice`.
 */
export async function detectSettlement(
  invoice: Invoice,
  rpc: RpcClient,
  options: DetectOptions = {},
): Promise<Settlement> {
  const confirmationsNeeded = options.confirmations ?? DEFAULT_CONFIRMATIONS;
  const now = options.now ?? Math.floor(Date.now() / 1000);
  const pageSize = options.pageSize ?? 50;
  const maxPages = options.maxPages ?? 40;

  const merchantLock = addressToLockScript(invoice.to, invoice.network);
  const raw = rawAmountOf(invoice);
  const tip = await rpc.getTipBlockNumber();

  let cursor: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const result = await rpc.getTransactions(
      toRpcScript(merchantLock),
      invoice.sinceBlock,
      "asc",
      pageSize,
      cursor,
    );
    for (const obj of result.objects) {
      const receivesOutput = obj.cells.some(([direction]) => direction === "output");
      if (!receivesOutput) {
        continue;
      }
      const txr: RpcTxWithStatus = await rpc.getTransaction(obj.tx_hash);
      if (txr.tx_status.status !== "committed" || !txr.transaction) {
        continue;
      }
      const outputIndex = matchSettlingOutput(
        txr.transaction,
        merchantLock,
        invoice,
        raw,
      );
      if (outputIndex === undefined) {
        continue;
      }
      const blockNumber = hexToNumber(obj.block_number, "block number");
      const confirmations = tip - blockNumber + 1;
      let blockTimestampMs: number | undefined;
      if (txr.tx_status.block_hash) {
        try {
          blockTimestampMs = await rpc.getHeaderTimestampMs(
            txr.tx_status.block_hash,
          );
        } catch {
          // timestamp is presentation, not evidence — omit on failure
        }
      }
      const payerAddressScript = await resolvePayerLock(rpc, txr.transaction);
      const paidAfterExpiry =
        invoice.expiry !== undefined &&
        blockTimestampMs !== undefined &&
        blockTimestampMs > invoice.expiry * 1000;
      return {
        status: confirmations >= confirmationsNeeded ? "settled" : "seen",
        checkedAtTip: tip,
        txHash: obj.tx_hash,
        outputIndex,
        blockNumber,
        ...(blockTimestampMs !== undefined ? { blockTimestampMs } : {}),
        confirmations,
        ...(payerAddressScript ? { payerAddressScript } : {}),
        ...(paidAfterExpiry ? { paidAfterExpiry } : {}),
      };
    }
    if (result.objects.length < pageSize || result.last_cursor === "0x") {
      break;
    }
    cursor = result.last_cursor;
  }

  if (invoice.expiry !== undefined && now > invoice.expiry) {
    return { status: "expired", checkedAtTip: tip };
  }
  return { status: "unpaid", checkedAtTip: tip };
}

/**
 * Amount the payer must send, in raw units — a convenience the payer page
 * uses for its copy-exact-amount affordance, guaranteed identical to what
 * the detector will match.
 */
export function paymentRequest(invoice: Invoice): {
  raw: bigint;
  decimals: number;
  merchantLock: LockScript;
} {
  return {
    raw: rawAmountOf(invoice),
    decimals: decimalsOf(invoice),
    merchantLock: addressToLockScript(invoice.to, invoice.network),
  };
}

/** Guard used by pages before offering any payment affordance. */
export function assertNotExpired(invoice: Invoice, now: number): void {
  if (invoice.expiry !== undefined && now > invoice.expiry) {
    throw new TillError(
      "INVOICE_EXPIRED",
      "This invoice has expired. Ask the merchant for a fresh one.",
    );
  }
}
