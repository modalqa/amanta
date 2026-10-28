import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { allKeys, getT } from "@/i18n";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? files(p) : /\.(tsx?|ts)$/.test(f) ? [p] : []; });
}

describe("i18n", () => {
  it("Indonesian and English dictionaries have identical keys", () => {
    expect(new Set(allKeys.en())).toEqual(new Set(allKeys.id()));
  });
  it("every static t(\"key\") used in the source exists", () => {
    const keys = new Set(allKeys.id());
    const missing: string[] = [];
    for (const f of files("src")) {
      for (const m of readFileSync(f, "utf8").matchAll(/\bt\("([a-zA-Z0-9_.]+)"/g)) if (!keys.has(m[1])) missing.push(`${f}: ${m[1]}`);
    }
    expect(missing).toEqual([]);
  });
  it("interpolates variables", () => {
    expect(getT("id")("dashboard.highCritical", { n: 3 })).toBe("3 tingkat tinggi/kritis");
    expect(getT("en")("dashboard.highCritical", { n: 3 })).toBe("3 high/critical");
  });
});
