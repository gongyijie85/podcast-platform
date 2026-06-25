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
  
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  const apiCalls = [];
  page.on('response', response => {
    if (response.url().includes('/api/')) {
      apiCalls.push({ url: response.url(), status: response.status() });
    }
  });

  await page.goto('https://podcast-platform-q3yt050tc-gongyijie85s-projects.vercel.app', {
    waitUntil: 'networkidle',
    timeout: 60000
  });
  await page.waitForTimeout(5000);

  console.log('=== API Calls ===');
  apiCalls.forEach(r => console.log(`${r.status} ${r.url}`));
  
  await browser.close();
})();
