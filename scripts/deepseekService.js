const DeepSeekService = (function() {

  const CANVAS_WIDTH = 800;
  const CANVAS_HEIGHT = 400;
  const GRID_COLS = 16;
  const GRID_ROWS = 8;
  const PIXELS_PER_DIV = CANVAS_WIDTH / GRID_COLS;

  function smoothSignal(signal, windowSize) {
    const result = new Float32Array(signal.length);
    const half = Math.floor(windowSize / 2);
    for (let i = 0; i < signal.length; i++) {
      let sum = 0, count = 0;
      for (let j = Math.max(0, i - half); j <= Math.min(signal.length - 1, i + half); j++) {
        sum += signal[j];
        count++;
      }
      result[i] = sum / count;
    }
    return result;
  }

  function extractImageFeatures(imageDataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const w = canvas.width;
        const h = canvas.height;

        const gray = new Float32Array(w * h);
        for (let i = 0; i < w * h; i++) {
          const idx = i * 4;
          gray[i] = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        }

        let histogram = new Uint32Array(256);
        for (let i = 0; i < gray.length; i++) {
          histogram[Math.round(gray[i])]++;
        }
        let totalPixels = gray.length;
        let sum = 0;
        for (let i = 0; i < 256; i++) sum += i * histogram[i];
        let sumB = 0, wB = 0, maxVariance = 0, threshold = 128;
        for (let i = 0; i < 256; i++) {
          wB += histogram[i];
          if (wB === 0) continue;
          let wF = totalPixels - wB;
          if (wF === 0) break;
          sumB += i * histogram[i];
          let mB = sumB / wB;
          let mF = (sum - sumB) / wF;
          let variance = wB * wF * (mB - mF) * (mB - mF);
          if (variance > maxVariance) {
            maxVariance = variance;
            threshold = i;
          }
        }

        const marginX = Math.floor(w * 0.05);
        const marginY = Math.floor(h * 0.05);
        const startX = marginX;
        const endX = w - marginX;
        const sampleWidth = endX - startX;

        const centerY = Math.floor(h / 2);
        const upperY1 = marginY;
        const upperY2 = centerY - 5;
        const lowerY1 = centerY + 5;
        const lowerY2 = h - marginY;

        function detectDisplayMode() {
          let upperDarkPixels = 0;
          let lowerDarkPixels = 0;
          let centerDarkPixels = 0;
          let fullDarkPixels = 0;

          for (let y = marginY; y < h - marginY; y++) {
            for (let x = startX; x < endX; x++) {
              if (gray[y * w + x] < threshold) {
                fullDarkPixels++;
                if (y < centerY - 20) upperDarkPixels++;
                else if (y > centerY + 20) lowerDarkPixels++;
                else centerDarkPixels++;
              }
            }
          }

          const totalArea = (h - 2 * marginY) * sampleWidth;
          const upperRatio = upperDarkPixels / totalArea;
          const lowerRatio = lowerDarkPixels / totalArea;
          const centerRatio = centerDarkPixels / totalArea;
          const fullRatio = fullDarkPixels / totalArea;

          let upperBandHeight = 0;
          for (let y = upperY1; y < upperY2; y++) {
            let hasDark = false;
            for (let x = startX; x < endX; x++) {
              if (gray[y * w + x] < threshold) { hasDark = true; break; }
            }
            if (hasDark) upperBandHeight++;
          }

          let lowerBandHeight = 0;
          for (let y = lowerY1; y < lowerY2; y++) {
            let hasDark = false;
            for (let x = startX; x < endX; x++) {
              if (gray[y * w + x] < threshold) { hasDark = true; break; }
            }
            if (hasDark) lowerBandHeight++;
          }

          const hasUpperBand = upperBandHeight > (upperY2 - upperY1) * 0.3;
          const hasLowerBand = lowerBandHeight > (lowerY2 - lowerY1) * 0.3;
          const hasBothBands = hasUpperBand && hasLowerBand;

          let xSamples = 100;
          let ySamples = 100;
          let hitCount = 0;
          let missCount = 0;
          let hitAfterMiss = 0;
          let lastWasHit = false;

          for (let ix = 0; ix < xSamples; ix++) {
            const x = startX + Math.floor(ix * sampleWidth / xSamples);
            let foundHit = false;
            for (let iy = 0; iy < ySamples; iy++) {
              const y = marginY + Math.floor(iy * (h - 2 * marginY) / ySamples);
              if (gray[y * w + x] < threshold) {
                foundHit = true;
                break;
              }
            }
            if (foundHit) {
              hitCount++;
              if (!lastWasHit && missCount > 3) hitAfterMiss++;
              lastWasHit = true;
              missCount = 0;
            } else {
              missCount++;
              lastWasHit = false;
            }
          }

          const yVariations = [];
          for (let x = startX; x < endX; x += 5) {
            let minY = h, maxY = 0;
            for (let y = marginY; y < h - marginY; y++) {
              if (gray[y * w + x] < threshold) {
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
              }
            }
            if (minY < h) yVariations.push(maxY - minY);
          }
          const avgYSpread = yVariations.length > 0 ?
            yVariations.reduce((s, v) => s + v, 0) / yVariations.length : 0;
          const ySpreadRatio = avgYSpread / (h - 2 * marginY);

          let displayMode = 'independent';
          let modeConfidence = 0.5;

          if (hasBothBands && ySpreadRatio < 0.6) {
            displayMode = 'independent';
            modeConfidence = 0.8;
          } else if (!hasBothBands && ySpreadRatio > 0.5 && hitAfterMiss < 3) {
            displayMode = 'vertical';
            modeConfidence = 0.7;
          } else if (fullRatio > 0.02 && !hasBothBands) {
            displayMode = 'overlay';
            modeConfidence = 0.6;
          }

          return { displayMode, modeConfidence, hasBothBands, ySpreadRatio, fullRatio, hitAfterMiss };
        }

        const modeDetection = detectDisplayMode();

        function extractWaveProfile(yStart, yEnd) {
          const profile = new Float32Array(sampleWidth);
          for (let x = startX; x < endX; x++) {
            let totalWeight = 0;
            let weightedY = 0;
            let darkestY = Math.floor((yStart + yEnd) / 2);
            let darkestVal = 255;

            for (let y = yStart; y < yEnd; y++) {
              const val = gray[y * w + x];
              if (val < darkestVal) {
                darkestVal = val;
                darkestY = y;
              }
              if (val < threshold) {
                const weight = (threshold - val) / threshold;
                totalWeight += weight;
                weightedY += y * weight;
              }
            }
            profile[x - startX] = totalWeight > 0 ? weightedY / totalWeight : darkestY;
          }
          return profile;
        }

        function normalizeProfile(profile) {
          let minY = Infinity, maxY = -Infinity;
          for (let i = 0; i < profile.length; i++) {
            if (profile[i] < minY) minY = profile[i];
            if (profile[i] > maxY) maxY = profile[i];
          }
          const rangeY = maxY - minY || 1;
          const normalized = new Float32Array(profile.length);
          for (let i = 0; i < profile.length; i++) {
            normalized[i] = 1 - ((profile[i] - minY) / rangeY) * 2;
          }
          return { normalized, minY, maxY, rangeY };
        }

        function countZeroCrossings(signal) {
          let crossings = 0;
          let lastSign = signal[0] >= 0 ? 1 : -1;
          for (let i = 1; i < signal.length; i++) {
            const sign = signal[i] >= 0 ? 1 : -1;
            if (sign !== lastSign) {
              crossings++;
              lastSign = sign;
            }
          }
          return crossings;
        }

        function analyzeWaveShape(signal, sampleLen) {
          const flatThresholdLow = 0.5;
          const flatThresholdHigh = 0.85;
          let flatHighCount = 0, flatLowCount = 0;
          let flatHighStrict = 0, flatLowStrict = 0;
          for (let i = 0; i < sampleLen; i++) {
            if (signal[i] > flatThresholdHigh) flatHighStrict++;
            if (signal[i] < -flatThresholdHigh) flatLowStrict++;
            if (signal[i] > flatThresholdLow) flatHighCount++;
            if (signal[i] < -flatThresholdLow) flatLowCount++;
          }
          const flatRatio = (flatHighCount + flatLowCount) / sampleLen;
          const flatRatioHigh = (flatHighStrict + flatLowStrict) / sampleLen;

          const bins = 20;
          const histBins = new Uint32Array(bins);
          for (let i = 0; i < sampleLen; i++) {
            const bin = Math.min(bins - 1, Math.floor((signal[i] + 1) / 2 * bins));
            histBins[bin]++;
          }
          const midBin = Math.floor(bins / 2);
          const lowBins = histBins.slice(0, midBin).reduce((s, v) => s + v, 0);
          const highBins = histBins.slice(midBin).reduce((s, v) => s + v, 0);
          const midBins = histBins[midBin] + (histBins[midBin - 1] || 0) + (histBins[midBin + 1] || 0);
          const bimodality = lowBins > 0 && highBins > 0 ?
            1 - (midBins / (Math.min(lowBins, highBins) * 0.5 + 1)) : 0;

          let maxEdgeSlope = 0;
          for (let i = 1; i < sampleLen; i++) {
            const slope = Math.abs(signal[i] - signal[i - 1]);
            if (slope > maxEdgeSlope) maxEdgeSlope = slope;
          }

          let riseSlopes = [], fallSlopes = [];
          for (let i = 1; i < sampleLen; i++) {
            const diff = signal[i] - signal[i - 1];
            if (diff > 0.005) riseSlopes.push(diff);
            if (diff < -0.005) fallSlopes.push(Math.abs(diff));
          }
          const avgRise = riseSlopes.length > 0 ? riseSlopes.reduce((s, v) => s + v, 0) / riseSlopes.length : 0;
          const avgFall = fallSlopes.length > 0 ? fallSlopes.reduce((s, v) => s + v, 0) / fallSlopes.length : 0;
          const slopeRatio = Math.min(avgRise, avgFall) / (Math.max(avgRise, avgFall) || 1);

          let derivSignChanges = 0;
          let lastDerivSign = signal[1] - signal[0] >= 0 ? 1 : -1;
          for (let i = 2; i < sampleLen; i++) {
            const sign = signal[i] - signal[i - 1] >= 0 ? 1 : -1;
            if (sign !== lastDerivSign) { derivSignChanges++; lastDerivSign = sign; }
          }
          const derivSmoothness = derivSignChanges / sampleLen;

          const meanVal = signal.reduce((s, v) => s + v, 0) / sampleLen;
          const variance = signal.reduce((s, v) => s + (v - meanVal) ** 2, 0) / sampleLen;
          const rms = Math.sqrt(variance);

          let peakVal = 0;
          for (let i = 0; i < sampleLen; i++) {
            if (Math.abs(signal[i]) > peakVal) peakVal = Math.abs(signal[i]);
          }
          const crestFactor = peakVal / (rms || 1);

          let zeroCrossIntervals = [];
          let lastCross = 0;
          for (let i = 1; i < sampleLen; i++) {
            if ((signal[i] >= 0) !== (signal[i - 1] >= 0)) {
              if (lastCross > 0) zeroCrossIntervals.push(i - lastCross);
              lastCross = i;
            }
          }
          let zeroCrossRegularity = 0;
          if (zeroCrossIntervals.length > 1) {
            const meanInterval = zeroCrossIntervals.reduce((s, v) => s + v, 0) / zeroCrossIntervals.length;
            const intervalVariance = zeroCrossIntervals.reduce((s, v) => s + (v - meanInterval) ** 2, 0) / zeroCrossIntervals.length;
            zeroCrossRegularity = 1 - Math.min(1, Math.sqrt(intervalVariance) / (meanInterval || 1));
          }

          const lag = Math.min(20, Math.floor(sampleLen / 4));
          let sumSq = 0, sumProduct = 0;
          for (let i = 0; i < sampleLen - lag; i++) {
            sumSq += signal[i] * signal[i];
            sumProduct += signal[i] * signal[i + lag];
          }
          const autocorrelation = sumSq > 0 ? Math.abs(sumProduct / sumSq) : 0;

          const diffMagnitudes = new Float32Array(sampleLen - 1);
          for (let i = 1; i < sampleLen; i++) {
            diffMagnitudes[i - 1] = Math.abs(signal[i] - signal[i - 1]);
          }
          const avgDiff = diffMagnitudes.reduce((s, v) => s + v, 0) / diffMagnitudes.length;
          const diffVariance = diffMagnitudes.reduce((s, v) => s + (v - avgDiff) ** 2, 0) / diffMagnitudes.length;
          const diffCV = avgDiff > 0 ? Math.sqrt(diffVariance) / avgDiff : 0;

          let uniformBins = new Uint32Array(10);
          for (let i = 0; i < sampleLen; i++) {
            const bin = Math.min(9, Math.floor((signal[i] + 1) / 2 * 10));
            uniformBins[bin]++;
          }
          const expectedCount = sampleLen / 10;
          let chiSq = 0;
          for (let i = 0; i < 10; i++) {
            chiSq += (uniformBins[i] - expectedCount) ** 2 / expectedCount;
          }
          const uniformityScore = 1 / (1 + chiSq / sampleLen);

          const segSize = Math.floor(sampleLen / 5);
          let segRMSValues = [];
          for (let s = 0; s < 5; s++) {
            let segSum = 0;
            for (let i = s * segSize; i < (s + 1) * segSize; i++) {
              segSum += signal[i] * signal[i];
            }
            segRMSValues.push(Math.sqrt(segSum / segSize));
          }
          const segRMSAvg = segRMSValues.reduce((a, b) => a + b, 0) / 5;
          const segRMSVariance = segRMSValues.reduce((s, v) => s + (v - segRMSAvg) ** 2, 0) / 5;
          const amplitudeConsistency = segRMSAvg > 0 ? 1 - Math.min(1, Math.sqrt(segRMSVariance) / segRMSAvg) : 0;

          const isNoiseLike = derivSmoothness > 0.25 && autocorrelation < 0.3 && uniformityScore > 0.6;

          let highSamples = 0, lowSamples = 0;
          const dutyThreshold = 0.3;
          for (let i = 0; i < sampleLen; i++) {
            if (signal[i] > dutyThreshold) highSamples++;
            else if (signal[i] < -dutyThreshold) lowSamples++;
          }
          const activeSamples = highSamples + lowSamples;
          const dutyCycle = activeSamples > 0 ? highSamples / activeSamples : 0.5;
          const dutyAsymmetry = Math.abs(dutyCycle - 0.5);

          let inHigh = false, highRuns = [], lowRuns = [], currentRun = 0;
          for (let i = 0; i < sampleLen; i++) {
            const isHigh = signal[i] > dutyThreshold;
            if (isHigh === inHigh) {
              currentRun++;
            } else {
              if (currentRun > 0) {
                (inHigh ? highRuns : lowRuns).push(currentRun);
              }
              currentRun = 1;
              inHigh = isHigh;
            }
          }
          if (currentRun > 0) (inHigh ? highRuns : lowRuns).push(currentRun);
          const numPulses = Math.max(highRuns.length, lowRuns.length);
          const avgHighRun = highRuns.length > 0 ? highRuns.reduce((s, v) => s + v, 0) / highRuns.length : 0;
          const avgLowRun = lowRuns.length > 0 ? lowRuns.reduce((s, v) => s + v, 0) / lowRuns.length : 0;
          const runRatio = avgLowRun > 0 && avgHighRun > 0 ? Math.max(avgHighRun, avgLowRun) / Math.min(avgHighRun, avgLowRun) : 1;
          const pulseSharpness = maxEdgeSlope > 0.15 ? 1 : 0;

          const isPulseLike = dutyAsymmetry > 0.15 && runRatio > 1.8 && flatRatio > 0.3 && numPulses >= 2;

          const scores = { sine: 0, square: 0, triangle: 0, sawtooth: 0, noise: 0, pulse: 0 };

          if (!isNoiseLike) {
            if (!isPulseLike) {
              if (flatRatio > 0.4) scores.square += 30;
              else if (flatRatio > 0.3) scores.square += 20;
              if (flatRatioHigh > 0.2) scores.square += 15;
              if (bimodality > 0.2) scores.square += 20;
              if (bimodality > 0.4) scores.square += 10;
              if (maxEdgeSlope > 0.15) scores.square += 15;
              if (maxEdgeSlope > 0.25) scores.square += 10;
              if (crestFactor < 1.15) scores.square += 10;
              if (flatRatio > 0.3 && bimodality > 0.15) scores.square += 15;
            } else {
              if (flatRatio > 0.4) scores.square += 15;
              if (bimodality > 0.3) scores.square += 10;
              if (maxEdgeSlope > 0.2) scores.square += 8;
            }
          } else {
            if (flatRatio > 0.4) scores.square += Math.min(10, flatRatio * 15);
            if (bimodality > 0.4) scores.square += 5;
          }

          if (flatRatio < 0.15) scores.sine += 20;
          if (derivSmoothness < 0.12) scores.sine += 20;
          if (slopeRatio > 0.75) scores.sine += 15;
          if (crestFactor > 1.3 && crestFactor < 1.5) scores.sine += 15;
          if (bimodality < 0.1) scores.sine += 10;
          if (rms > 0.3 && rms < 0.75) scores.sine += 10;
          if (maxEdgeSlope < 0.1) scores.sine += 10;

          if (flatRatio < 0.1) scores.triangle += 15;
          if (slopeRatio > 0.65 && slopeRatio < 0.95) scores.triangle += 25;
          if (derivSmoothness > 0.04 && derivSmoothness < 0.18) scores.triangle += 20;
          if (crestFactor > 1.65 && crestFactor < 1.85) scores.triangle += 20;
          if (maxEdgeSlope < 0.08) scores.triangle += 10;

          if (flatRatio < 0.1) scores.sawtooth += 15;
          if (slopeRatio < 0.5 && slopeRatio > 0.05) scores.sawtooth += 25;
          if (avgRise > 0 && avgFall > 0) {
            const riseFallRatio = avgFall / avgRise;
            if (riseFallRatio > 2.5 || riseFallRatio < 0.4) scores.sawtooth += 20;
          }
          if (maxEdgeSlope > 0.08 && maxEdgeSlope < 0.2) scores.sawtooth += 10;

          if (derivSmoothness > 0.2) scores.noise += 25;
          if (derivSmoothness > 0.3) scores.noise += 15;
          if (derivSmoothness > 0.4) scores.noise += 10;
          if (autocorrelation < 0.3) scores.noise += 30;
          if (autocorrelation < 0.15) scores.noise += 15;
          if (zeroCrossRegularity < 0.3) scores.noise += 20;
          if (zeroCrossRegularity < 0.15) scores.noise += 10;
          if (uniformityScore > 0.7) scores.noise += 20;
          if (uniformityScore > 0.85) scores.noise += 10;
          if (amplitudeConsistency < 0.15) scores.noise += 15;
          if (diffCV < 0.6) scores.noise += 15;
          if (isNoiseLike) scores.noise += 25;

          if (flatRatio > 0.3) scores.pulse += 20;
          if (flatRatio > 0.4) scores.pulse += 10;
          if (dutyAsymmetry > 0.15) scores.pulse += 25;
          if (dutyAsymmetry > 0.3) scores.pulse += 15;
          if (runRatio > 1.8) scores.pulse += 20;
          if (runRatio > 3) scores.pulse += 15;
          if (numPulses >= 2) scores.pulse += 10;
          if (numPulses >= 4) scores.pulse += 5;
          if (pulseSharpness && dutyAsymmetry > 0.1) scores.pulse += 15;
          if (isPulseLike) scores.pulse += 20;
          if (crestFactor > 1.2 && dutyAsymmetry > 0.15) scores.pulse += 10;

          if (isPulseLike) {
            const pulsePenalty = Math.floor(scores.pulse * 0.25);
            scores.square = Math.max(0, scores.square - pulsePenalty);
          }

          if (isNoiseLike) {
            const noisePenalty = Math.floor(scores.noise * 0.3);
            scores.square = Math.max(0, scores.square - noisePenalty);
            scores.sine = Math.max(0, scores.sine - noisePenalty);
            scores.triangle = Math.max(0, scores.triangle - noisePenalty);
            scores.sawtooth = Math.max(0, scores.sawtooth - noisePenalty);
          }

          let bestType = 'sine';
          let bestScore = 0;
          for (const [type, score] of Object.entries(scores)) {
            if (score > bestScore) { bestScore = score; bestType = type; }
          }
          if (bestScore < 10) bestType = 'sine';

          return {
            bestType, bestScore, scores,
            flatRatio, flatRatioHigh, slopeRatio, rms, derivSmoothness,
            isBimodal: bimodality > 0.2, bimodality, maxEdgeSlope, crestFactor, zeroCrossRegularity,
            autocorrelation: autocorrelation.toFixed(3), diffCV: diffCV.toFixed(3),
            uniformityScore: uniformityScore.toFixed(3), amplitudeConsistency: amplitudeConsistency.toFixed(3),
            isNoiseLike,
            dutyCycle: dutyCycle.toFixed(3), dutyAsymmetry: dutyAsymmetry.toFixed(3),
            runRatio: runRatio.toFixed(2), numPulses, isPulseLike
          };
        }

        function analyzeProfile(yStart, yEnd) {
          const profile = extractWaveProfile(yStart, yEnd);
          const { normalized, rangeY } = normalizeProfile(profile);

          const lightSmooth = smoothSignal(normalized, 3);
          const shapeResult = analyzeWaveShape(lightSmooth, sampleWidth);

          const medSmooth = smoothSignal(normalized, Math.max(3, Math.floor(sampleWidth / 150)));
          const zeroCrossings = countZeroCrossings(medSmooth);
          const periods = Math.max(1, Math.round(zeroCrossings / 2));

          const regionHeight = yEnd - yStart;
          const peakDivisions = (rangeY / regionHeight) * (GRID_ROWS / 2);

          return {
            zeroCrossings, periods,
            peakDivisions: peakDivisions.toFixed(2),
            rangeYPixels: rangeY.toFixed(0),
            regionHeight,
            ...shapeResult
          };
        }

        const upperResult = analyzeProfile(upperY1, upperY2);
        const lowerResult = analyzeProfile(lowerY1, lowerY2);

        const fullProfile = extractWaveProfile(marginY, h - marginY);
        const { normalized: fullNormalized } = normalizeProfile(fullProfile);
        const fullLightSmooth = smoothSignal(fullNormalized, 3);
        const fullMedSmooth = smoothSignal(fullNormalized, Math.max(3, Math.floor(sampleWidth / 150)));
        const fullZeroCrossings = countZeroCrossings(fullMedSmooth);
        const fullPeriods = Math.max(1, Math.round(fullZeroCrossings / 2));
        const fullShapeResult = analyzeWaveShape(fullLightSmooth, sampleWidth);

        let darkRowCount = 0;
        for (let y = marginY; y < h - marginY; y++) {
          let darkPixels = 0;
          for (let x = startX; x < endX; x++) {
            if (gray[y * w + x] < threshold) darkPixels++;
          }
          if (darkPixels > sampleWidth * 0.05) darkRowCount++;
        }
        const hasMultipleWaveBands = darkRowCount > (h - 2 * marginY) * 0.6;

        const bestStdTimeDiv = findClosestStdValue(1.0, [0.1, 0.2, 0.5, 1, 2, 5, 10]);

        const features = {
          imageWidth: w,
          imageHeight: h,
          hasMultipleWaveBands,
          displayModeDetected: modeDetection.displayMode,
          modeConfidence: modeDetection.modeConfidence,
          hasBothBands: modeDetection.hasBothBands,
          ySpreadRatio: modeDetection.ySpreadRatio.toFixed(3),
          fullWaveRatio: modeDetection.fullRatio.toFixed(3),
          upperHalf: {
            periods: upperResult.periods,
            peakDivisions: upperResult.peakDivisions,
            waveShape: upperResult.bestType,
            shapeScore: upperResult.bestScore,
            scores: upperResult.scores,
            flatRatio: upperResult.flatRatio.toFixed(3),
            flatRatioHigh: upperResult.flatRatioHigh.toFixed(3),
            slopeRatio: upperResult.slopeRatio.toFixed(3),
            rms: upperResult.rms.toFixed(3),
            maxEdgeSlope: upperResult.maxEdgeSlope.toFixed(3),
            bimodality: upperResult.bimodality.toFixed(3),
            crestFactor: upperResult.crestFactor.toFixed(3),
            zeroCrossRegularity: upperResult.zeroCrossRegularity.toFixed(3),
            autocorrelation: upperResult.autocorrelation,
            diffCV: upperResult.diffCV,
            uniformityScore: upperResult.uniformityScore,
            amplitudeConsistency: upperResult.amplitudeConsistency,
            isNoiseLike: upperResult.isNoiseLike,
            dutyCycle: upperResult.dutyCycle,
            dutyAsymmetry: upperResult.dutyAsymmetry,
            runRatio: upperResult.runRatio,
            numPulses: upperResult.numPulses,
            isPulseLike: upperResult.isPulseLike,
            estimatedFreqAtStdTimeDiv: (upperResult.periods / (bestStdTimeDiv * GRID_COLS)).toFixed(2),
          },
          lowerHalf: {
            periods: lowerResult.periods,
            peakDivisions: lowerResult.peakDivisions,
            waveShape: lowerResult.bestType,
            shapeScore: lowerResult.bestScore,
            scores: lowerResult.scores,
            flatRatio: lowerResult.flatRatio.toFixed(3),
            flatRatioHigh: lowerResult.flatRatioHigh.toFixed(3),
            slopeRatio: lowerResult.slopeRatio.toFixed(3),
            rms: lowerResult.rms.toFixed(3),
            maxEdgeSlope: lowerResult.maxEdgeSlope.toFixed(3),
            bimodality: lowerResult.bimodality.toFixed(3),
            crestFactor: lowerResult.crestFactor.toFixed(3),
            zeroCrossRegularity: lowerResult.zeroCrossRegularity.toFixed(3),
            autocorrelation: lowerResult.autocorrelation,
            diffCV: lowerResult.diffCV,
            uniformityScore: lowerResult.uniformityScore,
            amplitudeConsistency: lowerResult.amplitudeConsistency,
            isNoiseLike: lowerResult.isNoiseLike,
            dutyCycle: lowerResult.dutyCycle,
            dutyAsymmetry: lowerResult.dutyAsymmetry,
            runRatio: lowerResult.runRatio,
            numPulses: lowerResult.numPulses,
            isPulseLike: lowerResult.isPulseLike,
            estimatedFreqAtStdTimeDiv: (lowerResult.periods / (bestStdTimeDiv * GRID_COLS)).toFixed(2),
          },
          fullImage: {
            periods: fullPeriods,
            waveShape: fullShapeResult.bestType,
            scores: fullShapeResult.scores,
            bimodality: fullShapeResult.bimodality.toFixed(3),
            maxEdgeSlope: fullShapeResult.maxEdgeSlope.toFixed(3),
            crestFactor: fullShapeResult.crestFactor.toFixed(3),
            autocorrelation: fullShapeResult.autocorrelation,
            uniformityScore: fullShapeResult.uniformityScore,
            isNoiseLike: fullShapeResult.isNoiseLike,
            dutyCycle: fullShapeResult.dutyCycle,
            dutyAsymmetry: fullShapeResult.dutyAsymmetry,
            isPulseLike: fullShapeResult.isPulseLike,
          },
          estimatedFreqRatio: upperResult.periods > 0 && lowerResult.periods > 0 ?
            simplifyRatio(upperResult.periods, lowerResult.periods) : 'unknown',
          gridInfo: { cols: GRID_COLS, rows: GRID_ROWS, pixelsPerDiv: PIXELS_PER_DIV }
        };

        resolve(features);
      };
      img.onerror = () => reject(new Error('图片加载失败'));
      img.src = imageDataUrl;
    });
  }

  function findClosestStdValue(value, stdValues) {
    let closest = stdValues[0];
    let minDiff = Infinity;
    for (const sv of stdValues) {
      const diff = Math.abs(Math.log10(value) - Math.log10(sv));
      if (diff < minDiff) { minDiff = diff; closest = sv; }
    }
    return closest;
  }

  function simplifyRatio(a, b) {
    function gcd(x, y) {
      x = Math.round(x * 100);
      y = Math.round(y * 100);
      while (y > 0) { const t = y; y = x % y; x = t; }
      return x / 100;
    }
    const g = gcd(a, b);
    if (g < 0.01) return `${a}:${b}`;
    return `${Math.round(a / g)}:${Math.round(b / g)}`;
  }

  function analyzeOffline(features) {
    const STD_TIME_DIVS = [0.1, 0.2, 0.5, 1, 2, 5, 10];
    const STD_VOLT_DIVS = [0.1, 0.2, 0.5, 1, 2, 5, 10];
    const STD_FREQUENCIES = [0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10];

    function pickBestTimeDiv(periods) {
      if (periods <= 0) return 1;
      let bestTimeDiv = 1;
      let bestScore = Infinity;
      for (const td of STD_TIME_DIVS) {
        const freq = periods / (td * GRID_COLS);
        if (freq < 0.05 || freq > 20) continue;
        let freqScore = Infinity;
        for (const sf of STD_FREQUENCIES) {
          const diff = Math.abs(Math.log10(freq) - Math.log10(sf));
          if (diff < freqScore) freqScore = diff;
        }
        const tdScore = Math.abs(Math.log10(td));
        const totalScore = freqScore * 2 + tdScore * 0.3;
        if (totalScore < bestScore) {
          bestScore = totalScore;
          bestTimeDiv = td;
        }
      }
      return bestTimeDiv;
    }

    function pickBestVoltDiv(peakDivisions) {
      if (peakDivisions <= 0) return 1;
      let bestDiv = 1;
      let bestDiff = Infinity;
      for (const vd of STD_VOLT_DIVS) {
        const amp = peakDivisions * vd;
        if (amp < 0.05 || amp > 15) continue;
        let ampScore = Infinity;
        for (const sa of [0.1, 0.2, 0.3, 0.5, 1, 2, 3, 4, 5, 8, 10]) {
          const diff = Math.abs(Math.log10(amp) - Math.log10(sa));
          if (diff < ampScore) ampScore = diff;
        }
        const totalDiff = ampScore + Math.abs(Math.log10(vd)) * 0.2;
        if (totalDiff < bestDiff) {
          bestDiff = totalDiff;
          bestDiv = vd;
        }
      }
      return bestDiv;
    }

    const modeNames = { independent: '独立显示', overlay: '同向叠加', vertical: '垂直叠加(李萨如图)' };
    const waveNames = { sine: '正弦波', square: '方波', triangle: '三角波', sawtooth: '锯齿波', noise: '噪声波', pulse: '脉冲波' };

    const displayMode = features.displayModeDetected || 'independent';
    const hasUpper = features.upperHalf.shapeScore > 5;
    const hasLower = features.lowerHalf.shapeScore > 5;

    let bestTimeDiv = 1;
    if (hasUpper && hasLower) {
      bestTimeDiv = pickBestTimeDiv(Math.max(features.upperHalf.periods, features.lowerHalf.periods));
    } else if (hasUpper) {
      bestTimeDiv = pickBestTimeDiv(features.upperHalf.periods);
    } else if (hasLower) {
      bestTimeDiv = pickBestTimeDiv(features.lowerHalf.periods);
    }

    const channels = [];

    function buildChannel(half, idx) {
      const waveType = half.waveShape || 'sine';
      const periods = half.periods || 1;
      const freq = Math.max(0.1, Math.min(10, periods / (bestTimeDiv * GRID_COLS)));
      const voltDiv = pickBestVoltDiv(half.peakDivisions);
      const amplitude = Math.max(0.1, Math.min(10, half.peakDivisions * voltDiv));
      const roundedFreq = Math.round(freq * 10) / 10;
      const roundedAmp = Math.round(amplitude * 10) / 10;

      return {
        waveType,
        frequency: roundedFreq,
        amplitude: roundedAmp,
        phase: idx === 1 ? 0 : (features.phaseDiff || 0),
        voltDiv,
        visibleCycles: periods.toFixed(2),
        peakDivisions: half.peakDivisions,
        waveName: waveNames[waveType] || waveType,
        shapeScore: half.shapeScore,
        measurementNote: `通道${idx}: ${waveNames[waveType]}，频率${roundedFreq}Hz，幅度${roundedAmp}V，峰峰值占${Number(half.peakDivisions).toFixed(1)}格`
      };
    }

    if (hasUpper) {
      const ch = buildChannel(features.upperHalf, 1);
      channels.push(ch);
    }
    if (hasLower) {
      const ch = buildChannel(features.lowerHalf, 2);
      channels.push(ch);
    }

    if (channels.length === 0) {
      const ch = buildChannel(features.fullImage.periods > 0 ? features.upperHalf : features.fullImage, 1);
      channels.push(ch);
    }

    const voltsDivResult = {};
    if (channels[0]) voltsDivResult['1'] = channels[0].voltDiv;
    if (channels[1]) voltsDivResult['2'] = channels[1].voltDiv;

    const avgScore = channels.reduce((s, c) => s + (c.shapeScore || 0), 0) / channels.length;
    const confidence = avgScore > 40 ? 'high' : avgScore > 20 ? 'medium' : 'low';

    let analysisParts = [];
    analysisParts.push(`【离线图像分析】显示模式：${modeNames[displayMode] || displayMode}。`);
    analysisParts.push(`时间分度值 ${bestTimeDiv} s/div，电压分度值 CH1=${voltsDivResult['1'] || 1}V/div、CH2=${voltsDivResult['2'] || 1}V/div。`);
    channels.forEach((ch, i) => {
      const T = ch.frequency > 0 ? (1 / ch.frequency).toFixed(3) : '∞';
      analysisParts.push(`通道${i + 1}: ${ch.waveName}，频率${ch.frequency}Hz（周期T=${T}s），峰峰值${ch.amplitude}V，峰峰值占${Number(ch.peakDivisions).toFixed(1)}格。`);
    });
    if (channels.length === 2) {
      const pd = features.phaseDiff || 0;
      analysisParts.push(`两通道相位差: ${pd}°${pd === 0 ? '（同相）' : pd === 90 ? '（正交）' : pd === 180 ? '（反相）' : ''}。`);
    }
    analysisParts.push(`\n【公式】频率 = 可见周期数 ÷ (Time/Div × ${GRID_COLS})；幅度 = 格数 × Volts/Div。`);

    return {
      displayMode,
      channels,
      phaseDiff: features.phaseDiff || 0,
      timeDiv: bestTimeDiv,
      voltsDiv: voltsDivResult,
      confidence,
      analysis: analysisParts.join(' '),
      isOffline: true
    };
  }

  function analyzeOscilloscopeState(state) {
    const {
      signalType, frequencies, peakValues, phaseDiff,
      timeDiv, voltsDiv, displayMode, inputActive
    } = state;

    const waveNames = {
      'sine': '正弦波', 'square': '方波', 'triangle': '三角波',
      'sawtooth': '锯齿波', 'noise': '噪声波', 'pulse': '脉冲波'
    };

    const channels = [];

    if (inputActive[1]) {
      const visibleCycles = frequencies[1] * timeDiv * GRID_COLS;
      const peakDivisions = peakValues[1] / voltsDiv[1];
      channels.push({
        waveType: signalType,
        frequency: frequencies[1],
        amplitude: peakValues[1],
        phase: 0,
        visibleCycles: visibleCycles.toFixed(2),
        peakDivisions: peakDivisions.toFixed(2),
        waveName: waveNames[signalType] || signalType,
        measurementNote: `通道1: ${visibleCycles.toFixed(1)}个周期可见，峰峰值占${peakDivisions.toFixed(1)}格`
      });
    }

    if (inputActive[2]) {
      const visibleCycles = frequencies[2] * timeDiv * GRID_COLS;
      const peakDivisions = peakValues[2] / voltsDiv[2];
      channels.push({
        waveType: signalType,
        frequency: frequencies[2],
        amplitude: peakValues[2],
        phase: phaseDiff,
        visibleCycles: visibleCycles.toFixed(2),
        peakDivisions: peakDivisions.toFixed(2),
        waveName: waveNames[signalType] || signalType,
        measurementNote: `通道2: ${visibleCycles.toFixed(1)}个周期可见，峰峰值占${peakDivisions.toFixed(1)}格`
      });
    }

    const analysis = generateEducationalAnalysis({
      signalType, frequencies, peakValues, phaseDiff,
      timeDiv, voltsDiv, displayMode, inputActive, channels
    });

    return {
      displayMode,
      channels,
      phaseDiff,
      timeDiv,
      voltsDiv: { '1': voltsDiv[1], '2': voltsDiv[2] },
      confidence: 'high',
      analysis,
      isDirectRead: true
    };
  }

  function generateEducationalAnalysis(params) {
    const { signalType, frequencies, peakValues, phaseDiff, timeDiv, voltsDiv, displayMode, inputActive } = params;
    const waveNames = {
      'sine': '正弦波', 'square': '方波', 'triangle': '三角波',
      'sawtooth': '锯齿波', 'noise': '噪声波', 'pulse': '脉冲波'
    };
    const modeNames = {
      'independent': '独立显示', 'overlay': '同向叠加', 'vertical': '垂直叠加(李萨如图)'
    };

    let parts = [];
    parts.push(`【测量结果】当前显示模式为${modeNames[displayMode] || displayMode}。`);
    parts.push(`时间分度值 ${timeDiv} s/div，电压分度值 CH1=${voltsDiv[1]}V/div、CH2=${voltsDiv[2]}V/div。`);

    if (inputActive[1]) {
      const T1 = 1 / frequencies[1];
      const visibleCycles1 = frequencies[1] * timeDiv * GRID_COLS;
      const peakDiv1 = peakValues[1] / voltsDiv[1];
      parts.push(`通道1: ${waveNames[signalType]}，频率${frequencies[1]}Hz（周期T=${T1.toFixed(3)}s），峰峰值${peakValues[1]}V。`);
      parts.push(`→ 屏幕上可见 ${visibleCycles1.toFixed(1)} 个完整周期，波形峰峰值占 ${peakDiv1.toFixed(1)} 格。`);
    }

    if (inputActive[2]) {
      const T2 = 1 / frequencies[2];
      const visibleCycles2 = frequencies[2] * timeDiv * GRID_COLS;
      const peakDiv2 = peakValues[2] / voltsDiv[2];
      parts.push(`通道2: ${waveNames[signalType]}，频率${frequencies[2]}Hz（周期T=${T2.toFixed(3)}s），峰峰值${peakValues[2]}V。`);
      parts.push(`→ 屏幕上可见 ${visibleCycles2.toFixed(1)} 个完整周期，波形峰峰值占 ${peakDiv2.toFixed(1)} 格。`);
    }

    if (inputActive[1] && inputActive[2]) {
      parts.push(`两通道相位差: ${phaseDiff}°${phaseDiff === 0 ? '（同相）' : phaseDiff === 90 ? '（正交）' : phaseDiff === 180 ? '（反相）' : ''}。`);
      if (displayMode === 'vertical') {
        parts.push(`李萨如图频率比: ${simplifyRatio(frequencies[1], frequencies[2])}。`);
      }
    }

    parts.push(`\n【公式】频率 = 可见周期数 ÷ (Time/Div × 16)；幅度 = 格数 × Volts/Div。`);

    return parts.join(' ');
  }

  async function analyzeImageWithAI(imageDataUrl) {
    const features = await extractImageFeatures(imageDataUrl);
    console.log('提取的图像特征:', features);
    return analyzeOffline(features);
  }

  function generatePromptFromAnalysis(analysisResult) {
    if (!analysisResult) return '';

    const { displayMode, channels, phaseDiff, analysis, timeDiv, voltsDiv } = analysisResult;

    let prompt = `基于离线图像分析结果，请配置示波器参数：\n`;
    prompt += `显示模式：${displayMode === 'overlay' ? '同向叠加' : displayMode === 'vertical' ? '垂直叠加(李萨如)' : '独立显示'}\n`;

    if (timeDiv) prompt += `时间分度值：${timeDiv} s/div\n`;
    if (voltsDiv) {
      if (voltsDiv['1']) prompt += `CH1电压分度值：${voltsDiv['1']} V/div\n`;
      if (voltsDiv['2']) prompt += `CH2电压分度值：${voltsDiv['2']} V/div\n`;
    }

    if (channels && channels.length > 0) {
      channels.forEach((ch, idx) => {
        prompt += `通道${idx + 1}：${ch.waveType}波，频率${ch.frequency}Hz，幅度${ch.amplitude}V\n`;
      });
    }

    if (phaseDiff !== undefined) prompt += `相位差：${phaseDiff}°\n`;
    if (analysis) prompt += `分析说明：${analysis}`;

    return prompt;
  }

  function mapWaveType(typeName) {
    const typeMap = {
      '正弦': 'sine', '正弦波': 'sine', 'sine': 'sine',
      '方波': 'square', 'square': 'square',
      '三角波': 'triangle', '三角': 'triangle', 'triangle': 'triangle',
      '锯齿波': 'sawtooth', '锯齿': 'sawtooth', 'sawtooth': 'sawtooth',
      '噪声': 'noise', '噪声波': 'noise', 'noise': 'noise',
      '脉冲': 'pulse', '脉冲波': 'pulse', 'pulse': 'pulse'
    };
    return typeMap[typeName] || 'sine';
  }

  function mapDisplayMode(modeName) {
    const modeMap = {
      '同向叠加': 'overlay', '叠加': 'overlay', 'overlay': 'overlay',
      '垂直叠加': 'vertical', '李萨如': 'vertical', 'lissajous': 'vertical', 'vertical': 'vertical',
      '独立': 'independent', '独立显示': 'independent', 'independent': 'independent'
    };
    return modeMap[modeName] || 'independent';
  }

  return {
    analyzeImageWithAI,
    generatePromptFromAnalysis,
    mapWaveType,
    mapDisplayMode,
    extractImageFeatures,
    analyzeOscilloscopeState,
    generateEducationalAnalysis,
    findClosestStdValue,
    simplifyRatio
  };
})();

export default DeepSeekService;
