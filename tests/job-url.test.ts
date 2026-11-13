import { describe, expect, it } from "vitest";
import { handleJobUrl } from "@/lib/api/job-url-handler";
import { MemoryRateLimiter } from "@/lib/api/ratelimit";
import { checkUrl, FetchRefused, isPublicIp, safeFetch, type FetchOptions } from "@/lib/api/safe-fetch";
import { decodeEntities, extractJob, htmlToText } from "@/lib/job-extract";

describe("which addresses count as public", () => {
  it.each(["8.8.8.8", "1.1.1.1", "93.184.216.34", "142.250.80.46", "2606:4700:4700::1111", "2a00:1450:4001:81b::200e"])("allows %s", (ip) => expect(isPublicIp(ip)).toBe(true));
  it.each([
    "0.0.0.0", "10.0.0.1", "10.255.255.255", "127.0.0.1", "127.1.2.3", "169.254.169.254", "172.16.0.1", "172.31.255.255", "192.168.1.1", "100.64.0.1", "100.127.255.255",
    "192.0.0.1", "192.0.2.5", "198.18.0.1", "198.51.100.7", "203.0.113.9", "224.0.0.1", "239.255.255.255", "240.0.0.1", "255.255.255.255",
    "::", "::1", "fc00::1", "fd12:3456::1", "fe80::1", "fec0::1", "ff02::1", "2001:db8::1", "2001:0:4136:e378:8000:63bf:3fff:fdd2",
    "::ffff:127.0.0.1", "::ffff:10.0.0.1", "::ffff:169.254.169.254", "::ffff:7f00:1", "64:ff9b::7f00:1", "2002:7f00:1::1", "2002:a9fe:a9fe::1",
    "not-an-ip", "", "999.1.1.1", "1.2.3", "::ffff:", "1::2::3",
  ])("refuses %s", (ip) => expect(isPublicIp(ip)).toBe(false));
  it("allows the public side of the tricky ranges", () => {
    expect(isPublicIp("172.15.0.1")).toBe(true);
    expect(isPublicIp("172.32.0.1")).toBe(true);
    expect(isPublicIp("100.63.0.1")).toBe(true);
    expect(isPublicIp("100.128.0.1")).toBe(true);
    expect(isPublicIp("::ffff:8.8.8.8")).toBe(true);
  });
});

describe("which web addresses are accepted", () => {
  it("accepts a normal https job link", () => {
    expect(checkUrl("https://jobs.example-company.com/careers/123?utm=1").hostname).toBe("jobs.example-company.com");
  });
  it.each([
    "http://example.com/job", "ftp://example.com/x", "file:///etc/passwd", "javascript:alert(1)", "data:text/html,hi", "gopher://example.com",
    "https://user:pass@example.com/", "https://example.com:8443/", "https://example.com:22/",
    "https://127.0.0.1/", "https://[::1]/", "https://[::ffff:127.0.0.1]/", "https://2130706433/", "https://0x7f.0.0.1/", "https://0177.0.0.1/", "https://169.254.169.254/latest/meta-data/",
    "https://localhost/", "https://printer.local/", "https://db.internal/", "https://intranet/", "https://example.test/", "not a url", "",
  ])("refuses %s", (u) => expect(() => checkUrl(u)).toThrow(FetchRefused));
});

const page = (body: string, headers: Record<string, string> = {}) => ({ status: 200, headers: { "content-type": "text/html; charset=utf-8", ...headers }, body: Buffer.from(body), truncated: false });

describe("fetching safely", () => {
  it("connects only to an address it has checked, and returns the page", async () => {
    let connectedTo = "";
    const opts: FetchOptions = {
      resolve: async () => ["93.184.216.34"],
      request: async (_u, address) => {
        connectedTo = address;
        return page("<html>ok</html>");
      },
    };
    const r = await safeFetch("https://jobs.example-company.com/a", opts);
    expect(connectedTo).toBe("93.184.216.34");
    expect(r.body).toContain("ok");
  });
  it("refuses a name that resolves inside the network, or to a mix of public and private", async () => {
    for (const addrs of [["10.0.0.5"], ["127.0.0.1"], ["169.254.169.254"], ["8.8.8.8", "10.0.0.5"], ["::1"], ["::ffff:192.168.0.1"]]) {
      await expect(safeFetch("https://evil.example-company.com/", { resolve: async () => addrs, request: async () => page("secret") })).rejects.toMatchObject({ code: "blocked" });
    }
  });
  it("never makes the request when the check fails", async () => {
    let called = false;
    await expect(safeFetch("https://evil.example-company.com/", { resolve: async () => ["10.1.1.1"], request: async () => ((called = true), page("x")) })).rejects.toThrow();
    expect(called).toBe(false);
  });
  it("checks every redirect, and refuses one that points inside", async () => {
    const hops: string[] = [];
    const resolve = async (h: string) => (h === "internal-looking.example-company.com" ? ["10.0.0.9"] : ["93.184.216.34"]);
    const request: FetchOptions["request"] = async (u) => {
      hops.push(u.hostname);
      if (u.hostname === "a.example-company.com") return { status: 302, headers: { location: "https://internal-looking.example-company.com/x" }, body: Buffer.alloc(0), truncated: false };
      return page("secret");
    };
    await expect(safeFetch("https://a.example-company.com/", { resolve, request })).rejects.toMatchObject({ code: "blocked" });
    expect(hops).toEqual(["a.example-company.com"]);
  });
  it("refuses redirects to another protocol, to an address given as a number, and endless redirects", async () => {
    const resolve = async () => ["93.184.216.34"];
    const to = (location: string): FetchOptions["request"] => async () => ({ status: 301, headers: { location }, body: Buffer.alloc(0), truncated: false });
    await expect(safeFetch("https://a.example-company.com/", { resolve, request: to("http://a.example-company.com/") })).rejects.toBeInstanceOf(FetchRefused);
    await expect(safeFetch("https://a.example-company.com/", { resolve, request: to("https://127.0.0.1/") })).rejects.toBeInstanceOf(FetchRefused);
    await expect(safeFetch("https://a.example-company.com/", { resolve, request: to("file:///etc/passwd") })).rejects.toBeInstanceOf(FetchRefused);
    await expect(safeFetch("https://a.example-company.com/", { resolve, request: to("https://a.example-company.com/loop") })).rejects.toMatchObject({ code: "too_many_redirects" });
  });
  it("follows a normal redirect", async () => {
    const request: FetchOptions["request"] = async (u) => (u.pathname === "/old" ? { status: 301, headers: { location: "/new" }, body: Buffer.alloc(0), truncated: false } : page("<p>new</p>"));
    const r = await safeFetch("https://a.example-company.com/old", { resolve: async () => ["93.184.216.34"], request });
    expect(r.url).toBe("https://a.example-company.com/new");
  });
  it("refuses non-page content and error statuses", async () => {
    const resolve = async () => ["93.184.216.34"];
    await expect(safeFetch("https://a.example-company.com/", { resolve, request: async () => page("x", { "content-type": "application/pdf" }) })).rejects.toMatchObject({ code: "bad_type" });
    await expect(safeFetch("https://a.example-company.com/", { resolve, request: async () => page("x", { "content-type": "image/png" }) })).rejects.toMatchObject({ code: "bad_type" });
    await expect(safeFetch("https://a.example-company.com/", { resolve, request: async () => ({ status: 403, headers: {}, body: Buffer.alloc(0), truncated: false }) })).rejects.toMatchObject({ code: "bad_status" });
    await expect(safeFetch("https://a.example-company.com/", { resolve, request: async () => ({ status: 404, headers: {}, body: Buffer.alloc(0), truncated: false }) })).rejects.toThrow(/not found/);
  });
  it("says so when the name does not exist", async () => {
    await expect(safeFetch("https://nope.example-company.com/", { resolve: async () => { throw new Error("ENOTFOUND"); } })).rejects.toMatchObject({ code: "unreachable" });
    await expect(safeFetch("https://nope.example-company.com/", { resolve: async () => [] })).rejects.toMatchObject({ code: "unreachable" });
  });
});

const JSONLD = (extra = "") =>
  `<html><head><title>Careers</title><script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: "Senior Frontend Engineer",
    hiringOrganization: { "@type": "Organization", name: "Acme Corp" },
    jobLocation: { address: { addressLocality: "Pune", addressCountry: "IN" } },
    description: "&lt;p&gt;Build React and TypeScript apps. You will own the checkout and mentor juniors.&lt;/p&gt;&lt;ul&gt;&lt;li&gt;Docker&lt;/li&gt;&lt;li&gt;GraphQL&lt;/li&gt;&lt;/ul&gt;",
  })}</script>${extra}</head><body>menu</body></html>`;

describe("finding the job in a page", () => {
  it("prefers the structured posting and cleans its description", () => {
    const j = extractJob(JSONLD())!;
    expect(j.via).toBe("structured");
    expect(j.title).toBe("Senior Frontend Engineer");
    expect(j.company).toBe("Acme Corp");
    expect(j.text).toContain("Acme Corp - Pune, IN");
    expect(j.text).toContain("Build React and TypeScript apps");
    expect(j.text).toContain("• Docker");
    expect(j.text).not.toContain("<p>");
  });
  it("finds a posting inside @graph and arrays", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({ "@graph": [{ "@type": "WebSite" }, { "@type": ["Thing", "JobPosting"], title: "Dev", description: "x".repeat(120) }] })}</script>`;
    expect(extractJob(html)?.title).toBe("Dev");
  });
  it("falls back to the readable text of the page, without scripts, menus or markup", () => {
    const body = "<p>We are hiring a data analyst to build dashboards in Power BI and write SQL every day.</p>".repeat(6);
    const html = `<html><head><title>Data Analyst | Initech</title><style>.x{}</style></head><body><nav>Home Jobs</nav><main>${body}<script>alert(1)</script></main><footer>(c) Initech</footer></body></html>`;
    const j = extractJob(html)!;
    expect(j.via).toBe("page");
    expect(j.title).toBe("Data Analyst | Initech");
    expect(j.text).toContain("data analyst");
    expect(j.text).not.toMatch(/alert|Home Jobs|\(c\)/);
  });
  it("gives up on login walls and empty app shells instead of returning junk", () => {
    expect(extractJob("<html><body><div id=root></div><script>window.app=1</script></body></html>")).toBeNull();
    expect(extractJob("<html><body><h1>Sign in to continue</h1><p>Please sign in to continue to see this job.</p></body></html>")).toBeNull();
    expect(extractJob("<html><body>" + "<p>Checking your browser before accessing the site. Please wait while we verify you are human.</p>".repeat(3) + "</body></html>")).toBeNull();
  });
  it("is safe with hostile pages: broken JSON, huge pages, deep nesting", () => {
    expect(() => extractJob('<script type="application/ld+json">{not json</script>')).not.toThrow();
    const t0 = Date.now();
    extractJob("<div>".repeat(60_000) + "x".repeat(200_000));
    extractJob("<script>".repeat(30_000));
    expect(Date.now() - t0).toBeLessThan(3000);
  });
  it("turns markup into plain text without keeping any tag or script", () => {
    expect(htmlToText("<b>Hi</b> &amp; <i>bye</i><script>x()</script><br>next")).toBe("Hi & bye\nnext");
    expect(decodeEntities("&lt;b&gt; &#65;&#x42; &unknown; &#9999999;")).toBe("<b> AB &unknown;  ");
  });
});

const post = (body: unknown, extra: Record<string, string> = {}) =>
  new Request("http://localhost/api/v1/job-url", { method: "POST", headers: { "content-type": "application/json", ...extra }, body: typeof body === "string" ? body : JSON.stringify(body) });

describe("POST /api/v1/job-url", () => {
  const ok = async () => ({ url: "https://jobs.example-company.com/1", contentType: "text/html", body: JSONLD(), truncated: false });
  it("returns the posting text, title and company", async () => {
    const r = await handleJobUrl(post({ url: "https://jobs.example-company.com/1" }), { limiter: new MemoryRateLimiter(), fetchPage: ok });
    const j = await r.json();
    expect(r.status).toBe(200);
    expect(j).toMatchObject({ title: "Senior Frontend Engineer", company: "Acme Corp", host: "jobs.example-company.com", via: "structured" });
    expect(j.text).toContain("React");
  });
  it("uses the real safety checks by default: private addresses are refused before any network", async () => {
    for (const url of ["https://169.254.169.254/latest/meta-data/", "https://localhost/admin", "http://example.com/x", "https://127.0.0.1:443/"]) {
      const r = await handleJobUrl(post({ url }), { limiter: new MemoryRateLimiter() });
      expect(r.status).toBe(400);
    }
  });
  it("turns every failure into a plain message", async () => {
    const lim = () => ({ limiter: new MemoryRateLimiter() });
    const refused = await handleJobUrl(post({ url: "https://a.example-company.com/" }), { ...lim(), fetchPage: async () => { throw new FetchRefused("bad_status", "That site did not let us read the page."); } });
    expect(refused.status).toBe(422);
    expect((await refused.json()).error.message).toContain("did not let us");
    const wall = await handleJobUrl(post({ url: "https://a.example-company.com/" }), { ...lim(), fetchPage: async () => ({ url: "https://a.example-company.com/", contentType: "text/html", body: "<html>Sign in to continue</html>", truncated: false }) });
    expect(wall.status).toBe(422);
    expect((await wall.json()).error.message).toContain("paste it instead");
    const odd = await handleJobUrl(post({ url: "https://a.example-company.com/" }), { ...lim(), fetchPage: async () => { throw new Error("boom internal detail"); } });
    expect(JSON.stringify(await odd.json())).not.toContain("boom");
  });
  it("validates input, origin and rate", async () => {
    const d = { limiter: new MemoryRateLimiter(), fetchPage: ok };
    expect((await handleJobUrl(post({ url: "x" }), d)).status).toBe(400);
    expect((await handleJobUrl(post({ url: "https://a.example-company.com/", extra: 1 }), d)).status).toBe(400);
    expect((await handleJobUrl(post("not json"), d)).status).toBe(400);
    expect((await handleJobUrl(post({ url: "https://a.example-company.com/" }, { origin: "https://evil.example", host: "localhost" }), d)).status).toBe(403);
    let last = 200;
    for (let i = 0; i < 12; i++) last = (await handleJobUrl(post({ url: "https://a.example-company.com/" }), d)).status;
    expect(last).toBe(429);
  });
});
