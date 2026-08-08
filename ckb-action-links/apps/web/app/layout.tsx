import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "CKB Action Links",
  description: "Share a CKB transaction as a URL",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <header className="shell">
            <div className="shell-inner">
              <Link href="/" className="wordmark">
                <span className="wordmark-dot" aria-hidden />
                CKB Action Links
              </Link>
              <nav>
                <Link href="/inspect">Inspect</Link>
                <Link href="/new">Create a link</Link>
              </nav>
            </div>
          </header>

          {children}

          <footer className="foot">
            Actions are encoded in the link itself. Nothing is stored on a server.
          </footer>
        </Providers>
      </body>
    </html>
  );
}
