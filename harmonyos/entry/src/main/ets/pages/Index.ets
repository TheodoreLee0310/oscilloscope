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
  @State loading: boolean = true;
  @State progress: number = 0;
  @State errorMessage: string = '';

  aboutToAppear(): void {
    // 定位权限需要动态申请，且必须在网页发起点位请求之前完成
    this.requestLocationPermissions();
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
      Web({ src: $rawfile(HOME_PAGE), controller: this.controller })
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
          if (url.indexOf('.html') >= 0) {
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
            event.request.grant(event.request.getAccessibleResource());
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
          Text('请确认已执行 npm run harmonyos:sync 生成网页产物')
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
    }
    .width('100%')
    .height('100%')
    .backgroundColor('#0E1621')
  }
}
