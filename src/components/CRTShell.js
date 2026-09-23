import * as THREE from 'three';
import { CONFIG } from '../configLoader';
import { CylinderConnection } from './CylinderConnection.js';
import { SuperellipseTransition } from './SuperellipseTransition.js';
import { Cylinder2ExplodeEffect } from './Cylinder2ExplodeEffect.js';
import { RotationCurveExplodeEffect } from './RotationCurveExplodeEffect.js';
import { SuperellipseExplodeEffect } from './SuperellipseExplodeEffect.js';
import { unifiedComponentMaterial } from '../materials/UnifiedComponentMaterial.js';

/**
 * CRT正方形透明外壳组件
 * 用于包裹整个CRT模型的透明保护壳
 */
export class CRTShell {
  constructor() {
    this.shellGroup = new THREE.Group();
    this.shellGroup.name = 'CRTShell';
    
    // 创建两个圆柱体的材质
    this.cylinder1Material = null;
    this.cylinder2Material = null;
    
    // 旋转曲线连接
    this.cylinderConnection = null;
    
    // 超椭圆形状渐变
    this.superellipseTransition = null;
    
    // cylinder2爆炸效果
    this.cylinder2ExplodeEffect = null;
    
    // 旋转曲线连接爆炸效果
    this.rotationCurveExplodeEffect = null;
    
    // 超椭圆形状渐变爆炸效果
    this.superellipseExplodeEffect = null;
    
    this.createShell();
  }

  /**
   * 创建正方形透明外壳（删除靠近荧光屏的右侧面）
   */
  createShell() {
    // 立方体外壳材质已删除，不再需要
    // this.shellMaterial = new THREE.MeshPhongMaterial({
    //   transparent: true,
    //   opacity: CONFIG.shell.opacity,
    //   side: THREE.DoubleSide,
    //   depthWrite: false
    // });

    // 立方体外壳已被删除 - 只保留圆柱体和过渡效果
    // const shellGeometry = this.createOpenBoxGeometry(
    //   CONFIG.shell.size.width,
    //   CONFIG.shell.size.height,
    //   CONFIG.shell.size.depth
    // );
    // const shell = new THREE.Mesh(shellGeometry, this.shellMaterial);
    // 
    // // 设置位置居中
    // shell.position.set(4.5, 0, 0); // 稍微向前偏移以居中包裹CRT
    // 
    // this.shellGroup.add(shell);
    
    // 创建两个独立的圆柱体
    this.createCylinder1();
    this.createCylinder2();
    
    // 创建旋转曲线连接
    this.createRotationCurveConnection();
    
    // 创建超椭圆形状渐变
    this.createSuperellipseTransition();
    
    // 设置初始可见性
    this.shellGroup.visible = CONFIG.shell.visible;
  }

  /**
   * 创建开放式盒子几何体（去掉右侧面，即X正方向的面）
   * @param {number} width - 宽度
   * @param {number} height - 高度 
   * @param {number} depth - 深度
   * @returns {THREE.BufferGeometry} 几何体
   */
  createOpenBoxGeometry(width, height, depth) {
    const geometry = new THREE.BufferGeometry();
    
    const w = width / 2;
    const h = height / 2;
    const d = depth / 2;
    
    // 定义顶点位置 - 立方体的8个顶点
    const vertices = [
      // 左侧面 (X = -w)
      -w, -h, -d,  -w, -h,  d,  -w,  h,  d,
      -w, -h, -d,  -w,  h,  d,  -w,  h, -d,
      
      // 右侧面被删除 - 不添加这个面
      
      // 顶面 (Y = h)
      -w,  h, -d,  -w,  h,  d,   w,  h,  d,
      -w,  h, -d,   w,  h,  d,   w,  h, -d,
      
      // 底面 (Y = -h)
      -w, -h, -d,   w, -h, -d,   w, -h,  d,
      -w, -h, -d,   w, -h,  d,  -w, -h,  d,
      
      // 前面 (Z = d)
      -w, -h,  d,   w, -h,  d,   w,  h,  d,
      -w, -h,  d,   w,  h,  d,  -w,  h,  d,
      
      // 后面 (Z = -d)
      -w, -h, -d,  -w,  h, -d,   w,  h, -d,
      -w, -h, -d,   w,  h, -d,   w, -h, -d
    ];
    
    // 定义法向量
    const normals = [
      // 左侧面
      -1, 0, 0,  -1, 0, 0,  -1, 0, 0,
      -1, 0, 0,  -1, 0, 0,  -1, 0, 0,
      
      // 顶面
      0, 1, 0,  0, 1, 0,  0, 1, 0,
      0, 1, 0,  0, 1, 0,  0, 1, 0,
      
      // 底面
      0, -1, 0,  0, -1, 0,  0, -1, 0,
      0, -1, 0,  0, -1, 0,  0, -1, 0,
      
      // 前面
      0, 0, 1,  0, 0, 1,  0, 0, 1,
      0, 0, 1,  0, 0, 1,  0, 0, 1,
      
      // 后面
      0, 0, -1,  0, 0, -1,  0, 0, -1,
      0, 0, -1,  0, 0, -1,  0, 0, -1
    ];
    
    // 定义UV坐标
    const uvs = [
      // 左侧面
      0, 0,  1, 0,  1, 1,
      0, 0,  1, 1,  0, 1,
      
      // 顶面
      0, 0,  1, 0,  1, 1,
      0, 0,  1, 1,  0, 1,
      
      // 底面
      0, 0,  1, 0,  1, 1,
      0, 0,  1, 1,  0, 1,
      
      // 前面
      0, 0,  1, 0,  1, 1,
      0, 0,  1, 1,  0, 1,
      
      // 后面
      0, 0,  1, 0,  1, 1,
      0, 0,  1, 1,  0, 1
    ];
    
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    
    return geometry;
  }

  /**
   * 创建开放式圆柱体几何体（沿X轴方向，去掉右端圆形面）
   * @param {number} radius - 圆柱体半径
   * @param {number} height - 圆柱体长度（沿X轴）
   * @param {number} radialSegments - 径向分段数
   * @returns {THREE.BufferGeometry} 几何体
   */
  createOpenCylinderGeometry(radius, height, radialSegments = 32) {
    // 使用Three.js标准圆柱体几何体作为基础，确保法向量和光照计算正确
    // 注意：openEnded设为false，这样两端都有封闭面，然后我们手动移除右端面
    const baseGeometry = new THREE.CylinderGeometry(radius, radius, height, radialSegments, 1, false);
    
    // 旋转90度使圆柱体沿X轴方向
    baseGeometry.rotateZ(Math.PI / 2);
    
    // 获取几何体属性
    const positions = baseGeometry.getAttribute('position');
    const normals = baseGeometry.getAttribute('normal');
    const uvs = baseGeometry.getAttribute('uv');
    const indices = baseGeometry.getIndex();
    
    // 创建新的几何体，只保留侧面和左端面
    const newGeometry = new THREE.BufferGeometry();
    
    // 复制侧面顶点（Three.js圆柱体的侧面已经有正确的法向量）
    const newPositions = [];
    const newNormals = [];
    const newUvs = [];
    const newIndices = [];
    
    const posArray = positions.array;
    const normArray = normals.array;
    const uvArray = uvs.array;
    const indexArray = indices.array;
    
    // 复制所有顶点和法向量（Three.js已经计算好了）
    for (let i = 0; i < posArray.length; i += 3) {
      newPositions.push(posArray[i], posArray[i + 1], posArray[i + 2]);
      newNormals.push(normArray[i], normArray[i + 1], normArray[i + 2]);
    }
    
    for (let i = 0; i < uvArray.length; i += 2) {
      newUvs.push(uvArray[i], uvArray[i + 1]);
    }
    
    // 过滤索引，只保留侧面和左端面，去掉右端面
    const halfHeight = height / 2;
    for (let i = 0; i < indexArray.length; i += 3) {
      const i1 = indexArray[i] * 3;
      const i2 = indexArray[i + 1] * 3;
      const i3 = indexArray[i + 2] * 3;
      
      // 检查三角形是否在右端面（X > halfHeight - 0.01）
      const x1 = posArray[i1];
      const x2 = posArray[i2];
      const x3 = posArray[i3];
      
      // 如果三角形不在右端面，则保留
      if (!(x1 > halfHeight - 0.01 && x2 > halfHeight - 0.01 && x3 > halfHeight - 0.01)) {
        newIndices.push(indexArray[i], indexArray[i + 1], indexArray[i + 2]);
      }
    }
    
    // 设置几何体属性
    newGeometry.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
    newGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(newNormals, 3));
    newGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(newUvs, 2));
    newGeometry.setIndex(newIndices);
    
    // 重新计算法向量以确保光照正确
    newGeometry.computeVertexNormals();
    
    return newGeometry;
  }

  /**
   * 创建第一个圆柱体组件
   */
  createCylinder1() {
    const config = CONFIG.shell.cylinder1;
    
    // 使用统一组件材质管理器获取标准材质，确保颜色一致性
    this.cylinder1Material = unifiedComponentMaterial.getMaterial('standard');
    
    // 创建圆柱体几何体（使用独立的半径参数）
    const cylinder1Geometry = new THREE.CylinderGeometry(config.radius, config.radius, config.height, 32);
    const cylinder1 = new THREE.Mesh(cylinder1Geometry, this.cylinder1Material);
    
    // 设置圆柱体位置和旋转
    cylinder1.position.set(config.position.x, config.position.y, config.position.z);
    cylinder1.rotation.set(config.rotation.x, config.rotation.y, config.rotation.z);
    
    // 设置可见性
    cylinder1.visible = config.visible;
    
    // 添加到组中
    this.shellGroup.add(cylinder1);
    
    // 保存圆柱体引用以便后续操作
    this.cylinder1 = cylinder1;
  }

  /**
   * 创建第二个圆柱体组件（去掉右侧圆形面）
   */
  createCylinder2() {
    const config = CONFIG.shell.cylinder2;
    
    // 使用统一组件材质管理器获取标准材质，确保颜色一致性
    this.cylinder2Material = unifiedComponentMaterial.getMaterial('standard');
    
    // 创建开放式圆柱体几何体（去掉右侧圆形面）
    const cylinder2Geometry = this.createOpenCylinderGeometry(config.radius, config.height, 32);
    const cylinder2 = new THREE.Mesh(cylinder2Geometry, this.cylinder2Material);
    
    // 设置圆柱体位置和旋转
    cylinder2.position.set(config.position.x, config.position.y, config.position.z);
    cylinder2.rotation.set(config.rotation.x, config.rotation.y, config.rotation.z);
    
    // 设置可见性
    cylinder2.visible = config.visible;
    
    // 添加到组中
    this.shellGroup.add(cylinder2);
    
    // 保存圆柱体引用以便后续操作
    this.cylinder2 = cylinder2;
    
    // 创建cylinder2的爆炸效果
    this.createCylinder2ExplodeEffect();
  }

  /**
   * 创建旋转曲线连接
   */
  createRotationCurveConnection() {
    const config = CONFIG.shell.rotationCurveConnection;
    
    if (!config || !config.visible) {
      return;
    }
    
    
    // 创建圆柱体连接
    this.cylinderConnection = new CylinderConnection(
      CONFIG.shell.cylinder1,
      CONFIG.shell.cylinder2,
      config
    );
    
    // 添加到组中
    this.shellGroup.add(this.cylinderConnection.getConnection());
    
    // 创建旋转曲线连接爆炸效果
    this.createConnectionExplodeEffect();
  }

  /**
   * 创建超椭圆形状渐变
   */
  createSuperellipseTransition() {
    const config = CONFIG.shell.superellipseTransition;
    
    if (!config || !config.visible) {
      return;
    }
    
    
    // 准备起始配置（第一个圆柱体）
    const startConfig = {
      position: CONFIG.shell.cylinder1.position,
      radius: CONFIG.shell.cylinder1.radius
    };
    
    // 准备结束配置（适配荧光屏尺寸）
    const endConfig = {
      position: { x: 4.5, y: 0, z: 0 }, // 立方体中心位置
      size: {
        width: CONFIG.components.screen.width,   // 荧光屏宽度：4
        height: CONFIG.components.screen.height, // 荧光屏高度：3
        depth: CONFIG.shell.size.depth           // 保持原深度：4
      }
    };
    
    // 创建形状渐变
    this.superellipseTransition = new SuperellipseTransition(
      startConfig,
      endConfig,
      config
    );
    
    // 添加到组中
    this.shellGroup.add(this.superellipseTransition.getTransition());
    
    // 创建超椭圆形状渐变爆炸效果
    this.createSuperellipseExplodeEffect();
  }

  /**
   * 创建旋转曲线连接爆炸效果
   */
  createConnectionExplodeEffect() {
    if (!this.cylinderConnection) {
      console.warn('CylinderConnection not found, cannot create explode effect');
      return;
    }
    
    // 清理旧的爆炸效果实例
    if (this.rotationCurveExplodeEffect) {
      this.rotationCurveExplodeEffect.dispose();
      this.rotationCurveExplodeEffect = null;
    }
    
    // 获取连接网格（第一个连接网格）
    const connectionMeshes = this.cylinderConnection.connectionMeshes;
    if (!connectionMeshes || connectionMeshes.length === 0) {
      console.warn('No connection meshes found');
      return;
    }
    
    // 创建爆炸效果实例
    this.rotationCurveExplodeEffect = new RotationCurveExplodeEffect(
      connectionMeshes[0], // 使用第一个连接网格
      this.shellGroup
    );
  }

  /**
   * 创建cylinder2爆炸效果
   */
  createCylinder2ExplodeEffect() {
    if (!this.cylinder2) {
      console.warn('Cylinder2 not found, cannot create explode effect');
      return;
    }
    
    // 清理旧的爆炸效果实例
    if (this.cylinder2ExplodeEffect) {
      this.cylinder2ExplodeEffect.dispose();
      this.cylinder2ExplodeEffect = null;
    }
    
    // 创建爆炸效果实例
    this.cylinder2ExplodeEffect = new Cylinder2ExplodeEffect(
      this.cylinder2,
      this.shellGroup
    );
  }

  /**
   * 创建超椭圆形状渐变爆炸效果
   */
  createSuperellipseExplodeEffect() {
    if (!this.superellipseTransition) {
      console.warn('SuperellipseTransition not found, cannot create explode effect');
      return;
    }
    
    // 清理旧的爆炸效果实例
    if (this.superellipseExplodeEffect) {
      this.superellipseExplodeEffect.dispose();
      this.superellipseExplodeEffect = null;
    }
    
    // 获取超椭圆的网格（第一个网格）
    const transitionMeshes = this.superellipseTransition.meshes;
    if (!transitionMeshes || transitionMeshes.length === 0) {
      console.warn('No superellipse meshes found');
      return;
    }
    
    // 创建爆炸效果实例
    this.superellipseExplodeEffect = new SuperellipseExplodeEffect(
      transitionMeshes[0], // 使用第一个网格
      this.shellGroup
    );
  }

  /**
   * 切换cylinder2爆炸效果
   * @param {boolean} explode - 是否爆炸，默认为切换状态
   * @returns {boolean} 当前爆炸状态
   */
  toggleCylinder2Explode(explode) {
    if (!this.cylinder2ExplodeEffect) {
      console.warn('Cylinder2 explode effect not initialized');
      return false;
    }
    
    return this.cylinder2ExplodeEffect.toggle(explode);
  }

  /**
   * 获取cylinder2爆炸状态
   * @returns {boolean} 是否处于爆炸状态
   */
  isCylinder2Exploded() {
    return this.cylinder2ExplodeEffect ? this.cylinder2ExplodeEffect.isExploded() : false;
  }

  /**
   * 切换旋转曲线连接爆炸效果
   * @param {boolean} explode - 是否爆炸，默认为切换状态
   * @returns {boolean} 当前爆炸状态
   */
  toggleConnectionExplode(explode) {
    if (!this.rotationCurveExplodeEffect) {
      console.warn('RotationCurve explode effect not initialized');
      return false;
    }
    
    return this.rotationCurveExplodeEffect.toggle(explode);
  }

  /**
   * 获取旋转曲线连接爆炸状态
   * @returns {boolean} 是否处于爆炸状态
   */
  isConnectionExploded() {
    return this.rotationCurveExplodeEffect ? this.rotationCurveExplodeEffect.isExploded() : false;
  }

  /**
   * 切换超椭圆形状渐变爆炸效果
   * @param {boolean} explode - 是否爆炸，默认为切换状态
   * @returns {boolean} 当前爆炸状态
   */
  toggleSuperellipseExplode(explode) {
    if (!this.superellipseExplodeEffect) {
      console.warn('Superellipse explode effect not initialized');
      return false;
    }
    
    return this.superellipseExplodeEffect.toggle(explode);
  }

  /**
   * 获取超椭圆形状渐变爆炸状态
   * @returns {boolean} 是否处于爆炸状态
   */
  isSuperellipseExploded() {
    return this.superellipseExplodeEffect ? this.superellipseExplodeEffect.isExploded() : false;
  }

  /**
   * 获取外壳组
   */
  getShell() {
    return this.shellGroup;
  }

  /**
   * 设置外壳可见性
   */
  setVisible(visible) {
    this.shellGroup.visible = visible;
  }

  /**
   * 设置外壳透明度
   */
  setOpacity(opacity) {
    // 立方体外壳已删除，此方法不再有效
    // this.shellMaterial.opacity = Math.max(0, Math.min(1, opacity));
  }


  /**
   * 设置外壳位置
   */
  setPosition(x, y, z) {
    this.shellGroup.position.set(x, y, z);
  }

  /**
   * 设置第一个圆柱体位置
   */
  setCylinder1Position(x, y, z) {
    if (this.cylinder1) {
      this.cylinder1.position.set(x, y, z);
    }
  }

  /**
   * 设置第二个圆柱体位置
   */
  setCylinder2Position(x, y, z) {
    if (this.cylinder2) {
      this.cylinder2.position.set(x, y, z);
    }
  }

  /**
   * 获取外壳当前位置
   */
  getPosition() {
    return this.shellGroup.position.clone();
  }

  /**
   * 更新动画 - 外壳设置为静态，无动画效果
   */
  update(deltaTime) {
    // 外壳保持静态，不进行任何动画更新
    // 如果需要动画效果，可以在这里添加
  }

  /**
   * 更新配置 - 实现响应式配置更新
   */
  updateConfig() {
    // 立方体外壳材质已删除，不再需要更新
    // if (this.shellMaterial) {
    //   this.shellMaterial.opacity = CONFIG.shell.opacity;
    // }
    
    // 更新第一个圆柱体配置
    if (this.cylinder1Material && CONFIG.shell.cylinder1) {
      this.cylinder1Material.color.setHex(parseInt(CONFIG.shell.cylinder1.color));
      this.cylinder1Material.opacity = CONFIG.shell.cylinder1.opacity;
    }
    if (this.cylinder1 && CONFIG.shell.cylinder1) {
      this.cylinder1.visible = CONFIG.shell.cylinder1.visible;
      this.cylinder1.position.set(
        CONFIG.shell.cylinder1.position.x,
        CONFIG.shell.cylinder1.position.y,
        CONFIG.shell.cylinder1.position.z
      );
      this.cylinder1.rotation.set(
        CONFIG.shell.cylinder1.rotation.x,
        CONFIG.shell.cylinder1.rotation.y,
        CONFIG.shell.cylinder1.rotation.z
      );
    }
    
    // 更新第二个圆柱体配置
    if (this.cylinder2Material && CONFIG.shell.cylinder2) {
      this.cylinder2Material.color.setHex(parseInt(CONFIG.shell.cylinder2.color));
      this.cylinder2Material.opacity = CONFIG.shell.cylinder2.opacity;
    }
    if (this.cylinder2 && CONFIG.shell.cylinder2) {
      this.cylinder2.visible = CONFIG.shell.cylinder2.visible;
      this.cylinder2.position.set(
        CONFIG.shell.cylinder2.position.x,
        CONFIG.shell.cylinder2.position.y,
        CONFIG.shell.cylinder2.position.z
      );
      this.cylinder2.rotation.set(
        CONFIG.shell.cylinder2.rotation.x,
        CONFIG.shell.cylinder2.rotation.y,
        CONFIG.shell.cylinder2.rotation.z
      );
    }
    
    // 更新旋转曲线连接配置
    if (this.cylinderConnection && CONFIG.shell.rotationCurveConnection) {
      this.cylinderConnection.updateConfig(
        CONFIG.shell.cylinder1,
        CONFIG.shell.cylinder2,
        CONFIG.shell.rotationCurveConnection
      );
    } else if (!this.cylinderConnection && CONFIG.shell.rotationCurveConnection?.visible) {
      // 如果连接不存在但配置中要求显示，则创建连接
      // 注意：这里不应该重复创建，因为可能导致重复模型
      console.warn('CylinderConnection not found, but config requires it to be visible');
    }
    
    // 更新超椭圆形状渐变配置
    if (this.superellipseTransition && CONFIG.shell.superellipseTransition) {
      const startConfig = {
        position: CONFIG.shell.cylinder1.position,
        radius: CONFIG.shell.cylinder1.radius
      };
      const endConfig = {
        position: { x: 4.5, y: 0, z: 0 },
        size: {
          width: CONFIG.components.screen.width,   // 荧光屏宽度：4
          height: CONFIG.components.screen.height, // 荧光屏高度：3
          depth: CONFIG.shell.size.depth           // 保持原深度：4
        }
      };
      this.superellipseTransition.updateConfig(
        startConfig,
        endConfig,
        CONFIG.shell.superellipseTransition
      );
    } else if (!this.superellipseTransition && CONFIG.shell.superellipseTransition?.visible) {
      // 如果形状渐变不存在但配置中要求显示，则创建渐变
      // 注意：这里不应该重复创建，因为可能导致重复模型
      console.warn('SuperellipseTransition not found, but config requires it to be visible');
    }
    
    // 更新可见性
    this.shellGroup.visible = CONFIG.shell.visible;
  }

  /**
   * 设置第一个圆柱体旋转
   */
  setCylinder1Rotation(x, y, z) {
    if (this.cylinder1) {
      this.cylinder1.rotation.set(x, y, z);
    }
  }

  /**
   * 设置第二个圆柱体旋转
   */
  setCylinder2Rotation(x, y, z) {
    if (this.cylinder2) {
      this.cylinder2.rotation.set(x, y, z);
    }
  }

  /**
   * 获取第一个圆柱体当前旋转
   */
  getCylinder1Rotation() {
    return this.cylinder1 ? this.cylinder1.rotation.clone() : new THREE.Euler();
  }

  /**
   * 获取第二个圆柱体当前旋转
   */
  getCylinder2Rotation() {
    return this.cylinder2 ? this.cylinder2.rotation.clone() : new THREE.Euler();
  }

  /**
   * 设置第一个圆柱体可见性
   */
  setCylinder1Visible(visible) {
    if (this.cylinder1) {
      this.cylinder1.visible = visible;
    }
  }

  /**
   * 设置第二个圆柱体可见性
   */
  setCylinder2Visible(visible) {
    if (this.cylinder2) {
      this.cylinder2.visible = visible;
    }
  }

  /**
   * 设置第一个圆柱体颜色
   */
  setCylinder1Color(color) {
    if (this.cylinder1Material) {
      this.cylinder1Material.color.setHex(color);
    }
  }

  /**
   * 设置第二个圆柱体颜色
   */
  setCylinder2Color(color) {
    if (this.cylinder2Material) {
      this.cylinder2Material.color.setHex(color);
    }
  }

  /**
   * 设置第一个圆柱体透明度
   */
  setCylinder1Opacity(opacity) {
    if (this.cylinder1Material) {
      this.cylinder1Material.opacity = Math.max(0, Math.min(1, opacity));
    }
  }

  /**
   * 设置第二个圆柱体透明度
   */
  setCylinder2Opacity(opacity) {
    if (this.cylinder2Material) {
      this.cylinder2Material.opacity = Math.max(0, Math.min(1, opacity));
    }
  }

  /**
   * 设置旋转曲线连接的位置偏移
   * @param {number} x - X轴偏移
   * @param {number} y - Y轴偏移
   * @param {number} z - Z轴偏移
   */
  setConnectionPositionOffset(x, y, z) {
    if (this.cylinderConnection) {
      this.cylinderConnection.setPositionOffset(x, y, z);
    }
  }

  /**
   * 设置旋转曲线连接的旋转偏移
   * @param {number} x - X轴旋转偏移（弧度）
   * @param {number} y - Y轴旋转偏移（弧度）
   * @param {number} z - Z轴旋转偏移（弧度）
   */
  setConnectionRotationOffset(x, y, z) {
    if (this.cylinderConnection) {
      this.cylinderConnection.setRotationOffset(x, y, z);
    }
  }

  /**
   * 直接设置旋转曲线连接的位置
   * @param {number} x - X坐标
   * @param {number} y - Y坐标
   * @param {number} z - Z坐标
   */
  setConnectionPosition(x, y, z) {
    if (this.cylinderConnection) {
      this.cylinderConnection.setPosition(x, y, z);
    }
  }

  /**
   * 直接设置旋转曲线连接的旋转
   * @param {number} x - X轴旋转（弧度）
   * @param {number} y - Y轴旋转（弧度）
   * @param {number} z - Z轴旋转（弧度）
   */
  setConnectionRotation(x, y, z) {
    if (this.cylinderConnection) {
      this.cylinderConnection.setRotation(x, y, z);
    }
  }

  /**
   * 获取旋转曲线连接的当前位置
   */
  getConnectionPosition() {
    return this.cylinderConnection ? this.cylinderConnection.getPosition() : new THREE.Vector3();
  }

  /**
   * 获取旋转曲线连接的当前旋转
   */
  getConnectionRotation() {
    return this.cylinderConnection ? this.cylinderConnection.getRotation() : new THREE.Euler();
  }

  /**
   * 获取旋转曲线连接的位置偏移
   */
  getConnectionPositionOffset() {
    return this.cylinderConnection ? this.cylinderConnection.getPositionOffset() : { x: 0, y: 0, z: 0 };
  }

  /**
   * 获取旋转曲线连接的旋转偏移
   */
  getConnectionRotationOffset() {
    return this.cylinderConnection ? this.cylinderConnection.getRotationOffset() : { x: 0, y: 0, z: 0 };
  }

  /**
   * 设置旋转曲线连接可见性
   */
  setConnectionVisible(visible) {
    if (this.cylinderConnection) {
      this.cylinderConnection.setVisible(visible);
    }
  }

  /**
   * 设置旋转曲线连接颜色
   */
  setConnectionColor(color) {
    if (this.cylinderConnection) {
      this.cylinderConnection.setColor(color);
    }
  }

  /**
   * 设置旋转曲线连接透明度
   */
  setConnectionOpacity(opacity) {
    if (this.cylinderConnection) {
      this.cylinderConnection.setOpacity(opacity);
    }
  }

  /**
   * 设置超椭圆形状渐变的位置偏移
   * @param {number} x - X轴偏移
   * @param {number} y - Y轴偏移
   * @param {number} z - Z轴偏移
   */
  setTransitionPositionOffset(x, y, z) {
    if (this.superellipseTransition) {
      this.superellipseTransition.setPositionOffset(x, y, z);
    }
  }

  /**
   * 设置超椭圆形状渐变的旋转偏移
   * @param {number} x - X轴旋转偏移（弧度）
   * @param {number} y - Y轴旋转偏移（弧度）
   * @param {number} z - Z轴旋转偏移（弧度）
   */
  setTransitionRotationOffset(x, y, z) {
    if (this.superellipseTransition) {
      this.superellipseTransition.setRotationOffset(x, y, z);
    }
  }

  /**
   * 直接设置超椭圆形状渐变的位置
   * @param {number} x - X坐标
   * @param {number} y - Y坐标
   * @param {number} z - Z坐标
   */
  setTransitionPosition(x, y, z) {
    if (this.superellipseTransition) {
      this.superellipseTransition.setPosition(x, y, z);
    }
  }

  /**
   * 直接设置超椭圆形状渐变的旋转
   * @param {number} x - X轴旋转（弧度）
   * @param {number} y - Y轴旋转（弧度）
   * @param {number} z - Z轴旋转（弧度）
   */
  setTransitionRotation(x, y, z) {
    if (this.superellipseTransition) {
      this.superellipseTransition.setRotation(x, y, z);
    }
  }

  /**
   * 获取超椭圆形状渐变的当前位置
   */
  getTransitionPosition() {
    return this.superellipseTransition ? this.superellipseTransition.getPosition() : new THREE.Vector3();
  }

  /**
   * 获取超椭圆形状渐变的当前旋转
   */
  getTransitionRotation() {
    return this.superellipseTransition ? this.superellipseTransition.getRotation() : new THREE.Euler();
  }

  /**
   * 获取超椭圆形状渐变的位置偏移
   */
  getTransitionPositionOffset() {
    return this.superellipseTransition ? this.superellipseTransition.getPositionOffset() : { x: 0, y: 0, z: 0 };
  }

  /**
   * 获取超椭圆形状渐变的旋转偏移
   */
  getTransitionRotationOffset() {
    return this.superellipseTransition ? this.superellipseTransition.getRotationOffset() : { x: 0, y: 0, z: 0 };
  }

  /**
   * 设置超椭圆形状渐变可见性
   */
  setTransitionVisible(visible) {
    if (this.superellipseTransition) {
      this.superellipseTransition.setVisible(visible);
    }
  }

  /**
   * 设置超椭圆形状渐变颜色
   */
  setTransitionColor(color) {
    if (this.superellipseTransition) {
      this.superellipseTransition.setColor(color);
    }
  }

  /**
   * 设置超椭圆形状渐变透明度
   */
  setTransitionOpacity(opacity) {
    if (this.superellipseTransition) {
      this.superellipseTransition.setOpacity(opacity);
    }
  }

  /**
   * 动态更新超椭圆指数（用于动画效果）
   * @param {number} startExponent - 起始指数（圆形：2.0）
   * @param {number} endExponent - 结束指数（方形：8.0+）
   */
  updateTransitionExponents(startExponent, endExponent) {
    if (this.superellipseTransition) {
      this.superellipseTransition.updateExponents(startExponent, endExponent);
    }
  }

  /**
   * 销毁资源
   */
  dispose() {
    // 立方体外壳材质已删除，不需要清理
    // if (this.shellMaterial) {
    //   this.shellMaterial.dispose();
    // }
    
    if (this.cylinder1Material) {
      this.cylinder1Material.dispose();
    }
    
    if (this.cylinder2Material) {
      this.cylinder2Material.dispose();
    }
    
    // 清理旋转曲线连接
    if (this.cylinderConnection) {
      this.cylinderConnection.dispose();
      this.cylinderConnection = null;
    }
    
    // 清理超椭圆形状渐变
    if (this.superellipseTransition) {
      this.superellipseTransition.dispose();
      this.superellipseTransition = null;
    }
    
    // 清理cylinder2爆炸效果
    if (this.cylinder2ExplodeEffect) {
      this.cylinder2ExplodeEffect.dispose();
      this.cylinder2ExplodeEffect = null;
    }
    
    // 清理旋转曲线连接爆炸效果
    if (this.rotationCurveExplodeEffect) {
      this.rotationCurveExplodeEffect.dispose();
      this.rotationCurveExplodeEffect = null;
    }
    
    // 清理超椭圆形状渐变爆炸效果
    if (this.superellipseExplodeEffect) {
      this.superellipseExplodeEffect.dispose();
      this.superellipseExplodeEffect = null;
    }
    
    this.shellGroup.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    });
    
    // 清理圆柱体引用
    this.cylinder1 = null;
    this.cylinder2 = null;
  }
}
