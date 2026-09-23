import * as THREE from 'three';

/**
 * 超椭圆子网格批量定位器
 * 专门用于将SuperellipseExplodeEffect分解后的子网格按给定坐标批量定位
 */
export class SuperellipsePositioner {
  /**
   * 构造函数
   * @param {SuperellipseExplodeEffect} explodeEffect - 超椭圆爆炸效果实例
   */
  constructor(explodeEffect) {
    this.explodeEffect = explodeEffect;
    this.originalPositions = new Map(); // 存储原始位置
    this.isPositioned = false;
    
    this.saveOriginalPositions();
  }
  
  /**
   * 保存原始位置
   */
  saveOriginalPositions() {
    this.explodeEffect.blocks.forEach((block, index) => {
      this.originalPositions.set(index, {
        x: block.mesh.position.x,
        y: block.mesh.position.y,
        z: block.mesh.position.z
      });
    });
  }
  
  /**
   * 批量设置子网格位置
   * @param {Array} positions - 位置数组，每个元素包含 {x, y, z} 坐标
   *                           数组长度应与子网格数量匹配
   */
  setPositions(positions) {
    if (!Array.isArray(positions)) {
      console.warn('SuperellipsePositioner: positions 必须是数组');
      return;
    }
    
    if (positions.length !== this.explodeEffect.blocks.length) {
      console.warn(`SuperellipsePositioner: 位置数组长度 (${positions.length}) 与子网格数量 (${this.explodeEffect.blocks.length}) 不匹配`);
      return;
    }
    
    // 确保子网格处于分解状态并可见
    if (!this.explodeEffect.exploded) {
      this.explodeEffect.toggle(true);
    }
    
    // 停止任何正在进行的动画
    this.explodeEffect.tweens.forEach(tween => tween.stop());
    this.explodeEffect.tweens = [];
    
    // 批量设置位置
    positions.forEach((position, index) => {
      if (index < this.explodeEffect.blocks.length) {
        const block = this.explodeEffect.blocks[index];
        
        // 验证位置对象
        if (typeof position === 'object' && position !== null) {
          if (typeof position.x === 'number') block.mesh.position.x = position.x;
          if (typeof position.y === 'number') block.mesh.position.y = position.y;
          if (typeof position.z === 'number') block.mesh.position.z = position.z;
        }
      }
    });
    
    this.isPositioned = true;
  }
  
  /**
   * 设置单个子网格位置
   * @param {number} index - 子网格索引 (0-3)
   * @param {Object} position - 位置对象 {x, y, z}
   */
  setPosition(index, position) {
    if (index < 0 || index >= this.explodeEffect.blocks.length) {
      console.warn(`SuperellipsePositioner: 索引 ${index} 超出范围 (0-${this.explodeEffect.blocks.length - 1})`);
      return;
    }
    
    if (typeof position !== 'object' || position === null) {
      console.warn('SuperellipsePositioner: position 必须是对象');
      return;
    }
    
    // 确保子网格处于分解状态并可见
    if (!this.explodeEffect.exploded) {
      this.explodeEffect.toggle(true);
    }
    
    const block = this.explodeEffect.blocks[index];
    if (typeof position.x === 'number') block.mesh.position.x = position.x;
    if (typeof position.y === 'number') block.mesh.position.y = position.y;
    if (typeof position.z === 'number') block.mesh.position.z = position.z;
    
    this.isPositioned = true;
  }
  
  /**
   * 获取所有子网格的当前位置
   * @returns {Array} 位置数组
   */
  getPositions() {
    return this.explodeEffect.blocks.map(block => ({
      x: block.mesh.position.x,
      y: block.mesh.position.y,
      z: block.mesh.position.z
    }));
  }
  
  /**
   * 获取指定子网格的位置
   * @param {number} index - 子网格索引
   * @returns {Object|null} 位置对象或null
   */
  getPosition(index) {
    if (index < 0 || index >= this.explodeEffect.blocks.length) {
      console.warn(`SuperellipsePositioner: 索引 ${index} 超出范围`);
      return null;
    }
    
    const block = this.explodeEffect.blocks[index];
    return {
      x: block.mesh.position.x,
      y: block.mesh.position.y,
      z: block.mesh.position.z
    };
  }
  
  /**
   * 恢复到原始位置
   */
  restoreOriginalPositions() {
    this.explodeEffect.blocks.forEach((block, index) => {
      const originalPos = this.originalPositions.get(index);
      if (originalPos) {
        block.mesh.position.set(originalPos.x, originalPos.y, originalPos.z);
      }
    });
    
    this.isPositioned = false;
  }
  
  /**
   * 应用位置偏移
   * @param {Object} offset - 偏移量 {x, y, z}
   */
  applyOffset(offset) {
    if (typeof offset !== 'object' || offset === null) {
      console.warn('SuperellipsePositioner: offset 必须是对象');
      return;
    }
    
    const offsetX = typeof offset.x === 'number' ? offset.x : 0;
    const offsetY = typeof offset.y === 'number' ? offset.y : 0;
    const offsetZ = typeof offset.z === 'number' ? offset.z : 0;
    
    this.explodeEffect.blocks.forEach(block => {
      block.mesh.position.x += offsetX;
      block.mesh.position.y += offsetY;
      block.mesh.position.z += offsetZ;
    });
  }
  
  /**
   * 重置所有子网格到爆炸效果的默认分解位置
   */
  resetToExplodedPositions() {
    this.explodeEffect.blocks.forEach(block => {
      const explodedPos = this.explodeEffect.calculateExplodedPosition(block);
      block.mesh.position.copy(explodedPos);
    });
    
    this.isPositioned = false;
  }
  
  /**
   * 获取子网格数量
   * @returns {number} 子网格数量
   */
  getBlockCount() {
    return this.explodeEffect.blocks.length;
  }
  
  /**
   * 检查是否已经应用了自定义定位
   * @returns {boolean} 是否已定位
   */
  isCustomPositioned() {
    return this.isPositioned;
  }
}
