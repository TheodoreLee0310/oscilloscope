import * as THREE from 'three';
import * as TWEEN from '@tweenjs/tween.js';
import { CONFIG } from '../configLoader.js';
import { tweenGroup } from '../main.js';
import { SuperellipsePositioner } from '../utils/SuperellipsePositioner.js';
import { unifiedComponentMaterial } from '../materials/UnifiedComponentMaterial.js';

/**
 * 超椭圆爆炸分解效果类
 * 将超椭圆模型分解成4个象限分块，模拟积木组装/分解效果
 */
export class SuperellipseExplodeEffect {
  /**
   * 构造函数
   * @param {THREE.Mesh} superellipseMesh - 超椭圆网格对象
   * @param {THREE.Group} parentGroup - 父级组对象
   */
  constructor(superellipseMesh, parentGroup) {
    this.originalMesh = superellipseMesh;
    this.parentGroup = parentGroup;
    this.exploded = false;
    this.blocks = [];
    this.tweens = [];
    this.originalVisible = superellipseMesh.visible;
    
    // 分解参数
    this.config = {
      // 分解距离系数
      explodeDistance: 2.0,
      // 动画持续时间 - 与其他组件保持一致
      animationDuration: 1200
    };
    
    this.createBlocks();
    
    // 初始化位置器
    this.positioner = new SuperellipsePositioner(this);
  }
  
  /**
   * 创建分块
   */
  createBlocks() {
    // 获取原始几何体
    const originalGeometry = this.originalMesh.geometry;
    
    // 使用统一组件材质管理器获取爆炸材质
    const blockMaterial = unifiedComponentMaterial.getMaterial('exploded');
    
    // 创建4个象限分块
    for (let i = 0; i < 4; i++) {
      const block = this.createQuadrantBlock(originalGeometry, blockMaterial, i);
      
      // 设置初始位置和旋转
      block.position.copy(this.originalMesh.position);
      block.rotation.copy(this.originalMesh.rotation);
      
      // 初始时隐藏积木块
      block.visible = false;
      
      // 计算象限的中心角度（用于分解方向）
      const centerAngle = i * Math.PI / 2 + Math.PI / 4; // 每个象限的中心角度
      
      this.blocks.push({
        mesh: block,
        originalPosition: block.position.clone(),
        originalRotation: block.rotation.clone(),
        quadrantIndex: i,
        centerAngle: centerAngle
      });
      
      this.parentGroup.add(block);
    }
  }
  
  /**
   * 创建象限分块
   * @param {THREE.BufferGeometry} originalGeometry - 原始几何体
   * @param {THREE.Material} material - 材质
   * @param {number} quadrantIndex - 象限索引 (0-3)
   */
  createQuadrantBlock(originalGeometry, material, quadrantIndex) {
    // 获取原始几何体的顶点数据
    const positions = originalGeometry.attributes.position.array;
    const normals = originalGeometry.attributes.normal ? originalGeometry.attributes.normal.array : null;
    const uvs = originalGeometry.attributes.uv ? originalGeometry.attributes.uv.array : null;
    const indices = originalGeometry.index ? originalGeometry.index.array : null;
    
    // 创建新的几何体数据数组
    const newVertices = [];
    const newNormals = [];
    const newUvs = [];
    const newIndices = [];
    const vertexMap = new Map(); // 用于映射旧顶点索引到新顶点索引
    
    // 计算实际几何体边界框
    const boundingBox = this.calculateGeometryBoundingBox(originalGeometry);
    
    // 定义基于实际边界的象限边界
    const quadrantBounds = this.getQuadrantBoundsWithGeometry(quadrantIndex, boundingBox);
    
    // 处理顶点数据
    if (indices) {
      // 有索引的几何体
      for (let i = 0; i < indices.length; i += 3) {
        const triangleVertices = [];
        const triangleInQuadrant = [];
        
        // 检查三角形的每个顶点
        for (let j = 0; j < 3; j++) {
          const vertexIndex = indices[i + j];
          const x = positions[vertexIndex * 3];
          const y = positions[vertexIndex * 3 + 1];
          
          triangleVertices.push({ index: vertexIndex, x, y });
          triangleInQuadrant.push(this.isPointInQuadrant(x, y, quadrantBounds));
        }
        
        // 更智能的三角形分配：基于三角形重心来决定归属
        const triangleCenter = this.calculateTriangleCenter(triangleVertices);
        const triangleBelongsToQuadrant = this.isPointInQuadrant(
          triangleCenter.x, 
          triangleCenter.y, 
          quadrantBounds
        );
        
        // 如果三角形重心在当前象限，或者所有顶点都在象限边界上，则包含整个三角形
        if (triangleBelongsToQuadrant || triangleInQuadrant.every(inQuadrant => inQuadrant)) {
          for (let j = 0; j < 3; j++) {
            const vertex = triangleVertices[j];
            const oldIndex = vertex.index;
            
            if (!vertexMap.has(oldIndex)) {
              // 添加新顶点
              const newIndex = newVertices.length / 3;
              vertexMap.set(oldIndex, newIndex);
              
              // 复制顶点位置
              newVertices.push(
                positions[oldIndex * 3],
                positions[oldIndex * 3 + 1],
                positions[oldIndex * 3 + 2]
              );
              
              // 复制法向量
              if (normals) {
                newNormals.push(
                  normals[oldIndex * 3],
                  normals[oldIndex * 3 + 1],
                  normals[oldIndex * 3 + 2]
                );
              }
              
              // 复制UV坐标
              if (uvs) {
                newUvs.push(
                  uvs[oldIndex * 2],
                  uvs[oldIndex * 2 + 1]
                );
              }
            }
            
            newIndices.push(vertexMap.get(oldIndex));
          }
        }
      }
    } else {
      // 无索引的几何体
      for (let i = 0; i < positions.length; i += 9) { // 每个三角形3个顶点，每个顶点3个坐标
        const triangleInQuadrant = [];
        
        // 检查三角形的每个顶点
        for (let j = 0; j < 3; j++) {
          const x = positions[i + j * 3];
          const y = positions[i + j * 3 + 1];
          triangleInQuadrant.push(this.isPointInQuadrant(x, y, quadrantBounds));
        }
        
        // 如果三角形的任何顶点在当前象限，则包含整个三角形
        if (triangleInQuadrant.some(inQuadrant => inQuadrant)) {
          for (let j = 0; j < 3; j++) {
            const baseIdx = i + j * 3;
            
            // 复制顶点位置
            newVertices.push(
              positions[baseIdx],
              positions[baseIdx + 1],
              positions[baseIdx + 2]
            );
            
            // 复制法向量
            if (normals) {
              newNormals.push(
                normals[baseIdx],
                normals[baseIdx + 1],
                normals[baseIdx + 2]
              );
            }
            
            // 复制UV坐标
            if (uvs) {
              const uvIdx = (i / 3) * 2 + j * 2; // UV索引计算
              newUvs.push(
                uvs[uvIdx],
                uvs[uvIdx + 1]
              );
            }
          }
        }
      }
    }
    
    // 创建新的几何体
    const blockGeometry = new THREE.BufferGeometry();
    
    if (newVertices.length > 0) {
      blockGeometry.setAttribute('position', new THREE.Float32BufferAttribute(newVertices, 3));
      
      if (newNormals.length > 0) {
        blockGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(newNormals, 3));
      }
      
      if (newUvs.length > 0) {
        blockGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(newUvs, 2));
      }
      
      if (newIndices.length > 0) {
        blockGeometry.setIndex(newIndices);
      }
      
      // 计算边界盒和法向量
      blockGeometry.computeBoundingBox();
      if (newNormals.length === 0) {
        blockGeometry.computeVertexNormals();
      }
    } else {
      // 如果没有顶点，创建一个简单的占位几何体
      console.warn(`Quadrant ${quadrantIndex} has no vertices, creating placeholder geometry`);
      const planeGeometry = new THREE.PlaneGeometry(0.1, 0.1);
      blockGeometry.copy(planeGeometry);
    }
    
    // 创建网格
    const mesh = new THREE.Mesh(blockGeometry, material);
    
    return mesh;
  }
  
  /**
   * 计算几何体边界框
   * @param {THREE.BufferGeometry} geometry - 几何体
   */
  calculateGeometryBoundingBox(geometry) {
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    
    return {
      minX: box.min.x,
      maxX: box.max.x,
      minY: box.min.y,
      maxY: box.max.y,
      minZ: box.min.z,
      maxZ: box.max.z,
      centerX: (box.min.x + box.max.x) / 2,
      centerY: (box.min.y + box.max.y) / 2,
      centerZ: (box.min.z + box.max.z) / 2
    };
  }

  /**
   * 获取基于实际几何体的象限边界
   * @param {number} quadrantIndex - 象限索引 (0-3)
   * @param {Object} boundingBox - 几何体边界框
   */
  getQuadrantBoundsWithGeometry(quadrantIndex, boundingBox) {
    const { centerX, centerY, minX, maxX, minY, maxY } = boundingBox;
    
    switch (quadrantIndex) {
      case 0: // 第一象限 (+x, +y) - 右上
        return { 
          minX: centerX, maxX: maxX, 
          minY: centerY, maxY: maxY 
        };
      case 1: // 第二象限 (-x, +y) - 左上
        return { 
          minX: minX, maxX: centerX, 
          minY: centerY, maxY: maxY 
        };
      case 2: // 第三象限 (-x, -y) - 左下
        return { 
          minX: minX, maxX: centerX, 
          minY: minY, maxY: centerY 
        };
      case 3: // 第四象限 (+x, -y) - 右下
        return { 
          minX: centerX, maxX: maxX, 
          minY: minY, maxY: centerY 
        };
      default:
        return { 
          minX: minX, maxX: maxX, 
          minY: minY, maxY: maxY 
        };
    }
  }

  /**
   * 获取象限边界（旧版本，保留用于兼容）
   * @param {number} quadrantIndex - 象限索引 (0-3)
   */
  getQuadrantBounds(quadrantIndex) {
    switch (quadrantIndex) {
      case 0: // 第一象限 (+x, +y)
        return { minX: 0, maxX: Infinity, minY: 0, maxY: Infinity };
      case 1: // 第二象限 (-x, +y)
        return { minX: -Infinity, maxX: 0, minY: 0, maxY: Infinity };
      case 2: // 第三象限 (-x, -y)
        return { minX: -Infinity, maxX: 0, minY: -Infinity, maxY: 0 };
      case 3: // 第四象限 (+x, -y)
        return { minX: 0, maxX: Infinity, minY: -Infinity, maxY: 0 };
      default:
        return { minX: -Infinity, maxX: Infinity, minY: -Infinity, maxY: Infinity };
    }
  }
  
  /**
   * 计算三角形重心
   * @param {Array} triangleVertices - 三角形顶点数组
   */
  calculateTriangleCenter(triangleVertices) {
    const centerX = (triangleVertices[0].x + triangleVertices[1].x + triangleVertices[2].x) / 3;
    const centerY = (triangleVertices[0].y + triangleVertices[1].y + triangleVertices[2].y) / 3;
    
    return { x: centerX, y: centerY };
  }

  /**
   * 检查点是否在指定象限内
   * @param {number} x - X坐标
   * @param {number} y - Y坐标
   * @param {Object} bounds - 象限边界
   */
  isPointInQuadrant(x, y, bounds) {
    return x >= bounds.minX && x <= bounds.maxX && 
           y >= bounds.minY && y <= bounds.maxY;
  }
  
  /**
   * 计算基于几何体尺寸的分解位置
   */
  calculateExplodedPosition(block) {
    // 使用固定的分解位置坐标
    const offsets = [
      { x: 1, y: 1.5, z: 1 },    // 第一象限
      { x: 1, y: -2.5, z: 1 },   // 第二象限
      { x: 1, y: -2.5, z: -1 },  // 第三象限
      { x: 1, y: 1.5, z: -1 }    // 第四象限
    ];
    
    // 确保索引有效
    if (block.quadrantIndex >= 0 && block.quadrantIndex < offsets.length) {
      const offset = offsets[block.quadrantIndex];
      return {
        x: block.originalPosition.x + offset.x,
        y: block.originalPosition.y + offset.y,
        z: block.originalPosition.z + offset.z
      };
    }
    
    // 回退到原始位置
    return block.originalPosition;
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
    this.animateBlocks(true); // true表示分解
  }
  
  /**
   * 组装积木块
   */
  assembleBlocks() {
    this.animateBlocks(false); // false表示组装
  }
  
  /**
   * 统一的动画处理函数
   * @param {boolean} explode - true为分解，false为组装
   */
  animateBlocks(explode) {
    let completedAnimations = 0;
    const totalAnimations = this.blocks.length;
    
    this.blocks.forEach((block, index) => {
      // 显示或隐藏积木块的逻辑
      if (explode) {
        block.mesh.visible = true;
      }
      
      // 计算目标位置和旋转
      const targetPosition = explode 
        ? this.calculateExplodedPosition(block) 
        : block.originalPosition;
      const targetRotation = block.originalRotation;
      
      // 统一延迟时间：分解使用100ms间隔
      const delay = explode ? index * 100 : (this.blocks.length - index - 1) * 80;
      
      // 统一动画持续时间：合并动画更快
      const duration = explode ? this.config.animationDuration : this.config.animationDuration * 0.8;
      
      // 统一缓动函数：分解用Back.Out，合并用Back.In
      const easing = explode ? TWEEN.Easing.Back.Out : TWEEN.Easing.Back.In;
      
      // 创建位置动画
      const positionTween = new TWEEN.Tween(block.mesh.position, tweenGroup)
        .to({
          x: targetPosition.x,
          y: targetPosition.y,
          z: targetPosition.z
        }, duration)
        .delay(delay)
        .easing(easing)
        .onComplete(() => {
          if (!explode) {
            completedAnimations++;
            // 组装完成后的处理
            if (completedAnimations === totalAnimations) {
              this.blocks.forEach(b => b.mesh.visible = false);
              this.originalMesh.visible = this.originalVisible;
              console.log('超椭圆组装完成，显示原始网格');
            }
          }
        })
        .start();
      
      // 创建旋转动画
      const rotationTween = new TWEEN.Tween(block.mesh.rotation, tweenGroup)
        .to({
          x: targetRotation.x,
          y: targetRotation.y,
          z: targetRotation.z
        }, duration)
        .delay(delay)
        .easing(easing)
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
    
    // 移除积木块
    this.blocks.forEach(block => {
      this.parentGroup.remove(block.mesh);
      block.mesh.geometry.dispose();
      // 材质可能是共享的，不直接dispose
      if (block.mesh.material !== this.originalMesh.material) {
        block.mesh.material.dispose();
      }
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
