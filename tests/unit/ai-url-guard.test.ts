import { describe, expect, it } from "vitest";
import { assertSafeAiBaseUrl, isBlockedAddress } from "@/server/ai/url-guard";

const resolveTo = (...ips: string[]) => async () => ips;

describe("BYOK base URL guard (SSRF)", () => {
  it("blocks loopback, private, link-local/metadata, CGNAT and IPv6 local ranges", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.4", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "not-an-ip"]) {
      expect(isBlockedAddress(ip), ip).toBe(true);
    }
    for (const ip of ["8.8.8.8", "104.18.0.1", "2606:4700::1111"]) expect(isBlockedAddress(ip), ip).toBe(false);
  });

  it("accepts a public HTTPS endpoint", async () => {
    await expect(assertSafeAiBaseUrl("https://openrouter.ai/api/v1", false, resolveTo("104.18.0.1"))).resolves.toBeInstanceOf(URL);
  });

  it("rejects plain HTTP, credentials, query strings and malformed URLs", async () => {
    await expect(assertSafeAiBaseUrl("http://api.example.com/v1", false, resolveTo("8.8.8.8"))).rejects.toThrow("ai_base_url_https_required");
    await expect(assertSafeAiBaseUrl("https://user:pw@api.example.com/v1", false, resolveTo("8.8.8.8"))).rejects.toThrow("ai_base_url_invalid");
    await expect(assertSafeAiBaseUrl("https://api.example.com/v1?x=1", false, resolveTo("8.8.8.8"))).rejects.toThrow("ai_base_url_invalid");
    await expect(assertSafeAiBaseUrl("not a url", false)).rejects.toThrow("ai_base_url_invalid");
  });

  it("rejects hosts that are, or resolve to, internal addresses", async () => {
    await expect(assertSafeAiBaseUrl("https://localhost:5432/v1", false)).rejects.toThrow("ai_base_url_private");
    await expect(assertSafeAiBaseUrl("https://169.254.169.254/latest", false)).rejects.toThrow("ai_base_url_private");
    await expect(assertSafeAiBaseUrl("https://[::1]/v1", false)).rejects.toThrow("ai_base_url_private");
    // DNS name pointing inside the network, including when only one of several records is internal.
    await expect(assertSafeAiBaseUrl("https://evil.example.com/v1", false, resolveTo("8.8.8.8", "10.0.0.5"))).rejects.toThrow("ai_base_url_private");
  });

  it("reports hosts that do not resolve", async () => {
    await expect(assertSafeAiBaseUrl("https://nope.example.invalid/v1", false, async () => { throw new Error("ENOTFOUND"); })).rejects.toThrow("ai_base_url_unresolvable");
  });

  it("allows private and HTTP endpoints only when the operator opts in", async () => {
    await expect(assertSafeAiBaseUrl("http://localhost:11434/v1", true)).resolves.toBeInstanceOf(URL);
    await expect(assertSafeAiBaseUrl("ftp://localhost/v1", true)).rejects.toThrow("ai_base_url_https_required");
  });
});
