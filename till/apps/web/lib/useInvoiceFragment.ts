"use client";

/**
 * Read and validate the invoice from the URL fragment — after mount, because
 * the fragment only exists in the browser and a prerendered page must not
 * disagree with its first client render.
 */

import { useEffect, useState } from "react";

import { decodeInvoiceFragment, isTillError, type Invoice } from "@till/sdk";

export function useInvoiceFragment(): {
  invoice: Invoice | undefined;
  fragment: string | undefined;
  problem: string | undefined;
  loaded: boolean;
} {
  const [state, setState] = useState<{
    invoice?: Invoice;
    fragment?: string;
    problem?: string;
    loaded: boolean;
  }>({ loaded: false });

  useEffect(() => {
    const apply = () => {
      const rawFragment = window.location.hash;
      if (rawFragment.length <= 1) {
        setState({
          problem:
            "This page expects an invoice in the link. Ask the merchant to share the full link.",
          loaded: true,
        });
        return;
      }
      try {
        const invoice = decodeInvoiceFragment(rawFragment);
        setState({ invoice, fragment: rawFragment.slice(1), loaded: true });
      } catch (e) {
        setState({
          problem: isTillError(e)
            ? e.message
            : "This link could not be read as an invoice.",
          loaded: true,
        });
      }
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, []);

  return {
    invoice: state.invoice,
    fragment: state.fragment,
    problem: state.problem,
    loaded: state.loaded,
  };
}
