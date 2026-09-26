import { test, expect } from "@playwright/test";

/**
 * BUILD_PLAN C05 — the five folded pages 301 to their new homes, and every
 * removed function is reachable in two taps. Redirects are declared in
 * next.config.js, so they hold before middleware and need no sign-in.
 */
const MOVED: Record<string, string> = {
  "/sessions": "/reports#sessions",
  "/handovers": "/tenants#handover",
  "/communications": "/tenants",
  "/risk-flags": "/dashboard",
  "/ai-brain": "/tenants",
  "/audit-log": "/audit",
};

for (const [from, to] of Object.entries(MOVED)) {
  test(`${from} redirects to ${to}`, async ({ request, baseURL }) => {
    const res = await request.get(`${baseURL}${from}`, { maxRedirects: 0 });
    expect([301, 302, 307, 308]).toContain(res.status());
    const location = res.headers()["location"] ?? "";
    expect(location.replace(baseURL ?? "", "")).toBe(to);
  });
}

// Two-tap paths, checked when a staff account is available (E2E_EMAIL / E2E_PASSWORD).
const email = process.env.E2E_EMAIL, password = process.env.E2E_PASSWORD;
test.describe("two taps to every folded function", () => {
  test.skip(!email || !password, "needs E2E_EMAIL and E2E_PASSWORD");

  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', email!);
    await page.fill('input[type="password"]', password!);
    await page.click('button[type="submit"]');
    await page.waitForURL(/dashboard/);
  });

  test("Today → People shows the handover panel and incident log", async ({ page }) => {
    await page.click('nav[aria-label="Main"] >> text=People');
    await expect(page.locator("#handover")).toBeVisible();
    await expect(page.getByRole("button", { name: /Log an incident/ })).toBeVisible();
  });

  test("People → a tenant shows Messages and Ask the AI tabs", async ({ page }) => {
    await page.goto("/tenants");
    const first = page.locator('a[href^="/tenants/"]').first();
    await first.click();
    await expect(page.getByRole("button", { name: "Messages" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Ask the AI" })).toBeVisible();
  });

  test("Today → Monthly report → sessions summary and numbers", async ({ page }) => {
    await page.click("text=Monthly report");
    await expect(page).toHaveURL(/reports/);
    await expect(page.locator("#sessions")).toBeVisible();
    await expect(page.locator('a[href="/analytics"]')).toBeVisible();
  });

  test("nav has at most eight items", async ({ page }) => {
    const n = await page.locator('aside.rail nav[aria-label="Main"] a').count();
    expect(n).toBeLessThanOrEqual(8);
  });
});
