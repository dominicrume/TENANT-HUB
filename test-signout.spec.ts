import { test, expect } from '@playwright/test';

test('test sign up and sign out', async ({ page }) => {
  const timestamp = Date.now();
  const email = `testuser${timestamp}@example.com`;
  const password = `password123`;

  console.log("Navigating to signup page...");
  await page.goto('http://localhost:3000/signup');
  
  console.log("Filling out signup form...");
  await page.fill('#fullName', 'Test User');
  await page.fill('#email', email);
  await page.fill('#password', password);
  
  console.log("Submitting signup form...");
  await page.click('button[type="submit"]');

  console.log("Waiting for login page...");
  await page.waitForURL('**/login', { timeout: 10000 });
  
  console.log("Filling out login form...");
  await page.fill('#email', email);
  await page.fill('#password', password);
  
  console.log("Submitting login form...");
  await page.click('button[type="submit"]');

  console.log("Waiting for dashboard...");
  await page.waitForURL('**/dashboard', { timeout: 10000 });

  console.log("Clicking Sign Out...");
  await page.click('text="Sign Out"');

  console.log("Waiting for login page or auth callback...");
  await page.waitForURL('**/login', { timeout: 10000 });
  
  console.log("Signout successful!");
});
