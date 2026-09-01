"use client";

import { useMemo, useState } from "react";

import {
  KNOWN_TOKENS,
  PUBLIC_RPC,
  RpcClient,
  checkAddressShape,
  createInvoice,
  encodeInvoiceFragment,
  isTillError,
  nonceDigitsFor,
  rawAmountOf,
  type Invoice,
  type Network,
  type UdtDescriptor,
} from "@till/sdk";

import { AddressText, Amount, NetworkPill } from "../../components/bits";
import { QrCode } from "../../components/QrCode";
import { addInvoice, listEntries } from "../../lib/ledger";

type AssetChoice = "ckb" | `token:${number}` | "custom";

export default function NewInvoicePage() {
  const [network, setNetwork] = useState<Network>("ckt");
  const [assetChoice, setAssetChoice] = useState<AssetChoice>("ckb");
  const [custom, setCustom] = useState({
    codeHash: "",
    hashType: "type",
    args: "",
    symbol: "",
    decimals: "8",
  });
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [label, setLabel] = useState("");
  const [memo, setMemo] = useState("");
  const [expiryMinutes, setExpiryMinutes] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | undefined>();
  const [created, setCreated] = useState<
    { invoice: Invoice; url: string } | undefined
  >();

  const udt: UdtDescriptor | undefined = useMemo(() => {
    if (assetChoice === "ckb") {
      return undefined;
    }
    if (assetChoice.startsWith("token:")) {
      const token = KNOWN_TOKENS[Number(assetChoice.slice(6))];
      if (!token) {
        return undefined;
      }
      const { codeHash, hashType, args, symbol, decimals } = token;
      return { codeHash, hashType, args, symbol, decimals };
    }
    const decimals = Number(custom.decimals);
    return {
      codeHash: custom.codeHash.trim().toLowerCase(),
      hashType: custom.hashType as UdtDescriptor["hashType"],
      args: custom.args.trim().toLowerCase(),
      symbol: custom.symbol.trim() || "UDT",
      decimals: Number.isInteger(decimals) ? decimals : -1,
    };
  }, [assetChoice, custom]);

  const decimals = udt ? udt.decimals : 8;
  const dustDigits = (() => {
    try {
      return nonceDigitsFor(decimals);
    } catch {
      return 0;
    }
  })();

  async function create() {
    setProblem(undefined);
    setBusy(true);
    try {
      checkAddressShape(to.trim(), network);
      const rpc = new RpcClient(PUBLIC_RPC[network]);
      const tipBlock = await rpc.getTipBlockNumber();
      const assetKey =
        udt === undefined
          ? "ckb"
          : `${udt.codeHash}|${udt.hashType}|${udt.args}`;
      const openAmounts = listEntries()
        .filter(({ entry, invoice }) => {
          if (entry.lastStatus === "settled" || entry.lastStatus === "expired") {
            return false;
          }
          const key =
            invoice.asset === "udt"
              ? `${invoice.udt!.codeHash}|${invoice.udt!.hashType}|${invoice.udt!.args}`
              : "ckb";
          return key === assetKey && invoice.to === to.trim();
        })
        .map(({ invoice }) => rawAmountOf(invoice));
      const minutes = expiryMinutes.trim() === "" ? undefined : Number(expiryMinutes);
      if (minutes !== undefined && (!Number.isInteger(minutes) || minutes <= 0)) {
        throw new Error("Expiry must be a whole number of minutes.");
      }
      const { invoice } = createInvoice({
        network,
        asset: udt ? "udt" : "ckb",
        ...(udt ? { udt } : {}),
        to: to.trim(),
        amount: amount.trim(),
        ...(label.trim() ? { label: label.trim() } : {}),
        ...(memo.trim() ? { memo: memo.trim() } : {}),
        now: Math.floor(Date.now() / 1000),
        tipBlock,
        ...(minutes !== undefined ? { expiresInSeconds: minutes * 60 } : {}),
        openAmounts,
      });
      addInvoice(invoice);
      const url = `${window.location.origin}/pay/#${encodeInvoiceFragment(invoice)}`;
      setCreated({ invoice, url });
    } catch (e) {
      setProblem(
        isTillError(e) || e instanceof Error
          ? e.message
          : "Could not create the invoice.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    const statusUrl = `/invoice/#${encodeInvoiceFragment(created.invoice)}`;
    return (
      <div>
        <h1>Invoice created</h1>
        <div className="receipt">
          <div className="row">
            <span className="k">Network</span>
            <NetworkPill network={created.invoice.network} />
          </div>
          <div className="row">
            <span className="k">Ask</span>
            <Amount
              value={created.invoice.amount}
              asset={
                created.invoice.asset === "udt"
                  ? created.invoice.udt!.symbol
                  : "CKB"
              }
            />
          </div>
          <div className="row">
            <span className="k">To</span>
            <span className="v">
              <AddressText address={created.invoice.to} />
            </span>
          </div>
          <hr className="receipt-rule" />
          <p className="muted">
            The last digits are Till's detection dust — the payment must match
            this exact amount to be recognised, so share the link rather than
            retyping the number.
          </p>
          <QrCode text={created.url} label="QR code of the payment link" />
          <p className="mono">{created.url}</p>
          <div className="btnrow">
            <button
              className="btn primary"
              onClick={() => navigator.clipboard.writeText(created.url)}
            >
              Copy payment link
            </button>
            <a className="btn" href={statusUrl}>
              Watch settlement
            </a>
            <button className="btn ghost" onClick={() => setCreated(undefined)}>
              New invoice
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1>New invoice</h1>
      <p className="muted">
        Nothing here leaves this device: the invoice lives entirely inside the
        link Till generates.
      </p>
      {problem ? (
        <div className="banner error" role="alert">
          {problem}
        </div>
      ) : undefined}
      <div className="card">
        <label className="field">
          Network
          <select
            value={network}
            onChange={(e) => setNetwork(e.target.value as Network)}
          >
            <option value="ckt">Testnet (ckt)</option>
            <option value="ckb">Mainnet (ckb)</option>
          </select>
        </label>
        <label className="field">
          Asset
          <select
            value={assetChoice}
            onChange={(e) => setAssetChoice(e.target.value as AssetChoice)}
          >
            <option value="ckb">CKB</option>
            {network === "ckb"
              ? KNOWN_TOKENS.map((t, i) => (
                  <option key={t.symbol} value={`token:${i}`}>
                    {t.name}
                  </option>
                ))
              : undefined}
            <option value="custom">Custom token (by type script)</option>
          </select>
        </label>
        {assetChoice === "custom" ? (
          <div>
            <label className="field">
              Token code hash
              <input
                value={custom.codeHash}
                onChange={(e) => setCustom({ ...custom, codeHash: e.target.value })}
                placeholder="0x…32 bytes"
              />
            </label>
            <label className="field">
              Hash type
              <select
                value={custom.hashType}
                onChange={(e) => setCustom({ ...custom, hashType: e.target.value })}
              >
                <option value="type">type</option>
                <option value="data1">data1</option>
                <option value="data">data</option>
                <option value="data2">data2</option>
              </select>
            </label>
            <label className="field">
              Token args
              <input
                value={custom.args}
                onChange={(e) => setCustom({ ...custom, args: e.target.value })}
                placeholder="0x…"
              />
            </label>
            <label className="field">
              Symbol
              <input
                value={custom.symbol}
                onChange={(e) => setCustom({ ...custom, symbol: e.target.value })}
                placeholder="USDI"
              />
            </label>
            <label className="field">
              Decimals
              <input
                value={custom.decimals}
                onChange={(e) => setCustom({ ...custom, decimals: e.target.value })}
                inputMode="numeric"
              />
            </label>
          </div>
        ) : undefined}
        <label className="field">
          Receiving address{" "}
          <span className="hint">
            (watch-only — no wallet connection needed to get paid)
          </span>
          <input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder={network === "ckb" ? "ckb1…" : "ckt1…"}
          />
        </label>
        <label className="field">
          Amount{" "}
          {dustDigits > 0 ? (
            <span className="hint">
              (leave the last {dustDigits} decimal places to Till — they become
              the detection dust)
            </span>
          ) : (
            <span className="hint">
              (this asset has too few decimals for detection dust; each open
              invoice needs a distinct amount)
            </span>
          )}
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="125"
            inputMode="decimal"
          />
        </label>
        <label className="field">
          Label <span className="hint">(shown to the payer, optional)</span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={64}
          />
        </label>
        <label className="field">
          Memo <span className="hint">(optional)</span>
          <input
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            maxLength={256}
          />
        </label>
        <label className="field">
          Expires in minutes <span className="hint">(optional)</span>
          <input
            value={expiryMinutes}
            onChange={(e) => setExpiryMinutes(e.target.value)}
            inputMode="numeric"
            placeholder="60"
          />
        </label>
        <div className="btnrow">
          <button className="btn primary" onClick={create} disabled={busy}>
            {busy ? "Creating…" : "Create invoice"}
          </button>
        </div>
      </div>
    </div>
  );
}
