/**
 * 实验记录导入/导出的纯逻辑（P1 任务 6）
 *
 * 与 UI 分离，便于在电脑上直接跑逻辑测试。
 * 约定（来自规划）：
 *   - 原生只接受 **v2** 实验格式；网页 v1 明确跳过并说明原因，不做参数映射；
 *   - 导入前先统计「有效 / 跳过 / 失败」，让用户在写入前看到结果；
 *   - 导出内容只包含实验数据，不包含令牌、密码或会话信息。
 */

/** 导入载荷中的单条记录（其余字段原样透传给服务器） */
export class ImportItem {
  title: string = '';
  notes: string = '';
  state: ImportState | null = null;
  createdAt: string = '';
}

export class ImportState {
  version: number = 0;
  parameters: object | null = null;
}

class ImportPayload {
  format: string = '';
  items: ImportItem[] = [];
}

/** 分类结果：只有 valid 会被发送给服务器 */
export class TransferSummary {
  valid: ImportItem[] = [];
  validCount: number = 0;
  /** 网页 v1 格式，原生不导入 */
  skippedV1: number = 0;
  /** 结构非法或版本不支持 */
  failed: number = 0;
  errors: string[] = [];
}

/**
 * 解析导出文件并按格式分类。
 * 任何异常都折算为 failed，不向外抛，方便 UI 直接展示。
 */
export function classifyImport(text: string): TransferSummary {
  const summary: TransferSummary = new TransferSummary();
  if (text.trim().length === 0) {
    summary.failed = 1;
    summary.errors.push('文件内容为空');
    return summary;
  }
  let payload: ImportPayload;
  try {
    payload = JSON.parse(text) as ImportPayload;
  } catch (error) {
    summary.failed = 1;
    summary.errors.push('文件不是合法 JSON：' + (error as Error).message);
    return summary;
  }
  if (payload === null || payload === undefined) {
    summary.failed = 1;
    summary.errors.push('文件内容为空');
    return summary;
  }
  const items = payload.items;
  if (items === null || items === undefined || !Array.isArray(items)) {
    summary.failed = 1;
    summary.errors.push('文件缺少 items 数组');
    return summary;
  }

  for (let i = 0; i < items.length; i++) {
    const index: number = i + 1;
    const item = items[i];
    if (item === null || item === undefined || typeof item.title !== 'string' || item.title.trim().length === 0) {
      summary.failed++;
      summary.errors.push('第 ' + index.toString() + ' 条：缺少标题');
      continue;
    }
    const state = item.state;
    if (state === null || state === undefined) {
      summary.failed++;
      summary.errors.push('第 ' + index.toString() + ' 条：缺少实验参数');
      continue;
    }
    if (state.version === 1) {
      summary.skippedV1++;
      summary.errors.push('第 ' + index.toString() + ' 条：网页 v1 格式，原生版不导入');
      continue;
    }
    if (state.version !== 2) {
      summary.failed++;
      summary.errors.push('第 ' + index.toString() + ' 条：参数版本 ' + state.version.toString() + ' 不受支持');
      continue;
    }
    summary.valid.push(item);
    summary.validCount++;
  }
  return summary;
}

/**
 * 导出前的兜底检查：确认待写入内容里没有凭据字段。
 * 服务器导出本身只含 title/notes/state/createdAt，这里再做一次防御。
 */
const FORBIDDEN_KEYS: string[] = ['token', 'password', 'secret', 'authorization', 'cookie', 'session'];

export function containsSensitiveField(text: string): boolean {
  const lower: string = text.toLowerCase();
  for (let i = 0; i < FORBIDDEN_KEYS.length; i++) {
    if (lower.indexOf('"' + FORBIDDEN_KEYS[i] + '"') >= 0) {
      return true;
    }
  }
  return false;
}

/** 生成导出文件名：sbq-experiments-YYYYMMDD-HHmmss.json */
export function exportFileName(date: Date): string {
  const pad = (value: number): string => (value < 10 ? '0' + value.toString() : value.toString());
  const stamp: string = date.getFullYear().toString() + pad(date.getMonth() + 1) + pad(date.getDate()) +
    '-' + pad(date.getHours()) + pad(date.getMinutes()) + pad(date.getSeconds());
  return 'sbq-experiments-' + stamp + '.json';
}
