import { http } from '@kit.NetworkKit';
import { BusinessError } from '@kit.BasicServicesKit';

class LoginPayload {
  username: string = '';
  password: string = '';

  constructor(username: string, password: string) {
    this.username = username;
    this.password = password;
  }
}

interface LoginApiUser {
  id?: number;
  username?: string;
  displayName?: string;
  role?: string;
}

interface LoginApiBody {
  message?: string;
  token?: string;
  user?: LoginApiUser;
}

export class LoginResult {
  ok: boolean = false;
  message: string = '';
  token: string = '';
  displayName: string = '';
  role: string = '';
}

/**
 * 登录服务：对接原有 Express 后端（server/index.js）
 * POST /api/login  →  { message, token, user:{username, displayName, role} }
 * 注意：本项目后端不是 WebSocket，是普通 HTTP 接口，端上要用 @kit.NetworkKit 的 http 模块。
 */
export class AuthService {
  /** 默认指向宿主机（鸿蒙模拟器访问电脑本机用 10.0.2.2） */
  static readonly DEFAULT_SERVER: string = 'http://10.0.2.2:3001';

  static normalizeServer(server: string): string {
    let s: string = server.trim();
    if (s.length === 0) {
      return AuthService.DEFAULT_SERVER;
    }
    if (!s.startsWith('http://') && !s.startsWith('https://')) {
      s = 'http://' + s;
    }
    while (s.endsWith('/')) {
      s = s.substring(0, s.length - 1);
    }
    return s;
  }

  static async login(server: string, username: string, password: string): Promise<LoginResult> {
    const result: LoginResult = new LoginResult();
    if (username.length < 3) {
      result.message = '用户名至少 3 个字符';
      return result;
    }
    if (password.length < 6) {
      result.message = '密码至少 6 个字符';
      return result;
    }

    const url: string = AuthService.normalizeServer(server) + '/api/login';
    const client: http.HttpRequest = http.createHttp();
    const header: Record<string, string> = { 'Content-Type': 'application/json' };
    const payload: LoginPayload = new LoginPayload(username, password);
    const options: http.HttpRequestOptions = {
      method: http.RequestMethod.POST,
      header: header,
      extraData: JSON.stringify(payload),
      connectTimeout: 8000,
      readTimeout: 8000
    };

    try {
      const resp: http.HttpResponse = await client.request(url, options);
      const body: string = typeof resp.result === 'string' ? resp.result as string : '';
      if (resp.responseCode === 200) {
        const parsed: LoginApiBody = JSON.parse(body) as LoginApiBody;
        result.ok = true;
        result.token = parsed.token === undefined ? '' : parsed.token as string;
        result.message = parsed.message === undefined ? '登录成功' : parsed.message as string;
        if (parsed.user !== undefined) {
          const u: LoginApiUser = parsed.user as LoginApiUser;
          result.displayName = u.displayName === undefined ? username : u.displayName as string;
          result.role = u.role === undefined ? 'student' : u.role as string;
        } else {
          result.displayName = username;
          result.role = 'student';
        }
      } else if (resp.responseCode === 401) {
        result.message = '用户名或密码错误';
      } else if (resp.responseCode === 409) {
        result.message = '该用户名已被注册';
      } else {
        result.message = '登录失败（HTTP ' + resp.responseCode.toString() + '）';
      }
    } catch (err) {
      const e: BusinessError = err as BusinessError;
      const detail: string = e.message === undefined ? '' : e.message;
      result.message = '无法连接后端：' + detail + '（请检查服务地址与网络权限）';
    } finally {
      client.destroy();
    }
    return result;
  }
}
