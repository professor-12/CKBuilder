"use client";

import { ccc } from "@ckb-ccc/connector-react";
import { useEffect, useMemo, useState } from "react";

import {
  assetLabelOf,
  isTillError,
  type Invoice,
} from "@till/sdk";

import {
  AddressText,
  Amount,
  NetworkPill,
  ProvenanceBanner,
  Quoted,
  StatusPill,
} from "../../components/bits";
import { buildCkbPayment, type PaymentPlan } from "../../lib/pay";
import { useExpiryCountdown, useSettlement } from "../../lib/watch";
import { useInvoiceFragment } from "../../lib/useInvoiceFragment";

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function ExternalPayCard({ invoice }: { invoice: Invoice }) {
  const [copied, setCopied] = useState<"amount" | "address" | undefined>();
  useEffect(() => {
    if (!copied) {
      return;
    }
    const t = setTimeout(() => setCopied(undefined), 1600);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <div className="card">
      <h2>Pay from any wallet</h2>
      <p className="muted">
        Send <strong>exactly</strong> the amount below — the last digits are
        how the merchant's page recognises this specific payment.
      </p>
      <div className="row">
        <span className="k">Amount</span>
        <span className="v">
          <Amount value={invoice.amount} asset={assetLabelOf(invoice)} />
        </span>
      </div>
      <div className="row">
        <span className="k">To</span>
        <span className="v">
          <AddressText address={invoice.to} />
        </span>
      </div>
      <div className="btnrow">
        <button
          className="btn"
          onClick={() => {
            void navigator.clipboard.writeText(invoice.amount);
            setCopied("amount");
          }}
        >
          {copied === "amount" ? "Copied ✓" : "Copy exact amount"}
        </button>
        <button
          className="btn"
          onClick={() => {
            void navigator.clipboard.writeText(invoice.to);
            setCopied("address");
          }}
        >
          {copied === "address" ? "Copied ✓" : "Copy address"}
        </button>
      </div>
    </div>
  );
}

function WalletPayCard({ invoice }: { invoice: Invoice }) {
  const { wallet, open, disconnect, setClient } = ccc.useCcc();
  const signer = ccc.useSigner();
  const [plan, setPlan] = useState<PaymentPlan | undefined>();
  const [sentTx, setSentTx] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | undefined>();

  useEffect(() => {
    setClient(
      invoice.network === "ckb"
        ? new ccc.ClientPublicMainnet()
        : new ccc.ClientPublicTestnet(),
    );
  }, [invoice.network, setClient]);

  // A plan built for one wallet must not survive into another.
  useEffect(() => {
    setPlan(undefined);
    setProblem(undefined);
  }, [signer]);

  async function preview() {
    if (!signer) {
      return;
    }
    setBusy(true);
    setProblem(undefined);
    try {
      setPlan(await buildCkbPayment(invoice, signer));
    } catch (e) {
      setPlan(undefined);
      setProblem(
        isTillError(e) || e instanceof Error
          ? e.message
          : "Could not build the payment.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (!signer || !plan) {
      return;
    }
    setBusy(true);
    setProblem(undefined);
    try {
      if (invoice.expiry !== undefined && Date.now() / 1000 > invoice.expiry) {
        setPlan(undefined);
        throw new Error("This invoice expired while the page was open.");
      }
      setSentTx(await signer.sendTransaction(plan.tx));
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "The wallet did not send.");
    } finally {
      setBusy(false);
    }
  }

  if (invoice.asset !== "ckb") {
    return (
      <div className="card">
        <h2>Pay in this page</h2>
        <p className="muted">
          Token invoices are paid from your own wallet for now — copy the
          exact amount and address above. The merchant's page verifies the
          payment on-chain either way.
        </p>
      </div>
    );
  }

  return (
    <div className="card">
      <h2>Pay in this page</h2>
      {problem ? (
        <div className="banner error" role="alert">
          {problem}
        </div>
      ) : undefined}
      {sentTx ? (
        <div className="banner ok">
          Sent. Transaction <span className="mono">{sentTx}</span> — the
          status above flips when the chain confirms it.
        </div>
      ) : !signer ? (
        <div className="btnrow">
          <button className="btn primary" onClick={open}>
            Connect a wallet
          </button>
          <p className="muted">
            JoyID, MetaMask, UTXO Global and friends — CKB's account
            abstraction means one flow for all of them.
          </p>
        </div>
      ) : !plan ? (
        <div className="btnrow">
          <button className="btn primary" onClick={preview} disabled={busy}>
            {busy ? "Building…" : "Preview payment"}
          </button>
          <button className="btn ghost" onClick={disconnect}>
            Disconnect {wallet?.name ?? "wallet"}
          </button>
        </div>
      ) : (
        <div>
          <p className="muted">
            Read back from the built transaction — not from the link:
          </p>
          <div className="row">
            <span className="k">Payment</span>
            <span className="v mono">{plan.summary.payAmountCkb} CKB</span>
          </div>
          <div className="row">
            <span className="k">Network fee</span>
            <span className="v mono">{plan.summary.feeCkb} CKB</span>
          </div>
          <div className="row">
            <span className="k">Total leaving wallet</span>
            <span className="v mono">
              <strong>{plan.summary.totalDebitCkb} CKB</strong>
            </span>
          </div>
          <div className="btnrow">
            <button className="btn primary" onClick={send} disabled={busy}>
              {busy ? "Waiting for wallet…" : "Sign and send"}
            </button>
            <button
              className="btn ghost"
              onClick={() => setPlan(undefined)}
              disabled={busy}
            >
              Discard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PayPage() {
  const { invoice, problem, loaded } = useInvoiceFragment();
  const { settlement } = useSettlement(invoice);
  const countdown = useExpiryCountdown(invoice);

  const expired = useMemo(
    () =>
      settlement?.status === "expired" ||
      (countdown !== undefined &&
        countdown <= 0 &&
        settlement?.status !== "seen" &&
        settlement?.status !== "settled"),
    [settlement?.status, countdown],
  );

  if (!loaded) {
    return <p className="muted">Reading invoice…</p>;
  }
  if (problem || !invoice) {
    return (
      <div>
        <h1>This link cannot be paid</h1>
        <div className="banner error" role="alert">
          {problem}
        </div>
        <p className="muted">
          Till refuses to show a payment it cannot fully explain. Ask the
          merchant for a fresh link.
        </p>
      </div>
    );
  }

  const paid = settlement?.status === "seen" || settlement?.status === "settled";

  return (
    <div>
      <h1>Payment request</h1>
      <ProvenanceBanner />
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
          </span>
        </div>
        <div className="row">
          <span className="k">Ask</span>
          <span className="v">
            <Amount value={invoice.amount} asset={assetLabelOf(invoice)} />
          </span>
        </div>
        {invoice.label ? (
          <div>
            <span className="k">The merchant labelled this:</span>
            <Quoted text={invoice.label} />
          </div>
        ) : undefined}
        {invoice.memo ? <Quoted text={invoice.memo} /> : undefined}
        <hr className="receipt-rule" />
        <div className="row">
          <span className="k">To</span>
          <span className="v">
            <AddressText address={invoice.to} />
          </span>
        </div>
        {countdown !== undefined && !paid ? (
          <div className="row">
            <span className="k">Expires</span>
            <span className="v mono">
              {countdown > 0 ? `in ${formatCountdown(countdown)}` : "expired"}
            </span>
          </div>
        ) : undefined}
      </div>

      {paid ? (
        <div className="banner ok" role="status">
          {settlement?.status === "settled"
            ? "This invoice is settled on-chain."
            : `Payment seen — ${settlement?.confirmations ?? 0} of 6 confirmations.`}{" "}
          {settlement?.txHash ? (
            <span className="mono">{settlement.txHash}</span>
          ) : undefined}
        </div>
      ) : expired ? (
        <div className="banner error" role="alert">
          This invoice has expired. Till will not offer a payment for it.
        </div>
      ) : (
        <>
          <ExternalPayCard invoice={invoice} />
          <WalletPayCard invoice={invoice} />
        </>
      )}
    </div>
  );
}
