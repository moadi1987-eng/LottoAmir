(function attachLottoStrategyCore(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.LottoStrategyCore = api;
}(typeof self !== 'undefined' ? self : globalThis, function createLottoStrategyCore() {
  'use strict';

  const ALGORITHM_VERSION = 'lotto-backtest-v1';
  const CONSTRAINT_VERSION = 'forms-v1';
  const BACKTEST_WINDOWS = Object.freeze([100, 200, 500]);
  const REGULAR_POINTS = Object.freeze([0, 1, 3, 10, 35, 120, 400]);
  const FORM2_STRATEGY_LABELS = Object.freeze([
    'בשלים + תדירות', 'פריצת קור', 'מגמת עלייה מואצת', 'פער אופטימלי',
    'איזון פיזור', 'זוגות מאמצע הדירוג', 'שלישייה מובילה + קרים',
    'ממוצע נע', 'אנטי-אחרון', 'מספרים בשלים', 'תנודה בין חלונות',
    'חזרת מגמה', 'סינרגיה מלאה', 'ממוצע משוקלל',
  ]);

  function isValidDraw(draw) {
    if (!draw || !Array.isArray(draw.numbers) || draw.numbers.length !== 6) return false;
    const numbers = draw.numbers.map(Number);
    return numbers.every(number => Number.isInteger(number) && number >= 1 && number <= 37)
      && new Set(numbers).size === 6
      && Number.isInteger(Number(draw.strong))
      && Number(draw.strong) >= 1
      && Number(draw.strong) <= 8;
  }

  function cloneDraw(draw) {
    return {
      numbers: draw.numbers.map(Number).sort((a, b) => a - b),
      strong: Number(draw.strong),
      drawNumber: draw.drawNumber == null ? null : Number(draw.drawNumber),
      date: draw.date == null ? null : draw.date,
    };
  }

  function toChronological(newestFirstRows) {
    const rows = (newestFirstRows || []).filter(isValidDraw).map(cloneDraw);
    const allHaveDrawNumbers = rows.every(row => Number.isFinite(row.drawNumber));
    if (allHaveDrawNumbers) return rows.sort((a, b) => a.drawNumber - b.drawNumber);
    return rows.reverse();
  }

  function createCombo(values, strong, comboNum, strategy) {
    const numbers = values
      .map(value => Number(value && typeof value === 'object' ? value.number : value))
      .filter(number => Number.isInteger(number) && number >= 1 && number <= 37);
    return {
      comboNum,
      strategy,
      numbers: numbers.sort((a, b) => a - b).slice(0, 6),
      strong: Number(strong),
    };
  }

  function pickTop(values, count) {
    return Array.isArray(values) ? values.slice(0, Math.max(0, count)) : [];
  }

  function pickOffset(values, count, offset = 0) {
    if (!Array.isArray(values) || values.length === 0) return [];
    const start = Math.max(0, Math.min(offset, Math.max(0, values.length - count)));
    return values.slice(start, start + count);
  }

  function pickRandom(values, count) {
    return pickTop(values, count);
  }

  function analyzePairs(data) {
    const pairCounts = new Map();
    const maxRows = Math.min(data.length, 200);

    for (let rowIdx = 0; rowIdx < maxRows; rowIdx += 1) {
      const numbers = (data[rowIdx].numbers || [])
        .filter(number => !Number.isNaN(number) && number >= 1 && number <= 37);
      for (let first = 0; first < numbers.length; first += 1) {
        for (let second = first + 1; second < numbers.length; second += 1) {
          const key = numbers[first] < numbers[second]
            ? `${numbers[first]}-${numbers[second]}`
            : `${numbers[second]}-${numbers[first]}`;
          pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
        }
      }
    }

    return Array.from(pairCounts.entries())
      .map(([pair, count]) => ({
        pair,
        count,
        percentage: (count / maxRows * 100).toFixed(1),
      }))
      .sort((a, b) => b.count - a.count);
  }

  function analyzeTriplets(data) {
    const tripletCounts = new Map();
    const maxRows = Math.min(data.length, 100);

    for (let rowIdx = 0; rowIdx < maxRows; rowIdx += 1) {
      const numbers = (data[rowIdx].numbers || [])
        .filter(number => !Number.isNaN(number) && number >= 1 && number <= 37);
      for (let first = 0; first < numbers.length; first += 1) {
        for (let second = first + 1; second < numbers.length; second += 1) {
          for (let third = second + 1; third < numbers.length; third += 1) {
            const sorted = [numbers[first], numbers[second], numbers[third]].sort((a, b) => a - b);
            const key = `${sorted[0]}-${sorted[1]}-${sorted[2]}`;
            tripletCounts.set(key, (tripletCounts.get(key) || 0) + 1);
          }
        }
      }
    }

    return Array.from(tripletCounts.entries())
      .map(([triplet, count]) => ({
        triplet,
        count,
        percentage: (count / maxRows * 100).toFixed(1),
      }))
      .sort((a, b) => b.count - a.count);
  }

  function analyzeQuartets(data) {
    const quartetCounts = new Map();
    const maxRows = Math.min(data.length, 50);

    for (let rowIdx = 0; rowIdx < maxRows; rowIdx += 1) {
      const numbers = (data[rowIdx].numbers || [])
        .filter(number => !Number.isNaN(number) && number >= 1 && number <= 37);
      for (let first = 0; first < numbers.length; first += 1) {
        for (let second = first + 1; second < numbers.length; second += 1) {
          for (let third = second + 1; third < numbers.length; third += 1) {
            for (let fourth = third + 1; fourth < numbers.length; fourth += 1) {
              const sorted = [numbers[first], numbers[second], numbers[third], numbers[fourth]]
                .sort((a, b) => a - b);
              const key = `${sorted[0]}-${sorted[1]}-${sorted[2]}-${sorted[3]}`;
              quartetCounts.set(key, (quartetCounts.get(key) || 0) + 1);
            }
          }
        }
      }
    }

    return Array.from(quartetCounts.entries())
      .map(([quartet, count]) => ({
        quartet,
        count,
        percentage: (count / maxRows * 100).toFixed(1),
      }))
      .sort((a, b) => b.count - a.count);
  }

  function buildAnalysisSnapshot(newestFirstRows) {
    const data = (newestFirstRows || []).filter(isValidDraw).map(cloneDraw);
    const numberFreq = {};
    const strongFreq = {};
    for (let number = 1; number <= 37; number += 1) numberFreq[number] = 0;
    for (let number = 1; number <= 7; number += 1) strongFreq[number] = 0;

    data.forEach(row => {
      row.numbers.forEach(number => { numberFreq[number] += 1; });
      if (row.strong >= 1 && row.strong <= 7) strongFreq[row.strong] += 1;
    });

    const sortedNumbers = Object.entries(numberFreq)
      .map(([number, count]) => ({
        number: Number(number),
        count,
        percentage: data.length ? (count / data.length * 100).toFixed(1) : '0.0',
      }))
      .sort((a, b) => b.count - a.count);
    const sortedStrong = Object.entries(strongFreq)
      .map(([number, count]) => ({
        number: Number(number),
        count,
        percentage: data.length ? (count / data.length * 100).toFixed(1) : '0.0',
      }))
      .sort((a, b) => b.count - a.count);
    const third = Math.ceil(sortedNumbers.length / 3);
    const strongThird = Math.ceil(sortedStrong.length / 3);

    return {
      totalDraws: data.length,
      numbers: sortedNumbers,
      strong: sortedStrong,
      hot: sortedNumbers.slice(0, third),
      medium: sortedNumbers.slice(third, third * 2),
      cold: sortedNumbers.slice(third * 2),
      strongHot: sortedStrong.slice(0, strongThird),
      strongMedium: sortedStrong.slice(strongThird, strongThird * 2),
      strongCold: sortedStrong.slice(strongThird * 2),
      pairs: analyzePairs(data),
      triplets: analyzeTriplets(data),
      quartets: analyzeQuartets(data),
    };
  }

  function generateSlidingWindowCombo(rawData, strongHot, strongMedium, comboNum) {
    const windowSize = 50;
    const numTargets = Math.min(30, rawData.length - windowSize);
    if (numTargets <= 0 || rawData.length < windowSize + 1) {
      const fallbackNums = [];
      for (let index = 1; index <= 6; index += 1) fallbackNums.push({ number: index * 5 });
      return createCombo(fallbackNums, strongHot[0]?.number || 1, comboNum, '🧬 חיזוי חכם');
    }

    const breakthroughScores = {};
    const momentumScores = {};
    const cycleScores = {};
    const gapScores = {};
    const strongScores = {};
    for (let number = 1; number <= 37; number += 1) {
      breakthroughScores[number] = 0;
      momentumScores[number] = 0;
      cycleScores[number] = 0;
      gapScores[number] = 0;
    }
    for (let number = 1; number <= 7; number += 1) strongScores[number] = 0;

    const avgFreqPerNum = (windowSize * 6) / 37;
    for (let targetIdx = 0; targetIdx < numTargets; targetIdx += 1) {
      const targetRow = rawData[targetIdx];
      const targetNumbers = new Set();
      (targetRow.numbers || []).forEach(number => {
        if (!Number.isNaN(number) && number >= 1 && number <= 37) targetNumbers.add(number);
      });
      const windowFreq = {};
      const lastSeen = {};
      for (let offset = 1; offset <= windowSize && targetIdx + offset < rawData.length; offset += 1) {
        (rawData[targetIdx + offset].numbers || []).forEach(number => {
          if (!Number.isNaN(number) && number >= 1 && number <= 37) {
            windowFreq[number] = (windowFreq[number] || 0) + 1;
            if (!lastSeen[number]) lastSeen[number] = offset;
          }
        });
      }
      targetNumbers.forEach(number => {
        const frequency = windowFreq[number] || 0;
        const gap = lastSeen[number] || windowSize + 1;
        if (frequency < avgFreqPerNum * 0.5) breakthroughScores[number] += 4;
        if (frequency > avgFreqPerNum * 1.2) momentumScores[number] += 4;
        if (gap >= 5 && gap <= 15) cycleScores[number] += 3;
        if (gap >= 8 && gap <= 12) gapScores[number] += 2;
      });
      if (!Number.isNaN(targetRow.strong) && strongScores[targetRow.strong] != null) {
        strongScores[targetRow.strong] += 2;
      }
    }

    const currentWindowFreq = {};
    const currentLastSeen = {};
    for (let index = 0; index < Math.min(windowSize, rawData.length); index += 1) {
      (rawData[index].numbers || []).forEach(number => {
        if (!Number.isNaN(number) && number >= 1 && number <= 37) {
          currentWindowFreq[number] = (currentWindowFreq[number] || 0) + 1;
          if (!currentLastSeen[number]) currentLastSeen[number] = index + 1;
        }
      });
    }

    const finalScores = {};
    for (let number = 1; number <= 37; number += 1) {
      const currentFreq = currentWindowFreq[number] || 0;
      const currentGap = currentLastSeen[number] || 100;
      let score = 0;
      if (currentFreq < avgFreqPerNum * 0.6) {
        score += breakthroughScores[number] * 2.5;
        score += cycleScores[number] * 1.5;
      } else if (currentFreq > avgFreqPerNum * 1.3) {
        score += momentumScores[number] * 2.5;
        score += cycleScores[number] * 1.5;
      } else {
        score += breakthroughScores[number] * 1.5;
        score += momentumScores[number] * 1.5;
        score += cycleScores[number] * 2;
      }
      if (currentGap >= 5 && currentGap <= 15) score += gapScores[number] * 2;
      if (currentGap >= 8 && currentGap <= 15) score += 5;
      finalScores[number] = score;
    }
    const numbers = Object.entries(finalScores)
      .map(([number, score]) => ({ number: Number(number), score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);

    const currentStrongFreq = {};
    for (let index = 0; index < Math.min(windowSize, rawData.length); index += 1) {
      const strong = rawData[index].strong;
      if (!Number.isNaN(strong)) currentStrongFreq[strong] = (currentStrongFreq[strong] || 0) + 1;
    }
    let bestStrong = 1;
    let bestStrongScore = 0;
    for (let number = 1; number <= 7; number += 1) {
      const combined = (strongScores[number] || 0) * 2 + ((currentStrongFreq[number] || 0) < 5 ? 3 : 0);
      if (combined > bestStrongScore) {
        bestStrongScore = combined;
        bestStrong = number;
      }
    }
    return createCombo(numbers, bestStrong, comboNum, '🧬 חיזוי חכם (דפוסים)');
  }

  function generateSmartMixCombo(pairs, triplets, hot, strongHot, comboNum) {
    const result = new Set();
    if (pairs.length > 0) {
      (pairs[0]?.pair.split('-').map(Number) || []).forEach(number => result.add(number));
    }
    const triplet = triplets.length > 1 ? triplets[1] : triplets[0];
    if (triplet) (triplet.triplet || '').split('-').map(Number).forEach(number => result.add(number));
    let index = 0;
    while (result.size < 6 && index < hot.length) {
      result.add(hot[index].number);
      index += 1;
    }
    return createCombo([...result].slice(0, 6), strongHot[0]?.number || 1, comboNum, '🎯 זוג+שלישייה');
  }

  function generateDueNumbersCombo(mainStats, rawData, strongHot, strongMedium, comboNum) {
    const lastAppearance = {};
    rawData.forEach((row, index) => {
      (row.numbers || []).forEach(number => {
        if (!Number.isNaN(number) && number >= 1 && number <= 37 && lastAppearance[number] === undefined) {
          lastAppearance[number] = index;
        }
      });
    });
    const numbers = mainStats.slice(0, 20).map(stat => {
      const gap = lastAppearance[stat.number] || rawData.length;
      const gapBonus = gap >= 5 && gap <= 20 ? gap * 3 : gap;
      return { number: stat.number, score: stat.count + gapBonus, gap };
    }).sort((a, b) => b.score - a.score).slice(0, 6);

    const strongGaps = {};
    rawData.forEach((row, index) => {
      if (!Number.isNaN(row.strong) && strongGaps[row.strong] === undefined) strongGaps[row.strong] = index;
    });
    const dueStrong = [...strongHot, ...strongMedium].sort((a, b) => {
      const gapA = strongGaps[a.number] || 100;
      const gapB = strongGaps[b.number] || 100;
      return gapB - gapA;
    })[0];
    return createCombo(numbers, dueStrong?.number || 1, comboNum, '⏰ מספרים בשלים');
  }

  function generateDoubleTripletCombo(triplets, hot, strongHot, comboNum) {
    const result = new Set();
    if (triplets[0]) (triplets[0].triplet || '').split('-').map(Number).forEach(number => result.add(number));
    if (triplets[1]) (triplets[1].triplet || '').split('-').map(Number).forEach(number => result.add(number));
    let index = 0;
    while (result.size < 6 && index < hot.length) {
      result.add(hot[index].number);
      index += 1;
    }
    return createCombo([...result].slice(0, 6), strongHot[0]?.number || 1, comboNum, '🔗 2 שלישיות');
  }

  function generateTrendAnalysisCombo(mainStats, rawData, strongHot, comboNum) {
    const scores = {};
    for (let number = 1; number <= 37; number += 1) scores[number] = 0;
    const recentFreq = {};
    const previousFreq = {};
    rawData.slice(0, Math.min(20, rawData.length)).forEach(row => {
      (row.numbers || []).forEach(number => {
        if (!Number.isNaN(number) && number >= 1 && number <= 37) {
          recentFreq[number] = (recentFreq[number] || 0) + 1;
        }
      });
    });
    rawData.slice(20, Math.min(40, rawData.length)).forEach(row => {
      (row.numbers || []).forEach(number => {
        if (!Number.isNaN(number) && number >= 1 && number <= 37) {
          previousFreq[number] = (previousFreq[number] || 0) + 1;
        }
      });
    });
    for (let number = 1; number <= 37; number += 1) {
      scores[number] += ((recentFreq[number] || 0) - (previousFreq[number] || 0)) * 15;
    }
    const lastAppearance = {};
    rawData.forEach((row, index) => {
      (row.numbers || []).forEach(number => {
        if (!Number.isNaN(number) && number >= 1 && number <= 37 && lastAppearance[number] === undefined) {
          lastAppearance[number] = index;
        }
      });
    });
    for (let number = 1; number <= 37; number += 1) {
      const gap = lastAppearance[number] || rawData.length;
      if (gap >= 10 && gap <= 25) scores[number] += 10;
    }
    mainStats.forEach((stat, index) => { scores[stat.number] += Math.max(0, 20 - index); });
    rawData.slice(0, Math.min(5, rawData.length)).forEach(row => {
      (row.numbers || []).forEach(number => {
        if (!Number.isNaN(number)) scores[number] = (scores[number] || 0) + 8;
      });
    });
    const numbers = Object.entries(scores)
      .map(([number, score]) => ({ number: Number(number), score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
    return createCombo(numbers, strongHot[0]?.number || 1, comboNum, '📈 ניתוח מגמות');
  }

  function generateUnpredictableCombo(
    hot,
    medium,
    cold,
    pairs,
    triplets,
    strongHot,
    strongMedium,
    strongCold,
    rawData,
    comboNum,
  ) {
    const result = new Set();
    if (pairs[0]) (pairs[0].pair || '').split('-').map(Number).forEach(number => result.add(number));
    const triplet = triplets.length > 1 ? triplets[1] : triplets[0];
    if (triplet) (triplet.triplet || '').split('-').map(Number).slice(0, 2).forEach(number => result.add(number));
    const fillOrder = [...hot.slice(0, 3), ...medium.slice(0, 2), ...cold.slice(0, 2)];
    for (const item of fillOrder) {
      if (result.size >= 6) break;
      result.add(item.number);
    }
    const lastStrong = rawData.length ? rawData[0].strong : null;
    const allStrong = [...strongHot, ...strongMedium, ...strongCold];
    const differentStrong = allStrong.filter(item => item.number !== lastStrong);
    const strong = differentStrong[0]?.number || allStrong[0]?.number || 1;
    return createCombo([...result].slice(0, 6), strong, comboNum, '🎲 בלתי צפוי (חזק ≠ אחרון)');
  }

  function generateQuartetTripletOverlapCombo(quartets, triplets, hot, strongHot, comboNum) {
    const result = new Set();
    const topQuartet = quartets[0]?.quartet.split('-').map(Number) || [];
    const topTriplet = triplets[0]?.triplet.split('-').map(Number) || [];
    topQuartet.forEach(number => result.add(number));
    topTriplet.forEach(number => result.add(number));
    const overlap = topQuartet.filter(number => topTriplet.includes(number));
    if (result.size > 6) {
      const final = [...overlap, ...[...result].filter(number => !overlap.includes(number))].slice(0, 6);
      result.clear();
      final.forEach(number => result.add(number));
    }
    let index = 1;
    while (result.size < 6 && index < Math.min(5, quartets.length)) {
      (quartets[index]?.quartet.split('-').map(Number) || []).forEach(number => {
        if (result.size < 6) result.add(number);
      });
      index += 1;
    }
    while (result.size < 6 && hot.length > 0) {
      const hotNumber = hot[result.size % hot.length]?.number;
      if (hotNumber && !result.has(hotNumber)) result.add(hotNumber);
      else break;
    }
    return createCombo([...result].slice(0, 6), strongHot[0]?.number || 1, comboNum, '🔗 רביעיות+שלישיות (חפיפה)');
  }

  function generateAICombo(hot, medium, cold, strongHot, mainStats, rawData, comboNum, strategy) {
    const scores = {};
    mainStats.forEach(stat => { scores[stat.number] = stat.count * 2; });
    rawData.slice(0, Math.min(5, rawData.length)).forEach(row => {
      (row.numbers || []).forEach(number => {
        if (!Number.isNaN(number)) scores[number] = (scores[number] || 0) + 5;
      });
    });
    const numbers = Object.entries(scores)
      .map(([number, score]) => ({ number: Number(number), score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
    return createCombo(numbers, pickRandom(strongHot, 1)[0]?.number || 1, comboNum, strategy);
  }

  function generateMainCandidates(snapshot, rawData) {
    const {
      hot,
      medium,
      cold,
      strongHot,
      strongMedium,
      strongCold,
      pairs,
      numbers: mainStats,
      triplets,
      quartets,
    } = snapshot;
    const combos = [];
    const limitedRawData = rawData.slice(0, Math.min(100, rawData.length));
    combos.push(createCombo(
      [...pickRandom(hot, 2), ...pickRandom(medium, 2), ...pickRandom(cold, 2)],
      pickRandom(strongHot, 1)[0]?.number || 1,
      1,
      '⚖️ מאוזן',
    ));
    combos.push(createCombo(
      [...pickRandom(hot, 4), ...pickRandom(medium, 1), ...pickRandom(cold, 1)],
      pickRandom(strongHot, 1)[0]?.number || 2,
      2,
      '🔥 מיקוד חם',
    ));
    const topPair = pairs[0]?.pair.split('-').map(Number) || [];
    const pairNumbers = topPair.length >= 2 ? topPair : pickRandom(hot, 2).map(item => item.number);
    const remaining = [...pickRandom(hot, 2), ...pickRandom(medium, 2)]
      .map(item => item.number)
      .filter(number => !pairNumbers.includes(number))
      .slice(0, 4);
    combos.push(createCombo([...pairNumbers, ...remaining], pickRandom(strongHot, 1)[0]?.number || 3, 3, '🤝 מבוסס זוגות'));
    combos.push(generateSmartMixCombo(pairs, triplets, hot, strongHot, 4));
    combos.push(generateDueNumbersCombo(mainStats, limitedRawData, strongHot, strongMedium, 5));
    combos.push(createCombo(pickRandom(mainStats.slice(0, 10), 6), pickRandom(strongHot, 1)[0]?.number || 6, 6, '⭐ 10 המובילים'));
    combos.push(generateDoubleTripletCombo(triplets, hot, strongHot, 7));
    combos.push(createCombo(
      [...pickRandom(hot, 3), ...pickRandom(cold, 3)],
      pickRandom(strongCold, 1)[0]?.number || 7,
      8,
      '🔥❄️ חם+קר (חזק קר)',
    ));
    combos.push(generateUnpredictableCombo(
      hot,
      medium,
      cold,
      pairs,
      triplets,
      strongHot,
      strongMedium,
      strongCold,
      limitedRawData,
      9,
    ));
    combos.push(generateTrendAnalysisCombo(mainStats, limitedRawData, strongHot, 10));
    combos.push(generateSlidingWindowCombo(rawData, strongHot, strongMedium, 11));
    combos.push(generateQuartetTripletOverlapCombo(quartets, triplets, hot, strongHot, 12));
    combos.push(generateAICombo(hot, medium, cold, strongHot, mainStats, limitedRawData, 13, '🧠 חיזוי AI'));
    const goldenTriplet = triplets[0]?.triplet.split('-').map(Number) || [];
    const goldenPair = pairs[0]?.pair.split('-').map(Number) || [];
    const goldenNumbers = [...new Set([...goldenTriplet, ...goldenPair])];
    let hotIndex = 0;
    while (goldenNumbers.length < 6 && hotIndex < hot.length) {
      const hotNumber = hot[hotIndex]?.number;
      if (hotNumber && !goldenNumbers.includes(hotNumber)) goldenNumbers.push(hotNumber);
      hotIndex += 1;
    }
    combos.push(createCombo(
      goldenNumbers.slice(0, 6),
      pickRandom(strongHot, 1)[0]?.number || 7,
      14,
      '🔮 נוסחת הזהב',
    ));
    return combos;
  }

  function normalizeForm2Numbers(values, candidatePriority) {
    const result = [];
    const seen = new Set();
    const addValue = value => {
      const raw = value && typeof value === 'object' ? value.number : value;
      const number = Number.parseInt(raw, 10);
      if (number >= 1 && number <= 37 && !seen.has(number)) {
        seen.add(number);
        result.push(number);
      }
    };
    (values || []).forEach(addValue);
    (candidatePriority || []).forEach(addValue);
    for (let number = 1; number <= 37 && result.length < 6; number += 1) addValue(number);
    return result.slice(0, 6).sort((a, b) => a - b);
  }

  function getCombinationKey(numbers) {
    return (numbers || []).slice().sort((a, b) => a - b).join('-');
  }

  function getOverlap(firstNumbers, secondNumbers) {
    const second = new Set(secondNumbers || []);
    return (firstNumbers || []).filter(number => second.has(number)).length;
  }

  function getNumberSelections(values, count) {
    if (count === 0) return [[]];
    const selections = [];
    function visit(start, selected) {
      if (selected.length === count) {
        selections.push(selected.slice());
        return;
      }
      const remaining = count - selected.length;
      for (let index = start; index <= values.length - remaining; index += 1) {
        selected.push(values[index]);
        visit(index + 1, selected);
        selected.pop();
      }
    }
    visit(0, []);
    return selections;
  }

  function buildForm2CandidatePriority(mainStats, hot, medium, cold) {
    const priority = [];
    const seen = new Set();
    const add = item => {
      const number = Number.parseInt(item && typeof item === 'object' ? item.number : item, 10);
      if (number >= 1 && number <= 37 && !seen.has(number)) {
        seen.add(number);
        priority.push(number);
      }
    };
    (mainStats || []).forEach(add);
    (hot || []).forEach(add);
    (medium || []).forEach(add);
    (cold || []).forEach(add);
    for (let number = 1; number <= 37; number += 1) add(number);
    return priority;
  }

  function findForm2FallbackCombination(priority, accepted, exposure, covered, targetCoverage, options) {
    const acceptedKeys = new Set(accepted.map(combo => getCombinationKey(combo.numbers)));
    const ordered = priority.slice().sort((a, b) => {
      const aCovered = covered.has(a) ? 1 : 0;
      const bCovered = covered.has(b) ? 1 : 0;
      if (aCovered !== bCovered) return aCovered - bCovered;
      if ((exposure[a] || 0) !== (exposure[b] || 0)) return (exposure[a] || 0) - (exposure[b] || 0);
      return priority.indexOf(a) - priority.indexOf(b);
    });
    let found = null;
    function search(start, selected, newCount) {
      if (found) return;
      if (selected.length === 6) {
        const numbers = selected.slice().sort((a, b) => a - b);
        if (covered.size + newCount < targetCoverage) return;
        if (acceptedKeys.has(getCombinationKey(numbers))) return;
        found = numbers;
        return;
      }
      const remaining = 6 - selected.length;
      for (let index = start; index <= ordered.length - remaining; index += 1) {
        const number = ordered[index];
        if ((exposure[number] || 0) >= options.maximumExposure) continue;
        const overlapsTooMuch = accepted.some(combo => {
          const previous = new Set(combo.numbers || []);
          let overlap = selected.filter(value => previous.has(value)).length;
          if (previous.has(number)) overlap += 1;
          return overlap > options.maximumOverlap;
        });
        if (overlapsTooMuch) continue;
        selected.push(number);
        search(index + 1, selected, newCount + (covered.has(number) ? 0 : 1));
        selected.pop();
        if (found) return;
      }
    }
    search(0, [], 0);
    return found;
  }

  function diversifyForm2Combinations(combos, candidatePriority, options) {
    const settings = Object.assign({
      minimumCoverage: 30,
      maximumExposure: 7,
      maximumOverlap: 4,
    }, options || {});
    const priority = buildForm2CandidatePriority(candidatePriority, [], [], []);
    const priorityIndex = new Map(priority.map((number, index) => [number, index]));
    const accepted = [];
    const acceptedKeys = new Set();
    const exposure = {};
    const covered = new Set();
    const total = (combos || []).length;

    (combos || []).forEach((baseCombo, comboIndex) => {
      const baseNumbers = normalizeForm2Numbers(baseCombo.numbers, priority);
      const baseSet = new Set(baseNumbers);
      const replacements = priority.filter(number => !baseSet.has(number));
      const targetCoverage = Math.min(
        settings.minimumCoverage,
        Math.ceil(settings.minimumCoverage * (comboIndex + 1) / Math.max(1, total)),
      );
      let chosen = null;
      for (let retainedCount = 6; retainedCount >= 3 && !chosen; retainedCount -= 1) {
        const keptSelections = getNumberSelections(baseNumbers, retainedCount);
        const replacementSelections = getNumberSelections(replacements, 6 - retainedCount);
        let best = null;
        keptSelections.forEach(kept => {
          replacementSelections.forEach(replacement => {
            const numbers = [...kept, ...replacement].sort((a, b) => a - b);
            const key = getCombinationKey(numbers);
            if (acceptedKeys.has(key)) return;
            if (numbers.some(number => (exposure[number] || 0) >= settings.maximumExposure)) return;
            if (accepted.some(combo => getOverlap(numbers, combo.numbers) > settings.maximumOverlap)) return;
            const newCount = numbers.filter(number => !covered.has(number)).length;
            if (covered.size + newCount < targetCoverage) return;
            const exposureSum = numbers.reduce((sum, number) => sum + (exposure[number] || 0), 0);
            const prioritySum = numbers.reduce((sum, number) => sum + (priorityIndex.get(number) || 0), 0);
            const score = { numbers, key, newCount, exposureSum, prioritySum };
            const isBetter = !best
              || score.newCount > best.newCount
              || (score.newCount === best.newCount && score.exposureSum < best.exposureSum)
              || (score.newCount === best.newCount && score.exposureSum === best.exposureSum
                && score.prioritySum < best.prioritySum)
              || (score.newCount === best.newCount && score.exposureSum === best.exposureSum
                && score.prioritySum === best.prioritySum && score.key < best.key);
            if (isBetter) best = score;
          });
        });
        if (best) chosen = best.numbers;
      }
      if (!chosen) {
        chosen = findForm2FallbackCombination(priority, accepted, exposure, covered, targetCoverage, settings);
      }
      if (!chosen) throw new Error('Unable to create 14 distinct combinations for form 2.');
      const finalCombo = Object.assign({}, baseCombo, { numbers: chosen });
      accepted.push(finalCombo);
      acceptedKeys.add(getCombinationKey(chosen));
      chosen.forEach(number => {
        exposure[number] = (exposure[number] || 0) + 1;
        covered.add(number);
      });
    });
    return accepted;
  }

  function getFormDiversityMetrics(combos) {
    const combinationKeys = new Set();
    const covered = new Set();
    const exposure = {};
    const strongCounts = {};
    for (let number = 1; number <= 7; number += 1) strongCounts[number] = 0;
    let maximumOverlap = 0;
    (combos || []).forEach(combo => {
      const numbers = normalizeForm2Numbers(combo.numbers, []);
      combinationKeys.add(getCombinationKey(numbers));
      numbers.forEach(number => {
        covered.add(number);
        exposure[number] = (exposure[number] || 0) + 1;
      });
      const strong = Number.parseInt(combo.strong, 10);
      if (strong >= 1 && strong <= 7) strongCounts[strong] += 1;
    });
    for (let first = 0; first < (combos || []).length; first += 1) {
      for (let second = first + 1; second < combos.length; second += 1) {
        maximumOverlap = Math.max(maximumOverlap, getOverlap(combos[first].numbers, combos[second].numbers));
      }
    }
    return {
      combinationCount: (combos || []).length,
      uniqueCombinationCount: combinationKeys.size,
      coveredNumberCount: covered.size,
      maximumExposure: Math.max(0, ...Object.values(exposure)),
      maximumOverlap,
      strongCounts,
    };
  }

  function buildBalancedStrongRotation(strongStats) {
    const ranked = (strongStats || [])
      .map(item => ({ number: Number(item.number), count: Number(item.count) || 0 }))
      .filter(item => item.number >= 1 && item.number <= 7)
      .sort((a, b) => b.count - a.count || a.number - b.number)
      .map(item => item.number);
    for (let number = 1; number <= 7; number += 1) {
      if (!ranked.includes(number)) ranked.push(number);
    }
    return [...ranked.slice(0, 7), ...ranked.slice(0, 7)];
  }

  function generateForm2RawCandidates(snapshot, rawData) {
    const {
      hot,
      medium,
      cold,
      strongHot,
      strongMedium,
      strongCold,
      pairs,
      numbers: mainStats,
      triplets,
      quartets,
    } = snapshot;
    const limited = (rawData || []).slice(0, Math.min(100, (rawData || []).length));
    const combos = [];
    const create = (numbers, strong, comboNum) => createCombo(
      numbers.map(number => (typeof number === 'number' ? { number } : number)),
      strong,
      comboNum,
      FORM2_STRATEGY_LABELS[comboNum - 1] || String(comboNum),
    );
    const lastSeen = {};
    limited.forEach((row, index) => {
      (row.numbers || []).forEach(number => {
        if (!Number.isNaN(number) && number >= 1 && number <= 37 && lastSeen[number] === undefined) {
          lastSeen[number] = index;
        }
      });
    });
    const getGap = number => (lastSeen[number] !== undefined ? lastSeen[number] : 999);

    const combo1Due = mainStats.map(stat => {
      const gap = getGap(stat.number);
      const dueBonus = gap >= 4 && gap <= 16 ? 18 : (gap >= 3 && gap <= 20 ? 6 : 0);
      return { number: stat.number, score: stat.count + dueBonus };
    }).sort((a, b) => b.score - a.score).slice(0, 6);
    combos.push(create(combo1Due.length ? combo1Due : pickTop(hot, 6), 1, 1));

    const coldBreak = cold.slice(0, 15).map(item => ({
      number: item.number,
      score: (mainStats.find(stat => stat.number === item.number)?.count || 0) + getGap(item.number) * 0.5,
    })).sort((a, b) => b.score - a.score).slice(0, 6);
    combos.push(create(coldBreak.length ? coldBreak : pickTop(hot, 6), strongMedium[0]?.number || strongHot[0]?.number || 1, 2));

    const recent10 = limited.slice(0, 10);
    const previous10 = limited.slice(10, 20);
    const recentFrequency = {};
    const previousFrequency = {};
    for (let number = 1; number <= 37; number += 1) {
      recentFrequency[number] = 0;
      previousFrequency[number] = 0;
    }
    recent10.forEach(row => row.numbers.forEach(number => { recentFrequency[number] += 1; }));
    previous10.forEach(row => row.numbers.forEach(number => { previousFrequency[number] += 1; }));
    const trend = Object.entries(recentFrequency)
      .map(([number, value]) => ({ number: Number(number), score: value - previousFrequency[number] }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
    combos.push(create(trend.length ? trend : pickTop(hot, 6), strongHot[0]?.number || 1, 3));

    const gapScores = mainStats.slice(0, 25).map(stat => {
      const gap = getGap(stat.number);
      const bonus = gap >= 6 && gap <= 14 ? 20 : (gap >= 4 && gap <= 20 ? 10 : 0);
      return { number: stat.number, score: stat.count + bonus };
    }).sort((a, b) => b.score - a.score).slice(0, 6);
    combos.push(create(gapScores.length ? gapScores : pickTop(hot, 6), strongHot[0]?.number || 1, 4));

    const spread = [];
    [[1, 12], [13, 24], [25, 37]].forEach(([low, high]) => {
      mainStats.filter(stat => stat.number >= low && stat.number <= high).slice(0, 2)
        .forEach(stat => spread.push({ number: stat.number }));
    });
    const spreadSorted = [...new Set(spread.map(item => item.number))]
      .slice(0, 6)
      .sort((a, b) => a - b)
      .map(number => ({ number }));
    combos.push(create(
      spreadSorted.length >= 6 ? spreadSorted : [...spreadSorted, ...pickTop(hot, 6 - spreadSorted.length)],
      strongHot[0]?.number || 1,
      5,
    ));

    const pairNumbers = new Set();
    pairs.slice(4, 15).forEach(pair => {
      if (!pair || !pair.pair || pairNumbers.size >= 6) return;
      pair.pair.split('-').map(Number).forEach(number => {
        if (!Number.isNaN(number) && pairNumbers.size < 6) pairNumbers.add(number);
      });
    });
    const middlePairs = pairNumbers.size >= 6
      ? [...pairNumbers].slice(0, 6)
      : [...pairNumbers, ...hot.map(item => item.number).filter(number => !pairNumbers.has(number))].slice(0, 6);
    combos.push(create(middlePairs, strongHot[0]?.number || 1, 6));

    const tripletCold = new Set();
    if (triplets[0]) triplets[0].triplet.split('-').map(Number).forEach(number => tripletCold.add(number));
    cold.slice(0, 10).forEach(item => { if (tripletCold.size < 6) tripletCold.add(item.number); });
    hot.forEach(item => { if (tripletCold.size < 6) tripletCold.add(item.number); });
    combos.push(create([...tripletCold].slice(0, 6), strongCold[0]?.number || strongHot[0]?.number || 1, 7));

    const movingRecent = {};
    const movingPrevious = {};
    for (let number = 1; number <= 37; number += 1) {
      movingRecent[number] = 0;
      movingPrevious[number] = 0;
    }
    limited.slice(0, 20).forEach(row => row.numbers.forEach(number => { movingRecent[number] += 1; }));
    limited.slice(20, 40).forEach(row => row.numbers.forEach(number => { movingPrevious[number] += 1; }));
    const moving = Object.entries(movingRecent)
      .map(([number, value]) => ({ number: Number(number), score: value - movingPrevious[number] }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
    combos.push(create(moving.length ? moving : pickTop(hot, 6), strongHot[0]?.number || 1, 8));

    const last3 = new Set();
    limited.slice(0, 3).forEach(row => row.numbers.forEach(number => last3.add(number)));
    const anti = mainStats.filter(stat => !last3.has(stat.number)).map(stat => ({
      number: stat.number,
      score: stat.count + (getGap(stat.number) >= 5 ? 5 : 0),
    })).sort((a, b) => b.score - a.score).slice(0, 6);
    combos.push(create(anti.length ? anti : pickTop(hot, 6), strongHot[0]?.number || 1, 9));

    const dueScores = mainStats.map(stat => {
      const gap = getGap(stat.number);
      const dueBonus = gap >= 5 && gap <= 16 ? 12 : (gap >= 4 && gap <= 20 ? 4 : 0);
      return { number: stat.number, score: stat.count + dueBonus };
    }).sort((a, b) => b.score - a.score).slice(0, 6);
    combos.push(create(dueScores.length ? dueScores : pickTop(hot, 6), strongHot[0]?.number || 1, 10));

    const varianceRecent = {};
    const variancePrevious = {};
    for (let number = 1; number <= 37; number += 1) {
      varianceRecent[number] = 0;
      variancePrevious[number] = 0;
    }
    limited.slice(0, 25).forEach(row => row.numbers.forEach(number => { varianceRecent[number] += 1; }));
    limited.slice(25, 50).forEach(row => row.numbers.forEach(number => { variancePrevious[number] += 1; }));
    const variance = Object.entries(varianceRecent)
      .map(([number, value]) => ({ number: Number(number), score: Math.abs(value - variancePrevious[number]) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
    combos.push(create(variance.length ? variance : pickTop(medium, 6), strongMedium[0]?.number || strongHot[0]?.number || 1, 11));

    const wasTop = new Set(mainStats.slice(0, 15).map(stat => stat.number));
    const comeback = mainStats.filter(stat => wasTop.has(stat.number)).map(stat => {
      const gap = getGap(stat.number);
      return { number: stat.number, score: gap >= 5 && gap <= 15 ? stat.count + 15 : stat.count };
    }).sort((a, b) => b.score - a.score).slice(0, 6);
    combos.push(create(comeback.length ? comeback : pickTop(hot, 6), strongHot[0]?.number || 1, 12));

    const synergyScores = {};
    for (let number = 1; number <= 37; number += 1) synergyScores[number] = 0;
    mainStats.forEach((stat, index) => { synergyScores[stat.number] += 20 - index; });
    pairs.slice(0, 20).forEach(pair => pair.pair.split('-').map(Number).forEach(number => { synergyScores[number] += 2; }));
    triplets.slice(0, 10).forEach(triplet => triplet.triplet.split('-').map(Number).forEach(number => { synergyScores[number] += 3; }));
    quartets.slice(0, 5).forEach(quartet => quartet.quartet.split('-').map(Number).forEach(number => { synergyScores[number] += 4; }));
    Object.keys(synergyScores).forEach(value => {
      const number = Number(value);
      const gap = getGap(number);
      if (gap >= 4 && gap <= 18) synergyScores[number] += 5;
    });
    const synergy = Object.entries(synergyScores)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([number]) => ({ number: Number(number) }));
    combos.push(create(synergy, strongHot[0]?.number || 1, 13));

    const momentum = {};
    for (let number = 1; number <= 37; number += 1) momentum[number] = 0;
    limited.slice(0, 5).forEach(row => row.numbers.forEach(number => { momentum[number] += 4; }));
    const weighted = mainStats.map(stat => ({
      number: stat.number,
      score: stat.count * 2 + momentum[stat.number]
        + (getGap(stat.number) >= 6 && getGap(stat.number) <= 12 ? 8 : 0),
    })).sort((a, b) => b.score - a.score).slice(0, 6);
    combos.push(create(weighted.length ? weighted : pickTop(hot, 6), strongHot[0]?.number || 1, 14));
    return combos;
  }

  function generateRawCandidates(newestFirstRows, windowSize) {
    const rows = newestFirstRows.slice(0, windowSize);
    const snapshot = buildAnalysisSnapshot(rows);
    const annotate = source => combo => ({
      ...combo,
      source,
      strategyId: combo.comboNum,
      window: windowSize,
      identity: `${source}:${combo.comboNum}:${windowSize}`,
    });
    return [
      ...generateMainCandidates(snapshot, rows).map(annotate('main')),
      ...generateForm2RawCandidates(snapshot, rows).map(annotate('form2')),
    ];
  }

  function generateBaselineForms(newestFirstRows) {
    const rows = newestFirstRows.filter(isValidDraw).map(cloneDraw);
    const snapshot = buildAnalysisSnapshot(rows);
    const main = generateMainCandidates(snapshot, rows);
    const form2Raw = generateForm2RawCandidates(snapshot, rows);
    const priority = buildForm2CandidatePriority(snapshot.numbers, snapshot.hot, snapshot.medium, snapshot.cold);
    const form2 = diversifyForm2Combinations(form2Raw, priority, {
      minimumCoverage: 30,
      maximumExposure: 7,
      maximumOverlap: 4,
    });
    const rotation = buildBalancedStrongRotation(snapshot.strong);
    form2.forEach((combo, index) => { combo.strong = rotation[index]; });
    return { main, form2, snapshot };
  }

  function fingerprintRows(rows) {
    const canonical = toChronological(rows).map(row => [
      row.drawNumber == null ? '' : row.drawNumber,
      row.date == null ? '' : row.date,
      ...row.numbers,
      row.strong,
    ].join('|')).join('\n');
    let hash = 2166136261;
    for (let index = 0; index < canonical.length; index += 1) {
      hash ^= canonical.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `${ALGORITHM_VERSION}:${CONSTRAINT_VERSION}:${(hash >>> 0).toString(16).padStart(8, '0')}`;
  }

  function normalizeBacktestWindows(windows) {
    const normalized = [...new Set((windows || []).map(Number))]
      .filter(windowSize => Number.isInteger(windowSize) && windowSize > 0)
      .sort((a, b) => a - b);
    if (normalized.length === 0) {
      const error = new Error('Backtest requires at least one positive window');
      error.code = 'INVALID_WINDOWS';
      throw error;
    }
    return normalized;
  }

  function createBacktestPlan(rows, windows = BACKTEST_WINDOWS) {
    const normalizedWindows = normalizeBacktestWindows(windows);
    const maximumWindow = Math.max(...normalizedWindows);
    const chronological = toChronological(rows);
    if (chronological.length <= maximumWindow) {
      const error = new Error(`Backtest requires at least ${maximumWindow + 1} valid draws`);
      error.code = 'INSUFFICIENT_HISTORY';
      throw error;
    }
    const eligibleTargets = Array.from(
      { length: chronological.length - maximumWindow },
      (_, index) => maximumWindow + index,
    );
    const calibrationCount = Math.floor(eligibleTargets.length * 0.70);
    if (calibrationCount < 1 || calibrationCount >= eligibleTargets.length) {
      const error = new Error('Backtest requires at least two eligible targets');
      error.code = 'INSUFFICIENT_TARGETS';
      throw error;
    }
    return {
      chronological,
      windows: normalizedWindows,
      maximumWindow,
      eligibleTargets,
      calibrationTargets: eligibleTargets.slice(0, calibrationCount),
      holdoutTargets: eligibleTargets.slice(calibrationCount),
    };
  }

  function buildWindowCandidatePool(chronological, targetIndex, windows = BACKTEST_WINDOWS) {
    const normalizedWindows = normalizeBacktestWindows(windows);
    if (!Number.isInteger(targetIndex) || targetIndex < Math.max(...normalizedWindows)
      || targetIndex >= chronological.length) {
      const error = new Error('Target index cannot satisfy the requested training windows');
      error.code = 'INVALID_TARGET_INDEX';
      throw error;
    }
    return normalizedWindows.flatMap(windowSize => {
      const trainingRows = chronological.slice(targetIndex - windowSize, targetIndex).reverse();
      return generateRawCandidates(trainingRows, windowSize);
    });
  }

  function scoreLine(combo, draw) {
    const drawNumbers = new Set(draw.numbers);
    const regularMatches = combo.numbers.filter(number => drawNumbers.has(number)).length;
    const strongMatch = Number(combo.strong) === Number(draw.strong);
    const regularPoints = REGULAR_POINTS[regularMatches];
    const rowPoints = strongMatch ? regularPoints * 1.10 : regularPoints;
    return { regularMatches, strongMatch, regularPoints, rowPoints };
  }

  function scoreForm(combos, draw) {
    const rows = combos.map(combo => scoreLine(combo, draw));
    const ordered = rows.slice().sort((a, b) => b.rowPoints - a.rowPoints);
    const best = ordered[0]
      || { regularMatches: 0, strongMatch: false, regularPoints: 0, rowPoints: 0 };
    const otherPoints = ordered.slice(1).reduce((sum, row) => sum + row.rowPoints, 0);
    return { rows, best, drawScore: best.rowPoints + otherPoints * 0.05 };
  }

  function createEmptyIdentityAccumulator() {
    return {
      totalRegularPoints: 0,
      totalRegularMatches: 0,
      sampleCount: 0,
      hitCounts: Array(7).fill(0),
      bucketPoints: Array(3).fill(0),
      bucketCounts: Array(3).fill(0),
    };
  }

  function addIdentityObservation(accumulator, lineScore, bucketIndex) {
    accumulator.totalRegularPoints += lineScore.regularPoints;
    accumulator.totalRegularMatches += lineScore.regularMatches;
    accumulator.sampleCount += 1;
    accumulator.hitCounts[lineScore.regularMatches] += 1;
    if (bucketIndex >= 0 && bucketIndex < 3) {
      accumulator.bucketPoints[bucketIndex] += lineScore.regularPoints;
      accumulator.bucketCounts[bucketIndex] += 1;
    }
  }

  function aggregateIdentityMetrics(accumulator) {
    const sampleCount = accumulator.sampleCount || 0;
    const averagePoints = sampleCount ? accumulator.totalRegularPoints / sampleCount : 0;
    const averageRegularMatches = sampleCount ? accumulator.totalRegularMatches / sampleCount : 0;
    const bucketAverages = accumulator.bucketPoints.map((total, index) => (
      accumulator.bucketCounts[index] ? total / accumulator.bucketCounts[index] : 0
    ));
    const minimumBucket = Math.min(...bucketAverages);
    const stability = averagePoints === 0
      ? 0
      : Math.max(0, Math.min(1, minimumBucket / averagePoints));
    const rateAtLeast = threshold => {
      if (!sampleCount) return 0;
      return accumulator.hitCounts.slice(threshold).reduce((sum, count) => sum + count, 0) / sampleCount;
    };
    let bestRegularMatches = 0;
    for (let matches = 6; matches >= 0; matches -= 1) {
      if (accumulator.hitCounts[matches] > 0) {
        bestRegularMatches = matches;
        break;
      }
    }
    return {
      sampleCount,
      totalRegularPoints: accumulator.totalRegularPoints,
      averagePoints,
      averageRegularMatches,
      hitCounts: accumulator.hitCounts.slice(),
      rate2Plus: rateAtLeast(2),
      rate3Plus: rateAtLeast(3),
      rate4Plus: rateAtLeast(4),
      rate5Plus: rateAtLeast(5),
      rate6: rateAtLeast(6),
      bestRegularMatches,
      bucketAverages,
      stability,
      score: averagePoints * 0.80 + averagePoints * stability * 0.20,
    };
  }

  function getChronologyBucket(position, total) {
    return Math.min(2, Math.floor(position * 3 / Math.max(1, total)));
  }

  function compareIdentityRankings(first, second) {
    return second.calibration.score - first.calibration.score
      || second.calibration.stability - first.calibration.stability
      || second.calibration.rate3Plus - first.calibration.rate3Plus
      || first.strategyId - second.strategyId
      || first.window - second.window
      || first.source.localeCompare(second.source)
      || first.identity.localeCompare(second.identity);
  }

  function evaluateStrategyWindows(rows, windows = BACKTEST_WINDOWS, options = {}) {
    const onProgress = typeof options.onProgress === 'function' ? options.onProgress : function noop() {};
    const isCancelled = typeof options.isCancelled === 'function'
      ? options.isCancelled
      : function neverCancelled() { return false; };
    const plan = createBacktestPlan(rows, windows);
    const calibrationPositions = new Map(plan.calibrationTargets.map((target, index) => [target, index]));
    const holdoutPositions = new Map(plan.holdoutTargets.map((target, index) => [target, index]));
    const aggregates = new Map();

    plan.eligibleTargets.forEach((targetIndex, targetPosition) => {
      if (isCancelled()) {
        const error = new Error('Backtest cancelled');
        error.code = 'CANCELLED';
        throw error;
      }
      const isCalibration = calibrationPositions.has(targetIndex);
      const partition = isCalibration ? 'calibration' : 'holdout';
      const partitionPosition = isCalibration
        ? calibrationPositions.get(targetIndex)
        : holdoutPositions.get(targetIndex);
      const partitionTotal = isCalibration
        ? plan.calibrationTargets.length
        : plan.holdoutTargets.length;
      const bucketIndex = getChronologyBucket(partitionPosition, partitionTotal);
      const pool = buildWindowCandidatePool(plan.chronological, targetIndex, plan.windows);
      const targetDraw = plan.chronological[targetIndex];

      pool.forEach(candidate => {
        if (!aggregates.has(candidate.identity)) {
          aggregates.set(candidate.identity, {
            identity: candidate.identity,
            source: candidate.source,
            strategy: candidate.strategy,
            strategyId: candidate.strategyId,
            window: candidate.window,
            calibration: createEmptyIdentityAccumulator(),
            holdout: createEmptyIdentityAccumulator(),
          });
        }
        const lineScore = scoreLine(candidate, targetDraw);
        addIdentityObservation(aggregates.get(candidate.identity)[partition], lineScore, bucketIndex);
      });
      onProgress({
        phase: 'identity-evaluation',
        completed: targetPosition + 1,
        total: plan.eligibleTargets.length,
      });
    });

    const rankings = Array.from(aggregates.values())
      .map(record => ({
        identity: record.identity,
        source: record.source,
        strategy: record.strategy,
        strategyId: record.strategyId,
        window: record.window,
        calibration: aggregateIdentityMetrics(record.calibration),
        holdout: aggregateIdentityMetrics(record.holdout),
      }))
      .sort(compareIdentityRankings)
      .map((record, index) => ({ ...record, rank: index + 1 }));

    return {
      windows: plan.windows.slice(),
      split: {
        eligibleCount: plan.eligibleTargets.length,
        calibrationCount: plan.calibrationTargets.length,
        holdoutCount: plan.holdoutTargets.length,
      },
      rankings,
    };
  }

  return {
    ALGORITHM_VERSION,
    CONSTRAINT_VERSION,
    BACKTEST_WINDOWS,
    REGULAR_POINTS,
    FORM2_STRATEGY_LABELS,
    isValidDraw,
    toChronological,
    buildAnalysisSnapshot,
    generateMainCandidates,
    generateForm2RawCandidates,
    generateRawCandidates,
    generateBaselineForms,
    diversifyForm2Combinations,
    buildBalancedStrongRotation,
    getFormDiversityMetrics,
    fingerprintRows,
    createBacktestPlan,
    buildWindowCandidatePool,
    scoreLine,
    scoreForm,
    aggregateIdentityMetrics,
    evaluateStrategyWindows,
  };
}));
