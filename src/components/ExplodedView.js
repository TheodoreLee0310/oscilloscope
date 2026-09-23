import * as THREE from 'three';
import * as TWEEN from '@tweenjs/tween.js';
import { CONFIG } from '../configLoader.js';
import { tweenGroup } from '../main.js';

/**
 * 分解视图类
 * 负责处理模型的分解视图效果
 */
export class ExplodedView {
  /**
   * 构造函数
   * @param {Object} components - 组件对象集合
   */
  constructor(components) {
    this.components = components;
    this.originalPositions = new Map();
    this.exploded = false;
    this.explodeFactor = CONFIG.explodedView.explodeFactor;
    this.tweens = [];
    
    // 主要组件列表（仅用于聚焦，不参与分解动画）
    this.focusOnlyComponents = ['gun', 'gunHead', 'v1', 'v2', 'h1', 'h2', 'screen'];
    
    // 保存原始位置
    this.saveOriginalPositions();
  }
  
  /**
   * 保存所有组件的原始位置
   */
  saveOriginalPositions() {
    Object.entries(this.components).forEach(([key, object]) => {
      // 跳过仅用于聚焦的组件
      if (this.focusOnlyComponents.includes(key)) {
        return;
      }
      
      if (object && object.position) {
        this.originalPositions.set(key, object.position.clone());
      }
    });
  }
  
  /**
   * 添加组件
   * @param {string} key - 组件键名
   * @param {THREE.Object3D} object - 组件对象
   */
  addComponent(key, object) {
    this.components[key] = object;
    
    // 跳过仅用于聚焦的组件，不保存其原始位置
    if (!this.focusOnlyComponents.includes(key) && object && object.position) {
      this.originalPositions.set(key, object.position.clone());
    }
  }
  
  /**
   * 计算组件的分解位置
   * @param {THREE.Vector3} originalPosition - 原始位置
   * @param {string} componentKey - 组件键名
   * @returns {THREE.Vector3} 分解后的位置
   */
  calculateExplodedPosition(originalPosition, componentKey) {
    // 定义各组件的分解方向
    const directions = {
      'gun': new THREE.Vector3(-1, 0, 0),
      'gunHead': new THREE.Vector3(-1, 0, 0),
      'v1': new THREE.Vector3(0, 1, 0),
      'v2': new THREE.Vector3(0, -1, 0),
      'h1': new THREE.Vector3(0, 0, 1),
      'h2': new THREE.Vector3(0, 0, -1),
      'screen': new THREE.Vector3(1, 0, 0)
    };
    
    // 获取分解方向，如果没有定义则使用默认方向（向外）
    let direction;
    if (directions[componentKey]) {
      direction = directions[componentKey];
    } else {
      // 默认方向：从原点到组件的方向
      direction = originalPosition.clone().normalize();
      if (direction.length() === 0) {
        direction.set(1, 0, 0); // 默认X轴方向
      }
    }
    
    // 计算分解后的位置
    return originalPosition.clone().add(
      direction.multiplyScalar(this.explodeFactor)
    );
  }
  
  /**
   * 切换分解视图
   * @param {boolean} explode - 是否分解
   * @param {number} duration - 动画持续时间（毫秒）
   */
  toggle(explode = !this.exploded, duration = CONFIG.explodedView.animationDuration) {
    this.exploded = explode;
    
    // 停止所有正在进行的动画
    this.tweens.forEach(tween => tween.stop());
    this.tweens = [];
    
    // 为每个组件创建动画
    Object.entries(this.components).forEach(([key, object]) => {
      // 跳过仅用于聚焦的组件
      if (this.focusOnlyComponents.includes(key)) return;
      
      if (!object || !object.position) return;
      
      const originalPosition = this.originalPositions.get(key);
      if (!originalPosition) return;
      
      const targetPosition = explode 
        ? this.calculateExplodedPosition(originalPosition, key)
        : originalPosition.clone();
      
      // 创建位置动画
      const tween = new TWEEN.Tween(object.position, tweenGroup)
        .to({
          x: targetPosition.x,
          y: targetPosition.y,
          z: targetPosition.z
        }, duration)
        .easing(TWEEN.Easing.Quadratic.InOut)
        .start();
      
      this.tweens.push(tween);
    });
    
    return this.exploded;
  }
  
  /**
   * 聚焦到特定组件
   * @param {string} componentKey - 组件键名
   * @param {THREE.Camera} camera - 相机
   * @param {THREE.Controls} controls - 控制器
   * @param {number} duration - 动画持续时间（毫秒）
   */
  focusComponent(componentKey, camera, controls, duration = 1000) {
    console.log('ExplodedView.focusComponent被调用');
    console.log('componentKey:', componentKey);
    console.log('this.components:', this.components);
    console.log('camera:', camera);
    console.log('controls:', controls);
    
    const component = this.components[componentKey];
    console.log('找到的组件:', component);
    
    if (!component) {
      console.error('组件未找到:', componentKey);
      return;
    }
    
    // 计算目标位置（组件位置 + 偏移）
    const targetPosition = component.position.clone();
    const offset = new THREE.Vector3(
      CONFIG.explodedView.cameraOffset.x,
      CONFIG.explodedView.cameraOffset.y,
      CONFIG.explodedView.cameraOffset.z
    );
    
    console.log('组件位置:', targetPosition);
    console.log('相机偏移:', offset);
    console.log('目标相机位置:', {
      x: targetPosition.x + offset.x,
      y: targetPosition.y + offset.y,
      z: targetPosition.z + offset.z
    });
    
    // 创建相机位置动画
    const posTween = new TWEEN.Tween(camera.position, tweenGroup)
      .to({
        x: targetPosition.x + offset.x,
        y: targetPosition.y + offset.y,
        z: targetPosition.z + offset.z
      }, duration)
      .easing(TWEEN.Easing.Cubic.InOut)
      .start();
    
    // 创建控制器目标点动画
    const targetTween = new TWEEN.Tween(controls.target, tweenGroup)
      .to({
        x: targetPosition.x,
        y: targetPosition.y,
        z: targetPosition.z
      }, duration)
      .easing(TWEEN.Easing.Cubic.InOut)
      .start();
    
    this.tweens.push(posTween, targetTween);
    console.log('动画已创建并添加到tweens数组，当前tweens数量:', this.tweens.length);
    
    // 如果动画没有立即开始，强制移动相机
    setTimeout(() => {
      if (camera.position.distanceTo(new THREE.Vector3(
        targetPosition.x + offset.x,
        targetPosition.y + offset.y,
        targetPosition.z + offset.z
      )) > 0.1) {
        console.log('动画可能没有正常工作，强制移动相机');
        this.forceMoveCamera(camera, controls, targetPosition, offset);
      }
    }, 100);
  }
  
  /**
   * 强制移动相机（备选方案）
   */
  forceMoveCamera(camera, controls, targetPosition, offset) {
    console.log('执行强制移动');
    
    // 直接设置相机位置
    camera.position.set(
      targetPosition.x + offset.x,
      targetPosition.y + offset.y,
      targetPosition.z + offset.z
    );
    
    // 直接设置控制器目标点
    controls.target.set(
      targetPosition.x,
      targetPosition.y,
      targetPosition.z
    );
    
    // 更新控制器
    controls.update();
    
    console.log('强制移动完成，相机位置:', camera.position);
    console.log('控制器目标点:', controls.target);
  }
  
  /**
   * 重置视图
   * @param {THREE.Camera} camera - 相机
   * @param {THREE.Controls} controls - 控制器
   * @param {number} duration - 动画持续时间（毫秒）
   */
  resetView(camera, controls, duration = CONFIG.explodedView.animationDuration) {
    // 重置相机位置
    const posTween = new TWEEN.Tween(camera.position, tweenGroup)
      .to({ 
        x: CONFIG.camera.position.x, 
        y: CONFIG.camera.position.y, 
        z: CONFIG.camera.position.z 
      }, duration)
      .easing(TWEEN.Easing.Cubic.InOut)
      .start();
    
    // 重置控制器目标点
    const targetTween = new TWEEN.Tween(controls.target, tweenGroup)
      .to({ 
        x: CONFIG.camera.target.x, 
        y: CONFIG.camera.target.y, 
        z: CONFIG.camera.target.z 
      }, duration)
      .easing(TWEEN.Easing.Cubic.InOut)
      .start();
    
    this.tweens.push(posTween, targetTween);
    
    // 如果处于分解状态，重置组件位置
    if (this.exploded) {
      this.toggle(false, duration);
    }
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
  }
} 