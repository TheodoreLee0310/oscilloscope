import * as THREE from 'three';
import { CONFIG } from '../configLoader';

/**
 * 荧光屏类
 * 负责处理荧光屏效果和波形显示
 * 集成了ThreeWaveformRenderer的波形渲染功能
 */
export class Screen {
  /**
   * 构造函数
   * @param {THREE.Scene} scene - Three.js场景
   * @param {THREE.Mesh} screenMesh - 荧光屏网格
   */
  constructor(scene, screenMesh) {
    this.scene = scene;
    this.screenMesh = screenMesh;
    
    // 创建荧光点集合
    this.glowPoints = [];
    this.glowMeshes = [];
    this.maxGlowPoints = CONFIG.screenEffects.maxGlowPoints;
    
    // 为了兼容DemoAnimation的focusOnComponent方法，添加position属性
    this.position = this.screenMesh.position;
    
    // 移除了静态波形相关属性，保留电子束轨迹波形
    
    // 初始化荧光材质
    this.initGlowMaterial();
    
    // 创建荧光屏网格
    this.createScreenGrid();
    
    // 移除了静态波形初始化
  }
  
  /**
   * 初始化荧光材质
   */
  initGlowMaterial() {
    // 更新荧光屏材质
    this.screenMesh.material.emissive.set(CONFIG.screen.color);
    this.screenMesh.material.emissiveIntensity = CONFIG.screen.intensity;
    
    // 创建荧光点材质
    this.glowMaterial = new THREE.MeshBasicMaterial({
      color: CONFIG.beam.color, // 使用电子束的颜色（绿色）
      transparent: true,
      opacity: 0.8
    });
    
    // 移除了静态波形材质
  }
  
  /**
   * 创建荧光屏网格
   */
  createScreenGrid() {
    // 获取荧光屏的尺寸和位置
    const screenWidth = CONFIG.components.screen.width;
    const screenHeight = CONFIG.components.screen.height;
    const screenPosition = CONFIG.components.screen.position;
    
    // 创建网格材质
    const gridMaterial = new THREE.LineBasicMaterial({
      color: CONFIG.screen.gridColor,
      transparent: true,
      opacity: CONFIG.screen.gridOpacity
    });
    
    // 创建网格几何体
    const gridGeometry = new THREE.BufferGeometry();
    const gridPoints = [];
    
    // 计算网格线间距
    const gridSpacing = CONFIG.screen.gridSpacing;
    const halfWidth = screenWidth / 2;
    const halfHeight = screenHeight / 2;
    
    // 添加垂直线
    for (let x = -halfWidth; x <= halfWidth; x += gridSpacing) {
      gridPoints.push(x, -halfHeight, 0);
      gridPoints.push(x, halfHeight, 0);
    }
    
    // 添加水平线
    for (let y = -halfHeight; y <= halfHeight; y += gridSpacing) {
      gridPoints.push(-halfWidth, y, 0);
      gridPoints.push(halfWidth, y, 0);
    }
    
    // 设置几何体属性
    gridGeometry.setAttribute('position', new THREE.Float32BufferAttribute(gridPoints, 3));
    
    // 创建网格线
    this.screenGrid = new THREE.LineSegments(gridGeometry, gridMaterial);
    
    // 设置网格位置（稍微偏移，避免z-fighting）
    this.screenGrid.position.copy(screenPosition);
    this.screenGrid.position.x += 0.01; // 在荧光屏前面一点点
    this.screenGrid.rotation.y = -Math.PI / 2; // 与荧光屏相同的旋转
    
    // 添加到场景
    this.scene.add(this.screenGrid);
  }
  
  // 移除了initWaveform方法
  
  // 移除了createWaveform方法
  
  // 移除了createSingleWaveform方法
  
  /**
   * 根据波形类型计算电压值
   * @param {string} waveType - 波形类型
   * @param {number} phaseVal - 相位值(弧度)
   * @param {number} amplitude - 振幅
   * @returns {number} 电压值
   */
  calculateVoltage(waveType, phaseVal, amplitude) {
    switch (waveType) {
      case 'sine':
        return amplitude * Math.sin(phaseVal);
      case 'square':
        return amplitude * (Math.sin(phaseVal) >= 0 ? 1 : -1);
      case 'triangle':
        return amplitude * (2 * Math.abs((phaseVal % (2 * Math.PI)) / (2 * Math.PI) - 0.5) - 1);
      case 'sawtooth':
        return amplitude * (((phaseVal % (2 * Math.PI)) / (2 * Math.PI)) * 2 - 1);
      default:
        return 0;
    }
  }
  
  /**
   * 添加荧光点
   * @param {THREE.Vector3} position - 电子束击中荧光屏的位置
   */
  addGlowPoint(position) {
    // 创建一个小球体代表荧光点
    const glowGeometry = new THREE.SphereGeometry(CONFIG.screenEffects.glowPointSize, 6, 6);
    const glowMesh = new THREE.Mesh(glowGeometry, this.glowMaterial.clone());
    
    // 设置位置（稍微偏移，避免z-fighting）
    glowMesh.position.copy(position);
    const screenOffset = CONFIG.electronBeam.screenOffset;
    glowMesh.position.x = CONFIG.components.screen.position.x - screenOffset; // 确保在荧光屏前面一点点
    
    // 添加到场景
    this.scene.add(glowMesh);
    
    // 记录荧光点信息
    this.glowPoints.push({
      mesh: glowMesh,
      createdAt: Date.now(),
      initialOpacity: 0.8
    });
    
    // 如果荧光点过多，移除最早的点
    if (this.glowPoints.length > this.maxGlowPoints) {
      const oldestPoint = this.glowPoints.shift();
      this.scene.remove(oldestPoint.mesh);
      oldestPoint.mesh.geometry.dispose();
      oldestPoint.mesh.material.dispose();
    }
  }
  
  /**
   * 更新荧光点效果和波形动画
   */
  update() {
    const now = Date.now();
    const persistence = CONFIG.screen.persistence;
    
    // 更新荧光屏材质
    this.screenMesh.material.emissive.set(CONFIG.screen.color);
    this.screenMesh.material.emissiveIntensity = CONFIG.screen.intensity;
    
    // 更新每个荧光点的透明度（模拟余辉效果）
    this.glowPoints.forEach((point, index) => {
      const age = (now - point.createdAt) / 1000; // 年龄（秒）
      const fadeRate = 1 - persistence; // 淡出速率
      const opacity = point.initialOpacity * Math.pow(persistence, age * CONFIG.screenEffects.fadeRate);
      
      // 更新透明度
      point.mesh.material.opacity = opacity;
      
      // 如果完全透明，移除这个点
      if (opacity < CONFIG.screenEffects.minOpacity) {
        this.scene.remove(point.mesh);
        point.mesh.geometry.dispose();
        point.mesh.material.dispose();
        this.glowPoints.splice(index, 1);
      }
    });
    
    // 移除了静态波形动画逻辑
  }
  
  /**
   * 清除所有荧光点
   */
  clearAllGlowPoints() {
    this.glowPoints.forEach(point => {
      this.scene.remove(point.mesh);
      point.mesh.geometry.dispose();
      point.mesh.material.dispose();
    });
    this.glowPoints = [];
  }
  
  /**
   * 更新材质颜色
   */
  updateMaterial() {
    // 更新荧光屏材质
    this.screenMesh.material.emissive.set(CONFIG.screen.color);
    this.screenMesh.material.emissiveIntensity = CONFIG.screen.intensity;
    
    // 更新所有荧光点的颜色
    this.glowPoints.forEach(point => {
      point.mesh.material.color.set(CONFIG.screen.color);
    });
  }
  
  // ========== 移除了所有静态波形控制方法 ==========
  // 保留电子束轨迹波形，这些方法不再需要
  
  /**
   * 显示/隐藏波形 - 保留此方法以避免调用错误，但不执行任何操作
   * @param {boolean} show - 是否显示波形
   */
  showWaveform(show) {
    // 静态波形已移除，此方法保留为空以避免调用错误
    return this;
  }
  
  /**
   * 设置波形类型 - 保留此方法以避免调用错误，但不执行任何操作
   * @param {string} type - 波形类型
   */
  setWaveformType(type) {
    // 静态波形已移除，此方法保留为空以避免调用错误
    return this;
  }
  
  /**
   * 设置频率 - 保留此方法以避免调用错误，但不执行任何操作
   * @param {number} frequency - 频率值
   */
  setFrequency(frequency) {
    // 静态波形已移除，此方法保留为空以避免调用错误
    return this;
  }
  
  /**
   * 设置振幅 - 保留此方法以避免调用错误，但不执行任何操作
   * @param {number} amplitude - 振幅值
   */
  setAmplitude(amplitude) {
    // 静态波形已移除，此方法保留为空以避免调用错误
    return this;
  }
  
  /**
   * 设置相位 - 保留此方法以避免调用错误，但不执行任何操作
   * @param {number} phase - 相位值（弧度）
   */
  setPhase(phase) {
    // 静态波形已移除，此方法保留为空以避免调用错误
    return this;
  }
  
  /**
   * 开始波形动画 - 保留此方法以避免调用错误，但不执行任何操作
   */
  startWaveformAnimation() {
    // 静态波形已移除，此方法保留为空以避免调用错误
    return this;
  }
  
  /**
   * 停止波形动画 - 保留此方法以避免调用错误，但不执行任何操作
   */
  stopWaveformAnimation() {
    // 静态波形已移除，此方法保留为空以避免调用错误
    return this;
  }
} 