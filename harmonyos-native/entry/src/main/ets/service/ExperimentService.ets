import { http } from '@kit.NetworkKit';
import { ApiService } from './ApiService';
import { ScopeSetup } from '../model/ScopeTypes';
import { ImportItem } from './ExperimentTransfer';

export class NativeState {
  version: number = 2;
  parameters: ScopeSetup = new ScopeSetup();
}
export interface ExperimentSummary {
  id: string;
  title: string;
  notes: string;
  createdAt: string;
  stateVersion: number;
}
/** 分页结果：items 之外还带总数，便于「加载更多」 */
export class ExperimentPage {
  items: ExperimentSummary[] = [];
  total: number = 0;
  limit: number = 0;
  offset: number = 0;
}
/** 导入结果：服务器实际写入数与跳过数 */
export class ImportOutcome {
  imported: number = 0;
  skipped: number = 0;
  errors: string[] = [];
}
class UpdateBody {
  title: string;
  notes: string;
  constructor(title: string, notes: string) {
    this.title = title;
    this.notes = notes;
  }
}
class ImportBody {
  format: string = 'sbq-experiments';
  items: ImportItem[] = [];
  constructor(items: ImportItem[]) {
    this.items = items;
  }
}
interface Experiment extends ExperimentSummary { state: NativeState; }
interface ListBody { items: ExperimentSummary[]; }
interface ItemBody { item: Experiment; }
class SaveBody {
  title: string;
  notes: string;
  state: NativeState = new NativeState();
  constructor(title: string, notes: string, setup: ScopeSetup) {
    this.title = title; this.notes = notes;
    setup.runTimeSec = 0;
    this.state.parameters = setup;
  }
}
export class ExperimentService {
  private static async request(route: string, method: http.RequestMethod, payload: string = ''): Promise<string> {
    const token: string = AppStorage.get<string>('token') || '';
    if (token.length === 0) throw new Error('请先登录账号，游客不能保存实验');
    // 令牌过期只影响「上云」：本机草稿与调参继续可用，因此这里给出可区分的提示
    const expiresAtMs: number = AppStorage.get<number>('expiresAtMs') || 0;
    if (expiresAtMs > 0 && expiresAtMs <= Date.now()) {
      throw new Error('登录已过期：本机功能仍可用，请重新登录后再上传或同步');
    }
    return ApiService.request(AppStorage.get<string>('server') || ApiService.DEFAULT_SERVER, route, method, payload, token);
  }
  static async list(): Promise<ExperimentSummary[]> {
    const result: ListBody = JSON.parse(await ExperimentService.request('/experiments', http.RequestMethod.GET)) as ListBody;
    return result.items;
  }
  static async save(title: string, notes: string, setup: ScopeSetup): Promise<void> {
    await ExperimentService.request('/experiments', http.RequestMethod.POST, JSON.stringify(new SaveBody(title, notes, setup)));
  }
  static async restore(id: string): Promise<ScopeSetup> {
    const result: ItemBody = JSON.parse(await ExperimentService.request('/experiments/' + encodeURIComponent(id), http.RequestMethod.GET)) as ItemBody;
    if (result.item.state.version !== 2) throw new Error('这是网页实验，请在 ArkWeb 版或浏览器中恢复');
    return result.item.state.parameters;
  }
  static async remove(id: string): Promise<void> {
    await ExperimentService.request('/experiments/' + encodeURIComponent(id), http.RequestMethod.DELETE);
  }

  /** 搜索 + 分页；keyword 为空表示不筛选 */
  static async listPage(keyword: string, limit: number, offset: number): Promise<ExperimentPage> {
    const params: string[] = [];
    if (keyword.trim().length > 0) {
      params.push('q=' + encodeURIComponent(keyword.trim()));
    }
    params.push('limit=' + limit.toString());
    params.push('offset=' + offset.toString());
    const text: string = await ExperimentService.request('/experiments?' + params.join('&'), http.RequestMethod.GET);
    const page: ExperimentPage = JSON.parse(text) as ExperimentPage;
    if (page.items === null || page.items === undefined) {
      page.items = [];
    }
    return page;
  }

  /** 重命名 / 修改备注（只改这两项，参数保持不动） */
  static async update(id: string, title: string, notes: string): Promise<void> {
    await ExperimentService.request('/experiments/' + encodeURIComponent(id), http.RequestMethod.PUT,
      JSON.stringify(new UpdateBody(title, notes)));
  }

  /** 导出：返回服务器生成的 JSON 原文（只含实验数据） */
  static async exportAll(): Promise<string> {
    return ExperimentService.request('/experiments/export', http.RequestMethod.GET);
  }

  /** 导入：只发送已确认为 v2 的条目 */
  static async importItems(items: ImportItem[]): Promise<ImportOutcome> {
    const text: string = await ExperimentService.request('/experiments/import', http.RequestMethod.POST,
      JSON.stringify(new ImportBody(items)));
    const outcome: ImportOutcome = JSON.parse(text) as ImportOutcome;
    if (outcome.errors === null || outcome.errors === undefined) {
      outcome.errors = [];
    }
    return outcome;
  }
}
