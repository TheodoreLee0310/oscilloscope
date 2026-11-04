import { fileIo as fs } from '@kit.CoreFileKit';

/**
 * 本地 JSON 存储（P0）
 *
 * 为什么不直接上关系型数据库：当前数据量（≤500 条实验 + 1 份草稿）用 JSON 文件
 * 完全够用，且便于人工排查；接口按「文档存储」抽象，后续换 RDB 只替换本类实现。
 *
 * 三条硬性要求（来自规划）：
 *   1. 原子替换：先写 .tmp 再 rename，避免断电/崩溃留下半个文件；
 *   2. 格式版本：外层信封带 format/version，未来结构升级可识别；
 *   3. 损坏恢复：解析失败时把坏文件改名隔离（.bad-<时间戳>），返回 null 而不是崩溃。
 */

/** 存储信封：业务数据以字符串形式放在 payload 里，便于版本演进与容错 */
export class StoreEnvelope {
  format: string = 'sbq-local-store';
  version: number = 1;
  profile: string = '';
  updatedAtMs: number = 0;
  payload: string = '';
}

export class LocalStore {
  private baseDir: string;

  constructor(filesDir: string) {
    this.baseDir = filesDir + '/sbq-store';
  }

  /**
   * 账号隔离键：服务器地址 + userId。
   * 服务器地址里的 : / 等字符不能出现在文件名里，统一替换成下划线。
   * 游客（userId <= 0）单独一份，绝不与登录账号混用。
   */
  static profileKey(server: string, userId: number): string {
    const safe: string = server.replace(/[^a-zA-Z0-9]/g, '_');
    if (userId > 0) {
      return safe + '_u' + userId.toString();
    }
    return safe + '_guest';
  }

  private filePath(profile: string): string {
    return this.baseDir + '/' + profile + '.json';
  }

  private ensureDir(): void {
    try {
      if (!fs.accessSync(this.baseDir)) {
        fs.mkdirSync(this.baseDir, true);
      }
    } catch (_) {
      // 目录已存在或并发创建，忽略
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

  /** 读取业务数据；文件不存在 / 版本不认识 / 已损坏 都返回 null */
  read(profile: string): string | null {
    const target: string = this.filePath(profile);
    try {
      if (!fs.accessSync(target)) {
        return null;
      }
      const text: string = fs.readTextSync(target);
      if (text.length === 0) {
        return null;
      }
      const envelope: StoreEnvelope = JSON.parse(text) as StoreEnvelope;
      if (envelope === null || envelope.format !== 'sbq-local-store') {
        this.quarantine(target);
        return null;
      }
      if (envelope.version !== 1) {
        // 更高版本写给更高版本的应用用，这里不猜、不覆盖
        return null;
      }
      return envelope.payload;
    } catch (_) {
      this.quarantine(target);
      return null;
    }
  }

  /** 原子写入：写临时文件 → rename 覆盖 */
  write(profile: string, payload: string): void {
    this.ensureDir();
    const target: string = this.filePath(profile);
    const temp: string = target + '.tmp';
    const envelope: StoreEnvelope = new StoreEnvelope();
    envelope.profile = profile;
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
  }

  remove(profile: string): void {
    const target: string = this.filePath(profile);
    try {
      if (fs.accessSync(target)) {
        fs.unlinkSync(target);
      }
    } catch (_) {
      // 删除失败不影响调用方
    }
  }
}
