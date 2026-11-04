import { http } from '@kit.NetworkKit';
import { ApiService } from './ApiService';

class Credentials {
  username: string;
  password: string;
  nickname: string;
  constructor(username: string, password: string, nickname: string = '') {
    this.username = username; this.password = password; this.nickname = nickname;
  }
}
interface ApiUser { id: number; username: string; nickname: string; }
interface LoginBody { token: string; user: ApiUser; expiresAt?: string; }
export class LoginResult {
  ok: boolean = false;
  message: string = '';
  token: string = '';
  displayName: string = '';
  role: string = 'student';
  /** 会话过期时间（毫秒时间戳）；0 表示服务器未下发 */
  expiresAtMs: number = 0;
  userId: number = 0;
}
export class AuthService {
  static readonly DEFAULT_SERVER: string = ApiService.DEFAULT_SERVER;
  static normalizeServer(server: string): string { return ApiService.normalizeServer(server); }
  static async login(server: string, username: string, password: string): Promise<LoginResult> {
    const result: LoginResult = new LoginResult();
    try {
      const response: string = await ApiService.request(server, '/auth/login', http.RequestMethod.POST,
        JSON.stringify(new Credentials(username.trim(), password)));
      const body: LoginBody = JSON.parse(response) as LoginBody;
      if (!/^[a-f0-9]{64}$/.test(body.token) || !body.user || !body.user.username) {
        throw new Error('服务器登录响应不正确');
      }
      result.ok = true; result.token = body.token;
      result.displayName = body.user.nickname || body.user.username;
      result.userId = typeof body.user.id === 'number' ? body.user.id : 0;
      // 过期时间用于区分「可上传」与「仅本机可用」；缺失按 0 处理，不阻断本机功能
      if (typeof body.expiresAt === 'string') {
        const parsed: number = Date.parse(body.expiresAt);
        result.expiresAtMs = Number.isFinite(parsed) ? parsed : 0;
      }
      result.message = '登录成功';
    } catch (error) { result.message = (error as Error).message; }
    return result;
  }
  static async register(server: string, username: string, password: string, nickname: string): Promise<void> {
    await ApiService.request(server, '/auth/register', http.RequestMethod.POST,
      JSON.stringify(new Credentials(username.trim(), password, nickname.trim())));
  }
  static async logout(): Promise<void> {
    const token: string = AppStorage.get<string>('token') || '';
    if (token.length > 0) {
      await ApiService.request(AppStorage.get<string>('server') || AuthService.DEFAULT_SERVER,
        '/auth/logout', http.RequestMethod.POST, '', token);
    }
  }
}
