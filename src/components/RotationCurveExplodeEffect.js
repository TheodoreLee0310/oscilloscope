import * as THREE from 'three';
import * as TWEEN from '@tweenjs/tween.js';
import { CONFIG } from '../configLoader.js';
import { tweenGroup } from '../main.js';
import { RotationCurveGeometry } from '../geometry/RotationCurveGeometry.js';
import { unifiedComponentMaterial } from '../materials/UnifiedComponentMaterial.js';

/**
 * 旋转曲线连接爆炸分解效果类
 * 将旋转曲线连接分解成扇形段，模拟积木组装/分解效果
 */
export class RotationCurveExplodeEffect {
  /**
   * 构造函数
   * @param {THREE.Mesh} connectionMesh - 旋转曲线连接网格对象
   * @param {THREE.Group} parentGroup - 父级组对象
   */
  constructor(connectionMesh, parentGroup) {
    this.originalMesh = connectionMesh;
    this.parentGroup = parentGroup;
    this.exploded = false;
    this.sectors = [];
    this.tweens = [];
    this.originalVisible = connectionMesh.visible;
    
    // 分解参数
    this.config = {
      // 分解距离系数 - 与Cylinder2ExplodeEffect保持一致
      explodeDistance: 1.5,
      // 动画持续时间 - 与Cylinder2ExplodeEffect保持一致
      animationDuration: 1200,
      // 扇形段数量
      sectorCount: 4
    };
    
    this.createSectors();
  }
  
  /**
   * 创建扇形段
   */
  createSectors() {
    const config = CONFIG.shell.rotationCurveConnection;
    if (!config) return;
    
    // 获取连接的基本参数
    const segments = config.segments || 50;
    const radialSegments = config.radialSegments || 32;
    const connectionLength = config.connectionLength || 4.8;
    
    // 使用统一组件材质（示波器内部金属材质）
    const ringMaterial = unifiedComponentMaterial.getMaterial('exploded');
    
    // 创建4个扇形段（每个90度）
    for (let i = 0; i < this.config.sectorCount; i++) {
      const sector = this.createSectorSegment(connectionLength, radialSegments, ringMaterial, i);
      
      // 设置初始位置
      sector.position.copy(this.originalMesh.position);
      
      // 保存扇形的基础旋转
      const baseRotation = sector.rotation.clone();
      
      // 应用原始连接的旋转（复合旋转）
      sector.rotation.copy(this.originalMesh.rotation);
      // 在原始旋转基础上添加扇形的基础旋转
      sector.rotation.z += baseRotation.z;
      
      // 初始时隐藏扇形段
      sector.visible = false;
      
      // 计算扇形段的中心角度（用于分解方向）
      const centerAngle = i * Math.PI / 2 + Math.PI / 4; // 每个扇形的中心角度（45°, 135°, 225°, 315°）
      
      this.sectors.push({
        mesh: sector,
        originalPosition: sector.position.clone(),
        originalRotation: sector.rotation.clone(),
        segmentIndex: i,
        centerAngle: centerAngle
      });
      
      this.parentGroup.add(sector);
    }
  }
  
  /**
   * 创建单个扇形段
   */
  createSectorSegment(length, radialSegments, material, segmentIndex) {
    // 获取原始连接的参数
    const connectionParams = this.getConnectionParameters();
    
    // 创建旋转曲线几何体生成器
    const curveGeometry = new RotationCurveGeometry(
      connectionParams.startRadius,
      connectionParams.endRadius,
      connectionParams.connectionLength,
      connectionParams.curveType,
      connectionParams.segments,
      connectionParams.radialSegments
    );
    
    // 创建扇形片段几何体
    const sectorGeometry = curveGeometry.createSectorGeometry(segmentIndex, this.config.sectorCount);
    
    // 创建网格
    const mesh = new THREE.Mesh(sectorGeometry, material);
    
    // 调整方向以匹配旋转曲线连接的方向（沿X轴）
    mesh.rotation.z = Math.PI / 2;
    
    return mesh;
  }
  
  /**
   * 获取原始连接的参数
   */
  getConnectionParameters() {
    // 从配置中获取连接参数
    const config = CONFIG.shell.rotationCurveConnection;
    const cylinder1Config = CONFIG.shell.cylinder1;
    const cylinder2Config = CONFIG.shell.cylinder2;
    
    return {
      startRadius: cylinder1Config.radius,
      endRadius: cylinder2Config.radius,
      connectionLength: config.connectionLength,
      curveType: config.curveType || 'G2',
      segments: config.segments || 50,
      radialSegments: config.radialSegments || 32
    };
  }

  /**
   * 估算连接的半径
   */
  estimateConnectionRadius() {
    // 基于配置估算半径，或者使用默认值
    const cylinder1Radius = CONFIG.shell.cylinder1?.radius || 1.5;
    const cylinder2Radius = CONFIG.shell.cylinder2?.radius || 1.0;
    
    // 使用两个圆柱体半径的平均值作为连接半径
    return (cylinder1Radius + cylinder2Radius) / 2;
  }
  
  /**
   * 计算爆炸后的位置
   */
  calculateExplodedPosition(sector) {
    const { centerAngle, originalPosition } = sector;
    
    // 计算扇形段在径向上的分解方向
    // 由于连接是沿X轴的，我们需要在YZ平面上分解
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
   * 计算爆炸后的旋转
   */
  calculateExplodedRotation(sector) {
    const { originalRotation, segmentIndex } = sector;
    
    // 添加90度旋转效果到分离的扇形段
    const explodedRotation = originalRotation.clone();
    
    // 为每个扇形段添加90度旋转（π/2弧度）
    // 围绕X轴旋转，使扇形段产生翻滚效果
    explodedRotation.x += Math.PI / 2;
    
    // 可选：为不同扇形段添加轻微的旋转变化，增加动感
    const rotationVariation = (segmentIndex * Math.PI / 8) * 0.3; // 每个段轻微不同的旋转偏移
    explodedRotation.y += rotationVariation;
    
    return explodedRotation;
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
      // 爆炸：隐藏原始网格，显示扇形段
      this.originalMesh.visible = false;
      this.explodeSectors();
    } else {
      // 合并：重新组装扇形段，显示原始网格
      this.assembleSectors();
    }
    
    return this.exploded;
  }
  
  /**
   * 分解扇形段
   */
  explodeSectors() {
    this.sectors.forEach((sector, index) => {
      // 显示扇形段
      sector.mesh.visible = true;
      
      // 计算目标位置和旋转
      const targetPosition = this.calculateExplodedPosition(sector);
      const targetRotation = this.calculateExplodedRotation(sector);
      
      // 创建位置动画（带延迟以产生连锁效果）
      const delay = index * 100; // 100ms的延迟间隔，让分解效果更明显，与Cylinder2ExplodeEffect保持一致
      
      const positionTween = new TWEEN.Tween(sector.mesh.position, tweenGroup)
        .to({
          x: targetPosition.x,
          y: targetPosition.y,
          z: targetPosition.z
        }, this.config.animationDuration)
        .delay(delay)
        .easing(TWEEN.Easing.Back.Out)
        .start();
      
      // 创建旋转动画
      const rotationTween = new TWEEN.Tween(sector.mesh.rotation, tweenGroup)
        .to({
          x: targetRotation.x,
          y: targetRotation.y,
          z: targetRotation.z
        }, this.config.animationDuration)
        .delay(delay)
        .easing(TWEEN.Easing.Back.Out)
        .start();
      
      this.tweens.push(positionTween, rotationTween);
    });
  }
  
  /**
   * 组装扇形段
   */
  assembleSectors() {
    this.sectors.forEach((sector, index) => {
      // 创建回归动画（反向延迟以产生重新组装效果）
      const delay = (this.sectors.length - index - 1) * 80; // 反向延迟，与Cylinder2ExplodeEffect保持一致
      
      const positionTween = new TWEEN.Tween(sector.mesh.position, tweenGroup)
        .to({
          x: sector.originalPosition.x,
          y: sector.originalPosition.y,
          z: sector.originalPosition.z
        }, this.config.animationDuration * 0.8)
        .delay(delay)
        .easing(TWEEN.Easing.Back.In)
        .onComplete(() => {
          // 最后一个扇形段组装完成后，隐藏所有扇形段并显示原始连接
          if (index === this.sectors.length - 1) {
            this.sectors.forEach(s => s.mesh.visible = false);
            this.originalMesh.visible = this.originalVisible;
          }
        })
        .start();
      
      const rotationTween = new TWEEN.Tween(sector.mesh.rotation, tweenGroup)
        .to({
          x: sector.originalRotation.x,
          y: sector.originalRotation.y,
          z: sector.originalRotation.z
        }, this.config.animationDuration * 0.8)
        .delay(delay)
        .easing(TWEEN.Easing.Back.In)
        .start();
      
      this.tweens.push(positionTween, rotationTween);
    });
  }
  
  /**
   * 清理资源
   */
  dispose() {
    // 停止所有动画
    this.tweens.forEach(tween => tween.stop());
    this.tweens = [];
    
    // 移除扇形段
    this.sectors.forEach(sector => {
      this.parentGroup.remove(sector.mesh);
      sector.mesh.geometry.dispose();
      sector.mesh.material.dispose();
    });
    
    this.sectors = [];
  }
  
  /**
   * 获取爆炸状态
   */
  isExploded() {
    return this.exploded;
  }
}
