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
  return ({
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function createServer() {
  return http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const relative = pathname === '/' ? '/lotto_analyzer.html' : pathname;
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

function makeCombinations(seed, label) {
  return Array.from({ length: 14 }, (_, index) => ({
    comboNum: index + 1,
    strategy: `${label} ${index + 1}`,
    numbers: Array.from({ length: 6 }, (_, offset) => ((seed + index + offset * 6) % 37) + 1)
      .sort((a, b) => a - b),
    strong: (index % 7) + 1,
  }));
}

function makePin(source, mode, seed) {
  return {
    source,
    mode,
    label: `${source}-${mode}`,
    pinnedAt: '2026-07-14T12:00:00.000Z',
    anchorDrawNumber: 4000,
    anchorDrawDate: '14/07/2026',
    combinations: makeCombinations(seed, `${source}-${mode}`),
  };
}

async function openAnalyzer(browser, baseUrl, initState) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  if (initState) {
    await context.addInitScript(state => {
      for (const [key, value] of Object.entries(state)) {
        localStorage.setItem(key, JSON.stringify(value));
      }
    }, initState);
  }
  const page = await context.newPage();
  page.on('dialog', dialog => { void dialog.accept(); });
  await page.route(/fonts\.googleapis\.com|cdn\.sheetjs\.com/, route => route.abort());
  await page.goto(`${baseUrl}/lotto_analyzer.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof loadPinnedForms === 'function');
  return { context, page };
}

async function verifyResponsiveGroups(browser, baseUrl, viewport, screenshotName) {
  const session = await openAnalyzer(browser, baseUrl);
  await session.page.setViewportSize(viewport);
  const pins = {
    version: 2,
    main: {
      baseline: makePin('main', 'baseline', 1),
      improved: makePin('main', 'improved', 8),
    },
    form2: {
      baseline: makePin('form2', 'baseline', 15),
      improved: makePin('form2', 'improved', 22),
    },
  };
  pins.main.improved.anchorDrawNumber = 4001;
  pins.main.improved.anchorDrawDate = '17/07/2026';

  await session.page.evaluate(pinnedState => {
    pinnedForms = pinnedState;
    currentData = [
      { drawNumber: 4002, date: '20/07/2026', numbers: [1, 2, 3, 4, 5, 6], strong: 1 },
      { drawNumber: 4001, date: '17/07/2026', numbers: [7, 8, 9, 10, 11, 12], strong: 2 },
    ];
    document.getElementById('results').style.display = 'block';
    renderPinnedFormStatus();
    renderPinnedFutureComparisons();
  }, pins);

  assert.strictEqual(await session.page.locator('.pinned-future-group').count(), 2);
  assert.strictEqual(await session.page.locator('.pinned-future-source').count(), 4);
  const modes = await session.page.locator('.pinned-future-source').evaluateAll(nodes =>
    nodes.map(node => node.dataset.pinMode)
  );
  assert.deepStrictEqual(modes, ['baseline', 'improved', 'baseline', 'improved']);

  const mainGroup = session.page.locator('.pinned-future-group[data-pin-source="main"]');
  assert.ok((await mainGroup.locator('[data-pin-mode="baseline"]').textContent())
    .includes('2 הגרלות עתידיות'));
  assert.ok((await mainGroup.locator('[data-pin-mode="improved"]').textContent())
    .includes('1 הגרלות עתידיות'));

  const width = await session.page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  assert.ok(width.scroll <= width.client + 1, 'Analyzer must not overflow horizontally');

  const firstGroupSlots = mainGroup.locator('.pinned-future-source');
  const boxes = await firstGroupSlots.evaluateAll(nodes => nodes.map(node => {
    const rect = node.getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width };
  }));
  if (viewport.width > 768) {
    assert.ok(Math.abs(boxes[0].top - boxes[1].top) < 2, 'Desktop slots must be side by side');
    assert.ok(boxes[1].left !== boxes[0].left, 'Desktop slots must occupy separate columns');
  } else {
    assert.ok(boxes[1].top > boxes[0].top, 'Mobile slots must stack');
  }

  await session.page.screenshot({ path: path.join(outputDir, screenshotName), fullPage: true });
  await session.context.close();
}

(async function verifyPinnedForms() {
  const server = createServer();
  const launchOptions = { headless: true };
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
    launchOptions.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  }
  const browser = await chromium.launch(launchOptions);
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    const legacyMain = makePin('main', 'baseline', 1);
    const legacyForm2 = makePin('form2', 'baseline', 5);
    delete legacyMain.mode;
    delete legacyForm2.mode;
    const legacy = { version: 1, main: legacyMain, form2: legacyForm2 };

    const migratedSession = await openAnalyzer(browser, baseUrl, { lottoPinnedFormsV1: legacy });
    const migrated = await migratedSession.page.evaluate(() => ({
      memory: pinnedForms,
      v2: JSON.parse(localStorage.getItem('lottoPinnedFormsV2')),
      v1: JSON.parse(localStorage.getItem('lottoPinnedFormsV1')),
    }));
    assert.ok(migrated.memory.main.baseline);
    assert.ok(migrated.memory.form2.baseline);
    assert.strictEqual(migrated.memory.main.improved, null);
    assert.strictEqual(migrated.memory.form2.improved, null);
    assert.strictEqual(migrated.memory.main.baseline.mode, 'baseline');
    assert.deepStrictEqual(migrated.v1, legacy);

    await migratedSession.page.evaluate(() => {
      localStorage.setItem('lottoPinnedFormsV2', JSON.stringify({
        version: 2,
        main: { baseline: null, improved: null },
        form2: { baseline: null, improved: null },
      }));
    });
    await migratedSession.page.reload({ waitUntil: 'domcontentloaded' });
    assert.strictEqual(await migratedSession.page.evaluate(() => pinnedForms.main.baseline), null);

    await migratedSession.page.evaluate(validPin => {
      localStorage.setItem('lottoPinnedFormsV2', JSON.stringify({
        version: 2,
        main: {
          baseline: validPin,
          improved: { combinations: [{ numbers: 'invalid', strong: 1 }] },
        },
        form2: { baseline: null, improved: null },
      }));
    }, legacyMain);
    await migratedSession.page.reload({ waitUntil: 'domcontentloaded' });
    const normalizedMalformedState = await migratedSession.page.evaluate(() => pinnedForms);
    assert.ok(normalizedMalformedState.main.baseline);
    assert.strictEqual(normalizedMalformedState.main.improved, null);

    const hostilePin = makePin('main', 'baseline', 11);
    hostilePin.pinnedAt = '<img id="pin-date-markup" src=x>';
    hostilePin.anchorDrawDate = '<img id="pin-anchor-markup" src=x>';
    hostilePin.combinations[0].comboNum = '<img id="pin-combo-markup" src=x>';
    hostilePin.combinations[0].strategy = '<img id="pin-strategy-markup" src=x>';
    await migratedSession.page.evaluate(pin => {
      localStorage.setItem('lottoPinnedFormsV2', JSON.stringify({
        version: 2,
        main: { baseline: pin, improved: null },
        form2: { baseline: null, improved: null },
      }));
    }, hostilePin);
    await migratedSession.page.reload({ waitUntil: 'domcontentloaded' });
    await migratedSession.page.evaluate(() => {
      currentData = [{
        drawNumber: 4001,
        date: '17/07/2026',
        numbers: [1, 2, 3, 4, 5, 6],
        strong: 1,
      }];
      renderPinnedFormStatus();
      renderPinnedFutureComparisons();
    });
    for (const id of [
      'pin-date-markup',
      'pin-anchor-markup',
      'pin-combo-markup',
      'pin-strategy-markup',
    ]) {
      assert.strictEqual(await migratedSession.page.locator(`#${id}`).count(), 0);
    }
    assert.ok((await migratedSession.page
      .locator('[data-pin-source="main"][data-pin-mode="baseline"]')
      .textContent()).includes('<img id="pin-date-markup" src=x>'));
    await migratedSession.context.close();

    const cleanSession = await openAnalyzer(browser, baseUrl);
    assert.ok(await cleanSession.page.locator('#pinMainBaselineBtn').isDisabled());
    assert.ok(await cleanSession.page.locator('#pinMainImprovedBtn').isDisabled());

    const fixtures = {
      baseline: {
        main: makeCombinations(2, 'main-base'),
        form2: makeCombinations(8, 'form2-base'),
      },
      improved: {
        main: makeCombinations(14, 'main-improved'),
        form2: makeCombinations(20, 'form2-improved'),
      },
    };
    const result = await cleanSession.page.evaluate(forms => {
      currentData = [{
        drawNumber: 4000,
        date: '14/07/2026',
        numbers: [1, 2, 3, 4, 5, 6],
        strong: 1,
      }];
      lastAnalysis = {};
      baselineForms = forms.baseline;
      optimizedForms = forms.improved;
      currentBacktestResult = {
        policies: { main: { validated: false }, form2: { validated: true } },
      };
      const unvalidatedImproved = canPinForm('main', 'improved');
      currentBacktestResult.policies.main.validated = true;
      activeFormModes = { main: 'improved', form2: 'improved' };

      const eligibility = {
        baseline: canPinForm('main', 'baseline'),
        improved: canPinForm('main', 'improved'),
        unvalidatedImproved,
      };
      pinForm('main', 'baseline');
      pinForm('main', 'improved');
      pinForm('form2', 'baseline');
      pinForm('form2', 'improved');
      return { eligibility, state: pinnedForms };
    }, fixtures);
    assert.deepStrictEqual(result.eligibility, {
      baseline: true,
      improved: true,
      unvalidatedImproved: false,
    });
    assert.strictEqual(result.state.main.baseline.combinations[0].strategy, 'main-base 1');
    assert.strictEqual(result.state.main.improved.combinations[0].strategy, 'main-improved 1');
    assert.strictEqual(result.state.form2.baseline.combinations[0].strategy, 'form2-base 1');
    assert.strictEqual(result.state.form2.improved.combinations[0].strategy, 'form2-improved 1');
    assert.ok(!(await cleanSession.page.locator('#pinMainBaselineBtn').isDisabled()));
    assert.ok(!(await cleanSession.page.locator('#pinMainImprovedBtn').isDisabled()));

    const replaced = await cleanSession.page.evaluate(replacementRows => {
      const neighborsBefore = JSON.stringify({
        mainImproved: pinnedForms.main.improved,
        form2Baseline: pinnedForms.form2.baseline,
        form2Improved: pinnedForms.form2.improved,
      });
      baselineForms.main = replacementRows;
      activeFormModes.main = 'improved';
      pinForm('main', 'baseline');
      return {
        strategy: pinnedForms.main.baseline.combinations[0].strategy,
        neighborsBefore,
        neighborsAfter: JSON.stringify({
          mainImproved: pinnedForms.main.improved,
          form2Baseline: pinnedForms.form2.baseline,
          form2Improved: pinnedForms.form2.improved,
        }),
      };
    }, makeCombinations(27, 'main-base-replacement'));
    assert.strictEqual(replaced.strategy, 'main-base-replacement 1');
    assert.strictEqual(replaced.neighborsBefore, replaced.neighborsAfter);

    const isolated = await cleanSession.page.evaluate(() => {
      const before = JSON.stringify({
        mainImproved: pinnedForms.main.improved,
        form2Baseline: pinnedForms.form2.baseline,
        form2Improved: pinnedForms.form2.improved,
      });
      clearPinnedForm('main', 'baseline');
      currentBacktestResult = null;
      optimizedForms = { main: null, form2: null };
      renderPinnedFormStatus();
      return {
        before,
        after: JSON.stringify({
          mainImproved: pinnedForms.main.improved,
          form2Baseline: pinnedForms.form2.baseline,
          form2Improved: pinnedForms.form2.improved,
        }),
        cleared: pinnedForms.main.baseline,
        improvedEligible: canPinForm('main', 'improved'),
        savedImproved: getPinnedForm('main', 'improved'),
      };
    });
    assert.strictEqual(isolated.cleared, null);
    assert.strictEqual(isolated.before, isolated.after);
    assert.strictEqual(isolated.improvedEligible, false);
    assert.ok(isolated.savedImproved);
    assert.ok(await cleanSession.page.locator('#pinMainImprovedBtn').isDisabled());
    assert.ok((await cleanSession.page
      .locator('[data-pin-source="main"][data-pin-mode="baseline"]')
      .textContent()).includes('לא קובע'));
    assert.ok((await cleanSession.page
      .locator('[data-pin-source="main"][data-pin-mode="improved"]')
      .textContent()).includes('משופר'));
    const savedImprovedStatus = cleanSession.page
      .locator('[data-pin-source="main"][data-pin-mode="improved"]');
    assert.strictEqual(await savedImprovedStatus.locator('[data-pin-action="replace"]').count(), 1);
    assert.ok(await savedImprovedStatus.locator('[data-pin-action="replace"]').isDisabled());
    assert.ok(!(await savedImprovedStatus.locator('[data-pin-action="send"]').isDisabled()));
    assert.ok(!(await savedImprovedStatus.locator('[data-pin-action="clear"]').isDisabled()));

    const atomicFailure = await cleanSession.page.evaluate(() => {
      const before = JSON.stringify(pinnedForms);
      const originalSetItem = Storage.prototype.setItem;
      Object.defineProperty(Storage.prototype, 'setItem', {
        configurable: true,
        value() { throw new Error('simulated quota failure'); },
      });
      const nextState = normalizePinnedFormsDocument(pinnedForms);
      nextState.main.improved = null;
      const saved = savePinnedForms(nextState, { silent: true });
      Object.defineProperty(Storage.prototype, 'setItem', {
        configurable: true,
        writable: true,
        value: originalSetItem,
      });
      return { saved, before, after: JSON.stringify(pinnedForms) };
    });
    assert.strictEqual(atomicFailure.saved, false);
    assert.strictEqual(atomicFailure.before, atomicFailure.after);
    await cleanSession.context.close();

    await verifyResponsiveGroups(
      browser,
      baseUrl,
      { width: 1440, height: 900 },
      'pin-slots-desktop.png',
    );
    await verifyResponsiveGroups(
      browser,
      baseUrl,
      { width: 390, height: 844 },
      'pin-slots-mobile.png',
    );

    console.log('Pinned forms Playwright verification passed');
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}()).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
