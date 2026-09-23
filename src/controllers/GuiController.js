import * as dat from 'dat.gui';
import { CONFIG, WAVEFORM_TYPES } from '../configLoader';

export class GuiController {
  constructor(callbacks = {}) {
    // 响应式宽度计算 - 基于2560*1440标准向下兼容
    this.getResponsiveWidth = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      
      // 2K分辨率及以上 (2560*1440+)
      if (width >= 2560 && height >= 1440) return 400;
      // 标准FHD (1920*1080)
      if (width >= 1920 && height >= 1080) return 350;
      // 中等分辨率 (1366*768, 1600*900)
      if (width >= 1366) return 300;
      // 小屏幕 (1024*768)
      if (width >= 1024) return 260;
      // 平板 (768px-1023px)
      if (width >= 768) return 240;
      // 移动设备 (< 768px)
      return 220;
    };
    
    this.gui = new dat.GUI({ width: this.getResponsiveWidth() });
    this.callbacks = callbacks;
    
    // 保存回调函数
    this.onBeamChange = callbacks.onBeamChange || (() => {});
    this.onDeflectionChange = callbacks.onDeflectionChange || (() => {});
    this.onWaveformChange = callbacks.onWaveformChange || (() => {});
    this.onScreenChange = callbacks.onScreenChange || (() => {});
    this.onShellChange = callbacks.onShellChange || (() => {});
    
    this.initGui();
    this.setupResponsiveHandlers();
  }
  
  initGui() {
    // 创建各个控制面板
    this.initBeamControls();
    this.initDeflectionControls();
    this.initWaveformControls();
    this.initScreenControls();
    this.initShellControls();
  }
  
  initBeamControls() {
    const beamFolder = this.gui.addFolder('电子束参数');
    
    beamFolder.add(CONFIG.beam, 'intensity', 0, 1)
      .name('强度')
      .onChange(() => this.onBeamChange(CONFIG.beam));
      
    beamFolder.addColor({ color: CONFIG.beam.color }, 'color')
      .name('颜色')
      .onChange((value) => {
        CONFIG.beam.color = value;
        this.onBeamChange(CONFIG.beam);
      });
      
    beamFolder.open();
  }
  
  initDeflectionControls() {
    const deflectionFolder = this.gui.addFolder('偏转板参数');
    
    deflectionFolder.add(CONFIG.deflection.horizontal, 'voltage', -5, 5, 0.1)
      .name('水平电压 (V)')
      .onChange(() => this.onDeflectionChange(CONFIG.deflection));
      
    deflectionFolder.add(CONFIG.deflection.vertical, 'voltage', -5, 5, 0.1)
      .name('垂直电压 (V)')
      .onChange(() => this.onDeflectionChange(CONFIG.deflection));
      
    deflectionFolder.open();
  }
  
  initWaveformControls() {
    const waveformFolder = this.gui.addFolder('波形参数');
    
    // 创建波形类型下拉菜单
    const waveformOptions = {};
    Object.entries(WAVEFORM_TYPES).forEach(([key, value]) => {
      waveformOptions[value] = key;
    });
    
    waveformFolder.add(CONFIG.waveform, 'enabled')
      .name('启用波形')
      .onChange(() => this.onWaveformChange(CONFIG.waveform));
      
    waveformFolder.add(CONFIG.waveform, 'type', Object.keys(WAVEFORM_TYPES))
      .name('波形类型')
      .onChange(() => this.onWaveformChange(CONFIG.waveform));
      
    waveformFolder.add(CONFIG.waveform, 'frequency', 0.1, 5, 0.1)
      .name('频率 (Hz)')
      .onChange(() => this.onWaveformChange(CONFIG.waveform));
      
    waveformFolder.add(CONFIG.waveform, 'amplitude', 0, 5, 0.1)
      .name('振幅')
      .onChange(() => this.onWaveformChange(CONFIG.waveform));
      
    waveformFolder.open();
  }
  
  initScreenControls() {
    const screenFolder = this.gui.addFolder('荧光屏参数');
    
    screenFolder.add(CONFIG.screen, 'persistence', 0, 1, 0.01)
      .name('余辉持续')
      .onChange(() => this.onScreenChange(CONFIG.screen));
      
    screenFolder.addColor({ color: CONFIG.screen.color }, 'color')
      .name('荧光颜色')
      .onChange((value) => {
        CONFIG.screen.color = value;
        this.onScreenChange(CONFIG.screen);
      });
      
    screenFolder.add(CONFIG.screen, 'intensity', 0, 1, 0.1)
      .name('发光强度')
      .onChange(() => this.onScreenChange(CONFIG.screen));
      
    screenFolder.open();
  }
  
  initShellControls() {
    const shellFolder = this.gui.addFolder('外壳参数');
    
    shellFolder.add(CONFIG.shell, 'visible')
      .name('显示外壳')
      .onChange(() => this.onShellChange(CONFIG.shell));
      
    shellFolder.add(CONFIG.shell, 'opacity', 0, 1, 0.01)
      .name('透明度')
      .onChange(() => this.onShellChange(CONFIG.shell));
      
  
    shellFolder.open();
  }
  
  /**
   * 设置响应式处理器
   */
  setupResponsiveHandlers() {
    // 防抖函数
    let resizeTimeout;
    const debounce = (func, wait) => {
      return function executedFunction(...args) {
        const later = () => {
          clearTimeout(resizeTimeout);
          func(...args);
        };
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(later, wait);
      };
    };
    
    // 窗口大小改变时调整GUI宽度
    const handleResize = debounce(() => {
      const newWidth = this.getResponsiveWidth();
      if (this.gui && this.gui.domElement) {
        this.gui.width = newWidth;
        // 手动更新GUI的DOM样式
        const guiElement = this.gui.domElement;
        if (guiElement) {
          guiElement.style.width = newWidth + 'px';
        }
      }
    }, 250);
    
    // 监听窗口大小变化
    window.addEventListener('resize', handleResize);
    
    // 存储清理函数
    this.cleanup = () => {
      window.removeEventListener('resize', handleResize);
    };
  }
  
  /**
   * 销毁GUI控制器
   */
  destroy() {
    if (this.cleanup) {
      this.cleanup();
    }
    if (this.gui) {
      this.gui.destroy();
    }
  }
} 