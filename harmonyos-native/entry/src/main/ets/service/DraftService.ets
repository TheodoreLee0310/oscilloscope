import { LocalStore, StoreStatus } from './LocalStore';
import { ChannelParams, ScopeSetup } from '../model/ScopeTypes';

/**
 * 本机自动草稿（与正式记录分开存储）
 *
 * - 草稿是**单份、按账号隔离、自动覆盖**的临时现场（数据名 `draft`）；
 * - 正式记录由 RecordsService 存在另一个数据名 `records` 下，二者互不覆盖；
 * - 读取时按 nativeRules 同口径校验范围，越界一律丢弃，不猜、不修补。
 */

const DRAFT_NAME: string = 'draft';
const ALLOWED_MODES: string[] = ['dual', 'overlay', 'lissajous'];
const ALLOWED_WAVES: string[] = ['sine', 'square', 'triangle', 'sawtooth', 'pulse', 'noise'];

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
  /** 最近一次读取的状态，供 UI 判断要不要提示"发现无法确认归属的旧数据" */
  private lastStatus: number = StoreStatus.MISSING;

  constructor(filesDir: string) {
    this.store = new LocalStore(filesDir);
  }

  save(server: string, userId: number, setup: ScopeSetup): boolean {
    const record: DraftRecord = new DraftRecord();
    record.savedAtMs = Date.now();
    // runTimeSec 每帧都在变，存下来没有意义，统一归零
    setup.runTimeSec = 0;
    record.setup = setup;
    let payload: string = '';
    try {
      payload = JSON.stringify(record);
    } catch (_) {
      return false;
    }
    return this.store.write(server, userId, DRAFT_NAME, payload);
  }

  /** 只有归属校验通过才返回草稿；FOREIGN / UNSUPPORTED 一律返回 null 并保留原文件 */
  load(server: string, userId: number): DraftRecord | null {
    const result = this.store.read(server, userId, DRAFT_NAME);
    this.lastStatus = result.status;
    if (result.status !== StoreStatus.OK) {
      return null;
    }
    try {
      const record: DraftRecord = JSON.parse(result.payload) as DraftRecord;
      if (record === null || !isValidDraftSetup(record.setup)) {
        return null;
      }
      return record;
    } catch (_) {
      return null;
    }
  }

  status(): number {
    return this.lastStatus;
  }

  clear(server: string, userId: number): void {
    this.store.remove(server, userId, DRAFT_NAME);
  }

  /** 是否存在上一版字符键的草稿（可能碰撞，不自动迁入） */
  hasLegacy(server: string, userId: number): boolean {
    return this.store.hasLegacy(server, userId, DRAFT_NAME);
  }

  /** 用户明确要求时才删除旧版残留 */
  discardLegacy(server: string, userId: number): void {
    this.store.removeLegacy(server, userId, DRAFT_NAME);
  }
}
