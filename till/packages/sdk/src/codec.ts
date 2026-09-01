/**
 * Fragment-URL codec: `#v1.<base64url(JSON)>`.
 *
 * The payload rides in the URL fragment, which browsers never transmit, so a
 * Till invoice link leaks nothing to whoever hosts the page — the property
 * that lets the whole product stay a static site anyone can self-host.
 *
 * The version tag sits outside the encoding so a future format can be
 * detected without decoding, and a v1 page can refuse a v2 link cleanly.
 */

import { TillError } from "./errors.ts";
import { validateInvoice, type Invoice } from "./invoice.ts";

export const FRAGMENT_PREFIX = "v1.";
export const MAX_PAYLOAD_CHARS = 4096;

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) {
    bin += String.fromCharCode(b);
  }
  const b64 =
    typeof btoa === "function"
      ? btoa(bin)
      : Buffer.from(bytes).toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) {
    throw new TillError("MALFORMED_LINK", "Payload is not valid base64url.");
  }
  const b64 =
    text.replace(/-/g, "+").replace(/_/g, "/") +
    "=".repeat((4 - (text.length % 4)) % 4);
  try {
    if (typeof atob === "function") {
      const bin = atob(b64);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) {
        out[i] = bin.charCodeAt(i);
      }
      return out;
    }
    return new Uint8Array(Buffer.from(b64, "base64"));
  } catch {
    throw new TillError("MALFORMED_LINK", "Payload is not valid base64.");
  }
}

/** Encode an invoice into the fragment string (without the leading `#`). */
export function encodeInvoiceFragment(invoice: Invoice): string {
  const json = JSON.stringify(invoice);
  const fragment = FRAGMENT_PREFIX + toBase64Url(new TextEncoder().encode(json));
  if (fragment.length > MAX_PAYLOAD_CHARS) {
    throw new TillError("OVERSIZED_PAYLOAD", "Invoice is too large to encode.");
  }
  return fragment;
}

/**
 * Decode an untrusted fragment into a validated Invoice.
 * Accepts with or without the leading `#`. Fails closed on everything else.
 */
export function decodeInvoiceFragment(fragment: string): Invoice {
  let text = fragment.startsWith("#") ? fragment.slice(1) : fragment;
  try {
    // Some chat clients percent-encode fragments when relaying links.
    text = decodeURIComponent(text);
  } catch {
    throw new TillError("MALFORMED_LINK", "Link fragment is not decodable.");
  }
  if (text.length === 0) {
    throw new TillError("MALFORMED_LINK", "The link carries no invoice.");
  }
  if (text.length > MAX_PAYLOAD_CHARS) {
    throw new TillError("OVERSIZED_PAYLOAD", "The link's payload is too large.");
  }
  if (!text.startsWith(FRAGMENT_PREFIX)) {
    const versionish = /^v([0-9]+)\./.exec(text);
    if (versionish) {
      throw new TillError(
        "UNSUPPORTED_VERSION",
        `This looks like a version-${versionish[1]} invoice; this page understands version 1 only.`,
      );
    }
    throw new TillError("MALFORMED_LINK", "The link is not a Till invoice.");
  }
  const bytes = fromBase64Url(text.slice(FRAGMENT_PREFIX.length));
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new TillError("MALFORMED_PAYLOAD", "The invoice payload is not valid JSON.");
  }
  return validateInvoice(parsed);
}

/** Build a shareable URL for an invoice against a given page base. */
export function invoiceUrl(baseUrl: string, invoice: Invoice): string {
  const trimmed = baseUrl.replace(/[#?].*$/, "").replace(/\/$/, "");
  return `${trimmed}#${encodeInvoiceFragment(invoice)}`;
}
