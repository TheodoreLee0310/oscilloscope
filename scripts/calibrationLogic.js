export const CalibrationLogic = (function() {
  // 检查校准状态
  function checkCalibrationStatus(calibrationFactor) {
    if (Math.abs(calibrationFactor - 1.0) < 0.02) {
      return { status: 'success', message: '校准完成！系数接近标准值' };
    } else if (Math.abs(calibrationFactor - 1.0) < 0.1) {
      return { status: 'warning', message: '校准接近完成，请继续调整' };
    } else {
      return { status: 'error', message: '校准偏差较大，需要调整' };
    }
  }

  // 应用校准调整
  function applyCalibrationAdjustment(calibrationFactor, displayAdjustFactors) {
    let effectiveFactor = calibrationFactor;
    
    // 时间微调系数影响校准因子
    effectiveFactor *= displayAdjustFactors.time;
    
    // 返回校准后的结果
    return effectiveFactor;
  }

  // 估算校准偏差和建议
  function estimateCalibrationDeviation(calibrationFactor) {
    const deviation = Math.abs(1.0 - calibrationFactor);
    const percentage = deviation * 100;
    
    let suggestion = '';
    if (deviation > 0.1) {
      suggestion = calibrationFactor < 1.0 ? 
        '建议增加时间微调值' : '建议减小时间微调值';
    }
    
    return {
      deviation: percentage.toFixed(1) + '%',
      suggestion
    };
  }
  
  /**
   * 设置实验步骤
   * @param {Object} state - 当前状态
   * @param {string} step - 目标实验步骤: 'calibration', 'normal', 'lissajous'
   * @returns {Object} - 更新后的状态
   */
  function setExperimentStep(state, step) {
    const result = { ...state };
    const previousStep = state.expStep;
    
    // 更新实验步骤
    result.expStep = step;
    
    // 如果从自检页面切换出来，保存当前校准设置
    if (previousStep === 'calibration' && step !== 'calibration') {
      result.savedCalibrationSettings = {
        displayAdjustFactors: {
          time: JSON.parse(JSON.stringify(state.displayAdjustFactors.time)),
          volts: {
            1: JSON.parse(JSON.stringify(state.displayAdjustFactors.volts[1])),
            2: JSON.parse(JSON.stringify(state.displayAdjustFactors.volts[2]))
          }
        },
        calibrationFactor: state.calibrationFactor
      };
    }
    
    // 若进入不同的步骤，执行相应逻辑
    if (step === 'normal') {
      // 切换到波形模式
      result.currentMode = 'wave';
    } else if (step === 'lissajous') {
      // 使用Lissajous逻辑切换到李萨如图模式
      // 基本的模式切换（去除全局依赖，保持最小逻辑）
      result.currentMode = 'lissajous';
      result.displayMode = 'vertical';
    } else if (step === 'calibration') {
      // 进入自检校准页面时，重置为独立显示模式和波形模式
      result.displayMode = 'independent';
      result.currentMode = 'wave';
    } else if (step === 'vrwave') {
      // VR寻波模式
      result.displayMode = 'independent';
      result.currentMode = 'wave';
    } else if (step === 'imagewave') {
      // 图片识别波形模式
      result.displayMode = 'independent';
      result.currentMode = 'wave';
    }
    
    // 清空历史轨迹
    result.pointsHistory = [];
    result.needsRedraw = true;
    
    return result;
  }
  
  /**
   * 更新微调滑块设置
   * @param {Object} state - 当前状态
   * @param {string} type - 参数类型 ('time', 'volts')
   * @param {number} [line] - 通道号（仅对电压有效）
   * @param {number} adjustAmount - 调整量
   * @returns {Object} - 更新后的状态
   */
  function updateAdjustFactor(state, type, line, adjustAmount) {
    const result = { ...state };
    
    // 创建深拷贝以避免修改原始对象
    result.displayAdjustFactors = JSON.parse(JSON.stringify(state.displayAdjustFactors));
    
    if (type === 'time') {
      // 更新时间调整因子
      let newFactor = state.displayAdjustFactors.time + adjustAmount;
      result.displayAdjustFactors.time = Math.min(2.0, Math.max(0.1, newFactor));
      
      // 如果在自检页面，同步更新保存的设置
      if (state.expStep === 'calibration') {
        result.savedCalibrationSettings = { 
          ...state.savedCalibrationSettings,
          displayAdjustFactors: {
            ...state.savedCalibrationSettings.displayAdjustFactors,
            time: result.displayAdjustFactors.time
          }
        };
      }
    } else if (type === 'volts' && line) {
      // 更新电压调整因子
      let newFactor = state.displayAdjustFactors.volts[line] + adjustAmount;
      result.displayAdjustFactors.volts[line] = Math.min(2.0, Math.max(0.1, newFactor));
      
      // 如果在自检页面，同步更新保存的设置
      if (state.expStep === 'calibration') {
        const updatedVolts = { ...state.savedCalibrationSettings.displayAdjustFactors.volts };
        updatedVolts[line] = result.displayAdjustFactors.volts[line];
        
        result.savedCalibrationSettings = { 
          ...state.savedCalibrationSettings,
          displayAdjustFactors: {
            ...state.savedCalibrationSettings.displayAdjustFactors,
            volts: updatedVolts
          }
        };
      }
    }
    
    result.needsRedraw = true;
    return result;
  }
  
  /**
   * 初始化校准环境
   * @param {Object} settings - 初始设置
   * @returns {Object} - 校准环境设置
   */
  function initializeCalibration(settings = {}) {
    // 创建校准环境的默认配置
    return {
      calibrationFactor: 0.85,  // 默认校准因子，模拟需要校准的状态
      calibrationParams: {
        frequencies: { 1: 1, 2: 1 },  // 固定为1赫兹
        peakValues: { 1: 4, 2: 4 },   // 固定为4V峰峰值
        waveTypes: { 1: 'square', 2: 'square' } // 固定为方波
      },
      displayAdjustFactors: {
        time: 1.0,
        volts: { 1: 1.0, 2: 1.0 }
      },
      savedCalibrationSettings: {
        displayAdjustFactors: {
          time: 1.0,
          volts: { 1: 1.0, 2: 1.0 }
        },
        calibrationFactor: 0.85
      },
      // 确保自检模式下的显示模式为独立模式
      displayMode: 'independent',
      currentMode: 'wave',
      // 合并用户设置
      ...settings
    };
  }

  // 返回公开的API
  return {
    checkCalibrationStatus,
    applyCalibrationAdjustment,
    estimateCalibrationDeviation,
    // 新增的功能性方法
    setExperimentStep,
    updateAdjustFactor,
    initializeCalibration
  };
})();

export default CalibrationLogic;
