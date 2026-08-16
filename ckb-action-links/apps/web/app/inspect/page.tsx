"use client";

import {
  ActionLinkError,
  describeIntent,
  formatRemaining,
  parseActionUrl,
  type ActionErrorCode,
  type ActionIntent,
} from "@ckb-action-links/sdk";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Chip, Notice, RecipientList, useNowSeconds } from "../components/ui";

/** Human wording for an action name, so a machine token never faces a reader. */
const ACTION_LABEL: Record<string, string> = {
  transfer: "Fixed amount",
  request: "Payer chooses",
  split: "Several recipients",
};

type InspectResult =
  | { ok: true; intent: ActionIntent }
  | { ok: false; error: string; code: ActionErrorCode | null };

/**
 * Read a link without opening it.
 *
 * The confirmation page is the only surface that may offer a signature, so this
 * one deliberately offers none: no wallet, no build, no fee, no total. It shows
 * what the link *claims*, which is all that can be known without a wallet, and
 * it says so in as many words.
 *
 * It exists because "paste the link somewhere that can read it for you" is
 * better advice than "open it and see", and because a link that fails to decode
 * should be diagnosable without going near a signing screen.
 */
export default function InspectPage() {
  const [input, setInput] = useState("");
  const now = useNowSeconds();

  const result = useMemo((): InspectResult | null => {
    const trimmed = input.trim();
    if (!trimmed) return null;
    try {
      return { ok: true, intent: parseActionUrl(trimmed) };
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof ActionLinkError ? error.userMessage : "This is not an action link.",
        code: error instanceof ActionLinkError ? error.code : null,
      };
    }
  }, [input]);

  const claim = result?.ok
    ? describeIntent(result.intent, now ?? Math.floor(Date.now() / 1_000))
    : null;

  return (
    <main className="page">
      <h1>Inspect a link</h1>
      <p className="lede">
        Paste an action link to see what it asks for. Nothing is built, no wallet is
        contacted, and nothing here can be signed.
      </p>

      <div className="field">
        <label htmlFor="link">Action link</label>
        <textarea
          id="link"
          className="mono"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={4}
          placeholder="https://…/a#v1.…"
          spellCheck={false}
        />
        <p className="field-hint">
          A full URL, a bare fragment, or just the <span className="mono">v1.</span> payload.
        </p>
      </div>

      {result && !result.ok ? (
        <>
          <Notice tone="danger">
            <p>{result.error}</p>
          </Notice>
          {result.code ? (
            <p className="small muted">
              Refused as <span className="mono">{result.code}</span>. A link this app cannot
              fully read is never offered for signing.
            </p>
          ) : null}
        </>
      ) : null}

      {claim ? (
        <>
          <div className="chip-row">
            <Chip tone={claim.isMainnet ? "live" : undefined}>
              {claim.networkLabel}
              {claim.isMainnet ? " · real funds" : null}
            </Chip>
            <Chip>{ACTION_LABEL[claim.action] ?? claim.action}</Chip>
            {claim.secondsRemaining !== null ? (
              <Chip tone={claim.expired ? "danger" : undefined}>
                {claim.expired
                  ? "Expired"
                  : `Expires in ${formatRemaining(claim.secondsRemaining)}`}
              </Chip>
            ) : null}
          </div>

          <h2>What it claims</h2>
          <div className="card">
            <div className="hero">
              <div className="hero-caption">This link asks you to</div>
              <div className="hero-note">{claim.headline}</div>
            </div>

            <RecipientList
              copyable
              recipients={claim.recipients.map((recipient) => ({
                address: recipient.address,
                amount: recipient.amount,
                note: recipient.belowTypicalMinimum
                  ? `${recipient.amount} CKB is below the 61 CKB a standard address needs to pay for its own storage. This is likely to be refused when the transaction is built.`
                  : undefined,
              }))}
            />

            <dl className="details" style={{ marginTop: "1.15rem" }}>
              <dt>Network</dt>
              <dd>{claim.networkLabel}</dd>
              {claim.recipients.length > 1 ? (
                <>
                  <dt>Recipients</dt>
                  <dd>{claim.recipients.length}</dd>
                </>
              ) : null}
              <dt>Expires</dt>
              <dd>
                {claim.expiresAt === null
                  ? "Never"
                  : new Date(claim.expiresAt * 1_000).toLocaleString()}
              </dd>
            </dl>
          </div>

          {claim.label || claim.note ? (
            <>
              <h2>Text it carries</h2>
              <figure className="quote">
                <blockquote>
                  {claim.label ? <strong>{claim.label}</strong> : null}
                  {claim.note ? <span>{claim.note}</span> : null}
                </blockquote>
                <figcaption>— supplied by whoever created this link</figcaption>
              </figure>
            </>
          ) : null}

          <Notice tone="warn">
            <p>
              These are the link&rsquo;s own claims, not a transaction. The fee and the true
              total cannot be known until a wallet is connected on the confirmation page.
            </p>
          </Notice>

          <div className="actions">
            <Link href="/new" className="btn">
              Create a link
            </Link>
          </div>
        </>
      ) : null}

      {!result ? (
        <div className="card card-quiet empty-slot">
          <p className="small muted" style={{ marginBottom: 0 }}>
            Paste a link above to read it.
          </p>
        </div>
      ) : null}
    </main>
  );
}
