"use client";

import {
  ActionLinkError,
  buildActionUrl,
  type ActionIntent,
  type ActionType,
  type Network,
} from "@ckb-action-links/sdk";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { CopyButton, Notice, Qr } from "../components/ui";

/**
 * Expiry is offered as presets rather than a date picker.
 *
 * The absolute timestamp is captured once, when the preset is chosen. Deriving
 * it from the current time on every render would mean the generated link — and
 * its QR code — changed silently between looking at it and sharing it.
 */
const EXPIRY_PRESETS = [
  { id: "never", label: "Never", seconds: null },
  { id: "1h", label: "1 hour", seconds: 3_600 },
  { id: "24h", label: "24 hours", seconds: 86_400 },
  { id: "7d", label: "7 days", seconds: 604_800 },
] as const;

type ExpiryId = (typeof EXPIRY_PRESETS)[number]["id"];

const ACTIONS: { id: ActionType; label: string; hint: string }[] = [
  {
    id: "transfer",
    label: "Fixed amount",
    hint: "You set the figure. Whoever opens the link signs exactly that.",
  },
  {
    id: "request",
    label: "Payer chooses",
    hint: "They type the amount. Useful for tips and donations; you can set limits.",
  },
];

export default function NewLinkPage() {
  const [action, setAction] = useState<ActionType>("transfer");
  const [network, setNetwork] = useState<Network>("ckt");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [suggested, setSuggested] = useState("");
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const [expiryId, setExpiryId] = useState<ExpiryId>("never");
  const [expiresAt, setExpiresAt] = useState<number | null>(null);

  // The origin is only knowable in the browser, and the page is prerendered.
  const [origin, setOrigin] = useState<string | null>(null);
  useEffect(() => setOrigin(window.location.origin), []);

  const chooseExpiry = (id: ExpiryId) => {
    const preset = EXPIRY_PRESETS.find((p) => p.id === id)!;
    setExpiryId(id);
    setExpiresAt(
      preset.seconds === null ? null : Math.floor(Date.now() / 1000) + preset.seconds,
    );
  };

  const payerPriced = action === "request";

  /**
   * The link is derived from the form on every keystroke rather than built on a
   * button press. Validation runs on the way out, so the form can say why a
   * link cannot be made while it is being filled in — and a link that appears
   * at all is one the SDK has already accepted.
   */
  const result = useMemo((): { url: string } | { error: string } | null => {
    if (origin === null) return null;

    const intent = {
      v: 1,
      network,
      action,
      to: to.trim(),
      ...(payerPriced
        ? {
            ...(min.trim() ? { min: min.trim() } : {}),
            ...(max.trim() ? { max: max.trim() } : {}),
            ...(suggested.trim() ? { suggested: suggested.trim() } : {}),
          }
        : { amount: amount.trim() }),
      ...(label.trim() ? { label: label.trim() } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
      ...(expiresAt !== null ? { expiry: expiresAt } : {}),
    } as ActionIntent;

    try {
      return { url: buildActionUrl(intent, `${origin}/a`) };
    } catch (e) {
      return {
        error: e instanceof ActionLinkError ? e.userMessage : "Could not create this link.",
      };
    }
  }, [origin, network, action, to, amount, min, max, suggested, label, note, expiresAt, payerPriced]);

  // Only complain once the required fields have something in them. Telling
  // someone their address is invalid before they have typed one is noise.
  const required = to.trim().length > 0 && (payerPriced || amount.trim().length > 0);
  const link = result && "url" in result ? result.url : null;
  const error = required && result && "error" in result ? result.error : null;

  const share = async () => {
    if (!link || !navigator.share) return;
    try {
      await navigator.share({ title: label.trim() || "CKB Action Link", url: link });
    } catch {
      // Dismissing the share sheet is a cancellation, not a failure.
    }
  };

  return (
    <main className="page">
      <h1>Create an action link</h1>
      <p className="lede">
        Everything you enter is encoded into the link itself. Nothing is sent to a server, and
        no account is involved.
      </p>

      <div className="field">
        <span className="field-caption" id="action-label">
          What the link asks for
        </span>
        <div className="segmented" role="group" aria-labelledby="action-label">
          {ACTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={action === option.id}
              onClick={() => setAction(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="field-hint">{ACTIONS.find((o) => o.id === action)!.hint}</p>
      </div>

      <div className="field">
        {/* A group of buttons, not a single control, so this is a caption
            rather than a <label> pointing at one input. */}
        <span className="field-caption" id="network-label">
          Network
        </span>
        <div className="segmented" role="group" aria-labelledby="network-label">
          <button type="button" aria-pressed={network === "ckt"} onClick={() => setNetwork("ckt")}>
            Testnet
          </button>
          <button type="button" aria-pressed={network === "ckb"} onClick={() => setNetwork("ckb")}>
            Mainnet
          </button>
        </div>
      </div>

      {network === "ckb" ? (
        <Notice tone="warn">
          <p>
            Mainnet links move real funds. Anyone who opens this link and signs will send
            actual CKB to the address below.
          </p>
        </Notice>
      ) : null}

      <div className="field">
        <label htmlFor="to">Recipient address</label>
        <input
          id="to"
          className="mono"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder={network === "ckt" ? "ckt1…" : "ckb1…"}
          spellCheck={false}
          autoComplete="off"
        />
        <p className="field-hint">
          Must be {network === "ckt" ? "a testnet" : "a mainnet"} address — the network and the
          address prefix have to agree.
        </p>
      </div>

      {payerPriced ? (
        <>
          <div className="field-row">
            <div className="field">
              <label htmlFor="min">Minimum — optional</label>
              <input
                id="min"
                className="mono"
                value={min}
                onChange={(e) => setMin(e.target.value)}
                placeholder="61"
                inputMode="decimal"
                autoComplete="off"
              />
            </div>
            <div className="field">
              <label htmlFor="max">Maximum — optional</label>
              <input
                id="max"
                className="mono"
                value={max}
                onChange={(e) => setMax(e.target.value)}
                placeholder="1000"
                inputMode="decimal"
                autoComplete="off"
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="suggested">Suggested amount — optional</label>
            <input
              id="suggested"
              className="mono"
              value={suggested}
              onChange={(e) => setSuggested(e.target.value)}
              placeholder="100"
              inputMode="decimal"
              autoComplete="off"
            />
            <p className="field-hint">
              Pre-filled for the payer, who can always change it. A cell must hold at least 61
              CKB to pay for its own storage, so anything smaller will be refused.
            </p>
          </div>
        </>
      ) : (
        <div className="field">
          <label htmlFor="amount">Amount</label>
          <input
            id="amount"
            className="mono"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="100"
            inputMode="decimal"
            autoComplete="off"
          />
          <p className="field-hint">
            In CKB, up to 8 decimal places. A cell must hold at least 61 CKB to pay for its own
            storage, so smaller transfers will be refused.
          </p>
        </div>
      )}

      <div className="field">
        <span className="field-caption" id="expiry-label">
          Expires
        </span>
        <div className="segmented" role="group" aria-labelledby="expiry-label">
          {EXPIRY_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              aria-pressed={expiryId === preset.id}
              onClick={() => chooseExpiry(preset.id)}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <p className="field-hint">
          {expiresAt === null
            ? "The link stays usable until you stop sharing it."
            : `Refuses to build after ${new Date(expiresAt * 1_000).toLocaleString()}.`}
        </p>
      </div>

      <div className="field">
        <label htmlFor="label">Label — optional</label>
        <input
          id="label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Coffee"
          maxLength={64}
        />
        <p className="field-hint">
          Shown to whoever opens the link, quoted as your words rather than as the page&rsquo;s.
        </p>
      </div>

      <div className="field">
        <label htmlFor="note">Note — optional</label>
        <textarea
          id="note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={256}
        />
      </div>

      {error ? (
        <div className="result-slot">
          <Notice tone="danger">
            <p>{error}</p>
          </Notice>
        </div>
      ) : null}

      {link ? (
        <>
          <h2>Your link</h2>
          <div className="card">
            <div className="qr-wrap">
              <Qr value={link} />
            </div>

            <div className="link-out">{link}</div>

            <div className="actions">
              <CopyButton value={link} label="Copy link" className="btn btn-primary" />
              <a className="btn" href={link} target="_blank" rel="noreferrer">
                Open it yourself
              </a>
              {typeof navigator !== "undefined" && "share" in navigator ? (
                <button type="button" className="btn" onClick={share}>
                  Share
                </button>
              ) : null}
            </div>
          </div>
          <p className="small muted">
            Open it once before you share it. What you see is what everyone else will see.
          </p>
        </>
      ) : (
        <div className="card card-quiet empty-slot">
          <p className="small muted" style={{ marginBottom: 0 }}>
            {required
              ? "Fix the details above and the link will appear here."
              : "Fill in a recipient and an amount. The link appears here as you type."}
          </p>
        </div>
      )}

      <div className="actions">
        <Link href="/" className="btn">
          Back to start
        </Link>
        <Link href="/inspect" className="btn">
          Inspect a link
        </Link>
      </div>
    </main>
  );
}
