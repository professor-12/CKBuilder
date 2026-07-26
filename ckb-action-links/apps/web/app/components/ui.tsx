import type { ReactNode } from "react";

/**
 * A CKB address, shown in full and chunked into groups of four.
 *
 * Truncating to `ckt1qz…r0n40` is the industry habit, and it is precisely what
 * an address-substitution attack relies on: swap the middle, keep the ends, and
 * the usual UI shows an identical string. Grouping keeps the whole address on
 * screen and legible enough that comparing it is realistic rather than
 * theoretical.
 */
export function Address({
  value,
  label,
  trailing,
}: {
  value: string;
  label?: string;
  trailing?: ReactNode;
}) {
  const groups = value.match(/.{1,4}/g) ?? [value];
  return (
    <div>
      {label ? (
        <div className="addr-label">
          <span>{label}</span>
          {trailing}
        </div>
      ) : null}
      {/* The full value stays selectable as one string for copy/paste. */}
      <div className="addr" title={value}>
        {groups.map((group, i) => (
          <span key={i} className={i === 0 ? "addr-prefix" : undefined}>
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

export function Chip({ children, tone }: { children: ReactNode; tone?: "live" }) {
  return (
    <span className={tone === "live" ? "chip chip-live" : "chip"}>
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
