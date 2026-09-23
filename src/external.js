// ===== 统一工程化入口：外部（面板/示波器）页面 =====

// ===== 第三方依赖导入 =====
import Vue from 'vue';

// ===== 样式文件导入 =====
import '../public/styles.css';

// ===== 导入 switcher 模块（ES6 导入，并在 DOM 就绪后初始化） =====
import { renderSwitcher } from '../src/widgets/switcher.js';
// 导入 TourGuide 模块（ES6 模块化）
import { tourGuideManager } from './widgets/index.js';

// ===== 核心模块导入 =====
import { OscilloscopeConstants } from '../scripts/constants.js';
import * as WaveformUtilities from '../scripts/WaveformUtilities.js';
import { WaveDrawer } from '../scripts/waveDrawer.js';
import LissajousDrawer from '../scripts/lissajousDrawer.js';
import CalibrationLogic from '../scripts/calibrationLogic.js';
import { StepAdjustmentUtils } from '../scripts/StepAdjustmentUtils.js';
import DeepSeekService from '../scripts/deepseekService.js';
import KnowledgeBase from '../scripts/knowledgeBase.js';

// ===== 全局变量定义 =====
let app; // Vue 应用实例

// ===== 应用配置 =====
const APP_CONFIG = {
  canvas: {
    width: OscilloscopeConstants.CANVAS.WIDTH,
    height: OscilloscopeConstants.CANVAS.HEIGHT
  },
  defaultValues: {
    calibrationFactor: 0.85,
    timeDiv: 1,
    voltsDiv: { 1: 1, 2: 1 },
    peakValues: { 1: 1, 2: 1 },
    frequencies: { 1: 1, 2: 1 }
  }
};

// ===== 初始化函数 =====
function initApp() {
  console.log('初始化智波助梦应用...');
  
  try {
    // 创建 Vue 应用实例
    app = createVueApp();
    
    // 挂载应用
    app.$mount('#app');
    
    console.log('智波助梦应用初始化完成');
  } catch (error) {
    console.error('应用初始化失败:', error);
  }
}

// ===== Vue 应用创建函数 =====
function createVueApp() {
  return new Vue({
    el: '#app',
    data: {
      // 当前模式，'wave'表示波形模式
      currentMode: 'wave',

      // 可选波形类型列表
      waveTypes: [
        { type: 'sine', name: '正弦波' },
        { type: 'square', name: '方波' },
        { type: 'triangle', name: '三角波' },
        { type: 'sawtooth', name: '锯齿波' },
        { type: 'noise', name: '噪声' },
        { type: 'pulse', name: '脉冲波' }
      ],

      // 当前波形类型，默认为正弦波
      signalType: 'sine',
      // 1号和2号输入通道激活状态
      inputActive: { 1: false, 2: false },
      // 显示模式: 'independent'（独立显示）, 'overlay'（同向叠加）, 'vertical'（垂直叠加）
      displayMode: 'independent',
      // 时间分度值（例如，1表示1个单位时间，每单位时间在显示上按8格计算）
      timeDiv: APP_CONFIG.defaultValues.timeDiv,
      // 电压分度值（单位：伏），分别对应1号和2号通道
      voltsDiv: { ...APP_CONFIG.defaultValues.voltsDiv },
      // X轴和Y轴频率（单位：Hz），用于李萨如图
      freqX: 1,
      freqY: 1,
      // 相位差（单位：度），用于李萨如图
      phaseDiff: 90,
      // Canvas上下文，绘制波形使用
      ctx: null,
      // 动画帧ID，用于控制动画循环
      animationId: null,
      // 当前相位，随时间变化（单位：弧度）
      phase: 0,
      // 存储点历史记录，用于绘制波形
      pointsHistory: [],
      // 精细时间分度值
      timeDivFine: APP_CONFIG.defaultValues.timeDiv,
      // 精细电压分度值，分别对应1号和2号通道
      voltsDivFine: { ...APP_CONFIG.defaultValues.voltsDiv },
      // 滑块是否被拖动
      isDragging: false,
      // 上一次有效值，用于验证输入
      lastValidValue: {
        time: APP_CONFIG.defaultValues.timeDiv,
        volts: { ...APP_CONFIG.defaultValues.voltsDiv }
      },
      // 滑块值，用于调整时间和电压分度
      sliderValues: {
        time: APP_CONFIG.defaultValues.timeDiv,
        volts: { 1: 0, 2: 0 }
      },
      // 峰值电压，分别对应1号和2号通道（单位：伏）
      peakValues: { ...APP_CONFIG.defaultValues.peakValues },
      // 频率值，分别对应1号和2号通道（单位：Hz）
      frequencies: { ...APP_CONFIG.defaultValues.frequencies },
      // 当前峰值电压
      peakValue: 1,
      // 当前频率
      frequency: 1,
      // 当前激活的滑块
      sliderActive: null,
      // 滑块偏移值
      sliderOffset: 0,
      // 是否需要重绘
      needsRedraw: false,
      // 是否正在运行（运行状态）
      isRunning: true,
      // 触发电平，范围-5到5伏（1伏=40像素，中心点200px）
      triggerLevel: 0,
      // 触发模式：auto, normal, single
      triggerMode: 'auto',
      // 暂停时显示的帧
      lastCapturedFrame: null,
      // 实验步骤控制
      expStep: 'calibration', // 'calibration', 'normal', 'lissajous'
      calibrationFactor: APP_CONFIG.defaultValues.calibrationFactor, // 校准系数，1.0为标准校准

      // 自检模式专用数据 - 调整频率单位表示
      calibrationParams: {
        frequencies: { 1: 1, 2: 1 },  // 修改为1赫兹以匹配界面显示
        peakValues: { 1: 4, 2: 4 },    // 保持5V峰值
        waveTypes: { 1: 'square', 2: 'square' } // 两个通道都使用方波信号
      },

      // 添加校准状态
      calibrationComplete: false,

      // 添加显示微调系数
      displayAdjustFactors: {
        time: 1.0,
        volts: { 1: 1.0, 2: 1.0 }
      },

      // 保存自检页面的校准参数（新增）
      savedCalibrationSettings: {
        displayAdjustFactors: {
          time: 1.0,
          volts: { 1: 1.0, 2: 1.0 }
        },
        calibrationFactor: APP_CONFIG.defaultValues.calibrationFactor
      },

      // 添加水平和垂直位置控制
      horizontalPosition: 0, // 水平位置偏移，单位：格
      verticalPosition: { 1: 0, 2: 0 }, // 垂直位置偏移，单位：格，分别对应1号和2号通道

      triggerActive: true,      // 触发系统是否激活
      triggerSource: 1,         // 触发源通道（1或2）
      triggerSlope: 'rising',   // 触发斜率：rising（上升）或falling（下降）

      // 添加李萨如图优化相关属性
      lissajousOptimization: {
        maxPoints: 5000,      // 最大渲染点数
        highFrequencyThreshold: 20, // 高频率阈值
        autoSimplifyRatio: true     // 自动简化频率比例
      },

      // VR寻波功能数据
      vrwave: {
        mapLoaded: false,
        mapInstance: null,
        locationInfo: null,
        currentTerrain: null,
        selectedTerrain: null,
        matchedLocation: null,
        terrainImageUrl: null,
        matchedLocationImageUrl: null,
        sandboxMode: false,
        nearbyPOIs: [],
        loadingNearby: false,
        terrainLocations: {
          mountain: [
            { name: '珠穆朗玛峰', lng: 86.9250, lat: 27.9881, address: '西藏自治区日喀则市定日县珠穆朗玛峰', zoom: 10, image: 'https://images.unsplash.com/photo-1516483638261-f4dbaf036963?w=640&q=80' },
            { name: '泰山', lng: 117.1110, lat: 36.2571, address: '山东省泰安市泰山风景区', zoom: 12, image: 'https://images.unsplash.com/photo-1548013146-72479768bada?w=640&q=80' },
            { name: '黄山', lng: 118.1690, lat: 30.1370, address: '安徽省黄山市黄山风景区', zoom: 12, image: 'https://images.unsplash.com/photo-1585409677983-0f6c41ca9c3b?w=640&q=80' },
            { name: '华山', lng: 110.0680, lat: 34.4840, address: '陕西省渭南市华阴市华山', zoom: 12, image: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=640&q=80' },
            { name: '庐山', lng: 115.9880, lat: 29.5570, address: '江西省九江市庐山风景区', zoom: 12, image: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=640&q=80' },
            { name: '武当山', lng: 111.0040, lat: 32.4000, address: '湖北省十堰市武当山风景区', zoom: 12, image: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=640&q=80' },
            { name: '神农架', lng: 110.6710, lat: 31.7480, address: '湖北省神农架林区', zoom: 11, image: 'https://images.unsplash.com/photo-1454496522488-7a8e488e8606?w=640&q=80' },
            { name: '峨眉山', lng: 103.3310, lat: 29.5180, address: '四川省乐山市峨眉山风景区', zoom: 12, image: 'https://images.unsplash.com/photo-1483728642387-6c3bdd6c93e5?w=640&q=80' },
            { name: '长白山', lng: 128.0840, lat: 42.0070, address: '吉林省延边朝鲜族自治州安图县长白山', zoom: 11, image: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=640&q=80' },
            { name: '玉龙雪山', lng: 100.2000, lat: 27.1000, address: '云南省丽江市玉龙雪山', zoom: 12, image: 'https://images.unsplash.com/photo-1509316785289-025f5b846b35?w=640&q=80' },
            { name: '九宫山', lng: 114.6000, lat: 29.4000, address: '湖北省咸宁市通山县九宫山', zoom: 12, image: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=640&q=80' },
            { name: '大别山', lng: 115.8000, lat: 31.1000, address: '湖北省黄冈市大别山', zoom: 10, image: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=640&q=80' }
          ],
          water: [
            { name: '西湖', lng: 120.1480, lat: 30.2420, address: '浙江省杭州市西湖区西湖风景区', zoom: 13, image: 'https://images.unsplash.com/photo-1439066615861-d1af74d74000?w=640&q=80' },
            { name: '洱海', lng: 100.1870, lat: 25.7750, address: '云南省大理白族自治州大理市洱海', zoom: 11, image: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=640&q=80' },
            { name: '千岛湖', lng: 119.0120, lat: 29.6080, address: '浙江省杭州市淳安县千岛湖', zoom: 11, image: 'https://images.unsplash.com/photo-1439066615861-d1af74d74000?w=640&q=80' },
            { name: '鄱阳湖', lng: 116.2710, lat: 29.1520, address: '江西省九江市庐山市鄱阳湖', zoom: 10, image: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=640&q=80' },
            { name: '东湖', lng: 114.3680, lat: 30.5600, address: '湖北省武汉市武昌区东湖风景区', zoom: 13, image: 'https://images.unsplash.com/photo-1439066615861-d1af74d74000?w=640&q=80' },
            { name: '南湖', lng: 114.3500, lat: 30.5200, address: '湖北省武汉市洪山区南湖', zoom: 14, image: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=640&q=80' },
            { name: '汤逊湖', lng: 114.3800, lat: 30.4800, address: '湖北省武汉市江夏区汤逊湖', zoom: 13, image: 'https://images.unsplash.com/photo-1439066615861-d1af74d74000?w=640&q=80' },
            { name: '长江', lng: 114.2980, lat: 30.5840, address: '湖北省武汉市武昌区长江段', zoom: 12, image: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=640&q=80' },
            { name: '汉江', lng: 114.2700, lat: 30.5700, address: '湖北省武汉市硚口区汉江', zoom: 12, image: 'https://images.unsplash.com/photo-1439066615861-d1af74d74000?w=640&q=80' },
            { name: '梁子湖', lng: 114.5000, lat: 30.2500, address: '湖北省鄂州市梁子湖', zoom: 12, image: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=640&q=80' }
          ],
          plain: [
            { name: '华北平原', lng: 116.4070, lat: 39.9040, address: '北京市华北平原', zoom: 8, image: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=640&q=80' },
            { name: '长江中下游平原', lng: 114.3420, lat: 30.5460, address: '湖北省武汉市长江中下游平原', zoom: 8, image: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=640&q=80' },
            { name: '东北平原', lng: 125.3260, lat: 43.8970, address: '吉林省长春市东北平原', zoom: 8, image: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=640&q=80' },
            { name: '成都平原', lng: 104.0720, lat: 30.6630, address: '四川省成都市成都平原', zoom: 9, image: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=640&q=80' },
            { name: '江汉平原', lng: 113.5000, lat: 30.5000, address: '湖北省江汉平原', zoom: 9, image: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=640&q=80' },
            { name: '洞庭湖平原', lng: 112.5000, lat: 29.3000, address: '湖南省岳阳市洞庭湖平原', zoom: 9, image: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=640&q=80' }
          ],
          forest: [
            { name: '神农架林区', lng: 110.6710, lat: 31.7480, address: '湖北省神农架林区', zoom: 11, image: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=640&q=80' },
            { name: '西双版纳热带雨林', lng: 100.7970, lat: 22.0010, address: '云南省西双版纳傣族自治州热带雨林', zoom: 11, image: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=640&q=80' },
            { name: '长白山原始森林', lng: 128.0840, lat: 42.0070, address: '吉林省延边朝鲜族自治州安图县长白山', zoom: 11, image: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=640&q=80' },
            { name: '大兴安岭', lng: 123.8510, lat: 52.3380, address: '黑龙江省大兴安岭地区', zoom: 8, image: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=640&q=80' },
            { name: '磨山', lng: 114.4000, lat: 30.5500, address: '湖北省武汉市武昌区磨山景区', zoom: 14, image: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=640&q=80' },
            { name: '马鞍山森林公园', lng: 114.3900, lat: 30.5200, address: '湖北省武汉市洪山区马鞍山森林公园', zoom: 14, image: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=640&q=80' },
            { name: '九峰山', lng: 114.4200, lat: 30.5000, address: '湖北省武汉市洪山区九峰山', zoom: 14, image: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=640&q=80' }
          ],
          valley: [
            { name: '雅鲁藏布大峡谷', lng: 95.0050, lat: 29.8380, address: '西藏自治区林芝市雅鲁藏布大峡谷', zoom: 10, image: 'https://images.unsplash.com/photo-1474044159687-1ee9f3a51722?w=640&q=80' },
            { name: '长江三峡', lng: 111.0030, lat: 30.8230, address: '湖北省宜昌市长江三峡', zoom: 10, image: 'https://images.unsplash.com/photo-1474044159687-1ee9f3a51722?w=640&q=80' },
            { name: '虎跳峡', lng: 100.0930, lat: 27.1760, address: '云南省迪庆藏族自治州香格里拉市虎跳峡', zoom: 12, image: 'https://images.unsplash.com/photo-1474044159687-1ee9f3a51722?w=640&q=80' },
            { name: '恩施大峡谷', lng: 109.4280, lat: 30.4370, address: '湖北省恩施土家族苗族自治州恩施大峡谷', zoom: 11, image: 'https://images.unsplash.com/photo-1474044159687-1ee9f3a51722?w=640&q=80' },
            { name: '黄仙洞', lng: 112.6000, lat: 31.2000, address: '湖北省钟祥市黄仙洞', zoom: 12, image: 'https://images.unsplash.com/photo-1474044159687-1ee9f3a51722?w=640&q=80' }
          ],
          ocean: [
            { name: '马里亚纳海沟', lng: 142.2000, lat: 11.3500, address: '太平洋西部马里亚纳海沟', zoom: 6, image: 'https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=640&q=80' },
            { name: '南海深海区', lng: 115.5000, lat: 13.5000, address: '南海深海区域', zoom: 7, image: 'https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=640&q=80' },
            { name: '东太平洋海隆', lng: -103.0000, lat: 21.5000, address: '东太平洋海隆深海区域', zoom: 6, image: 'https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=640&q=80' },
            { name: '冲绳海槽', lng: 126.5000, lat: 27.0000, address: '东海冲绳海槽深海区域', zoom: 8, image: 'https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=640&q=80' }
          ]
        },
        terrainImages: {
          mountain: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=640&q=80',
          water: 'https://images.unsplash.com/photo-1439066615861-d1af74d74000?w=640&q=80',
          plain: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=640&q=80',
          forest: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=640&q=80',
          valley: 'https://images.unsplash.com/photo-1474044159687-1ee9f3a51722?w=640&q=80',
          ocean: 'https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=640&q=80'
        },
        terrainTypes: [
          {
            id: 'mountain',
            name: '山脉',
            icon: '⛰️',
            waveType: 'sawtooth',
            waveName: '锯齿波',
            frequency: 3,
            amplitude: 4,
            description: '山脉地形起伏连绵，对应锯齿波形，其缓慢上升和快速下降的特征模拟了山脉的缓坡和陡崖。'
          },
          {
            id: 'water',
            name: '水面',
            icon: '🌊',
            waveType: 'sine',
            waveName: '正弦波',
            frequency: 2,
            amplitude: 3,
            description: '水面波浪具有平滑周期性特征，对应正弦波形，完美模拟了水波的自然振荡规律。'
          },
          {
            id: 'plain',
            name: '平原',
            icon: '🌾',
            waveType: 'sine',
            waveName: '低频正弦波',
            frequency: 0.5,
            amplitude: 1,
            description: '平原地形起伏极小，对应低频低幅正弦波，表示地形的微小缓慢变化。'
          },
          {
            id: 'forest',
            name: '森林',
            icon: '🌲',
            waveType: 'noise',
            waveName: '噪声波',
            frequency: 5,
            amplitude: 2,
            description: '森林地形结构复杂多变，对应噪声波形，其随机性和高频特征反映了树木密集交错的复杂结构。'
          },
          {
            id: 'valley',
            name: '峡谷',
            icon: '🏜️',
            waveType: 'square',
            waveName: '方波',
            frequency: 1.5,
            amplitude: 5,
            description: '峡谷地形有明显的高低落差，对应方波形，其陡峭的上升下降边缘模拟了峡谷的垂直崖壁。'
          },
          {
            id: 'ocean',
            name: '深海',
            icon: '🐋',
            waveType: 'triangle',
            waveName: '三角波',
            frequency: 1,
            amplitude: 2.5,
            description: '深海地形的海沟和海脊形成对称的起伏，对应三角波形，其线性上升下降特征模拟了海底的对称地形。'
          }
        ]
      },

      // 图片识别波形功能数据
      imagewave: {
        imageUrl: null,
        imageData: null,
        dragOver: false,
        analysisResult: null,
        history: [],
        aiAnalyzing: false,
        aiResult: null,
        aiError: null,
        aiPrompt: '',
        displayModeDetected: 'independent'
      },

      // AI助手聊天数据
      aiChat: {
        isOpen: false,
        isTyping: false,
        inputMessage: '',
        messages: [
          {
            id: 1,
            role: 'assistant',
            content: '你好！我是智波助梦的AI助手 🤖\n\n我可以帮你解答关于系统使用的问题，比如：\n• 如何进行自检校准？\n• 怎样使用同向叠加/垂直叠加模式？\n• 如何调整波形参数？\n• 李萨如图怎么看？\n• VR寻波功能怎么用？\n\n有什么问题尽管问我！',
            time: new Date().toLocaleTimeString()
          }
        ]
      },
    },
    mounted() {
      try {
        this.initCanvas();
        this.initEventListeners();
        this.startDrawLoop();
        console.log('Vue 组件挂载完成');
      } catch (error) {
        console.error('Vue 组件挂载失败:', error);
      }
    },
    beforeDestroy() {
      this.cleanup();
    },
    computed: {
      // 计算滑块的最小值，最大值和步进值
      sliderRanges() {
        return {
          time: {
            min: StepAdjustmentUtils.adjustTimeDiv(this.timeDiv, -1),
            max: StepAdjustmentUtils.adjustTimeDiv(this.timeDiv, 1),
            step: 0.01 // 滑块步长保持精细调节
          },
          volts1: {
            min: StepAdjustmentUtils.adjustVoltsDiv(this.voltsDiv[1], -1),
            max: StepAdjustmentUtils.adjustVoltsDiv(this.voltsDiv[1], 1),
            step: 0.01 // 滑块步长保持精细调节
          },
          volts2: {
            min: StepAdjustmentUtils.adjustVoltsDiv(this.voltsDiv[2], -1),
            max: StepAdjustmentUtils.adjustVoltsDiv(this.voltsDiv[2], 1),
            step: 0.01 // 滑块步长保持精细调节
          }
        }
      },
      // 计算触发电平在屏幕上的位置（中心200像素，1伏=40像素）
      triggerLevelPosition() {
        return 200 - (this.triggerLevel * 40);
      },
      // 当前模式下的有效参数
      effectiveParams() {
        if (this.expStep === 'calibration') {
          return {
            frequencies: this.calibrationParams.frequencies,
            peakValues: this.calibrationParams.peakValues,
            waveTypes: this.calibrationParams.waveTypes
          };
        } else {
          return {
            frequencies: this.frequencies,
            peakValues: this.peakValues,
            waveType: this.signalType
          };
        }
      },
      // 校准状态指示（使用CalibrationLogic模块）
      calibrationStatus() {
        return CalibrationLogic.checkCalibrationStatus(this.calibrationFactor);
      },
      // 计算简化后的频率比例（使用LissajousDrawer模块）
      simplifiedRatio() {
        const gcd = LissajousDrawer.gcdPrecise(this.freqX, this.freqY);
        if (gcd < 0.001) return { x: this.freqX, y: this.freqY };

        let simplifiedX = this.freqX / gcd;
        let simplifiedY = this.freqY / gcd;

        if (Math.abs(Math.round(simplifiedX) - simplifiedX) < 0.01) {
          simplifiedX = Math.round(simplifiedX);
        } else {
          simplifiedX = parseFloat(simplifiedX.toFixed(2));
        }
        
        if (Math.abs(Math.round(simplifiedY) - simplifiedY) < 0.01) {
          simplifiedY = Math.round(simplifiedY);
        } else {
          simplifiedY = parseFloat(simplifiedY.toFixed(2));
        }
        
        return { x: simplifiedX, y: simplifiedY };
      },
      // 判断是否需要显示简化比例（如果原始比例和简化比例不同）
      needsSimplification() {
        return this.freqX !== this.simplifiedRatio.x || this.freqY !== this.simplifiedRatio.y;
      }
    },
    watch: {
      // 同步时间分度和滑块状态
      timeDiv(val) {
        this.timeDivFine = val;
        this.lastValidValue.time = val;
        this.sliderValues.time = 0;
      },
      'voltsDiv.1'(val) {
        this.voltsDivFine[1] = val;
        this.lastValidValue.volts[1] = val;
        this.sliderValues.volts[1] = 0;
      },
      'voltsDiv.2'(val) {
        this.voltsDivFine[2] = val;
        this.lastValidValue.volts[2] = val;
        this.sliderValues.volts[2] = 0;
      },
      // 监听校准系数变化
      calibrationFactor(newVal) {
        this.needsRedraw = true;
        this.calibrationComplete = Math.abs(newVal - 1.0) < 0.02;
        
        // 同步保存到savedCalibrationSettings
        this.savedCalibrationSettings.calibrationFactor = newVal;
      }
    },
    methods: {
      // ===== Canvas 初始化 =====
      initCanvas() {
        const canvas = this.$refs.oscilloscope;
        if (!canvas) {
          throw new Error('Canvas element not found');
        }
        
        // 动态设置Canvas像素尺寸（避免CSS缩放失真）
        canvas.width = APP_CONFIG.canvas.width;
        canvas.height = APP_CONFIG.canvas.height;
        this.ctx = canvas.getContext('2d');
        
        if (!this.ctx) {
          throw new Error('Failed to get canvas context');
        }
        
        // 初始化值
        this.peakValues = { 1: this.peakValue, 2: this.peakValue };
        this.frequencies = { 1: this.frequency, 2: this.frequency };

        // 默认将校准系数设置为0.85，模拟需要校准的初始状态
        this.calibrationFactor = APP_CONFIG.defaultValues.calibrationFactor;

        // 默认开启通道1，这样画面上就会有波形显示
        this.$set(this.inputActive, 1, false);
        this.$set(this.inputActive, 2, false);
      },

      // ===== 事件监听器初始化 =====
      initEventListeners() {
        document.addEventListener('mousemove', this.handleMouseMove);
        document.addEventListener('mouseup', this.handleMouseUp);
      },

      // ===== 清理函数 =====
      cleanup() {
        // 取消动画帧
        if (this.animationId) {
          cancelAnimationFrame(this.animationId);
          this.animationId = null;
        }
        
        // 移除所有事件监听器
        document.removeEventListener('mousemove', this.handleMouseMove);
        document.removeEventListener('mouseup', this.handleMouseUp);
        document.removeEventListener('mousemove', this.handleSliderMove);
        document.removeEventListener('mouseup', this.handleSliderEnd);
      },

      // ===== 绘图循环启动 =====
      startDrawLoop() {
        this.drawLoop();
      },

      // ===== 计算滑块位置的辅助函数 =====
      calculateSliderPosition(type, line) {
        if (type === 'time') {
          // 将0.1-2.0范围映射到0-1范围
          return (this.displayAdjustFactors.time - 0.1) / 1.9;
        } else if (type === 'volts' && line) {
          // 将0.1-2.0范围映射到0-1范围
          return (this.displayAdjustFactors.volts[line] - 0.1) / 1.9;
        }
        return 0;
      },
      
      // ===== 模式控制 =====
      switchMode(mode) {
        if (mode === 'lissajous') {
          // 使用LissajousDrawer模块化函数切换到李萨如图模式
          Object.assign(this, LissajousDrawer.switchToLissajousMode(this));
        } else {
          // 使用LissajousDrawer模块化函数切换回波形模式
          Object.assign(this, LissajousDrawer.switchToWaveMode(this));
        }
      },

      // ===== 实验步骤控制 =====
      setExpStep(step) {
        // 使用CalibrationLogic模块化函数设置实验步骤
        Object.assign(this, CalibrationLogic.setExperimentStep(this, step));
        
        // 如果切换到标准测量模式，输出当前校准参数到控制台
        if (step === 'normal') {
          console.log('当前校准参数 (仅控制台显示)', 
            'background:#42b983; color:white; padding:4px 6px; border-radius:3px; font-weight:bold', 
            'font-weight:normal');
          console.log('校准系数: ' + this.savedCalibrationSettings.calibrationFactor.toFixed(2));
          console.log('时间微调: ' + this.savedCalibrationSettings.displayAdjustFactors.time.toFixed(2));
          console.log('通道1电压微调: ' + this.savedCalibrationSettings.displayAdjustFactors.volts[1].toFixed(2));
          console.log('通道2电压微调: ' + this.savedCalibrationSettings.displayAdjustFactors.volts[2].toFixed(2));
        }
      },

      // ===== 波形控制 =====
      setSignalType(type) {
        // 使用WaveDrawer模块化函数更新波形类型
        Object.assign(this, WaveDrawer.updateWaveformType(this, type));
        this.refreshDisplay();
      },

      // ===== 控制运行状态 =====
      toggleRunning() {
        this.isRunning = !this.isRunning;
        if (this.isRunning) {
          this.drawLoop();
        } else {
          cancelAnimationFrame(this.animationId);
          this.lastCapturedFrame = this.ctx.getImageData(0, 0, 800, 400);
        }
      },

      // ===== 绘图工具方法：获取有效校准参数 =====
      getEffectiveCalibrationParams() {
        const useCalibrationParams = this.expStep === 'calibration';
        
        return {
          useCalibrationParams,
          effectiveCalibrationFactor: useCalibrationParams ? 
                                      this.calibrationFactor : 
                                      this.savedCalibrationSettings.calibrationFactor,
          effectiveDisplayFactors: useCalibrationParams ? 
                                  this.displayAdjustFactors : 
                                  this.savedCalibrationSettings.displayAdjustFactors
        };
      },
      
      // ===== 绘图工具方法：调整触发相位 =====
      adjustTriggerPhase() {
        if (!this.inputActive[1] && !this.inputActive[2]) return this.phase;
        
        const { useCalibrationParams, effectiveCalibrationFactor, effectiveDisplayFactors } = 
          this.getEffectiveCalibrationParams();
        
        // 使用WaveDrawer模块处理触发器相位调整
        return WaveDrawer.adjustPhaseForTrigger({
          triggerActive: this.triggerActive,
          triggerSource: this.triggerSource,
          inputActive: this.inputActive,
          voltsDiv: this.voltsDiv,
          peakValues: this.peakValues,
          frequencies: this.frequencies,
          timeDiv: this.timeDiv,
          expStep: this.expStep,
          calibrationParams: this.calibrationParams,
          signalType: this.signalType,
          phase: this.phase,
          triggerLevel: this.triggerLevel,
          triggerSlope: this.triggerSlope,
          displayAdjustFactors: effectiveDisplayFactors,
          calibrationFactor: effectiveCalibrationFactor
        });
      },
      
      // ===== 绘图工具方法：绘制波形 =====
      renderWaveforms() {
        const { CONSTANTS, CHANNEL_COLORS } = WaveformUtilities;
        
        // 判断是否使用同向叠加模式且两个通道都激活
        if (this.displayMode === 'overlay' && this.inputActive[1] && this.inputActive[2]) {
          // 获取有效校准参数
          const { effectiveCalibrationFactor, effectiveDisplayFactors } = 
            this.getEffectiveCalibrationParams();
          
          // 绘制叠加波形
          WaveDrawer.drawOverlayWave(this.ctx, {
            expStep: this.expStep, 
            signalType: this.signalType,
            calibrationParams: this.calibrationParams,
            timeDiv: this.timeDiv,
            frequencies: this.frequencies,
            peakValues: this.peakValues,
            voltsDiv: this.voltsDiv,
            phase: this.phase,
            displayAdjustFactors: effectiveDisplayFactors,
            calibrationFactor: effectiveCalibrationFactor,
            horizontalPosition: this.horizontalPosition,
            verticalPosition: {
              1: this.verticalPosition[1],
              2: this.verticalPosition[2]
            },
            inputActive: this.inputActive,
            phaseDiff: this.phaseDiff
          });
        } else {
          // 非叠加模式或只有一个通道激活时，正常绘制各通道波形
          if (this.inputActive[1]) this.drawWave(1, CHANNEL_COLORS[1]);
          if (this.inputActive[2]) this.drawWave(2, CHANNEL_COLORS[2]);
        }
      },
      
      // ===== 绘图工具方法：渲染李萨如图模式 =====
      renderLissajousMode() {
        // 检查是否两个通道都开启
        if (this.inputActive[1] && this.inputActive[2]) {
          this.drawLissajous();
        } else {
          // 如有通道未开启，显示提示信息
          const { CONSTANTS } = WaveformUtilities;
          const ctx = this.ctx;
          
          ctx.font = '18px Arial';
          ctx.fillStyle = '#666';
          ctx.textAlign = 'center';
          ctx.fillText('请开启两个通道以显示李萨如图', 
                      CONSTANTS.CANVAS.WIDTH / 2, 
                      CONSTANTS.CANVAS.HEIGHT / 2);
        }
      },
      
      // ===== 绘图工具方法：初始化画布 =====
      setupCanvas() {
        const { CONSTANTS } = WaveformUtilities;
        const ctx = this.ctx;
        
        // 清除画布
        ctx.clearRect(0, 0, CONSTANTS.CANVAS.WIDTH, CONSTANTS.CANVAS.HEIGHT);
        
        // 绘制网格
        WaveformUtilities.drawGrid(ctx);
        
        // 波形模式下绘制触发电平线
        if (this.currentMode === 'wave' || this.expStep === 'calibration') {
          WaveDrawer.drawTriggerLevel(ctx, this.triggerLevelPosition);
        }
      },
      
      // ===== 暂停状态下刷新显示 =====
      refreshDisplay() {
        // 设置画布
        this.setupCanvas();
        
        if (this.currentMode === 'wave' || this.expStep === 'calibration') {
          // 调整相位
          if (this.inputActive[1] || this.inputActive[2]) {
            this.phase = this.adjustTriggerPhase();
          }
          
          // 绘制波形
          this.renderWaveforms();
        } else {
          // 李萨如图模式
          this.renderLissajousMode();
        }
        
        // 保存当前画布状态
        if (!this.isRunning) {
          const { CONSTANTS } = WaveformUtilities;
          this.lastCapturedFrame = this.ctx.getImageData(
            0, 0, CONSTANTS.CANVAS.WIDTH, CONSTANTS.CANVAS.HEIGHT
          );
        }
      },

      // ===== 调整触发电平 =====
      adjustLevel(delta) {
        this.triggerLevel = WaveformUtilities.clamp(this.triggerLevel + delta, -5, 5);
        this.needsRedraw = true;
        this.refreshDisplay();
      },

      // ===== 绘图主循环 =====
      drawLoop() {
        try {
          if (!this.isRunning) return;

          // 设置画布
          this.setupCanvas();

          if (this.currentMode === 'wave' || this.expStep === 'calibration') {
            // 调整相位
            if (this.inputActive[1] || this.inputActive[2]) {
              this.phase = this.adjustTriggerPhase();
            }
            
            // 绘制波形
            this.renderWaveforms();
          } else {
            // 李萨如图模式
            this.renderLissajousMode();
          }

          if (this.isRunning) {
            // 在演示动画期间减慢50%
            const phaseIncrement = (window.demoAnimation && window.demoAnimation.isPlaying) ? 0.01 : 0.02;
            this.phase += phaseIncrement;
            this.animationId = requestAnimationFrame(this.drawLoop);
          }
        } catch (error) {
          console.error('Draw loop error:', error);
        }
      },

      // ===== 绘制波形（包装WaveDrawer模块的函数） =====
      drawWave(line, color) {
        try {
          // 获取有效校准参数
          const { effectiveCalibrationFactor, effectiveDisplayFactors } = 
            this.getEffectiveCalibrationParams();
          
          // 使用WaveDrawer模块绘制波形
          WaveDrawer.drawWave(this.ctx, {
            line, 
            color, 
            expStep: this.expStep, 
            signalType: this.signalType,
            calibrationParams: this.calibrationParams,
            timeDiv: this.timeDiv,
            frequencies: this.frequencies,
            peakValues: this.peakValues,
            voltsDiv: this.voltsDiv,
            phase: this.phase,
            displayAdjustFactors: effectiveDisplayFactors,
            calibrationFactor: effectiveCalibrationFactor,
            horizontalPosition: this.horizontalPosition,
            verticalPosition: this.verticalPosition[line],
            displayMode: this.displayMode,
            phaseDiff: this.phaseDiff
          });
        } catch (error) {
          console.error('Wave drawing failed:', error);
        }
      },

      // ===== 绘制李萨如图（包装LissajousDrawer模块的函数） =====
      drawLissajous() {
        try {
          // 通道检查已在renderLissajousMode方法中处理，这里可直接绘制
          LissajousDrawer.drawLissajous(this.ctx, {
            freqX: this.freqX,
            freqY: this.freqY,
            phaseDiff: this.phaseDiff,
            phase: this.phase,
            lissajousOptimization: this.lissajousOptimization,
            peakValues: this.peakValues,
            horizontalPosition: this.horizontalPosition,
            verticalPosition: this.verticalPosition,
            voltsDiv: this.voltsDiv
          });
        } catch (error) {
          console.error('Lissajous drawing failed:', error);
        }
      },

      // ===== 输入控制 =====
      handleInput(type, value, line) {
        try {
          let parsedValue = Number(value);
          if (isNaN(parsedValue)) {
            throw new Error('Invalid input: Not a number');
          }

          if (type === 'time') {
            // 使用1:2:5步长比例获取最接近的有效值
            const closestValue = StepAdjustmentUtils.getClosestTimeDiv(parsedValue);
            this.timeDiv = WaveformUtilities.clamp(closestValue, 0.1, 100);
            this.sliderValues.time = 0;
          } else if (type === 'volts') {
            // 使用1:2:5步长比例获取最接近的有效值
            const closestValue = StepAdjustmentUtils.getClosestVoltsDiv(parsedValue);
            this.voltsDiv[line] = WaveformUtilities.clamp(closestValue, 0.01, 10);
            this.sliderValues.volts[line] = 0;
          }
          this.needsRedraw = true;
        } catch (error) {
          console.error('Input handling failed:', error);
        }
      },

      // ===== 滑块控制 =====
      onSliderStart() {
        this.isDragging = true;
      },
      onSliderEnd() {
        this.isDragging = false;
      },
      handleSliderInput(type, line, event) {
        try {
          const percent = parseFloat(event.target.value);
          if (type === 'time') {
            this.displayAdjustFactors.time = 1.0 + percent * 0.2;
          } else if (type === 'volts') {
            this.displayAdjustFactors.volts[line] = 1.0 + percent * 0.2;
          }
          this.needsRedraw = true;
        } catch (error) {
          console.error('Slider input handling failed:', error);
        }
      },
      startSlider(type, line) {
        this.sliderActive = { type, line };
        this.sliderStartValue = type === 'time' 
          ? this.displayAdjustFactors.time 
          : this.displayAdjustFactors.volts[line];
        
        // 记录起始鼠标位置
        this.sliderStartMouseX = null;
        
        document.addEventListener('mousemove', this.handleSliderMove);
        document.addEventListener('mouseup', this.handleSliderEnd);
      },
      handleSliderMove(event) {
        if (!this.sliderActive) return;
        
        const { type, line } = this.sliderActive;
      
        // 获取滑块的 min/max 范围，动态计算灵敏度
        const range = type === 'time' 
          ? { min: 0.1, max: 2.0 } 
          : { min: 0.1, max: 2.0 };
        const valueRange = range.max - range.min;
        const sensitivity = valueRange / 300; // 鼠标移动1px，变动1/300的范围，适应新的300px宽度
      
        const adjustAmount = event.movementX * sensitivity;
      
        Object.assign(this, CalibrationLogic.updateAdjustFactor(this, type, line, adjustAmount));
        
        if (type === 'time'){
          console.log(`时间微调: ${this.displayAdjustFactors.time.toFixed(2)}`);
        } else if (type === 'volts') {
          console.log(`通道${line}电压微调: ${this.displayAdjustFactors.volts[line].toFixed(2)}`);
        }
        
        this.refreshDisplay();
      },
      handleSliderEnd() {
        this.sliderActive = null;
        document.removeEventListener('mousemove', this.handleSliderMove);
        document.removeEventListener('mouseup', this.handleSliderEnd);
      },
      handleMouseMove(event) {
        // 当前仅处理非滑块相关的鼠标移动
        if (this.someOtherDragOperation) {
          // 可扩展其他拖动操作
        }
      },
      toggleInput(line) {
        try {
          this.$set(this.inputActive, line, !this.inputActive[line]);
          this.needsRedraw = true;
          if (this.expStep === 'calibration' || !this.isRunning) {
            this.refreshDisplay();
          }
        } catch (error) {
          console.error('Toggle input failed:', error);
        }
      },
      calculateRange(type, line) {
        return {
          min: -1,
          max: 1,
          step: 0.01
        };
      },
      adjustParam(param, step, line) {
        try {
          const direction = step > 0 ? 1 : -1;
          
          if (['freqX', 'freqY', 'phaseDiff'].includes(param)) {
            // 使用1:2:5步长比例调整李萨如参数
            if (param === 'freqX') {
              this.freqX = StepAdjustmentUtils.adjustFrequency(this.freqX, direction);
            } else if (param === 'freqY') {
              this.freqY = StepAdjustmentUtils.adjustFrequency(this.freqY, direction);
            } else if (param === 'phaseDiff') {
              this.phaseDiff = StepAdjustmentUtils.adjustPhase(this.phaseDiff, direction);
            }
          } else {
            // 使用1:2:5步长比例调整示波器参数
            if (param === 'timeDiv') {
              this.timeDiv = StepAdjustmentUtils.adjustTimeDiv(this.timeDiv, direction);
            } else if (param === 'voltsDiv' && line) {
              this.voltsDiv[line] = StepAdjustmentUtils.adjustVoltsDiv(this.voltsDiv[line], direction);
            }
          }
          this.refreshDisplay();
        } catch (error) {
          console.error('Parameter adjustment failed:', error);
        }
      },
      validateInput(type, line) {
        try {
          if (type === 'time') {
            // 使用1:2:5步长比例验证时间分度
            const closestValue = StepAdjustmentUtils.getClosestTimeDiv(this.timeDiv);
            this.timeDiv = WaveformUtilities.clamp(closestValue, 0.1, 100);
          } else if (type === 'volts' && line) {
            // 使用1:2:5步长比例验证电压分度
            const closestValue = StepAdjustmentUtils.getClosestVoltsDiv(this.voltsDiv[line]);
            this.voltsDiv[line] = WaveformUtilities.clamp(closestValue, 0.01, 10);
          }
          this.refreshDisplay();
        } catch (error) {
          console.error('Input validation failed:', error);
        }
      },
      resetTrigger() {
        if (!this.isRunning) {
          console.log('暂停状态下无法重置触发电平，请先恢复运行');
          alert('暂停状态下无法重置触发电平，请先恢复运行');
          return;
        }
        
        // 使用WaveDrawer模块化函数重置触发系统
        Object.assign(this, WaveDrawer.resetTriggerSystem(this));
        console.log('触发电平已重置为0');
        this.needsRedraw = true;
      },
      toggleTriggerSlope() {
        // 使用WaveDrawer模块化函数切换触发斜率
        this.triggerSlope = WaveDrawer.toggleTriggerSlope(this.triggerSlope);
        this.needsRedraw = true;
        this.refreshDisplay();
      },
      setTriggerSource(channel) {
        if (channel === 1 || channel === 2) {
          this.triggerSource = channel;
          this.needsRedraw = true;
          this.refreshDisplay();
        }
      },
      // ===== 调整位置参数（水平位置和垂直位置） =====
      adjustPosition(type, step, line) {
        try {
          // 位置采用“对齐网格”的固定步长（0.1格），保证与方格对齐
          const unit = 0.1;
          const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
          const snap = (v) => Math.round(v / unit) * unit; // 对齐到 0.1 的倍数

          // 若模板传入 step（如 ±0.1），直接作为增量使用；否则回退到 ±unit
          const delta = (typeof step === 'number' && !Number.isNaN(step) && step !== 0)
            ? step
            : unit;

          if (type === 'horizontal') {
            // 为符合直觉：点按“左”应使波形向左移动，这里反向应用增量
            const updated = this.horizontalPosition - delta;
            this.horizontalPosition = clamp(snap(updated), -8, 8);
          } else if (type === 'vertical' && line) {
            const updated = this.verticalPosition[line] + delta;
            this.verticalPosition[line] = clamp(snap(updated), -4, 4);
          }
          this.needsRedraw = true;
          this.refreshDisplay();
        } catch (error) {
          console.error('Position adjustment failed:', error);
        }
      },
      // ===== 设置显示模式 =====
      setDisplayMode(mode) {
        if (['independent', 'overlay', 'vertical'].includes(mode)) {
          // 如果是overlay或vertical模式，需要检查两个通道是否都已激活
          if (mode === 'overlay' || mode === 'vertical') {
            // 如果两个通道都激活，才设置为该模式
            if (this.inputActive[1] && this.inputActive[2]) {
              this.displayMode = mode;
            } else {
              // 如果有通道未激活，提示用户并保持原来的显示模式
              const modeName = mode === 'overlay' ? '同向叠加' : '垂直叠加';
              console.log(`请先激活两个通道后再使用${modeName}模式`);
              alert(`${modeName}模式需要两个通道都激活！请先开启通道1和通道2。`);
              return;
            }
          } else {
            // 非overlay和vertical模式，直接设置
            this.displayMode = mode;
          }
          
          // 当选择垂直叠加时，自动切换到李萨如图模式
          if (mode === 'vertical') {
            this.switchMode('lissajous');
          } else if (this.currentMode === 'lissajous' && mode !== 'vertical') {
            // 从垂直叠加切换回其他模式时，自动切换回波形模式
            this.switchMode('wave');
          }
          
          this.needsRedraw = true;
          this.refreshDisplay();
        }
      },

      // ===== VR寻波功能方法 =====
      initBaiduMap() {
        if (typeof BMap === 'undefined') {
          console.warn('百度地图API未加载，进入沙箱模式');
          this.vrwave.sandboxMode = true;
          this.vrwave.mapLoaded = true;
          this.enterSandboxMode();
          return;
        }
        try {
          const map = new BMap.Map(this.$refs.baiduMap || 'baidu-map-container');
          const point = new BMap.Point(116.404, 39.915);
          map.centerAndZoom(point, 12);
          map.enableScrollWheelZoom(true);
          map.addControl(new BMap.NavigationControl());
          map.addControl(new BMap.ScaleControl());
          map.addControl(new BMap.MapTypeControl());

          map.addEventListener('click', (e) => {
            this.handleMapClick(e.point);
          });

          this.vrwave.mapInstance = map;
          this.vrwave.mapLoaded = true;
          this.vrwave.sandboxMode = false;
          console.log('百度地图初始化完成');
        } catch (error) {
          console.error('地图初始化失败，进入沙箱模式:', error);
          this.vrwave.sandboxMode = true;
          this.vrwave.mapLoaded = true;
          this.enterSandboxMode();
        }
      },

      enterSandboxMode() {
        this.vrwave.locationInfo = {
          lng: 116.404,
          lat: 39.915,
          address: '北京市天安门广场（沙箱模拟位置）'
        };
        this.searchNearbyTerrain(116.404, 39.915);
      },

      getCurrentLocation() {
        if (this.vrwave.sandboxMode) {
          const sandboxLocations = [
            { lng: 120.150, lat: 30.250, address: '浙江省杭州市西湖区（沙箱模拟）' },
            { lng: 116.397, lat: 39.908, address: '北京市海淀区颐和园（沙箱模拟）' },
            { lng: 121.474, lat: 31.230, address: '上海市黄浦江畔（沙箱模拟）' },
            { lng: 114.305, lat: 30.593, address: '湖北省武汉市东湖（沙箱模拟）' },
            { lng: 102.682, lat: 25.038, address: '云南省昆明市滇池（沙箱模拟）' }
          ];
          const loc = sandboxLocations[Math.floor(Math.random() * sandboxLocations.length)];
          this.vrwave.locationInfo = loc;
          this.searchNearbyTerrain(loc.lng, loc.lat);
          return;
        }
        if (!this.vrwave.mapInstance) return;
        const geolocation = new BMap.Geolocation();
        geolocation.getCurrentPosition((result) => {
          const status = geolocation.getStatus();
          if (status === 0) {
            const point = result.point;
            this.vrwave.mapInstance.centerAndZoom(point, 15);
            const marker = new BMap.Marker(point);
            this.vrwave.mapInstance.clearOverlays();
            this.vrwave.mapInstance.addOverlay(marker);

            const geoc = new BMap.Geocoder();
            geoc.getLocation(point, (rs) => {
              const addr = rs.addressComponents;
              this.vrwave.locationInfo = {
                lng: point.lng,
                lat: point.lat,
                address: addr.province + addr.city + addr.district + addr.street
              };
              this.inferTerrainFromLocation(addr);
              this.searchNearbyTerrain(point.lng, point.lat);
            });
          } else {
            alert('定位失败，请检查定位权限或手动在地图上点击选择位置。');
          }
        });
      },

      handleMapClick(point) {
        if (!this.vrwave.mapInstance) return;
        const marker = new BMap.Marker(point);
        this.vrwave.mapInstance.clearOverlays();
        this.vrwave.mapInstance.addOverlay(marker);

        const geoc = new BMap.Geocoder();
        geoc.getLocation(point, (rs) => {
          const addr = rs.addressComponents;
          this.vrwave.locationInfo = {
            lng: point.lng,
            lat: point.lat,
            address: rs.address
          };
          this.inferTerrainFromLocation(addr);
          this.searchNearbyTerrain(point.lng, point.lat);
        });
      },

      async searchNearbyTerrain(lng, lat) {
        this.vrwave.loadingNearby = true;
        this.vrwave.nearbyPOIs = [];

        if (this.vrwave.sandboxMode) {
          setTimeout(() => {
            this.vrwave.nearbyPOIs = this.generateSandboxPOIs(lng, lat);
            this.vrwave.loadingNearby = false;
            if (this.vrwave.nearbyPOIs.length > 0) {
              this.autoMatchNearbyTerrain(this.vrwave.nearbyPOIs[0]);
            }
          }, 800);
          return;
        }

        try {
          const pois = await this.baiduLocalSearch(lng, lat);
          this.vrwave.nearbyPOIs = pois;
          if (pois.length > 0) {
            this.autoMatchNearbyTerrain(pois[0]);
          }
        } catch (error) {
          console.error('搜索附近地形失败:', error);
          this.vrwave.nearbyPOIs = this.generateSandboxPOIs(lng, lat);
        } finally {
          this.vrwave.loadingNearby = false;
        }
      },

      baiduLocalSearch(lng, lat) {
        return new Promise((resolve) => {
          const pois = [];

          const categories = [
            { key: 'water', keywords: ['湖泊', '河流', '水库'] },
            { key: 'mountain', keywords: ['山', '山峰'] },
            { key: 'forest', keywords: ['森林', '公园'] },
            { key: 'valley', keywords: ['峡谷', '山谷'] }
          ];

          let totalKeywords = 0;
          categories.forEach(c => totalKeywords += c.keywords.length);
          let completedSearches = 0;
          let resolved = false;

          const tryResolve = () => {
            if (resolved) return;
            if (completedSearches >= totalKeywords) {
              resolved = true;
              const uniquePois = this.deduplicatePOIs(pois);
              uniquePois.sort((a, b) => a.distance - b.distance);
              resolve(uniquePois.slice(0, 10));
            }
          };

          categories.forEach(category => {
            category.keywords.forEach(keyword => {
              if (typeof BMap === 'undefined') {
                completedSearches++;
                tryResolve();
                return;
              }
              const local = new BMap.LocalSearch(this.vrwave.mapInstance, {
                renderOptions: { map: null },
                pageCapacity: 5,
                onSearchComplete: (results) => {
                  try {
                    if (results && typeof results.getCurrentNumPois === 'function') {
                      const numPois = results.getCurrentNumPois();
                      for (let i = 0; i < numPois; i++) {
                        const poi = results.getPoi(i);
                        if (poi && poi.point) {
                          const dist = this.calcDistance(lng, lat, poi.point.lng, poi.point.lat);
                          if (dist < 50) {
                            pois.push({
                              name: poi.title,
                              address: poi.address || '',
                              lng: poi.point.lng,
                              lat: poi.point.lat,
                              distance: dist,
                              terrainType: category.key,
                              source: 'baidu'
                            });
                          }
                        }
                      }
                    }
                  } catch (e) {
                    console.warn('解析POI结果异常:', e);
                  }
                  completedSearches++;
                  tryResolve();
                }
              });
              try {
                local.searchNearby(keyword, new BMap.Point(lng, lat), 20000);
              } catch (e) {
                console.warn('搜索失败:', keyword, e);
                completedSearches++;
                tryResolve();
              }
            });
          });

          setTimeout(() => {
            if (!resolved) {
              resolved = true;
              const uniquePois = this.deduplicatePOIs(pois);
              uniquePois.sort((a, b) => a.distance - b.distance);
              resolve(uniquePois.slice(0, 10));
            }
          }, 6000);
        });
      },

      calcDistance(lng1, lat1, lng2, lat2) {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
          Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
      },

      deduplicatePOIs(pois) {
        const seen = new Set();
        return pois.filter(poi => {
          const key = poi.name + '_' + poi.lng.toFixed(2) + '_' + poi.lat.toFixed(2);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      },

      generateSandboxPOIs(lng, lat) {
        const terrainPool = {
          water: [
            { name: '模拟湖泊A', offset: [0.02, 0.01] },
            { name: '模拟河流B', offset: [-0.03, 0.015] },
            { name: '模拟水库C', offset: [0.01, -0.02] }
          ],
          mountain: [
            { name: '模拟山峰D', offset: [-0.04, 0.03] },
            { name: '模拟丘陵E', offset: [0.05, -0.01] }
          ],
          forest: [
            { name: '模拟森林F', offset: [0.03, 0.04] },
            { name: '模拟公园G', offset: [-0.02, -0.03] }
          ],
          valley: [
            { name: '模拟峡谷H', offset: [-0.05, -0.02] }
          ],
          plain: [
            { name: '模拟平原I', offset: [0.01, 0.02] }
          ]
        };

        const pois = [];
        Object.entries(terrainPool).forEach(([type, items]) => {
          items.forEach(item => {
            const poiLng = lng + item.offset[0];
            const poiLat = lat + item.offset[1];
            pois.push({
              name: item.name,
              address: `模拟地址 (${poiLng.toFixed(4)}, ${poiLat.toFixed(4)})`,
              lng: poiLng,
              lat: poiLat,
              distance: this.calcDistance(lng, lat, poiLng, poiLat),
              terrainType: type,
              source: 'sandbox'
            });
          });
        });

        pois.sort((a, b) => a.distance - b.distance);
        return pois;
      },

      autoMatchNearbyTerrain(poi) {
        const terrain = this.vrwave.terrainTypes.find(t => t.id === poi.terrainType);
        if (terrain) {
          this.vrwave.selectedTerrain = terrain.id;
          this.vrwave.currentTerrain = { ...terrain };
          this.vrwave.terrainImageUrl = this.vrwave.terrainImages[terrain.id] || null;
          this.vrwave.matchedLocation = {
            name: poi.name,
            address: poi.address,
            lng: poi.lng,
            lat: poi.lat,
            zoom: 14
          };
          this.fetchLocationImage(poi);

          if (this.vrwave.mapInstance && !this.vrwave.sandboxMode) {
            const point = new BMap.Point(poi.lng, poi.lat);
            this.vrwave.mapInstance.clearOverlays();
            this.vrwave.mapInstance.centerAndZoom(point, 14);
            const marker = new BMap.Marker(point);
            this.vrwave.mapInstance.addOverlay(marker);
          }
        }
      },

      async fetchLocationImage(poi) {
        const terrain = this.vrwave.terrainTypes.find(t => t.id === poi.terrainType);
        if (!terrain) return;

        this.vrwave.matchedLocationImageUrl = this.vrwave.terrainImages[poi.terrainType] || null;

        const terrainKeywords = {
          mountain: 'mountain,peak',
          water: 'lake,river,water',
          plain: 'field,plain,grassland',
          forest: 'forest,trees,woods',
          valley: 'canyon,valley,gorge',
          ocean: 'ocean,sea,waves'
        };

        const keywords = terrainKeywords[poi.terrainType] || 'landscape,nature';
        const unsplashUrl = `https://source.unsplash.com/640x360/?${keywords}`;
        
        const img = new Image();
        img.onload = () => {
          this.vrwave.matchedLocationImageUrl = unsplashUrl;
        };
        img.onerror = () => {
          console.warn('Unsplash图片加载失败，使用默认地形图片');
        };
        img.src = unsplashUrl;
      },

      closeTerrainImage() {
        this.vrwave.terrainImageUrl = null;
        this.vrwave.matchedLocationImageUrl = null;
      },

      inferTerrainFromLocation(addr) {
        const address = JSON.stringify(addr);
        let terrainId = 'plain';
        if (/海|洋/.test(address) && !/上海|北海|威海|珠海|海口/.test(address)) {
          terrainId = 'ocean';
        } else if (/山|峰|岭|岳|高原/.test(address)) {
          terrainId = 'mountain';
        } else if (/湖|江|河|湾|溪|海(?!口)|水库|潭|池/.test(address)) {
          terrainId = 'water';
        } else if (/林|森|树/.test(address)) {
          terrainId = 'forest';
        } else if (/谷|峡|沟|涧/.test(address)) {
          terrainId = 'valley';
        }
        this.vrwave.terrainImageUrl = this.vrwave.terrainImages[terrainId] || null;
        const terrain = this.vrwave.terrainTypes.find(t => t.id === terrainId);
        if (terrain) {
          this.selectTerrain(terrain);
        }
      },

      selectTerrain(terrain) {
        this.vrwave.selectedTerrain = terrain.id;
        this.vrwave.currentTerrain = { ...terrain };
        this.vrwave.terrainImageUrl = this.vrwave.terrainImages[terrain.id] || null;
        this.matchTerrainToLocation(terrain.id);
      },

      matchTerrainToLocation(terrainId) {
        if (this.vrwave.nearbyPOIs.length > 0) {
          const matchingPoi = this.vrwave.nearbyPOIs.find(p => p.terrainType === terrainId);
          if (matchingPoi) {
            this.vrwave.matchedLocation = {
              name: matchingPoi.name,
              address: matchingPoi.address,
              lng: matchingPoi.lng,
              lat: matchingPoi.lat,
              zoom: 14
            };
            this.fetchLocationImage(matchingPoi);
            if (this.vrwave.mapInstance && !this.vrwave.sandboxMode) {
              const point = new BMap.Point(matchingPoi.lng, matchingPoi.lat);
              this.vrwave.mapInstance.clearOverlays();
              this.vrwave.mapInstance.centerAndZoom(point, 14);
              const marker = new BMap.Marker(point);
              this.vrwave.mapInstance.addOverlay(marker);
            }
            return;
          }
        }

        const locations = this.vrwave.terrainLocations[terrainId];
        if (!locations || locations.length === 0) {
          this.vrwave.matchedLocation = null;
          this.vrwave.matchedLocationImageUrl = null;
          return;
        }

        const curLng = this.vrwave.locationInfo ? this.vrwave.locationInfo.lng : 116.404;
        const curLat = this.vrwave.locationInfo ? this.vrwave.locationInfo.lat : 39.915;
        let matched = locations[0];
        let minDist = Infinity;
        for (const loc of locations) {
          const dLng = loc.lng - curLng;
          const dLat = loc.lat - curLat;
          const dist = dLng * dLng + dLat * dLat;
          if (dist < minDist) {
            minDist = dist;
            matched = loc;
          }
        }
        this.vrwave.matchedLocation = { ...matched };

        if (matched.image) {
          this.vrwave.matchedLocationImageUrl = matched.image;
        } else {
          this.vrwave.matchedLocationImageUrl = this.vrwave.terrainImages[terrainId] || null;
          this.fetchLocationImage({ name: matched.name, terrainType: terrainId });
        }

        if (this.vrwave.mapInstance && !this.vrwave.sandboxMode) {
          const point = new BMap.Point(matched.lng, matched.lat);
          this.vrwave.mapInstance.clearOverlays();
          this.vrwave.mapInstance.centerAndZoom(point, matched.zoom);
          const marker = new BMap.Marker(point);
          this.vrwave.mapInstance.addOverlay(marker);
          const infoWindow = new BMap.InfoWindow(
            `<div style="padding:8px;min-width:180px;">
              <div style="font-weight:bold;font-size:14px;margin-bottom:4px;">${matched.name}</div>
              <div style="font-size:12px;color:#666;">${matched.address}</div>
              <div style="font-size:11px;color:#999;margin-top:4px;">经度: ${matched.lng.toFixed(4)} 纬度: ${matched.lat.toFixed(4)}</div>
            </div>`
          );
          marker.openInfoWindow(infoWindow);
        }
      },

      applyTerrainWave() {
        if (!this.vrwave.currentTerrain) return;
        const terrain = this.vrwave.currentTerrain;
        this.setExpStep('normal');
        this.signalType = terrain.waveType;
        this.$set(this.frequencies, 1, terrain.frequency);
        this.$set(this.peakValues, 1, terrain.amplitude);
        this.$set(this.inputActive, 1, true);
        this.needsRedraw = true;
        this.refreshDisplay();
        console.log(`已应用地形波形: ${terrain.waveName} (${terrain.waveType}), 频率: ${terrain.frequency}Hz, 幅度: ${terrain.amplitude}V`);
      },

      applyWaveformToTerrain(waveType, frequency, amplitude) {
        const terrainScores = this.vrwave.terrainTypes.map(terrain => {
          let score = 0;
          if (terrain.waveType === waveType) score += 40;
          const freqDiff = Math.abs(terrain.frequency - frequency);
          score += Math.max(0, 20 - freqDiff * 10);
          const ampDiff = Math.abs(terrain.amplitude - amplitude);
          score += Math.max(0, 20 - ampDiff * 5);
          if (terrain.waveType === waveType && freqDiff < 1) score += 20;
          return { terrain, score };
        });

        terrainScores.sort((a, b) => b.score - a.score);
        const bestMatch = terrainScores[0];

        if (bestMatch && bestMatch.score > 20) {
          this.selectTerrain(bestMatch.terrain);
          console.log(`波形反向匹配结果: ${bestMatch.terrain.name} (得分: ${bestMatch.score})`);
        } else {
          alert('无法从当前波形匹配到合适的地形类型');
        }
      },

      // ===== 图片识别波形功能方法 =====
      triggerImageUpload() {
        this.$refs.imageUploadInput.click();
      },

      handleImageUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        this.processImageFile(file);
      },

      handleImageDrop(event) {
        this.imagewave.dragOver = false;
        const file = event.dataTransfer.files[0];
        if (!file || !file.type.startsWith('image/')) {
          alert('请上传图片文件！');
          return;
        }
        this.processImageFile(file);
      },

      processImageFile(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          this.imagewave.imageUrl = e.target.result;
          const img = new Image();
          img.onload = () => {
            this.analyzeImage(img);
          };
          img.src = e.target.result;
        };
        reader.readAsDataURL(file);
      },

      analyzeImage(img) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const scale = Math.min(800 / img.width, 600 / img.height, 1);
        canvas.width = Math.floor(img.width * scale);
        canvas.height = Math.floor(img.height * scale);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const w = canvas.width;
        const h = canvas.height;
        
        const gray = new Float32Array(w * h);
        for (let i = 0; i < w * h; i++) {
          const idx = i * 4;
          gray[i] = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        }
        
        let histogram = new Uint32Array(256);
        for (let i = 0; i < gray.length; i++) {
          histogram[Math.round(gray[i])]++;
        }
        
        let totalPixels = gray.length;
        let sum = 0;
        for (let i = 0; i < 256; i++) sum += i * histogram[i];
        let sumB = 0, wB = 0, maxVariance = 0, threshold = 128;
        for (let i = 0; i < 256; i++) {
          wB += histogram[i];
          if (wB === 0) continue;
          let wF = totalPixels - wB;
          if (wF === 0) break;
          sumB += i * histogram[i];
          let mB = sumB / wB;
          let mF = (sum - sumB) / wF;
          let variance = wB * wF * (mB - mF) * (mB - mF);
          if (variance > maxVariance) {
            maxVariance = variance;
            threshold = i;
          }
        }
        
        const margin = Math.floor(w * 0.05);
        const startX = margin;
        const endX = w - margin;
        const sampleLen = endX - startX;
        
        const waveformY = new Float32Array(sampleLen);
        for (let x = startX; x < endX; x++) {
          let totalWeight = 0;
          let weightedY = 0;
          let foundDark = false;
          let darkestY = h / 2;
          let darkestVal = 255;
          
          for (let y = 0; y < h; y++) {
            const val = gray[y * w + x];
            if (val < darkestVal) {
              darkestVal = val;
              darkestY = y;
            }
            if (val < threshold) {
              const weight = (threshold - val) / threshold;
              totalWeight += weight;
              weightedY += y * weight;
              foundDark = true;
            }
          }
          
          if (foundDark && totalWeight > 0) {
            waveformY[x - startX] = weightedY / totalWeight;
          } else {
            waveformY[x - startX] = darkestY;
          }
        }
        
        let minY = Infinity, maxY = -Infinity;
        for (let i = 0; i < waveformY.length; i++) {
          if (waveformY[i] < minY) minY = waveformY[i];
          if (waveformY[i] > maxY) maxY = waveformY[i];
        }
        const rangeY = maxY - minY || 1;
        
        const normalized = new Float32Array(sampleLen);
        for (let i = 0; i < sampleLen; i++) {
          normalized[i] = 1 - ((waveformY[i] - minY) / rangeY) * 2;
        }
        
        const lightSmoothed = new Float32Array(sampleLen);
        for (let i = 0; i < sampleLen; i++) {
          let sum = 0, count = 0;
          for (let j = Math.max(0, i - 1); j <= Math.min(sampleLen - 1, i + 1); j++) {
            sum += normalized[j];
            count++;
          }
          lightSmoothed[i] = sum / count;
        }

        const medSmoothWindow = Math.max(3, Math.floor(sampleLen / 150));
        const smoothed = new Float32Array(sampleLen);
        for (let i = 0; i < sampleLen; i++) {
          let sum = 0, count = 0;
          for (let j = Math.max(0, i - medSmoothWindow); j <= Math.min(sampleLen - 1, i + medSmoothWindow); j++) {
            sum += normalized[j];
            count++;
          }
          smoothed[i] = sum / count;
        }
        
        const derivative = new Float32Array(sampleLen - 1);
        for (let i = 0; i < sampleLen - 1; i++) {
          derivative[i] = smoothed[i + 1] - smoothed[i];
        }
        
        let zeroCrossings = 0;
        let lastSign = smoothed[0] >= 0 ? 1 : -1;
        for (let i = 1; i < sampleLen; i++) {
          const sign = smoothed[i] >= 0 ? 1 : -1;
          if (sign !== lastSign) {
            zeroCrossings++;
            lastSign = sign;
          }
        }
        
        const periods = Math.max(1, Math.round(zeroCrossings / 2));
        const GRID_COLS = 16;
        const assumedTimeDiv = this.timeDiv || 1;
        const estimatedFreq = Math.max(0.1, Math.min(10, periods / (assumedTimeDiv * GRID_COLS)));
        
        const peaks = [];
        const valleys = [];
        const minDistance = Math.max(5, Math.floor(sampleLen / (periods * 3)));
        
        for (let i = minDistance; i < sampleLen - minDistance; i++) {
          let isPeak = true;
          let isValley = true;
          for (let j = i - minDistance; j <= i + minDistance; j++) {
            if (smoothed[j] > smoothed[i]) isPeak = false;
            if (smoothed[j] < smoothed[i]) isValley = false;
          }
          if (isPeak && smoothed[i] > 0.1) peaks.push({ x: i, y: smoothed[i] });
          if (isValley && smoothed[i] < -0.1) valleys.push({ x: i, y: smoothed[i] });
        }
        
        const meanVal = smoothed.reduce((s, v) => s + v, 0) / sampleLen;
        const variance = smoothed.reduce((s, v) => s + (v - meanVal) ** 2, 0) / sampleLen;
        const rms = Math.sqrt(variance);
        
        const absSignal = smoothed.map(v => Math.abs(v));
        const absMean = absSignal.reduce((s, v) => s + v, 0) / sampleLen;
        
        let flatHighCount = 0;
        let flatLowCount = 0;
        let flatHighStrict = 0;
        let flatLowStrict = 0;
        const flatThresholdLow = 0.5;
        const flatThresholdHigh = 0.85;
        for (let i = 0; i < sampleLen; i++) {
          if (lightSmoothed[i] > flatThresholdHigh) flatHighStrict++;
          if (lightSmoothed[i] < -flatThresholdHigh) flatLowStrict++;
          if (lightSmoothed[i] > flatThresholdLow) flatHighCount++;
          if (lightSmoothed[i] < -flatThresholdLow) flatLowCount++;
        }
        const flatRatio = (flatHighCount + flatLowCount) / sampleLen;
        const flatRatioHigh = (flatHighStrict + flatLowStrict) / sampleLen;

        const bins = 20;
        const histBins = new Uint32Array(bins);
        for (let i = 0; i < sampleLen; i++) {
          const bin = Math.min(bins - 1, Math.floor((lightSmoothed[i] + 1) / 2 * bins));
          histBins[bin]++;
        }
        const midBin = Math.floor(bins / 2);
        const lowBins = histBins.slice(0, midBin).reduce((s, v) => s + v, 0);
        const highBins = histBins.slice(midBin).reduce((s, v) => s + v, 0);
        const midBinsVal = histBins[midBin] + (histBins[midBin - 1] || 0) + (histBins[midBin + 1] || 0);
        const bimodality = lowBins > 0 && highBins > 0 ?
          1 - (midBinsVal / (Math.min(lowBins, highBins) * 0.5 + 1)) : 0;

        let maxEdgeSlope = 0;
        for (let i = 1; i < sampleLen; i++) {
          const slope = Math.abs(lightSmoothed[i] - lightSmoothed[i - 1]);
          if (slope > maxEdgeSlope) maxEdgeSlope = slope;
        }

        let peakVal = 0;
        for (let i = 0; i < sampleLen; i++) {
          if (Math.abs(lightSmoothed[i]) > peakVal) peakVal = Math.abs(lightSmoothed[i]);
        }
        const crestFactor = peakVal / (rms || 1);

        let zeroCrossIntervals = [];
        let lastCross = 0;
        for (let i = 1; i < sampleLen; i++) {
          if ((lightSmoothed[i] >= 0) !== (lightSmoothed[i - 1] >= 0)) {
            if (lastCross > 0) zeroCrossIntervals.push(i - lastCross);
            lastCross = i;
          }
        }
        let zeroCrossRegularity = 0;
        if (zeroCrossIntervals.length > 1) {
          const meanInterval = zeroCrossIntervals.reduce((s, v) => s + v, 0) / zeroCrossIntervals.length;
          const intervalVariance = zeroCrossIntervals.reduce((s, v) => s + (v - meanInterval) ** 2, 0) / zeroCrossIntervals.length;
          zeroCrossRegularity = 1 - Math.min(1, Math.sqrt(intervalVariance) / (meanInterval || 1));
        }
        
        const derivAbs = Array.from(derivative).map(v => Math.abs(v));
        const derivMean = derivAbs.reduce((s, v) => s + v, 0) / derivAbs.length;
        const derivMax = Math.max(...derivAbs);
        const sharpTransitions = derivAbs.filter(v => v > derivMax * 0.6).length;
        
        let riseSlopes = [];
        let fallSlopes = [];
        for (let i = 1; i < sampleLen; i++) {
          const diff = smoothed[i] - smoothed[i - 1];
          if (diff > 0.01) riseSlopes.push(diff);
          if (diff < -0.01) fallSlopes.push(Math.abs(diff));
        }
        const avgRise = riseSlopes.length > 0 ? riseSlopes.reduce((s, v) => s + v, 0) / riseSlopes.length : 0;
        const avgFall = fallSlopes.length > 0 ? fallSlopes.reduce((s, v) => s + v, 0) / fallSlopes.length : 0;
        const slopeRatio = Math.min(avgRise, avgFall) / (Math.max(avgRise, avgFall) || 1);
        
        let zeroCrossDerivCount = 0;
        let lastDerivSign = derivative[0] >= 0 ? 1 : -1;
        for (let i = 1; i < derivative.length; i++) {
          const sign = derivative[i] >= 0 ? 1 : -1;
          if (sign !== lastDerivSign) {
            zeroCrossDerivCount++;
            lastDerivSign = sign;
          }
        }
        const derivativeSmoothness = zeroCrossDerivCount / sampleLen;
        
        let autocorr = new Float32Array(Math.floor(sampleLen / 2));
        for (let lag = 0; lag < autocorr.length; lag++) {
          let sum = 0;
          for (let i = 0; i < sampleLen - lag; i++) {
            sum += (smoothed[i] - meanVal) * (smoothed[i + lag] - meanVal);
          }
          autocorr[lag] = sum / (sampleLen - lag);
        }
        if (autocorr[0] > 0) {
          for (let i = 0; i < autocorr.length; i++) {
            autocorr[i] /= autocorr[0];
          }
        }
        
        let autocorrPeaks = [];
        for (let i = Math.floor(sampleLen / (periods * 3)); i < autocorr.length - 1; i++) {
          if (autocorr[i] > autocorr[i - 1] && autocorr[i] > autocorr[i + 1] && autocorr[i] > 0.3) {
            autocorrPeaks.push({ lag: i, value: autocorr[i] });
            break;
          }
        }
        const periodicity = autocorrPeaks.length > 0 ? autocorrPeaks[0].value : 0;
        
        const highCount = smoothed.filter(v => v > 0.5).length;
        const lowCount = smoothed.filter(v => v < -0.5).length;
        const midCount = sampleLen - highCount - lowCount;
        const dutyCycleEstimate = Math.round((highCount / (highCount + lowCount || 1)) * 100);
        const isBimodal = (highCount > sampleLen * 0.2) && (lowCount > sampleLen * 0.2);
        
        const fftSize = 1 << Math.floor(Math.log2(sampleLen));
        const harmonics = this.analyzeHarmonics(smoothed, fftSize, periods);
        
        let scores = {
          square: 0,
          sine: 0,
          triangle: 0,
          sawtooth: 0,
          noise: 0,
          pulse: 0
        };

        if (flatRatio > 0.4) scores.square += 30;
        else if (flatRatio > 0.3) scores.square += 20;
        if (flatRatioHigh > 0.2) scores.square += 15;
        if (bimodality > 0.2) scores.square += 20;
        if (bimodality > 0.4) scores.square += 10;
        if (maxEdgeSlope > 0.15) scores.square += 15;
        if (maxEdgeSlope > 0.25) scores.square += 10;
        if (crestFactor < 1.15) scores.square += 10;
        if (flatRatio > 0.3 && bimodality > 0.15) scores.square += 15;
        if (sharpTransitions > periods * 1.2 && sharpTransitions < periods * 4) {
          scores.square += 10;
        }
        if (dutyCycleEstimate > 40 && dutyCycleEstimate < 60) {
          scores.square += 10;
        }

        if (flatRatio < 0.15) scores.sine += 20;
        if (derivativeSmoothness < 0.12) scores.sine += 20;
        if (slopeRatio > 0.75) scores.sine += 15;
        if (crestFactor > 1.3 && crestFactor < 1.5) scores.sine += 15;
        if (bimodality < 0.1) scores.sine += 10;
        if (rms > 0.3 && rms < 0.75) scores.sine += 10;
        if (maxEdgeSlope < 0.1) scores.sine += 10;
        if (zeroCrossRegularity > 0.8) scores.sine += 5;
        if (harmonics.highHarmonicRatio < 0.15) scores.sine += 10;

        if (flatRatio < 0.1) scores.triangle += 15;
        if (slopeRatio > 0.65 && slopeRatio < 0.95) scores.triangle += 25;
        if (derivativeSmoothness > 0.04 && derivativeSmoothness < 0.18) scores.triangle += 20;
        if (crestFactor > 1.65 && crestFactor < 1.85) scores.triangle += 20;
        if (bimodality < 0.15) scores.triangle += 5;
        if (maxEdgeSlope < 0.08) scores.triangle += 10;
        if (harmonics.highHarmonicRatio > 0.1 && harmonics.highHarmonicRatio < 0.4) scores.triangle += 10;

        if (flatRatio < 0.1) scores.sawtooth += 15;
        if (slopeRatio < 0.5 && slopeRatio > 0.05) scores.sawtooth += 25;
        if (avgRise > 0 && avgFall > 0) {
          const riseFallRatio = avgFall / avgRise;
          if (riseFallRatio > 2.5 || riseFallRatio < 0.4) scores.sawtooth += 20;
        }
        if (maxEdgeSlope > 0.08 && maxEdgeSlope < 0.2) scores.sawtooth += 10;
        if (crestFactor > 1.7) scores.sawtooth += 10;
        if (harmonics.highHarmonicRatio > 0.25) scores.sawtooth += 10;

        if (derivativeSmoothness > 0.2) scores.noise += 25;
        if (derivativeSmoothness > 0.3) scores.noise += 15;
        if (periodicity < 0.4) scores.noise += 20;
        if (rms > 0.25 && periodicity < 0.5) scores.noise += 10;

        if (flatRatio > 0.4 && (flatHighCount > flatLowCount * 2.5 || flatLowCount > flatHighCount * 2.5)) scores.pulse += 30;
        if (dutyCycleEstimate < 40 || dutyCycleEstimate > 60) scores.pulse += 20;
        if (flatRatio > 0.3 && maxEdgeSlope > 0.15) scores.pulse += 15;
        
        let bestType = 'sine';
        let bestScore = 0;
        for (const [type, score] of Object.entries(scores)) {
          if (score > bestScore) {
            bestScore = score;
            bestType = type;
          }
        }
        
        if (bestScore < 20) {
          bestType = 'sine';
        }
        
        const waveNames = {
          square: '方波',
          sine: '正弦波',
          triangle: '三角波',
          sawtooth: '锯齿波',
          noise: '噪声波',
          pulse: '脉冲波'
        };
        
        let confidence, confidenceText;
        if (bestScore > 60) {
          confidence = 'high';
          confidenceText = '高置信度';
        } else if (bestScore > 35) {
          confidence = 'medium';
          confidenceText = '中等置信度';
        } else {
          confidence = 'low';
          confidenceText = '低置信度';
        }
        
        const GRID_ROWS = 8;
        const pixelsPerGridRow = h / GRID_ROWS;
        const peakGridDivisions = (rangeY / 2) / pixelsPerGridRow;
        const assumedVoltsDiv = 1.0;
        const amplitude = parseFloat((peakGridDivisions * assumedVoltsDiv).toFixed(1));
        const clampedAmplitude = Math.max(0.1, Math.min(10, amplitude));

        const correctedFreq = parseFloat((periods / (assumedTimeDiv * GRID_COLS)).toFixed(2));
        const clampedFreq = Math.max(0.1, Math.min(10, correctedFreq));

        this.imagewave.analysisResult = {
          waveType: bestType,
          waveName: waveNames[bestType],
          frequency: clampedFreq,
          amplitude: clampedAmplitude,
          dutyCycle: dutyCycleEstimate,
          confidence,
          confidenceText,
          scores,
          measurementNote: `检测到${periods}个周期，波形峰峰值约占${peakGridDivisions.toFixed(1)}格`
        };
        
        this.imagewave.history.unshift({
          waveType: bestType,
          waveName: waveNames[bestType],
          frequency: parseFloat(estimatedFreq.toFixed(2)),
          amplitude: parseFloat(amplitude.toFixed(1))
        });
        if (this.imagewave.history.length > 5) {
          this.imagewave.history.pop();
        }
        
        this.$nextTick(() => {
          this.drawWavePreview(Array.from(smoothed), bestType);
        });
      },
      
      analyzeHarmonics(signal, fftSize, periods) {
        const len = Math.min(signal.length, fftSize);
        const magnitudes = new Float32Array(fftSize / 2);
        
        for (let k = 0; k < fftSize / 2; k++) {
          let realPart = 0;
          let imagPart = 0;
          const fundamentalBin = Math.max(1, Math.round(periods));
          const step = Math.max(1, Math.floor(len / fftSize));
          
          for (let n = 0; n < len; n += step) {
            const angle = (2 * Math.PI * k * n) / fftSize;
            realPart += signal[n] * Math.cos(angle);
            imagPart -= signal[n] * Math.sin(angle);
          }
          magnitudes[k] = Math.sqrt(realPart * realPart + imagPart * imagPart);
        }
        
        let fundMagnitude = 0;
        let oddHarmonicSum = 0;
        let evenHarmonicSum = 0;
        let highHarmonicSum = 0;
        let totalEnergy = 0;
        
        const fundBin = Math.max(1, Math.round(periods));
        
        for (let k = 1; k < fftSize / 2; k++) {
          const m = magnitudes[k];
          totalEnergy += m * m;
          
          if (k >= fundBin - 1 && k <= fundBin + 1) {
            fundMagnitude = Math.max(fundMagnitude, m);
          }
          
          if (k > fundBin + 1) {
            highHarmonicSum += m;
            if (Math.round(k / fundBin) % 2 === 0) {
              evenHarmonicSum += m;
            } else {
              oddHarmonicSum += m;
            }
          }
        }
        
        return {
          highHarmonicRatio: fundMagnitude > 0 ? highHarmonicSum / (fundMagnitude * 3) : 0,
          evenOddRatio: oddHarmonicSum > 0 ? evenHarmonicSum / oddHarmonicSum : 0,
          fundMagnitude
        };
      },

      drawWavePreview(profile, waveType) {
        const canvas = this.$refs.wavePreviewCanvas;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;
        
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, w, h);
        
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 0.5;
        for (let i = 0; i <= 10; i++) {
          const x = (i / 10) * w;
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, h);
          ctx.stroke();
        }
        for (let i = 0; i <= 4; i++) {
          const y = (i / 4) * h;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
          ctx.stroke();
        }
        
        const colors = {
          sine: '#4CAF50',
          square: '#2196F3',
          triangle: '#FF9800',
          sawtooth: '#9C27B0',
          noise: '#f44336',
          pulse: '#00BCD4'
        };
        const color = colors[waveType] || '#4CAF50';
        
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        const step = w / profile.length;
        for (let i = 0; i < profile.length; i++) {
          const x = i * step;
          const y = h - (profile[i] * h * 0.8 + h * 0.1);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        
        ctx.fillStyle = '#999';
        ctx.font = '11px Arial';
        ctx.fillText('图片波形分析', 5, 12);
        ctx.fillStyle = color;
        ctx.fillText(waveType, w - 60, 12);
      },

      captureCanvasAsImage() {
        const oscilloscopeCanvas = this.$refs.oscilloscope;
        if (!oscilloscopeCanvas) return;
        const dataUrl = oscilloscopeCanvas.toDataURL('image/png');
        this.imagewave.imageUrl = dataUrl;
        const img = new Image();
        img.onload = () => {
          this.analyzeImage(img);
        };
        img.src = dataUrl;
      },

      clearImageAnalysis() {
        this.imagewave.imageUrl = null;
        this.imagewave.imageData = null;
        this.imagewave.analysisResult = null;
        this.imagewave.aiResult = null;
        this.imagewave.aiError = null;
        this.imagewave.aiPrompt = '';
        this.imagewave.displayModeDetected = 'independent';
        if (this.$refs.imageUploadInput) {
          this.$refs.imageUploadInput.value = '';
        }
      },

      applyImageWaveform() {
        if (!this.imagewave.analysisResult) return;
        const result = this.imagewave.analysisResult;
        this.setExpStep('normal');
        this.signalType = result.waveType;
        this.$set(this.frequencies, 1, result.frequency);
        this.$set(this.peakValues, 1, result.amplitude);
        this.$set(this.inputActive, 1, true);
        this.needsRedraw = true;
        this.refreshDisplay();
        console.log(`已应用图片识别波形: ${result.waveName} (${result.waveType}), 频率: ${result.frequency}Hz, 幅度: ${result.amplitude}V`);
      },

      applyHistoryWaveform(item) {
        this.setExpStep('normal');
        this.signalType = item.waveType;
        this.$set(this.frequencies, 1, item.frequency);
        this.$set(this.peakValues, 1, item.amplitude);
        this.$set(this.inputActive, 1, true);
        this.needsRedraw = true;
        this.refreshDisplay();
      },

      async analyzeWithAI() {
        if (!this.imagewave.imageUrl) {
          alert('请先上传图片！');
          return;
        }

        this.imagewave.aiAnalyzing = true;
        this.imagewave.aiError = null;
        this.imagewave.aiResult = null;

        try {
          const result = await DeepSeekService.analyzeImageWithAI(this.imagewave.imageUrl);
          this.imagewave.aiResult = result;
          this.imagewave.aiPrompt = DeepSeekService.generatePromptFromAnalysis(result);

          if (result.displayMode) {
            this.imagewave.displayModeDetected = DeepSeekService.mapDisplayMode(result.displayMode);
          }

          if (result.channels && result.channels.length > 0) {
            const ch1 = result.channels[0];
            const freq = Math.max(0.1, Math.min(10, ch1.frequency || 1));
            const amp = Math.max(0.1, Math.min(10, ch1.amplitude || 1));
            this.imagewave.analysisResult = {
              waveType: DeepSeekService.mapWaveType(ch1.waveType),
              waveName: this.getWaveName(DeepSeekService.mapWaveType(ch1.waveType)),
              frequency: parseFloat(freq.toFixed(2)),
              amplitude: parseFloat(amp.toFixed(1)),
              dutyCycle: 50,
              confidence: result.confidence || 'medium',
              confidenceText: this.getConfidenceText(result.confidence),
              measurementNote: result.analysis || ''
            };
          }

          console.log('离线算法分析完成:', result);
        } catch (error) {
          this.imagewave.aiError = error.message || '算法分析失败，请稍后重试';
          console.error('算法分析错误:', error);
        } finally {
          this.imagewave.aiAnalyzing = false;
        }
      },

      getWaveName(type) {
        const names = {
          'sine': '正弦波',
          'square': '方波',
          'triangle': '三角波',
          'sawtooth': '锯齿波',
          'noise': '噪声波',
          'pulse': '脉冲波'
        };
        return names[type] || '未知波形';
      },

      getConfidenceText(level) {
        const texts = {
          'high': '高置信度',
          'medium': '中等置信度',
          'low': '低置信度'
        };
        return texts[level] || '中等置信度';
      },

      applyAIResult() {
        const aiResult = this.imagewave.aiResult;
        if (!aiResult) return;

        const displayMode = DeepSeekService.mapDisplayMode(aiResult.displayMode);

        if (aiResult.timeDiv) {
          this.timeDiv = aiResult.timeDiv;
        }
        if (aiResult.voltsDiv) {
          if (aiResult.voltsDiv['1']) this.$set(this.voltsDiv, 1, aiResult.voltsDiv['1']);
          if (aiResult.voltsDiv['2']) this.$set(this.voltsDiv, 2, aiResult.voltsDiv['2']);
        }

        if (displayMode === 'vertical') {
          if (aiResult.channels && aiResult.channels.length >= 2) {
            const ch1 = aiResult.channels[0];
            const ch2 = aiResult.channels[1];

            this.signalType = DeepSeekService.mapWaveType(ch1.waveType);
            this.$set(this.inputActive, 1, true);
            this.$set(this.inputActive, 2, true);
            this.$set(this.frequencies, 1, ch1.frequency || 1);
            this.$set(this.peakValues, 1, ch1.amplitude || 3);
            this.$set(this.frequencies, 2, ch2.frequency || 1);
            this.$set(this.peakValues, 2, ch2.amplitude || 3);

            this.freqX = ch1.frequency || 1;
            this.freqY = ch2.frequency || 1;

            if (aiResult.phaseDiff !== undefined) {
              this.phaseDiff = aiResult.phaseDiff;
            }

            this.setExpStep('normal');
            this.$nextTick(() => {
              this.setDisplayMode('vertical');
            });
          } else if (aiResult.channels && aiResult.channels.length === 1) {
            const ch1 = aiResult.channels[0];
            this.signalType = DeepSeekService.mapWaveType(ch1.waveType);
            this.$set(this.inputActive, 1, true);
            this.$set(this.inputActive, 2, true);
            this.$set(this.frequencies, 1, ch1.frequency || 1);
            this.$set(this.peakValues, 1, ch1.amplitude || 3);
            this.$set(this.frequencies, 2, ch1.frequency || 1);
            this.$set(this.peakValues, 2, ch1.amplitude || 3);
            this.freqX = ch1.frequency || 1;
            this.freqY = ch1.frequency || 1;
            this.phaseDiff = 90;
            this.setExpStep('normal');
            this.$nextTick(() => {
              this.setDisplayMode('vertical');
            });
          }
        } else if (displayMode === 'overlay') {
          if (aiResult.channels && aiResult.channels.length >= 2) {
            this.$set(this.inputActive, 1, true);
            this.$set(this.inputActive, 2, true);

            const ch1 = aiResult.channels[0];
            const ch2 = aiResult.channels[1];

            this.signalType = DeepSeekService.mapWaveType(ch1.waveType);
            this.$set(this.frequencies, 1, ch1.frequency || 1);
            this.$set(this.peakValues, 1, ch1.amplitude || 3);
            this.$set(this.frequencies, 2, ch2.frequency || 1);
            this.$set(this.peakValues, 2, ch2.amplitude || 3);

            if (aiResult.phaseDiff !== undefined) {
              this.phaseDiff = aiResult.phaseDiff;
            }

            this.setExpStep('normal');
            this.$nextTick(() => {
              this.setDisplayMode('overlay');
            });
          } else if (aiResult.channels && aiResult.channels.length === 1) {
            const ch1 = aiResult.channels[0];
            this.signalType = DeepSeekService.mapWaveType(ch1.waveType);
            this.$set(this.inputActive, 1, true);
            this.$set(this.frequencies, 1, ch1.frequency || 1);
            this.$set(this.peakValues, 1, ch1.amplitude || 3);
            this.setExpStep('normal');
            this.$nextTick(() => {
              this.setDisplayMode('independent');
            });
          }
        } else {
          if (aiResult.channels && aiResult.channels.length > 0) {
            const ch1 = aiResult.channels[0];
            this.setExpStep('normal');
            this.signalType = DeepSeekService.mapWaveType(ch1.waveType);
            this.$set(this.frequencies, 1, ch1.frequency || 1);
            this.$set(this.peakValues, 1, ch1.amplitude || 3);
            this.$set(this.inputActive, 1, true);

            if (aiResult.channels.length >= 2) {
              const ch2 = aiResult.channels[1];
              this.$set(this.inputActive, 2, true);
              this.$set(this.frequencies, 2, ch2.frequency || 1);
              this.$set(this.peakValues, 2, ch2.amplitude || 3);
            }
          }
        }

        this.needsRedraw = true;
        this.refreshDisplay();

        if (aiResult.analysis) {
          console.log('AI分析说明:', aiResult.analysis);
        }
        console.log('已应用AI分析结果:', {
          displayMode,
          timeDiv: this.timeDiv,
          voltsDiv: { ...this.voltsDiv },
          frequencies: { ...this.frequencies },
          peakValues: { ...this.peakValues },
          phaseDiff: this.phaseDiff,
          signalType: this.signalType,
          freqX: this.freqX,
          freqY: this.freqY
        });
      },

      captureAndAnalyzeWithAI() {
        const oscilloscopeCanvas = this.$refs.oscilloscope;
        if (!oscilloscopeCanvas) return;
        const dataUrl = oscilloscopeCanvas.toDataURL('image/png');
        this.imagewave.imageUrl = dataUrl;
        this.imagewave.aiAnalyzing = true;
        this.imagewave.aiError = null;

        try {
          const state = {
            signalType: this.signalType,
            frequencies: { ...this.frequencies },
            peakValues: { ...this.peakValues },
            phaseDiff: this.phaseDiff,
            timeDiv: this.timeDiv,
            voltsDiv: { ...this.voltsDiv },
            displayMode: this.displayMode,
            inputActive: { ...this.inputActive }
          };

          const result = DeepSeekService.analyzeOscilloscopeState(state);
          this.imagewave.aiResult = result;
          this.imagewave.aiPrompt = DeepSeekService.generatePromptFromAnalysis(result);

          if (result.displayMode) {
            this.imagewave.displayModeDetected = DeepSeekService.mapDisplayMode(result.displayMode);
          }

          if (result.channels && result.channels.length > 0) {
            const ch1 = result.channels[0];
            this.imagewave.analysisResult = {
              waveType: DeepSeekService.mapWaveType(ch1.waveType),
              waveName: this.getWaveName(DeepSeekService.mapWaveType(ch1.waveType)),
              frequency: ch1.frequency || 1,
              amplitude: ch1.amplitude || 1,
              dutyCycle: 50,
              confidence: 'high',
              confidenceText: '精确读取'
            };
          }

          console.log('直接读取示波器参数完成:', result);
        } catch (error) {
          this.imagewave.aiError = error.message || '参数读取失败';
          console.error('直接读取错误:', error);
        } finally {
          this.imagewave.aiAnalyzing = false;
        }
      },

      getDisplayModeName(mode) {
        const names = {
          'overlay': '同向叠加',
          'vertical': '垂直叠加(李萨如)',
          'independent': '独立显示'
        };
        return names[mode] || '未知模式';
      },

      toggleChat() {
        this.aiChat.isOpen = !this.aiChat.isOpen;
        if (this.aiChat.isOpen) {
          this.$nextTick(() => {
            this.scrollToBottom();
          });
        }
      },

      scrollToBottom() {
        const container = this.$refs.chatMessages;
        if (container) {
          container.scrollTop = container.scrollHeight;
        }
      },

      async sendChatMessage() {
        const message = this.aiChat.inputMessage.trim();
        if (!message || this.aiChat.isTyping) return;

        this.aiChat.messages.push({
          id: Date.now(),
          role: 'user',
          content: message,
          time: new Date().toLocaleTimeString()
        });

        this.aiChat.inputMessage = '';
        this.aiChat.isTyping = true;

        this.$nextTick(() => {
          this.scrollToBottom();
        });

        try {
          const kbResult = KnowledgeBase.findAnswer(message);
          let knowledgeContext = '';
          if (kbResult && kbResult.score > 2) {
            knowledgeContext = `【${kbResult.category}】${kbResult.answer}`;
          }

          const response = await DeepSeekService.chatWithAI(message, knowledgeContext);

          this.aiChat.messages.push({
            id: Date.now(),
            role: 'assistant',
            content: response,
            time: new Date().toLocaleTimeString()
          });
        } catch (error) {
          const kbResult = KnowledgeBase.findAnswer(message);
          if (kbResult && kbResult.score > 0) {
            this.aiChat.messages.push({
              id: Date.now(),
              role: 'assistant',
              content: `📚 ${kbResult.answer}`,
              time: new Date().toLocaleTimeString()
            });
          } else {
            this.aiChat.messages.push({
              id: Date.now(),
              role: 'assistant',
              content: `抱歉，暂时无法回答您的问题。错误信息：${error.message}\n\n您可以尝试问以下问题：\n• 如何进行自检校准？\n• 怎样使用同向叠加模式？\n• 如何调整波形频率和幅度？`,
              time: new Date().toLocaleTimeString()
            });
          }
        } finally {
          this.aiChat.isTyping = false;
          this.$nextTick(() => {
            this.scrollToBottom();
          });
        }
      },

      handleChatKeydown(event) {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          this.sendChatMessage();
        }
      },

      clearChat() {
        this.aiChat.messages = [{
          id: Date.now(),
          role: 'assistant',
          content: '聊天记录已清空。有什么问题尽管问我！',
          time: new Date().toLocaleTimeString()
        }];
      },

      askQuickQuestion(question) {
        this.aiChat.inputMessage = question;
        this.sendChatMessage();
      },

      formatMessage(content) {
        if (!content) return '';
        return content
          .replace(/\n/g, '<br>')
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.*?)\*/g, '<em>$1</em>')
          .replace(/`(.*?)`/g, '<code>$1</code>')
          .replace(/•/g, '&bull;');
      }
    }
  });
}

// ===== 启动应用 =====
initApp();

// ===== 初始化右上角切换控件（外部页） =====
const bootExternalSwitcher = () => {
  if (typeof document !== 'undefined') {
    renderSwitcher('external');
  }
};
if (typeof document !== 'undefined' && document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootExternalSwitcher);
} else {
  bootExternalSwitcher();
}

//启动引导框
tourGuideManager.start();