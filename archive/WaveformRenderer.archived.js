import GLWaveformRenderer from './GLWaveformRenderer.js';
import { OscilloscopeConstants } from './constants.js';
import * as WaveformUtilities from './WaveformUtilities.js';

/**
 * WaveformRenderer.js
 * 波形渲染器类 - 提供高级波形绘制和控制功能（ESM）
 */

/**
 * WaveformRenderer - 模块化波形渲染器
 * 
 * 基于Canvas 2D实现高效波形数据渲染，支持时间轴和电压轴控制，
 * 视窗偏移及完整坐标系绘制。架构设计分离数据、状态和渲染逻辑，
 * 为后续功能扩展提供基础。
 * 
 * 整合了WaveDrawer的功能，提供更完整的波形渲染和控制能力。
 */
export default class WaveformRenderer {
  /**
   * 校准参数
   * @typedef {Object} CalibrationParameters
   * @property {Object} displayAdjustFactors - 显示调整系数
   * @property {number} displayAdjustFactors.time - 时间调整系数
   * @property {Object} displayAdjustFactors.volts - 每个通道的电压调整系数
   * @property {number} displayAdjustFactors.volts.1 - 通道1电压调整系数
   * @property {number} displayAdjustFactors.volts.2 - 通道2电压调整系数
   * @property {number} [factor=1.0] - 全局校准系数
   * @property {number} [voltageFactor=1.0] - 电压校准系数
   * @property {number} [timeFactor=1.0] - 时间校准系数
   */

  /**
   * 视口参数
   * @typedef {Object} ViewportParameters
   * @property {number} timeDiv - 每格时间(单位：秒)
   * @property {Object} voltsDiv - 每格电压(单位：伏特)
   * @property {number} voltsDiv.1 - 通道1每格电压
   * @property {number} voltsDiv.2 - 通道2每格电压
   * @property {number} horizontalPosition - 水平位置偏移(单位：格)
   * @property {Object} verticalPosition - 垂直位置偏移(单位：格)
   * @property {number} verticalPosition.1 - 通道1垂直位置偏移
   * @property {number} verticalPosition.2 - 通道2垂直位置偏移
   */

  /**
   * 配置参数
   * @typedef {Object} RendererConfig
   * @property {Object} colors - 颜色配置
   * @property {string} colors.background - 背景颜色
   * @property {string} colors.grid - 网格颜色
   * @property {string} colors.axes - 坐标轴颜色
   * @property {string} colors.channel1 - 通道1波形颜色
   * @property {string} colors.channel2 - 通道2波形颜色
   * @property {string} colors.text - 文本颜色
   * @property {string} colors.trigger - 触发线颜色
   * @property {Object} grid - 网格配置
   * @property {number} grid.horizontalDiv - 水平分格数
   * @property {number} grid.verticalDiv - 垂直分格数
   * @property {number} grid.lineWidth - 网格线宽度
   * @property {Object} waveform - 波形配置
   * @property {number} waveform.lineWidth - 波形线宽度
   * @property {boolean} waveform.showPoints - 是否显示采样点
   * @property {Object} axes - 坐标轴配置
   * @property {boolean} axes.showLabels - 是否显示坐标轴标签
   * @property {number} axes.fontSize - 标签字体大小
   * @property {Object} trigger - 触发配置
   * @property {boolean} trigger.enabled - 是否启用触发
   * @property {string} trigger.source - 触发源('ch1', 'ch2', 'ext')
   * @property {number} trigger.level - 触发电平
   * @property {string} trigger.slope - 触发斜率('rising', 'falling')
   * @property {string} trigger.mode - 触发模式('auto', 'normal', 'single')
   * @property {Object} channels - 通道配置
   * @property {Object} channels.1 - 通道1配置
   * @property {boolean} channels.1.active - 通道1是否激活
   * @property {Object} channels.2 - 通道2配置
   * @property {boolean} channels.2.active - 通道2是否激活
   * @property {Object} display - 显示配置
   * @property {string} display.mode - 显示模式('overlay', 'separate')
   */

  /**
   * 信号参数
   * @typedef {Object} SignalParameters
   * @property {string} type - 波形类型('sine', 'square', 'triangle', 'sawtooth', 'pulse', 'noise')
   * @property {Object} frequency - 每个通道的频率(Hz)
   * @property {number} frequency.1 - 通道1频率
   * @property {number} frequency.2 - 通道2频率
   * @property {Object} amplitude - 每个通道的振幅(V)
   * @property {number} amplitude.1 - 通道1振幅
   * @property {number} amplitude.2 - 通道2振幅
   * @property {number} phase - 全局相位(弧度)
   * @property {number} phaseDiff - 通道之间的相位差(度)
   */

  /**
   * 构造函数 - 初始化渲染器
   * @param {HTMLCanvasElement} canvas - 目标Canvas元素
   * @param {Object} options - 配置选项
   */
  constructor(canvas, options = {}) {
    // 存储Canvas元素
    this.canvas = canvas;
    
    // 创建两个渲染上下文
    this.ctx = canvas.getContext('2d');
    
    // 尝试创建WebGL渲染器
    try {
      this.glRenderer = new GLWaveformRenderer(canvas);
      this.hasWebGL = true;
    } catch (e) {
      console.warn('WebGL不可用，将仅使用Canvas 2D:', e);
      this.hasWebGL = false;
    }
    
    // 默认配置与用户配置合并
    this.config = Object.assign({
      // 颜色设置
      colors: {
        background: OscilloscopeConstants.COLORS.BACKGROUND,
        grid: OscilloscopeConstants.COLORS.GRID,
        axes: OscilloscopeConstants.COLORS.AXES,
        waveform: OscilloscopeConstants.COLORS.CHANNEL_1,
        text: OscilloscopeConstants.COLORS.TEXT,
        channel1: OscilloscopeConstants.COLORS.CHANNEL_1,
        channel2: OscilloscopeConstants.COLORS.CHANNEL_2,
        overlay: '#00FF00',        // 同向叠加模式的波形颜色（绿色）
        trigger: '#FFEB3B'         // 触发线颜色
      },
      // 网格设置
      grid: {
        horizontalDiv: OscilloscopeConstants.GRID.HORIZONTAL_DIVS,
        verticalDiv: OscilloscopeConstants.GRID.VERTICAL_DIVS,
        showMajor: true,           // 显示主网格线
        showMinor: false,          // 显示次网格线
        lineWidth: 0.5             // 网格线宽度
      },
      // 波形设置
      waveform: {
        lineWidth: 2,              // 波形线宽度
        showPoints: false,         // 是否显示数据点
        pointRadius: 2             // 数据点半径
      },
      // 坐标轴设置
      axes: {
        showLabels: true,          // 显示刻度标签
        fontSize: 12,              // 字体大小
        fontFamily: 'Arial',       // 字体
        padding: 5                 // 标签内边距
      },
      // 触发设置
      trigger: {
        enabled: true,             // 触发启用
        source: 1,                 // 触发源通道
        level: 0,                  // 触发电平
        slope: 'rising',           // 触发斜率
        mode: 'auto'               // 触发模式
      },
      // 通道设置
      channels: {
        1: { active: true },
        2: { active: false }
      }
    }, options);
    
    // 视图状态管理
    this.viewport = {
      offsetX: 0,                  // 水平偏移量(时间轴)
      offsetY: 0,                  // 垂直偏移量(电压轴)
      timeScale: 1,                // 时间比例尺
      voltScale: 1,                // 电压比例尺
      timeUnit: 's',               // 时间单位
      voltUnit: 'V',               // 电压单位
      timeDiv: 1,                  // 时间分度值
      voltsDiv: { 1: 1, 2: 1 },    // 电压分度值
      horizontalPosition: 0,       // 水平位置
      verticalPosition: { 1: 0, 2: 0 } // 垂直位置
    };
    
    // 信号设置
    this.signalParams = {
      type: 'sine',                // 波形类型
      frequency: { 1: 1, 2: 1 },   // 频率(Hz)
      amplitude: { 1: 1, 2: 1 },   // 振幅(V)
      phase: 0,                    // 相位(弧度)
      phaseDiff: 0                 // 通道间相位差(度)
    };
    
    // 校准设置
    this.calibration = {
      factor: 1.0,                 // 校准因子
      displayAdjustFactors: {
        time: 1.0,
        volts: { 1: 1.0, 2: 1.0 }
      }
    };
    
    // 数据存储
    this.waveformData = [];        // 波形数据数组
    this.dataTimeInterval = 0.01;  // 数据点时间间隔(秒)
    
    // 动画相关
    this.animationId = null;       // 动画帧ID
    this.isRunning = false;        // 是否正在运行
    
    // 初始化
    this.resizeCanvas();
    this.bindEvents();
  }
  
  /**
   * 调整Canvas尺寸
   */
  resizeCanvas() {
    // 获取Canvas的CSS样式宽高
    const displayWidth = this.canvas.clientWidth || 800;
    const displayHeight = this.canvas.clientHeight || 400;
    
    // 使用高DPI适配，解决模糊问题
    const devicePixelRatio = window.devicePixelRatio || 1;
    this.canvas.width = displayWidth * devicePixelRatio;
    this.canvas.height = displayHeight * devicePixelRatio;
    this.canvas.style.width = displayWidth + 'px';
    this.canvas.style.height = displayHeight + 'px';
    
    // 缩放context以确保正确绘制
    const ctx = this.canvas.getContext('2d');
    ctx.scale(devicePixelRatio, devicePixelRatio);
    
    // 根据新尺寸重绘
    this.draw();
  }
  
  /**
   * 绑定事件监听
   */
  bindEvents() {
    // 窗口大小变化时自动调整Canvas尺寸
    window.addEventListener('resize', () => this.resizeCanvas());
  }
  
  /**
   * 更新波形数据和配置
   * @param {Array} data - 波形数据数组
   * @param {Object} config - 配置参数
   */
  update(data, config = {}) {
    // 更新波形数据
    if (data && Array.isArray(data)) {
      this.waveformData = data;
    }
    
    // 更新配置参数
    if (config) {
      // 深度合并配置
      this.config = this.mergeConfig(this.config, config);
    }
    
    // 重新绘制
    this.draw();
    
    return this;
  }
  
  /**
   * 辅助方法：深度合并配置对象
   * @param {Object} target - 目标对象
   * @param {Object} source - 源对象
   * @returns {Object} - 合并后的对象
   */
  mergeConfig(target, source) {
    const result = Object.assign({}, target);
    
    if (source && typeof source === 'object') {
      Object.keys(source).forEach(key => {
        if (source[key] instanceof Object && key in target) {
          result[key] = this.mergeConfig(target[key], source[key]);
        } else {
          result[key] = source[key];
        }
      });
    }
    
    return result;
  }
  
  /**
   * 更新视口参数
   * @param {Object} viewportParams - 视口参数
   */
  updateViewport(viewportParams = {}) {
    // 更新视口状态
    Object.assign(this.viewport, viewportParams);
    
    // 重新绘制
    this.draw();
    
    return this;
  }
  
  /**
   * 更新配置参数
   * @param {Object} config - 新的配置参数
   * @returns {WaveformRenderer} - 当前实例，支持链式调用
   */
  updateConfig(config = {}) {
    // 使用mergeConfig方法深度合并配置
    this.config = this.mergeConfig(this.config, config);
    
    // 重新绘制
    this.draw();
    
    return this;
  }
  
  /**
   * 清空画布
   */
  clear() {
    if (this.hasWebGL) {
      const color = this.hexToRGBA(this.config.colors.background);
      this.glRenderer.clear(color);
    }
    
    // 同时清除2D上下文
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = this.config.colors.background;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    
    return this;
  }
  
  /**
   * 绘制网格
   */
  drawGrid() {
    // 使用共享工具函数绘制网格
    WaveformUtilities.drawGrid(this.ctx, {
      gridColor: this.config.colors.grid,
      axesColor: this.config.colors.axes,
      lineWidth: this.config.grid.lineWidth,
      gridSize: this.canvas.width / this.config.grid.horizontalDiv
    });
    
    return this;
  }
  
  /**
   * 绘制坐标轴刻度和标签
   */
  drawAxesLabels() {
    if (!this.config.axes.showLabels) return this;
    
    const { axes, colors } = this.config;
    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    
    // 保存上下文状态
    ctx.save();
    
    // 设置文本样式
    ctx.font = `${axes.fontSize}px ${axes.fontFamily}`;
    ctx.fillStyle = colors.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    
    // 绘制水平轴刻度和标签
    const hStep = width / this.config.grid.horizontalDiv;
    const timePerDiv = this.viewport.timeDiv * this.viewport.timeScale; 
    
    for (let i = 0; i <= this.config.grid.horizontalDiv; i++) {
      const x = i * hStep;
      const timeValue = (i - this.config.grid.horizontalDiv / 2) * timePerDiv + this.viewport.offsetX;
      
      // 绘制刻度
      ctx.beginPath();
      ctx.moveTo(x, centerY - 5);
      ctx.lineTo(x, centerY + 5);
      ctx.stroke();
      
      // 绘制标签（仅在中心线和主要刻度处）
      if (i % 2 === 0) {
        ctx.fillText(
          `${timeValue.toFixed(1)}${this.viewport.timeUnit}`, 
          x, 
          centerY + axes.padding
        );
      }
    }
    
    // 绘制垂直轴刻度和标签
    const vStep = height / this.config.grid.verticalDiv;
    const voltPerDiv = 1 * this.viewport.voltScale; 
    
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    
    for (let i = 0; i <= this.config.grid.verticalDiv; i++) {
      const y = i * vStep;
      const voltValue = -(i - this.config.grid.verticalDiv / 2) * voltPerDiv + this.viewport.offsetY;
      
      // 绘制刻度
      ctx.beginPath();
      ctx.moveTo(centerX - 5, y);
      ctx.lineTo(centerX + 5, y);
      ctx.stroke();
      
      // 绘制标签（仅在中心线和主要刻度处）
      if (i % 2 === 0) {
        ctx.fillText(
          `${voltValue.toFixed(1)}${this.viewport.voltUnit}`, 
          centerX - axes.padding, 
          y
        );
      }
    }
    
    // 恢复上下文状态
    ctx.restore();
    
    return this;
  }
  
  /* 绘制波形*/
  drawWaveform() {
    if (!this.waveformData || this.waveformData.length === 0) return this;
    
    // 如果数据点数量大于阈值且WebGL可用，使用WebGL渲染
    if (this.hasWebGL && this.waveformData.length > 1000) {
      const color = this.hexToRGBA(this.config.colors.waveform);
      this.glRenderer.renderWaveform(this.waveformData, color);
      return this;
    }
    
    // 否则使用Canvas 2D渲染
    const { waveform, colors } = this.config;
    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    
    // 保存上下文状态
    ctx.save();
    
    // 设置线条样式
    ctx.strokeStyle = colors.waveform;
    ctx.lineWidth = waveform.lineWidth;
    
    // 开始绘制路径
    ctx.beginPath();
    
    // 计算每个数据点的像素位置
    const pixelsPerSecond = (width / this.config.grid.horizontalDiv) / this.viewport.timeScale;
    const pixelsPerVolt = (height / this.config.grid.verticalDiv) / this.viewport.voltScale;
    
    // 计算起始显示数据点的索引
    const startTimeOffset = -this.viewport.offsetX - (this.config.grid.horizontalDiv / 2) * this.viewport.timeScale;
    const startIndex = Math.max(0, Math.floor(startTimeOffset / this.dataTimeInterval));
    
    // 计算结束显示数据点的索引
    const endTimeOffset = startTimeOffset + this.config.grid.horizontalDiv * this.viewport.timeScale;
    const endIndex = Math.min(this.waveformData.length - 1, Math.ceil(endTimeOffset / this.dataTimeInterval));
    
    // 绘制可见范围内的数据点
    for (let i = startIndex; i <= endIndex; i++) {
      // 计算时间点（相对于中心点）
      const time = i * this.dataTimeInterval + this.viewport.offsetX;
      
      // 计算X坐标（转换为Canvas坐标系）- 修改扫描方向：从右向左
      const x = centerX - time * pixelsPerSecond;
      
      // 获取电压值（注意：这里假设数据是直接的电压值）
      const voltage = this.waveformData[i] + this.viewport.offsetY;
      
      // 计算Y坐标（转换为Canvas坐标系，注意Y轴方向相反）
      const y = centerY - voltage * pixelsPerVolt;
      
      // 第一个点移动到位置，之后的点连线
      if (i === startIndex) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
      
      // 如果需要绘制数据点
      if (waveform.showPoints) {
        ctx.fillStyle = colors.waveform;
        ctx.fillRect(x - waveform.pointRadius, y - waveform.pointRadius, 
                    waveform.pointRadius * 2, waveform.pointRadius * 2);
      }
    }
    
    // 描绘路径
    ctx.stroke();
    
    // 恢复上下文状态
    ctx.restore();
    
    return this;
  }
  
  /**
   * 绘制完整内容
   */
  draw() {
    // 清空画布并设置背景
    this.clear();
    
    // 绘制网格
    this.drawGrid();
    
    // 绘制坐标轴标签
    this.drawAxesLabels();
    
    // 绘制触发电平线
    if (this.config.trigger.enabled) {
      this.drawTriggerLevel();
    }
    
    // 绘制波形
    if (this.config.channels[1].active && this.config.channels[2].active && 
        this.config.display && this.config.display.mode === 'overlay') {
      // 如果两个通道都激活且是叠加模式，使用叠加绘制
      this.drawOverlayWaves();
    } else {
      // 否则单独绘制每个通道
      if (this.config.channels[1].active) {
        this.drawChannelWave(1);
      }
      if (this.config.channels[2].active) {
        this.drawChannelWave(2);
      }
    }
    
    return this;
  }
  
  /**
   * 绘制触发电平线
   */
  drawTriggerLevel() {
    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;
    const centerY = height / 2;
    
    try {
      // 计算触发电平的像素位置
      const pixelsPerVolt = (height / this.config.grid.verticalDiv) / this.viewport.voltScale;
      const y = centerY - (this.config.trigger.level * pixelsPerVolt);
      
      ctx.beginPath();
      ctx.strokeStyle = this.config.colors.trigger;
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 3]);
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
      ctx.setLineDash([]); // 重置线型
    } catch (error) {
      console.error('Trigger level drawing failed:', error);
    }
    
    return this;
  }
  
  /**
   * 根据波形类型计算电压值
   * @param {string} waveType - 波形类型
   * @param {number} phaseVal - 相位值(弧度)
   * @param {number} amplitude - 振幅
   * @returns {number} - 计算得到的电压值
   */
  calculateVoltage(waveType, phaseVal, amplitude) {
    // 使用共享工具函数计算电压
    return WaveformUtilities.calculateVoltage(waveType, phaseVal, amplitude);
  }
  
  /**
   * 绘制单通道波形
   * @param {number} channel - 通道号(1或2)
   */
  drawChannelWave(channel) {
    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;
    const centerY = height / 2;
    
    try {
      // 设置波形参数
      const waveType = this.signalParams.type;
      const frequency = this.signalParams.frequency[channel] || 1;
      const amplitude = this.signalParams.amplitude[channel] || 1;
      
      // 获取微调系数
      const timeAdjustFactor = this.calibration.displayAdjustFactors.time;
      const voltAdjustFactor = this.calibration.displayAdjustFactors.volts[channel];
      
      // 设置常量
      const horizontalDivCount = this.config.grid.horizontalDiv;
      const verticalDivCount = this.config.grid.verticalDiv;
      
      // 计算时间参数
      const effectiveTimeDiv = this.viewport.timeDiv * timeAdjustFactor;
      const totalTime = effectiveTimeDiv * horizontalDivCount;
      const dt = totalTime / width;
      
      // 计算电压参数
      const effectiveVoltsDiv = this.viewport.voltsDiv[channel] * voltAdjustFactor;
      const pxPerVolt = (height / verticalDivCount) / effectiveVoltsDiv;
      
      // 计算位置偏移
      const verticalOffset = this.viewport.verticalPosition[channel] * (height / verticalDivCount);
      const horizontalOffsetSeconds = this.viewport.horizontalPosition * this.viewport.timeDiv;
      
      // 计算相位偏移
      const phaseOffsetDegrees = channel === 2 ? this.signalParams.phaseDiff : 0;
      const phaseOffsetRadians = (phaseOffsetDegrees * Math.PI) / 180;
      const globalPhase = this.signalParams.phase + phaseOffsetRadians;
      
      // 设置绘图样式
      ctx.beginPath();
      ctx.strokeStyle = (channel === 1) ? this.config.colors.channel1 : this.config.colors.channel2;
      ctx.lineWidth = this.config.waveform.lineWidth;
      
      // 绘制波形
      for (let x = 0; x < width; x++) {
        // 计算当前时间和相位
        const t = x * dt - horizontalOffsetSeconds;
        const phaseVal = 2 * Math.PI * frequency * t + globalPhase;
        
        // 计算电压值
        const yVolts = this.calculateVoltage(waveType, phaseVal, amplitude);
        
        // 转换为像素坐标
        const y = centerY - (yVolts * pxPerVolt) + verticalOffset;
        
        // 绘制路径
        if (x === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      
      ctx.stroke();
    } catch (error) {
      console.error(`Drawing channel ${channel} wave failed:`, error);
    }
    
    return this;
  }
  
  /**
   * 绘制叠加波形
   */
  drawOverlayWaves() {
    const ctx = this.ctx;
    
    // 绘制通道1和通道2
    [1, 2].forEach(channel => {
      if (this.config.channels[channel].active) {
        this.drawChannelWave(channel);
      }
    });
    
    return this;
  }
  
  /**
   * 调整触发电平
   * @param {number} delta - 调整量
   */
  adjustTriggerLevel(delta) {
    this.config.trigger.level = Math.min(5, Math.max(-5, this.config.trigger.level + delta));
    this.draw();
    return this;
  }
  
  /**
   * 切换触发斜率
   */
  toggleTriggerSlope() {
    // 使用共享工具函数切换触发斜率
    this.config.trigger.slope = WaveformUtilities.toggleTriggerSlope(this.config.trigger.slope);
    this.draw();
    return this;
  }
  
  /**
   * 重置触发系统
   */
  resetTriggerSystem() {
    // 使用共享工具函数重置触发系统
    this.config.trigger = WaveformUtilities.resetTriggerSystem(this.config.trigger);
    this.draw();
    return this;
  }
  
  /**
   * 设置波形类型
   * @param {string} type - 波形类型
   */
  setWaveformType(type) {
    const validTypes = ['sine', 'square', 'triangle', 'sawtooth', 'pulse', 'noise'];
    if (validTypes.includes(type)) {
      this.signalParams.type = type;
      this.draw();
    }
    return this;
  }
  
  /**
   * 调整时间分度值
   * @param {number} step - 调整步长
   */
  adjustTimeDiv(step) {
    this.viewport.timeDiv = Math.min(100, Math.max(0.1, this.viewport.timeDiv + step));
    this.viewport.timeDiv = Number(this.viewport.timeDiv.toFixed(1));
    this.draw();
    return this;
  }
  
  /**
   * 调整电压分度值
   * @param {number} step - 调整步长
   * @param {number} channel - 通道号
   */
  adjustVoltsDiv(step, channel) {
    if (channel === 1 || channel === 2) {
      this.viewport.voltsDiv[channel] = Math.min(10, Math.max(0.1, this.viewport.voltsDiv[channel] + step));
      this.viewport.voltsDiv[channel] = Number(this.viewport.voltsDiv[channel].toFixed(2));
      this.draw();
    }
    return this;
  }
  
  /**
   * 调整通道频率
   * @param {number} step - 调整步长
   * @param {number} channel - 通道号
   */
  adjustFrequency(step, channel) {
    if (channel === 1 || channel === 2) {
      this.signalParams.frequency[channel] = Math.max(0.1, this.signalParams.frequency[channel] + step);
      this.draw();
    }
    return this;
  }
  
  /**
   * 调整相位差
   * @param {number} step - 调整步长(度)
   */
  adjustPhaseDiff(step) {
    this.signalParams.phaseDiff = (this.signalParams.phaseDiff + step + 360) % 360;
    this.draw();
    return this;
  }
  
  /**
   * 调整显示位置
   * @param {string} axis - 轴('horizontal' 或 'vertical')
   * @param {number} step - 调整步长
   * @param {number} [channel] - 通道号(仅用于垂直轴)
   */
  adjustPosition(axis, step, channel) {
    if (axis === 'horizontal') {
      this.viewport.horizontalPosition = Math.min(8, Math.max(-8, this.viewport.horizontalPosition + step));
    } else if (axis === 'vertical' && (channel === 1 || channel === 2)) {
      this.viewport.verticalPosition[channel] = Math.min(4, Math.max(-4, this.viewport.verticalPosition[channel] + step));
    }
    this.draw();
    return this;
  }
  
  /**
   * 切换通道激活状态
   * @param {number} channel - 通道号
   */
  toggleChannel(channel) {
    if (channel === 1 || channel === 2) {
      this.config.channels[channel].active = !this.config.channels[channel].active;
      this.draw();
    }
    return this;
  }
  
  /**
   * 开始动画循环
   */
  start() {
    if (this.isRunning) return this;
    
    this.isRunning = true;
    
    // 开始动画循环
    const animate = () => {
      if (!this.isRunning) return;
      
      // 更新相位
      this.signalParams.phase += 0.02;
      
      // 绘制当前帧
      this.draw();
      
      // 请求下一帧
      this.animationId = requestAnimationFrame(animate);
    };
    
    // 启动动画
    animate();
    
    return this;
  }
  
  /**
   * 停止动画循环
   */
  stop() {
    this.isRunning = false;
    
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    
    return this;
  }
  
  /**
   * 生成测试数据
   * @param {string} type - 波形类型 (sine, square, triangle, sawtooth)
   * @param {number} length - 数据点数量
   * @param {number} frequency - 频率 (Hz)
   * @param {number} amplitude - 振幅 (V)
   * @returns {Array} - 生成的波形数据
   */
  generateTestData(type = 'sine', length = 1000, frequency = 1, amplitude = 1) {
    const data = [];
    
    // 计算角频率
    const omega = 2 * Math.PI * frequency;
    
    // 生成数据点
    for (let i = 0; i < length; i++) {
      const t = i * this.dataTimeInterval;
      data.push(this.calculateVoltage(type, omega * t, amplitude));
    }
    
    return data;
  }

  // 添加颜色转换辅助方法
  hexToRGBA(hex) {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    return [r, g, b, 1];
  }
}