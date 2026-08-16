"use client";

import {
  ActionLinkError,
  assertNotExpired,
  buildAction,
  decodePayload,
  describeIntent,
  formatRemaining,
  isPayerPriced,
  networkName,
  secondsUntilExpiry,
  validatePayerAmount,
  type ActionIntent,
  type ActionSummary,
} from "@ckb-action-links/sdk";
import { ccc } from "@ckb-ccc/connector-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  Address,
  Chip,
  Notice,
  RecipientList,
  Spinner,
  useNowSeconds,
} from "../components/ui";

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

  /** The payer's figure, for links that do not fix one. */
  const [amountInput, setAmountInput] = useState("");

  const [txHash, setTxHash] = useState<string | null>(null);
  const [signError, setSignError] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);

  /** Guards against an earlier, slower build overwriting a later one. */
  const buildSeq = useRef(0);

  // The payload lives in the fragment, which only exists client-side. That is
  // the point: the host never receives it.
  useEffect(() => {
    const read = () => {
      buildSeq.current += 1;
      setSummary(null);
      setTx(null);
      setTxHash(null);
      setBuildError(null);
      setSignError(null);
      try {
        const decoded = decodePayload(window.location.hash);
        setIntent(decoded);
        setDecodeError(null);
        // A suggestion is a starting point the payer can overwrite, never a
        // figure the link gets to commit them to.
        setAmountInput(decoded.action === "request" ? (decoded.suggested ?? "") : "");
      } catch (error) {
        setIntent(null);
        setDecodeError(presentableError(error));
      }
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  /*
   * Expiry is now watched, not merely checked once.
   *
   * The old page tested expiry when it built the transaction. A link opened a
   * minute before it lapsed therefore kept a live sign button indefinitely,
   * because nothing looked at the clock again. Now the countdown runs while
   * the page is open, a lapse discards the built transaction, and the SDK is
   * asked once more at the moment of sending.
   */
  const hasExpiry = intent?.expiry !== undefined;
  const now = useNowSeconds(hasExpiry);
  const remaining =
    intent && now !== null ? secondsUntilExpiry(intent, now) : null;
  const expired = hasExpiry && remaining === 0;

  const build = useCallback(
    async (payerAmount?: string) => {
      if (!intent || !signer) return;
      const seq = ++buildSeq.current;

      setBuilding(true);
      setBuildError(null);
      setSignError(null);
      try {
        const built = await buildAction(
          intent,
          signer,
          payerAmount !== undefined ? { amount: payerAmount } : {},
        );
        if (seq !== buildSeq.current) return;
        setTx(built.tx);
        setSummary(built.summary);
      } catch (error) {
        if (seq !== buildSeq.current) return;
        setTx(null);
        setSummary(null);
        setBuildError(presentableError(error));
      } finally {
        if (seq === buildSeq.current) setBuilding(false);
      }
    },
    [intent, signer],
  );

  // Links that state their own amount build as soon as a wallet is available.
  // Building is read-only — it collects cells and estimates a fee. It never
  // prompts for a signature (SEC-5).
  useEffect(() => {
    if (!intent || !signer || isPayerPriced(intent.action) || expired) return;
    void build();
  }, [intent, signer, expired, build]);

  /**
   * Editing the amount invalidates the transaction it produced. Without this,
   * the summary on screen would belong to a figure that is no longer in the
   * box — the exact preview/sign divergence SEC-1 exists to prevent.
   *
   * Done here rather than in an effect on `amountInput`, because such an effect
   * also fires when decoding seeds the field, and would then cancel the build a
   * freshly decoded link had just started.
   */
  const editAmount = useCallback((value: string) => {
    buildSeq.current += 1;
    setAmountInput(value);
    setSummary(null);
    setTx(null);
    setBuildError(null);
    setBuilding(false);
  }, []);

  // A link that lapses while the page is open loses its transaction too.
  useEffect(() => {
    if (!expired) return;
    buildSeq.current += 1;
    setSummary(null);
    setTx(null);
    setBuilding(false);
  }, [expired]);

  const sign = useCallback(async () => {
    // Sign exactly the transaction the summary was derived from (SEC-1).
    if (!signer || !tx || !intent) return;
    setSigning(true);
    setSignError(null);
    try {
      // Last look at the clock. The transaction may have sat on screen for a
      // while, and the wallet prompt is about to spend real capacity.
      assertNotExpired(intent, Math.floor(Date.now() / 1_000));
      setTxHash(await signer.sendTransaction(tx));
    } catch (error) {
      setSignError(presentableError(error));
    } finally {
      setSigning(false);
    }
  }, [signer, tx, intent]);

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
          {/* No prefix emphasis: on a hash the first four characters are just
              "0x" and two digits, and marking them implies a meaning they
              do not have. */}
          <Address value={txHash} label="Transaction hash" copyable prefix={false} />
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

  const claim = describeIntent(intent, now ?? Math.floor(Date.now() / 1_000));
  const payerPriced = intent.action === "request";

  // The payer's figure is checked as they type, so "Review" is only offered for
  // a number the SDK would actually accept.
  let amountProblem: string | null = null;
  if (payerPriced && amountInput.trim()) {
    try {
      validatePayerAmount(intent, amountInput.trim());
    } catch (error) {
      amountProblem = presentableError(error);
    }
  }
  const canReview = payerPriced && amountInput.trim().length > 0 && !amountProblem;

  return (
    <main className="page">
      <div className="chip-row">
        <Chip tone={claim.isMainnet ? "live" : undefined}>
          {networkName(intent.network)}
          {claim.isMainnet ? " · real funds" : null}
        </Chip>
        {remaining !== null ? (
          <Chip tone={expired ? "danger" : remaining < 300 ? "warn" : undefined}>
            {expired ? "Expired" : `Expires in ${formatRemaining(remaining)}`}
          </Chip>
        ) : null}
      </div>

      {/*
        The heading is the page's own words, always.

        It used to be the link's `label`, which handed attacker-controlled text
        the most authoritative position on a signing screen — the one place a
        reader is most likely to take as the site speaking. The label is still
        shown, but quoted and attributed to whoever made the link (SEC-4).
      */}
      <h1>Confirm this action</h1>
      <p className="lede">{claim.headline}</p>

      {intent.label || intent.note ? (
        <figure className="quote">
          <blockquote>
            {intent.label ? <strong>{intent.label}</strong> : null}
            {intent.note ? <span>{intent.note}</span> : null}
          </blockquote>
          <figcaption>— text supplied by whoever created this link</figcaption>
        </figure>
      ) : null}

      {/* SEC-4: provenance is stated outright, never implied. */}
      <Notice tone="warn">
        <p>
          Anyone can create one of these links. Check the recipient address below against
          where you actually meant to send funds.
        </p>
      </Notice>

      {expired ? (
        <>
          <Notice tone="danger">
            <p>
              This link has expired and can no longer be used. Nothing has been signed.
            </p>
          </Notice>
          <div className="actions">
            <Link href="/" className="btn">
              Back to start
            </Link>
          </div>
        </>
      ) : (
        <>
          <h2>What this link requests</h2>
          <div className="card card-quiet">
            {claim.amount !== null ? (
              <div className="hero">
                <div className="hero-caption">
                  {claim.recipients.length > 1
                    ? `Total across ${claim.recipients.length} recipients`
                    : "Amount requested"}
                </div>
                <div className="hero-amount">
                  {claim.amount}
                  <span className="hero-unit">CKB</span>
                </div>
              </div>
            ) : (
              <div className="hero">
                <div className="hero-caption">Amount</div>
                <div className="hero-note">You choose{boundsPhrase(claim.bounds)}</div>
              </div>
            )}
            <RecipientList
              copyable
              recipients={claim.recipients.map((recipient) => ({
                address: recipient.address,
                amount: recipient.amount,
                // Between the floor every lock clears and the one a standard
                // address needs. Constructible in principle, so the schema let
                // it through; likely to be refused once the lock is resolved.
                note: recipient.belowTypicalMinimum
                  ? `${recipient.amount} CKB is below the 61 CKB a standard address needs to pay for its own storage. This is likely to be refused when the transaction is built.`
                  : undefined,
              }))}
            />
          </div>

          {payerPriced ? (
            <div className="field" style={{ marginTop: "1.5rem" }}>
              <label htmlFor="payer-amount">How much do you want to send?</label>
              <input
                id="payer-amount"
                className="mono"
                value={amountInput}
                onChange={(e) => editAmount(e.target.value)}
                placeholder="100"
                inputMode="decimal"
                autoComplete="off"
                aria-invalid={amountProblem !== null}
                aria-describedby={amountProblem ? "payer-amount-error" : undefined}
              />
              {amountProblem ? (
                <p className="field-error" id="payer-amount-error" role="alert">
                  {amountProblem}
                </p>
              ) : (
                <p className="field-hint">
                  This figure is yours. The link cannot set it, only limit it.
                </p>
              )}
            </div>
          ) : null}

          {!signer ? (
            <>
              <p className="small muted" style={{ marginTop: "1rem" }}>
                Connect a wallet to see the exact transaction, including the network fee and
                the true total. Connecting does not sign anything.
              </p>
              <div className="actions actions-stack">
                <button className="btn btn-primary btn-block" onClick={open}>
                  Connect wallet
                </button>
              </div>
            </>
          ) : null}

          {signer && payerPriced && !summary && !building ? (
            <div className="actions actions-stack">
              <button
                className="btn btn-primary btn-block"
                onClick={() => void build(amountInput.trim())}
                disabled={!canReview}
              >
                Review this transaction
              </button>
            </div>
          ) : null}

          {signer && building ? (
            <>
              <h2>Preparing</h2>
              <div className="card">
                <div
                  className="skeleton"
                  style={{ height: "2.75rem", marginBottom: "1.25rem" }}
                />
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
                Nothing has been signed. This link cannot be completed with the wallet and
                network you are currently connected to.
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

                <div style={{ marginBottom: "1.15rem" }}>
                  <RecipientList
                    recipients={summary.payments.map((payment) => ({
                      address: payment.address,
                      amount: payment.amount,
                      note: payment.toSelf
                        ? "Your own wallet controls this address, so this capacity comes back to you."
                        : undefined,
                    }))}
                  />
                </div>

                <dl className="details">
                  {summary.payments.length > 1 ? (
                    <>
                      <dt>Sent to {summary.payments.length} recipients</dt>
                      <dd className="mono">{summary.paid} CKB</dd>
                    </>
                  ) : null}
                  <dt>Network fee</dt>
                  <dd className="mono">{summary.fee} CKB</dd>
                  <dt className="details-total">Total leaving your wallet</dt>
                  <dd className="details-total mono">{summary.totalDebit} CKB</dd>
                </dl>
              </div>

              {/*
                A payment to an address the signer already controls used to
                vanish from the summary entirely, because outputs were filtered
                by "is this lock mine". Now it is shown and explained — and with
                a split, only the legs that come back are called out.
              */}
              {summary.payments.some((payment) => payment.toSelf) ? (
                <div style={{ marginTop: "1.25rem" }}>
                  <Notice tone="warn">
                    <p>
                      {summary.payments.every((payment) => payment.toSelf)
                        ? "This link pays an address your own wallet controls. The capacity comes straight back to you, so only the network fee is actually spent."
                        : "Part of this link pays an address your own wallet controls. That capacity comes straight back to you, which is why the total below is smaller than the amounts above add up to."}
                    </p>
                  </Notice>
                </div>
              ) : null}

              {signError ? (
                <div style={{ marginTop: "1.25rem" }}>
                  <Notice tone="danger">
                    <p>{signError}</p>
                  </Notice>
                </div>
              ) : null}

              <div className="actions actions-stack actions-sticky">
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
        </>
      )}
    </main>
  );
}

/** Phrase a request's limits for the pre-connect view. */
function boundsPhrase(bounds: { min?: string; max?: string } | null): string {
  if (!bounds) return "";
  const { min, max } = bounds;
  if (min !== undefined && max !== undefined) return `, between ${min} and ${max} CKB`;
  if (min !== undefined) return `, at least ${min} CKB`;
  if (max !== undefined) return `, up to ${max} CKB`;
  return "";
}
