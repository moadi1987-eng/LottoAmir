'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const outputDir = path.join(root, 'test-results');
fs.mkdirSync(outputDir, { recursive: true });

function contentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return ({
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })[extension] || 'application/octet-stream';
}

function createServer() {
  return http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const relative = pathname === '/' ? '/index.html' : pathname;
    const filePath = path.resolve(root, `.${relative}`);
    if (!filePath.startsWith(`${root}${path.sep}`)
      || !fs.existsSync(filePath)
      || !fs.statSync(filePath).isFile()) {
      response.writeHead(404);
      response.end('Not found');
      return;
    }
    response.writeHead(200, { 'Content-Type': contentType(filePath) });
    fs.createReadStream(filePath).pipe(response);
  });
}

function makeResult() {
  const combos = Array.from({ length: 14 }, (_, index) => ({
    comboNum: index + 1,
    strategy: `אסטרטגיה ${index + 1} · חלון ${[100, 200, 500][index % 3]}`,
    numbers: Array.from({ length: 6 }, (_, offset) => ((index + offset * 7) % 37) + 1)
      .sort((a, b) => a - b),
    strong: (index % 7) + 1,
  }));
  const baselineMetrics = {
    averageScore: 9.5,
    score: 9.12,
    stability: 0.8,
    bucketAverages: [9, 9.5, 10],
    averageBestMatches: 2.2,
    rate2Plus: 0.62,
    rate3Plus: 0.21,
    rate4Plus: 0.04,
    rate5Plus: 0.002,
    rate6: 0,
    strongOnBestRate: 0.29,
    averageCoverage: 29.4,
    maximumExposure: 8,
    maximumOverlap: 5,
  };
  const optimizedMetrics = {
    averageScore: 10.2,
    score: 9.996,
    stability: 0.9,
    bucketAverages: [10, 10.2, 10.4],
    averageBestMatches: 2.3,
    rate2Plus: 0.66,
    rate3Plus: 0.23,
    rate4Plus: 0.05,
    rate5Plus: 0.003,
    rate6: 0,
    strongOnBestRate: 0.30,
    averageCoverage: 31.7,
    maximumExposure: 7,
    maximumOverlap: 4,
  };
  const policy = {
    validated: true,
    baseline: baselineMetrics,
    optimized: optimizedMetrics,
    reasons: [],
  };
  return {
    split: { eligibleCount: 1212, calibrationCount: 848, holdoutCount: 364 },
    policies: { main: policy, form2: policy },
    rankings: Array.from({ length: 84 }, (_, index) => ({
      identity: `main:${(index % 14) + 1}:${[100, 200, 500][index % 3]}`,
      window: [100, 200, 500][index % 3],
      calibration: { score: 100 - index / 10, rate3Plus: 0.2, stability: 0.9 },
      holdout: { score: 95 - index / 10, rate3Plus: 0.19, stability: 0.88 },
    })),
    currentForms: {
      main: combos,
      form2: combos.map(combo => ({ ...combo, numbers: combo.numbers.slice() })),
    },
  };
}

function overlaps(first, second) {
  return first.left < second.right && first.right > second.left
    && first.top < second.bottom && first.bottom > second.top;
}

async function runViewport(browser, baseUrl, viewport, screenshotName) {
  const page = await browser.newPage({ viewport });
  await page.route(/fonts\.googleapis\.com|cdn\.sheetjs\.com/, route => route.abort());
  await page.goto(`${baseUrl}/Lotto_All_In_One.html`, { waitUntil: 'domcontentloaded' });
  await page.locator('#navBacktestBtn').click();
  await page.waitForTimeout(250);

  const frame = page.frames().find(candidate => candidate.url().includes('lotto_analyzer.html'));
  assert.ok(frame, 'Analyzer iframe must load');
  await frame.locator('#backtestWorkspace').waitFor({ state: 'visible' });
  assert.strictEqual(await frame.locator('#results').getAttribute('hidden'), '');

  await frame.evaluate(result => renderBacktestResult(result), makeResult());
  for (const panelId of ['backtestSummaryPanel', 'backtestStrategiesPanel', 'backtestComparisonPanel']) {
    await frame.locator(`.backtest-tab[data-panel="${panelId}"]`).click();
    assert.ok(await frame.locator(`#${panelId}`).isVisible(), `${panelId} must be visible after selection`);
  }
  assert.ok(!(await frame.locator('#backtestComparisonPanel').textContent()).includes('NaN'));

  const boxes = await frame.locator('.backtest-actions button:visible').evaluateAll(buttons => buttons.map(button => {
    const rect = button.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
  }));
  assert.ok(boxes.every(box => box.right > box.left && box.bottom > box.top));
  for (let first = 0; first < boxes.length; first += 1) {
    for (let second = first + 1; second < boxes.length; second += 1) {
      assert.ok(!overlaps(boxes[first], boxes[second]), 'Visible Backtest toolbar buttons must not overlap');
    }
  }

  const shellWidth = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  const analyzerWidth = await frame.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  assert.ok(shellWidth.scroll <= shellWidth.client + 1, 'Shell must not overflow horizontally');
  assert.ok(analyzerWidth.scroll <= analyzerWidth.client + 1, 'Analyzer must not overflow horizontally');

  await page.screenshot({ path: path.join(outputDir, screenshotName), fullPage: true });
  await page.close();
}

(async function verifyBacktestResponsiveUI() {
  const server = createServer();
  const launchOptions = { headless: true };
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
    launchOptions.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  }
  const browser = await chromium.launch(launchOptions);
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    await runViewport(browser, baseUrl, { width: 1440, height: 900 }, 'backtest-desktop.png');
    await runViewport(browser, baseUrl, { width: 390, height: 844 }, 'backtest-mobile.png');
    console.log('Backtest Playwright verification passed');
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}()).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
