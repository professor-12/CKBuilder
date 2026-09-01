"use client";

import { useEffect, useState } from "react";

import {
  PUBLIC_RPC,
  RpcClient,
  checkAddressShape,
  createInvoice,
  encodeInvoiceFragment,
  isTillError,
  rawAmountOf,
  type Invoice,
  type Network,
} from "@till/sdk";

import { Amount, StatusPill } from "../../components/bits";
import { QrCode } from "../../components/QrCode";
import { addInvoice, listEntries, updateEntry } from "../../lib/ledger";
import { useSettlement } from "../../lib/watch";

/**
 * Point of sale: amount → QR → watch → PAID → next customer.
 * A phone on the counter is a CKB terminal.
 */
export default function PosPage() {
  const [network, setNetwork] = useState<Network>("ckt");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [problem, setProblem] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [invoice, setInvoice] = useState<Invoice | undefined>();

  const { settlement } = useSettlement(invoice);
  const fragment = invoice ? encodeInvoiceFragment(invoice) : undefined;
  const status = settlement?.status ?? "unpaid";

  useEffect(() => {
    if (invoice && fragment && settlement?.txHash) {
      updateEntry(fragment, {
        lastStatus: settlement.status,
        lastTxHash: settlement.txHash,
        lastCheckedAt: Math.floor(Date.now() / 1000),
      });
    }
  }, [invoice, fragment, settlement]);

  async function charge() {
    setProblem(undefined);
    setBusy(true);
    try {
      checkAddressShape(to.trim(), network);
      const rpc = new RpcClient(PUBLIC_RPC[network]);
      const tipBlock = await rpc.getTipBlockNumber();
      const openAmounts = listEntries()
        .filter(
          ({ entry, invoice: inv }) =>
            inv.asset === "ckb" &&
            inv.to === to.trim() &&
            entry.lastStatus !== "settled" &&
            entry.lastStatus !== "expired",
        )
        .map(({ invoice: inv }) => rawAmountOf(inv));
      const created = createInvoice({
        network,
        asset: "ckb",
        to: to.trim(),
        amount: amount.trim(),
        label: "Point of sale",
        now: Math.floor(Date.now() / 1000),
        tipBlock,
        expiresInSeconds: 15 * 60,
        openAmounts,
      });
      addInvoice(created.invoice);
      setInvoice(created.invoice);
    } catch (e) {
      setProblem(
        isTillError(e) || e instanceof Error
          ? e.message
          : "Could not create the charge.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (invoice && (status === "seen" || status === "settled")) {
    return (
      <div className="pos-stage">
        <div className="pos-paid">
          <p style={{ fontSize: "2rem", margin: 0 }}>
            {status === "settled" ? "PAID ✓" : "PAYMENT SEEN"}
          </p>
          <Amount value={invoice.amount} asset="CKB" />
          <p>
            {status === "settled"
              ? "Settled on-chain."
              : `Confirming — ${settlement?.confirmations ?? 0} of 6.`}
          </p>
        </div>
        <button
          className="btn primary"
          onClick={() => {
            setInvoice(undefined);
            setAmount("");
          }}
        >
          Next customer
        </button>
      </div>
    );
  }

  if (invoice) {
    const payUrl = `${window.location.origin}/pay/#${fragment}`;
    return (
      <div className="pos-stage">
        <div className="pos-amount">
          {invoice.amount} <span className="muted">CKB</span>
        </div>
        <StatusPill status={status} />
        <QrCode text={payUrl} label="Scan to pay" />
        <p className="muted">
          Scan to open the payment page, or send the exact amount to the till
          address from any wallet.
        </p>
        <button className="btn ghost" onClick={() => setInvoice(undefined)}>
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div>
      <h1>Point of sale</h1>
      {problem ? (
        <div className="banner error" role="alert">
          {problem}
        </div>
      ) : undefined}
      <div className="card">
        <label className="field">
          Network
          <select
            value={network}
            onChange={(e) => setNetwork(e.target.value as Network)}
          >
            <option value="ckt">Testnet (ckt)</option>
            <option value="ckb">Mainnet (ckb)</option>
          </select>
        </label>
        <label className="field">
          Till address <span className="hint">(where the money lands)</span>
          <input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder={network === "ckb" ? "ckb1…" : "ckt1…"}
          />
        </label>
        <label className="field">
          Charge (CKB)
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="100"
            style={{ fontSize: "1.6rem", fontFamily: "var(--mono)" }}
          />
        </label>
        <div className="btnrow">
          <button className="btn primary" onClick={charge} disabled={busy}>
            {busy ? "Creating…" : "Charge"}
          </button>
        </div>
        <p className="muted">
          Point-of-sale charges expire after 15 minutes and appear in the
          ledger like any other invoice.
        </p>
      </div>
    </div>
  );
}
