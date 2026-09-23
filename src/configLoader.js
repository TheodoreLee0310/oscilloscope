// 配置加载器 - 从JSON加载并处理配置
import configData from './config.json';

// 递归处理对象，将字符串形式的十六进制颜色转换为数字
function processConfig(obj) {
  if (typeof obj === 'string' && obj.startsWith('0x')) {
    // 转换十六进制字符串为数字
    return parseInt(obj, 16);
  } else if (Array.isArray(obj)) {
    // 处理数组
    return obj.map(processConfig);
  } else if (obj && typeof obj === 'object') {
    // 处理对象
    const processed = {};
    for (const [key, value] of Object.entries(obj)) {
      processed[key] = processConfig(value);
    }
    return processed;
  }
  return obj;
}

// 处理配置数据
const processedConfig = processConfig(configData);

// 导出处理后的配置
export const CONFIG = processedConfig.CONFIG;
export const WAVEFORM_TYPES = processedConfig.WAVEFORM_TYPES;
