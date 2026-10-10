/* 小递夜巡 · 小区自动管家：奖励小游戏前端。规则与计分全在 night-core.js（服务端用同一份重算）。 */
import { api, escape, uniqueId } from '/sync.mjs?v=1';
import { xiaodi, building, stars as starDots } from '/world-art.mjs';
import { drawPlant } from '/game/plant-art.mjs?v=1';

const N = globalThis.NightCore;
const $ = id => document.getElementById(id);
const mode = location.pathname === '/game-test' ? 'test' : 'student';
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const TPS = 12; // 每秒推进的“秒数”（数据格）
let me = null, status = null, prog = null, L = null, sim = null, phase = 'gate', seed = 1, last = 0, acc = 0, raf = 0, lastResult = null, drag = null, hover = null;
const imgs = {};

/* ---------------- 音效：默认关闭 ---------------- */
const sfxFiles = { good: 'confirmation_002', bad: 'error_006', star: 'maximize_006', tap: 'select_002' };
let soundOn = false; try { soundOn = localStorage.getItem('lesson5-game-sound') === 'on'; } catch {}
const sfxCache = {};
function sfx(n) { if (!soundOn) return; try { const a = sfxCache[n] ||= new Audio('/assets/kenney/sfx/' + sfxFiles[n] + '.ogg'); a.volume = .45; a.currentTime = 0; a.play().catch(() => {}); } catch {} }

/* ---------------- 本机进度（同一学生） ---------------- */
const key = () => 'lesson5-nightgame:' + (mode === 'test' ? 'test' : me?.student?.id + ':' + me?.round);
function loadProg() { try { prog = JSON.parse((mode === 'test' ? sessionStorage : localStorage).getItem(key()) || 'null'); } catch {} prog ||= { level: 0, best: {}, history: {}, disc: {}, seeds: {} }; }
function saveProg() { try { (mode === 'test' ? sessionStorage : localStorage).setItem(key(), JSON.stringify(prog)); } catch {} }
const unlockedLevel = i => mode === 'test' || i === 0 || !!prog.disc[N.LEVELS[i - 1].id];

/* ---------------- 门禁 ---------------- */
async function boot() {
  if (mode === 'test') {
    me = { student: { id: 'test', name: '测试巡查员' }, round: 'test' };
    status = { unlocked: true, latest: null, best: null, pass: N.PASS, leaderboard: [] };
    loadProg(); return enterGame();
  }
  try { me = await api('/api/me'); } catch { return gateCard('🔑', '请先登录', '回到巡查站，选择班级和姓名后再来。', ''); }
  try { status = await api('/api/game/status'); } catch (e) { return gateCard('⚠️', '暂时连不上课堂服务', e.message, ''); }
  if (!status.unlocked) {
    const s = status.latest === null ? '你还没有参加20题考核。' : `你最近一次考核 <b>${status.latest}</b> 分，最好成绩 <b>${status.best}</b> 分。`;
    return gateCard('🔒', '考核80分以上解锁', `奖励小游戏需要最近一次20题考核达到 ${status.pass} 分。${s}<br>回到关卡看看薄弱的地方，再考一次吧。`, 'locked');
  }
  loadProg();
  if (status.game?.discoveries) for (const [k, v] of Object.entries(status.game.discoveries)) prog.disc[k] ||= v.latest;
  enterGame();
}
function gateCard(icon, title, text, cls) {
  $('gate').innerHTML = `<div class="g-card ${cls}" id="gate-card"><p class="g-lock">${icon}</p><h2>${title}</h2><p>${text}</p><div class="g-row" style="justify-content:center"><a class="cta" href="/" style="padding:10px 20px;border-radius:12px;text-decoration:none">回到巡查站</a></div></div>`;
}

/* ---------------- 进入游戏 ---------------- */
function enterGame() {
  $('gate').hidden = true; $('hud').hidden = false; $('main').hidden = false; $('tip').hidden = false;
  if (mode === 'test') { $('exit').href = '/test'; $('exit').textContent = '回测试页'; }
  $('sound').onclick = () => { soundOn = !soundOn; try { localStorage.setItem('lesson5-game-sound', soundOn ? 'on' : 'off'); } catch {} $('sound').textContent = soundOn ? '🔊' : '🔇'; $('sound').setAttribute('aria-pressed', soundOn); sfx('tap'); };
  $('sound').textContent = soundOn ? '🔊' : '🔇';
  $('help').onclick = () => { if (phase === 'play') pause(); intro(true); };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="100" viewBox="0 0 80 100">${xiaodi(0, 0, 1)}</svg>`;
  imgs.xiaodi = new Image(); imgs.xiaodi.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  setupChart();
  new ResizeObserver(() => { fitCanvas($('scene')); fitCanvas($('chart')); bg = null; draw(); }).observe($('main'));
  addEventListener('keydown', onKey);
  startLevel(Math.min(prog.level || 0, 3));
}
function fitCanvas(c) { const r = c.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1); c.width = Math.max(10, Math.round(r.width * d)); c.height = Math.max(10, Math.round(r.height * d)); c._d = d; }

/* ---------------- 关卡流程 ---------------- */
function startLevel(i, newSeed = false) {
  cancelAnimationFrame(raf);
  L = N.LEVELS[i]; prog.level = i; saveProg();
  if (newSeed || !prog.seeds[L.id]) prog.seeds[L.id] = 1 + Math.floor(Math.random() * 2000000000);
  seed = prog.seeds[L.id]; saveProg();
  const keep = sim && sim.L.id === L.id ? sim.c : null;
  sim = N.create(L.id, seed);
  if (keep) N.control(sim, keep); // 同一晚再试：保留刚才的阈值，方便只改一处做对比
  sim.log = keep ? [{ t: 0, ...sim.c }] : [];
  bg = null; renderHud(); renderCtrls(); updateFlow(null); intro(false); draw();
}
function intro(again) {
  phase = sim.done ? 'result' : sim.t > 0 ? 'paused' : 'ready';
  const resume = phase === 'paused';
  overlay(`<div class="g-card" id="intro-card"><p class="kicker">第${L.n}关 · ${L.place}</p><h2>${L.title}</h2>
    <p class="rule">${L.rule}</p><p>${L.goal}</p>
    <p class="g-msg">${L.controls[0].options ? '先在右边选采样间隔，' : '可以先在下方曲线上拖动阈值线，'}再按开始。同一晚的数据可以反复试，看看换个阈值结果怎么变。</p>
    <div class="g-row"><button type="button" class="cta" id="go">${resume ? '继续' : sim.done ? '看结果' : '开始这一晚'}</button></div></div>`);
  $('go').onclick = () => { if (sim.done) return showResult(lastResult); overlay(''); play(); };
  tip(resume ? '按“继续”接着运行' : '按“开始这一晚”，系统就会自动运行');
}
function overlay(h) { $('overlay').innerHTML = h; }
function tip(t) { $('tip').textContent = t; }
function play() {
  phase = 'play'; last = performance.now(); acc = 0; sfx('tap');
  tip(L.controls[0].options ? '运行中：随时可以切换采样间隔，看曲线上的读数点' : `运行中：拖动曲线上的${L.controls.map(c => c.label).join('、')}（或按 ↑ ↓），看看结果怎么变`);
  loop(last);
}
function pause() { phase = 'paused'; cancelAnimationFrame(raf); }
function loop(now) {
  if (phase !== 'play') return;
  acc += Math.min(250, now - last) / 1000 * TPS; last = now;
  let row = null;
  while (acc >= 1 && !sim.done) { row = N.tick(sim); acc -= 1; }
  if (row) { updateFlow(row); flushPops(); }
  draw(now);
  if (sim.done) return finishRun();
  raf = requestAnimationFrame(loop);
}
/** 测试/走查用：一口气跑完（不改变规则）。 */
function fastForward() { if (sim.done) return; phase = 'play'; let row; while (!sim.done) row = N.tick(sim); updateFlow(row); sim.pops = []; finishRun(); }

async function finishRun() {
  phase = 'result'; cancelAnimationFrame(raf); draw();
  const local = N.result(sim);
  const hist = prog.history[L.id] ||= [];
  const prev = hist.filter(h => h.seed === seed).at(-1) || null;
  let server = null, note = '';
  if (mode === 'student') {
    try {
      const out = await api('/api/game/result', { sid: me.student.id, round: me.round, runId: uniqueId(), level: L.id, seed, log: sim.log, claimed: local.score });
      server = out.result; status = out.status;
    } catch (e) { note = e.status === 403 ? '没有解锁，成绩未记录。' : '成绩暂时没传上（' + e.message + '），本机已记住。'; }
  }
  const r = server || local;
  hist.push({ seed, score: r.score, stars: r.stars, controls: sim.log.length ? { ...sim.c } : { ...sim.c }, first: { ...sim.rows[0]?.c } });
  if (hist.length > 20) hist.shift();
  if (!prog.best[L.id] || r.score > prog.best[L.id].score) prog.best[L.id] = { score: r.score, stars: r.stars };
  saveProg(); lastResult = { r, prev, note };
  if (r.stars) sfx('star'); renderHud(); showResult(lastResult);
}
function ctrlText(c) { return L.controls.map(d => d.options ? d.options.find(o => o[0] === c[d.key])?.[1] : `${d.label}${c[d.key]}${L.unit === '%' ? '%' : ' ' + L.unit}`).join('、'); }
function explain(r) {
  const s = r.stats, out = [];
  if (L.id === 'garden') {
    out.push(`花待在舒适区 ${s.good} 秒；太干 ${s.dry} 秒，太湿 ${s.flood} 秒；水泵浇水 ${s.water} 秒（每秒水费 −0.2）。`);
    if (s.dry > 20) out.push('开泵线太低：湿度掉到30%以下才浇水，花已经蔫了。');
    if (s.flood > 20) out.push('开泵线太高：一直浇得很湿，再遇上下雨就涝了。');
  } else if (L.id === 'lamp') {
    out.push(`路灯开关 ${s.switches} 次${s.broken ? '，灯泡烧坏了' : ''}；天黑没亮灯 ${s.dark} 秒。`);
    if (s.switches >= 6) out.push('读数在线附近一抖就切换一次：试试把开灯线和关灯线分开，中间留一段缓冲。');
    if (s.dark > 20 && !s.broken) out.push('开灯线太低：天已经黑了，读数还没低到开灯线。');
  } else if (L.id === 'sample') {
    out.push(`读了 ${s.samples} 次数，电池剩 ${s.battery} 格；记录到 ${s.caught} 次吵闹，漏掉 ${s.missed} 次。`);
    if (s.battery === 0) out.push('读得太勤，半夜电池就没电了，后面的吵闹全漏了。');
    else if (s.missed) out.push('读得太稀：短促的声音正好落在两次读数之间。看下面的真实曲线和读数点。');
  } else {
    out.push(`及时劝导 ${s.caught} 次，误报 ${s.falseAlarm} 次，漏报 ${s.missed} 次。`);
    if (s.falseAlarm >= 2) out.push('报警线太低：关门、狗叫这样的正常声音也会越过它。');
    if (s.missed) out.push('报警线太高：真正的吵闹也没越过它，居民投诉了。');
  }
  return out;
}
function starHtml(n) { return [0, 1, 2].map(i => i < n ? '★' : '<span class="off">★</span>').join(''); }
function showResult({ r, prev, note }) {
  const disc = prog.disc[L.id];
  const cmp = prev ? `<p class="g-compare">同一晚上次：${escape(ctrlText(prev.controls))} → <b>${prev.score}</b> 分；这次：${escape(ctrlText(sim.c))} → <b>${r.score}</b> 分。${r.score > prev.score ? '换了阈值，结果变好了！' : r.score < prev.score ? '同样的数据，换个阈值，结果就不一样。' : ''}</p>` : '';
  const D = L.discover;
  overlay(`<div class="g-card wide" id="result-card"><div class="colA"><p class="kicker">第${L.n}关 · ${L.title} · 本晚结束</p>
    <div class="g-row" style="margin:0"><span class="g-big" id="run-score">${r.score}</span><span>分</span><span class="g-stars">${starHtml(r.stars)}</span><span class="g-msg">最长连击 ${r.stats.bestCombo}</span></div>
    <ul class="g-lines">${explain(r).map(x => `<li>${escape(x)}</li>`).join('')}</ul>${cmp}${note ? `<p class="g-msg bad">${escape(note)}</p>` : ''}
    <p class="g-msg">把鼠标移到下面的曲线上，可以读出任意时刻的数值。</p></div>
    <div class="colB"><div id="disc-box"><b>${D.q}</b><div class="g-disc" id="disc">${shuffle(D.options, L.id).map(([v, t]) => `<button type="button" data-d="${v}" class="${disc ? (v === 'ok' ? 'right' : v === disc ? 'wrong' : '') : ''}">${escape(t)}</button>`).join('')}</div><p class="g-msg" id="disc-msg"></p></div>
    <div class="g-row"><button type="button" id="next" ${disc ? '' : 'disabled'}>${L.n < 4 ? '下一关' : '看总成绩'}</button><button type="button" class="ghost" id="again">同一晚再试一次</button><button type="button" class="ghost" id="other">换一晚</button></div></div></div>`);
  const focusDisc = () => { $('disc').classList.toggle('cta', !prog.disc[L.id]); $('next').classList.toggle('cta', !!prog.disc[L.id]); };
  focusDisc();
  tip(prog.disc[L.id] ? (L.n < 4 ? '可以进入下一关，也可以改个阈值再试一次' : '去看看总成绩和班级排行') : '先选一句：这一关你发现了什么？');
  $('disc').querySelectorAll('[data-d]').forEach(b => b.onclick = async () => {
    const v = b.dataset.d, ok = v === 'ok';
    $('disc').querySelectorAll('button').forEach(x => x.className = x.dataset.d === 'ok' && ok ? 'right' : x === b && !ok ? 'wrong' : '');
    $('disc-msg').className = 'g-msg ' + (ok ? 'good' : 'bad');
    $('disc-msg').textContent = ok ? '对！这正是你刚才在曲线上看到的。' : wrongWhy(v);
    sfx(ok ? 'good' : 'bad');
    if (mode === 'student') api('/api/game/discover', { sid: me.student.id, round: me.round, level: L.id, choice: v }).catch(() => {});
    if (ok) { prog.disc[L.id] = v; saveProg(); $('next').disabled = false; renderHud(); }
    focusDisc();
    tip(ok ? (L.n < 4 ? '按“下一关”继续' : '按“看总成绩”') : '回想一下曲线和阈值线，再选一次');
  });
  $('next').onclick = () => L.n < 4 ? startLevel(L.n) : finalCard();
  $('again').onclick = () => startLevel(L.n - 1);
  $('other').onclick = () => startLevel(L.n - 1, true);
}
function wrongWhy(v) {
  return ({ two: '再看曲线：湿度是一点点往下走的，中间每个值都经过了。', timer: '水泵什么时候开，是看读数有没有低于开泵线。', high: '开灯线太高，傍晚还亮着就开灯，费电；关键是两条线之间的缓冲。', bulb: '同一盏灯，把两条线分开后就不闪了——是阈值的问题。', less: '读得太少，短促的声音会从两次读数之间溜走。', same: '看曲线：两次读数之间，声音可能已经冲上去又落回来了。', low: '报警线太低，正常的关门声也报警，小递白跑，居民也被打扰。', sound: '同样的声音数据，换个报警线，报警次数就变了。' })[v] || '再想想。';
}
function shuffle(a, s) { const r = N.rng([...s].reduce((n, c) => n * 31 + c.charCodeAt(0), 7)); return a.map(x => [r(), x]).sort((p, q) => p[0] - q[0]).map(x => x[1]); }
function finalCard() {
  const total = Math.round(N.LEVELS.reduce((n, l) => n + Math.max(0, prog.best[l.id]?.score || 0), 0));
  const stars = N.LEVELS.reduce((n, l) => n + (prog.best[l.id]?.stars || 0), 0);
  const board = (status?.leaderboard || []);
  overlay(`<div class="g-card" id="final-card"><p class="kicker">今晚巡查结束</p><h2>小区自动管家 · 总成绩</h2>
    <div class="g-row" style="margin:0"><span class="g-big">${status?.game?.total ?? total}</span><span>分</span><span class="g-stars">★×${status?.game?.stars ?? stars}</span></div>
    <p>四个系统，同一个道理：<b>传感器读数（连续变化）→ 和阈值比较 → 决定输出</b>。阈值设在哪里，系统的表现就不同。</p>
    ${board.length ? `<b>本班排行（每关最好成绩之和）</b><table class="g-board">${board.map((b, i) => `<tr class="${b.name === me.student.name ? 'me' : ''}"><td>${i + 1}</td><td>${escape(b.name)}</td><td>${b.total} 分</td><td>★${b.stars}</td></tr>`).join('')}</table>` : '<p class="g-msg">班级排行在正式课堂里显示。</p>'}
    <div class="g-row"><a class="cta" id="home" href="${mode === 'test' ? '/test' : '/'}" style="padding:10px 20px;border-radius:12px;text-decoration:none">回到巡查站</a><button type="button" class="ghost" id="replay">再挑战第1关</button></div></div>`);
  $('replay').onclick = () => startLevel(0);
  tip('想冲排行榜？每关可以反复挑战，取最好成绩');
}

/* ---------------- HUD 与控制面板 ---------------- */
function renderHud() {
  $('pips').innerHTML = N.LEVELS.map((l, i) => { const b = prog.best[l.id]; return `<li><button type="button" data-l="${i}" class="${l.id === L.id ? 'now' : ''}" ${unlockedLevel(i) ? '' : 'disabled'} title="${l.title}">${l.n}<span class="pn"> ${l.place}</span>${b ? `<span class="st">${'★'.repeat(b.stars)}</span>` : ''}</button></li>`; }).join('');
  $('pips').querySelectorAll('[data-l]').forEach(b => b.onclick = () => { if (phase === 'play') pause(); startLevel(Number(b.dataset.l)); });
  const total = status?.game?.total ?? Math.round(N.LEVELS.reduce((n, l) => n + Math.max(0, prog.best[l.id]?.score || 0), 0));
  $('total').textContent = total + ' 分';
}
function fmt(v) { return v == null ? '—' : (Math.round(v * 10) / 10) + (L.unit === '%' ? '%' : ' ' + L.unit); }
function renderCtrls() {
  $('ctrls').innerHTML = L.controls.map(d => d.options
    ? `<div><span class="g-flow-h" style="color:var(--muted)">${d.label}</span><div class="g-seg" id="seg">${d.options.map(([v, t]) => `<button type="button" data-k="${v}" aria-pressed="${sim.c.k === v}">${t}</button>`).join('')}</div></div>`
    : `<div class="g-ctrl"><i class="sw" style="background:${d.color}"></i><span class="lab">${d.label}</span><button type="button" data-step="${d.key}:-1" aria-label="${d.label}降低">−</button><b id="cv-${d.key}">${fmt(sim.c[d.key])}</b><button type="button" data-step="${d.key}:1" aria-label="${d.label}升高">＋</button></div>`).join('')
    + (L.fixed ? `<div class="g-ctrl"><i class="sw" style="background:#ff7a7a"></i><span class="lab">${L.fixed.label}（固定）</span></div>` : '');
  $('ctrls').querySelectorAll('[data-k]').forEach(b => b.onclick = () => { setCtrl({ k: Number(b.dataset.k) }); });
  $('ctrls').querySelectorAll('[data-step]').forEach(b => b.onclick = () => { const [k, s] = b.dataset.step.split(':'); nudge(k, Number(s)); });
}
function stepOf(k) { return L.id === 'lamp' ? 10 : 1; }
function nudge(k, dir) { setCtrl({ [k]: sim.c[k] + dir * stepOf(k) }); }
function setCtrl(c) {
  if (sim.done) return;
  if (L.id === 'lamp' && 'a' in c && c.a > sim.c.b) c.b = c.a; // 开灯线推高时带着关灯线一起走
  N.control(sim, c);
  for (const d of L.controls) { const el = $('cv-' + d.key); if (el) el.textContent = fmt(sim.c[d.key]); }
  $('ctrls').querySelectorAll('[data-k]').forEach(b => b.setAttribute('aria-pressed', Number(b.dataset.k) === sim.c.k));
  draw();
}
let sel = 'a';
function onKey(e) {
  if (!L || sim.done || L.controls[0].options) return;
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); nudge(L.controls.some(d => d.key === sel) ? sel : 'a', e.key === 'ArrowUp' ? 1 : -1); }
  if (e.key === 'Tab' && L.controls.length > 1 && document.activeElement === document.body) { e.preventDefault(); sel = sel === 'a' ? 'b' : 'a'; tip(`↑ ↓ 现在调：${L.controls.find(d => d.key === sel).label}`); }
  if ((e.key === ' ' || e.key === 'Enter') && document.activeElement === document.body && phase === 'ready') { e.preventDefault(); overlay(''); play(); }
}

/* ---------------- 数据流面板：输入 → 计算 → 输出 ---------------- */
function updateFlow(row) {
  const out = $('f-out').parentElement;
  if (!row) { $('f-in').textContent = '—'; $('f-in2').textContent = L.quantity; $('f-cmp').textContent = '等待开始'; $('f-yes').textContent = ''; $('f-out').textContent = '—'; $('f-out2').textContent = L.device; out.classList.remove('on'); $('s-score').textContent = '0'; $('s-combo').textContent = '0'; $('s-time').style.width = '0'; $('s-extra').textContent = extra(); return; }
  $('f-in').textContent = row.reading == null ? (L.id === 'sample' ? '（不采样）' : '—') : fmt(row.reading);
  $('f-in2').textContent = `${L.quantity} · 第${row.t + 1}秒`;
  $('f-cmp').textContent = row.cmp; $('f-yes').textContent = row.reading == null ? '' : row.yes ? '是' : '否';
  const devOut = L.id === 'garden' ? (row.on ? '水泵：浇水' : '水泵：停') : L.id === 'lamp' ? (sim.broken ? '路灯：坏了' : row.on ? '路灯：亮' : '路灯：灭') : L.id === 'sample' ? (row.on ? '记录吵闹！' : row.reading == null ? '休眠省电' : '安静，不记录') : (row.on ? '小递：出发/劝导中' : '小递：待命');
  $('f-out').textContent = devOut; $('f-out2').textContent = '';
  out.classList.toggle('on', !!row.on);
  for (const id of ['a1', 'a2']) { $(id).classList.add('pulse'); setTimeout(() => $(id).classList.remove('pulse'), 120); }
  $('s-score').textContent = sim.score; $('s-combo').textContent = sim.combo; $('s-extra').textContent = extra();
  $('s-time').style.width = (sim.t / L.ticks * 100) + '%';
}
function extra() { return L.id === 'lamp' ? `开关 ${sim.switches}/${L.wearLimit}` : L.id === 'sample' ? `电池 ${sim.battery}/${L.battery}` : L.id === 'garden' ? `用水 ${sim.stats.water}` : `误报 ${sim.stats.falseAlarm} · 漏报 ${sim.stats.missed}`; }
function flushPops() {
  const box = $('pops');
  for (const p of sim.pops.splice(0)) {
    const el = document.createElement('div'); el.className = 'g-pop ' + (p.good ? 'good' : 'bad'); el.textContent = p.text;
    el.style.top = (25 + Math.random() * 30) + '%'; el.style.left = (35 + Math.random() * 30) + '%';
    box.append(el); setTimeout(() => el.remove(), 1700); while (box.children.length > 4) box.firstChild.remove();
    sfx(p.good ? 'good' : 'bad');
  }
}

/* ---------------- 曲线：连续数据、读数点、阈值线（可拖动）、任意时刻读数 ---------------- */
let chartBox = null;
function chartGeom() {
  const c = $('chart'), d = c._d || 1, W = c.width / d, H = c.height / d, pad = { l: 54, r: 104, t: 24, b: 26 };
  const x = t => pad.l + t / (L.ticks - 1) * (W - pad.l - pad.r), y = v => pad.t + (1 - (v - L.min) / (L.max - L.min)) * (H - pad.t - pad.b);
  const tOf = px => (px - pad.l) / (W - pad.l - pad.r) * (L.ticks - 1), vOf = py => L.min + (1 - (py - pad.t) / (H - pad.t - pad.b)) * (L.max - L.min);
  return { c, d, W, H, pad, x, y, tOf, vOf };
}
function setupChart() {
  const c = $('chart');
  const pos = e => { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const lineAt = (px, py) => {
    if (!L || L.controls[0].options || sim.done) return null;
    const g = chartGeom(); let best = null;
    for (const d of L.controls) { const dy = Math.abs(g.y(sim.c[d.key]) - py); const onHandle = px > g.W - g.pad.r - 6; if (dy < (onHandle ? 22 : 14) && (!best || dy < best.dy)) best = { key: d.key, dy }; }
    if (best && L.controls.length > 1 && sim.c.a === sim.c.b) best.tie = true;
    return best;
  };
  c.addEventListener('pointerdown', e => { const [px, py] = pos(e); const hit = lineAt(px, py); if (hit) { drag = { ...hit, y0: py }; c.setPointerCapture(e.pointerId); e.preventDefault(); } });
  c.addEventListener('pointermove', e => {
    const [px, py] = pos(e), g = chartGeom();
    if (drag) {
      if (drag.tie && Math.abs(py - drag.y0) > 3) { drag.key = py < drag.y0 ? 'b' : 'a'; drag.tie = false; }
      if (!drag.tie) { sel = drag.key; setCtrl({ [drag.key]: Math.round(g.vOf(py) / stepOf(drag.key)) * stepOf(drag.key) }); }
      return;
    }
    c.style.cursor = lineAt(px, py) ? 'ns-resize' : 'crosshair';
    hover = px >= g.pad.l && px <= g.W - g.pad.r ? g.tOf(px) : null; draw();
  });
  const up = () => { drag = null; };
  c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
  c.addEventListener('pointerleave', () => { hover = null; $('scrub').hidden = true; draw(); });
}
function drawChart() {
  const g = chartGeom(), ctx = g.c.getContext('2d'); if (!L) return;
  ctx.setTransform(g.d, 0, 0, g.d, 0, 0); ctx.clearRect(0, 0, g.W, g.H);
  const { x, y, pad, W, H } = g;
  ctx.font = "12px 'PingFang SC','Microsoft YaHei','Noto Sans CJK SC',sans-serif";
  for (const z of L.zones) { ctx.fillStyle = z.color; ctx.fillRect(pad.l, y(Math.min(L.max, z.to)), W - pad.l - pad.r, y(Math.max(L.min, z.from)) - y(Math.min(L.max, z.to))); ctx.fillStyle = '#9fb3c8'; ctx.fillText(z.label, pad.l + 6, y(Math.min(L.max, z.to)) + 14); }
  // 坐标
  ctx.strokeStyle = '#26405f'; ctx.fillStyle = '#9fb3c8'; ctx.lineWidth = 1; ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i++) { const v = L.min + (L.max - L.min) * i / 4, yy = y(v); ctx.beginPath(); ctx.moveTo(pad.l, yy); ctx.lineTo(W - pad.r, yy); ctx.stroke(); ctx.fillText(Math.round(v) + (L.unit === '%' ? '%' : ''), pad.l - 6, yy + 4); }
  ctx.textAlign = 'left'; ctx.fillText(L.quantity + (L.unit === '%' ? '（%）' : '（' + L.unit + '）') + ' · 鼠标移到曲线上可读出任意时刻的值', pad.l, 15);
  ctx.textAlign = 'center'; for (let s = 0; s <= L.ticks; s += 60) ctx.fillText(s + '秒', x(Math.min(s, L.ticks - 1)), H - 8);
  const rows = sim.rows;
  // 天气/事件底纹
  if (L.id === 'garden') for (const e of sim.env.events) { if (e.from > sim.t && !sim.done) continue; ctx.fillStyle = e.kind === 'rain' ? 'rgba(95,211,255,.10)' : 'rgba(255,140,90,.10)'; ctx.fillRect(x(e.from), pad.t, x(Math.min(e.to, sim.done ? e.to : sim.t)) - x(e.from), H - pad.t - pad.b); ctx.fillStyle = '#9fb3c8'; ctx.fillText(e.kind === 'rain' ? '下雨' : '闷热', x(e.from) + 18, H - pad.b - 4); }
  // 真实连续曲线：第3关运行时看不到（传感器只知道读数点），结束后揭晓
  const showTruth = L.id !== 'sample' || sim.done;
  if (rows.length > 1 && showTruth) {
    ctx.strokeStyle = L.id === 'sample' ? 'rgba(255,255,255,.75)' : '#7fe6dc'; ctx.lineWidth = 2.2; ctx.beginPath();
    rows.forEach((r, i) => { const yy = y(Math.max(L.min, Math.min(L.max, r.truth))); i ? ctx.lineTo(x(r.t), yy) : ctx.moveTo(x(r.t), yy); }); ctx.stroke();
  }
  if (L.id === 'lamp' && rows.length > 1) { ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1; ctx.beginPath(); rows.forEach((r, i) => { const yy = y(Math.min(L.max, r.reading)); i ? ctx.lineTo(x(r.t), yy) : ctx.moveTo(x(r.t), yy); }); ctx.stroke(); }
  if (L.id === 'sample') { for (const r of rows) if (r.reading != null) { ctx.fillStyle = r.reading > 60 ? '#ff7a7a' : '#ffd166'; ctx.beginPath(); ctx.arc(x(r.t), y(r.reading), 3.2, 0, 7); ctx.fill(); } if (sim.done) for (const e of sim.env.events) { const hit = sim.handled.has(e.from); ctx.fillStyle = hit ? '#4cd28a' : '#ff7a7a'; ctx.fillText(hit ? '✓' : '漏', x((e.from + e.to) / 2), y(e.level) - 8); } }
  if (L.id === 'alarm') for (const e of sim.env.events) { if (e.from > sim.t && !sim.done) continue; if (e.kind === 'real' || sim.done) { ctx.fillStyle = e.kind === 'real' ? '#ffb4a8' : '#9fb3c8'; ctx.fillText(e.label, x((e.from + e.to) / 2), y(e.level) - 8); } }
  // 输出条：设备开着的时段
  if (rows.length) { ctx.fillStyle = L.id === 'lamp' ? 'rgba(255,209,102,.8)' : L.id === 'garden' ? 'rgba(63,193,181,.8)' : 'rgba(255,122,122,.8)'; for (const r of rows) if (r.on) ctx.fillRect(x(r.t) - 1, H - pad.b + 2, Math.max(2, x(1) - x(0) + .5), 5); }
  // 阈值线
  const lines = L.fixed ? [{ v: L.fixed.line, color: '#ff7a7a', label: L.fixed.label, fixed: true }] : L.controls.filter(d => !d.options).map(d => ({ v: sim.c[d.key], color: d.color, label: d.label, key: d.key }));
  lines.forEach((ln, i) => {
    const yy = y(ln.v); ctx.strokeStyle = ln.color; ctx.lineWidth = 2.5; ctx.setLineDash(ln.fixed ? [6, 5] : []); ctx.beginPath(); ctx.moveTo(pad.l, yy); ctx.lineTo(W - pad.r, yy); ctx.stroke(); ctx.setLineDash([]);
    if (!ln.fixed) { const hy = yy + (lines.length > 1 && lines[0].v === lines[1].v ? (i ? -13 : 13) : 0); ctx.fillStyle = ln.color; roundRect(ctx, W - pad.r + 4, hy - 12, 96, 24, 9); ctx.fill(); ctx.fillStyle = '#10223a'; ctx.textAlign = 'left'; ctx.font = "bold 12px 'PingFang SC','Microsoft YaHei','Noto Sans CJK SC',sans-serif"; ctx.fillText(`⇕ ${ln.label} ${ln.v}`, W - pad.r + 10, hy + 4); ctx.font = "12px 'PingFang SC','Microsoft YaHei','Noto Sans CJK SC',sans-serif"; }
    else { ctx.fillStyle = ln.color; ctx.textAlign = 'left'; ctx.fillText(ln.label, W - pad.r + 6, yy + 4); }
  });
  // 当前时刻
  if (sim.t && !sim.done) { ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.moveTo(x(sim.t - 1), pad.t); ctx.lineTo(x(sim.t - 1), H - pad.b); ctx.stroke(); }
  // 任意时刻读数（两个时刻之间也有值）
  const sc = $('scrub');
  if (hover != null && rows.length > 1) {
    const tt = Math.max(0, Math.min(rows.length - 1, hover));
    if (showTruth) {
      const v = N.valueAt(rows, tt), xx = x(tt), yy = y(Math.max(L.min, Math.min(L.max, v)));
      ctx.strokeStyle = 'rgba(255,211,107,.6)'; ctx.beginPath(); ctx.moveTo(xx, pad.t); ctx.lineTo(xx, H - pad.b); ctx.stroke();
      ctx.fillStyle = '#ffd36b'; ctx.beginPath(); ctx.arc(xx, yy, 5, 0, 7); ctx.fill();
      sc.hidden = false; sc.style.left = xx + 'px'; sc.style.top = yy + 'px'; sc.textContent = `第${tt.toFixed(1)}秒：${fmt(v)}`;
    } else { sc.hidden = false; sc.style.left = x(tt) + 'px'; sc.style.top = pad.t + 30 + 'px'; sc.textContent = '传感器只知道读数点；跑完这一晚再看真实曲线'; }
  } else sc.hidden = true;
}
function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

/* ---------------- 场景 ---------------- */
let bg = null;
function backdrop(W, H) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 800 430" preserveAspectRatio="xMidYMax slice"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1630"/><stop offset="1" stop-color="#1d3a66"/></linearGradient></defs><rect width="800" height="430" fill="url(#s)"/>${starDots(70, 5 + L.n, 800, 220)}<circle cx="690" cy="62" r="26" fill="#fff6d8" opacity=".9"/>${building(20, 360, 150, 230, 3 + L.n, { lit: .4 })}${building(600, 360, 180, 260, 9 + L.n, { lit: .35, color: '#1a3150' })}<rect y="360" width="800" height="70" fill="#14263f"/></svg>`;
  const im = new Image(); im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); return im;
}
function draw(now = performance.now()) {
  if (!L || !sim) return;
  drawChart();
  const c = $('scene'), d = c._d || 1, W = c.width / d, H = c.height / d, ctx = c.getContext('2d');
  ctx.setTransform(d, 0, 0, d, 0, 0); ctx.clearRect(0, 0, W, H);
  bg ||= backdrop(Math.round(W), Math.round(H));
  const s = Math.max(W / 800, H / 430), ox = (W - 800 * s) / 2, oy = H - 430 * s;
  if (bg.complete) ctx.drawImage(bg, 0, 0, W, H); else bg.onload = () => draw();
  ctx.save(); ctx.translate(ox, oy); ctx.scale(s, s);
  const row = sim.rows.at(-1) || null, t = now / 1000;
  ({ garden: sceneGarden, lamp: sceneLamp, sample: sceneSample, alarm: sceneAlarm })[L.id](ctx, row, t);
  ctx.restore();
}
function label(ctx, text, x, y, color = '#e8f1f7', size = 15) { ctx.font = `bold ${size}px 'PingFang SC','Microsoft YaHei','Noto Sans CJK SC',sans-serif`; ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.fillText(text, x, y); }
function drawXiaodi(ctx, x, y, sc = 1) { if (imgs.xiaodi?.complete) ctx.drawImage(imgs.xiaodi, x, y, 80 * sc, 100 * sc); }
function sceneGarden(ctx, row, t) {
  const m = row ? row.truth : sim.value, w = row?.weather || 'sunny';
  // 花坛
  ctx.fillStyle = '#5C4033'; ctx.beginPath(); ctx.ellipse(400, 372, 230, 34, 0, 0, 7); ctx.fill();
  ctx.fillStyle = `rgba(30,90,140,${Math.min(.75, m / 130)})`; ctx.beginPath(); ctx.ellipse(400, 372, 225 * (m / 100), 30 * (m / 100), 0, 0, 7); ctx.fill();
  const mood = m < 30 ? 'dry' : m > 85 ? 'wet' : 'ok';
  const prog = Math.min(1, sim.stats.good / (L.ticks * .8));
  for (const [px, k] of [[330, .8], [400, 1], [470, .85]]) { ctx.save(); ctx.translate(px, 362); ctx.scale(k, k); drawPlant(ctx, 0, 0, prog, mood, t * 1000 + px); ctx.restore(); }
  // 水泵与水管
  ctx.fillStyle = '#3fc1b5'; ctx.fillRect(140, 318, 46, 46); ctx.fillStyle = '#0b1630'; ctx.fillRect(148, 326, 30, 12);
  label(ctx, '水泵', 163, 392, '#9fb3c8', 13);
  ctx.strokeStyle = '#2b8f86'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(186, 330); ctx.quadraticCurveTo(250, 280, 300, 300); ctx.stroke();
  if (row?.on) { ctx.fillStyle = '#7fd8ff'; for (let i = 0; i < 9; i++) { const p = (t * 2 + i / 9) % 1; ctx.beginPath(); ctx.arc(300 + p * 70, 300 + p * p * 55, 3, 0, 7); ctx.fill(); } label(ctx, '浇水中', 163, 308, '#7fe6dc', 14); }
  // 湿度传感器
  ctx.fillStyle = '#ffd166'; ctx.fillRect(552, 330, 8, 40); ctx.beginPath(); ctx.arc(556, 326, 9, 0, 7); ctx.fill();
  label(ctx, `湿度 ${row ? row.reading : '—'}%`, 556, 310, '#ffd166', 15);
  // 天气
  if (w === 'rain') { ctx.strokeStyle = 'rgba(150,200,255,.7)'; ctx.lineWidth = 1.5; for (let i = 0; i < 60; i++) { const x = (i * 53 + t * 220) % 800, y = (i * 97 + t * 400) % 360; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 4, y + 12); ctx.stroke(); } label(ctx, '🌧 下雨：湿度往上涨', 400, 40, '#9fd8ff', 18); }
  else if (w === 'heat') { label(ctx, '🌡 闷热：蒸发加快，湿度掉得更快', 400, 40, '#ffb38a', 18); }
  else label(ctx, '晴：水分慢慢蒸发', 400, 40, '#9fb3c8', 16);
  label(ctx, mood === 'dry' ? '太干了！' : mood === 'wet' ? '太湿了！' : '舒服', 400, 150, mood === 'ok' ? '#4cd28a' : '#ff9a8e', 18);
  drawXiaodi(ctx, 640, 270, .9);
}
function sceneLamp(ctx, row, t) {
  const lux = row ? row.truth : sim.env.truth[0], dark = 1 - Math.min(1, lux / 420);
  ctx.fillStyle = `rgba(0,4,16,${dark * .55})`; ctx.fillRect(0, 0, 800, 430);
  // 路灯
  ctx.fillStyle = '#5c6f86'; ctx.fillRect(392, 150, 12, 210); ctx.fillRect(392, 150, 70, 8);
  const on = row?.on;
  if (on) { const gr = ctx.createRadialGradient(460, 170, 4, 460, 260, 170); gr.addColorStop(0, 'rgba(255,220,130,.85)'); gr.addColorStop(1, 'rgba(255,220,130,0)'); ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(445, 165); ctx.lineTo(370, 365); ctx.lineTo(560, 365); ctx.closePath(); ctx.fill(); }
  ctx.fillStyle = sim.broken ? '#555' : on ? '#ffe9a8' : '#8a96a6'; ctx.beginPath(); ctx.ellipse(460, 164, 18, 9, 0, 0, 7); ctx.fill();
  if (sim.broken) label(ctx, '💥 灯泡烧坏了', 460, 130, '#ff9a8e', 17);
  // 磨损格
  for (let i = 0; i < L.wearLimit; i++) { ctx.fillStyle = i < sim.switches ? '#ff7a7a' : '#2c4766'; ctx.fillRect(330 + i * 14, 392, 10, 10); }
  label(ctx, '灯泡寿命（每开关一次少一格）', 400, 420, '#9fb3c8', 12);
  // 车灯事件
  for (const e of sim.env.events) if (e.kind === 'car' && row && row.t >= e.from - 6 && row.t < e.to + 6) { const p = (row.t - e.from + 6) / (e.to - e.from + 12); const cx = 820 - p * 900; ctx.fillStyle = '#c94b4b'; ctx.fillRect(cx, 335, 70, 24); ctx.fillStyle = 'rgba(255,250,200,.55)'; ctx.beginPath(); ctx.moveTo(cx, 342); ctx.lineTo(cx - 140, 320); ctx.lineTo(cx - 140, 365); ctx.closePath(); ctx.fill(); label(ctx, '车灯晃过，读数突然变大', 400, 80, '#ffe9a8', 16); }
  // 光照传感器
  ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.arc(398, 146, 7, 0, 7); ctx.fill();
  label(ctx, `光照 ${row ? row.reading : '—'} lux`, 300, 146, '#ffd166', 15);
  if (row && row.truth < 80 && !on) label(ctx, '好黑，看不清路！', 220, 300, '#ff9a8e', 16);
  ctx.save(); ctx.globalAlpha = .95; drawXiaodi(ctx, 180 + Math.sin(t) * 6, 268, .9); ctx.restore();
}
function sceneSample(ctx, row, t) {
  // 监测站
  ctx.fillStyle = '#5c6f86'; ctx.fillRect(392, 190, 14, 170); ctx.fillStyle = '#3fc1b5'; roundRect(ctx, 360, 160, 80, 44, 10); ctx.fill();
  ctx.fillStyle = '#0b1630'; ctx.fillRect(370, 170, 60, 16); label(ctx, '噪声传感器', 400, 226, '#9fb3c8', 13);
  if (row?.reading != null) { ctx.strokeStyle = row.on ? '#ff7a7a' : '#7fe6dc'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(400, 182, 30, 0, 7); ctx.stroke(); label(ctx, `读到 ${row.reading} dB`, 400, 146, row.on ? '#ff9a8e' : '#7fe6dc', 16); }
  else if (row) label(ctx, sim.battery ? '休眠中（这一秒不读数）' : '没电了', 400, 146, '#9fb3c8', 14);
  // 电池
  ctx.strokeStyle = '#9fb3c8'; ctx.lineWidth = 2; ctx.strokeRect(560, 170, 150, 34); ctx.fillStyle = sim.battery > 30 ? '#4cd28a' : '#ff7a7a'; ctx.fillRect(563, 173, 144 * sim.battery / L.battery, 28);
  label(ctx, `电池 ${sim.battery}/${L.battery}`, 635, 228, '#e8f1f7', 15);
  // 声源（真实声音，不管有没有被读到）
  for (const e of sim.env.events) if (row && row.t >= e.from && row.t < e.to) { label(ctx, `📢 ${e.label}`, 180, 260, '#ffb4a8', 20); for (let i = 1; i <= 3; i++) { ctx.strokeStyle = `rgba(255,150,140,${.7 - i * .18})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(180, 300, 20 * i + (t * 30 % 20), -0.9, 0.9); ctx.stroke(); } }
  label(ctx, `已记录 ${sim.stats.caught} · 漏掉 ${sim.stats.missed}`, 400, 60, '#e8f1f7', 18);
  drawXiaodi(ctx, 470, 262, .9);
}
function sceneAlarm(ctx, row, t) {
  // 广场：音响、楼、小递
  ctx.fillStyle = '#21385a'; ctx.fillRect(80, 330, 640, 30);
  ctx.fillStyle = '#ff7a7a'; ctx.beginPath(); ctx.arc(120, 150, 10, 0, 7); ctx.fill(); label(ctx, '噪声监测屏', 120, 130, '#9fb3c8', 13);
  ctx.fillStyle = '#0b1630'; roundRect(ctx, 60, 160, 120, 60, 10); ctx.fill(); label(ctx, row ? `${row.reading} dB` : '— dB', 120, 200, row?.on ? '#ff7a7a' : '#7fe6dc', 22);
  const ev = row && sim.env.events.find(e => row.t >= e.from && row.t < e.to);
  if (ev) { label(ctx, (ev.kind === 'real' ? '📢 ' : '🔈 ') + ev.label, 560, 250, ev.kind === 'real' ? '#ffb4a8' : '#cfe0ee', 20); for (let i = 1; i <= 3; i++) { ctx.strokeStyle = `rgba(255,150,140,${.7 - i * .18})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(560, 300, 18 * i + (t * 30 % 18), -0.9, 0.9); ctx.stroke(); } }
  const going = row?.on, x = going ? 470 : 230;
  drawXiaodi(ctx, x + (going ? Math.sin(t * 8) * 4 : 0), 250, .95);
  label(ctx, going ? '小递出发劝导！' : '小递待命', x + 40, 240, going ? '#ffd36b' : '#9fb3c8', 15);
  label(ctx, `劝导 ${sim.stats.caught} · 误报 ${sim.stats.falseAlarm} · 漏报 ${sim.stats.missed}`, 400, 60, '#e8f1f7', 18);
}

/* 走查与教师演示：window.__nightgame 只读状态 + 快进 */
globalThis.__nightgame = { get phase() { return phase; }, get level() { return L?.id; }, get sim() { return sim; }, fastForward, setCtrl: c => setCtrl(c) };
boot();
