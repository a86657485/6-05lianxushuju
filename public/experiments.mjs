/* 五个实验台：画面、控件与自动记录都由 rules.js 的同一模型驱动。 */
import { makeScale, pathOf, axes, svgOpen, samplePoints, neighbours, valueAt } from './charts.mjs';
import { escape } from './sync.mjs';

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

/* ---------- 1 噪声监测器：输入—计算—输出 ---------- */
export class FlowExperiment extends Base {
  mount(scene, controls) {
    this.scene = scene; this.seed = (this.ctx.record().trials || []).length + 1; this.busy = false;
    scene.innerHTML = `<div class="square-scene">${squareSvg()}</div>
      <div class="ipo-board" aria-label="噪声监测器三个环节">
        <div class="ipo-box" id="ipo-input"><small>输入</small><b>数据采集装置</b><span class="data-chip" id="chip-input">等待采集</span></div>
        <span class="ipo-arrow" aria-hidden="true">→</span>
        <div class="ipo-box" id="ipo-compute"><small>计算</small><b>数据处理装置</b><span class="data-chip" id="chip-compute">等待计算</span></div>
        <span class="ipo-arrow" aria-hidden="true">→</span>
        <div class="ipo-box" id="ipo-output"><small>输出</small><b>数据输出装置</b><span class="data-chip" id="chip-output">等待输出</span><i class="alarm-dot" id="flow-alarm" aria-hidden="true"></i></div>
      </div>`;
    controls.innerHTML = `<p class="control-title">让广场上出现一种声音：</p><div class="choice-row">
      <button id="src-quiet" data-scene="quiet">🌙 夜深人静</button><button id="src-chat" data-scene="chat">🗣 几个人小声聊天</button><button id="src-dance" data-scene="dance">🎵 广场舞音乐</button></div>`;
    controls.querySelectorAll('[data-scene]').forEach(b => b.onclick = () => this.measure(b.dataset.scene));
    const last = (this.ctx.record().trials || []).at(-1);
    if (last && R().squareScenes[last.scene]) this.show(last.scene, last.db, true);
  }
  options() { return { busy: this.busy }; }
  measure(sceneKey) {
    if (this.busy) { this.cancelRun?.(); }
    const rules = R(), db = rules.measureSquare(sceneKey, this.seed++), over = rules.overLimit(db);
    this.busy = true; this.ctx.refresh();
    const display = this.scene.querySelector('#display-num');
    this.scene.querySelector('.square-scene').dataset.scene = sceneKey;
    ['input', 'compute', 'output'].forEach(k => { this.scene.querySelector('#chip-' + k).textContent = '…'; this.scene.querySelector('#ipo-' + k).classList.remove('active', 'over'); });
    this.scene.querySelector('#flow-alarm').classList.remove('on');
    const finish = () => { this.busy = false; this.show(sceneKey, db, false); this.ctx.addTrial({ scene: sceneKey, db, over, at: Date.now() }); };
    if (reduced()) { display.textContent = db.toFixed(1); finish(); return; }
    const start = Date.now(), base = rules.squareScenes[sceneKey].base;
    const ticker = this.every(() => {
      const t = (Date.now() - start) / 1000;
      display.textContent = (base + 2.5 * Math.sin(t * 9 + base)).toFixed(1);
      if (t > 0.35) this.chip('input', '声音 ' + db.toFixed(1) + ' dB');
    }, 70);
    const done = this.later(() => { this.stopTimer(ticker); display.textContent = db.toFixed(1); finish(); }, 1300);
    this.cancelRun = () => { this.stopTimer(ticker); this.stopTimer(done); this.busy = false; };
  }
  chip(k, text) { const c = this.scene.querySelector('#chip-' + k); if (c.textContent !== text) { c.textContent = text; this.scene.querySelector('#ipo-' + k).classList.add('active'); } }
  show(sceneKey, db, quiet) {
    const over = R().overLimit(db);
    this.scene.querySelector('.square-scene').dataset.scene = sceneKey;
    this.scene.querySelector('#display-num').textContent = db.toFixed(1);
    this.chip('input', '声音 ' + db.toFixed(1) + ' dB');
    this.chip('compute', db.toFixed(1) + (over ? ' > ' : ' ≤ ') + '55 → ' + (over ? '超标' : '未超标'));
    this.chip('output', '显示 ' + db.toFixed(1) + ' dB' + (over ? '；发出提示' : '；不发提示'));
    this.scene.querySelector('#ipo-output').classList.toggle('over', over);
    this.scene.querySelector('#flow-alarm').classList.toggle('on', over);
    this.scene.querySelector('#display-box')?.classList.toggle('over', over);
    if (!quiet) this.ctx.say(over ? '这次声音超过55 dB，计算结果是“超标”，输出了提示。' : '这次声音没有超过55 dB，计算结果是“未超标”，只显示数值。');
  }
}

function squareSvg() {
  return `<svg viewBox="0 0 640 230" class="square-svg" role="img" aria-label="小区广场上的噪声监测器">
  <rect width="640" height="230" fill="#1d3550"/><circle cx="560" cy="40" r="16" fill="#f4e7b5"/>
  <rect y="170" width="640" height="60" fill="#3c5a4e"/><g fill="#2c4a40"><circle cx="70" cy="140" r="38"/><circle cx="120" cy="150" r="30"/><circle cx="520" cy="145" r="36"/></g>
  <rect x="300" y="60" width="8" height="120" fill="#9fb3bd"/>
  <g id="display-box"><rect x="232" y="40" width="150" height="62" rx="6" fill="#111" stroke="#9fb3bd" stroke-width="3"/>
  <text x="246" y="62" fill="#ff5b4d" font-size="14" font-weight="700">噪声监测</text>
  <text id="display-num" x="370" y="92" fill="#ff5b4d" font-size="28" font-weight="800" text-anchor="end">--.-</text><text x="372" y="92" fill="#ff5b4d" font-size="12">dB</text></g>
  <circle cx="304" cy="118" r="7" fill="#d6e4ea"/><text x="318" y="122" fill="#d6e4ea" font-size="11">声音采集</text>
  <g class="people quiet-hide"><circle cx="440" cy="168" r="7" fill="#f2c7a5"/><rect x="434" y="175" width="12" height="20" rx="4" fill="#e9a03b"/><circle cx="470" cy="168" r="7" fill="#f2c7a5"/><rect x="464" y="175" width="12" height="20" rx="4" fill="#4aa3c7"/></g>
  <g class="dancers"><circle cx="150" cy="166" r="7" fill="#f2c7a5"/><rect x="144" y="173" width="12" height="22" rx="4" fill="#d9534f"/><circle cx="180" cy="166" r="7" fill="#f2c7a5"/><rect x="174" y="173" width="12" height="22" rx="4" fill="#8e6cc1"/><circle cx="210" cy="166" r="7" fill="#f2c7a5"/><rect x="204" y="173" width="12" height="22" rx="4" fill="#3fa57c"/><text x="232" y="160" fill="#f4e7b5" font-size="20">♪♫</text></g>
  </svg>`;
}

/* ---------- 2 声音曲线：波形与散点 ---------- */
export class WaveExperiment extends Base {
  mount(scene, controls) {
    const rec = this.ctx.record();
    this.source = 'simulation'; this.recording = false; this.points = rec.lastTrace?.points || []; this.unit = rec.lastTrace?.unit || 'dB';
    this.view = 'both'; this.marker = null; this.lastSpanSmall = false; this.knob = 45; this.sim = 45;
    const micOk = globalThis.isSecureContext && !!navigator.mediaDevices?.getUserMedia && this.ctx.mode !== 'none';
    scene.innerHTML = `<div class="chart-box"><div id="wave-chart" class="wave-chart" tabindex="0" aria-label="声音曲线，可在两个圆点之间点击读数"></div>
      <div class="chart-legend"><span><i class="lg-curve"></i>连续曲线</span><span><i class="lg-dot"></i>每2秒记下的读数（散点）</span><span id="wave-readout" class="readout" aria-live="polite"></span></div></div>`;
    controls.innerHTML = `<div class="source-row" role="group" aria-label="声音来源"><span class="control-title">声音来源：</span>
      <button id="source-sim" data-source="simulation" aria-pressed="true">模拟旋钮</button>
      <button id="source-teacher" data-source="teacher" aria-pressed="false">观察教师现场</button>
      ${micOk ? '<button id="source-mic" data-source="microphone" aria-pressed="false">本机麦克风</button>' : ''}</div>
      <label class="knob-row" id="knob-row">音量旋钮（模拟声音）<input id="knob" type="range" min="30" max="90" step="1" value="45"><b id="knob-val">45 dB</b></label>
      <div class="choice-row"><button id="record" class="primary">● 开始记录（10秒）</button><button id="view-toggle">只看散点</button><span id="rec-status" class="rec-status" role="status"></span></div>
      <p id="mic-status" class="note"></p>`;
    controls.querySelectorAll('[data-source]').forEach(b => b.onclick = () => this.setSource(b.dataset.source));
    const knob = controls.querySelector('#knob');
    knob.oninput = () => { this.knob = Number(knob.value); controls.querySelector('#knob-val').textContent = knob.value + ' dB'; };
    controls.querySelector('#record').onclick = () => this.recording ? this.stop(false) : this.start();
    controls.querySelector('#view-toggle').onclick = e => { this.view = this.view === 'both' ? 'dots' : 'both'; e.target.textContent = this.view === 'both' ? '只看散点' : '显示曲线'; this.draw(); };
    this.controls = controls; this.scene = scene;
    const chart = scene.querySelector('#wave-chart');
    chart.addEventListener('click', e => this.pick(e));
    this.draw();
  }
  options() { return { source: this.source, recording: this.recording, liveFresh: this.ctx.liveFresh(), lastSpanSmall: this.lastSpanSmall }; }
  setSource(src) {
    if (this.recording) this.stop(true);
    this.source = src;
    this.controls.querySelectorAll('[data-source]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.source === src)));
    this.controls.querySelector('#knob-row').hidden = src !== 'simulation';
    const ms = this.controls.querySelector('#mic-status');
    if (src === 'microphone') { ms.textContent = '正在请求麦克风…'; this.ctx.startMic(msg => ms.textContent = msg); }
    else { this.ctx.stopMic(); ms.textContent = src === 'teacher' ? (this.ctx.liveFresh() ? '已连接教师现场监测。' : '老师还没开启现场监测，可以先用模拟旋钮。') : ''; }
    if (src === 'teacher') this.ctx.watchLive(true); else this.ctx.watchLive(false);
    this.ctx.refresh();
  }
  current() {
    if (this.source === 'simulation') {
      this.sim += (this.knob - this.sim) * 0.25;
      this.phase = (this.phase || 0) + 1;
      return round1(this.sim + 1.2 * Math.sin(this.phase * 0.9) + 0.6 * Math.sin(this.phase * 2.3));
    }
    if (this.source === 'teacher') return this.ctx.liveFresh() ? round1(this.ctx.live().level) : null;
    return this.ctx.micLevel() === null ? null : round1(this.ctx.micLevel() * 100);
  }
  start() {
    const first = this.current();
    if (first === null) { this.controls.querySelector('#rec-status').textContent = this.source === 'teacher' ? '还收不到教师现场数据。' : '麦克风还没有准备好。'; return; }
    this.recording = true; this.points = []; this.marker = null; this.unit = this.source === 'simulation' ? 'dB' : '相对响度'; this.started = Date.now();
    this.controls.querySelector('#record').textContent = '■ 停止记录';
    this.tick = this.every(() => {
      const t = (Date.now() - this.started) / 1000;
      const v = this.current();
      if (v !== null) this.points.push([round1(Math.min(10, t)), v]);
      this.controls.querySelector('#rec-status').textContent = '记录中 ' + Math.min(10, t).toFixed(1) + ' 秒';
      this.draw();
      if (t >= 10) this.stop(false);
    }, 100);
    this.ctx.refresh();
  }
  stop(cancelled) {
    this.stopTimer(this.tick); this.recording = false;
    this.controls.querySelector('#record').textContent = '● 重新记录（10秒）';
    const vals = this.points.map(p => p[1]);
    if (!cancelled && this.points.length >= 30) {
      const min = Math.min(...vals), max = Math.max(...vals);
      this.lastSpanSmall = max - min < 15;
      this.controls.querySelector('#rec-status').textContent = this.lastSpanSmall ? '声音变化太小（起伏不足15），再录一次。' : '已记录，曲线自动保存。';
      this.ctx.addTrial({ kind: 'trace', source: this.source, samples: this.points.length, min, max, unit: this.unit, at: Date.now() }, { lastTrace: { points: this.points, unit: this.unit } });
    } else {
      this.controls.querySelector('#rec-status').textContent = '记录时间太短，未保存。';
      this.ctx.refresh();
    }
    this.draw();
  }
  scale() {
    const sim = this.unit === 'dB';
    return makeScale({ width: 640, height: 250, xMin: 0, xMax: 10, yMin: sim ? 30 : 0, yMax: sim ? 90 : 100 });
  }
  draw() {
    const s = this.scale(), sim = this.unit === 'dB';
    const dots = samplePoints(this.points, 2);
    let svg = svgOpen(s, '声音大小随时间变化的曲线') + axes(s, { xTicks: [0, 2, 4, 6, 8, 10].map(v => [v, v + '秒']), yTicks: sim ? [30, 45, 60, 75, 90] : [0, 25, 50, 75, 100], yLabel: sim ? '声音（dB，仿真）' : '相对响度（不是分贝）', xLabel: '时间' });
    if (this.points.length > 1 && (this.view === 'both' || this.recording)) svg += `<path d="${pathOf(this.points, s)}" class="curve"/>`;
    if (!this.recording) svg += dots.map(p => `<circle cx="${s.x(p[0])}" cy="${s.y(p[1])}" r="6" class="dot"><title>${p[0]}秒：${p[1]}</title></circle>`).join('');
    if (this.marker) svg += `<line x1="${s.x(this.marker.t)}" x2="${s.x(this.marker.t)}" y1="${s.pad.t}" y2="${s.height - s.pad.b}" class="marker-line"/><circle cx="${s.x(this.marker.t)}" cy="${s.y(this.marker.value)}" r="7" class="marker"/>`;
    if (!this.points.length) svg += `<text x="${s.width / 2}" y="${s.height / 2}" text-anchor="middle" class="empty-text">点击“开始记录”，曲线会在这里画出来</text>`;
    svg += '</svg>';
    this.scene.querySelector('#wave-chart').innerHTML = svg;
  }
  pick(e) {
    if (this.recording || this.points.length < 30) return;
    const svg = this.scene.querySelector('#wave-chart svg'), box = svg.getBoundingClientRect(), s = this.scale();
    const t = round1(s.invX((e.clientX - box.left) / box.width * s.width));
    if (t <= 0 || t >= this.points.at(-1)[0]) return;
    const dots = samplePoints(this.points, 2);
    const readout = this.scene.querySelector('#wave-readout');
    if (dots.some(d => Math.abs(d[0] - t) < 0.25)) { readout.textContent = '这里正好是一个散点，换到两个圆点之间试试。'; return; }
    const { left, right } = neighbours(dots, t);
    if (!left || !right) return;
    const value = round1(valueAt(this.points, t));
    this.marker = { t, value }; this.draw();
    readout.textContent = `${t} 秒时：${value}${this.unit === 'dB' ? ' dB' : '（相对响度）'} —— 位于 ${left[0]} 秒与 ${right[0]} 秒两个读数之间`;
    this.ctx.addTrial({ kind: 'between', t, value, leftT: left[0], rightT: right[0], at: Date.now() });
  }
  destroy() { super.destroy(); this.ctx.stopMic(); this.ctx.watchLive(false); }
}

/* ---------- 3 生活中的连续量：窗帘与水壶 ---------- */
export class LifeExperiment extends Base {
  mount(scene, controls) {
    this.luxTrace = []; this.session = []; this.temp = 20; this.kettle = 'idle'; this.tempTrace = [[0, 20]];
    scene.innerHTML = `<div class="life-grid">
      <div class="life-card"><h3>窗帘与光照强度</h3><div id="curtain-svg"></div><div id="lux-chart"></div></div>
      <div class="life-card"><h3>电热水壶与水温</h3><div id="kettle-svg"></div><div id="temp-chart"></div></div></div>`;
    controls.innerHTML = `<label class="knob-row">窗帘拉上多少<input id="curtain" type="range" min="0" max="100" step="1" value="0"><b id="curtain-val">0%</b></label>
      <div class="choice-row"><button id="kettle-start" class="primary">开始加热</button><button id="kettle-read">读出此刻水温</button><button id="kettle-reset">倒掉重烧</button><span id="kettle-status" class="rec-status" role="status"></span></div>`;
    this.scene = scene; this.controls = controls;
    const slider = controls.querySelector('#curtain');
    slider.oninput = () => this.curtain(Number(slider.value));
    // 键盘方向键每按一次都会触发 change，所以这里只重新计时，停手约1秒后再保存整段拉动
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
    this.scene.querySelector('#curtain-svg').innerHTML = `<svg viewBox="0 0 300 190" class="mini-svg" role="img" aria-label="窗帘拉上${v}%，光照约${lux} lux">
      <rect width="300" height="190" fill="rgba(23,61,80,${shade})"/><rect x="40" y="20" width="140" height="150" fill="#bfe3f5" stroke="#6b8794" stroke-width="4"/><circle cx="140" cy="60" r="18" fill="#ffd968"/>
      <rect x="40" y="20" width="140" height="${curtainH}" fill="#d98d5f" opacity=".95"/><line x1="110" y1="20" x2="110" y2="170" stroke="#6b8794" stroke-width="3"/>
      ${gauge(240, 110, lux / 800, Math.round(lux) + ' lux', '光照表')}</svg>`;
    const s = makeScale({ width: 300, height: 120, pad: { l: 40, r: 8, t: 10, b: 18 }, xMin: 0, xMax: Math.max(10, this.luxTrace.length - 1), yMin: 0, yMax: 800 });
    this.scene.querySelector('#lux-chart').innerHTML = svgOpen(s, '光照强度变化曲线', 'mini') + axes(s, { yTicks: [0, 400, 800] }) + (this.luxTrace.length > 1 ? `<path d="${pathOf(this.luxTrace.map((v2, i) => [i, v2]), s)}" class="curve"/>` : '') + '</svg>';
  }
  saveCurtain() {
    this.stopTimer(this.idle);
    if (this.session.length < 3) return;
    const vals = this.session; this.session = [];
    const distinct = new Set(vals).size;
    this.ctx.addTrial({ kind: 'curtain', distinct, min: Math.min(...vals), max: Math.max(...vals), at: Date.now() });
    if (distinct < 8 || Math.max(...vals) - Math.min(...vals) < 300) this.ctx.say('这次拉动范围较小或太快（读数少于8个）。再慢慢地多拉一段试试。');
    else this.ctx.say('光照强度一点点变化，经过了 ' + distinct + ' 个不同读数，已自动保存。');
  }
  heat() {
    if (this.kettle === 'heating') return;
    if (this.kettle === 'done') this.resetKettle();
    this.kettle = 'heating'; const t0 = Date.now() - (this.elapsed || 0) * 1000;
    this.controls.querySelector('#kettle-status').textContent = '加热中…';
    this.heatTimer = this.every(() => {
      const t = (Date.now() - t0) / 1000; this.elapsed = t;
      this.temp = Math.min(100, round1(20 + 80 * (1 - Math.exp(-t / 5)) / (1 - Math.exp(-3))));
      this.tempTrace.push([round1(t), this.temp]);
      if (this.temp >= 100) { this.temp = 100; this.kettle = 'done'; this.stopTimer(this.heatTimer); this.controls.querySelector('#kettle-status').textContent = '水温达到100 ℃，水壶自动断电。'; this.ctx.refresh(); }
      this.drawKettle();
    }, 150);
    this.ctx.refresh();
  }
  read() {
    if (this.kettle === 'idle') { this.controls.querySelector('#kettle-status').textContent = '先点“开始加热”。'; return; }
    const r = this.temp;
    this.controls.querySelector('#kettle-status').textContent = '读数：' + r + ' ℃（已自动保存）';
    this.ctx.addTrial({ kind: 'kettle', reading: r, at: Date.now() });
    if (r >= 100) this.ctx.say('已经到100 ℃了。重新烧一壶，在途中读一个中间的水温。');
    else this.ctx.say('水温 ' + r + ' ℃：它在20 ℃和100 ℃之间，正在连续上升。');
  }
  resetKettle() { this.stopTimer(this.heatTimer); this.kettle = 'idle'; this.temp = 20; this.elapsed = 0; this.tempTrace = [[0, 20]]; this.controls.querySelector('#kettle-status').textContent = ''; this.drawKettle(); this.ctx.refresh(); }
  drawKettle() {
    const h = 120 * (this.temp - 0) / 110;
    this.scene.querySelector('#kettle-svg').innerHTML = `<svg viewBox="0 0 300 190" class="mini-svg" role="img" aria-label="水温${this.temp}摄氏度">
      <rect width="300" height="190" fill="#f4f8fa"/><path d="M50 60 h100 l10 110 h-120 z" fill="#d6e4ea" stroke="#6b8794" stroke-width="3"/><path d="M150 80 q40 0 30 40" fill="none" stroke="#6b8794" stroke-width="6"/>
      <rect x="40" y="170" width="140" height="10" fill="#6b8794"/><circle cx="100" cy="125" r="${this.kettle === 'heating' ? 8 : 0}" fill="#e9603b"/>
      <rect x="225" y="30" width="18" height="130" rx="9" fill="#fff" stroke="#6b8794" stroke-width="2"/><rect x="229" y="${152 - h}" width="10" height="${h}" fill="#e9603b"/><circle cx="234" cy="162" r="12" fill="#e9603b"/>
      <text x="252" y="${156 - h}" font-size="13" fill="#173d50">${this.temp.toFixed(1)} ℃</text><text x="200" y="22" font-size="11" fill="#607984">温度计</text></svg>`;
    const s = makeScale({ width: 300, height: 120, pad: { l: 40, r: 8, t: 10, b: 18 }, xMin: 0, xMax: 15, yMin: 0, yMax: 100 });
    this.scene.querySelector('#temp-chart').innerHTML = svgOpen(s, '水温变化曲线', 'mini') + axes(s, { yTicks: [0, 50, 100] }) + `<line x1="${s.pad.l}" x2="${s.width - s.pad.r}" y1="${s.y(100)}" y2="${s.y(100)}" class="threshold-line"/><path d="${pathOf(this.tempTrace, s)}" class="curve warm"/></svg>`;
  }
}
function gauge(cx, cy, ratio, label, title) {
  const a = Math.PI * (1 - Math.max(0, Math.min(1, ratio)));
  const x = cx + 40 * Math.cos(a), y = cy - 40 * Math.sin(a);
  return `<g><path d="M${cx - 48} ${cy} A48 48 0 0 1 ${cx + 48} ${cy}" fill="#fff" stroke="#6b8794" stroke-width="3"/><line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#d9534f" stroke-width="3"/><circle cx="${cx}" cy="${cy}" r="4" fill="#173d50"/><text x="${cx}" y="${cy + 20}" text-anchor="middle" font-size="12" fill="#173d50">${label}</text><text x="${cx}" y="${cy - 56}" text-anchor="middle" font-size="11" fill="#e4eef2">${title}</text></g>`;
}

/* ---------- 4 阈值：同一晚的数据，不同的参考值 ---------- */
export class ThresholdExperiment extends Base {
  mount(scene, controls) {
    this.series = R().nightNoise(); this.th = 55; this.cursor = null; this.running = false; this.shown = [];
    scene.innerHTML = `<div class="chart-box"><div id="night-chart"></div><div class="monitor-strip"><span class="alarm-lamp" id="th-lamp" aria-hidden="true"></span><b id="th-now">监测待运行</b><span id="th-count" class="readout"></span></div><ol id="th-log" class="alarm-log" aria-label="提示记录"></ol></div>`;
    controls.innerHTML = `<label class="knob-row">阈值（参考值）<input id="th-slider" type="range" min="30" max="90" step="1" value="55"><b id="th-val">55 dB</b></label>
      <div class="choice-row"><button id="run-monitor" class="primary">▶ 运行监测（回放这一晚）</button></div><div id="th-runs" class="run-table"></div>`;
    this.scene = scene; this.controls = controls;
    const slider = controls.querySelector('#th-slider');
    slider.oninput = () => { if (this.running) this.cancel(); this.th = Number(slider.value); controls.querySelector('#th-val').textContent = this.th + ' dB'; this.draw(); this.ctx.refresh(); };
    controls.querySelector('#run-monitor').onclick = () => this.run();
    this.draw(); this.runs();
  }
  options() { return { running: this.running }; }
  scale() { return makeScale({ width: 640, height: 250, xMin: 0, xMax: 180, yMin: 30, yMax: 80 }); }
  draw() {
    const s = this.scale(), pts = this.series.map((v, i) => [i, v]);
    const upto = this.cursor === null ? pts : pts.slice(0, this.cursor + 1);
    let svg = svgOpen(s, '昨晚20点到23点的噪声曲线与阈值线') + axes(s, { xTicks: [[0, '20:00'], [60, '21:00'], [120, '22:00'], [180, '23:00']], yTicks: [30, 40, 50, 60, 70, 80], yLabel: '噪声（dB，仿真）', xLabel: '时间' });
    svg += `<rect x="${s.pad.l}" y="${s.pad.t}" width="${s.iw}" height="${Math.max(0, s.y(this.th) - s.pad.t)}" class="over-zone"/>`;
    svg += `<path d="${pathOf(pts, s)}" class="curve ghost"/>`;
    if (upto.length > 1) svg += `<path d="${pathOf(upto, s)}" class="curve"/>`;
    svg += `<line x1="${s.pad.l}" x2="${s.width - s.pad.r}" y1="${s.y(this.th)}" y2="${s.y(this.th)}" class="threshold-line"/><text x="${s.width - s.pad.r - 4}" y="${s.y(this.th) - 6}" text-anchor="end" class="threshold-label">阈值 ${this.th} dB</text>`;
    for (const e of this.shown) svg += `<circle cx="${s.x(e.start)}" cy="${s.y(this.series[e.start])}" r="6" class="alarm-point"/>`;
    if (this.cursor !== null) svg += `<line x1="${s.x(this.cursor)}" x2="${s.x(this.cursor)}" y1="${s.pad.t}" y2="${s.height - s.pad.b}" class="marker-line"/>`;
    svg += '</svg>';
    this.scene.querySelector('#night-chart').innerHTML = svg;
  }
  run() {
    if (this.running) this.cancel();
    const rules = R(), th = this.th, eps = rules.alarmEpisodes(this.series, th);
    this.running = true; this.shown = []; this.scene.querySelector('#th-log').innerHTML = ''; this.ctx.refresh();
    const lamp = this.scene.querySelector('#th-lamp'), now = this.scene.querySelector('#th-now');
    const finish = () => {
      this.running = false; this.cursor = null; this.shown = eps; lamp.classList.remove('on');
      const minutes = this.series.filter(v => v > th).length;
      now.textContent = `阈值 ${th} dB：这一晚共发出 ${eps.length} 次提示，超过阈值累计约 ${minutes} 分钟`;
      this.scene.querySelector('#th-log').innerHTML = eps.map(e => `<li>${e.startLabel}—${e.endLabel} 超过阈值（最高 ${e.peak} dB）→ 发出提示</li>`).join('') || '<li>整晚没有超过阈值，没有提示。</li>';
      this.draw();
      this.ctx.addTrial({ threshold: th, alarms: eps.length, minutes, at: Date.now() });
      this.runs();
    };
    if (reduced()) { finish(); return; }
    this.cursor = 0;
    this.timer = this.every(() => {
      this.cursor = Math.min(180, this.cursor + 4);
      const v = this.series[this.cursor];
      const hit = eps.filter(e => e.start <= this.cursor && !this.shown.includes(e));
      if (hit.length) { this.shown.push(...hit); this.scene.querySelector('#th-log').insertAdjacentHTML('beforeend', hit.map(e => `<li>${e.startLabel} 起超过阈值 → 发出提示</li>`).join('')); }
      lamp.classList.toggle('on', v > th);
      now.textContent = `${rules.minuteLabel(this.cursor)} · ${v} dB ${v > th ? '> ' + th + ' 超标！' : '≤ ' + th + ' 正常'}`;
      this.draw();
      if (this.cursor >= 180) { this.stopTimer(this.timer); finish(); }
    }, 90);
  }
  cancel() { this.stopTimer(this.timer); this.running = false; this.cursor = null; this.shown = []; this.scene.querySelector('#th-lamp').classList.remove('on'); this.scene.querySelector('#th-now').textContent = '阈值已改变，回放已停止，请重新运行。'; this.draw(); }
  runs() {
    const trials = (this.ctx.record().trials || []).filter(t => Number.isInteger(t.threshold));
    const uniq = [...new Map(trials.map(t => [t.threshold, t])).values()].sort((a, b) => a.threshold - b.threshold);
    this.controls.querySelector('#th-runs').innerHTML = uniq.length ? '<b>已运行：</b>' + uniq.map(t => `<span class="run-pill${t.threshold === 55 ? ' std' : ''}">阈值 ${t.threshold} dB → ${t.alarms} 次提示${Number.isInteger(t.minutes) ? '（超标约' + t.minutes + '分钟）' : ''}</span>`).join('') : '';
  }
}

/* ---------- 5 种植园自动浇水：自己设定阈值 ---------- */
export class DesignExperiment extends Base {
  mount(scene, controls) {
    const d = this.ctx.record().design || {};
    this.data = d.data || 'moisture'; this.direction = d.direction || 'below'; this.threshold = Number.isFinite(d.threshold) ? d.threshold : 50; this.running = false; this.result = null; this.revealed = 0;
    scene.innerHTML = `<div class="chart-box"><div id="garden-chart"></div><div id="garden-reading"></div><div id="garden-result" class="garden-result" role="status"></div></div>`;
    controls.innerHTML = `<div class="design-row"><span class="control-title">① 采集什么数据？</span><div class="seg" role="group">${Object.entries(R().designData).map(([k, v]) => `<button id="g-data-${k}" data-gdata="${k}" aria-pressed="false">${v.label}</button>`).join('')}</div></div>
      <div class="design-row"><span class="control-title">② 什么时候打开水泵？</span><div class="seg" role="group"><button id="g-dir-below" data-gdir="below" aria-pressed="false">降到阈值及以下时</button><button id="g-dir-above" data-gdir="above" aria-pressed="false">升到阈值及以上时</button></div></div>
      <label class="knob-row">③ 阈值<input id="g-threshold" type="range"><b id="g-th-val"></b></label>
      <div class="choice-row"><button id="run-garden" class="primary">▶ 运行4天</button></div><div id="g-runs" class="run-table"></div>`;
    this.scene = scene; this.controls = controls;
    controls.querySelectorAll('[data-gdata]').forEach(b => b.onclick = () => { this.data = b.dataset.gdata; const r = R().designData[this.data]; this.threshold = Math.round((r.min + r.max) / 2); this.sync(); });
    controls.querySelectorAll('[data-gdir]').forEach(b => b.onclick = () => { this.direction = b.dataset.gdir; this.sync(); });
    const th = controls.querySelector('#g-threshold');
    th.oninput = () => { this.threshold = Number(th.value); this.sync(true); };
    controls.querySelector('#run-garden').onclick = () => this.run();
    this.sync(); this.runs();
  }
  options() { return { running: this.running }; }
  sync(keepSlider) {
    if (this.running) { this.stopTimer(this.timer); this.running = false; }
    const info = R().designData[this.data], c = this.controls;
    c.querySelectorAll('[data-gdata]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.gdata === this.data)));
    c.querySelectorAll('[data-gdir]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.gdir === this.direction)));
    const th = c.querySelector('#g-threshold');
    if (!keepSlider) { th.min = info.min; th.max = info.max; th.step = this.data === 'light' ? 10 : 1; th.value = this.threshold; }
    c.querySelector('#g-th-val').textContent = this.threshold + ' ' + info.unit;
    this.result = null; this.draw(); this.ctx.refresh();
  }
  settings() { return { data: this.data, direction: this.direction, threshold: this.threshold }; }
  run() {
    const sim = R().simulateGarden(this.settings());
    this.result = sim; this.running = true; this.revealed = 0; this.ctx.refresh();
    const finish = () => {
      this.running = false; this.revealed = sim.moisture.length; this.draw();
      const t = { ...this.settings(), fit: sim.fit, min: sim.min, max: sim.max, waterings: sim.waterings, at: Date.now() };
      this.ctx.addTrial(t, { design: this.settings() });
      this.runs();
    };
    if (reduced()) { finish(); return; }
    this.timer = this.every(() => { this.revealed = Math.min(sim.moisture.length, this.revealed + 6); this.draw(); if (this.revealed >= sim.moisture.length) { this.stopTimer(this.timer); finish(); } }, 80);
  }
  draw() {
    const rules = R(), info = rules.designData[this.data];
    const s = makeScale({ width: 640, height: 230, xMin: 0, xMax: 96, yMin: 0, yMax: 100 });
    let svg = svgOpen(s, '4天土壤湿度曲线，绿色带为适宜范围') + axes(s, { xTicks: [[0, '第1天'], [24, '第2天'], [48, '第3天'], [72, '第4天'], [96, '']], yTicks: [0, 30, 50, 70, 100], yLabel: '土壤湿度（%，仿真）', xLabel: '时间' });
    svg += `<rect x="${s.pad.l}" y="${s.y(70)}" width="${s.iw}" height="${s.y(30) - s.y(70)}" class="ok-band"/><text x="${s.pad.l + 6}" y="${s.y(70) + 14}" class="band-label">适宜 30%—70%</text>`;
    if (this.data === 'moisture') svg += `<line x1="${s.pad.l}" x2="${s.width - s.pad.r}" y1="${s.y(this.threshold)}" y2="${s.y(this.threshold)}" class="threshold-line"/><text x="${s.width - s.pad.r - 4}" y="${s.y(this.threshold) - 5}" text-anchor="end" class="threshold-label">阈值 ${this.threshold}%</text>`;
    if (this.result) {
      const n = this.revealed, pts = this.result.moisture.slice(0, n).map((v, i) => [i / 2, v]);
      if (pts.length > 1) svg += `<path d="${pathOf(pts, s)}" class="curve"/>`;
      this.result.pumpOn.slice(0, n).forEach((on, i) => { if (on) svg += `<rect x="${s.x(i / 2) - 1.5}" y="${s.height - s.pad.b - 8}" width="3" height="8" class="pump-tick"/>`; });
    } else svg += `<text x="${s.width / 2}" y="${s.height / 2 + 30}" text-anchor="middle" class="empty-text">设置好后点“运行4天”</text>`;
    svg += '</svg>';
    this.scene.querySelector('#garden-chart').innerHTML = svg;
    let reading = '';
    if (this.data !== 'moisture') {
      const r = makeScale({ width: 640, height: 110, pad: { l: 52, r: 18, t: 14, b: 22 }, xMin: 0, xMax: 96, yMin: info.min, yMax: info.max });
      const series = Array.from({ length: 192 }, (_, i) => [i / 2, this.data === 'light' ? rules.lightAt(i) : rules.tempAt(i)]);
      reading = svgOpen(r, info.label + '曲线', 'mini') + axes(r, { yTicks: [info.min, info.max], yLabel: info.label + '（' + info.unit + '）' }) + `<path d="${pathOf(series, r)}" class="curve alt"/><line x1="${r.pad.l}" x2="${r.width - r.pad.r}" y1="${r.y(this.threshold)}" y2="${r.y(this.threshold)}" class="threshold-line"/></svg>`;
    }
    this.scene.querySelector('#garden-reading').innerHTML = reading;
    const box = this.scene.querySelector('#garden-result');
    if (this.result && !this.running) {
      const sim = this.result;
      const why = sim.fit ? '湿度一直留在适宜范围内。' : sim.min < 30 ? '有时湿度低于30%，蔬菜会缺水。' : '有时湿度高于70%，土壤过湿。';
      const extra = this.data !== 'moisture' ? ' 注意：水泵是看' + info.label + '开关的，和土壤干不干没有直接关系。' : '';
      box.className = 'garden-result ' + (sim.fit ? 'good' : 'bad');
      box.textContent = `最低 ${sim.min}%，最高 ${sim.max}%，浇水 ${sim.waterings} 次。${why}${extra}`;
    } else { box.className = 'garden-result'; box.textContent = this.running ? '运行中…（蓝色短线表示水泵在浇水）' : ''; }
  }
  runs() {
    const ts = (this.ctx.record().trials || []).filter(t => R().designData[t.data]);
    const lab = t => `${R().designData[t.data].label}${t.direction === 'below' ? '≤' : '≥'}${t.threshold}${R().designData[t.data].unit}`;
    this.controls.querySelector('#g-runs').innerHTML = ts.length ? '<b>已运行：</b>' + ts.slice(-6).map(t => `<span class="run-pill ${t.fit ? 'std' : 'bad'}">${escape(lab(t))} → ${t.fit ? '合适' : '不合适'}（浇水${t.waterings}次）</span>`).join('') : '';
  }
}

export const experimentClasses = { flow: FlowExperiment, wave: WaveExperiment, life: LifeExperiment, threshold: ThresholdExperiment, design: DesignExperiment };
