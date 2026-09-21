(function attachLottoLearningFixture(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.LottoLearningFixture = api;
}(typeof self !== 'undefined' ? self : globalThis, function createLottoLearningFixture() {
  'use strict';

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

  return { buildLearningDraws, toLearningMatrix };
}));
