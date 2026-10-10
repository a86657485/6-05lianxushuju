/* 夜晚小区世界的矢量插画（与导入页同一套绘制函数，原创SVG）。 */

  function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
  const FONT = "'Noto Sans CJK SC','PingFang SC','Microsoft YaHei',sans-serif";
  function xiaodi(x, y, s = 1, opts = {}) {
    const eye = opts.eye || '#7fe6dc', wave = opts.wave || 0;
    return `<g transform="translate(${x} ${y}) scale(${s})"><ellipse cx="40" cy="94" rx="30" ry="5" fill="#000" opacity=".18"/><circle cx="40" cy="8" r="5" fill="${opts.lamp || '#3fc1b5'}"/><rect x="38" y="10" width="4" height="8" fill="#9fb3bd"/>
  <rect x="14" y="18" width="52" height="38" rx="14" fill="#fff" stroke="#c9d8de" stroke-width="2"/><rect x="21" y="25" width="38" height="24" rx="9" fill="#173d50"/><circle cx="32" cy="37" r="5" fill="${eye}"/><circle cx="48" cy="37" r="5" fill="${eye}"/>
  <rect x="22" y="58" width="36" height="22" rx="8" fill="#fff" stroke="#c9d8de" stroke-width="2"/><rect x="8" y="60" width="10" height="16" rx="5" fill="#3fc1b5"/><g transform="rotate(${-wave} 67 62)"><rect x="62" y="60" width="10" height="16" rx="5" fill="#3fc1b5"/></g><circle cx="30" cy="84" r="5" fill="#607984"/><circle cx="50" cy="84" r="5" fill="#607984"/></g>`;
  }
  function stars(n, seed, w, h) { const r = rng(seed); let s = ''; for (let i = 0; i < n; i++) { const x = r() * w, y = r() * h, rr = r() * 1.8 + .5; s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rr.toFixed(2)}" fill="#fff" opacity="${(0.35 + r() * 0.6).toFixed(2)}"/>`; } return s; }
  function building(x, base, w, h, seed, opts = {}) {
    const r = rng(seed), lit = opts.lit ?? 0.45, col = opts.color || '#1b3550', cols = Math.max(2, Math.floor(w / 46)), rows = Math.max(2, Math.floor(h / 54));
    let s = `<rect x="${x}" y="${base - h}" width="${w}" height="${h}" fill="${col}"/><rect x="${x - 6}" y="${base - h - 10}" width="${w + 12}" height="12" fill="${opts.roof || '#142a40'}"/>`;
    const gx = w / cols, gy = (h - 30) / rows;
    for (let c = 0; c < cols; c++) for (let rr = 0; rr < rows; rr++) {
      const on = r() < lit, wx = x + c * gx + gx * .22, wy = base - h + 22 + rr * gy;
      s += `<rect x="${wx.toFixed(1)}" y="${wy.toFixed(1)}" width="${(gx * .56).toFixed(1)}" height="${(gy * .52).toFixed(1)}" rx="3" fill="${on ? (r() < .7 ? '#ffd88a' : '#ffe9b8') : '#0f2236'}" opacity="${on ? .95 : .9}"/>`;
    }
    return s;
  }
  function tree(x, base, s = 1, night = true, seed = 1) {
    const c1 = night ? '#173a3a' : '#3f9a63', c2 = night ? '#1f4a47' : '#58b27a', trunk = night ? '#2a2a2a' : '#7a5a3c';
    return `<g transform="translate(${x} ${base}) scale(${s})"><rect x="-8" y="-90" width="16" height="90" fill="${trunk}"/><circle cx="0" cy="-130" r="62" fill="${c1}"/><circle cx="-40" cy="-100" r="44" fill="${c2}"/><circle cx="42" cy="-104" r="46" fill="${c1}"/><circle cx="8" cy="-168" r="40" fill="${c2}"/></g>`;
  }
  /** 简化人物：pose 0..1 控制摆臂；color 衣服颜色 */
  function person(x, base, s = 1, pose = 0, color = '#e2725b', opts = {}) {
    const a = Math.sin(pose * Math.PI * 2), skin = opts.skin || '#f1c9a5', hair = opts.hair || '#2b2b2b';
    const arm1 = -60 + a * 55, arm2 = -120 - a * 55, legA = a * 12;
    const lw = 9;
    const limb = (x1, y1, ang, len, col) => { const r = ang * Math.PI / 180; return `<line x1="${x1}" y1="${y1}" x2="${(x1 + Math.cos(r) * len).toFixed(1)}" y2="${(y1 + Math.sin(r) * len).toFixed(1)}" stroke="${col}" stroke-width="${lw}" stroke-linecap="round"/>`; };
    const bob = Math.abs(a) * 4;
    return `<g transform="translate(${x} ${base - bob}) scale(${s})">${limb(-6, -60, 90 + legA, 60, '#30384a')}${limb(6, -60, 90 - legA, 60, '#30384a')}
      <rect x="-17" y="-122" width="34" height="66" rx="13" fill="${color}"/>${limb(-13, -112, 180 + (arm2 + 180) * .5 + 90, 46, color)}${limb(13, -112, arm1, 46, color)}
      <circle cx="0" cy="-142" r="17" fill="${skin}"/><path d="M-17 -146 q17 -22 34 0 q-4 -16 -17 -16 q-13 0 -17 16z" fill="${hair}"/>${opts.fan ? `<path d="M${(13 + Math.cos(arm1 * Math.PI / 180) * 46).toFixed(1)} ${(-112 + Math.sin(arm1 * Math.PI / 180) * 46).toFixed(1)} l26 -22 a30 30 0 0 1 10 34z" fill="#ff5d73" opacity=".9"/>` : ''}</g>`;
  }
  function speaker(x, base, s = 1, pulse = 0) {
    const k = 1 + pulse * .06;
    return `<g transform="translate(${x} ${base}) scale(${s})"><rect x="-45" y="-150" width="90" height="150" rx="10" fill="#222833" stroke="#444c5c" stroke-width="3"/><circle cx="0" cy="-48" r="${30 * k}" fill="#11151c" stroke="#5a6375" stroke-width="5"/><circle cx="0" cy="-48" r="10" fill="#5a6375"/><circle cx="0" cy="-115" r="${16 * k}" fill="#11151c" stroke="#5a6375" stroke-width="4"/><circle cx="30" cy="-140" r="4" fill="#4cd964"/></g>`;
  }
  function notes(x, y, t, n = 5, color = '#ffd36b') {
    let s = '';
    for (let i = 0; i < n; i++) {
      const p = ((t * 0.45 + i / n) % 1), nx = x + p * 260 + Math.sin(p * 7 + i) * 26, ny = y - p * 260, op = (1 - p) * .95, sc = 1 + p * .6;
      s += `<g transform="translate(${nx.toFixed(1)} ${ny.toFixed(1)}) scale(${sc.toFixed(2)})" opacity="${op.toFixed(2)}"><circle cx="0" cy="0" r="9" fill="${color}"/><rect x="7" y="-34" width="4" height="34" fill="${color}"/>${i % 2 ? `<rect x="7" y="-34" width="18" height="6" fill="${color}"/>` : ''}</g>`;
    }
    return s;
  }
  function sevenSeg(value, opts = {}) { return value; }
  /** 噪声显示屏：value 为数字或字符串；alert 时外框泛红 */
  function noiseScreen(x, y, s = 1, value = '--.-', opts = {}) {
    const alert = !!opts.alert, digit = alert ? '#ff3b30' : (opts.color || '#ff5b4d'), w = 420, h = 250;
    const trace = opts.trace || [], tw = 360, th = 70;
    let path = '';
    if (trace.length > 1) {
      const lo = opts.lo ?? 30, hi = opts.hi ?? 80;
      path = trace.map((v, i) => `${i ? 'L' : 'M'}${(30 + i / (opts.traceLen || trace.length - 1) * tw).toFixed(1)} ${(160 + th - (v - lo) / (hi - lo) * th).toFixed(1)}`).join(' ');
    }
    const lineY = opts.line != null ? (160 + th - (opts.line - (opts.lo ?? 30)) / ((opts.hi ?? 80) - (opts.lo ?? 30)) * th) : null;
    return `<g transform="translate(${x} ${y}) scale(${s})">
      ${opts.pole === false ? '' : `<rect x="${w / 2 - 12}" y="${h}" width="24" height="${opts.poleH || 420}" fill="#7d8c96"/><rect x="${w / 2 - 50}" y="${h + (opts.poleH || 420) - 14}" width="100" height="14" rx="4" fill="#5b6870"/>`}
      ${alert ? `<rect x="-22" y="-22" width="${w + 44}" height="${h + 44}" rx="30" fill="#ff3b30" opacity=".35"/>` : ''}
      <rect x="0" y="0" width="${w}" height="${h}" rx="18" fill="#0d1014" stroke="${alert ? '#ff6b5e' : '#9fb3bd'}" stroke-width="6"/>
      <text x="26" y="40" fill="#9fd8ff" font-family="${FONT}" font-size="24" font-weight="700">${opts.title || '噪声监测'}</text>
      <circle cx="${w - 34}" cy="32" r="10" fill="${alert ? '#ff3b30' : '#4cd964'}"/>
      <text x="${w - 92}" y="134" fill="${digit}" font-family="'DejaVu Sans Mono',Consolas,monospace" font-size="96" font-weight="700" text-anchor="end">${value}</text>
      <text x="${w - 84}" y="134" fill="${digit}" font-family="${FONT}" font-size="34" font-weight="700">dB</text>
      ${path || lineY != null ? `<rect x="30" y="160" width="${tw}" height="${th}" fill="#151b22"/>` : ''}
      ${lineY != null ? `<line x1="30" x2="${30 + tw}" y1="${lineY.toFixed(1)}" y2="${lineY.toFixed(1)}" stroke="#ff3b30" stroke-width="3" stroke-dasharray="10 7"/>` : ''}
      ${path ? `<path d="${path}" fill="none" stroke="#5fd3ff" stroke-width="3.5" stroke-linejoin="round"/>` : ''}
    </g>`;
  }
  function waveGlow(w, h, seed = 3, opts = {}) {
    const N = 240, mid = opts.mid ?? h / 2, amp = opts.amp ?? h * .28;
    const f = i => { const x = i / N; return mid - amp * (0.55 * Math.sin(x * 19 + seed) * Math.exp(-((x - .55) ** 2) / .08) + 0.25 * Math.sin(x * 47 + seed * 2) * (0.4 + x * .6) + 0.2 * Math.sin(x * 7)); };
    const d = Array.from({ length: N + 1 }, (_, i) => `${i ? 'L' : 'M'}${(i / N * w).toFixed(1)} ${f(i).toFixed(1)}`).join(' ');
    return d;
  }
  
export { rng, FONT, xiaodi, stars, building, tree, person, speaker, notes, noiseScreen };
