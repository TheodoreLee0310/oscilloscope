import { MaterialBackdrop } from '../view/MaterialBackdrop';
import { preferences } from '@kit.ArkData';
import { router } from '@kit.ArkUI';
import { AuthService, LoginResult } from '../service/AuthService';
import { SessionInfo, SessionService } from '../service/SessionService';
import { Palette } from '../common/ScopeConstants';

/**
 * 登录页：对应网页版 public/login.css + external.html 里的 login-overlay。
 * 对接仓库后端 /api/auth，账号与网页共享。
 */
@Entry
@Component
struct Index {
  @State private backdropActive: boolean = false;
  @State server: string = AuthService.DEFAULT_SERVER;
  @State username: string = '';
  @State password: string = '';
  @State busy: boolean = false;
  @State errorText: string = '';
  @State showServer: boolean = true;
  @State registering: boolean = false;
  @State nickname: string = '';
  @State confirmPassword: string = '';
  /** 本机已恢复的会话（非空时显示「继续使用」入口） */
  @State restoredName: string = '';
  @State restoredUsable: boolean = false;
  @State restoredExpiryText: string = '';

  async aboutToAppear(): Promise<void> {
    try {
      const context = this.getUIContext().getHostContext();
      if (context) {
        const prefs = await preferences.getPreferences(context, { name: 'connection' });
        this.server = await prefs.get('server', AuthService.DEFAULT_SERVER) as string;
      }
    } catch (_) {}
    // 恢复上次会话：令牌过期也能进入（本机可用），只有上传才要求重新登录
    try {
      const info: SessionInfo | null = await SessionService.restore();
      if (info !== null) {
        this.server = info.server;
        this.restoredName = info.displayName.length > 0 ? info.displayName : ('用户 ' + info.userId.toString());
        this.restoredUsable = SessionService.isTokenUsable(info);
        if (info.expiresAtMs > 0) {
          this.restoredExpiryText = this.restoredUsable
            ? ('可上传 · 会话于 ' + new Date(info.expiresAtMs).toLocaleString() + ' 过期')
            : '登录已过期 · 仍可离线使用本机草稿，上传前需重新登录';
        } else {
          this.restoredExpiryText = '本机可用（服务器未下发过期时间）';
        }
        AppStorage.setOrCreate('token', info.token);
        AppStorage.setOrCreate('server', info.server);
        AppStorage.setOrCreate('displayName', info.displayName);
        AppStorage.setOrCreate('userId', info.userId);
        AppStorage.setOrCreate('expiresAtMs', info.expiresAtMs);
      }
    } catch (_) {}
  }

  /** 继续使用已恢复的会话（不重新登录也能进入主界面） */
  private continueSession(): void {
    router.pushUrl({ url: 'pages/ScopePage' });
  }

  /** 清除本机保存的登录信息（不影响服务器端会话记录） */
  private async forgetSession(): Promise<void> {
    await SessionService.clear();
    this.restoredName = '';
    this.restoredUsable = false;
    this.restoredExpiryText = '';
    AppStorage.setOrCreate('token', '');
    AppStorage.setOrCreate('userId', 0);
    AppStorage.setOrCreate('expiresAtMs', 0);
    this.errorText = '已清除本机登录信息';
  }

  private async rememberServer(): Promise<void> {
    const context = this.getUIContext().getHostContext();
    if (context) {
      const prefs = await preferences.getPreferences(context, { name: 'connection' });
      await prefs.put('server', AuthService.normalizeServer(this.server));
      await prefs.flush();
    }
  }

  private async doRegister(): Promise<void> {
    if (this.busy) return;
    if (this.password !== this.confirmPassword) { this.errorText = '两次输入的密码不一致'; return; }
    this.busy = true;
    try {
      await AuthService.register(this.server, this.username, this.password, this.nickname);
      this.registering = false; this.password = ''; this.confirmPassword = '';
      this.errorText = '注册成功，请登录';
      try { await this.rememberServer(); } catch (_) {}
    } catch (error) { this.errorText = (error as Error).message; }
    finally { this.busy = false; }
  }

  private async doLogin(): Promise<void> {
    if (this.busy) {
      return;
    }
    this.busy = true;
    this.errorText = '';
    const res: LoginResult = await AuthService.login(this.server, this.username, this.password);
    this.busy = false;
    if (res.ok) {
      try { await this.rememberServer(); } catch (_) {}
      this.password = '';
      const normalizedServer: string = AuthService.normalizeServer(this.server);
      AppStorage.setOrCreate('displayName', res.displayName);
      AppStorage.setOrCreate('role', res.role);
      AppStorage.setOrCreate('token', res.token);
      AppStorage.setOrCreate('server', normalizedServer);
      AppStorage.setOrCreate('userId', res.userId);
      AppStorage.setOrCreate('expiresAtMs', res.expiresAtMs);
      // 令牌写入系统密钥库；失败不阻止本次登录，只是下次需要重新登录
      try {
        const info: SessionInfo = new SessionInfo();
        info.server = normalizedServer;
        info.userId = res.userId;
        info.displayName = res.displayName;
        info.token = res.token;
        info.expiresAtMs = res.expiresAtMs;
        await SessionService.save(info);
      } catch (_) {}
      router.pushUrl({ url: 'pages/ScopePage' });
    } else {
      this.errorText = res.message;
    }
  }

  private enterGuest(): void {
    AppStorage.setOrCreate('displayName', '访客');
    AppStorage.setOrCreate('role', 'guest');
    AppStorage.setOrCreate('token', '');
    AppStorage.setOrCreate('userId', 0);
    AppStorage.setOrCreate('expiresAtMs', 0);
    AppStorage.setOrCreate('server', AuthService.DEFAULT_SERVER);
    router.pushUrl({ url: 'pages/ScopePage' });
  }

  onPageShow(): void {
    this.backdropActive = true;
  }

  onPageHide(): void {
    this.backdropActive = false;
  }

  @Builder
  fieldLabel(text: string) {
    Text(text)
      .fontSize(12)
      .fontColor(Palette.PANEL_TEXT)
      .width('100%')
      .margin({ top: 12, bottom: 4 })
  }

  build() {
    WithTheme({ colorMode: ThemeColorMode.LIGHT }) {
      Stack({ alignContent: Alignment.TopStart }) {
        MaterialBackdrop({ workspace: false, active: this.backdropActive })
        Scroll() {
          Column() {
            Column() {
              Text('示波器模拟器')
                .fontSize(32)
                .fontWeight(FontWeight.Medium)
                .fontColor(Palette.ON_SURFACE)
              Text('HarmonyOS NEXT · ArkTS 版')
                .fontSize(14)
                .fontColor(Palette.PANEL_TEXT)
                .margin({ top: 6 })
            }
            .width('100%')
            .alignItems(HorizontalAlign.Start)
            .padding({ top: 40, bottom: 28 })

            Column() {
              if (this.restoredName.length > 0) {
                Column({ space: 6 }) {
                  Text('上次登录：' + this.restoredName)
                    .fontSize(13).fontColor(Palette.ON_SURFACE).width('100%')
                  Text(this.restoredExpiryText)
                    .fontSize(11).fontColor(Palette.PANEL_TEXT).width('100%')
                  Row({ space: 8 }) {
                    Button('继续使用')
                      .fontSize(14)
                      .borderRadius(20)
                      .layoutWeight(1)
                      .height(40)
                      .backgroundColor(Palette.ACCENT)
                      .fontColor(Palette.ON_ACCENT)
                      .onClick(() => { this.continueSession(); })
                    Button('清除登录信息')
                      .fontSize(14)
                      .borderRadius(20)
                      .layoutWeight(1)
                      .height(40)
                      .backgroundColor(Color.Transparent)
                      .fontColor(Palette.PANEL_TEXT)
                      .border({ width: 1, color: Palette.OUTLINE_VARIANT })
                      .onClick(() => { this.forgetSession(); })
                  }
                  .width('100%').margin({ top: 4 })
                }
                .width('100%')
                .padding(12)
                .margin({ bottom: 16 })
                .backgroundColor(Palette.PRIMARY_CONTAINER)
                .borderRadius(10)
              }
              this.fieldLabel('用户名')
              TextInput({ text: this.username, placeholder: '3–20 位中文、字母、数字、_ 或 -' })
                .borderRadius(12)
                .width('100%')
                .height(52)
                .backgroundColor(Palette.FIELD)
                .fontColor(Palette.ON_SURFACE)
                .placeholderColor(Palette.PANEL_TEXT)
                .onChange((value: string) => {
                  this.username = value;
                })

              this.fieldLabel('密码')
              TextInput({ text: this.password, placeholder: '8–128 位' })
                .borderRadius(12)
                .type(InputType.Password)
                .width('100%')
                .height(52)
                .backgroundColor(Palette.FIELD)
                .fontColor(Palette.ON_SURFACE)
                .placeholderColor(Palette.PANEL_TEXT)
                .onChange((value: string) => {
                  this.password = value;
                })

              if (this.registering) {
                this.fieldLabel('昵称（可选）')
                TextInput({ text: this.nickname, placeholder: '最多 40 位' })
                  .height(52)
                  .backgroundColor(Palette.FIELD)
                  .fontColor(Palette.ON_SURFACE)
                  .placeholderColor(Palette.PANEL_TEXT)
                  .borderRadius(12)
                  .maxLength(40)
                  .onChange((value: string) => { this.nickname = value; })
                this.fieldLabel('确认密码')
                TextInput({ text: this.confirmPassword, placeholder: '再次输入密码' })
                  .height(52)
                  .backgroundColor(Palette.FIELD)
                  .fontColor(Palette.ON_SURFACE)
                  .placeholderColor(Palette.PANEL_TEXT)
                  .borderRadius(12)
                  .type(InputType.Password)
                  .onChange((value: string) => { this.confirmPassword = value; })
              }
              Row() {
                Text('服务器地址')
                  .fontSize(12)
                  .fontColor(Palette.PANEL_TEXT)
                Blank()
                Text(this.showServer ? '收起' : '修改')
                  .fontSize(12)
                  .fontColor(Palette.ACCENT)
                  .onClick(() => {
                    this.showServer = !this.showServer;
                  })
              }
              .width('100%')
              .margin({ top: 12, bottom: 4 })

              if (this.showServer) {
                TextInput({ text: this.server, placeholder: 'http://电脑局域网地址:3000' })
                  .borderRadius(12)
                  .width('100%')
                  .height(52)
                  .backgroundColor(Palette.FIELD)
                  .fontColor(Palette.ON_SURFACE)
                  .placeholderColor(Palette.PANEL_TEXT)
                  .onChange((value: string) => {
                    this.server = value;
                  })
              }

              if (this.errorText.length > 0) {
                Text(this.errorText)
                  .fontSize(12)
                  .fontColor(Palette.ERROR)
                  .width('100%')
                  .margin({ top: 12 })
              }

              Button(this.busy ? '正在处理…' : (this.registering ? '注 册' : '登 录'))
                .borderRadius(20)
                .width('100%')
                .height(48)
                .margin({ top: 24 })
                .backgroundColor(Palette.ACCENT)
                .fontColor(Palette.ON_ACCENT)
                .fontSize(16)
                .enabled(!this.busy)
                .onClick(() => {
                  if (this.registering) this.doRegister();
                  else this.doLogin();
                })

              Button(this.registering ? '已有账号，返回登录' : '没有账号，注册')
                .height(40)
                .fontSize(14)
                .borderRadius(20)
                .backgroundColor(Palette.PRIMARY_CONTAINER)
                .fontColor(Palette.ON_PRIMARY_CONTAINER)
                .width('100%')
                .margin({ top: 12 })
                .enabled(!this.busy)
                .onClick(() => { this.registering = !this.registering; this.errorText = ''; })

              Button('游客模式进入')
                .borderRadius(20)
                .width('100%')
                .height(52)
                .margin({ top: 12 })
                .backgroundColor(Color.Transparent)
                .fontColor(Palette.PANEL_TEXT)
                .fontSize(14)
                .border({ width: 1, color: Palette.OUTLINE_VARIANT })
                .enabled(!this.busy)
                .onClick(() => {
                  this.enterGuest();
                })
            }
            .width('100%')
            .padding(24)
            .backgroundColor(Palette.PANEL)
            .border({ width: 1, color: Palette.OUTLINE_VARIANT })
            .borderRadius(28)

            Blank().height(24)

            Text('波形由端上本地生成，无需后端推送；\n联网后可保存并恢复个人实验。')
              .fontSize(11)
              .fontColor(Palette.PANEL_TEXT)
              .textAlign(TextAlign.Center)
              .margin({ bottom: 24 })
          }
          .width('100%')
          .constraintSize({ maxWidth: 520 })
          .padding({ left: 24, right: 24 })
          .backgroundColor(Color.Transparent)
        }.width('100%').height('100%').backgroundColor(Color.Transparent)
      }
      .width('100%')
      .height('100%')
      .backgroundColor(Palette.SURFACE)
      .clip(true)
    }
  }
}
