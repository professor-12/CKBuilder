/**
 * Typed, user-presentable errors. Every code maps to copy a page can show;
 * nothing downstream should ever have to present a raw exception message.
 */

export type TillErrorCode =
  // codec / validation
  | "MALFORMED_LINK"
  | "UNSUPPORTED_VERSION"
  | "MALFORMED_PAYLOAD"
  | "UNKNOWN_FIELD"
  | "INVALID_FIELD"
  | "OVERSIZED_PAYLOAD"
  | "NETWORK_MISMATCH"
  // amounts
  | "INVALID_AMOUNT"
  | "AMOUNT_PRECISION"
  | "AMOUNT_TOO_SMALL"
  | "NONCE_SPACE_OCCUPIED"
  | "NONCE_EXHAUSTED"
  // detection / rpc
  | "RPC_UNAVAILABLE"
  | "RPC_MALFORMED_RESPONSE"
  | "INVOICE_EXPIRED";

export class TillError extends Error {
  readonly code: TillErrorCode;

  constructor(code: TillErrorCode, message: string) {
    super(message);
    this.name = "TillError";
    this.code = code;
  }
}

export function isTillError(e: unknown): e is TillError {
  return e instanceof TillError;
}
