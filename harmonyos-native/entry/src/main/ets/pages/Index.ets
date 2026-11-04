import { router } from '@kit.ArkUI';
import { AuthService, LoginResult } from '../service/AuthService';
import { Palette } from '../common/ScopeConstants';

/**
 * 登录页：对应网页版 public/login.css + external.html 里的 login-overlay。
 * 后端沿用原项目 server/index.js（Express，端口 3001）。
 */
@Entry
@Component
struct Index {
  @State server: string = AuthService.DEFAULT_SERVER;
  @State username: string = '';
  @State password: string = '';
  @State busy: boolean = false;
  @State errorText: string = '';
  @State showServer: boolean = false;

  private async doLogin(): Promise<void> {
    if (this.busy) {
      return;
    }
    this.busy = true;
    this.errorText = '';
    const res: LoginResult = await AuthService.login(this.server, this.username, this.password);
    this.busy = false;
    if (res.ok) {
      AppStorage.setOrCreate('displayName', res.displayName);
      AppStorage.setOrCreate('role', res.role);
      AppStorage.setOrCreate('token', res.token);
      AppStorage.setOrCreate('server', AuthService.normalizeServer(this.server));
      router.pushUrl({ url: 'pages/ScopePage' });
    } else {
      this.errorText = res.message;
    }
  }

  private enterGuest(): void {
    AppStorage.setOrCreate('displayName', '访客');
    AppStorage.setOrCreate('role', 'guest');
    AppStorage.setOrCreate('token', '');
    AppStorage.setOrCreate('server', AuthService.normalizeServer(this.server));
    router.pushUrl({ url: 'pages/ScopePage' });
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
    Column() {
      Column() {
        Text('示波器模拟器')
          .fontSize(28)
          .fontWeight(FontWeight.Bold)
          .fontColor('#e8f4ec')
        Text('HarmonyOS NEXT · ArkTS 版')
          .fontSize(13)
          .fontColor(Palette.TEXT_DIM)
          .margin({ top: 6 })
      }
      .width('100%')
      .alignItems(HorizontalAlign.Start)
      .padding({ top: 56, bottom: 28 })

      Column() {
        this.fieldLabel('用户名')
        TextInput({ text: this.username, placeholder: '至少 3 个字符' })
          .width('100%')
          .height(44)
          .backgroundColor('#152430')
          .fontColor('#e8f4ec')
          .placeholderColor(Palette.TEXT_DIM)
          .onChange((value: string) => {
            this.username = value;
          })

        this.fieldLabel('密码')
        TextInput({ text: this.password, placeholder: '至少 6 个字符' })
          .type(InputType.Password)
          .width('100%')
          .height(44)
          .backgroundColor('#152430')
          .fontColor('#e8f4ec')
          .placeholderColor(Palette.TEXT_DIM)
          .onChange((value: string) => {
            this.password = value;
          })

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
          TextInput({ text: this.server, placeholder: 'http://10.0.2.2:3001' })
            .width('100%')
            .height(40)
            .backgroundColor('#152430')
            .fontColor('#e8f4ec')
            .placeholderColor(Palette.TEXT_DIM)
            .onChange((value: string) => {
              this.server = value;
            })
        }

        if (this.errorText.length > 0) {
          Text(this.errorText)
            .fontSize(12)
            .fontColor('#ff6b6b')
            .width('100%')
            .margin({ top: 12 })
        }

        Button(this.busy ? '登录中…' : '登 录')
          .width('100%')
          .height(46)
          .margin({ top: 24 })
          .backgroundColor(Palette.ACCENT)
          .fontColor('#ffffff')
          .fontSize(16)
          .enabled(!this.busy)
          .onClick(() => {
            this.doLogin();
          })

        Button('游客模式进入')
          .width('100%')
          .height(44)
          .margin({ top: 12 })
          .backgroundColor(Color.Transparent)
          .fontColor(Palette.TEXT_DIM)
          .fontSize(14)
          .border({ width: 1, color: '#25323d' })
          .onClick(() => {
            this.enterGuest();
          })
      }
      .width('100%')
      .padding(20)
      .backgroundColor('#0e1a22')
      .borderRadius(16)

      Blank()

      Text('波形由端上本地生成，无需后端推送；\n后端仅用于账号登录与操作日志。')
        .fontSize(11)
        .fontColor(Palette.TEXT_DIM)
        .textAlign(TextAlign.Center)
        .margin({ bottom: 24 })
    }
    .width('100%')
    .height('100%')
    .padding({ left: 20, right: 20 })
    .backgroundColor('#080f14')
  }
}
