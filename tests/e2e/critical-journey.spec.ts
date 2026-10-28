import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { readFileSync } from "node:fs";

/**
 * Critical journey through the real UI, worker and (stubbed) AI provider:
 * register → upload SOP → AI HACCP draft → human review/approval → activate checklist →
 * batch → checklist with failing CCP → deviation → AI CAPA → complete → independent
 * verification by an invited QA → close deviation → reports → audit chain.
 */
const stamp = Date.now();
const owner = { email: `owner-${stamp}@e2e.test`, password: "Rahasia-Kuat-12345", name: "Owner E2E" };
const qa = { email: `qa-${stamp}@e2e.test`, password: "Rahasia-Kuat-67890", name: "QA Verifikator" };

async function expectOk(page: Page, text: RegExp | string) {
  await expect(page.getByRole("status")).toContainText(text);
}

test.describe.serial("critical journey", () => {
  let ctxB: BrowserContext;
  let page: Page;
  let deviationUrl = "";
  let capaUrl = "";

  test.beforeAll(async ({ browser }) => {
    page = await (await browser.newContext()).newPage();
  });
  test.afterAll(async () => { await ctxB?.close(); });

  test("register a new organization", async () => {
    await page.goto("/register");
    await page.getByLabel("Nama perusahaan").fill(`PT E2E Pangan ${stamp}`);
    await page.getByLabel("Nama lengkap").fill(owner.name);
    await page.getByLabel("Email").fill(owner.email);
    await page.getByLabel("Kata sandi").fill(owner.password);
    await page.getByRole("button", { name: "Buat akun" }).click();
    await expect(page).toHaveURL(/\/app\/settings/);
    await expectOk(page, "Selamat datang");
  });

  test("upload SOP, run AI draft, review and approve controls", async () => {
    await page.goto("/app/documents");
    await page.getByLabel("Berkas").first().setInputFiles({ name: "sop-nugget.txt", mimeType: "text/plain", buffer: readFileSync("tests/fixtures/sop-nugget-ayam.txt") });
    await page.getByLabel("Judul").first().fill("SOP Produksi Nugget");
    await page.getByRole("button", { name: "Unggah" }).click();
    await expect(page).toHaveURL(/\/app\/documents\/c/);
    await expect(page.getByText("Teks siap")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("pre")).toContainText("suhu inti minimal 75");

    await page.getByRole("button", { name: "Buat draf HACCP + checklist" }).click();
    await expectOk(page, "antrean");
    const reviewLink = page.getByRole("link", { name: /Tinjau 5 kendali HACCP/ });
    await expect(reviewLink).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText("Selesai").first()).toBeVisible();

    // AI checklist cannot be activated before the linked CCPs are approved.
    await page.getByRole("link", { name: /Tinjau checklist/ }).click();
    await expect(page.getByRole("button", { name: "Setujui & aktifkan" })).toBeDisabled();

    await page.goto("/app/haccp?status=DRAFT");
    await expect(page.getByText("5 draf menunggu tinjauan")).toBeVisible();
    // Reject the allergen control individually with a note, approve the rest in bulk.
    await page.getByRole("link", { name: "Pelapisan (breading)" }).click();
    await expect(page.getByText("Draf ini dibuat oleh AI")).toBeVisible();
    await page.getByPlaceholder("Catatan tinjauan").first().fill("Dikelola sebagai PRP label");
    await page.getByRole("button", { name: "Tolak" }).click();
    await expectOk(page, "Tinjauan tersimpan");
    await page.goto("/app/haccp?status=DRAFT");
    for (const box of await page.locator('input[name="ids"]').all()) await box.check();
    await page.getByPlaceholder("Catatan tinjauan").fill("Ditinjau tim HACCP E2E");
    await page.getByRole("button", { name: "Setujui yang dipilih" }).click();
    await expectOk(page, "Tinjauan tersimpan");
    await page.goto("/app/haccp?status=APPROVED");
    await expect(page.locator("tbody tr")).toHaveCount(4);
  });

  test("activate checklist, create batch and submit a failing checklist", async () => {
    await page.goto("/app/checklists");
    await page.getByRole("link", { name: "Checklist Shift Produksi Nugget" }).click();
    await page.getByRole("button", { name: "Setujui & aktifkan" }).click();
    await expectOk(page, "diaktifkan");

    await page.goto("/app/batches");
    await page.getByText("Batch baru").click();
    await page.getByLabel("No. batch").fill(`E2E-${stamp}`);
    await page.getByLabel("Jumlah").first().fill("500");
    await page.getByRole("button", { name: "Simpan" }).click();
    await expect(page.getByRole("heading", { name: `Batch E2E-${stamp}` })).toBeVisible();

    await page.goto("/app/checklists");
    await page.getByRole("link", { name: "Checklist Shift Produksi Nugget", exact: true }).click();
    await page.getByRole("link", { name: "Isi checklist", exact: true }).click();
    await expect(page).toHaveURL(/\/run$/);
    await page.getByLabel("Batch").selectOption({ label: new RegExp(`E2E-${stamp}`) as unknown as string }).catch(async () => {
      const opt = await page.locator('select[name="batchId"] option', { hasText: `E2E-${stamp}` }).getAttribute("value");
      await page.locator('select[name="batchId"]').selectOption(opt!);
    });
    await page.getByLabel("Suhu inti nugget setelah pemasakan").fill("70");
    await page.getByLabel("Suhu adonan setelah pencampuran").fill("8");
    for (const legend of ["Test piece metal detector", "Sertifikat halal lot daging"]) {
      await page.locator("fieldset", { hasText: legend }).getByText("Ya", { exact: true }).click();
    }
    await page.getByLabel("Catatan operator").fill("Shift pagi");
    await expect(page.locator("[role=alert]:not(#__next-route-announcer__)")).toContainText("1 item di luar batas");
    await page.getByRole("button", { name: "Kirim checklist" }).click();
    await expectOk(page, "deviasi dibuat otomatis");
    await page.getByRole("link", { name: /Deviasi DEV-\d{4}-0001 dibuat/ }).click();
    await page.waitForURL(/\/app\/deviations\/c/);
    deviationUrl = page.url();
    await expect(page.getByText("Tinggi").first()).toBeVisible();
    await expect(page.getByText("Disposisi produk: Ditahan")).toBeVisible();
  });

  test("AI CAPA draft → accept → work → independent verification → close", async ({ browser }) => {
    await page.goto(deviationUrl);
    await page.getByRole("button", { name: "Buat draf CAPA" }).click();
    await expect(page.getByRole("button", { name: "Buat CAPA dari item terpilih" })).toBeVisible({ timeout: 45_000 });
    await page.getByRole("button", { name: "Buat CAPA dari item terpilih" }).click();
    await expectOk(page, "CAPA dibuat");
    await expect(page.getByText("CAPA berjalan")).toBeVisible();

    await page.getByLabel("Akar masalah").fill("Kecepatan conveyor dinaikkan tanpa validasi");
    await page.getByLabel("Disposisi produk").selectOption("REWORK");
    await page.getByRole("button", { name: "Simpan" }).first().click();
    await expectOk(page, "Tersimpan");

    // Invite an independent QA manager (segregation of duties).
    await page.goto("/app/settings/members");
    await page.getByLabel("Email").fill(qa.email);
    await page.getByLabel("Peran").selectOption("QA_MANAGER");
    await page.getByRole("button", { name: "Buat undangan" }).click();
    const inviteLink = (await page.locator("code", { hasText: "/invite/" }).textContent())!.trim();
    expect(inviteLink).toContain("/invite/");

    // Owner (assignee) completes both CAPAs.
    await page.goto("/app/capa");
    const capaLinks = await page.locator('a[href^="/app/capa/c"]').evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute("href")!));
    expect(capaLinks.length).toBe(2);
    for (const href of capaLinks) {
      await page.goto(href);
      await page.getByPlaceholder("Apa yang dilakukan").fill("Produk dimasak ulang dan parameter dikunci");
      await page.getByRole("button", { name: "Tandai selesai" }).click();
      await expect(page.getByText("Menunggu verifikasi").first()).toBeVisible();
      // The assignee cannot verify their own work.
      await expect(page.getByText("Verifikator harus berbeda")).toBeVisible();
    }
    capaUrl = capaLinks[0];

    ctxB = await browser.newContext();
    const qaPage = await ctxB.newPage();
    await qaPage.goto(inviteLink.replace(/^https?:\/\/[^/]+/, ""));
    await qaPage.getByLabel("Nama lengkap").fill(qa.name);
    await qaPage.getByLabel("Kata sandi").fill(qa.password);
    await qaPage.getByRole("button", { name: "Bergabung" }).click();
    await expect(qaPage).toHaveURL(/\/app$/);
    for (const href of capaLinks) {
      await qaPage.goto(href);
      await qaPage.getByLabel("Catatan verifikasi").fill("Diverifikasi: 5 sampel ≥ 77 °C");
      await qaPage.getByRole("button", { name: "Efektif", exact: true }).click();
      await expect(qaPage.getByText("Ditutup").first()).toBeVisible();
    }
    await qaPage.goto(deviationUrl);
    await qaPage.getByPlaceholder("Ringkasan penutupan").fill("CAPA efektif, produk diproses ulang dan lulus uji");
    await qaPage.getByRole("button", { name: "Tutup", exact: true }).click();
    await expect(qaPage.getByRole("status")).toContainText("Deviasi ditutup");
  });

  test("dashboard, reports and audit trail reflect the journey", async () => {
    await page.goto("/app");
    await expect(page.getByText("Deviasi terbuka").first()).toBeVisible();
    for (const [kind, format, magic] of [["audit-package", "pdf", "%PDF-"], ["haccp-plan", "pdf", "%PDF-"], ["deviations-capa", "xlsx", "PK"], ["ccp-log", "csv", "﻿recorded_at"]] as const) {
      const res = await page.request.get(`/app/reports/download?kind=${kind}&format=${format}`);
      expect(res.status(), kind).toBe(200);
      expect((await res.body()).toString("utf8").startsWith(magic), kind).toBe(true);
    }
    await page.goto("/app/audit?verify=1");
    await expect(page.getByText(/Rantai hash utuh/)).toBeVisible();
    await expect(page.getByText("deviation.closed")).toBeVisible();
    await expect(page.getByText("capa.verified_effective").first()).toBeVisible();
    await page.goto(capaUrl);
    await expect(page.getByText("Efektif").first()).toBeVisible();
  });
});
