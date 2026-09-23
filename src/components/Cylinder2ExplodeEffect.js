import * as THREE from 'three';
import * as TWEEN from '@tweenjs/tween.js';
import { CONFIG } from '../configLoader.js';
import { tweenGroup } from '../main.js';
import { unifiedComponentMaterial } from '../materials/UnifiedComponentMaterial.js';

/**
 * Cylinder2爆炸分解效果类
 * 将cylinder2模型分解成积木块状组件，模拟积木组装/分解效果
 */
export class Cylinder2ExplodeEffect {
  /**
   * 构造函数
   * @param {THREE.Mesh} cylinder2Mesh - cylinder2网格对象
   * @param {THREE.Group} parentGroup - 父级组对象
   */
  constructor(cylinder2Mesh, parentGroup) {
    this.originalMesh = cylinder2Mesh;
    this.parentGroup = parentGroup;
    this.exploded = false;
    this.blocks = [];
    this.tweens = [];
    this.originalVisible = cylinder2Mesh.visible;
    
    // 分解参数
    this.config = {
      // 分解距离系数
      explodeDistance: 1.5,
      // 动画持续时间
      animationDuration: 1200
    };
    
    this.createBlocks();
  }
  
  /**
   * 创建积木块
   */
  createBlocks() {
    const config = CONFIG.shell.cylinder2;
    const radius = config.radius;
    const height = config.height;
    
    // 使用统一组件材质（示波器内部金属材质）
    const blockMaterial = unifiedComponentMaterial.getMaterial('exploded');
    
    // 创建4个扇形分块（四分之一圆）
    for (let i = 0; i < 4; i++) {
      const block = this.createQuarterBlock(radius, height, blockMaterial, i);
      
      // 设置初始位置
      block.position.copy(this.originalMesh.position);
      
      // 保存扇形的基础旋转
      const baseRotation = block.rotation.clone();
      
      // 应用cylinder2的旋转（组合旋转）
      block.rotation.copy(this.originalMesh.rotation);
      // 在原始旋转基础上添加扇形的基础旋转
      block.rotation.z += baseRotation.z;
      
      // 初始时隐藏积木块
      block.visible = false;
      
      // 计算扇形的中心角度（用于分解方向）
      const centerAngle = i * Math.PI / 2 + Math.PI / 4; // 每个扇形的中心角度
      
      this.blocks.push({
        mesh: block,
        originalPosition: block.position.clone(),
        originalRotation: block.rotation.clone(),
        segmentIndex: i,
        centerAngle: centerAngle
      });
      
      this.parentGroup.add(block);
    }
  }
  
  /**
   * 创建四分之一圆扇形积木块
   */
  createQuarterBlock(radius, height, material, segmentIndex) {
    // 创建扇形几何体（四分之一圆）
    const geometry = new THREE.CylinderGeometry(
      radius, 
      radius, 
      height, 
      8, // 每个扇形的径向段数
      1, // 高度分段数
      false, // 不封闭
      segmentIndex * Math.PI / 2, // 起始角度
      Math.PI / 2 // 扇形角度（90度）
    );
    
    // 创建网格
    const mesh = new THREE.Mesh(geometry, material);
    
    // 调整方向以匹配cylinder2的方向（沿X轴）
    mesh.rotation.z = Math.PI / 2;
    
    return mesh;
  }
  
  /**
   * 计算爆炸后的位置
   */
  calculateExplodedPosition(block) {
    const { centerAngle, originalPosition } = block;
    
    // 计算扇形在径向上的分解方向
    // 由于cylinder2是沿X轴的，我们需要在YZ平面上分解
    const explodeDistance = this.config.explodeDistance;
    
    // 计算分解的方向向量（在YZ平面上）
    const directionY = Math.sin(centerAngle) * explodeDistance;
    const directionZ = Math.cos(centerAngle) * explodeDistance;
    
    // 计算新位置
    const explodedPosition = originalPosition.clone();
    explodedPosition.y += directionY;
    explodedPosition.z += directionZ;
    
    return explodedPosition;
  }
  
  /**
   * 切换爆炸效果
   */
  toggle(explode = !this.exploded) {
    this.exploded = explode;
    
    // 停止所有正在进行的动画
    this.tweens.forEach(tween => tween.stop());
    this.tweens = [];
    
    if (this.exploded) {
      // 爆炸：隐藏原始网格，显示积木块
      this.originalMesh.visible = false;
      this.explodeBlocks();
    } else {
      // 合并：重新组装积木块，显示原始网格
      this.assembleBlocks();
    }
    
    return this.exploded;
  }
  
  /**
   * 分解积木块
   */
  explodeBlocks() {
    this.blocks.forEach((block, index) => {
      // 显示积木块
      block.mesh.visible = true;
      
      // 计算目标位置
      const targetPosition = this.calculateExplodedPosition(block);
      
      // 创建位置动画（带延迟以产生连锁效果）
      const delay = index * 100; // 100ms的延迟间隔，让分解效果更明显
      
      const positionTween = new TWEEN.Tween(block.mesh.position, tweenGroup)
        .to({
          x: targetPosition.x,
          y: targetPosition.y,
          z: targetPosition.z
        }, this.config.animationDuration)
        .delay(delay)
        .easing(TWEEN.Easing.Back.Out)
        .start();
      
      this.tweens.push(positionTween);
    });
  }
  
  /**
   * 组装积木块
   */
  assembleBlocks() {
    this.blocks.forEach((block, index) => {
      // 创建回归动画（反向延迟以产生重新组装效果）
      const delay = (this.blocks.length - index - 1) * 80; // 反向延迟
      
      const positionTween = new TWEEN.Tween(block.mesh.position, tweenGroup)
        .to({
          x: block.originalPosition.x,
          y: block.originalPosition.y,
          z: block.originalPosition.z
        }, this.config.animationDuration * 0.8)
        .delay(delay)
        .easing(TWEEN.Easing.Back.In)
        .onComplete(() => {
          // 最后一个块组装完成后，隐藏所有积木块并显示原始网格
          if (index === this.blocks.length - 1) {
            this.blocks.forEach(b => b.mesh.visible = false);
            this.originalMesh.visible = this.originalVisible;
          }
        })
        .start();
      
      this.tweens.push(positionTween);
    });
  }
  
  /**
   * 清理资源
   */
  dispose() {
    // 停止所有动画
    this.tweens.forEach(tween => tween.stop());
    this.tweens = [];
    
    // 移除积木块
    this.blocks.forEach(block => {
      this.parentGroup.remove(block.mesh);
      block.mesh.geometry.dispose();
      block.mesh.material.dispose();
    });
    
    this.blocks = [];
  }
  
  /**
   * 获取爆炸状态
   */
  isExploded() {
    return this.exploded;
  }
}
