'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');
const { spawnSync } = require('child_process');
const { toLearningMatrix } = require('../fixtures/learning-fixture');

function learningSheetJsPath() {
  const sheetjs = process.env.LOTTO_LEARNING_SHEETJS_PATH;
  if (!sheetjs || !fs.existsSync(sheetjs)) {
    throw new Error('Set LOTTO_LEARNING_SHEETJS_PATH to an existing cached SheetJS 0.20.3 xlsx.full.min.js (the application CDN asset). See docs/learning-experiment.md test prerequisites.');
  }
  return sheetjs;
}

async function routeLearningWorkbook(page, draws) {
  const sheetjs = learningSheetJsPath();
  const python = process.env.LOTTO_LEARNING_PYTHON;
  if (!python) throw new Error('Set LOTTO_LEARNING_PYTHON to a Python executable with openpyxl. See docs/learning-experiment.md test prerequisites.');
  const result = spawnSync(python, [path.join(__dirname, 'create-learning-workbook.py')], {
    input: JSON.stringify(toLearningMatrix(draws)), maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`LOTTO_LEARNING_PYTHON must run the openpyxl fixture helper: ${result.error?.message || result.stderr.toString()}`);
  }
  await page.route('https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js',
    route => route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(sheetjs) }));
  await page.unroute(/\/NUMBERS\.xlsx(?:\?.*)?$/);
  await page.route(/\/NUMBERS\.xlsx(?:\?.*)?$/, route => route.fulfill({
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', body: result.stdout,
  }));
  return result.stdout;
}

async function configureLearningPage(page, { workbook, prizes = () => ({ schemaVersion: 1, draws: {} }) } = {}) {
  const sheetjs = learningSheetJsPath();
  const XLSX = require(sheetjs);
  await page.route(/cdn\.sheetjs\.com/, route => route.fulfill({ path: sheetjs, contentType: 'text/javascript' }));
  await page.route(/fonts\.googleapis\.com/, route => route.abort());
  if (workbook) await page.route('**/NUMBERS.xlsx', route => route.fulfill({ body: workbookBytes(workbook(), XLSX) }));
  await page.route('**/LOTTO_PRIZES.json', route => route.fulfill({ json: prizes() }));
  return { workbookBytes: rows => workbookBytes(rows, XLSX) };
}

function workbookBytes(rows, XLSX) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'draws');
  return Buffer.from(XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }));
}

async function openLearningHarness({ bfcache = false } = {}) {
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
      ...(bfcache ? { ignoreDefaultArgs: ['--disable-back-forward-cache'] } : {}),
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
    context = await browser.newContext();
    page = await context.newPage();
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    await page.goto(`${baseUrl}/tests/fixtures/learning-harness.html`);
    return { browser, context, page, baseUrl, close };
  } catch (error) { await close(); throw error; }
}

module.exports = { openLearningHarness, configureLearningPage, routeLearningWorkbook, learningSheetJsPath };
