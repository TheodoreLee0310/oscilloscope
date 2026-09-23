/**
 * 超椭圆形状渐变演示类
 * 提供形状渐变的交互控制和动画演示
 */
export class SuperellipseTransitionDemo {
  /**
   * 构造函数
   * @param {CRTShell} crtShell - CRT外壳实例
   */
  constructor(crtShell) {
    this.crtShell = crtShell;
    this.animationId = null;
    this.animationStartTime = 0;
    
    console.log('🎨 超椭圆形状渐变演示已初始化');
    console.log('📖 可用方法：');
    console.log('  • startMorphAnimation() - 开始形状变形动画');
    console.log('  • stopMorphAnimation() - 停止动画');
    console.log('  • demonstrateExponents() - 演示不同指数效果');
    console.log('  • setTransitionPosition(x,y,z) - 设置位置');
    console.log('  • setTransitionExponents(start,end) - 设置指数范围');
    console.log('  • resetTransition() - 重置到默认状态');
  }

  /**
   * 开始形状变形动画
   * 动态改变超椭圆指数，实现从圆形到方形的连续变形
   */
  startMorphAnimation() {
    console.log('🎬 开始超椭圆形状变形动画...');
    
    this.stopMorphAnimation(); // 确保没有重复动画
    this.animationStartTime = Date.now();
    
    const animate = () => {
      const elapsed = (Date.now() - this.animationStartTime) / 1000;
      const period = 6.0; // 动画周期（秒）
      
      // 使用正弦波创建平滑的指数变化
      const t = (Math.sin(elapsed * 2 * Math.PI / period) + 1) / 2; // 0到1之间
      
      // 指数范围：2.0（圆形）到 12.0（尖锐方形）
      const startExponent = 2.0 + t * 10.0;
      const endExponent = 2.0 + (1 - t) * 10.0;
      
      // 更新形状渐变
      this.crtShell.updateTransitionExponents(startExponent, endExponent);
      
      // 同时调整位置产生波动效果
      const positionWave = Math.sin(elapsed * 4) * 0.2;
      this.crtShell.setTransitionPositionOffset(1.2 + positionWave, 0, 0);
      
      this.animationId = requestAnimationFrame(animate);
    };
    
    animate();
  }

  /**
   * 停止形状变形动画
   */
  stopMorphAnimation() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
      console.log('⏹️ 形状变形动画已停止');
    }
  }

  /**
   * 演示不同的超椭圆指数效果
   * 自动循环展示各种形状
   */
  demonstrateExponents() {
    console.log('🎯 演示超椭圆指数效果...');
    
    const demonstrations = [
      { name: '标准圆形', start: 2.0, end: 2.0, duration: 2000 },
      { name: '椭圆形', start: 2.0, end: 2.5, duration: 2000 },
      { name: '圆角方形', start: 2.0, end: 6.0, duration: 2000 },
      { name: '方形', start: 2.0, end: 8.0, duration: 2000 },
      { name: '尖锐方形', start: 2.0, end: 12.0, duration: 2000 },
      { name: '超尖锐方形', start: 2.0, end: 20.0, duration: 2000 },
      { name: '极端方形', start: 2.0, end: 50.0, duration: 2000 }
    ];
    
    let currentIndex = 0;
    
    const showNext = () => {
      if (currentIndex >= demonstrations.length) {
        console.log('✅ 指数演示完成');
        this.resetTransition();
        return;
      }
      
      const demo = demonstrations[currentIndex];
      console.log(`📐 ${demo.name}: 起始指数=${demo.start}, 结束指数=${demo.end}`);
      
      this.crtShell.updateTransitionExponents(demo.start, demo.end);
      
      currentIndex++;
      setTimeout(showNext, demo.duration);
    };
    
    showNext();
  }

  /**
   * 设置形状渐变位置
   * @param {number} x - X坐标
   * @param {number} y - Y坐标  
   * @param {number} z - Z坐标
   */
  setTransitionPosition(x, y, z) {
    this.crtShell.setTransitionPosition(x, y, z);
    console.log(`📍 形状渐变位置设置为: (${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)})`);
  }

  /**
   * 设置形状渐变位置偏移
   * @param {number} x - X轴偏移
   * @param {number} y - Y轴偏移
   * @param {number} z - Z轴偏移
   */
  setTransitionPositionOffset(x, y, z) {
    this.crtShell.setTransitionPositionOffset(x, y, z);
    console.log(`📍 形状渐变位置偏移设置为: (${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)})`);
  }

  /**
   * 设置形状渐变旋转偏移
   * @param {number} x - X轴旋转偏移（弧度）
   * @param {number} y - Y轴旋转偏移（弧度）
   * @param {number} z - Z轴旋转偏移（弧度）
   */
  setTransitionRotationOffset(x, y, z) {
    this.crtShell.setTransitionRotationOffset(x, y, z);
    console.log(`🔄 形状渐变旋转偏移设置为: (${x.toFixed(3)}, ${y.toFixed(3)}, ${z.toFixed(3)}) 弧度`);
  }

  /**
   * 设置超椭圆指数
   * @param {number} startExponent - 起始指数（圆形：2.0）
   * @param {number} endExponent - 结束指数（方形：8.0+）
   */
  setTransitionExponents(startExponent, endExponent) {
    this.crtShell.updateTransitionExponents(startExponent, endExponent);
    console.log(`📐 超椭圆指数设置为: 起始=${startExponent}, 结束=${endExponent}`);
  }

  /**
   * 设置形状渐变可见性
   * @param {boolean} visible - 是否可见
   */
  setTransitionVisible(visible) {
    this.crtShell.setTransitionVisible(visible);
    console.log(`👁️ 形状渐变可见性: ${visible ? '显示' : '隐藏'}`);
  }

  /**
   * 设置形状渐变颜色
   * @param {number} color - 颜色值（十六进制）
   */
  setTransitionColor(color) {
    this.crtShell.setTransitionColor(color);
    console.log(`🎨 形状渐变颜色设置为: 0x${color.toString(16)}`);
  }

  /**
   * 设置形状渐变透明度
   * @param {number} opacity - 透明度（0-1）
   */
  setTransitionOpacity(opacity) {
    this.crtShell.setTransitionOpacity(opacity);
    console.log(`🔍 形状渐变透明度设置为: ${opacity.toFixed(2)}`);
  }

  /**
   * 获取当前形状渐变状态信息
   */
  getTransitionInfo() {
    const position = this.crtShell.getTransitionPosition();
    const rotation = this.crtShell.getTransitionRotation();
    const posOffset = this.crtShell.getTransitionPositionOffset();
    const rotOffset = this.crtShell.getTransitionRotationOffset();
    
    const info = {
      position: { x: position.x, y: position.y, z: position.z },
      rotation: { x: rotation.x, y: rotation.y, z: rotation.z },
      positionOffset: posOffset,
      rotationOffset: rotOffset
    };
    
    console.log('📊 当前形状渐变状态:', info);
    return info;
  }

  /**
   * 重置形状渐变到默认状态
   */
  resetTransition() {
    console.log('🔄 重置形状渐变到默认状态...');
    
    // 停止动画
    this.stopMorphAnimation();
    
    // 重置指数
    this.crtShell.updateTransitionExponents(2.0, 8.0);
    
    // 重置位置偏移
    this.crtShell.setTransitionPositionOffset(1.2, 0, 0);
    
    // 重置旋转偏移
    this.crtShell.setTransitionRotationOffset(0, 0, 0);
    
    // 重置可见性和样式
    this.crtShell.setTransitionVisible(true);
    this.crtShell.setTransitionColor(0x99ddff);
    this.crtShell.setTransitionOpacity(0.8);
    
    console.log('✅ 形状渐变已重置');
  }

  /**
   * 演示位置控制功能
   */
  demonstratePositionControl() {
    console.log('🎯 演示位置控制功能...');
    
    const positions = [
      { name: '默认位置', offset: { x: 1.2, y: 0, z: 0 } },
      { name: '上移', offset: { x: 1.2, y: 0.5, z: 0 } },
      { name: '下移', offset: { x: 1.2, y: -0.5, z: 0 } },
      { name: '前移', offset: { x: 1.2, y: 0, z: 0.5 } },
      { name: '后移', offset: { x: 1.2, y: 0, z: -0.5 } },
      { name: '左移', offset: { x: 0.7, y: 0, z: 0 } },
      { name: '右移', offset: { x: 1.7, y: 0, z: 0 } }
    ];
    
    let currentIndex = 0;
    
    const showNext = () => {
      if (currentIndex >= positions.length) {
        console.log('✅ 位置控制演示完成');
        this.resetTransition();
        return;
      }
      
      const pos = positions[currentIndex];
      console.log(`📍 ${pos.name}: (${pos.offset.x}, ${pos.offset.y}, ${pos.offset.z})`);
      
      this.crtShell.setTransitionPositionOffset(pos.offset.x, pos.offset.y, pos.offset.z);
      
      currentIndex++;
      setTimeout(showNext, 1500);
    };
    
    showNext();
  }

  /**
   * 开始螺旋位置动画
   */
  startSpiralAnimation() {
    console.log('🌀 开始螺旋位置动画...');
    
    this.stopMorphAnimation(); // 停止其他动画
    this.animationStartTime = Date.now();
    
    const animate = () => {
      const elapsed = (Date.now() - this.animationStartTime) / 1000;
      const frequency = 0.5; // 螺旋频率
      
      // 螺旋参数
      const radius = 0.3;
      const baseX = 1.2;
      
      const x = baseX + Math.cos(elapsed * frequency * 2 * Math.PI) * radius;
      const y = Math.sin(elapsed * frequency * 2 * Math.PI) * radius;
      const z = Math.sin(elapsed * frequency * Math.PI) * 0.2;
      
      this.crtShell.setTransitionPositionOffset(x, y, z);
      
      // 同时变化指数创建更复杂的效果
      const expWave = (Math.sin(elapsed * 2) + 1) / 2;
      const startExp = 2.0 + expWave * 6.0;
      const endExp = 8.0 - expWave * 4.0;
      this.crtShell.updateTransitionExponents(startExp, endExp);
      
      this.animationId = requestAnimationFrame(animate);
    };
    
    animate();
  }
}
