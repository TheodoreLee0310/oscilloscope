/**
 * 离线地形示意图
 * ---------------------------------------------------------------
 * VR 寻波原本用 Unsplash 的外链图片当"地形实景图"：
 *   - 需要联网，离线必然空白；
 *   - 其中一张还是已经停止服务的 source.unsplash.com（必定失败）。
 *
 * 这里用纯内联 SVG 生成示意图，`img.src` 直接可用、零网络请求：
 *   <img :src="terrainImage('mountain')">
 *
 * 说明：这些是"示意插画"，不是真实照片，用于离线演示不会出现破图。
 */

/** 各地形的配色与构图参数 */
const PALETTE = {
  mountain: { sky: ['#0f2027', '#2c5364'], accent: '#cfd8dc', detail: '#8d6e63' },
  water: { sky: ['#0b3d5c', '#1e88e5'], accent: '#b3e5fc', detail: '#1565c0' },
  plain: { sky: ['#1b3a2a', '#4caf50'], accent: '#c5e1a5', detail: '#7cb342' },
  forest: { sky: ['#0d2818', '#2e7d32'], accent: '#a5d6a7', detail: '#1b5e20' },
  valley: { sky: ['#3e2723', '#a1887f'], accent: '#ffccbc', detail: '#d84315' },
  ocean: { sky: ['#001b3d', '#0d47a1'], accent: '#90caf9', detail: '#002171' },
};

const W = 640;
const H = 360;

/** 山脊折线 → 三角形山峰 */
function mountains(colors) {
  return `
    <polygon points="0,360 140,150 240,360" fill="${colors.detail}" opacity=".95"/>
    <polygon points="130,360 300,90 470,360" fill="${colors.detail}"/>
    <polygon points="380,360 520,170 640,360" fill="${colors.detail}" opacity=".9"/>
    <polygon points="300,90 268,150 332,150" fill="${colors.accent}"/>
    <polygon points="140,150 118,190 162,190" fill="${colors.accent}" opacity=".85"/>
    <circle cx="540" cy="70" r="26" fill="${colors.accent}" opacity=".55"/>
  `;
}

function water(colors) {
  let waves = '';
  for (let i = 0; i < 6; i += 1) {
    const y = 150 + i * 34;
    waves += `<path d="M0 ${y} q 40 -12 80 0 t 80 0 t 80 0 t 80 0 t 80 0 t 80 0 t 80 0"
      fill="none" stroke="${colors.accent}" stroke-width="${2.5 - i * 0.25}"
      opacity="${0.55 - i * 0.06}"/>`;
  }
  return `
    <circle cx="520" cy="80" r="34" fill="${colors.accent}" opacity=".5"/>
    <rect x="0" y="130" width="640" height="230" fill="${colors.detail}" opacity=".45"/>
    ${waves}
  `;
}

function plain(colors) {
  return `
    <circle cx="120" cy="80" r="28" fill="${colors.accent}" opacity=".5"/>
    <ellipse cx="180" cy="330" rx="300" ry="110" fill="${colors.detail}" opacity=".75"/>
    <ellipse cx="500" cy="345" rx="260" ry="95" fill="${colors.detail}" opacity=".55"/>
    <path d="M0 250 q 160 -40 320 0 t 320 0 v 110 H0 Z" fill="${colors.detail}" opacity=".8"/>
    <path d="M40 236 h 120 M32 250 h 96" stroke="${colors.accent}" stroke-width="2" opacity=".5"/>
  `;
}

function forest(colors) {
  const trees = [
    [90, 300, 52],
    [170, 318, 40],
    [250, 296, 58],
    [340, 320, 44],
    [430, 300, 54],
    [520, 322, 38],
    [590, 306, 46],
  ]
    .map(
      ([x, base, h]) => `
      <polygon points="${x},${base - h} ${x - h * 0.42},${base} ${x + h * 0.42},${base}"
        fill="${colors.detail}"/>
      <polygon points="${x},${base - h - 12} ${x - h * 0.3},${base - h * 0.55} ${x + h * 0.3},${base - h * 0.55}"
        fill="${colors.detail}" opacity=".9"/>`
    )
    .join('');
  return `
    <rect x="0" y="290" width="640" height="70" fill="${colors.detail}" opacity=".6"/>
    ${trees}
  `;
}

function valley(colors) {
  return `
    <polygon points="0,0 190,0 120,360 0,360" fill="${colors.detail}" opacity=".9"/>
    <polygon points="640,0 450,0 520,360 640,360" fill="${colors.detail}" opacity=".9"/>
    <polygon points="190,0 250,0 200,360 120,360" fill="${colors.accent}" opacity=".25"/>
    <polygon points="450,0 390,0 440,360 520,360" fill="${colors.accent}" opacity=".25"/>
    <path d="M280 360 q 40 -90 20 -180 t 60 -180" fill="none" stroke="${colors.accent}"
      stroke-width="4" opacity=".45"/>
  `;
}

function ocean(colors) {
  let waves = '';
  for (let i = 0; i < 7; i += 1) {
    const y = 60 + i * 44;
    waves += `<path d="M0 ${y} q 50 16 100 0 t 100 0 t 100 0 t 100 0 t 100 0 t 100 0"
      fill="none" stroke="${colors.accent}" stroke-width="2" opacity="${0.4 - i * 0.04}"/>`;
  }
  let bubbles = '';
  for (let i = 0; i < 14; i += 1) {
    const x = 30 + ((i * 97) % 580);
    const y = 120 + ((i * 53) % 220);
    const r = 2 + (i % 3) * 2;
    bubbles += `<circle cx="${x}" cy="${y}" r="${r}" fill="${colors.accent}" opacity=".25"/>`;
  }
  return `${waves}${bubbles}`;
}

const SCENES = { mountain: mountains, water, plain, forest, valley, ocean };

/**
 * 生成某个地形的内联 SVG 示意图
 * @param {'mountain'|'water'|'plain'|'forest'|'valley'|'ocean'} terrainId
 * @returns {string} 可直接赋给 img.src 的 data URI
 */
export function terrainImage(terrainId) {
  const id = SCENES[terrainId] ? terrainId : 'plain';
  const colors = PALETTE[id];
  const [skyTop, skyBottom] = colors.sky;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
    <defs>
      <linearGradient id="sky-${id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${skyTop}"/>
        <stop offset="100%" stop-color="${skyBottom}"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#sky-${id})"/>
    ${SCENES[id](colors)}
  </svg>`;

  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.replace(/\s+/g, ' ').trim());
}

/** 一次性拿到全部 6 种地形示意图，可直接替换 vrwave.terrainImages */
export function allTerrainImages() {
  return {
    mountain: terrainImage('mountain'),
    water: terrainImage('water'),
    plain: terrainImage('plain'),
    forest: terrainImage('forest'),
    valley: terrainImage('valley'),
    ocean: terrainImage('ocean'),
  };
}

export default { terrainImage, allTerrainImages };
