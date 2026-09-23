/**
 * 示波器系统全局常量配置（ESM）
 */
export const OscilloscopeConstants = {
  // Canvas 相关常量
  CANVAS: {
    WIDTH: 800,
    HEIGHT: 400
  },
  
  // 网格相关常量
  GRID: {
    HORIZONTAL_DIVS: 16,  // 水平分格数
    VERTICAL_DIVS: 8,     // 垂直分格数
    // 兼容字段（重构前部分模块使用单数命名）
    HORIZONTAL_DIV: 16,
    VERTICAL_DIV: 8,
    SIZE: 50,             // 每格像素数
    SUBDIVISIONS: 5       // 每格细分数
  },
  
  // 数学常量
  MATH: {
    TWO_PI: 2 * Math.PI,
    HALF_PI: Math.PI / 2,
    DEG_TO_RAD: Math.PI / 180
  },
  
  // 颜色配置
  COLORS: {
    CHANNEL_1: '#2196F3',    // 通道1颜色
    CHANNEL_2: '#FF5722',    // 通道2颜色
    GRID: '#2a2a2a',        // 网格颜色
    BACKGROUND: '#3980ab',   // 背景颜色（调整为深蓝，提升网格可读性）
    AXES: '#3a3a3a',        // 坐标轴颜色
    TEXT: '#909090'         // 文本颜色
  },
  
  // 波形相关常量
  WAVEFORM: {
    DEFAULT_SAMPLE_RATE: 1000,  // 默认采样率
    MIN_VOLTAGE: -5,            // 最小电压值
    MAX_VOLTAGE: 5,             // 最大电压值
    DEFAULT_TIME_DIV: 1,        // 默认时间分度值
    DEFAULT_VOLTS_DIV: 1        // 默认电压分度值
  }
};