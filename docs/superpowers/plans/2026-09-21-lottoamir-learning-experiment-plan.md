# Controlled Learning Lottery Experiment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one independent virtual 14-line form whose construction policy is reconsidered every 20 draws, with immutable pre-draw snapshots, historical replay, and honest comparison against legacy and random 14-line forms.

**Architecture:** Keep the deployed static HTML application and its existing strategy core. Add isolated deterministic computation, a dedicated worker, transactional IndexedDB storage, an audit/report module, and a small controller/view integration. Existing PIN storage, generation, sorting, winnings, and Backtest remain compatible; do not merge the separate four-PIN optimization branch.

**Tech Stack:** Plain JavaScript with the repository's CommonJS/browser-global module pattern, Web Workers, Web Crypto SHA-256, IndexedDB, existing SheetJS workbook reader, Node assertions and Playwright. No new runtime dependencies or server.

**Spec:** `docs/superpowers/specs/2026-09-21-lottoamir-learning-experiment-design.md` — approved in conversation, including per-draw forms versus 20-draw policy updates.

**Status:** Plan prepared for user review. No product implementation has started. Execution method and worktree consent must be resolved at handoff; no deploy is included in plan approval.

## סיכום למשתמש

- נבנה אזור ניסוי נפרד של 14 שורות; ה־PIN הקיימים לא יוחלפו.
- המספרים יחושבו מחדש עבור כל הגרלה הבאה כאשר נטענות תוצאות חדשות. בחירת שיטת הבנייה תיבחן בכל 20 הגרלות, על סמך 200 יעדים קודמים.
- הטפסים יישמרו לפני בדיקת התוצאה; לא נשלים טפסים להגרלות שהוחמצו.
- נציג בדיקה היסטורית ומעקב מקומי בנפרד, עם השוואה לשיטה קיימת ולטופס אקראי באותו גודל.
- נבדוק גם תקלות אחסון, שני חלונות דפדפן, נתונים חסרים, ביטול חישוב ותצוגה בנייד.
- שבע המשימות להלן מסתיימות בגרסה מקומית בדוקה. פרסום לאתר ייעשה רק במסגרת הוראה נפרדת.

## Global Constraints

The following spec requirements apply to every task:

- ארבעת ה־PIN הקיימים, המספרים שלהם והיסטוריית הזכיות שלהם אינם משתנים.
- הניסוי אינו קונה, שולח או מוסיף טפסים בתשלום. בגרסה הראשונה אין כפתור העברה לטופס המשחק או קיבוע ל־PIN.
- המעקב מקומי בדפדפן. אין שרת, חשבון, סנכרון בין מכשירים או עבודה כשהאתר סגור.
- תוצאה חדשה יכולה להשפיע על בחירת שיטה לטפסים הבאים בלבד. שורות שכבר נשמרו אינן משוכתבות.
- All arms have 14 rows; policies use windows 100, 200, 500; selection uses 200 earlier targets; reselection occurs every 20 target draws.
- Minimum contiguous modern history: 700 draws for a live start, 900 for the 200-target historical replay.
- Primary outcome: `win3Plus = 1` iff at least one row has at least three regular matches. Strong matches, money, 4+, total hits and number of winning rows do not influence selection.
- Date-only evidence eligibility uses `Asia/Jerusalem`; same-day snapshots are excluded, not assumed pre-draw.
- Evidence budget: `alpha = 0.05 / (2 * k * (k + 1))`; `lowerBound = mean(D) - sqrt(2 * ln(1 / alpha) / 200)`.
- Database name: `lottoLearningExperimentV1`. No PIN/Backtest localStorage writes from learning code.
- No claims of predictable lottery outcomes, guaranteed improvement, actual payments, or net profit.
- Preserve untracked `INFRA_CHANGELOG_HE.md` and `docs/superpowers/plans/2026-08-14-vdi-fedora44-or-gnome.md`.

## Review Focus

1. Malformed raw numeric cells and rolled-over dates must be rejected before legacy `parseInt`/date coercion; fixtures and tests belong to Task 1.
2. A slow canonical fetch followed by manual selection, or an obsolete worker completion, must not create a snapshot under inherited canonical provenance; race tests belong to Tasks 5–6.
3. Two tabs racing a save or pause must not overwrite a seed, an immutable snapshot, or a newer revision; real IndexedDB tests belong to Task 3.
4. Jerusalem midnight/DST, a late-created form, and skipped target IDs must not manufacture prospective evidence; tests belong to Task 4.
5. Hostile, oversized, corrupt or unknown-version backups must remain read-only and cannot import an evidence badge or replace an active experiment; tests belong to Tasks 4 and 6.

## Execution preparation

- [ ] Record branch/worktree state and preserve existing changes. Use `superpowers:using-git-worktrees` at execution time; obtain worktree consent if none has been supplied. Prefer the native app worktree tool, with `codex/` branch naming when a branch is needed. Do not reuse the old four-PIN worktree.
- [ ] Locate bundled runtimes with the workspace-dependencies tool; do not install packages just to run this repository. Configure PowerShell variables from the returned paths:

```powershell
$learningNode = 'C:\Users\amirmoa\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$learningPython = 'C:\Users\amirmoa\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
$env:NODE_PATH = 'C:\Users\amirmoa\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
$env:PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
```

- [ ] Run the existing baseline suites using the full verification command under Task 7. If the existing Windows launcher overlap test fails, investigate/report its actual failure; do not change timing or unrelated scheduler code in this feature. An earlier run failed its four-second startup expectation and passed separately, so distinguish that condition from a new regression.

## File and interface map

| File | Responsibility | Owner |
|---|---|---|
| `lotto-learning-core.js` | Strict data contracts, deterministic forms, selection, replay | Tasks 1–2 |
| `lotto-learning-worker.js` | Worker request/result/progress protocol | Task 2 |
| `lotto-learning-store.js` | IndexedDB transactions and revisions; no DOM | Task 3 |
| `lotto-learning-report.js` | Time eligibility, audit sequence, evidence, readonly backup validation | Task 4 |
| `lotto-learning-controller.js` | Source/worker/storage lifecycle and cancellation; no DOM | Task 5 |
| `lotto-learning-ui.js` | Hebrew view and user actions | Task 6 |
| `lotto-learning.css` | Scoped RTL/responsive styles | Task 6 |
| `lotto_analyzer.html` | Strict source adapter, prize adapter, one UI mount | Tasks 5–6 |
| `Lotto_All_In_One.html` | One learning navigation entry and pending focus | Task 6 |
| `tests/fixtures/learning-fixture.js` | Deterministic dated draws and matrix conversion | Task 1 |
| `tests/helpers/learning-browser.js` | Local HTTP server/real browser harness, test-owned cleanup | Task 3 |
| `tests/helpers/create-learning-workbook.py` | Test-only XLSX bytes from JSON, using bundled openpyxl | Task 7 |
| `tests/fixtures/learning-harness.html` | Real learning modules in a minimal browser page | Task 3 |
| `tests/verify-learning-*.js` | New unit, worker, storage, report, controller and UI tests | Respective tasks |
| `docs/learning-experiment.md` | Hebrew operating guide and limitations | Task 7 |

The report/controller split refines the spec's implementation boundaries; it does not add product behavior. Avoid expanding the large analyzer script with the whole subsystem.

### Shared types and versions

Use the following names consistently in implementation, messages and tests. `CanonicalDraw[]` is oldest-first everywhere outside calls to the legacy generator, which receives a reversed copy.

```typescript
type WindowSize = 100 | 200 | 500;
type Mode = 'live' | 'historical';
type ArmName = 'learner' | 'legacy' | 'random';
type CanonicalDraw = {
  drawNumber: number; date: string; // strict YYYY-MM-DD
  numbers: number[]; strong: number;
};
type Line = { comboNum: number; strategy: string; numbers: number[]; strong: number };
type Arms = Record<ArmName, Line[]>;
type Source = {
  kind: 'canonical' | 'manual'; url: string | null;
  fetchedAt: string; generation: number; digest: string;
};
type Decision = {
  cutoff: number; window: WindowSize;
  counts: { '100': number; '200': number; '500': number };
};
type Experiment = {
  id: string; protocolVersion: string; coreVersion: string; seedHex: string;
  originAnchor: number; lastProcessedDraw: number; status: 'active' | 'paused' | 'conflict';
  sourceDigest: string; sourceCutoff: number;
};
type Snapshot = {
  experimentId: string; target: number; anchor: number; createdAt: string;
  protocolVersion: string; coreVersion: string; seedHex: string;
  window: WindowSize; source: Source; arms: Arms;
};
type ArmScore = {
  rows: Array<{ comboNum: number; regularMatches: number; strongMatch: boolean }>;
  win3Plus: 0 | 1; win4Plus: 0 | 1; win5Plus: 0 | 1; win6: 0 | 1;
  strongMatches: number;
};
type Observation = {
  experimentId: string; target: number; draw: CanonicalDraw;
  kind: 'eligible' | 'same-day-or-late' | 'missing' | 'conflict';
  scores: Record<ArmName, ArmScore> | null;
};
type PrizeReport = {
  experimentId: string; target: number; drawDigest: string;
  checkedAt: string; arms: Record<ArmName, object>; // existing winnings return schema
};
type Fault = { target: number | null; code: string };
type StoredState = {
  compatibility: 'compatible' | 'readonly'; incompatibilityCodes: string[];
  rawBackup: unknown | null;
  revision: number; experiment: Experiment | null; decisions: Decision[];
  snapshots: Snapshot[]; observations: Observation[]; prizes: PrizeReport[];
  faults: Fault[];
};
type Transition = {
  experiment: Experiment; decisions: Decision[]; snapshots: Snapshot[];
  observations: Observation[]; prizes: PrizeReport[];
  faults: Fault[];
};
```

Initial constants: `PROTOCOL_VERSION = 'learning-experiment-v1'`, `SCHEMA_VERSION = 1`, `HISTORICAL_SEED = 'learning-history-v1'`; bind `coreVersion` to `LottoStrategyCore.ALGORITHM_VERSION + ':' + LottoStrategyCore.CONSTRAINT_VERSION`. Store names, serialization and protocol versions must be validated on reads as well as writes. Error objects carry stable `code` values used by the view.

### Task 1: Strict history, deterministic random forms and binary scoring

**Files:** Create `lotto-learning-core.js`, `tests/fixtures/learning-fixture.js`, `tests/verify-learning-core.js`. Read but do not modify `lotto-strategy-core.js`.

**Interfaces:** Export browser global `LottoLearningCore` and CommonJS API:

- `parseLearningDate(value): string`
- `validateHistory(rows): { rows: CanonicalDraw[], excludedHistoricalCount: number }`
- `canonicalHistory(rows): string`, `hashHistory(rows): Promise<string>`
- `generateRandomForm(seedText): Line[]`
- `generatePolicyForm(rows, cutoff, window): Line[]`
- `buildArms(rows, cutoff, window, seedHex, mode): Arms`
- `scoreArm(lines, draw): ArmScore`

- [ ] **Write deterministic fixtures and failing behavior tests.** `buildLearningDraws(count)` creates valid ascending draws starting at draw 3000, dated every three days from `2020-01-01`, with the explicit loop below; `toLearningMatrix(draws)` returns `[id, date, ...numbers, strong]` without coercion. Do not feed epoch-millisecond fixture dates into an Excel-serial parser.

Export these fixture functions through both CommonJS and browser global `LottoLearningFixture`, using the same wrapper pattern as the production core. The fixture HTML loads this script before its test-only constructors.

```js
function buildLearningDraws(count) {
  return Array.from({ length: count }, (_, i) => ({
    drawNumber: 3000 + i,
    date: new Date(Date.UTC(2020, 0, 1) + i * 3 * 86400000).toISOString().slice(0, 10),
    numbers: Array.from({ length: 6 }, (_, j) => ((i * 7 + j * 5) % 37) + 1)
      .sort((a, b) => a - b),
    strong: (i % 7) + 1,
  }));
}
function toLearningMatrix(draws) {
  return draws.map(d => [d.drawNumber, d.date, ...d.numbers, d.strong]);
}
```

```js
const assert = require('assert');
const core = require('../lotto-learning-core.js');
const { buildLearningDraws } = require('./fixtures/learning-fixture');
const history = buildLearningDraws(700);
assert.throws(() => core.parseLearningDate('31/02/2026'), { code: 'INVALID_DATE' });
const bad = structuredClone(history);
bad[50].numbers[0] = '12junk';
assert.throws(() => core.validateHistory(bad), { code: 'INVALID_DRAW' });
const random = core.generateRandomForm('fixed-fixture-seed');
assert.equal(random.length, 14);
assert.equal(new Set(random.map(r => r.numbers.join(','))).size, 14);
assert.deepStrictEqual(core.generateRandomForm('fixed-fixture-seed'), random);
const loss = core.scoreArm([
  { comboNum: 1, numbers: [1, 2, 20, 21, 22, 23], strong: 1 },
  { comboNum: 2, numbers: [3, 4, 24, 25, 26, 27], strong: 1 },
], { numbers: [1, 2, 3, 4, 5, 6], strong: 1 });
assert.equal(loss.win3Plus, 0); // four scattered regular hits are not a win
```

- [ ] **Run red:** `& $learningNode tests/verify-learning-core.js`. Initially module/API missing; after the module exists, ensure every validation/metric assertion fails for the corresponding wrong behavior, not a fixture typo.
- [ ] **Implement strict contracts and sampling.** Accept full-string decimal integers (not `parseInt` prefixes); require unique positive draw IDs, six distinct regular numbers 1–37, nondecreasing dates and contiguous IDs after sorting. Accept ISO date-only, day/month/four-digit-year using `/`, `.` or `-`, and integer Excel serials 20000–80000; validate calendar roundtrips. Reject unknown date strings and epoch timestamps. Validate all historical rows with strong 1–8, then explicitly exclude the contiguous prefix through the last strong-8 row; display its count and require all retained rows to have strong 1–7. Never silently filter malformed rows or repair a gap.
- [ ] **Implement exact deterministic mechanics.** Canonical digest input is UTF-8 `JSON.stringify(rows.map(d => [d.drawNumber,d.date,...d.numbers,d.strong]))`; SHA-256 through Web Crypto, not the existing 32-bit fingerprint. Normalize dates first. Sample with a local seeded 32-bit PRNG, rejection-sampled bounded integers and Fisher–Yates; save/document its algorithm as part of V1. Never call the existing misleadingly named `pickRandom`. For each row shuffle 1–37, take six, sort, and reject repeated six-number keys. Shuffle `[1,1,2,2,3,3,4,4,5,5,6,6,7,7]` for strong numbers.

```js
function scoreArm(lines, draw) {
  const rows = lines.map(line => {
    const score = LottoStrategyCore.scoreLine(line, draw);
    return { comboNum: line.comboNum, regularMatches: score.regularMatches,
      strongMatch: score.strongMatch };
  });
  const won = threshold => Number(rows.some(row => row.regularMatches >= threshold));
  return { rows, win3Plus: won(3), win4Plus: won(4), win5Plus: won(5), win6: won(6),
    strongMatches: rows.filter(row => row.strongMatch).length };
}
```

`generatePolicyForm` slices at/before `cutoff`, then takes the last `window`, reverses a copy and calls `generateBaselineForms(...).form2`; validate generated rows and unique keys. `buildArms` uses that learner, `.main` on the preceding 500 rows for legacy, and seed `${PROTOCOL_VERSION}|${mode}|${seedHex}|${cutoff + 1}|random`. Allow legacy duplicate rows but display unique count. Generation failures return an error, not a different secretly substituted policy.

- [ ] **Extend and run green:** tests cover duplicate IDs, gaps, impossible dates, shuffled input, strong-8 boundary, strong9, invalid generated forms, historical-prefix counts, order-invariant hash, changed-past hash, equal 14-row arms and balanced random strong counts. Run `verify-learning-core.js`, `verify-strategy-core.js`, `verify-analyzer-core-integration.js`.
- [ ] **Commit:** `git add lotto-learning-core.js tests/fixtures/learning-fixture.js tests/verify-learning-core.js`; `git commit -m "feat: add deterministic learning experiment primitives"`.

### Task 2: Policy updates, historical replay and dedicated worker

**Files:** Modify `lotto-learning-core.js`; create `lotto-learning-worker.js`, `tests/verify-learning-policy.js`, `tests/verify-learning-worker.js`.

**Interfaces:** Consume Task 1 contracts. Export:

- `selectWindow(counts, incumbent): WindowSize`
- `evaluateDecision(rows, cutoff, incumbent, onProgress): Decision`
- `advancePolicy(rows, originAnchor, decisions, cutoff, onProgress): Decision[]` (returns complete ordered decision history)
- `prepareAtCutoff(rows, { originAnchor, decisions, cutoff, seedHex, mode }, onProgress): { decisions, window, arms, digest, cutoff }` (Promise)
- `runHistoricalReplay(rows, onProgress): Promise<{ mode:'historical', sampleCount:200, decisions:Decision[], targets:Array<{ target:number, draw:CanonicalDraw, arms:Arms, scores:Record<ArmName,ArmScore> }>, seed:string }>`

- [ ] **Write failing tests with literal scheduling expectations.** Assert sample-size errors at 699 and 899 rows, and tie behavior separately from generator outcomes. Mutation tests change the target and all later rows without changing any earlier decision/form.

```js
assert.equal(core.selectWindow({ 100: 11, 200: 12, 500: 12 }, 200), 200);
assert.equal(core.selectWindow({ 100: 11, 200: 12, 500: 12 }, 100), 500);
assert.equal(core.selectWindow({ 100: 13, 200: 12, 500: 12 }, 500), 100);
const rows = buildLearningDraws(741);
const origin = 3699; // 700th draw
let stepped = core.advancePolicy(rows, origin, [], origin);
for (let cutoff = 3700; cutoff <= 3740; cutoff++) {
  stepped = core.advancePolicy(rows, origin, stepped, cutoff);
}
const batched = core.advancePolicy(rows, origin, [], 3740);
assert.deepStrictEqual(batched, stepped);
assert.deepStrictEqual(batched.map(d => d.cutoff), [3699, 3719, 3739]);
```

- [ ] **Run red:** `& $learningNode tests/verify-learning-policy.js`; expect missing new API first, then catch an intentionally wrong 19/21 interval before accepting green.
- [ ] **Implement selection from earlier prefixes, not weighted score.** At decision cutoff index `i`, score target indices `i-199` through `i` using forms built at the preceding index; no target may have fewer than 500 prior rows. All three policies see identical targets. Counts are integers 0–200. The next live target is cutoff+1; decision at origin+20 affects target origin+21.

```js
function selectWindow(counts, incumbent) {
  const order = [500, 200, 100];
  const best = Math.max(...order.map(w => counts[w]));
  if (order.includes(incumbent) && counts[incumbent] === best) return incumbent;
  return order.find(w => counts[w] === best);
}
```

Reject a decision history that has a different origin, unsorted/duplicate cutoffs, invalid count or mismatched version. Recompute missing 20-draw boundaries using only rows through each boundary, even when one load brings many results. Do not create missed snapshots. Cache generated policy forms only inside a single immutable-history run by `(window,target)`; never key random seeds from a dataset hash containing later outcomes.

`prepareAtCutoff` hashes only normalized rows at or before its cutoff. Passing a longer history must not change the returned digest, decisions or arms for that cutoff. Validate versions against the enclosing experiment/worker request; Decision records inherit that identity rather than containing a second version field.

- [ ] **Implement replay and worker protocol.** Replay exactly the last 200 targets with the same update rule; origin is the draw immediately before the first target. Default incumbent500 only resolves the initial tie; choose initial policy using its own preceding200 targets. Fixed historical seed; no UI seed control. Return descriptive historical results only.

```js
// Worker request; never include a Date object or a function.
{
  type: 'run', operation: 'prepare', runId: 'r1', generation: 4,
  protocolVersion: 'learning-experiment-v1', expectedRevision: 2,
  rows: [], options: { originAnchor: 3699, decisions: [], cutoff: 3699,
    seedHex: '00112233445566778899aabbccddeeff', mode: 'live' }
}
```

Operations are `prepare` or `replay`. Worker imports strategy core then learning core, validates operation/version, and echoes runId/generation/expectedRevision/version on `progress`, `complete`, and `error`. Error codes include `INSUFFICIENT_HISTORY`, `INVALID_DECISIONS`, `INVALID_OPERATION`, `GENERATION_FAILED`. Controller cancellation uses `Worker.terminate()`; a synchronous calculation cannot reliably handle a cancel message. Compute hashes before sending completion.

- [ ] **Run green:** Node policy suite plus worker VM tests using actual core functions; real-browser worker smoke is added in Task5. Cover unchanged output under future mutation, changed lawful past affecting fixture output, absence of mutation of input arrays, deterministic replay, 200-target count, distinct historical/live seeds, tagged errors and progress.
- [ ] **Commit:** stage only Task2 files; `git commit -m "feat: add leakage-safe periodic learning and replay worker"`.

### Task 3: Transactional and immutable local history

**Files:** Create `lotto-learning-store.js`, `tests/helpers/learning-browser.js`, `tests/fixtures/learning-harness.html`, `tests/verify-learning-store-playwright.js`.

**Interfaces:** `LottoLearningStore.open({ onVersionChange = () => {} } = {}): Promise<Store>`; `Store.read(): Promise<StoredState>`; `Store.commit(expectedRevision, transition, { signal } = {}): Promise<StoredState>`; `Store.setPaused(expectedRevision, paused): Promise<StoredState>`; `Store.close(): void`. No production clear/delete/import-write API. The test harness owns cleanup.

- [ ] **Build the browser harness with a failing real-IndexedDB race test.** The helper exports `openLearningHarness()` returning `{ browser, context, page, baseUrl, close }`; serve repository files with path containment checks, use one Chromium context, load the minimal HTML page and real modules. New second tabs must use `context.newPage()`. Use the bundled browser/executable override and the existing server's MIME mappings. Close page/context/browser/server in `finally`.

The fixture page initially loads strategy/core/store and the fixture globals. Expose this **test-fixture-only** constructor; do not add it to production modules. Tasks4–5 add report/controller scripts to the same page.

```js
async function makeStartTransition() {
  const rows = LottoLearningFixture.buildLearningDraws(700);
  const cutoff = rows.at(-1).drawNumber;
  const seedHex = '00112233445566778899aabbccddeeff';
  const prepared = await LottoLearningCore.prepareAtCutoff(rows, {
    originAnchor: cutoff, decisions: [], cutoff, seedHex, mode: 'live',
  });
  const experiment = {
    id: 'fixture-experiment', protocolVersion: 'learning-experiment-v1',
    coreVersion: LottoStrategyCore.ALGORITHM_VERSION + ':' + LottoStrategyCore.CONSTRAINT_VERSION,
    seedHex, originAnchor: cutoff, lastProcessedDraw: cutoff, status: 'active',
    sourceDigest: prepared.digest, sourceCutoff: cutoff,
  };
  const createdAt = rows.at(-1).date + 'T12:00:00Z';
  const snapshot = {
    experimentId: experiment.id, target: cutoff + 1, anchor: cutoff, createdAt,
    protocolVersion: experiment.protocolVersion, coreVersion: experiment.coreVersion,
    seedHex, window: prepared.window, arms: prepared.arms,
    source: { kind: 'canonical', url: 'NUMBERS.xlsx', fetchedAt: createdAt,
      generation: 1, digest: prepared.digest },
  };
  return { experiment, decisions: prepared.decisions, snapshots: [snapshot],
    observations: [], prizes: [], faults: [] };
}
```

```js
const { page, context, baseUrl, close } = await openLearningHarness();
try {
  const second = await context.newPage();
  await second.goto(baseUrl + '/tests/fixtures/learning-harness.html');
  const transition = await page.evaluate(() => makeStartTransition());
  const race = await Promise.all([page, second].map(tab => tab.evaluate(async change => {
    const store = await LottoLearningStore.open();
    try { await store.commit(0, change); return 'saved'; }
    catch (error) { return error.code; }
    finally { store.close(); }
  }, transition)));
  assert.deepStrictEqual(race.sort(), ['REVISION_CONFLICT', 'saved'].sort());
} finally { await close(); }
```

- [ ] **Run red:** `& $learningNode tests/verify-learning-store-playwright.js`. Confirm the harness loads; missing module/API is the initial red, not inability to launch Chrome.
- [ ] **Implement IDB schema and atomic revision checks.** Schema1 stores: `meta` key`active`, `decisions` key`[experimentId,cutoff]`, `snapshots`/`observations`/`prizes` key`[experimentId,target]`, `faults` key`[experimentId,targetKey,code]`. Storage maps a global fault's null target to string `global` in targetKey (null is not a valid IndexedDB key), otherwise uses its numeric target. Store Decision records with experimentId added by storage. `meta` contains revision plus Experiment. No separate mutable active-window field: latest Decision is authoritative.

```js
// All validation and expensive async hashes finish BEFORE opening this transaction.
const tx = db.transaction(
  ['meta', 'decisions', 'snapshots', 'observations', 'prizes', 'faults'], 'readwrite');
const read = tx.objectStore('meta').get('active');
read.onsuccess = () => {
  const current = read.result || { key: 'active', revision: 0, experiment: null };
  if (current.revision !== expectedRevision) {
    failureCode = 'REVISION_CONFLICT';
    tx.abort();
    return;
  }
  // Perform validated adds/puts in request callbacks within this same transaction.
};
```

Use `.add` for immutable snapshots/decisions/observations; exact already-present records are idempotent, a differing value is `IMMUTABLE_CONFLICT`. Re-read existing keys inside the transaction. Prize records may be replaced only if their drawDigest is unchanged and the snapshot exists. `meta.revision` increases once for an effective atomic change; no-op repeats return current state without increment. `setPaused` reads/writes in its own revision-checked transaction. Persisted `paused/conflict` state must defeat an older generation commit. Never await external promises inside an IDB transaction. Abort when the supplied signal fires; resolve only on transaction completion.

Open without a requested database version so an existing higher-version database can be inspected without a downgrade error. Create Schema1 stores only for a new database (`oldVersion === 0`). Unknown protocol/core/schema or malformed records yield `compatibility:'readonly'`, explanatory incompatibilityCodes and rawBackup; unsafe typed arrays are empty and all mutating methods reject `INCOMPATIBLE_STORE`. Compatible state has rawBackup:null and an empty codes array. Never delete or upgrade unknown data into trusted state. `versionchange` closes the connection and calls onVersionChange; blocked opens show recoverable error. Quota/abort failures must leave all stores unchanged and never yield a saved message.

- [ ] **Run green with independent assertions.** Add two-tab start with differing seeds (exactly one survives), late stale commit after pause, abort after first queued write, duplicate-target collision, repeated no-op, changed prior observation, late-prize-only update and untouched PIN localStorage bytes. For browser-native quota failure use a request/transaction failure harness boundary; separately exercise real transaction abort. Do not assert that a mock was called as a substitute for atomic-state assertions.
- [ ] **Commit:** stage Task3 files; `git commit -m "feat: persist immutable learning snapshots transactionally"`.

### Task 4: Chronological audit, evidence and read-only backups

**Files:** Create `lotto-learning-report.js`, `tests/verify-learning-report.js`; extend store browser suite for export roundtrip without writes.

**Interfaces:** `LottoLearningReport.localDateAt(utcIso): string`; `classifySnapshot(snapshot, draw): 'eligible'|'same-day-or-late'`; `buildObservations(state, rows): { observations:Observation[], faults:Fault[] }`; `summarizeExperiment(state): Report`; `evaluateEvidenceBlock(observations,k): Evidence`; `exportBackup(state): string`; `readBackup(json): { mode:'readonly-import', state:StoredState, report:Report }`.

`Report` contains arm sample/win counts and rates (null for zero denominator), paired differences, exclusions by kind, known-prize sums plus missing counts, and ordered block results. `Evidence` includes `k`, `n`, `eligibleCount`, `status:'insufficient'|'descriptive'|'no-clear-advantage'|'period-evidence'`, `alpha`, paired means and lower bounds. Imported/historical reports never receive `period-evidence` status.

- [ ] **Write failing boundary tests.** Use exact Jerusalem midnight examples and manually constructed outcomes rather than mirroring production aggregation.

```js
const report = require('../lotto-learning-report.js');
const draw = { drawNumber: 4000, date: '2026-09-22', numbers: [1,2,3,4,5,6], strong: 1 };
assert.equal(report.classifySnapshot({ target: 4000, createdAt: '2026-09-21T20:59:59Z' }, draw), 'eligible');
assert.equal(report.classifySnapshot({ target: 4000, createdAt: '2026-09-21T21:00:00Z' }, draw), 'same-day-or-late');
assert.equal(report.localDateAt('2026-01-01T22:00:00Z'), '2026-01-02');
assert.throws(() => report.readBackup('{"schemaVersion":99}'), { code: 'UNSUPPORTED_BACKUP' });
```

- [ ] **Run red:** `& $learningNode tests/verify-learning-report.js`.
- [ ] **Implement ordered audit.** `localDateAt` uses `Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jerusalem',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts`, assembling YYYY-MM-DD without host-timezone assumptions. Eligibility is strict lexical date comparison after validating UTC timestamp and target identity. A later client clock moving backwards below the latest saved timestamp blocks new creation in Task5; it never rewrites earlier times.

`buildObservations` processes each result ID from experiment.lastProcessedDraw+1 through loaded cutoff. Match only snapshot.target. Missing snapshot produces `missing` with null scores, not an inferred reused form. Known snapshot uses `scoreArm` for each arm. Same-day scores can be displayed descriptively but are excluded from qualified prospective aggregates. Compare already stored draws to incoming draw values; differences produce a separate fault. Task5 persists it with experiment.status='conflict', without replacing the immutable observation. Any such fault suppresses positive evidence even if an earlier stored observation was eligible.

For evidence, anchor non-overlapping 200-target blocks to `originAnchor+1`: block1 is origin+1..origin+200, block2 is origin+201..origin+400. A block with any missing/late/faulted target is permanently descriptive. Wait for all200 target positions before closing it; gaps must not reset the block or k. This implements the spec's no-restart/no-cherry-picking rule and makes batch loads deterministic. Count only shared eligible observations in descriptive rates, and show omitted counts.

```js
function lowerBound(meanDifference, k) {
  const alpha = 0.05 / (2 * k * (k + 1));
  return Math.max(-1, meanDifference - Math.sqrt(2 * Math.log(1 / alpha) / 200));
}
```

Use this bound only for completed clean200-target blocks; compare learner against BOTH benchmarks. Positive raw difference alone is insufficient. With all200 learner-only wins, k1 lower bound should be between0.79 and0.80; with 20 learner-only/180 tied outcomes it must remain negative. Test k progression through invalid blocks and identical results after reload. Never apply IID bootstrap significance to adaptive observations.

- [ ] **Implement backup boundaries.** Export a UTF-8 JSON object `{ schemaVersion:1, protocolVersion, exportedAt, state }`; for an incompatible store export its preserved rawBackup instead. Validate imports before rendering: maximum25MiB encoded input, at most10000 targets, exact finite integer ranges, duplicate keys rejected, known versions and all required structures; reject prototype-bearing keys and inconsistent immutable identities. Digests must be exactly64 hexadecimal characters; this syntax check cannot verify an omitted original history. Recompute displayed scores where stored draws are present, never trust imported summary badges. Readonly imports cannot call store.commit, start, or resume; raw unknown-version bytes may be downloaded but not executed/rendered as HTML. No active-state restore UI in V1.
- [ ] **Run green:** add zero-denominator, all-loss, four scattered hits, unknown prizes, partial totals, strong-only changes, timezone independence, missing-target, completed/partial block, invalid k, repeated import, malicious HTML label and malformed checksum cases. Storage must remain byte-equivalent after every import/export-only action.
- [ ] **Commit:** stage Task4 files; `git commit -m "feat: report learning outcomes without retrospective evidence"`.

### Task 5: Source fencing, worker lifecycle and safe synchronization

**Files:** Create `lotto-learning-controller.js`, `tests/verify-learning-controller.js`, `tests/verify-learning-controller-playwright.js`; modify source/prize adapters in `lotto_analyzer.html`; extend browser harness.

**Interfaces:** `LottoLearningController.create({ store, workerFactory, now, makeSeed, prizeAdapter, onState }): Controller`. Defaults use real Worker, UTC clock and `crypto.getRandomValues`; injected boundaries exist for real clock/I/O control, not special production test methods.

Controller methods: `beginSource(kind): number` invalidates old work immediately; `acceptSource(rawRows,{kind,url,fetchedAt,generation}): Promise<void>`; `rejectSource(generation,error): void`; `start(): Promise<void>`; `synchronize(): Promise<void>`; `pause(paused): Promise<void>`; `replay(): Promise<void>`; `cancel(): void`; `refreshPrizes(): Promise<void>`; `readView(): ViewModel`; `close(): void` (owns worker/DB/event resources). `ViewModel` contains mode, sourceState, stored state, report, pending replay, progress and error; no DOM references.

- [ ] **Write failing source-race tests.** Prove canonical eligibility comes only from the default fetch path, not a filename or an arbitrary `runAnalysisWithRows` call. Use controllable promises at fetch/worker boundaries, but assert the real store and generated form state.

```js
const harness = await openLearningHarness();
try {
  const result = await harness.page.evaluate(async () => {
    const store = await LottoLearningStore.open();
    const controller = LottoLearningController.create({ store });
    try {
      const first = controller.beginSource('canonical');
      const second = controller.beginSource('manual');
      const fixture = LottoLearningFixture;
      await controller.acceptSource(fixture.toLearningMatrix(fixture.buildLearningDraws(700)), {
        kind: 'canonical', url: 'NUMBERS.xlsx',
        fetchedAt: '2026-09-21T10:00:00Z', generation: first,
      });
      return { source: controller.readView().sourceState, second,
        experiment: (await store.read()).experiment };
    } finally { controller.close(); }
  });
  assert.equal(result.source.generation, result.second);
  assert.equal(result.source.status, 'loading');
  assert.equal(result.experiment, null);
} finally { await harness.close(); }
```

- [ ] **Run red:** Node controller tests with an in-memory boundary only for unit orchestration; browser controller tests use the real store/worker from Tasks2–3. Missing APIs must not be confused with browser setup errors.
- [ ] **Implement source ingestion before permissive parsing.** Mint a source generation token at manual selection/default fetch start; report read/fetch failure against that same token. Capture strict nine-column raw data cells before `normalizeData`; exclude only wholly empty rows as the existing reader does. Require `[id,date,n1,n2,n3,n4,n5,n6,strong]`; do not require a header or guess missing IDs. Reject unsupported shapes with a clear message. Check IDs and numeric cells before `parseInt` can accept suffix garbage. Valid canonical identity is the successful default-file request token plus its raw rows, not `file.name`. Manual histories may run replay but cannot create/settle active live state. Do not use `getEffectiveBacktestRows` or selectedData. Selecting a new source immediately disables creation using the old source; failure does not re-enable it.

Publish successfully loaded canonical raw rows and their provenance directly from `loadDefaultNumbersFile`, independently of the legacy Analyze button; legacy staging/normalization/selected-range behavior stays unchanged. Manual rows are published after their actual read succeeds. Changing only the selected analysis range does not mint a new fetch timestamp or source generation. A generic `runAnalysisWithRows` call without the matching staged-load token is manual, never canonical. Source validation errors affect the learning panel, not previously valid PIN storage or legacy analysis. Hash immutable normalized history in the worker; ignore obsolete responses at every asynchronous boundary, including hash/prize/persistence completion. Persist only after checking runId, generation, protocol/core version, expected store revision and current canonical provenance. Attach an AbortController signal to IDB commit; newer sources/cancel/pause abort pending writes.

- [ ] **Implement state transitions.** Start requires700 valid rows, creates one experiment seed, prepares initial decision/three arms, and commits experiment+decision+snapshot atomically. If a competing tab wins, reread it; never reroll until a winning seed appears. Capture snapshot.createdAt immediately before the successful save attempt, not at worker start. Source cutoff must still match. Verify monotonic local creation time against stored history; reject rollback with `CLOCK_ROLLBACK`.

On canonical refresh: verify earlier persisted draw values and source-prefix hashes, settle known/missing targets, advance the policy at each crossed20 boundary, and create only `latestDraw+1` if active and absent. Paused state still settles existing targets; do not create new forms. Snapshot rows never enter an update payload. Revision conflict causes one reread/re-evaluation; persistent conflict is shown, not blindly retried. Storage failure shows „הטופס לא נשמר” and leaves prior saved state visible.

Worker errors (`error`, `messageerror`, construction error), cancellation, stale progress, and page close dispose owned resources and cannot commit or display success. Replay never calls store.commit. Keep learning and existing Backtest workers/run IDs separate.

- [ ] **Implement the prize adapter without changing PIN semantics.** Extend `calculatePinnedDrawWinnings(score, draw, prizeDocument = lottoPrizeDocument)` to read the optional document; existing two-argument calls retain identical behavior. The learning adapter fetches/normalizes its own prize document with no-store at canonical synchronization or explicit „רענן נתוני זכייה”, so the legacy memoized promise is unchanged. Call the existing calculator with unsorted `results` from immutable row IDs. Before calling it, verify prize draw date matches canonical draw and that every winning tier for a3+ row exists and is valid; otherwise the learning total is unavailable. Missing nonwinning tiers remain no-prize. Store late prize updates separately with the same drawDigest; never update learning counts, snapshots or decisions.

```js
const score = { results: core.scoreArm(lines, draw).rows.map(row => ({
  regularMatches: row.regularMatches, strongMatch: row.strongMatch,
})) };
const winnings = calculatePinnedDrawWinnings(score, draw, checkedPrizeDocument);
```

- [ ] **Run green:** controller tests cover slow-fetch/manual race, failed canonical fetch, cancelled start/replay, lost source during commit, stale message after pause, worker crash, missing targets after batch load, changed historic outcome, clock rollback, manual replay without writes and price-late-only changes. Run existing PIN suites after the optional prize-document parameter change.
- [ ] **Commit:** stage Task5 files; `git commit -m "feat: synchronize learning snapshots with fenced data sources"`.

### Task 6: Hebrew learning panel, history and iframe navigation

**Files:** Create `lotto-learning-ui.js`, `lotto-learning.css`, `tests/verify-learning-ui-playwright.js`; modify `lotto_analyzer.html`, `Lotto_All_In_One.html`; extend browser helper for full-page routes.

**Interfaces:** `LottoLearningUI.mount(rootElement, controller): { render(viewModel), unmount() }`. Use controller methods from Task5; render plain data only. New analyzer section `#learningExperimentCard` is outside hidden `#results` so stored history remains readable before a workbook is loaded; analyzer `setAnalyzerWorkspace` explicitly hides it in Backtest mode and shows it in analysis mode. Add analyzer-side scroll navigation plus one shell rail entry using `goToAnalyzerSection('learningExperimentCard')`.

- [ ] **Write failing visible-behavior tests.** Use the real controller, actual raw-matrix ingestion and real worker for at least the principal start flow. For loading tests supply a workbook fixture or deterministic SheetJS parsing route; do not set `currentData` directly as the only coverage.

```js
await page.getByRole('button', { name: 'התחל ניסוי ושמור טופס', exact: true }).click();
await page.locator('[data-learning-saved="true"]').waitFor();
assert.equal(await page.locator('[data-learning-active-line]').count(), 14);
const original = await page.locator('[data-learning-snapshot-id]').first().getAttribute('data-learning-snapshot-id');
await page.reload();
await page.locator(`[data-learning-snapshot-id="${original}"]`).waitFor();
assert.equal(await page.locator('[data-learning-history-count]').textContent(), '0');
```

- [ ] **Run red:** `& $learningNode tests/verify-learning-ui-playwright.js`; missing control/region is expected before integration, not a swallowed page script error.
- [ ] **Implement the panel and minimal analyzer adapters.** Load standalone modules after strategy core; initialize controller after DOM and prize helper definitions exist. Panel contains two tabs („מעקב מקומי” / „סימולציה היסטורית”), current learner14-row table, collapsible legacy/random tables, source/anchor/target/created-time/policy meta, next policy-review draw, counts/exclusions, 3+/4+/5+/6/strong summaries, and immutable draw history with prizes per row and per-target total. Distinguish missing prize from₪0; show known subtotal with missing-target count, never profit/ROI.

Use buttons „בדיקה היסטורית”, „התחל ניסוי ושמור טופס”, „השהה יצירת טפסים” / „המשך ניסוי”, „בטל חישוב”, „רענן נתוני זכייה”, „ייצא גיבוי”, and a readonly-backup file input. Disable start when canonical source is not ready/too short, active experiment exists, schema incompatible or worker/storage unavailable. Only explicit start creates an experiment. Render active local/readonly import views separately; exiting import restores local view without changing storage.

```js
const disclaimer = document.createElement('p');
disclaimer.className = 'learning-disclaimer';
disclaimer.textContent = 'טופס וירטואלי בלבד. המעקב מקומי ומתעדכן כשהאתר פתוח. אין הבטחה לשיפור או לזכייה.';
rootElement.append(disclaimer);
```

Keep source/version/seed labels via textContent; use DOM nodes or existing escape helper, not raw interpolated import text. Scope every CSS rule under `#learningExperimentCard` or `.learning-*`. Use logical CSS properties, wrapping metadata, accessible tabs/buttons, bounded table overflow, visible keyboard focus and one polite live status region. No fill/send/PIN controls in this panel.

Shell: one rail button beside the PIN navigation, no extra top-level workspace type. Remember a pending analyzer section ID when clicked before iframe readiness, replay it from `handleAnalyzerLoad`, and clear it after successful focus. Switching to Backtest must not leave learning controls visible; returning to learning restores analysis mode without changing form/Backtest data.

- [ ] **Run green with real failures and layouts.** Cover canonical source vs a manual file namedNUMBERS.xlsx, limited row selection leaving learning digest unchanged, progress/cancel/retry, late prize refresh, partial totals, imported HTML not executing, saved history visible before data reload, empty/prohibited states, keyboard tabs, iframe early-navigation race and Backtest→learning→PIN→form. Run at1440×900 and390×844; assert no document horizontal overflow. Capture panel screenshots into ignored `test-results/learning-desktop.png` and `learning-mobile.png` and visually inspect.
- [ ] **Commit:** stage Task6 files; `git commit -m "feat: expose independent learning experiment UI"`.

### Task 7: Full regression, operating guide and release handoff

**Files:** Create `docs/learning-experiment.md`, `tests/verify-learning-regression-playwright.js`, `tests/helpers/create-learning-workbook.py`; extend `tests/helpers/learning-browser.js` with the XLSX fixture route; change only feature files if verification finds a regression. Do not add unrelated scheduler fixes.

**Interfaces:** Consume real UI/controller/store. Browser helper from Task3 supports one shared context and routed canonical workbook/prize fixtures; reuse existing PIN seed format from `tests/verify-pinned-forms-playwright.js` without exporting its immediately executing runner.

- [ ] **Write a failing cross-feature preservation regression before any compatibility fixes.** Initialize all four PIN slots and a valid Backtest cache; let existing initialization/migration complete, then capture stored bytes. Exercise learning start, replay, new draw settlement, pause/resume, export/read-only import, and navigation. Assert storage and existing PIN controls retain behavior.

```js
const preserved = await page.evaluate(() => Object.fromEntries(
  Object.keys(localStorage).filter(key => /pinned|backtest/i.test(key))
    .sort().map(key => [key, localStorage.getItem(key)])));
await page.getByRole('button', { name: 'בדיקה היסטורית', exact: true }).click();
await page.locator('[data-learning-replay-state="complete"]').waitFor();
const after = await page.evaluate(() => Object.fromEntries(
  Object.keys(localStorage).filter(key => /pinned|backtest/i.test(key))
    .sort().map(key => [key, localStorage.getItem(key)])));
assert.deepStrictEqual(after, preserved);
```

Also compare each original PIN's numbers, #/hits sorting, RTL order, closed-summary winnings and independent-open-card behavior. Assert simulation does not increase snapshot count; no retrospective snapshots after two skipped draws; two tabs resume without seed or target duplication.

- [ ] **Exercise the actual workbook parser.** The bundled Node runtime has Playwright but does NOT have `xlsx`. Reuse the application's existing pinned SheetJS0.20.3 asset, not an invented bundled package. At execution time, prepare a test-only cache in an OS temporary directory, then route the browser's exact existing CDN request to those bytes. No runtime dependency installation or committed vendor bundle is required. If download is unavailable, report this ingestion check as blocked; do not call a parser stub equivalent coverage.

```powershell
$learningAssetDir = Join-Path ([System.IO.Path]::GetTempPath()) ('lotto-learning-tests-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $learningAssetDir | Out-Null
$env:LOTTO_LEARNING_SHEETJS_PATH = Join-Path $learningAssetDir 'xlsx-0.20.3.min.js'
$env:LOTTO_LEARNING_PYTHON = $learningPython
Invoke-WebRequest -Uri 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js' -OutFile $env:LOTTO_LEARNING_SHEETJS_PATH
Get-FileHash -LiteralPath $env:LOTTO_LEARNING_SHEETJS_PATH -Algorithm SHA256
```

Record this retrieved asset hash with verification results; it documents the tested bytes, not an independently authenticated hash. Browser tests themselves make no external CDN request. The new test-only Python helper reads a JSON matrix from stdin and emits actual XLSX bytes:

```python
import json
import sys
from io import BytesIO
from openpyxl import Workbook

workbook = Workbook()
sheet = workbook.active
for row in json.load(sys.stdin):
    sheet.append(row)
output = BytesIO()
workbook.save(output)
sys.stdout.buffer.write(output.getvalue())
```

Add/export `routeLearningWorkbook(page, draws): Promise<void>` in the browser helper. Invoke it before navigation; it creates these bytes using `spawnSync`, verifies the child exit code, and installs routes:

```js
async function routeLearningWorkbook(page, draws) {
  const fs = require('fs');
  const path = require('path');
  const { spawnSync } = require('child_process');
  const { toLearningMatrix } = require('../fixtures/learning-fixture');
  const result = spawnSync(process.env.LOTTO_LEARNING_PYTHON,
    [path.join(__dirname, 'create-learning-workbook.py')], {
      input: JSON.stringify(toLearningMatrix(draws)), maxBuffer: 10 * 1024 * 1024,
    });
  if (result.error || result.status !== 0) {
    throw result.error || new Error(result.stderr.toString());
  }
  const sheetjs = fs.readFileSync(process.env.LOTTO_LEARNING_SHEETJS_PATH);
  await page.route('https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js',
    route => route.fulfill({ contentType: 'text/javascript', body: sheetjs }));
  await page.route(/\/NUMBERS\.xlsx(?:\?.*)?$/,
    route => route.fulfill({ contentType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', body: result.stdout }));
}
```

Use 700 fixture rows for a real loader-to-snapshot flow. Assert parsed draw IDs/dates/numbers and source digest match the fixture, then verify a manual upload of those same bytes has no canonical privileges. At least one principal UI test in Task6 must already exercise raw ingestion; this Task7 test additionally verifies actual XLSX decoding rather than stubbing SheetJS.

- [ ] **Run red/green on any observed feature regressions**, with a minimal fix and corresponding behavioral test. Do not weaken existing assertions to accommodate a changed PIN or Backtest behavior.
- [ ] **Write the operating guide.** Explain start/pause/resume, 14 new rows per target versus every20 policy review, 700/900 history requirements, canonical/manual source distinction, same-day timestamp exclusion, missed draws, local storage and readonly backup, no closed-site processing, conservative evidence and lack of guaranteed odds/profit. Include actions for storage-full/version-conflict/data-conflict without instructing users to clear PIN data.
- [ ] **Run the complete suite on the final tree.** Use explicit failures, not the exit status of the last command after a failed earlier test:

```powershell
$learningTests = Get-ChildItem -LiteralPath tests -Filter 'verify-*.js' | Sort-Object Name
foreach ($learningTest in $learningTests) {
    Write-Output $learningTest.Name
    & $learningNode $learningTest.FullName
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
& $learningNode tests/test-lotto-combos.js
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& $learningPython -m unittest discover -s tests -p 'test_*.py'
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
git diff --check
```

- [ ] **Review actual results.** Inspect desktop/mobile screenshots and run one readonly historical replay on the repository's real data with the frozen protocol/seed. Report its sample count, errors and comparison honestly; it is a smoke/reproducibility check, not proof of winning advantage. Do not tune the protocol after seeing those results in this implementation. Run `superpowers:requesting-code-review` for the complete branch and address material findings, then reverify affected and regression suites.
- [ ] **Commit and hand off.** `git add docs/learning-experiment.md tests/verify-learning-regression-playwright.js tests/helpers/create-learning-workbook.py tests/helpers/learning-browser.js` plus only reviewed feature fixes; `git commit -m "test: verify isolated learning workflow and document limits"`. Summarize actual passing/failing checks, state what remains local, and use the finishing workflow for the user's integration choice. Never merge the old draft PR or force-push. If a PR is created on the user's instruction, attach it to the task.

## Dependency order and plan coverage

Tasks1→2 define computation; Task3 can follow Task1's types without sharing edits with Task2; Task4 consumes immutable contracts; Task5 joins1–4; Task6 integrates controller and UI; Task7 verifies the complete feature. This dependency order remains fixed whichever execution method is chosen.

| Spec sections | Tasks covering them |
|---|---|
| 1–2: scope, preserved PINs, no gambling actions | Global constraints, 6–7 |
| 3: controls, history, backup, responsive display | 3–6 |
| 4–5: three arms, seeds, policy updates | 1–2 |
| 6: strict data, time, immutable snapshots | 1, 3–5 |
| 7: replay, binary outcomes, prizes, evidence | 1–2, 4–5 |
| 8: modules, cancellation, persistent isolation | 2–6 |
| 9: all acceptance tests | 1–7, final full regression |

## Approval and execution choice

Ask the user to review this plan and choose **subagent-driven execution** (recommended for independent review of data integrity, learning and storage) or **native execution** (one implementer, final independent review). If execution method was already explicitly selected for this new feature, preserve it and ask only for plan confirmation. Recommend an isolated worktree and obtain consent before creating it if none has been given. Do not begin product code before plan review and method selection.
