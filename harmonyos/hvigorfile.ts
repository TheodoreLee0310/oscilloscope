/*
 * 根级构建脚本（DevEco Studio 标准写法）
 * 说明：本项目不使用任何三方 har 依赖，ohpm install 可为空操作，
 *      因此可以直接离线构建，不需要先联网拉取依赖。
 */
import { appTasks } from '@ohos/hvigor-ohos-plugin';

export default {
  system: appTasks,
  plugins: []
};
