/**
 * 离线模拟地图（MockMap）
 * ---------------------------------------------------------------
 * 背景：VR 寻波功能原本依赖百度地图 JS API。但地图 API 需要联网、且 AK 是
 *      按域名白名单授权的 —— 在离线环境、鸿蒙 ArkWeb（rawfile 来源）里通常
 *      直接不可用，界面上只剩一个空框加一句"地图不可用"。
 *
 * 本模块用 Canvas 2D 画一张**完全离线、可交互的示意地图**来替代它：
 *   - 零网络依赖：不加载任何图片、脚本
 *   - 绘制经纬网格、地形热区（山脉/水面/平原/森林/峡谷/深海）、已知地点标记
 *   - 支持点击选点、拖动平移、滚轮 / 双指缩放
 *   - 对外只暴露最小接口：onPick 回调 + setMarker / setCenter / destroy
 *
 * 说明：这是一张"地形分布示意图"，不是真实地理底图。
 *      它的作用是让 VR 寻波在离线时依然可以演示完整交互链路。
 */

/** 各地形在示意地图上的代表色 */
const TERRAIN_COLORS = {
  mountain: '#8d6e63',
  water: '#1e88e5',
  plain: '#9ccc65',
  forest: '#2e7d32',
  valley: '#ff8a65',
  ocean: '#0d47a1',
};

/** 视图可平移的范围（防止用户拖到地图之外再也找不到内容） */
const VIEW_LIMITS = {
  minLng: -170,
  maxLng: 170,
  minLat: -55,
  maxLat: 78,
  minSpanLng: 6,
  maxSpanLng: 240,
};

export class MockMap {
  /**
   * @param {HTMLElement} container 承载画布的容器（需要已有宽高）
   * @param {object} options
   * @param {{lng:number, lat:number}} [options.center] 初始中心
   * @param {number} [options.spanLng] 初始可见经度跨度（越小越"放大"）
   * @param {Array} [options.locations] 已知地点 [{name, address, lng, lat, terrainType}]
   * @param {(point:{lng:number,lat:number}) => void} [options.onPick] 点击选点回调
   */
  constructor(container, options = {}) {
    this.container = container;
    this.locations = Array.isArray(options.locations) ? options.locations : [];
    this.onPick = typeof options.onPick === 'function' ? options.onPick : () => {};

    this.center = options.center ? { ...options.center } : { lng: 105, lat: 34 };
    this.spanLng = options.spanLng || 62;

    this.marker = null;        // 当前选中的位置 {lng, lat}
    this.hovered = null;       // 鼠标悬停的已知地点
    this.selectedKey = null;   // 当前高亮的已知地点（name 唯一标识）

    this.destroyed = false;
    this._raf = null;

    // 拖拽 / 缩放状态
    this._dragging = false;
    this._dragMoved = 0;
    this._lastPointer = null;
    this._pinchStart = null;

    this._buildDom();
    this._bindEvents();
    this._observeResize();
    this.render();
  }

  /* ------------------------------------------------------------------ *
   * DOM 与尺寸
   * ------------------------------------------------------------------ */

  _buildDom() {
    const doc = this.container.ownerDocument;

    this.canvas = doc.createElement('canvas');
    this.canvas.className = 'sbq-mockmap-canvas';
    Object.assign(this.canvas.style, {
      display: 'block',
      width: '100%',
      height: '100%',
      cursor: 'grab',
      touchAction: 'none', // 让浏览器把触摸手势交给我们处理（双指缩放）
      userSelect: 'none',
    });

    // 底部操作提示
    this.hint = doc.createElement('div');
    Object.assign(this.hint.style, {
      position: 'absolute',
      left: '8px',
      right: '8px',
      bottom: '6px',
      fontSize: '11px',
      lineHeight: '1.4',
      color: 'rgba(255,255,255,.72)',
      textShadow: '0 1px 2px rgba(0,0,0,.6)',
      pointerEvents: 'none',
      textAlign: 'center',
    });
    this.hint.textContent = '点击选点 · 拖动平移 · 滚轮/双指缩放';

    // 左上角"离线示意"角标，避免被误认为真实地图
    this.badge = doc.createElement('div');
    Object.assign(this.badge.style, {
      position: 'absolute',
      left: '8px',
      top: '8px',
      padding: '2px 7px',
      borderRadius: '10px',
      fontSize: '10px',
      letterSpacing: '.5px',
      color: '#fff',
      background: 'rgba(230,145,20,.85)',
      pointerEvents: 'none',
    });
    this.badge.textContent = '离线示意地图';

    // 容器需要相对定位，才能让角标与提示浮在画布上
    const position = doc.defaultView.getComputedStyle(this.container).position;
    if (position === 'static' || !position) {
      this.container.style.position = 'relative';
    }
    this.container.appendChild(this.canvas);
    this.container.appendChild(this.hint);
    this.container.appendChild(this.badge);

    this.ctx = this.canvas.getContext('2d');
  }

  _observeResize() {
    this._onResize = () => this.render();
    if (typeof ResizeObserver !== 'undefined') {
      this._resizeObserver = new ResizeObserver(this._onResize);
      this._resizeObserver.observe(this.container);
    } else {
      window.addEventListener('resize', this._onResize);
    }
  }

  /** 按容器实际尺寸与 DPR 同步画布分辨率 */
  _syncSize() {
    const rect = this.container.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    this.width = width;
    this.height = height;

    const pixelW = Math.round(width * dpr);
    const pixelH = Math.round(height * dpr);
    if (this.canvas.width !== pixelW || this.canvas.height !== pixelH) {
      this.canvas.width = pixelW;
      this.canvas.height = pixelH;
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /* ------------------------------------------------------------------ *
   * 坐标换算（等距圆柱投影，够用且直观）
   * ------------------------------------------------------------------ */

  _spanLat() {
    // 按画布长宽比换算纬度跨度，保证不变形
    return (this.spanLng * this.height) / Math.max(this.width, 1);
  }

  project(lng, lat) {
    const spanLng = this.spanLng;
    const spanLat = this._spanLat();
    return {
      x: ((lng - this.center.lng) / spanLng) * this.width + this.width / 2,
      y: ((this.center.lat - lat) / spanLat) * this.height + this.height / 2,
    };
  }

  unproject(x, y) {
    const spanLng = this.spanLng;
    const spanLat = this._spanLat();
    return {
      lng: this.center.lng + ((x - this.width / 2) / this.width) * spanLng,
      lat: this.center.lat - ((y - this.height / 2) / this.height) * spanLat,
    };
  }

  /* ------------------------------------------------------------------ *
   * 交互
   * ------------------------------------------------------------------ */

  _localPoint(event) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  _bindEvents() {
    const canvas = this.canvas;

    this._onPointerDown = (e) => {
      if (e.pointerType === 'touch' && e.isPrimary === false) return; // 多指交给 pinch 处理
      this._dragging = true;
      this._dragMoved = 0;
      this._lastPointer = { x: e.clientX, y: e.clientY };
      canvas.style.cursor = 'grabbing';
      if (canvas.setPointerCapture) {
        try {
          canvas.setPointerCapture(e.pointerId);
        } catch (_) {
          /* 忽略 */
        }
      }
    };

    this._onPointerMove = (e) => {
      if (this._dragging && this._lastPointer) {
        const dx = e.clientX - this._lastPointer.x;
        const dy = e.clientY - this._lastPointer.y;
        this._lastPointer = { x: e.clientX, y: e.clientY };
        this._dragMoved += Math.abs(dx) + Math.abs(dy);

        const spanLng = this.spanLng;
        const spanLat = this._spanLat();
        this.center.lng -= (dx / this.width) * spanLng;
        this.center.lat += (dy / this.height) * spanLat;
        this._clampCenter();
        this.render();
        return;
      }

      // 悬停高亮最近的地点
      const p = this._localPoint(e);
      const near = this._nearestLocation(p.x, p.y, 14);
      if (near !== this.hovered) {
        this.hovered = near;
        canvas.style.cursor = near ? 'pointer' : 'grab';
        this.render();
      }
    };

    this._onPointerUp = (e) => {
      if (!this._dragging) return;
      this._dragging = false;
      canvas.style.cursor = 'grab';

      // 位移很小才算"点击"，避免拖动结束时误触发选点
      if (this._dragMoved < 6) {
        const p = this._localPoint(e);
        const near = this._nearestLocation(p.x, p.y, 16);
        const point = near
          ? { lng: near.lng, lat: near.lat }
          : this.unproject(p.x, p.y);
        this.setMarker(point);
        if (near) this.selectedKey = near.name;
        this.render();
        this.onPick({ lng: point.lng, lat: point.lat, location: near || null });
      }
    };

    this._onWheel = (e) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1.12 : 1 / 1.12;
      this._zoomAt(e.clientX, e.clientY, factor);
    };

    // 双指缩放
    this._onTouchStart = (e) => {
      if (e.touches.length === 2) {
        this._pinchStart = {
          dist: this._touchDistance(e.touches),
          spanLng: this.spanLng,
        };
      }
    };
    this._onTouchMove = (e) => {
      if (e.touches.length === 2 && this._pinchStart) {
        e.preventDefault();
        const dist = this._touchDistance(e.touches);
        const ratio = this._pinchStart.dist / Math.max(dist, 1);
        this.spanLng = this._clampSpan(this._pinchStart.spanLng * ratio);
        this.render();
      }
    };
    this._onTouchEnd = (e) => {
      if (e.touches.length < 2) this._pinchStart = null;
    };

    canvas.addEventListener('pointerdown', this._onPointerDown);
    canvas.addEventListener('pointermove', this._onPointerMove);
    canvas.addEventListener('pointerup', this._onPointerUp);
    canvas.addEventListener('pointercancel', this._onPointerUp);
    canvas.addEventListener('pointerleave', () => {
      if (this.hovered) {
        this.hovered = null;
        this.render();
      }
    });
    canvas.addEventListener('wheel', this._onWheel, { passive: false });
    canvas.addEventListener('touchstart', this._onTouchStart, { passive: true });
    canvas.addEventListener('touchmove', this._onTouchMove, { passive: false });
    canvas.addEventListener('touchend', this._onTouchEnd, { passive: true });
  }

  _touchDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  _zoomAt(clientX, clientY, factor) {
    const rect = this.canvas.getBoundingClientRect();
    const before = this.unproject(clientX - rect.left, clientY - rect.top);
    this.spanLng = this._clampSpan(this.spanLng * factor);
    const after = this.unproject(clientX - rect.left, clientY - rect.top);
    // 让光标下的地理点保持不动
    this.center.lng += before.lng - after.lng;
    this.center.lat += before.lat - after.lat;
    this._clampCenter();
    this.render();
  }

  _clampSpan(span) {
    return Math.max(VIEW_LIMITS.minSpanLng, Math.min(VIEW_LIMITS.maxSpanLng, span));
  }

  _clampCenter() {
    this.center.lng = Math.max(VIEW_LIMITS.minLng, Math.min(VIEW_LIMITS.maxLng, this.center.lng));
    this.center.lat = Math.max(VIEW_LIMITS.minLat, Math.min(VIEW_LIMITS.maxLat, this.center.lat));
  }

  _nearestLocation(x, y, maxDistance) {
    let best = null;
    let bestDist = maxDistance;
    for (const loc of this.locations) {
      const p = this.project(loc.lng, loc.lat);
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bestDist) {
        bestDist = d;
        best = loc;
      }
    }
    return best;
  }

  /* ------------------------------------------------------------------ *
   * 对外接口
   * ------------------------------------------------------------------ */

  /** 设置当前位置标记 */
  setMarker(point) {
    this.marker = point ? { lng: point.lng, lat: point.lat } : null;
    this.render();
  }

  /** 移动中心（可选同时设置标记），首屏进入某个地点时用 */
  setCenter(lng, lat, options = {}) {
    this.center = { lng, lat };
    this._clampCenter();
    if (options.spanLng) this.spanLng = this._clampSpan(options.spanLng);
    if (options.marker) this.marker = { lng, lat };
    if (options.selectedKey !== undefined) this.selectedKey = options.selectedKey;
    this.render();
  }

  /** 高亮某个已知地点（点卡片时联动） */
  highlightLocation(name) {
    this.selectedKey = name;
    this.render();
  }

  refresh() {
    this.render();
  }

  /* ------------------------------------------------------------------ *
   * 绘制
   * ------------------------------------------------------------------ */

  render() {
    if (this.destroyed) return;
    if (this._raf) return; // 同一帧内多次调用只画一次

    this._raf = requestAnimationFrame(() => {
      this._raf = null;
      this._draw();
    });
  }

  _draw() {
    if (!this.ctx) return;
    this._syncSize();

    const ctx = this.ctx;
    const W = this.width;
    const H = this.height;

    ctx.clearRect(0, 0, W, H);

    // 1. 海洋底色（渐变，让画面有纵深）
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0b2239');
    bg.addColorStop(1, '#071726');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    this._drawGraticule(ctx, W, H);
    this._drawTerrainZones(ctx);
    this._drawLocations(ctx);
    this._drawMarker(ctx);
    this._drawLegend(ctx, W, H);
  }

  _drawGraticule(ctx, W, H) {
    // 根据缩放自动选择网格密度，避免放大后线条过密
    const step = this.spanLng > 90 ? 30 : this.spanLng > 40 ? 10 : this.spanLng > 15 ? 5 : 1;

    ctx.save();
    ctx.strokeStyle = 'rgba(120,170,210,.14)';
    ctx.lineWidth = 1;
    ctx.fillStyle = 'rgba(150,190,220,.45)';
    ctx.font = '10px -apple-system, Arial, sans-serif';

    const topLeft = this.unproject(0, 0);
    const bottomRight = this.unproject(W, H);

    const startLng = Math.ceil(topLeft.lng / step) * step;
    for (let lng = startLng; lng <= bottomRight.lng; lng += step) {
      const { x } = this.project(lng, 0);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
      if (step >= 5) ctx.fillText(lng.toFixed(0) + '°', x + 3, 14);
    }

    const startLat = Math.ceil(bottomRight.lat / step) * step;
    for (let lat = startLat; lat <= topLeft.lat; lat += step) {
      const { y } = this.project(0, lat);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
      if (step >= 5) ctx.fillText(lat.toFixed(0) + '°', 4, y - 3);
    }
    ctx.restore();
  }

  /** 每个已知地点周围铺一块柔和的地形色斑，形成"地形热区" */
  _drawTerrainZones(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    for (const loc of this.locations) {
      const color = TERRAIN_COLORS[loc.terrainType] || TERRAIN_COLORS.plain;
      const p = this.project(loc.lng, loc.lat);

      // 半径按地理尺度换算，缩放时同步变化
      const radiusDeg = 2.2;
      const radius = Math.max(
        14,
        (radiusDeg / this.spanLng) * this.width
      );

      if (
        p.x < -radius * 2 ||
        p.x > this.width + radius * 2 ||
        p.y < -radius * 2 ||
        p.y > this.height + radius * 2
      ) {
        continue;
      }

      const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
      gradient.addColorStop(0, this._withAlpha(color, 0.5));
      gradient.addColorStop(0.55, this._withAlpha(color, 0.22));
      gradient.addColorStop(1, this._withAlpha(color, 0));
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  _drawLocations(ctx) {
    ctx.save();
    ctx.font = '11px -apple-system, Arial, sans-serif';
    ctx.textAlign = 'center';

    for (const loc of this.locations) {
      const p = this.project(loc.lng, loc.lat);
      if (p.x < -40 || p.x > this.width + 40 || p.y < -40 || p.y > this.height + 40) continue;

      const color = TERRAIN_COLORS[loc.terrainType] || TERRAIN_COLORS.plain;
      const isHovered = this.hovered && this.hovered.name === loc.name;
      const isSelected = this.selectedKey && this.selectedKey === loc.name;
      const r = isSelected ? 5.5 : isHovered ? 5 : 3.6;

      // 光晕
      if (isSelected || isHovered) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, r + 5, 0, Math.PI * 2);
        ctx.fillStyle = this._withAlpha(color, 0.28);
        ctx.fill();
      }

      // 圆点
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = 'rgba(255,255,255,.85)';
      ctx.stroke();

      // 名字：只在够放大或高亮时显示，避免文字糊成一片
      if (isSelected || isHovered || this.spanLng < 26) {
        const text = loc.name;
        ctx.font = isSelected ? 'bold 11px -apple-system, Arial, sans-serif' : '11px -apple-system, Arial, sans-serif';
        const padding = 3;
        const textWidth = ctx.measureText(text).width;
        const boxY = p.y - r - 16;

        ctx.fillStyle = 'rgba(4,14,24,.72)';
        ctx.beginPath();
        this._roundRect(ctx, p.x - textWidth / 2 - padding, boxY - 10, textWidth + padding * 2, 14, 3);
        ctx.fill();

        ctx.fillStyle = isSelected ? '#ffffff' : 'rgba(225,238,248,.9)';
        ctx.fillText(text, p.x, boxY);
      }
    }
    ctx.restore();
  }

  _drawMarker(ctx) {
    if (!this.marker) return;
    const p = this.project(this.marker.lng, this.marker.lat);
    if (p.x < -30 || p.x > this.width + 30 || p.y < -30 || p.y > this.height + 40) return;

    ctx.save();

    // 落点的脉冲圈
    ctx.beginPath();
    ctx.arc(p.x, p.y, 13, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,82,82,.18)';
    ctx.fill();

    // 定位针
    const pinH = 20;
    const pinW = 13;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x - pinW / 2, p.y - pinH);
    ctx.quadraticCurveTo(p.x, p.y - pinH - 7, p.x + pinW / 2, p.y - pinH);
    ctx.closePath();
    ctx.fillStyle = '#ff5252';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.9)';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(p.x, p.y - pinH - 2, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();

    ctx.restore();
  }

  _drawLegend(ctx, W, H) {
    const entries = [
      ['mountain', '山脉'],
      ['water', '水面'],
      ['plain', '平原'],
      ['forest', '森林'],
      ['valley', '峡谷'],
      ['ocean', '深海'],
    ];

    ctx.save();
    ctx.font = '10px -apple-system, Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    // 右上角竖排图例
    const boxW = 54;
    const rowH = 14;
    const boxH = entries.length * rowH + 10;
    const x = W - boxW - 8;
    const y = 8;

    ctx.fillStyle = 'rgba(4,14,24,.62)';
    ctx.beginPath();
    this._roundRect(ctx, x, y, boxW, boxH, 5);
    ctx.fill();

    entries.forEach(([id, label], i) => {
      const cy = y + 9 + i * rowH;
      ctx.beginPath();
      ctx.arc(x + 9, cy, 3.2, 0, Math.PI * 2);
      ctx.fillStyle = TERRAIN_COLORS[id];
      ctx.fill();
      ctx.fillStyle = 'rgba(225,238,248,.88)';
      ctx.fillText(label, x + 17, cy + 0.5);
    });

    ctx.restore();
  }

  /* ------------------------------------------------------------------ *
   * 小工具
   * ------------------------------------------------------------------ */

  _withAlpha(hex, alpha) {
    const value = hex.replace('#', '');
    const r = parseInt(value.slice(0, 2), 16);
    const g = parseInt(value.slice(2, 4), 16);
    const b = parseInt(value.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  _roundRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  /* ------------------------------------------------------------------ *
   * 销毁
   * ------------------------------------------------------------------ */

  destroy() {
    this.destroyed = true;
    if (this._raf) cancelAnimationFrame(this._raf);

    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    } else {
      window.removeEventListener('resize', this._onResize);
    }

    const canvas = this.canvas;
    if (canvas) {
      canvas.removeEventListener('pointerdown', this._onPointerDown);
      canvas.removeEventListener('pointermove', this._onPointerMove);
      canvas.removeEventListener('pointerup', this._onPointerUp);
      canvas.removeEventListener('pointercancel', this._onPointerUp);
      canvas.removeEventListener('wheel', this._onWheel);
      canvas.removeEventListener('touchstart', this._onTouchStart);
      canvas.removeEventListener('touchmove', this._onTouchMove);
      canvas.removeEventListener('touchend', this._onTouchEnd);
      canvas.remove();
    }
    if (this.hint) this.hint.remove();
    if (this.badge) this.badge.remove();

    this.canvas = null;
    this.ctx = null;
  }
}

export default MockMap;
