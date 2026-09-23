import * as THREE from 'three';
import { CONFIG } from '../configLoader';

/**
 * 粒子对象池类
 * 用于管理电子粒子的创建、复用和回收，避免频繁的内存分配和垃圾回收
 * 显著提升动画性能，特别是在大量粒子场景下
 */
export class ParticlePool {
  /**
   * 构造函数
   * @param {number} maxSize - 对象池最大容量
   * @param {number} preCreateCount - 预创建的粒子数量
   */
  constructor(maxSize = 100, preCreateCount = 20) {
    this.pool = [];                    // 可用粒子池
    this.activeParticles = [];         // 正在使用的粒子
    this.maxSize = maxSize;           // 最大容量
    this.preCreateCount = preCreateCount;
    
    // 性能统计
    this.stats = {
      created: 0,        // 总创建数
      reused: 0,         // 重用次数
      released: 0,       // 释放次数
      maxActive: 0       // 最大同时活跃数
    };
    
    console.log(`ParticlePool: 初始化，最大容量=${maxSize}，预创建=${preCreateCount}`);
    
    // 预创建粒子对象
    this.preCreateParticles();
  }
  
  /**
   * 预创建粒子对象
   * 在初始化时创建一批粒子，避免运行时创建的性能开销
   */
  preCreateParticles() {
    console.log(`ParticlePool: 开始预创建 ${this.preCreateCount} 个粒子`);
    
    for (let i = 0; i < this.preCreateCount; i++) {
      const particle = this.createNewParticle();
      particle.visible = false;  // 初始状态不可见
      this.pool.push(particle);
      this.stats.created++;
    }
    
    console.log(`ParticlePool: 预创建完成，池中可用粒子数: ${this.pool.length}`);
  }
  
  /**
   * 创建新的粒子对象
   * @returns {THREE.Mesh} 新创建的粒子网格对象
   */
  createNewParticle() {
    // 创建球体几何体 - 使用较低的细分级别以提升性能
    const geometry = new THREE.SphereGeometry(
      CONFIG.demoAnimation?.electronParticle?.radius || 0.02,  // 半径
      8,   // 水平分段数（较低以提升性能）
      6    // 垂直分段数（较低以提升性能）
    );
    
    // 创建材质 - 优化透明度渲染
    const material = new THREE.MeshBasicMaterial({
      color: CONFIG.beam?.color || 0x00ffff,
      transparent: true,
      opacity: CONFIG.demoAnimation?.electronParticle?.opacity || 0.8,
      depthTest: false,  // 禁用深度测试，确保粒子总是可见
      depthWrite: false, // 禁用深度写入以避免透明度问题
      blending: THREE.AdditiveBlending // 使用加法混合，增强发光效果
    });
    
    // 创建网格对象
    const particle = new THREE.Mesh(geometry, material);
    
    // 设置渲染顺序，确保粒子在透明极板之后渲染
    particle.renderOrder = 10;
    
    // 添加自定义属性用于追踪
    particle.userData = {
      poolId: Math.random().toString(36).substr(2, 9),  // 唯一ID
      createdAt: Date.now(),                            // 创建时间
      reuseCount: 0                                     // 重用次数
    };
    
    return particle;
  }
  
  /**
   * 从对象池获取一个粒子
   * @returns {THREE.Mesh} 可用的粒子对象
   */
  getParticle() {
    let particle;
    
    if (this.pool.length > 0) {
      // 从池中取出一个现成的粒子（最佳情况）
      particle = this.pool.pop();
      particle.userData.reuseCount++;
      this.stats.reused++;
      
    } else if (this.activeParticles.length < this.maxSize) {
      // 池空了但还没达到最大限制，创建新的粒子
      particle = this.createNewParticle();
      this.stats.created++;
      console.log(`ParticlePool: 池已空，创建新粒子 (总创建数: ${this.stats.created})`);
      
    } else {
      // 达到最大限制，强制回收最老的粒子
      particle = this.activeParticles.shift();
      console.warn(`ParticlePool: 达到最大容量 ${this.maxSize}，强制回收最老粒子`);
    }
    
    // 重置粒子状态
    this.resetParticle(particle);
    
    // 设置为可见并加入活跃列表
    particle.visible = true;
    this.activeParticles.push(particle);
    
    // 更新统计
    this.stats.maxActive = Math.max(this.stats.maxActive, this.activeParticles.length);
    
    return particle;
  }
  
  /**
   * 将粒子归还到对象池
   * @param {THREE.Mesh} particle - 要归还的粒子对象
   */
  releaseParticle(particle) {
    if (!particle) return;
    
    const index = this.activeParticles.indexOf(particle);
    if (index === -1) {
      console.warn('ParticlePool: 尝试释放未在活跃列表中的粒子');
      return;
    }
    
    // 从活跃列表中移除
    this.activeParticles.splice(index, 1);
    
    // 重置粒子状态
    this.resetParticle(particle);
    particle.visible = false;
    
    // 归还到池中
    this.pool.push(particle);
    this.stats.released++;
  }
  
  /**
   * 重置粒子状态
   * @param {THREE.Mesh} particle - 要重置的粒子
   */
  resetParticle(particle) {
    // 重置位置
    particle.position.set(0, 0, 0);
    
    // 重置旋转
    particle.rotation.set(0, 0, 0);
    
    // 重置缩放
    particle.scale.set(1, 1, 1);
    
    // 重置材质属性
    if (particle.material) {
      particle.material.opacity = CONFIG.demoAnimation?.electronParticle?.opacity || 0.8;
      particle.material.color.setHex(CONFIG.beam?.color || 0x00ffff);
    }
    
    // 停止所有正在进行的动画
    if (particle.userData.currentTween) {
      particle.userData.currentTween.stop();
      delete particle.userData.currentTween;
    }
  }
  
  /**
   * 批量获取多个粒子
   * @param {number} count - 需要的粒子数量
   * @returns {THREE.Mesh[]} 粒子数组
   */
  getParticles(count) {
    const particles = [];
    for (let i = 0; i < count; i++) {
      particles.push(this.getParticle());
    }
    return particles;
  }
  
  /**
   * 批量释放多个粒子
   * @param {THREE.Mesh[]} particles - 要释放的粒子数组
   */
  releaseParticles(particles) {
    particles.forEach(particle => this.releaseParticle(particle));
  }
  
  /**
   * 清理所有活跃粒子
   */
  clearAll() {
    console.log(`ParticlePool: 清理所有活跃粒子，数量: ${this.activeParticles.length}`);
    
    // 停止所有粒子的动画
    this.activeParticles.forEach(particle => {
      if (particle.userData.currentTween) {
        particle.userData.currentTween.stop();
        delete particle.userData.currentTween;
      }
      particle.visible = false;
    });
    
    // 将所有活跃粒子归还到池中
    this.pool.push(...this.activeParticles);
    this.activeParticles = [];
  }
  
  /**
   * 获取对象池状态信息
   * @returns {Object} 状态信息对象
   */
  getStatus() {
    return {
      poolSize: this.pool.length,           // 池中可用粒子数
      activeCount: this.activeParticles.length,  // 活跃粒子数
      maxSize: this.maxSize,                // 最大容量
      stats: { ...this.stats }             // 性能统计（复制）
    };
  }
  
  /**
   * 打印详细状态信息
   */
  printStatus() {
    const status = this.getStatus();
    console.log('=== ParticlePool 状态报告 ===');
    console.log(`池中可用: ${status.poolSize}`);
    console.log(`正在使用: ${status.activeCount}`);
    console.log(`最大容量: ${status.maxSize}`);
    console.log(`总创建数: ${status.stats.created}`);
    console.log(`重用次数: ${status.stats.reused}`);
    console.log(`释放次数: ${status.stats.released}`);
    console.log(`最大同时活跃: ${status.stats.maxActive}`);
    console.log(`重用率: ${status.stats.reused > 0 ? (status.stats.reused / (status.stats.created + status.stats.reused) * 100).toFixed(1) : 0}%`);
    console.log('========================');
  }
  
  /**
   * 销毁对象池，释放所有资源
   */
  dispose() {
    console.log('ParticlePool: 开始销毁，释放所有资源');
    
    // 清理所有粒子
    this.clearAll();
    
    // 释放几何体和材质资源
    const allParticles = [...this.pool, ...this.activeParticles];
    allParticles.forEach(particle => {
      if (particle.geometry) {
        particle.geometry.dispose();
      }
      if (particle.material) {
        particle.material.dispose();
      }
    });
    
    // 清空数组
    this.pool = [];
    this.activeParticles = [];
    
    // 重置统计
    this.stats = {
      created: 0,
      reused: 0,
      released: 0,
      maxActive: 0
    };
    
    console.log('ParticlePool: 销毁完成');
  }
}

// 导出默认实例（单例模式）
export const defaultParticlePool = new ParticlePool(100, 30);
