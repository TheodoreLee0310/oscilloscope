/**
 * StepAdjustmentUtils.js (ESM)
 * 1:2:5步长比例参数调整工具模块
 * 实现符合实际示波器标准的参数调节方式
 */

// 1:2:5步长序列定义
const STEP_SEQUENCES = {
  // 时间分度步长序列（1:2:5比例）
  TIME_DIV: [
    0.1, 0.2, 0.5,           // 0.1s/div, 0.2s/div, 0.5s/div
    1, 2, 5,                 // 1s/div, 2s/div, 5s/div
    10, 20, 50,              // 10s/div, 20s/div, 50s/div
    100                      // 100s/div
  ],
  
  // 电压分度步长序列（1:2:5比例）
  VOLTS_DIV: [
    0.01, 0.02, 0.05,        // 0.01V/div, 0.02V/div, 0.05V/div
    0.1, 0.2, 0.5,          // 0.1V/div, 0.2V/div, 0.5V/div
    1, 2, 5,                // 1V/div, 2V/div, 5V/div
    10                       // 10V/div
  ],
  
  // 频率步长序列（1:2:5比例）
  FREQUENCY: [
    0.1, 0.2, 0.5,          // 0.1Hz, 0.2Hz, 0.5Hz
    1, 2, 5,                // 1Hz, 2Hz, 5Hz
    10, 20, 50,             // 10Hz, 20Hz, 50Hz
    100, 200, 500,          // 100Hz, 200Hz, 500Hz
    1000, 2000, 5000,       // 1kHz, 2kHz, 5kHz
    10000, 20000, 50000     // 10kHz, 20kHz, 50kHz
  ],
  
  // 相位步长序列（1:2:5比例）
  PHASE: [
    1, 2, 5,                // 1°, 2°, 5°
    10, 20, 50,             // 10°, 20°, 50°
    90, 180, 360            // 90°, 180°, 360°
  ],
  
  // 位置调节步长序列（1:2:5比例）
  POSITION: [
    0.1, 0.2, 0.5,          // 0.1格, 0.2格, 0.5格
    1, 2, 5                 // 1格, 2格, 5格
  ]
};

/**
 * 获取下一个步长值
 * @param {number} currentValue - 当前值
 * @param {Array} stepSequence - 步长序列
 * @param {number} direction - 方向（1为增加，-1为减少）
 * @returns {number} 下一个值
 */
function getNextValue(currentValue, stepSequence, direction = 1) {
  const index = stepSequence.findIndex(step => 
    direction > 0 ? step > currentValue : step < currentValue
  );
  
  if (index === -1) {
    // 如果找不到合适的步长，使用序列的边界值
    return direction > 0 ? stepSequence[stepSequence.length - 1] : stepSequence[0];
  }
  
  return stepSequence[index];
}

/**
 * 获取最接近的步长值
 * @param {number} value - 目标值
 * @param {Array} stepSequence - 步长序列
 * @returns {number} 最接近的步长值
 */
function getClosestValue(value, stepSequence) {
  return stepSequence.reduce((prev, curr) => 
    Math.abs(curr - value) < Math.abs(prev - value) ? curr : prev
  );
}

/**
 * 1:2:5步长比例参数调整器
 */
export const StepAdjustmentUtils = {
  /**
   * 调整时间分度
   * @param {number} currentTimeDiv - 当前时间分度
   * @param {number} direction - 方向（1为增加，-1为减少）
   * @returns {number} 下一个时间分度值
   */
  adjustTimeDiv(currentTimeDiv, direction = 1) {
    return getNextValue(currentTimeDiv, STEP_SEQUENCES.TIME_DIV, direction);
  },

  /**
   * 调整电压分度
   * @param {number} currentVoltsDiv - 当前电压分度
   * @param {number} direction - 方向（1为增加，-1为减少）
   * @returns {number} 下一个电压分度值
   */
  adjustVoltsDiv(currentVoltsDiv, direction = 1) {
    return getNextValue(currentVoltsDiv, STEP_SEQUENCES.VOLTS_DIV, direction);
  },

  /**
   * 调整频率
   * @param {number} currentFreq - 当前频率
   * @param {number} direction - 方向（1为增加，-1为减少）
   * @returns {number} 下一个频率值
   */
  adjustFrequency(currentFreq, direction = 1) {
    return getNextValue(currentFreq, STEP_SEQUENCES.FREQUENCY, direction);
  },

  /**
   * 调整相位
   * @param {number} currentPhase - 当前相位
   * @param {number} direction - 方向（1为增加，-1为减少）
   * @returns {number} 下一个相位值
   */
  adjustPhase(currentPhase, direction = 1) {
    const nextValue = getNextValue(currentPhase, STEP_SEQUENCES.PHASE, direction);
    return (nextValue + 360) % 360; // 确保相位在0-360度范围内
  },

  /**
   * 调整位置
   * @param {number} currentPosition - 当前位置
   * @param {number} direction - 方向（1为增加，-1为减少）
   * @returns {number} 下一个位置值
   */
  adjustPosition(currentPosition, direction = 1) {
    return getNextValue(currentPosition, STEP_SEQUENCES.POSITION, direction);
  },

  /**
   * 获取最接近的时间分度值
   * @param {number} value - 目标值
   * @returns {number} 最接近的时间分度值
   */
  getClosestTimeDiv(value) {
    return getClosestValue(value, STEP_SEQUENCES.TIME_DIV);
  },

  /**
   * 获取最接近的电压分度值
   * @param {number} value - 目标值
   * @returns {number} 最接近的电压分度值
   */
  getClosestVoltsDiv(value) {
    return getClosestValue(value, STEP_SEQUENCES.VOLTS_DIV);
  },

  /**
   * 获取最接近的频率值
   * @param {number} value - 目标值
   * @returns {number} 最接近的频率值
   */
  getClosestFrequency(value) {
    return getClosestValue(value, STEP_SEQUENCES.FREQUENCY);
  },

  /**
   * 获取步长序列（用于调试和显示）
   * @param {string} type - 类型：'timeDiv', 'voltsDiv', 'frequency', 'phase', 'position'
   * @returns {Array} 对应的步长序列
   */
  getStepSequence(type) {
    return STEP_SEQUENCES[type.toUpperCase()] || [];
  },

  /**
   * 验证值是否在有效范围内
   * @param {number} value - 要验证的值
   * @param {string} type - 类型
   * @returns {boolean} 是否有效
   */
  isValidValue(value, type) {
    const sequence = STEP_SEQUENCES[type.toUpperCase()];
    if (!sequence) return false;
    
    return sequence.includes(value);
  }
};

export default StepAdjustmentUtils;
