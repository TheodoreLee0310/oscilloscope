import { http } from '@kit.NetworkKit';

interface ErrorBody { message?: string; }
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number = 0) {
    super(message);
    this.status = status;
  }
}
export class ApiService {
  static readonly DEFAULT_SERVER: string = 'http://127.0.0.1:3000';
  static normalizeServer(value: string): string {
    let server: string = value.trim();
    if (server.length === 0) server = ApiService.DEFAULT_SERVER;
    if (!server.startsWith('http://') && !server.startsWith('https://')) server = 'http://' + server;
    while (server.endsWith('/')) server = server.substring(0, server.length - 1);
    if (!/^https?:\/\/[a-zA-Z0-9.-]+(:[0-9]{1,5})?$/.test(server)) {
      throw new ApiError('请填写服务器地址，例如 http://192.168.1.10:3000，不含网页路径');
    }
    return server;
  }
  static async request(server: string, route: string, method: http.RequestMethod,
    payload: string = '', token: string = ''): Promise<string> {
    const url: string = ApiService.normalizeServer(server) + '/api' + route;
    const client: http.HttpRequest = http.createHttp();
    const header: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token.length > 0) header['Authorization'] = 'Bearer ' + token;
    const options: http.HttpRequestOptions = {
      method: method, header: header, connectTimeout: 8000, readTimeout: 10000,
      expectDataType: http.HttpDataType.STRING
    };
    if (payload.length > 0) options.extraData = payload;
    try {
      const response: http.HttpResponse = await client.request(url, options);
      const text: string = typeof response.result === 'string' ? response.result as string : '';
      if (response.responseCode < 200 || response.responseCode >= 300) {
        let message: string = '请求失败（HTTP ' + response.responseCode.toString() + '）';
        try {
          const parsed: ErrorBody = JSON.parse(text) as ErrorBody;
          if (parsed.message !== undefined) message = parsed.message;
        } catch (_) {}
        throw new ApiError(message, response.responseCode);
      }
      return text;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError('无法连接服务，请检查地址和网络；保存超时后请先刷新记录再重试');
    } finally { client.destroy(); }
  }
}
