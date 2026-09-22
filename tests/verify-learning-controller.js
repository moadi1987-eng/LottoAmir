'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const core = require('../lotto-learning-core.js');
const fixture = require('./fixtures/learning-fixture.js');
const controllerPath = path.resolve(__dirname, '../lotto-learning-controller.js');
assert.ok(fs.existsSync(controllerPath), 'Learning controller must fence source requests before live creation');
const Controller = require(controllerPath);
const empty = () => ({ compatibility: 'compatible', incompatibilityCodes: [], rawBackup: null,
  revision: 0, experiment: null, decisions: [], snapshots: [], observations: [], prizes: [], faults: [] });
function boundary() {
  let state = empty();
  return { read: async () => structuredClone(state), close() {},
    commit: async () => { throw new Error('Source ingestion must not create an experiment'); } };
}
function hashingWorker() {
  return { terminate() {}, postMessage(request) {
    Promise.resolve().then(async () => {
      const digest = await core.hashHistory(request.rows);
      this.onmessage({ data: { ...request, type: 'complete', result: { digest, prefixes: {} } } });
    });
  } };
}
async function main() {
  const c = Controller.create({ store: boundary(), workerFactory: hashingWorker });
  try {
    const first = c.beginSource('canonical');
    const second = c.beginSource('manual');
    await c.acceptSource(fixture.toLearningMatrix(fixture.buildLearningDraws(700)), {
      kind: 'canonical', url: 'NUMBERS.xlsx', fetchedAt: '2026-09-21T10:00:00Z', generation: first });
    assert.equal(c.readView().sourceState.generation, second);
    assert.equal(c.readView().sourceState.status, 'loading');
    await c.start();
    assert.equal(c.readView().error.code, 'CANONICAL_SOURCE_REQUIRED');
    console.log('PASS newer source selection fences a late canonical success');

    const generation = c.beginSource('canonical');
    const rows = fixture.toLearningMatrix(fixture.buildLearningDraws(700));
    rows[0][0] = '3000garbage';
    await c.acceptSource(rows, { kind: 'canonical', generation, url: 'NUMBERS.xlsx', fetchedAt: '2026-09-21T10:00:00Z' });
    assert.equal(c.readView().sourceState.status, 'error');
    assert.ok(c.readView().error);
    await c.start();
    assert.equal(c.readView().error.code, 'CANONICAL_SOURCE_REQUIRED');
    console.log('PASS suffix garbage cannot acquire canonical eligibility');

    const manual = c.beginSource('manual');
    await c.acceptSource(fixture.toLearningMatrix(fixture.buildLearningDraws(700)), {
      kind: 'manual', generation: manual, url: 'NUMBERS.xlsx', fetchedAt: '2026-09-21T10:00:00Z' });
    assert.equal(c.readView().sourceState.status, 'ready');
    await c.start();
    assert.equal(c.readView().error.code, 'CANONICAL_SOURCE_REQUIRED');
    const failed = c.beginSource('canonical');
    c.rejectSource(failed, new Error('network offline'));
    await c.start();
    assert.equal(c.readView().sourceState.status, 'error');
    assert.equal(c.readView().error.code, 'CANONICAL_SOURCE_REQUIRED');
    console.log('PASS filenames and failed fetches never restore live eligibility');
    const captured = c.beginSource('manual');
    const input = fixture.toLearningMatrix(fixture.buildLearningDraws(700));
    const accepting = c.acceptSource(input, { kind: 'manual', generation: captured, url: null, fetchedAt: '2026-09-21T10:00:00Z' });
    input[0][8] = 'mutated';
    await accepting;
    assert.equal(c.readView().sourceState.status, 'ready', 'raw cells must be captured before an asynchronous startup boundary');
    console.log('PASS source captures immutable raw cells at acceptance time');
  } finally { c.close(); }
  const readonly = Controller.create({ store: { ...boundary(), read: async () => ({ ...empty(),
    compatibility: 'readonly', incompatibilityCodes: ['UNKNOWN_SCHEMA'], rawBackup: { opaqueCounter: 1n } }) }, workerFactory: hashingWorker });
  try {
    await readonly.start();
    const view = readonly.readView();
    assert.equal(view.stored.compatibility, 'readonly');
    assert.equal(view.stored.rawBackup.opaqueCounter, 1n, 'Unknown store data remains inspectable without JSON coercion');
    console.log('PASS incompatible raw store state remains detached and readable');
  } finally { readonly.close(); }
  console.log('Learning controller unit verification passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
