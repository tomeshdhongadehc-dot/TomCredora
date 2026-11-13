import dns from "node:dns";
import https from "node:https";
import net from "node:net";
import zlib from "node:zlib";

/**
 * Fetching a web page that a stranger asked us to fetch. The danger is being tricked into reading something on
 * our own network (SSRF), so: https only, port 443 only, no address typed as a number, the name is looked up and
 * EVERY address it gives must be public (checked again at connect time, so a name that changes its answer between
 * the check and the connection cannot slip through), redirects are followed by hand and checked each time, and the
 * size and time are capped.
 */

export class FetchRefused extends Error {
  constructor(
    public readonly code: "bad_url" | "blocked" | "unreachable" | "bad_status" | "bad_type" | "too_many_redirects",
    message: string,
  ) {
    super(message);
    this.name = "FetchRefused";
  }
}

// ---------------------------------------------------------------------------------------------- addresses

const v4 = (ip: string): number[] | null => {
  const p = ip.split(".");
  if (p.length !== 4 || !p.every((x) => /^\d{1,3}$/.test(x) && Number(x) <= 255)) return null;
  return p.map(Number);
};

function publicV4(a: number[]): boolean {
  const [x, y, z] = a;
  if (x === 0 || x === 10 || x === 127) return false;
  if (x === 100 && y >= 64 && y <= 127) return false; // carrier-grade NAT
  if (x === 169 && y === 254) return false; // link-local, cloud metadata
  if (x === 172 && y >= 16 && y <= 31) return false;
  if (x === 192 && y === 0 && (z === 0 || z === 2)) return false;
  if (x === 192 && y === 88 && z === 99) return false;
  if (x === 192 && y === 168) return false;
  if (x === 198 && (y === 18 || y === 19)) return false;
  if (x === 198 && y === 51 && z === 100) return false;
  if (x === 203 && y === 0 && z === 113) return false;
  if (x >= 224) return false; // multicast and reserved
  return true;
}

/** Expand an IPv6 address to eight 16-bit groups (handles "::" and a trailing IPv4 part), or null. */
function groups6(ip: string): number[] | null {
  let s = ip.toLowerCase().split("%")[0];
  const tail = s.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (tail) {
    const a = v4(tail[1]);
    if (!a) return null;
    s = s.slice(0, -tail[1].length) + ((a[0] << 8) | a[1]).toString(16) + ":" + ((a[2] << 8) | a[3]).toString(16);
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = halves.length === 2 ? 8 - head.length - rest.length : 0;
  if (fill < 0 || (halves.length === 1 && head.length !== 8)) return null;
  const all = [...head, ...Array(fill).fill("0"), ...rest];
  if (all.length !== 8 || !all.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return null;
  return all.map((g) => parseInt(g, 16));
}

/** Is this a public, internet-routable address? Anything unusual counts as NOT public. */
export function isPublicIp(ip: string): boolean {
  const kind = net.isIP(ip);
  if (kind === 4) {
    const a = v4(ip);
    return !!a && publicV4(a);
  }
  if (kind !== 6) return false;
  const g = groups6(ip);
  if (!g) return false;
  const embedded = (hi: number, lo: number) => [hi >> 8, hi & 255, lo >> 8, lo & 255];
  if (g.every((x) => x === 0)) return false; // ::
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return false; // ::1
  if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0)) return publicV4(embedded(g[6], g[7])); // ::ffff:a.b.c.d and ::a.b.c.d
  if (g[0] === 0x64 && g[1] === 0xff9b) return publicV4(embedded(g[6], g[7])); // NAT64
  if (g[0] === 0x2002) return publicV4(embedded(g[1], g[2])); // 6to4
  if (g[0] === 0x2001 && g[1] === 0) return false; // Teredo
  if ((g[0] & 0xfe00) === 0xfc00) return false; // unique local
  if ((g[0] & 0xffc0) === 0xfe80) return false; // link-local
  if ((g[0] & 0xffc0) === 0xfec0) return false; // site-local
  if ((g[0] & 0xff00) === 0xff00) return false; // multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return false; // documentation
  return (g[0] & 0xe000) === 0x2000; // only global unicast 2000::/3
}

// ---------------------------------------------------------------------------------------------- the URL

/** A URL we are willing to fetch, or a FetchRefused saying why not. */
export function checkUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new FetchRefused("bad_url", "That does not look like a web address.");
  }
  if (u.protocol !== "https:") throw new FetchRefused("bad_url", "Only https:// links can be read.");
  if (u.username || u.password) throw new FetchRefused("bad_url", "That address contains a login, which we will not use.");
  if (u.port && u.port !== "443") throw new FetchRefused("bad_url", "That address uses an unusual port.");
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (!host || host.length > 253 || net.isIP(host.replace(/^\[|\]$/g, "")) || /^\[/.test(host) || /^[\d.]+$/.test(host) || /^0x/i.test(host))
    throw new FetchRefused("blocked", "Addresses given as numbers cannot be read. Use the website address.");
  if (!host.includes(".") || /(?:^|\.)(?:localhost|local|internal|intranet|lan|home|corp|test|invalid|example)$/.test(host)) throw new FetchRefused("blocked", "That address is not a public website.");
  return u;
}

// ---------------------------------------------------------------------------------------------- the request

export interface Fetched {
  url: string;
  contentType: string;
  body: string;
  /** true when the page was longer than the cap and was cut */
  truncated: boolean;
}

export interface FetchOptions {
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
  /** override for tests: how a name is turned into addresses */
  resolve?: (host: string) => Promise<string[]>;
  /** override for tests: perform the request itself (the address checks still run first) */
  request?: (u: URL, address: string, opts: Required<Pick<FetchOptions, "maxBytes" | "timeoutMs">>) => Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: Buffer; truncated: boolean }>;
}

const defaultResolve = async (host: string) => (await dns.promises.lookup(host, { all: true, verbatim: true })).map((a) => a.address);

const USER_AGENT = "TomCredoraJobReader/1.0 (+https://tomcredora.vercel.app)";

function realRequest(u: URL, address: string, { maxBytes, timeoutMs }: Required<Pick<FetchOptions, "maxBytes" | "timeoutMs">>) {
  return new Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: Buffer; truncated: boolean }>((resolve, reject) => {
    const family = net.isIP(address);
    const req = https.request(
      {
        host: u.hostname,
        port: 443,
        path: u.pathname + u.search,
        method: "GET",
        servername: u.hostname,
        timeout: timeoutMs,
        headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml,application/json;q=0.8,text/plain;q=0.5", "accept-language": "en", "accept-encoding": "gzip, deflate, br" },
        // Connect to the address we already checked, never to a fresh lookup.
        lookup: (_host, options, cb) => {
          const done = cb as unknown as (err: Error | null, a: string | { address: string; family: number }[], f?: number) => void;
          if ((options as { all?: boolean }).all) done(null, [{ address, family }]);
          else done(null, address, family);
        },
      },
      (res) => {
        const enc = String(res.headers["content-encoding"] ?? "").toLowerCase();
        const stream = enc.includes("br") ? res.pipe(zlib.createBrotliDecompress()) : enc.includes("gzip") ? res.pipe(zlib.createGunzip()) : enc.includes("deflate") ? res.pipe(zlib.createInflate()) : res;
        const chunks: Buffer[] = [];
        let size = 0;
        let truncated = false;
        const finish = () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks), truncated });
        stream.on("data", (c: Buffer) => {
          if (truncated) return;
          size += c.length;
          if (size > maxBytes) {
            chunks.push(c.subarray(0, c.length - (size - maxBytes)));
            truncated = true;
            req.destroy();
            finish();
            return;
          }
          chunks.push(c);
        });
        stream.on("end", () => !truncated && finish());
        stream.on("error", () => !truncated && reject(new FetchRefused("unreachable", "The page could not be read.")));
      },
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", () => reject(new FetchRefused("unreachable", "We could not reach that page.")));
    req.end();
  });
}

/** Fetch a public https page safely. Throws FetchRefused (with a message safe to show) for anything else. */
export async function safeFetch(rawUrl: string, options: FetchOptions = {}): Promise<Fetched> {
  const maxBytes = options.maxBytes ?? 1_500_000;
  const timeoutMs = options.timeoutMs ?? 8_000;
  const maxRedirects = options.maxRedirects ?? 3;
  const resolve = options.resolve ?? defaultResolve;
  const request = options.request ?? realRequest;
  const deadline = Date.now() + timeoutMs + 4_000;

  let url = checkUrl(rawUrl);
  for (let hop = 0; hop <= maxRedirects; hop++) {
    if (Date.now() > deadline) throw new FetchRefused("unreachable", "That page took too long to answer.");
    let addresses: string[];
    try {
      addresses = await resolve(url.hostname);
    } catch {
      throw new FetchRefused("unreachable", "We could not find that website.");
    }
    if (!addresses.length) throw new FetchRefused("unreachable", "We could not find that website.");
    // all of them, not just the first: a name that also points inside our network is refused outright
    if (!addresses.every(isPublicIp)) throw new FetchRefused("blocked", "That address is not a public website.");

    const res = await request(url, addresses[0], { maxBytes, timeoutMs });
    if (res.status >= 300 && res.status < 400 && res.headers.location) {
      try {
        url = checkUrl(new URL(String(res.headers.location), url).toString());
      } catch (e) {
        throw e instanceof FetchRefused ? e : new FetchRefused("bad_url", "That page redirects somewhere we cannot read.");
      }
      continue;
    }
    if (res.status !== 200) throw new FetchRefused("bad_status", res.status === 404 || res.status === 410 ? "That page was not found. The job may have been taken down." : "That site did not let us read the page.");
    const contentType = String(res.headers["content-type"] ?? "").toLowerCase();
    if (!/^(?:text\/(?:html|plain)|application\/(?:xhtml\+xml|json|ld\+json))/.test(contentType)) throw new FetchRefused("bad_type", "That link is not a web page we can read.");
    return { url: url.toString(), contentType, body: res.body.toString("utf8"), truncated: res.truncated };
  }
  throw new FetchRefused("too_many_redirects", "That link redirects too many times.");
}
