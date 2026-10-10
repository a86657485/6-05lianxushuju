/* 五个“小区地点”的实验：画面在世界里，控件只有当前需要的几个；记录格式与 rules.js 判定保持不变。 */
import { makeScale, pathOf, axes, svgOpen, samplePoints, neighbours, valueAt } from './charts.mjs';
import { escape } from './sync.mjs';
import { building, tree, person, speaker, stars, notes } from './world-art.mjs';

const R = () => globalThis.LessonRules;
const round1 = v => Math.round(v * 10) / 10;
const reduced = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

class Base {
  constructor(ctx) { this.ctx = ctx; this.timers = new Set(); }
  every(fn, ms) { const id = setInterval(fn, ms); this.timers.add(id); return id; }
  later(fn, ms) { const id = setTimeout(() => { this.timers.delete(id); fn(); }, ms); this.timers.add(id); return id; }
  stopTimer(id) { clearInterval(id); clearTimeout(id); this.timers.delete(id); }
  destroy() { for (const id of this.timers) { clearInterval(id); clearTimeout(id); } this.timers.clear(); }
  options() { return {}; }
}
const nightSky = (w, h, seed) => `<defs><linearGradient id="sky${seed}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1630"/><stop offset="1" stop-color="#1d3550"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#sky${seed})"/>${stars(40, seed, w, h * .55)}`;

/* ---------- 1 广场监测器：输入—计算—输出 ---------- */
export class FlowExperiment extends Base {
  mount(scene, controls) {
    this.scene = scene; this.seed = (this.ctx.record().trials || []).length + 1; this.busy = false;
    scene.innerHTML = `<div class="flow-world">${plazaSvg()}</div>
      <div class="ipo-board" aria-label="监测器透视：三个环节">
        <div class="ipo-box" id="ipo-input"><small>输入</small><b>声音采集</b><span class="data-chip" id="chip-input">等待</span></div>
        <span class="ipo-arrow" aria-hidden="true"><i></i></span>
        <div class="ipo-box" id="ipo-compute"><small>计算</small><b>与 55 dB 比较</b><span class="data-chip" id="chip-compute">等待</span></div>
        <span class="ipo-arrow" aria-hidden="true"><i></i></span>
        <div class="ipo-box" id="ipo-output"><small>输出</small><b>显示屏 · 提示</b><span class="data-chip" id="chip-output">等待</span><i class="alarm-dot" id="flow-alarm" aria-hidden="true"></i></div>
      </div>`;
    controls.innerHTML = `<div class="sound-cards" role="group" aria-label="让广场上出现一种声音">
      <button id="src-quiet" data-scene="quiet" class="sound-card"><span aria-hidden="true">🌙</span>夜深人静</button>
      <button id="src-chat" data-scene="chat" class="sound-card"><span aria-hidden="true">🗣</span>小声聊天</button>
      <button id="src-dance" data-scene="dance" class="sound-card"><span aria-hidden="true">🎵</span>广场舞音乐</button></div>`;
    controls.querySelectorAll('[data-scene]').forEach(b => b.onclick = () => this.measure(b.dataset.scene));
    const last = (this.ctx.record().trials || []).at(-1);
    if (last && R().squareScenes[last.scene]) this.show(last.scene, last.db, true);
  }
  options() { return { busy: this.busy }; }
  measure(sceneKey) {
    if (this.busy) this.cancelRun?.();
    const rules = R(), db = rules.measureSquare(sceneKey, this.seed++), over = rules.overLimit(db);
    this.busy = true; this.ctx.refresh(); this.ctx.pose('interact');
    const display = this.scene.querySelector('#display-num'), world = this.scene.querySelector('.flow-world');
    world.dataset.scene = sceneKey; world.classList.add('flowing');
    ['input', 'compute', 'output'].forEach(k => { this.scene.querySelector('#chip-' + k).textContent = '…'; this.scene.querySelector('#ipo-' + k).classList.remove('active', 'over'); });
    this.scene.querySelector('#flow-alarm').classList.remove('on');
    const finish = () => { this.busy = false; world.classList.remove('flowing'); this.show(sceneKey, db, false); this.ctx.addTrial({ scene: sceneKey, db, over, at: Date.now() }); };
    if (reduced()) { display.textContent = db.toFixed(1); finish(); return; }
    const start = Date.now(), base = rules.squareScenes[sceneKey].base;
    const ticker = this.every(() => {
      const t = (Date.now() - start) / 1000;
      display.textContent = (base + 2.5 * Math.sin(t * 9 + base)).toFixed(1);
      if (t > 0.35) this.chip('input', db.toFixed(1) + ' dB');
      if (t > 0.8) this.chip('compute', '比较中…');
    }, 70);
    const done = this.later(() => { this.stopTimer(ticker); display.textContent = db.toFixed(1); finish(); }, 1300);
    this.cancelRun = () => { this.stopTimer(ticker); this.stopTimer(done); this.busy = false; };
  }
  chip(k, text) { const c = this.scene.querySelector('#chip-' + k); if (c.textContent !== text) { c.textContent = text; this.scene.querySelector('#ipo-' + k).classList.add('active'); } }
  show(sceneKey, db, quiet) {
    const over = R().overLimit(db);
    this.scene.querySelector('.flow-world').dataset.scene = sceneKey;
    this.scene.querySelector('#display-num').textContent = db.toFixed(1);
    this.chip('input', '声音 ' + db.toFixed(1) + ' dB');
    this.chip('compute', db.toFixed(1) + (over ? ' > ' : ' ≤ ') + '55 → ' + (over ? '超标' : '未超标'));
    this.chip('output', '显示 ' + db.toFixed(1) + (over ? '；发出提示' : '；不提示'));
    this.scene.querySelector('#ipo-output').classList.toggle('over', over);
    this.scene.querySelector('#flow-alarm').classList.toggle('on', over);
    this.scene.querySelector('.flow-world').classList.toggle('alert', over);
    if (!quiet) this.ctx.say(over ? `${db.toFixed(1)} dB 超过了55：计算结果“超标”，输出提示！` : `${db.toFixed(1)} dB 没超过55：计算结果“未超标”，只显示数值。`, over ? 'bad' : 'good');
  }
}
function plazaSvg() {
  let dancers = '', chat = '';
  ['#e2725b', '#8e6cc1', '#3fa57c', '#f0b429', '#4aa3c7'].forEach((c, i) => { dancers += `<g class="bob" style="--d:${i * .13}s">${person(150 + i * 62, 352, .55, i * .2, c, { fan: i % 2 === 0 })}</g>`; });
  ['#4aa3c7', '#e9a03b', '#6fbf73'].forEach((c, i) => { chat += person(830 + i * 46, 352, .52, .25, c); });
  return `<svg viewBox="0 0 1200 380" class="world-svg" preserveAspectRatio="xMidYMid meet" role="img" aria-label="夜晚的小区广场与噪声监测器">
  ${nightSky(1200, 380, 11)}<circle cx="1110" cy="58" r="32" fill="#fff4c9" opacity=".95"/>
  ${building(20, 330, 190, 250, 3, { lit: .5 })}${building(1000, 330, 190, 270, 7, { lit: .4 })}${building(230, 330, 120, 170, 5, { lit: .3 })}
  <rect y="330" width="1200" height="50" fill="#263a4c"/><ellipse cx="420" cy="350" rx="330" ry="24" fill="#2f4558"/>
  ${tree(950, 345, .45, true, 2)}${tree(70, 352, .4, true, 4)}
  <g class="quiet-only"><text x="560" y="220" fill="#9fd8ff" font-size="28" opacity=".7">z z z</text></g>
  <g class="dance-only">${speaker(100, 352, .55)}<g class="notes-g">${notes(110, 270, 0, 4)}</g>${dancers}</g>
  <g class="chat-only">${chat}<text x="870" y="250" fill="#ffe9b8" font-size="22">叽叽…</text></g>
  <g class="monitor"><rect x="666" y="168" width="14" height="184" fill="#7d8c96"/><rect x="640" y="346" width="66" height="8" rx="3" fill="#5b6870"/>
  <circle cx="673" cy="184" r="9" fill="#d6e4ea"/><g class="mic-wave"><path d="M650 184 a24 24 0 0 1 0 -1" /></g>
  <g id="display-box"><rect class="alert-glow" x="548" y="22" width="250" height="140" rx="20" fill="#ff3b30" opacity="0"/><rect x="560" y="34" width="226" height="116" rx="14" fill="#0d1014" stroke="#9fb3bd" stroke-width="4"/>
  <text x="576" y="60" fill="#9fd8ff" font-size="16" font-weight="700">小区噪声监测</text><circle class="status-led" cx="764" cy="54" r="7" fill="#4cd964"/>
  <text id="display-num" x="726" y="122" fill="#ff5b4d" font-size="54" font-weight="800" text-anchor="end" font-family="'DejaVu Sans Mono',Consolas,monospace">--.-</text><text x="732" y="122" fill="#ff5b4d" font-size="20" font-weight="700">dB</text></g></g>
  <g class="data-dots"><circle r="7" fill="#5fd3ff"/><circle r="7" fill="#5fd3ff"/><circle r="7" fill="#5fd3ff"/></g>
  </svg>`;
}

/* ---------- 2 声音记录亭：波形与散点 ---------- */
export class WaveExperiment extends Base {
  mount(scene, controls) {
    const rec = this.ctx.record();
    this.source = 'simulation'; this.recording = false; this.points = rec.lastTrace?.points || []; this.unit = rec.lastTrace?.unit || 'dB';
    this.view = 'both'; this.marker = null; this.lastSpanSmall = false; this.knob = 45; this.sim = 45;
    const micOk = globalThis.isSecureContext && !!navigator.mediaDevices?.getUserMedia;
    scene.innerHTML = `<div class="screen-frame wave-frame"><div class="screen-top"><b>声音记录仪</b><span class="src-seg" role="group" aria-label="声音来源">
        <button id="source-sim" class="seg-btn" data-source="simulation" aria-pressed="true">模拟推杆</button>
        <button id="source-teacher" class="seg-btn" data-source="teacher" aria-pressed="false">教师现场</button>
        ${micOk ? '<button id="source-mic" class="seg-btn" data-source="microphone" aria-pressed="false">本机麦克风</button>' : ''}</span></div>
      <div id="wave-chart" class="wave-chart" tabindex="0" aria-label="声音曲线，可在两个圆点之间点击读数"></div>
      <div class="chart-legend"><span><i class="lg-curve"></i>连续曲线</span><span><i class="lg-dot"></i>每2秒记一个读数（散点）</span><button id="view-toggle" class="mini-btn">只看散点</button><span id="wave-readout" class="readout" aria-live="polite"></span></div></div>`;
    controls.innerHTML = `<div class="console-row">
      <button id="record" class="rec-btn" aria-label="开始记录10秒"><span class="rec-dot"></span><b id="rec-label">录10秒</b></button>
      <label class="fader ctl" id="knob-row"><span>🔈</span><input id="knob" type="range" min="30" max="90" step="1" value="45" aria-label="音量推杆（模拟声音）"><span>🔊</span><b id="knob-val">45 dB</b></label>
      <span id="rec-status" class="rec-status" role="status"></span></div><p id="mic-status" class="console-note"></p>`;
    controls.querySelectorAll('[data-source]').forEach(b => b.onclick = () => this.setSource(b.dataset.source));
    scene.querySelectorAll('[data-source]').forEach(b => b.onclick = () => this.setSource(b.dataset.source));
    const knob = controls.querySelector('#knob');
    knob.oninput = () => { this.knob = Number(knob.value); controls.querySelector('#knob-val').textContent = knob.value + ' dB'; };
    controls.querySelector('#record').onclick = () => this.recording ? this.stop(false) : this.start();
    scene.querySelector('#view-toggle').onclick = e => { this.view = this.view === 'both' ? 'dots' : 'both'; e.target.textContent = this.view === 'both' ? '只看散点' : '显示曲线'; this.draw(); };
    this.controls = controls; this.scene = scene;
    scene.querySelector('#wave-chart').addEventListener('click', e => this.pick(e));
    this.draw();
  }
  options() { return { source: this.source, recording: this.recording, liveFresh: this.ctx.liveFresh(), lastSpanSmall: this.lastSpanSmall }; }
  setSource(src) {
    if (this.recording) this.stop(true);
    this.source = src;
    this.scene.querySelectorAll('[data-source]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.source === src)));
    this.controls.querySelector('#knob-row').hidden = src !== 'simulation';
    const ms = this.controls.querySelector('#mic-status');
    if (src === 'microphone') { ms.textContent = '正在请求麦克风…'; this.ctx.startMic(msg => ms.textContent = msg); }
    else { this.ctx.stopMic(); ms.textContent = src === 'teacher' ? (this.ctx.liveFresh() ? '已连接教师现场监测（相对响度，不是分贝）。' : '老师还没开启现场监测，可以先用模拟推杆。') : ''; }
    this.ctx.watchLive(src === 'teacher');
    this.ctx.refresh();
  }
  current() {
    if (this.source === 'simulation') {
      this.sim += (this.knob - this.sim) * 0.25; this.phase = (this.phase || 0) + 1;
      return round1(this.sim + 1.2 * Math.sin(this.phase * 0.9) + 0.6 * Math.sin(this.phase * 2.3));
    }
    if (this.source === 'teacher') return this.ctx.liveFresh() ? round1(this.ctx.live().level) : null;
    return this.ctx.micLevel() === null ? null : round1(this.ctx.micLevel() * 100);
  }
  start() {
    const first = this.current();
    if (first === null) { this.controls.querySelector('#rec-status').textContent = this.source === 'teacher' ? '还收不到教师现场数据。' : '麦克风还没有准备好。'; return; }
    this.recording = true; this.points = []; this.marker = null; this.unit = this.source === 'simulation' ? 'dB' : '相对响度'; this.started = Date.now();
    this.controls.querySelector('#record').classList.add('on'); this.controls.querySelector('#rec-label').textContent = '停止';
    this.ctx.pose('interact');
    this.tick = this.every(() => {
      const t = (Date.now() - this.started) / 1000, v = this.current();
      if (v !== null) this.points.push([round1(Math.min(10, t)), v]);
      this.controls.querySelector('#rec-status').textContent = '记录中 ' + Math.min(10, t).toFixed(1) + ' / 10 秒';
      this.draw();
      if (t >= 10) this.stop(false);
    }, 100);
    this.ctx.refresh();
  }
  stop(cancelled) {
    this.stopTimer(this.tick); this.recording = false;
    this.controls.querySelector('#record').classList.remove('on'); this.controls.querySelector('#rec-label').textContent = '重录10秒';
    const vals = this.points.map(p => p[1]);
    if (!cancelled && this.points.length >= 30) {
      const min = Math.min(...vals), max = Math.max(...vals);
      this.lastSpanSmall = max - min < 15;
      this.controls.querySelector('#rec-status').textContent = this.lastSpanSmall ? '声音几乎没变化，再录一次' : '✓ 曲线已自动保存';
      if (this.lastSpanSmall) this.ctx.say('这段声音起伏不到15，看不出变化。再录一次，让声音大起大落。', 'bad');
      else this.ctx.say('曲线已保存：10秒里 ' + this.points.length + ' 个读数，在 ' + min + '—' + max + ' 之间。', 'good');
      this.ctx.addTrial({ kind: 'trace', source: this.source, samples: this.points.length, min, max, unit: this.unit, at: Date.now() }, { lastTrace: { points: this.points, unit: this.unit } });
    } else {
      this.controls.querySelector('#rec-status').textContent = '记录时间太短，未保存';
      this.ctx.refresh();
    }
    this.draw();
  }
  scale() { const sim = this.unit === 'dB'; return makeScale({ width: 640, height: 250, xMin: 0, xMax: 10, yMin: sim ? 30 : 0, yMax: sim ? 90 : 100 }); }
  draw() {
    const s = this.scale(), sim = this.unit === 'dB', dots = samplePoints(this.points, 2);
    let svg = svgOpen(s, '声音大小随时间变化的曲线', 'dark') + axes(s, { xTicks: [0, 2, 4, 6, 8, 10].map(v => [v, v + '秒']), yTicks: sim ? [30, 45, 60, 75, 90] : [0, 25, 50, 75, 100], yLabel: sim ? '声音（dB，仿真）' : '相对响度（不是分贝）', xLabel: '时间' });
    if (this.points.length > 1 && (this.view === 'both' || this.recording)) svg += `<path d="${pathOf(this.points, s)}" class="curve"/>`;
    if (!this.recording) svg += dots.map(p => `<circle cx="${s.x(p[0])}" cy="${s.y(p[1])}" r="7" class="dot"><title>${p[0]}秒：${p[1]}</title></circle>`).join('');
    if (this.marker) svg += `<line x1="${s.x(this.marker.t)}" x2="${s.x(this.marker.t)}" y1="${s.pad.t}" y2="${s.height - s.pad.b}" class="marker-line"/><circle cx="${s.x(this.marker.t)}" cy="${s.y(this.marker.value)}" r="8" class="marker"/>`;
    if (!this.points.length) svg += `<text x="${s.width / 2}" y="${s.height / 2}" text-anchor="middle" class="empty-text">录音后，声音曲线会画在这里</text>`;
    this.scene.querySelector('#wave-chart').innerHTML = svg + '</svg>';
  }
  pick(e) {
    if (this.recording || this.points.length < 30) return;
    const svg = this.scene.querySelector('#wave-chart svg'), box = svg.getBoundingClientRect(), s = this.scale();
    const t = round1(s.invX((e.clientX - box.left) / box.width * s.width));
    if (t <= 0 || t >= this.points.at(-1)[0]) return;
    const dots = samplePoints(this.points, 2), readout = this.scene.querySelector('#wave-readout');
    if (dots.some(d => Math.abs(d[0] - t) < 0.25)) { readout.textContent = '这里正好是一个圆点，点到两个圆点中间试试。'; return; }
    const { left, right } = neighbours(dots, t);
    if (!left || !right) return;
    const value = round1(valueAt(this.points, t));
    this.marker = { t, value }; this.draw();
    readout.textContent = `${t} 秒：${value}${this.unit === 'dB' ? ' dB' : '（相对响度）'}`;
    this.ctx.say(`读到了：${t} 秒时是 ${value}（在 ${left[0]} 秒和 ${right[0]} 秒两个圆点之间）。这个读数说明什么？到“说清楚”里用它。`, 'good');
    this.ctx.addTrial({ kind: 'between', t, value, leftT: left[0], rightT: right[0], at: Date.now() });
  }
  destroy() { super.destroy(); this.ctx.stopMic(); this.ctx.watchLive(false); }
}

/* ---------- 3 3号楼小明家：窗帘与水壶 ---------- */
export class LifeExperiment extends Base {
  mount(scene, controls) {
    this.luxTrace = []; this.session = []; this.temp = 20; this.kettle = 'idle'; this.tempTrace = [[0, 20]];
    scene.innerHTML = `<div class="room">
      <div class="room-card"><div id="curtain-svg" class="room-art"></div><div id="lux-chart" class="room-chart"></div></div>
      <div class="room-card"><div id="kettle-svg" class="room-art"></div><div id="temp-chart" class="room-chart"></div></div></div>`;
    controls.innerHTML = `<div class="console-row two">
      <label class="fader ctl curtain-ctl"><span>窗帘</span><input id="curtain" type="range" min="0" max="100" step="1" value="0" aria-label="窗帘拉上多少"><b id="curtain-val">0%</b></label>
      <div class="kettle-ctl"><button id="kettle-start" class="big-btn">🔥 开始烧水</button><button id="kettle-read" class="big-btn">🌡 读水温</button><button id="kettle-reset" class="mini-btn">倒掉重烧</button><span id="kettle-status" class="rec-status" role="status"></span></div></div>`;
    this.scene = scene; this.controls = controls;
    const slider = controls.querySelector('#curtain');
    slider.oninput = () => this.curtain(Number(slider.value));
    // 键盘方向键每按一次都会触发 change，所以只重新计时，停手约1秒后再保存整段拉动
    slider.onchange = () => { this.stopTimer(this.idle); this.idle = this.later(() => this.saveCurtain(), 900); };
    controls.querySelector('#kettle-start').onclick = () => this.heat();
    controls.querySelector('#kettle-read').onclick = () => this.read();
    controls.querySelector('#kettle-reset').onclick = () => this.resetKettle();
    this.curtain(0, true); this.drawKettle();
  }
  options() { return { kettleRunning: this.kettle === 'heating' }; }
  lux(v) { return Math.round(800 - 7.4 * v); }
  curtain(v, initial) {
    const lux = this.lux(v);
    this.controls.querySelector('#curtain-val').textContent = v + '%';
    if (!initial) { this.session.push(lux); this.luxTrace.push(lux); if (this.luxTrace.length > 120) this.luxTrace.shift(); this.stopTimer(this.idle); this.idle = this.later(() => this.saveCurtain(), 900); }
    const curtainH = 150 * v / 100, shade = 0.15 + 0.6 * v / 100;
    this.scene.querySelector('#curtain-svg').innerHTML = `<svg viewBox="0 0 320 200" class="mini-svg" role="img" aria-label="窗帘拉上${v}%，光照约${lux} lux">
      <rect width="320" height="200" fill="#e8d9c4"/><rect width="320" height="200" fill="rgba(10,22,40,${shade})"/>
      <rect x="30" y="22" width="150" height="150" fill="#bfe3f5" stroke="#8a6b4f" stroke-width="6"/><circle cx="140" cy="62" r="20" fill="#ffd968"/><path d="M30 150 q40 -30 80 -6 t70 -10 v38 h-150z" fill="#8fd18b"/>
      <rect x="30" y="22" width="150" height="${curtainH}" fill="#d98d5f"/><g fill="#c47a4d">${Array.from({ length: 6 }, (_, i) => `<rect x="${36 + i * 25}" y="22" width="5" height="${curtainH}"/>`).join('')}</g>
      <line x1="105" y1="22" x2="105" y2="172" stroke="#8a6b4f" stroke-width="4"/><rect x="24" y="${18 + curtainH}" width="162" height="8" rx="4" fill="#8a4f2f"/>
      ${gauge(255, 120, lux / 800, lux + ' lux', '光照表')}</svg>`;
    const s = makeScale({ width: 320, height: 110, pad: { l: 40, r: 8, t: 12, b: 16 }, xMin: 0, xMax: Math.max(10, this.luxTrace.length - 1), yMin: 0, yMax: 800 });
    this.scene.querySelector('#lux-chart').innerHTML = svgOpen(s, '光照强度变化曲线', 'mini') + axes(s, { yTicks: [0, 400, 800], yLabel: '光照（lux）' }) + (this.luxTrace.length > 1 ? `<path d="${pathOf(this.luxTrace.map((v2, i) => [i, v2]), s)}" class="curve"/>` : '') + '</svg>';
  }
  saveCurtain() {
    this.stopTimer(this.idle);
    if (this.session.length < 3) return;
    const vals = this.session; this.session = [];
    const distinct = new Set(vals).size;
    this.ctx.addTrial({ kind: 'curtain', distinct, min: Math.min(...vals), max: Math.max(...vals), at: Date.now() });
    if (distinct < 8 || Math.max(...vals) - Math.min(...vals) < 300) this.ctx.say('这次拉得太少或太快（读数少于8个）。再慢慢多拉一段。', 'bad');
    else this.ctx.say('已记录：光照从 ' + Math.max(...vals) + ' 到 ' + Math.min(...vals) + ' lux，经过了 ' + distinct + ' 个不同读数。', 'good');
  }
  heat() {
    if (this.kettle === 'heating') return;
    if (this.kettle === 'done') this.resetKettle();
    this.kettle = 'heating'; const t0 = Date.now() - (this.elapsed || 0) * 1000;
    this.controls.querySelector('#kettle-status').textContent = '加热中…'; this.ctx.pose('interact');
    this.heatTimer = this.every(() => {
      const t = (Date.now() - t0) / 1000; this.elapsed = t;
      this.temp = Math.min(100, round1(20 + 80 * (1 - Math.exp(-t / 5)) / (1 - Math.exp(-3))));
      this.tempTrace.push([round1(t), this.temp]);
      if (this.temp >= 100) { this.temp = 100; this.kettle = 'done'; this.stopTimer(this.heatTimer); this.controls.querySelector('#kettle-status').textContent = '100 ℃，自动断电'; this.ctx.refresh(); }
      this.drawKettle();
    }, 150);
    this.ctx.refresh();
  }
  read() {
    if (this.kettle === 'idle') { this.controls.querySelector('#kettle-status').textContent = '先点“开始烧水”'; return; }
    const r = this.temp;
    this.controls.querySelector('#kettle-status').textContent = '读数 ' + r + ' ℃ ✓';
    this.ctx.addTrial({ kind: 'kettle', reading: r, at: Date.now() });
    if (r >= 100) this.ctx.say('已经到100 ℃了。倒掉重烧，在半路读一个中间的水温。', 'bad');
    else this.ctx.say('已记录：此刻水温 ' + r + ' ℃。', 'good');
  }
  resetKettle() { this.stopTimer(this.heatTimer); this.kettle = 'idle'; this.temp = 20; this.elapsed = 0; this.tempTrace = [[0, 20]]; this.controls.querySelector('#kettle-status').textContent = ''; this.drawKettle(); this.ctx.refresh(); }
  drawKettle() {
    const h = 120 * this.temp / 110, hot = this.kettle === 'heating';
    const steam = hot && this.temp > 50 ? `<g class="steam" fill="none" stroke="#fff" stroke-width="4" opacity=".7"><path d="M95 40 q-10 -12 0 -24"/><path d="M115 44 q-10 -14 0 -28"/></g>` : '';
    this.scene.querySelector('#kettle-svg').innerHTML = `<svg viewBox="0 0 320 200" class="mini-svg" role="img" aria-label="水温${this.temp}摄氏度">
      <rect width="320" height="200" fill="#e8d9c4"/><rect y="168" width="320" height="32" fill="#a77b56"/>${steam}
      <path d="M50 60 h110 l10 108 h-130 z" fill="#d6e4ea" stroke="#6b8794" stroke-width="3"/><path d="M160 80 q44 0 32 44" fill="none" stroke="#6b8794" stroke-width="7"/><rect x="70" y="48" width="70" height="14" rx="6" fill="#6b8794"/>
      <circle cx="105" cy="128" r="10" fill="${hot ? '#e9603b' : '#9fb3bd'}"/>
      <rect x="236" y="26" width="20" height="134" rx="10" fill="#fff" stroke="#6b8794" stroke-width="2"/><rect x="241" y="${152 - h}" width="10" height="${h}" fill="#e9603b"/><circle cx="246" cy="164" r="13" fill="#e9603b"/>
      <text x="264" y="${156 - h}" font-size="14" font-weight="700" fill="#173d50">${this.temp.toFixed(1)}℃</text></svg>`;
    const s = makeScale({ width: 320, height: 110, pad: { l: 40, r: 8, t: 12, b: 16 }, xMin: 0, xMax: 15, yMin: 0, yMax: 100 });
    this.scene.querySelector('#temp-chart').innerHTML = svgOpen(s, '水温变化曲线', 'mini') + axes(s, { yTicks: [0, 50, 100], yLabel: '水温（℃）' }) + `<line x1="${s.pad.l}" x2="${s.width - s.pad.r}" y1="${s.y(100)}" y2="${s.y(100)}" class="threshold-line"/><path d="${pathOf(this.tempTrace, s)}" class="curve warm"/></svg>`;
  }
}
function gauge(cx, cy, ratio, label, title) {
  const a = Math.PI * (1 - Math.max(0, Math.min(1, ratio)));
  const x = cx + 40 * Math.cos(a), y = cy - 40 * Math.sin(a);
  return `<g><rect x="${cx - 58}" y="${cy - 76}" width="116" height="110" rx="12" fill="#173d50"/><path d="M${cx - 46} ${cy} A46 46 0 0 1 ${cx + 46} ${cy}" fill="#fff" stroke="#9fb3bd" stroke-width="3"/><line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#d9534f" stroke-width="4"/><circle cx="${cx}" cy="${cy}" r="5" fill="#173d50"/><text x="${cx}" y="${cy + 24}" text-anchor="middle" font-size="14" font-weight="700" fill="#fff">${label}</text><text x="${cx}" y="${cy - 58}" text-anchor="middle" font-size="12" fill="#9fd8ff">${title}</text></g>`;
}

/* ---------- 4 物业控制室：同一晚的数据，不同的阈值 ---------- */
export class ThresholdExperiment extends Base {
  mount(scene, controls) {
    this.series = R().nightNoise(); this.th = 55; this.cursor = null; this.running = false; this.shown = [];
    scene.innerHTML = `<div class="screen-frame control-room"><div class="screen-top"><b>昨晚 20:00—23:00 噪声回放</b><span class="monitor-strip"><span class="alarm-lamp" id="th-lamp" aria-hidden="true"></span><b id="th-now">待运行</b></span></div>
      <div id="night-chart" class="night-chart" aria-label="可以上下拖动红色阈值线"></div>
      <div class="run-row"><span id="th-count" class="readout"></span><span id="th-runs" class="run-table"></span></div><ol id="th-log" class="alarm-log" aria-label="提示记录"></ol></div>`;
    controls.innerHTML = `<div class="console-row">
      <label class="fader ctl th-ctl"><span>阈值</span><input id="th-slider" type="range" min="30" max="90" step="1" value="55" aria-label="阈值（参考值）"><b id="th-val">55 dB</b></label>
      <button id="run-monitor" class="big-btn">▶ 运行监测</button></div>`;
    this.scene = scene; this.controls = controls;
    const slider = controls.querySelector('#th-slider');
    slider.oninput = () => this.setTh(Number(slider.value));
    controls.querySelector('#run-monitor').onclick = () => this.run();
    // 也可以直接在图上上下拖动红线
    const chart = scene.querySelector('#night-chart');
    const dragTo = e => { const svg = chart.querySelector('svg'); if (!svg) return; const box = svg.getBoundingClientRect(), s = this.scale(); const py = (e.clientY - box.top) / box.height * s.height; const v = Math.round(s.yMin + (1 - (py - s.pad.t) / s.ih) * (s.yMax - s.yMin)); const c = Math.max(30, Math.min(80, v)); slider.value = c; this.setTh(c); };
    chart.addEventListener('pointerdown', e => { if (this.running) return; this.dragging = true; chart.setPointerCapture?.(e.pointerId); dragTo(e); });
    chart.addEventListener('pointermove', e => { if (this.dragging) dragTo(e); });
    chart.addEventListener('pointerup', () => { this.dragging = false; });
    this.draw(); this.runs();
  }
  setTh(v) { if (this.running) this.cancel(); this.th = v; this.controls.querySelector('#th-val').textContent = v + ' dB'; this.draw(); this.ctx.refresh(); }
  options() { return { running: this.running, threshold: this.th }; }
  scale() { return makeScale({ width: 640, height: 250, xMin: 0, xMax: 180, yMin: 30, yMax: 80 }); }
  draw() {
    const s = this.scale(), pts = this.series.map((v, i) => [i, v]);
    const upto = this.cursor === null ? pts : pts.slice(0, this.cursor + 1);
    let svg = svgOpen(s, '昨晚20点到23点的噪声曲线与阈值线', 'dark') + axes(s, { xTicks: [[0, '20:00'], [60, '21:00'], [120, '22:00'], [180, '23:00']], yTicks: [30, 40, 50, 60, 70, 80], yLabel: '噪声（dB，仿真）', xLabel: '时间' });
    svg += `<rect x="${s.pad.l}" y="${s.pad.t}" width="${s.iw}" height="${Math.max(0, s.y(this.th) - s.pad.t)}" class="over-zone"/>`;
    svg += `<path d="${pathOf(pts, s)}" class="curve ghost"/>`;
    if (upto.length > 1) svg += `<path d="${pathOf(upto, s)}" class="curve"/>`;
    svg += `<line x1="${s.pad.l}" x2="${s.width - s.pad.r}" y1="${s.y(this.th)}" y2="${s.y(this.th)}" class="threshold-line thick"/><rect x="${s.width - s.pad.r - 92}" y="${s.y(this.th) - 22}" width="90" height="18" rx="9" class="th-tag"/><text x="${s.width - s.pad.r - 47}" y="${s.y(this.th) - 9}" text-anchor="middle" class="threshold-label light">阈值 ${this.th} dB</text>`;
    for (const e of this.shown) svg += `<circle cx="${s.x(e.start)}" cy="${s.y(this.series[e.start])}" r="7" class="alarm-point"/>`;
    if (this.cursor !== null) svg += `<line x1="${s.x(this.cursor)}" x2="${s.x(this.cursor)}" y1="${s.pad.t}" y2="${s.height - s.pad.b}" class="marker-line"/>`;
    this.scene.querySelector('#night-chart').innerHTML = svg + '</svg>';
  }
  run() {
    if (this.running) this.cancel();
    const rules = R(), th = this.th, eps = rules.alarmEpisodes(this.series, th);
    this.running = true; this.shown = []; this.scene.querySelector('#th-log').innerHTML = ''; this.ctx.refresh(); this.ctx.pose('interact');
    const lamp = this.scene.querySelector('#th-lamp'), now = this.scene.querySelector('#th-now');
    const finish = () => {
      this.running = false; this.cursor = null; this.shown = eps; lamp.classList.remove('on');
      const minutes = this.series.filter(v => v > th).length;
      now.textContent = `阈值 ${th}：${eps.length} 次提示`;
      this.scene.querySelector('#th-count').textContent = `超过阈值累计约 ${minutes} 分钟`;
      this.scene.querySelector('#th-log').innerHTML = eps.map(e => `<li>${e.startLabel}—${e.endLabel} 超过阈值（最高 ${e.peak} dB）→ 提示</li>`).join('') || '<li>整晚没有超过阈值，没有提示。</li>';
      this.draw();
      this.ctx.say(`阈值 ${th} dB：这一晚发出 ${eps.length} 次提示。`, 'good');
      this.ctx.addTrial({ threshold: th, alarms: eps.length, minutes, at: Date.now() });
      this.runs();
    };
    if (reduced()) { finish(); return; }
    this.cursor = 0;
    this.timer = this.every(() => {
      this.cursor = Math.min(180, this.cursor + 4);
      const v = this.series[this.cursor];
      const hit = eps.filter(e => e.start <= this.cursor && !this.shown.includes(e));
      if (hit.length) { this.shown.push(...hit); this.ctx.sfx?.('alarm'); }
      lamp.classList.toggle('on', v > th);
      now.textContent = `${rules.minuteLabel(this.cursor)} · ${v} dB ${v > th ? '> ' + th + ' 超标！' : '≤ ' + th}`;
      this.draw();
      if (this.cursor >= 180) { this.stopTimer(this.timer); finish(); }
    }, 90);
  }
  cancel() { this.stopTimer(this.timer); this.running = false; this.cursor = null; this.shown = []; this.scene.querySelector('#th-lamp').classList.remove('on'); this.scene.querySelector('#th-now').textContent = '阈值改了，请重新运行'; this.draw(); }
  runs() {
    const trials = (this.ctx.record().trials || []).filter(t => Number.isInteger(t.threshold));
    const uniq = [...new Map(trials.map(t => [t.threshold, t])).values()].sort((a, b) => a.threshold - b.threshold);
    this.scene.querySelector('#th-runs').innerHTML = uniq.map(t => `<span class="run-pill${t.threshold === 55 ? ' std' : ''}">${t.threshold} dB → ${t.alarms} 次</span>`).join('');
  }
}

/* ---------- 5 屋顶种植园：自己设定阈值 ---------- */
export class DesignExperiment extends Base {
  mount(scene, controls) {
    const d = this.ctx.record().design || null;
    this.data = d?.data || null; this.direction = d?.direction || null; this.threshold = Number.isFinite(d?.threshold) ? d.threshold : 50; this.thresholdSet = !!d;
    this.running = false; this.result = null; this.revealed = 0;
    scene.innerHTML = `<div class="garden"><div id="garden-art" class="garden-art"></div><div class="screen-frame garden-screen"><div id="garden-chart"></div><div id="garden-reading"></div><div id="garden-result" class="garden-result" role="status"></div></div></div>`;
    controls.innerHTML = `<div class="console-row design">
      <div id="g-data" class="pick-group" role="group" aria-label="①采集什么数据"><span class="pick-title">① 传感器测</span>${Object.entries(R().designData).map(([k, v]) => `<button id="g-data-${k}" data-gdata="${k}" class="pick" aria-pressed="false">${{ moisture: '💧', light: '☀️', temp: '🌡' }[k]} ${v.label}</button>`).join('')}</div>
      <div id="g-dir" class="pick-group" role="group" aria-label="②什么时候开水泵"><span class="pick-title">② 开水泵</span><button id="g-dir-below" data-gdir="below" class="pick" aria-pressed="false">⬇ 降到阈值时</button><button id="g-dir-above" data-gdir="above" class="pick" aria-pressed="false">⬆ 升到阈值时</button></div>
      <label class="fader ctl g-th-ctl" id="g-th-row"><span>③ 阈值</span><input id="g-threshold" type="range" aria-label="阈值"><b id="g-th-val"></b></label>
      <button id="run-garden" class="big-btn">▶ 运行4天</button></div><div id="g-runs" class="run-table console-note"></div>`;
    this.scene = scene; this.controls = controls;
    controls.querySelectorAll('[data-gdata]').forEach(b => b.onclick = () => { this.data = b.dataset.gdata; const r = R().designData[this.data]; this.threshold = Math.round((r.min + r.max) / 2); this.thresholdSet = false; this.sync(); });
    controls.querySelectorAll('[data-gdir]').forEach(b => b.onclick = () => { this.direction = b.dataset.gdir; this.sync(true); });
    const th = controls.querySelector('#g-threshold');
    th.oninput = () => { this.threshold = Number(th.value); this.thresholdSet = true; this.sync(true); };
    controls.querySelector('#run-garden').onclick = () => this.run();
    this.sync(); this.runs();
  }
  key(t) { return t.data + '|' + t.direction + '|' + t.threshold; }
  options() {
    const ran = (this.ctx.record().trials || []).some(t => this.data && this.key(t) === this.key(this.settings()));
    return { running: this.running, data: this.data, direction: this.direction, thresholdSet: this.thresholdSet, alreadyRun: ran };
  }
  sync(keepSlider) {
    if (this.running) { this.stopTimer(this.timer); this.running = false; }
    const info = this.data && R().designData[this.data], c = this.controls;
    c.querySelectorAll('[data-gdata]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.gdata === this.data)));
    c.querySelectorAll('[data-gdir]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.gdir === this.direction)));
    c.querySelector('#g-dir').hidden = !this.data;
    c.querySelector('#g-th-row').hidden = !this.data || !this.direction;
    c.querySelector('#run-garden').hidden = !this.data || !this.direction;
    const th = c.querySelector('#g-threshold');
    if (info && !keepSlider) { th.min = info.min; th.max = info.max; th.step = this.data === 'light' ? 10 : 1; th.value = this.threshold; }
    c.querySelector('#g-th-val').textContent = info ? this.threshold + ' ' + info.unit : '';
    this.result = null; this.draw(); this.ctx.refresh();
  }
  settings() { return { data: this.data, direction: this.direction, threshold: this.threshold }; }
  run() {
    if (!this.data || !this.direction) return;
    const sim = R().simulateGarden(this.settings());
    this.result = sim; this.running = true; this.revealed = 0; this.ctx.refresh(); this.ctx.pose('interact');
    const finish = () => {
      this.running = false; this.revealed = sim.moisture.length; this.draw();
      const t = { ...this.settings(), fit: sim.fit, min: sim.min, max: sim.max, waterings: sim.waterings, at: Date.now() };
      this.ctx.say(sim.fit ? `成功！4天里湿度在 ${sim.min}%—${sim.max}% 之间，蔬菜长得好。` : `湿度到过 ${sim.min < 30 ? sim.min + '%（太干）' : sim.max + '%（太湿）'}，方案还要调整。`, sim.fit ? 'good' : 'bad');
      this.ctx.addTrial(t, { design: this.settings() });
      this.runs();
    };
    if (reduced()) { finish(); return; }
    this.timer = this.every(() => { this.revealed = Math.min(sim.moisture.length, this.revealed + 6); this.draw(); if (this.revealed >= sim.moisture.length) { this.stopTimer(this.timer); finish(); } }, 80);
  }
  draw() {
    const rules = R(), info = this.data && rules.designData[this.data];
    const s = makeScale({ width: 640, height: 220, xMin: 0, xMax: 96, yMin: 0, yMax: 100 });
    let svg = svgOpen(s, '4天土壤湿度曲线，绿色带为适宜范围', 'dark') + axes(s, { xTicks: [[0, '第1天'], [24, '第2天'], [48, '第3天'], [72, '第4天'], [96, '']], yTicks: [0, 30, 50, 70, 100], yLabel: '土壤湿度（%，仿真）', xLabel: '时间' });
    svg += `<rect x="${s.pad.l}" y="${s.y(70)}" width="${s.iw}" height="${s.y(30) - s.y(70)}" class="ok-band"/><text x="${s.pad.l + 6}" y="${s.y(70) + 15}" class="band-label">适宜 30%—70%</text>`;
    if (this.data === 'moisture' && this.direction) svg += `<line x1="${s.pad.l}" x2="${s.width - s.pad.r}" y1="${s.y(this.threshold)}" y2="${s.y(this.threshold)}" class="threshold-line"/><text x="${s.width - s.pad.r - 4}" y="${s.y(this.threshold) - 5}" text-anchor="end" class="threshold-label">阈值 ${this.threshold}%</text>`;
    let now = 56;
    if (this.result) {
      const n = this.revealed, pts = this.result.moisture.slice(0, n).map((v, i) => [i / 2, v]);
      if (pts.length > 1) svg += `<path d="${pathOf(pts, s)}" class="curve"/>`;
      this.result.pumpOn.slice(0, n).forEach((on, i) => { if (on) svg += `<rect x="${s.x(i / 2) - 1.5}" y="${s.height - s.pad.b - 9}" width="3" height="9" class="pump-tick"/>`; });
      now = this.result.moisture[Math.max(0, n - 1)];
    } else svg += `<text x="${s.width / 2}" y="${s.height / 2 + 30}" text-anchor="middle" class="empty-text">${this.data && this.direction ? '设好阈值后，运行4天' : '在下面选好传感器和开泵条件'}</text>`;
    this.scene.querySelector('#garden-chart').innerHTML = svg + '</svg>';
    const pumping = this.running && this.result?.pumpOn[this.revealed - 1];
    this.scene.querySelector('#garden-art').innerHTML = gardenSvg(now, pumping);
    let reading = '';
    if (info && this.data !== 'moisture') {
      const r = makeScale({ width: 640, height: 90, pad: { l: 52, r: 18, t: 14, b: 18 }, xMin: 0, xMax: 96, yMin: info.min, yMax: info.max });
      const series = Array.from({ length: 192 }, (_, i) => [i / 2, this.data === 'light' ? rules.lightAt(i) : rules.tempAt(i)]);
      reading = svgOpen(r, info.label + '曲线', 'dark mini') + axes(r, { yTicks: [info.min, info.max], yLabel: info.label + '（' + info.unit + '）' }) + `<path d="${pathOf(series, r)}" class="curve alt"/>${this.direction ? `<line x1="${r.pad.l}" x2="${r.width - r.pad.r}" y1="${r.y(this.threshold)}" y2="${r.y(this.threshold)}" class="threshold-line"/>` : ''}</svg>`;
    }
    this.scene.querySelector('#garden-reading').innerHTML = reading;
    const box = this.scene.querySelector('#garden-result');
    if (this.result && !this.running) {
      const sim = this.result;
      const why = sim.fit ? '湿度一直留在绿色带里。' : sim.min < 30 ? '有时低于30%，蔬菜缺水。' : '有时高于70%，土太湿。';
      const extra = this.data !== 'moisture' ? ' 这次水泵是按' + info.label + '开关的：看看湿度曲线有没有跟着植物的需要变化？' : '';
      box.className = 'garden-result ' + (sim.fit ? 'good' : 'bad');
      box.textContent = `最低 ${sim.min}%，最高 ${sim.max}%，浇水 ${sim.waterings} 次。${why}${extra}`;
    } else { box.className = 'garden-result'; box.textContent = this.running ? '运行中…（蓝色短线 = 水泵在浇水）' : ''; }
  }
  runs() {
    const ts = (this.ctx.record().trials || []).filter(t => R().designData[t.data]);
    const lab = t => `${R().designData[t.data].label}${t.direction === 'below' ? '≤' : '≥'}${t.threshold}${R().designData[t.data].unit}`;
    this.controls.querySelector('#g-runs').innerHTML = ts.length ? '已试：' + ts.slice(-5).map(t => `<span class="run-pill ${t.fit ? 'std' : 'bad'}">${escape(lab(t))} ${t.fit ? '✓' : '✗'}</span>`).join('') : '';
  }
}
function gardenSvg(m, pumping) {
  const dry = m < 30, wet = m > 70, leaf = dry ? '#a7b55a' : wet ? '#4f8f6a' : '#4fbf6a', droop = dry ? 18 : 0;
  return `<svg viewBox="0 0 220 260" class="mini-svg" role="img" aria-label="种植园，土壤湿度约${Math.round(m)}%">
    ${nightSky(220, 260, 21)}<rect y="190" width="220" height="70" fill="#5a3b28"/><rect y="190" width="220" height="${Math.max(4, 70 * m / 100)}" fill="#3b2a1f" opacity=".8"/>
    <g transform="translate(110 192)"><rect x="-3" y="-80" width="6" height="80" fill="#3f8a4f"/>
    <ellipse cx="-26" cy="${-56 + droop}" rx="26" ry="11" fill="${leaf}" transform="rotate(${-20 + droop} -26 ${-56 + droop})"/><ellipse cx="26" cy="${-66 + droop}" rx="26" ry="11" fill="${leaf}" transform="rotate(${20 - droop} 26 ${-66 + droop})"/><ellipse cx="0" cy="-90" rx="15" ry="20" fill="${leaf}"/></g>
    <rect x="160" y="205" width="10" height="40" fill="#9fb3bd"/><circle cx="165" cy="203" r="7" fill="#5fd3ff"/><text x="150" y="252" font-size="11" fill="#fff">传感器</text>
    <g transform="translate(20 70)"><rect width="40" height="30" rx="6" fill="#2b8fd0"/><text x="5" y="20" font-size="12" fill="#fff">水泵</text>${pumping ? '<g fill="#5fd3ff"><circle cx="60" cy="60" r="5"/><circle cx="72" cy="80" r="5"/><circle cx="64" cy="100" r="5"/></g>' : ''}</g>
    <text x="110" y="30" text-anchor="middle" font-size="16" font-weight="700" fill="#fff">湿度 ${Math.round(m)}%</text></svg>`;
}

export const experimentClasses = { flow: FlowExperiment, wave: WaveExperiment, life: LifeExperiment, threshold: ThresholdExperiment, design: DesignExperiment };
