import { fileIo as fs } from '@kit.CoreFileKit';
import { exportFileName } from './ExperimentTransfer';

/**
 * 导出文件的落盘与读取（P1 任务 6）
 *
 * 放在应用沙箱的 files/exports 下：
 *   - 导出是「只写实验数据」的纯 JSON，不含令牌/密码/会话；
 *   - 原子写入，避免半截文件被当成合法导出；
 *   - 导入时既可以选自己导出过的文件，也可以手填路径。
 *
 * 说明：这里刻意没有用系统「文件选择器」，因为那需要在真机上验证交互；
 * 待设备可用后可作为增强项（当前实现可在无设备时被逻辑测试覆盖）。
 */
export class ExportFileInfo {
  name: string = '';
  path: string = '';
  sizeBytes: number = 0;
  savedAtMs: number = 0;
}

export class ExportFiles {
  private dir: string;

  constructor(filesDir: string) {
    this.dir = filesDir + '/exports';
  }

  get directory(): string {
    return this.dir;
  }

  private ensureDir(): void {
    try {
      if (!fs.accessSync(this.dir)) {
        fs.mkdirSync(this.dir, true);
      }
    } catch (_) {
      // 已存在或并发创建，忽略
    }
  }

  /** 原子写入，返回落盘信息 */
  write(text: string): ExportFileInfo {
    this.ensureDir();
    const name: string = exportFileName(new Date());
    const target: string = this.dir + '/' + name;
    const temp: string = target + '.tmp';
    const file = fs.openSync(temp, fs.OpenMode.CREATE | fs.OpenMode.READ_WRITE | fs.OpenMode.TRUNC);
    try {
      fs.writeSync(file.fd, text);
    } finally {
      fs.closeSync(file);
    }
    fs.renameSync(temp, target);
    const info: ExportFileInfo = new ExportFileInfo();
    info.name = name;
    info.path = target;
    info.savedAtMs = Date.now();
    try {
      info.sizeBytes = fs.statSync(target).size;
    } catch (_) {
      info.sizeBytes = text.length;
    }
    return info;
  }

  /** 列出已导出的文件，按时间从新到旧 */
  list(): ExportFileInfo[] {
    const result: ExportFileInfo[] = [];
    try {
      if (!fs.accessSync(this.dir)) {
        return result;
      }
      const names: string[] = fs.listFileSync(this.dir);
      for (let i = 0; i < names.length; i++) {
        const name: string = names[i];
        if (!name.endsWith('.json')) {
          continue;
        }
        const full: string = this.dir + '/' + name;
        try {
          const stat = fs.statSync(full);
          const info: ExportFileInfo = new ExportFileInfo();
          info.name = name;
          info.path = full;
          info.sizeBytes = stat.size;
          info.savedAtMs = stat.mtime * 1000;
          result.push(info);
        } catch (_) {
          // 单个文件读不到不影响其余
        }
      }
    } catch (_) {
      return result;
    }
    result.sort((a: ExportFileInfo, b: ExportFileInfo): number => b.savedAtMs - a.savedAtMs);
    return result;
  }

  read(path: string): string {
    return fs.readTextSync(path);
  }
}
