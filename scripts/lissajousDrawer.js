import { OscilloscopeConstants as CONSTANTS } from './constants.js';
import { drawGrid, calculateVoltage } from './WaveformUtilities.js';

export const LissajousDrawer = (function() {
  // 高精度最大公约数计算（转换为整数处理，保证精度）
  function gcdPrecise(a, b) {
    const precision = 1000;
    a = Math.round(a * precision);
    b = Math.round(b * precision);
    
    while (b > 0) {
      const temp = b;
      b = a % b;
      a = temp;
    }
    
    return a / precision;
  }

  // 高精度最小公倍数计算
  function lcmPrecise(a, b) {
    if (a === 0 || b === 0) return 0;
    const gcd = gcdPrecise(a, b);
    return Math.abs(a * b) / gcd;
  }

  // 使用两条垂直交叉的线生成李萨如图
  function drawLissajous(ctx, params) {
    try {
      const { 
        freqX, freqY, phaseDiff, phase, lissajousOptimization,
        peakValues, horizontalPosition, verticalPosition, voltsDiv
      } = params;

      // 使用共享常量
      const canvasWidth = CONSTANTS.CANVAS.WIDTH;
      const canvasHeight = CONSTANTS.CANVAS.HEIGHT;
      const gridSize = CONSTANTS.GRID.SIZE;
      const twoPI = CONSTANTS.MATH.TWO_PI;
      
      // 缺省值处理
      const amplitudeX = peakValues && peakValues[1] ? peakValues[1] / 2 : 1;
      const amplitudeY = peakValues && peakValues[2] ? peakValues[2] / 2 : 1;
      
      // 处理位置偏移
      const horizontalOffset = horizontalPosition || 0;
      const verticalOffset = verticalPosition && verticalPosition[1] ? verticalPosition[1] : 0;
      
      // 修正计算中心点
      const centerX = canvasWidth / 2 + horizontalOffset * gridSize;
      const centerY = canvasHeight / 2 + verticalOffset * gridSize;
      
      // 获取电压分度值，如果不存在则使用默认值1
      const voltsDivX = voltsDiv && voltsDiv[1] ? voltsDiv[1] : 1;
      const voltsDivY = voltsDiv && voltsDiv[2] ? voltsDiv[2] : 1;
      
      // 计算缩放系数
      const scaleX = gridSize * (amplitudeX / voltsDivX);
      const scaleY = gridSize * (amplitudeY / voltsDivY);
      
      // 相位转换为弧度
      const phaseRad = (phaseDiff * Math.PI) / 180;
      
      // 清除画布并绘制网格
      ctx.clearRect(0, 0, canvasWidth, canvasHeight);
      drawGrid(ctx);
      
      // 验证参数
      if (freqX <= 0 || freqY <= 0) {
        console.warn('频率值必须为正数');
        return;
      }
      
      // 频率简化：应用频率优化逻辑
      const { effectiveFreqX, effectiveFreqY } = optimizeFrequencies(
        freqX, freqY, lissajousOptimization
      );
      
      // 计算当前点位置
      const currentT = phase;
      const xPos = centerX + scaleX * Math.sin(effectiveFreqX * currentT);
      const yPos = centerY - scaleY * Math.sin(effectiveFreqY * currentT + phaseRad);
      
      // 绘制李萨如图形
      drawLissajousFigure(ctx, {
        effectiveFreqX, effectiveFreqY, phaseRad, 
        centerX, centerY, scaleX, scaleY,
        twoPI
      });
      
      // 绘制交叉线
      drawCrossLines(ctx, xPos, yPos, centerX, centerY, scaleX, scaleY);
      
      // 绘制信息面板
      drawLissajousInfoPanel(ctx, freqX, freqY, phaseDiff);
      
    } catch (error) {
      console.error('Lissajous drawing failed:', error);
    }
  }
  
  // 优化频率处理
  function optimizeFrequencies(freqX, freqY, lissajousOptimization) {
    let effectiveFreqX = freqX;
    let effectiveFreqY = freqY;
    
    // 如果启用自动简化并且频率超过阈值
    if (lissajousOptimization && lissajousOptimization.autoSimplifyRatio && 
        (freqX > lissajousOptimization.highFrequencyThreshold || 
         freqY > lissajousOptimization.highFrequencyThreshold)) {
      
      // 简化频率比例
      const gcdVal = gcdPrecise(freqX, freqY);
      if (gcdVal > 0.001) {
        effectiveFreqX = freqX / gcdVal;
        effectiveFreqY = freqY / gcdVal;
      }
      
      // 限制最大频率比例值
      const maxRatioValue = 20;
      if (effectiveFreqX > maxRatioValue || effectiveFreqY > maxRatioValue) {
        const scaleFactor = Math.max(effectiveFreqX, effectiveFreqY) / maxRatioValue;
        effectiveFreqX = effectiveFreqX / scaleFactor;
        effectiveFreqY = effectiveFreqY / scaleFactor;
      }
    }
    
    return { effectiveFreqX, effectiveFreqY };
  }
  
  // 绘制李萨如图形主体
  function drawLissajousFigure(ctx, params) {
    const { 
      effectiveFreqX, effectiveFreqY, phaseRad, 
      centerX, centerY, scaleX, scaleY, twoPI
    } = params;
    
    // 设置绘图样式
    ctx.beginPath();
    ctx.strokeStyle = '#00FF00';
    ctx.lineWidth = 2.5;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    
    // 特殊处理简单整数比例
    const isSimpleIntegerRatio = 
      Math.abs(effectiveFreqX - Math.round(effectiveFreqX)) < 0.001 && 
      Math.abs(effectiveFreqY - Math.round(effectiveFreqY)) < 0.001 &&
      effectiveFreqX <= 10 && effectiveFreqY <= 10;
    
    if (isSimpleIntegerRatio) {
      // 简单整数比例情况
      const lcm = lcmPrecise(effectiveFreqX, effectiveFreqY);
      const periodLength = twoPI;
      const cycles = Math.max(2, Math.min(10, Math.ceil(lcm)));
      
      // 增加采样点数量以获得更平滑的曲线
      const pointCount = 2000;
      drawParametricCurve(ctx, pointCount, t => {
        const time = (t / pointCount) * periodLength * cycles;
        const x = centerX + scaleX * Math.sin(effectiveFreqX * time);
        const y = centerY - scaleY * Math.sin(effectiveFreqY * time + phaseRad);
        return { x, y };
      });
    } else {
      // 复杂比例情况 - 绘制足够多的点确保图形完整
      const pointCount = 8000;
      const maxTime = 10 * Math.PI;
      
      drawParametricCurve(ctx, pointCount, t => {
        const time = (t / pointCount) * maxTime;
        const x = centerX + scaleX * Math.sin(effectiveFreqX * time);
        const y = centerY - scaleY * Math.sin(effectiveFreqY * time + phaseRad);
        return { x, y };
      });
    }
    
    // 设置线条渲染属性
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
  }
  
  // 通用参数曲线绘制函数
  function drawParametricCurve(ctx, pointCount, paramFunc) {
    for (let i = 0; i <= pointCount; i++) {
      const { x, y } = paramFunc(i);
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
  }
  
  // 绘制交叉线
  function drawCrossLines(ctx, xPos, yPos, centerX, centerY, scaleX, scaleY) {
    // 水平线 - 表示Y方向的位置
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(66, 185, 131, 0.8)'; // 绿色
    ctx.lineWidth = 1;
    ctx.moveTo(centerX - scaleX, yPos);
    ctx.lineTo(centerX + scaleX, yPos);
    ctx.stroke();
    
    // 垂直线 - 表示X方向的位置
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255, 87, 34, 0.5)'; // 橙色
    ctx.lineWidth = 1;
    ctx.moveTo(xPos, centerY - scaleY);
    ctx.lineTo(xPos, centerY + scaleY);
    ctx.stroke();
    
    // 绘制当前点（交叉点）
    ctx.beginPath();
    ctx.fillStyle = '#FFEB3B'; // 黄色
    ctx.arc(xPos, yPos, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  
  // 绘制信息面板
  function drawLissajousInfoPanel(ctx, freqX, freqY, phaseDiff) {
    // 设置文本样式
    ctx.font = '14px Arial';
    ctx.textAlign = 'right';
    
    // 添加半透明背景
    ctx.fillStyle = 'rgba(0, 0, 0, 0)';
    ctx.fillRect(650, 10, 140, 70);
    
    // 计算是否需要简化，并获取简化后的比例
    const simplifiedRatio = calculateSimplifiedRatio(freqX, freqY);
    
    // 显示频率比信息 - 只显示一种形式的比例
    ctx.fillStyle = 'rgba(66, 185, 131, 1)';
    if (simplifiedRatio.needsSimplification) {
      // 显示简化后的比例
      ctx.fillText(`频率比 (X:Y): ${simplifiedRatio.x}:${simplifiedRatio.y}`, 780, 40);
    } else {
      // 显示原始比例
      ctx.fillText(`频率比 (X:Y): ${freqX}:${freqY}`, 780, 40);
    }
    
    // 显示初相差信息
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(`初相差: ${phaseDiff}°`, 780, 70);
  }

  /**
   * 计算简化后的频率比
   * @param {number} freqX - X轴频率
   * @param {number} freqY - Y轴频率
   * @returns {Object} - 简化后的频率比对象 {x, y, needsSimplification}
   */
  function calculateSimplifiedRatio(freqX, freqY) {
    // 特殊情况处理
    if (freqX === 0 || freqY === 0) {
      return { 
        x: freqX, 
        y: freqY, 
        needsSimplification: false 
      };
    }
    
    const gcd = gcdPrecise(freqX, freqY);
    
    if (gcd < 0.001) {
      return { 
        x: freqX, 
        y: freqY, 
        needsSimplification: false 
      };
    }

    let simplifiedX = freqX / gcd;
    let simplifiedY = freqY / gcd;

    // 如果结果接近整数，则四舍五入为整数
    if (Math.abs(Math.round(simplifiedX) - simplifiedX) < 0.01) {
      simplifiedX = Math.round(simplifiedX);
    } else {
      simplifiedX = parseFloat(simplifiedX.toFixed(2));
    }
    
    if (Math.abs(Math.round(simplifiedY) - simplifiedY) < 0.01) {
      simplifiedY = Math.round(simplifiedY);
    } else {
      simplifiedY = parseFloat(simplifiedY.toFixed(2));
    }
    
    // 判断是否需要显示简化比例
    const needsSimplification = Math.abs(freqX - simplifiedX) > 0.01 || 
                               Math.abs(freqY - simplifiedY) > 0.01 ||
                               // 或者两个频率大于10但可以被化简为较小的值
                               (freqX > 10 || freqY > 10) && (simplifiedX <= 10 && simplifiedY <= 10);
    
    return { 
      x: simplifiedX, 
      y: simplifiedY,
      needsSimplification
    };
  }
  
  /**
   * 切换到李萨如图模式
   * @param {Object} settings - 当前设置和参数
   * @returns {Object} - 更新后的设置
   */
  function switchToLissajousMode(settings) {
    // 创建设置的副本
    const updatedSettings = { ...settings };
    
    // 更新模式
    updatedSettings.currentMode = 'lissajous';
    
    // 切换到垂直叠加模式
    updatedSettings.displayMode = 'vertical';
    
    // 在李萨如模式下暂时禁用触发系统
    updatedSettings.triggerActive = false;
    
    // 重置位置
    updatedSettings.horizontalPosition = 0;
    updatedSettings.verticalPosition = { 1: 0, 2: 0 };
    
    // 确保初始频率与当前波形频率匹配（如果可能）
    if (settings.inputActive && settings.inputActive[1] && settings.frequencies) {
      updatedSettings.freqX = settings.frequencies[1] || 1;
    }
    
    if (settings.inputActive && settings.inputActive[2] && settings.frequencies) {
      updatedSettings.freqY = settings.frequencies[2] || 1;
    }
    
    // 返回更新后的设置
    return updatedSettings;
  }
  
  /**
   * 切换回波形模式
   * @param {Object} settings - 当前设置和参数
   * @returns {Object} - 更新后的设置
   */
  function switchToWaveMode(settings) {
    // 创建设置的副本
    const updatedSettings = { ...settings };
    
    // 更新模式
    updatedSettings.currentMode = 'wave';
    
    // 如果当前是垂直叠加模式，切换到独立显示
    if (settings.displayMode === 'vertical') {
      updatedSettings.displayMode = 'independent';
    }
    
    // 清空轨迹历史
    updatedSettings.pointsHistory = [];
    updatedSettings.needsRedraw = true;
    
    // 重新启用触发系统
    updatedSettings.triggerActive = true;
    
    // 返回更新后的设置
    return updatedSettings;
  }
  
  /**
   * 调整频率和相位差参数
   * @param {Object} settings - 当前设置
   * @param {string} paramType - 参数类型 ('freqX', 'freqY', 'phaseDiff')
   * @param {number} step - 调整步长
   * @returns {Object} - 更新后的设置
   */
  function adjustLissajousParam(settings, paramType, step) {
    const result = { ...settings };
    
    switch (paramType) {
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

  // 返回公开的API
  return {
    drawLissajous,
    gcdPrecise,
    lcmPrecise,
    // 新增的功能性方法
    calculateSimplifiedRatio,
    switchToLissajousMode,
    switchToWaveMode,
    adjustLissajousParam
  };
})();

export default LissajousDrawer;
