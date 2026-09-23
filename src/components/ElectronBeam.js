import * as THREE from 'three';
import { CONFIG } from '../configLoader';

/**
 * 电子束类
 * 负责处理电子束的路径和显示
 */
export class ElectronBeam {
  /**
   * 构造函数
   * @param {THREE.Scene} scene - Three.js场景
   */
  constructor(scene) {
    this.scene = scene;
    this.beamLine = null;
    this.glowLine = null;
    this.particleSystem = null;
    this.beamPoints = [];
    this.tracePoints = [];
    this.traceLines = [];
    this.traceSegments = []; // 存储轨迹段，避免回扫线
    
    // 电子束材质
    this.beamMaterial = new THREE.LineBasicMaterial({
      color: CONFIG.beam.color,
      opacity: CONFIG.beam.intensity,
      transparent: true,
      depthTest: true,  // 启用深度测试，确保被外壳正确遮挡
      depthWrite: false // 禁用深度写入，避免影响其他透明物体
    });
    
    // 轨迹材质（淡一些）
    this.traceMaterial = new THREE.LineBasicMaterial({
      color: CONFIG.beam.color,
      opacity: CONFIG.electronBeam.trace.opacity,
      transparent: true,
      depthTest: true,  // 启用深度测试，确保被外壳正确遮挡
      depthWrite: false // 禁用深度写入
    });
    
    // 初始化电子束
    this.initBeam();
  }
  
  /**
   * 初始化电子束
   */
  initBeam() {
    // 默认电子束路径点
    this.beamPoints = CONFIG.electronBeam.pathPoints.map(point => 
      new THREE.Vector3(point.x, point.y, point.z)
    );
    
    // 创建增强的电子束材质
    this.createEnhancedBeamMaterial();
    
    // 创建电子束几何体和线条
    const beamGeometry = new THREE.BufferGeometry().setFromPoints(this.beamPoints);
    this.beamLine = new THREE.Line(beamGeometry, this.beamMaterial);
    
    // 设置渲染顺序，确保电子束在透明极板之后渲染
    this.beamLine.renderOrder = 5;
    
    this.scene.add(this.beamLine);
  }

  /**
   * 创建增强的电子束材质，包含发光效果
   */
  createEnhancedBeamMaterial() {
    // 主电子束材质（更亮更鲜艳）- 优化透明度渲染
    this.beamMaterial = new THREE.LineBasicMaterial({
      color: CONFIG.beam.color,
      opacity: CONFIG.beam.intensity,
      transparent: true,
      linewidth: 3, // 增加线宽
      depthTest: true,  // 启用深度测试，确保被外壳正确遮挡
      depthWrite: false // 禁用深度写入
    });
    
    // 创建发光外围材质
    this.glowMaterial = new THREE.LineBasicMaterial({
      color: CONFIG.beam.color,
      opacity: CONFIG.beam.intensity * 0.3,
      transparent: true,
      linewidth: 8, // 更宽的发光效果
      depthTest: true,  // 启用深度测试，确保被外壳正确遮挡
      depthWrite: false // 禁用深度写入
    });
    
    // 轨迹材质 - 优化透明度渲染
    this.traceMaterial = new THREE.LineBasicMaterial({
      color: CONFIG.beam.color,
      opacity: CONFIG.electronBeam.trace.opacity,
      transparent: true,
      depthTest: true,  // 启用深度测试，确保被外壳正确遮挡
      depthWrite: false // 禁用深度写入
    });
  }
  
  /**
   * 更新电子束路径
   * @param {Object} deflectionParams - 偏转参数对象
   * @param {Object} deflectionParams.vertical - 垂直偏转参数
   * @param {number} deflectionParams.vertical.voltage - 垂直偏转电压
   * @param {Object} deflectionParams.horizontal - 水平偏转参数
   * @param {number} deflectionParams.horizontal.voltage - 水平偏转电压
   */
  updateBeamPath(deflectionParams) {
    // 计算偏转量，添加防护
    const voltageScalingFactor = CONFIG.electronBeam.voltageScalingFactor;
    const verticalVoltage = deflectionParams?.vertical?.voltage ?? 0;
    const horizontalVoltage = deflectionParams?.horizontal?.voltage ?? 0;
    
    // 检查是否有 NaN 值
    if (isNaN(verticalVoltage) || isNaN(horizontalVoltage)) {
      console.error('电子束错误 - 检测到 NaN 值:', { verticalVoltage, horizontalVoltage });
      return; // 直接返回，避免后续计算错误
    }
    
    const verticalDeflection = verticalVoltage * (CONFIG.deflection.vertical.maxDeflection / voltageScalingFactor);
    const horizontalDeflection = horizontalVoltage * (CONFIG.deflection.horizontal.maxDeflection / voltageScalingFactor);
    
    // 生成简单的直线电子束轨迹
    this.beamPoints = this.generateSimpleBeamPath(verticalDeflection, horizontalDeflection);
    
    // 更新几何体
    const beamGeometry = new THREE.BufferGeometry().setFromPoints(this.beamPoints);
    
    // 清除旧的电子束
    this.clearBeamLines();
    
    // 创建多层电子束效果
    this.createLayeredBeam(beamGeometry);
    
    // 可选：创建粒子效果（在配置中启用时）
    if (CONFIG.electronBeam.enableParticleEffect) {
      this.createParticleBeam(this.beamPoints);
    }
    
    // 更新材质颜色和强度
    this.updateBeamMaterials();
    
    // 记录轨迹点（只记录打在荧光屏上的点）
    const lastBeamPoint = this.beamPoints[this.beamPoints.length - 1];
    this.addTracePoint(lastBeamPoint.clone());
  }
  
  /**
   * 生成真实的电子束轨迹（考虑物理偏转效果）
   * @param {number} verticalDeflection - 垂直偏转量
   * @param {number} horizontalDeflection - 水平偏转量
   * @returns {Array<THREE.Vector3>} 轨迹点数组
   */
  generateSimpleBeamPath(verticalDeflection, horizontalDeflection) {
    return this.generateRealisticBeamPath(verticalDeflection, horizontalDeflection);
  }

  /**
   * 生成真实的电子束轨迹，模拟物理偏转效果
   * @param {number} verticalDeflection - 垂直偏转量
   * @param {number} horizontalDeflection - 水平偏转量
   * @returns {Array<THREE.Vector3>} 轨迹点数组
   */
  generateRealisticBeamPath(verticalDeflection, horizontalDeflection) {
    const trajectoryPoints = [];
    const totalSegments = 100; // 增加段数以获得更平滑的曲线，特别是对方波
    
    // 从配置文件获取关键位置点
    const electronGun = new THREE.Vector3(
      CONFIG.electronBeam.startPoint.x, 
      CONFIG.electronBeam.startPoint.y, 
      CONFIG.electronBeam.startPoint.z
    );
    const screenPosition = new THREE.Vector3(
      CONFIG.electronBeam.endPoint.x, 
      CONFIG.electronBeam.endPoint.y, 
      CONFIG.electronBeam.endPoint.z
    );
    
    // 从配置文件获取偏转板位置
    const platePositions = CONFIG.electronBeam.physics.platePositions;
    const verticalPlateStart = new THREE.Vector3(platePositions.verticalPlateStart, 0, 0);
    const verticalPlateEnd = new THREE.Vector3(platePositions.verticalPlateEnd, 0, 0);
    const horizontalPlateStart = new THREE.Vector3(platePositions.horizontalPlateStart, 0, 0);
    const horizontalPlateEnd = new THREE.Vector3(platePositions.horizontalPlateEnd, 0, 0);
    
    // 从配置文件获取物理参数
    const electronVelocity = CONFIG.electronBeam.physics.electronVelocity;
    const electricFieldStrength = CONFIG.electronBeam.physics.electricFieldStrength;
    
    // 当前位置和速度
    let currentPos = electronGun.clone();
    let velocity = new THREE.Vector3(electronVelocity, 0, 0); // 初始水平向右
    
    for (let i = 0; i <= totalSegments; i++) {
      const progress = i / totalSegments;
      const x = electronGun.x + (screenPosition.x - electronGun.x) * progress;
      
      // 计算当前段的加速度
      let acceleration = new THREE.Vector3(0, 0, 0);
      
      // 在垂直偏转板区域内应用垂直电场
      if (x >= verticalPlateStart.x && x <= verticalPlateEnd.x) {
        const plateProgress = (x - verticalPlateStart.x) / (verticalPlateEnd.x - verticalPlateStart.x);
        const fieldIntensity = Math.sin(plateProgress * Math.PI) * electricFieldStrength; // 平滑过渡
        acceleration.y = verticalDeflection * fieldIntensity * 0.5;
      }
      
      // 在水平偏转板区域内应用水平电场
      if (x >= horizontalPlateStart.x && x <= horizontalPlateEnd.x) {
        const plateProgress = (x - horizontalPlateStart.x) / (horizontalPlateEnd.x - horizontalPlateStart.x);
        const fieldIntensity = Math.sin(plateProgress * Math.PI) * electricFieldStrength; // 平滑过渡
        acceleration.z = horizontalDeflection * fieldIntensity * 0.5;
      }
      
      // 更新速度和位置（简化的欧拉积分）
      const dt = (screenPosition.x - electronGun.x) / totalSegments / electronVelocity;
      velocity.add(acceleration.clone().multiplyScalar(dt));
      
      // 保持水平速度基本恒定（电子束的主要运动方向）
      velocity.x = electronVelocity;
      
      // 计算新位置
      currentPos.add(velocity.clone().multiplyScalar(dt * 0.1)); // 缩放因子调整轨迹平滑度
      
      // 确保 x 坐标按预期递增
      currentPos.x = x;
      
      trajectoryPoints.push(currentPos.clone());
    }
    
    // 应用轨迹平滑处理
    return this.smoothTrajectory(trajectoryPoints);
  }

  /**
   * 平滑轨迹点，使电子束看起来更自然
   * @param {Array<THREE.Vector3>} points - 原始轨迹点
   * @returns {Array<THREE.Vector3>} 平滑后的轨迹点
   */
  smoothTrajectory(points) {
    if (points.length < 3) return points;
    
    const smoothed = [];
    const smoothingFactor = CONFIG.electronBeam.trajectorySmoothing || 0.8;
    
    // 保持第一个点不变
    smoothed.push(points[0].clone());
    
    // 对中间的点进行平滑处理
    for (let i = 1; i < points.length - 1; i++) {
      const prev = points[i - 1];
      const current = points[i];
      const next = points[i + 1];
      
      // 计算平滑后的位置（加权平均）
      const smoothedPoint = new THREE.Vector3();
      smoothedPoint.addScaledVector(prev, (1 - smoothingFactor) * 0.5);
      smoothedPoint.addScaledVector(current, smoothingFactor);
      smoothedPoint.addScaledVector(next, (1 - smoothingFactor) * 0.5);
      
      smoothed.push(smoothedPoint);
    }
    
    // 保持最后一个点不变
    smoothed.push(points[points.length - 1].clone());
    
    return smoothed;
  }
  
  
  /**
   * 添加轨迹点
   * @param {THREE.Vector3} point - 轨迹点
   */
  addTracePoint(point) {
    // 如果没有当前段，创建一个新段
    if (this.traceSegments.length === 0) {
      this.traceSegments.push([]);
    }
    
    // 获取当前段
    const currentSegment = this.traceSegments[this.traceSegments.length - 1];
    
    // 添加点到当前段
    currentSegment.push(point.clone());
    
    // 限制每个段的点数
    if (currentSegment.length > CONFIG.electronBeam.trace.maxPoints / 2) {
      // 保留最后几个点到新段，确保连续性
      const newSegment = currentSegment.slice(-2);
      this.traceSegments.push(newSegment);
      
      // 移除过多的段
      if (this.traceSegments.length > 4) {
        this.traceSegments.shift();
      }
    }
    
    // 重新绘制轨迹
    this.redrawTraceSegments();
  }

  /**
   * 重新绘制轨迹段
   */
  redrawTraceSegments() {
    // 清除旧的轨迹线
    this.clearTraceLines();
    
    // 为每个段创建单独的线条
    this.traceSegments.forEach((segment, index) => {
      if (segment.length > 1) {
        const traceGeometry = new THREE.BufferGeometry().setFromPoints(segment);
        
        // 为不同段使用不同的透明度，最新的段最亮
        const opacity = CONFIG.electronBeam.trace.opacity * (0.3 + 0.7 * (index + 1) / this.traceSegments.length);
        const segmentMaterial = new THREE.LineBasicMaterial({
          color: CONFIG.beam.color,
          opacity: opacity,
          transparent: true,
          depthTest: true,  // 启用深度测试，确保被外壳正确遮挡
          depthWrite: false // 禁用深度写入
        });
        
        const traceLine = new THREE.Line(traceGeometry, segmentMaterial);
        traceLine.renderOrder = 3; // 设置轨迹线的渲染顺序，在极板之后渲染
        this.traceLines.push(traceLine);
        this.scene.add(traceLine);
      }
    });
  }

  /**
   * 开始新的轨迹段（用于避免回扫线）
   */
  startNewTraceSegment() {
    // 如果当前段有点，创建新段
    if (this.traceSegments.length > 0 && this.traceSegments[this.traceSegments.length - 1].length > 0) {
      this.traceSegments.push([]);
    }
  }
  
  /**
   * 清除轨迹线
   */
  clearTraceLines() {
    this.traceLines.forEach(line => {
      this.scene.remove(line);
      line.geometry.dispose();
    });
    this.traceLines = [];
  }
  
  /**
   * 更新材质
   */
  updateMaterial() {
    this.updateBeamMaterials();
  }
  
  /**
   * 清除所有轨迹
   */
  clearAllTraces() {
    this.clearTraceLines();
    this.tracePoints = [];
    this.traceSegments = [];
  }

  /**
   * 清除电子束线条
   */
  clearBeamLines() {
    if (this.beamLine) {
      this.scene.remove(this.beamLine);
      this.beamLine.geometry.dispose();
      this.beamLine = null;
    }
    if (this.glowLine) {
      this.scene.remove(this.glowLine);
      this.glowLine.geometry.dispose();
      this.glowLine = null;
    }
    if (this.particleSystem) {
      this.scene.remove(this.particleSystem);
      this.particleSystem.geometry.dispose();
      this.particleSystem.material.dispose();
      this.particleSystem = null;
    }
  }

  /**
   * 创建分层电子束效果
   * @param {THREE.BufferGeometry} geometry - 电子束几何体
   */
  createLayeredBeam(geometry) {
    // 创建发光外围层（更宽，透明度更低）
    this.glowLine = new THREE.Line(geometry.clone(), this.glowMaterial);
    this.glowLine.renderOrder = 4; // 设置渲染顺序，在极板之后，主电子束之前
    this.scene.add(this.glowLine);
    
    // 创建主电子束（较窄，亮度更高）
    this.beamLine = new THREE.Line(geometry.clone(), this.beamMaterial);
    this.beamLine.renderOrder = 5; // 设置渲染顺序，确保在透明极板之后渲染
    this.scene.add(this.beamLine);
  }

  /**
   * 更新电子束材质
   */
  updateBeamMaterials() {
    // 更新主电子束材质
    if (this.beamMaterial) {
      this.beamMaterial.color.set(CONFIG.beam.color);
      this.beamMaterial.opacity = CONFIG.beam.intensity;
    }
    
    // 更新发光材质
    if (this.glowMaterial) {
      this.glowMaterial.color.set(CONFIG.beam.color);
      this.glowMaterial.opacity = CONFIG.beam.intensity * 0.3;
    }
    
    // 更新轨迹材质
    if (this.traceMaterial) {
      this.traceMaterial.color.set(CONFIG.beam.color);
    }
  }

  /**
   * 创建粒子电子束效果（可选的高级效果）
   * @param {Array<THREE.Vector3>} points - 轨迹点
   */
  createParticleBeam(points) {
    // 创建粒子系统来模拟电子流
    const particleCount = points.length;
    const particles = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);
    
    const color = new THREE.Color(CONFIG.beam.color);
    
    for (let i = 0; i < particleCount; i++) {
      const point = points[i];
      const i3 = i * 3;
      
      // 位置
      positions[i3] = point.x;
      positions[i3 + 1] = point.y;
      positions[i3 + 2] = point.z;
      
      // 颜色（沿着轨迹渐变）
      const intensity = 1.0 - (i / particleCount) * 0.5; // 从前到后逐渐变暗
      colors[i3] = color.r * intensity;
      colors[i3 + 1] = color.g * intensity;
      colors[i3 + 2] = color.b * intensity;
      
      // 大小（前面较小，后面较大）
      sizes[i] = 0.02 + (i / particleCount) * 0.01;
    }
    
    particles.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particles.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    particles.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    
    const particleMaterial = new THREE.PointsMaterial({
      size: 0.03,
      transparent: true,
      opacity: CONFIG.beam.intensity * 0.8,
      vertexColors: true,
      blending: THREE.AdditiveBlending
    });
    
    if (this.particleSystem) {
      this.scene.remove(this.particleSystem);
      this.particleSystem.geometry.dispose();
      this.particleSystem.material.dispose();
    }
    
    this.particleSystem = new THREE.Points(particles, particleMaterial);
    this.scene.add(this.particleSystem);
  }

  /**
   * 演示电子束效果的测试函数
   * @param {number} testVoltage - 测试电压（可选，默认为1.0）
   */
  demonstrateBeamEffects(testVoltage = 1.0) {
    console.log('🔬 演示新的电子束效果...');
    
    // 测试不同的偏转效果
    const testDeflections = [
      { v: 0, h: 0, name: '无偏转' },
      { v: testVoltage, h: 0, name: '垂直偏转' },
      { v: 0, h: testVoltage, name: '水平偏转' },
      { v: testVoltage, h: testVoltage, name: '双向偏转' }
    ];
    
    let testIndex = 0;
    const testInterval = setInterval(() => {
      if (testIndex >= testDeflections.length) {
        clearInterval(testInterval);
        console.log('✅ 电子束效果演示完成！');
        return;
      }
      
      const test = testDeflections[testIndex];
      console.log(`📡 测试 ${testIndex + 1}/4: ${test.name} (V:${test.v}, H:${test.h})`);
      
      this.updateBeamPath({
        vertical: { voltage: test.v },
        horizontal: { voltage: test.h }
      });
      
      testIndex++;
    }, 2000); // 每2秒切换一次
    
    return testInterval;
  }

  /**
   * 启用粒子效果
   */
  enableParticleEffect() {
    // 临时修改配置以启用粒子效果
    const originalConfig = CONFIG.electronBeam.enableParticleEffect;
    CONFIG.electronBeam.enableParticleEffect = true;
    
    // 重新生成电子束以应用粒子效果
    this.updateBeamPath({
      vertical: { voltage: 0 },
      horizontal: { voltage: 0 }
    });
    
    console.log('✨ 粒子效果已启用');
    
    // 返回恢复函数
    return () => {
      CONFIG.electronBeam.enableParticleEffect = originalConfig;
      this.updateBeamPath({
        vertical: { voltage: 0 },
        horizontal: { voltage: 0 }
      });
      console.log('🔄 粒子效果已恢复到原始设置');
    };
  }
} 