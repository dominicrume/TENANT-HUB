const { chromium } = require('playwright');

(async () => {
  console.log("Launching browser...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const timestamp = Date.now();
  const email = `testuser${timestamp}@example.com`;
  const password = `password123`;

  try {
    console.log("Navigating to signup page...");
    await page.goto('http://localhost:3000/signup');
    
    console.log("Filling out signup form...");
    await page.fill('#fullName', 'Test User');
    await page.fill('#email', email);
    await page.fill('#password', password);
    
    console.log("Submitting signup form...");
    await page.click('button[type="submit"]');

    console.log("Waiting for dashboard...");
    await page.waitForURL('**/dashboard', { timeout: 15000 });

    console.log("Clicking Sign Out...");
    await page.click('text="Sign Out"');

    console.log("Waiting for login page or home page...");
    await page.waitForURL('**/login', { timeout: 10000 });
    
    console.log("Signout successful!");
  } catch (err) {
    console.error("Test failed:", err);
    process.exit(1);
  } finally {
    console.log("Closing browser...");
    await browser.close();
  }
})();
