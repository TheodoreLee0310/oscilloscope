import * as THREE from 'three';
import * as TWEEN from '@tweenjs/tween.js';
import { CONFIG } from '../configLoader';
import { tweenGroup } from '../main.js';
import { ParticlePool } from '../utils/ParticlePool.js';

/**
 * 演示动画类
 * 负责创建和控制阴极射线管工作原理的演示动画
 */
export class DemoAnimation {
  /**
   * 构造函数
   * @param {THREE.Scene} scene - Three.js场景
   * @param {Object} components - 组件对象集合
   * @param {Object} controllers - 控制器对象集合
   */
  constructor(scene, components, controllers) {
    console.log('DemoAnimation构造函数被调用');
    console.log('scene:', scene);
    console.log('components:', components);
    console.log('controllers:', controllers);
    
    this.scene = scene;
    this.components = components;
    this.controllers = controllers;
    
    this.isPlaying = false;
    this.currentStep = 0;
    this.animationSteps = [];
    this.particles = [];
    this.tweens = [];
    this.stepCallbacks = [];
    this.continuousBeamInterval = null; // 连续电子束的定时器
    this.originalVoltages = null; // 保存原始偏转电压值，用于波形显示
    this.originalPlateOpacities = null; // 保存极板原始不透明度
    this.originalGuiState = null; // 保存GUI面板的原始状态
    
    // 初始化粒子对象池
    this.particlePool = new ParticlePool(80, 25); // 最大80个粒子，预创建25个
    
    console.log('初始化动画步骤');
    // 初始化动画步骤
    this.initAnimationSteps();
    
    console.log('创建电子粒子材质');
    // 创建电子粒子材质 - 优化透明度渲染
    this.particleMaterial = new THREE.MeshBasicMaterial({
      color: CONFIG.beam.color,
      transparent: true,
      opacity: CONFIG.demoAnimation.electronParticle.opacity,
      depthTest: true,   // 启用深度测试，确保被外壳正确遮挡
      depthWrite: false, // 禁用深度写入，避免影响其他透明物体
      blending: THREE.AdditiveBlending // 使用加法混合，增强发光效果
    });
    
    console.log('DemoAnimation构造函数完成');
    console.log('粒子对象池状态:', this.particlePool.getStatus());
  }
  
  /**
   * 初始化动画步骤
   */
  initAnimationSteps() {
    // 步骤1: 介绍阴极射线管
    this.animationSteps.push({
      title: '阴极射线管简介',
      description: '阴极射线管是一种真空电子管，利用电场控制电子束的偏转来显示图像。',
      duration: 6000,  // 增加持续时间到6秒
      setup: () => {
        // 使用自定义视角展示整个阴极射线管的全貌
        const viewPromise = this.setCustomView({
          position: { x: 8, y: 5, z: 12 },  // 稍微远一点的俯视角度
          target: { x: 0, y: 0, z: 0 }      // 观察整个设备中心
        });
        
        // 在2秒时开始CRT外壳分解和消失
        setTimeout(() => {
          console.log('演示动画：开始CRT外壳分解和消失');
          this.startCRTShellDisappear();
        }, 2000);  // 在2秒时开始CRT外壳消失
        
        return viewPromise;
      }
    });
    
    // 步骤2: 电子枪发射电子
    this.animationSteps.push({
      title: '电子枪发射电子',
      description: '电子枪加热阴极，释放电子并加速形成电子束。',
      duration: 8000,
      setup: () => {
        // 聚焦到电子枪
        const focusPromise = this.focusOnComponent('gun');
        
        // 创建连续电子束流
        setTimeout(() => {
          this.startContinuousElectronBeam(
            new THREE.Vector3(-3, 0, 0),
            new THREE.Vector3(-2.7, 0, 0)
          );
        }, 1000);
        
        return focusPromise;
      }
    });
    
    // 步骤3: 垂直偏转板
    this.animationSteps.push({
      title: '垂直偏转板',
      description: '垂直偏转板通过电压控制电子束在垂直方向上的偏转。',
      duration: 8000,
      setup: () => {
        // 聚焦到垂直偏转板
        const focusPromise = this.focusOnComponent('v1');
        
        // 模拟电压变化
        setTimeout(() => {
          // 设置垂直电压
          this.simulateVoltageChange('vertical', 3, 2000);
          
          // 创建连续电子束流（从电子枪到偏转板）
          this.startContinuousElectronBeam(
            new THREE.Vector3(-2.7, 0, 0),
            new THREE.Vector3(-1.5, 0.6, 0)
          );
        }, 1000);
        
        return focusPromise;
      }
    });
    
    // 步骤4: 水平偏转板
    this.animationSteps.push({
      title: '水平偏转板',
      description: '水平偏转板通过电压控制电子束在水平方向上的偏转。',
      duration: 8000,
      setup: () => {
        // 聚焦到水平偏转板
        const focusPromise = this.focusOnComponent('h1');
        
        // 模拟电压变化
        setTimeout(() => {
          // 设置水平电压
          this.simulateVoltageChange('horizontal', 2, 2000);
          
          // 创建连续电子束流（从垂直偏转板到水平偏转板）
          this.startContinuousElectronBeam(
            new THREE.Vector3(-1.5, 0.6, 0),
            new THREE.Vector3(-0.2, 0.6, 0.4)
          );
        }, 1000);
        
        return focusPromise;
      }
    });
    
    // 步骤5: 荧光屏显示
    this.animationSteps.push({
      title: '荧光屏显示',
      description: '电子束击中荧光屏上的荧光物质，产生可见光，形成图像。',
      duration: 5000,
      setup: () => {
        // 聚焦到荧光屏
        const focusPromise = this.focusOnComponent('screen');
        
        // 创建连续电子束流（从水平偏转板到荧光屏）
        setTimeout(() => {
          this.startContinuousElectronBeam(
            new THREE.Vector3(-0.2, 0.6, 0.4),
            new THREE.Vector3(3, 0.6, 0.4)
          );
        }, 1000);
        
        return focusPromise;
      }
    });
    
    // 步骤6: 波形显示
    this.animationSteps.push({
      title: '波形显示',
      description: '通过改变偏转电压，可以在荧光屏上绘制各种波形。',
      duration: 10000,  // 增加持续时间以展示两种波形
      setup: () => {
        // 使用自定义视角，从左前方、上方观察整个阴极射线管和波形显示
        const resetPromise = this.setCustomView({
          position: { x: 14, y: 1, z: -2.5 },       
          target: { x: 0, y: 0, z: 0 }         // 聚焦到整个装置的中心
        });
        
        // 启用波形和电子束
        setTimeout(() => {
          // 清除之前的粒子和荧光点
          this.clearAllParticles();
          if (this.components && this.components.screen) {
            this.components.screen.clearAllGlowPoints();
          }
          
          // 第一阶段：显示正弦波（前4秒）
          this.setWaveformParams({
            type: 'sine',
            frequency: 1.2,
            amplitude: 2.5,
            enabled: true
          });
          
          // 启动连续电子束流 - 从电子枪到荧光屏的完整路径
          this.startContinuousElectronBeam(
            new THREE.Vector3(-3, 0, 0),     // 从电子枪开始
            new THREE.Vector3(3, 0, 0)       // 到荧光屏结束
          );
          
          // 4秒后切换到方波
          const waveformSwitchCallback = setTimeout(() => {
            // 清除荧光屏，准备显示新波形
            if (this.components && this.components.screen) {
              this.components.screen.clearAllGlowPoints();
            }
            
            // 切换到方波
            this.setWaveformParams({
              type: 'square',
              frequency: 0.8,
              amplitude: 3,
              enabled: true
            });
          }, 4000);
          
          this.stepCallbacks.push(waveformSwitchCallback);
          
        }, 1000);
        
        return resetPromise;
      }
    });
    
    // 步骤7: 演示结束
    this.animationSteps.push({
      title: '演示结束',
      description: '阴极射线管是早期显示器的基础技术，为现代显示技术奠定了基础。',
      duration: 3000,
      setup: () => {
        // 设置自定义视角，展示整个阴极射线管的完整视图
        const viewPromise = this.setCustomView({
          position: { x: 6, y: 4, z: 10 },
          target: { x: 0, y: 0, z: 0 }
        });
        
        // 还原分解视图状态
        setTimeout(() => {
          console.log('演示动画结束：还原分解视图状态');
          const explodeBtn = document.getElementById('toggle-explode-btn');
          if (explodeBtn && explodeBtn.textContent === '合并视图') {
            explodeBtn.click();
          }
        }, 500);
        
        // 还原外壳显示状态
        setTimeout(() => {
          console.log('演示动画结束：还原外壳显示状态');
          if (this.originalShellVisible !== undefined) {
            // 查找"显示外壳"的复选框
            const shellCheckboxes = document.querySelectorAll('input[type="checkbox"]');
            let shellCheckbox = null;
            
            // 查找对应的复选框
            shellCheckboxes.forEach(checkbox => {
              const label = checkbox.closest('li')?.querySelector('.property-name');
              if (label && label.textContent.includes('显示外壳')) {
                shellCheckbox = checkbox;
              }
            });
            
            if (shellCheckbox) {
              // 如果原始状态和当前状态不同，点击复选框
              if (shellCheckbox.checked !== this.originalShellVisible) {
                console.log('演示动画结束：通过复选框还原外壳状态');
                shellCheckbox.click();
              }
            } else {
              // 直接通过CONFIG还原
              console.log('演示动画结束：直接通过CONFIG还原外壳状态');
              if (window.CONFIG) {
                window.CONFIG.shell.visible = this.originalShellVisible;
                // 触发外壳更新
                if (this.controllers && this.controllers.onShellChange) {
                  this.controllers.onShellChange(window.CONFIG.shell);
                }
              }
            }
          }
          
          // 重置所有参数
          this.resetAllParams();
        }, 1000);
        
        return viewPromise;
      }
    });
  }
  
  /**
   * 开始演示动画
   */
  start() {
    console.log('DemoAnimation.start被调用');
    console.log('this.isPlaying:', this.isPlaying);
    
    if (this.isPlaying) {
      console.log('演示已在播放中，返回');
      return;
    }
    
    // 保存原始偏转电压值，用于波形显示时保持固定位置
    this.originalVoltages = {
      horizontal: CONFIG.deflection.horizontal.voltage,
      vertical: CONFIG.deflection.vertical.voltage
    };
    
    // 保存原始外壳显示状态
    this.originalShellVisible = CONFIG.shell ? CONFIG.shell.visible : true;
    console.log('保存原始外壳状态:', this.originalShellVisible);
    
    // 保存极板原始不透明度并设置为50%，提高透明度以便更好地观察电子束
    this.setPlateOpacity(0.5);
    
    // 折叠GUI面板，避免演示时界面干扰
    this.collapseGuiFolders();
    
    this.isPlaying = true;
    this.currentStep = 0;
    
    console.log('保存原始参数');
    // 保存原始参数
    this.saveOriginalParams();
    
    // 在动画开始时启用电子束（设置适当的强度）
    CONFIG.beam.intensity = 0.9;
    if (this.controllers.onBeamChange) {
      this.controllers.onBeamChange(CONFIG.beam);
    }
    
    console.log('开始第一步，调用playCurrentStep');
    // 开始第一步
    this.playCurrentStep();
  }
  
  /**
   * 停止演示动画
   */
  stop() {
    this.isPlaying = false;
    
    // 停止连续电子束
    this.stopContinuousElectronBeam();
    
    // 停止所有动画
    this.tweens.forEach(tween => {
      if (tween && typeof tween.stop === 'function') {
        tween.stop();
      }
    });
    this.tweens = [];
    
    // 清除所有粒子（使用对象池优化）
    this.clearAllParticles();
    
    // 清理对象池中的所有活跃粒子
    if (this.particlePool) {
      this.particlePool.clearAll();
    }
    
    // 恢复原始偏转电压值
    if (this.originalVoltages) {
      CONFIG.deflection.horizontal.voltage = this.originalVoltages.horizontal;
      CONFIG.deflection.vertical.voltage = this.originalVoltages.vertical;
      this.originalVoltages = null;
    }
    
    // 清理保存的外壳状态
    this.originalShellVisible = undefined;
    
    // 恢复极板原始不透明度
    this.restorePlateOpacity();
    
    // 恢复GUI面板状态
    this.restoreGuiFolders();
    
    // 重置所有参数
    this.resetAllParams();
    
    // 清除所有回调和定时器
    this.stepCallbacks.forEach(callback => {
      if (typeof callback === 'number') {
        clearTimeout(callback);
      }
    });
    this.stepCallbacks = [];
  }
  
  /**
   * 播放当前步骤
   */
  playCurrentStep() {
    console.log('playCurrentStep被调用');
    console.log('this.isPlaying:', this.isPlaying);
    console.log('this.currentStep:', this.currentStep);
    console.log('this.animationSteps.length:', this.animationSteps.length);
    
    if (!this.isPlaying || this.currentStep >= this.animationSteps.length) {
      console.log('演示结束或已停止，调用stop');
      this.stop();
      return;
    }
    
    // 停止之前的连续电子束
    this.stopContinuousElectronBeam();
    
    const step = this.animationSteps[this.currentStep];
    console.log('当前步骤:', step);
    
    // 触发步骤开始事件
    if (this.onStepStart) {
      console.log('触发步骤开始事件');
      this.onStepStart(this.currentStep, step);
    } else {
      console.log('onStepStart未设置');
    }
    
    // 设置步骤
    console.log('执行步骤setup');
    const setupPromise = step.setup ? step.setup() : Promise.resolve();
    
    // 步骤完成后，继续下一步
    setupPromise.then(() => {
      console.log('步骤setup完成，设置下一步定时器，持续时间:', step.duration);
      const callback = setTimeout(() => {
        console.log('定时器触发，进入下一步');
        this.currentStep++;
        this.playCurrentStep();
      }, step.duration);
      
      this.stepCallbacks.push(callback);
      console.log('定时器已添加到stepCallbacks');
    }).catch(error => {
      console.error('步骤setup出错:', error);
    });
  }
  
  /**
   * 聚焦到组件
   * @param {string} componentKey - 组件键名
   * @returns {Promise} 动画完成的Promise
   */
  focusOnComponent(componentKey) {
    return new Promise(resolve => {
      const component = this.components[componentKey];
      if (!component) {
        resolve();
        return;
      }
      
      // 计算目标位置
      const targetPosition = component.position.clone();
      const offset = new THREE.Vector3(
        CONFIG.demoAnimation.cameraOffset.x,
        CONFIG.demoAnimation.cameraOffset.y,
        CONFIG.demoAnimation.cameraOffset.z
      );
      
      // 创建相机位置动画
      const posTween = new TWEEN.Tween(this.controllers.camera.position, tweenGroup)
        .to({
          x: targetPosition.x + offset.x,
          y: targetPosition.y + offset.y,
          z: targetPosition.z + offset.z
        }, CONFIG.demoAnimation.animationDuration)
        .easing(TWEEN.Easing.Cubic.InOut)
        .onComplete(resolve)
        .start();
      
      // 创建控制器目标点动画
      const targetTween = new TWEEN.Tween(this.controllers.controls.target, tweenGroup)
        .to({
          x: targetPosition.x,
          y: targetPosition.y,
          z: targetPosition.z
        }, CONFIG.demoAnimation.animationDuration)
        .easing(TWEEN.Easing.Cubic.InOut)
        .start();
      
      this.tweens.push(posTween, targetTween);
    });
  }
  
  /**
   * 重置视图
   * @returns {Promise} 动画完成的Promise
   */
  resetView() {
    return new Promise(resolve => {
          // 重置相机位置
    const posTween = new TWEEN.Tween(this.controllers.camera.position, tweenGroup)
      .to({ 
        x: CONFIG.camera.position.x, 
        y: CONFIG.camera.position.y, 
        z: CONFIG.camera.position.z 
      }, CONFIG.demoAnimation.animationDuration)
      .easing(TWEEN.Easing.Cubic.InOut)
      .onComplete(resolve)
      .start();
      
          // 重置控制器目标点
    const targetTween = new TWEEN.Tween(this.controllers.controls.target, tweenGroup)
      .to({ 
        x: CONFIG.camera.target.x, 
        y: CONFIG.camera.target.y, 
        z: CONFIG.camera.target.z 
      }, CONFIG.demoAnimation.animationDuration)
      .easing(TWEEN.Easing.Cubic.InOut)
      .start();
      
      this.tweens.push(posTween, targetTween);
    });
  }

  /**
   * 设置自定义视图
   * @param {Object} viewConfig - 视图配置
   * @param {Object} viewConfig.position - 摄像头位置 {x, y, z}
   * @param {Object} viewConfig.target - 观察目标 {x, y, z}
   * @param {number} duration - 动画持续时间（可选）
   * @returns {Promise} 动画完成的Promise
   */
  setCustomView(viewConfig, duration = CONFIG.demoAnimation.animationDuration) {
    return new Promise(resolve => {
      // 设置相机位置
      const posTween = new TWEEN.Tween(this.controllers.camera.position, tweenGroup)
        .to({ 
          x: viewConfig.position.x, 
          y: viewConfig.position.y, 
          z: viewConfig.position.z 
        }, duration)
        .easing(TWEEN.Easing.Cubic.InOut)
        .onComplete(resolve)
        .start();
        
      // 设置控制器目标点
      const targetTween = new TWEEN.Tween(this.controllers.controls.target, tweenGroup)
        .to({ 
          x: viewConfig.target.x, 
          y: viewConfig.target.y, 
          z: viewConfig.target.z 
        }, duration)
        .easing(TWEEN.Easing.Cubic.InOut)
        .start();
        
      this.tweens.push(posTween, targetTween);
    });
  }

  /**
   * 创建连续电子束流
   * @param {THREE.Vector3} startPos - 起始位置
   * @param {THREE.Vector3} endPos - 结束位置
   * @param {number} count - 粒子数量
   * @param {number} duration - 动画持续时间
   * @param {Function} onComplete - 完成回调
   */
  createElectronParticles(startPos, endPos, count = 10, duration = 2000, onComplete = null) {
    // 使用配置中的发射频率，如果没有则使用默认值
    const emissionRate = CONFIG.demoAnimation.electronParticle.emissionRate || 8;
    const particleInterval = 1000 / emissionRate; // 根据发射频率计算间隔时间（毫秒）
    
    // 计算电子束的总路径长度，用于确定粒子的生命周期
    const beamDistance = startPos.distanceTo(endPos);
    const particleSpeed = beamDistance / 1500; // 粒子移动速度（单位/毫秒）
    const particleLifetime = beamDistance / particleSpeed + 500; // 粒子生命周期稍长一些
    
    for (let i = 0; i < count; i++) {
      // 使用 setTimeout 来实现真正的实时发射
      const timeout = setTimeout(() => {
        // 从对象池获取粒子，而不是创建新的 (性能优化)
        const particle = this.particlePool.getParticle();
        
        // 设置初始位置
        particle.position.copy(startPos);
        
        // 添加发射效果：粒子从小到正常大小
        particle.scale.setScalar(0.1);
        
        // 添加到场景
        this.scene.add(particle);
        this.particles.push(particle);
        
        // 创建粒子出现动画
        const appearTween = new TWEEN.Tween(particle.scale, tweenGroup)
          .to({ x: 1, y: 1, z: 1 }, 200)
          .easing(TWEEN.Easing.Back.Out)
          .start();
        
        this.tweens.push(appearTween);
        
        // 创建连续移动动画 - 粒子会继续向前运动而不是在endPos停止
        const extendedEndPos = this.calculateExtendedEndPosition(startPos, endPos);
        const moveDuration = particleLifetime;
        
        const tween = new TWEEN.Tween(particle.position, tweenGroup)
          .to({
            x: extendedEndPos.x,
            y: extendedEndPos.y,
            z: extendedEndPos.z
          }, moveDuration)
          .easing(TWEEN.Easing.Linear.None)
          .onUpdate(() => {
            // 当粒子接近荧光屏时，添加发光效果
            const distanceToScreen = particle.position.distanceTo(endPos);
            if (distanceToScreen < 0.1) {
              // 在荧光屏上添加发光点
              if (this.components && this.components.screen) {
                this.components.screen.addGlowPoint(particle.position.clone());
              }
            }
          })
          .onComplete(() => {
            // 最后一个粒子完成时触发回调
            if (i === count - 1 && onComplete) {
              onComplete();
            }
            
            // 从场景中移除粒子
            this.scene.remove(particle);
            const index = this.particles.indexOf(particle);
            if (index !== -1) {
              this.particles.splice(index, 1);
            }
            
            // 归还粒子到对象池，而不是销毁 (性能优化)
            this.particlePool.releaseParticle(particle);
          })
          .start();
        
        this.tweens.push(tween);
      }, i * particleInterval);
      
      // 保存timeout以便在停止动画时可以清除
      this.stepCallbacks.push(timeout);
    }
  }
  
  /**
   * 计算延伸的结束位置，让电子粒子看起来继续运动
   * @param {THREE.Vector3} startPos - 起始位置
   * @param {THREE.Vector3} endPos - 原始结束位置
   * @returns {THREE.Vector3} 延伸的结束位置
   */
  calculateExtendedEndPosition(startPos, endPos) {
    // 计算运动方向向量
    const direction = new THREE.Vector3().subVectors(endPos, startPos).normalize();
    
    // 将结束位置向前延伸，让粒子看起来继续运动
    const extensionDistance = 2.0; // 延伸距离
    const extendedEndPos = endPos.clone().add(direction.multiplyScalar(extensionDistance));
    
    return extendedEndPos;
  }
  
  /**
   * 创建连续电子束流（无限循环直到停止）
   * @param {THREE.Vector3} startPos - 起始位置
   * @param {THREE.Vector3} endPos - 结束位置
   */
  startContinuousElectronBeam(startPos, endPos) {
    // 如果已经有连续电子束在运行，先停止它
    this.stopContinuousElectronBeam();
    
    const emissionRate = CONFIG.demoAnimation.electronParticle.emissionRate || 8;
    const particleInterval = 1000 / emissionRate;
    
    // 计算电子束参数
    const beamDistance = startPos.distanceTo(endPos);
    const particleSpeed = beamDistance / 1500; // 粒子移动速度
    const particleLifetime = beamDistance / particleSpeed + 1000; // 延长生命周期
    
    // 创建连续发射的定时器
    this.continuousBeamInterval = setInterval(() => {
      if (!this.isPlaying) return; // 如果动画已停止，不再发射新粒子
      
      // 创建单个电子粒子 - 使用优化的材质
      const geometry = new THREE.SphereGeometry(CONFIG.demoAnimation.electronParticle.size, 6, 6);
      const particleMat = this.particleMaterial.clone();
      
      // 确保粒子材质具有最佳可见性
      particleMat.depthTest = true;  // 启用深度测试，确保被外壳正确遮挡
      particleMat.depthWrite = false;
      particleMat.blending = THREE.AdditiveBlending;
      
      const particle = new THREE.Mesh(geometry, particleMat);
      
      // 设置粒子的渲染顺序，确保在极板之后渲染
      particle.renderOrder = 10;
      
      // 设置初始位置
      particle.position.copy(startPos);
      particle.scale.setScalar(0.1);
      
      // 添加到场景
      this.scene.add(particle);
      this.particles.push(particle);
      
      // 粒子出现动画
      const appearTween = new TWEEN.Tween(particle.scale, tweenGroup)
        .to({ x: 1, y: 1, z: 1 }, 200)
        .easing(TWEEN.Easing.Back.Out)
        .start();
      
      this.tweens.push(appearTween);
      
      // 获取当前电子束轨迹路径
      const beamPath = this.getCurrentBeamPath(startPos, endPos);
      const extendedEndPos = this.calculateExtendedEndPosition(startPos, endPos);
      
      // 粒子沿着电子束轨迹移动动画
      const moveTween = new TWEEN.Tween({ progress: 0 }, tweenGroup)
        .to({ progress: 1 }, particleLifetime)
        .easing(TWEEN.Easing.Linear.None)
        .onUpdate((obj) => {
          // 根据进度沿着电子束路径移动粒子
          const position = this.getPositionAlongBeamPath(beamPath, obj.progress, extendedEndPos);
          particle.position.copy(position);
          
          // 当粒子接近荧光屏时，添加发光效果
          const distanceToScreen = particle.position.distanceTo(endPos);
          if (distanceToScreen < 0.1 && !particle.hasHitScreen) {
            particle.hasHitScreen = true; // 防止重复触发
            if (this.components && this.components.screen) {
              this.components.screen.addGlowPoint(particle.position.clone());
            }
          }
        })
        .onComplete(() => {
          // 移除粒子
          this.scene.remove(particle);
          const index = this.particles.indexOf(particle);
          if (index !== -1) {
            this.particles.splice(index, 1);
          }
          geometry.dispose();
          particle.material.dispose();
        })
        .start();
      
      this.tweens.push(moveTween);
      
    }, particleInterval);
  }
  
  /**
   * 获取当前电子束路径
   * @param {THREE.Vector3} startPos - 起始位置
   * @param {THREE.Vector3} endPos - 结束位置
   * @returns {Array<THREE.Vector3>} 电子束路径点数组
   */
  getCurrentBeamPath(startPos, endPos) {
    // 如果有电子束组件且有当前路径，使用实际的电子束路径
    if (this.components && this.components.electronBeam && this.components.electronBeam.beamPoints && this.components.electronBeam.beamPoints.length > 0) {
      return this.components.electronBeam.beamPoints;
    }
    
    // 否则生成简单的直线路径
    const pathPoints = [];
    const numSegments = 20;
    
    for (let i = 0; i <= numSegments; i++) {
      const t = i / numSegments;
      const point = new THREE.Vector3().lerpVectors(startPos, endPos, t);
      pathPoints.push(point);
    }
    
    return pathPoints;
  }
  
  /**
   * 根据进度获取沿电子束路径的位置
   * @param {Array<THREE.Vector3>} beamPath - 电子束路径点数组
   * @param {number} progress - 进度 (0-1)
   * @param {THREE.Vector3} extendedEndPos - 延伸的结束位置
   * @returns {THREE.Vector3} 当前位置
   */
  getPositionAlongBeamPath(beamPath, progress, extendedEndPos) {
    if (!beamPath || beamPath.length === 0) {
      // 如果没有路径，返回起始位置
      return new THREE.Vector3();
    }
    
    if (beamPath.length === 1) {
      return beamPath[0].clone();
    }
    
    // 如果进度超过1，继续向延伸位置移动
    if (progress > 1) {
      const lastPoint = beamPath[beamPath.length - 1];
      const overProgress = progress - 1;
      return lastPoint.clone().lerp(extendedEndPos, overProgress);
    }
    
    // 在路径上插值
    const scaledProgress = progress * (beamPath.length - 1);
    const segmentIndex = Math.floor(scaledProgress);
    const segmentProgress = scaledProgress - segmentIndex;
    
    if (segmentIndex >= beamPath.length - 1) {
      return beamPath[beamPath.length - 1].clone();
    }
    
    const startPoint = beamPath[segmentIndex];
    const endPoint = beamPath[segmentIndex + 1];
    
    return startPoint.clone().lerp(endPoint, segmentProgress);
  }
  
  /**
   * 停止连续电子束流
   */
  stopContinuousElectronBeam() {
    if (this.continuousBeamInterval) {
      clearInterval(this.continuousBeamInterval);
      this.continuousBeamInterval = null;
    }
  }
  
  /**
   * 模拟电压变化
   * @param {string} direction - 方向（'horizontal' 或 'vertical'）
   * @param {number} targetVoltage - 目标电压
   * @param {number} duration - 动画持续时间
   */
  simulateVoltageChange(direction, targetVoltage, duration = 1000) {
    const deflection = CONFIG.deflection[direction];
    if (!deflection) return;
    
    // 创建电压变化动画
    const tween = new TWEEN.Tween({ voltage: deflection.voltage }, tweenGroup)
      .to({ voltage: targetVoltage }, duration)
      .easing(TWEEN.Easing.Quadratic.InOut)
      .onUpdate(obj => {
        // 更新电压值
        deflection.voltage = obj.voltage;
        
        // 更新电子束
        if (this.controllers.onDeflectionChange) {
          this.controllers.onDeflectionChange(CONFIG.deflection);
        }
      })
      .start();
    
    this.tweens.push(tween);
  }
  
  /**
   * 设置波形参数
   * @param {Object} params - 波形参数
   */
  setWaveformParams(params) {
    Object.assign(CONFIG.waveform, params);
    
    // 更新波形
    if (this.controllers.onWaveformChange) {
      this.controllers.onWaveformChange(CONFIG.waveform);
    }
  }
  
  /**
   * 保存原始参数
   */
  saveOriginalParams() {
    this.originalParams = {
      deflection: {
        horizontal: { voltage: CONFIG.deflection.horizontal.voltage },
        vertical: { voltage: CONFIG.deflection.vertical.voltage }
      },
      waveform: { ...CONFIG.waveform },
      beam: {
        intensity: CONFIG.beam.intensity
      }
    };
  }
  
  /**
   * 保存GUI面板状态并折叠所有面板
   */
  collapseGuiFolders() {
    // 获取GUI控制器
    const guiController = this.controllers.guiController;
    if (!guiController || !guiController.gui) {
      return;
    }
    
    // 保存原始状态
    this.originalGuiState = {};
    
    // 遍历所有文件夹并保存其展开状态，然后折叠
    guiController.gui.__folders && Object.keys(guiController.gui.__folders).forEach(folderName => {
      const folder = guiController.gui.__folders[folderName];
      if (folder) {
        // 保存原始展开状态
        this.originalGuiState[folderName] = folder.closed;
        // 折叠面板
        folder.close();
      }
    });
    
    console.log('GUI面板已折叠，保存的原始状态:', this.originalGuiState);
  }
  
  /**
   * 恢复GUI面板状态
   */
  restoreGuiFolders() {
    // 获取GUI控制器
    const guiController = this.controllers.guiController;
    if (!guiController || !guiController.gui || !this.originalGuiState) {
      return;
    }
    
    // 恢复所有文件夹的原始展开状态
    Object.keys(this.originalGuiState).forEach(folderName => {
      const folder = guiController.gui.__folders[folderName];
      if (folder) {
        if (this.originalGuiState[folderName]) {
          folder.close();
        } else {
          folder.open();
        }
      }
    });
    
    console.log('GUI面板状态已恢复');
    this.originalGuiState = null;
  }
  
  /**
   * 重置所有参数
   */
  resetAllParams() {
    if (!this.originalParams) return;
    
    // 恢复偏转参数
    CONFIG.deflection.horizontal.voltage = this.originalParams.deflection.horizontal.voltage;
    CONFIG.deflection.vertical.voltage = this.originalParams.deflection.vertical.voltage;
    
    // 恢复波形参数
    Object.assign(CONFIG.waveform, this.originalParams.waveform);
    
    // 恢复电子束参数
    CONFIG.beam.intensity = this.originalParams.beam.intensity;
    
    // 注意：不在这里重置爆炸效果，因为演示结束时已经通过explodeBtn.click()处理了
    // 避免重复操作导致状态不一致
    
    // 重置CRT外壳状态
    this.resetCRTShell();
    
    // 更新控制器
    if (this.controllers.onDeflectionChange) {
      this.controllers.onDeflectionChange(CONFIG.deflection);
    }
    
    if (this.controllers.onWaveformChange) {
      this.controllers.onWaveformChange(CONFIG.waveform);
    }
    
    if (this.controllers.onBeamChange) {
      this.controllers.onBeamChange(CONFIG.beam);
    }
  }
  
  /**
   * 重置CRT外壳状态
   * 恢复外壳的可见性和各组件的分解状态
   */
  resetCRTShell() {
    console.log('重置CRT外壳状态');
    
    const crtShell = this.components.crtShell;
    if (!crtShell) {
      console.warn('找不到CRTShell组件');
      return;
    }
    
    const shellGroup = crtShell.getShell();
    if (!shellGroup) {
      console.warn('找不到CRT外壳组');
      return;
    }
    
    // 1. 恢复外壳可见性
    shellGroup.visible = CONFIG.shell.visible;
    console.log('恢复外壳可见性:', CONFIG.shell.visible);
    
    // 2. 重置各组件的分解状态为合并状态
    console.log('重置超椭圆分解状态');
    crtShell.toggleSuperellipseExplode(false);
    
    console.log('重置旋转曲线连接分解状态');
    crtShell.toggleConnectionExplode(false);
    
    console.log('重置Cylinder2分解状态');
    crtShell.toggleCylinder2Explode(false);
    
    // 3. 恢复所有材质的透明度
    this.restoreCRTShellMaterials(shellGroup);
    
    console.log('CRT外壳状态重置完成');
  }
  
  /**
   * 恢复CRT外壳材质的透明度
   * @param {THREE.Group} shellGroup - CRT外壳组
   */
  restoreCRTShellMaterials(shellGroup) {
    console.log('恢复CRT外壳材质透明度');
    
    // 遍历所有子对象，恢复材质透明度
    shellGroup.traverse((child) => {
      if (child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        
        materials.forEach(material => {
          // 恢复原始透明度
          material.opacity = CONFIG.shell.opacity;
          material.transparent = CONFIG.shell.opacity < 1.0;
        });
      }
    });
  }
  
  /**
   * 清除所有粒子
   */
  clearAllParticles() {
    this.particles.forEach(particle => {
      this.scene.remove(particle);
      particle.geometry.dispose();
      particle.material.dispose();
    });
    this.particles = [];
  }
  
  /**
   * 设置极板不透明度
   * @param {number} opacity - 不透明度值 (0-1)
   */
  setPlateOpacity(opacity) {
    // 如果还没有保存原始不透明度，先保存
    if (!this.originalPlateOpacities) {
      this.originalPlateOpacities = {};
      
      // 保存垂直偏转板的原始不透明度
      if (this.components.v1 && this.components.v1.material) {
        this.originalPlateOpacities.v1 = this.components.v1.material.opacity || 1.0;
      }
      if (this.components.v2 && this.components.v2.material) {
        this.originalPlateOpacities.v2 = this.components.v2.material.opacity || 1.0;
      }
      
      // 保存水平偏转板的原始不透明度
      if (this.components.h1 && this.components.h1.material) {
        this.originalPlateOpacities.h1 = this.components.h1.material.opacity || 1.0;
      }
      if (this.components.h2 && this.components.h2.material) {
        this.originalPlateOpacities.h2 = this.components.h2.material.opacity || 1.0;
      }
    }
    
    // 设置极板的新不透明度 - 优化透明度渲染
    const plates = [this.components.v1, this.components.v2, this.components.h1, this.components.h2];
    plates.forEach(plate => {
      if (plate && plate.material) {
        plate.material.transparent = true;
        plate.material.opacity = opacity;
        plate.material.depthWrite = false; // 禁用深度写入，避免遮挡电子束
        plate.material.side = THREE.DoubleSide; // 双面渲染，确保各个角度都能看到
        plate.material.needsUpdate = true;
        
        // 调整渲染顺序，让极板在电子束之前渲染
        plate.renderOrder = -1;
      }
    });
  }
  
  /**
   * 恢复极板原始不透明度
   */
  restorePlateOpacity() {
    if (!this.originalPlateOpacities) {
      return;
    }
    
    // 恢复所有极板的原始不透明度和渲染属性
    const plates = [
      { component: this.components.v1, key: 'v1' },
      { component: this.components.v2, key: 'v2' },
      { component: this.components.h1, key: 'h1' },
      { component: this.components.h2, key: 'h2' }
    ];
    
    plates.forEach(({ component, key }) => {
      if (component && component.material) {
        component.material.opacity = this.originalPlateOpacities[key];
        component.material.transparent = this.originalPlateOpacities[key] < 1.0;
        component.material.depthWrite = true; // 恢复深度写入
        component.material.side = THREE.FrontSide; // 恢复单面渲染
        component.material.needsUpdate = true;
        
        // 恢复渲染顺序
        component.renderOrder = 0;
      }
    });
    
    // 清除保存的原始值
    this.originalPlateOpacities = null;
  }

  /**
   * 更新动画
   */
  update() {
    // 更新所有tweens
    this.tweens.forEach(tween => {
      if (tween && tween.isPlaying) {
        tween.update();
      }
    });
    
    // 清理已完成的tweens
    this.tweens = this.tweens.filter(tween => tween && tween.isPlaying);
    
    // 更新TWEEN（使用新的 Group API）
    tweenGroup.update();
  }
  
  /**
   * 获取对象池性能统计信息
   * @returns {Object} 对象池状态和性能统计
   */
  getParticlePoolStatus() {
    if (!this.particlePool) {
      return null;
    }
    return this.particlePool.getStatus();
  }
  
  /**
   * 打印对象池详细状态（调试用）
   */
  printParticlePoolStatus() {
    if (this.particlePool) {
      this.particlePool.printStatus();
    }
  }
  
  /**
   * CRT外壳分解和消失效果
   */
  startCRTShellDisappear() {
    console.log('开始CRT外壳分解和消失效果');
    
    const crtShell = this.components.crtShell;
    if (!crtShell) {
      console.warn('找不到CRTShell组件');
      return;
    }
    
    // 第一阶段：使用各组件自带的分解动画
    this.explodeCRTShellComponents(crtShell);
    
    // 第二阶段：在分解动画完成后开始渐变消失（1.5秒后开始，持续1.5秒）
    setTimeout(() => {
      const shellGroup = crtShell.getShell();
      if (shellGroup) {
        this.fadeCRTShell(shellGroup, 1500);
      }
    }, 1500); // 等待分解动画完成
  }
  
  /**
   * 使用各组件自带的分解动画分解CRT外壳
   * @param {CRTShell} crtShell - CRT外壳组件
   */
  explodeCRTShellComponents(crtShell) {
    console.log('使用组件自带的分解动画分解CRT外壳');
    
    // 分解超椭圆组件（带延迟以产生层次感）
    setTimeout(() => {
      console.log('分解超椭圆组件');
      crtShell.toggleSuperellipseExplode(true);
    }, 0);
    
    // 分解旋转曲线连接组件
    setTimeout(() => {
      console.log('分解旋转曲线连接组件');
      crtShell.toggleConnectionExplode(true);
    }, 200); // 200ms延迟
    
    // 分解Cylinder2组件
    setTimeout(() => {
      console.log('分解Cylinder2组件');
      crtShell.toggleCylinder2Explode(true);
    }, 400); // 400ms延迟
  }
  
  /**
   * CRT外壳渐变消失
   * @param {THREE.Group} shellGroup - CRT外壳组
   * @param {number} duration - 消失持续时间
   */
  fadeCRTShell(shellGroup, duration) {
    console.log('CRT外壳开始渐变消失');
    
    // 收集所有外壳材质
    const materialsToFade = [];
    shellGroup.traverse((child) => {
      if (child.material) {
        if (Array.isArray(child.material)) {
          materialsToFade.push(...child.material);
        } else {
          materialsToFade.push(child.material);
        }
      }
    });
    
    // 记录原始透明度并设置透明属性
    const originalOpacities = materialsToFade.map(material => {
      const originalOpacity = material.opacity;
      const originalTransparent = material.transparent;
      
      // 确保材质支持透明
      material.transparent = true;
      
      return {
        material: material,
        originalOpacity: originalOpacity,
        originalTransparent: originalTransparent
      };
    });
    
    // 创建渐变消失动画
    const fadeOutTween = new TWEEN.Tween({ opacity: 1.0 }, tweenGroup)
      .to({ opacity: 0.0 }, duration)
      .easing(TWEEN.Easing.Quadratic.InOut)
      .onUpdate(function(obj) {
        materialsToFade.forEach(material => {
          material.opacity = obj.opacity;
        });
      })
      .onComplete(() => {
        console.log('CRT外壳消失完成，隐藏外壳');
        // 完全隐藏外壳
        shellGroup.visible = false;
      })
      .start();
    
    this.tweens.push(fadeOutTween);
  }
  
  /**
   * 开始扩张并渐变消失效果
   * 让模型继续向外扩张，然后在2秒内渐变消失
   */
  startExpandAndFadeOut() {
    console.log('开始扩张并渐变消失效果');
    
    // 获取所有需要处理的组件
    const crtShell = this.components.crtShell;
    if (!crtShell) {
      console.warn('找不到CRTShell组件');
      return;
    }
    
    // 第一阶段：继续扩张（持续1秒）
    this.continueExpansion(crtShell, 1000);
    
    // 第二阶段：开始渐变消失（1秒后开始，持续2秒）
    setTimeout(() => {
      this.startFadeOut(crtShell, 2000);
    }, 1000);
  }
  
  /**
   * 继续扩张效果
   * @param {Object} crtShell - CRTShell组件
   * @param {number} duration - 扩张持续时间
   */
  continueExpansion(crtShell, duration) {
    console.log('继续扩张效果');
    
    // 直接操作所有组件的位置，让它们继续向外扩张
    Object.entries(this.components).forEach(([key, component]) => {
      if (!component || !component.position) return;
      
      // 计算从原点到当前位置的方向
      const currentPos = component.position.clone();
      const direction = currentPos.clone().normalize();
      
      // 如果方向为零向量，使用默认方向
      if (direction.length() === 0) {
        direction.set(1, 0, 0);
      }
      
      // 计算目标位置（继续向外扩张1.5倍）
      const targetPos = currentPos.clone().add(direction.multiplyScalar(2.0));
      
      // 创建扩张动画
      const expandTween = new TWEEN.Tween(component.position, tweenGroup)
        .to({
          x: targetPos.x,
          y: targetPos.y,
          z: targetPos.z
        }, duration)
        .easing(TWEEN.Easing.Quadratic.Out)
        .start();
        
      this.tweens.push(expandTween);
    });
  }
  
  /**
   * 开始渐变消失效果
   * @param {Object} crtShell - CRTShell组件
   * @param {number} duration - 渐变持续时间
   */
  startFadeOut(crtShell, duration) {
    console.log('开始渐变消失效果');
    
    // 收集所有需要渐变的材质
    const materialsToFade = [];
    
    // 遍历所有组件，收集材质
    Object.entries(this.components).forEach(([key, component]) => {
      if (component && component.material) {
        materialsToFade.push(component.material);
      } else if (component && component.traverse) {
        // 对于组对象，遍历所有子对象
        component.traverse((child) => {
          if (child.material) {
            materialsToFade.push(child.material);
          }
        });
      }
    });
    
    // 记录原始透明度
    const originalOpacities = materialsToFade.map(material => ({
      material: material,
      originalOpacity: material.opacity,
      originalTransparent: material.transparent
    }));
    
    // 创建渐变动画
    const fadeOutTween = new TWEEN.Tween({ opacity: 1.0 }, tweenGroup)
      .to({ opacity: 0.0 }, duration)
      .easing(TWEEN.Easing.Quadratic.InOut)
      .onUpdate((object) => {
        // 更新所有材质的透明度
        originalOpacities.forEach(({ material, originalOpacity }) => {
          material.transparent = true;
          material.opacity = originalOpacity * object.opacity;
          material.needsUpdate = true;
        });
      })
      .onComplete(() => {
        console.log('渐变消失完成，隐藏外壳');
        // 动画完成后，隐藏外壳
        this.hideShellCompletely();
      })
      .start();
      
    this.tweens.push(fadeOutTween);
  }
  
  
  /**
   * 完全隐藏外壳
   */
  hideShellCompletely() {
    console.log('完全隐藏外壳');
    
    // 通过GUI控制器隐藏外壳
    const shellCheckboxes = document.querySelectorAll('input[type="checkbox"]');
    let shellCheckbox = null;
    
    // 查找对应的复选框
    shellCheckboxes.forEach(checkbox => {
      const label = checkbox.closest('li')?.querySelector('.property-name');
      if (label && label.textContent.includes('显示外壳')) {
        shellCheckbox = checkbox;
      }
    });
    
    if (shellCheckbox && shellCheckbox.checked) {
      console.log('通过复选框隐藏外壳');
      shellCheckbox.click();
    } else {
      // 如果找不到复选框，直接通过CONFIG修改
      console.log('直接通过CONFIG隐藏外壳');
      if (window.CONFIG) {
        window.CONFIG.shell.visible = false;
        // 触发外壳更新
        if (this.controllers && this.controllers.onShellChange) {
          this.controllers.onShellChange(window.CONFIG.shell);
        }
      }
    }
  }
} 