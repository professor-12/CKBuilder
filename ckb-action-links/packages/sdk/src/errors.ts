/**
 * Typed, user-presentable failures.
 *
 * Every rejection path in this SDK throws an ActionLinkError. The `userMessage`
 * is written to be shown directly to a person opening a link — SEC-2 requires
 * that a link we cannot fully explain produces a plain-language refusal rather
 * than a silent fallback or a partially-rendered preview.
 */

export type ActionErrorCode =
  | "MALFORMED_URL"
  | "UNSUPPORTED_VERSION"
  | "PAYLOAD_TOO_LARGE"
  | "MALFORMED_PAYLOAD"
  | "UNKNOWN_ACTION"
  | "UNKNOWN_FIELD"
  | "INVALID_FIELD"
  | "INVALID_ADDRESS"
  | "NETWORK_MISMATCH"
  | "EXPIRED"
  | "BELOW_MIN_CAPACITY";

export class ActionLinkError extends Error {
  readonly code: ActionErrorCode;
  readonly userMessage: string;

  constructor(code: ActionErrorCode, userMessage: string, detail?: string) {
    super(detail ? `${code}: ${userMessage} (${detail})` : `${code}: ${userMessage}`);
    this.name = "ActionLinkError";
    this.code = code;
    this.userMessage = userMessage;
  }
}

export const isActionLinkError = (e: unknown): e is ActionLinkError =>
  e instanceof ActionLinkError;
