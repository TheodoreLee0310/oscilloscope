/**
 * WaveformUtilities（ESM）
 */
import { OscilloscopeConstants } from './constants.js';

export const CONSTANTS = OscilloscopeConstants;

export const CHANNEL_COLORS = {
  1: OscilloscopeConstants.COLORS.CHANNEL_1,
  2: OscilloscopeConstants.COLORS.CHANNEL_2,
  OVERLAY: '#00FF00'  // 同向叠加模式的波形颜色（绿色）
};

export function drawGrid(ctx, options = {}) {
  const { GRID, CANVAS, COLORS } = OscilloscopeConstants;
  const gridColor = options.gridColor || COLORS.GRID;
  const axesColor = options.axesColor || COLORS.AXES || '#666666';
  const lineWidth = options.lineWidth || 0.5;
  const canvasWidth = (ctx && ctx.canvas && ctx.canvas.width) || CANVAS.WIDTH;
  const canvasHeight = (ctx && ctx.canvas && ctx.canvas.height) || CANVAS.HEIGHT;
  const gridSizeX = options.gridSize || (canvasWidth / (GRID.HORIZONTAL_DIVS || GRID.HORIZONTAL_DIV));
  const gridSizeY = canvasHeight / (GRID.VERTICAL_DIVS || GRID.VERTICAL_DIV);

  // 背景
  ctx.fillStyle = COLORS.BACKGROUND;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // 网格线
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = lineWidth;
  for (let y = 0; y <= canvasHeight; y += gridSizeY) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvasWidth, y);
    ctx.stroke();
  }
  for (let x = 0; x <= canvasWidth; x += gridSizeX) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvasHeight);
    ctx.stroke();
  }

  // 中心十字轴线
  ctx.strokeStyle = axesColor;
  ctx.beginPath();
  ctx.moveTo(canvasWidth / 2, 0);
  ctx.lineTo(canvasWidth / 2, canvasHeight);
  ctx.moveTo(0, canvasHeight / 2);
  ctx.lineTo(canvasWidth, canvasHeight / 2);
  ctx.stroke();
}

export function calculateVoltage(waveType, phaseVal, amplitude) {
  switch (waveType) {
    case 'sine':
      return amplitude * Math.sin(phaseVal);
    case 'square':
      return amplitude * Math.sign(Math.sin(phaseVal));
    case 'triangle':
      return amplitude * (2 * Math.abs((phaseVal % OscilloscopeConstants.MATH.TWO_PI) / OscilloscopeConstants.MATH.TWO_PI - 0.5) - 1);
    case 'sawtooth':
      return amplitude * (((phaseVal % OscilloscopeConstants.MATH.TWO_PI) / OscilloscopeConstants.MATH.TWO_PI) * 2 - 1);
    case 'pulse':
      return amplitude * (Math.sin(phaseVal) > 0.7 ? 1 : -1);
    case 'noise':
      return amplitude * (Math.random() * 2 - 1);
    default:
      return 0;
  }
}

export function calculateEffectiveFactor(useCalibration, calibrationFactor, displayAdjustFactors) {
  if (!useCalibration) return 1.0;
  return calibrationFactor * (displayAdjustFactors?.time || 1.0);
}

export function calculateEffectiveVoltsDiv(useCalibration, voltsDiv, line, calibrationFactor, displayAdjustFactors) {
  if (!useCalibration) return voltsDiv[line];
  const voltAdjustFactor = displayAdjustFactors?.volts?.[line] || 1.0;
  return voltsDiv[line] * calibrationFactor * voltAdjustFactor;
}

export function calculateCenterY(displayMode, line, canvasHeight, verticalOffset) {
  if (displayMode === 'overlay') {
    return canvasHeight / 2 + verticalOffset;
  }
  return line === 1 ? 
    canvasHeight / 4 + verticalOffset : 
    (3 * canvasHeight) / 4 + verticalOffset;
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// 触发相关工具（供 WaveformRenderer / WaveDrawer 使用）
export function resetTriggerSystem(triggerConfig) {
  return {
    level: 0,
    mode: 'auto',
    slope: 'rising',
    ...triggerConfig,
  };
}

export function toggleTriggerSlope(currentSlope) {
  return currentSlope === 'rising' ? 'falling' : 'rising';
}