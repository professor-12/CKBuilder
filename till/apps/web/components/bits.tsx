"use client";

/**
 * Small presentational pieces shared by every page.
 *
 * AddressText carries over a hard-won lesson from Action Links: visual
 * four-character grouping must be hidden from assistive technology, with a
 * visually-hidden plain-text copy that is announced because it is content —
 * an aria-label on a generic element is permitted to be ignored.
 */

import { sanitizeDisplayText, type SettlementStatus } from "@till/sdk";

export function AddressText({
  address,
  emphasizePrefix = true,
}: {
  address: string;
  emphasizePrefix?: boolean;
}) {
  const groups: string[] = [];
  for (let i = 0; i < address.length; i += 4) {
    groups.push(address.slice(i, i + 4));
  }
  return (
    <span className="addr">
      <span className="visually-hidden">{address}</span>
      <span aria-hidden="true">
        {groups.map((g, i) => (
          <span
            key={i}
            className={`grp${i === 0 && emphasizePrefix ? " prefix" : ""}`}
          >
            {g}
          </span>
        ))}
      </span>
    </span>
  );
}

export function Amount({
  value,
  asset,
}: {
  value: string;
  asset: string;
}) {
  return (
    <span className="amount">
      {value}
      <span className="asset">{sanitizeDisplayText(asset, 16)}</span>
    </span>
  );
}

const STATUS_COPY: Record<SettlementStatus, string> = {
  unpaid: "Awaiting payment",
  seen: "Payment seen — confirming",
  settled: "Settled",
  expired: "Expired",
};

export function StatusPill({ status }: { status: SettlementStatus }) {
  return <span className={`pill ${status}`}>{STATUS_COPY[status]}</span>;
}

export function NetworkPill({ network }: { network: "ckb" | "ckt" }) {
  return (
    <span className="pill net">
      {network === "ckb" ? "Mainnet" : "Testnet"}
    </span>
  );
}

/** Payload-supplied text: quoted and attributed, never the page's voice. */
export function Quoted({ text }: { text: string }) {
  return <p className="quoted">“{sanitizeDisplayText(text)}”</p>;
}

export function ProvenanceBanner() {
  return (
    <div className="banner caution" role="note">
      This invoice was created by someone else. Verify the recipient address
      before paying — Till proves what the chain settles, not who deserves it.
    </div>
  );
}
