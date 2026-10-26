// Compiles every template's LaTeX (normal + edge-case content) with a real pdfLaTeX, so "it compiles on Overleaf"
// is verified, not assumed.   npm run tex:check
//
// It posts ONLY generated sample data (never user data) to the public texlive.net compile service.
// For a fully offline check, install TeX Live / MiKTeX and set TEX_LOCAL=1 to use a local `pdflatex`.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const out = mkdtempSync(path.join(tmpdir(), "tomcredora-tex-"));
const gen = spawnSync("npx", ["vitest", "run", "tests/gen-tex.test.ts"], { env: { ...process.env, TEX_OUT: out }, stdio: "ignore", shell: true });
if (gen.status !== 0) {
  console.error("Could not generate .tex samples");
  process.exit(1);
}

const URL_ = "https://texlive.net/cgi-bin/latexcgi";

async function compile(tex, wantLog) {
  const form = () => {
    const f = new FormData();
    f.append("filecontents[]", tex);
    f.append("filename[]", "document.tex");
    f.append("engine", "pdflatex");
    f.append("return", wantLog ? "log" : "pdf");
    return f;
  };
  let res = await fetch(URL_, { method: "POST", body: form(), redirect: "manual" });
  // The service answers the form POST with a redirect to the produced file.
  for (let i = 0; i < 3 && res.status >= 300 && res.status < 400; i++) {
    const next = new URL(res.headers.get("location"), URL_).href;
    res = await fetch(next, { method: "POST", body: form(), redirect: "manual" });
  }
  if (res.status >= 300 && res.status < 400) res = await fetch(new URL(res.headers.get("location"), URL_).href);
  return { ok: (res.headers.get("content-type") ?? "").includes("pdf"), bytes: Buffer.from(await res.arrayBuffer()) };
}

let failed = 0;
const files = readdirSync(out).filter((f) => f.endsWith(".tex")).sort();
for (const f of files) {
  const tex = readFileSync(path.join(out, f), "utf8");
  const r = await compile(tex, false);
  if (r.ok) {
    writeFileSync(path.join(out, f.replace(".tex", ".pdf")), r.bytes);
    console.log("PASS", f.padEnd(24), `${Math.round(r.bytes.length / 1024)} KB`);
  } else {
    failed++;
    const log = (await compile(tex, true)).bytes.toString("utf8");
    const err = log.split("\n").filter((l) => l.startsWith("!")).slice(0, 2).join(" | ");
    console.log("FAIL", f.padEnd(24), err || "no PDF produced");
  }
}
console.log(`\n${files.length - failed}/${files.length} compiled. Output: ${out}`);
process.exit(failed ? 1 : 0);
