import * as THREE from 'three';
import { CONFIG } from '../configLoader.js';

/**
 * 统一组件材质管理器
 * 为cylinder2、rotationCurveConnection和superellipseTransition提供统一的材质管理
 * 使其颜色和材质符合示波器内部的金属材质风格
 */
export class UnifiedComponentMaterial {
  constructor() {
    this.textureLoader = new THREE.TextureLoader();
    this.materialCache = new Map();
    this.textures = {};
    
    // 统一的材质配置（基于示波器内部金属材质）
    this.unifiedConfig = {
      color: 0xF0F0F0,        // 银白色金属色
      metalness: 0.6,         // 金属度
      roughness: 0.3,         // 粗糙度
      opacity: 1.0,           // 透明度 - 修改为完全不透明
      envMapIntensity: 1.0,   // 环境贴图强度
      side: THREE.DoubleSide, // 双面渲染
      depthWrite: true,       // 启用深度写入（不透明物体）
      transparent: false      // 禁用透明
    };
  }

  /**
   * 初始化统一材质系统
   * @returns {Promise} 返回Promise，在初始化完成后解析
   */
  async initialize(options = {}) {
    console.log('🎨 正在初始化统一组件材质系统...');
    const { sharedTextures = null } = options;

    try {
      if (sharedTextures && Object.keys(sharedTextures).length > 0) {
        this.textures = { ...sharedTextures };
        console.log('📦 统一组件材质系统复用共享贴图缓存');
      } else {
        // 加载金属贴图
        await this.loadMetalTextures();
      }
      
      // 预创建常用材质
      this.createStandardMaterial();
      this.createExplodedMaterial();
      this.createTransitionMaterial();
      
      console.log('✅ 统一组件材质系统初始化完成');
      return true;
    } catch (error) {
      console.warn('⚠️ 统一材质系统初始化失败，使用无贴图材质:', error);
      this.createFallbackMaterials();
      return false;
    }
  }

  /**
   * 加载金属贴图
   * @returns {Promise} 贴图加载Promise
   */
  async loadMetalTextures() {
    const metalConfig = CONFIG.materials.metal;
    const loadPromises = [];

    if (metalConfig.textures && metalConfig.textures.map) {
      loadPromises.push(this.loadTexture('metalMap', metalConfig.textures.map));
    }

    if (metalConfig.textures && metalConfig.textures.normalMap) {
      loadPromises.push(this.loadTexture('metalNormal', metalConfig.textures.normalMap));
    }

    if (metalConfig.textures && metalConfig.textures.roughnessMap) {
      loadPromises.push(this.loadTexture('metalRoughness', metalConfig.textures.roughnessMap));
    }

    if (metalConfig.textures && metalConfig.textures.metalnessMap) {
      loadPromises.push(this.loadTexture('metalMetalness', metalConfig.textures.metalnessMap));
    }

    await Promise.all(loadPromises);
  }

  /**
   * 加载单个贴图
   * @param {string} name - 贴图名称
   * @param {string} path - 贴图路径
   * @returns {Promise} 贴图加载Promise
   */
  loadTexture(name, path) {
    return new Promise((resolve, reject) => {
      this.textureLoader.load(
        path,
        (texture) => {
          // 设置贴图参数
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          texture.flipY = false;
          
          this.textures[name] = texture;
          console.log(`📸 贴图加载成功: ${name}`);
          resolve(texture);
        },
        undefined,
        (error) => {
          console.warn(`❌ 贴图加载失败: ${name}`, error);
          reject(error);
        }
      );
    });
  }

  /**
   * 创建标准统一材质
   */
  createStandardMaterial() {
    const materialProps = {
      ...this.unifiedConfig
    };

    // 添加贴图（如果有）
    if (this.textures.metalMap) {
      materialProps.map = this.textures.metalMap;
    }

    if (this.textures.metalNormal) {
      materialProps.normalMap = this.textures.metalNormal;
      materialProps.normalScale = new THREE.Vector2(1, 1);
    }

    if (this.textures.metalRoughness) {
      materialProps.roughnessMap = this.textures.metalRoughness;
    }

    if (this.textures.metalMetalness) {
      materialProps.metalnessMap = this.textures.metalMetalness;
    }

    const material = new THREE.MeshStandardMaterial(materialProps);
    this.materialCache.set('standard', material);
    
    console.log('🔧 标准统一材质创建完成');
  }

  /**
   * 创建爆炸分解效果材质（稍微透明一些）
   */
  createExplodedMaterial() {
    const materialProps = {
      ...this.unifiedConfig,
      opacity: 1.0,         // 爆炸材质也保持不透明
      transparent: false,   // 禁用透明
      depthWrite: true      // 启用深度写入
    };

    // 添加贴图（如果有）
    if (this.textures.metalMap) {
      materialProps.map = this.textures.metalMap;
    }

    if (this.textures.metalNormal) {
      materialProps.normalMap = this.textures.metalNormal;
      materialProps.normalScale = new THREE.Vector2(1, 1);
    }

    if (this.textures.metalRoughness) {
      materialProps.roughnessMap = this.textures.metalRoughness;
    }

    if (this.textures.metalMetalness) {
      materialProps.metalnessMap = this.textures.metalMetalness;
    }

    const material = new THREE.MeshStandardMaterial(materialProps);
    this.materialCache.set('exploded', material);
    
    console.log('💥 爆炸材质创建完成');
  }

  /**
   * 创建过渡材质（用于SuperellipseTransition）
   */
  createTransitionMaterial() {
    const materialProps = {
      ...this.unifiedConfig,
      opacity: 1.0,         // 过渡材质也保持不透明
      transparent: false,   // 禁用透明
      depthWrite: true      // 启用深度写入
    };

    // 添加贴图（如果有）
    if (this.textures.metalMap) {
      materialProps.map = this.textures.metalMap;
    }

    if (this.textures.metalNormal) {
      materialProps.normalMap = this.textures.metalNormal;
      materialProps.normalScale = new THREE.Vector2(1, 1);
    }

    if (this.textures.metalRoughness) {
      materialProps.roughnessMap = this.textures.metalRoughness;
    }

    if (this.textures.metalMetalness) {
      materialProps.metalnessMap = this.textures.metalMetalness;
    }

    const material = new THREE.MeshStandardMaterial(materialProps);
    this.materialCache.set('transition', material);
    
    console.log('🔄 过渡材质创建完成');
  }

  /**
   * 创建备用材质（无贴图版本）
   */
  createFallbackMaterials() {
    console.log('🚧 创建备用统一材质（无贴图）');
    
    // 标准材质
    const standardMaterial = new THREE.MeshStandardMaterial(this.unifiedConfig);
    this.materialCache.set('standard', standardMaterial);
    
    // 爆炸材质
    const explodedMaterial = new THREE.MeshStandardMaterial({
      ...this.unifiedConfig,
      opacity: 1.0,
      transparent: false,
      depthWrite: true
    });
    this.materialCache.set('exploded', explodedMaterial);
    
    // 过渡材质
    const transitionMaterial = new THREE.MeshStandardMaterial({
      ...this.unifiedConfig,
      opacity: 1.0,
      transparent: false,
      depthWrite: true
    });
    this.materialCache.set('transition', transitionMaterial);
  }

  /**
   * 获取指定类型的材质
   * @param {string} type - 材质类型 ('standard', 'exploded', 'transition')
   * @returns {THREE.Material} 材质对象
   */
  getMaterial(type = 'standard') {
    if (!this.materialCache.has(type)) {
      console.warn(`⚠️ 未找到材质类型: ${type}，返回标准材质`);
      return this.materialCache.get('standard');
    }
    return this.materialCache.get(type);
  }

  /**
   * 创建自定义材质（基于统一配置）
   * @param {Object} customProps - 自定义属性
   * @returns {THREE.Material} 自定义材质
   */
  createCustomMaterial(customProps = {}) {
    const materialProps = {
      ...this.unifiedConfig,
      ...customProps
    };

    // 添加贴图（如果有且用户没有覆盖）
    if (this.textures.metalMap && !customProps.map) {
      materialProps.map = this.textures.metalMap;
    }

    if (this.textures.metalNormal && !customProps.normalMap) {
      materialProps.normalMap = this.textures.metalNormal;
      materialProps.normalScale = new THREE.Vector2(1, 1);
    }

    if (this.textures.metalRoughness && !customProps.roughnessMap) {
      materialProps.roughnessMap = this.textures.metalRoughness;
    }

    if (this.textures.metalMetalness && !customProps.metalnessMap) {
      materialProps.metalnessMap = this.textures.metalMetalness;
    }

    return new THREE.MeshStandardMaterial(materialProps);
  }

  /**
   * 获取统一的颜色值
   * @returns {number} 16进制颜色值
   */
  getUnifiedColor() {
    return this.unifiedConfig.color;
  }

  /**
   * 获取统一的透明度值
   * @param {string} type - 材质类型
   * @returns {number} 透明度值
   */
  getUnifiedOpacity(type = 'standard') {
    switch (type) {
      case 'exploded':
        return 0.6;
      case 'transition':
        return 0.8;
      default:
        return this.unifiedConfig.opacity;
    }
  }

  /**
   * 更新统一配置
   * @param {Object} newConfig - 新的配置
   */
  updateUnifiedConfig(newConfig) {
    this.unifiedConfig = { ...this.unifiedConfig, ...newConfig };
    
    // 重新创建所有材质
    this.materialCache.clear();
    if (Object.keys(this.textures).length > 0) {
      this.createStandardMaterial();
      this.createExplodedMaterial();
      this.createTransitionMaterial();
    } else {
      this.createFallbackMaterials();
    }
    
    console.log('🔄 统一材质配置已更新');
  }

  /**
   * 释放所有资源
   */
  dispose() {
    // 释放贴图
    Object.values(this.textures).forEach(texture => {
      texture.dispose();
    });

    // 释放材质
    this.materialCache.forEach(material => {
      material.dispose();
    });

    this.textures = {};
    this.materialCache.clear();
    
    console.log('🗑️ 统一组件材质资源已释放');
  }
}

// 创建单例实例
export const unifiedComponentMaterial = new UnifiedComponentMaterial();
