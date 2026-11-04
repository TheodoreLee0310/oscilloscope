import { fileIo as fs } from '@kit.CoreFileKit';

/**
 * 本地 JSON 存储（v2）
 *
 * 与 v1 的关键差别（按评审意见）：
 *   - 信封除了哈希分区键，还**保存并核对**「规范化服务器地址 + userId + 数据名」。
 *     只比哈希不够：哈希相同只能说明可能同源，不能证明归属。
 *   - 归属核对失败时**不删除、不改名、不迁入**，返回 FOREIGN 让上层提示用户处理；
 *     旧版本信封（缺少归属字段）返回 UNSUPPORTED，同样保留原文件。
 *     只有"确实是坏数据"（无法解析 / 格式标记不对）才会被隔离改名。
 *   - 同一分区下用 name 区分不同数据（draft / records），草稿与正式记录互不覆盖。
 */

export class StoreEnvelope {
  format: string = 'sbq-local-store';
  version: number = 2;
  /** 数据名：draft / records */
  name: string = '';
  /** 规范化服务器地址（核对归属用） */
  server: string = '';
  userId: number = 0;
  /** 哈希分区键（只用于文件名） */
  profile: string = '';
  updatedAtMs: number = 0;
  payload: string = '';
}

/**
 * 读取状态。
 * 用类常量而不是 enum：电脑侧的逻辑测试装置走 strip-only 剥类型，不支持 enum。
 */
export class StoreStatus {
  /** 读取成功且归属校验通过 */
  static readonly OK: number = 0;
  /** 文件不存在 */
  static readonly MISSING: number = 1;
  /** 归属校验不通过（账号/服务器/数据名不一致），文件已保留 */
  static readonly FOREIGN: number = 2;
  /** 内容损坏，已隔离为 .bad-<ts> */
  static readonly CORRUPT: number = 3;
  /** 旧版本信封，缺少归属字段，文件已保留 */
  static readonly UNSUPPORTED: number = 4;
}

export class StoreReadResult {
  status: number = StoreStatus.MISSING;
  payload: string = '';
}

function fnv1a(input: string, seed: number): string {
  let hash: number = seed >>> 0;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return ('00000000' + hash.toString(16)).slice(-8);
}

export class LocalStore {
  private baseDir: string;

  constructor(filesDir: string) {
    this.baseDir = filesDir + '/sbq-store';
  }

  static normalizeServer(server: string): string {
    let value: string = server.trim().toLowerCase();
    while (value.endsWith('/')) {
      value = value.substring(0, value.length - 1);
    }
    return value;
  }

  /** 哈希分区键：只用于文件名，归属仍靠信封字段核对 */
  static profileKey(server: string, userId: number): string {
    const material: string = LocalStore.normalizeServer(server) + '#' + userId.toString();
    return 'p' + fnv1a(material, 0x811c9dc5) + fnv1a(material, 0x1b873593);
  }

  /** 上一版用字符替换做的键：可能碰撞，只用于"发现旧数据"，绝不用于自动迁入 */
  static legacyProfileKey(server: string, userId: number): string {
    const safe: string = server.replace(/[^a-zA-Z0-9]/g, '_');
    if (userId > 0) {
      return safe + '_u' + userId.toString();
    }
    return safe + '_guest';
  }

  private pathOf(server: string, userId: number, name: string): string {
    return this.baseDir + '/' + LocalStore.profileKey(server, userId) + '.' + name + '.json';
  }

  private legacyPathOf(server: string, userId: number, name: string): string {
    return this.baseDir + '/' + LocalStore.legacyProfileKey(server, userId) + '.' + name + '.json';
  }

  private ensureDir(): void {
    try {
      if (!fs.accessSync(this.baseDir)) {
        fs.mkdirSync(this.baseDir, true);
      }
    } catch (_) {
      // 已存在或并发创建，忽略
    }
  }

  private quarantine(target: string): void {
    try {
      if (fs.accessSync(target)) {
        fs.renameSync(target, target + '.bad-' + Date.now().toString());
      }
    } catch (_) {
      // 隔离失败不影响主流程
    }
  }

  /**
   * 读取并核对归属。
   * 只有"坏了"才隔离；"不是你的"一律原样保留。
   */
  read(server: string, userId: number, name: string): StoreReadResult {
    const result: StoreReadResult = new StoreReadResult();
    const target: string = this.pathOf(server, userId, name);
    try {
      if (!fs.accessSync(target)) {
        result.status = StoreStatus.MISSING;
        return result;
      }
      const text: string = fs.readTextSync(target);
      let envelope: StoreEnvelope | null = null;
      try {
        envelope = JSON.parse(text) as StoreEnvelope;
      } catch (_) {
        envelope = null;
      }
      if (envelope === null || envelope.format !== 'sbq-local-store') {
        this.quarantine(target);
        result.status = StoreStatus.CORRUPT;
        return result;
      }
      // 旧版信封没有归属字段：保留文件，交给上层提示，不猜测归属
      if (envelope.version !== 2 || envelope.server === undefined || envelope.server === '') {
        result.status = StoreStatus.UNSUPPORTED;
        return result;
      }
      const expectedProfile: string = LocalStore.profileKey(server, userId);
      const sameServer: boolean = envelope.server === LocalStore.normalizeServer(server);
      const sameUser: boolean = envelope.userId === userId;
      const sameName: boolean = envelope.name === name;
      const sameProfile: boolean = envelope.profile === expectedProfile;
      if (!sameServer || !sameUser || !sameName || !sameProfile) {
        // 归属不符：可能是被复制/改名过来的别人的数据，保留原文件
        result.status = StoreStatus.FOREIGN;
        return result;
      }
      result.status = StoreStatus.OK;
      result.payload = envelope.payload;
      return result;
    } catch (_) {
      this.quarantine(target);
      result.status = StoreStatus.CORRUPT;
      return result;
    }
  }

  write(server: string, userId: number, name: string, payload: string): boolean {
    try {
      this.ensureDir();
      const target: string = this.pathOf(server, userId, name);
      const temp: string = target + '.tmp';
      const envelope: StoreEnvelope = new StoreEnvelope();
      envelope.name = name;
      envelope.server = LocalStore.normalizeServer(server);
      envelope.userId = userId;
      envelope.profile = LocalStore.profileKey(server, userId);
      envelope.updatedAtMs = Date.now();
      envelope.payload = payload;
      const text: string = JSON.stringify(envelope);
      const file = fs.openSync(temp, fs.OpenMode.CREATE | fs.OpenMode.READ_WRITE | fs.OpenMode.TRUNC);
      try {
        fs.writeSync(file.fd, text);
      } finally {
        fs.closeSync(file);
      }
      fs.renameSync(temp, target);
      return true;
    } catch (_) {
      return false;
    }
  }

  remove(server: string, userId: number, name: string): void {
    try {
      const target: string = this.pathOf(server, userId, name);
      if (fs.accessSync(target)) {
        fs.unlinkSync(target);
      }
    } catch (_) {
      // 删除失败不影响调用方
    }
  }

  /** 是否存在上一版字符键留下的同类型数据（可能碰撞，需用户显式处理） */
  hasLegacy(server: string, userId: number, name: string): boolean {
    try {
      return fs.accessSync(this.legacyPathOf(server, userId, name));
    } catch (_) {
      return false;
    }
  }

  /** 明确要求时才删除旧版残留（绝不自动迁入） */
  removeLegacy(server: string, userId: number, name: string): void {
    try {
      const target: string = this.legacyPathOf(server, userId, name);
      if (fs.accessSync(target)) {
        fs.unlinkSync(target);
      }
    } catch (_) {
      // 忽略
    }
  }
}
