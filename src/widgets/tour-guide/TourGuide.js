/**
 * ES6 TourGuide - 引导组件（模块化）
 * 说明：
 * - 去除全局 window 污染与自动启动逻辑
 * - 默认从 ./widgets/tour-guide/config.json 读取配置（可传入自定义 URL 或步骤数组）
 * - 提供纯组件 API：from/load/start/next/prev/skip
 */

export default class TourGuide {
  constructor(config) {
    this.steps          = Array.isArray(config) ? config : (config || []);
    this.index          = 0;
    this.overlayEl      = null;   // 根容器
    this.popEl          = null;   // .introduce-box
    this.titleEl        = null;
    this.descEl         = null;
    this.cloneEl        = null;   // 高亮克隆
    this.maskEl         = null;   // 蒙版元素
    this.DISTANCE       = 16;
    this.VW             = window.innerWidth  || document.documentElement.clientWidth;
    this.VH             = window.innerHeight || document.documentElement.clientHeight;
  }

  /* ---------- public ---------- */
  static async from(urlOrConfig = null) {
    if (typeof urlOrConfig === 'string') {
      const json = await fetch(urlOrConfig).then(r => r.json());
      return new TourGuide(json);
    }
    if (Array.isArray(urlOrConfig) || typeof urlOrConfig === 'object') {
      return new TourGuide(urlOrConfig);
    }
    // 未提供时由上层使用方（index.js）以 import JSON 的方式提供默认配置
    throw new Error('TourGuide.from 需要传入配置 URL 或对象');
  }

  start()  { this.#render().#goto(0); }
  next()   { this.#goto(this.index + 1); }
  prev()   { this.#goto(this.index - 1); }
  skip()   { this.#destroy(); }

  /* ---------- private ---------- */
  #goto(i) {
    if (i < 0 || !this.steps[i]) return this.#destroy();

    this.#clearHighlight();

    this.index = i;
    const step = this.steps[i];

    // 文案
    this.titleEl.textContent = step.title || '';
    this.descEl.innerHTML = step.content || '';

    const target = step.target ? document.querySelector(step.target) : null;

    if (step.position) {
      this.#place(step.position.left, step.position.top);

      if (!!step.clip && target) {
        if (step.highlight) {
          this.#highlight(step.highlight);
        } else {
          const rect = target.getBoundingClientRect();
          this.#highlight(rect);
        }
      } else {
        this.overlayEl.style.background = 'none';
      }
    } else {
      if (target && step.click && typeof target.click === 'function') target.click();

      if (target && !this.#inViewport(target)) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => {
          this.#position(target, !!step.clip);
        }, 500);
        return;
      }

      this.#position(target, !!step.clip);
    }

    const isLast = i === this.steps.length - 1;
    const isFirst = i === 0;
    this.overlayEl.querySelector('.next').textContent = isLast ? '完成' : '下一步';
    this.overlayEl.querySelector('.exit').style.display = isLast ? 'none' : '';
    this.overlayEl.querySelector('.prev').style.display = isFirst ? 'none' : '';

    this.#handleSpecialCases(step);
  }

  #position(target, needClip, customHighlight) {
    this.#clearHighlight();

    if (!target) return this.#place(this.VW/2, this.VH/2);

    if (!this.#inViewport(target)) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    const rect = target.getBoundingClientRect();
    const pop  = this.popEl.getBoundingClientRect();

    const space = {
      left  : rect.left,
      right : this.VW - rect.right,
      top   : rect.top,
      bottom: this.VH - rect.bottom
    };

    let top = rect.top;
    let left;

    if (space.left >= pop.width || space.right >= pop.width) {
      const putRight = rect.x + rect.width/2 < this.VW/2 && space.right >= pop.width;
      left = putRight ? rect.right + this.DISTANCE
                      : rect.left  - pop.width - this.DISTANCE;
    } else if (space.bottom >= pop.height) {
      top  = rect.bottom + this.DISTANCE;
      left = Math.min(Math.max(this.DISTANCE, rect.left),
                      this.VW - pop.width - this.DISTANCE);
    } else {
      top  = this.VH - pop.height - this.DISTANCE;
      left = this.VW - pop.width  - this.DISTANCE;
    }

    this.#place(left, top);

    if (needClip) {
      if (customHighlight) {
        this.#highlight(customHighlight);
      } else {
        this.#highlight(rect);
      }
    }
  }

  #place(l, t) {
    this.popEl.style.left = Math.max(this.DISTANCE,
                          Math.min(l, this.VW - this.popEl.offsetWidth  - this.DISTANCE)) + 'px';
    this.popEl.style.top  = Math.max(this.DISTANCE,
                          Math.min(t, this.VH - this.popEl.offsetHeight - this.DISTANCE)) + 'px';
  }

  #clearHighlight() {
    this.cloneEl?.remove();
    this.cloneEl = null;
    if (this.maskEl) {
      this.maskEl.remove();
      this.maskEl = null;
    }
  }

  #highlight(rectOrConfig) {
    this.maskEl = document.createElement('div');
    this.maskEl.className = 'tour-guide-mask';
    document.body.appendChild(this.maskEl);

    let highlightRect;
    if (typeof rectOrConfig === 'object') {
      highlightRect = {
        left: rectOrConfig.left !== undefined ? rectOrConfig.left : (rectOrConfig.x || 0),
        top: rectOrConfig.top !== undefined ? rectOrConfig.top : (rectOrConfig.y || 0),
        width: rectOrConfig.width || 100,
        height: rectOrConfig.height || 100
      };
    } else {
      highlightRect = { left: this.VW/2 - 50, top: this.VH/2 - 50, width: 100, height: 100 };
    }

    const maskId = `tour-mask-${Date.now()}`;
    const maskHTML = `
      <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <mask id="${maskId}">
            <rect width="100%" height="100%" fill="white"/>
            <rect x="${highlightRect.left}" y="${highlightRect.top}" 
                  width="${highlightRect.width}" height="${highlightRect.height}" 
                  rx="4" ry="4" fill="black"/>
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(0,0,0,0.5)" mask="url(#${maskId})"/>
      </svg>
    `;
    this.maskEl.innerHTML = maskHTML;

    this.cloneEl = document.createElement('div');
    Object.assign(this.cloneEl.style, {
      position: 'fixed',
      top: highlightRect.top + 'px',
      left: highlightRect.left + 'px',
      width: highlightRect.width + 'px',
      height: highlightRect.height + 'px',
      border: '1px solid #1a73e8',
      borderRadius: '4px',
      boxShadow: '0 0 0 4px rgba(26, 115, 232, 0.3)',
      zIndex: 10000,
      pointerEvents: 'none'
    });
    document.body.appendChild(this.cloneEl);
  }

  #render() {
    const tpl = document.createElement('div');
    tpl.innerHTML = `
      <div id="introduce" style="position:fixed;inset:0;">
        <div class="introduce-box">
          <p class="introduce-title"></p>
          <p class="introduce-desc"></p>
          <div class="introduce-operate">
            <button class="exit">跳过</button>
            <button class="prev">上一步</button>
            <button class="next">下一步</button>
          </div>
        </div>
      </div>`;
    this.overlayEl = tpl.firstElementChild;
    document.body.prepend(this.overlayEl);

    this.popEl   = this.overlayEl.querySelector('.introduce-box');
    this.titleEl = this.overlayEl.querySelector('.introduce-title');
    this.descEl  = this.overlayEl.querySelector('.introduce-desc');

    this.overlayEl.querySelector('.next').onclick = () => this.next();
    this.overlayEl.querySelector('.prev').onclick = () => this.prev();
    this.overlayEl.querySelector('.exit').onclick = () => this.skip();

    return this;
  }

  #inViewport(el) {
    const r = el.getBoundingClientRect();
    return r.top >= 0 && r.left >= 0 && r.right <= this.VW && r.bottom <= this.VH;
  }

  #destroy() {
    this.#clearHighlight();
    this.overlayEl?.remove();
  }

  #handleSpecialCases(step) {
    // 预留扩展点：外部可在创建实例后通过自定义回调挂载业务逻辑
    if (typeof this.onStepHandled === 'function') {
      try { this.onStepHandled(step, this); } catch (_) {}
    }
  }
}


