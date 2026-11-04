/**
 * 百度地图 JS API 加载器
 * ---------------------------------------------------------------
 * 为什么需要专门写一个加载器（踩过的坑，务必保留注释）：
 *
 * 百度地图 v3.0 的入口地址 `https://api.map.baidu.com/api?v=3.0&ak=...`
 * 返回的是一段 **bootstrap 脚本**，它内部用 `document.write(...)` 注入真正的 SDK。
 *
 * 而 `document.write` 只在 **页面解析期间** 有效：
 *   - 用 `<script src="...">` 放在 HTML 里 → 可以；
 *   - 用 `document.createElement('script')` 动态插入（且 async）→ 浏览器会忽略
 *     这次 document.write，真 SDK 永远不会加载，`BMap` 一直 undefined。
 *
 * 之前把加载改成「动态插入 + async」后，界面上就表现为"地图 API 不可用"。
 *
 * 正确做法：用官方的**异步加载写法** —— 在 URL 上加 `&callback=全局函数名`。
 * 此时 bootstrap 不再用 document.write，而是创建 script 加载 SDK 并在完成后
 * 回调这个全局函数（实测响应里会定义 `window.BMap.apiLoad` 再调用回调）。
 */

/** 默认 AK：可在页面里通过 window.SBQ_BAIDU_MAP_AK 覆盖，无需改源码 */
export const DEFAULT_BAIDU_AK = 'tMz9vycikwq7TTyRRIyvLYd3t8xVkfve';

/** 加载完成后的全局回调名 */
const CALLBACK_NAME = '__sbqBMapReady';

let loadingPromise = null;

/** 取当前生效的 AK */
export function getBaiduAk() {
  if (typeof window !== 'undefined' && window.SBQ_BAIDU_MAP_AK) {
    return String(window.SBQ_BAIDU_MAP_AK);
  }
  return DEFAULT_BAIDU_AK;
}

/** SDK 是否已真正就绪（只有 BMap.Map 存在才算） */
export function isBaiduMapReady() {
  return (
    typeof window !== 'undefined' &&
    typeof window.BMap !== 'undefined' &&
    typeof window.BMap.Map === 'function'
  );
}

/**
 * 确保百度地图 SDK 已加载。
 * @param {{ ak?: string, timeout?: number }} [options]
 * @returns {Promise<boolean>} 是否可用；失败不会抛异常，且允许后续重试
 */
export function ensureBaiduMap(options = {}) {
  const ak = options.ak || getBaiduAk();
  const timeout = options.timeout || 10000;

  if (isBaiduMapReady()) return Promise.resolve(true);
  if (loadingPromise) return loadingPromise;
  if (typeof document === 'undefined' || !document.head) return Promise.resolve(false);

  const attempt = new Promise((resolve) => {
    let settled = false;
    let timer = null;

    const finish = (ok) => {
      if (settled) return;
      settled = true;
      // 已确定结果就清掉超时定时器，避免成功后再打一条误导性的"超时"日志
      if (timer) clearTimeout(timer);
      resolve(!!ok && isBaiduMapReady());
    };

    // 官方异步写法：SDK 加载完成后调用这个全局函数
    window[CALLBACK_NAME] = () => finish(true);

    timer = setTimeout(() => {
      if (!isBaiduMapReady()) {
        console.warn('[baiduMap] 加载超时（' + timeout + 'ms）');
      }
      finish(isBaiduMapReady());
    }, timeout);

    try {
      const script = document.createElement('script');
      script.src =
        'https://api.map.baidu.com/api?v=3.0&ak=' +
        encodeURIComponent(ak) +
        '&callback=' +
        CALLBACK_NAME;
      script.async = true;

      script.onerror = () => {
        console.warn('[baiduMap] 脚本加载失败（网络不可达或域名被拦截）');
        finish(false);
      };

      // bootstrap 的 onload 不等于 SDK 就绪（SDK 是它再注入的一个脚本），
      // 这里给一次兜底检查，真正可靠的信号仍然是上面的 callback。
      script.onload = () => {
        setTimeout(() => {
          if (isBaiduMapReady()) finish(true);
        }, 300);
      };

      document.head.appendChild(script);
    } catch (err) {
      console.warn('[baiduMap] 注入脚本异常:', err);
      finish(false);
    }
  });

  // 失败后清掉缓存，允许用户点「重试在线地图」再试一次
  loadingPromise = attempt.then((ok) => {
    if (!ok) loadingPromise = null;
    return ok;
  });

  return loadingPromise;
}

export default { ensureBaiduMap, isBaiduMapReady, getBaiduAk, DEFAULT_BAIDU_AK };
