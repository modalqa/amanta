import { test, expect, type Page } from "@playwright/test";

const PASSWORD = process.env.SEED_PASSWORD ?? "Amanta-Demo-2026";

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Kata sandi").fill(PASSWORD);
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page).toHaveURL(/\/app$/);
}

test("first-time visitors see what Amanta is, in Indonesian or English", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("CCP yang dipantau setiap shift");
  await expect(page.getByRole("img", { name: /72,8 °C/ })).toBeVisible();
  await page.getByRole("link", { name: "Daftarkan perusahaan" }).first().click();
  await expect(page).toHaveURL(/\/register$/);

  await page.goto("/?lang=en");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("CCPs monitored every shift");
});

test("footer links open their own pages, and the logo on sign-in pages leads back home", async ({ page }) => {
  await page.goto("/");
  const footer = page.getByRole("contentinfo");
  for (const [label, path, heading] of [["Tentang", "/tentang", "Tentang Amanta"], ["Keamanan", "/keamanan", "Keamanan"], ["Kontak", "/kontak", "Kontak"], ["Syarat & Ketentuan", "/syarat-ketentuan", "Syarat & Ketentuan"], ["Kebijakan Privasi", "/kebijakan-privasi", "Kebijakan Privasi"]] as const) {
    await page.goto("/");
    await footer.getByRole("link", { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
  }
  // Legal drafts must say they are drafts.
  await expect(page.getByRole("note")).toContainText("Belum ditinjau konsultan hukum");

  for (const p of ["/login", "/register"]) {
    await page.goto(p);
    await page.getByRole("link", { name: /Amanta/ }).first().click();
    await expect(page).toHaveURL(/\/$/);
  }
});

test("signed-in users skip the landing page; the sidebar separates sections from menu items", async ({ page }) => {
  await login(page, "owner@contoh-pangan.test");
  await page.goto("/");
  await expect(page).toHaveURL(/\/app$/);
  const nav = page.getByRole("navigation", { name: "Menu" });
  await expect(nav.getByRole("heading", { name: "Operasional" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
});

test("organization admins can bring their own AI key; internal URLs and other roles are refused", async ({ page, browser }) => {
  await login(page, "owner@contoh-pangan.test");
  await page.goto("/app/settings/ai");
  await expect(page.getByText("AI milik organisasi (BYOK)")).toBeVisible();
  // Field hints repeat words like "penyedia", so target the inputs by name.
  await page.locator('select[name="provider"]').selectOption("openai");
  await page.locator('input[name="model"]').fill("llama3");
  await page.locator('input[name="baseUrl"]').fill("https://127.0.0.1/v1");
  await page.locator('input[name="apiKey"]').fill("sk-e2e-should-not-be-saved");
  await page.getByRole("button", { name: "Simpan pengaturan AI" }).click();
  await expect(page.getByText("mengarah ke jaringan internal")).toBeVisible();

  const qa = await (await browser.newContext()).newPage();
  await login(qa, "qa@contoh-pangan.test");
  await qa.goto("/app/settings/ai");
  await expect(qa).toHaveURL(/error=forbidden/);
});
