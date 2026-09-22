'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { createHash } = require('crypto');
const core = require('../lotto-learning-core.js');
const { buildLearningDraws } = require('./fixtures/learning-fixture');

async function main() {
  const messages = [];
  const context = vm.createContext({ crypto: globalThis.crypto, TextEncoder,
    postMessage: message => messages.push(structuredClone(message)) });
  context.self = context;
  context.importScripts = (...files) => files.forEach(file => vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context));
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'lotto-learning-worker.js'), 'utf8'), context);
  const request = { type: 'run', operation: 'prepare', runId: 'r1', generation: 4,
    protocolVersion: core.PROTOCOL_VERSION, coreVersion: core.CORE_VERSION, expectedRevision: 2,
    rows: buildLearningDraws(700), options: { originAnchor: 3699, decisions: [], cutoff: 3699,
      seedHex: '00112233445566778899aabbccddeeff', mode: 'live' } };
  async function run(overrides = {}) {
    messages.length = 0;
    const input = { ...request, ...overrides };
    await context.onmessage({ data: input });
    for (const message of messages) {
      for (const key of ['runId', 'generation', 'expectedRevision', 'protocolVersion', 'coreVersion']) {
        assert.strictEqual(message[key], input[key], `echo ${key}`);
      }
    }
    return messages.at(-1);
  }
  const historical = buildLearningDraws(700);
  historical[0].strong = 8;
  const expectedHash = rows => createHash('sha256').update(JSON.stringify(rows.map(row =>
    [row.drawNumber, row.date, ...row.numbers, row.strong]))).digest('hex');
  let complete = await run({ operation: 'hash', rows: historical, options: { cutoffs: [3000, 3699] } });
  assert.equal(complete.type, 'complete');
  assert.equal(complete.result.digest, expectedHash(historical));
  assert.equal(complete.result.prefixes[3000], expectedHash(historical.slice(0, 1)));
  assert.equal(complete.result.prefixes[3699], expectedHash(historical));
  assert.equal(messages.length, 1, 'Hash-only work must not generate policy progress or arms');
  for (const cutoffs of [[2999], [3700], ['3000'], [null], undefined]) {
    assert.equal((await run({ operation: 'hash', options: { cutoffs } })).code, 'INVALID_CUTOFF');
  }
  assert.equal((await run({ operation: 'hash', coreVersion: 'old', options: { cutoffs: [] } })).code, 'INVALID_VERSION');
  console.log('PASS worker hashes full historical prefix and rejects invalid cutoffs under version fences');
  if (process.argv.includes('--hash-only')) return;
  complete = await run();
  assert.equal(complete.type, 'complete');
  assert.ok(messages.some(message => message.type === 'progress'));
  assert.deepStrictEqual(complete.result, await core.prepareAtCutoff(request.rows, request.options));
  assert.match(complete.result.digest, /^[0-9a-f]{64}$/);
  for (const [overrides, code] of [
    [{ operation: 'unknown' }, 'INVALID_OPERATION'],
    [{ protocolVersion: 'old' }, 'INVALID_VERSION'],
    [{ coreVersion: 'old' }, 'INVALID_VERSION'],
    [{ coreVersion: undefined }, 'INVALID_VERSION'],
    [{ rows: request.rows.slice(1) }, 'INSUFFICIENT_HISTORY'],
    [{ options: { ...request.options, decisions: [{ cutoff: 3698 }] } }, 'INVALID_DECISIONS'],
  ]) {
    const error = await run(overrides);
    assert.equal(error.type, 'error');
    assert.equal(error.code, code);
    assert.ok(!messages.some(message => message.type === 'complete'));
  }
  console.time('Learning worker replay');
  complete = await run({ operation: 'replay', rows: buildLearningDraws(901) });
  console.timeEnd('Learning worker replay');
  assert.equal(complete.type, 'complete');
  assert.equal(complete.result.targets.length, 200);
  assert.equal(complete.result.targets[0].target, 3701);
  assert.equal(complete.result.targets.at(-1).target, 3900);
  assert.equal(complete.result.seed, 'learning-history-v1');
  assert.match(complete.result.digest, /^[0-9a-f]{64}$/);
  assert.equal(complete.result.digest, await core.hashHistory(buildLearningDraws(901)));
  const original = context.LottoStrategyCore.generateBaselineForms;
  try {
    context.LottoStrategyCore.generateBaselineForms = () => ({ form2: [], main: [] });
    assert.equal((await run()).code, 'GENERATION_FAILED');
  } finally {
    context.LottoStrategyCore.generateBaselineForms = original;
  }
  messages.length = 0;
  await context.onmessage({ data: { type: 'cancel' } });
  assert.equal(messages.length, 0);
  console.log('Learning worker verification passed');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
