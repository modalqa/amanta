import "server-only";
import { BlockList, isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { AppError } from "../errors";

// Ranges a tenant-supplied AI base URL must never reach (SSRF guard): loopback, private, link-local
// (incl. cloud metadata 169.254.169.254), CGNAT, benchmarking, multicast/reserved and their IPv6 equivalents.
const blocked = new BlockList();
for (const [net, prefix] of [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["224.0.0.0", 3]] as const) blocked.addSubnet(net, prefix, "ipv4");
for (const [net, prefix] of [["::", 128], ["::1", 128], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8], ["64:ff9b::", 96], ["2001:db8::", 32]] as const) blocked.addSubnet(net, prefix, "ipv6");

export function isBlockedAddress(ip: string): boolean {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped) return blocked.check(mapped[1], "ipv4");
  const family = isIP(ip);
  if (family === 0) return true;
  return blocked.check(ip, family === 4 ? "ipv4" : "ipv6");
}

/**
 * Validates a tenant-supplied (BYOK) base URL. Requires HTTPS and a public address unless the server
 * operator set AI_BYOK_ALLOW_PRIVATE_URLS=true (self-hosted Ollama/vLLM on a private network).
 * Called on save and again before every request. DNS can still change between this check and the
 * connection (rebinding); redirects are refused in the provider, which closes the other common bypass.
 */
export async function assertSafeAiBaseUrl(raw: string, allowPrivate: boolean, resolve: (host: string) => Promise<string[]> = defaultResolve): Promise<URL> {
  let url: URL;
  try { url = new URL(raw); } catch { throw new AppError("VALIDATION", "ai_base_url_invalid"); }
  if (url.username || url.password || url.search || url.hash) throw new AppError("VALIDATION", "ai_base_url_invalid");
  if (url.protocol !== "https:" && !(allowPrivate && url.protocol === "http:")) throw new AppError("VALIDATION", "ai_base_url_https_required");
  if (allowPrivate) return url;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) throw new AppError("VALIDATION", "ai_base_url_private");
  let addrs: string[];
  try { addrs = isIP(host) ? [host] : await resolve(host); } catch { throw new AppError("VALIDATION", "ai_base_url_unresolvable"); }
  if (addrs.length === 0 || addrs.some(isBlockedAddress)) throw new AppError("VALIDATION", "ai_base_url_private");
  return url;
}

async function defaultResolve(host: string): Promise<string[]> {
  return (await lookup(host, { all: true, verbatim: true })).map((a) => a.address);
}
