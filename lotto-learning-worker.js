'use strict';

importScripts('lotto-strategy-core.js', 'lotto-learning-core.js');

self.onmessage = async function handleLearningMessage(event) {
  const request = event.data || {};
  if (request.type !== 'run') return;
  const identity = {
    runId: request.runId,
    generation: request.generation,
    expectedRevision: request.expectedRevision,
    protocolVersion: request.protocolVersion,
    coreVersion: request.coreVersion,
  };
  const core = self.LottoLearningCore;
  function fail(code) { const error = new Error(code); error.code = code; throw error; }
  try {
    if (request.operation !== 'prepare' && request.operation !== 'replay') fail('INVALID_OPERATION');
    if (request.protocolVersion !== core.PROTOCOL_VERSION || request.coreVersion !== core.CORE_VERSION) {
      fail('INVALID_VERSION');
    }
    const onProgress = progress => self.postMessage({ type: 'progress', ...identity, ...progress });
    let result;
    if (request.operation === 'prepare') {
      result = await core.prepareAtCutoff(request.rows, {
        ...request.options, protocolVersion: request.protocolVersion, coreVersion: request.coreVersion,
      }, onProgress);
    } else {
      result = await core.runHistoricalReplay(request.rows, onProgress);
      result.digest = await core.hashHistory(request.rows);
    }
    self.postMessage({ type: 'complete', ...identity, result });
  } catch (error) {
    self.postMessage({ type: 'error', ...identity,
      code: error && error.code ? error.code : 'GENERATION_FAILED',
      message: error && error.message ? error.message : 'Learning calculation failed' });
  }
};
