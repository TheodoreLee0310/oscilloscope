import { http } from '@kit.NetworkKit';
import { ApiService } from './ApiService';
import { LocalRecord, RecordsService, SyncSnapshot } from './RecordsService';

/**
 * 手动同步（本轮只有手动触发，后台自动同步后续再加）
 *
 * 协议要点（与 server/index.js 的 /api/sync/apply 对应）：
 *   - 一次只发一个操作，operationId 来自记录的 pendingOpId，网络重试复用同一个；
 *   - 创建与更新分开：baseServerRev 为 0 表示服务器还没有这条记录；
 *   - 服务器用 baseServerRev 与自己的 rev 原子比较，不匹配就返回 conflict，
 *     客户端保留双方数据（本地内容转成新 clientId 的冲突副本）；
 *   - 只有拿到服务器确认后才回写 remoteId / 服务器版本 / 同步结果；
 *   - 上传期间用户又改了记录，则保持待同步，不会被这次结果吞掉。
 */

export class SyncOutcome {
  total: number = 0;
  applied: number = 0;
  conflicts: number = 0;
  deletedOnServer: number = 0;
  notFound: number = 0;
  failed: number = 0;
  message: string = '';
}

class SyncRequest {
  operationId: string = '';
  type: string = 'create';
  clientId: string = '';
  baseServerRev: number = 0;
  title: string = '';
  notes: string = '';
  state: object | null = null;
}

class SyncResponse {
  status: string = '';
  item: SyncItem | null = null;
}

class SyncItem {
  id: string = '';
  clientId: string = '';
  title: string = '';
  notes: string = '';
  rev: number = 0;
  deleted: boolean = false;
}

export class SyncService {
  /**
   * 把当前账号下所有待同步记录推送到服务器。
   * 只处理本机 pending 队列，不拉取服务器数据（拉取属于后续轮次）。
   */
  static async syncAll(filesDir: string, server: string, userId: number,
    token: string): Promise<SyncOutcome> {
    const outcome: SyncOutcome = new SyncOutcome();
    if (userId <= 0) {
      outcome.message = '游客记录不能同步，请先登录账号';
      return outcome;
    }
    if (token.length === 0) {
      outcome.message = '请先登录后再同步';
      return outcome;
    }
    const records: RecordsService = new RecordsService(filesDir);
    const pending: LocalRecord[] = records.listPending(server, userId);
    outcome.total = pending.length;
    if (pending.length === 0) {
      outcome.message = '没有需要同步的记录';
      return outcome;
    }

    for (let i = 0; i < pending.length; i++) {
      const record: LocalRecord = pending[i];
      const snapshot: SyncSnapshot = records.snapshot(record);
      const request: SyncRequest = new SyncRequest();
      request.operationId = snapshot.operationId;
      request.clientId = snapshot.clientId;
      request.baseServerRev = record.baseServerRev;
      let type: string = 'create';
      if (snapshot.deleted) {
        type = 'delete';
      } else if (record.baseServerRev > 0) {
        type = 'update';
      } else {
        type = 'create';
      }
      request.type = type;
      if (type !== 'delete') {
        request.title = snapshot.title;
        request.notes = snapshot.notes;
        try {
          request.state = JSON.parse(snapshot.setupJson) as object;
        } catch (_) {
          records.markFailed(server, userId, snapshot, '参数快照损坏');
          outcome.failed++;
          continue;
        }
      }
      try {
        const body: string = JSON.stringify(request);
        const text: string = await ApiService.request(server, '/sync/apply', http.RequestMethod.POST,
          body, token);
        const response: SyncResponse = JSON.parse(text) as SyncResponse;
        const item: SyncItem | null = response.item;
        if (response.status === 'applied') {
          if (type === 'delete') {
            records.markDeleteSynced(server, userId, snapshot);
          } else if (item !== null) {
            records.markSynced(server, userId, snapshot, item.id, item.rev);
          }
          outcome.applied++;
        } else if (response.status === 'conflict' && item !== null) {
          records.markConflict(server, userId, snapshot, item.title, item.notes, item.rev);
          outcome.conflicts++;
        } else if (response.status === 'deleted') {
          records.markDeletedOnServer(server, userId, snapshot, item !== null ? item.rev : 0);
          outcome.deletedOnServer++;
        } else if (response.status === 'not-found') {
          records.markNotFound(server, userId, snapshot);
          outcome.notFound++;
        } else {
          records.markFailed(server, userId, snapshot, '未知响应：' + response.status);
          outcome.failed++;
        }
      } catch (error) {
        // 网络失败：保留 operationId，下次重试复用，服务器不会重复执行
        records.markFailed(server, userId, snapshot, (error as Error).message);
        outcome.failed++;
      }
    }
    outcome.message = '同步完成：成功 ' + outcome.applied.toString() + ' 条' +
      (outcome.conflicts > 0 ? '，冲突 ' + outcome.conflicts.toString() + ' 条（已在本机保留副本）' : '') +
      (outcome.deletedOnServer > 0 ? '，服务器已删除 ' + outcome.deletedOnServer.toString() + ' 条' : '') +
      (outcome.notFound > 0 ? '，待重建 ' + outcome.notFound.toString() + ' 条' : '') +
      (outcome.failed > 0 ? '，失败 ' + outcome.failed.toString() + ' 条' : '');
    return outcome;
  }
}
