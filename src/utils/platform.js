/**
 * 平台适配层（Platform Adapter）
 * ---------------------------------------------------------------
 * 目标：让同一份前端代码在以下三种宿主里都能正常工作
 *
 *   1. 普通浏览器（Chrome / Edge / Safari ...）
 *   2. Electron 桌面壳（Electron 28，file:// 或本地服务）
 *   3. 鸿蒙 HarmonyOS 的 ArkWeb 组件（$rawfile 加载本地页面）
 *
 * 鸿蒙侧与桌面/浏览器的主要差异（本文件逐一兜底）：
 *   - DOM Storage（localStorage）可能被宿主关闭 → 用内存 + sessionStorage + cookie 分层降级
 *   - Web 组件默认不弹 JS 原生对话框（alert/confirm）→ 改用自绘 toast
 *   - 远程 CDN 脚本可能不可达或很慢 → 统一用 loadScriptOnce（带超时、不抛异常）
 *   - 视口会因软键盘 / 旋转 / 分屏频繁变化 → 统一用 onViewportChange 订阅
 *
 * 说明：本文件只依赖标准 Web API，不引入任何 Node.js / Electron 专有能力，
 *      因此可以被 ArkWeb 直接加载。
 */

/* ------------------------------------------------------------------ *
 * 运行环境探测
 * ------------------------------------------------------------------ */

const UA = (typeof navigator !== 'undefined' && navigator.userAgent) || '';

function detectRuntime() {
  const ua = UA;

  // 鸿蒙 ArkWeb 的 UA 里带 ArkWeb/x.y.z，同时通常含 OpenHarmony 或 HarmonyOS
  const isArkWeb = /ArkWeb/i.test(ua);
  const isHarmonyOS = isArkWeb || /OpenHarmony|HarmonyOS/i.test(ua);

  // Electron 渲染进程：UA 带 Electron，且 process.versions.electron 存在
  const isElectron =
    /Electron/i.test(ua) ||
    (typeof process !== 'undefined' && !!(process.versions && process.versions.electron));

  const isTouch =
    typeof window !== 'undefined' &&
    ('ontouchstart' in window ||
      (typeof navigator !== 'undefined' && (navigator.maxTouchPoints || 0) > 0));

  const isMobile =
    isHarmonyOS ||
    /Mobile|Android|iPhone|iPod|Phone|iPad/i.test(ua);

  let name = 'browser';
  if (isArkWeb) name = 'harmonyos-arkweb';
  else if (isHarmonyOS) name = 'harmonyos';
  else if (isElectron) name = 'electron';

  return {
    name,
    ua,
    isArkWeb,
    isHarmonyOS,
    isElectron,
    isBrowser: !isArkWeb && !isHarmonyOS && !isElectron,
    isTouch,
    isMobile,
    /** 触摸设备上鼠标事件不可用，业务代码可据此切换交互方式 */
    pointer: isTouch ? 'touch' : 'mouse',
  };
}

export const runtime = detectRuntime();

/* ------------------------------------------------------------------ *
 * 安全存储：localStorage → sessionStorage → cookie → 内存
 * ------------------------------------------------------------------ */

const memoryStore = new Map();

/** 探测某个 Storage 是否真的可读写（隐私模式 / 宿主禁用时会抛异常） */
function probeStorage(getStorage) {
  try {
    const s = getStorage();
    if (!s) return null;
    const k = '__sbq_probe__';
    s.setItem(k, '1');
    s.removeItem(k);
    return s;
  } catch (_) {
    return null;
  }
}

const localStore = probeStorage(() => (typeof localStorage !== 'undefined' ? localStorage : null));
const sessionStore = probeStorage(() =>
  typeof sessionStorage !== 'undefined' ? sessionStorage : null
);

/** cookie 兜底（ArkWeb 里 cookie 通常比 DOM Storage 更容易被放行） */
const cookieStore = {
  available: (() => {
    try {
      if (typeof document === 'undefined') return false;
      document.cookie = '__sbq_probe__=1; path=/; SameSite=Lax';
      const ok = document.cookie.indexOf('__sbq_probe__=') !== -1;
      document.cookie = '__sbq_probe__=; path=/; Max-Age=0; SameSite=Lax';
      return ok;
    } catch (_) {
      return false;
    }
  })(),
  getItem(key) {
    try {
      const m = document.cookie.match(
        new RegExp('(?:^|; )' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)')
      );
      return m ? decodeURIComponent(m[1]) : null;
    } catch (_) {
      return null;
    }
  },
  setItem(key, value) {
    try {
      document.cookie =
        key + '=' + encodeURIComponent(value) + '; path=/; max-age=604800; SameSite=Lax';
      return true;
    } catch (_) {
      return false;
    }
  },
  removeItem(key) {
    try {
      document.cookie = key + '=; path=/; max-age=0; SameSite=Lax';
    } catch (_) {
      /* 忽略 */
    }
  },
};

/**
 * 分层存储：任何一层可用就用，全不可用时退化为内存（当前页面有效）
 * 这样即便 ArkWeb 没开 domStorageAccess，页面也不会因为 SecurityError 直接崩掉。
 */
export const storage = {
  /** 真实落盘的层（不含内存层），用于判断"刷新后是否还记得" */
  get persistent() {
    return !!(localStore || sessionStore || cookieStore.available);
  },
  get backend() {
    if (localStore) return 'localStorage';
    if (sessionStore) return 'sessionStorage';
    if (cookieStore.available) return 'cookie';
    return 'memory';
  },

  getItem(key) {
    for (const layer of [localStore, sessionStore, cookieStore]) {
      if (!layer) continue;
      try {
        const v = layer.getItem(key);
        if (v !== null && v !== undefined) return v;
      } catch (_) {
        /* 换下一层 */
      }
    }
    return memoryStore.has(key) ? memoryStore.get(key) : null;
  },

  setItem(key, value) {
    const str = String(value);
    memoryStore.set(key, str);
    for (const layer of [localStore, sessionStore, cookieStore]) {
      if (!layer) continue;
      try {
        layer.setItem(key, str);
      } catch (_) {
        /* 换下一层 */
      }
    }
  },

  removeItem(key) {
    memoryStore.delete(key);
    for (const layer of [localStore, sessionStore, cookieStore]) {
      if (!layer) continue;
      try {
        layer.removeItem(key);
      } catch (_) {
        /* 忽略 */
      }
    }
  },

  getJSON(key, fallback = null) {
    try {
      const raw = this.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
      return fallback;
    }
  },

  setJSON(key, value) {
    try {
      this.setItem(key, JSON.stringify(value));
      return true;
    } catch (_) {
      return false;
    }
  },
};

/* ------------------------------------------------------------------ *
 * 登录态 URL 桥接
 * ------------------------------------------------------------------ */

/**
 * 宿主禁用持久化存储时（例如 ArkWeb 未开 domStorageAccess），
 * 登录页会把 token 挂在 URL 上带过来，这里把它吸收进可用的存储层，
 * 使后续页面与刷新仍能保持登录态。
 */
export function adoptUrlSession() {
  try {
    if (typeof window === 'undefined' || !window.location) return false;
    if (typeof URLSearchParams === 'undefined') return false;

    const qs = new URLSearchParams(window.location.search);
    const token = qs.get('sbq_token');
    if (!token) return false;

    const user = qs.get('sbq_user');
    if (!storage.getItem('sbq_token')) {
      storage.setItem('sbq_token', token);
      if (user) storage.setItem('sbq_user', user);
    }
    return true;
  } catch (_) {
    return false;
  }
}

// 模块加载即尝试吸收（早于任何业务代码读取登录态）
adoptUrlSession();

/* ------------------------------------------------------------------ *
 * 提示信息（替代 alert）
 * ------------------------------------------------------------------ */

let toastHost = null;
let toastStyleInjected = false;

function ensureToastHost() {
  if (typeof document === 'undefined' || !document.body) return null;
  if (toastHost && document.body.contains(toastHost)) return toastHost;

  if (!toastStyleInjected) {
    const style = document.createElement('style');
    style.textContent = `
      .sbq-toast-host{position:fixed;left:50%;top:24px;transform:translateX(-50%);
        z-index:2147483000;display:flex;flex-direction:column;gap:8px;
        align-items:center;pointer-events:none;max-width:92vw;}
      .sbq-toast{pointer-events:auto;background:rgba(33,45,58,.95);color:#fff;
        font:14px/1.5 -apple-system,'Microsoft YaHei',Arial,sans-serif;
        padding:10px 16px;border-radius:8px;box-shadow:0 6px 18px rgba(0,0,0,.28);
        max-width:92vw;word-break:break-word;opacity:0;transform:translateY(-6px);
        transition:opacity .18s ease,transform .18s ease;}
      .sbq-toast.show{opacity:1;transform:translateY(0);}
      .sbq-toast.warn{background:rgba(191,84,0,.96);}
      .sbq-toast.error{background:rgba(176,42,55,.96);}
      .sbq-toast.success{background:rgba(26,127,55,.96);}
    `;
    document.head.appendChild(style);
    toastStyleInjected = true;
  }

  toastHost = document.createElement('div');
  toastHost.className = 'sbq-toast-host';
  document.body.appendChild(toastHost);
  return toastHost;
}

/**
 * 统一的用户提示：优先自绘 toast（鸿蒙 Web 组件里也一定能显示），
 * 没有 DOM 时退化成 console.warn。
 * @param {string} message
 * @param {'info'|'warn'|'error'|'success'} [type]
 * @param {number} [duration] 毫秒
 */
export function toast(message, type = 'info', duration = 2600) {
  const text = String(message == null ? '' : message);
  const host = ensureToastHost();
  if (!host) {
    if (typeof console !== 'undefined') console.warn('[toast]', text);
    return;
  }

  const el = document.createElement('div');
  el.className = 'sbq-toast' + (type && type !== 'info' ? ' ' + type : '');
  el.textContent = text;
  host.appendChild(el);

  // 触发过渡
  requestAnimationFrame(() => el.classList.add('show'));

  const remove = () => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 220);
  };
  const timer = setTimeout(remove, duration);
  el.addEventListener('click', () => {
    clearTimeout(timer);
    remove();
  });
}

/** 语义化别名：需要用户注意但不阻塞 */
export const notify = toast;

/* ------------------------------------------------------------------ *
 * 远程脚本按需加载（替代 HTML 里阻塞式的 <script src="https://...">）
 * ------------------------------------------------------------------ */

const loadedScripts = new Map();

/**
 * 加载一个远程脚本，同一个 URL 只会真正加载一次。
 * 无论成功失败都会 resolve（失败返回 false），不会抛异常、不会卡住页面。
 * @param {string} url
 * @param {{ timeout?: number, globalCheck?: () => boolean }} [options]
 * @returns {Promise<boolean>} 是否可用
 */
export function loadScriptOnce(url, options = {}) {
  const { timeout = 8000, globalCheck } = options;

  if (globalCheck && globalCheck()) return Promise.resolve(true);
  if (loadedScripts.has(url)) return loadedScripts.get(url);

  const promise = new Promise((resolve) => {
    if (typeof document === 'undefined') return resolve(false);

    // 页面里已经有同 src 的标签（比如模板里手写的），直接复用
    const existing = Array.prototype.slice
      .call(document.getElementsByTagName('script'))
      .find((s) => s.src === url || s.getAttribute('src') === url);

    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };

    const timer = setTimeout(() => finish(!!(globalCheck && globalCheck())), timeout);

    if (existing) {
      clearTimeout(timer);
      return finish(!!(globalCheck && globalCheck()));
    }

    const script = document.createElement('script');
    script.src = url;
    script.async = true;
    script.onload = () => {
      clearTimeout(timer);
      finish(!!(globalCheck ? globalCheck() : true));
    };
    script.onerror = () => {
      clearTimeout(timer);
      if (typeof console !== 'undefined') console.warn('[loadScriptOnce] 加载失败:', url);
      finish(false);
    };
    document.head.appendChild(script);
  });

  loadedScripts.set(url, promise);
  return promise;
}

/* ------------------------------------------------------------------ *
 * 视口变化订阅（旋转 / 软键盘 / 分屏）
 * ------------------------------------------------------------------ */

/**
 * 订阅视口尺寸变化。返回取消订阅函数。
 * @param {(size: {width:number, height:number}) => void} handler
 */
export function onViewportChange(handler) {
  if (typeof window === 'undefined') return () => {};

  let lastW = window.innerWidth;
  let lastH = window.innerHeight;
  let frame = null;

  const fire = () => {
    frame = null;
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (w === lastW && h === lastH) return;
    lastW = w;
    lastH = h;
    handler({ width: w, height: h });
  };

  const schedule = () => {
    if (frame !== null) return;
    frame = requestAnimationFrame(fire);
  };

  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('orientationchange', schedule, { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', schedule, { passive: true });
  }

  return () => {
    window.removeEventListener('resize', schedule);
    window.removeEventListener('orientationchange', schedule);
    if (window.visualViewport) {
      window.visualViewport.removeEventListener('resize', schedule);
    }
    if (frame !== null) cancelAnimationFrame(frame);
  };
}

/* ------------------------------------------------------------------ *
 * 页面内导航
 * ------------------------------------------------------------------ */

/** 站点内跳转：失败时退化为直接赋值 href（ArkWeb 下更稳） */
export function navigate(url) {
  try {
    if (typeof window !== 'undefined' && window.location) {
      window.location.assign(url);
      return true;
    }
  } catch (_) {
    /* 落到下面的兜底 */
  }
  try {
    if (typeof window !== 'undefined') window.location.href = url;
  } catch (_) {
    return false;
  }
  return true;
}

/** 是否运行在 file:// 或 rawfile 这类"不透明来源"下（此时相对路径最安全） */
export function isLocalOrigin() {
  try {
    const p = (typeof window !== 'undefined' && window.location && window.location.protocol) || '';
    return p === 'file:' || p === 'resource:' || p === 'rawfile:' || p === '';
  } catch (_) {
    return false;
  }
}

export default {
  runtime,
  storage,
  toast,
  notify,
  loadScriptOnce,
  onViewportChange,
  navigate,
  isLocalOrigin,
  adoptUrlSession,
};
