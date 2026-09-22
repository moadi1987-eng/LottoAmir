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
    if (!['prepare', 'replay', 'hash'].includes(request.operation)) fail('INVALID_OPERATION');
    if (request.protocolVersion !== core.PROTOCOL_VERSION || request.coreVersion !== core.CORE_VERSION) {
      fail('INVALID_VERSION');
    }
    const onProgress = progress => self.postMessage({ type: 'progress', ...identity, ...progress });
    let result;
    if (request.operation === 'hash') {
      const canonical = JSON.parse(core.canonicalHistory(request.rows));
      const cutoffs = request.options && request.options.cutoffs;
      if (!Array.isArray(cutoffs) || cutoffs.some(cutoff => !Number.isSafeInteger(cutoff)
        || !canonical.some(row => row[0] === cutoff))) fail('INVALID_CUTOFF');
      const prefixes = {};
      for (const cutoff of new Set(cutoffs)) {
        prefixes[cutoff] = await core.hashHistory(request.rows.filter(row => row.drawNumber <= cutoff));
      }
      result = { digest: await core.hashHistory(request.rows), prefixes };
    } else if (request.operation === 'prepare') {
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
