/**
 * Minimal JSON-RPC client over fetch.
 *
 * Deliberately tiny: the detector needs five RPC methods, all available on
 * every public CKB node since the indexer moved in-process (v0.105). The
 * fetch implementation is injected so tests exercise the detector against
 * recorded fixtures with no network.
 */

import { TillError } from "./errors.ts";
import type { Network } from "./invoice.ts";

export const PUBLIC_RPC: Record<Network, string> = {
  ckb: "https://mainnet.ckb.dev/",
  ckt: "https://testnet.ckb.dev/",
};

export interface RpcScript {
  code_hash: string;
  hash_type: string;
  args: string;
}

export interface RpcCellOutput {
  capacity: string;
  lock: RpcScript;
  type?: RpcScript | null;
}

export interface RpcTransaction {
  hash?: string;
  inputs: { previous_output: { tx_hash: string; index: string } }[];
  outputs: RpcCellOutput[];
  outputs_data: string[];
}

export interface RpcTxWithStatus {
  transaction: RpcTransaction | null;
  tx_status: {
    status: "pending" | "proposed" | "committed" | "unknown" | "rejected";
    block_hash?: string | null;
    block_number?: string | null;
  };
}

export interface IndexerTxGrouped {
  tx_hash: string;
  block_number: string;
  cells: ["input" | "output", string][];
}

export interface IndexerTxPage {
  last_cursor: string;
  objects: IndexerTxGrouped[];
}

type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export class RpcClient {
  private id = 0;
  readonly url: string;
  private readonly fetchImpl: FetchLike;

  constructor(url: string, fetchImpl?: FetchLike) {
    this.url = url;
    // Wrapped rather than stored: a detached `fetch` loses its `this`
    // binding and throws "Illegal invocation" on both Node and browsers.
    this.fetchImpl =
      fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
  }

  async call<T>(method: string, params: unknown[]): Promise<T> {
    let res: Awaited<ReturnType<FetchLike>>;
    try {
      res = await this.fetchImpl(this.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: ++this.id,
          jsonrpc: "2.0",
          method,
          params,
        }),
      });
    } catch {
      throw new TillError(
        "RPC_UNAVAILABLE",
        "Could not reach the CKB node. Check the connection and try again.",
      );
    }
    if (!res.ok) {
      throw new TillError(
        "RPC_UNAVAILABLE",
        `The CKB node answered with HTTP ${res.status}.`,
      );
    }
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new TillError("RPC_MALFORMED_RESPONSE", "The node's reply was not JSON.");
    }
    if (typeof body !== "object" || body === null) {
      throw new TillError("RPC_MALFORMED_RESPONSE", "The node's reply was not an object.");
    }
    const record = body as { error?: { message?: string }; result?: T };
    if (record.error) {
      throw new TillError(
        "RPC_MALFORMED_RESPONSE",
        `The node rejected ${method}: ${record.error.message ?? "unknown error"}.`,
      );
    }
    if (!("result" in record)) {
      throw new TillError("RPC_MALFORMED_RESPONSE", "The node's reply carried no result.");
    }
    return record.result as T;
  }

  /** Current tip block number. */
  async getTipBlockNumber(): Promise<number> {
    const hex = await this.call<string>("get_tip_block_number", []);
    return hexToNumber(hex, "tip block number");
  }

  /** Indexer: transactions touching a lock script within a block range. */
  getTransactions(
    lock: RpcScript,
    fromBlock: number,
    order: "asc" | "desc",
    limit: number,
    after?: string,
  ): Promise<IndexerTxPage> {
    const searchKey = {
      script: lock,
      script_type: "lock",
      group_by_transaction: true,
      filter: { block_range: [numberToHex(fromBlock), "0xffffffffffffff"] },
    };
    const params: unknown[] = [searchKey, order, numberToHex(limit)];
    if (after !== undefined) {
      params.push(after);
    }
    return this.call<IndexerTxPage>("get_transactions", params);
  }

  getTransaction(txHash: string): Promise<RpcTxWithStatus> {
    return this.call<RpcTxWithStatus>("get_transaction", [txHash]);
  }

  async getHeaderTimestampMs(blockHash: string): Promise<number> {
    const header = await this.call<{ timestamp: string }>("get_header", [
      blockHash,
    ]);
    return hexToNumber(header.timestamp, "block timestamp");
  }
}

export function hexToNumber(hex: unknown, what: string): number {
  if (typeof hex !== "string" || !/^0x[0-9a-fA-F]{1,13}$/.test(hex)) {
    throw new TillError(
      "RPC_MALFORMED_RESPONSE",
      `The node returned a malformed ${what}.`,
    );
  }
  return Number(BigInt(hex));
}

export function numberToHex(n: number): string {
  if (!Number.isInteger(n) || n < 0) {
    throw new TillError("INVALID_FIELD", `Not encodable as a block number: ${n}`);
  }
  return `0x${n.toString(16)}`;
}

/** Capacity and UDT hex quantities can exceed 2^53 — bigint only. */
export function hexToBigint(hex: unknown, what: string): bigint {
  if (typeof hex !== "string" || !/^0x[0-9a-fA-F]+$/.test(hex)) {
    throw new TillError(
      "RPC_MALFORMED_RESPONSE",
      `The node returned a malformed ${what}.`,
    );
  }
  return BigInt(hex);
}
