/* 小递夜巡 · 智能限速卡丁车：可驾驶奖励小游戏。规则在 race-core.js；画面改编自 javascript-racer（MIT）。 */
const R = globalThis.RaceCore;
const main = document.getElementById('main');
const hint = document.getElementById('focus-hint');
const statusEl = document.getElementById('hud-status');

const TEACHER = location.pathname.includes('game-test');
let gateInfo = null, best = {}, discoveries = {}, runId = null, log = [], sim = null, L = null, me = null;
let keys = { u: 0, d: 0, l: 0, r: 0 };
let raf = 0, lastTs = 0, acc = 0, sprites = null, bgImg = null;
let phase = 'boot'; // boot | hub | setup | race | viol | result | final
let violSession = null; // 当前超速弹窗会话

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
  document.getElementById('btn-abort').onclick = () => {
    cancelAnimationFrame(raf); bindKeys(false);
    if (violSession) { clearInterval(violSession.timer); if (window.__violKey) window.removeEventListener('keydown', window.__violKey); }
    violSession = null; const m = document.getElementById('viol-modal'); if (m) m.remove();
    showHub();
  };
  bindKeys(true);
  const canvas = document.getElementById('race-canvas');
  canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', '赛道画面，点一下后按方向键开车');
  const cue = document.createElement('div');
  cue.id = 'drive-cue';
  cue.className = 'drive-cue';
  cue.innerHTML = '<b>点一下画面</b><span>然后按 <kbd>↑</kbd> 出发（或点「自动驾驶」）</span>';
  document.getElementById('play-wrap').appendChild(cue);
  const arm = () => { canvas.focus({ preventScroll: true }); cue.classList.add('hide'); };
  canvas.addEventListener('pointerdown', arm);
  cue.addEventListener('pointerdown', arm);
  window.__driveCue = cue;
  setTimeout(() => canvas.focus({ preventScroll: true }), 50);
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
  if (!sim || (phase !== 'race' && phase !== 'viol')) return;
  if (phase === 'viol') {
    drawRace();
    updateHud();
    raf = requestAnimationFrame(loop);
    return;
  }
  if (!lastTs) lastTs = ts;
  acc += (ts - lastTs) / 1000;
  lastTs = ts;
  const step = 1 / R.FPS;
  let guard = 0;
  while (acc >= step && !sim.done && phase === 'race' && guard++ < 5) {
    pushKeysIfChanged();
    R.control(sim, { u: keys.u, d: keys.d, l: keys.l, r: keys.r });
    R.tick(sim);
    const trig = R.shouldQuiz(sim);
    if (trig) {
      acc = 0;
      openViolation(trig);
      break;
    }
    acc -= step;
  }
  drawRace();
  updateHud();
  if (window.__driveCue && (sim.speed > 2 || sim.auto || keys.u)) window.__driveCue.classList.add('hide');
  if (sim.done && phase === 'race') { cancelAnimationFrame(raf); bindKeys(false); finishRace(); return; }
  raf = requestAnimationFrame(loop);
}

function openViolation(trig) {
  phase = 'viol';
  sim.paused = true;
  keys.u = keys.d = keys.l = keys.r = 0;
  const goalId = trig.goal;
  violSession = {
    trig,
    goalId,
    reads: [],
    answers: [],
    avoid: [],
    readStarted: performance.now(),
    readMs: 0,
    step: 'read', // read | quiz
    q: null,
    timer: null
  };
  showViolRead();
}

function showViolRead() {
  const vs = violSession; if (!vs) return;
  vs.step = 'read';
  vs.readStarted = performance.now();
  vs.readMs = 0;
  const k = vs.trig.knowledge;
  const wrap = document.getElementById('play-wrap');
  let modal = document.getElementById('viol-modal');
  if (!modal) { modal = document.createElement('div'); modal.id = 'viol-modal'; modal.className = 'viol-modal'; wrap.appendChild(modal); }
  modal.hidden = false;
  modal.innerHTML = `<div class="viol-card" role="dialog" aria-modal="true">
    <p class="kicker">规范：超过阈值须先学再开</p>
    <span class="goal-tag">${k.goalName}</span>
    <h2>${k.title}</h2>
    <div class="know">${k.body}</div>
    <div class="viol-cd" id="viol-cd">请阅读 3 秒…</div>
    <p style="text-align:center;margin:0 0 12px;font-size:12px;color:var(--muted)">倒计时结束后才能继续（Enter）</p>
    <p style="text-align:center"><button class="primary" id="viol-next" type="button" disabled>继续答题</button></p>
  </div>`;
  const btn = document.getElementById('viol-next');
  const cd = document.getElementById('viol-cd');
  clearInterval(vs.timer);
  vs.timer = setInterval(() => {
    const elapsed = performance.now() - vs.readStarted;
    vs.readMs = elapsed;
    const left = Math.max(0, R.READ_MS - elapsed);
    if (left > 0) { cd.textContent = `请阅读 ${Math.ceil(left / 1000)} 秒…`; cd.className = 'viol-cd'; btn.disabled = true; }
    else { cd.textContent = '✓ 可以继续'; cd.className = 'viol-cd ready'; btn.disabled = false; }
  }, 100);
  btn.onclick = () => {
    if (performance.now() - vs.readStarted < R.READ_MS) return;
    vs.reads.push({ ms: Math.round(performance.now() - vs.readStarted) });
    clearInterval(vs.timer);
    showViolQuiz();
  };
  if (window.__violKey) window.removeEventListener('keydown', window.__violKey);
  window.__violKey = (e) => {
    if (vs.step === 'read' && e.key === 'Enter' && !btn.disabled) btn.click();
  };
  window.addEventListener('keydown', window.__violKey);
}

function showViolQuiz() {
  const vs = violSession; if (!vs) return;
  vs.step = 'quiz';
  vs.q = R.pickQuestion(vs.goalId, vs.avoid);
  vs.avoid.push(vs.q.id);
  const modal = document.getElementById('viol-modal');
  modal.innerHTML = `<div class="viol-card" role="dialog" aria-modal="true">
    <p class="kicker">超速问答 · ${(R.GOALS.find(g => g.id === vs.goalId) || {}).name || ''}</p>
    <h2 style="font-size:18px">${vs.q.q}</h2>
    <div class="viol-opts" id="viol-opts">
      ${vs.q.options.map((o, i) => `<button type="button" data-i="${i}"><span class="num">${i + 1}</span>${o}</button>`).join('')}
    </div>
    <p class="viol-fb" id="viol-fb"></p>
    <p style="font-size:12px;color:var(--muted);margin:0">按 1 / 2 / 3 / 4 选择</p>
  </div>`;
  const choose = (i) => {
    const ok = i === vs.q.answer;
    vs.answers.push({ qid: vs.q.id, choice: i, correct: ok });
    const fb = document.getElementById('viol-fb');
    if (ok) {
      fb.className = 'viol-fb good'; fb.textContent = '✓ 正确！车速已降到限速内，继续巡查。';
      setTimeout(finishViolation, 500);
    } else {
      fb.className = 'viol-fb bad'; fb.textContent = '✗ ' + (vs.q.tip || '再读一读知识点');
      // 答错：重新阅读 ≥3 秒，再换题
      setTimeout(() => {
        vs.trig.knowledge = R.knowledgeFor(vs.goalId, { speed: vs.trig.speed, limit: vs.trig.limit, zoneLabel: vs.trig.zoneLabel, n: vs.answers.length });
        showViolRead();
      }, 900);
    }
  };
  modal.querySelectorAll('#viol-opts button').forEach(b => b.onclick = () => choose(Number(b.dataset.i)));
  if (window.__violKey) window.removeEventListener('keydown', window.__violKey);
  window.__violKey = (e) => {
    if (vs.step !== 'quiz') return;
    if (e.key >= '1' && e.key <= '4') {
      const i = Number(e.key) - 1;
      if (i < vs.q.options.length) choose(i);
    }
  };
  window.addEventListener('keydown', window.__violKey);
}

function finishViolation() {
  const vs = violSession; if (!vs) return;
  clearInterval(vs.timer);
  if (window.__violKey) window.removeEventListener('keydown', window.__violKey);
  const payload = {
    t: vs.trig.t,
    viol: {
      zone: vs.trig.zone,
      zoneLabel: vs.trig.zoneLabel,
      speed: vs.trig.speed,
      limit: vs.trig.limit,
      goal: vs.goalId,
      reads: vs.reads.slice(),
      answers: vs.answers.slice()
    }
  };
  log.push(payload);
  R.control(sim, payload); // applyViolation via applyLogEntry
  // 确保速度压到限速
  if (sim.speed > vs.trig.limit) sim.speed = vs.trig.limit;
  const modal = document.getElementById('viol-modal');
  if (modal) modal.hidden = true;
  violSession = null;
  phase = 'race';
  sim.paused = false;
  lastTs = 0; acc = 0;
  document.getElementById('race-canvas')?.focus({ preventScroll: true });
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

/* ---- Pseudo-3D road render（按 javascript-racer MIT 正确投影重写） ---- */
const SPR = {
  PLAYER_LEFT: { x: 995, y: 480, w: 80, h: 41 },
  PLAYER_STRAIGHT: { x: 1085, y: 480, w: 80, h: 41 },
  PLAYER_RIGHT: { x: 995, y: 531, w: 80, h: 41 },
  TREE: { x: 625, y: 5, w: 360, h: 360 },
  PALM: { x: 5, y: 5, w: 215, h: 540 },
  BILLBOARD: { x: 625, y: 375, w: 300, h: 170 },
  COLUMN: { x: 995, y: 5, w: 200, h: 315 }
};
const SEG_LEN = 200;
const CAM_H = 1000;
const DRAW_N = 100;
const FOG_D = 5;
const LANES = 3;

function camDepth() { return 1 / Math.tan(((100) / 2) * Math.PI / 180); }

function projectPoint(worldX, worldY, worldZ, camX, camY, camZ, depth, W, H, roadW) {
  const cx = worldX - camX, cy = worldY - camY, cz = worldZ - camZ;
  if (cz <= depth * 0.1) return null;
  const scale = depth / cz;
  return {
    x: Math.round(W / 2 + scale * cx * W / 2),
    y: Math.round(H / 2 - scale * cy * H / 2),
    w: Math.round(scale * roadW * W / 2),
    scale, cz
  };
}

function rumbleW(w) { return w / Math.max(6, 2 * LANES); }
function laneW(w) { return w / Math.max(32, 8 * LANES); }

function zoneTheme(zoneId, L) {
  // 路段差异：草地/路缘/天空色/雾
  const themes = {
    school:  { grassA: '#1a5c28', grassB: '#144820', rumbleA: '#e8e8e8', rumbleB: '#c62828', roadA: '#4a4a50', roadB: '#3e3e44', sky: '#0c1a36', fog: 'rgba(10,25,50,', tint: null, curb: '#ffd54f' },
    open:    { grassA: '#145020', grassB: '#0e3c18', rumbleA: '#ddd', rumbleB: '#b71c1c', roadA: '#505056', roadB: '#44444a', sky: '#0a1528', fog: 'rgba(8,18,40,', tint: null, curb: '#fff' },
    wet:     { grassA: '#0d3a2a', grassB: '#0a2e22', rumbleA: '#90a4ae', rumbleB: '#37474f', roadA: '#2c3540', roadB: '#24303a', sky: '#061018', fog: 'rgba(20,40,55,', tint: 'rgba(60,100,140,.12)', curb: '#78909c' },
    tunnel:  { grassA: '#1a1a22', grassB: '#121218', rumbleA: '#ff8f00', rumbleB: '#e65100', roadA: '#2a2a30', roadB: '#222228', sky: '#020208', fog: 'rgba(0,0,0,', tint: 'rgba(0,0,0,.25)', curb: '#ffb300' },
    highway: { grassA: '#0e4a30', grassB: '#0a3a24', rumbleA: '#fff', rumbleB: '#ffc107', roadA: '#55555c', roadB: '#484850', sky: '#0b1830', fog: 'rgba(12,22,45,', tint: null, curb: '#ffeb3b' },
    school2: { grassA: '#1a5c28', grassB: '#144820', rumbleA: '#e8e8e8', rumbleB: '#c62828', roadA: '#4a4a50', roadB: '#3e3e44', sky: '#0c1a36', fog: 'rgba(10,25,50,', tint: null, curb: '#ffd54f' }
  };
  return themes[zoneId] || themes.open;
}

function limitForZone(z) {
  if (!z) return 60;
  if (z.fixed != null) return z.fixed;
  if (z.limitKey) return sim.ctrl[z.limitKey];
  if (z.warnKey) return Math.max(sim.ctrl[z.warnKey], sim.ctrl[z.brakeKey]);
  return 60;
}

function drawSpeedSign(ctx, x, y, scale, limit, theme) {
  const s = Math.max(10, scale * 420);
  const w = s * 0.55, h = s * 0.7;
  const bx = x - w / 2, by = y - h;
  // pole
  ctx.fillStyle = '#78909c';
  ctx.fillRect(x - 2, by + h * 0.55, 4, h * 0.55);
  // board
  ctx.fillStyle = '#eceff1';
  roundRectFill(ctx, bx, by, w, h * 0.55, 6);
  ctx.strokeStyle = '#c62828'; ctx.lineWidth = Math.max(2, s * 0.04);
  roundRectStroke(ctx, bx, by, w, h * 0.55, 6);
  ctx.fillStyle = '#212121';
  ctx.font = `bold ${Math.max(10, s * 0.22)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(String(Math.round(limit)), x, by + h * 0.28);
  ctx.font = `${Math.max(7, s * 0.1)}px sans-serif`;
  ctx.fillText('km/h', x, by + h * 0.42);
  ctx.textAlign = 'left';
}

function roundRectFill(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); ctx.fill();
}
function roundRectStroke(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); ctx.stroke();
}

function poly(ctx, x1, y1, x2, y2, x3, y3, x4, y4, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.lineTo(x4, y4);
  ctx.closePath(); ctx.fill();
}

function drawSegment(ctx, W, x1, y1, w1, x2, y2, w2, fog, theme, dark, lanes) {
  const r1 = rumbleW(w1), r2 = rumbleW(w2);
  const l1 = laneW(w1), l2 = laneW(w2);
  // grass strip (full width band)
  ctx.fillStyle = dark ? theme.grassB : theme.grassA;
  ctx.fillRect(0, y2, W, Math.max(1, y1 - y2));
  // yellow/white curb (outer thin strip beyond rumble)
  const c1 = rumbleW(w1) * 0.45, c2 = rumbleW(w2) * 0.45;
  poly(ctx, x1 - w1 - r1 - c1, y1, x1 - w1 - r1, y1, x2 - w2 - r2, y2, x2 - w2 - r2 - c2, y2, theme.curb);
  poly(ctx, x1 + w1 + r1, y1, x1 + w1 + r1 + c1, y1, x2 + w2 + r2 + c2, y2, x2 + w2 + r2, y2, theme.curb);
  // rumble
  poly(ctx, x1 - w1 - r1, y1, x1 - w1, y1, x2 - w2, y2, x2 - w2 - r2, y2, dark ? theme.rumbleB : theme.rumbleA);
  poly(ctx, x1 + w1, y1, x1 + w1 + r1, y1, x2 + w2 + r2, y2, x2 + w2, y2, dark ? theme.rumbleB : theme.rumbleA);
  // asphalt
  poly(ctx, x1 - w1, y1, x1 + w1, y1, x2 + w2, y2, x2 - w2, y2, dark ? theme.roadB : theme.roadA);
  // dashed center / lane markers (only on "light" segments = dashed look)
  if (!dark) {
    let lanew1 = w1 * 2 / lanes, lanew2 = w2 * 2 / lanes;
    let lanex1 = x1 - w1 + lanew1, lanex2 = x2 - w2 + lanew2;
    for (let lane = 1; lane < lanes; lanex1 += lanew1, lanex2 += lanew2, lane++) {
      poly(ctx, lanex1 - l1 / 2, y1, lanex1 + l1 / 2, y1, lanex2 + l2 / 2, y2, lanex2 - l2 / 2, y2, '#d0d0d0');
    }
  }
  // fog
  if (fog < 1) {
    ctx.fillStyle = theme.fog + (1 - fog).toFixed(3) + ')';
    ctx.fillRect(0, y2, W, Math.max(1, y1 - y2));
  }
}

function drawRace() {
  const canvas = document.getElementById('race-canvas'); if (!canvas || !sim) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const roadW = 2000;
  const depth = camDepth();
  const track = sim.track;
  const segN = track.length;
  const trackLen = segN * SEG_LEN;
  // ★ 关键：物理赛道 L.trackLen（约280m）映射到整圈视觉赛道，一圈物理=一整圈画面，路纹才会往镜头冲
  const lap = sim.pos / Math.max(1, L.trackLen);
  const position = ((lap % 1) * trackLen + trackLen) % trackLen;
  const baseIdx = Math.floor(position / SEG_LEN) % segN;
  const basePct = (position % SEG_LEN) / SEG_LEN;
  const playerZ = CAM_H;
  const seg0 = track[baseIdx], seg1 = track[(baseIdx + 1) % segN];
  const playerY = seg0.y + (seg1.y - seg0.y) * basePct;
  // 速度感：镜头微颤 + 行驶颠簸
  const spdN = Math.min(1, sim.speed / L.maxSpeed);
  const bob = Math.sin(sim.t * 0.9) * 2.2 * spdN + Math.sin(sim.t * 2.3) * 1.1 * spdN;
  const shake = (Math.random() - 0.5) * 1.4 * spdN * spdN;

  const zNow = R.zoneAt(L, (sim.pos / L.trackLen) % 1);
  const themeNow = zoneTheme(zNow.id, L);

  ctx.save();
  ctx.translate(shake, bob);

  // sky
  ctx.fillStyle = themeNow.sky;
  ctx.fillRect(-4, -4, W + 8, H + 8);
  if (bgImg) {
    // 视差：随前进与弯道横向滚动
    const curveBias = (seg0.curve || 0) * 18;
    const off = ((position * 0.08) + sim.x * 50 + curveBias) % bgImg.width;
    ctx.globalAlpha = L.id === 'sample' ? 0.15 : (L.id === 'rain' ? 0.35 : 0.55);
    ctx.drawImage(bgImg, -off, 0, bgImg.width, H * 0.55);
    ctx.drawImage(bgImg, -off + bgImg.width, 0, bgImg.width, H * 0.55);
    ctx.globalAlpha = 1;
  }
  // stars / rain（随位置滚动）
  if (L.id !== 'sample') {
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 50; i++) ctx.fillRect((i * 97 + position * 0.35) % W, (i * 53 + bob) % (H * 0.42), 2, 2);
  }
  if (L.id === 'rain') {
    ctx.strokeStyle = 'rgba(180,210,255,.45)'; ctx.lineWidth = 1;
    const rainBoost = 8 + spdN * 20;
    for (let i = 0; i < 55; i++) {
      const rx = (i * 137 + sim.t * rainBoost) % W, ry = (i * 89 + sim.t * (14 + spdN * 30)) % H;
      ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx - 3, ry + 14 + spdN * 10); ctx.stroke();
    }
  }
  if (L.id === 'sample') {
    // tunnel ceiling vignette
    const g = ctx.createLinearGradient(0, 0, 0, H * 0.5);
    g.addColorStop(0, '#000'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H * 0.5);
  }

  let x = 0, dx = -(seg0.curve || 0) * basePct;
  let maxy = H;
  const projected = [];

  for (let n = 0; n < DRAW_N; n++) {
    const idx = (baseIdx + n) % segN;
    const seg = track[idx];
    const looped = idx < baseIdx;
    // 相对摄像机的前方距离（与 javascript-racer: world.z - position 一致）
    const worldZ1 = n * SEG_LEN - basePct * SEG_LEN;
    const worldZ2 = worldZ1 + SEG_LEN;
    const p1 = projectPoint(0, seg.y, worldZ1, sim.x * roadW - x, playerY + CAM_H, 0, depth, W, H, roadW);
    const p2 = projectPoint(0, track[(idx + 1) % segN].y, worldZ2, sim.x * roadW - x - dx, playerY + CAM_H, 0, depth, W, H, roadW);
    x += dx;
    dx += seg.curve || 0;
    if (!p1 || !p2) continue;
    if (p1.cz <= depth || p2.y >= p1.y || p2.y >= maxy) continue;
    const fog = 1 / Math.pow(Math.E, (n / DRAW_N) * (n / DRAW_N) * FOG_D);
    projected.push({ p1, p2, seg, n, idx, fog, dark: ((baseIdx + n) % 2) === 0 });
    maxy = p1.y;
  }

  // draw far → near
  for (let k = projected.length - 1; k >= 0; k--) {
    const { p1, p2, seg, n, fog, dark } = projected[k];
    const theme = zoneTheme(seg.zoneId, L);
    drawSegment(ctx, W, p1.x, p1.y, p1.w, p2.x, p2.y, p2.w, fog, theme, dark, LANES);

    // 路边物体绑在世界段 idx 上，才会随前进冲向镜头（绑 n 会像贴纸贴在屏上）
    const { idx } = projected[k];
    if (sprites && idx % 6 === 0 && L.id !== 'sample' && n > 1) {
      const sc = p1.scale;
      const spr = (idx % 12 === 0) ? SPR.PALM : SPR.TREE;
      const destW = spr.w * sc * 0.35;
      const destH = spr.h * sc * 0.35;
      const side = (idx % 2 === 0) ? -1 : 1;
      const sx = p1.x + side * p1.w * 1.35 - (side < 0 ? destW : 0);
      const sy = p1.y - destH;
      if (destH > 4) ctx.drawImage(sprites, spr.x, spr.y, spr.w, spr.h, sx, sy, destW, destH);
    }
    if (sprites && L.id === 'sample' && idx % 4 === 0 && n > 1) {
      const sc = p1.scale;
      const spr = SPR.COLUMN;
      const destW = spr.w * sc * 0.4, destH = spr.h * sc * 0.4;
      ctx.drawImage(sprites, spr.x, spr.y, spr.w, spr.h, p1.x - p1.w * 1.2 - destW, p1.y - destH, destW, destH);
      ctx.drawImage(sprites, spr.x, spr.y, spr.w, spr.h, p1.x + p1.w * 1.2, p1.y - destH, destW, destH);
    }
    if (idx % 12 === 0 && n > 2) {
      const z = R.zoneAt(L, (idx / segN) % 1);
      const lim = limitForZone(z);
      const side = (idx % 24 === 0) ? -1 : 1;
      drawSpeedSign(ctx, p1.x + side * p1.w * 1.15, p1.y, p1.scale, lim, theme);
    }
  }

  // zone tint overlay
  if (themeNow.tint) { ctx.fillStyle = themeNow.tint; ctx.fillRect(0, 0, W, H); }

  // player car
  const bounce = Math.sin(sim.t / 2.5) * 1.5 * (sim.speed / L.maxSpeed);
  let spr = SPR.PLAYER_STRAIGHT;
  if (!sim.auto && keys.l) spr = SPR.PLAYER_LEFT;
  if (!sim.auto && keys.r) spr = SPR.PLAYER_RIGHT;
  // 车辆大小：与 racer 的 cameraDepth/playerZ 一致，再乘路宽系数
  const carScale = depth / playerZ;
  const pw = Math.max(60, spr.w * carScale * roadW * 0.8);
  const ph = Math.max(30, spr.h * carScale * roadW * 0.8);
  const px = W / 2 - pw / 2;
  const py = H - ph - 12 - bounce;
  if (sprites) ctx.drawImage(sprites, spr.x, spr.y, spr.w, spr.h, px, py, pw, ph);
  else { ctx.fillStyle = '#3fc1b5'; ctx.fillRect(px, py, pw, ph); }

  // 高速速度线（运动线索）
  if (spdN > 0.35) {
    ctx.strokeStyle = `rgba(255,255,255,${0.12 + spdN * 0.25})`;
    ctx.lineWidth = 2;
    for (let i = 0; i < 14; i++) {
      const ang = (i / 14) * Math.PI - Math.PI / 2;
      const len = 30 + spdN * 90 + (i % 3) * 12;
      const cx = W / 2 + Math.sin(ang) * (40 + i * 8);
      const cy = H * 0.55 + Math.cos(ang) * 20;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.sin(ang) * len, cy + Math.cos(ang) * len * 0.35);
      ctx.stroke();
    }
  }

  ctx.restore(); // end bob/shake

  // HUD ribbon: current zone（不随抖动）
  ctx.fillStyle = 'rgba(0,0,0,.45)';
  ctx.fillRect(12, 12, 240, 36);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 14px sans-serif';
  ctx.fillText(`${zNow.label} · 限速 ${Math.round(limitForZone(zNow))}`, 22, 36);

  const row = sim.history[sim.history.length - 1];
  if (row?.on) { ctx.fillStyle = 'rgba(255,60,60,.15)'; ctx.fillRect(0, 0, W, H); }
  else if (row?.warn) { ctx.fillStyle = 'rgba(255,200,60,.08)'; ctx.fillRect(0, 0, W, H); }
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
