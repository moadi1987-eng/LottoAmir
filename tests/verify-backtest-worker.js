'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const core = require('../lotto-strategy-core.js');
const { buildSyntheticDraws } = require('./fixtures/backtest-fixture');

const source = fs.readFileSync('lotto-backtest-worker.js', 'utf8');
function createWorkerHarness(strategyCore) {
  const messages = [];
  const self = {
    LottoStrategyCore: strategyCore,
    postMessage(message) { messages.push(message); },
  };
  const context = vm.createContext({ self, importScripts() {} });
  vm.runInContext(source, context, { filename: 'lotto-backtest-worker.js' });
  return { messages, self };
}

const { messages, self } = createWorkerHarness(core);

self.onmessage({ data: {
  type: 'run',
  runId: 'run-1',
  rows: buildSyntheticDraws(502),
  windows: [100, 200, 500],
} });

const portfolioProgress = messages.find(message => (
  message.type === 'progress'
  && message.runId === 'run-1'
  && message.phase === 'portfolio-holdout'
));
assert.ok(portfolioProgress, 'Worker must forward portfolio-holdout progress');
assert.ok(Number.isInteger(portfolioProgress.completed));
assert.ok(Number.isInteger(portfolioProgress.total));

const complete = messages.find(message => message.type === 'complete' && message.runId === 'run-1');
assert.ok(complete, 'Worker must post the complete result');
assert.strictEqual(complete.result.portfolio.current.forms.coverage1.length, 14);

messages.length = 0;
self.onmessage({ data: { type: 'run', runId: 'run-2', rows: [], windows: [100, 200, 500] } });
assert.deepStrictEqual(JSON.parse(JSON.stringify(messages)), [{
  type: 'error',
  runId: 'run-2',
  code: 'INSUFFICIENT_HISTORY',
  message: 'Backtest requires at least 501 valid draws',
}]);

const forwardedProgress = {
  phase: 'portfolio-holdout',
  completed: 2,
  total: 9,
  failureCode: 'FOUR_PIN_DEPTH_FAILED',
};
const expectedError = Object.assign(new Error('Synthetic worker failure'), {
  code: 'SYNTHETIC_FAILURE',
});
const throwingCore = {
  BACKTEST_WINDOWS: core.BACKTEST_WINDOWS,
  runWalkForwardBacktest(_rows, options) {
    options.onProgress(forwardedProgress);
    throw expectedError;
  },
};
const throwingHarness = createWorkerHarness(throwingCore);
throwingHarness.self.onmessage({ data: {
  type: 'run',
  runId: 'run-error',
  rows: [{ numbers: [1, 2, 3, 4, 5, 6], strong: 7 }],
} });
assert.deepStrictEqual(JSON.parse(JSON.stringify(throwingHarness.messages)), [
  { type: 'progress', runId: 'run-error', ...forwardedProgress },
  {
    type: 'error',
    runId: 'run-error',
    code: 'SYNTHETIC_FAILURE',
    message: 'Synthetic worker failure',
  },
]);
assert.ok(!throwingHarness.messages.some(message => message.type === 'complete'));

const messageCount = throwingHarness.messages.length;
throwingHarness.self.onmessage({ data: { type: 'cancel', runId: 'run-error' } });
assert.strictEqual(throwingHarness.messages.length, messageCount);

console.log('Backtest worker verification passed');
