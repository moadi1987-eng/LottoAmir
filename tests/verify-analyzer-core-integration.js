'use strict';

const assert = require('assert');
const fs = require('fs');
const core = require('../lotto-strategy-core.js');

const html = fs.readFileSync('lotto_analyzer.html', 'utf8');
assert.ok(html.includes('<script src="lotto-strategy-core.js"></script>'));
assert.ok(html.includes('LottoStrategyCore.buildAnalysisSnapshot'));
assert.ok(html.includes('LottoStrategyCore.generateBaselineForms'));

const movedImplementationNames = [
  'generateSlidingWindowCombo',
  'generateSmartMixCombo',
  'generateDueNumbersCombo',
  'generateDoubleTripletCombo',
  'generateTrendAnalysisCombo',
  'generateUnpredictableCombo',
  'generateQuartetTripletOverlapCombo',
  'generateAICombo',
];
for (const name of movedImplementationNames) {
  assert.ok(!new RegExp(`function\\s+${name}\\s*\\(`).test(html), `${name} must live only in the shared core`);
  assert.strictEqual(typeof core[name], 'undefined', `${name} remains private inside the core`);
}

const inlineScripts = [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/gi)]
  .map(match => match[1]);
for (const script of inlineScripts) new Function(script);

console.log('Analyzer shared-core integration verification passed');
