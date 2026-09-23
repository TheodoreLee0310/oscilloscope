import * as THREE from 'three';

/**
 * 旋转曲线几何体生成器
 * 基于数学公式生成平滑连接的旋转曲面
 * 支持G1和G2连续性
 */
export class RotationCurveGeometry {
  
  /**
   * 构造函数
   * @param {number} r1 - 小半径
   * @param {number} r2 - 大半径  
   * @param {number} length - 过渡长度
   * @param {string} curveType - 曲线类型 ('G1' 或 'G2')
   * @param {number} segments - 分段数量
   * @param {number} radialSegments - 径向分段数
   */
  constructor(r1, r2, length, curveType = 'G2', segments = 50, radialSegments = 32) {
    this.r1 = r1;
    this.r2 = r2;
    this.length = length;
    this.curveType = curveType;
    this.segments = segments;
    this.radialSegments = radialSegments;
    
    this.geometry = new THREE.BufferGeometry();
    this.generateGeometry();
  }
  
  /**
   * G1连续性曲线 (零斜率端点，够顺滑)
   * r(z) = r1 + (r2 - r1) * (3s² - 2s³)
   * 其中 s = z/L ∈ [0,1]
   */
  calculateG1Radius(s) {
    const t = 3 * s * s - 2 * s * s * s;
    return this.r1 + (this.r2 - this.r1) * t;
  }
  
  /**
   * G2连续性曲线 (连曲率也连续，更像"银白金属"般丝滑)
   * r(z) = r1 + (r2 - r1) * (10s³ - 15s⁴ + 6s⁵)
   * 其中 s = z/L ∈ [0,1]
   */
  calculateG2Radius(s) {
    const s3 = s * s * s;
    const s4 = s3 * s;
    const s5 = s4 * s;
    const t = 10 * s3 - 15 * s4 + 6 * s5;
    return this.r1 + (this.r2 - this.r1) * t;
  }
  
  /**
   * 根据曲线类型计算半径
   */
  calculateRadius(s) {
    switch (this.curveType) {
      case 'G1':
        return this.calculateG1Radius(s);
      case 'G2':
        return this.calculateG2Radius(s);
      default:
        return this.calculateG2Radius(s); // 默认使用G2
    }
  }
  
  /**
   * 生成旋转曲面几何体
   */
  generateGeometry() {
    const vertices = [];
    const normals = [];
    const uvs = [];
    const indices = [];
    
    // 生成顶点
    for (let i = 0; i <= this.segments; i++) {
      const s = i / this.segments; // 参数 s ∈ [0,1]
      const z = s * this.length;   // Z坐标
      const radius = this.calculateRadius(s);
      
      // 计算法向量需要的导数
      const deltaS = 0.001;
      const r_next = this.calculateRadius(Math.min(1, s + deltaS));
      const r_prev = this.calculateRadius(Math.max(0, s - deltaS));
      const dr_ds = (r_next - r_prev) / (2 * deltaS);
      const dr_dz = dr_ds / this.length;
      
      for (let j = 0; j <= this.radialSegments; j++) {
        const angle = (j / this.radialSegments) * Math.PI * 2;
        
        // 计算顶点位置
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        
        vertices.push(x, y, z);
        
        // 计算法向量
        // 对于旋转曲面，法向量 = (-dr/dz * cos(θ), -dr/dz * sin(θ), 1) 归一化
        const nx = -dr_dz * Math.cos(angle);
        const ny = -dr_dz * Math.sin(angle);
        const nz = 1;
        const length_n = Math.sqrt(nx * nx + ny * ny + nz * nz);
        
        normals.push(nx / length_n, ny / length_n, nz / length_n);
        
        // UV坐标
        uvs.push(j / this.radialSegments, s);
      }
    }
    
    // 生成索引
    for (let i = 0; i < this.segments; i++) {
      for (let j = 0; j < this.radialSegments; j++) {
        const a = i * (this.radialSegments + 1) + j;
        const b = a + this.radialSegments + 1;
        const c = a + 1;
        const d = b + 1;
        
        // 两个三角形组成一个四边形
        indices.push(a, b, c);
        indices.push(b, d, c);
      }
    }
    
    // 设置几何体属性
    this.geometry.setIndex(indices);
    this.geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    this.geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    this.geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    
    // 计算边界球和边界框
    this.geometry.computeBoundingSphere();
    this.geometry.computeBoundingBox();
  }
  
  /**
   * 获取生成的几何体
   */
  getGeometry() {
    return this.geometry;
  }
  
  /**
   * 创建扇形片段几何体
   * @param {number} segmentIndex - 扇形索引 (0-3)
   * @param {number} sectorCount - 总扇形数量 (通常是4)
   * @returns {THREE.BufferGeometry} 扇形片段几何体
   */
  createSectorGeometry(segmentIndex, sectorCount = 4) {
    const vertices = [];
    const normals = [];
    const uvs = [];
    const indices = [];
    
    // 计算角度范围
    const anglePerSector = (Math.PI * 2) / sectorCount;
    const startAngle = segmentIndex * anglePerSector;
    const endAngle = (segmentIndex + 1) * anglePerSector;
    
    // 计算每个扇形的径向分段数
    const radialSegmentsPerSector = Math.max(8, Math.floor(this.radialSegments / sectorCount));
    
    // 生成扇形顶点
    for (let i = 0; i <= this.segments; i++) {
      const s = i / this.segments; // 参数 s ∈ [0,1]
      const z = s * this.length;   // Z坐标
      const radius = this.calculateRadius(s);
      
      // 计算法向量需要的导数
      const deltaS = 0.001;
      const r_next = this.calculateRadius(Math.min(1, s + deltaS));
      const r_prev = this.calculateRadius(Math.max(0, s - deltaS));
      const dr_ds = (r_next - r_prev) / (2 * deltaS);
      const dr_dz = dr_ds / this.length;
      
      for (let j = 0; j <= radialSegmentsPerSector; j++) {
        // 在扇形角度范围内分布
        const t = j / radialSegmentsPerSector;
        const angle = startAngle + t * (endAngle - startAngle);
        
        // 计算顶点位置
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        
        vertices.push(x, y, z);
        
        // 计算法向量
        const nx = -dr_dz * Math.cos(angle);
        const ny = -dr_dz * Math.sin(angle);
        const nz = 1;
        const length_n = Math.sqrt(nx * nx + ny * ny + nz * nz);
        
        normals.push(nx / length_n, ny / length_n, nz / length_n);
        
        // UV坐标
        uvs.push(t, s);
      }
    }
    
    // 生成索引
    for (let i = 0; i < this.segments; i++) {
      for (let j = 0; j < radialSegmentsPerSector; j++) {
        const a = i * (radialSegmentsPerSector + 1) + j;
        const b = a + radialSegmentsPerSector + 1;
        const c = a + 1;
        const d = b + 1;
        
        // 两个三角形组成一个四边形
        indices.push(a, b, c);
        indices.push(b, d, c);
      }
    }
    
    // 创建新的几何体
    const sectorGeometry = new THREE.BufferGeometry();
    sectorGeometry.setIndex(indices);
    sectorGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    sectorGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    sectorGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    
    // 计算边界球和边界框
    sectorGeometry.computeBoundingSphere();
    sectorGeometry.computeBoundingBox();
    
    return sectorGeometry;
  }

  /**
   * 销毁几何体资源
   */
  dispose() {
    if (this.geometry) {
      this.geometry.dispose();
    }
  }
}

/**
 * 便捷函数：创建旋转曲线几何体
 */
export function createRotationCurveGeometry(r1, r2, length, curveType = 'G2', segments = 50, radialSegments = 32) {
  const generator = new RotationCurveGeometry(r1, r2, length, curveType, segments, radialSegments);
  return generator.getGeometry();
}
