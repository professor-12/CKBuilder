"use client";

/**
 * Live settlement watching. The hook polls the chain and re-renders as the
 * invoice moves unpaid → seen → settled, and it keeps watching the clock so
 * an expiry lapse flips the page without a reload (the SEC-6 lesson: an
 * expiry checked once protects nothing).
 */

import { useEffect, useRef, useState } from "react";

import {
  PUBLIC_RPC,
  RpcClient,
  detectSettlement,
  type Invoice,
  type Settlement,
} from "@till/sdk";

const POLL_MS = 8_000;

export function useSettlement(invoice: Invoice | undefined): {
  settlement: Settlement | undefined;
  checking: boolean;
  error: string | undefined;
} {
  const [settlement, setSettlement] = useState<Settlement | undefined>();
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const busy = useRef(false);
  // The interval callback must see the latest result, not the one captured
  // when the effect ran — a settled invoice should stop the polling.
  const latest = useRef<Settlement | undefined>(undefined);

  useEffect(() => {
    if (!invoice) {
      return;
    }
    const rpc = new RpcClient(PUBLIC_RPC[invoice.network]);
    let cancelled = false;

    async function tick() {
      if (busy.current || cancelled) {
        return;
      }
      busy.current = true;
      setChecking(true);
      try {
        const result = await detectSettlement(invoice!, rpc);
        if (!cancelled) {
          latest.current = result;
          setSettlement(result);
          setError(undefined);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not check the chain.");
        }
      } finally {
        busy.current = false;
        if (!cancelled) {
          setChecking(false);
        }
      }
    }

    void tick();
    const interval = setInterval(() => {
      // A settled invoice stays settled; stop burning the node's time.
      if (latest.current?.status !== "settled") {
        void tick();
      }
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice && JSON.stringify(invoice)]);

  return { settlement, checking, error };
}

/** Seconds until expiry, ticking every second; undefined when no expiry. */
export function useExpiryCountdown(invoice: Invoice | undefined): number | undefined {
  const [left, setLeft] = useState<number | undefined>();
  useEffect(() => {
    if (!invoice?.expiry) {
      setLeft(undefined);
      return;
    }
    const update = () =>
      setLeft(Math.max(0, invoice.expiry! - Math.floor(Date.now() / 1000)));
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [invoice?.expiry]);
  return left;
}
