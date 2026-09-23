/**
 * OscilloscopeState.js (ESM)
 * 示波器状态管理模块 - 统一管理共享状态
 */
export const OscilloscopeState = (function() {
  // 私有状态存储
  const state = {
    // 显示调整因子
    displayAdjustFactors: {
      time: 1.0,
      volts: { 1: 1.0, 2: 1.0 }
    },

    // 信号参数
    signal: {
      type: 'sine',
      frequencies: { 1: 1, 2: 1 },
      peakValues: { 1: 1, 2: 1 },
      phase: 0,
      phaseDiff: 0
    },

    // 触发器设置
    trigger: {
      level: 0,
      mode: 'auto',
      slope: 'rising',
      source: 1,
      active: true
    },

    // 视口参数
    viewport: {
      timeDiv: 1,
      voltsDiv: { 1: 1, 2: 1 },
      horizontalPosition: 0,
      verticalPosition: { 1: 0, 2: 0 }
    },

    // 校准设置
    calibration: {
      factor: 1.0,
      saved: {
        displayAdjustFactors: {
          time: 1.0,
          volts: { 1: 1.0, 2: 1.0 }
        },
        factor: 1.0
      }
    },

    // 通道状态
    channels: {
      1: { active: false },
      2: { active: false }
    },

    // 显示模式
    displayMode: 'independent',

    // 实验步骤
    expStep: 'calibration'
  };

  // 状态变更回调函数集合
  const listeners = new Set();

  // 通知所有监听器状态变化
  function notifyListeners() {
    listeners.forEach(listener => listener(state));
  }

  return {
    // 获取完整状态
    getState() {
      return { ...state };
    },

    // 获取特定状态片段
    get(path) {
      return path.split('.').reduce((obj, key) => obj?.[key], state);
    },

    // 更新状态
    update(path, value) {
      const keys = path.split('.');
      const lastKey = keys.pop();
      const target = keys.reduce((obj, key) => obj[key], state);
      target[lastKey] = value;
      notifyListeners();
    },

    // 批量更新状态
    batchUpdate(updates) {
      Object.entries(updates).forEach(([path, value]) => {
        this.update(path, value);
      });
    },

    // 添加状态变更监听器
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    // 重置状态到默认值
    reset() {
      Object.assign(state, {
        displayAdjustFactors: {
          time: 1.0,
          volts: { 1: 1.0, 2: 1.0 }
        },
        signal: {
          type: 'sine',
          frequencies: { 1: 1, 2: 1 },
          peakValues: { 1: 1, 2: 1 },
          phase: 0,
          phaseDiff: 0
        },
        trigger: {
          level: 0,
          mode: 'auto',
          slope: 'rising',
          source: 1,
          active: true
        },
        viewport: {
          timeDiv: 1,
          voltsDiv: { 1: 1, 2: 1 },
          horizontalPosition: 0,
          verticalPosition: { 1: 0, 2: 0 }
        }
      });
      notifyListeners();
    },

    // 导出当前状态
    export() {
      return JSON.stringify(state);
    },

    // 导入状态
    import(jsonState) {
      try {
        const newState = JSON.parse(jsonState);
        Object.assign(state, newState);
        notifyListeners();
      } catch (error) {
        console.error('导入状态失败:', error);
      }
    }
  };
})();

export default OscilloscopeState;