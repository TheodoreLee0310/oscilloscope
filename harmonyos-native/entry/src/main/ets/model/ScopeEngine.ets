import { WaveMath } from './WaveMath';
import { ChannelParams, TraceBuffer } from './ScopeTypes';

/**
 * 采样引擎：负责把「电气参数 + 时基」变成屏幕坐标点列。
 * 扫描方向与原网页版一致：从右向左（x=0 是最晚的时刻，x=max 是最早的时刻）。
 */
export class ScopeEngine {
  /** 采样点数上限，防止超宽屏幕卡顿 */
  static readonly MAX_SAMPLES: number = 1200;

  /**
   * 采样一个通道
   * @param ch 通道参数
   * @param timeStart 窗口起点时刻（屏幕右端）单位秒
   * @param totalTime 窗口总时长 = timeDiv * 16
   * @param width 画布宽（vp）
   * @param pxPerDiv 每格像素
   * @param centerY 通道基线 y
   */
  static buildTrace(ch: ChannelParams, timeStart: number, totalTime: number,
    width: number, pxPerDiv: number, centerY: number): TraceBuffer {
    const buf: TraceBuffer = new TraceBuffer();
    const n: number = Math.max(2, Math.min(ScopeEngine.MAX_SAMPLES, Math.floor(width)));
    const dt: number = totalTime / (n - 1);
    const phiCh: number = ch.phaseDeg * WaveMath.DEG2RAD;
    const baseY: number = centerY - ch.offsetDiv * pxPerDiv;
    let vMin: number = Number.MAX_VALUE;
    let vMax: number = -Number.MAX_VALUE;
    let sumSq: number = 0;

    for (let x = 0; x < n; x++) {
      const reversedX: number = n - 1 - x;
      const t: number = timeStart + reversedX * dt;
      const phaseVal: number = WaveMath.TWO_PI * ch.frequency * t + phiCh;
      const v: number = WaveMath.voltage(ch.waveType, phaseVal, ch.amplitude);
      buf.xs.push(x);
      buf.ys.push(baseY - (v / ch.voltsDiv) * pxPerDiv);
      if (v < vMin) {
        vMin = v;
      }
      if (v > vMax) {
        vMax = v;
      }
      sumSq += v * v;
    }
    buf.vpp = vMax - vMin;
    buf.vrms = Math.sqrt(sumSq / n);
    return buf;
  }

  /** 叠加模式：两个通道电压相加后一起显示 */
  static buildOverlay(c1: ChannelParams, c2: ChannelParams, timeStart: number, totalTime: number,
    width: number, pxPerDiv: number, centerY: number): TraceBuffer {
    const buf: TraceBuffer = new TraceBuffer();
    const n: number = Math.max(2, Math.min(ScopeEngine.MAX_SAMPLES, Math.floor(width)));
    const dt: number = totalTime / (n - 1);
    const phi1: number = c1.phaseDeg * WaveMath.DEG2RAD;
    const phi2: number = c2.phaseDeg * WaveMath.DEG2RAD;
    const baseY: number = centerY;
    const div: number = Math.max(c1.voltsDiv, c2.voltsDiv);
    let vMin: number = Number.MAX_VALUE;
    let vMax: number = -Number.MAX_VALUE;
    let sumSq: number = 0;

    for (let x = 0; x < n; x++) {
      const reversedX: number = n - 1 - x;
      const t: number = timeStart + reversedX * dt;
      const v1: number = WaveMath.voltage(c1.waveType, WaveMath.TWO_PI * c1.frequency * t + phi1, c1.amplitude);
      const v2: number = WaveMath.voltage(c2.waveType, WaveMath.TWO_PI * c2.frequency * t + phi2, c2.amplitude);
      const v: number = v1 + v2;
      buf.xs.push(x);
      buf.ys.push(baseY - (v / div) * pxPerDiv);
      if (v < vMin) {
        vMin = v;
      }
      if (v > vMax) {
        vMax = v;
      }
      sumSq += v * v;
    }
    buf.vpp = vMax - vMin;
    buf.vrms = Math.sqrt(sumSq / n);
    return buf;
  }

  /**
   * 李萨如图形：x 由 CH1 驱动，y 由 CH2 驱动。
   * 频率比化简成整数比 a:b，参数区间取公共周期 2π / gcd(a,b)。
   */
  static buildLissajous(c1: ChannelParams, c2: ChannelParams, width: number, height: number,
    pxPerDiv: number): TraceBuffer {
    const buf: TraceBuffer = new TraceBuffer();
    const ratio: number[] = WaveMath.simplifyRatio(c1.frequency, c2.frequency, 15);
    const a: number = Math.max(1, ratio[0]);
    const b: number = Math.max(1, ratio[1]);
    const g: number = Math.max(1, Math.round(WaveMath.gcdPrecise(a, b)));
    const tMax: number = WaveMath.TWO_PI / g;
    const n: number = 2000;
    const cx: number = width / 2 - c1.offsetDiv * pxPerDiv;
    const cy: number = height / 2 + c2.offsetDiv * pxPerDiv;
    const sx: number = pxPerDiv * (c1.amplitude / Math.max(c1.voltsDiv, 0.01));
    const sy: number = pxPerDiv * (c2.amplitude / Math.max(c2.voltsDiv, 0.01));
    const phi1: number = c1.phaseDeg * WaveMath.DEG2RAD;
    const phi2: number = c2.phaseDeg * WaveMath.DEG2RAD;

    for (let i = 0; i <= n; i++) {
      const t: number = tMax * i / n;
      buf.xs.push(cx + sx * Math.sin(a * t + phi1));
      buf.ys.push(cy - sy * Math.sin(b * t + phi2));
    }
    return buf;
  }

  /**
   * 寻找触发电平穿越点，返回满足条件的相位 φ0 ∈ [0, 2π)
   * 找不到（电平超出波形幅度）时返回 0。
   */
  static findTriggerPhase(ch: ChannelParams, level: number, rising: boolean): number {
    const steps: number = 1440;
    const step: number = WaveMath.TWO_PI / steps;
    let prevVal: number = WaveMath.voltage(ch.waveType, 0, ch.amplitude) - level;
    for (let i = 1; i <= steps; i++) {
      const phi: number = step * i;
      const cur: number = WaveMath.voltage(ch.waveType, phi, ch.amplitude) - level;
      const cross: boolean = rising ? (prevVal <= 0 && cur > 0) : (prevVal >= 0 && cur < 0);
      if (cross && Math.abs(prevVal - cur) > 1e-9) {
        const frac: number = prevVal / (prevVal - cur);
        return step * (i - 1 + frac);
      }
      prevVal = cur;
    }
    return 0;
  }

  /**
   * 由触发点反解窗口起始时刻，使波形在屏幕上稳定不动
   */
  static triggeredStart(ch: ChannelParams, phase0: number): number {
    const f: number = Math.max(ch.frequency, 0.0001);
    const phiCh: number = ch.phaseDeg * WaveMath.DEG2RAD;
    return (phase0 - phiCh) / (WaveMath.TWO_PI * f);
  }
}
