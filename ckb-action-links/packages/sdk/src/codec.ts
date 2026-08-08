/**
 * Link encoding and decoding.
 *
 * Wire format:  https://<host>/a#v1.<base64url(JSON)>
 *
 * The payload lives in the URL fragment. Browsers never send fragments to the
 * server, so the page host cannot observe which action a visitor opened — the
 * page is fully static and the same bundle serves every link.
 *
 * The `v1.` prefix sits outside the encoding so a version can be read, and a
 * future version cleanly rejected, without decoding anything first.
 */

import { ActionLinkError } from "./errors.ts";
import { LIMITS, PROTOCOL_VERSION, type ActionIntent } from "./intent.ts";
import { validateIntent } from "./validate.ts";

const PREFIX = `v${PROTOCOL_VERSION}.`;
const BASE64URL_CHARS = /^[A-Za-z0-9_-]+$/;

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(encoded: string): Uint8Array {
  const padding = encoded.length % 4 === 0 ? "" : "=".repeat(4 - (encoded.length % 4));
  const binary = atob(encoded.replace(/-/g, "+").replace(/_/g, "/") + padding);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Serialise a validated intent to a `v1.<base64url>` payload.
 * The intent is validated on the way out too — a malformed link should be
 * impossible to produce, not merely impossible to consume.
 */
export function encodeIntent(intent: ActionIntent): string {
  const validated = validateIntent(intent);
  const json = JSON.stringify(validated);
  const payload = PREFIX + toBase64Url(new TextEncoder().encode(json));
  if (payload.length > LIMITS.maxPayloadChars) {
    throw new ActionLinkError(
      "PAYLOAD_TOO_LARGE",
      "This action is too large to fit in a link.",
      `${payload.length} > ${LIMITS.maxPayloadChars}`,
    );
  }
  return payload;
}

/**
 * Decode a `v1.<base64url>` payload into a validated intent.
 * Every failure mode throws ActionLinkError — there is no partial success.
 */
export function decodePayload(payload: string): ActionIntent {
  const trimmed = payload.startsWith("#") ? payload.slice(1) : payload;

  if (trimmed.length === 0) {
    throw new ActionLinkError("MALFORMED_URL", "This link does not contain an action.");
  }
  // Size is checked before any decoding work, so an oversized payload costs
  // nothing to reject.
  if (trimmed.length > LIMITS.maxPayloadChars) {
    throw new ActionLinkError(
      "PAYLOAD_TOO_LARGE",
      "This link is too large to be a valid action.",
      `${trimmed.length} > ${LIMITS.maxPayloadChars}`,
    );
  }

  const separator = trimmed.indexOf(".");
  if (separator === -1) {
    throw new ActionLinkError("MALFORMED_URL", "This link is not a valid action link.");
  }

  const version = trimmed.slice(0, separator);
  if (version !== `v${PROTOCOL_VERSION}`) {
    throw new ActionLinkError(
      "UNSUPPORTED_VERSION",
      "This link was made for a different version of CKB Action Links.",
      `version=${version}`,
    );
  }

  const encoded = trimmed.slice(separator + 1);
  if (!BASE64URL_CHARS.test(encoded)) {
    throw new ActionLinkError(
      "MALFORMED_PAYLOAD",
      "This link is damaged — it may have been cut short when it was shared.",
      "payload is not base64url",
    );
  }

  // Two distinct failures, reported distinctly. Folding them together made
  // every truncated link say "not valid UTF-8", which sent debugging in the
  // wrong direction — a payload cut mid-share fails base64 decoding, not text
  // decoding. The user-facing message is the same either way; only the detail
  // carried on the error differs.
  let bytes: Uint8Array;
  try {
    bytes = fromBase64Url(encoded);
  } catch {
    throw new ActionLinkError(
      "MALFORMED_PAYLOAD",
      "This link is damaged — it may have been cut short when it was shared.",
      "payload is not decodable base64url",
    );
  }

  let json: string;
  try {
    json = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new ActionLinkError(
      "MALFORMED_PAYLOAD",
      "This link is damaged — it may have been cut short when it was shared.",
      "payload is not valid UTF-8",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new ActionLinkError(
      "MALFORMED_PAYLOAD",
      "This link is damaged — it may have been cut short when it was shared.",
      "payload is not valid JSON",
    );
  }

  return validateIntent(parsed);
}

/** Build a full shareable URL for an intent. */
export function buildActionUrl(intent: ActionIntent, baseUrl: string): string {
  const url = new URL(baseUrl);
  url.hash = encodeIntent(intent);
  return url.toString();
}

/**
 * Extract and decode the intent from a full action URL.
 * Accepts a URL, a bare fragment, or a bare payload — anything a user might
 * realistically paste.
 */
export function parseActionUrl(input: string): ActionIntent {
  const candidate = input.trim();

  if (candidate.startsWith(PREFIX) || candidate.startsWith("#")) {
    return decodePayload(candidate);
  }

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new ActionLinkError("MALFORMED_URL", "This is not a valid action link.");
  }

  if (!url.hash) {
    throw new ActionLinkError("MALFORMED_URL", "This link does not contain an action.");
  }
  return decodePayload(url.hash);
}
