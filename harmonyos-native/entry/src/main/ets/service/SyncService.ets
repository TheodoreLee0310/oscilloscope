import { http } from '@kit.NetworkKit';
import { ApiService } from './ApiService';
import { LocalStore, StoreStatus } from './LocalStore';
import { isValidDraftSetup } from './DraftService';
import { ScopeSetup } from '../model/ScopeTypes';
import { LocalRecord, RecordsService, SyncSnapshot, RemoteRecord } from './RecordsService';

export class SyncOutcome {
  total: number = 0;
  applied: number = 0;
  conflicts: number = 0;
  deletedOnServer: number = 0;
  notFound: number = 0;
  failed: number = 0;
  pulled: number = 0;
  skipped: number = 0;
  message: string = '';
}
class SyncState {
  version: number = 2;
  parameters: ScopeSetup = new ScopeSetup();
}
class SyncRequest {
  operationId: string = '';
  type: string = 'create';
  clientId: string = '';
  baseServerRev: number = 0;
  title: string = '';
  notes: string = '';
  state: SyncState | null = null;
}
class SyncResponse {
  status: string = '';
  created: boolean = false;
  item: SyncItem | null = null;
}
class SyncItem {
  id: string = '';
  clientId: string = '';
  title: string = '';
  notes: string = '';
  rev: number = 0;
  deleted: boolean = false;
  updatedAt: string = '';
  stateVersion: number = 0;
  state: SyncState | null = null;
}
class ChangePage {
  items: SyncItem[] = [];
  until: number = 0;
  nextCursor: number = 0;
  hasMore: boolean = false;
}
class Cursor {
  value: number = 0;
}

/** User-triggered synchronization. No timers, network observers or background uploads. */
export class SyncService {
  private static activeProfiles: string[] = [];

  private static snapshotState(text: string): SyncState {
    const wrapped: SyncState = JSON.parse(text) as SyncState;
    // The UI stores ScopeSetup directly; accept the older wrapped test/export form too.
    const setup: ScopeSetup = wrapped.version === 2 ? wrapped.parameters : JSON.parse(text) as ScopeSetup;
    if (!isValidDraftSetup(setup) || typeof setup.triggerEnabled !== 'boolean' ||
      typeof setup.triggerRising !== 'boolean' || typeof setup.ch1.enabled !== 'boolean' ||
      typeof setup.ch2.enabled !== 'boolean') throw new Error('实验参数快照损坏');
    const state: SyncState = new SyncState();
    setup.runTimeSec = 0;
    state.parameters = setup;
    return state;
  }

  private static async remote(item: SyncItem, server: string, token: string): Promise<RemoteRecord> {
    // Older cached conflict responses may predate full parameter snapshots.
    if (item.state === null || item.state === undefined) {
      const body: SyncResponse = JSON.parse(await ApiService.request(server,
        '/experiments/' + encodeURIComponent(item.id) + '?includeDeleted=1', http.RequestMethod.GET, '', token)) as SyncResponse;
      if (body.item === null) throw new Error('服务器没有返回完整实验记录');
      item = body.item;
    }
    if (item.state === null || item.state.version !== 2 || !Number.isSafeInteger(item.rev) || item.rev < 1 ||
      !item.id || !item.clientId) throw new Error('服务器实验格式不支持，未覆盖本机数据');
    const state: SyncState = SyncService.snapshotState(JSON.stringify(item.state));
    const remote: RemoteRecord = new RemoteRecord();
    remote.id = item.id; remote.clientId = item.clientId; remote.title = item.title; remote.notes = item.notes;
    remote.rev = item.rev; remote.deleted = item.deleted;
    remote.setupJson = JSON.stringify(state.parameters);
    const timestamp: number = Date.parse(item.updatedAt);
    remote.updatedAtMs = Number.isFinite(timestamp) ? timestamp : Date.now();
    return remote;
  }

  /** Upload a frozen queue; conflict copies are uploaded on the next manual request. */
  static async syncAll(filesDir: string, server: string, userId: number, token: string): Promise<SyncOutcome> {
    const outcome: SyncOutcome = new SyncOutcome();
    if (userId <= 0 || token.length === 0) {
      outcome.message = userId <= 0 ? '游客记录不能同步，请先登录账号' : '请先登录后再同步';
      return outcome;
    }
    const records: RecordsService = new RecordsService(filesDir);
    const pending: LocalRecord[] = records.listPending(server, userId);
    outcome.total = pending.length;
    for (let i = 0; i < pending.length; i++) {
      const record: LocalRecord = pending[i];
      const snapshot: SyncSnapshot = records.snapshot(record);
      const request: SyncRequest = new SyncRequest();
      request.operationId = snapshot.operationId; request.clientId = snapshot.clientId;
      request.baseServerRev = record.baseServerRev;
      request.type = snapshot.deleted ? 'delete' : (record.baseServerRev > 0 ? 'update' : 'create');
      try {
        if (request.type !== 'delete') {
          request.title = snapshot.title; request.notes = snapshot.notes;
          request.state = SyncService.snapshotState(snapshot.setupJson);
        }
        if (!records.beginUpload(server, userId, snapshot.clientId)) throw new Error('发送前保存同步状态失败，请重试');
        const response: SyncResponse = JSON.parse(await ApiService.request(server, '/sync/apply',
          http.RequestMethod.POST, JSON.stringify(request), token)) as SyncResponse;
        const item: SyncItem | null = response.item;
        let persisted: boolean = false;
        let result: string = response.status;
        if (response.status === 'applied') {
          if (request.type === 'delete') persisted = records.markDeleteSynced(server, userId, snapshot);
          else if (item !== null) {
            if (request.type === 'create' && !response.created) {
              const remote: RemoteRecord = await SyncService.remote(item, server, token);
              const sent: string = JSON.stringify(SyncService.snapshotState(snapshot.setupJson).parameters);
              if (remote.title !== snapshot.title || remote.notes !== snapshot.notes || remote.setupJson !== sent) {
                persisted = records.markConflict(server, userId, snapshot, remote); result = 'conflict';
              } else persisted = records.markSynced(server, userId, snapshot, item.id, item.rev);
            } else persisted = records.markSynced(server, userId, snapshot, item.id, item.rev);
          }
        } else if ((response.status === 'conflict' || response.status === 'deleted') && item !== null) {
          persisted = records.markConflict(server, userId, snapshot, await SyncService.remote(item, server, token));
        } else if (response.status === 'not-found') persisted = records.markNotFound(server, userId, snapshot);
        else throw new Error('未知同步响应：' + response.status);
        if (!persisted) throw new Error('服务器已响应，但本机保存失败；请重试同步');
        if (result === 'applied') outcome.applied++;
        else if (result === 'conflict') outcome.conflicts++;
        else if (result === 'deleted') outcome.deletedOnServer++;
        else if (result === 'not-found') outcome.notFound++;
      } catch (error) {
        records.markFailed(server, userId, snapshot, (error as Error).message);
        outcome.failed++;
      }
    }
    outcome.message = '推送：成功 ' + outcome.applied.toString() + ' 条，冲突 ' + outcome.conflicts.toString() +
      ' 条，服务器删除 ' + outcome.deletedOnServer.toString() + ' 条，待重建 ' + outcome.notFound.toString() +
      ' 条，失败 ' + outcome.failed.toString() + ' 条';
    return outcome;
  }

  static async pullChanges(filesDir: string, server: string, userId: number, token: string): Promise<SyncOutcome> {
    const outcome: SyncOutcome = new SyncOutcome();
    if (userId <= 0 || !token) { outcome.message = '请先登录后再拉取'; return outcome; }
    const store: LocalStore = new LocalStore(filesDir);
    const records: RecordsService = new RecordsService(filesDir);
    const stored = store.read(server, userId, 'sync-cursor');
    let cursor: number = 0;
    let until: number = -1;
    try {
      if (stored.status === StoreStatus.OK) {
        const saved: Cursor = JSON.parse(stored.payload) as Cursor;
        if (!Number.isSafeInteger(saved.value) || saved.value < 0) throw new Error('同步游标损坏，未覆盖本机数据');
        cursor = saved.value;
      } else if (stored.status !== StoreStatus.MISSING) throw new Error('同步游标归属或格式异常，未覆盖本机数据');
      let more: boolean = true;
      while (more) {
        const path: string = '/sync/changes?cursor=' + cursor.toString() + '&limit=100' +
          (until < 0 ? '' : '&until=' + until.toString());
        const page: ChangePage = JSON.parse(await ApiService.request(server, path, http.RequestMethod.GET, '', token)) as ChangePage;
        if (!Array.isArray(page.items) || !Number.isSafeInteger(page.nextCursor) || page.nextCursor < cursor ||
          !Number.isSafeInteger(page.until) || page.until < page.nextCursor ||
          (until >= 0 && page.until !== until) || (page.hasMore && page.nextCursor === cursor)) {
          throw new Error('服务器分页响应不正确，游标未前移');
        }
        for (let i = 0; i < page.items.length; i++) {
          const item: SyncItem = page.items[i];
          if (item.stateVersion === 1) { outcome.skipped++; continue; }
          if (!records.applyRemote(server, userId, await SyncService.remote(item, server, token))) {
            throw new Error('服务器变更写入失败，保留游标供重试');
          }
          outcome.pulled++;
        }
        const saved: Cursor = new Cursor(); saved.value = page.nextCursor;
        if (!store.write(server, userId, 'sync-cursor', JSON.stringify(saved))) throw new Error('同步游标保存失败，请重试');
        cursor = page.nextCursor; until = page.until; more = page.hasMore;
      }
    } catch (error) { outcome.failed++; outcome.message = (error as Error).message; }
    if (!outcome.message) outcome.message = '拉取：处理 ' + outcome.pulled.toString() + ' 条变更，跳过网页记录 ' + outcome.skipped.toString() + ' 条';
    return outcome;
  }

  static async syncBoth(filesDir: string, server: string, userId: number, token: string): Promise<SyncOutcome> {
    if (userId <= 0 || !token) return SyncService.syncAll(filesDir, server, userId, token);
    const key: string = filesDir + '/' + LocalStore.profileKey(server, userId);
    if (SyncService.activeProfiles.indexOf(key) >= 0) {
      const busy: SyncOutcome = new SyncOutcome(); busy.failed = 1; busy.message = '该账号正在同步，请稍候'; return busy;
    }
    SyncService.activeProfiles.push(key);
    try {
      const pushed: SyncOutcome = await SyncService.syncAll(filesDir, server, userId, token);
      // A failed local acknowledgement must be retried before applying a pull response.
      if (pushed.failed > 0) return pushed;
      const pulled: SyncOutcome = await SyncService.pullChanges(filesDir, server, userId, token);
      pushed.pulled = pulled.pulled; pushed.skipped = pulled.skipped; pushed.failed += pulled.failed;
      pushed.message += '；' + pulled.message;
      return pushed;
    } finally {
      const index: number = SyncService.activeProfiles.indexOf(key);
      if (index >= 0) SyncService.activeProfiles.splice(index, 1);
    }
  }
}
