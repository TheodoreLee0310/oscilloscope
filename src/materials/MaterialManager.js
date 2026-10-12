import * as THREE from 'three';
import { CONFIG } from '../configLoader';

/**
 * 材质管理器类
 * 负责创建和管理所有3D材质，包括贴图加载
 */
export class MaterialManager {
  constructor() {
    this.textureLoader = new THREE.TextureLoader();
    this.materials = {};
    this.textures = {};
    this.texturePromises = new Map();
    this.texturesByPath = new Map();
  }

  /**
   * 初始化所有材质
   * @returns {Promise} 返回Promise，在所有贴图加载完成后解析
   */
  async initializeMaterials() {
    console.log('正在初始化材质...');
    
    try {
      // 加载金属贴图
      await this.loadMetalTextures();
      
      // 创建所有材质
      this.createMetalMaterial();
      this.createPlateMaterial();
      this.createScreenMaterial();
      this.createGlowPointMaterial();
      
      console.log('材质初始化完成');
      return this.materials;
    } catch (error) {
      console.error('材质初始化失败:', error);
      // 如果贴图加载失败，创建无贴图的材质
      this.createFallbackMaterials();
      return this.materials;
    }
  }

  /**
   * 加载金属贴图
   * @returns {Promise} 贴图加载Promise
   */
  async loadMetalTextures() {
    const loadPromises = [];
    
    // 加载电子枪金属贴图
    const metalConfig = CONFIG.materials.metal;
    if (metalConfig.textures) {
      if (metalConfig.textures.map) {
        loadPromises.push(this.loadTexture('metalMap', metalConfig.textures.map));
      }
      
      if (metalConfig.textures.normalMap) {
        loadPromises.push(this.loadTexture('metalNormal', metalConfig.textures.normalMap));
      }
      
      if (metalConfig.textures.roughnessMap) {
        loadPromises.push(this.loadTexture('metalRoughness', metalConfig.textures.roughnessMap));
      }
      
      if (metalConfig.textures.metalnessMap) {
        loadPromises.push(this.loadTexture('metalMetalness', metalConfig.textures.metalnessMap));
      }
    }
    
    // 加载偏转板贴图
    const plateConfig = CONFIG.materials.plate;
    if (plateConfig.textures) {
      if (plateConfig.textures.map) {
        loadPromises.push(this.loadTexture('plateMap', plateConfig.textures.map));
      }
      
      if (plateConfig.textures.normalMap) {
        loadPromises.push(this.loadTexture('plateNormal', plateConfig.textures.normalMap));
      }
      
      if (plateConfig.textures.roughnessMap) {
        loadPromises.push(this.loadTexture('plateRoughness', plateConfig.textures.roughnessMap));
      }
      
      if (plateConfig.textures.metalnessMap) {
        loadPromises.push(this.loadTexture('plateMetalness', plateConfig.textures.metalnessMap));
      }
    }
    
    await Promise.all(loadPromises);
  }

  /**
   * 生成占位贴图（贴图加载失败时使用）
   * 画一个中性灰加细边框，避免材质塌成纯黑；同时保证加载流程不中断。
   * @param {string} name - 原贴图名称（便于排查）
   * @returns {THREE.Texture}
   */
  createFallbackTexture(name) {
    try {
      const size = 64;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#9a9a9a';
      ctx.fillRect(0, 0, size, size);
      ctx.strokeStyle = '#8a8a8a';
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, size - 1, size - 1);

      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.flipY = false;
      texture.name = 'fallback:' + name;
      return texture;
    } catch (e) {
      // 无 DOM 等极端情况：退化为空贴图，至少不抛异常
      const texture = new THREE.Texture();
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.flipY = false;
      return texture;
    }
  }

  /**
   * 加载单个贴图
   * @param {string} name - 贴图名称
   * @param {string} path - 贴图路径
   * @returns {Promise} 贴图加载Promise
   */
  loadTexture(name, path) {
    if (this.textures[name]) {
      return Promise.resolve(this.textures[name]);
    }

    if (this.texturesByPath.has(path)) {
      const sharedTexture = this.texturesByPath.get(path);
      this.textures[name] = sharedTexture;
      console.log(`复用已加载贴图: ${name} (${path})`);
      return Promise.resolve(sharedTexture);
    }

    if (this.texturePromises.has(path)) {
      return this.texturePromises.get(path).then((texture) => {
        this.textures[name] = texture;
        console.log(`复用贴图加载任务: ${name} (${path})`);
        return texture;
      });
    }

    const loadPromise = new Promise((resolve, reject) => {
      this.textureLoader.load(
        path,
        (texture) => {
          // 设置贴图参数
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          texture.flipY = false;

          console.log(`贴图加载成功: ${name} (${path})`);
          resolve(texture);
        },
        (progress) => {
          console.log(`贴图加载进度: ${name} - ${(progress.loaded / progress.total * 100)}%`);
        },
        (error) => {
          // 贴图加载失败不再 reject：
          // 鸿蒙 ArkWeb（不透明来源）或资源路径异常时 TextureLoader 会直接失败，
          // 一旦 reject 会让外层 Promise.all 整体失败，导致"所有"贴图一起丢失。
          // 改为返回占位贴图，让其余贴图照常加载，页面不至于整页停在加载层。
          console.warn(`贴图加载失败，改用占位贴图: ${name} (${path})`, error);
          resolve(this.createFallbackTexture(name));
        }
      );
    });

    this.texturePromises.set(path, loadPromise);

    return loadPromise
      .then((texture) => {
        this.texturesByPath.set(path, texture);
        this.textures[name] = texture;
        return texture;
      })
      .finally(() => {
        this.texturePromises.delete(path);
      });
  }

  /**
   * 创建金属材质（电子枪）
   */
  createMetalMaterial() {
    const metalConfig = CONFIG.materials.metal;
    
    const materialProps = {
      color: new THREE.Color(metalConfig.color),
      metalness: metalConfig.metalness,
      roughness: metalConfig.roughness,
      envMapIntensity: 1.0
    };

    // 如果有贴图，添加到材质
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

    this.materials.metal = new THREE.MeshStandardMaterial(materialProps);
  }

  /**
   * 创建偏转板材质
   */
  createPlateMaterial() {
    const plateConfig = CONFIG.materials.plate;
    
    const materialProps = {
      color: new THREE.Color(plateConfig.color),
      metalness: plateConfig.metalness,
      roughness: plateConfig.roughness,
      envMapIntensity: 1.0  // 与电子枪保持一致
    };

    // 如果有贴图，添加到材质
    if (this.textures.plateMap) {
      materialProps.map = this.textures.plateMap;
    }
    
    if (this.textures.plateNormal) {
      materialProps.normalMap = this.textures.plateNormal;
      materialProps.normalScale = new THREE.Vector2(1, 1);
    }
    
    if (this.textures.plateRoughness) {
      materialProps.roughnessMap = this.textures.plateRoughness;
    }
    
    if (this.textures.plateMetalness) {
      materialProps.metalnessMap = this.textures.plateMetalness;
    }

    this.materials.plate = new THREE.MeshStandardMaterial(materialProps);
    
    // 调试输出偏转板材质信息
    console.log('🔧 偏转板材质创建完成:', {
      hasMap: !!materialProps.map,
      hasNormalMap: !!materialProps.normalMap,
      color: materialProps.color.getHexString(),
      metalness: materialProps.metalness,
      roughness: materialProps.roughness,
      envMapIntensity: materialProps.envMapIntensity
    });
  }

  /**
   * 创建荧光屏材质
   */
  createScreenMaterial() {
    const screenConfig = CONFIG.materials.screen;
    
    this.materials.screen = new THREE.MeshStandardMaterial({
      color: new THREE.Color(screenConfig.color),
      emissive: new THREE.Color(CONFIG.screen.color),
      emissiveIntensity: CONFIG.screen.intensity,
      roughness: screenConfig.roughness,
      side: THREE.DoubleSide,
      transparent: true,        // 启用透明度，允许粒子透过
      opacity: 0.9,            // 设置轻微透明度
      depthTest: true,         // 启用深度测试
      depthWrite: false        // 禁用深度写入，允许后面的粒子显示
    });
  }

  /**
   * 创建发光点材质
   */
  createGlowPointMaterial() {
    this.materials.glowPoint = new THREE.MeshBasicMaterial({
      color: new THREE.Color(CONFIG.dotLight.color),
      transparent: true,
      opacity: CONFIG.materials.glow.opacity
    });
  }

  /**
   * 创建备用材质（当贴图加载失败时使用）
   */
  createFallbackMaterials() {
    console.log('创建备用材质（无贴图）');
    
    this.materials.metal = new THREE.MeshStandardMaterial({
      color: new THREE.Color(CONFIG.materials.metal.color),
      metalness: CONFIG.materials.metal.metalness,
      roughness: CONFIG.materials.metal.roughness,
      envMapIntensity: 1.0
    });

    this.materials.plate = new THREE.MeshStandardMaterial({
      color: new THREE.Color(CONFIG.materials.plate.color),
      metalness: CONFIG.materials.plate.metalness,
      roughness: CONFIG.materials.plate.roughness,
      envMapIntensity: 1.0  // 与电子枪保持一致
    });

    this.createScreenMaterial();
    this.createGlowPointMaterial();
  }

  /**
   * 获取指定材质
   * @param {string} name - 材质名称
   * @returns {THREE.Material} 材质对象
   */
  getMaterial(name) {
    return this.materials[name];
  }

  getTextures() {
    return { ...this.textures };
  }

  /**
   * 更新材质属性
   * @param {string} materialName - 材质名称
   * @param {Object} properties - 要更新的属性
   */
  updateMaterial(materialName, properties) {
    const material = this.materials[materialName];
    if (material) {
      Object.assign(material, properties);
      material.needsUpdate = true;
    }
  }

  /**
   * 释放所有材质和贴图资源
   */
  dispose() {
    // 释放贴图
    Object.values(this.textures).forEach(texture => {
      texture.dispose();
    });

    // 释放材质
    Object.values(this.materials).forEach(material => {
      material.dispose();
    });

    this.textures = {};
    this.materials = {};
  }
}
