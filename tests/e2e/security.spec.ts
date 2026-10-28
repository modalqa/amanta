import { test, expect, type Page } from "@playwright/test";

const PASSWORD = process.env.SEED_PASSWORD ?? "Amanta-Demo-2026";

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Kata sandi").fill(PASSWORD);
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page).toHaveURL(/\/app$/);
}

test("unauthenticated users are redirected and APIs reject them", async ({ page, request }) => {
  await page.goto("/app/deviations");
  await expect(page).toHaveURL(/\/login/);
  expect((await request.get("/app/reports/download?kind=haccp-plan&format=pdf")).status()).toBe(401);
  expect((await request.get("/api/v1/batches")).status()).toBe(401);
  expect((await request.get("/api/v1/batches", { headers: { authorization: "Bearer amk_aaaaaaaa_bbbbbbbbbbbbbbbbbbbbbbbbbbbbb" } })).status()).toBe(401);
});

test("tenant isolation through the UI: another tenant cannot open foreign records", async ({ page, browser }) => {
  await login(page, "qa@contoh-pangan.test");
  await page.goto("/app/deviations");
  const href = await page.locator('a[href^="/app/deviations/c"]').first().getAttribute("href");
  const docRes = await page.request.get(href!);
  expect(docRes.status()).toBe(200);

  const other = await (await browser.newContext()).newPage();
  await login(other, "owner@sambal-lain.test");
  const res = await other.goto(href!);
  expect(res!.status()).toBe(404);
  await other.goto("/app/suppliers");
  await expect(other.getByText("CV Ayam Segar Priangan")).toHaveCount(0);
  await expect(other.getByText("Petani Cabai Garut")).toBeVisible();
});

test("auditor is read-only (no write controls rendered, server rejects actions)", async ({ page }) => {
  await login(page, "auditor@contoh-pangan.test");
  await page.goto("/app/haccp");
  await expect(page.getByRole("link", { name: "Kendali baru" })).toHaveCount(0);
  await page.goto("/app/haccp/new");
  await expect(page).toHaveURL(/error=forbidden/);
  await expect(page.locator("[role=alert]:not(#__next-route-announcer__)")).toContainText("tidak memiliki izin");
  await page.goto("/app/audit");
  await expect(page.getByRole("heading", { name: "Jejak audit" })).toBeVisible();
  await page.goto("/app/settings/members");
  await expect(page).toHaveURL(/error=forbidden/);
});

test("operator sees checklist execution but not HACCP approval", async ({ page }) => {
  await login(page, "operator@contoh-pangan.test");
  await page.goto("/app/checklists");
  await expect(page.getByRole("heading", { name: "Isi checklist sekarang" })).toBeVisible();
  await page.goto("/app/haccp?status=APPROVED");
  await expect(page.getByRole("button", { name: "Setujui yang dipilih" })).toHaveCount(0);
});

test("API key: scoped access, sensor CCP ingestion opens a deviation", async ({ page, request }) => {
  await login(page, "owner@contoh-pangan.test");
  await page.goto("/app/settings/api-keys");
  await page.getByLabel("Nama").fill("Sensor suhu lini 1");
  await page.locator('input[value="ccp:record"]').check();
  await page.locator('input[value="haccp:read"]').check();
  await page.getByRole("button", { name: "Buat API key" }).click();
  const key = (await page.locator("code", { hasText: /^amk_/ }).textContent())!.trim();
  expect(key).toMatch(/^amk_[a-z0-9]{8}_/);
  const auth = { authorization: `Bearer ${key}` };

  const controls = await (await request.get("/api/v1/haccp-controls", { headers: auth })).json();
  const cooking = controls.data.find((c: { ccpCode: string }) => c.ccpCode === "CCP-1");
  expect(cooking).toBeTruthy();
  // Out-of-scope endpoint is forbidden.
  expect((await request.get("/api/v1/suppliers", { headers: auth })).status()).toBe(403);
  // Validation errors are reported, not 500.
  expect((await request.post("/api/v1/ccp-records", { headers: auth, data: { haccpControlId: cooking.id, value: "abc" } })).status()).toBe(400);
  const res = await request.post("/api/v1/ccp-records", { headers: auth, data: { haccpControlId: cooking.id, value: 71.2, note: "sensor S-01" } });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.data.withinLimits).toBe(false);
  expect(body.data.deviationId).toBeTruthy();
});

test("upload validation rejects disguised files", async ({ page }) => {
  await login(page, "qa@contoh-pangan.test");
  await page.goto("/app/documents");
  // An executable renamed to .pdf
  await page.getByLabel("Berkas").first().setInputFiles({ name: "invoice.pdf", mimeType: "application/pdf", buffer: Buffer.from("MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xff\xff\x00\x00") });
  await page.getByRole("button", { name: "Unggah" }).click();
  await expect(page.locator("[role=alert]:not(#__next-route-announcer__)")).toContainText(/tidak diizinkan|tidak sesuai/);
});
