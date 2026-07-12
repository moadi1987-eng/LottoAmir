/**
 * LottoAmir combination / frequency helpers.
 * Browser: window.LottoCombos
 * Node: module.exports
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.LottoCombos = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

function analyzePairs(data) {
    const pairCounts = new Map();
    // זוגות - יעיל יותר
    const maxRows = Math.min(data.length, 200);
    
    for (let rowIdx = 0; rowIdx < maxRows; rowIdx++) {
        
        const row = data[rowIdx];
        const numbers = (row.numbers || []).filter(n => !isNaN(n) && n >= 1 && n <= 37);
        
        if (numbers.length >= 2) {
            for (let i = 0; i < numbers.length; i++) {
                for (let j = i + 1; j < numbers.length; j++) {
                    const key = numbers[i] < numbers[j] ? 
                        `${numbers[i]}-${numbers[j]}` : `${numbers[j]}-${numbers[i]}`;
                    pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
                }
            }
        }
    }
    
    return Array.from(pairCounts.entries())
        .map(([pair, count]) => ({
            pair,
            count,
            percentage: (count / maxRows * 100).toFixed(1)
        }))
        .sort((a, b) => b.count - a.count);
}

function analyzeTriplets(data) {
    const tripletCounts = new Map();
    // הגבל ל-100 שורות - מספיק לסטטיסטיקה טובה
    const maxRows = Math.min(data.length, 100);
    
    for (let rowIdx = 0; rowIdx < maxRows; rowIdx++) {
        
        const row = data[rowIdx];
        const numbers = (row.numbers || []).filter(n => !isNaN(n) && n >= 1 && n <= 37);
        
        if (numbers.length >= 3) {
            for (let i = 0; i < numbers.length; i++) {
                for (let j = i + 1; j < numbers.length; j++) {
                    for (let k = j + 1; k < numbers.length; k++) {
                        const sorted = [numbers[i], numbers[j], numbers[k]].sort((a, b) => a - b);
                        const key = `${sorted[0]}-${sorted[1]}-${sorted[2]}`;
                        tripletCounts.set(key, (tripletCounts.get(key) || 0) + 1);
                    }
                }
            }
        }
    }
    
    return Array.from(tripletCounts.entries())
        .map(([triplet, count]) => ({
            triplet,
            count,
            percentage: (count / maxRows * 100).toFixed(1)
        }))
        .sort((a, b) => b.count - a.count);
}

function analyzeQuartets(data) {
    const quartetCounts = new Map();
    // הגבל ל-50 שורות בלבד - רביעיות כבד מאוד
    const maxRows = Math.min(data.length, 50);
    
    for (let rowIdx = 0; rowIdx < maxRows; rowIdx++) {
        
        const row = data[rowIdx];
        const numbers = (row.numbers || []).filter(n => !isNaN(n) && n >= 1 && n <= 37);
        
        if (numbers.length >= 4) {
            for (let i = 0; i < numbers.length; i++) {
                for (let j = i + 1; j < numbers.length; j++) {
                    for (let k = j + 1; k < numbers.length; k++) {
                        for (let l = k + 1; l < numbers.length; l++) {
                            const sorted = [numbers[i], numbers[j], numbers[k], numbers[l]].sort((a, b) => a - b);
                            const key = `${sorted[0]}-${sorted[1]}-${sorted[2]}-${sorted[3]}`;
                            quartetCounts.set(key, (quartetCounts.get(key) || 0) + 1);
                        }
                    }
                }
            }
        }
    }
    
    return Array.from(quartetCounts.entries())
        .map(([quartet, count]) => ({
            quartet,
            count,
            percentage: (count / maxRows * 100).toFixed(1)
        }))
        .sort((a, b) => b.count - a.count);
}

// 🧬 חיזוי חכם - ניתוח דפוסים מתקדם
// משלב 3 אסטרטגיות: "פריצה", "מומנטום", ו"מחזוריות"
function generateSlidingWindowCombo(rawData, strongHot, strongMedium, comboNum) {
    const windowSize = 50;
    const numTargets = Math.min(30, rawData.length - windowSize);
    
    if (numTargets <= 0 || rawData.length < windowSize + 1) {
        const fallbackNums = [];
        for (let i = 1; i <= 6; i++) fallbackNums.push({ number: i * 5 });
        return createCombo(fallbackNums, strongHot[0]?.number || 1, comboNum, '🧬 חיזוי חכם');
    }
    
    // ציונים לפי סוג דפוס
    const breakthroughScores = {}; // מספרים "קרים" שפרצו להגרלה
    const momentumScores = {};     // מספרים "חמים" שהמשיכו להופיע
    const cycleScores = {};        // מספרים שמופיעים במחזוריות
    const gapScores = {};          // ציון לפי פער מהופעה אחרונה
    const strongScores = {};
    
    for (let i = 1; i <= 37; i++) {
        breakthroughScores[i] = 0;
        momentumScores[i] = 0;
        cycleScores[i] = 0;
        gapScores[i] = 0;
    }
    for (let i = 1; i <= 7; i++) {
        strongScores[i] = 0;
    }
    
    const avgFreqPerNum = (windowSize * 6) / 37; // תדירות ממוצעת צפויה למספר בחלון
    
    // ניתוח כל חלון
    for (let targetIdx = 0; targetIdx < numTargets; targetIdx++) {
        const targetRow = rawData[targetIdx];
        
        // מספרי היעד
        const targetNumbers = new Set();
        (targetRow.numbers || []).forEach(num => {
            if (!isNaN(num) && num >= 1 && num <= 37) targetNumbers.add(num);
        });
        const targetStrong = targetRow.strong;
        
        // חשב תדירות בחלון + פער מהופעה אחרונה
        const windowFreq = {};
        const lastSeen = {}; // מתי המספר הופיע לאחרונה בחלון
        
        for (let offset = 1; offset <= windowSize && targetIdx + offset < rawData.length; offset++) {
            const windowRow = rawData[targetIdx + offset];
            (windowRow.numbers || []).forEach(num => {
                if (!isNaN(num) && num >= 1 && num <= 37) {
                    windowFreq[num] = (windowFreq[num] || 0) + 1;
                    if (!lastSeen[num]) lastSeen[num] = offset;
                }
            });
        }
        
        // נתח כל מספר ביעד
        targetNumbers.forEach(num => {
            const freq = windowFreq[num] || 0;
            const gap = lastSeen[num] || windowSize + 1;
            
            // פריצה: מספר קר שהופיע ביעד
            if (freq < avgFreqPerNum * 0.5) {
                breakthroughScores[num] += 4;
            }
            
            // מומנטום: מספר חם שהמשיך
            if (freq > avgFreqPerNum * 1.2) {
                momentumScores[num] += 4;
            }
            
            // מחזוריות: מספר שהופיע בפער של 5-15 הגרלות
            if (gap >= 5 && gap <= 15) {
                cycleScores[num] += 3;
            }
            
            // בונוס לפער אופטימלי (8-12)
            if (gap >= 8 && gap <= 12) {
                gapScores[num] += 2;
            }
        });
        
        // מספר חזק
        if (!isNaN(targetStrong)) {
            strongScores[targetStrong] += 2;
        }
    }
    
    // עכשיו נתח את המצב הנוכחי (שורות 1-50 מהנתונים שנבחרו)
    const currentWindowFreq = {};
    const currentLastSeen = {};
    
    for (let i = 0; i < Math.min(windowSize, rawData.length); i++) {
        const row = rawData[i];
        (row.numbers || []).forEach(num => {
            if (!isNaN(num) && num >= 1 && num <= 37) {
                currentWindowFreq[num] = (currentWindowFreq[num] || 0) + 1;
                if (!currentLastSeen[num]) currentLastSeen[num] = i + 1;
            }
        });
    }
    
    // חשב ציון סופי משוקלל לפי המצב הנוכחי
    const finalScores = {};
    
    for (let i = 1; i <= 37; i++) {
        const currentFreq = currentWindowFreq[i] || 0;
        const currentGap = currentLastSeen[i] || 100;
        
        let score = 0;
        
        // אם המספר כרגע קר - תן משקל לציון פריצה
        if (currentFreq < avgFreqPerNum * 0.6) {
            score += breakthroughScores[i] * 2.5;
            score += cycleScores[i] * 1.5;
        }
        // אם המספר כרגע חם - תן משקל לציון מומנטום
        else if (currentFreq > avgFreqPerNum * 1.3) {
            score += momentumScores[i] * 2.5;
            score += cycleScores[i] * 1.5;
        }
        // בינוני - שילוב
        else {
            score += breakthroughScores[i] * 1.5;
            score += momentumScores[i] * 1.5;
            score += cycleScores[i] * 2;
        }
        
        // בונוס לפער אופטימלי במצב הנוכחי
        if (currentGap >= 5 && currentGap <= 15) {
            score += gapScores[i] * 2;
        }
        
        // בונוס נוסף למספרים "בשלים" - לא הופיעו 8-15 הגרלות
        if (currentGap >= 8 && currentGap <= 15) {
            score += 5;
        }
        
        finalScores[i] = score;
    }
    
    // בחר 6 מספרים מובילים
    const sorted = Object.entries(finalScores)
        .map(([num, score]) => ({ number: parseInt(num), score }))
        .sort((a, b) => b.score - a.score);
    
    const nums = sorted.slice(0, 6);
    
    // מספר חזק - גם לפי דפוסים
    const currentStrongFreq = {};
    for (let i = 0; i < Math.min(windowSize, rawData.length); i++) {
        const strong = rawData[i].strong;
        if (!isNaN(strong)) currentStrongFreq[strong] = (currentStrongFreq[strong] || 0) + 1;
    }
    
    // משקל סופי למספר חזק
    let bestStrong = 1;
    let bestStrongScore = 0;
    for (let i = 1; i <= 7; i++) {
        const historyScore = strongScores[i] || 0;
        const currentFreq = currentStrongFreq[i] || 0;
        // מספר חזק שהיסטורית טוב אבל לא הופיע לאחרונה יותר מדי
        const combined = historyScore * 2 + (currentFreq < 5 ? 3 : 0);
        if (combined > bestStrongScore) {
            bestStrongScore = combined;
            bestStrong = i;
        }
    }
    
    return createCombo(nums, bestStrong, comboNum, '🧬 חיזוי חכם (דפוסים)');
}

function generateCombinations(hot, medium, cold, strongHot, strongMedium, strongCold, pairs, mainStats, triplets, quartets, rawData) {
    const combos = [];
    
    // הגבל את rawData ל-100 שורות מקסימום לביצועים
    const limitedRawData = rawData.slice(0, Math.min(100, rawData.length));
    
    // 1. מאוזן
    combos.push(createCombo([
        ...pickRandom(hot, 2),
        ...pickRandom(medium, 2),
        ...pickRandom(cold, 2)
    ], pickRandom(strongHot, 1)[0]?.number || 1, 1, '⚖️ מאוזן'));
    
    // 2. מיקוד חם
    combos.push(createCombo([
        ...pickRandom(hot, 4),
        ...pickRandom(medium, 1),
        ...pickRandom(cold, 1)
    ], pickRandom(strongHot, 1)[0]?.number || 2, 2, '🔥 מיקוד חם'));
    
    // 3. מבוסס זוגות
    const topPair = pairs[0]?.pair.split('-').map(n => parseInt(n)) || [];
    const pairNums = topPair.length >= 2 ? topPair : pickRandom(hot, 2).map(n => n.number);
    const remaining = [...pickRandom(hot, 2), ...pickRandom(medium, 2)].map(n => n.number)
        .filter(n => !pairNums.includes(n)).slice(0, 4);
    combos.push(createCombo(
        [...pairNums, ...remaining].slice(0, 6).map(n => ({ number: n })),
        pickRandom(strongHot, 1)[0]?.number || 3,
        3,
        '🤝 מבוסס זוגות'
    ));
    
    // 4. שילוב חכם - זוג מוביל + שלישייה מובילה (ללא חפיפה)
    combos.push(generateSmartMixCombo(pairs, triplets, hot, strongHot, 4));
    
    // 5. מספרים בשלים - לא יצאו זמן רב אבל היסטורית חזקים
    combos.push(generateDueNumbersCombo(mainStats, limitedRawData, strongHot, strongMedium, 5));
    
    // 6. 10 המובילים
    combos.push(createCombo(
        pickRandom(mainStats.slice(0, 10), 6),
        pickRandom(strongHot, 1)[0]?.number || 6,
        6,
        '⭐ 10 המובילים'
    ));
    
    // 7. שתי שלישיות מובילות
    combos.push(generateDoubleTripletCombo(triplets, hot, strongHot, 7));
    
    // 8. שילוב חם-קר עם חזק קר
    combos.push(createCombo([
        ...pickRandom(hot, 3),
        ...pickRandom(cold, 3)
    ], pickRandom(strongCold, 1)[0]?.number || 7, 8, '🔥❄️ חם+קר (חזק קר)'));
    
    // 9. בלתי צפוי - מעורבב עם חזרות קבועות ומספר חזק שונה מהאחרון
    combos.push(generateUnpredictableCombo(hot, medium, cold, pairs, triplets, strongHot, strongMedium, strongCold, limitedRawData, 9));
    
    // 10. ניתוח מגמות חכם - זיהוי מספרים במגמת עלייה
    combos.push(generateTrendAnalysisCombo(mainStats, limitedRawData, strongHot, 10));
    
    // 11: חיזוי חלון נע - ניתוח דפוסי התאמה מ-50 שורות היסטוריות
    combos.push(generateSlidingWindowCombo(rawData, strongHot, strongMedium, 11));
    
    // 12. רביעיות + שלישיות עם חפיפה
    combos.push(generateQuartetTripletOverlapCombo(quartets, triplets, hot, strongHot, 12));
    
    // 13. חיזוי AI
    combos.push(generateAICombo(hot, medium, cold, strongHot, mainStats, limitedRawData, 13, '🧮 ציון משוקלל'));
    
    // 14. נוסחת הזהב
    const goldenTriplet = triplets[0]?.triplet.split('-').map(n => parseInt(n)) || [];
    const goldenPair = pairs[0]?.pair.split('-').map(n => parseInt(n)) || [];
    const goldenNums = [...new Set([...goldenTriplet, ...goldenPair])];
    let hotIdx = 0;
    while (goldenNums.length < 6 && hotIdx < hot.length) {
        const hotNum = hot[hotIdx]?.number;
        if (hotNum && !goldenNums.includes(hotNum)) goldenNums.push(hotNum);
        hotIdx++;
    }
    combos.push(createCombo(
        goldenNums.slice(0, 6).map(n => ({ number: n })),
        pickRandom(strongHot, 1)[0]?.number || 7,
        14,
        '🔮 נוסחת הזהב'
    ));
    
    return combos;
}

const FORM2_STRATEGY_LABELS = [
    'בשלים + תדירות',
    'פריצת קור',
    'מגמת עלייה מואצת',
    'פער אופטימלי',
    'איזון פיזור',
    'זוגות מאמצע הדירוג',
    'שלישייה מובילה + קרים',
    'ממוצע נע',
    'אנטי-אחרון',
    'מספרים בשלים',
    'תנודה בין חלונות',
    'חזרת מגמה',
    'סינרגיה מלאה',
    'ממוצע משוקלל'
];

function normalizeForm2Numbers(values, candidatePriority) {
    const result = [];
    const seen = new Set();
    const addValue = function(value) {
        const raw = value && typeof value === 'object' ? value.number : value;
        const number = parseInt(raw, 10);
        if (number >= 1 && number <= 37 && !seen.has(number)) {
            seen.add(number);
            result.push(number);
        }
    };

    (values || []).forEach(addValue);
    (candidatePriority || []).forEach(addValue);
    for (let number = 1; number <= 37 && result.length < 6; number++) addValue(number);
    return result.slice(0, 6).sort((a, b) => a - b);
}

function getForm2CombinationKey(numbers) {
    return (numbers || []).slice().sort((a, b) => a - b).join('-');
}

function getForm2Overlap(firstNumbers, secondNumbers) {
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
        for (let index = start; index <= values.length - remaining; index++) {
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
    const add = function(item) {
        const number = parseInt(item && typeof item === 'object' ? item.number : item, 10);
        if (number >= 1 && number <= 37 && !seen.has(number)) {
            seen.add(number);
            priority.push(number);
        }
    };
    (mainStats || []).forEach(add);
    (hot || []).forEach(add);
    (medium || []).forEach(add);
    (cold || []).forEach(add);
    for (let number = 1; number <= 37; number++) add(number);
    return priority;
}

function buildForm2StrongRotation(strongHot, strongMedium, strongCold) {
    const order = [];
    const seen = new Set();
    [...(strongHot || []), ...(strongMedium || []), ...(strongCold || [])].forEach(item => {
        const number = parseInt(item && item.number, 10);
        if (number >= 1 && number <= 7 && !seen.has(number)) {
            seen.add(number);
            order.push(number);
        }
    });
    for (let number = 1; number <= 7; number++) {
        if (!seen.has(number)) order.push(number);
    }
    return Array.from({ length: 14 }, (_, index) => order[index % 7]);
}

function findForm2FallbackCombination(priority, accepted, exposure, covered, targetCoverage, options) {
    const acceptedKeys = new Set(accepted.map(combo => getForm2CombinationKey(combo.numbers)));
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
            if (acceptedKeys.has(getForm2CombinationKey(numbers))) return;
            found = numbers;
            return;
        }

        const remaining = 6 - selected.length;
        for (let index = start; index <= ordered.length - remaining; index++) {
            const number = ordered[index];
            if ((exposure[number] || 0) >= options.maximumExposure) continue;
            const overlapsTooMuch = accepted.some(combo => {
                const previous = new Set(combo.numbers || []);
                let overlap = selected.filter(value => previous.has(value)).length;
                if (previous.has(number)) overlap++;
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
        maximumOverlap: 4
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
            Math.ceil(settings.minimumCoverage * (comboIndex + 1) / Math.max(1, total))
        );
        let chosen = null;

        for (let retainedCount = 6; retainedCount >= 3 && !chosen; retainedCount--) {
            const keptSelections = getNumberSelections(baseNumbers, retainedCount);
            const replacementSelections = getNumberSelections(replacements, 6 - retainedCount);
            let best = null;

            keptSelections.forEach(kept => {
                replacementSelections.forEach(replacement => {
                    const numbers = [...kept, ...replacement].sort((a, b) => a - b);
                    const key = getForm2CombinationKey(numbers);
                    if (acceptedKeys.has(key)) return;
                    if (numbers.some(number => (exposure[number] || 0) >= settings.maximumExposure)) return;
                    if (accepted.some(combo => getForm2Overlap(numbers, combo.numbers) > settings.maximumOverlap)) return;

                    const newCount = numbers.filter(number => !covered.has(number)).length;
                    if (covered.size + newCount < targetCoverage) return;

                    const exposureSum = numbers.reduce((sum, number) => sum + (exposure[number] || 0), 0);
                    const prioritySum = numbers.reduce((sum, number) => sum + (priorityIndex.get(number) || 0), 0);
                    const score = { numbers, key, newCount, exposureSum, prioritySum };
                    const isBetter = !best ||
                        score.newCount > best.newCount ||
                        (score.newCount === best.newCount && score.exposureSum < best.exposureSum) ||
                        (score.newCount === best.newCount && score.exposureSum === best.exposureSum && score.prioritySum < best.prioritySum) ||
                        (score.newCount === best.newCount && score.exposureSum === best.exposureSum && score.prioritySum === best.prioritySum && score.key < best.key);
                    if (isBetter) best = score;
                });
            });

            if (best) chosen = best.numbers;
        }

        if (!chosen) {
            chosen = findForm2FallbackCombination(
                priority,
                accepted,
                exposure,
                covered,
                targetCoverage,
                settings
            );
        }
        if (!chosen) throw new Error('לא ניתן ליצור 14 קומבינציות שונות לטופס השני.');

        const finalCombo = Object.assign({}, baseCombo, { numbers: chosen });
        accepted.push(finalCombo);
        acceptedKeys.add(getForm2CombinationKey(chosen));
        chosen.forEach(number => {
            exposure[number] = (exposure[number] || 0) + 1;
            covered.add(number);
        });
    });

    return accepted;
}

function getForm2DiversityMetrics(combos) {
    const combinationKeys = new Set();
    const covered = new Set();
    const exposure = {};
    const strongCounts = {};
    for (let number = 1; number <= 7; number++) strongCounts[number] = 0;
    let maximumOverlap = 0;

    (combos || []).forEach(combo => {
        const numbers = normalizeForm2Numbers(combo.numbers, []);
        combinationKeys.add(getForm2CombinationKey(numbers));
        numbers.forEach(number => {
            covered.add(number);
            exposure[number] = (exposure[number] || 0) + 1;
        });
        const strong = parseInt(combo.strong, 10);
        if (strong >= 1 && strong <= 7) strongCounts[strong]++;
    });

    for (let first = 0; first < (combos || []).length; first++) {
        for (let second = first + 1; second < combos.length; second++) {
            maximumOverlap = Math.max(maximumOverlap, getForm2Overlap(combos[first].numbers, combos[second].numbers));
        }
    }

    return {
        combinationCount: (combos || []).length,
        uniqueCombinationCount: combinationKeys.size,
        coveredNumberCount: covered.size,
        maximumExposure: Math.max(0, ...Object.values(exposure)),
        maximumOverlap,
        strongCounts
    };
}



// ========== 14 קומבינציות לטופס אחר (1–14) – חישוב סטטיסטי חכם ==========
function generateCombinationsForm2(hot, medium, cold, strongHot, strongMedium, strongCold, pairs, mainStats, triplets, quartets, rawData) {
    const limited = (rawData || []).slice(0, Math.min(100, (rawData || []).length));
    const combos = [];

    const create = (nums, strong, num) => createCombo(
        nums.map(n => typeof n === 'number' ? { number: n } : n),
        strong,
        num,
        FORM2_STRATEGY_LABELS[num - 1] || String(num)
    );
    
    // עזר: פער מהופעה אחרונה (אינדקס נמוך = הופיע לאחרונה)
    const lastSeen = {};
    (limited || []).forEach((row, idx) => {
        (row.numbers || []).forEach(n => {
            if (!isNaN(n) && n >= 1 && n <= 37 && lastSeen[n] === undefined) lastSeen[n] = idx;
        });
    });
    const getGap = (n) => lastSeen[n] !== undefined ? lastSeen[n] : 999;
    
    // 1. בשלים + תדירות – 6 מספרים עם פער אופטימלי (4–16) + תדירות גבוהה. לוגיקה פשוטה וברורה.
    const combo1Due = (mainStats || []).map(s => {
        const g = getGap(s.number);
        const dueBonus = (g >= 4 && g <= 16) ? 18 : (g >= 3 && g <= 20) ? 6 : 0;
        return { number: s.number, score: s.count + dueBonus };
    }).sort((a, b) => b.score - a.score).slice(0, 6);
    const combo1Nums = combo1Due.length ? combo1Due : pickTop(hot, 6);
    combos.push(create(combo1Nums, 1, 1));
    
    // 2. פריצת קור – קרים עם תדירות היסטורית גבוהה (בשלים)
    const coldBreak = (cold || []).slice(0, 15).map(c => ({ number: c.number, score: (mainStats.find(s => s.number === c.number)?.count || 0) + getGap(c.number) * 0.5 })).sort((a, b) => b.score - a.score).slice(0, 6);
    combos.push(create(coldBreak.length ? coldBreak : pickTop(hot, 6), strongMedium[0]?.number || strongHot[0]?.number || 1, 2));
    
    // 3. מגמת עלייה מואצת – 10 אחרונות vs 10 שלפניהן
    const r10 = (limited || []).slice(0, 10);
    const p10 = (limited || []).slice(10, 20);
    const freqR = {}, freqP = {};
    for (let i = 1; i <= 37; i++) freqR[i] = freqP[i] = 0;
    r10.forEach(row => { (row.numbers || []).forEach(n => { if (!isNaN(n)) freqR[n]++; }); });
    p10.forEach(row => { (row.numbers || []).forEach(n => { if (!isNaN(n)) freqP[n]++; }); });
    const trend = Object.entries(freqR).map(([n, v]) => ({ number: parseInt(n), score: (v || 0) - (freqP[n] || 0) })).sort((a, b) => b.score - a.score).slice(0, 6);
    combos.push(create(trend.length ? trend : pickTop(hot, 6), strongHot[0]?.number || 1, 3));
    
    // 4. פער אופטימלי – בשלים (פער 6–14) + תדירות
    const gapScores = (mainStats || []).slice(0, 25).map(s => {
        const g = getGap(s.number);
        const bonus = (g >= 6 && g <= 14) ? 20 : (g >= 4 && g <= 20) ? 10 : 0;
        return { number: s.number, score: s.count + bonus };
    }).sort((a, b) => b.score - a.score).slice(0, 6);
    combos.push(create(gapScores.length ? gapScores : pickTop(hot, 6), strongHot[0]?.number || 1, 4));
    
    // 5. איזון פיזור – בחירה כך שפריסה על 1–37 (לא צפוף)
    const spread = [];
    const bands = [[1, 12], [13, 24], [25, 37]];
    bands.forEach(([lo, hi]) => {
        const inBand = (mainStats || []).filter(s => s.number >= lo && s.number <= hi).slice(0, 2);
        inBand.forEach(s => spread.push({ number: s.number }));
    });
    const spreadSorted = [...new Set(spread.map(s => s.number))].slice(0, 6).sort((a, b) => a - b).map(n => ({ number: n }));
    combos.push(create(spreadSorted.length >= 6 ? spreadSorted : [...spreadSorted, ...pickTop(hot, 6 - spreadSorted.length)], strongHot[0]?.number || 1, 5));
    
    // 6. זוגות מאמצע הרשימה (5–15) + השלמה
    const midPairs = (pairs || []).slice(4, 15);
    const set6 = new Set();
    midPairs.forEach(p => {
        if (!p || !p.pair) return;
        const [a, b] = p.pair.split('-').map(Number);
        if (!isNaN(a)) set6.add(a);
        if (!isNaN(b)) set6.add(b);
        if (set6.size >= 6) return;
    });
    const arr6 = set6.size >= 6 ? [...set6].slice(0, 6) : [...set6, ...(hot || []).map(h => h.number).filter(n => !set6.has(n))].slice(0, 6);
    combos.push(create(arr6.map(n => ({ number: n })), strongHot[0]?.number || 1, 6));
    
    // 7. שלישייה מובילה + 3 קרים (תדירות היסטורית)
    const set7 = new Set();
    if ((triplets || []).length) (triplets[0].triplet || '').split('-').forEach(n => { const x = parseInt(n); if (!isNaN(x)) set7.add(x); });
    (cold || []).slice(0, 10).forEach(c => { if (set7.size < 6 && c && c.number) set7.add(c.number); });
    if (set7.size < 6) (hot || []).forEach(h => { if (set7.size < 6 && h && h.number) set7.add(h.number); });
    combos.push(create([...set7].slice(0, 6).map(n => ({ number: n })), strongCold[0]?.number || strongHot[0]?.number || 1, 7));
    
    // 8. ממוצע נע – תדירות בחלון אחרון גבוהה מהקודם
    const w1 = (limited || []).slice(0, 20);
    const w2 = (limited || []).slice(20, 40);
    const f1 = {}, f2 = {};
    for (let i = 1; i <= 37; i++) f1[i] = f2[i] = 0;
    w1.forEach(row => { (row.numbers || []).forEach(n => { if (!isNaN(n)) f1[n]++; }); });
    w2.forEach(row => { (row.numbers || []).forEach(n => { if (!isNaN(n)) f2[n]++; }); });
    const moving = Object.entries(f1).map(([n, v]) => ({ number: parseInt(n), score: (v || 0) - (f2[n] || 0) })).sort((a, b) => b.score - a.score).slice(0, 6);
    combos.push(create(moving.length ? moving : pickTop(hot, 6), strongHot[0]?.number || 1, 8));
    
    // 9. אנטי-אחרון – מתחמק מ-3 הגרלות אחרונות, בוחר בשלים/חמים
    const last3 = new Set();
    (limited || []).slice(0, 3).forEach(row => { (row.numbers || []).forEach(n => { if (!isNaN(n)) last3.add(n); }); });
    const anti = (mainStats || []).filter(s => !last3.has(s.number)).map(s => ({ number: s.number, score: s.count + (getGap(s.number) >= 5 ? 5 : 0) })).sort((a, b) => b.score - a.score).slice(0, 6);
    combos.push(create(anti.length ? anti : pickTop(hot, 6), strongHot[0]?.number || 1, 9));
    
    // 10. מספרים בשלים – פער אופטימלי (5–16) + תדירות: לא הופיעו לאחרונה אבל מופיעים הרבה
    const dueScores = (mainStats || []).map(s => {
        const g = getGap(s.number);
        const dueBonus = (g >= 5 && g <= 16) ? 12 : (g >= 4 && g <= 20) ? 4 : 0;
        return { number: s.number, score: s.count + dueBonus };
    }).sort((a, b) => b.score - a.score).slice(0, 6);
    const dueNums = dueScores.length ? dueScores : pickTop(hot, 6);
    combos.push(create(dueNums, strongHot[0]?.number || 1, 10));
    
    // 11. תנודה – שונות בין חלונות (חם בחלון אחד, קר באחר)
    const v1 = (limited || []).slice(0, 25);
    const v2 = (limited || []).slice(25, 50);
    const vf1 = {}, vf2 = {};
    for (let i = 1; i <= 37; i++) vf1[i] = vf2[i] = 0;
    v1.forEach(row => { (row.numbers || []).forEach(n => { if (!isNaN(n)) vf1[n]++; }); });
    v2.forEach(row => { (row.numbers || []).forEach(n => { if (!isNaN(n)) vf2[n]++; }); });
    const variance = Object.entries(vf1).map(([n, v]) => ({ number: parseInt(n), score: Math.abs((v || 0) - (vf2[n] || 0)) })).sort((a, b) => b.score - a.score).slice(0, 6);
    combos.push(create(variance.length ? variance : pickTop(medium, 6), strongMedium[0]?.number || strongHot[0]?.number || 1, 11));
    
    // 12. חזרת מגמה – היו בטופ, ירדו, פער 5–15
    const wasTop = new Set((mainStats || []).slice(0, 15).map(s => s.number));
    const comeback = (mainStats || []).filter(s => wasTop.has(s.number)).map(s => {
        const g = getGap(s.number);
        return { number: s.number, score: (g >= 5 && g <= 15) ? s.count + 15 : s.count };
    }).sort((a, b) => b.score - a.score).slice(0, 6);
    combos.push(create(comeback.length ? comeback : pickTop(hot, 6), strongHot[0]?.number || 1, 12));
    
    // 13. סינרגיה מלאה – זוגות+שלישיות+רביעיות+תדירות+פער
    const synScores = {};
    for (let i = 1; i <= 37; i++) synScores[i] = 0;
    (mainStats || []).forEach((s, i) => { synScores[s.number] = (synScores[s.number] || 0) + (20 - i); });
    (pairs || []).slice(0, 20).forEach(p => { if (!p || !p.pair) return; p.pair.split('-').map(Number).forEach(n => { if (!isNaN(n)) synScores[n] = (synScores[n] || 0) + 2; }); });
    (triplets || []).slice(0, 10).forEach(t => { if (!t || !t.triplet) return; t.triplet.split('-').map(Number).forEach(n => { if (!isNaN(n)) synScores[n] = (synScores[n] || 0) + 3; }); });
    (quartets || []).slice(0, 5).forEach(q => { if (!q || !q.quartet) return; q.quartet.split('-').map(Number).forEach(n => { if (!isNaN(n)) synScores[n] = (synScores[n] || 0) + 4; }); });
    Object.keys(synScores).forEach(n => { const g = getGap(parseInt(n)); if (g >= 4 && g <= 18) synScores[n] += 5; });
    const synTop = Object.entries(synScores).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([n]) => ({ number: parseInt(n) }));
    combos.push(create(synTop, strongHot[0]?.number || 1, 13));
    
    // 14. ממוצע משוקלל – תדירות + מומנטום (5 אחרונות) + פער אופטימלי
    const last5 = (limited || []).slice(0, 5);
    const mom = {};
    for (let i = 1; i <= 37; i++) mom[i] = 0;
    last5.forEach(row => { (row.numbers || []).forEach(n => { if (!isNaN(n)) mom[n] += 4; }); });
    const weighted = (mainStats || []).map(s => ({
        number: s.number,
        score: s.count * 2 + (mom[s.number] || 0) + (getGap(s.number) >= 6 && getGap(s.number) <= 12 ? 8 : 0)
    })).sort((a, b) => b.score - a.score).slice(0, 6);
    combos.push(create(weighted.length ? weighted : pickTop(hot, 6), strongHot[0]?.number || 1, 14));

    const candidatePriority = buildForm2CandidatePriority(mainStats, hot, medium, cold);
    const diversified = diversifyForm2Combinations(combos, candidatePriority, {
        minimumCoverage: 30,
        maximumExposure: 7,
        maximumOverlap: 4
    });
    const strongRotation = buildForm2StrongRotation(strongHot, strongMedium, strongCold);
    diversified.forEach((combo, index) => {
        combo.strong = strongRotation[index];
    });

    return diversified;
}

// שילוב חכם - זוג מוביל + שלישייה שנייה (ללא חפיפה)
function generateSmartMixCombo(pairs, triplets, hot, strongHot, comboNum) {
    const result = new Set();
    
    // קח את הזוג המוביל
    if (pairs.length > 0) {
        const pairNums = pairs[0]?.pair.split('-').map(n => parseInt(n)) || [];
        pairNums.forEach(n => result.add(n));
    }
    
    // קח שלישייה שנייה (כדי למנוע חפיפה עם הראשונה)
    if (triplets.length > 1) {
        const tripletNums = triplets[1]?.triplet.split('-').map(n => parseInt(n)) || [];
        tripletNums.forEach(n => result.add(n));
    } else if (triplets.length > 0) {
        const tripletNums = triplets[0]?.triplet.split('-').map(n => parseInt(n)) || [];
        tripletNums.forEach(n => result.add(n));
    }
    
    // השלם מחמים
    let idx = 0;
    while (result.size < 6 && idx < hot.length) {
        if (!result.has(hot[idx].number)) result.add(hot[idx].number);
        idx++;
    }
    
    const nums = [...result].slice(0, 6).map(n => ({ number: n }));
    return createCombo(nums, strongHot[0]?.number || 1, comboNum, '🎯 זוג+שלישייה');
}

// מספרים בשלים - לא יצאו זמן רב אבל היסטורית חזקים
function generateDueNumbersCombo(mainStats, rawData, strongHot, strongMedium, comboNum) {
    // חשב פער מהופעה אחרונה לכל מספר
    const lastAppearance = {};
    rawData.forEach((row, idx) => {
        (row.numbers || []).forEach(num => {
            if (!isNaN(num) && num >= 1 && num <= 37 && lastAppearance[num] === undefined) lastAppearance[num] = idx;
        });
    });
    
    // חשב ציון לכל מספר: תדירות גבוהה + פער גדול = בשל
    const dueScores = mainStats.slice(0, 20).map(stat => {
        const gap = lastAppearance[stat.number] || rawData.length;
        // מספרים עם פער 5-20 הגרלות מקבלים בונוס
        const gapBonus = gap >= 5 && gap <= 20 ? gap * 3 : gap;
        return {
            number: stat.number,
            score: stat.count + gapBonus,
            gap: gap
        };
    }).sort((a, b) => b.score - a.score);
    
    const nums = dueScores.slice(0, 6);
    
    // מספר חזק - גם מבוסס בשלות
    const strongGaps = {};
    rawData.forEach((row, idx) => {
        const strong = row.strong;
        if (!isNaN(strong) && strongGaps[strong] === undefined) strongGaps[strong] = idx;
    });
    
    const allStrong = [...strongHot, ...strongMedium];
    const dueStrong = allStrong.sort((a, b) => {
        const gapA = strongGaps[a.number] || 100;
        const gapB = strongGaps[b.number] || 100;
        return gapB - gapA;
    })[0];
    
    return createCombo(nums, dueStrong?.number || 1, comboNum, '⏰ מספרים בשלים');
}

// שתי שלישיות מובילות
function generateDoubleTripletCombo(triplets, hot, strongHot, comboNum) {
    const result = new Set();
    
    // קח שלישייה ראשונה
    if (triplets.length > 0) {
        const triplet1 = triplets[0]?.triplet.split('-').map(n => parseInt(n)) || [];
        triplet1.forEach(n => result.add(n));
    }
    
    // קח שלישייה שנייה
    if (triplets.length > 1) {
        const triplet2 = triplets[1]?.triplet.split('-').map(n => parseInt(n)) || [];
        triplet2.forEach(n => result.add(n));
    }
    
    // השלם מחמים אם צריך
    let idx = 0;
    while (result.size < 6 && idx < hot.length) {
        if (!result.has(hot[idx].number)) result.add(hot[idx].number);
        idx++;
    }
    
    const nums = [...result].slice(0, 6).map(n => ({ number: n }));
    return createCombo(nums, strongHot[0]?.number || 1, comboNum, '🔗 2 שלישיות');
}

// ניתוח מגמות חכם - זיהוי מספרים במגמת עלייה
function generateTrendAnalysisCombo(mainStats, rawData, strongHot, comboNum) {
    const scores = {};
    
    // אתחל ציונים לכל המספרים
    for (let i = 1; i <= 37; i++) {
        scores[i] = 0;
    }
    
    // 1. ניתוח מגמה: השווה 20 אחרונות ל-20 שלפני
    const recent20 = rawData.slice(0, Math.min(20, rawData.length));
    const previous20 = rawData.slice(20, Math.min(40, rawData.length));
    
    const recentFreq = {};
    const previousFreq = {};
    
    recent20.forEach(row => {
        (row.numbers || []).forEach(num => {
            if (!isNaN(num) && num >= 1 && num <= 37) recentFreq[num] = (recentFreq[num] || 0) + 1;
        });
    });
    
    previous20.forEach(row => {
        (row.numbers || []).forEach(num => {
            if (!isNaN(num) && num >= 1 && num <= 37) previousFreq[num] = (previousFreq[num] || 0) + 1;
        });
    });
    
    // מספרים במגמת עלייה מקבלים בונוס גדול
    for (let i = 1; i <= 37; i++) {
        const recentCount = recentFreq[i] || 0;
        const previousCount = previousFreq[i] || 0;
        const trend = recentCount - previousCount;
        scores[i] += trend * 15; // בונוס למגמה עולה
    }
    
    // 2. ניתוח פער - מספרים שלא הופיעו זמן רב אבל היסטורית חזקים
    const lastAppearance = {};
    rawData.forEach((row, idx) => {
        (row.numbers || []).forEach(num => {
            if (!isNaN(num) && num >= 1 && num <= 37 && lastAppearance[num] === undefined) lastAppearance[num] = idx;
        });
    });
    
    // מספרים שלא הופיעו 10+ הגרלות מקבלים בונוס
    for (let i = 1; i <= 37; i++) {
        const gap = lastAppearance[i] || rawData.length;
        if (gap >= 10 && gap <= 25) {
            scores[i] += 10; // "בשל" להופעה
        }
    }
    
    // 3. בונוס מתדירות כללית
    mainStats.forEach((stat, idx) => {
        scores[stat.number] += Math.max(0, 20 - idx); // המובילים מקבלים בונוס
    });
    
    // 4. "מומנטום" - מספרים שהופיעו ב-5 אחרונות
    const last5 = rawData.slice(0, Math.min(5, rawData.length));
    last5.forEach(row => {
        (row.numbers || []).forEach(num => {
            if (!isNaN(num)) scores[num] = (scores[num] || 0) + 8;
        });
    });
    
    // מיין לפי ציון ובחר 6 מובילים
    const sorted = Object.entries(scores)
        .map(([num, score]) => ({ number: parseInt(num), score }))
        .sort((a, b) => b.score - a.score);
    
    const nums = sorted.slice(0, 6);
    const strongNum = strongHot[0]?.number || 1;
    
    return createCombo(nums, strongNum, comboNum, '📈 ניתוח מגמות');
}

// קומבינציה בלתי צפויה - מעורבב עם חזרות קבועות ומספר חזק שונה מהאחרון
function generateUnpredictableCombo(hot, medium, cold, pairs, triplets, strongHot, strongMedium, strongCold, rawData, comboNum) {
    const result = new Set();
    
    // קח מספרים מזוג חוזר מוביל (דטרמיניסטי - הראשון)
    if (pairs.length > 0) {
        const pairNums = pairs[0]?.pair.split('-').map(n => parseInt(n)) || [];
        pairNums.forEach(n => result.add(n));
    }
    
    // קח מספר משלישייה חוזרת מובילה (השנייה להימנע מכפילות)
    if (triplets.length > 1) {
        const tripletNums = triplets[1]?.triplet.split('-').map(n => parseInt(n)) || [];
        // קח רק מספר אחד או שניים מהשלישייה
        tripletNums.slice(0, 2).forEach(n => result.add(n));
    } else if (triplets.length > 0) {
        const tripletNums = triplets[0]?.triplet.split('-').map(n => parseInt(n)) || [];
        tripletNums.slice(0, 2).forEach(n => result.add(n));
    }
    
    // השלם מ-hot, medium, cold לפי סדר (דטרמיניסטי)
    const fillOrder = [...hot.slice(0, 3), ...medium.slice(0, 2), ...cold.slice(0, 2)];
    for (const item of fillOrder) {
        if (result.size >= 6) break;
        if (!result.has(item.number)) result.add(item.number);
    }
    
    // מספר חזק שונה מההגרלה האחרונה
    let lastStrong = null;
    if (rawData && rawData.length > 0) {
        lastStrong = rawData[0].strong;
    }
    
    // בחר מספר חזק שונה מהאחרון (דטרמיניסטי - הראשון שעונה על התנאי)
    const allStrong = [...strongHot, ...strongMedium, ...strongCold];
    const differentStrong = allStrong.filter(s => s.number !== lastStrong);
    const strongNum = differentStrong.length > 0 
        ? differentStrong[0]?.number 
        : (allStrong[0]?.number || 1);
    
    const nums = [...result].slice(0, 6).map(n => ({ number: n }));
    
    return createCombo(nums, strongNum, comboNum, '🎲 בלתי צפוי (חזק ≠ אחרון)');
}

// קומבינציה מבוססת רביעיות + שלישיות עם חפיפה
function generateQuartetTripletOverlapCombo(quartets, triplets, hot, strongHot, comboNum) {
    const result = new Set();
    
    // קח את הרביעייה המובילה
    const topQuartet = quartets[0]?.quartet.split('-').map(n => parseInt(n)) || [];
    topQuartet.forEach(n => result.add(n));
    
    // קח את השלישייה המובילה
    const topTriplet = triplets[0]?.triplet.split('-').map(n => parseInt(n)) || [];
    topTriplet.forEach(n => result.add(n));
    
    // מצא חפיפה - מספרים שמופיעים גם ברביעייה וגם בשלישייה
    const overlap = topQuartet.filter(n => topTriplet.includes(n));
    
    // אם יש יותר מ-6 מספרים, העדף את החופפים ואז את השאר
    if (result.size > 6) {
        const prioritized = [...overlap]; // המספרים החופפים בראש
        const remaining = [...result].filter(n => !overlap.includes(n));
        const final = [...prioritized, ...remaining].slice(0, 6);
        result.clear();
        final.forEach(n => result.add(n));
    }
    
    // אם אין מספיק מספרים, השלם מהשלישיות והרביעיות הבאות
    let idx = 1;
    while (result.size < 6 && idx < Math.min(5, quartets.length)) {
        const nextQuartet = quartets[idx]?.quartet.split('-').map(n => parseInt(n)) || [];
        nextQuartet.forEach(n => {
            if (result.size < 6) result.add(n);
        });
        idx++;
    }
    
    // עדיין לא מספיק? קח מהחמים
    while (result.size < 6 && hot.length > 0) {
        const hotNum = hot[result.size % hot.length]?.number;
        if (hotNum && !result.has(hotNum)) result.add(hotNum);
        else break;
    }
    
    const nums = [...result].slice(0, 6).map(n => ({ number: n }));
    const strongNum = strongHot[0]?.number || 1;
    
    return createCombo(nums, strongNum, comboNum, '🔗 רביעיות+שלישיות (חפיפה)');
}

function generateAICombo(hot, medium, cold, strongHot, mainStats, rawData, num, strategy) {
    const scores = {};
    
    mainStats.forEach(stat => {
        scores[stat.number] = stat.count * 2; // Base score from frequency
    });
    
    // Boost from recent appearances
    const recent = rawData.slice(0, Math.min(5, rawData.length));
    recent.forEach(row => {
        (row.numbers || []).forEach(n => {
            if (!isNaN(n)) scores[n] = (scores[n] || 0) + 5;
        });
    });
    
    const sortedByScore = Object.entries(scores)
        .map(([num, score]) => ({ number: parseInt(num), score }))
        .sort((a, b) => b.score - a.score);
    
    const nums = sortedByScore.slice(0, 6);
    
    return createCombo(nums, pickRandom(strongHot, 1)[0]?.number || 1, num, strategy);
}

function createCombo(nums, strongNum, id, strategy) {
    return {
        comboNum: id,
        strategy,
        numbers: nums.map(n => n.number).sort((a, b) => a - b).slice(0, 6),
        strong: strongNum
    };
}

// בחירה דטרמיניסטית - תמיד לוקח את הראשונים (לפי תדירות)
function pickTop(arr, count) {
    if (!arr || arr.length === 0) return [];
    return arr.slice(0, Math.min(count, arr.length));
}

// בחירה עם אופסט - לוקח מספרים מאמצע הרשימה
function pickOffset(arr, count, offset = 0) {
    if (!arr || arr.length === 0) return [];
    const start = Math.min(offset, arr.length - count);
    return arr.slice(start, start + Math.min(count, arr.length));
}

// שמירת תאימות - pickRandom עכשיו דטרמיניסטי
function pickRandom(arr, count) {
    return pickTop(arr, count);
}

  function buildFrequencyAnalysis(data) {
    const numberFreq = {};
    const strongFreq = {};
    for (let rowIdx = 0; rowIdx < data.length; rowIdx++) {
      const row = data[rowIdx];
      const nums = row.numbers || [];
      for (let i = 0; i < nums.length; i++) {
        const num = nums[i];
        if (!isNaN(num) && num >= 1 && num <= 37) {
          numberFreq[num] = (numberFreq[num] || 0) + 1;
        }
      }
      const strong = row.strong;
      if (!isNaN(strong) && strong >= 1 && strong <= 7) {
        strongFreq[strong] = (strongFreq[strong] || 0) + 1;
      }
    }
    const sortedNumbers = Object.entries(numberFreq)
      .map(([num, count]) => ({
        number: parseInt(num, 10),
        count,
        percentage: ((count / Math.max(1, data.length)) * 100).toFixed(1),
      }))
      .sort((a, b) => b.count - a.count);
    const sortedStrong = Object.entries(strongFreq)
      .map(([num, count]) => ({
        number: parseInt(num, 10),
        count,
        percentage: ((count / Math.max(1, data.length)) * 100).toFixed(1),
      }))
      .sort((a, b) => b.count - a.count);
    const third = Math.ceil(sortedNumbers.length / 3) || 1;
    const hot = sortedNumbers.slice(0, third);
    const medium = sortedNumbers.slice(third, third * 2);
    const cold = sortedNumbers.slice(third * 2);
    const strongThird = Math.ceil(sortedStrong.length / 3) || 1;
    const strongHot = sortedStrong.slice(0, strongThird);
    const strongMedium = sortedStrong.slice(strongThird, strongThird * 2);
    const strongCold = sortedStrong.slice(strongThird * 2);
    const pairs = analyzePairs(data);
    const triplets = analyzeTriplets(data);
    const quartets = analyzeQuartets(data);
    return {
      totalDraws: data.length,
      numbers: sortedNumbers,
      strong: sortedStrong,
      hot,
      medium,
      cold,
      strongHot,
      strongMedium,
      strongCold,
      pairs,
      triplets,
      quartets,
    };
  }

  function generateFormCombinations(form, analysis, rawData) {
    const args = [
      analysis.hot,
      analysis.medium,
      analysis.cold,
      analysis.strongHot,
      analysis.strongMedium,
      analysis.strongCold,
      analysis.pairs,
      analysis.numbers,
      analysis.triplets,
      analysis.quartets,
      rawData,
    ];
    if (form === "form2") return generateCombinationsForm2.apply(null, args);
    return generateCombinations.apply(null, args);
  }

  function countHits(combo, draw) {
    const drawNumbers = draw && draw.numbers ? draw.numbers.map(Number) : [];
    const drawStrong = draw ? Number(draw.strong) : NaN;
    const nums = combo && combo.numbers ? combo.numbers.map(Number) : [];
    const regularMatches = nums.filter(function (n) {
      return drawNumbers.includes(n);
    }).length;
    const strongMatch = combo && Number(combo.strong) === drawStrong ? 1 : 0;
    return { regularMatches: regularMatches, strongMatch: strongMatch };
  }

  function rankStrategies(aggregates) {
    return (aggregates || []).slice().sort(function (a, b) {
      if (b.avgRegular !== a.avgRegular) return b.avgRegular - a.avgRegular;
      if (b.count4Plus !== a.count4Plus) return b.count4Plus - a.count4Plus;
      if (b.count3Plus !== a.count3Plus) return b.count3Plus - a.count3Plus;
      return b.strongRate - a.strongRate;
    });
  }

  function runWalkForwardBacktest(draws, options) {
    const opts = Object.assign(
      {
        form: "main",
        evalCount: 50,
        minHistory: 30,
      },
      options || {}
    );
    const list = draws || [];
    const maxEval = Math.min(opts.evalCount, Math.max(0, list.length - opts.minHistory));
    const perStrategy = {};

    for (let i = 0; i < maxEval; i++) {
      const target = list[i];
      const history = list.slice(i + 1);
      if (history.length < opts.minHistory) continue;
      const analysis = buildFrequencyAnalysis(history);
      const combos = generateFormCombinations(opts.form, analysis, history);
      (combos || []).forEach(function (combo) {
        const key = String(combo.comboNum != null ? combo.comboNum : combo.strategy);
        if (!perStrategy[key]) {
          perStrategy[key] = {
            comboNum: combo.comboNum,
            strategy: combo.strategy,
            sampleSize: 0,
            totalRegular: 0,
            count3Plus: 0,
            count4Plus: 0,
            strongHits: 0,
          };
        }
        const hits = countHits(combo, target);
        const bucket = perStrategy[key];
        bucket.sampleSize += 1;
        bucket.totalRegular += hits.regularMatches;
        if (hits.regularMatches >= 3) bucket.count3Plus += 1;
        if (hits.regularMatches >= 4) bucket.count4Plus += 1;
        bucket.strongHits += hits.strongMatch;
      });
    }

    const aggregates = Object.values(perStrategy).map(function (bucket) {
      const n = Math.max(1, bucket.sampleSize);
      return {
        comboNum: bucket.comboNum,
        strategy: bucket.strategy,
        sampleSize: bucket.sampleSize,
        avgRegular: Number((bucket.totalRegular / n).toFixed(3)),
        count3Plus: bucket.count3Plus,
        count4Plus: bucket.count4Plus,
        strongHits: bucket.strongHits,
        strongRate: Number(((bucket.strongHits / n) * 100).toFixed(1)),
      };
    });

    return {
      form: opts.form,
      evalCount: maxEval,
      minHistory: opts.minHistory,
      rankings: rankStrategies(aggregates),
    };
  }

  return {
    analyzePairs: analyzePairs,
    analyzeTriplets: analyzeTriplets,
    analyzeQuartets: analyzeQuartets,
    buildFrequencyAnalysis: buildFrequencyAnalysis,
    generateCombinations: generateCombinations,
    generateCombinationsForm2: generateCombinationsForm2,
    generateFormCombinations: generateFormCombinations,
    diversifyForm2Combinations: diversifyForm2Combinations,
    buildForm2StrongRotation: buildForm2StrongRotation,
    getForm2DiversityMetrics: getForm2DiversityMetrics,
    normalizeForm2Numbers: normalizeForm2Numbers,
    getForm2CombinationKey: getForm2CombinationKey,
    getForm2Overlap: getForm2Overlap,
    createCombo: createCombo,
    pickTop: pickTop,
    pickRandom: pickRandom,
    pickOffset: pickOffset,
    countHits: countHits,
    rankStrategies: rankStrategies,
    runWalkForwardBacktest: runWalkForwardBacktest,
    FORM2_STRATEGY_LABELS: FORM2_STRATEGY_LABELS,
  };
});
