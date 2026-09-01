import type { Metadata } from "next";
import Link from "next/link";

import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Till — self-custodial payments for CKB",
  description:
    "Create an invoice, share a link, watch it settle on-chain. No server, no custodian.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <main>
          <header className="site-header">
            <Link className="brand" href="/">
              Till
            </Link>
            <nav aria-label="Main">
              <Link href="/new">New invoice</Link>
              <Link href="/pos">Point of sale</Link>
            </nav>
          </header>
          <Providers>{children}</Providers>
        </main>
      </body>
    </html>
  );
}
