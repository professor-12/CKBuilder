"use client";

import { ccc } from "@ckb-ccc/connector-react";
import type { ReactNode } from "react";

const testnet = new ccc.ClientPublicTestnet();
const mainnet = new ccc.ClientPublicMainnet();

/**
 * Testnet is the default. A mainnet link opened against a testnet wallet is
 * rejected by buildAction with a NETWORK_MISMATCH, which is the behaviour we
 * want — the user switches deliberately rather than being switched silently.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ccc.Provider
      name="CKB Action Links"
      defaultClient={testnet}
      clientOptions={[
        { name: "Testnet", client: testnet },
        { name: "Mainnet", client: mainnet },
      ]}
    >
      {children}
    </ccc.Provider>
  );
}
