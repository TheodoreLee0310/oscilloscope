import { CONFIG } from '../configLoader';

/**
 * UI控制器类
 * 负责管理界面元素和交互
 */
export class UIController {
  /**
   * 构造函数
   * @param {Object} options - 选项
   * @param {Object} options.components - 组件对象
   * @param {Object} options.controllers - 控制器对象
   */
  constructor(options = {}) {
    this.components = options.components || {};
    this.controllers = options.controllers || {};
    
    // 创建UI容器
    this.container = document.createElement('div');
    this.container.id = 'ui-container';
    
    // 确保DOM已加载
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        this.initializeUI();
      });
    } else {
      this.initializeUI();
    }
  }
  
  /**
   * 初始化UI（在DOM加载完成后调用）
   */
  initializeUI() {
    console.log('初始化UI...');
    document.body.appendChild(this.container);
    
    // 初始化UI
    this.initStyles();
    this.initUI();
    
    // 检查controllers是否正确传递
    console.log('检查控制器:', {
      labelSystem: !!this.controllers.labelSystem,
      explodedView: !!this.controllers.explodedView,
      demoAnimation: !!this.controllers.demoAnimation
    });
    
    console.log('UI控制器初始化完成');
  }
  
  /**
   * 初始化样式
   */
  initStyles() {
    const style = document.createElement('style');
    style.textContent = `
      #ui-container {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
      }
      
      .control-panel {
        position: absolute;
        bottom: ${CONFIG.ui.controlPanel.position.bottom};
        right: ${CONFIG.ui.controlPanel.position.right};
        background-color: ${CONFIG.ui.controlPanel.backgroundColor};
        border-radius: ${CONFIG.ui.controlPanel.borderRadius};
        padding: ${CONFIG.ui.controlPanel.padding};
        color: white;
        font-family: Arial, sans-serif;
        pointer-events: auto;
        display: flex;
        flex-direction: column;
        gap: 10px;
        z-index: ${CONFIG.ui.controlPanel.zIndex};
      }
      
      .control-panel button {
        background-color: ${CONFIG.ui.button.backgroundColor};
        border: none;
        color: white;
        padding: ${CONFIG.ui.button.padding};
        text-align: center;
        text-decoration: none;
        display: inline-block;
        font-size: 14px;
        margin: 2px;
        cursor: pointer;
        border-radius: ${CONFIG.ui.button.borderRadius};
        transition: background-color 0.3s;
      }
      
      .control-panel button:hover {
        background-color: ${CONFIG.ui.button.hoverColor};
      }
      
      .control-panel button.active {
        background-color: ${CONFIG.ui.button.activeColor};
      }
      
      .control-panel button.warning {
        background-color: ${CONFIG.ui.button.warningColor};
      }
      
      .control-panel .button-group {
        display: flex;
        flex-wrap: wrap;
        gap: 5px;
      }
      
      .demo-panel {
        position: absolute;
        top: ${CONFIG.ui.demoPanel.position.top};
        left: ${CONFIG.ui.demoPanel.position.left};
        background-color: ${CONFIG.ui.demoPanel.backgroundColor};
        border-radius: ${CONFIG.ui.demoPanel.borderRadius};
        padding: ${CONFIG.ui.demoPanel.padding};
        color: white;
        font-family: Arial, sans-serif;
        pointer-events: auto;
        max-width: ${CONFIG.ui.demoPanel.maxWidth};
        z-index: ${CONFIG.ui.demoPanel.zIndex};
        transition: opacity 0.5s;
      }
      
      .demo-panel h2 {
        margin-top: 0;
        margin-bottom: 10px;
        font-size: 18px;
      }
      
      .demo-panel p {
        margin-bottom: 15px;
        font-size: 14px;
        line-height: 1.5;
      }
      
      .demo-panel .progress {
        width: 100%;
        height: 4px;
        background-color: #555;
        margin-top: 10px;
        border-radius: 2px;
        overflow: hidden;
      }
      
      .demo-panel .progress-bar {
        height: 100%;
        background-color: #4CAF50;
        width: 0%;
        transition: width 0.3s;
      }
      
      .demo-panel .step-info {
        display: flex;
        justify-content: space-between;
        font-size: 12px;
        margin-top: 5px;
      }
    `;
    document.head.appendChild(style);
  }
  
  /**
   * 初始化UI
   */
  initUI() {
    this.initControlPanel();
    this.initDemoPanel();
  }
  
  /**
   * 初始化控制面板
   */
  initControlPanel() {
    console.log('初始化控制面板...');
    
    // 创建控制面板
    this.controlPanel = document.createElement('div');
    this.controlPanel.className = 'control-panel';
    this.container.appendChild(this.controlPanel);
    
    // 标签控制
    const labelGroup = document.createElement('div');
    labelGroup.className = 'button-group';
    
    const labelTitle = document.createElement('div');
    labelTitle.textContent = '标签控制';
    labelTitle.style.marginBottom = '5px';
    labelGroup.appendChild(labelTitle);
    
    const toggleLabelsBtn = document.createElement('button');
    toggleLabelsBtn.textContent = '显示标签';
    toggleLabelsBtn.onclick = () => {
      console.log('标签按钮被点击');
      this.toggleLabels();
    };
    toggleLabelsBtn.id = 'toggle-labels-btn';
    labelGroup.appendChild(toggleLabelsBtn);
    
    this.controlPanel.appendChild(labelGroup);
    
    // 分解视图控制
    const explodeGroup = document.createElement('div');
    explodeGroup.className = 'button-group';
    
    const explodeTitle = document.createElement('div');
    explodeTitle.textContent = '分解视图';
    explodeTitle.style.marginBottom = '5px';
    explodeGroup.appendChild(explodeTitle);
    
    const toggleExplodeBtn = document.createElement('button');
    toggleExplodeBtn.textContent = '分解视图';
    toggleExplodeBtn.onclick = () => {
      console.log('分解视图按钮被点击');
      this.toggleExplodedView();
    };
    toggleExplodeBtn.id = 'toggle-explode-btn';
    explodeGroup.appendChild(toggleExplodeBtn);
    
    const resetViewBtn = document.createElement('button');
    resetViewBtn.textContent = '重置视图';
    resetViewBtn.onclick = () => {
      console.log('重置视图按钮被点击');
      this.resetView();
    };
    explodeGroup.appendChild(resetViewBtn);
    
    this.controlPanel.appendChild(explodeGroup);
    
    // 组件聚焦控制
    const focusGroup = document.createElement('div');
    focusGroup.className = 'button-group';
    
    const focusTitle = document.createElement('div');
    focusTitle.textContent = '聚焦组件';
    focusTitle.style.marginBottom = '5px';
    focusGroup.appendChild(focusTitle);
    
    // 为每个主要组件创建聚焦按钮
    const components = [
      { key: 'gun', name: '电子枪' },
      { key: 'v1', name: '垂直偏转板' },
      { key: 'h1', name: '水平偏转板' },
      { key: 'screen', name: '荧光屏' }
    ];
    
    components.forEach(comp => {
      const btn = document.createElement('button');
      btn.textContent = comp.name;
      btn.onclick = () => {
        console.log('聚焦到组件:', comp.key);
        this.focusComponent(comp.key);
      };
      focusGroup.appendChild(btn);
    });
    
    this.controlPanel.appendChild(focusGroup);
    
    // 演示动画控制
    const demoGroup = document.createElement('div');
    demoGroup.className = 'button-group';
    
    const demoTitle = document.createElement('div');
    demoTitle.textContent = '工作原理演示';
    demoTitle.style.marginBottom = '5px';
    demoGroup.appendChild(demoTitle);
    
    const startDemoBtn = document.createElement('button');
    startDemoBtn.textContent = '开始演示';
    startDemoBtn.onclick = () => {
      console.log('开始演示按钮被点击');
      this.startDemoAnimation();
    };
    startDemoBtn.id = 'start-demo-btn';
    demoGroup.appendChild(startDemoBtn);
    
    const stopDemoBtn = document.createElement('button');
    stopDemoBtn.textContent = '停止演示';
    stopDemoBtn.onclick = () => {
      console.log('停止演示按钮被点击');
      this.stopDemoAnimation();
    };
    stopDemoBtn.className = 'warning';
    stopDemoBtn.style.display = 'none';
    stopDemoBtn.id = 'stop-demo-btn';
    demoGroup.appendChild(stopDemoBtn);
    
    this.controlPanel.appendChild(demoGroup);
    
    console.log('控制面板初始化完成');
  }
  
  /**
   * 初始化演示面板
   */
  initDemoPanel() {
    this.demoPanel = document.createElement('div');
    this.demoPanel.className = 'demo-panel';
    this.demoPanel.style.opacity = '0';
    this.demoPanel.style.display = 'none';
    this.container.appendChild(this.demoPanel);
    
    // 标题
    this.demoTitle = document.createElement('h2');
    this.demoPanel.appendChild(this.demoTitle);
    
    // 描述
    this.demoDescription = document.createElement('p');
    this.demoPanel.appendChild(this.demoDescription);
    
    // 进度条
    const progressContainer = document.createElement('div');
    progressContainer.className = 'progress';
    this.progressBar = document.createElement('div');
    this.progressBar.className = 'progress-bar';
    progressContainer.appendChild(this.progressBar);
    this.demoPanel.appendChild(progressContainer);
    
    // 步骤信息
    const stepInfo = document.createElement('div');
    stepInfo.className = 'step-info';
    this.stepCurrent = document.createElement('span');
    this.stepTotal = document.createElement('span');
    stepInfo.appendChild(this.stepCurrent);
    stepInfo.appendChild(this.stepTotal);
    this.demoPanel.appendChild(stepInfo);
  }
  
  /**
   * 切换标签显示
   */
  toggleLabels() {
    console.log('切换标签显示', this.controllers.labelSystem);
    if (!this.controllers.labelSystem) {
      console.error('标签系统未初始化');
      return;
    }
    
    const visible = !this.controllers.labelSystem.visible;
    console.log('设置标签可见性:', visible);
    this.controllers.labelSystem.setVisible(visible);
    
    // 更新按钮文本
    const btn = document.getElementById('toggle-labels-btn');
    if (btn) {
      btn.textContent = visible ? '隐藏标签' : '显示标签';
      btn.classList.toggle('active', visible);
      console.log('按钮状态已更新');
    } else {
      console.error('找不到标签按钮');
    }
  }
  
  /**
   * 切换分解视图
   */
  toggleExplodedView() {
    console.log('切换分解视图', this.controllers.explodedView);
    console.log('当前components:', this.components);
    console.log('crtShell存在?', !!this.components.crtShell);
    
    if (!this.controllers.explodedView) return;
    
    const exploded = this.controllers.explodedView.toggle();
    console.log('分解视图状态:', exploded);
    
    // 同时切换cylinder2的爆炸效果
    if (this.components.crtShell && this.components.crtShell.toggleCylinder2Explode) {
      console.log('正在调用cylinder2爆炸效果...');
      const cylinder2Exploded = this.components.crtShell.toggleCylinder2Explode(exploded);
      console.log('Cylinder2爆炸状态:', cylinder2Exploded);
    } else {
      console.warn('无法调用cylinder2爆炸效果:', {
        crtShell: !!this.components.crtShell,
        toggleMethod: !!(this.components.crtShell && this.components.crtShell.toggleCylinder2Explode)
      });
    }
    
    // 同时切换旋转曲线连接的爆炸效果
    if (this.components.crtShell && this.components.crtShell.toggleConnectionExplode) {
      console.log('正在调用旋转曲线连接爆炸效果...');
      const connectionExploded = this.components.crtShell.toggleConnectionExplode(exploded);
      console.log('旋转曲线连接爆炸状态:', connectionExploded);
    } else {
      console.warn('无法调用旋转曲线连接爆炸效果:', {
        crtShell: !!this.components.crtShell,
        toggleMethod: !!(this.components.crtShell && this.components.crtShell.toggleConnectionExplode)
      });
    }
    
    // 同时切换超椭圆形状渐变的爆炸效果
    if (this.components.crtShell && this.components.crtShell.toggleSuperellipseExplode) {
      console.log('正在调用超椭圆形状渐变爆炸效果...');
      const superellipseExploded = this.components.crtShell.toggleSuperellipseExplode(exploded);
      console.log('超椭圆形状渐变爆炸状态:', superellipseExploded);
    } else {
      console.warn('无法调用超椭圆形状渐变爆炸效果:', {
        crtShell: !!this.components.crtShell,
        toggleMethod: !!(this.components.crtShell && this.components.crtShell.toggleSuperellipseExplode)
      });
    }
    
    // 更新按钮文本
    const btn = document.getElementById('toggle-explode-btn');
    if (btn) {
      btn.textContent = exploded ? '合并视图' : '分解视图';
      btn.classList.toggle('active', exploded);
    }
  }
  
  /**
   * 重置视图
   */
  resetView() {
    if (!this.controllers.explodedView) return;
    
    this.controllers.explodedView.resetView(
      this.controllers.camera,
      this.controllers.controls
    );
    
    // 重置cylinder2爆炸状态
    if (this.components.crtShell && this.components.crtShell.toggleCylinder2Explode) {
      this.components.crtShell.toggleCylinder2Explode(false);
      console.log('重置Cylinder2爆炸状态');
    }
    
    // 重置旋转曲线连接爆炸状态
    if (this.components.crtShell && this.components.crtShell.toggleConnectionExplode) {
      this.components.crtShell.toggleConnectionExplode(false);
      console.log('重置旋转曲线连接爆炸状态');
    }
    
    // 重置超椭圆形状渐变爆炸状态
    if (this.components.crtShell && this.components.crtShell.toggleSuperellipseExplode) {
      this.components.crtShell.toggleSuperellipseExplode(false);
      console.log('重置超椭圆形状渐变爆炸状态');
    }
    
    // 更新分解视图按钮状态
    const explodeBtn = document.getElementById('toggle-explode-btn');
    if (explodeBtn) {
      explodeBtn.textContent = '分解视图';
      explodeBtn.classList.remove('active');
    }
  }
  
  /**
   * 聚焦到组件
   * @param {string} componentKey - 组件键名
   */
  focusComponent(componentKey) {
    console.log('focusComponent被调用，componentKey:', componentKey);
    console.log('this.controllers:', this.controllers);
    console.log('this.controllers.explodedView:', this.controllers.explodedView);
    console.log('this.controllers.camera:', this.controllers.camera);
    console.log('this.controllers.controls:', this.controllers.controls);
    
    if (!this.controllers.explodedView) {
      console.error('explodedView未初始化');
      return;
    }
    
    if (!this.controllers.camera) {
      console.error('camera未初始化');
      return;
    }
    
    if (!this.controllers.controls) {
      console.error('controls未初始化');
      return;
    }
    
    console.log('开始调用explodedView.focusComponent');
    this.controllers.explodedView.focusComponent(
      componentKey,
      this.controllers.camera,
      this.controllers.controls
    );
    console.log('explodedView.focusComponent调用完成');
  }
  
  /**
   * 开始演示动画
   */
  startDemoAnimation() {
    console.log('startDemoAnimation被调用');
    console.log('this.controllers.demoAnimation:', this.controllers.demoAnimation);
    
    if (!this.controllers.demoAnimation) {
      console.error('demoAnimation未初始化');
      return;
    }
    
    console.log('显示演示面板');
    // 显示演示面板
    this.showDemoPanel();
    
    console.log('设置步骤回调');
    // 设置步骤回调
    this.controllers.demoAnimation.onStepStart = (stepIndex, step) => {
      console.log('步骤回调被触发:', stepIndex, step);
      this.updateDemoPanel(stepIndex, step);
    };
    
    console.log('开始演示');
    // 开始演示
    this.controllers.demoAnimation.start();
    
    console.log('更新按钮状态');
    // 更新按钮状态
    document.getElementById('start-demo-btn').style.display = 'none';
    document.getElementById('stop-demo-btn').style.display = 'inline-block';
    
    console.log('startDemoAnimation完成');
  }
  
  /**
   * 停止演示动画
   */
  stopDemoAnimation() {
    if (!this.controllers.demoAnimation) return;
    
    // 停止演示
    this.controllers.demoAnimation.stop();
    
    // 隐藏演示面板
    this.hideDemoPanel();
    
    // 更新按钮状态
    document.getElementById('start-demo-btn').style.display = 'inline-block';
    document.getElementById('stop-demo-btn').style.display = 'none';
  }
  
  /**
   * 显示演示面板
   */
  showDemoPanel() {
    this.demoPanel.style.display = 'block';
    setTimeout(() => {
      this.demoPanel.style.opacity = '1';
    }, 10);
  }
  
  /**
   * 隐藏演示面板
   */
  hideDemoPanel() {
    this.demoPanel.style.opacity = '0';
    setTimeout(() => {
      this.demoPanel.style.display = 'none';
    }, 500);
  }
  
  /**
   * 更新演示面板
   * @param {number} stepIndex - 当前步骤索引
   * @param {Object} step - 当前步骤对象
   */
  updateDemoPanel(stepIndex, step) {
    if (!this.controllers.demoAnimation) return;
    
    const totalSteps = this.controllers.demoAnimation.animationSteps.length;
    const progress = ((stepIndex + 1) / totalSteps) * 100;
    
    // 更新标题和描述
    this.demoTitle.textContent = step.title;
    this.demoDescription.textContent = step.description;
    
    // 更新进度条
    this.progressBar.style.width = `${progress}%`;
    
    // 更新步骤信息
    this.stepCurrent.textContent = `步骤 ${stepIndex + 1}`;
    this.stepTotal.textContent = `共 ${totalSteps} 步`;
    
    // 如果是最后一步，准备结束演示
    if (stepIndex === totalSteps - 1) {
      setTimeout(() => {
        this.stopDemoAnimation();
      }, step.duration);
    }
  }
  
  /**
   * 调整UI大小
   * @param {number} width - 宽度
   * @param {number} height - 高度
   */
  resize(width, height) {
    // 如果需要根据窗口大小调整UI，可以在这里实现
  }
}
