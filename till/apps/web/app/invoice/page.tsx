"use client";

import { useEffect } from "react";

import { DEFAULT_CONFIRMATIONS, assetLabelOf } from "@till/sdk";

import {
  AddressText,
  Amount,
  NetworkPill,
  Quoted,
  StatusPill,
} from "../../components/bits";
import { QrCode } from "../../components/QrCode";
import { updateEntry } from "../../lib/ledger";
import { useInvoiceFragment } from "../../lib/useInvoiceFragment";
import { useSettlement } from "../../lib/watch";

function explorerTxUrl(network: "ckb" | "ckt", txHash: string): string {
  const base =
    network === "ckb"
      ? "https://explorer.nervos.org"
      : "https://testnet.explorer.nervos.org";
  return `${base}/transaction/${txHash}`;
}

export default function InvoiceStatusPage() {
  const { invoice, fragment, problem, loaded } = useInvoiceFragment();
  const { settlement, checking, error } = useSettlement(invoice);

  // Cache the observed state in the local ledger — presentation only.
  useEffect(() => {
    if (invoice && fragment && settlement) {
      updateEntry(fragment, {
        lastStatus: settlement.status,
        ...(settlement.txHash ? { lastTxHash: settlement.txHash } : {}),
        lastCheckedAt: Math.floor(Date.now() / 1000),
      });
    }
  }, [invoice, fragment, settlement]);

  if (!loaded) {
    return <p className="muted">Reading invoice…</p>;
  }
  if (problem || !invoice) {
    return (
      <div>
        <h1>Not an invoice</h1>
        <div className="banner error" role="alert">
          {problem}
        </div>
      </div>
    );
  }

  const payUrl =
    typeof window === "undefined"
      ? ""
      : `${window.location.origin}/pay/#${fragment}`;
  const settled = settlement?.status === "settled";

  return (
    <div>
      <h1>{settled ? "Receipt" : "Invoice"}</h1>
      <div className="receipt">
        <div className="row">
          <span className="k">Network</span>
          <span className="v">
            <NetworkPill network={invoice.network} />
          </span>
        </div>
        <div className="row">
          <span className="k">Status</span>
          <span className="v">
            <StatusPill status={settlement?.status ?? "unpaid"} />
            {checking ? (
              <span className="muted">
                {" "}
                <span className="spin" aria-hidden="true">
                  ◌
                </span>{" "}
                checking
              </span>
            ) : undefined}
          </span>
        </div>
        <div className="row">
          <span className="k">Amount</span>
          <span className="v">
            <Amount value={invoice.amount} asset={assetLabelOf(invoice)} />
          </span>
        </div>
        {invoice.label ? <Quoted text={invoice.label} /> : undefined}
        {invoice.memo ? <Quoted text={invoice.memo} /> : undefined}
        <div className="row">
          <span className="k">To</span>
          <span className="v">
            <AddressText address={invoice.to} />
          </span>
        </div>
        <div className="row">
          <span className="k">Created</span>
          <span className="v mono">
            {new Date(invoice.createdAt * 1000).toLocaleString()}
          </span>
        </div>
        {invoice.expiry ? (
          <div className="row">
            <span className="k">Expires</span>
            <span className="v mono">
              {new Date(invoice.expiry * 1000).toLocaleString()}
            </span>
          </div>
        ) : undefined}

        {settlement?.txHash ? (
          <>
            <hr className="receipt-rule" />
            <h2>Settlement — read from the chain</h2>
            <div className="row">
              <span className="k">Transaction</span>
              <span className="v mono">
                <a
                  href={explorerTxUrl(invoice.network, settlement.txHash)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {settlement.txHash}
                </a>
              </span>
            </div>
            <div className="row">
              <span className="k">Block</span>
              <span className="v mono">{settlement.blockNumber}</span>
            </div>
            {settlement.blockTimestampMs ? (
              <div className="row">
                <span className="k">Chain time</span>
                <span className="v mono">
                  {new Date(settlement.blockTimestampMs).toLocaleString()}
                </span>
              </div>
            ) : undefined}
            <div className="row">
              <span className="k">Confirmations</span>
              <span className="v mono">
                {settlement.confirmations}
                {settled ? "" : ` of ${DEFAULT_CONFIRMATIONS} required`}
              </span>
            </div>
            {settlement.paidAfterExpiry ? (
              <div className="banner caution">
                This payment landed after the invoice's expiry. The money is
                real; whether it still buys the thing is the merchant's call.
              </div>
            ) : undefined}
            {settled ? (
              <p className="muted">
                Every line above was derived from the committed transaction,
                not from this device's records. Anyone with this link can
                re-verify it against any CKB node.
              </p>
            ) : undefined}
          </>
        ) : undefined}
        {error ? (
          <div className="banner caution" role="status">
            {error} — retrying.
          </div>
        ) : undefined}
      </div>

      <div className="btnrow no-print">
        {settled ? (
          <button className="btn primary" onClick={() => window.print()}>
            Print receipt
          </button>
        ) : (
          <>
            <button
              className="btn primary"
              onClick={() => void navigator.clipboard.writeText(payUrl)}
            >
              Copy payment link
            </button>
          </>
        )}
      </div>

      {!settled && settlement?.status !== "seen" ? (
        <div className="card no-print">
          <h2>Show this to the payer</h2>
          <QrCode text={payUrl} label="QR code of the payment link" />
        </div>
      ) : undefined}
    </div>
  );
}
