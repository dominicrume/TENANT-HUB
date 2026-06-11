const { chromium } = require('playwright');

(async () => {
  console.log("🚀 Launching browser for live production test...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const timestamp = Date.now();
  const email = `live_staff${timestamp}@example.com`;
  const password = `Password123!`;
  const fullName = `Live Staff ${timestamp}`;

  try {
    // 1. Sign up
    console.log("➡️ Navigating to live signup page...");
    await page.goto('https://app.mattysplace.org.uk/signup');
    await page.fill('#fullName', fullName);
    await page.fill('#email', email);
    await page.fill('#password', password);
    await page.selectOption('#role', 'manager');
    
    console.log("➡️ Submitting signup form...");
    await page.click('button[type="submit"]');

    // 2. Wait for redirect to dashboard (signup auto-logs in)
    console.log("➡️ Waiting for dashboard redirect...");
    await page.waitForURL('**/dashboard', { timeout: 20000 });
    console.log("✅ Logged in successfully!");

    // 3. Navigate to New Intake
    console.log("➡️ Navigating to new intake selection...");
    await page.goto('https://app.mattysplace.org.uk/intake/new');
    await page.waitForURL('**/intake/new', { timeout: 15000 });

    // 4. Click Manual Entry
    console.log("➡️ Clicking Manual Entry...");
    await page.click('button:has-text("Manual Entry")');

    // 5. Wait for redirect to review step (Step 3)
    console.log("➡️ Waiting for review page redirect...");
    await page.waitForURL('**/intake/*/review', { timeout: 20000 });
    const reviewUrl = page.url();
    console.log(`✅ Arrived at review page: ${reviewUrl}`);

    // 6. Fill in details in the review page form
    console.log("➡️ Filling in review form fields...");
    await page.selectOption('select:has-text("Select Title")', 'Mr');
    await page.fill('[placeholder="e.g., Orume Dominic Uririe"]', 'John Doe Live');
    await page.fill('[placeholder="e.g., AB 12 34 56 C"]', 'AB123456C');
    await page.fill('[placeholder="e.g., 123 High Street, London"]', '10 Downing St, London');
    await page.fill('[placeholder="e.g., E1 6AN"]', 'SW1A 2AA');
    await page.fill('[placeholder="e.g., Room 1"]', 'Room 101');
    await page.fill('[placeholder="e.g., 07700 900077"]', '07700900077');
    await page.fill('[placeholder="e.g., user@example.com"]', 'johndoelive@example.com');
    await page.fill('[placeholder="e.g., English, Arabic"]', 'English, French');
    await page.fill('[placeholder="e.g., 500.00"]', '150.00');
    await page.fill('[placeholder="e.g., Jane Doe"]', 'Sarah Doe');
    await page.fill('[placeholder="e.g., Brother"]', 'Sister');
    await page.fill('[placeholder="e.g., 07700 900088"]', '07700900088');
    await page.fill('[placeholder="e.g., 456 Main St, London"]', '123 Main St, London');
    await page.fill('[placeholder="e.g., Dr. Smith (City Clinic)"]', 'Dr. Watson');
    await page.fill('[placeholder="e.g., Officer Jones"]', 'Officer Krupke');
    
    await page.selectOption('select:has-text("Select Nationality")', 'British');
    await page.selectOption('select:has-text("Select Benefit Type")', 'Universal Credit');
    await page.selectOption('select:has-text("Select Frequency")', 'Monthly');

    const dateInputs = await page.locator('input[type="date"]').all();
    console.log(`Found ${dateInputs.length} date inputs. Filling them...`);
    if (dateInputs[0]) await dateInputs[0].fill('1990-01-01'); // DOB
    if (dateInputs[1]) await dateInputs[1].fill('2026-06-01'); // Moved in
    if (dateInputs[2]) await dateInputs[2].fill('2015-05-15'); // UK entry

    console.log("➡️ Submitting review details...");
    await page.click('button:has-text("Confirm & Continue")');

    // 7. Wait for Verify step (Step 4)
    console.log("➡️ Waiting for verify page redirect...");
    await page.waitForURL('**/intake/*/verify', { timeout: 20000 });
    const verifyUrl = page.url();
    console.log(`✅ Arrived at verify page: ${verifyUrl}`);

    // 8. Wait for details to load (no dashes)
    console.log("➡️ Inspecting page content on verify page (waiting for data to load)...");
    let fullNameValue = "—";
    let dobValue = "—";
    let ninoValue = "—";
    
    for (let i = 0; i < 20; i++) {
      fullNameValue = (await page.locator('span:has-text("Full Name") + div').innerText()).trim();
      dobValue = (await page.locator('span:has-text("Date of Birth") + div').innerText()).trim();
      ninoValue = (await page.locator('span:has-text("NINO") + div').innerText()).trim();
      if (fullNameValue && fullNameValue !== "—") break;
      await page.waitForTimeout(500);
    }

    console.log(`[Verify Page] Full Name value displayed is: "${fullNameValue}"`);
    console.log(`[Verify Page] Date of Birth value displayed is: "${dobValue}"`);
    console.log(`[Verify Page] NINO value displayed is: "${ninoValue}"`);

    if (fullNameValue === '—' && dobValue === '—') {
      console.error("❌ ERROR: Intake details are empty (showing dash) on the verify page!");
      throw new Error("Dashes loaded instead of tenant details");
    } else {
      console.log("✅ SUCCESS: Intake details loaded successfully on the verify page!");
    }

    // 9. Sign form
    console.log("➡️ Signing the form...");
    await page.fill('input[style*="width: 100%"]', 'John Doe Live');
    await page.click('button:has-text("Confirm & Sign")');

    // 10. Wait for Complete step (Step 5)
    console.log("➡️ Waiting for complete page redirect...");
    await page.waitForURL('**/intake/*/complete', { timeout: 20000 });
    console.log(`✅ Arrived at complete page: ${page.url()}`);

    // 11. Wait for tenant record creation to complete
    console.log("➡️ Waiting for tenant record creation to complete...");
    let completeHeading = "Finalising…";
    for (let i = 0; i < 20; i++) {
      completeHeading = await page.locator('h1').innerText();
      if (completeHeading.includes("created successfully")) break;
      await page.waitForTimeout(500);
    }
    console.log(`[Complete Page] Title displayed: "${completeHeading}"`);

    if (completeHeading.includes("created successfully")) {
      console.log("✅ SUCCESS: Entire intake process completed successfully on live production!");
    } else {
      console.error(`❌ ERROR: Complete page loaded but title is: "${completeHeading}"`);
      throw new Error("Completion title failed");
    }

  } catch (err) {
    console.error("❌ Live test failed with error:", err);
    await page.screenshot({ path: 'live-test-failure.png', fullPage: true });
    console.log("📸 Saved failure screenshot to live-test-failure.png");
    process.exit(1);
  } finally {
    console.log("🧹 Closing browser...");
    await browser.close();
  }
})();
