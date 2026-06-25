const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    ignoreHTTPSErrors: true
  });
  const page = await context.newPage();
  
  const consoleMessages = [];
  page.on('console', msg => {
    consoleMessages.push({ type: msg.type(), text: msg.text() });
  });
  
  const apiResponses = [];
  page.on('response', response => {
    if (response.url().includes('/api/')) {
      apiResponses.push({
        url: response.url(),
        status: response.status()
      });
    }
  });

  console.log('=== Opening frontend ===');
  await page.goto('https://podcast-platform-q3yt050tc-gongyijie85s-projects.vercel.app', {
    waitUntil: 'networkidle',
    timeout: 30000
  });
  await page.waitForTimeout(2000);
  
  console.log('=== Page loaded ===');
  const bodyText = await page.locator('body').innerText();
  console.log(bodyText.substring(0, 300));
  
  // Click register
  console.log('\n=== Clicking Register ===');
  const registerLink = page.locator('text=注册').first();
  if (await registerLink.isVisible()) {
    await registerLink.click();
    await page.waitForTimeout(2000);
  }
  
  // Take screenshot of register page
  await page.screenshot({ path: 'D:\\Broadcast\\podcast-platform\\register-page.png', fullPage: true });
  console.log('Screenshot saved: register-page.png');
  
  // Fill register form
  console.log('\n=== Filling register form ===');
  const emailInput = page.locator('input[type="email"], input[name="email"]').first();
  const passwordInput = page.locator('input[type="password"]').first();
  const nicknameInput = page.locator('input[name="nickname"]').first();
  
  if (await emailInput.isVisible()) {
    await emailInput.fill('verify@example.com');
    await passwordInput.fill('Test123456');
    if (await nicknameInput.isVisible()) {
      await nicknameInput.fill('VerifyUser');
    }
    
    // Click submit
    const submitBtn = page.locator('button[type="submit"]').first();
    if (await submitBtn.isVisible()) {
      await submitBtn.click();
      await page.waitForTimeout(3000);
    }
  }
  
  // Take screenshot after register
  await page.screenshot({ path: 'D:\\Broadcast\\podcast-platform\\after-register.png', fullPage: true });
  console.log('Screenshot saved: after-register.png');
  
  // Check current URL and page content
  console.log('\n=== Current URL ===');
  console.log(page.url());
  
  const finalText = await page.locator('body').innerText();
  console.log('\n=== Page text ===');
  console.log(finalText.substring(0, 500));
  
  // Print API responses
  console.log('\n=== API Responses ===');
  apiResponses.forEach(r => {
    console.log(`${r.status} ${r.url}`);
  });
  
  // Print console errors
  const errors = consoleMessages.filter(m => m.type === 'error');
  if (errors.length > 0) {
    console.log('\n=== Console Errors ===');
    errors.forEach(e => console.log(e.text));
  }
  
  await browser.close();
  console.log('\n=== Done ===');
})();
