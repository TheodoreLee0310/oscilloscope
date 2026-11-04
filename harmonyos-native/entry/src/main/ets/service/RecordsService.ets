import { LocalStore, StoreStatus } from './LocalStore';

/**
 * 本机离线记录（本轮只做本地，不做上传）
 *
 * 数据模型为将来的同步预留字段：
 *   clientId   —— 创建时生成的稳定标识，同步阶段用作 (userId, clientId) 的唯一键
 *   rev        —— 本地修订号，用于后续冲突检测（不用设备时间判断新旧）
 *   updatedAtMs —— 最后修改时间（仅展示用，不作为冲突依据）
 *   deleted    —— 删除墓碑，已同步过的记录删除后必须保留
 *   syncState  —— local（仅本机）/ pending（待同步）/ synced（已同步）/ deleted
 *   remoteId   —— 服务器 id，同步后回填
 *
 * 约定：
 *   - 自动草稿与正式记录分开存储（数据名 draft / records）；
 *   - 按「规范化服务器地址 + userId」隔离，游客为 userId 0；
 *   - 删除未上传记录直接移除；已同步（或曾有远端副本）的记录只打墓碑；
 *   - 本轮不自动上传：联网也保持本机状态，界面上明确显示。
 */

const RECORDS_NAME: string = 'records';
const SYNC_LOCAL: string = 'local';
const SYNC_PENDING: string = 'pending';
const SYNC_SYNCED: string = 'synced';
const SYNC_DELETED: string = 'deleted';

let clientSequence: number = 0;

/** 生成稳定的客户端标识：时间戳 + 随机 + 进程内序号，无需网络与系统加密服务 */
export function newClientId(): string {
  clientSequence = (clientSequence + 1) % 1679616;
  const random: string = Math.floor(Math.random() * 4294967296).toString(16).padStart(8, '0');
  return 'c' + Date.now().toString(36) + '-' + random + '-' + clientSequence.toString(36);
}

export class LocalRecord {
  clientId: string = '';
  title: string = '';
  notes: string = '';
  /** 参数快照（原生 v2 的 ScopeSetup JSON） */
  setupJson: string = '';
  createdAtMs: number = 0;
  updatedAtMs: number = 0;
  rev: number = 0;
  deleted: boolean = false;
  syncState: string = SYNC_LOCAL;
  remoteId: string = '';
}

class RecordsPayload {
  format: string = 'sbq-local-records';
  version: number = 1;
  records: LocalRecord[] = [];
}

/** remove 的结果，便于 UI 区分"没有这条"和"留了墓碑" */
export class RemoveResult {
  ok: boolean = false;
  /** removed（直接删除）/ tombstoned（保留墓碑）/ missing / failed */
  kind: string = 'failed';
}

export class RecordsService {
  private store: LocalStore;
  private lastStatus: number = StoreStatus.MISSING;

  constructor(filesDir: string) {
    this.store = new LocalStore(filesDir);
  }

  private loadPayload(server: string, userId: number): RecordsPayload | null {
    const result = this.store.read(server, userId, RECORDS_NAME);
    this.lastStatus = result.status;
    if (result.status !== StoreStatus.OK) {
      return null;
    }
    try {
      const payload: RecordsPayload = JSON.parse(result.payload) as RecordsPayload;
      if (payload === null || payload.format !== 'sbq-local-records' || !Array.isArray(payload.records)) {
        return null;
      }
      return payload;
    } catch (_) {
      return null;
    }
  }

  private savePayload(server: string, userId: number, payload: RecordsPayload): boolean {
    return this.store.write(server, userId, RECORDS_NAME, JSON.stringify(payload));
  }

  status(): number {
    return this.lastStatus;
  }

  /** 未删除的记录，按最后修改时间从新到旧 */
  list(server: string, userId: number): LocalRecord[] {
    const payload: RecordsPayload | null = this.loadPayload(server, userId);
    const result: LocalRecord[] = [];
    if (payload === null) {
      return result;
    }
    for (let i = 0; i < payload.records.length; i++) {
      const record: LocalRecord = payload.records[i];
      if (!record.deleted) {
        result.push(record);
      }
    }
    result.sort((a: LocalRecord, b: LocalRecord): number => b.updatedAtMs - a.updatedAtMs);
    return result;
  }

  get(server: string, userId: number, clientId: string): LocalRecord | null {
    const payload: RecordsPayload | null = this.loadPayload(server, userId);
    if (payload === null) {
      return null;
    }
    for (let i = 0; i < payload.records.length; i++) {
      if (payload.records[i].clientId === clientId) {
        return payload.records[i];
      }
    }
    return null;
  }

  /** 新增；标题非法或写盘失败返回 null */
  create(server: string, userId: number, title: string, notes: string, setupJson: string): LocalRecord | null {
    const trimmed: string = title.trim();
    if (trimmed.length === 0 || trimmed.length > 80) {
      return null;
    }
    if (notes.length > 2000) {
      return null;
    }
    let payload: RecordsPayload | null = this.loadPayload(server, userId);
    if (payload === null) {
      payload = new RecordsPayload();
    }
    const record: LocalRecord = new LocalRecord();
    record.clientId = newClientId();
    record.title = trimmed;
    record.notes = notes;
    record.setupJson = setupJson;
    record.createdAtMs = Date.now();
    record.updatedAtMs = record.createdAtMs;
    record.rev = 1;
    record.deleted = false;
    record.syncState = SYNC_LOCAL;
    record.remoteId = '';
    payload.records.push(record);
    if (!this.savePayload(server, userId, payload)) {
      return null;
    }
    return record;
  }

  /** 编辑；已同步过的记录编辑后转为待同步 */
  update(server: string, userId: number, clientId: string, title: string, notes: string,
    setupJson: string): boolean {
    const trimmed: string = title.trim();
    if (trimmed.length === 0 || trimmed.length > 80 || notes.length > 2000) {
      return false;
    }
    const payload: RecordsPayload | null = this.loadPayload(server, userId);
    if (payload === null) {
      return false;
    }
    for (let i = 0; i < payload.records.length; i++) {
      const record: LocalRecord = payload.records[i];
      if (record.clientId !== clientId) {
        continue;
      }
      record.title = trimmed;
      record.notes = notes;
      record.setupJson = setupJson;
      record.rev = record.rev + 1;
      record.updatedAtMs = Date.now();
      if (record.syncState === SYNC_SYNCED) {
        record.syncState = SYNC_PENDING;
      }
      return this.savePayload(server, userId, payload);
    }
    return false;
  }

  /**
   * 删除：
   *   - 从未上传（syncState=local 且无 remoteId）→ 直接从文件里移除；
   *   - 曾有远端副本（synced / pending / 有 remoteId）→ 只打删除墓碑，等同步阶段上报。
   */
  remove(server: string, userId: number, clientId: string): RemoveResult {
    const result: RemoveResult = new RemoveResult();
    const payload: RecordsPayload | null = this.loadPayload(server, userId);
    if (payload === null) {
      result.kind = 'missing';
      return result;
    }
    let index: number = -1;
    for (let i = 0; i < payload.records.length; i++) {
      if (payload.records[i].clientId === clientId) {
        index = i;
        break;
      }
    }
    if (index < 0) {
      result.kind = 'missing';
      return result;
    }
    const record: LocalRecord = payload.records[index];
    const everUploaded: boolean = record.remoteId.length > 0 ||
      record.syncState === SYNC_SYNCED || record.syncState === SYNC_PENDING;
    if (everUploaded) {
      record.deleted = true;
      record.syncState = SYNC_DELETED;
      record.rev = record.rev + 1;
      record.updatedAtMs = Date.now();
      if (!this.savePayload(server, userId, payload)) {
        result.kind = 'failed';
        return result;
      }
      result.ok = true;
      result.kind = 'tombstoned';
      return result;
    }
    payload.records.splice(index, 1);
    if (!this.savePayload(server, userId, payload)) {
      result.kind = 'failed';
      return result;
    }
    result.ok = true;
    result.kind = 'removed';
    return result;
  }

  count(server: string, userId: number): number {
    return this.list(server, userId).length;
  }

  /** 游客分区里有多少条（用于"是否迁入账号"的确认提示） */
  guestCount(server: string): number {
    return this.count(server, 0);
  }

  /**
   * 把游客记录迁入指定账号。
   * 只应由 UI 在用户明确确认后调用；成功写入账号分区后才删除游客分区。
   * 相同 clientId 已存在则跳过，避免重复。
   */
  migrateGuest(server: string, toUserId: number): number {
    if (toUserId <= 0) {
      return 0;
    }
    const guest: RecordsPayload | null = this.loadPayload(server, 0);
    if (guest === null || guest.records.length === 0) {
      return 0;
    }
    let target: RecordsPayload | null = this.loadPayload(server, toUserId);
    if (target === null) {
      target = new RecordsPayload();
    }
    const existing: Set<string> = new Set<string>();
    for (let i = 0; i < target.records.length; i++) {
      existing.add(target.records[i].clientId);
    }
    let migrated: number = 0;
    for (let i = 0; i < guest.records.length; i++) {
      const record: LocalRecord = guest.records[i];
      if (existing.has(record.clientId)) {
        continue;
      }
      target.records.push(record);
      migrated++;
    }
    if (migrated === 0) {
      return 0;
    }
    if (!this.savePayload(server, toUserId, target)) {
      return 0;
    }
    this.store.remove(server, 0, RECORDS_NAME);
    return migrated;
  }

  /** 是否存在旧版字符键留下的记录文件（可能碰撞，不自动迁入） */
  hasLegacy(server: string, userId: number): boolean {
    return this.store.hasLegacy(server, userId, RECORDS_NAME);
  }

  /** 用户明确要求时才删除旧版残留 */
  discardLegacy(server: string, userId: number): void {
    this.store.removeLegacy(server, userId, RECORDS_NAME);
  }
}
