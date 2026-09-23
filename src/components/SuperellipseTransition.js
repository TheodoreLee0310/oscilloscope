import * as THREE from 'three';
import { unifiedComponentMaterial } from '../materials/UnifiedComponentMaterial.js';

/**
 * 超椭圆形状渐变组件
 * 实现从圆形到方形的平滑几何过渡，基于超椭圆公式：|x/a|^m + |y/b|^m = 1
 * 
 * 参数说明：
 * - m = 2: 椭圆/圆形
 * - m → ∞: 趋近方形  
 * - m = 6~12: 圆角方形效果
 * 
 * 支持G2五次缓动确保曲率连续性
 */
export class SuperellipseTransition {
  /**
   * 构造函数
   * @param {Object} startConfig - 起始几何配置（圆形）
   * @param {Object} endConfig - 结束几何配置（方形）
   * @param {Object} transitionConfig - 过渡配置
   */
  constructor(startConfig, endConfig, transitionConfig) {
    this.startConfig = startConfig;
    this.endConfig = endConfig; 
    this.transitionConfig = {
      // 默认配置
      segments: 64,              // 长度分段数（影响过渡平滑度）
      radialSegments: 32,        // 径向分段数
      transitionLength: 2.0,     // 过渡长度
      startExponent: 2.0,        // 起始指数（圆形）
      endExponent: 100.0,        // 结束指数（完全直角矩形）
      g2Smoothing: true,         // 启用G2五次缓动
      color: 0x66aaff,
      opacity: 0.7,
      position: { offset: { x: 0, y: 0, z: 0 } },
      rotation: { offset: { x: 0, y: 0, z: 0 } },
      // 覆盖默认配置
      ...transitionConfig
    };
    
    this.transitionGroup = new THREE.Group();
    this.transitionGroup.name = 'SuperellipseTransition';
    
    // 材质
    this.material = null;
    this.meshes = [];
    
    this.createTransition();
  }

  /**
   * 创建形状渐变过渡
   */
  createTransition() {
    // 使用统一组件材质（示波器内部金属材质）
    this.material = unifiedComponentMaterial.getMaterial('transition');

    // 计算过渡参数
    const transitionInfo = this.calculateTransitionParams();
    
    // 创建过渡几何体
    const geometry = this.createSuperellipseGeometry(transitionInfo);
    
    // 创建网格
    const mesh = new THREE.Mesh(geometry, this.material);
    
    // 定位网格
    this.positionTransitionMesh(mesh, transitionInfo);
    
    // 添加到组
    this.transitionGroup.add(mesh);
    this.meshes.push(mesh);
  }

  /**
   * 计算过渡参数
   */
  calculateTransitionParams() {
    // 计算起始和结束位置
    const startPos = new THREE.Vector3(
      this.startConfig.position.x,
      this.startConfig.position.y, 
      this.startConfig.position.z
    );
    
    const endPos = new THREE.Vector3(
      this.endConfig.position.x,
      this.endConfig.position.y,
      this.endConfig.position.z
    );
    
    // 计算过渡方向和距离
    const direction = new THREE.Vector3().subVectors(endPos, startPos).normalize();
    const distance = startPos.distanceTo(endPos);
    
    // 计算过渡中心点
    const center = new THREE.Vector3().addVectors(startPos, endPos).multiplyScalar(0.5);
    
    // 使用用户配置的过渡长度（移除距离限制，让用户自由控制）
    const adjustedLength = this.transitionConfig.transitionLength;
    
    return {
      startPos,
      endPos,
      center,
      direction,
      distance,
      transitionLength: adjustedLength,
      startRadius: this.startConfig.radius,
      endSize: this.endConfig.size // 立方体尺寸
    };
  }

  /**
   * 创建超椭圆过渡几何体
   * @param {Object} transitionInfo - 过渡信息
   */
  createSuperellipseGeometry(transitionInfo) {
    const segments = this.transitionConfig.segments;
    const radialSegments = this.transitionConfig.radialSegments;
    const length = transitionInfo.transitionLength;
    
    const vertices = [];
    const normals = [];
    const uvs = [];
    const indices = [];
    
    // 沿长度方向创建截面
    for (let i = 0; i <= segments; i++) {
      const t = i / segments; // 0 到 1
      const z = -length / 2 + t * length; // 沿Z轴分布
      
      // 应用G2五次缓动进行平滑插值
      const smoothT = this.transitionConfig.g2Smoothing ? this.g2Smoothing(t) : t;
      
      // 插值计算当前截面的超椭圆参数
      const currentExponent = THREE.MathUtils.lerp(
        this.transitionConfig.startExponent, 
        this.transitionConfig.endExponent, 
        smoothT
      );
      
      // 插值计算当前截面的尺寸
      // 注意：由于超椭圆会绕Z轴旋转90度，需要交换width和height的映射
      // X轴（旋转后变成垂直方向）对应荧光屏的height
      // Y轴（旋转后变成水平方向）对应荧光屏的width
      const currentRadiusX = THREE.MathUtils.lerp(
        transitionInfo.startRadius,
        transitionInfo.endSize.height / 2,  // 高度映射到X轴
        smoothT
      );
      const currentRadiusY = THREE.MathUtils.lerp(
        transitionInfo.startRadius,
        transitionInfo.endSize.width / 2,   // 宽度映射到Y轴
        smoothT
      );
      
      // 创建当前截面的超椭圆轮廓
      const crossSection = this.generateSuperellipseCrossSection(
        currentRadiusX,
        currentRadiusY,
        currentExponent,
        radialSegments
      );
      
      // 添加顶点到几何体
      for (let j = 0; j < crossSection.length; j++) {
        const point = crossSection[j];
        vertices.push(point.x, point.y, z);
        
        // 计算法向量（简化版，可进一步优化）
        const normal = new THREE.Vector3(point.x, point.y, 0).normalize();
        normals.push(normal.x, normal.y, normal.z);
        
        // UV坐标
        uvs.push(j / radialSegments, t);
      }
    }
    
    // 生成索引（连接相邻截面）
    for (let i = 0; i < segments; i++) {
      for (let j = 0; j < radialSegments; j++) {
        const current = i * radialSegments + j;
        const next = i * radialSegments + ((j + 1) % radialSegments);
        const currentNext = (i + 1) * radialSegments + j;
        const nextNext = (i + 1) * radialSegments + ((j + 1) % radialSegments);
        
        // 两个三角形组成一个四边形
        indices.push(current, next, currentNext);
        indices.push(next, nextNext, currentNext);
      }
    }
    
    // 创建几何体
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    
    // 计算正确的法向量
    geometry.computeVertexNormals();
    
    return geometry;
  }

  /**
   * 生成超椭圆截面轮廓
   * 使用公式：|x/a|^m + |y/b|^m = 1
   * @param {number} radiusX - X轴半径
   * @param {number} radiusY - Y轴半径  
   * @param {number} exponent - 超椭圆指数
   * @param {number} segments - 分段数
   */
  generateSuperellipseCrossSection(radiusX, radiusY, exponent, segments) {
    const points = [];
    
    // 当指数非常大时，直接生成矩形
    if (exponent >= 50) {
      return this.generateRectangleCrossSection(radiusX, radiusY, segments);
    }
    
    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      
      // 参数方程生成超椭圆点
      // x = a * sign(cos(θ)) * |cos(θ)|^(2/m)
      // y = b * sign(sin(θ)) * |sin(θ)|^(2/m)
      const cosTheta = Math.cos(angle);
      const sinTheta = Math.sin(angle);
      
      const signCos = Math.sign(cosTheta);
      const signSin = Math.sign(sinTheta);
      
      // 避免数值问题：当指数很大时，限制最小值
      const minValue = 1e-12;
      const absCos = Math.max(Math.abs(cosTheta), minValue);
      const absSin = Math.max(Math.abs(sinTheta), minValue);
      
      const powCos = Math.pow(absCos, 2 / exponent);
      const powSin = Math.pow(absSin, 2 / exponent);
      
      const x = radiusX * signCos * powCos;
      const y = radiusY * signSin * powSin;
      
      points.push(new THREE.Vector2(x, y));
    }
    
    return points;
  }

  /**
   * 生成完全直角的矩形截面轮廓
   * @param {number} radiusX - X轴半径
   * @param {number} radiusY - Y轴半径  
   * @param {number} segments - 分段数
   */
  generateRectangleCrossSection(radiusX, radiusY, segments) {
    const points = [];
    const segmentsPerSide = Math.floor(segments / 4);
    
    // 右边（从右下到右上）
    for (let i = 0; i <= segmentsPerSide; i++) {
      const t = i / segmentsPerSide;
      const x = radiusX;
      const y = radiusY * (2 * t - 1); // -radiusY 到 radiusY
      points.push(new THREE.Vector2(x, y));
    }
    
    // 上边（从右上到左上）
    for (let i = 1; i <= segmentsPerSide; i++) {
      const t = i / segmentsPerSide;
      const x = radiusX * (1 - 2 * t); // radiusX 到 -radiusX
      const y = radiusY;
      points.push(new THREE.Vector2(x, y));
    }
    
    // 左边（从左上到左下）
    for (let i = 1; i <= segmentsPerSide; i++) {
      const t = i / segmentsPerSide;
      const x = -radiusX;
      const y = radiusY * (1 - 2 * t); // radiusY 到 -radiusY
      points.push(new THREE.Vector2(x, y));
    }
    
    // 下边（从左下到右下）
    for (let i = 1; i < segmentsPerSide; i++) {
      const t = i / segmentsPerSide;
      const x = radiusX * (2 * t - 1); // -radiusX 到 radiusX
      const y = -radiusY;
      points.push(new THREE.Vector2(x, y));
    }
    
    return points;
  }

  /**
   * G2五次缓动函数
   * 保证位置、速度和加速度连续性
   * 公式：f(t) = 10t³ - 15t⁴ + 6t⁵
   * @param {number} t - 输入参数 [0,1]
   */
  g2Smoothing(t) {
    // 限制输入范围
    t = Math.max(0, Math.min(1, t));
    
    // G2五次缓动
    return 10 * Math.pow(t, 3) - 15 * Math.pow(t, 4) + 6 * Math.pow(t, 5);
  }

  /**
   * 定位过渡网格
   * @param {THREE.Mesh} mesh - 网格对象
   * @param {Object} transitionInfo - 过渡信息
   */
  positionTransitionMesh(mesh, transitionInfo) {
    // 设置基础位置（过渡中心点）
    const center = transitionInfo.center;
    const posOffset = this.transitionConfig.position.offset;
    
    mesh.position.set(
      center.x + posOffset.x,
      center.y + posOffset.y, 
      center.z + posOffset.z
    );
    
    // 计算旋转以对齐过渡方向
    const targetDirection = transitionInfo.direction;
    const defaultDirection = new THREE.Vector3(0, 0, 1);
    
    // 计算旋转四元数
    const quaternion = new THREE.Quaternion();
    quaternion.setFromUnitVectors(defaultDirection, targetDirection);
    mesh.setRotationFromQuaternion(quaternion);
    
    // 由于圆柱体是水平的（绕Z轴旋转90度），过渡也需要相应调整
    mesh.rotateZ(Math.PI / 2);
    
    // 应用旋转偏移
    const rotOffset = this.transitionConfig.rotation.offset;
    mesh.rotateX(rotOffset.x);
    mesh.rotateY(rotOffset.y);
    mesh.rotateZ(rotOffset.z);
  }

  /**
   * 获取过渡组
   */
  getTransition() {
    return this.transitionGroup;
  }

  /**
   * 设置可见性
   */
  setVisible(visible) {
    this.transitionGroup.visible = visible;
  }

  /**
   * 设置颜色
   */
  setColor(color) {
    if (this.material) {
      this.material.color.setHex(color);
    }
  }

  /**
   * 设置透明度
   */
  setOpacity(opacity) {
    if (this.material) {
      this.material.opacity = Math.max(0, Math.min(1, opacity));
    }
  }

  /**
   * 设置位置偏移
   */
  setPositionOffset(x, y, z) {
    this.transitionConfig.position.offset = { x, y, z };
    this.updatePosition();
  }

  /**
   * 设置旋转偏移  
   */
  setRotationOffset(x, y, z) {
    this.transitionConfig.rotation.offset = { x, y, z };
    this.updateRotation();
  }

  /**
   * 直接设置位置
   */
  setPosition(x, y, z) {
    this.transitionGroup.position.set(x, y, z);
  }

  /**
   * 直接设置旋转
   */
  setRotation(x, y, z) {
    this.transitionGroup.rotation.set(x, y, z);
  }

  /**
   * 获取当前位置
   */
  getPosition() {
    return this.transitionGroup.position.clone();
  }

  /**
   * 获取当前旋转
   */
  getRotation() {
    return this.transitionGroup.rotation.clone();
  }

  /**
   * 获取位置偏移
   */
  getPositionOffset() {
    return { ...this.transitionConfig.position.offset };
  }

  /**
   * 获取旋转偏移
   */
  getRotationOffset() {
    return { ...this.transitionConfig.rotation.offset };
  }

  /**
   * 更新位置（重新计算基于偏移）
   */
  updatePosition() {
    // 重新计算过渡参数
    const transitionInfo = this.calculateTransitionParams();
    
    // 更新所有网格位置
    this.meshes.forEach(mesh => {
      this.positionTransitionMesh(mesh, transitionInfo);
    });
  }

  /**
   * 更新旋转（重新计算基于偏移）
   */
  updateRotation() {
    this.updatePosition(); // 旋转偏移需要重新定位
  }

  /**
   * 更新配置
   */
  updateConfig(startConfig, endConfig, transitionConfig) {
    this.startConfig = startConfig;
    this.endConfig = endConfig;
    this.transitionConfig = { ...this.transitionConfig, ...transitionConfig };
    
    // 重新创建过渡
    this.dispose();
    this.createTransition();
  }

  /**
   * 动态更新超椭圆指数（用于动画效果）
   * @param {number} startExponent - 起始指数
   * @param {number} endExponent - 结束指数
   */
  updateExponents(startExponent, endExponent) {
    this.transitionConfig.startExponent = startExponent;
    this.transitionConfig.endExponent = endExponent;
    
    // 重新创建几何体
    this.dispose();
    this.createTransition();
  }

  /**
   * 销毁资源
   */
  dispose() {
    if (this.material) {
      this.material.dispose();
    }
    
    this.meshes.forEach(mesh => {
      if (mesh.geometry) mesh.geometry.dispose();
      this.transitionGroup.remove(mesh);
    });
    
    this.meshes = [];
  }
}
