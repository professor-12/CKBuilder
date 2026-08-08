"use client";

import qrcode from "qrcode-generator";
import { useEffect, useMemo, useState, type ReactNode } from "react";

/**
 * A CKB address, shown in full and chunked into groups of four.
 *
 * Truncating to `ckt1qz…r0n40` is the industry habit, and it is precisely what
 * an address-substitution attack relies on: swap the middle, keep the ends, and
 * the usual UI shows an identical string. Grouping keeps the whole address on
 * screen and legible enough that comparing it is realistic rather than
 * theoretical.
 *
 * The grouping is visual only. Assistive technology gets the address as one
 * unbroken string, because a screen reader announcing it in four-character
 * chunks is harder to check against another address, not easier.
 */
export function Address({
  value,
  label,
  trailing,
  copyable = false,
}: {
  value: string;
  label?: string;
  trailing?: ReactNode;
  copyable?: boolean;
}) {
  const groups = value.match(/.{1,4}/g) ?? [value];
  return (
    <div>
      {label || trailing || copyable ? (
        <div className="addr-label">
          <span>{label}</span>
          <span className="addr-label-end">
            {trailing}
            {copyable ? <CopyButton value={value} className="btn btn-mini" /> : null}
          </span>
        </div>
      ) : null}
      {/* The full value stays selectable as one string for copy/paste. */}
      <div className="addr" title={value} aria-label={value}>
        {groups.map((group, i) => (
          <span key={i} className={i === 0 ? "addr-prefix" : undefined} aria-hidden>
            {group}
          </span>
        ))}
      </div>
    </div>
  );
}

/** A monetary amount with its unit de-emphasised, in tabular figures. */
export function Amount({ value, unit = "CKB" }: { value: string; unit?: string }) {
  return (
    <span className="mono">
      {value}
      <span className="muted"> {unit}</span>
    </span>
  );
}

export function Chip({
  children,
  tone,
}: {
  children: ReactNode;
  tone?: "live" | "warn" | "danger";
}) {
  return (
    <span className={tone ? `chip chip-${tone}` : "chip"}>
      <span className="chip-dot" aria-hidden />
      {children}
    </span>
  );
}

export function Notice({
  tone,
  children,
}: {
  tone: "warn" | "danger" | "ok";
  children: ReactNode;
}) {
  return (
    <div className={`notice notice-${tone}`} role={tone === "danger" ? "alert" : undefined}>
      <span className="notice-icon" aria-hidden>
        {tone === "ok" ? <CheckIcon /> : <AlertIcon />}
      </span>
      <div>{children}</div>
    </div>
  );
}

export function Spinner() {
  return <span className="spinner" aria-hidden />;
}

/**
 * Copy to clipboard, with the failure path actually handled.
 *
 * `navigator.clipboard` is undefined outside a secure context and its write can
 * be rejected outright by the browser. The previous version awaited it bare, so
 * a refusal produced an unhandled rejection and a button that simply never said
 * "Copied" — leaving someone to paste a link they had not copied.
 */
export function CopyButton({
  value,
  label = "Copy",
  className = "btn",
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (state === "idle") return;
    const id = setTimeout(() => setState("idle"), 2_500);
    return () => clearTimeout(id);
  }, [state]);

  const copy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      setState("failed");
    }
  };

  return (
    <>
      <button type="button" className={className} onClick={copy}>
        {state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : label}
      </button>
      {/* The button label carries the outcome visually; this announces it, and
          adds the fallback instruction a sighted user gets from the label. */}
      <span className="sr-live" role="status" aria-live="polite">
        {state === "copied" ? "Copied to clipboard." : null}
        {state === "failed"
          ? "Could not copy. Select the text and copy it manually."
          : null}
      </span>
    </>
  );
}

/**
 * A QR code for an action link, drawn as one SVG path.
 *
 * Deliberately not theme-aware. Every other surface here follows the reader's
 * colour scheme; a QR code has to stay dark-on-light or scanners lose it, so
 * this element keeps its own white card in dark mode.
 *
 * Encoding is byte mode, because a base64url payload is mixed-case and cannot
 * use the denser alphanumeric mode. That puts a real ceiling on how much a
 * scannable link can carry, so exceeding it is reported rather than thrown.
 */
export function Qr({ value, size = 200 }: { value: string; size?: number }) {
  const model = useMemo(() => {
    try {
      const qr = qrcode(0, "M");
      qr.addData(value);
      qr.make();
      const count = qr.getModuleCount();
      let path = "";
      for (let row = 0; row < count; row++) {
        for (let col = 0; col < count; col++) {
          if (qr.isDark(row, col)) path += `M${col} ${row}h1v1h-1z`;
        }
      }
      return { count, path };
    } catch {
      return null;
    }
  }, [value]);

  if (!model) {
    return (
      <p className="small muted qr-fallback">
        This link is too long to fit in a scannable QR code. Shorten the label or note, or
        share the link as text.
      </p>
    );
  }

  const quiet = 2; // The spec's quiet zone. Without it, scanners miss the edges.
  const span = model.count + quiet * 2;

  return (
    <svg
      className="qr"
      width={size}
      height={size}
      viewBox={`0 0 ${span} ${span}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label="QR code containing this action link"
    >
      <rect width={span} height={span} fill="#ffffff" />
      <path d={model.path} transform={`translate(${quiet} ${quiet})`} fill="#000000" />
    </svg>
  );
}

/**
 * The current time in unix seconds, ticking once a second.
 *
 * Null until the first client tick. The page is prerendered, and a clock read
 * during prerender would disagree with the browser's on hydration — so nothing
 * time-dependent renders until there is a real reading to render from.
 */
export function useNowSeconds(active = true): number | null {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    if (!active) return;
    setNow(Math.floor(Date.now() / 1000));
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1_000);
    return () => clearInterval(id);
  }, [active]);

  return now;
}

function AlertIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor">
      <circle cx="8" cy="8" r="6.75" strokeWidth="1.5" />
      <path d="M8 4.75v3.75" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="11.25" r="0.85" fill="currentColor" stroke="none" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor">
      <circle cx="8" cy="8" r="6.75" strokeWidth="1.5" />
      <path
        d="M5.25 8.25l1.9 1.9 3.6-3.9"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
