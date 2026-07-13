'use strict';

importScripts('lotto-strategy-core.js');

self.onmessage = function handleBacktestMessage(event) {
  const request = event.data || {};
  if (request.type !== 'run') return;
  const runId = String(request.runId || '');
  try {
    const result = self.LottoStrategyCore.runWalkForwardBacktest(request.rows || [], {
      windows: request.windows || self.LottoStrategyCore.BACKTEST_WINDOWS,
      onProgress(progress) {
        self.postMessage({ type: 'progress', runId, ...progress });
      },
    });
    self.postMessage({ type: 'complete', runId, result });
  } catch (error) {
    self.postMessage({
      type: 'error',
      runId,
      code: error && error.code ? error.code : 'BACKTEST_FAILED',
      message: error && error.message ? error.message : 'Backtest failed',
    });
  }
};
