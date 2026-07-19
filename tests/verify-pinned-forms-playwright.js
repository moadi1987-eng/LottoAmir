'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const outputDir = path.join(root, 'test-results');
fs.mkdirSync(outputDir, { recursive: true });
const prizeContractSource = fs.readFileSync(
  path.join(root, 'tests', 'test_update_lotto_prizes.py'),
  'utf8',
);
const prizeContractMatch = /PRIZE_SCHEMA_CONTRACT_FIXTURES_JSON = r"""([\s\S]*?)"""/
  .exec(prizeContractSource);
assert.ok(prizeContractMatch, 'Shared prize schema contract fixtures must be readable');
const prizeSchemaContract = JSON.parse(prizeContractMatch[1]);

function buildPrizeSchemaContractDocuments() {
  return prizeSchemaContract.cases.map(testCase => {
    const document = JSON.parse(JSON.stringify(prizeSchemaContract.base));
    for (const change of testCase.changes) {
      let target = document;
      for (const part of change.path.slice(0, -1)) target = target[part];
      target[change.path.at(-1)] = change.value;
    }
    if (testCase.drawKey) {
      document.draws[testCase.drawKey] = document.draws['3947'];
      delete document.draws['3947'];
    }
    return { name: testCase.name, accepted: testCase.accepted, document };
  });
}

function contentType(filePath) {
  return ({
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
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

async function readPinnedOpenDrawStats(card) {
  const read = async name => (await card
    .locator(`[data-pin-stat="${name}"]`)
    .textContent()).trim();
  return {
    draw: await read('draw'),
    drawDate: await read('draw-date'),
    regular: await read('regular'),
    rate: await read('rate'),
    strong: await read('strong'),
    best: await read('best'),
  };
}

async function readPinnedWinnings(card) {
  const band = card.locator('[data-pin-winnings-band]');
  return {
    value: (await band.locator('[data-pin-winnings="value"]').textContent()).trim(),
    meta: (await band.locator('[data-pin-winnings="meta"]').textContent()).trim(),
  };
}

async function readPinnedOpenDrawCardState(card) {
  const openDraws = card.locator('details.future-draw[open]');
  const openPanelCount = await openDraws.count();
  return {
    openPanelCount,
    openDrawLabel: openPanelCount === 1
      ? await openDraws.getAttribute('data-pin-draw-label')
      : null,
    metrics: await readPinnedOpenDrawStats(card),
    winnings: await readPinnedWinnings(card),
  };
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
  pins.main.baseline.combinations = [
    { comboNum: 1, strategy: '3 + strong', numbers: [1, 2, 3, 20, 21, 22], strong: 1 },
    { comboNum: 2, strategy: '3', numbers: [1, 2, 3, 23, 24, 25], strong: 2 },
    { comboNum: 3, strategy: '3 second', numbers: [4, 5, 6, 26, 27, 28], strong: 2 },
    { comboNum: 4, strategy: 'missing tier', numbers: [1, 2, 20, 21, 22, 23], strong: 2 },
    { comboNum: 5, strategy: 'not distributed', numbers: [20, 21, 22, 23, 24, 25], strong: 2 },
    ...Array.from({ length: 9 }, (_, index) => ({
      comboNum: index + 6,
      strategy: `no prize ${index + 6}`,
      numbers: [20, 21, 22, 23, 24, 25],
      strong: 2,
    })),
  ];
  pins.main.baseline.anchorDrawNumber = 4001;
  pins.main.baseline.anchorDrawDate = '17/07/2026';
  pins.main.improved.anchorDrawNumber = 4001;
  pins.main.improved.anchorDrawDate = '17/07/2026';

  const normalization = await session.page.evaluate(() => {
    const sourceUrl = drawNumber => `https://www.pais.co.il/Lotto/CurrentLotto.aspx?lotteryId=${drawNumber}`;
    const validDraw = drawNumber => ({
      drawNumber,
      drawDate: '20/07/2026',
      sourceUrl: sourceUrl(drawNumber),
      regular: { 3: { winnerCount: 20, prizeIls: 15 } },
    });
    const arrayDraw = Object.assign([], validDraw(4003));
    const arrayRegular = Object.assign([], { 3: { winnerCount: 20, prizeIls: 15 } });
    const arrayTier = Object.assign([], { winnerCount: 20, prizeIls: 15 });
    const normalized = normalizeLottoPrizeDocument({
      schemaVersion: 1,
      draws: {
        4002: validDraw(4002),
        4003: arrayDraw,
        4004: Object.assign(validDraw(4004), { regular: arrayRegular }),
        4005: Object.assign(validDraw(4005), { regular: { 3: arrayTier } }),
        4006: Object.assign(validDraw(4006), { regular: { 3: { winnerCount: '1e3', prizeIls: 15 } } }),
      },
    });
    return {
      accepted: [0, 1, 42, '0', '42', String(Number.MAX_SAFE_INTEGER)]
        .map(normalizePrizeInteger),
      rejected: [true, false, '0x10', '1e3', '+1', '01', ' 1', '1 ', '1.0', 1.5, '-1', -1,
        Number.MAX_SAFE_INTEGER + 1]
        .map(normalizePrizeInteger),
      rootArray: normalizeLottoPrizeDocument({ schemaVersion: 1, draws: [] }),
      mixedDocument: normalized,
    };
  });
  assert.deepStrictEqual(normalization.accepted, [0, 1, 42, 0, 42, Number.MAX_SAFE_INTEGER]);
  assert.deepStrictEqual(normalization.rejected, Array(13).fill(null));
  assert.strictEqual(normalization.rootArray, null);
  assert.strictEqual(normalization.mixedDocument, null);

  const loaderBehavior = await session.page.evaluate(async () => {
    const sourceUrl = 'https://www.pais.co.il/Lotto/CurrentLotto.aspx?lotteryId=4002';
    const validDocument = {
      schemaVersion: 1,
      draws: {
        4002: {
          drawNumber: 4002,
          drawDate: '20/07/2026',
          sourceUrl,
          regular: { 3: { winnerCount: 20, prizeIls: 15 } },
        },
      },
    };
    const originalFetch = window.fetch;
    try {
      let successFetches = 0;
      lottoPrizeDocument = null;
      lottoPrizeLoadState = 'idle';
      lottoPrizeLoadPromise = null;
      window.fetch = () => {
        successFetches++;
        return Promise.resolve({ ok: true, json: () => Promise.resolve(validDocument) });
      };
      const first = ensureDefaultPrizeData();
      const second = ensureDefaultPrizeData();
      const sharedPromise = first === second;
      const successResults = await Promise.all([first, second, ensureDefaultPrizeData()]);
      const ready = lottoPrizeLoadState === 'ready' && lottoPrizeDocument
        && Object.keys(lottoPrizeDocument.draws).join(',') === '4002';

      let failedFetches = 0;
      lottoPrizeDocument = null;
      lottoPrizeLoadState = 'idle';
      lottoPrizeLoadPromise = null;
      window.fetch = () => {
        failedFetches++;
        return Promise.reject(new Error('offline'));
      };
      const failedResults = await Promise.all([ensureDefaultPrizeData(), ensureDefaultPrizeData()]);
      const unavailable = lottoPrizeLoadState === 'unavailable' && lottoPrizeDocument === null;

      let malformedFetches = 0;
      lottoPrizeDocument = null;
      lottoPrizeLoadState = 'idle';
      lottoPrizeLoadPromise = null;
      window.fetch = () => {
        malformedFetches++;
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ schemaVersion: 1, draws: [] }) });
      };
      const malformedResult = await ensureDefaultPrizeData();
      const malformedUnavailable = lottoPrizeLoadState === 'unavailable' && lottoPrizeDocument === null;
      return {
        sharedPromise,
        successFetches,
        successResults,
        ready,
        failedFetches,
        failedResults,
        unavailable,
        malformedFetches,
        malformedResult,
        malformedUnavailable,
      };
    } finally {
      window.fetch = originalFetch;
      lottoPrizeDocument = null;
      lottoPrizeLoadState = 'idle';
      lottoPrizeLoadPromise = null;
    }
  });
  assert.strictEqual(loaderBehavior.sharedPromise, true);
  assert.strictEqual(loaderBehavior.successFetches, 1);
  assert.deepStrictEqual(loaderBehavior.successResults, [true, true, true]);
  assert.strictEqual(loaderBehavior.ready, true);
  assert.strictEqual(loaderBehavior.failedFetches, 1);
  assert.deepStrictEqual(loaderBehavior.failedResults, [false, false]);
  assert.strictEqual(loaderBehavior.unavailable, true);
  assert.strictEqual(loaderBehavior.malformedFetches, 1);
  assert.strictEqual(loaderBehavior.malformedResult, false);
  assert.strictEqual(loaderBehavior.malformedUnavailable, true);

  const calculationSafety = await session.page.evaluate(() => {
    const draw = { drawNumber: 4002, numbers: [1, 2, 3, 4, 5, 6], strong: 1 };
    lottoPrizeDocument = {
      draws: {
        4002: {
          drawNumber: 4002,
          sourceUrl: 'https://www.pais.co.il/Lotto/CurrentLotto.aspx?lotteryId=4002',
          regular: { 3: { winnerCount: 1, prizeIls: Number.MAX_SAFE_INTEGER } },
        },
      },
    };
    const score = { results: [
      { regularMatches: 3, strongMatch: 0 },
      { regularMatches: 3, strongMatch: 0 },
    ] };
    const overflow = calculatePinnedDrawWinnings(score, draw);
    lottoPrizeDocument.draws[4002].regular[3].prizeIls = '15';
    const malformedTier = calculatePinnedDrawWinnings(score, draw);
    lottoPrizeDocument.draws[4002].regular[3].prizeIls = -0;
    const negativeZeroTier = calculatePinnedDrawWinnings(score, draw);
    const malformedScore = calculatePinnedDrawWinnings({ results: {} }, draw);
    return { overflow, malformedTier, negativeZeroTier, malformedScore };
  });
  assert.strictEqual(calculationSafety.overflow.status, 'unavailable');
  assert.strictEqual(calculationSafety.overflow.totalPrizeIls, null);
  assert.strictEqual(calculationSafety.malformedTier.status, 'unavailable');
  assert.strictEqual(calculationSafety.negativeZeroTier.status, 'unavailable');
  assert.deepStrictEqual(calculationSafety.malformedScore, {
    status: 'unavailable',
    totalPrizeIls: null,
    winningCombinationCount: null,
    sourceUrl: null,
    lines: [],
  });

  await session.page.evaluate(pinnedState => {
    pinnedForms = pinnedState;
    lottoPrizeDocument = normalizeLottoPrizeDocument({
      schemaVersion: 1,
      updatedAt: '2026-07-19T00:00:00Z',
      draws: {
        4002: {
          drawNumber: 4002,
          drawDate: '20/07/2026',
          sourceUrl: 'https://www.pais.co.il/Lotto/CurrentLotto.aspx?lotteryId=4002',
          regular: {
            '3+strong': { winnerCount: 10, prizeIls: 59 },
            3: { winnerCount: 20, prizeIls: 15 },
            0: { winnerCount: 0, prizeIls: 0 },
            '6+strong': { winnerCount: 0, prizeIls: 0 },
          },
        },
      },
    });
    lottoPrizeLoadState = 'ready';
    currentData = [
      { drawNumber: 4002, date: '20/07/2026', numbers: [1, 2, 3, 4, 5, 6], strong: 1 },
      { drawNumber: null, date: '21/07/2026', numbers: [7, 8, 9, 10, 11, 12], strong: 2 },
      { drawNumber: 4001, date: '17/07/2026', numbers: [7, 8, 9, 10, 11, 12], strong: 2 },
    ];
    document.getElementById('results').style.display = 'block';
    renderPinnedFormStatus();
    renderPinnedFutureComparisons();
  }, pins);

  const calculated = await session.page.evaluate(pin => {
    const draw = { drawNumber: 4002, numbers: [1, 2, 3, 4, 5, 6], strong: 1 };
    const score = scorePinnedFormAgainstDraw(pin, draw);
    return calculatePinnedDrawWinnings(score, draw);
  }, pins.main.baseline);
  assert.strictEqual(calculated.status, 'available');
  assert.strictEqual(calculated.totalPrizeIls, 89);
  assert.strictEqual(calculated.winningCombinationCount, 3);
  assert.deepStrictEqual(
    calculated.lines.slice(0, 3).map(line => [line.tierKey, line.prizeIls, line.status]),
    [
      ['3+strong', 59, 'won'],
      ['3', 15, 'won'],
      ['3', 15, 'won'],
    ],
  );

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
    .includes('2 הגרלות עתידיות'));

  const baselineCard = mainGroup.locator('[data-pin-mode="baseline"]');
  const improvedCard = mainGroup.locator('[data-pin-mode="improved"]');
  const form2Group = session.page.locator('.pinned-future-group[data-pin-source="form2"]');
  const form2BaselineCard = form2Group.locator('[data-pin-mode="baseline"]');
  const form2ImprovedCard = form2Group.locator('[data-pin-mode="improved"]');
  const pinCards = [baselineCard, improvedCard, form2BaselineCard, form2ImprovedCard];
  for (const card of pinCards) {
    assert.strictEqual(
      await card.locator('[aria-live]').count(),
      1,
      'Each PIN card must expose one shared live region',
    );
    assert.strictEqual(
      await card.locator('[data-pin-open-draw-summary]').getAttribute('aria-live'),
      'polite',
    );
  }
  for (let targetIndex = 0; targetIndex < pinCards.length; targetIndex++) {
    await session.page.evaluate(() => renderPinnedFutureComparisons());
    const before = await Promise.all(pinCards.map(readPinnedOpenDrawCardState));
    await pinCards[targetIndex]
      .locator('details.future-draw[data-pin-draw-label="#4002"] summary')
      .click();
    const after = await Promise.all(pinCards.map(readPinnedOpenDrawCardState));
    assert.notDeepStrictEqual(
      after[targetIndex],
      before[targetIndex],
      `PIN card ${targetIndex + 1} must update its own open-draw summary`,
    );
    for (let neighborIndex = 0; neighborIndex < pinCards.length; neighborIndex++) {
      if (neighborIndex === targetIndex) continue;
      assert.deepStrictEqual(
        after[neighborIndex],
        before[neighborIndex],
        `PIN card ${targetIndex + 1} must not update card ${neighborIndex + 1}`,
      );
    }
  }
  await session.page.evaluate(() => renderPinnedFutureComparisons());
  const baselineDraws = baselineCard.locator('details.future-draw');
  const newestDateOnlyDraw = baselineCard.locator('details.future-draw[data-pin-draw-label="שורה 2"]');
  const olderNumberedDraw = baselineCard.locator('details.future-draw[data-pin-draw-label="#4002"]');

  assert.strictEqual(await baselineDraws.count(), 2);
  assert.ok(await newestDateOnlyDraw.evaluate(node => node.open));
  assert.ok(!(await olderNumberedDraw.evaluate(node => node.open)));
  assert.strictEqual(await baselineCard.locator('details.future-draw[open]').count(), 1);
  assert.strictEqual(
    await baselineCard.locator('details.future-draw[open]').getAttribute('data-pin-draw-label'),
    'שורה 2',
  );
  assert.strictEqual(await baselineCard.locator('[data-pin-open-draw-summary]').getAttribute('aria-live'), 'polite');
  assert.strictEqual(await baselineCard.locator('[data-pin-open-draw-stats]').getAttribute('aria-live'), null);
  assert.deepStrictEqual(await readPinnedWinnings(baselineCard), {
    value: '—',
    meta: 'נתוני זכייה לא זמינים',
  });

  const newestStats = await readPinnedOpenDrawStats(baselineCard);
  assert.ok(newestStats.drawDate.includes('2026'));
  assert.deepStrictEqual({ ...newestStats, drawDate: '<localized-date>' }, {
    draw: 'שורה 2',
    drawDate: '<localized-date>',
    regular: '0',
    rate: '0.0%',
    strong: '13',
    best: '0/6 + חזק',
  });

  const malformedMetricDisplay = await session.page.evaluate(() => {
    const card = document.querySelector('.pinned-future-group[data-pin-source="main"] [data-pin-mode="baseline"]');
    const detail = card.querySelector('details.future-draw[open]');
    detail.dataset.pinTotalRegular = '   ';
    updatePinnedOpenDrawStats(card, detail);
    return Array.from(card.querySelectorAll('[data-pin-stat]')).map(node => node.textContent.trim());
  });
  assert.deepStrictEqual(malformedMetricDisplay, [
    '—',
    'פתח הגרלה להצגת נתונים',
    '—',
    '—',
    '—',
    '—',
  ]);

  const recomputedMetricDisplay = await session.page.evaluate(() => {
    const card = document.querySelector('.pinned-future-group[data-pin-source="main"] [data-pin-mode="baseline"]');
    const detail = card.querySelector('details.future-draw[open]');
    detail.dataset.pinTotalRegular = '0';
    detail.removeAttribute('data-pin-hit-rate');
    updatePinnedOpenDrawStats(card, detail);
    return Array.from(card.querySelectorAll('[data-pin-stat]')).map(node => node.textContent.trim());
  });
  assert.deepStrictEqual(recomputedMetricDisplay, [
    'שורה 2',
    newestStats.drawDate,
    '0',
    '0.0%',
    '13',
    '0/6 + חזק',
  ]);
  assert.strictEqual(
    await newestDateOnlyDraw.getAttribute('data-pin-combination-count'),
    '14',
  );

  const improvedBefore = await readPinnedOpenDrawCardState(improvedCard);
  const form2BaselineBefore = await readPinnedOpenDrawCardState(form2BaselineCard);
  const form2ImprovedBefore = await readPinnedOpenDrawCardState(form2ImprovedCard);
  await olderNumberedDraw.locator('summary').click();
  assert.ok(await olderNumberedDraw.evaluate(node => node.open));
  assert.ok(!(await newestDateOnlyDraw.evaluate(node => node.open)));
  assert.strictEqual(await baselineCard.locator('details.future-draw[open]').count(), 1);
  const olderStats = await readPinnedOpenDrawStats(baselineCard);
  assert.ok(olderStats.drawDate.includes('2026'));
  assert.notStrictEqual(olderStats.drawDate, newestStats.drawDate);
  assert.deepStrictEqual({ ...olderStats, drawDate: '<localized-date>' }, {
    draw: '#4002',
    drawDate: '<localized-date>',
    regular: '11',
    rate: '13.1%',
    strong: '1',
    best: '3/6 + חזק',
  });
  assert.deepStrictEqual(await readPinnedWinnings(baselineCard), {
    value: '₪89',
    meta: '3 קומבינציות זוכות',
  });
  assert.deepStrictEqual(
    await olderNumberedDraw.locator('[data-pin-line-prize]').evaluateAll(nodes =>
      nodes.slice(0, 4).map(node => node.textContent.trim())
    ),
    ['₪59', '₪15', '₪15', 'ללא זכייה'],
  );
  assert.strictEqual(
    (await olderNumberedDraw.locator('[data-pin-line-prize]').nth(4).textContent()).trim(),
    '₪0 · לא חולק',
  );
  const sourceLink = olderNumberedDraw.locator('[data-pin-prize-source]');
  assert.strictEqual(
    await sourceLink.getAttribute('href'),
    'https://www.pais.co.il/Lotto/CurrentLotto.aspx?lotteryId=4002',
  );
  assert.strictEqual(await sourceLink.getAttribute('target'), '_blank');
  const sourceRel = (await sourceLink.getAttribute('rel')).split(/\s+/);
  assert.ok(sourceRel.includes('noopener'));
  assert.ok(sourceRel.includes('noreferrer'));
  const sourceText = (await olderNumberedDraw.locator('.pinned-prize-source').textContent()).trim();
  assert.ok(sourceText.includes('לוטו רגיל'));
  assert.ok(sourceText.includes('לפני מס'));
  assert.ok(sourceText.includes('מידע להמחשה בלבד והיפותטי'));
  assert.ok(sourceText.includes('אינו אישור שהטופס נשלח בפועל'));
  assert.ok(sourceText.includes('או שפרס כלשהו שולם'));
  assert.deepStrictEqual(await readPinnedOpenDrawCardState(improvedCard), improvedBefore);
  assert.deepStrictEqual(await readPinnedOpenDrawCardState(form2BaselineCard), form2BaselineBefore);
  assert.deepStrictEqual(await readPinnedOpenDrawCardState(form2ImprovedCard), form2ImprovedBefore);

  await olderNumberedDraw.locator('summary').click();
  assert.strictEqual(await baselineCard.locator('details.future-draw[open]').count(), 0);
  await session.page.waitForFunction(() => {
    const card = document.querySelector('.pinned-future-group[data-pin-source="main"] [data-pin-mode="baseline"]');
    return card.querySelector('[data-pin-stat="draw"]').textContent.trim() === '—';
  });
  assert.deepStrictEqual(await readPinnedOpenDrawStats(baselineCard), {
    draw: '—',
    drawDate: 'פתח הגרלה להצגת נתונים',
    regular: '—',
    rate: '—',
    strong: '—',
    best: '—',
  });
  assert.deepStrictEqual(await readPinnedWinnings(baselineCard), {
    value: '—',
    meta: 'פתח הגרלה להצגת נתונים',
  });

  await session.page.evaluate(() => renderPinnedFutureComparisons());
  const resetBaselineCard = mainGroup.locator('[data-pin-mode="baseline"]');
  assert.strictEqual(await resetBaselineCard.locator('details.future-draw[open]').count(), 1);
  assert.strictEqual(
    (await resetBaselineCard.locator('[data-pin-stat="draw"]').textContent()).trim(),
    'שורה 2',
  );

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

  const screenshotDraw = resetBaselineCard.locator('details.future-draw[data-pin-draw-label="#4002"]');
  await screenshotDraw.locator('summary').click();
  await session.page.waitForFunction(() => {
    const card = document.querySelector('.pinned-future-group[data-pin-source="main"] [data-pin-mode="baseline"]');
    return card && card.querySelector('[data-pin-winnings="value"]').textContent.trim() === '₪89';
  });
  assert.deepStrictEqual(await readPinnedWinnings(resetBaselineCard), {
    value: '₪89',
    meta: '3 קומבינציות זוכות',
  });
  const firstPrizeBox = await screenshotDraw.locator('[data-pin-line-prize]').first().boundingBox();
  assert.ok(
    firstPrizeBox
      && firstPrizeBox.x >= 0
      && firstPrizeBox.x + firstPrizeBox.width <= viewport.width,
    'The per-line prize column must remain visible in the active viewport',
  );
  const expandedWidth = await session.page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  assert.ok(
    expandedWidth.scroll <= expandedWidth.client + 1,
    'Expanded prize details must not overflow the page horizontally',
  );

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
    const browserSchemaResults = await cleanSession.page.evaluate(
      contractCases => contractCases.map(testCase => ({
        name: testCase.name,
        expected: testCase.accepted,
        accepted: normalizeLottoPrizeDocument(testCase.document) !== null,
      })),
      buildPrizeSchemaContractDocuments(),
    );
    assert.deepStrictEqual(
      browserSchemaResults.map(result => ({ name: result.name, accepted: result.accepted })),
      browserSchemaResults.map(result => ({ name: result.name, accepted: result.expected })),
      'Browser schema acceptance must match the shared Python --verify-only contract',
    );
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
