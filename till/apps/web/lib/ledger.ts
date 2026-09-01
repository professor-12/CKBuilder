"use client";

/**
 * The merchant's local-first ledger: invoices this browser created, stored
 * in localStorage. Bookkeeping, not custody — losing this store loses a
 * list, never money, because every invoice is self-contained in its link
 * and every settlement is re-derivable from the chain.
 */

import {
  decodeInvoiceFragment,
  encodeInvoiceFragment,
  type Invoice,
  type SettlementStatus,
} from "@till/sdk";

export interface LedgerEntry {
  /** The invoice, stored as its canonical fragment string. */
  fragment: string;
  /** Cached last-known state — presentation only, never evidence. */
  lastStatus?: SettlementStatus;
  lastTxHash?: string;
  lastCheckedAt?: number;
}

const KEY = "till.ledger.v1";

function read(): LedgerEntry[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(
      (e): e is LedgerEntry =>
        typeof e === "object" &&
        e !== null &&
        typeof (e as LedgerEntry).fragment === "string",
    );
  } catch {
    return [];
  }
}

function write(entries: LedgerEntry[]): void {
  window.localStorage.setItem(KEY, JSON.stringify(entries));
}

export function listEntries(): { entry: LedgerEntry; invoice: Invoice }[] {
  const out: { entry: LedgerEntry; invoice: Invoice }[] = [];
  for (const entry of read()) {
    try {
      out.push({ entry, invoice: decodeInvoiceFragment(entry.fragment) });
    } catch {
      // An entry this build can no longer decode is skipped, not destroyed.
    }
  }
  return out.sort((a, b) => b.invoice.createdAt - a.invoice.createdAt);
}

export function addInvoice(invoice: Invoice): void {
  const fragment = encodeInvoiceFragment(invoice);
  const entries = read();
  if (!entries.some((e) => e.fragment === fragment)) {
    entries.push({ fragment });
    write(entries);
  }
}

export function updateEntry(
  fragment: string,
  patch: Omit<LedgerEntry, "fragment">,
): void {
  const entries = read();
  const target = entries.find((e) => e.fragment === fragment);
  if (target) {
    Object.assign(target, patch);
    write(entries);
  }
}

export function removeEntry(fragment: string): void {
  write(read().filter((e) => e.fragment !== fragment));
}

/** Raw amounts of open (not settled) invoices — nonce collision input. */
export function openRawAmounts(
  assetKey: string,
  rawOf: (invoice: Invoice) => bigint,
  keyOf: (invoice: Invoice) => string,
): bigint[] {
  const out: bigint[] = [];
  for (const { entry, invoice } of listEntries()) {
    if (entry.lastStatus === "settled") {
      continue;
    }
    if (keyOf(invoice) === assetKey) {
      out.push(rawOf(invoice));
    }
  }
  return out;
}

export function exportCsv(): string {
  const rows = [
    [
      "created_at_iso",
      "network",
      "asset",
      "amount",
      "label",
      "status",
      "tx_hash",
    ],
  ];
  for (const { entry, invoice } of listEntries()) {
    rows.push([
      new Date(invoice.createdAt * 1000).toISOString(),
      invoice.network,
      invoice.asset === "udt" ? invoice.udt!.symbol : "CKB",
      invoice.amount,
      invoice.label ?? "",
      entry.lastStatus ?? "unchecked",
      entry.lastTxHash ?? "",
    ]);
  }
  return rows
    .map((r) =>
      r.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(","),
    )
    .join("\r\n");
}
