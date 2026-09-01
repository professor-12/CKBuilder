"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { assetLabelOf, type Invoice } from "@till/sdk";

import { StatusPill } from "../components/bits";
import { exportCsv, listEntries, removeEntry, type LedgerEntry } from "../lib/ledger";

export default function DashboardPage() {
  const [rows, setRows] = useState<
    { entry: LedgerEntry; invoice: Invoice }[] | undefined
  >();

  useEffect(() => {
    setRows(listEntries());
  }, []);

  function refresh() {
    setRows(listEntries());
  }

  function downloadCsv() {
    const blob = new Blob([exportCsv()], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "till-ledger.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  if (rows === undefined) {
    return <p className="muted">Opening the ledger…</p>;
  }

  if (rows.length === 0) {
    return (
      <div>
        <h1>The self-custodial till for CKB</h1>
        <p>
          Create an invoice, share it as a link or QR code, and watch it settle
          on-chain. Receipts are derived from the chain itself — no server, no
          custodian, no account.
        </p>
        <div className="btnrow">
          <Link className="btn primary" href="/new">
            Create your first invoice
          </Link>
          <Link className="btn ghost" href="/pos">
            Open the point of sale
          </Link>
        </div>
        <div className="card">
          <h2>How settlement detection works</h2>
          <p className="muted">
            Till adds a few random digits of dust to each invoice
            (about a thousandth of a cent). A payment counts only when the
            chain shows an output paying the exact nonced amount to the
            merchant's address — so any CKB wallet can pay, and nobody can
            fake a receipt.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1>Ledger</h1>
      <p className="muted">
        Stored only in this browser. Every invoice is self-contained in its
        link; every settlement is re-derivable from the chain.
      </p>
      <div className="btnrow">
        <Link className="btn primary" href="/new">
          New invoice
        </Link>
        <Link className="btn ghost" href="/pos">
          Point of sale
        </Link>
        <button className="btn ghost" onClick={downloadCsv}>
          Export CSV
        </button>
      </div>
      <table className="ledger">
        <thead>
          <tr>
            <th>Created</th>
            <th>Label</th>
            <th>Amount</th>
            <th>Status</th>
            <th aria-label="Actions"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ entry, invoice }) => (
            <tr key={entry.fragment}>
              <td>{new Date(invoice.createdAt * 1000).toLocaleDateString()}</td>
              <td>{invoice.label ?? <span className="muted">—</span>}</td>
              <td className="num">
                {invoice.amount} {assetLabelOf(invoice)}
              </td>
              <td>
                <StatusPill status={entry.lastStatus ?? "unpaid"} />
              </td>
              <td>
                <Link href={`/invoice/#${entry.fragment}`}>open</Link>{" "}
                <button
                  className="btn ghost"
                  style={{ padding: "2px 8px", fontSize: "0.8rem" }}
                  onClick={() => {
                    removeEntry(entry.fragment);
                    refresh();
                  }}
                >
                  remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
