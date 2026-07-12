const fs = require("fs");
const html = fs.readFileSync("lotto_analyzer.html", "utf8");
const lines = html.split(/\r?\n/);
const chunk = lines.slice(1975, 3091).join("\n");
let code = chunk.replace(/^        /gm, "");

code = code
  .replace(/async function analyzePairs/g, "function analyzePairs")
  .replace(/async function analyzeTriplets/g, "function analyzeTriplets")
  .replace(/async function analyzeQuartets/g, "function analyzeQuartets")
  .replace(/async function generateCombinations/g, "function generateCombinations")
  .replace(/[ \t]*if \(rowIdx > 0 && rowIdx % \d+ === 0\)[ \t]*await yieldToUI\(\);[ \t]*\r?\n/g, "")
  .replace(/[ \t]*if \(rowIdx > 0 && rowIdx % \d+ === 0\)[ \t]*\r?\n/g, "")
  .replace(/[ \t]*\/\/ yield[^\n]*\r?\n/g, "")
  .replace(/[ \t]*await yieldToUI\(\);[ \t]*\/\/[^\n]*\r?\n/g, "")
  .replace(/[ \t]*await yieldToUI\(\);[ \t]*\r?\n/g, "");

code = code.replace(/'🧠 חיזוי AI'/g, "'🧮 ציון משוקלל'");
code = code.replace(/🧠 חיזוי AI/g, "🧮 ציון משוקלל");

// Keep DOM renderer in HTML only
code = code.replace(
  /function renderForm2DiversitySummary\(combos\) \{[\s\S]*?\n\}/,
  ""
);

const header = `/**
 * LottoAmir combination / frequency helpers.
 * Browser: window.LottoCombos
 * Node: module.exports
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.LottoCombos = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

`;

const footer = `

  function buildFrequencyAnalysis(data) {
    const numberFreq = {};
    const strongFreq = {};
    for (let rowIdx = 0; rowIdx < data.length; rowIdx++) {
      const row = data[rowIdx];
      const nums = row.numbers || [];
      for (let i = 0; i < nums.length; i++) {
        const num = nums[i];
        if (!isNaN(num) && num >= 1 && num <= 37) {
          numberFreq[num] = (numberFreq[num] || 0) + 1;
        }
      }
      const strong = row.strong;
      if (!isNaN(strong) && strong >= 1 && strong <= 7) {
        strongFreq[strong] = (strongFreq[strong] || 0) + 1;
      }
    }
    const sortedNumbers = Object.entries(numberFreq)
      .map(([num, count]) => ({
        number: parseInt(num, 10),
        count,
        percentage: ((count / Math.max(1, data.length)) * 100).toFixed(1),
      }))
      .sort((a, b) => b.count - a.count);
    const sortedStrong = Object.entries(strongFreq)
      .map(([num, count]) => ({
        number: parseInt(num, 10),
        count,
        percentage: ((count / Math.max(1, data.length)) * 100).toFixed(1),
      }))
      .sort((a, b) => b.count - a.count);
    const third = Math.ceil(sortedNumbers.length / 3) || 1;
    const hot = sortedNumbers.slice(0, third);
    const medium = sortedNumbers.slice(third, third * 2);
    const cold = sortedNumbers.slice(third * 2);
    const strongThird = Math.ceil(sortedStrong.length / 3) || 1;
    const strongHot = sortedStrong.slice(0, strongThird);
    const strongMedium = sortedStrong.slice(strongThird, strongThird * 2);
    const strongCold = sortedStrong.slice(strongThird * 2);
    const pairs = analyzePairs(data);
    const triplets = analyzeTriplets(data);
    const quartets = analyzeQuartets(data);
    return {
      totalDraws: data.length,
      numbers: sortedNumbers,
      strong: sortedStrong,
      hot,
      medium,
      cold,
      strongHot,
      strongMedium,
      strongCold,
      pairs,
      triplets,
      quartets,
    };
  }

  function generateFormCombinations(form, analysis, rawData) {
    const args = [
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
      rawData,
    ];
    if (form === "form2") return generateCombinationsForm2.apply(null, args);
    return generateCombinations.apply(null, args);
  }

  function countHits(combo, draw) {
    const drawNumbers = draw && draw.numbers ? draw.numbers.map(Number) : [];
    const drawStrong = draw ? Number(draw.strong) : NaN;
    const nums = combo && combo.numbers ? combo.numbers.map(Number) : [];
    const regularMatches = nums.filter(function (n) {
      return drawNumbers.includes(n);
    }).length;
    const strongMatch = combo && Number(combo.strong) === drawStrong ? 1 : 0;
    return { regularMatches: regularMatches, strongMatch: strongMatch };
  }

  function rankStrategies(aggregates) {
    return (aggregates || []).slice().sort(function (a, b) {
      if (b.avgRegular !== a.avgRegular) return b.avgRegular - a.avgRegular;
      if (b.count4Plus !== a.count4Plus) return b.count4Plus - a.count4Plus;
      if (b.count3Plus !== a.count3Plus) return b.count3Plus - a.count3Plus;
      return b.strongRate - a.strongRate;
    });
  }

  function runWalkForwardBacktest(draws, options) {
    const opts = Object.assign(
      {
        form: "main",
        evalCount: 50,
        minHistory: 30,
      },
      options || {}
    );
    const list = draws || [];
    const maxEval = Math.min(opts.evalCount, Math.max(0, list.length - opts.minHistory));
    const perStrategy = {};

    for (let i = 0; i < maxEval; i++) {
      const target = list[i];
      const history = list.slice(i + 1);
      if (history.length < opts.minHistory) continue;
      const analysis = buildFrequencyAnalysis(history);
      const combos = generateFormCombinations(opts.form, analysis, history);
      (combos || []).forEach(function (combo) {
        const key = String(combo.comboNum != null ? combo.comboNum : combo.strategy);
        if (!perStrategy[key]) {
          perStrategy[key] = {
            comboNum: combo.comboNum,
            strategy: combo.strategy,
            sampleSize: 0,
            totalRegular: 0,
            count3Plus: 0,
            count4Plus: 0,
            strongHits: 0,
          };
        }
        const hits = countHits(combo, target);
        const bucket = perStrategy[key];
        bucket.sampleSize += 1;
        bucket.totalRegular += hits.regularMatches;
        if (hits.regularMatches >= 3) bucket.count3Plus += 1;
        if (hits.regularMatches >= 4) bucket.count4Plus += 1;
        bucket.strongHits += hits.strongMatch;
      });
    }

    const aggregates = Object.values(perStrategy).map(function (bucket) {
      const n = Math.max(1, bucket.sampleSize);
      return {
        comboNum: bucket.comboNum,
        strategy: bucket.strategy,
        sampleSize: bucket.sampleSize,
        avgRegular: Number((bucket.totalRegular / n).toFixed(3)),
        count3Plus: bucket.count3Plus,
        count4Plus: bucket.count4Plus,
        strongHits: bucket.strongHits,
        strongRate: Number(((bucket.strongHits / n) * 100).toFixed(1)),
      };
    });

    return {
      form: opts.form,
      evalCount: maxEval,
      minHistory: opts.minHistory,
      rankings: rankStrategies(aggregates),
    };
  }

  return {
    analyzePairs: analyzePairs,
    analyzeTriplets: analyzeTriplets,
    analyzeQuartets: analyzeQuartets,
    buildFrequencyAnalysis: buildFrequencyAnalysis,
    generateCombinations: generateCombinations,
    generateCombinationsForm2: generateCombinationsForm2,
    generateFormCombinations: generateFormCombinations,
    diversifyForm2Combinations: diversifyForm2Combinations,
    buildForm2StrongRotation: buildForm2StrongRotation,
    getForm2DiversityMetrics: getForm2DiversityMetrics,
    normalizeForm2Numbers: normalizeForm2Numbers,
    getForm2CombinationKey: getForm2CombinationKey,
    getForm2Overlap: getForm2Overlap,
    createCombo: createCombo,
    pickTop: pickTop,
    pickRandom: pickRandom,
    pickOffset: pickOffset,
    countHits: countHits,
    rankStrategies: rankStrategies,
    runWalkForwardBacktest: runWalkForwardBacktest,
    FORM2_STRATEGY_LABELS: FORM2_STRATEGY_LABELS,
  };
});
`;

fs.mkdirSync("js", { recursive: true });
fs.writeFileSync("js/lotto-combos.js", header + code + footer);
console.log("Wrote", fs.statSync("js/lotto-combos.js").size, "bytes");
