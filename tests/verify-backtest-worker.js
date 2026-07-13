'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const core = require('../lotto-strategy-core.js');
const { buildSyntheticDraws } = require('./fixtures/backtest-fixture');

const source = fs.readFileSync('lotto-backtest-worker.js', 'utf8');
const messages = [];
const self = {
  LottoStrategyCore: core,
  postMessage(message) { messages.push(message); },
};
const context = vm.createContext({ self, importScripts() {} });
vm.runInContext(source, context, { filename: 'lotto-backtest-worker.js' });

self.onmessage({ data: {
  type: 'run',
  runId: 'run-1',
  rows: buildSyntheticDraws(502),
  windows: [100, 200, 500],
} });

assert.ok(messages.some(message => message.type === 'progress' && message.runId === 'run-1'));
assert.ok(messages.some(message => message.type === 'complete' && message.runId === 'run-1'));

messages.length = 0;
self.onmessage({ data: { type: 'run', runId: 'run-2', rows: [], windows: [100, 200, 500] } });
assert.ok(messages.some(message => message.type === 'error' && message.code === 'INSUFFICIENT_HISTORY'));

console.log('Backtest worker verification passed');
