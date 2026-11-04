/**
 * 全局常量：配色、网格布局、参数范围
 * 数值来源：原网页版 scripts/constants.js（CANVAS 800x400、16x8 网格、5 细分）
 */
export class Palette {
  static readonly BACKGROUND_IN: string = '#0d2018';
  static readonly BACKGROUND_OUT: string = '#020604';
  static readonly GRID_MAJOR: string = '#1e4030';
  static readonly GRID_MINOR: string = '#132b1f';
  static readonly AXIS: string = '#2f6b45';
  static readonly TEXT: string = '#8fb8a0';
  static readonly TEXT_DIM: string = '#5b7a68';
  static readonly CH1: string = '#2196F3';
  static readonly CH2: string = '#FF5722';
  static readonly OVERLAY: string = '#00E676';
  static readonly TRIGGER: string = '#FFEB3B';
  static readonly ACCENT: string = '#2196F3';
  static readonly PANEL: string = '#0e1a22';
  static readonly PANEL_ITEM: string = '#20303c';
  static readonly PANEL_TEXT: string = '#9aa7b3';
}

/** 屏幕网格：水平 16 格、垂直 8 格，每格 5 细分 */
export class Layout {
  static readonly H_DIVS: number = 16;
  static readonly V_DIVS: number = 8;
  static readonly SUBDIVS: number = 5;
  /** 屏幕宽高比 16:8 = 2:1 */
  static readonly ASPECT: number = 2;
}

/** 参数取值范围（与 waveDrawer.adjustScopeSettings 保持一致） */
export class Limits {
  static readonly TIME_DIV_MIN: number = 0.1;
  static readonly TIME_DIV_MAX: number = 100;
  static readonly VOLTS_DIV_MIN: number = 0.1;
  static readonly VOLTS_DIV_MAX: number = 10;
  static readonly FREQ_MIN: number = 0.1;
  static readonly FREQ_MAX: number = 1000;
  static readonly AMP_MIN: number = 0.1;
  static readonly AMP_MAX: number = 5;
  static readonly TRIGGER_MIN: number = -5;
  static readonly TRIGGER_MAX: number = 5;
  static readonly POS_MIN: number = -3;
  static readonly POS_MAX: number = 3;
  static readonly PHASE_MIN: number = 0;
  static readonly PHASE_MAX: number = 360;
}
