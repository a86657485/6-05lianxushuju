/* 小递夜巡 · 智能限速卡丁车：可驾驶奖励小游戏。规则在 race-core.js；画面改编自 javascript-racer（MIT）。 */
const R = globalThis.RaceCore;
const main = document.getElementById('main');
const hint = document.getElementById('focus-hint');
const statusEl = document.getElementById('hud-status');

const TEACHER = location.pathname.includes('game-test');
let gateInfo = null, best = {}, discoveries = {}, runId = null, log = [], sim = null, L = null, me = null;
let keys = { u: 0, d: 0, l: 0, r: 0 };
let raf = 0, lastTs = 0, acc = 0, sprites = null, bgImg = null;
let phase = 'boot'; // boot | hub | setup | race | result | final

async function api(path, body) {
  const res = await fetch(path, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: body === undefined ? undefined : JSON.stringify(body) });
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('json') ? await res.json() : await res.text();
  if (!res.ok) throw Object.assign(new Error(data.error || res.statusText), { status: res.status, data });
  return data;
}

function loadImages() {
  return Promise.all([
    new Promise((ok, err) => { const i = new Image(); i.onload = () => ok(i); i.onerror = err; i.src = '/game/racer-images/sprites.png'; }),
    new Promise((ok, err) => { const i = new Image(); i.onload = () => ok(i); i.onerror = err; i.src = '/game/racer-images/background.png'; })
  ]).then(([s, b]) => { sprites = s; bgImg = b; });
}

async function boot() {
  statusEl.textContent = TEACHER ? '教师测试模式（不受分数限制）' : '检查解锁状态…';
  try {
    if (TEACHER) {
      gateInfo = { unlocked: true, latest: null, best: null, pass: 80, teacher: true };
    } else {
      me = await api('/api/me');
      gateInfo = await api('/api/game/status');
      best = gateInfo.game?.best || {};
      discoveries = gateInfo.game?.discoveries || {};
    }
  } catch (e) {
    if (e.status === 401) {
      main.innerHTML = `<div class="gate-card"><h1>请先登录数据站</h1><p>奖励小游戏需要用班级名单登录后，在考核≥80分时解锁。</p><a class="go-btn" href="/">去登录</a></div>`;
      return;
    }
    main.innerHTML = `<div class="gate-card"><h1>暂时连不上服务</h1><p>${e.message}</p></div>`;
    return;
  }
  if (!gateInfo.unlocked && !TEACHER) {
    main.innerHTML = `<div class="gate-card" id="game-locked"><p class="kicker">奖励小游戏</p><h1>🔒 考核 80 分以上解锁</h1>
      <p>最近一次 20 题考核：<b>${gateInfo.latest ?? '还没考'}</b> 分${gateInfo.best != null ? `（历史最好 ${gateInfo.best}）` : ''}。</p>
      <p>解锁后可驾驶卡丁车巡查小区：车速表是连续数据，限速线是你设的阈值。</p>
      <a class="go-btn" href="/">回数据站继续学习</a></div>`;
    statusEl.textContent = '未解锁';
    return;
  }
  await loadImages().catch(() => {});
  showHub();
}

function showHub() {
  phase = 'hub';
  statusEl.textContent = TEACHER ? '教师试玩' : `已解锁 · 最近 ${gateInfo.latest} 分`;
  hint.textContent = '选一关开始驾驶 · ↑加速 ↓减速 ←→转向';
  const cards = R.LEVELS.map(lv => {
    const b = best[lv.id];
    const st = b ? `<span class="stars">${'★'.repeat(b.stars)}${'☆'.repeat(3 - b.stars)}</span> ${b.score}分` : '尚未通关';
    return `<button class="level-card" data-lv="${lv.id}" type="button"><b>${lv.n}. ${lv.title}</b><span>${lv.place} · ${lv.rule.slice(0, 36)}…</span><br><span>${st}</span></button>`;
  }).join('');
  main.innerHTML = `<div class="g-card" id="hub-card"><p class="kicker">跑跑卡丁车式 · 简化夜巡</p><h2>选关开卡丁车</h2>
    <p>方向键 / WASD 开车，也可切换<strong>自动驾驶</strong>：系统用车速（输入）和限速阈值（比较）输出油门/刹车。车速是连续量；限速线是阈值。</p>
    <div class="level-grid">${cards}</div>
    <p class="keys-help">操作：<kbd>↑</kbd><kbd>W</kbd>加速 <kbd>↓</kbd><kbd>S</kbd>减速 <kbd>←</kbd><kbd>→</kbd><kbd>A</kbd><kbd>D</kbd>转向</p>
  </div>`;
  main.querySelectorAll('.level-card').forEach(btn => btn.onclick = () => setupLevel(btn.dataset.lv));
}

function setupLevel(id) {
  L = R.byId[id];
  phase = 'setup';
  const ctrls = L.controls.map(c => {
    if (c.options) {
      return `<div class="ctrl" data-key="${c.key}"><label><span>${c.label}</span></label>
        <select id="c-${c.key}">${c.options.map(o => `<option value="${o[0]}" ${o[0] === c.def ? 'selected' : ''}>${o[1]}</option>`).join('')}</select></div>`;
    }
    return `<div class="ctrl" data-key="${c.key}"><label><span>${c.label}</span><b id="v-${c.key}">${c.def}</b></label>
      <input id="c-${c.key}" type="range" min="${c.min}" max="${c.max}" value="${c.def}"></div>`;
  }).join('');
  main.innerHTML = `<div class="g-card" id="setup-card"><p class="kicker">第 ${L.n} 关 · ${L.place}</p><h2>${L.title}</h2>
    <p>${L.rule}</p><p><b>目标：</b>${L.goal}</p>
    <div id="setup-ctrls">${ctrls}</div>
    <p class="keys-help">设好阈值后开始开车。赛中仍可在右侧改阈值——<strong>科学原理就在规则里</strong>。</p>
    <p style="margin-top:18px"><button class="primary" id="start-race" type="button">开始驾驶</button>
    <button class="ghost" id="back-hub" type="button">返回选关</button></p></div>`;
  L.controls.forEach(c => {
    const el = document.getElementById('c-' + c.key);
    el.oninput = () => { const v = document.getElementById('v-' + c.key); if (v) v.textContent = el.value; };
  });
  document.getElementById('back-hub').onclick = showHub;
  document.getElementById('start-race').onclick = () => startRace(readSetupControls());
}

function readSetupControls() {
  const o = {};
  for (const c of L.controls) {
    const el = document.getElementById('c-' + c.key);
    o[c.key] = c.options ? Number(el.value) : Number(el.value);
  }
  return o;
}

function startRace(ctrl) {
  phase = 'race';
  const seed = 1 + Math.floor(Math.random() * 999999);
  runId = 'r-' + L.id + '-' + Date.now();
  log = [{ t: 0, ...ctrl, u: 0, d: 0, l: 0, r: 0 }];
  sim = R.create(L.id, seed, ctrl);
  keys = { u: 0, d: 0, l: 0, r: 0 };
  lastTs = 0; acc = 0;
  hint.textContent = '↑加速 ↓减速 ←→转向 · 右侧可改限速阈值';
  main.innerHTML = `<div class="play-wrap" id="play-wrap">
    <canvas id="race-canvas" width="960" height="540"></canvas>
    <aside class="side" id="side-panel">
      <h3>${L.title}</h3>
      <p class="rule">${L.goal}</p>
      <div class="mode-toggle" id="mode-toggle" role="group" aria-label="驾驶模式">
        <button type="button" data-mode="0" class="on" id="mode-manual">🖐 手动驾驶</button>
        <button type="button" data-mode="1" id="mode-auto">🤖 自动驾驶</button>
      </div>
      <p class="mode-explain" id="mode-explain">手动：方向键开车。可超速，阈值会强力干预。</p>
      <div class="meter-row">
        <div class="speedo"><div class="val" id="spd">0</div><div class="unit">km/h</div></div>
        <div>
          <div class="limit-tag" id="limit-tag">限速 --</div>
          <div class="zone-pill" id="zone-pill">路段</div>
          <div id="warn-flag" style="margin-top:6px;font-size:12px;color:var(--amber)"></div>
          <div id="ipo-line" style="margin-top:8px;font-size:11px;color:var(--muted);line-height:1.4"></div>
        </div>
      </div>
      <div class="dash"><canvas id="spark" width="560" height="140"></canvas></div>
      <div id="live-ctrls"></div>
      <p class="keys-help"><kbd>↑</kbd>加速 <kbd>↓</kbd>减速 <kbd>←</kbd><kbd>→</kbd>转向</p>
    </aside>
    <div class="bottom-bar"><span class="msg" id="race-msg">出发！注意限速阈值。</span>
      <button class="ghost" id="btn-abort" type="button">放弃本局</button></div>
  </div>`;
  renderLiveControls();
  bindModeToggle();
  document.getElementById('btn-abort').onclick = () => { cancelAnimationFrame(raf); showHub(); };
  bindKeys(true);
  raf = requestAnimationFrame(loop);
}

function renderLiveControls() {
  const box = document.getElementById('live-ctrls');
  box.innerHTML = L.controls.map(c => {
    if (c.options) {
      return `<div class="ctrl"><label><span>${c.label}</span></label>
        <select data-ck="${c.key}">${c.options.map(o => `<option value="${o[0]}" ${o[0] === sim.ctrl[c.key] ? 'selected' : ''}>${o[1]}</option>`).join('')}</select></div>`;
    }
    return `<div class="ctrl"><label><span>${c.label}</span><b data-cv="${c.key}">${sim.ctrl[c.key]}</b></label>
      <input data-ck="${c.key}" type="range" min="${c.min}" max="${c.max}" value="${sim.ctrl[c.key]}" style="accent-color:${c.color}"></div>`;
  }).join('');
  box.querySelectorAll('[data-ck]').forEach(el => {
    el.oninput = () => {
      const key = el.dataset.ck;
      const val = Number(el.value);
      const patch = { t: sim.t, [key]: val };
      R.control(sim, patch);
      log.push(patch);
      const lab = box.querySelector(`[data-cv="${key}"]`);
      if (lab) lab.textContent = val;
    };
  });
}

function bindModeToggle() {
  const box = document.getElementById('mode-toggle');
  const explain = document.getElementById('mode-explain');
  box.querySelectorAll('button').forEach(btn => {
    btn.onclick = () => {
      const auto = Number(btn.dataset.mode) ? 1 : 0;
      box.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === btn));
      const patch = { t: sim.t, auto };
      R.control(sim, patch);
      log.push(patch);
      explain.textContent = auto
        ? '自动驾驶：输入车速 → 与限速阈值比较 → 输出油门/刹车。你主要调阈值，看系统怎么控车。'
        : '手动：方向键开车。可故意超速；阈值会警告/强刹——对比自动驾驶最明显。';
      hint.textContent = auto ? '自动驾驶中 · 拖动右侧限速阈值看系统反应' : '↑加速 ↓减速 ←→转向 · 可切自动驾驶';
    };
  });
}
function bindKeys(on) {
  const down = e => {
    const k = e.key;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(k)) e.preventDefault();
    if (k === 'ArrowUp' || k === 'w' || k === 'W') keys.u = 1;
    if (k === 'ArrowDown' || k === 's' || k === 'S') keys.d = 1;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') keys.l = 1;
    if (k === 'ArrowRight' || k === 'd' || k === 'D') keys.r = 1;
  };
  const up = e => {
    const k = e.key;
    if (k === 'ArrowUp' || k === 'w' || k === 'W') keys.u = 0;
    if (k === 'ArrowDown' || k === 's' || k === 'S') keys.d = 0;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') keys.l = 0;
    if (k === 'ArrowRight' || k === 'd' || k === 'D') keys.r = 0;
  };
  if (on) { window.__kartDown = down; window.__kartUp = up; window.addEventListener('keydown', down); window.addEventListener('keyup', up); }
  else {
    if (window.__kartDown) window.removeEventListener('keydown', window.__kartDown);
    if (window.__kartUp) window.removeEventListener('keyup', window.__kartUp);
  }
}

function pushKeysIfChanged() {
  const last = log[log.length - 1] || {};
  if (last.u === keys.u && last.d === keys.d && last.l === keys.l && last.r === keys.r) return;
  const e = { t: sim.t, u: keys.u, d: keys.d, l: keys.l, r: keys.r };
  log.push(e);
  R.control(sim, e);
}

function loop(ts) {
  if (phase !== 'race' || !sim) return;
  if (!lastTs) lastTs = ts;
  acc += (ts - lastTs) / 1000;
  lastTs = ts;
  const step = 1 / R.FPS;
  let guard = 0;
  while (acc >= step && !sim.done && guard++ < 5) {
    pushKeysIfChanged();
    R.control(sim, { u: keys.u, d: keys.d, l: keys.l, r: keys.r });
    R.tick(sim);
    acc -= step;
  }
  drawRace();
  updateHud();
  if (sim.done) { cancelAnimationFrame(raf); bindKeys(false); finishRace(); return; }
  raf = requestAnimationFrame(loop);
}

function updateHud() {
  const row = sim.history[sim.history.length - 1] || R.snapshot(sim);
  document.getElementById('spd').textContent = Math.round(row.reading ?? row.truth);
  const z = R.zoneAt(L, row.progress);
  let lim = z.fixed;
  if (z.limitKey) lim = sim.ctrl[z.limitKey];
  if (z.warnKey) lim = Math.max(sim.ctrl[z.warnKey], sim.ctrl[z.brakeKey]);
  const tag = document.getElementById('limit-tag');
  tag.textContent = lim != null ? `限速 ${Math.round(lim)}` : '双阈值';
  tag.className = 'limit-tag' + (row.warn && !row.on ? ' warn' : '');
  document.getElementById('zone-pill').textContent = row.zoneLabel || z.label;
  document.getElementById('warn-flag').textContent = row.on ? '🛑 输出：刹车（超过阈值）' : row.warn ? '⚠ 警告：接近/超过阈值' : (sim.auto ? '✅ 输出：跟阈值巡航' : '');
  const ipo = document.getElementById('ipo-line');
  if (ipo) ipo.textContent = sim.auto
    ? `输入 ${Math.round(row.truth)} km/h → 计算(比阈值) → 输出${row.on ? '刹车' : '油门/巡航'}`
    : `手动输入中 · 阈值仍在比较（${row.on ? '已触发刹车输出' : '未超限'}）`;
  const left = Math.max(0, L.ticks - sim.t);
  document.getElementById('race-msg').textContent = `进度 ${(row.progress || 0).toFixed(2)} 圈 · 剩余 ${(left / R.FPS).toFixed(1)}s · 罚单压力 ${sim.stats.tickets.toFixed(1)}`;
  drawSpark();
}

function drawSpark() {
  const c = document.getElementById('spark'); if (!c) return;
  const ctx = c.getContext('2d'), W = c.width, H = c.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,.04)'; ctx.fillRect(0, 0, W, H);
  const rows = sim.history.slice(-120);
  if (!rows.length) return;
  // limit line(s)
  const yOf = v => H - 8 - (v / L.maxSpeed) * (H - 16);
  const z = R.zoneAt(L, rows[rows.length - 1].progress);
  ctx.strokeStyle = 'rgba(255,122,122,.7)'; ctx.setLineDash([6, 4]); ctx.beginPath();
  let lim = z.fixed; if (z.limitKey) lim = sim.ctrl[z.limitKey];
  if (z.warnKey) {
    ctx.strokeStyle = 'rgba(255,209,102,.8)';
    const y = yOf(sim.ctrl[z.warnKey]); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    ctx.beginPath(); ctx.strokeStyle = 'rgba(255,122,122,.8)';
    const y2 = yOf(sim.ctrl[z.brakeKey]); ctx.moveTo(0, y2); ctx.lineTo(W, y2); ctx.stroke();
  } else if (lim != null) {
    const y = yOf(lim); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.strokeStyle = '#5ad1ff'; ctx.lineWidth = 2; ctx.beginPath();
  rows.forEach((r, i) => {
    const x = i / Math.max(1, rows.length - 1) * W;
    const y = yOf(r.truth);
    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  });
  ctx.stroke();
}

/* ---- Pseudo-3D road render (adapted from javascript-racer MIT) ---- */
const SPR = {
  PLAYER_LEFT: { x: 995, y: 480, w: 80, h: 41 },
  PLAYER_STRAIGHT: { x: 1085, y: 480, w: 80, h: 41 },
  PLAYER_RIGHT: { x: 995, y: 531, w: 80, h: 41 },
  TREE: { x: 625, y: 5, w: 360, h: 360 },
  BILLBOARD: { x: 625, y: 375, w: 300, h: 170 }
};

function drawRace() {
  const canvas = document.getElementById('race-canvas'); if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const progress = (sim.pos / L.trackLen) % 1;
  const camH = 1000, camD = 1 / Math.tan((60 / 2) * Math.PI / 180);
  // sky / bg
  ctx.fillStyle = '#0b1a33'; ctx.fillRect(0, 0, W, H * 0.45);
  if (bgImg) {
    const off = (progress * 800 + sim.x * 40) % bgImg.width;
    ctx.globalAlpha = 0.55;
    ctx.drawImage(bgImg, -off, 0, bgImg.width, H * 0.5);
    ctx.drawImage(bgImg, -off + bgImg.width, 0, bgImg.width, H * 0.5);
    ctx.globalAlpha = 1;
  }
  // stars
  ctx.fillStyle = '#fff';
  for (let i = 0; i < 40; i++) ctx.fillRect((i * 97 + progress * 200) % W, (i * 53) % (H * 0.4), 2, 2);

  const roadW = 2000, segN = sim.track.length;
  const start = Math.floor(progress * segN) % segN;
  let x = 0, dx = 0, maxy = H;
  const drawSegs = [];
  for (let n = 0; n < 80; n++) {
    const i = (start + n) % segN;
    const seg = sim.track[i];
    const p1 = project(0, 0, n * 200, sim.x * roadW, camH, camD, W, H, roadW);
    const p2 = project(0, 0, (n + 1) * 200, sim.x * roadW - x - dx, camH, camD, W, H, roadW);
    x += dx; dx += seg.curve;
    if (p1.y >= p2.y) continue;
    drawSegs.push({ p1, p2, seg, i, n, dark: ((start + n) % 2) === 0 });
  }
  for (let k = drawSegs.length - 1; k >= 0; k--) {
    const { p1, p2, dark, n } = drawSegs[k];
    const grass = dark ? '#0d2a1a' : '#0a2216';
    const rumble = dark ? '#eee' : '#c62828';
    const road = dark ? '#2a2a2e' : '#34343a';
    polygon(ctx, 0, p1.y, W, p1.y, W, p2.y, 0, p2.y, grass);
    polygon(ctx, p1.x - p1.w * 1.1, p1.y, p1.x + p1.w * 1.1, p1.y, p2.x + p2.w * 1.1, p2.y, p2.x - p2.w * 1.1, p2.y, rumble);
    polygon(ctx, p1.x - p1.w, p1.y, p1.x + p1.w, p1.y, p2.x + p2.w, p2.y, p2.x - p2.w, p2.y, road);
    // lane
    if (dark) polygon(ctx, p1.x - p1.w * 0.02, p1.y, p1.x + p1.w * 0.02, p1.y, p2.x + p2.w * 0.02, p2.y, p2.x - p2.w * 0.02, p2.y, '#ccc');
    // speed limit signs every few segs
    if (n > 5 && n % 18 === 0 && sprites) {
      const sc = p2.scale * 800;
      const spr = SPR.BILLBOARD;
      ctx.drawImage(sprites, spr.x, spr.y, spr.w, spr.h, p2.x - sc * 0.6, p2.y - sc * 0.45, sc * 0.55, sc * 0.35);
    }
    maxy = p1.y;
  }
  // player car
  const bounce = (1 + Math.sin(sim.t / 3) * 0.02) * (sim.speed / L.maxSpeed);
  let spr = SPR.PLAYER_STRAIGHT;
  if (keys.l) spr = SPR.PLAYER_LEFT;
  if (keys.r) spr = SPR.PLAYER_RIGHT;
  const pw = 80 * 1.6, ph = 41 * 1.6;
  const px = W / 2 - pw / 2, py = H - ph - 20 - bounce * 6;
  if (sprites) ctx.drawImage(sprites, spr.x, spr.y, spr.w, spr.h, px, py, pw, ph);
  else { ctx.fillStyle = '#3fc1b5'; ctx.fillRect(px, py, pw, ph); }
  // speed flash when over
  const row = sim.history[sim.history.length - 1];
  if (row?.on) { ctx.fillStyle = 'rgba(255,60,60,.18)'; ctx.fillRect(0, 0, W, H); }
  else if (row?.warn) { ctx.fillStyle = 'rgba(255,200,60,.10)'; ctx.fillRect(0, 0, W, H); }
}

function project(x, y, z, camX, camY, camD, W, H, roadW) {
  const camZ = z || 1;
  const scale = camD / camZ;
  return {
    x: Math.round(W / 2 + scale * (x - camX) * W / 2),
    y: Math.round(H / 2 - scale * (y - camY) * H / 2),
    w: Math.round(scale * roadW * W / 2),
    scale
  };
}
function polygon(ctx, x1, y1, x2, y2, x3, y3, x4, y4, color) {
  ctx.fillStyle = color; ctx.beginPath();
  ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.lineTo(x4, y4);
  ctx.closePath(); ctx.fill();
}

async function finishRace() {
  phase = 'result';
  const local = R.replay(L.id, sim.seed, log);
  statusEl.textContent = '提交成绩…';
  let server = null;
  try {
    if (!TEACHER) {
      server = await api('/api/game/result', { sid: me.student.id, round: me.round, level: L.id, seed: sim.seed, log, runId, claimed: local.score });
      best = server.status.game?.best || best;
      gateInfo = { ...gateInfo, ...server.status };
    }
  } catch (e) {
    main.innerHTML = `<div class="g-card"><h2>提交失败</h2><p>${e.message}</p><button class="primary" id="retry">返回</button></div>`;
    document.getElementById('retry').onclick = showHub;
    return;
  }
  const res = server?.result || { score: local.score, stars: local.stars, stats: local.stats };
  const disc = L.discover;
  main.innerHTML = `<div class="g-card" id="result-card"><p class="kicker">本关结束</p><h2>${L.title}</h2>
    <p>得分 <b style="font-size:28px;color:var(--mint)">${res.score}</b>　<span class="stars">${'★'.repeat(res.stars)}${'☆'.repeat(3 - res.stars)}</span></p>
    <p style="font-size:13px;color:var(--muted)">距离 ${Math.round(res.stats.distance || 0)} m · 超速累计 ${(res.stats.overTicks || 0).toFixed?.(1) ?? res.stats.overTicks}s · 刹车切换 ${res.stats.switches ?? 0} 次</p>
    <p style="margin-top:14px"><b>${disc.q}</b></p>
    <div id="disc-opts">${disc.options.map(([id, t]) => `<button class="level-card" data-d="${id}" type="button" style="margin-bottom:8px"><b>${t}</b></button>`).join('')}</div>
    <p id="disc-fb" style="min-height:24px"></p>
    <p><button class="primary" id="next-lv" type="button">下一关 / 选关</button></p></div>`;
  main.querySelectorAll('[data-d]').forEach(btn => btn.onclick = async () => {
    const choice = btn.dataset.d;
    try {
      if (!TEACHER) await api('/api/game/discover', { sid: me.student.id, round: me.round, level: L.id, choice });
      document.getElementById('disc-fb').textContent = choice === 'ok' ? '✅ 说对了：阈值比较连续读数，决定系统输出。' : '再想想：规则里真正起作用的是「读数 vs 阈值」。';
      document.getElementById('disc-fb').style.color = choice === 'ok' ? 'var(--mint)' : 'var(--rose)';
    } catch (e) { document.getElementById('disc-fb').textContent = e.message; }
  });
  document.getElementById('next-lv').onclick = showHub;
}

boot();
