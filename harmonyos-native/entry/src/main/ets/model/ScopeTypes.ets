/** 波形类型选项 */
export class WaveOption {
  key: string;
  label: string;

  constructor(key: string, label: string) {
    this.key = key;
    this.label = label;
  }
}

/** 单个通道的电气参数 */
export class ChannelParams {
  enabled: boolean = true;
  waveType: string = 'sine';
  /** 频率 Hz */
  frequency: number = 50;
  /** 峰值电压 V */
  amplitude: number = 2;
  /** 垂直灵敏度 V/div */
  voltsDiv: number = 1;
  /** 垂直位置（单位：格，正数向上） */
  offsetDiv: number = 0;
  /** 初相 度 */
  phaseDeg: number = 0;
}

/** 一帧绘制所需的完整状态快照 */
export class ScopeSetup {
  /** dual | overlay | lissajous */
  displayMode: string = 'dual';
  /** 时基 s/div */
  timeDiv: number = 0.005;
  triggerEnabled: boolean = true;
  /** 触发电平 V */
  triggerLevel: number = 0;
  triggerRising: boolean = true;
  runTimeSec: number = 0;
  ch1: ChannelParams = new ChannelParams();
  ch2: ChannelParams = new ChannelParams();
}

/** 一条轨迹的采样结果 */
export class TraceBuffer {
  xs: number[] = [];
  ys: number[] = [];
  /** 峰峰值 V */
  vpp: number = 0;
  /** 有效值 V */
  vrms: number = 0;
}

/** 波形下拉选项表 */
export class WaveOptions {
  static readonly ALL: WaveOption[] = [
    new WaveOption('sine', '正弦波'),
    new WaveOption('square', '方波'),
    new WaveOption('triangle', '三角波'),
    new WaveOption('sawtooth', '锯齿波'),
    new WaveOption('pulse', '脉冲波'),
    new WaveOption('noise', '噪声')
  ];

  static labelOf(key: string): string {
    for (let i = 0; i < WaveOptions.ALL.length; i++) {
      if (WaveOptions.ALL[i].key === key) {
        return WaveOptions.ALL[i].label;
      }
    }
    return key;
  }
}
