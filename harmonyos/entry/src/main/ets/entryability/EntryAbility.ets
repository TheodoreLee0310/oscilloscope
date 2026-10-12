import { AbilityConstant, UIAbility, Want } from '@kit.AbilityKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { window } from '@kit.ArkUI';
import { webview } from '@kit.ArkWeb';

const DOMAIN: number = 0x0000;
const TAG: string = 'SbqEntryAbility';

/**
 * 应用入口 Ability。
 *
 * 本应用是「ArkWeb 容器型」应用：界面完全由 entry/src/main/resources/rawfile/www
 * 下的网页（Vue 2 + Three.js 构建产物）渲染，ArkTS 侧只负责：
 *   1. 创建窗口并加载 pages/Index
 *   2. 打开 Web 调试开关（便于用 chrome://inspect 排查）
 *
 * 注意：网页产物由仓库根目录执行 `npm run harmonyos:sync` 同步进来，
 *      该目录在 .gitignore 中被忽略，克隆后必须执行一次同步。
 */
export default class EntryAbility extends UIAbility {
  onCreate(want: Want, launchParam: AbilityConstant.LaunchParam): void {
    hilog.info(DOMAIN, TAG, '%{public}s', 'Ability onCreate');
  }

  onDestroy(): void {
    hilog.info(DOMAIN, TAG, '%{public}s', 'Ability onDestroy');
  }

  onWindowStageCreate(windowStage: window.WindowStage): void {
    hilog.info(DOMAIN, TAG, '%{public}s', 'Ability onWindowStageCreate');

    // 打开 ArkWeb 调试开关：
    // 打开后可以用 Chrome/Edge 的 chrome://inspect 连接设备调试页面内 JS。
    // 正式发布前建议注释掉这一行。
    try {
      webview.WebviewController.setWebDebuggingAccess(true);
    } catch (err) {
      hilog.warn(DOMAIN, TAG, 'setWebDebuggingAccess 失败: %{public}s', JSON.stringify(err));
    }

    windowStage.loadContent('pages/Index', (err) => {
      if (err.code) {
        hilog.error(DOMAIN, TAG, 'loadContent 失败: %{public}s', JSON.stringify(err));
        return;
      }
      hilog.info(DOMAIN, TAG, '%{public}s', 'loadContent 成功');
    });
  }

  onWindowStageDestroy(): void {
    hilog.info(DOMAIN, TAG, '%{public}s', 'Ability onWindowStageDestroy');
  }

  onForeground(): void {
    hilog.info(DOMAIN, TAG, '%{public}s', 'Ability onForeground');
  }

  onBackground(): void {
    hilog.info(DOMAIN, TAG, '%{public}s', 'Ability onBackground');
  }
}
