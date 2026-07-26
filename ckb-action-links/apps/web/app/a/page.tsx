"use client";

import {
  ActionLinkError,
  buildAction,
  decodePayload,
  networkName,
  type ActionIntent,
  type ActionSummary,
} from "@ckb-action-links/sdk";
import { ccc } from "@ckb-ccc/connector-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Address, Chip, Notice, Spinner } from "../components/ui";

/** Turn any thrown value into something safe to show a person. */
function presentableError(error: unknown): string {
  if (error instanceof ActionLinkError) return error.userMessage;
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}

const explorerTx = (network: string, hash: string): string =>
  network === "ckb"
    ? `https://explorer.nervos.org/transaction/${hash}`
    : `https://pudge.explorer.nervos.org/transaction/${hash}`;

export default function ActionPage() {
  const signer = ccc.useSigner();
  const { open } = ccc.useCcc();

  const [intent, setIntent] = useState<ActionIntent | null>(null);
  const [decodeError, setDecodeError] = useState<string | null>(null);

  const [summary, setSummary] = useState<ActionSummary | null>(null);
  const [tx, setTx] = useState<ccc.Transaction | null>(null);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);

  const [txHash, setTxHash] = useState<string | null>(null);
  const [signError, setSignError] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);

  // The payload lives in the fragment, which only exists client-side. That is
  // the point: the host never receives it.
  useEffect(() => {
    const read = () => {
      setSummary(null);
      setTx(null);
      setTxHash(null);
      setBuildError(null);
      setSignError(null);
      try {
        setIntent(decodePayload(window.location.hash));
        setDecodeError(null);
      } catch (error) {
        setIntent(null);
        setDecodeError(presentableError(error));
      }
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  // Build as soon as a wallet is available. Building is read-only — it collects
  // cells and estimates a fee. It never prompts for a signature (SEC-5).
  useEffect(() => {
    if (!intent || !signer) return;
    let cancelled = false;

    setBuilding(true);
    setBuildError(null);
    buildAction(intent, signer)
      .then((built) => {
        if (cancelled) return;
        setTx(built.tx);
        setSummary(built.summary);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setTx(null);
        setSummary(null);
        setBuildError(presentableError(error));
      })
      .finally(() => {
        if (!cancelled) setBuilding(false);
      });

    return () => {
      cancelled = true;
    };
  }, [intent, signer]);

  const sign = useCallback(async () => {
    // Sign exactly the transaction the summary was derived from (SEC-1).
    if (!signer || !tx) return;
    setSigning(true);
    setSignError(null);
    try {
      setTxHash(await signer.sendTransaction(tx));
    } catch (error) {
      setSignError(presentableError(error));
    } finally {
      setSigning(false);
    }
  }, [signer, tx]);

  /* ── Refused ─────────────────────────────────────────────────────────── */

  if (decodeError) {
    return (
      <main className="page">
        <h1>This link cannot be used</h1>
        <p className="lede">{decodeError}</p>
        <Notice tone="danger">
          <p>
            Nothing has been signed and no wallet has been contacted. Ask whoever sent this
            for a new link rather than editing this one.
          </p>
        </Notice>
        <div className="actions">
          <Link href="/" className="btn">
            Back to start
          </Link>
        </div>
      </main>
    );
  }

  if (!intent) {
    return (
      <main className="page">
        <div className="skeleton" style={{ height: "1.6rem", width: "12rem" }} />
        <div className="card" style={{ marginTop: "1.75rem" }}>
          <div className="skeleton" style={{ height: "3rem" }} />
        </div>
      </main>
    );
  }

  /* ── Done ────────────────────────────────────────────────────────────── */

  if (txHash) {
    return (
      <main className="page">
        <h1>Sent</h1>
        <p className="lede">Your transaction has been broadcast to the network.</p>

        <Notice tone="ok">
          <p>Signed and submitted. It will confirm in the next block or two.</p>
        </Notice>

        <div className="card">
          <Address value={txHash} label="Transaction hash" />
        </div>

        <div className="actions">
          <a
            className="btn btn-primary"
            href={explorerTx(intent.network, txHash)}
            target="_blank"
            rel="noreferrer"
          >
            View on explorer
          </a>
          <Link href="/new" className="btn">
            Create your own link
          </Link>
        </div>
      </main>
    );
  }

  /* ── Confirm ─────────────────────────────────────────────────────────── */

  const isMainnet = intent.network === "ckb";

  return (
    <main className="page">
      <div style={{ marginBottom: "0.75rem" }}>
        <Chip tone={isMainnet ? "live" : undefined}>
          {networkName(intent.network)}
          {isMainnet ? " · real funds" : null}
        </Chip>
      </div>

      <h1>{intent.label ?? "Confirm this action"}</h1>
      {intent.note ? <p className="lede">{intent.note}</p> : <div style={{ height: "1rem" }} />}

      {/* SEC-4: provenance is stated outright, never implied. */}
      <Notice tone="warn">
        <p>
          Anyone can create one of these links. Check the recipient address below against
          where you actually meant to send funds.
        </p>
      </Notice>

      {/* Before a wallet is connected there is no transaction yet, so this is
          explicitly the link's request — not a preview of anything signable. */}
      {!signer ? (
        <>
          <h2>What this link requests</h2>
          <div className="card card-quiet">
            {intent.action === "transfer" ? (
              <>
                <div className="hero">
                  <div className="hero-caption">Amount requested</div>
                  <div className="hero-amount">
                    {intent.amount}
                    <span className="hero-unit">CKB</span>
                  </div>
                </div>
                <Address value={intent.to} label="Recipient" />
              </>
            ) : null}
          </div>

          <p className="small muted" style={{ marginTop: "1rem" }}>
            Connect a wallet to see the exact transaction, including the network fee and the
            true total. Connecting does not sign anything.
          </p>

          <div className="actions actions-stack">
            <button className="btn btn-primary btn-block" onClick={open}>
              Connect wallet
            </button>
          </div>
        </>
      ) : null}

      {signer && building ? (
        <>
          <h2>Preparing</h2>
          <div className="card">
            <div className="skeleton" style={{ height: "2.75rem", marginBottom: "1.25rem" }} />
            <div className="skeleton" style={{ height: "3.5rem" }} />
          </div>
          <p className="small muted" style={{ marginTop: "1rem" }}>
            <Spinner /> Collecting cells and estimating the fee…
          </p>
        </>
      ) : null}

      {signer && buildError ? (
        <>
          <Notice tone="danger">
            <p>{buildError}</p>
          </Notice>
          <p className="small muted">
            Nothing has been signed. This link cannot be completed with the wallet and network
            you are currently connected to.
          </p>
        </>
      ) : null}

      {/* Everything below is read off the built transaction, never off the
          intent — the summary and the signed object cannot disagree (SEC-1). */}
      {summary ? (
        <>
          <h2>You will sign</h2>
          <div className="card">
            <div className="hero">
              {/* SEC-3: the loudest number is the true cost, fee included —
                  not the headline amount, which is always the smaller one. */}
              <div className="hero-caption">Total leaving your wallet</div>
              <div className="hero-amount">
                {summary.totalDebit}
                <span className="hero-unit">CKB</span>
              </div>
            </div>

            {summary.outputs.map((output) => (
              <div key={output.address} style={{ marginBottom: "1.15rem" }}>
                <Address
                  value={output.address}
                  label="To"
                  trailing={<span className="mono">{output.amount} CKB</span>}
                />
              </div>
            ))}

            <dl className="details">
              <dt>Network fee</dt>
              <dd className="mono">{summary.fee} CKB</dd>
            </dl>
          </div>

          {signError ? (
            <div style={{ marginTop: "1.25rem" }}>
              <Notice tone="danger">
                <p>{signError}</p>
              </Notice>
            </div>
          ) : null}

          <div className="actions actions-stack">
            <button
              className="btn btn-primary btn-block"
              onClick={sign}
              disabled={signing}
            >
              {signing ? (
                <>
                  <Spinner /> Waiting for your wallet…
                </>
              ) : (
                `Sign and send ${summary.totalDebit} CKB`
              )}
            </button>
            {/* Deliberately never disabled — backing out while a wallet prompt
                is open is legitimate, and a link that looks disabled but still
                navigates would be a lie. */}
            <Link href="/" className="btn btn-block">
              Cancel
            </Link>
          </div>
        </>
      ) : null}
    </main>
  );
}
