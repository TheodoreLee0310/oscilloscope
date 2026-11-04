import { Layout, Palette } from '../common/ScopeConstants';
import { WaveMath } from '../model/WaveMath';
import { ChannelParams, ScopeSetup, TraceBuffer, WaveOptions } from '../model/ScopeTypes';
import { ScopeEngine } from '../model/ScopeEngine';

/**
 * 屏幕渲染器：只用 CanvasRenderingContext2D，把示波器的「荧光屏」画出来。
 * 对应原网页版 waveDrawer.js / lissajousDrawer.js 的绘制部分。
 */
export class ScopeRenderer {
  private ctx: CanvasRenderingContext2D;
  /** 最近一帧的测量值（供 UI 读取） */
  ch1Vpp: number = 0;
  ch2Vpp: number = 0;

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }

  draw(setup: ScopeSetup): void {
    const w: number = this.ctx.width;
    const h: number = this.ctx.height;
    if (w < 20 || h < 20) {
      return;
    }
    this.ctx.setLineDash([]);
    this.paintBackground(w, h);
    this.drawGraticule(w, h);
    if (setup.displayMode === 'lissajous') {
      this.drawLissajousMode(setup, w, h);
    } else if (setup.displayMode === 'overlay') {
      this.drawOverlayMode(setup, w, h);
    } else {
      this.drawDualMode(setup, w, h);
    }
    this.drawOsd(setup, w, h);
  }

  // ---------------------------------------------------------------- 背景与网格

  private paintBackground(w: number, h: number): void {
    const grad: CanvasGradient = this.ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.72);
    grad.addColorStop(0, Palette.BACKGROUND_IN);
    grad.addColorStop(1, Palette.BACKGROUND_OUT);
    this.ctx.fillStyle = grad;
    this.ctx.fillRect(0, 0, w, h);
  }

  private drawGraticule(w: number, h: number): void {
    const dx: number = w / Layout.H_DIVS;
    const dy: number = h / Layout.V_DIVS;
    this.ctx.lineWidth = 1;

    // 细分线
    this.ctx.strokeStyle = Palette.GRID_MINOR;
    this.ctx.beginPath();
    const subX: number = dx / Layout.SUBDIVS;
    for (let i = 1; i < Layout.H_DIVS * Layout.SUBDIVS; i++) {
      if (i % Layout.SUBDIVS === 0) {
        continue;
      }
      const x: number = i * subX;
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, h);
    }
    const subY: number = dy / Layout.SUBDIVS;
    for (let j = 1; j < Layout.V_DIVS * Layout.SUBDIVS; j++) {
      if (j % Layout.SUBDIVS === 0) {
        continue;
      }
      const y: number = j * subY;
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(w, y);
    }
    this.ctx.stroke();

    // 主格线
    this.ctx.strokeStyle = Palette.GRID_MAJOR;
    this.ctx.beginPath();
    for (let i = 1; i < Layout.H_DIVS; i++) {
      this.ctx.moveTo(i * dx, 0);
      this.ctx.lineTo(i * dx, h);
    }
    for (let j = 1; j < Layout.V_DIVS; j++) {
      this.ctx.moveTo(0, j * dy);
      this.ctx.lineTo(w, j * dy);
    }
    this.ctx.stroke();

    // 中心十字轴
    this.ctx.strokeStyle = Palette.AXIS;
    this.ctx.lineWidth = 1.2;
    this.ctx.beginPath();
    this.ctx.moveTo(w / 2, 0);
    this.ctx.lineTo(w / 2, h);
    this.ctx.moveTo(0, h / 2);
    this.ctx.lineTo(w, h / 2);
    this.ctx.stroke();

    // 外框（屏边）
    this.ctx.strokeStyle = Palette.GRID_MAJOR;
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(1, 1, w - 2, h - 2);
  }

  // ---------------------------------------------------------------- 波形绘制

  /** 计算窗口起点：触发锁定 → 稳定不动；关闭触发 → 随时间滚动 */
  private windowStart(setup: ScopeSetup, source: ChannelParams): number {
    if (setup.triggerEnabled) {
      const phi0: number = ScopeEngine.findTriggerPhase(source, setup.triggerLevel, setup.triggerRising);
      return ScopeEngine.triggeredStart(source, phi0);
    }
    return setup.runTimeSec;
  }

  private traceSource(setup: ScopeSetup): ChannelParams {
    if (setup.ch1.enabled) {
      return setup.ch1;
    }
    return setup.ch2;
  }

  private drawDualMode(setup: ScopeSetup, w: number, h: number): void {
    const pxPerDiv: number = h / Layout.V_DIVS;
    const totalTime: number = setup.timeDiv * Layout.H_DIVS;
    const start: number = this.windowStart(setup, this.traceSource(setup));

    if (setup.ch1.enabled) {
      const centerY: number = h / 4;
      const buf: TraceBuffer = ScopeEngine.buildTrace(setup.ch1, start, totalTime, w, pxPerDiv, centerY);
      this.strokeTrace(buf, Palette.CH1);
      this.ch1Vpp = buf.vpp;
      this.channelTag('1', Palette.CH1, h / 4, w);
    }
    if (setup.ch2.enabled) {
      const centerY: number = h * 3 / 4;
      const buf2: TraceBuffer = ScopeEngine.buildTrace(setup.ch2, start, totalTime, w, pxPerDiv, centerY);
      this.strokeTrace(buf2, Palette.CH2);
      this.ch2Vpp = buf2.vpp;
      this.channelTag('2', Palette.CH2, h * 3 / 4, w);
    }
    this.drawTriggerLine(setup, w, h, pxPerDiv);
  }

  private drawOverlayMode(setup: ScopeSetup, w: number, h: number): void {
    const pxPerDiv: number = h / Layout.V_DIVS;
    const totalTime: number = setup.timeDiv * Layout.H_DIVS;
    const start: number = this.windowStart(setup, this.traceSource(setup));
    const centerY: number = h / 2;
    const buf: TraceBuffer =
      ScopeEngine.buildOverlay(setup.ch1, setup.ch2, start, totalTime, w, pxPerDiv, centerY);
    this.strokeTrace(buf, Palette.OVERLAY);
    this.ch1Vpp = buf.vpp;
    this.ch2Vpp = buf.vpp;
    this.label('CH1 + CH2  叠加', 10, 10, Palette.OVERLAY, 11, false);
    this.ctx.setLineDash([]);
  }

  private drawLissajousMode(setup: ScopeSetup, w: number, h: number): void {
    const pxPerDiv: number = h / Layout.V_DIVS;
    const cx: number = w / 2;
    const cy: number = h / 2;
    const buf: TraceBuffer = ScopeEngine.buildLissajous(setup.ch1, setup.ch2, w, h, pxPerDiv);

    // 十字参考线（原实现的绿/橙交叉线）
    this.ctx.lineWidth = 1;
    this.ctx.strokeStyle = 'rgba(66,185,131,0.45)';
    this.ctx.beginPath();
    this.ctx.moveTo(0, cy);
    this.ctx.lineTo(w, cy);
    this.ctx.stroke();
    this.ctx.strokeStyle = 'rgba(255,87,34,0.35)';
    this.ctx.beginPath();
    this.ctx.moveTo(cx, 0);
    this.ctx.lineTo(cx, h);
    this.ctx.stroke();

    this.strokeTrace(buf, Palette.OVERLAY);

    // 中心亮点
    this.ctx.shadowColor = Palette.TRIGGER;
    this.ctx.shadowBlur = 12;
    this.ctx.fillStyle = Palette.TRIGGER;
    this.ctx.beginPath();
    this.ctx.arc(cx, cy, 3.5, 0, WaveMath.TWO_PI);
    this.ctx.fill();
    this.ctx.shadowBlur = 0;
    this.ctx.shadowColor = 'transparent';
  }

  /** 带荧光辉光的折线 */
  private strokeTrace(buf: TraceBuffer, color: string): void {
    if (buf.xs.length < 2) {
      return;
    }
    this.ctx.save();
    this.ctx.setLineDash([]);
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = 2.2;
    this.ctx.lineJoin = 'round';
    this.ctx.lineCap = 'round';
    this.ctx.shadowColor = color;
    this.ctx.shadowBlur = 9;
    this.ctx.beginPath();
    this.ctx.moveTo(buf.xs[0], buf.ys[0]);
    for (let i = 1; i < buf.xs.length; i++) {
      this.ctx.lineTo(buf.xs[i], buf.ys[i]);
    }
    this.ctx.stroke();
    this.ctx.restore();
  }

  /** 触发电平虚线 */
  private drawTriggerLine(setup: ScopeSetup, w: number, h: number, pxPerDiv: number): void {
    if (!setup.triggerEnabled) {
      return;
    }
    const source: ChannelParams = this.traceSource(setup);
    let centerY: number = h / 4;
    if (setup.displayMode === 'overlay') {
      centerY = h / 2;
    } else if (source === setup.ch2) {
      centerY = h * 3 / 4;
    }
    const y: number = centerY - (setup.triggerLevel / Math.max(source.voltsDiv, 0.01)) * pxPerDiv
      - source.offsetDiv * pxPerDiv;
    if (y < 0 || y > h) {
      return;
    }
    this.ctx.save();
    this.ctx.setLineDash([5, 3]);
    this.ctx.strokeStyle = Palette.TRIGGER;
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(0, y);
    this.ctx.lineTo(w, y);
    this.ctx.stroke();
    this.ctx.restore();

    // 上升/下降沿标记
    const tri: number = 6;
    const dir: number = setup.triggerRising ? -1 : 1;
    this.ctx.fillStyle = Palette.TRIGGER;
    this.ctx.beginPath();
    this.ctx.moveTo(tri + 2, y);
    this.ctx.lineTo(tri * 2 + 2, y + dir * tri);
    this.ctx.lineTo(2, y + dir * tri);
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.setLineDash([]);
  }

  private channelTag(text: string, color: string, y: number, w: number): void {
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.moveTo(4, y - 12);
    this.ctx.lineTo(14, y - 7);
    this.ctx.lineTo(4, y - 2);
    this.ctx.closePath();
    this.ctx.fill();
    this.label(text, 17, y - 14, color, 10, false);
  }

  // ---------------------------------------------------------------- 屏幕读数

  private drawOsd(setup: ScopeSetup, w: number, h: number): void {
    this.ctx.shadowBlur = 0;
    this.ctx.shadowColor = 'transparent';

    // 右上角通道信息
    const lines: string[] = [];
    lines.push('CH1 ' + WaveOptions.labelOf(setup.ch1.waveType) + '  ' +
      WaveMath.formatFreq(setup.ch1.frequency) + '  ' +
      WaveMath.formatVolt(setup.ch1.amplitude) + '峰值  ' +
      setup.ch1.voltsDiv.toFixed(2) + ' V/div');
    lines.push('CH2 ' + WaveOptions.labelOf(setup.ch2.waveType) + '  ' +
      WaveMath.formatFreq(setup.ch2.frequency) + '  ' +
      WaveMath.formatVolt(setup.ch2.amplitude) + '峰值  ' +
      setup.ch2.voltsDiv.toFixed(2) + ' V/div');
    if (setup.displayMode === 'lissajous') {
      const ratio: number[] = WaveMath.simplifyRatio(setup.ch1.frequency, setup.ch2.frequency, 15);
      const phi: number = (setup.ch2.phaseDeg - setup.ch1.phaseDeg + 360) % 360;
      lines.push('频率比 ' + ratio[0].toString() + ':' + ratio[1].toString() +
        '   相位差 ' + phi.toFixed(0) + '°');
    } else {
      lines.push('时基 ' + WaveMath.formatTimeDiv(setup.timeDiv) +
        '   幅度 ' + WaveMath.formatVolt(this.ch1Vpp) + ' Vpp');
    }

    // 半透明底板：保证读数压住波形时仍然看得清
    this.ctx.font = '10px sans-serif';
    let maxW: number = 0;
    for (let i = 0; i < lines.length; i++) {
      const tw: number = this.ctx.measureText(lines[i]).width;
      if (tw > maxW) {
        maxW = tw;
      }
    }
    this.ctx.fillStyle = 'rgba(2, 9, 6, 0.72)';
    this.ctx.fillRect(w - maxW - 18, 5, maxW + 14, lines.length * 15 + 5);

    let ty: number = 10;
    for (let i = 0; i < lines.length; i++) {
      this.label(lines[i], w - 10, ty, i === 0 ? Palette.CH1 : (i === 1 ? Palette.CH2 : Palette.TEXT_DIM),
        10, true);
      ty += 15;
    }

    // 左下角触发状态
    const src: ChannelParams = this.traceSource(setup);
    let trigText: string = '触发 ×';
    if (setup.triggerEnabled) {
      trigText = '触发 ' + (setup.triggerRising ? '↑' : '↓') + ' ' +
        WaveMath.formatVolt(setup.triggerLevel) + '  锁定';
    } else {
      trigText = '触发 ×  自由扫描';
    }
    const modeText: string = ModeNames.label(setup.displayMode);
    const botW: number = Math.max(this.ctx.measureText(trigText).width, this.ctx.measureText(modeText).width);
    this.ctx.fillStyle = 'rgba(2, 9, 6, 0.72)';
    this.ctx.fillRect(5, h - 39, botW + 12, 33);
    this.label(trigText, 10, h - 20, setup.triggerEnabled ? Palette.TRIGGER : Palette.TEXT_DIM, 10, false);
    this.label(modeText, 10, h - 34, Palette.TEXT_DIM, 10, false);

    // 左上角：触发源频率
    const freqText: string = src.frequency.toFixed(1) + ' Hz';
    this.ctx.fillStyle = 'rgba(2, 9, 6, 0.72)';
    this.ctx.fillRect(5, 5, this.ctx.measureText(freqText).width + 12, 16);
    this.label(freqText, 10, 10, Palette.TEXT_DIM, 10, false);
  }

  private label(text: string, x: number, y: number, color: string, size: number, rightAlign: boolean): void {
    this.ctx.font = size.toString() + 'px sans-serif';
    this.ctx.fillStyle = color;
    this.ctx.textAlign = rightAlign ? 'right' : 'left';
    this.ctx.textBaseline = 'top';
    this.ctx.fillText(text, x, y);
  }
}

/** 模式显示名 */
export class ModeNames {
  static label(mode: string): string {
    if (mode === 'overlay') {
      return '叠加模式';
    }
    if (mode === 'lissajous') {
      return '李萨如模式';
    }
    return '双踪模式';
  }
}
