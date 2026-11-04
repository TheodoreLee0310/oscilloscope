import { asset } from '@kit.AssetStoreKit';
import { util } from '@kit.ArkTS';

/**
 * 会话信息（P0）
 *
 * 关键设计：**「本机可用」与「服务器登录有效」是两件事。**
 * 令牌过期后，用户仍然应该能打开应用、恢复本机草稿、继续离线调参；
 * 只有在需要上传/同步到服务器时，才要求重新认证。
 * 因此这里保存 expiresAtMs，由调用方分别判断，而不是把「过期」等同于「退出登录」。
 */
export class SessionInfo {
  server: string = '';
  userId: number = 0;
  displayName: string = '';
  token: string = '';
  /** 会话过期时间（毫秒时间戳），由服务器下发 */
  expiresAtMs: number = 0;
}

const ASSET_ALIAS: string = 'sbq.session.v1';
/** 剩余有效期不足 60 秒就视为不可上传，避免请求途中过期 */
const EXPIRY_MARGIN_MS: number = 60 * 1000;

/**
 * 令牌持久化：使用系统 Asset Store（安全密钥库），不写普通 preferences。
 * 说明：SRC 里的别名与明文都必须是 Uint8Array（Tag.ALIAS / Tag.SECRET 为 BYTES 类型）。
 */
export class SessionService {
  private static aliasBytes(): Uint8Array {
    return new util.TextEncoder().encodeInto(ASSET_ALIAS);
  }

  /** 覆盖写入（先删再加，避免别名已存在时 add 报错） */
  static async save(info: SessionInfo): Promise<void> {
    const payload: string = JSON.stringify(info);
    await SessionService.clear();
    const attributes: asset.AssetMap = new Map();
    attributes.set(asset.Tag.ALIAS, SessionService.aliasBytes());
    attributes.set(asset.Tag.SECRET, new util.TextEncoder().encodeInto(payload));
    attributes.set(asset.Tag.ACCESSIBILITY, asset.Accessibility.DEVICE_FIRST_UNLOCKED);
    await asset.add(attributes);
  }

  /** 读取会话；不存在或已损坏时返回 null，绝不抛异常打断启动 */
  static async restore(): Promise<SessionInfo | null> {
    const query: asset.AssetMap = new Map();
    query.set(asset.Tag.ALIAS, SessionService.aliasBytes());
    query.set(asset.Tag.RETURN_TYPE, asset.ReturnType.ALL);
    try {
      const rows: Array<asset.AssetMap> = await asset.query(query);
      if (rows.length === 0) {
        return null;
      }
      const secret = rows[0].get(asset.Tag.SECRET);
      if (secret === undefined) {
        return null;
      }
      const bytes: Uint8Array = secret as Uint8Array;
      if (bytes.length === 0) {
        return null;
      }
      const text: string = new util.TextDecoder().decodeToString(bytes);
      const parsed: SessionInfo = JSON.parse(text) as SessionInfo;
      if (parsed === null || typeof parsed.token !== 'string' || typeof parsed.server !== 'string') {
        return null;
      }
      return parsed;
    } catch (_) {
      return null;
    }
  }

  static async clear(): Promise<void> {
    const query: asset.AssetMap = new Map();
    query.set(asset.Tag.ALIAS, SessionService.aliasBytes());
    try {
      await asset.remove(query);
    } catch (_) {
      // 不存在（24000002）属正常情况，忽略
    }
  }

  /**
   * 令牌是否仍可用于**上传/同步**。
   * 注意：返回 false 不代表用户必须退出——本机功能应继续可用。
   */
  static isTokenUsable(info: SessionInfo | null): boolean {
    if (info === null) {
      return false;
    }
    if (info.token.length !== 64) {
      return false;
    }
    return info.expiresAtMs - EXPIRY_MARGIN_MS > Date.now();
  }
}
