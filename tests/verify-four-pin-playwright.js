'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');
const LottoStrategyCore = require('../lotto-strategy-core.js');
const { buildSyntheticDraws } = require('./fixtures/backtest-fixture');

const root = path.resolve(__dirname, '..');
const outputDir = path.join(root, 'test-results');
fs.mkdirSync(outputDir, { recursive: true });

const compatibleResult = LottoStrategyCore.runWalkForwardBacktest(buildSyntheticDraws(502), {
  coverageSearchIterations: 50,
  depthSearchIterations: 50,
  bootstrapSamples: 100,
});
compatibleResult.portfolio.validated = true;
compatibleResult.portfolio.reasons = [];

function contentType(filePath) {
  return ({
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function createServer() {
  return http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const relative = pathname === '/' ? '/Lotto_All_In_One.html' : pathname;
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

function getAnalyzerFrame(page) {
  return page.frames().find(frame => frame.url().includes('lotto_analyzer.html'));
}

async function waitForAnalyzerFrame(page) {
  await page.waitForFunction(() => {
    const iframe = document.getElementById('analyzerIframe');
    return Boolean(iframe && iframe.contentDocument
      && iframe.contentDocument.readyState !== 'loading');
  });
  return getAnalyzerFrame(page);
}

async function openFourPinWorkspace(page, baseUrl) {
  await page.route(/fonts\.googleapis\.com|cdn\.sheetjs\.com/, route => route.abort());
  await page.goto(`${baseUrl}/Lotto_All_In_One.html`, { waitUntil: 'domcontentloaded' });
  await page.locator('#navBacktestBtn').click();
  await page.waitForTimeout(250);
  const frame = await waitForAnalyzerFrame(page);
  assert.ok(frame, 'Analyzer iframe must load');
  await frame.locator('#backtestWorkspace').waitFor({ state: 'visible' });
  return frame;
}

async function injectPortfolio(frame, result) {
  await frame.evaluate(injectedResult => {
    currentData = [
      { drawNumber: 5002, date: '07/08/2026', numbers: [1, 2, 3, 4, 5, 6], strong: 1 },
      { drawNumber: 5001, date: '04/08/2026', numbers: [7, 8, 9, 10, 11, 12], strong: 2 },
    ];
    selectedData = currentData;
    lastAnalysis = { loaded: true };
    currentBacktestResult = injectedResult;
    hydrateFourPinPortfolio(injectedResult);
    renderBacktestResult(injectedResult);
    showBacktestPanel('fourPinPortfolioPanel');
  }, result);
}

async function captureApprovedPortfolio(context, baseUrl, screenshotName) {
  const visualPage = await context.newPage();
  await visualPage.route(/fonts\.googleapis\.com|cdn\.sheetjs\.com/, route => route.abort());
  await visualPage.goto(`${baseUrl}/lotto_analyzer.html`, { waitUntil: 'domcontentloaded' });
  await visualPage.waitForFunction(() => typeof renderBacktestResult === 'function');
  await visualPage.evaluate(() => {
    document.getElementById('backtestWorkspace').hidden = false;
  });
  await injectPortfolio(visualPage.mainFrame(), compatibleResult);
  await visualPage.locator('#fourPinPortfolioPanel').screenshot({
    path: path.join(outputDir, screenshotName),
  });
  await visualPage.close();
}

async function acceptPinAlert(page, button) {
  const dialogPromise = page.waitForEvent('dialog');
  const clickPromise = button.click();
  const dialog = await dialogPromise;
  assert.strictEqual(dialog.type(), 'alert');
  await dialog.accept();
  await clickPromise;
}

async function dismissOverwrite(page, button) {
  const dialogPromise = page.waitForEvent('dialog');
  const clickPromise = button.click();
  const dialog = await dialogPromise;
  assert.strictEqual(dialog.type(), 'confirm');
  await dialog.dismiss();
  await clickPromise;
}

async function readPinnedState(frame) {
  return frame.evaluate(() => JSON.parse(JSON.stringify(pinnedForms)));
}

function assertOnlyExpectedPins(state, expectedPaths) {
  const slots = [
    ['main', 'baseline'],
    ['main', 'improved'],
    ['form2', 'baseline'],
    ['form2', 'improved'],
  ];
  for (const [source, mode] of slots) {
    const key = `${source}.${mode}`;
    if (expectedPaths.includes(key)) {
      assert.ok(state[source][mode], `${key} must contain a PIN snapshot`);
    } else {
      assert.strictEqual(state[source][mode], null, `${key} must stay empty`);
    }
  }
}

async function assertNoHorizontalOverflow(page, frame, messagePrefix) {
  const shellWidth = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  const analyzerWidth = await frame.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  assert.ok(
    shellWidth.scrollWidth <= shellWidth.clientWidth,
    `${messagePrefix} shell must not overflow horizontally`,
  );
  assert.ok(
    analyzerWidth.scrollWidth <= analyzerWidth.clientWidth,
    `${messagePrefix} analyzer must not overflow horizontally`,
  );
}

async function verifyViewport(browser, baseUrl, viewport, screenshotName) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  let frame = await openFourPinWorkspace(page, baseUrl);
  await injectPortfolio(frame, compatibleResult);

  assert.ok(await frame.locator('#backtestWorkspace').isVisible(), 'Backtest workspace must open');
  assert.ok(await frame.locator('#fourPinPortfolioPanel').isVisible(), 'Four-PIN panel must open');

  const binarySummary = frame.locator('.portfolio-metric-card').first();
  assert.ok((await binarySummary.textContent()).includes('56 שורות 3+'));
  assert.ok(
    !/NaN|(?:^|[^A-Za-z])[-+]?Infinity(?:[^A-Za-z]|$)/.test(await binarySummary.textContent()),
    'Binary 3+ summary must contain only finite values',
  );

  const cards = frame.locator('.portfolio-form-card');
  assert.strictEqual(await cards.count(), 4, 'Approved result must render four form cards');
  for (let index = 0; index < 4; index += 1) {
    assert.strictEqual(
      await cards.nth(index).locator('[data-portfolio-row]').count(),
      14,
      `Portfolio card ${index + 1} must contain 14 rows`,
    );
  }
  const buttons = frame.locator('.portfolio-pin-button');
  assert.strictEqual(await buttons.count(), 4, 'Approved result must render four PIN buttons');
  for (let index = 0; index < 4; index += 1) {
    assert.ok(await buttons.nth(index).isVisible(), `PIN ${index + 1} must be visible`);
    assert.ok(await buttons.nth(index).isEnabled(), `PIN ${index + 1} must be enabled`);
  }

  await assertNoHorizontalOverflow(page, frame, `${viewport.width}x${viewport.height} approved`);
  await captureApprovedPortfolio(context, baseUrl, screenshotName);

  await acceptPinAlert(
    page,
    frame.locator('.portfolio-form-card[data-portfolio-role="coverage1"] .portfolio-pin-button'),
  );
  let pinState = await readPinnedState(frame);
  assertOnlyExpectedPins(pinState, ['main.baseline']);
  assert.strictEqual(pinState.main.baseline.label, 'PIN 1 - כיסוי 3+');
  assert.strictEqual(pinState.main.baseline.combinations.length, 14);

  const pinOneSnapshot = JSON.stringify(pinState.main.baseline);
  await acceptPinAlert(
    page,
    frame.locator('.portfolio-form-card[data-portfolio-role="depth2"] .portfolio-pin-button'),
  );
  pinState = await readPinnedState(frame);
  assertOnlyExpectedPins(pinState, ['main.baseline', 'form2.improved']);
  assert.strictEqual(JSON.stringify(pinState.main.baseline), pinOneSnapshot);
  assert.strictEqual(pinState.form2.improved.label, 'PIN 4 - עומק 4+');
  assert.strictEqual(pinState.form2.improved.combinations.length, 14);

  const beforeCancelledOverwrite = JSON.stringify(pinState);
  await dismissOverwrite(
    page,
    frame.locator('.portfolio-form-card[data-portfolio-role="coverage1"] .portfolio-pin-button'),
  );
  assert.strictEqual(
    JSON.stringify(await readPinnedState(frame)),
    beforeCancelledOverwrite,
    'Cancelling an occupied-slot overwrite must preserve every PIN byte-for-byte',
  );

  const customLabels = {
    pin1: `Custom PIN 1 ${viewport.width}`,
    pin4: `Custom PIN 4 ${viewport.width}`,
  };
  const beforeReload = await frame.evaluate(labels => {
    pinnedForms.main.baseline.label = labels.pin1;
    pinnedForms.main.baseline.fullLabel = `${labels.pin1} full`;
    pinnedForms.form2.improved.label = labels.pin4;
    pinnedForms.form2.improved.fullLabel = `${labels.pin4} full`;
    if (!savePinnedForms(pinnedForms)) throw new Error('Failed to persist custom portfolio labels');
    return JSON.parse(JSON.stringify(pinnedForms));
  }, customLabels);

  await page.reload({ waitUntil: 'domcontentloaded' });
  frame = await waitForAnalyzerFrame(page);
  assert.ok(frame, 'Analyzer iframe must reload');
  await frame.waitForFunction(() => typeof loadPinnedForms === 'function');
  const afterReload = await readPinnedState(frame);
  assert.strictEqual(afterReload.main.baseline.label, customLabels.pin1);
  assert.strictEqual(afterReload.main.baseline.fullLabel, `${customLabels.pin1} full`);
  assert.strictEqual(afterReload.form2.improved.label, customLabels.pin4);
  assert.strictEqual(afterReload.form2.improved.fullLabel, `${customLabels.pin4} full`);
  assert.deepStrictEqual(
    afterReload.main.baseline.combinations,
    beforeReload.main.baseline.combinations,
    'Reload must preserve the PIN 1 portfolio rows',
  );
  assert.deepStrictEqual(
    afterReload.form2.improved.combinations,
    beforeReload.form2.improved.combinations,
    'Reload must preserve the PIN 4 portfolio rows',
  );
  assert.ok((await frame.locator('#pinnedMainStatus').textContent()).includes(customLabels.pin1));
  assert.ok((await frame.locator('#pinnedForm2Status').textContent()).includes(customLabels.pin4));

  const unvalidatedResult = JSON.parse(JSON.stringify(compatibleResult));
  unvalidatedResult.portfolio.validated = false;
  unvalidatedResult.portfolio.reasons = ['portfolio-three-plus-regression'];
  await frame.evaluate(() => {
    document.getElementById('backtestWorkspace').hidden = false;
  });
  await injectPortfolio(frame, unvalidatedResult);
  assert.strictEqual(
    await frame.locator('.portfolio-metric-card').count(),
    5,
    'Unvalidated output must retain all binary metrics',
  );
  const unvalidatedText = await frame.locator('#fourPinPortfolioPanel').textContent();
  assert.ok(unvalidatedText.includes('56 שורות 3+'));
  assert.ok(!/NaN|(?:^|[^A-Za-z])[-+]?Infinity(?:[^A-Za-z]|$)/.test(unvalidatedText));
  assert.strictEqual(await frame.locator('[data-portfolio-row]').count(), 0);
  assert.strictEqual(await frame.locator('.portfolio-pin-button').count(), 0);
  assert.strictEqual(await frame.locator('.portfolio-pin-button:not(:disabled)').count(), 0);
  await assertNoHorizontalOverflow(page, frame, `${viewport.width}x${viewport.height} rejected`);

  await context.close();
}

(async function verifyFourPinEndToEnd() {
  const server = createServer();
  const launchOptions = { headless: true };
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
    launchOptions.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  }
  const browser = await chromium.launch(launchOptions);
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    await verifyViewport(
      browser,
      baseUrl,
      { width: 1440, height: 900 },
      'four-pin-desktop.png',
    );
    await verifyViewport(
      browser,
      baseUrl,
      { width: 390, height: 844 },
      'four-pin-mobile.png',
    );
    console.log('Four-PIN Playwright verification passed');
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}()).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
