/**
 * Curated token seed list.
 *
 * Entries here were read from the CKB Explorer's verified token registry at
 * authoring time (symbols, decimals, and full type scripts). They are
 * conveniences for the invoice form — detection never trusts this table; it
 * verifies the type script and raw amount on-chain per SET-1/SET-2.
 *
 * Note USDI: it is `xudt_compatible`, deployed under its own code hash — a
 * generic "is it the xUDT code hash?" check would wrongly reject the most
 * important stablecoin on the network. Token identity in Till is therefore
 * always the full type script, never a code-hash family.
 */

import type { UdtDescriptor } from "./invoice.ts";

export interface KnownToken extends UdtDescriptor {
  name: string;
  network: "ckb";
}

export const KNOWN_TOKENS: KnownToken[] = [
  {
    name: "USDI (interoperable USD)",
    symbol: "USDI",
    decimals: 6,
    network: "ckb",
    codeHash:
      "0xbfa35a9c38a676682b65ade8f02be164d48632281477e36f8dc2f41f79e56bfc",
    hashType: "type",
    args: "0xd591ebdc69626647e056e13345fd830c8b876bb06aa07ba610479eb77153ea9f",
  },
  {
    name: "Seal",
    symbol: "Seal",
    decimals: 8,
    network: "ckb",
    codeHash:
      "0x50bd8d6680b8b9cf98b73f3c08faf8b2a21914311954118ad6609be6e78a1b95",
    hashType: "data1",
    args: "0x2ae639d6233f9b15545573b8e78f38ff7aa6c7bf8ef6460bf1f12d0a76c09c4e",
  },
];
