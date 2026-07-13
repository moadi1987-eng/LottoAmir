'use strict';

function buildSyntheticDraws(count) {
  const chronological = Array.from({ length: count }, (_, index) => {
    const numbers = Array.from({ length: 6 }, (_, offset) => ((index * 7 + offset * 5) % 37) + 1)
      .sort((a, b) => a - b);
    return {
      numbers,
      strong: (index % 7) + 1,
      drawNumber: 2233 + index,
      date: Date.UTC(2020, 0, 1) + index * 3 * 24 * 60 * 60 * 1000,
    };
  });
  return chronological.reverse();
}

function buildCandidate(index, source = 'main', windowSize = 200, strategyId = (index % 14) + 1) {
  const numbers = Array.from({ length: 6 }, (_, offset) => ((index + offset * 7) % 37) + 1)
    .sort((a, b) => a - b);
  return {
    comboNum: strategyId,
    strategy: `${source}-${strategyId}`,
    numbers,
    strong: (index % 7) + 1,
    source,
    strategyId,
    window: windowSize,
    identity: `${source}:${strategyId}:${windowSize}`,
  };
}

module.exports = { buildSyntheticDraws, buildCandidate };
