import { http } from '@kit.NetworkKit';
import { ApiService } from './ApiService';
import { ScopeSetup } from '../model/ScopeTypes';

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
}
