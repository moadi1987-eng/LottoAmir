const assert = require("assert");
const LottoCombos = require("../js/lotto-combos.js");

const baseNumbers = [1, 2, 3, 4, 5, 6];
const synthetic = Array.from({ length: 14 }, (_, index) => ({
  comboNum: index + 1,
  strategy: "synthetic-" + (index + 1),
  numbers: baseNumbers.slice(),
  strong: (index % 7) + 1,
}));

const priority = [];
for (let n = 1; n <= 37; n++) priority.push(n);

const diversified = LottoCombos.diversifyForm2Combinations(synthetic, priority, {
  minimumCoverage: 30,
  maximumExposure: 7,
  maximumOverlap: 4,
});

const metrics = LottoCombos.getForm2DiversityMetrics(diversified);
assert.strictEqual(metrics.combinationCount, 14);
assert.strictEqual(metrics.uniqueCombinationCount, 14);
assert.ok(metrics.coveredNumberCount >= 30, "coverage " + metrics.coveredNumberCount);
assert.ok(metrics.maximumOverlap <= 4, "overlap " + metrics.maximumOverlap);
assert.ok(metrics.maximumExposure <= 7, "exposure " + metrics.maximumExposure);

console.log("OK tests/verify-form2-diversity.js (module API)");
