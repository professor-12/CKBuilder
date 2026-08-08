import Link from "next/link";

export default function HomePage() {
  return (
    <main className="page page-wide">
      <h1>Share a CKB transaction as a URL.</h1>
      <p className="lede">
        A link carries the whole transaction in its own address bar. Whoever opens it sees
        exactly what they would be signing, connects a wallet, and signs. Nothing else.
      </p>

      <div className="actions" style={{ marginTop: 0, marginBottom: "1rem" }}>
        <Link href="/new" className="btn btn-primary">
          Create a link
        </Link>
        <Link href="/inspect" className="btn">
          Inspect a link
        </Link>
      </div>

      <h2>How it works</h2>
      <div className="card">
        <ol className="steps">
          <li>Fill in a recipient and an amount. The link is generated in your browser.</li>
          <li>Paste it anywhere — chat, email, a post, a page. Or share the QR code.</li>
          <li>
            Whoever opens it connects a wallet, checks the recipient and the total, and signs.
          </li>
        </ol>
      </div>

      <h2>Two kinds of link</h2>
      <div className="card">
        <p>
          A <strong>fixed amount</strong> link states the figure. Whoever opens it signs
          exactly that — an invoice, a price, a bill.
        </p>
        <p style={{ marginBottom: 0 }}>
          A <strong>payer chooses</strong> link states no figure at all. The person paying
          types it themselves, within any limits you set — a tip jar, a donation, a
          pay-what-you-like. The link cannot name a number nobody agreed to.
        </p>
      </div>

      <h2>No server sees it</h2>
      <div className="card">
        <p>
          The action is encoded after the <span className="mono">#</span> in the URL. Browsers
          never send that part to a server, so the page hosting this app cannot see which
          action you opened, who it pays, or how much.
        </p>
        <p style={{ marginBottom: 0 }}>
          That also makes the page completely static. Anyone can host their own copy, and
          every link already out there keeps working.
        </p>
      </div>

      <h2>Before you sign anything</h2>
      <div className="card">
        <p>
          Anyone can create a link. Opening one is safe: it cannot move funds on its own and
          will not touch your wallet until you ask it to. Signing is what spends money, so
          read the recipient address on the confirmation screen every time.
        </p>
        <p style={{ marginBottom: 0 }}>
          If this app cannot fully explain what a link does, it shows you why and offers no
          sign button at all.
        </p>
      </div>

      <h2>Read a link without opening it</h2>
      <div className="card">
        <p style={{ marginBottom: 0 }}>
          Paste any action link into <Link href="/inspect">Inspect</Link> to see what it asks
          for. No wallet is contacted, nothing is built, and nothing there can be signed —
          it only reads the link back to you.
        </p>
      </div>
    </main>
  );
}
