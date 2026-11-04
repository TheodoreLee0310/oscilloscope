/**
 * 波形数学：把网页版 WaveformUtilities.js / WaveformGenerator.js 的算法原样搬过来。
 * 这里全部是纯函数，不依赖任何 UI。
 */
export class WaveMath {
  static readonly TWO_PI: number = Math.PI * 2;
  static readonly DEG2RAD: number = Math.PI / 180;
  static readonly RAD2DEG: number = 180 / Math.PI;

  static clamp(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) {
      return min;
    }
    if (value < min) {
      return min;
    }
    if (value > max) {
      return max;
    }
    return value;
  }

  /** 归一化相位到 [0, 2π) */
  static normPhase(phaseVal: number): number {
    let p: number = phaseVal % WaveMath.TWO_PI;
    if (p < 0) {
      p += WaveMath.TWO_PI;
    }
    return p;
  }

  /**
   * 单个采样点的瞬时电压
   * waveType: sine | square | triangle | sawtooth | pulse | noise
   */
  static voltage(waveType: string, phaseVal: number, amplitude: number): number {
    if (!Number.isFinite(phaseVal) || !Number.isFinite(amplitude)) {
      return 0;
    }
    const p: number = WaveMath.normPhase(phaseVal);
    let unit: number = 0;
    switch (waveType) {
      case 'square':
        unit = Math.sin(p) >= 0 ? 1 : -1;
        break;
      case 'triangle':
        // 对应 (|((t/π) % 2) - 1| * 2 - 1)：相位 0 处为波峰
        unit = 2 * Math.abs(((p / Math.PI) % 2) - 1) - 1;
        break;
      case 'sawtooth':
        unit = (p / WaveMath.TWO_PI) * 2 - 1;
        break;
      case 'pulse':
        unit = Math.sin(p) > 0.7 ? 1 : -1;
        break;
      case 'noise':
        unit = Math.random() * 2 - 1;
        break;
      case 'sine':
      default:
        unit = Math.sin(p);
        break;
    }
    return unit * amplitude;
  }

  /**
   * 精确 GCD（原实现先 ×1000 取整再欧几里得，避免浮点误差）
   */
  static gcdPrecise(a: number, b: number): number {
    let x: number = Math.round(Math.abs(a) * 1000);
    let y: number = Math.round(Math.abs(b) * 1000);
    if (x === 0 || y === 0) {
      return 0;
    }
    while (y !== 0) {
      const t: number = y;
      y = x % y;
      x = t;
    }
    return x / 1000;
  }

  static lcmPrecise(a: number, b: number): number {
    const g: number = WaveMath.gcdPrecise(a, b);
    if (g === 0) {
      return 0;
    }
    return Math.abs(a * b) / g;
  }

  /**
   * 频率比化简成小整数比。
   * 化简不出 ≤maxValue 的整数比时，退化为 (1, round(fy/fx)) 形式。
   */
  static simplifyRatio(fx: number, fy: number, maxValue: number): number[] {
    const a: number = Math.max(fx, 0.0001);
    const b: number = Math.max(fy, 0.0001);
    const g: number = WaveMath.gcdPrecise(a, b);
    if (g > 0) {
      const ra: number = Math.round(a / g);
      const rb: number = Math.round(b / g);
      if (ra >= 1 && rb >= 1 && ra <= maxValue && rb <= maxValue) {
        const out: number[] = [ra, rb];
        return out;
      }
    }
    const ratio: number = b / a;
    const intRatio: number = Math.round(ratio * 10) / 10;
    if (Math.abs(intRatio - Math.round(intRatio)) < 0.001 && Math.round(intRatio) >= 1 &&
      Math.round(intRatio) <= maxValue) {
      const out2: number[] = [1, Math.round(intRatio)];
      return out2;
    }
    const out3: number[] = [1, Math.max(1, Math.min(maxValue, Math.round(intRatio)))];
    return out3;
  }

  static formatFreq(hz: number): string {
    if (hz >= 1000) {
      return (hz / 1000).toFixed(2) + ' kHz';
    }
    return hz.toFixed(1) + ' Hz';
  }

  static formatVolt(v: number): string {
    return v.toFixed(2) + ' V';
  }

  static formatTimeDiv(t: number): string {
    if (t >= 1) {
      return t.toFixed(2) + ' s/div';
    }
    if (t >= 0.001) {
      return (t * 1000).toFixed(2) + ' ms/div';
    }
    return (t * 1000000).toFixed(1) + ' µs/div';
  }
}
