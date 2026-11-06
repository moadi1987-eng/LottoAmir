(function attachLearningUI(runtime) {
  'use strict';
  const armNames = { learner: 'לומד', legacy: 'שיטה קיימת + השלמה קבועה', random: 'אקראי' };
  const kindNames = { eligible: 'כשיר', 'same-day-or-late': 'באותו יום או מאוחר — לא נכלל', missing: 'טופס חסר', conflict: 'סתירה — לא נכלל' };
  const evidenceNames = { insufficient: 'אין מספיק נתונים', descriptive: 'תיאורי בלבד',
    'no-clear-advantage': 'אין יתרון ברור', 'period-evidence': 'עדות לתקופה זו בלבד; אינה הבטחת שיפור' };
  const money = value => '₪' + value.toLocaleString('he-IL');
  const rate = value => value == null ? '—' : (value * 100).toFixed(1) + '%';
  function requireJSONBackup(value, ancestors = new Set()) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
    if (typeof value === 'number' && Number.isFinite(value) && !Object.is(value, -0)) return;
    if (!value || typeof value !== 'object' || ancestors.has(value)
      || (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value)))
      || (Array.isArray(value) && (Object.keys(value).length !== value.length
        || Object.keys(value).some((key, index) => key !== String(index))))) throw new Error('Unsupported structured backup');
    ancestors.add(value);
    Object.values(value).forEach(item => requireJSONBackup(item, ancestors)); ancestors.delete(value);
  }
  function node(tag, text, attrs = {}) {
    const element = document.createElement(tag);
    if (text != null) element.textContent = text;
    Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, value));
    return element;
  }
  function mount(root, controller, { loadSource } = {}) {
    const reportAPI = runtime.LottoLearningReport;
    let view = controller ? controller.readView() : {};
    let imported = null; let importSerial = 0; let selectedTab = 'live';
    let busy = false; let actionSerial = 0; let localError = ''; let contentKey = ''; let unmounted = false; let sourceAborter = null;
    root.replaceChildren();
    root.append(node('h2', 'הטופס הלומד', { id: 'learning-title' }));
    root.setAttribute('aria-labelledby', 'learning-title'); root.tabIndex = -1;
    const disclaimer = document.createElement('p');
    disclaimer.className = 'learning-disclaimer';
    disclaimer.textContent = 'טוענים תוצאות ← בודקים זכייה ← מכינים טופס להגרלה הבאה. לוטו רגיל בלבד; הטופס אינו נשלח אוטומטית.';
    root.append(disclaimer);
    const primary = node('div', null, { class: 'learning-primary-actions' });
    const update = node('button', 'טען NUMBERS ועדכן טופס', { type: 'button', 'data-learning-update': '' });
    const restart = node('button', 'התחלה מחדש', { type: 'button', 'data-learning-restart': '' });
    async function loadCurrentSource() {
      const serial = actionSerial;
      if (loadSource) {
        sourceAborter = new AbortController();
        const loaded = await loadSource({ signal: sourceAborter.signal });
        if (!loaded) throw new Error('SOURCE_FAILED');
      } else await controller.synchronize();
      if (unmounted || serial !== actionSerial) throw new Error('CANCELLED');
      const current = controller.readView();
      if (current.sourceState?.status !== 'ready' || current.sourceState.kind !== 'canonical') throw new Error('SOURCE_FAILED');
      if (current.error && current.error.code !== 'PRIZE_REFRESH_FAILED') throw Object.assign(new Error(current.error.message), { code: current.error.code });
      return current;
    }
    update.addEventListener('click', () => run(async () => {
      const current = await loadCurrentSource();
      if (!current.stored?.experiment && !current.error) await controller.start();
    }));
    restart.addEventListener('click', () => {
      if (!runtime.confirm('להתחיל מעקב חדש? הטפסים והתוצאות הקודמים יישמרו בארכיון. טפסי PIN לא ישתנו.')) return;
      run(async () => { await loadCurrentSource(); await controller.restart(); });
    });
    primary.append(update, restart); root.append(primary);
    const advanced = node('details', null, { 'data-learning-key': 'advanced', 'data-learning-advanced': '' });
    advanced.append(node('summary', 'מתקדם — השוואות, סימולציה וגיבוי'));
    const tabs = node('div', null, { role: 'tablist', 'aria-label': 'מצבי ניסוי', class: 'learning-tabs' });
    const liveTab = node('button', 'מעקב מקומי', { type: 'button', role: 'tab', id: 'learning-live-tab', 'aria-controls': 'learning-live' });
    const historicalTab = node('button', 'סימולציה היסטורית', { type: 'button', role: 'tab', id: 'learning-historical-tab', 'aria-controls': 'learning-historical' });
    tabs.append(liveTab, historicalTab); advanced.append(tabs);
    const sourceMeta = node('div', null, { class: 'learning-meta' });
    const sourceLabel = node('p'); const sourceDigest = node('p', '', { 'data-learning-digest': '' });
    const sourceTechnical = node('details', null, { 'data-learning-key': 'source-technical' });
    sourceTechnical.append(node('summary', 'פרטי המקור הנוכחי'), sourceDigest);
    sourceDigest.dir = 'ltr'; sourceMeta.append(sourceLabel); root.append(sourceMeta); advanced.append(sourceTechnical);
    const actions = node('div', null, { class: 'learning-actions' });
    function control(label, action) {
      const button = node('button', label, { type: 'button' });
      button.addEventListener('click', action); actions.append(button); return button;
    }
    const start = control('התחל ניסוי ושמור טופס', () => run(() => controller.start()));
    const pause = control('השהה יצירת טפסים', () => run(async () => {
      const serial = actionSerial;
      const generation = view.sourceState?.generation;
      const experimentId = view.stored?.experiment?.id;
      const resume = view.stored?.experiment?.status === 'paused';
      await controller.pause(!resume);
      const resumed = controller.readView();
      // Cancelled controller actions resolve too; only this still-owned, successful resume may continue.
      if (resume && !unmounted && serial === actionSerial && resumed.sourceState?.generation === generation
        && !resumed.error && resumed.stored?.experiment?.id === experimentId && resumed.stored.experiment.status === 'active'
        && resumed.sourceState.status === 'ready' && resumed.sourceState.kind === 'canonical') await controller.synchronize();
    }));
    const replay = control('בדיקה היסטורית', () => run(() => controller.replay()));
    const cancel = control('בטל חישוב', () => {
      if (sourceAborter) sourceAborter.abort();
      actionSerial++; busy = false; localError = ''; controller.cancel(); render(controller.readView());
    });
    const refresh = control('רענן נתוני זכייה', () => run(() => controller.refreshPrizes()));
    const exportButton = control('ייצא גיבוי', () => {
      try {
        const state = imported ? imported.state : view.stored;
        if (state?.compatibility === 'readonly') requireJSONBackup(state.rawBackup);
        const text = reportAPI.exportBackup(state);
        if (typeof text !== 'string') throw new Error('Unsupported backup');
        const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
        const link = node('a', null, { href: url, download: 'lotto-learning-backup.json' });
        root.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch (_) { localError = 'EXPORT_UNSUPPORTED — לא ניתן לייצא את הנתונים בפורמט זה; המקור נשמר ללא שינוי.'; updateControls(); }
    });
    const importLabel = node('label', 'פתח גיבוי לקריאה בלבד', { for: 'learning-import-file' });
    const importInput = node('input', null, { id: 'learning-import-file', type: 'file', accept: '.json,application/json' });
    importInput.addEventListener('change', async () => {
      const file = importInput.files[0]; if (!file) return;
      try {
        if (file.size > 25 * 1024 * 1024) throw Object.assign(new Error(), { code: 'BACKUP_TOO_LARGE' });
        const result = reportAPI.readBackup(await file.text());
        if (unmounted) return;
        imported = result; importSerial++; selectedTab = 'live'; localError = ''; render(view);
      } catch (error) { localError = (error.code || 'INVALID_BACKUP') + ' — לא ניתן לקרוא את הגיבוי; המעקב המקומי לא השתנה.'; updateControls(); }
      importInput.value = '';
    });
    const fileWrap = node('div', null, { class: 'learning-import-control' }); fileWrap.append(importLabel, importInput); actions.append(fileWrap);
    const exitImport = control('חזרה למעקב המקומי', () => { imported = null; localError = ''; render(view); });
    const archiveList = node('div', null, { 'data-learning-archives': '' });
    const archivesButton = control('מעקבים קודמים', () => run(async () => {
      const archives = await controller.readArchives();
      archiveList.replaceChildren();
      if (!archives.length) archiveList.append(node('p', 'אין עדיין מעקבים בארכיון.'));
      archives.slice().reverse().forEach(archive => {
        const exp = archive.state.experiment;
        const button = node('button', `מעקב ${exp.originAnchor + 1}–${exp.lastProcessedDraw + 1} • ${archive.state.snapshots.length} טפסים`, { type: 'button' });
        button.addEventListener('click', () => {
          imported = { state: archive.state, report: reportAPI.summarizeExperiment(archive.state), archive: true };
          importSerial++; selectedTab = 'live'; localError = ''; render(view);
        });
        archiveList.append(button);
      });
    }));
    advanced.append(actions, archiveList);
    const status = node('p', '', { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true', class: 'learning-status' }); root.append(status);
    const live = node('div', null, { id: 'learning-live', role: 'tabpanel', 'aria-labelledby': liveTab.id, tabindex: '0' });
    const historical = node('div', null, { id: 'learning-historical', role: 'tabpanel', 'aria-labelledby': historicalTab.id, tabindex: '0' });
    const advancedReport = node('div', null, { id: 'learning-advanced-report' });
    advanced.append(advancedReport, historical);
    root.append(live, advanced);
    root.append(node('p', 'נשמר בדפדפן הזה בלבד. העדכון פועל בטעינת נתוני האתר, לא כשהאתר סגור. אין הבטחה לשיפור או לזכייה.', { class: 'learning-footnote' }));
    function selectTab(tab) { selectedTab = tab; updateControls(); }
    [liveTab, historicalTab].forEach((tab, i, all) => {
      tab.addEventListener('click', () => selectTab(i ? 'historical' : 'live'));
      tab.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - i;
        if (all[next].disabled) return;
        all[next].focus(); selectTab(next ? 'historical' : 'live');
      });
    });
    function canonicalReady() { return view.sourceState?.status === 'ready' && view.sourceState.kind === 'canonical'; }
    function updateControls() {
      if (unmounted) return;
      const state = view.stored; const source = view.sourceState || {};
      const running = busy || !!view.progress || view.pendingReplay?.status === 'running';
      const unavailable = !controller || typeof runtime.Worker !== 'function' || !state || state.compatibility !== 'compatible'
        || /^(STORAGE_|INCOMPATIBLE_STORE)/.test(view.error?.code || '');
      const prohibited = unavailable || !!imported;
      update.disabled = prohibited || running || (!loadSource && !canonicalReady());
      restart.disabled = prohibited || running || !state?.experiment || (!loadSource && !canonicalReady());
      archivesButton.disabled = unavailable || running || !controller?.readArchives;
      update.textContent = state?.experiment ? 'טען NUMBERS ועדכן טופס' : 'טען NUMBERS וצור טופס ראשון';
      start.disabled = prohibited || running || !canonicalReady() || source.rowCount < 700 || !!state?.experiment;
      pause.textContent = state?.experiment?.status === 'paused' ? 'המשך ניסוי' : 'השהה יצירת טפסים';
      pause.disabled = prohibited || running || !state?.experiment || state.experiment.status === 'conflict';
      replay.disabled = prohibited || running || source.status !== 'ready' || source.rowCount < 900;
      refresh.disabled = prohibited || running || !canonicalReady() || !state?.experiment || state.experiment.status === 'conflict';
      cancel.disabled = !controller || !running; exportButton.disabled = !state && !imported;
      cancel.hidden = !running;
      if (running) primary.append(cancel); else actions.append(cancel);
      importInput.disabled = running; exitImport.hidden = !imported;
      historicalTab.disabled = !!imported;
      start.hidden = pause.hidden = refresh.hidden = selectedTab !== 'live'; replay.hidden = selectedTab !== 'historical';
      live.hidden = selectedTab !== 'live'; historical.hidden = selectedTab !== 'historical';
      [liveTab, historicalTab].forEach((tab, i) => {
        const selected = (i ? 'historical' : 'live') === selectedTab;
        tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1;
      });
      sourceLabel.textContent = source.status === 'ready'
        ? `הגרלה אחרונה בנתונים: #${source.latestDraw} • ${source.rowCount} הגרלות` + (source.kind === 'manual' ? ' • קובץ ידני — סימולציה בלבד' : ' • NUMBERS מהאתר')
        : source.status === 'loading' ? 'טוען את נתוני האתר…' : 'לחצו על טען NUMBERS לקבלת הנתונים המעודכנים שפורסמו באתר.';
      sourceDigest.textContent = source.digest ? 'Digest: ' + source.digest : '';
      sourceTechnical.hidden = !source.digest;
      const progress = view.progress;
      const error = localError || (view.error ? `${view.error.code} — ${view.error.message}` : '');
      status.textContent = error || (running ? `חישוב בתהליך${progress ? ` • ${progress.phase} • ${progress.completed ?? 0}/${progress.total ?? '—'}` : ''}`
        : imported ? (imported.archive ? 'מעקב קודם מהארכיון — לקריאה בלבד; המעקב הפעיל לא השתנה.' : 'גיבוי לקריאה בלבד — מקור ונתוני זכייה לא מאומתים; לא משנים את המעקב המקומי.')
          : unavailable ? 'הניסוי אינו זמין לכתיבה. הנתונים הקיימים נשמרים לקריאה בלבד.'
            : state?.experiment?.status === 'conflict' ? 'סתירה בנתונים — יצירת טפסים נעצרה.'
              : state?.experiment ? (state.experiment.status === 'paused' ? 'יצירת טפסים מושהית; מעקב אחר תוצאות נמשך.' : 'הטופס נשמר מקומית.')
                : 'לחיצה על הכפתור תטען את ההיסטוריה ותיצור טופס ראשון של 14 שורות.');
    }
    async function run(action) {
      const serial = ++actionSerial; busy = true; localError = ''; updateControls();
      try { await action(); }
      catch (error) { if (serial === actionSerial) localError = `${error.code || 'LEARNING_UI_ERROR'} — הפעולה לא הושלמה.`; }
      finally { if (!unmounted && serial === actionSerial) { busy = false; render(controller.readView()); } }
    }
    function meta(parent, snapshot, experiment, decisions = []) {
      const box = node('div', null, { class: 'learning-meta' });
      const lastDecision = decisions.filter(d => d.cutoff <= snapshot.anchor).at(-1);
      const nextReview = experiment ? experiment.originAnchor + (Math.floor((snapshot.anchor - experiment.originAnchor) / 20) + 1) * 20 + 1 : null;
      function fields(parentNode, entries) {
        const line = node('p');
        entries.forEach(([label, value], index) => {
          if (index) line.append(document.createTextNode(' • '));
          line.append(document.createTextNode(label + ': '), node('bdi', value, { dir: 'ltr' }));
        });
        parentNode.append(line);
      }
      fields(box, [['עוגן', snapshot.anchor], ['יעד', snapshot.target]]);
      const created = new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', dateStyle: 'short', timeStyle: 'short' }).format(new Date(snapshot.createdAt));
      fields(box, [['נוצר', created], ['אזור זמן', 'Asia/Jerusalem']]);
      fields(box, [['מדיניות, חלון', snapshot.window], ['סקירת מדיניות הבאה, יעד', nextReview ?? '—']]);
      box.append(node('p', 'מקור שמור: ' + (snapshot.source.kind === 'canonical' ? 'קובץ התוצאות הראשי של האתר' : 'קובץ ידני')));
      const technical = node('details', null, { 'data-learning-key': `technical-${snapshot.target}` });
      technical.append(node('summary', 'פרטים טכניים'));
      for (const [label, value] of [['זמן יצירה UTC', snapshot.createdAt], ['סוג מקור', snapshot.source.kind], ['כתובת המקור', snapshot.source.url ?? '—'],
        ['נטען UTC', snapshot.source.fetchedAt], ['Digest', snapshot.source.digest],
        ['גרסת פרוטוקול', snapshot.protocolVersion], ['גרסת ליבה', snapshot.coreVersion], ['Seed', snapshot.seedHex]]) fields(technical, [[label, value]]);
      if (lastDecision) {
        technical.append(node('p', 'בחירת מדיניות: 3+ מתוך 200 יעדים קודמים (חלון → מספר יעדים עם פגיעה)'));
        technical.append(node('p', [100, 200, 500].map(window => `${window} → ${lastDecision.counts[window]}`).join(' | '), { dir: 'ltr' }));
      }
      box.append(technical);
      parent.append(box);
    }
    function lineTable(lines, score, winnings, active, simple = false, draw = null) {
      const wrapper = node('div', null, { class: 'learning-table-scroll', tabindex: '0', role: 'region', 'aria-label': 'שורות הטופס' });
      const table = node('table'); const head = node('thead'); const row = node('tr');
      ['שורה', 'מספרים', 'חזק', ...(!simple ? ['שיטה'] : []), ...(score ? ['פגיעות', ...(!simple ? ['חזק תואם'] : [])] : []), ...(simple || winnings !== undefined ? ['זכייה'] : [])].forEach(title => row.append(node('th', title, { scope: 'col' })));
      head.append(row); const body = node('tbody');
      lines.forEach((line, index) => {
        const tr = node('tr', null, active ? { 'data-learning-active-line': '' } : {});
        const result = score?.rows.find(item => item.comboNum === line.comboNum);
        const prize = winnings?.lines[index];
        const amount = simple && winnings === undefined ? 'ממתין לתוצאה'
          : !prize || prize.status === 'unavailable' ? (simple ? 'ממתין לנתוני פרסים' : 'לא זמין') : prize.status === 'no-prize' ? money(0) : money(prize.prizeIls);
        if (simple) {
          tr.append(node('td', line.comboNum));
          const numbers = node('td'); const balls = node('div', null, { class: 'learning-numbers', dir: 'rtl' });
          line.numbers.forEach(number => balls.append(node('span', number, {
            class: 'learning-number' + (draw?.numbers.includes(number) ? ' learning-hit' : '') })));
          numbers.append(balls); tr.append(numbers);
          const strong = node('td'); strong.append(node('span', line.strong, { class: 'learning-number learning-strong' + (result?.strongMatch ? ' learning-hit' : '') }));
          tr.append(strong);
          if (score) tr.append(node('td', `${result?.regularMatches ?? '—'}/6${result?.strongMatch ? ' + חזק' : ''}`));
          tr.append(node('td', amount, { class: 'learning-row-prize' }));
          if (prize?.status === 'won') tr.classList.add('learning-winning-row');
          body.append(tr); return;
        }
        [line.comboNum, line.numbers.join(', '), line.strong, line.strategy,
          ...(score ? [result?.regularMatches ?? '—', result?.strongMatch ? 'כן' : 'לא'] : []),
          ...(winnings !== undefined ? [amount] : [])].forEach(text => tr.append(node('td', text)));
        body.append(tr);
      });
      table.append(head, body); wrapper.append(table); return wrapper;
    }
    function armTables(parent, snapshot, observation, prize, active = false, simple = false, experiment = null, decisions = []) {
      const comparisons = simple ? node('details', null, { 'data-learning-key': `comparisons-${snapshot.target}` }) : null;
      if (comparisons) comparisons.append(node('summary', 'פרטי השיטה וטפסי השוואה'));
      Object.entries(armNames).forEach(([arm, label]) => {
        const target = arm === 'learner' ? node('section') : node('details');
        if (!simple || arm !== 'learner') target.append(node(arm === 'learner' ? 'h4' : 'summary', label));
        const distinct = new Set(snapshot.arms[arm].map(line => line.numbers.slice().sort((a, b) => a - b).join(','))).size;
        const distinctLabel = node('p', `${label} — שישיות שונות: ${distinct} מתוך ${snapshot.arms[arm].length}`, { 'data-learning-distinct': arm });
        (simple && arm === 'learner' ? comparisons : target).append(distinctLabel);
        if (observation && (!simple || arm !== 'learner')) target.append(node('p', 'סך ליעד: ' + (prize?.arms[arm]?.status === 'available' ? money(prize.arms[arm].totalPrizeIls) : 'לא זמין')));
        target.append(lineTable(snapshot.arms[arm], observation?.scores?.[arm], observation ? prize?.arms[arm] || null : undefined, active && arm === 'learner', simple && arm === 'learner', observation?.draw));
        (simple && arm !== 'learner' ? comparisons : parent).append(target);
      });
      if (comparisons) { meta(comparisons, snapshot, experiment, decisions); parent.append(comparisons); }
    }
    function summary(parent, report) {
      if (!report) return;
      parent.append(node('h3', 'סיכום תוצאות — ' + (report.mode === 'live' ? 'מעקב מקומי' : 'תיאורי בלבד')));
      const count = node('p', 'הגרלות במעקב: '); count.append(node('span', report.targetCount, { 'data-learning-history-count': '' })); parent.append(count);
      parent.append(node('p', `החרגות: באותו יום או מאוחר ${report.exclusions['same-day-or-late']} • חסר ${report.exclusions.missing} • סתירה ${report.exclusions.conflict}`));
      const grid = node('div', null, { class: 'learning-summary-grid' });
      Object.entries(armNames).forEach(([arm, label]) => {
        const data = report.arms[arm]; const secondary = data.secondary; const prizes = report.prizes[arm];
        const card = node('section', null, { class: 'learning-summary-arm' });
        const primary = node('p'); primary.append(node('bdi', `3+: ${data.winCount}/${data.sampleCount} (${rate(data.rate)})`, { dir: 'ltr' }));
        const secondaryLine = node('p');
        [`4+: ${secondary.win4PlusCount} (${rate(secondary.win4PlusRate)})`, `5+: ${secondary.win5PlusCount} (${rate(secondary.win5PlusRate)})`, `6: ${secondary.win6Count} (${rate(secondary.win6Rate)})`].forEach((value, index) => {
          if (index) secondaryLine.append(document.createTextNode(' • '));
          secondaryLine.append(node('bdi', value, { dir: 'ltr' }));
        });
        card.append(node('h4', label), primary, secondaryLine,
          node('p', `שורות עם חזק תואם: ${secondary.strongMatchCount}`),
          node('p', `סכום זכייה ידוע: ${money(prizes.knownPrizeIls)} • יעדים חסרים: ${prizes.missingCount}`, { 'data-learning-prize-total': arm }));
        grid.append(card);
      });
      parent.append(grid);
      function difference(arm, value, label, attrs) {
        const line = node('p', `${label} — לומד פחות ${armNames[arm]}: `, attrs);
        if (value == null) line.append(document.createTextNode('לא זמין'));
        else line.append(node('bdi', (value * 100).toFixed(1), { dir: 'ltr' }), document.createTextNode(' נקודות אחוז'));
        return line;
      }
      for (const arm of ['legacy', 'random']) {
        parent.append(difference(arm, report.paired[arm].meanDifference, 'הפרש שיעור 3+', { 'data-learning-paired': arm }));
      }
      report.blocks.forEach(block => {
        const section = node('section', null, { 'data-learning-block': block.k, class: 'learning-evidence-block' });
        section.append(node('p', `בלוק ${block.k}: ${evidenceNames[block.status]} • ${block.eligibleCount}/${block.n} כשירים`));
        if (report.mode === 'live' && ['legacy', 'random'].every(arm => block.paired[arm].lowerBound != null)) {
          for (const arm of ['legacy', 'random']) section.append(difference(arm, block.paired[arm].lowerBound,
            'גבול תחתון להפרש', { 'data-learning-evidence-bound': arm }));
          const method = node('div', null, { 'data-learning-evidence-method': '' });
          const alpha = node('p', 'שיטה: Hoeffding שמרני, תיקון לשתי ביקורות ולבלוקים חוזרים. ');
          alpha.append(node('bdi', `k = ${block.k}; n = ${block.n}; alpha = ${block.alpha}`, { dir: 'ltr' }));
          method.append(alpha, node('p', 'D = winLearner - winBenchmark; alpha = 0.05 / (2 * k * (k + 1))', { dir: 'ltr' }),
            node('p', 'lowerBound = max(-1, mean(D) - sqrt(2 * ln(1 / alpha) / 200))', { dir: 'ltr' }),
            node('p', 'הגבולות מוצגים בנקודות אחוז, בהנחת הגרלות עצמאיות; מתייחסים לבלוק זה בלבד ואינם מבטיחים יתרון בעתיד.'));
          section.append(method);
        }
        parent.append(section);
      });
      if (report.mode === 'readonly-import') parent.append(node('p', 'גיבוי לא מאומת: מקור ופרסים לא מאומתים; בדיקת digest היא תחבירית בלבד.'));
    }
    function renderLive(state, report, opened) {
      if (imported) live.append(node('p', imported.archive ? 'ארכיון מעקב קודם — לקריאה בלבד' : 'גיבוי לקריאה בלבד', { 'data-learning-import': 'true', class: 'learning-disclaimer' }));
      if (!state || state.compatibility !== 'compatible') {
        live.append(node('p', 'אין נתונים תואמים להצגה. גיבוי קיים אינו נמחק או משוחזר אוטומטית.')); return;
      }
      const current = state.snapshots.at(-1);
      const observations = new Map(state.observations.map(item => [item.target, item]));
      const currentObservation = current && observations.get(current.target);
      if (current && !currentObservation) {
        const card = node('section', null, { 'data-learning-saved': 'true', 'data-learning-snapshot-id': `${current.experimentId}:${current.target}` });
        card.append(node('h3', `הטופס להגרלה #${current.target} — 14 שורות`));
        card.append(node('p', `ממתין לתוצאה • מבוסס על הגרלות עד #${current.anchor}`, { class: 'learning-draw-status' }));
        armTables(card, current, null, null, true, true, state.experiment, state.decisions); live.append(card);
      } else live.append(node('p', current ? 'אין כרגע טופס ממתין. טענו תוצאות להמשך המעקב.' : 'עדיין אין טופס. לחצו על טען NUMBERS וצור טופס ראשון.'));
      const latest = state.observations.slice().reverse().find(item => state.snapshots.some(s => s.target === item.target));
      if (latest) {
        const snapshot = state.snapshots.find(s => s.target === latest.target);
        const prize = state.prizes.find(p => p.target === latest.target);
        const card = node('section', null, { 'data-learning-latest-result': '', class: 'learning-result-card',
          ...(!current || currentObservation ? { 'data-learning-saved': 'true', 'data-learning-snapshot-id': `${snapshot.experimentId}:${snapshot.target}` } : {}) });
        card.append(node('h3', `תוצאת הטופס האחרון — הגרלה #${latest.target}`), node('p', latest.draw.date));
        const total = node('p', null, { class: 'learning-result-total', 'data-learning-result-total': '' });
        total.append(document.createTextNode('סכום זכייה: '), node('bdi', prize?.arms.learner?.status === 'available' ? money(prize.arms.learner.totalPrizeIls) : 'ממתין לנתוני פרסים'));
        card.append(total, node('p', 'חישוב לטופס וירטואלי בלוטו רגיל — אינו אישור תשלום.'));
        if (latest.kind !== 'eligible') card.append(node('p', kindNames[latest.kind], { class: 'learning-draw-status' }));
        armTables(card, snapshot, latest, prize, false, true, state.experiment, state.decisions); live.append(card);
      }
      summary(advancedReport, report);
      live.append(node('h3', 'היסטוריית הטפסים'));
      for (let target = state.experiment?.lastProcessedDraw ?? 0; target > (state.experiment?.originAnchor ?? 0); target--) {
        const observation = observations.get(target); const snapshot = state.snapshots.find(s => s.target === target);
        const prize = state.prizes.find(p => p.target === target);
        const details = node('details', null, { 'data-learning-history-target': target, 'data-learning-key': `history-${target}` });
        const heading = node('summary');
        heading.append(node('bdi', target, { dir: 'ltr' }), document.createTextNode(' • '),
          node('bdi', observation?.draw?.date ?? '', { dir: 'ltr' }), document.createTextNode(` • ${kindNames[observation?.kind || 'missing']}`));
        const totals = node('span', null, { class: 'learning-history-totals' });
        Object.entries({ learner: 'זכייה' }).forEach(([arm, label]) => {
          const total = node('span', label + ': ');
          const winnings = prize?.arms[arm];
          if (winnings?.status === 'available') total.append(node('bdi', money(winnings.totalPrizeIls), { dir: 'ltr' }));
          else total.append(document.createTextNode(snapshot ? 'ממתין לנתוני פרסים' : 'אין טופס שמור'));
          totals.append(total);
        });
        heading.append(totals); details.append(heading);
        let built = false;
        const build = () => {
          if (built) return; built = true;
          if (!snapshot) { details.append(node('p', 'טופס חסר — אין שורות שמורות ליעד זה.')); return; }
          armTables(details, snapshot, observation || { scores: null }, prize, false, true, state.experiment, state.decisions);
        };
        details.addEventListener('toggle', () => { if (details.open) build(); });
        // Build only opened targets, including previously expanded entries on rerender.
        if (opened.has(`history-${target}`)) { details.open = true; build(); }
        live.append(details);
      }
    }
    function render(next) {
      if (unmounted) return;
      view = next || {};
      const state = imported ? imported.state : view.stored;
      // Progress/source emissions must not replace tables, expanded history or the focused node.
      // Do not serialize opaque rawBackup: newer schemas can contain BigInt/cyclic structured data.
      const key = `${imported ? 'import-' + importSerial : 'local'}:${state?.revision}:${state?.compatibility}:${view.mode}:${view.pendingReplay?.digest || ''}`;
      if (key !== contentKey) {
        contentKey = key;
        const opened = new Set(Array.from(root.querySelectorAll('details[open][data-learning-key]'), item => item.dataset.learningKey));
        const focusedKey = document.activeElement?.closest('[data-learning-key]')?.dataset.learningKey;
        live.replaceChildren(); historical.replaceChildren(); advancedReport.replaceChildren();
        const localReport = imported ? imported.report : state?.compatibility === 'compatible'
          ? (view.mode === 'live' ? view.report : reportAPI.summarizeExperiment(state)) : null;
        renderLive(state, localReport, opened);
        historical.append(node('p', 'סימולציה תיאורית על 200 יעדים קודמים; אינה מעקב עתידי ואינה יוצרת טפסים שמורים.'));
        if (view.mode === 'historical' && view.report) summary(historical, view.report);
        else historical.append(node('p', 'טרם הושלמה בדיקה היסטורית למקור הנוכחי.'));
        root.querySelectorAll('[data-learning-key]').forEach(item => {
          if (opened.has(item.dataset.learningKey)) item.open = true;
          if (item.dataset.learningKey === focusedKey) item.querySelector('summary')?.focus({ preventScroll: true });
        });
      }
      updateControls();
    }
    render(view);
    return { render, unmount() { unmounted = true; actionSerial++; if (sourceAborter) sourceAborter.abort(); root.replaceChildren(); } };
  }
  runtime.LottoLearningUI = { mount };
}(typeof self !== 'undefined' ? self : globalThis));
