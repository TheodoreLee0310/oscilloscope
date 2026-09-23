import { OscilloscopeConstants as CONSTANTS } from './constants.js';
import { drawGrid as drawGridUtil, calculateVoltage, calculateEffectiveFactor, calculateEffectiveVoltsDiv, calculateCenterY, clamp, resetTriggerSystem as resetTriggerSystemUtil, toggleTriggerSlope as toggleTriggerSlopeUtil, CHANNEL_COLORS } from './WaveformUtilities.js';

export const WaveDrawer = (function() {
  function drawGrid(ctx) {
    drawGridUtil(ctx);
  }

  function drawWave(ctx, params) {
    try {
      const { 
        line, color, expStep, signalType, calibrationParams, timeDiv, 
        frequencies, peakValues, voltsDiv, phase, displayAdjustFactors, calibrationFactor,
        horizontalPosition, verticalPosition, displayMode, phaseDiff
      } = params;

      const horizontalDivCount = CONSTANTS.GRID.HORIZONTAL_DIV;
      const verticalDivCount = CONSTANTS.GRID.VERTICAL_DIV;
      const canvasWidth = CONSTANTS.CANVAS.WIDTH;
      const canvasHeight = CONSTANTS.CANVAS.HEIGHT;
      const useCalibration = expStep === 'calibration';
      const waveType = useCalibration ? calibrationParams.waveTypes[line] : signalType;
      const frequency = useCalibration ? calibrationParams.frequencies[line] : frequencies[line];
      const amplitude = useCalibration ? calibrationParams.peakValues[line] / 2 : peakValues[line] / 2;
      const effectiveTimeDiv = timeDiv * calculateEffectiveFactor(useCalibration, calibrationFactor, displayAdjustFactors);
      const effectiveVoltsDiv = calculateEffectiveVoltsDiv(useCalibration, voltsDiv, line, calibrationFactor, displayAdjustFactors);
      const totalTime = effectiveTimeDiv * horizontalDivCount;
      const dt = totalTime / canvasWidth;
      const pxPerVolt = (canvasHeight / verticalDivCount) / effectiveVoltsDiv;
      const verticalOffset = verticalPosition * CONSTANTS.GRID.SIZE;
      const centerY = calculateCenterY(displayMode, line, canvasHeight, verticalOffset);
      const phaseOffsetDegrees = line === 2 ? phaseDiff || 0 : 0;
      const phaseOffsetRadians = (phaseOffsetDegrees * Math.PI) / 180;
      const globalPhase = phase + phaseOffsetRadians;
      const horizontalOffsetSeconds = horizontalPosition * timeDiv;

      ctx.beginPath();
      ctx.strokeStyle = color || CHANNEL_COLORS[line];
      ctx.lineWidth = 2.5;

      for (let x = 0; x < canvasWidth; x++) {
        // 修改扫描方向：从右向左扫描
        const reversedX = canvasWidth - 1 - x;
        const t = reversedX * dt - horizontalOffsetSeconds;
        const phaseVal = CONSTANTS.MATH.TWO_PI * frequency * t + globalPhase;
        const yVolts = calculateVoltage(waveType, phaseVal, amplitude);
        const yPixel = centerY - (yVolts * pxPerVolt);
        
        // 对于从右向左的扫描，我们在最右侧（reversedX最大时）开始新路径
        if (x === 0) {
          ctx.moveTo(reversedX, yPixel);
        } else {
          ctx.lineTo(reversedX, yPixel);
        }
      }
      ctx.stroke();
    } catch (error) {
      console.error('Wave drawing failed:', error);
    }
  }

  function drawTriggerLevel(ctx, triggerLevelPosition) {
    try {
      const y = triggerLevelPosition;
      ctx.beginPath();
      ctx.strokeStyle = '#FFEB3B';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 3]);
      ctx.moveTo(0, y);
      ctx.lineTo(CONSTANTS.CANVAS.WIDTH, y);
      ctx.stroke();
      ctx.setLineDash([]);
    } catch (error) {
      console.error('Trigger level drawing failed:', error);
    }
  }

  function adjustPhaseForTrigger(params) {
    const { 
      triggerActive, triggerSource, inputActive, voltsDiv, peakValues, 
      frequencies, timeDiv, expStep, calibrationParams, signalType, phase, 
      triggerLevel, triggerSlope, displayAdjustFactors, calibrationFactor 
    } = params;
    if (!triggerActive) return phase;
    const actualChannel = inputActive[triggerSource] ? triggerSource : (inputActive[1] ? 1 : 2);
    const useCalibration = expStep === 'calibration';
    const waveType = useCalibration ? calibrationParams.waveTypes[actualChannel] : signalType;
    const frequency = useCalibration ? calibrationParams.frequencies[actualChannel] : frequencies[actualChannel];
    const amplitude = useCalibration ? calibrationParams.peakValues[actualChannel] / 2 : peakValues[actualChannel] / 2;
    const voltAdjustFactor = displayAdjustFactors ? calibrationFactor * displayAdjustFactors.volts[actualChannel] : calibrationFactor;
    const pxPerVolt = (CONSTANTS.GRID.SIZE / voltsDiv[actualChannel]) * voltAdjustFactor;
    const checkPoint = 0.25;
    const phaseOffset = actualChannel === 2 ? Math.PI / 2 : 0;
    const phaseVal = CONSTANTS.MATH.TWO_PI * frequency * checkPoint + phase + phaseOffset;
    const nextPhaseVal = phaseVal + 0.1;
    const voltage = calculateVoltage(waveType, phaseVal, amplitude);
    const nextVoltage = calculateVoltage(waveType, nextPhaseVal, amplitude);
    const waveValue = voltage * pxPerVolt;
    const nextValue = nextVoltage * pxPerVolt;
    const isRising = nextValue > waveValue;
    const matchesSlope = (triggerSlope === 'rising' && isRising) || (triggerSlope === 'falling' && !isRising);
    const triggerValue = triggerLevel * pxPerVolt;
    if (Math.abs(waveValue - triggerValue) < 5 && matchesSlope) {
      return phase % (CONSTANTS.MATH.TWO_PI);
    }
    return phase;
  }

  function drawOverlayWave(ctx, params) {
    try {
      const { 
        expStep, signalType, calibrationParams, timeDiv, 
        frequencies, peakValues, voltsDiv, phase, 
        displayAdjustFactors, calibrationFactor,
        horizontalPosition, verticalPosition, inputActive, phaseDiff
      } = params;
      const horizontalDivCount = CONSTANTS.GRID.HORIZONTAL_DIV;
      const verticalDivCount = CONSTANTS.GRID.VERTICAL_DIV;
      const canvasWidth = CONSTANTS.CANVAS.WIDTH;
      const canvasHeight = CONSTANTS.CANVAS.HEIGHT;
      ctx.clearRect(0, 0, canvasWidth, canvasHeight);
      drawGrid(ctx);
      const activeChannels = [];
      if (inputActive[1]) activeChannels.push(1);
      if (inputActive[2]) activeChannels.push(2);
      if (activeChannels.length === 0) return;
      const channelParams = {};
      const useCalibration = expStep === 'calibration';
      activeChannels.forEach(line => {
        channelParams[line] = {
          waveType: useCalibration ? calibrationParams.waveTypes[line] : signalType,
          frequency: useCalibration ? calibrationParams.frequencies[line] : frequencies[line],
          amplitude: useCalibration ? calibrationParams.peakValues[line] / 2 : peakValues[line] / 2,
          voltsDiv: voltsDiv[line],
          verticalOffset: (verticalPosition ? verticalPosition[line] || 0 : 0) * CONSTANTS.GRID.SIZE,
          phaseOffset: line === 2 ? (phaseDiff || 0) * Math.PI / 180 : 0
        };
      });
      if (activeChannels.length > 0) {
        const baseVoltsDiv = Math.max(...activeChannels.map(line => voltsDiv[line]));
        drawSummedWaveform(ctx, activeChannels, channelParams, CHANNEL_COLORS.OVERLAY, 
          canvasWidth, canvasHeight, horizontalDivCount, verticalDivCount,
          timeDiv, phase, horizontalPosition, baseVoltsDiv, calibrationFactor, 
          displayAdjustFactors, useCalibration);
      }
      if (activeChannels.length === 2) {
        drawInfoPanel(ctx, channelParams, phaseDiff, CHANNEL_COLORS);
      }
    } catch (error) {
      console.error('Overlay wave drawing failed:', error);
    }
  }
  
  function drawInfoPanel(ctx, channelParams, phaseDiff, colors) {
    ctx.font = '14px Arial';
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(0, 0, 0, 0)';
    ctx.fillRect(650, 10, 140, 70);
    ctx.fillStyle = colors[1]; 
    ctx.fillText(`CH1: ${channelParams[1].frequency}Hz`, 780, 30);
    ctx.fillStyle = colors[2]; 
    ctx.fillText(`CH2: ${channelParams[2].frequency}Hz`, 780, 50);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(`初相差: ${phaseDiff}°`, 780, 70);
  }

  function drawSummedWaveform(ctx, channels, channelParams, color, canvasWidth, canvasHeight, 
    horizontalDivCount, verticalDivCount, timeDiv, phase, horizontalPosition, 
    baseVoltsDiv, calibrationFactor, displayAdjustFactors, useCalibration) {
    const twoPI = CONSTANTS.MATH.TWO_PI;
    const effectiveTimeDiv = timeDiv * calculateEffectiveFactor(useCalibration, calibrationFactor, displayAdjustFactors);
    const totalTime = effectiveTimeDiv * horizontalDivCount;
    const dt = totalTime / canvasWidth;
    const pxPerVolt = (canvasHeight / verticalDivCount) / baseVoltsDiv;
    const centerY = canvasHeight / 2;
    const horizontalOffsetSeconds = horizontalPosition * timeDiv;
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.0;
    ctx.globalAlpha = 1.0;
    for (let x = 0; x < canvasWidth; x++) {
      // 修改扫描方向：从右向左扫描
      const reversedX = canvasWidth - 1 - x;
      const t = reversedX * dt - horizontalOffsetSeconds;
      let summedVoltage = 0;
      channels.forEach(line => {
        const { waveType, frequency, amplitude, phaseOffset } = channelParams[line];
        const adjustedPhase = phase + phaseOffset;
        const phaseVal = twoPI * frequency * t + adjustedPhase;
        const channelVoltage = calculateVoltage(waveType, phaseVal, amplitude);
        summedVoltage += channelVoltage;
      });
      const yPixel = centerY - (summedVoltage * pxPerVolt);
      
      // 对于从右向左的扫描，我们在最右侧（reversedX最大时）开始新路径
      if (x === 0) {
        ctx.moveTo(reversedX, yPixel);
      } else {
        ctx.lineTo(reversedX, yPixel);
      }
    }
    ctx.stroke();
  }

  function updateWaveformType(renderParams, waveType) {
    const validTypes = ['sine', 'square', 'triangle', 'sawtooth', 'pulse', 'noise'];
    const type = validTypes.includes(waveType) ? waveType : 'sine';
    renderParams.signalType = type;
    renderParams.needsRedraw = true;
    return renderParams;
  }

  function resetTriggerSystem(triggerSettings) {
    return resetTriggerSystemUtil(triggerSettings);
  }

  function toggleTriggerSlope(currentSlope) {
    return toggleTriggerSlopeUtil(currentSlope);
  }

  function adjustScopeSettings(settings, paramType, step, channel) {
    const result = { ...settings };
    switch (paramType) {
      case 'timeDiv':
        result.timeDiv = clamp(settings.timeDiv + step, 0.1, 100);
        result.timeDiv = Number(result.timeDiv.toFixed(1));
        break;
      case 'voltsDiv':
        if (channel) {
          result.voltsDiv = { ...settings.voltsDiv };
          result.voltsDiv[channel] = clamp(settings.voltsDiv[channel] + step, 0.1, 10);
          result.voltsDiv[channel] = Number(result.voltsDiv[channel].toFixed(2));
        }
        break;
      case 'freqX':
        result.freqX = Math.max(0.1, settings.freqX + step);
        break;
      case 'freqY':
        result.freqY = Math.max(0.1, settings.freqY + step);
        break;
      case 'phaseDiff':
        result.phaseDiff = (settings.phaseDiff + step + 360) % 360;
        break;
    }
    result.needsRedraw = true;
    return result;
  }

  function validateInputSettings(settings, type, channel) {
    const result = { ...settings };
    if (type === 'time') {
      result.timeDiv = clamp(settings.timeDiv, 0.1, 100);
      result.timeDiv = Number(result.timeDiv.toFixed(1));
    } else if (type === 'volts' && channel) {
      if (isNaN(settings.voltsDiv[channel]) || settings.voltsDiv[channel] === null) {
        result.voltsDiv = { ...settings.voltsDiv };
        result.voltsDiv[channel] = 1;
      } else {
        result.voltsDiv = { ...settings.voltsDiv };
        result.voltsDiv[channel] = clamp(settings.voltsDiv[channel], 0.1, 10);
        result.voltsDiv[channel] = Number(result.voltsDiv[channel].toFixed(2));
      }
    }
    result.needsRedraw = true;
    return result;
  }

  return {
    drawGrid,
    drawWave,
    drawTriggerLevel,
    drawOverlayWave,
    adjustPhaseForTrigger,
    calculateVoltage,
    updateWaveformType,
    resetTriggerSystem,
    toggleTriggerSlope,
    adjustScopeSettings,
    validateInputSettings
  };
})();

export default WaveDrawer;
