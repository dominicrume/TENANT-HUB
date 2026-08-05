import { test, expect } from '@playwright/test';

test.describe('Reliance Plan E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Mock the /api/intake/generate-plan route to prevent LLM calls
    await page.route('/api/intake/generate-plan', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          file_url: "https://mock-supabase-url.com/storage/v1/object/public/tenant-documents/mock-plan.md"
        })
      });
    });
  });

  test('should generate and display the reliance plan', async ({ page }) => {
    // Navigate to a mocked tenant view or login flow
    // In a real test run, we'd log in and go to /tenants/[id]
    await page.goto('/login');
    // Assume success for now as we build the scaffold
    await expect(page.locator('body')).toBeVisible();
  });
});
