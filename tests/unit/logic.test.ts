import { describe, expect, it } from "vitest";
import { evaluateItem } from "@/server/services/checklists";
import { certificateState } from "@/server/services/suppliers";
import { withinLimits } from "@/server/services/ccp";
import { toCsv } from "@/server/reports";
import { pdfSafe } from "@/server/reports/pdf";
import { parseJsonObject } from "@/server/ai/json";
import { haccpDraftSchema, capaDraftSchema } from "@/server/ai/prompts";
import { passwordPolicyError } from "@/server/auth/password";
import { PERMISSIONS, roleHas, assignableRoles } from "@/server/auth/permissions";
import { formatDate, formatDateTime, displayTemp, toCelsius, fromCelsius, displayValue } from "@/lib/format";
import { computeAuditHash } from "@/server/audit";
import { slugify } from "@/server/services/accounts";

describe("checklist evaluation", () => {
  const base = { required: true, minValue: null, maxValue: null, expectedBool: true };
  it("evaluates numeric limits inclusively", () => {
    const item = { ...base, type: "TEMPERATURE" as const, minValue: 75 };
    expect(evaluateItem(item, { valueNumber: 75 })).toEqual({ passed: true, missing: false });
    expect(evaluateItem(item, { valueNumber: 74.9 })).toEqual({ passed: false, missing: false });
    expect(evaluateItem({ ...base, type: "NUMBER", minValue: 100, maxValue: 200 }, { valueNumber: 201 }).passed).toBe(false);
  });
  it("flags required items as missing", () => {
    expect(evaluateItem({ ...base, type: "BOOLEAN" }, {})).toEqual({ passed: false, missing: true });
    expect(evaluateItem({ ...base, type: "TEXT", required: false }, { valueText: "" })).toEqual({ passed: true, missing: false });
    expect(evaluateItem({ ...base, type: "NUMBER" }, { valueNumber: Number.NaN }).missing).toBe(true);
  });
  it("compares booleans to the expected answer", () => {
    expect(evaluateItem({ ...base, type: "BOOLEAN" }, { valueBool: false }).passed).toBe(false);
    expect(evaluateItem({ ...base, type: "BOOLEAN", expectedBool: false }, { valueBool: false }).passed).toBe(true);
  });
});

describe("CCP limits & certificates", () => {
  it("withinLimits handles open bounds", () => {
    expect(withinLimits(-18, null, -18)).toBe(true);
    expect(withinLimits(-17.9, null, -18)).toBe(false);
    expect(withinLimits(5, null, null)).toBe(true);
  });
  it("certificateState buckets expiry", () => {
    const now = new Date("2026-10-28T00:00:00Z");
    expect(certificateState(null, now)).toBe("NO_EXPIRY");
    expect(certificateState(new Date("2026-10-27T00:00:00Z"), now)).toBe("EXPIRED");
    expect(certificateState(new Date("2026-11-20T00:00:00Z"), now)).toBe("EXPIRING");
    expect(certificateState(new Date("2027-06-01T00:00:00Z"), now)).toBe("VALID");
  });
});

describe("exports", () => {
  it("neutralizes CSV formula injection and escapes quotes", () => {
    const csv = toCsv(["a", "b"], [["=HYPERLINK(\"x\")", "+1"], ["normal, text", "-2"]]).toString("utf8");
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain("'+1");
    expect(csv).toContain(`"normal, text"`);
    expect(csv.startsWith("﻿")).toBe(true);
  });
  it("pdfSafe replaces unsupported glyphs", () => {
    expect(pdfSafe("≤ 4 °C → ok ✓")).toBe("<= 4 °C -> ok ?");
  });
});

describe("AI output handling", () => {
  it("extracts JSON from fenced responses and rejects non-JSON", () => {
    expect(parseJsonObject("Here:\n```json\n{\"a\":1}\n```")).toEqual({ a: 1 });
    expect(() => parseJsonObject("no json here")).toThrow();
  });
  it("coerces loosely typed model output but enforces structure", () => {
    const parsed = haccpDraftSchema.parse({ controls: [{ processStep: "Pemasakan", hazardType: "biological", hazardDescription: "Salmonella", severity: "5", likelihood: 3, isCcp: "true", controlMeasure: "Masak 75C", criticalLimitMin: "75,5", monitoringProcedure: "ukur", monitoringFrequency: "30 menit", correctiveAction: "masak ulang" }] });
    expect(parsed.controls[0]).toMatchObject({ hazardType: "BIOLOGICAL", severity: 5, isCcp: true, criticalLimitMin: 75.5 });
    expect(parsed.warnings).toEqual([]);
    expect(() => haccpDraftSchema.parse({ controls: [{ processStep: "x", hazardType: "MAGIC", severity: 9 }] })).toThrow();
    expect(() => capaDraftSchema.parse({ rootCauseAnalysis: "x", corrective: [] })).toThrow();
  });
  it("does not treat the string 'false' as true", () => {
    const parsed = haccpDraftSchema.parse({ controls: [{ processStep: "a", hazardType: "PHYSICAL", hazardDescription: "logam", severity: 1, likelihood: 1, isCcp: "false", controlMeasure: "x", monitoringProcedure: "x", monitoringFrequency: "x", correctiveAction: "x" }] });
    expect(parsed.controls[0].isCcp).toBe(false);
  });
});

describe("auth policy", () => {
  it("password policy", () => {
    expect(passwordPolicyError("short1")).toBe("password_too_short");
    expect(passwordPolicyError("onlyletterslong")).toBe("password_needs_letters_digits");
    expect(passwordPolicyError("password123")).toBe("password_too_common");
    expect(passwordPolicyError("Rahasia-Kuat-123")).toBeNull();
  });
  it("auditor has no write permission; only owners assign owners", () => {
    const writes = Object.keys(PERMISSIONS).filter((p) => !p.endsWith(":read"));
    for (const p of writes) expect(roleHas("AUDITOR", p as never), p).toBe(false);
    expect(roleHas("OPERATOR", "haccp:approve")).toBe(false);
    expect(roleHas("QA_MANAGER", "haccp:approve")).toBe(true);
    expect(assignableRoles("ADMIN")).not.toContain("OWNER");
    expect(assignableRoles("QA_MANAGER")).toEqual([]);
  });
  it("slugify", () => { expect(slugify("PT Pangan Sejahtera Tbk.")).toBe("pt-pangan-sejahtera-tbk"); });
});

describe("formatting (Indonesian locale/timezones/units)", () => {
  const p = { timezone: "Asia/Jakarta", dateFormat: "dd/MM/yyyy", temperatureUnit: "C" as const, locale: "id" as const };
  const d = new Date("2026-10-28T17:30:00Z");
  it("formats in WIB/WITA/WIT", () => {
    expect(formatDate(d, p)).toBe("29/10/2026");
    expect(formatDateTime(d, p)).toBe("29/10/2026 00:30 WIB");
    expect(formatDateTime(d, { ...p, timezone: "Asia/Jayapura" })).toBe("29/10/2026 02:30 WIT");
    expect(formatDate(d, { ...p, dateFormat: "d MMM yyyy" })).toBe("29 Okt 2026");
  });
  it("converts temperatures for display and input", () => {
    expect(displayTemp(75, { temperatureUnit: "F" })).toBe("167 °F");
    expect(toCelsius(167, "F")).toBe(75);
    expect(fromCelsius(-18, "F")).toBe(-0.4);
    expect(displayValue(1500.5, "ppm", p)).toBe("1.500,5 ppm");
  });
});

describe("audit hash", () => {
  it("is stable regardless of metadata key order and changes with content", () => {
    const base = { organizationId: "o", seq: 1, actorUserId: "u", actorApiKeyId: null, action: "x", entityType: "E", entityId: "1", summary: null, createdAt: new Date(0), prevHash: null };
    const a = computeAuditHash({ ...base, metadata: { b: 1, a: 2 } });
    const b = computeAuditHash({ ...base, metadata: { a: 2, b: 1 } });
    expect(a).toBe(b);
    expect(computeAuditHash({ ...base, metadata: { a: 3, b: 1 } })).not.toBe(a);
  });
});
