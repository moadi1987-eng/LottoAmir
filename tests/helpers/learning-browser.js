'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');

async function openLearningHarness() {
  const root = fs.realpathSync(path.resolve(__dirname, '../..'));
  const server = http.createServer((request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const candidate = path.resolve(root, `.${pathname === '/' ? '/tests/fixtures/learning-harness.html' : pathname}`);
      const file = fs.realpathSync(candidate);
      if (!file.startsWith(`${root}${path.sep}`) || !fs.statSync(file).isFile()) throw new Error('Not found');
      const type = ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })[path.extname(file).toLowerCase()];
      response.writeHead(200, { 'Content-Type': type || 'application/octet-stream' });
      fs.createReadStream(file).pipe(response);
    } catch (_) { response.writeHead(404); response.end('Not found'); }
  });
  let browser;
  let context;
  let page;
  const close = async () => {
    try { if (page) await page.close(); }
    finally {
      try { if (context) await context.close(); }
      finally {
        try { if (browser) await browser.close(); }
        finally { await new Promise(resolve => server.close(resolve)); }
      }
    }
  };
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    browser = await chromium.launch({ headless: true,
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
    context = await browser.newContext();
    page = await context.newPage();
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    await page.goto(`${baseUrl}/tests/fixtures/learning-harness.html`);
    return { browser, context, page, baseUrl, close };
  } catch (error) { await close(); throw error; }
}

module.exports = { openLearningHarness };
