import '../controllers/switcher.css';
// 渲染右上角切换控件
// current: 'external' | 'internal'
// options: { tile?: string, icon?: string, gap?: string, extra?: string }
export function renderSwitcher(current, options = {}){
  const nav = document.createElement('nav');
  nav.className = 'switcher';
  nav.setAttribute('role', 'tablist');
  nav.setAttribute('aria-label', '页面切换');

  // 允许通过 CSS 变量自定义尺寸/间距
  if (options.tile)  nav.style.setProperty('--tile', options.tile);
  if (options.icon)  nav.style.setProperty('--icon', options.icon);
  if (options.gap)   nav.style.setProperty('--switcher-gap', options.gap);
  if (options.extra) nav.style.setProperty('--switcher-extra', options.extra);

  const external = document.createElement('a');
  external.className = 'tile left';
  external.id = 'tab-external';
  external.setAttribute('role', 'tab');
  external.setAttribute('href', 'index.html');
  external.setAttribute('title', '外部（面板/示波器）');
  external.setAttribute('aria-selected', String(current === 'external'));
  external.innerHTML = '<span class="sr-only">外部</span>'+
    '<svg viewBox="0 0 24 24" aria-hidden="true">'+
    '  <rect class="stroke" x="3" y="4" width="18" height="14" rx="1.5"/>'+
    '  <rect class="stroke" x="5" y="6" width="10" height="8" rx="0.5"/>'+
    '  <circle class="stroke" cx="18" cy="9" r="1.3"/>'+
    '  <circle class="stroke" cx="18" cy="13" r="1.3"/>'+
    '</svg>';

  const internal = document.createElement('a');
  internal.className = 'tile right';
  internal.id = 'tab-internal';
  internal.setAttribute('role', 'tab');
  internal.setAttribute('href', 'internal.html');
  internal.setAttribute('title', '内部原理（波形/电路）');
  internal.setAttribute('aria-selected', String(current === 'internal'));
  internal.innerHTML = '<span class="sr-only">内部原理</span>'+
    '<svg viewBox="0 0 24 24" aria-hidden="true">'+
    '  <path class="stroke" d="M2 12c2-6 4 6 6 0s4 6 6 0 4 6 6 0"/>'+
    '  <circle class="dot" cx="19" cy="6" r="1.1"/>'+
    '</svg>';

  nav.appendChild(external);
  nav.appendChild(internal);
  document.body.appendChild(nav);
}

// 兼容：同时挂到 window 以避免历史调用报错
if (typeof window !== 'undefined') {
  window.renderSwitcher = renderSwitcher;
}




