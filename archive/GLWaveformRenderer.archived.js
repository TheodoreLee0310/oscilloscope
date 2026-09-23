/**
 * GLWaveformRenderer.js
 * WebGL波形渲染器 - 提供高性能波形绘制
 */
export default class GLWaveformRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl2');
    if (!this.gl) {
      console.warn('WebGL 2 不可用，尝试WebGL 1');
      this.gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    }
    if (!this.gl) {
      throw new Error('WebGL不支持');
    }

    // 初始化着色器
    this.initShaders();
    // 初始化缓冲区
    this.initBuffers();
  }

  // 顶点着色器代码
  get vertexShaderSource() {
    return `
      attribute vec2 a_position;
      attribute vec4 a_color;
      
      uniform vec2 u_resolution;
      uniform float u_pointSize;
      
      varying vec4 v_color;
      
      void main() {
        // 转换坐标到裁剪空间
        vec2 clipSpace = (a_position / u_resolution) * 2.0 - 1.0;
        gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
        gl_PointSize = u_pointSize;
        v_color = a_color;
      }
    `;
  }

  // 片元着色器代码
  get fragmentShaderSource() {
    return `
      precision mediump float;
      varying vec4 v_color;
      
      void main() {
        gl_FragColor = v_color;
      }
    `;
  }

  // 初始化着色器
  initShaders() {
    const gl = this.gl;
    
    // 创建着色器程序
    const vertexShader = this.createShader(gl.VERTEX_SHADER, this.vertexShaderSource);
    const fragmentShader = this.createShader(gl.FRAGMENT_SHADER, this.fragmentShaderSource);
    
    // 创建程序
    this.program = gl.createProgram();
    gl.attachShader(this.program, vertexShader);
    gl.attachShader(this.program, fragmentShader);
    gl.linkProgram(this.program);
    
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      throw new Error('着色器程序链接失败: ' + gl.getProgramInfoLog(this.program));
    }
    
    // 获取属性位置
    this.positionLocation = gl.getAttribLocation(this.program, 'a_position');
    this.colorLocation = gl.getAttribLocation(this.program, 'a_color');
    
    // 获取全局变量位置
    this.resolutionLocation = gl.getUniformLocation(this.program, 'u_resolution');
    this.pointSizeLocation = gl.getUniformLocation(this.program, 'u_pointSize');
  }

  // 创建着色器
  createShader(type, source) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error('着色器编译错误: ' + gl.getShaderInfoLog(shader));
    }
    
    return shader;
  }

  // 初始化缓冲区
  initBuffers() {
    const gl = this.gl;
    
    // 创建位置缓冲区
    this.positionBuffer = gl.createBuffer();
    // 创建颜色缓冲区
    this.colorBuffer = gl.createBuffer();
  }

  // 渲染波形数据
  renderWaveform(waveformData, color) {
    const gl = this.gl;
    
    // 使用着色器程序
    gl.useProgram(this.program);
    
    // 设置视口
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    
    // 设置分辨率
    gl.uniform2f(this.resolutionLocation, gl.canvas.width, gl.canvas.height);
    
    // 设置点大小
    gl.uniform1f(this.pointSizeLocation, 1.0);
    
    // 准备顶点数据 - 修改扫描方向：从右向左
    const positions = new Float32Array(waveformData.flatMap((point, i) => [waveformData.length - 1 - i, point]));
    
    // 准备颜色数据
    const colors = new Float32Array(waveformData.length * 4).fill(0);
    for (let i = 0; i < waveformData.length; i++) {
      const baseIndex = i * 4;
      colors[baseIndex] = color[0];     // R
      colors[baseIndex + 1] = color[1]; // G
      colors[baseIndex + 2] = color[2]; // B
      colors[baseIndex + 3] = color[3]; // A
    }
    
    // 绑定并填充位置缓冲区
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(this.positionLocation);
    gl.vertexAttribPointer(this.positionLocation, 2, gl.FLOAT, false, 0, 0);
    
    // 绑定并填充颜色缓冲区
    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, colors, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(this.colorLocation);
    gl.vertexAttribPointer(this.colorLocation, 4, gl.FLOAT, false, 0, 0);
    
    // 绘制
    gl.drawArrays(gl.LINE_STRIP, 0, waveformData.length);
  }

  // 清除画布
  clear(color = [0, 0, 0, 1]) {
    const gl = this.gl;
    gl.clearColor(...color);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }
}

// ESM 导出默认类