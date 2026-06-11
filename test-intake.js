const { chromium } = require('playwright');

(async () => {
  console.log("🚀 Launching browser...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
  page.on('pageerror', err => console.error('BROWSER ERROR:', err.message));

  const timestamp = Date.now();
  const email = `staff${timestamp}@example.com`;
  const password = `Password123!`;
  const fullName = `Staff Member ${timestamp}`;
  const tenantName = `Tenant ${timestamp}`;

  try {
    // 1. Sign up
    console.log("➡️ Navigating to signup page...");
    await page.goto('http://localhost:3000/signup');
    await page.fill('#fullName', fullName);
    await page.fill('#email', email);
    await page.fill('#password', password);
    await page.selectOption('#role', 'manager');
    console.log("➡️ Submitting signup form...");
    await page.click('button[type="submit"]');

    // 2. Wait for dashboard redirect
    console.log("➡️ Waiting for dashboard redirect...");
    await page.waitForURL('**/dashboard', { timeout: 15000 });
    console.log("✅ Logged in successfully!");

    // 5. Navigate to New Intake
    console.log("➡️ Navigating to new intake selection...");
    await page.goto('http://localhost:3000/intake/new');
    await page.waitForURL('**/intake/new', { timeout: 10000 });

    // 6. Click Manual Entry
    console.log("➡️ Clicking Manual Entry...");
    await page.click('button:has-text("Manual Entry")');

    // 7. Wait for redirect to review step (Step 3)
    console.log("➡️ Waiting for review page redirect...");
    await page.waitForURL('**/intake/*/review', { timeout: 15000 });
    const reviewUrl = page.url();
    console.log(`✅ Arrived at review page: ${reviewUrl}`);
    
    // Wait for loading state to finish
    await page.waitForSelector('text=Loading draft details...', { state: 'detached', timeout: 10000 });
    // 8. Fill in details in the review page form
    console.log("➡️ Filling in review form fields...");
    
    // Selecting Mr
    await page.selectOption('select:has-text("Select Title")', 'Mr');
    
    // Text inputs
    await page.fill('[placeholder="e.g., Orume Dominic Uririe"]', tenantName);
    await page.fill('[placeholder="e.g., AB 12 34 56 C"]', 'AB123456C');
    await page.fill('[placeholder="e.g., 123 High Street, London"]', '10 Downing St, London');
    await page.fill('[placeholder="e.g., E1 6AN"]', 'SW1A 2AA');
    await page.fill('[placeholder="e.g., Room 1"]', 'Room 101');
    await page.fill('[placeholder="e.g., 07700 900077"]', '07700900077');
    await page.fill('[placeholder="e.g., user@example.com"]', 'johndoe@example.com');
    await page.fill('[placeholder="e.g., English, Arabic"]', 'English, French');
    await page.fill('[placeholder="e.g., 500.00"]', '150.00');
    await page.fill('[placeholder="e.g., Jane Doe"]', 'Sarah Doe');
    await page.fill('[placeholder="e.g., Brother"]', 'Sister');
    await page.fill('[placeholder="e.g., 07700 900088"]', '07700900088');
    await page.fill('[placeholder="e.g., 456 Main St, London"]', '123 Main St, London');
    await page.fill('[placeholder="e.g., Dr. Smith (City Clinic)"]', 'Dr. Watson');
    await page.fill('[placeholder="e.g., Officer Jones"]', 'Officer Krupke');
    
    // Select dropdowns
    await page.selectOption('select:has-text("Select Nationality")', 'British');
    await page.selectOption('select:has-text("Select Benefit Type")', 'Universal Credit');
    await page.selectOption('select:has-text("Select Frequency")', 'Monthly');

    // Dates (we need to be careful with date fields, let's select all date inputs)
    const dateInputs = await page.locator('input[type="date"]').all();
    console.log(`Found ${dateInputs.length} date inputs. Filling them...`);
    if (dateInputs[0]) await dateInputs[0].fill('1990-01-01'); // DOB
    if (dateInputs[1]) await dateInputs[1].fill('2026-06-01'); // Moved in
    if (dateInputs[2]) await dateInputs[2].fill('2015-05-15'); // UK entry

    console.log("➡️ Submitting review details...");
    await page.click('button:has-text("Confirm & Continue")');

    // 9. Wait for Verify step (Step 4)
    console.log("➡️ Waiting for verify page redirect...");
    await page.waitForURL('**/intake/*/verify', { timeout: 15000 });
    const verifyUrl = page.url();
    console.log(`✅ Arrived at verify page: ${verifyUrl}`);
    
    // Wait for loading state to finish
    await page.waitForSelector('text=Loading draft details...', { state: 'detached', timeout: 10000 });

    // 10. Check if the fields show data or empty
    console.log("➡️ Inspecting page content on verify page (waiting for data to load)...");
    let fullNameValue = "—";
    let dobValue = "—";
    let ninoValue = "—";
    
    for (let i = 0; i < 20; i++) {
      fullNameValue = await page.locator('span:has-text("Full Name") + div').innerText();
      dobValue = await page.locator('span:has-text("Date of Birth") + div').innerText();
      ninoValue = await page.locator('span:has-text("NINO") + div').innerText();
      if (fullNameValue !== "—") break;
      await page.waitForTimeout(500);
    }

    console.log(`[Verify Page] Full Name value displayed is: "${fullNameValue}"`);
    console.log(`[Verify Page] Date of Birth value displayed is: "${dobValue}"`);
    console.log(`[Verify Page] NINO value displayed is: "${ninoValue}"`);

    if (fullNameValue !== tenantName) {
      console.error(`❌ ERROR: Intake details mismatch or empty (got "${fullNameValue}", expected "${tenantName}") on the verify page!`);
    } else {
      console.log("✅ SUCCESS: Intake details loaded successfully on the verify page!");
      await page.screenshot({ path: 'qa_test.png', fullPage: true });
      console.log("📸 Saved verify page screenshot to qa_test.png");
    }

    // 11. Sign form
    console.log("➡️ Signing the form...");
    await page.fill('input[style*="width: 100%"]', tenantName);
    await page.click('button:has-text("Confirm & Sign")');

    // 12. Wait for Complete step (Step 5)
    console.log("➡️ Waiting for complete page redirect...");
    await page.waitForURL('**/intake/*/complete', { timeout: 15000 });
    console.log(`✅ Arrived at complete page: ${page.url()}`);

    // 13. Wait for tenant record creation to complete
    console.log("➡️ Waiting for tenant record creation to complete...");
    let completeHeading = "Finalising…";
    for (let i = 0; i < 20; i++) {
      completeHeading = await page.locator('h1').innerText();
      if (completeHeading.includes("created successfully")) break;
      await page.waitForTimeout(500);
    }
    console.log(`[Complete Page] Title displayed: "${completeHeading}"`);

    if (completeHeading.includes("created successfully")) {
      console.log("✅ SUCCESS: Entire intake process completed successfully!");
    } else {
      const errorText = await page.locator('p').innerText().catch(() => "No error paragraph found");
      console.error(`❌ ERROR: Complete page loaded but title is: "${completeHeading}". Error details: "${errorText}"`);
    }

  } catch (err) {
    console.error("❌ Test failed with error:", err);
    // Take a screenshot of the failure for debugging
    await page.screenshot({ path: 'test-failure.png', fullPage: true });
    console.log("📸 Saved failure screenshot to test-failure.png");
    process.exit(1);
  } finally {
    console.log("🧹 Closing browser...");
    await browser.close();
  }
})();
