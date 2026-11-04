import { preferences } from '@kit.ArkData';
import { webview } from '@kit.ArkWeb';
import { BusinessError } from '@kit.BasicServicesKit';
import { abilityAccessCtrl, common, Permissions } from '@kit.AbilityKit';
import { photoAccessHelper } from '@kit.MediaLibraryKit';
import { hilog } from '@kit.PerformanceAnalysisKit';

const DOMAIN: number = 0x0000;
const TAG: string = 'SbqIndex';

/**
 * 网页首页相对 rawfile 的路径。
 * 对应：entry/src/main/resources/rawfile/www/index.html
 * 该目录由仓库根目录执行 `npm run harmonyos:sync` 生成。
 */
const HOME_PAGE: string = 'www/index.html';

/**
 * 鸿蒙应用主页面：一个全屏 ArkWeb（Web 组件）容器。
 *
 * 设计要点（这些配置直接决定网页里的功能能不能用）：
 *   - javaScriptAccess      整个应用由 JS 渲染，必须开
 *   - domStorageAccess      登录态存在 localStorage，不开会导致"登录后又被弹回登录页"
 *   - fileAccess            页面要加载 rawfile 内的 js/css/贴图，必须开
 *   - geolocationAccess     VR 寻波要用定位
 *   - onShowFileSelector    <input type="file"> 必须由宿主接管，否则"图片识别"点了没反应
 *   - onGeolocationShow     网页的定位请求必须由宿主放行
 *   - darkMode(Off)         防止系统深色模式把示波器界面配色强制反转
 */
@Entry
@Component
struct Index {
  private controller: webview.WebviewController = new webview.WebviewController();
  @State connectionOpen: boolean = true;
  @State server: string = 'http://127.0.0.1:3000';
  @State pageSource: ResourceStr = $rawfile(HOME_PAGE);
  @State connectionMessage: string = '';
  @State loading: boolean = true;

  private async loadServer(): Promise<void> {
    try {
      const context = this.getUIContext().getHostContext();
      if (context) {
        const prefs = await preferences.getPreferences(context, { name: 'connection' });
        this.server = await prefs.get('server', this.server) as string;
      }
    } catch (_) {}
  }
  private async connect(): Promise<void> {
    let origin: string = this.server.trim();
    while (origin.endsWith('/')) origin = origin.substring(0, origin.length - 1);
    if (!/^https?:\/\/[a-zA-Z0-9.-]+(:[0-9]{1,5})?$/.test(origin)) {
      this.connectionMessage = '请输入 http:// 或 https:// 开头的服务器地址，不含网页路径'; return;
    }
    this.errorMessage = ''; this.loading = true;
    this.pageSource = origin + '/login.html';
    this.connectionOpen = false;
    try {
      const context = this.getUIContext().getHostContext();
      if (context) {
        const prefs = await preferences.getPreferences(context, { name: 'connection' });
        await prefs.put('server', origin); await prefs.flush();
      }
    } catch (_) {}
  }

  @State progress: number = 0;
  @State errorMessage: string = '';

  aboutToAppear(): void {
    // 定位权限需要动态申请，且必须在网页发起点位请求之前完成
    this.requestLocationPermissions();
    this.loadServer();
  }

  /**
   * 动态申请定位权限。
   * 说明：H5 的 navigator.geolocation / 百度地图定位最终由宿主的
   *      onGeolocationShow 放行，但前提是应用本身已被授予定位权限。
   */
  private async requestLocationPermissions(): Promise<void> {
    try {
      const atManager = abilityAccessCtrl.createAtManager();
      const permissions: Array<Permissions> = [
        'ohos.permission.APPROXIMATELY_LOCATION',
        'ohos.permission.LOCATION'
      ];
      // getContext() 在 API 12 之后已被标记为废弃，改用 UIContext 取宿主 Context
      const hostContext = this.getUIContext().getHostContext();
      if (!hostContext) {
        hilog.warn(DOMAIN, TAG, '%{public}s', '无法获取宿主 Context，跳过权限申请');
        return;
      }
      const context = hostContext as common.UIAbilityContext;
      const result = await atManager.requestPermissionsFromUser(context, permissions);
      hilog.info(DOMAIN, TAG, '定位权限申请结果: %{public}s', JSON.stringify(result.authResults));
    } catch (err) {
      hilog.warn(DOMAIN, TAG, '定位权限申请失败: %{public}s', JSON.stringify(err));
    }
  }

  /**
   * 返回键：优先让网页回退历史，退无可退才退出应用。
   * @returns true 表示事件已被消费
   */
  onBackPress(): boolean {
    try {
      if (this.controller.accessBackward()) {
        this.controller.backward();
        return true;
      }
    } catch (err) {
      hilog.warn(DOMAIN, TAG, 'backward 失败: %{public}s', JSON.stringify(err));
    }
    return false;
  }

  build() {
    Stack({ alignContent: Alignment.Center }) {
      Web({ src: this.pageSource, controller: this.controller })
        .width('100%')
        .height('100%')
        // ===== 能力开关 =====
        .javaScriptAccess(true)
        .domStorageAccess(true)
        .databaseAccess(true)
        .fileAccess(true)
        .imageAccess(true)
        .onlineImageAccess(true)
        .geolocationAccess(true)
        .mixedMode(MixedMode.All)
        .zoomAccess(false)
        .mediaPlayGestureAccess(true)
        .darkMode(WebDarkMode.Off)
        .forceDarkAccess(false)
        .horizontalScrollBarAccess(false)
        .verticalScrollBarAccess(false)
        // ===== 页面生命周期 =====
        .onPageBegin(() => {
          this.loading = true;
          this.errorMessage = '';
        })
        .onProgressChange((event) => {
          if (event) {
            this.progress = event.newProgress;
          }
        })
        .onPageEnd(() => {
          this.loading = false;
        })
        // ===== 错误与日志 =====
        .onErrorReceive((event) => {
          if (!event) {
            return;
          }
          const url: string = event.request.getRequestUrl();
          hilog.error(DOMAIN, TAG, '资源加载失败: %{public}s', url);
          // 只有主文档（.html）失败才算致命：贴图 / 地图 / CDN 离线失败不影响主体功能
          if (event.request.isMainFrame()) {
            this.loading = false;
            this.errorMessage = '页面加载失败：' + url;
          }
        })
        .onConsole((event) => {
          if (event) {
            hilog.debug(DOMAIN, TAG, '[web控制台] %{public}s', event.message.getMessage());
          }
          // 返回 false 表示不拦截，控制台照常输出，方便 chrome://inspect 调试
          return false;
        })
        // ===== H5 定位授权 =====
        .onGeolocationShow((event) => {
          if (event) {
            hilog.info(DOMAIN, TAG, '网页请求定位，来源: %{public}s', event.origin);
            // invoke(origin, allow, retain)：allow=true 放行，retain=true 记住本次选择
            event.geolocation.invoke(event.origin, true, true);
          }
        })
        // ===== 摄像头 / 麦克风等权限请求 =====
        .onPermissionRequest((event) => {
          if (event) {
            event.request.deny();
          }
        })
        // ===== 网页 <input type="file"> 的选择器接管 =====
        .onShowFileSelector((event) => {
          if (!event) {
            return false;
          }
          try {
            // 用系统图片选择器挑 1 张图，交给网页的 input 元素。
            // 不实现这里的话，"图片识别波形"功能点击后不会有任何反应。
            const photoPicker = new photoAccessHelper.PhotoViewPicker();
            photoPicker
              .select({
                MIMEType: photoAccessHelper.PhotoViewMIMETypes.IMAGE_TYPE,
                maxSelectNumber: 1
              })
              .then((result: photoAccessHelper.PhotoSelectResult) => {
                hilog.info(DOMAIN, TAG, '已选择 %{public}d 个文件', result.photoUris.length);
                event.result.handleFileList(result.photoUris);
              })
              .catch((err: BusinessError) => {
                hilog.error(DOMAIN, TAG, '选择图片失败: %{public}s', JSON.stringify(err));
                event.result.handleFileList([]);
              });
          } catch (err) {
            hilog.error(DOMAIN, TAG, 'onShowFileSelector 异常: %{public}s', JSON.stringify(err));
            event.result.handleFileList([]);
          }
          return true;
        })

      // ===== 首屏加载指示（网页自身也有加载层，这里覆盖 Web 内核初始化阶段）=====
      if (this.loading) {
        Column({ space: 14 }) {
          LoadingProgress()
            .width(56)
            .height(56)
            .color('#21C4F4')
          Text('正在加载示波器仿真系统…')
            .fontSize(15)
            .fontColor('#9FB3C8')
          Text(this.progress.toString() + '%')
            .fontSize(12)
            .fontColor('#5A7184')
        }
        .width('100%')
        .height('100%')
        .justifyContent(FlexAlign.Center)
        .backgroundColor('#0E1621')
      }

      // ===== 主文档加载失败时的兜底界面 =====
      if (this.errorMessage.length > 0) {
        Column({ space: 16 }) {
          Text('😕')
            .fontSize(44)
          Text(this.errorMessage)
            .fontSize(14)
            .fontColor('#E6EDF3')
            .textAlign(TextAlign.Center)
            .padding({ left: 24, right: 24 })
          Text('请检查服务地址与网络，或打开连接设置选择离线游客体验')
            .fontSize(12)
            .fontColor('#9FB3C8')
            .textAlign(TextAlign.Center)
            .padding({ left: 24, right: 24 })
          Button('重新加载')
            .backgroundColor('#2196F3')
            .onClick(() => {
              this.errorMessage = '';
              this.loading = true;
              try {
                this.controller.refresh();
              } catch (err) {
                hilog.error(DOMAIN, TAG, 'refresh 失败: %{public}s', JSON.stringify(err));
              }
            })
        }
        .width('100%')
        .height('100%')
        .justifyContent(FlexAlign.Center)
        .backgroundColor('#0E1621')
      }
      Column() {
        Row() {
          Blank()
          Button('连接设置').fontSize(12).height(32).onClick(() => { this.connectionOpen = true; })
        }.width('100%').padding(8)
        Blank()
      }.width('100%').height('100%').hitTestBehavior(HitTestMode.Transparent)

      if (this.connectionOpen) {
        Column({ space: 16 }) {
          Text('连接用户数据服务').fontSize(22).fontColor('#ffffff')
          Text('联网模式可注册账号、保存和恢复实验；离线模式可直接体验仿真。')
            .fontSize(14).fontColor('#b7cbdc')
          TextInput({ text: this.server, placeholder: 'http://电脑局域网地址:3000' })
            .onChange((value: string) => { this.server = value; })
          Text('设备上的 127.0.0.1 指设备本身。通过 USB 端口映射或填写电脑的局域网地址连接。')
            .fontSize(12).fontColor('#b7cbdc')
          if (this.connectionMessage.length > 0) {
            Text(this.connectionMessage).fontColor('#ff8a8a').fontSize(12)
          }
          Button('连接并登录').width('100%').onClick(() => { this.connect(); })
          Button('离线游客体验').width('100%').onClick(() => {
            this.pageSource = $rawfile(HOME_PAGE); this.connectionOpen = false; this.errorMessage = '';
          })
          Button('返回当前页面').width('100%').onClick(() => { this.connectionOpen = false; })
        }.width('100%').height('100%').padding(28).justifyContent(FlexAlign.Center).backgroundColor('#0E1621')
      }
    }
    .width('100%')
    .height('100%')
    .backgroundColor('#0E1621')
  }
}
