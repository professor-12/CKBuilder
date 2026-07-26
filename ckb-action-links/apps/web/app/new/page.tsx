"use client";

import {
  ActionLinkError,
  buildActionUrl,
  type Network,
  type TransferIntent,
} from "@ckb-action-links/sdk";
import Link from "next/link";
import { useState } from "react";

import { Notice } from "../components/ui";

export default function NewLinkPage() {
  const [network, setNetwork] = useState<Network>("ckt");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");

  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const reset = () => {
    setLink(null);
    setError(null);
    setCopied(false);
  };

  const generate = () => {
    setCopied(false);
    try {
      const intent: TransferIntent = {
        v: 1,
        network,
        action: "transfer",
        to: to.trim(),
        amount: amount.trim(),
        ...(label.trim() ? { label: label.trim() } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      };
      // Validation runs on the way out too, so a broken link is impossible to
      // produce rather than merely impossible to consume.
      setLink(buildActionUrl(intent, `${window.location.origin}/a`));
      setError(null);
    } catch (e) {
      setLink(null);
      setError(e instanceof ActionLinkError ? e.userMessage : "Could not create this link.");
    }
  };

  const copy = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
  };

  return (
    <main className="page">
      <h1>Create an action link</h1>
      <p className="lede">
        Everything you enter is encoded into the link itself. Nothing is sent to a server, and
        no account is involved.
      </p>

      <div className="field">
        {/* A group of buttons, not a single control, so this is a caption
            rather than a <label> pointing at one input. */}
        <span className="field-caption" id="network-label">
          Network
        </span>
        <div className="segmented" role="group" aria-labelledby="network-label">
          <button
            type="button"
            aria-pressed={network === "ckt"}
            onClick={() => {
              setNetwork("ckt");
              reset();
            }}
          >
            Testnet
          </button>
          <button
            type="button"
            aria-pressed={network === "ckb"}
            onClick={() => {
              setNetwork("ckb");
              reset();
            }}
          >
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
          onChange={(e) => {
            setTo(e.target.value);
            reset();
          }}
          placeholder={network === "ckt" ? "ckt1…" : "ckb1…"}
          spellCheck={false}
          autoComplete="off"
        />
        <p className="field-hint">
          Must be {network === "ckt" ? "a testnet" : "a mainnet"} address — the network and the
          address prefix have to agree.
        </p>
      </div>

      <div className="field">
        <label htmlFor="amount">Amount</label>
        <input
          id="amount"
          className="mono"
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
            reset();
          }}
          placeholder="100"
          inputMode="decimal"
          autoComplete="off"
        />
        <p className="field-hint">
          In CKB, up to 8 decimal places. A cell must hold at least 61 CKB to pay for its own
          storage, so smaller transfers will be refused.
        </p>
      </div>

      <div className="field">
        <label htmlFor="label">Label — optional</label>
        <input
          id="label"
          value={label}
          onChange={(e) => {
            setLabel(e.target.value);
            reset();
          }}
          placeholder="Coffee"
          maxLength={64}
        />
        <p className="field-hint">Shown as the heading when someone opens the link.</p>
      </div>

      <div className="field">
        <label htmlFor="note">Note — optional</label>
        <textarea
          id="note"
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
            reset();
          }}
          rows={2}
          maxLength={256}
        />
      </div>

      <div className="actions">
        <button className="btn btn-primary" onClick={generate}>
          Generate link
        </button>
        <Link href="/" className="btn">
          Cancel
        </Link>
      </div>

      {error ? (
        <div style={{ marginTop: "1.5rem" }}>
          <Notice tone="danger">
            <p>{error}</p>
          </Notice>
        </div>
      ) : null}

      {link ? (
        <>
          <h2>Your link</h2>
          <div className="card">
            <div className="link-out">{link}</div>
            <div className="actions">
              <button className="btn btn-primary" onClick={copy}>
                {copied ? "Copied" : "Copy link"}
              </button>
              <a className="btn" href={link} target="_blank" rel="noreferrer">
                Preview it yourself
              </a>
            </div>
          </div>
          <p className="small muted">
            Open it once before you share it. What you see is what everyone else will see.
          </p>
        </>
      ) : null}
    </main>
  );
}
