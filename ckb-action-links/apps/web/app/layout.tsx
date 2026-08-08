import type { Metadata } from "next";
import { Instrument_Serif, Inter_Tight, JetBrains_Mono } from "next/font/google";
import Link from "next/link";
import type { ReactNode } from "react";

import { Providers } from "./providers";
import "./globals.css";

/*
 * Three faces, each with one job.
 *
 * Serif for headings, because a page that asks someone to spend money should
 * not look like every other dashboard. Grotesque for interface text, set tight.
 * Mono for anything that is a value — addresses, amounts, hashes — where
 * tabular figures and unambiguous characters are the whole point.
 *
 * next/font self-hosts these at build time, so there is no request to a font
 * CDN at runtime. On a page that makes a point of talking to no server, loading
 * typefaces from someone else's would be a poor look.
 */
const sans = Inter_Tight({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const serif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-serif",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "CKB Action Links",
  description: "Share a CKB transaction as a URL",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable} ${mono.variable}`}>
      <body>
        <Providers>
          <header className="shell">
            <div className="shell-inner">
              <Link href="/" className="wordmark">
                <span className="wordmark-mark" aria-hidden />
                <span>
                  CKB <em>Action Links</em>
                </span>
              </Link>
              <nav>
                <Link href="/inspect">Inspect</Link>
                <Link href="/new">Create</Link>
              </nav>
            </div>
          </header>

          {children}

          <footer className="foot">
            <span>Actions are encoded in the link itself.</span>
            <span className="foot-sep" aria-hidden />
            <span>Nothing is stored on a server.</span>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
