/* 小递（沿用第4课角色设定：白色机身、青色关节、深色面屏、圆眼、顶部状态灯）与欢迎页插图，纯SVG。 */
export function xiaodiSvg(size = 72) {
  return `<svg viewBox="0 0 80 90" width="${size}" height="${size * 1.12}" role="img" aria-label="小递"><circle cx="40" cy="8" r="5" fill="#3fc1b5"/><rect x="38" y="10" width="4" height="8" fill="#9fb3bd"/>
  <rect x="14" y="18" width="52" height="38" rx="14" fill="#fff" stroke="#c9d8de" stroke-width="2"/><rect x="21" y="25" width="38" height="24" rx="9" fill="#173d50"/><circle cx="32" cy="37" r="5" fill="#7fe6dc"/><circle cx="48" cy="37" r="5" fill="#7fe6dc"/>
  <rect x="22" y="58" width="36" height="22" rx="8" fill="#fff" stroke="#c9d8de" stroke-width="2"/><rect x="8" y="60" width="10" height="16" rx="5" fill="#3fc1b5"/><rect x="62" y="60" width="10" height="16" rx="5" fill="#3fc1b5"/><circle cx="30" cy="84" r="5" fill="#607984"/><circle cx="50" cy="84" r="5" fill="#607984"/></svg>`;
}
export function welcomeArt() {
  const pts = Array.from({ length: 60 }, (_, i) => `${20 + i * 7},${120 - 30 * Math.sin(i / 5) - 18 * Math.sin(i / 2.1) * (i > 30 && i < 42 ? 1.6 : 0.4)}`).join(' ');
  return `<svg viewBox="0 0 460 220" role="img" aria-label="噪声曲线越过阈值线"><rect width="460" height="220" rx="22" fill="#fff"/>
  <line x1="20" x2="440" y1="88" y2="88" stroke="#d9534f" stroke-width="2" stroke-dasharray="6 5"/><text x="440" y="80" text-anchor="end" font-size="12" fill="#d9534f">阈值</text>
  <polyline points="${pts}" fill="none" stroke="#176e93" stroke-width="3" stroke-linejoin="round"/><g transform="translate(360 120)">${xiaodiSvg(70).replace('<svg', '<svg x="0" y="0"')}</g></svg>`;
}
