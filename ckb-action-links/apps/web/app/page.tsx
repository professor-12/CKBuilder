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
      </div>

      <h2>How it works</h2>
      <div className="card">
        <ol className="steps">
          <li>Fill in a recipient and an amount. The link is generated in your browser.</li>
          <li>Paste it anywhere — chat, email, a post, a page.</li>
          <li>
            Whoever opens it connects a wallet, checks the recipient and the total, and signs.
          </li>
        </ol>
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
    </main>
  );
}
