/**
 * 波形生成器类
 * 负责生成各种波形并计算偏转电压
 */
export class WaveformGenerator {
  constructor() {
    this.time = 0;
    this.lastTimestamp = 0;
    this.lastHorizontalPosition = 0; // 记录上一次的水平位置
    this.onWaveformReset = null; // 波形重置回调函数
  }

  /**
   * 更新时间
   * @param {number} timestamp - 当前时间戳
   */
  update(timestamp) {
    // 添加防护检查
    if (typeof timestamp !== 'number' || isNaN(timestamp)) {
      console.warn('波形生成器 - 无效的时间戳:', timestamp);
      return;
    }
    
    // 计算时间增量（秒）
    if (this.lastTimestamp === 0) {
      this.lastTimestamp = timestamp;
      return;
    }
    
    const deltaTime = (timestamp - this.lastTimestamp) / 1000;
    
    // 防护异常的 deltaTime
    if (isNaN(deltaTime) || deltaTime < 0 || deltaTime > 1) {
      console.warn('波形生成器 - 异常的时间增量:', deltaTime, '重置时间戳');
      this.lastTimestamp = timestamp;
      return;
    }
    
    this.lastTimestamp = timestamp;
    
    // 更新内部时间（在演示动画期间减慢50%）
    const timeScale = (window.demoAnimation && window.demoAnimation.isPlaying) ? 0.6 : 1.0;
    this.time += deltaTime * timeScale;
  }

  /**
   * 生成波形值
   * @param {Object} params - 波形参数
   * @returns {number} - 波形值 (-1 到 1 之间)
   */
  generateWaveform(params) {
    if (!params.enabled) {
      return 0;
    }
    
    const { type, frequency, amplitude, phase } = params;
    
    // 添加防护检查
    if (isNaN(this.time) || isNaN(frequency) || isNaN(amplitude) || isNaN(phase)) {
      console.error('波形生成器 - 检测到 NaN 参数:', {
        time: this.time,
        frequency,
        amplitude,
        phase
      });
      return 0;
    }
    
    const t = this.time * frequency * Math.PI * 2 + phase;
    
    // 检查计算结果
    if (isNaN(t)) {
      console.error('波形生成器 - 时间计算结果为 NaN:', t);
      return 0;
    }
    
    let result = 0;
    switch (type) {
      case 'sine':
        result = Math.sin(t) * amplitude;
        break;
      case 'square':
        result = (Math.sin(t) >= 0 ? 1 : -1) * amplitude;
        break;
      case 'sawtooth':
        result = (((t / (Math.PI * 2)) % 1) * 2 - 1) * amplitude;
        break;
      case 'triangle':
        result = (Math.abs(((t / Math.PI) % 2) - 1) * 2 - 1) * amplitude;
        break;
      default:
        result = 0;
    }
    
    // 最终检查结果
    if (isNaN(result)) {
      console.error('波形生成器 - 波形计算结果为 NaN:', { type, t, amplitude, result });
      return 0;
    }
    
    return result;
  }
  
  /**
   * 计算当前的偏转电压
   * @param {Object} waveformParams - 波形参数
   * @param {Object} deflectionParams - 偏转参数
   * @returns {Object} - 包含水平和垂直偏转电压的对象
   */
  calculateDeflectionVoltage(waveformParams, deflectionParams) {
    // 在演示动画期间，使用固定的原始电压值以保持波形位置不变
    let baseHorizontal, baseVertical;
    if (window.demoAnimation && window.demoAnimation.isPlaying && window.demoAnimation.originalVoltages) {
      baseHorizontal = window.demoAnimation.originalVoltages.horizontal;
      baseVertical = window.demoAnimation.originalVoltages.vertical;
    } else {
      // 获取基础电压值，添加防护
      baseHorizontal = deflectionParams?.horizontal?.voltage ?? 0;
      baseVertical = deflectionParams?.vertical?.voltage ?? 0;
    }
    
    // 如果波形未启用，直接返回基础电压
    if (!waveformParams.enabled) {
      return {
        horizontal: baseHorizontal,
        vertical: baseVertical
      };
    }
    
    // 根据波形类型生成不同的扫描模式，使用偏转电压作为幅度调制因子
    const scanPattern = this.generateScanPattern(waveformParams, deflectionParams);
    
    // 直接返回波形扫描模式产生的电压值（不再与基础电压相加）
    // 这样偏转电压就控制波形幅度，而不是位置偏移
    return {
      horizontal: scanPattern.horizontal,
      vertical: scanPattern.vertical
    };
  }
  
  /**
   * 根据波形类型生成扫描模式
   * @param {Object} params - 波形参数
   * @param {Object} deflectionParams - 偏转参数，用于控制波形幅度
   * @returns {Object} - 包含水平和垂直偏转值的对象
   */
  generateScanPattern(params, deflectionParams = null) {
    const { type, frequency, amplitude, phase } = params;
    
    // 添加防护检查
    if (isNaN(this.time) || isNaN(frequency) || isNaN(amplitude) || isNaN(phase)) {
      console.error('波形生成器 - 检测到 NaN 参数:', {
        time: this.time,
        frequency,
        amplitude,
        phase
      });
      return { horizontal: 0, vertical: 0 };
    }
    
    const t = this.time * frequency * Math.PI * 2 + phase;
    
    // 检查计算结果
    if (isNaN(t)) {
      console.error('波形生成器 - 时间计算结果为 NaN:', t);
      return { horizontal: 0, vertical: 0 };
    }
    
    // 获取偏转电压作为幅度调制因子
    // 使用基础幅度 + 偏转电压调制，确保即使电压为0也有基本波形显示
    const baseAmplitude = amplitude * 0.3; // 基础幅度（30%的原始幅度）
    const horizontalVoltage = deflectionParams?.horizontal?.voltage ?? 0;
    const verticalVoltage = deflectionParams?.vertical?.voltage ?? 0;
    
    // 幅度 = 基础幅度 + (电压调制 * 原始幅度)
    const horizontalAmplitude = baseAmplitude + (Math.abs(horizontalVoltage) * amplitude * 0.2);
    const verticalAmplitude = baseAmplitude + (Math.abs(verticalVoltage) * amplitude * 0.2);
    
    // 添加防护检查
    if (isNaN(horizontalAmplitude) || isNaN(verticalAmplitude)) {
      console.error('波形生成器 - 检测到 NaN 幅度参数:', {
        horizontalAmplitude,
        verticalAmplitude
      });
      return { horizontal: 0, vertical: 0 };
    }
    
    let horizontal = 0;
    let vertical = 0;
    
    // 使用频率参数来控制波形密集程度
    const freqMultiplier = frequency * 2; // 频率倍数，用于控制波形密集度
    
    switch (type) {
      case 'sine':
        // 正弦波 - 水平锯齿扫描（从右向左）+ 垂直正弦波
        // 水平扫描的幅度由水平偏转电压控制
        horizontal = ((1 - ((t / (Math.PI * 2)) % 1)) * 2 - 1) * Math.abs(horizontalAmplitude);
        // 垂直波形的幅度由垂直偏转电压控制
        vertical = Math.sin(t * freqMultiplier) * Math.abs(verticalAmplitude) * 0.5;
        break;
        
      case 'square':
        // 方波 - 水平锯齿扫描（从右向左）+ 垂直方波
        horizontal = ((1 - ((t / (Math.PI * 2)) % 1)) * 2 - 1) * Math.abs(horizontalAmplitude);
        vertical = (Math.sin(t * freqMultiplier) >= 0 ? 1 : -1) * Math.abs(verticalAmplitude) * 0.5;
        break;
        
      case 'triangle':
        // 三角波 - 水平锯齿扫描（从右向左）+ 垂直三角波
        horizontal = ((1 - ((t / (Math.PI * 2)) % 1)) * 2 - 1) * Math.abs(horizontalAmplitude);
        vertical = (Math.abs(((t * freqMultiplier / Math.PI) % 2) - 1) * 2 - 1) * Math.abs(verticalAmplitude) * 0.5;
        break;
        
      case 'sawtooth':
        // 锯齿波 - 水平锯齿扫描（从右向左）+ 垂直锯齿波
        horizontal = ((1 - ((t / (Math.PI * 2)) % 1)) * 2 - 1) * Math.abs(horizontalAmplitude);
        vertical = (((t * freqMultiplier / (Math.PI * 2)) % 1) * 2 - 1) * Math.abs(verticalAmplitude) * 0.5;
        break;
        
      default:
        // 默认为简单的水平扫描（从右向左）
        horizontal = ((1 - ((t / (Math.PI * 2)) % 1)) * 2 - 1) * Math.abs(horizontalAmplitude);
        vertical = 0;
    }
    
    // 最终检查结果
    if (isNaN(horizontal) || isNaN(vertical)) {
      console.error('波形生成器 - 扫描模式计算结果为 NaN:', { type, t, horizontalAmplitude, verticalAmplitude, horizontal, vertical });
      return { horizontal: 0, vertical: 0 };
    }
    
    // 检测波形重置（水平位置从左侧跳回右侧）
    this.detectWaveformReset(horizontal);
    
    return { horizontal, vertical };
  }


  /**
   * 检测波形重置（水平扫描从左端跳回右端）
   * @param {number} currentHorizontal - 当前水平位置
   */
  detectWaveformReset(currentHorizontal) {
    // 检测从负值（左侧）跳到正值（右侧）的情况
    // 这表示开始了新的扫描周期（从右向左扫描完成后跳回右侧重新开始）
    if (this.lastHorizontalPosition < -0.5 && currentHorizontal > 0.5) {
      // 触发波形重置回调
      if (this.onWaveformReset) {
        this.onWaveformReset();
      }
    }
    
    // 更新上一次的水平位置
    this.lastHorizontalPosition = currentHorizontal;
  }

  /**
   * 设置波形重置回调函数
   * @param {Function} callback - 回调函数
   */
  setWaveformResetCallback(callback) {
    this.onWaveformReset = callback;
  }

  /**
   * 重置时间和时间戳
   * 在波形类型切换时调用，确保新波形从干净的状态开始
   */
  resetTime() {
    this.time = 0;
    this.lastTimestamp = 0;
    this.lastHorizontalPosition = 0;
    console.log('波形生成器时间已重置');
  }
} 