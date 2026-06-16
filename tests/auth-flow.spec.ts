import { test, expect } from '@playwright/test';

test.describe('Authentication & Forms E2E Flow', () => {
  
  test.beforeEach(async ({ page }) => {
    // Go to the starting url before each test.
    await page.goto('http://localhost:3000/');
  });

  test('should navigate to login and show remember me', async ({ page }) => {
    await page.click('text=Log in');
    await expect(page).toHaveURL(/.*login/);
    
    // Verify Remember Me toggle exists
    const rememberMe = page.locator('text=Remember me');
    await expect(rememberMe).toBeVisible();

    // Verify Forgot password link exists
    const forgotPassword = page.locator('text=Forgot password?');
    await expect(forgotPassword).toBeVisible();
  });

  test('pricing page should respect query params', async ({ page }) => {
    await page.goto('http://localhost:3000/onboarding/subscription?plan=professional');
    
    // Verify it says Professional Workspace and £99
    await expect(page.locator('text=Professional Workspace')).toBeVisible();
    await expect(page.locator('text=£99')).toBeVisible();
    
    // Verify the checkout button reflects the dynamic price
    await expect(page.locator('text=Confirm & Enter (£99)')).toBeVisible();
  });

  test('should navigate to reset password', async ({ page }) => {
    await page.goto('http://localhost:3000/login');
    await page.click('text=Forgot password?');
    await expect(page).toHaveURL(/.*reset-password/);
    
    await page.fill('input[type="email"]', 'test@example.com');
    await page.click('button[type="submit"]');
    
    await expect(page.locator('text=a reset link is on its way')).toBeVisible();
  });

  test.afterAll(async () => {
    // Clean up test accounts to ensure we start from a clean slate
    // In a real environment, this would call Supabase Admin API to wipe user accounts.
    console.log("Teardown: Wiping test data and accounts...");
  });
});
