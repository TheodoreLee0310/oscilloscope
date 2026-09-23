// ===== 基础导入 =====
import * as THREE from 'three'; // 三维库
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'; // 轨道控制器
import * as TWEEN from '@tweenjs/tween.js'; // 动画库

// ===== 导入 switcher 模块（ES6 导入，并在 DOM 就绪后初始化） =====
import { renderSwitcher } from '../src/widgets/switcher.js';


// ===== 导入自定义模块 =====
import { CONFIG } from './configLoader';
import { ConnectionPositionDemo } from './examples/ConnectionPositionDemo.js';
import { SuperellipseTransitionDemo } from './examples/SuperellipseTransitionDemo.js';  // 配置文件
import { GuiController } from './controllers/GuiController';  // GUI控制器
import { UIController } from './controllers/UIController';  // UI控制器
import { WaveformGenerator } from './components/WaveformGenerator';  // 波形生成器
import { ElectronBeam } from './components/ElectronBeam';  // 电子束
import { Screen } from './components/Screen';  // 荧光屏
import { LabelSystem } from './components/LabelSystem';  // 标签系统
import { ExplodedView } from './components/ExplodedView';  // 分解视图
import { DemoAnimation } from './components/DemoAnimation';  // 演示动画
import { CRTShell } from './components/CRTShell';  // CRT外壳
import { MaterialManager } from './materials/MaterialManager';  // 材质管理器
import { unifiedComponentMaterial } from './materials/UnifiedComponentMaterial.js';  // 统一组件材质管理器

// ===== 全局变量 =====
let scene, camera, renderer, controls;  // 场景、相机、渲染器、控制器
let electronBeam, waveformGenerator, screenController;  // 电子束、波形生成器、荧光屏控制器
let guiController, uiController;  // GUI控制器、UI控制器
let labelSystem, explodedView, demoAnimation;  // 标签系统、分解视图、演示动画
let crtShell;  // CRT外壳
let materialManager;  // 材质管理器
let deferredUiInitialized = false; // 首屏后延迟初始化的 UI 模块状态
let loadingScreen; // 内部页加载动画

// 创建 TWEEN Group 管理动画（解决 TWEEN.update() 弃用问题）
export const tweenGroup = new TWEEN.Group();

function getLoadingScreen() {
  loadingScreen = window.__internalLoadingScreen || loadingScreen;
  return loadingScreen;
}

// ===== 热重载支持 =====
if (module.hot) {
  module.hot.accept('./configLoader', () => {
    console.log('配置文件已更新，重新加载...');
    // 重新初始化组件以应用新配置
    if (electronBeam) electronBeam.updateMaterial();
    if (screenController) screenController.updateMaterial();
    if (crtShell) crtShell.updateConfig();  // 添加CRTShell响应式更新
  });
  
  module.hot.accept(['./components/ElectronBeam', './components/Screen', './components/WaveformGenerator', './components/CRTShell'], () => {
    console.log('组件已更新，重新加载...');
  });
}

// ===== 场景对象引用 =====
let gun, gunHead, v1, v2, h1, h2, screen;  // 电子枪、电子枪头、垂直偏转板、水平偏转板、荧光屏    

// ===== 工具函数 =====
/**
 * 解析颜色值，支持多种格式
 * @param {string|number} color - 颜色值（可以是 "#ffffff", "0xffffff", RGB等格式）
 * @returns {number|null} - 解析后的十六进制数值，失败返回null
 */
function parseColor(color) {
  try {
    if (typeof color === 'number') {
      return color;
    }
    
    if (typeof color === 'string') {
      // 处理十六进制格式 "0xffffff"
      if (color.startsWith('0x')) {
        return parseInt(color, 16);
      }
      
      // 处理CSS十六进制格式 "#ffffff"
      if (color.startsWith('#')) {
        return parseInt(color.replace('#', '0x'), 16);
      }
      
      // 处理纯十六进制字符串 "ffffff"
      if (/^[0-9a-fA-F]{6}$/.test(color)) {
        return parseInt('0x' + color, 16);
      }
      
      // 尝试直接解析
      const parsed = parseInt(color, 16);
      if (!isNaN(parsed)) {
        return parsed;
      }
    }
    
    console.warn('无法解析颜色值:', color);
    return null;
  } catch (error) {
    console.error('颜色解析错误:', error, '输入值:', color);
    return null;
  }
}

// ===== 初始化函数 =====
async function init() {
  const appStart = performance.now();
  loadingScreen = getLoadingScreen();
  console.log('初始化应用...');
  if (getLoadingScreen()) {
    loadingScreen.setStatus('正在初始化三维场景...');
  }
  initScene(); // 初始化场景
  initCamera(); // 初始化相机
  initRenderer(); // 初始化渲染器
  initControls(); // 初始化控制器
  initLights(); // 初始化光源
  initGrid(); // 初始化网格
  if (getLoadingScreen()) {
    loadingScreen.setStatus('正在同步材质与贴图...');
  }
  await initMaterials(); // 初始化材质（异步）
  if (getLoadingScreen()) {
    loadingScreen.setStatus('正在构建内部组件...');
  }
  initComponents(); // 初始化组件
  
  // 初始化波形显示
  updateScreenWaveform();
  
  // 初始化电子束（确保启动时就有电子束显示）
  updateElectronBeam();
  
  // 开始动画循环
  animate(); // 开始动画循环
  
  // 窗口自适应
  window.addEventListener('resize', onWindowResize);   // 窗口大小调整事件监听

  console.log(`[internal:perf] core scene ready in ${(performance.now() - appStart).toFixed(1)}ms`);
  if (getLoadingScreen()) {
    loadingScreen.complete('内部视图已就绪');
  }
  scheduleDeferredUiInitialization();
  console.log('应用初始化完成');
}

// ===== 场景初始化 =====
function initScene() {
  scene = new THREE.Scene(); // 创建场景
  scene.background = new THREE.Color(CONFIG.scene.background); // 设置场景背景颜色
}

// ===== 相机初始化 =====
function initCamera() {
  camera = new THREE.PerspectiveCamera( // 透视相机
    CONFIG.camera.fov, // 视角
    window.innerWidth / window.innerHeight, // 宽高比
    CONFIG.camera.near, // 近截面
    CONFIG.camera.far // 远截面
  );
  camera.position.set(CONFIG.camera.position.x, CONFIG.camera.position.y, CONFIG.camera.position.z); // 设置相机位置
}

// ===== 渲染器初始化 =====
function initRenderer() {
  renderer = new THREE.WebGLRenderer({ antialias: true }); // 创建渲染器
  
  // 高DPI屏幕适配
  const devicePixelRatio = window.devicePixelRatio || 1;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); // 限制最大DPI比率为2
  renderer.setSize(window.innerWidth, window.innerHeight); // 设置渲染器大小
  
  document.body.appendChild(renderer.domElement); // 将渲染器添加到文档中
}

// ===== 控制器初始化 =====
function initControls() { 
  controls = new OrbitControls(camera, renderer.domElement); // 创建控制器
  controls.enableDamping = true; // 启用阻尼
}

// ===== 光源初始化 =====
function initLights() { 
  // 环境光 - 为金属材质提供基础照明
  scene.add(new THREE.AmbientLight(0xffffff, 0.4)); 
  
  // 主要定向光 - 模拟太阳光，增强金属反射效果
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(10, 10, 5);
  directionalLight.castShadow = true;
  scene.add(directionalLight);
  
  // 补充点光源 - 从不同角度照亮金属表面
  const pointLight1 = new THREE.PointLight(0xffffff, 0.6);
  pointLight1.position.set(-10, 8, 8);
  scene.add(pointLight1);
  
  // 第二个点光源 - 增加金属材质的高光效果
  const pointLight2 = new THREE.PointLight(0xf0f0f0, 0.4);
  pointLight2.position.set(5, -5, 10);
  scene.add(pointLight2);
}

// ===== 网格地面初始化 =====
function initGrid() {
  const grid = new THREE.GridHelper(
    CONFIG.scene.grid.size, 
    CONFIG.scene.grid.divisions, 
    CONFIG.scene.grid.color1, 
    CONFIG.scene.grid.color2
  ); // 创建网格
  grid.position.set(
    CONFIG.scene.grid.position.x, 
    CONFIG.scene.grid.position.y, 
    CONFIG.scene.grid.position.z
  ); // 设置网格位置
  scene.add(grid); // 将网格添加到场景中
}

// ===== 材质初始化 =====
async function initMaterials() {
  const materialsStart = performance.now();
  console.log('初始化材质管理器...');
  materialManager = new MaterialManager();
  await materialManager.initializeMaterials();
  
  console.log('初始化统一组件材质管理器...');
  await unifiedComponentMaterial.initialize({
    sharedTextures: materialManager.getTextures(),
  });
  
  console.log(`[internal:perf] materials ready in ${(performance.now() - materialsStart).toFixed(1)}ms`);
}

function scheduleDeferred(callback) {
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(() => callback());
    return;
  }

  window.setTimeout(callback, 0);
}

function scheduleDeferredUiInitialization() {
  if (deferredUiInitialized) {
    return;
  }

  deferredUiInitialized = true;
  const deferredTasks = [
    {
      name: 'label system',
      run: () => {
        console.log('初始化标签系统...');
        initLabelSystem();
      },
    },
    {
      name: 'exploded view',
      run: () => {
        console.log('初始化分解视图...');
        initExplodedView();
      },
    },
    {
      name: 'gui',
      run: () => {
        console.log('初始化GUI...');
        initGui();
      },
    },
    {
      name: 'demo animation',
      run: () => {
        console.log('初始化演示动画...');
        initDemoAnimation();
      },
    },
  {
      name: 'ui controller',
      run: () => {
        console.log('初始化UI控制器...');
        initUIController();
      },
    },
    {
      name: 'examples',
      run: () => {
        console.log('初始化演示示例...');
        initDeferredExamples();
      },
    },
  ];

  const deferredStart = performance.now();

  const runTask = (index) => {
    if (index >= deferredTasks.length) {
      console.log(`[internal:perf] deferred ui ready in ${(performance.now() - deferredStart).toFixed(1)}ms`);
      return;
    }

    scheduleDeferred(() => {
      const task = deferredTasks[index];
      const taskStart = performance.now();
      task.run();
      console.log(
        `[internal:perf] deferred ${task.name} ready in ${(performance.now() - taskStart).toFixed(1)}ms`
      );
      runTask(index + 1);
    });
  };

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      runTask(0);
    });
  });
}

// ===== 组件初始化 =====
function initComponents() {
  // 从材质管理器获取材质
  const metalMat = materialManager.getMaterial('metal');
  const plateMat = materialManager.getMaterial('plate');
  const screenMat = materialManager.getMaterial('screen');
  const glowPointMat = materialManager.getMaterial('glowPoint');

  // 电子枪
  gun = new THREE.Mesh(
    new THREE.CylinderGeometry(CONFIG.components.gun.radius, 0.3, CONFIG.components.gun.height, 32),
    metalMat
  );
  gun.rotation.z = Math.PI / 2;
  gun.position.set(CONFIG.components.gun.position.x, CONFIG.components.gun.position.y, CONFIG.components.gun.position.z);
  scene.add(gun);

  gunHead = new THREE.Mesh(
    new THREE.CylinderGeometry(CONFIG.components.gunHead.radius, CONFIG.components.gunHead.radius, CONFIG.components.gunHead.height, 32),
    metalMat
  );
  gunHead.rotation.z = Math.PI / 2;
  gunHead.position.set(CONFIG.components.gunHead.position.x, CONFIG.components.gunHead.position.y, CONFIG.components.gunHead.position.z);
  scene.add(gunHead);

  // 垂直偏转板
  const vGeom = new THREE.BoxGeometry(CONFIG.components.verticalPlates.width, CONFIG.components.verticalPlates.height, CONFIG.components.verticalPlates.depth);
  v1 = new THREE.Mesh(vGeom, plateMat);
  v2 = v1.clone();

  v1.rotation.x = Math.PI / 2;
  v2.rotation.x = Math.PI / 2;
  // 再绕 Z 轴 90°
  v1.rotation.y += Math.PI / 2;
  v2.rotation.y += Math.PI / 2;

  v1.position.set(CONFIG.components.verticalPlates.positions[0].x, CONFIG.components.verticalPlates.positions[0].y, CONFIG.components.verticalPlates.positions[0].z);
  v2.position.set(CONFIG.components.verticalPlates.positions[1].x, CONFIG.components.verticalPlates.positions[1].y, CONFIG.components.verticalPlates.positions[1].z);
  scene.add(v1, v2);

  // 水平偏转板
  const hGeom = new THREE.BoxGeometry(CONFIG.components.horizontalPlates.width, CONFIG.components.horizontalPlates.height, CONFIG.components.horizontalPlates.depth);
  h1 = new THREE.Mesh(hGeom, plateMat);
  h2 = h1.clone();

  h1.rotation.x = -Math.PI / 2;
  h2.rotation.x = -Math.PI / 2;

  h1.position.set(CONFIG.components.horizontalPlates.positions[0].x, CONFIG.components.horizontalPlates.positions[0].y, CONFIG.components.horizontalPlates.positions[0].z);
  h2.position.set(CONFIG.components.horizontalPlates.positions[1].x, CONFIG.components.horizontalPlates.positions[1].y, CONFIG.components.horizontalPlates.positions[1].z);
  scene.add(h1, h2);

  // 荧光屏
  screen = new THREE.Mesh(new THREE.PlaneGeometry(CONFIG.components.screen.width, CONFIG.components.screen.height), screenMat); // 创建荧光屏
  screen.position.set(CONFIG.components.screen.position.x, CONFIG.components.screen.position.y, CONFIG.components.screen.position.z); // 设置荧光屏位置
  screen.rotation.y = -Math.PI / 2; // 设置荧光屏旋转
  screen.renderOrder = 1; // 设置渲染顺序，确保在电子粒子之前渲染
  scene.add(screen); // 将荧光屏添加到场景中
   
  
  // 初始化电子束控制器
  electronBeam = new ElectronBeam(scene);
  
  // 初始化波形生成器
  waveformGenerator = new WaveformGenerator();
  
  // 设置波形重置回调，在新周期开始时清除回扫线
  waveformGenerator.setWaveformResetCallback(() => {
    if (electronBeam) {
      electronBeam.startNewTraceSegment();
    }
  });
  
  // 初始化荧光屏控制器
  screenController = new Screen(scene, screen);
  
  // 初始化CRT外壳
  crtShell = new CRTShell();
  scene.add(crtShell.getShell());
  
}

function initDeferredExamples() {
  window.connectionDemo = new ConnectionPositionDemo(crtShell);
  window.transitionDemo = new SuperellipseTransitionDemo(crtShell);
}

// ===== 标签系统初始化 =====
function initLabelSystem() {
  // 创建标签系统
  labelSystem = new LabelSystem(scene, document.body);
  
  // 为各组件添加标签
  const componentLabels = [
    { id: 'gun', target: gun, text: CONFIG.descriptions.gun.name, offset: new THREE.Vector3(0, 0.5, 0), description: CONFIG.descriptions.gun.description },
    { id: 'gunHead', target: gunHead, text: CONFIG.descriptions.gunHead.name, offset: new THREE.Vector3(0, 0.3, 0), description: CONFIG.descriptions.gunHead.description },
    { id: 'v1', target: v1, text: CONFIG.descriptions.v1.name, offset: new THREE.Vector3(0, 0.3, 0), description: CONFIG.descriptions.v1.description },
    { id: 'v2', target: v2, text: CONFIG.descriptions.v2.name, offset: new THREE.Vector3(0, -0.3, 0), description: CONFIG.descriptions.v2.description },
    { id: 'h1', target: h1, text: CONFIG.descriptions.h1.name, offset: new THREE.Vector3(0, 0, 0.3), description: CONFIG.descriptions.h1.description },
    { id: 'h2', target: h2, text: CONFIG.descriptions.h2.name, offset: new THREE.Vector3(0, 0, -0.3), description: CONFIG.descriptions.h2.description },
    { id: 'screen', target: screen, text: CONFIG.descriptions.screen.name, offset: new THREE.Vector3(0.1, 0.5, 0), description: CONFIG.descriptions.screen.description }
  ];
  
  // 创建标签
  componentLabels.forEach(label => {
    labelSystem.createLabel(label.id, label.text, label.target, label.offset, label.description);
  });
}

// ===== 分解视图初始化 =====
function initExplodedView() {
  // 创建分解视图控制器
  // 注意：这些组件不参与分解动画，但需要引用以支持相机聚焦功能
  explodedView = new ExplodedView({
    // 添加主要组件的引用，用于相机聚焦功能
    // 这些组件不会有分解动画，但可以被聚焦
    gun: gun,
    gunHead: gunHead, 
    v1: v1,
    v2: v2,
    h1: h1,
    h2: h2,
    screen: screen
    // CRT外壳(crtShell)有自己的内部分解机制，不在此处理
  });
}

// ===== 演示动画初始化 =====
function initDemoAnimation() {
  // 创建演示动画控制器
  demoAnimation = new DemoAnimation(
    scene,
    {
      gun,
      gunHead,
      v1,
      v2,
      h1,
      h2,
      screen: screenController,  // 传递Screen类实例而不是THREE.js网格对象
      electronBeam,
      crtShell  // 添加crtShell组件
    },
    {
      camera,
      controls,
      screenController,
      guiController,  // 传递GUI控制器，用于演示时折叠面板
      onDeflectionChange: (deflectionParams) => {
        updateElectronBeam();
      },
      onWaveformChange: (waveformParams) => {
        updateElectronBeam();
        updateScreenWaveform();
      }
    }
  );
  
  // 设置全局引用供波形生成器使用
  window.demoAnimation = demoAnimation;
  
  // ===== 视角查看器 - 在控制台查看当前摄像头位置和目标 =====
  window.getView = function() {
    if (!camera || !controls) {
      console.warn('⚠️ 摄像头或控制器未初始化');
      return null;
    }
    
    const viewInfo = {
      position: { 
        x: Math.round(camera.position.x * 100) / 100,
        y: Math.round(camera.position.y * 100) / 100, 
        z: Math.round(camera.position.z * 100) / 100 
      },
      target: { 
        x: Math.round(controls.target.x * 100) / 100,
        y: Math.round(controls.target.y * 100) / 100, 
        z: Math.round(controls.target.z * 100) / 100 
      }
    };
    
    console.log('📷 当前视角信息:');
    console.log('位置 (position):', viewInfo.position);
    console.log('目标 (target):', viewInfo.target);
    console.log('---');
    console.log('复制用代码:');
    console.log(`position: { x: ${viewInfo.position.x}, y: ${viewInfo.position.y}, z: ${viewInfo.position.z} }`);
    console.log(`target: { x: ${viewInfo.target.x}, y: ${viewInfo.target.y}, z: ${viewInfo.target.z} }`);
    
    return viewInfo;
  };
}

// ===== GUI初始化 =====
function initGui() {
  guiController = new GuiController({
    onBeamChange: (beamParams) => {
      electronBeam.updateMaterial();
    },
    onDeflectionChange: (deflectionParams) => {
      updateElectronBeam();
    },
    onWaveformChange: (waveformParams) => {
      // 波形参数变化时，需要更新电子束
      updateElectronBeam();
      // 同时更新荧光屏上的波形显示
      updateScreenWaveform();
    },
    onScreenChange: (screenParams) => {
      screenController.updateMaterial();
    },
    onShellChange: (shellParams) => {
      if (crtShell) {
        crtShell.setVisible(shellParams.visible);
        crtShell.setOpacity(shellParams.opacity);
        
        
        // 处理第一个圆柱体
        if (shellParams.cylinder1) {
          if (shellParams.cylinder1.hasOwnProperty('visible')) {
            crtShell.setCylinder1Visible(shellParams.cylinder1.visible);
          }
          if (shellParams.cylinder1.hasOwnProperty('opacity')) {
            crtShell.setCylinder1Opacity(shellParams.cylinder1.opacity);
          }
          if (shellParams.cylinder1.color) {
            const cylinder1Color = parseColor(shellParams.cylinder1.color);
            if (cylinder1Color !== null) {
              crtShell.setCylinder1Color(cylinder1Color);
            }
          }
          if (shellParams.cylinder1.position) {
            crtShell.setCylinder1Position(
              shellParams.cylinder1.position.x,
              shellParams.cylinder1.position.y,
              shellParams.cylinder1.position.z
            );
          }
          if (shellParams.cylinder1.rotation) {
            crtShell.setCylinder1Rotation(
              shellParams.cylinder1.rotation.x,
              shellParams.cylinder1.rotation.y,
              shellParams.cylinder1.rotation.z
            );
          }
        }
        
        // 处理第二个圆柱体
        if (shellParams.cylinder2) {
          if (shellParams.cylinder2.hasOwnProperty('visible')) {
            crtShell.setCylinder2Visible(shellParams.cylinder2.visible);
          }
          if (shellParams.cylinder2.hasOwnProperty('opacity')) {
            crtShell.setCylinder2Opacity(shellParams.cylinder2.opacity);
          }
          if (shellParams.cylinder2.color) {
            const cylinder2Color = parseColor(shellParams.cylinder2.color);
            if (cylinder2Color !== null) {
              crtShell.setCylinder2Color(cylinder2Color);
            }
          }
          if (shellParams.cylinder2.position) {
            crtShell.setCylinder2Position(
              shellParams.cylinder2.position.x,
              shellParams.cylinder2.position.y,
              shellParams.cylinder2.position.z
            );
          }
          if (shellParams.cylinder2.rotation) {
            crtShell.setCylinder2Rotation(
              shellParams.cylinder2.rotation.x,
              shellParams.cylinder2.rotation.y,
              shellParams.cylinder2.rotation.z
            );
          }
        }
        
        // 注意：这里不需要调用updateConfig()，因为上面的set方法已经更新了相应的状态
        // 调用updateConfig()会导致重复创建组件，造成重复模型问题
        // crtShell.updateConfig();
      }
    }
  });
}

// ===== UI控制器初始化 =====
function initUIController() {
  // 创建UI控制器
  uiController = new UIController({
    components: {
      gun,
      gunHead,
      v1,
      v2,
      h1,
      h2,
      screen,
      crtShell
    },
    controllers: {
      camera,
      controls,
      labelSystem,
      explodedView,
      demoAnimation,
      screenController,
      onDeflectionChange: (deflectionParams) => {
        updateElectronBeam();
      },
      onWaveformChange: (waveformParams) => {
        updateElectronBeam();
        updateScreenWaveform();
      }
    }
  });
}

// ===== 更新电子束 =====
function updateElectronBeam() {
  let deflectionParams;
  
  // 如果波形启用，计算波形产生的偏转电压
  if (CONFIG.waveform.enabled) {
    const deflectionVoltage = waveformGenerator.calculateDeflectionVoltage(
      CONFIG.waveform,
      CONFIG.deflection
    );
    deflectionParams = {
      horizontal: { voltage: deflectionVoltage.horizontal },
      vertical: { voltage: deflectionVoltage.vertical }
    };
  } else {
    // 直接使用控制面板上的电压值
    deflectionParams = CONFIG.deflection;
  }
  
  // 更新电子束路径
  electronBeam.updateBeamPath(deflectionParams);
  
  // 更新荧光屏和动态光点
  updateScreenAndGlowPoint();
}

/**
 * 更新荧光屏波形显示
 * 在波形参数改变时清除旧的显示内容
 */
function updateScreenWaveform() {
  // 清除荧光屏上的所有荧光点
  if (screenController) {
    screenController.clearAllGlowPoints();
  }
  
  // 清除电子束的轨迹点
  if (electronBeam) {
    electronBeam.clearAllTraces();
  }
  
  // 重置波形生成器的时间，避免波形不连续
  // 这确保新的波形参数能从干净的状态开始显示
  if (waveformGenerator) {
    waveformGenerator.resetTime();
  }
  
  console.log('波形参数变化：已清除旧的波形显示，准备显示新波形');
}

/**
 * 更新荧光屏和动态光点
 */
function updateScreenAndGlowPoint() {
  const lastBeamPoint = electronBeam.beamPoints[electronBeam.beamPoints.length - 1];
  
  // 更新荧光屏上的点
  screenController.addGlowPoint(lastBeamPoint);
  
}

// ===== 窗口大小调整 =====
function onWindowResize() {
  // 获取实际显示尺寸，考虑DPI缩放
  const devicePixelRatio = window.devicePixelRatio || 1;
  const width = window.innerWidth;
  const height = window.innerHeight;
  
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  
  // 设置渲染器尺寸，考虑高DPI
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); // 限制最大DPI比率为2
  
  // 更新标签系统
  if (labelSystem) {
    labelSystem.resize(width, height);
  }
  
  // 更新UI控制器
  if (uiController) {
    uiController.resize(width, height);
  }
}

// ===== 动画循环 =====
function animate(timestamp) {
  requestAnimationFrame(animate);
  
  // 更新控制器
  controls.update();
  
  // 更新波形生成器
  waveformGenerator.update(timestamp);
  
  // 持续更新电子束（无论波形是否启用都要更新）
  // 这确保了电子束始终可见并响应参数变化
  updateElectronBeam();
  
  // 更新荧光屏效果
  screenController.update();
  
  // 更新CRT外壳
  if (crtShell) {
    crtShell.update(timestamp);
  }
  
  // 更新分解视图
  if (explodedView) {
    explodedView.update();
  }
  
  // 更新演示动画
  if (demoAnimation) {
    demoAnimation.update();
  }
  
  // 更新标签系统
  if (labelSystem) {
    labelSystem.update(camera);
  }
  
  // 更新TWEEN（使用新的 Group API）
  tweenGroup.update();
  
  // 渲染场景
  renderer.render(scene, camera);
}

// ===== 启动应用 =====
init().catch(error => {
  console.error('应用初始化失败:', error);
  if (getLoadingScreen()) {
    loadingScreen.fail('内部视图加载失败，请刷新重试');
  }
});

// ===== 初始化右上角切换控件（内部页） =====
const bootInternalSwitcher = () => {
  if (typeof document !== 'undefined') {
    renderSwitcher('internal');
  }
};
if (typeof document !== 'undefined' && document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootInternalSwitcher);
} else {
  bootInternalSwitcher();
}

