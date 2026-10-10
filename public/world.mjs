/* 小区地图与角色：背景是原创SVG（与导入页同一画风），角色来自 Kenney Toon Characters（CC0）。 */
import { building, tree, stars, xiaodi } from './world-art.mjs';
import { places } from './activities.mjs';

export const CHARACTERS = { maleAdventurer: '男巡查员', femaleAdventurer: '女巡查员' };
export function sprite(character, pose) { return `/assets/kenney/characters/${character}_${pose}.png`; }
export function pickCharacter(id) {
  try { const saved = localStorage.getItem('lesson5-character'); if (CHARACTERS[saved]) return saved; } catch {}
  let h = 0; for (const ch of String(id || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 2 ? 'femaleAdventurer' : 'maleAdventurer';
}
export function xiaodiSvg(size = 64) { return `<svg viewBox="0 0 80 100" width="${size}" height="${size * 1.25}" aria-hidden="true">${xiaodi(0, 0, 1)}</svg>`; }

/** 地图背景（1600×900，夜晚小区）。 */
export function mapBackground() {
  let b = '';
  [[0, 300, 7], [210, 240, 11], [390, 330, 5], [600, 210, 9], [760, 300, 13], [980, 260, 3], [1180, 340, 15], [1380, 280, 17]].forEach(([x, h, s]) => { b += building(x, 520, 190, h, s, { lit: .4 }); });
  let t = '';
  [[80, 600, .5], [380, 860, .6], [700, 610, .45], [1040, 880, .55], [1350, 600, .5], [1540, 860, .6]].forEach(([x, y, s], i) => { t += tree(x, y, s, true, i); });
  return `<svg class="map-bg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs><linearGradient id="msky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#081227"/><stop offset=".6" stop-color="#173253"/></linearGradient>
    <radialGradient id="lampglow"><stop offset="0" stop-color="#ffd88a" stop-opacity=".5"/><stop offset="1" stop-color="#ffd88a" stop-opacity="0"/></radialGradient></defs>
    <rect width="1600" height="900" fill="url(#msky)"/>${stars(90, 5, 1600, 380)}<circle cx="1440" cy="110" r="52" fill="#fff4c9"/><circle cx="1440" cy="110" r="120" fill="#fff4c9" opacity=".08"/>
    ${b}<rect y="520" width="1600" height="380" fill="#22374a"/><rect y="520" width="1600" height="16" fill="#2f4a60"/>
    ${t}${[300, 820, 1260].map(x => `<g><rect x="${x}" y="560" width="6" height="110" fill="#5b6870"/><circle cx="${x + 3}" cy="556" r="10" fill="#ffd88a"/><circle cx="${x + 3}" cy="580" r="90" fill="url(#lampglow)"/></g>`).join('')}
  </svg>`;
}
/** 连接各地点的小路（与地点按钮使用同一组百分比坐标）。 */
export function mapPath(order) {
  const pts = order.map(k => places[k]);
  let d = `M${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i], mx = (a.x + b.x) / 2; d += ` C${mx} ${a.y} ${mx} ${b.y} ${b.x} ${b.y}`; }
  return `<svg class="map-path" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="${d}" class="path-base"/><path d="${d}" class="path-dash"/></svg>`;
}
const icons = {
  flow: `<rect x="44" y="40" width="8" height="52" fill="#9fb3bd"/><rect x="18" y="10" width="60" height="38" rx="7" fill="#0d1014" stroke="#9fb3bd" stroke-width="3"/><text x="48" y="36" text-anchor="middle" fill="#ff5b4d" font-size="17" font-weight="800">62dB</text>`,
  wave: `<rect x="14" y="16" width="68" height="60" rx="8" fill="#0d1014" stroke="#9fb3bd" stroke-width="3"/><path d="M20 52 q8 -26 14 0 t14 0 t14 -10 t14 4" fill="none" stroke="#5fd3ff" stroke-width="4"/><g fill="#ffd36b"><circle cx="20" cy="52" r="3"/><circle cx="48" cy="52" r="3"/><circle cx="76" cy="46" r="3"/></g>`,
  life: `<rect x="10" y="12" width="76" height="70" fill="#e8d9c4" rx="6"/><rect x="18" y="20" width="34" height="34" fill="#bfe3f5" stroke="#8a6b4f" stroke-width="3"/><rect x="18" y="20" width="34" height="16" fill="#d98d5f"/><path d="M58 50 h20 l3 26 h-26z" fill="#d6e4ea" stroke="#6b8794" stroke-width="2"/>`,
  threshold: `<rect x="10" y="14" width="76" height="56" rx="8" fill="#0d1014" stroke="#9fb3bd" stroke-width="3"/><path d="M16 58 q10 -30 18 -6 t16 -22 t18 18 t12 -6" fill="none" stroke="#5fd3ff" stroke-width="3"/><line x1="14" x2="82" y1="38" y2="38" stroke="#ff3b30" stroke-width="3" stroke-dasharray="6 4"/><circle cx="76" cy="80" r="6" fill="#ff3b30"/>`,
  design: `<rect x="14" y="62" width="68" height="22" rx="4" fill="#8a5a3b"/><rect x="46" y="30" width="5" height="34" fill="#3f8a4f"/><ellipse cx="36" cy="42" rx="14" ry="7" fill="#4fbf6a"/><ellipse cx="62" cy="36" rx="14" ry="7" fill="#4fbf6a"/><path d="M76 10 q8 12 0 16 q-8 -4 0 -16z" fill="#5fd3ff"/>`,
  quiz: `<rect x="20" y="12" width="56" height="72" rx="6" fill="#fff"/><rect x="34" y="6" width="28" height="12" rx="4" fill="#9fb3bd"/><g stroke="#277f79" stroke-width="4"><line x1="30" y1="34" x2="66" y2="34"/><line x1="30" y1="48" x2="66" y2="48"/><line x1="30" y1="62" x2="54" y2="62"/></g><path d="M62 66 l5 10 11 1 -8 7 2 11 -10 -6 -10 6 2 -11 -8 -7 11 -1z" fill="#ffd36b"/>`
};
export function placeIcon(key) { return `<svg viewBox="0 0 96 96" aria-hidden="true">${icons[key]}</svg>`; }
