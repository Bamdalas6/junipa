import dns from "node:dns";
import { lookup } from "node:dns/promises";
import net from "node:net";
import { Agent, fetch } from "undici";

// Node only (next dev / next start). Loaded by public-fetch.ts when not on Cloudflare,
// where the platform itself refuses private destinations.

// Loopback, private, link-local (incl. cloud metadata), carrier-grade NAT, test, multicast and reserved ranges.
// Separate lists: an IPv6 rule like ::ffff:0:0/96 would otherwise match every IPv4 address.
const BLOCKED_V4 = new net.BlockList();
for (const [range, prefix] of [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4]] as const)
  BLOCKED_V4.addSubnet(range, prefix, "ipv4");
const BLOCKED_V6 = new net.BlockList();
for (const [range, prefix] of [["64:ff9b::", 96], ["100::", 64], ["2001:db8::", 32], ["2002::", 16], ["fc00::", 7], ["fe80::", 10], ["fec0::", 10], ["ff00::", 8]] as const)
  BLOCKED_V6.addSubnet(range, prefix, "ipv6");

function isPrivateIp(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) return BLOCKED_V4.check(ip, "ipv4");
  if (family !== 6) return true;
  // ::1, ::, and IPv4-mapped/compatible forms (::ffff:a.b.c.d) all start with "::"; real public IPv6 never does.
  if (ip.startsWith("::")) return true;
  return BLOCKED_V6.check(ip, "ipv6");
}

async function assertPublic(hostname: string) {
  const addrs = await lookup(hostname, { all: true });
  if (addrs.length === 0 || addrs.some((a) => isPrivateIp(a.address))) throw new Error("Host is not public");
}

// Every connection re-checks the address it actually connects to, so a domain
// can't pass the check above and then switch its DNS to an internal address.
const publicOnly = new Agent({
  connect: {
    lookup(hostname, options, callback) {
      dns.lookup(hostname, { all: true }, (err, addrs) => {
        if (err) return callback(err, "", 0);
        if (addrs.length === 0 || addrs.some((a) => isPrivateIp(a.address))) return callback(new Error("Host is not public"), "", 0);
        if ((options as { all?: boolean }).all) return (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, addrs);
        callback(null, addrs[0].address, addrs[0].family);
      });
    },
  },
});

export async function fetchPinned(url: URL, init: { headers: Record<string, string>; signal: AbortSignal }): Promise<Response> {
  await assertPublic(url.hostname);
  return (await fetch(url, { ...init, dispatcher: publicOnly, redirect: "manual" })) as unknown as Response;
}
