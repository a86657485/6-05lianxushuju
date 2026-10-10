/* 小递夜巡 · 小区自动管家：奖励小游戏前端。规则与计分全在 night-core.js（服务端用同一份重算）。 */
import { api, escape, uniqueId } from '/sync.mjs?v=1';
import { loadAssets } from '/game/assets.mjs?v=1';
import { drawScene, Particles, ensureXiaodi, roundRect, label as sceneLabel } from '/game/scene-art.mjs?v=1';

const N = globalThis.NightCore;
const $ = id => document.getElementById(id);
const mode = location.pathname === '/game-test' ? 'test' : 'student';
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const TPS = 12; // 每秒推进的“秒数”（数据格）
let me = null, status = null, prog = null, L = null, sim = null, phase = 'gate', seed = 1, last = 0, acc = 0, raf = 0, lastResult = null, drag = null, hover = null;

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
  ensureXiaodi();
  loadAssets().then(() => { bg = null; draw(); setTimeout(draw, 80); setTimeout(draw, 300); });
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
function starHtml(n) {
  return [0, 1, 2].map(i => i < n
    ? '<img class="g-star-img" src="/game/assets/ui/star.png" alt="★" width="28" height="28">'
    : '<img class="g-star-img off" src="/game/assets/ui/star_outline.png" alt="" width="28" height="28">').join('');
}
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
  // 图表底板
  const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0, '#0c1a32'); bgGrad.addColorStop(1, '#0a1528');
  ctx.fillStyle = bgGrad; ctx.fillRect(0, 0, W, H);
  ctx.font = "12px 'PingFang SC','Microsoft YaHei','Noto Sans CJK SC',sans-serif";
  for (const z of L.zones) {
    const top = y(Math.min(L.max, z.to)), bot = y(Math.max(L.min, z.from));
    ctx.fillStyle = z.color; ctx.fillRect(pad.l, top, W - pad.l - pad.r, bot - top);
    // 区带标签小胶囊
    ctx.fillStyle = 'rgba(8,20,40,.65)'; roundRect(ctx, pad.l + 6, top + 4, ctx.measureText(z.label).width + 12, 18, 6); ctx.fill();
    ctx.fillStyle = '#cfe0ee'; ctx.textAlign = 'left'; ctx.fillText(z.label, pad.l + 12, top + 16);
  }
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
    const pts = rows.map(r => [x(r.t), y(Math.max(L.min, Math.min(L.max, r.truth)))]);
    // 曲线下方填充
    ctx.beginPath(); ctx.moveTo(pts[0][0], H - pad.b);
    pts.forEach(([xx, yy]) => ctx.lineTo(xx, yy));
    ctx.lineTo(pts.at(-1)[0], H - pad.b); ctx.closePath();
    const fill = ctx.createLinearGradient(0, pad.t, 0, H - pad.b);
    fill.addColorStop(0, L.id === 'sample' ? 'rgba(255,255,255,.12)' : 'rgba(127,230,220,.18)');
    fill.addColorStop(1, 'rgba(127,230,220,0)');
    ctx.fillStyle = fill; ctx.fill();
    // 光晕描边
    ctx.strokeStyle = L.id === 'sample' ? 'rgba(255,255,255,.25)' : 'rgba(127,230,220,.35)';
    ctx.lineWidth = 6; ctx.lineJoin = 'round'; ctx.beginPath();
    pts.forEach(([xx, yy], i) => i ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy)); ctx.stroke();
    ctx.strokeStyle = L.id === 'sample' ? 'rgba(255,255,255,.9)' : '#7fe6dc';
    ctx.lineWidth = 2.4; ctx.beginPath();
    pts.forEach(([xx, yy], i) => i ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy)); ctx.stroke();
  }
  if (L.id === 'lamp' && rows.length > 1) { ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1; ctx.beginPath(); rows.forEach((r, i) => { const yy = y(Math.min(L.max, r.reading)); i ? ctx.lineTo(x(r.t), yy) : ctx.moveTo(x(r.t), yy); }); ctx.stroke(); }
  if (L.id === 'sample') {
    for (const r of rows) if (r.reading != null) {
      const yy = y(r.reading), xx = x(r.t), hot = r.reading > 60;
      ctx.fillStyle = hot ? 'rgba(255,122,122,.35)' : 'rgba(255,209,102,.35)';
      ctx.beginPath(); ctx.arc(xx, yy, 7, 0, 7); ctx.fill();
      ctx.fillStyle = hot ? '#ff7a7a' : '#ffd166'; ctx.beginPath(); ctx.arc(xx, yy, 3.8, 0, 7); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
    }
    if (sim.done) for (const e of sim.env.events) {
      const hit = sim.handled.has(e.from);
      ctx.fillStyle = hit ? '#4cd28a' : '#ff7a7a';
      ctx.font = "bold 13px 'PingFang SC','Microsoft YaHei',sans-serif";
      ctx.textAlign = 'center'; ctx.fillText(hit ? '✓ 记录到' : '漏掉了', x((e.from + e.to) / 2), y(e.level) - 12);
    }
  }
  if (L.id === 'alarm') for (const e of sim.env.events) { if (e.from > sim.t && !sim.done) continue; if (e.kind === 'real' || sim.done) { ctx.fillStyle = e.kind === 'real' ? '#ffb4a8' : '#9fb3c8'; ctx.fillText(e.label, x((e.from + e.to) / 2), y(e.level) - 8); } }
  // 输出条：设备开着的时段
  if (rows.length) { ctx.fillStyle = L.id === 'lamp' ? 'rgba(255,209,102,.8)' : L.id === 'garden' ? 'rgba(63,193,181,.8)' : 'rgba(255,122,122,.8)'; for (const r of rows) if (r.on) ctx.fillRect(x(r.t) - 1, H - pad.b + 2, Math.max(2, x(1) - x(0) + .5), 5); }
  // 阈值线
  const lines = L.fixed ? [{ v: L.fixed.line, color: '#ff7a7a', label: L.fixed.label, fixed: true }] : L.controls.filter(d => !d.options).map(d => ({ v: sim.c[d.key], color: d.color, label: d.label, key: d.key }));
  lines.forEach((ln, i) => {
    const yy = y(ln.v); ctx.strokeStyle = ln.color; ctx.lineWidth = 2.5; ctx.setLineDash(ln.fixed ? [6, 5] : []); ctx.beginPath(); ctx.moveTo(pad.l, yy); ctx.lineTo(W - pad.r, yy); ctx.stroke(); ctx.setLineDash([]);
    // 阈值线光晕
    ctx.strokeStyle = ln.color; ctx.globalAlpha = .25; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(pad.l, yy); ctx.lineTo(W - pad.r, yy); ctx.stroke(); ctx.globalAlpha = 1;
    if (!ln.fixed) {
      const hy = yy + (lines.length > 1 && lines[0].v === lines[1].v ? (i ? -14 : 14) : 0);
      // 拖动手柄
      const hx = W - pad.r + 8, hw = 92, hh = 28;
      roundRect(ctx, hx, hy - hh / 2, hw, hh, 10);
      const hg = ctx.createLinearGradient(hx, hy - hh / 2, hx, hy + hh / 2);
      hg.addColorStop(0, ln.color); hg.addColorStop(1, ln.color + 'cc');
      ctx.fillStyle = ln.color; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 1.5; ctx.stroke();
      // 中间小圆点暗示可拖
      ctx.fillStyle = '#10223a'; ctx.beginPath(); ctx.arc(hx + 14, hy, 5, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(hx + 14, hy - 2, 1.5, 0, 7); ctx.arc(hx + 14, hy + 2, 1.5, 0, 7); ctx.fill();
      ctx.fillStyle = '#10223a'; ctx.textAlign = 'left';
      ctx.font = "bold 12px 'PingFang SC','Microsoft YaHei','Noto Sans CJK SC',sans-serif";
      ctx.fillText(`${ln.label} ${ln.v}`, hx + 24, hy + 4);
      ctx.font = "12px 'PingFang SC','Microsoft YaHei','Noto Sans CJK SC',sans-serif";
      // 线上菱形抓手
      ctx.fillStyle = ln.color; ctx.beginPath();
      ctx.moveTo(pad.l + 8, yy); ctx.lineTo(pad.l + 16, yy - 7); ctx.lineTo(pad.l + 24, yy); ctx.lineTo(pad.l + 16, yy + 7); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2; ctx.stroke();
    } else { ctx.fillStyle = ln.color; ctx.textAlign = 'left'; ctx.fillText(ln.label, W - pad.r + 6, yy + 4); }
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

/* ---------------- 场景 ---------------- */
let bg = null;
const particles = new Particles();
let lastPart = performance.now();
function draw(now = performance.now()) {
  if (!L || !sim) return;
  drawChart();
  const c = $('scene'), d = c._d || 1, W = c.width / d, H = c.height / d, ctx = c.getContext('2d');
  ctx.setTransform(d, 0, 0, d, 0, 0); ctx.clearRect(0, 0, W, H);
  const dt = Math.min(0.05, (now - lastPart) / 1000); lastPart = now;
  particles.update(dt);
  const row = sim.rows.at(-1) || null;
  drawScene(ctx, W, H, L, sim, row, now / 1000, particles);
  particles.draw(ctx);
}

/* 走查与教师演示：window.__nightgame 只读状态 + 快进 */
globalThis.__nightgame = { get phase() { return phase; }, get level() { return L?.id; }, get sim() { return sim; }, fastForward, setCtrl: c => setCtrl(c) };
boot();
