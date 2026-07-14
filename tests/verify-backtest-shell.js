'use strict';

const assert = require('assert');
const fs = require('fs');

const html = fs.readFileSync('Lotto_All_In_One.html', 'utf8');
const required = [
  'id="navBacktestBtn"',
  'onclick="openBacktestView()"',
  'data-target="backtestWorkspace"',
  'function openBacktestView()',
  "setAnalyzerWorkspace('backtest')",
  "setAnalyzerWorkspace('analysis')",
  "backtest: document.getElementById('navBacktestBtn')",
  "let requestedAnalyzerWorkspace = 'analysis'",
  'function handleAnalyzerLoad()',
  "showChildAnalyzerWorkspace(requestedAnalyzerWorkspace)",
];
for (const token of required) assert.ok(html.includes(token), `Missing shell Backtest contract: ${token}`);

assert.ok(!html.includes('id="navCompareBtn"'), 'Top navigation comparison button must stay removed');
assert.ok(!html.includes('function openComparisonView()'), 'Removed top comparison action must not remain as dead code');
assert.ok(html.includes('data-target="comparisonCard"'), 'Analyzer rail comparison shortcut must remain available');

const scripts = [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/gi)]
  .map(match => match[1]);
for (const script of scripts) new Function(script);

console.log('Backtest shell navigation verification passed');
