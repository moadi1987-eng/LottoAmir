const assert = require("assert");
const fs = require("fs");
const path = require("path");

const LottoCombos = require("../js/lotto-combos.js");
const fixturePath = path.join(__dirname, "fixtures", "sample-draws.json");
const draws = JSON.parse(fs.readFileSync(fixturePath, "utf8"));

function assertValidCombo(combo, label) {
  assert.ok(combo, label + " missing");
  assert.strictEqual(combo.numbers.length, 6, label + " must have 6 numbers");
  const unique = new Set(combo.numbers);
  assert.strictEqual(unique.size, 6, label + " numbers must be unique");
  combo.numbers.forEach((n) => {
    assert.ok(n >= 1 && n <= 37, label + " number out of range: " + n);
  });
  assert.ok(combo.strong >= 1 && combo.strong <= 7, label + " strong out of range");
  assert.ok(combo.strategy, label + " missing strategy");
}

const history = draws.slice(10);
const analysis = LottoCombos.buildFrequencyAnalysis(history);
assert.ok(analysis.hot.length > 0, "hot bucket");
assert.ok(analysis.pairs.length >= 0, "pairs");

const form1 = LottoCombos.generateCombinations(
  analysis.hot,
  analysis.medium,
  analysis.cold,
  analysis.strongHot,
  analysis.strongMedium,
  analysis.strongCold,
  analysis.pairs,
  analysis.numbers,
  analysis.triplets,
  analysis.quartets,
  history
);
assert.strictEqual(form1.length, 14, "form1 count");
form1.forEach((c, i) => assertValidCombo(c, "form1#" + (i + 1)));
assert.ok(
  form1.some((c) => String(c.strategy).includes("ציון משוקלל")),
  "weighted score label present"
);
assert.ok(
  !form1.some((c) => String(c.strategy).includes("חיזוי AI")),
  "old AI label removed"
);

const form2 = LottoCombos.generateCombinationsForm2(
  analysis.hot,
  analysis.medium,
  analysis.cold,
  analysis.strongHot,
  analysis.strongMedium,
  analysis.strongCold,
  analysis.pairs,
  analysis.numbers,
  analysis.triplets,
  analysis.quartets,
  history
);
assert.strictEqual(form2.length, 14, "form2 count");
form2.forEach((c, i) => assertValidCombo(c, "form2#" + (i + 1)));

const metrics = LottoCombos.getForm2DiversityMetrics(form2);
assert.strictEqual(metrics.combinationCount, 14);
assert.strictEqual(metrics.uniqueCombinationCount, 14);
assert.ok(metrics.coveredNumberCount >= 30, "coverage >= 30, got " + metrics.coveredNumberCount);
assert.ok(metrics.maximumOverlap <= 4, "max overlap <= 4, got " + metrics.maximumOverlap);
assert.ok(metrics.maximumExposure <= 7, "max exposure <= 7, got " + metrics.maximumExposure);
Object.values(metrics.strongCounts).forEach((count) => {
  assert.strictEqual(count, 2, "each strong appears twice");
});

const hits = LottoCombos.countHits(
  { numbers: [1, 2, 3, 4, 5, 6], strong: 1 },
  { numbers: [1, 2, 3, 10, 11, 12], strong: 1 }
);
assert.strictEqual(hits.regularMatches, 3);
assert.strictEqual(hits.strongMatch, 1);

const bt = LottoCombos.runWalkForwardBacktest(draws, {
  form: "main",
  evalCount: 20,
  minHistory: 30,
});
assert.ok(bt.rankings.length === 14, "14 ranked strategies");
assert.ok(bt.evalCount > 0, "evaluated draws");
// No leakage sanity: ranking averages are finite
bt.rankings.forEach((r) => {
  assert.ok(Number.isFinite(r.avgRegular));
  assert.ok(r.sampleSize > 0);
});

const ranked = LottoCombos.rankStrategies([
  { avgRegular: 1, count4Plus: 0, count3Plus: 1, strongRate: 10 },
  { avgRegular: 2, count4Plus: 0, count3Plus: 1, strongRate: 10 },
]);
assert.strictEqual(ranked[0].avgRegular, 2);

// Determinism
const form1b = LottoCombos.generateCombinations(
  analysis.hot,
  analysis.medium,
  analysis.cold,
  analysis.strongHot,
  analysis.strongMedium,
  analysis.strongCold,
  analysis.pairs,
  analysis.numbers,
  analysis.triplets,
  analysis.quartets,
  history
);
assert.deepStrictEqual(
  form1.map((c) => c.numbers.join("-") + "/" + c.strong),
  form1b.map((c) => c.numbers.join("-") + "/" + c.strong)
);

console.log("OK tests/test-lotto-combos.js");
