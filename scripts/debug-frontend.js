const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    ignoreHTTPSErrors: true
  });
  const page = await context.newPage();
  
  // Collect console messages
  const consoleMessages = [];
  page.on('console', msg => {
    consoleMessages.push({ type: msg.type(), text: msg.text() });
  });
  
  // Collect network errors
  const networkErrors = [];
  page.on('requestfailed', request => {
    networkErrors.push({
      url: request.url(),
      error: request.failure()?.errorText
    });
  });
  
  // Collect API responses
  const apiResponses = [];
  page.on('response', response => {
    if (response.url().includes('/api/')) {
      apiResponses.push({
        url: response.url(),
        status: response.status(),
        statusText: response.statusText()
      });
    }
  });
  
  console.log('=== Opening frontend ===');
  console.log('URL: https://podcast-platform-q3yt050tc-gongyijie85s-projects.vercel.app');
  
  try {
    await page.goto('https://podcast-platform-q3yt050tc-gongyijie85s-projects.vercel.app', {
      waitUntil: 'networkidle',
      timeout: 30000
    });
    
    // Wait a bit for React to render
    await page.waitForTimeout(3000);
    
    // Take screenshot
    await page.screenshot({ 
      path: 'C:\\Users\\Administrator\\.workbuddy\\blobs\\frontend-debug-screenshot.png',
      fullPage: true
    });
    console.log('Screenshot saved to: frontend-debug-screenshot.png');
    
    // Get page title
    const title = await page.title();
    console.log(`Page title: ${title}`);
    
    // Get page content (first 500 chars)
    const content = await page.content();
    console.log(`Page HTML length: ${content.length} chars`);
    
    // Check for React root
    const hasRoot = await page.locator('#root').count();
    console.log(`React root element found: ${hasRoot > 0}`);
    
    // Check for login form
    const loginForm = await page.locator('form').count();
    console.log(`Forms found: ${loginForm}`);
    
    // Check for input fields
    const inputs = await page.locator('input').count();
    console.log(`Input fields found: ${inputs}`);
    
    // Check for buttons
    const buttons = await page.locator('button').count();
    console.log(`Buttons found: ${buttons}`);
    
    // Get visible text
    const bodyText = await page.locator('body').innerText();
    console.log(`\n=== Visible Text ===`);
    console.log(bodyText.substring(0, 500));
    
    // Print console messages
    console.log('\n=== Console Messages ===');
    consoleMessages.forEach((msg, i) => {
      console.log(`[${msg.type}] ${msg.text}`);
    });
    
    // Print network errors
    console.log('\n=== Network Errors ===');
    if (networkErrors.length === 0) {
      console.log('No network errors');
    } else {
      networkErrors.forEach(err => {
        console.log(`FAILED: ${err.url} - ${err.error}`);
      });
    }
    
    // Print API responses
    console.log('\n=== API Responses ===');
    if (apiResponses.length === 0) {
      console.log('No API calls made');
    } else {
      apiResponses.forEach(resp => {
        console.log(`${resp.status} ${resp.url}`);
      });
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
  
  await browser.close();
  console.log('\n=== Debug Complete ===');
})();
