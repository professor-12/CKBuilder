/**
 * Browser drive of the production static export against the live testnet.
 *
 * Not a unit test — a verification artifact: the real pages, served from
 * out/, in a real Chromium, doing real RPC. Three legs:
 *
 *  1. /invoice/#… for the invoice settled in the week-15 E2E run: the page
 *     itself must reach "Settled", render the transaction hash, and offer a
 *     printable receipt.
 *  2. /new/: fill the form, create an invoice against the live tip block,
 *     and read back the generated /pay link.
 *  3. /pay/#…: the settled invoice's payer page must show the on-chain
 *     settled banner (and therefore no payment affordance).
 *
 * Run:  node e2e/drive.mjs   (requires the static export in out/ and
 *       LD_LIBRARY_PATH for the headless shell where system libs are absent)
 */
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { join, extname } from "node:path";
import { chromium } from "playwright";

const OUT = new URL("../out", import.meta.url).pathname;
const SHOTS = new URL("../../../docs/screenshots", import.meta.url).pathname;
const FRAGMENT =
  "v1.eyJ2IjoxLCJuZXR3b3JrIjoiY2t0IiwiYXNzZXQiOiJja2IiLCJ0byI6ImNrdDFxemRhMGNyMDhtODVoYzhqbG5mcDN6ZXI3eHVsZWp5d3Q0OWt0MnJyMHZ0aHl3YWE1MHh3c3F3bmx4eHJjeWFoNWhtYXB3NXZmNnd4YWdhem5mN2xqcXE5c24wcngiLCJhbW91bnQiOiIyNTAuMDAwOTQ1MzEiLCJsYWJlbCI6IldlZWsgMTUgZW5kLXRvLWVuZCBwcm9vZiIsImNyZWF0ZWRBdCI6MTc4ODIyNjY0NCwic2luY2VCbG9jayI6MjIyNzAwMDB9";
const SETTLING_TX =
  "0xc38a3b15d7b85c0baa048cdf5c94fe83314d4f22844c673b3e305747c62bea56";
const MERCHANT =
  "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqwnlxxrcyah5hmapw5vf6wxagaznf7ljqq9sn0rx";

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".txt": "text/plain",
  ".ico": "image/x-icon",
};

const server = createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (path.endsWith("/")) path += "index.html";
  try {
    const body = await readFile(join(OUT, path));
    res.writeHead(200, { "content-type": MIME[extname(path)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end("not found");
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
await mkdir(SHOTS, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 1100 } });
const failures = [];
async function expect(name, cond) {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(name);
    console.log(`  ✗ ${name}`);
  }
}

// ---- Leg 1: the receipt page verifies the real settlement -----------------
console.log("LEG 1 — /invoice/# renders a chain-derived receipt");
await page.goto(`${base}/invoice/#${FRAGMENT}`);
await page.waitForSelector("text=Settled", { timeout: 60_000 });
await expect("status pill reads Settled", (await page.textContent("body")).includes("Settled"));
await expect("heading became Receipt", (await page.textContent("h1")) === "Receipt");
await expect("settling tx hash rendered", (await page.textContent("body")).includes(SETTLING_TX));
await expect("print affordance offered", await page.isVisible("text=Print receipt"));
await expect(
  "label rendered as quoted payload text",
  (await page.textContent("body")).includes("Week 15 end-to-end proof"),
);
await page.screenshot({ path: join(SHOTS, "receipt-settled.png"), fullPage: true });

// ---- Leg 2: create an invoice through the real form ------------------------
console.log("LEG 2 — /new/ creates an invoice against the live tip");
await page.goto(`${base}/new/`);
await page.fill('input[placeholder="ckt1…"]', MERCHANT);
await page.fill('input[placeholder="125"]', "42");
await page.fill('label:has-text("Label") input', "Browser drive");
await page.click("text=Create invoice");
await page.waitForSelector("text=Invoice created", { timeout: 30_000 });
const link = await page.textContent(".mono");
await expect("a /pay/ link was generated", link.includes("/pay/#v1."));
await expect(
  "detection dust filled the reserved digits",
  /42\.000[0-9]{5}/.test(await page.textContent("body")),
);
await page.screenshot({ path: join(SHOTS, "invoice-created.png"), fullPage: true });

// ---- Leg 3: the payer page refuses to re-offer a settled invoice ----------
console.log("LEG 3 — /pay/# shows settled state, no payment affordance");
await page.goto(`${base}/pay/#${FRAGMENT}`);
await page.waitForSelector("text=settled on-chain", { timeout: 60_000 });
const body = await page.textContent("body");
await expect("provenance banner present", body.includes("created by someone else"));
await expect("no copy-amount affordance on a settled invoice", !(await page.isVisible("text=Copy exact amount")));
await expect("no wallet-connect affordance on a settled invoice", !(await page.isVisible("text=Connect a wallet")));
await page.screenshot({ path: join(SHOTS, "pay-settled.png"), fullPage: true });

// ---- Leg 4: fail-closed on garbage ----------------------------------------
console.log("LEG 4 — /pay/# fails closed on a mangled link");
await page.goto(`${base}/pay/#v1.garbage!!!`);
await page.waitForSelector("text=cannot be paid", { timeout: 15_000 });
await expect(
  "mangled link yields refusal, not a form",
  !(await page.isVisible("text=Copy exact amount")),
);
await page.screenshot({ path: join(SHOTS, "pay-fail-closed.png"), fullPage: true });

await browser.close();
server.close();

if (failures.length) {
  console.error(`FAIL: ${failures.length} assertion(s): ${failures.join("; ")}`);
  process.exit(1);
}
console.log("PASS: production export drove correctly against the live testnet");
