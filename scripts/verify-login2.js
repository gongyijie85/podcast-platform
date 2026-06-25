const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ 
    headless: false,
    args: ['--disable-blink-features=AutomationControlled']
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    ignoreHTTPSErrors: true,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();
  
  // Remove webdriver property
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
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
    timeout: 60000
  });
  await page.waitForTimeout(5000);
  
  // Check if we hit security checkpoint
  const pageText = await page.locator('body').innerText();
  if (pageText.includes('安全检查') || pageText.includes('checkpoint')) {
    console.log('=== Vercel Security Checkpoint detected ===');
    console.log('Waiting 10 seconds for auto-resolve...');
    await page.waitForTimeout(10000);
    await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
  }
  
  console.log('=== Page loaded ===');
  const finalText = await page.locator('body').innerText();
  console.log(finalText.substring(0, 500));
  
  await page.screenshot({ path: 'D:\\Broadcast\\podcast-platform\\verify-screenshot.png', fullPage: true });
  console.log('Screenshot saved');
  
  console.log('\n=== API Responses ===');
  apiResponses.forEach(r => {
    console.log(`${r.status} ${r.url}`);
  });
  
  await browser.close();
  console.log('\n=== Done ===');
})();
