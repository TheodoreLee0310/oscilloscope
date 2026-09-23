import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { CONFIG } from '../configLoader.js';

/**
 * 标签系统类
 * 负责管理和渲染3D场景中的标签
 */
export class LabelSystem {
  /**
   * 构造函数
   * @param {THREE.Scene} scene - Three.js场景
   * @param {HTMLElement} container - 容器元素
   */
  constructor(scene, container) {
    this.scene = scene;
    this.container = container;
    this.labels = new Map(); // 存储标签对象
    this.visible = false; // 默认隐藏标签
    
    // 初始化CSS2D渲染器
    this.initRenderer();
    
    console.log('LabelSystem初始化完成');
  }
  
  /**
   * 初始化CSS2D渲染器
   */
  initRenderer() {
    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.setSize(window.innerWidth, window.innerHeight);
    this.labelRenderer.domElement.style.position = 'absolute';
    this.labelRenderer.domElement.style.top = '0';
    this.labelRenderer.domElement.style.pointerEvents = 'none';
    this.container.appendChild(this.labelRenderer.domElement);
    
    // 默认隐藏
    this.labelRenderer.domElement.style.display = 'none';
  }
  
  /**
   * 创建标签
   * @param {string} id - 标签ID
   * @param {string} text - 标签文本
   * @param {THREE.Object3D} target - 标签附加的目标对象
   * @param {THREE.Vector3} offset - 标签相对于目标的偏移量
   * @param {string} description - 标签描述（可选）
   */
  createLabel(id, text, target, offset = new THREE.Vector3(0, 0.5, 0), description = '') {
    // 创建标签元素
    const labelDiv = document.createElement('div');
    labelDiv.className = 'label';
    labelDiv.textContent = text;
    labelDiv.style.backgroundColor = CONFIG.labelSystem.backgroundColor;
    labelDiv.style.color = CONFIG.labelSystem.color;
    labelDiv.style.padding = CONFIG.labelSystem.padding;
    labelDiv.style.borderRadius = CONFIG.labelSystem.borderRadius;
    labelDiv.style.fontSize = CONFIG.labelSystem.fontSize;
    labelDiv.style.pointerEvents = 'auto';
    labelDiv.style.cursor = 'pointer';
    
    // 创建CSS2D对象
    const labelObject = new CSS2DObject(labelDiv);
    labelObject.position.copy(offset);
    
    // 将标签添加到目标对象
    target.add(labelObject);
    
    // 存储标签信息
    this.labels.set(id, {
      object: labelObject,
      element: labelDiv,
      target: target,
      description: description
    });
    
    // 添加点击事件
    if (description) {
      labelDiv.addEventListener('click', () => {
        this.showDescription(id);
      });
      
      // 添加提示
      labelDiv.title = '点击查看详情';
    }
    
    return labelObject;
  }
  
  /**
   * 显示标签描述
   * @param {string} id - 标签ID
   */
  showDescription(id) {
    const label = this.labels.get(id);
    if (!label || !label.description) return;
    
    // 创建或更新描述面板
    let descPanel = document.getElementById('label-description-panel');
    if (!descPanel) {
      descPanel = document.createElement('div');
      descPanel.id = 'label-description-panel';
      descPanel.style.position = 'absolute';
      descPanel.style.bottom = CONFIG.labelSystem.descriptionPanel.position.bottom;
      descPanel.style.left = CONFIG.labelSystem.descriptionPanel.position.left;
      descPanel.style.backgroundColor = CONFIG.labelSystem.descriptionPanel.backgroundColor;
      descPanel.style.color = 'white';
      descPanel.style.padding = '15px';
      descPanel.style.borderRadius = '5px';
      descPanel.style.maxWidth = CONFIG.labelSystem.descriptionPanel.maxWidth;
      descPanel.style.zIndex = CONFIG.labelSystem.descriptionPanel.zIndex;
      descPanel.style.transition = 'opacity 0.3s';
      descPanel.style.boxShadow = '0 0 10px rgba(0, 0, 0, 0.5)';
      
      // 添加关闭按钮
      const closeBtn = document.createElement('button');
      closeBtn.textContent = '×';
      closeBtn.style.position = 'absolute';
      closeBtn.style.top = '5px';
      closeBtn.style.right = '5px';
      closeBtn.style.background = 'none';
      closeBtn.style.border = 'none';
      closeBtn.style.color = 'white';
      closeBtn.style.fontSize = '20px';
      closeBtn.style.cursor = 'pointer';
      closeBtn.onclick = () => {
        descPanel.style.opacity = '0';
        setTimeout(() => {
          if (descPanel.parentNode) {
            descPanel.parentNode.removeChild(descPanel);
          }
        }, 300);
      };
      
      descPanel.appendChild(closeBtn);
      this.container.appendChild(descPanel);
    }
    
    // 设置标题和描述
    const title = document.createElement('h3');
    title.textContent = label.element.textContent;
    title.style.margin = '0 0 10px 0';
    
    const description = document.createElement('div');
    description.innerHTML = label.description;
    
    // 清除旧内容
    while (descPanel.firstChild) {
      if (descPanel.firstChild.tagName !== 'BUTTON') {
        descPanel.removeChild(descPanel.firstChild);
      }
    }
    
    descPanel.appendChild(title);
    descPanel.appendChild(description);
    descPanel.style.opacity = '1';
  }
  
  /**
   * 设置标签可见性
   * @param {boolean} visible - 是否可见
   */
  setVisible(visible) {
    this.visible = visible;
    this.labelRenderer.domElement.style.display = visible ? 'block' : 'none';
  }
  
  /**
   * 更新标签位置和大小
   * @param {THREE.Camera} camera - 相机
   */
  update(camera) {
    if (this.visible) {
      this.labelRenderer.render(this.scene, camera);
    }
  }
  
  /**
   * 调整标签渲染器大小
   * @param {number} width - 宽度
   * @param {number} height - 高度
   */
  resize(width, height) {
    this.labelRenderer.setSize(width, height);
  }
  
  /**
   * 移除标签
   * @param {string} id - 标签ID
   */
  removeLabel(id) {
    const label = this.labels.get(id);
    if (label) {
      label.target.remove(label.object);
      this.labels.delete(id);
    }
  }
  
  /**
   * 移除所有标签
   */
  removeAllLabels() {
    this.labels.forEach((label, id) => {
      label.target.remove(label.object);
    });
    this.labels.clear();
  }
} 