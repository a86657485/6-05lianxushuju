(function () {
  const A = window.Art, W = 1920, H = 1080;
  function svg(inner, defs = '') { return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><defs>${defs}</defs>${inner}</svg>`; }
  const nightDefs = `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1630"/><stop offset=".55" stop-color="#1d2f57"/><stop offset="1" stop-color="#3a3f6b"/></linearGradient>
    <radialGradient id="moon" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fffbe6"/><stop offset=".6" stop-color="#fff2c2"/><stop offset="1" stop-color="#fff2c2" stop-opacity="0"/></radialGradient>
    <radialGradient id="lamp" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffe7a3" stop-opacity=".75"/><stop offset="1" stop-color="#ffe7a3" stop-opacity="0"/></radialGradient>
    <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b4256"/><stop offset="1" stop-color="#262b3a"/></linearGradient>
    <radialGradient id="alertGlow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ff3b30" stop-opacity=".45"/><stop offset="1" stop-color="#ff3b30" stop-opacity="0"/></radialGradient>`;
  /** 夜晚小区广场：o = {t, level, trace, alert, dance(0..1), lit, screen:false, line} */
  function nightSquare(o = {}) {
    const t = o.t || 0, dance = o.dance ?? 1;
    let s = `<rect width="${W}" height="${H}" fill="url(#sky)"/>${A.stars(140, 7, W, 520)}<circle cx="1580" cy="150" r="140" fill="url(#moon)"/><circle cx="1580" cy="150" r="58" fill="#fff6d6"/>`;
    // 远景楼
    s += A.building(40, 760, 260, 470, 11, { color: '#16294a', lit: o.lit ?? .5 }) + A.building(330, 760, 220, 560, 12, { color: '#1a3154', lit: o.lit ?? .55 }) + A.building(1240, 760, 250, 520, 13, { color: '#172c4d', lit: o.lit ?? .5 }) + A.building(1520, 760, 330, 440, 14, { color: '#1b3356', lit: o.lit ?? .6 });
    s += `<rect x="0" y="740" width="${W}" height="${H - 740}" fill="url(#ground)"/><ellipse cx="960" cy="905" rx="720" ry="120" fill="#4a5168" opacity=".7"/>`;
    // 路灯
    for (const lx of [210, 1710]) s += `<circle cx="${lx}" cy="560" r="180" fill="url(#lamp)"/><rect x="${lx - 7}" y="560" width="14" height="260" fill="#59606f"/><rect x="${lx - 30}" y="548" width="60" height="18" rx="8" fill="#ffe7a3"/>`;
    s += A.tree(120, 860, 1.25, true) + A.tree(1810, 870, 1.35, true) + A.tree(620, 770, .8, true) + A.tree(1180, 770, .85, true);
    // 音箱与音符
    const beat = dance ? Math.max(0, Math.sin(t * Math.PI * 4)) : 0;
    s += A.speaker(560, 930, 1.05, beat);
    if (dance > .05) s += `<g opacity="${Math.min(1, dance).toFixed(2)}">${A.notes(600, 760, t, 6)}</g>`;
    // 跳舞的人
    const cols = ['#e2725b', '#f2a541', '#d9548d', '#5bb3e2', '#9a6fd6', '#59c18c', '#ef6f6c', '#f4c95d', '#6c8ef0'];
    const r = A.rng(5);
    for (let i = 0; i < 9; i++) {
      const row = i < 5 ? 0 : 1, x = row ? 820 + (i - 5) * 150 : 760 + i * 140, base = row ? 990 : 905, sc = row ? 1.12 : .95;
      const pose = dance ? (t * 1.0 + (i % 2) * .5) : .25 + r() * .02;
      s += A.person(x + (r() - .5) * 20, base, sc, dance ? pose : .25, cols[i], { fan: i % 3 === 0, hair: i % 4 === 1 ? '#6b6b6b' : '#2b2b2b' });
    }
    // 显示屏
    if (o.screen !== false) {
      if (o.alert) s += `<circle cx="1470" cy="470" r="330" fill="url(#alertGlow)"/>`;
      s += A.noiseScreen(1260, 330, 1, o.value ?? '--.-', { alert: o.alert, trace: o.trace, traceLen: o.traceLen, line: o.line, poleH: 400, title: '小区噪声监测' });
    }
    return svg(s, nightDefs);
  }
  /** 楼上窗口：写作业的同学捂住耳朵 */
  function window_(o = {}) {
    let s = `<rect width="${W}" height="${H}" fill="#1a2d4f"/>${A.stars(60, 3, W, 300)}`;
    s += `<rect x="260" y="120" width="1400" height="860" rx="20" fill="#f6e7c8"/><rect x="260" y="120" width="1400" height="860" rx="20" fill="none" stroke="#3d4a5c" stroke-width="30"/>`;
    s += `<rect x="310" y="170" width="620" height="420" fill="#13223d"/>${A.stars(30, 9, 600, 200).replace(/cx="/g, 'cx="3').replace(/<circle cx="3/g, '<circle transform="translate(330 180)" cx="')}`;
    s += `<g transform="translate(310 170)"><rect x="40" y="250" width="160" height="170" fill="#1f3a5e"/><rect x="230" y="200" width="150" height="220" fill="#23426a"/><rect x="420" y="270" width="180" height="150" fill="#1f3a5e"/>`;
    for (let i = 0; i < 4; i++) s += `<path d="M${120 + i * 120} ${170 - i * 10} q12 -30 0 -50" stroke="#ffd36b" stroke-width="7" fill="none" opacity=".85"/><circle cx="${112 + i * 120}" cy="${172 - i * 10}" r="10" fill="#ffd36b"/>`;
    s += `</g><line x1="620" y1="170" x2="620" y2="590" stroke="#3d4a5c" stroke-width="14"/><line x1="310" y1="380" x2="930" y2="380" stroke="#3d4a5c" stroke-width="14"/>`;
    // 钟
    s += `<g transform="translate(1380 300)"><circle r="110" fill="#fff" stroke="#3d4a5c" stroke-width="12"/>${Array.from({ length: 12 }, (_, i) => `<line x1="0" y1="-92" x2="0" y2="-78" stroke="#3d4a5c" stroke-width="6" transform="rotate(${i * 30})"/>`).join('')}<line x1="0" y1="0" x2="0" y2="-62" stroke="#173d50" stroke-width="12" stroke-linecap="round" transform="rotate(285)"/><line x1="0" y1="0" x2="0" y2="-88" stroke="#173d50" stroke-width="7" stroke-linecap="round" transform="rotate(180)"/><circle r="9" fill="#c0483a"/></g>`;
    // 桌子与学生
    s += `<rect x="260" y="740" width="1400" height="40" fill="#b07a4a"/><rect x="260" y="780" width="1400" height="200" fill="#8f5f37"/>`;
    s += `<g transform="translate(1000 760)"><rect x="-150" y="-260" width="300" height="270" rx="90" fill="#4f8fd6"/><circle cx="0" cy="-350" r="110" fill="#f1c9a5"/><path d="M-112 -360 q112 -150 224 0 q-20 -95 -112 -95 q-92 0 -112 95z" fill="#2b2b2b"/>
      <ellipse cx="-115" cy="-345" rx="34" ry="46" fill="#f1c9a5" stroke="#d9a982" stroke-width="5"/><ellipse cx="115" cy="-345" rx="34" ry="46" fill="#f1c9a5" stroke="#d9a982" stroke-width="5"/>
      <path d="M-140 -210 q-70 -40 -40 -110" stroke="#4f8fd6" stroke-width="44" fill="none" stroke-linecap="round"/><path d="M140 -210 q70 -40 40 -110" stroke="#4f8fd6" stroke-width="44" fill="none" stroke-linecap="round"/><circle cx="-122" cy="-340" r="36" fill="#f1c9a5" stroke="#d9a982" stroke-width="4"/><circle cx="122" cy="-340" r="36" fill="#f1c9a5" stroke="#d9a982" stroke-width="4"/>
      <path d="M-42 -362 q14 -14 28 0" stroke="#173d50" stroke-width="8" fill="none" stroke-linecap="round"/><path d="M14 -362 q14 -14 28 0" stroke="#173d50" stroke-width="8" fill="none" stroke-linecap="round"/><path d="M-30 -300 q30 -22 60 0" stroke="#a8473a" stroke-width="8" fill="none" stroke-linecap="round"/>
      <path d="M-30 -440 l-20 -30 M0 -450 l0 -38 M30 -440 l20 -30" stroke="#ff6b5e" stroke-width="8" stroke-linecap="round"/></g>`;
    s += `<g transform="translate(560 700) rotate(-4)"><rect x="0" y="0" width="300" height="60" fill="#fff" stroke="#c9d8de" stroke-width="3"/><line x1="150" y1="0" x2="150" y2="60" stroke="#c9d8de" stroke-width="3"/>${[12, 26, 40].map(y => `<line x1="20" x2="130" y1="${y}" y2="${y}" stroke="#9fb3bd" stroke-width="3"/><line x1="170" x2="280" y1="${y}" y2="${y}" stroke="#9fb3bd" stroke-width="3"/>`).join('')}</g><rect x="900" y="690" width="12" height="70" rx="4" fill="#f2a541" transform="rotate(30 906 725)"/>`;
    return svg(s);
  }
  const dayDefs = `<linearGradient id="dsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fd0f2"/><stop offset="1" stop-color="#e3f4fb"/></linearGradient>`;
  function park() {
    let s = `<rect width="${W}" height="${H}" fill="url(#dsky)"/><circle cx="260" cy="170" r="80" fill="#fff4b8"/><g fill="#fff" opacity=".9"><ellipse cx="700" cy="180" rx="140" ry="40"/><ellipse cx="780" cy="150" rx="90" ry="45"/><ellipse cx="1500" cy="230" rx="160" ry="44"/></g>`;
    s += `<path d="M0 640 q480 -120 960 -20 t960 -40 V1080 H0z" fill="#7cc58f"/><ellipse cx="560" cy="860" rx="520" ry="110" fill="#6cc0e4"/><ellipse cx="560" cy="860" rx="440" ry="80" fill="#8fd6f0"/>`;
    s += `<path d="M1000 1080 q160 -260 420 -360" stroke="#e8d7b0" stroke-width="90" fill="none"/>`;
    s += A.tree(160, 700, 1.3, false) + A.tree(1080, 660, 1.1, false) + A.tree(1800, 720, 1.4, false) + A.tree(1640, 640, .9, false);
    s += A.person(1180, 980, 1.15, .1, '#e2725b') + A.person(1290, 960, 1.0, .6, '#5bb3e2', { skin: '#e9b98f' }) + A.person(1500, 820, .8, .3, '#f2a541');
    s += A.noiseScreen(1360, 180, 1, '48.6', { title: '公园噪声监测', poleH: 360, trace: Array.from({ length: 60 }, (_, i) => 47 + 3 * Math.sin(i / 4) + 1.5 * Math.sin(i / 1.3)), lo: 30, hi: 80 });
    return svg(s, dayDefs);
  }
  function museum() {
    let s = `<rect width="${W}" height="${H}" fill="#efe6d8"/><rect x="0" y="760" width="${W}" height="320" fill="#c9b28f"/>`;
    for (let i = 0; i < 9; i++) s += `<rect x="${i * 240 - 40}" y="760" width="240" height="320" fill="${i % 2 ? '#bfa682' : '#d4bf9c'}" transform="skewX(-20)"/>`;
    for (const x of [140, 1700]) s += `<rect x="${x}" y="80" width="80" height="680" fill="#f8f3ea"/><rect x="${x - 20}" y="60" width="120" height="30" fill="#e2d7c4"/><rect x="${x - 20}" y="740" width="120" height="30" fill="#e2d7c4"/>`;
    // 画框
    s += `<rect x="320" y="200" width="420" height="300" fill="#8a5a2b"/><rect x="345" y="225" width="370" height="250" fill="#2f6b8a"/><circle cx="600" cy="300" r="40" fill="#f4c95d"/><path d="M345 475 l120 -130 l90 80 l70 -60 l90 110z" fill="#3f8a5f"/>`;
    s += `<rect x="820" y="230" width="300" height="380" fill="#8a5a2b"/><rect x="845" y="255" width="250" height="330" fill="#d9c7a0"/><ellipse cx="970" cy="390" rx="70" ry="90" fill="#b07a4a"/><rect x="900" y="470" width="140" height="110" fill="#6b4a2f"/>`;
    // 展台恐龙骨架剪影
    s += `<rect x="300" y="700" width="560" height="60" fill="#8f7a5c"/><path d="M360 700 q40 -160 160 -170 q90 -5 140 60 q40 -40 110 -60 q-30 60 -90 80 q20 50 0 90" stroke="#e8e0cf" stroke-width="16" fill="none" stroke-linecap="round"/>${[420, 470, 520, 570].map(x => `<line x1="${x}" y1="560" x2="${x - 10}" y2="700" stroke="#e8e0cf" stroke-width="10"/>`).join('')}`;
    s += A.person(1040, 1010, 1.1, .05, '#9a6fd6') + A.person(1170, 1000, .95, .1, '#59c18c', { skin: '#e9b98f' }) + A.person(1240, 1010, .75, .15, '#f2a541');
    s += A.noiseScreen(1300, 170, .95, '42.3', { title: '请保持安静', poleH: 0, pole: false, trace: Array.from({ length: 60 }, (_, i) => 41 + 2 * Math.sin(i / 3) + 1.2 * Math.sin(i / 1.1)), lo: 30, hi: 80 });
    s += `<rect x="1490" y="410" width="16" height="350" fill="#9a8c78"/>`;
    return svg(s);
  }
  function road() {
    let s = `<rect width="${W}" height="${H}" fill="url(#dsky)"/>`;
    s += A.building(0, 640, 300, 420, 21, { color: '#a7b9c8', lit: .0, roof: '#8ea2b3' }) + A.building(320, 640, 260, 520, 22, { color: '#c3cfd9', lit: 0, roof: '#a3b4c2' }) + A.building(1300, 640, 280, 460, 23, { color: '#b1c2d0', lit: 0, roof: '#91a5b6' }) + A.building(1600, 640, 320, 380, 24, { color: '#c9d4dd', lit: 0, roof: '#a8b8c6' });
    s += `<rect x="0" y="640" width="${W}" height="440" fill="#5a616c"/><rect x="0" y="630" width="${W}" height="20" fill="#cfd5db"/>`;
    for (let i = 0; i < 12; i++) s += `<rect x="${i * 180}" y="850" width="100" height="16" fill="#f4f4f4"/>`;
    const car = (x, y, c, sc = 1) => `<g transform="translate(${x} ${y}) scale(${sc})"><rect x="0" y="-70" width="300" height="70" rx="22" fill="${c}"/><path d="M60 -70 l40 -55 h110 l40 55z" fill="${c}"/><path d="M80 -72 l30 -42 h40 v42z M160 -72 v-42 h45 l30 42z" fill="#cfe9f7"/><circle cx="70" cy="0" r="30" fill="#222"/><circle cx="230" cy="0" r="30" fill="#222"/><circle cx="70" cy="0" r="12" fill="#999"/><circle cx="230" cy="0" r="12" fill="#999"/></g>`;
    s += car(180, 820, '#e2725b') + car(820, 980, '#3f7fd6', 1.2) + `<g transform="translate(1250 790)"><rect x="0" y="-150" width="420" height="140" rx="14" fill="#f2a541"/><rect x="300" y="-110" width="120" height="100" rx="10" fill="#e09a30"/><path d="M330 -100 h70 v40 h-70z" fill="#cfe9f7"/><circle cx="80" cy="0" r="34" fill="#222"/><circle cx="340" cy="0" r="34" fill="#222"/></g>`;
    s += `<g stroke="#9aa3ad" stroke-width="5" fill="none" stroke-linecap="round" opacity=".8"><path d="M1690 700 q20 -20 0 -40"/><path d="M1715 715 q35 -35 0 -70"/><path d="M1740 730 q50 -50 0 -100"/></g>`;
    s += A.noiseScreen(760, 90, 1, '68.2', { title: '道路噪声监测', poleH: 400, trace: Array.from({ length: 60 }, (_, i) => 66 + 5 * Math.sin(i / 2.5) + 3 * Math.sin(i / .9)), lo: 30, hi: 90 });
    return svg(s, dayDefs);
  }
  /** 封面：发光声波 + 夜色 */
  function cover() {
    const d1 = A.waveGlow(W, H, 1, { mid: 640, amp: 230 }), d2 = A.waveGlow(W, H, 2.4, { mid: 650, amp: 160 }), d3 = A.waveGlow(W, H, 4.2, { mid: 660, amp: 110 });
    const defs = `<linearGradient id="cbg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0c1f36"/><stop offset=".6" stop-color="#123a52"/><stop offset="1" stop-color="#1c5a63"/></linearGradient>
      <linearGradient id="wv" x1="0" x2="1"><stop offset="0" stop-color="#3fc1b5" stop-opacity="0"/><stop offset=".25" stop-color="#3fc1b5"/><stop offset=".6" stop-color="#5fd3ff"/><stop offset=".85" stop-color="#ffd36b"/><stop offset="1" stop-color="#ffd36b" stop-opacity="0"/></linearGradient>
      <filter id="glow" x="-10%" y="-50%" width="120%" height="200%"><feGaussianBlur stdDeviation="9" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
    let s = `<rect width="${W}" height="${H}" fill="url(#cbg)"/>${A.stars(90, 21, W, H)}`;
    for (let i = 0; i < 24; i++) s += `<line x1="0" x2="${W}" y1="${i * 45}" y2="${i * 45}" stroke="#ffffff" stroke-opacity=".035"/>`;
    s += `<g filter="url(#glow)" fill="none" stroke-linejoin="round"><path d="${d3}" stroke="url(#wv)" stroke-width="3" opacity=".45"/><path d="${d2}" stroke="url(#wv)" stroke-width="4" opacity=".7"/><path d="${d1}" stroke="url(#wv)" stroke-width="7"/></g>`;
    return svg(s, defs);
  }
  window.Scenes = { nightSquare, window: window_, park, museum, road, cover, svg, W, H };
})();
