import { LocalStore } from './LocalStore';
import { ChannelParams, ScopeSetup } from '../model/ScopeTypes';

/**
 * 本机自动草稿（P0）
 *
 * 目标：重启应用后仍能恢复上次的调参现场，不依赖服务器。
 * 与「我的实验」的区别：
 *   - 草稿是**单份、按账号隔离、只在本机**的临时现场，自动覆盖；
 *   - 实验记录是用户显式保存、需要上传服务器的多条数据。
 *
 * 安全边界：草稿从文件读回时必须通过范围校验，越界/缺字段一律视为损坏丢弃，
 * 不做"尽力猜测"的修补（避免把坏数据画到屏幕上）。
 */

const ALLOWED_MODES: string[] = ['dual', 'overlay', 'lissajous'];
const ALLOWED_WAVES: string[] = ['sine', 'square', 'triangle', 'sawtooth', 'pulse', 'noise'];

/** 自动保存的记录结构 */
export class DraftRecord {
  savedAtMs: number = 0;
  setup: ScopeSetup = new ScopeSetup();
}

function isNumberInRange(value: number, min: number, max: number): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function isValidChannel(channel: ChannelParams, mustBeZeroPhase: boolean): boolean {
  if (channel === null || channel === undefined) {
    return false;
  }
  if (ALLOWED_WAVES.indexOf(channel.waveType) < 0) {
    return false;
  }
  if (!isNumberInRange(channel.frequency, 1, 1000)) {
    return false;
  }
  if (!isNumberInRange(channel.amplitude, 0.1, 5)) {
    return false;
  }
  if (!isNumberInRange(channel.voltsDiv, 0.1, 10)) {
    return false;
  }
  if (!isNumberInRange(channel.offsetDiv, -3, 3)) {
    return false;
  }
  if (!isNumberInRange(channel.phaseDeg, 0, 360)) {
    return false;
  }
  if (mustBeZeroPhase && channel.phaseDeg !== 0) {
    return false;
  }
  return true;
}

/** 范围与 shared/experiment-state.js 里 nativeRules 保持一致 */
export function isValidDraftSetup(setup: ScopeSetup): boolean {
  if (setup === null || setup === undefined) {
    return false;
  }
  if (ALLOWED_MODES.indexOf(setup.displayMode) < 0) {
    return false;
  }
  if (!isNumberInRange(setup.timeDiv, 0.001, 0.5)) {
    return false;
  }
  if (!isNumberInRange(setup.triggerLevel, -5, 5)) {
    return false;
  }
  return isValidChannel(setup.ch1, true) && isValidChannel(setup.ch2, false);
}

export class DraftService {
  private store: LocalStore;

  constructor(filesDir: string) {
    this.store = new LocalStore(filesDir);
  }

  /** 保存草稿；失败由调用方忽略（草稿不是关键路径） */
  save(server: string, userId: number, setup: ScopeSetup): boolean {
    try {
      const record: DraftRecord = new DraftRecord();
      record.savedAtMs = Date.now();
      // runTimeSec 每帧都在变，存下来没有意义，统一归零
      setup.runTimeSec = 0;
      record.setup = setup;
      this.store.write(LocalStore.profileKey(server, userId), JSON.stringify(record));
      return true;
    } catch (_) {
      return false;
    }
  }

  /**
   * 读取草稿；损坏或越界返回 null（坏文件已被隔离）。
   * 若新分区键没有、旧版（字符替换键）有，则迁移一次，避免升级后草稿"消失"。
   */
  load(server: string, userId: number): DraftRecord | null {
    const profile: string = LocalStore.profileKey(server, userId);
    let payload: string | null = this.store.read(profile);
    if (payload === null) {
      const legacyProfile: string = LocalStore.legacyProfileKey(server, userId);
      const legacyPayload: string | null = this.store.read(legacyProfile);
      if (legacyPayload !== null) {
        this.store.write(profile, legacyPayload);
        this.store.remove(legacyProfile);
        payload = legacyPayload;
      }
    }
    if (payload === null) {
      return null;
    }
    try {
      const record: DraftRecord = JSON.parse(payload) as DraftRecord;
      if (record === null || !isValidDraftSetup(record.setup)) {
        return null;
      }
      return record;
    } catch (_) {
      return null;
    }
  }

  clear(server: string, userId: number): void {
    this.store.remove(LocalStore.profileKey(server, userId));
  }
}
