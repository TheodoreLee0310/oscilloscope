import * as THREE from 'three';
import { RotationCurveGeometry } from '../geometry/RotationCurveGeometry.js';
import { unifiedComponentMaterial } from '../materials/UnifiedComponentMaterial.js';

/**
 * 圆柱体连接组件
 * 使用旋转曲线生成两个圆柱体之间的平滑连接
 */
export class CylinderConnection {
  
  /**
   * 构造函数
   * @param {Object} cylinder1Config - 第一个圆柱体配置
   * @param {Object} cylinder2Config - 第二个圆柱体配置
   * @param {Object} connectionConfig - 连接配置
   */
  constructor(cylinder1Config, cylinder2Config, connectionConfig = {}) {
    this.cylinder1Config = cylinder1Config;
    this.cylinder2Config = cylinder2Config;
    this.connectionConfig = {
      curveType: connectionConfig.curveType || 'G2',
      segments: connectionConfig.segments || 50,
      radialSegments: connectionConfig.radialSegments || 32,
      visible: connectionConfig.visible !== false,
      color: connectionConfig.color || '0x66aaff',
      opacity: connectionConfig.opacity || 0.7,
      connectionLength: connectionConfig.connectionLength || 1.0, // 连接区域长度
      position: {
        offset: connectionConfig.position?.offset || { x: 0, y: 0, z: 0 }
      },
      rotation: {
        offset: connectionConfig.rotation?.offset || { x: 0, y: 0, z: 0 }
      },
      ...connectionConfig
    };
    
    this.connectionGroup = new THREE.Group();
    this.connectionGroup.name = 'CylinderConnection';
    
    this.connectionMeshes = [];
    this.materials = [];
    
    this.createConnections();
  }
  
  /**
   * 创建连接
   */
  createConnections() {
    // 计算两个圆柱体之间的连接参数
    const connectionInfo = this.calculateConnectionParameters();
    
    if (connectionInfo.needsConnection) {
      this.createConnectionMesh(connectionInfo);
    }
  }
  
  /**
   * 计算连接参数
   */
  calculateConnectionParameters() {
    const pos1 = this.cylinder1Config.position;
    const pos2 = this.cylinder2Config.position;
    const r1 = this.cylinder1Config.radius;
    const r2 = this.cylinder2Config.radius;
    
    // 计算两个圆柱体中心之间的距离和方向
    const distance = Math.sqrt(
      Math.pow(pos2.x - pos1.x, 2) + 
      Math.pow(pos2.y - pos1.y, 2) + 
      Math.pow(pos2.z - pos1.z, 2)
    );
    
    // 计算连接向量
    const direction = new THREE.Vector3(
      pos2.x - pos1.x,
      pos2.y - pos1.y,
      pos2.z - pos1.z
    ).normalize();
    
    // 判断是否需要连接（圆柱体之间有间隙）
    const cylinderLength1 = this.cylinder1Config.height;
    const cylinderLength2 = this.cylinder2Config.height;
    
    // 计算圆柱体端点位置（考虑旋转）
    const rot1 = new THREE.Euler(
      this.cylinder1Config.rotation.x,
      this.cylinder1Config.rotation.y,
      this.cylinder1Config.rotation.z
    );
    const rot2 = new THREE.Euler(
      this.cylinder2Config.rotation.x,
      this.cylinder2Config.rotation.y,
      this.cylinder2Config.rotation.z
    );
    
    // 简化处理：假设圆柱体都是水平放置的（绕Z轴旋转90度）
    // 在这种情况下，圆柱体的"长度"实际上是在X方向上
    
    const gap = Math.abs(distance - cylinderLength1/2 - cylinderLength2/2);
    const needsConnection = gap > 0.1; // 如果间隙大于0.1，则需要连接
    
    return {
      needsConnection,
      distance,
      direction,
      gap,
      startPos: new THREE.Vector3(pos1.x, pos1.y, pos1.z),
      endPos: new THREE.Vector3(pos2.x, pos2.y, pos2.z),
      startRadius: r1,
      endRadius: r2,
      connectionLength: this.connectionConfig.connectionLength
    };
  }
  
  /**
   * 创建连接网格
   */
  createConnectionMesh(connectionInfo) {
    // 使用统一组件材质管理器获取标准材质
    const material = unifiedComponentMaterial.getMaterial('standard');
    
    this.materials.push(material);
    
    // 创建旋转曲线几何体
    const curveGeometry = new RotationCurveGeometry(
      connectionInfo.startRadius,
      connectionInfo.endRadius,
      connectionInfo.connectionLength,
      this.connectionConfig.curveType,
      this.connectionConfig.segments,
      this.connectionConfig.radialSegments
    );
    
    // 创建网格
    const connectionMesh = new THREE.Mesh(curveGeometry.getGeometry(), material);
    
    // 设置位置和旋转
    this.positionConnectionMesh(connectionMesh, connectionInfo);
    
    // 设置可见性
    connectionMesh.visible = this.connectionConfig.visible;
    
    // 添加到组中
    this.connectionGroup.add(connectionMesh);
    this.connectionMeshes.push(connectionMesh);
  }
  
  /**
   * 定位连接网格
   */
  positionConnectionMesh(mesh, connectionInfo) {
    // 计算连接中心点
    const centerX = (connectionInfo.startPos.x + connectionInfo.endPos.x) / 2;
    const centerY = (connectionInfo.startPos.y + connectionInfo.endPos.y) / 2;
    const centerZ = (connectionInfo.startPos.z + connectionInfo.endPos.z) / 2;
    
    // 应用位置偏移
    const posOffset = this.connectionConfig.position.offset;
    mesh.position.set(
      centerX + posOffset.x, 
      centerY + posOffset.y, 
      centerZ + posOffset.z
    );
    
    // 计算旋转以对齐连接方向
    // 默认几何体是沿Z轴方向的，需要旋转以对齐实际连接方向
    const targetDirection = connectionInfo.direction;
    const defaultDirection = new THREE.Vector3(0, 0, 1);
    
    // 计算旋转四元数
    const quaternion = new THREE.Quaternion();
    quaternion.setFromUnitVectors(defaultDirection, targetDirection);
    mesh.setRotationFromQuaternion(quaternion);
    
    // 由于圆柱体是水平的（绕Z轴旋转90度），连接也需要相应调整
    mesh.rotateZ(Math.PI / 2);
    
    // 应用旋转偏移
    const rotOffset = this.connectionConfig.rotation.offset;
    mesh.rotateX(rotOffset.x);
    mesh.rotateY(rotOffset.y);
    mesh.rotateZ(rotOffset.z);
  }
  
  /**
   * 获取连接组
   */
  getConnection() {
    return this.connectionGroup;
  }
  
  /**
   * 设置可见性
   */
  setVisible(visible) {
    this.connectionGroup.visible = visible;
    this.connectionMeshes.forEach(mesh => {
      mesh.visible = visible;
    });
  }
  
  /**
   * 设置颜色
   */
  setColor(color) {
    this.materials.forEach(material => {
      material.color.setHex(color);
    });
  }
  
  /**
   * 设置透明度
   */
  setOpacity(opacity) {
    this.materials.forEach(material => {
      material.opacity = Math.max(0, Math.min(1, opacity));
    });
  }
  
  /**
   * 设置位置偏移
   * @param {number} x - X轴偏移
   * @param {number} y - Y轴偏移  
   * @param {number} z - Z轴偏移
   */
  setPositionOffset(x, y, z) {
    this.connectionConfig.position.offset = { x, y, z };
    this.recreateConnections();
  }
  
  /**
   * 设置旋转偏移
   * @param {number} x - X轴旋转偏移（弧度）
   * @param {number} y - Y轴旋转偏移（弧度）
   * @param {number} z - Z轴旋转偏移（弧度）
   */
  setRotationOffset(x, y, z) {
    this.connectionConfig.rotation.offset = { x, y, z };
    this.recreateConnections();
  }
  
  /**
   * 获取当前位置偏移
   */
  getPositionOffset() {
    return { ...this.connectionConfig.position.offset };
  }
  
  /**
   * 获取当前旋转偏移
   */
  getRotationOffset() {
    return { ...this.connectionConfig.rotation.offset };
  }
  
  /**
   * 直接设置连接组的位置（不改变配置，只是临时移动）
   * @param {number} x - X坐标
   * @param {number} y - Y坐标
   * @param {number} z - Z坐标
   */
  setPosition(x, y, z) {
    this.connectionGroup.position.set(x, y, z);
  }
  
  /**
   * 直接设置连接组的旋转（不改变配置，只是临时旋转）
   * @param {number} x - X轴旋转（弧度）
   * @param {number} y - Y轴旋转（弧度）
   * @param {number} z - Z轴旋转（弧度）
   */
  setRotation(x, y, z) {
    this.connectionGroup.rotation.set(x, y, z);
  }
  
  /**
   * 获取连接组的当前位置
   */
  getPosition() {
    return this.connectionGroup.position.clone();
  }
  
  /**
   * 获取连接组的当前旋转
   */
  getRotation() {
    return this.connectionGroup.rotation.clone();
  }
  
  /**
   * 设置曲线类型
   */
  setCurveType(curveType) {
    this.connectionConfig.curveType = curveType;
    this.recreateConnections();
  }
  
  /**
   * 重新创建连接
   */
  recreateConnections() {
    // 清理现有连接
    this.dispose();
    
    // 重置数组
    this.connectionMeshes = [];
    this.materials = [];
    
    // 重新创建
    this.createConnections();
  }
  
  /**
   * 更新配置
   */
  updateConfig(cylinder1Config, cylinder2Config, connectionConfig) {
    this.cylinder1Config = cylinder1Config;
    this.cylinder2Config = cylinder2Config;
    
    if (connectionConfig) {
      this.connectionConfig = { ...this.connectionConfig, ...connectionConfig };
    }
    
    this.recreateConnections();
  }
  
  /**
   * 销毁资源
   */
  dispose() {
    // 销毁材质
    this.materials.forEach(material => {
      material.dispose();
    });
    
    // 销毁几何体
    this.connectionGroup.traverse((child) => {
      if (child.geometry) {
        child.geometry.dispose();
      }
      if (child.material) {
        child.material.dispose();
      }
    });
    
    // 清理组
    this.connectionGroup.clear();
    
    // 重置数组
    this.connectionMeshes = [];
    this.materials = [];
  }
}
