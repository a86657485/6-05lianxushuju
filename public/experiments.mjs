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
        <div class="ipo-box" id="ipo-input"><small>输入</small><b>数据采集装置</b><span class="data-chip" id="chip-input">等待</span></div>
        <span class="ipo-arrow" aria-hidden="true"><i></i></span>
        <div class="ipo-box" id="ipo-compute"><small>计算</small><b>数据处理装置 · 与55 dB比较</b><span class="data-chip" id="chip-compute">等待</span></div>
        <span class="ipo-arrow" aria-hidden="true"><i></i></span>
        <div class="ipo-box" id="ipo-output"><small>输出</small><b>数据输出装置 · 显示/报警</b><span class="data-chip" id="chip-output">等待</span><i class="alarm-dot" id="flow-alarm" aria-hidden="true"></i></div>
      </div>`;
    this.controls = controls; this.picked = null;
    const done = (this.ctx.record().trials || []).some(t => t.kind === 'schematic' && R().schematicOk(t.slots));
    this.slots = done ? { ...R().schematicAnswer } : {};
    if (done) this.showSounds(); else this.showSchematic();
    const last = (this.ctx.record().trials || []).filter(t => R().squareScenes[t.scene]).at(-1);
    if (last) this.show(last.scene, last.db, true);
  }
  /* 教参：先回顾输入—计算—输出，再让学生把噪声监测系统的工作过程示意图画出来。 */
  showSchematic() {
    const parts = R().schematicParts, order = ['output', 'collect', 'process'];
    this.scene.querySelector('.ipo-board').hidden = true;
    const slot = (id, tag) => { const v = this.slots[id]; return `<button type="button" class="sch-slot${v ? ' filled' : ''}" data-slot="${id}" aria-label="${tag}环节的空框"><small>${tag}</small><b>${v ? parts[v] : '？'}</b></button>`; };
    this.controls.innerHTML = `<div class="schematic" aria-label="噪声监测系统示意图">
      <p class="sch-title">画一画：噪声监测系统的工作过程（教材插图）</p>
      <div id="schematic-slots" class="sch-row"><span class="sch-src">🔊 声音</span><i>→</i>${slot('s1', '输入')}<i>→</i>${slot('s2', '计算')}<i>→</i>${slot('s3', '输出')}</div>
      <div id="schematic-parts" class="sch-parts" role="group" aria-label="装置卡片">${order.map(k => `<button type="button" class="sch-part${this.picked === k ? ' on' : ''}" data-part="${k}" aria-pressed="${this.picked === k}" ${Object.values(this.slots).includes(k) ? 'disabled' : ''}>${parts[k]}</button>`).join('')}
      <button type="button" id="sch-reset" class="mini-btn">重新放</button></div>
      <p id="sch-msg" class="console-note" role="status"></p></div>`;
    this.controls.querySelectorAll('[data-part]').forEach(b => b.onclick = () => { this.picked = b.dataset.part; this.showSchematic(); this.ctx.refresh(); });
    this.controls.querySelectorAll('[data-slot]').forEach(b => b.onclick = () => this.place(b.dataset.slot));
    this.controls.querySelector('#sch-reset').onclick = () => { this.slots = {}; this.picked = null; this.showSchematic(); this.ctx.refresh(); };
  }
  place(slotId) {
    if (!this.picked) { this.controls.querySelector('#sch-msg').textContent = '先点下面的一个装置卡片。'; return; }
    for (const [k, v] of Object.entries(this.slots)) if (v === this.picked) delete this.slots[k];
    this.slots[slotId] = this.picked; this.picked = null;
    if (Object.keys(this.slots).length < 3) { this.showSchematic(); this.ctx.refresh(); return; }
    const ok = R().schematicOk(this.slots);
    this.ctx.addTrial({ kind: 'schematic', slots: { ...this.slots }, ok, at: Date.now() });
    if (ok) {
      this.ctx.say('示意图画好了：声音 → 数据采集装置 → 数据处理装置 → 数据输出装置。现在让监测器工作，看看三个环节里流动的是什么。', 'good');
      this.showSounds();
    } else {
      const wrongKeys = Object.entries(R().schematicAnswer).filter(([k, v]) => this.slots[k] !== v).map(([k]) => k);
      const wrongTag = wrongKeys.map(k => ({ s1: '输入', s2: '计算', s3: '输出' }[k])).join('、');
      for (const k of wrongKeys) delete this.slots[k]; // 放错的装置退回卡片区，放对的保留
      this.ctx.say(`${wrongTag}框放得不对。想一想：声音先被谁“收进来”？谁来“算”？谁把结果“送出去”？`, 'bad');
      this.showSchematic();
      this.controls.querySelector('#sch-msg').textContent = wrongTag + '框放错了，装置已退回。再想想它该放哪里。';
    }
    this.ctx.refresh();
  }
  showSounds() {
    this.scene.querySelector('.ipo-board').hidden = false;
    this.controls.innerHTML = `<div class="sound-cards" role="group" aria-label="让广场上出现一种声音">
      <button id="src-quiet" data-scene="quiet" class="sound-card"><span aria-hidden="true">🌙</span>夜深人静</button>
      <button id="src-chat" data-scene="chat" class="sound-card"><span aria-hidden="true">🗣</span>小声聊天</button>
      <button id="src-dance" data-scene="dance" class="sound-card"><span aria-hidden="true">🎵</span>广场舞音乐</button></div>`;
    this.controls.querySelectorAll('[data-scene]').forEach(b => b.onclick = () => this.measure(b.dataset.scene));
  }
  options() { return { busy: this.busy, picked: this.picked }; }
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
    scene.innerHTML = `<div class="screen-frame wave-frame"><div class="screen-top"><b>广场噪声监测器 · 声音记录</b><span class="console-note">仿真数据 · 不用麦克风</span></div>
      <div id="wave-chart" class="wave-chart" tabindex="0" aria-label="声音曲线，可在两个圆点之间点击读数"></div>
      <div class="chart-legend"><span><i class="lg-curve"></i>连续曲线</span><span><i class="lg-dot"></i>每2秒记一个读数（散点）</span><button id="view-toggle" class="mini-btn">只看散点</button><span id="wave-readout" class="readout" aria-live="polite"></span></div></div>`;
    controls.innerHTML = `<div class="console-row">
      <button id="load-record" class="big-btn">📈 打开监测器记录（10秒）</button>
      <button id="record" class="rec-btn" aria-label="用推杆自己录10秒（选做）"><span class="rec-dot"></span><b id="rec-label">自己录10秒</b></button>
      <label class="fader ctl" id="knob-row"><span>🔈</span><input id="knob" type="range" min="30" max="90" step="1" value="45" aria-label="音量推杆（模拟声音）"><span>🔊</span><b id="knob-val">45 dB</b></label>
      <span id="rec-status" class="rec-status" role="status"></span></div>`;
    controls.querySelector('#load-record').onclick = () => this.loadRecord();
    const knob = controls.querySelector('#knob');
    knob.oninput = () => { this.knob = Number(knob.value); controls.querySelector('#knob-val').textContent = knob.value + ' dB'; };
    controls.querySelector('#record').onclick = () => this.recording ? this.stop(false) : this.start();
    scene.querySelector('#view-toggle').onclick = e => { this.view = this.view === 'both' ? 'dots' : 'both'; e.target.textContent = this.view === 'both' ? '只看散点' : '显示曲线'; this.draw(); };
    this.controls = controls; this.scene = scene;
    scene.querySelector('#wave-chart').addEventListener('click', e => this.pick(e));
    this.draw();
  }
  options() { return { recording: this.recording, lastSpanSmall: this.lastSpanSmall }; }
  /* 教参：先凭第一感觉判断，再看连续量。直接给一段监测器记录，把时间留给“比较两种图、在散点之间读数”。 */
  loadRecord() {
    if (this.recording) this.stop(true);
    const pts = [];
    for (let i = 0; i <= 100; i++) { const x = i / 10; pts.push([round1(x), round1(50 + 12 * Math.sin(x / 1.4) + 6 * Math.sin(x * 1.9 + 1) + (x > 6.3 && x < 7.4 ? 9 * Math.sin((x - 6.3) / 1.1 * Math.PI) : 0))]); }
    this.points = pts; this.unit = 'dB'; this.marker = null; this.lastSpanSmall = false;
    const vals = pts.map(p => p[1]), min = Math.min(...vals), max = Math.max(...vals);
    this.controls.querySelector('#rec-status').textContent = '✓ 已打开监测器记录';
    this.ctx.say(`这是广场监测器10秒的记录：${pts.length} 个读数，在 ${min}—${max} dB 之间。圆点是每2秒记下的读数。`, 'good');
    this.ctx.addTrial({ kind: 'trace', source: 'record', samples: pts.length, min, max, unit: 'dB', at: Date.now() }, { lastTrace: { points: pts, unit: 'dB' } });
    this.draw();
  }
  current() {
    this.sim += (this.knob - this.sim) * 0.25; this.phase = (this.phase || 0) + 1;
    return round1(this.sim + 1.2 * Math.sin(this.phase * 0.9) + 0.6 * Math.sin(this.phase * 2.3));
  }
  start() {
    const first = this.current();
    if (first === null) return;
    this.recording = true; this.points = []; this.marker = null; this.unit = 'dB'; this.started = Date.now();
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
    if (!this.points.length) svg += `<text x="${s.width / 2}" y="${s.height / 2}" text-anchor="middle" class="empty-text">点“打开监测器记录”，声音曲线会画在这里</text>`;
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
  destroy() { super.destroy(); }
}

/* ---------- 3 3号楼小明家：窗帘与水壶 ---------- */
export class LifeExperiment extends Base {
  mount(scene, controls) {
    this.luxTrace = []; this.session = []; this.mt = 0;
    scene.innerHTML = `<div class="room">
      <div class="room-card"><div id="curtain-svg" class="room-art"></div><div id="lux-chart" class="room-chart"></div></div>
      <div class="room-card meters-card"><p class="meters-title">看一看：水表、温度计、车速表的读数是怎样变化的？</p><div id="meters-svg" class="room-art"></div>
      <p class="paper-tip">🧻 动手：拿一张薄纸片，对着它轻轻吹、再用力吹，看纸片怎样晃动。</p></div></div>`;
    controls.innerHTML = `<div class="console-row two">
      <label class="fader ctl curtain-ctl"><span>窗帘</span><input id="curtain" type="range" min="0" max="100" step="1" value="0" aria-label="窗帘拉上多少"><b id="curtain-val">0%</b></label></div>`;
    this.scene = scene; this.controls = controls;
    const slider = controls.querySelector('#curtain');
    slider.oninput = () => this.curtain(Number(slider.value));
    // 键盘方向键每按一次都会触发 change，所以只重新计时，停手约1秒后再保存整段拉动
    slider.onchange = () => { this.stopTimer(this.idle); this.idle = this.later(() => this.saveCurtain(), 900); };
    this.curtain(0, true); this.drawMeters();
    if (!reduced()) this.every(() => { this.mt += 0.15; this.drawMeters(); }, 150);
  }
  /* 水表、温度计、车速表：读数一点点变化（仿真），只供观察，不另设任务。 */
  drawMeters() {
    const t = this.mt, temp = round1(24 + 4 * Math.sin(t / 3)), speed = Math.round(38 + 14 * Math.sin(t / 2.2)), water = (1234.5 + t * 0.08).toFixed(2);
    const h = 90 * (temp - 10) / 30;
    this.scene.querySelector('#meters-svg').innerHTML = `<svg viewBox="0 0 320 200" class="mini-svg" role="img" aria-label="水表${water}立方米，温度计${temp}摄氏度，车速表${speed}千米每时">
      <rect width="320" height="200" fill="#e8d9c4"/>
      <g transform="translate(14 30)"><circle cx="45" cy="60" r="44" fill="#fff" stroke="#6b8794" stroke-width="4"/><rect x="18" y="44" width="54" height="18" rx="3" fill="#173d50"/><text x="45" y="58" text-anchor="middle" font-size="11" fill="#7fe6dc" font-family="monospace">${water}</text><line x1="45" y1="60" x2="${(45 + 26 * Math.cos(t * 2)).toFixed(1)}" y2="${(80 + 10 * Math.sin(t * 2)).toFixed(1)}" stroke="#d9534f" stroke-width="3"/><text x="45" y="125" text-anchor="middle" font-size="13" font-weight="700" fill="#173d50">水表</text></g>
      <g transform="translate(112 20)"><rect x="12" y="6" width="18" height="110" rx="9" fill="#fff" stroke="#6b8794" stroke-width="2"/><rect x="16" y="${108 - h}" width="10" height="${h}" fill="#e9603b"/><circle cx="21" cy="120" r="13" fill="#e9603b"/><text x="40" y="${112 - h}" font-size="12" font-weight="700" fill="#173d50">${temp}℃</text><text x="21" y="155" text-anchor="middle" font-size="13" font-weight="700" fill="#173d50">温度计</text></g>
      ${gauge(262, 110, speed / 80, speed + ' km/h', '车速表')}</svg>`;
  }
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

/* ---------- 5 教室噪声监测器（教材“拓展与提升”）：参考标准与同学能接受的音量，自己定阈值 ---------- */
export class DesignExperiment extends Base {
  mount(scene, controls) {
    const d = this.ctx.record().design || null;
    this.th = Number.isInteger(d?.threshold) ? d.threshold : 50; this.thresholdSet = !!d; this.running = false; this.cursor = null; this.shown = []; this.last = null;
    this.series = R().classroomNoise();
    const std = R().STANDARDS.map(s => `<tr><td>${s.place}</td><td>${s.day}</td><td>${s.night}</td></tr>`).join('');
    scene.innerHTML = `<div class="class-monitor"><aside class="basis-card"><h3>📚 查一查：噪声标准</h3><table class="std-table"><thead><tr><th>区域</th><th>昼间</th><th>夜间</th></tr></thead><tbody>${std}</tbody></table><p class="std-src">GB 3096—2008《声环境质量标准》户外限值（dB）</p>
      <h3>🙋 问一问：同学们能接受的音量</h3><p class="vote-line">全班投票：大部分同学能接受课间音量不超过 <b>${R().ACCEPT} dB</b></p></aside>
      <div class="screen-frame control-room"><div class="screen-top"><b>六（1）班 课间10分钟 噪声回放</b><span class="monitor-strip"><span class="alarm-lamp" id="c-lamp" aria-hidden="true"></span><b id="c-now">待运行</b></span></div>
      <div id="class-chart" class="night-chart"></div><ol id="c-log" class="alarm-log" aria-label="提示记录"></ol></div></div>`;
    controls.innerHTML = `<div class="console-row">
      <div id="c-basis" class="pick-group" role="group" aria-label="设定阈值的依据"><span class="pick-title">依据</span><button id="c-std" class="pick" data-th="55">参考标准 55 dB</button><button id="c-acc" class="pick" data-th="${R().ACCEPT}">同学能接受 ${R().ACCEPT} dB</button></div>
      <label class="fader ctl th-ctl"><span>阈值</span><input id="c-threshold" type="range" min="40" max="90" step="1" value="${this.th}" aria-label="教室噪声监测器的阈值"><b id="c-th-val">${this.th} dB</b></label>
      <button id="run-class" class="big-btn">▶ 运行课间10分钟</button></div><div id="c-runs" class="run-table console-note"></div>`;
    this.scene = scene; this.controls = controls;
    controls.querySelectorAll('[data-th]').forEach(b => b.onclick = () => this.setTh(Number(b.dataset.th)));
    const sl = controls.querySelector('#c-threshold'); sl.oninput = () => this.setTh(Number(sl.value));
    controls.querySelector('#run-class').onclick = () => this.run();
    this.draw(); this.runs();
  }
  setTh(v) {
    if (this.running) { this.stopTimer(this.timer); this.running = false; }
    this.th = v; this.thresholdSet = true; this.shown = []; this.cursor = null; this.last = null;
    this.controls.querySelector('#c-threshold').value = v; this.controls.querySelector('#c-th-val').textContent = v + ' dB';
    this.scene.querySelector('#c-now').textContent = '阈值 ' + v + ' dB · 待运行';
    this.draw(); this.ctx.refresh();
  }
  options() { const ran = (this.ctx.record().trials || []).some(t => t.threshold === this.th); return { running: this.running, thresholdSet: this.thresholdSet, alreadyRun: ran }; }
  scale() { return makeScale({ width: 640, height: 240, xMin: 0, xMax: 60, yMin: 40, yMax: 85 }); }
  draw() {
    const s = this.scale(), pts = this.series.map((v, i) => [i, v]), upto = this.cursor === null ? pts : pts.slice(0, this.cursor + 1);
    let svg = svgOpen(s, '课间10分钟教室噪声曲线与阈值线', 'dark') + axes(s, { xTicks: [[0, '0分'], [18, '3分'], [36, '6分'], [54, '9分']], yTicks: [40, 50, 60, 70, 80], yLabel: '音量（dB，仿真）', xLabel: '课间时间' });
    for (const n of R().NOISY) svg += `<rect x="${s.x(n.start - 0.5)}" y="${s.pad.t}" width="${s.x(n.end + 0.5) - s.x(n.start - 0.5)}" height="${s.ih}" class="noisy-band"/><text x="${s.x((n.start + n.end) / 2)}" y="${s.pad.t + 14}" text-anchor="middle" class="band-label">${n.label}</text>`;
    svg += `<path d="${pathOf(pts, s)}" class="curve ghost"/>`;
    if (upto.length > 1) svg += `<path d="${pathOf(upto, s)}" class="curve"/>`;
    if (this.thresholdSet) svg += `<line x1="${s.pad.l}" x2="${s.width - s.pad.r}" y1="${s.y(this.th)}" y2="${s.y(this.th)}" class="threshold-line thick"/><text x="${s.width - s.pad.r - 4}" y="${s.y(this.th) - 6}" text-anchor="end" class="threshold-label light">阈值 ${this.th} dB</text>`;
    for (const e of this.shown) svg += `<circle cx="${s.x(e.start)}" cy="${s.y(this.series[e.start])}" r="7" class="alarm-point"/>`;
    if (this.cursor !== null) svg += `<line x1="${s.x(this.cursor)}" x2="${s.x(this.cursor)}" y1="${s.pad.t}" y2="${s.height - s.pad.b}" class="marker-line"/>`;
    this.scene.querySelector('#class-chart').innerHTML = svg + '</svg>';
  }
  run() {
    if (!this.thresholdSet) return;
    if (this.running) this.stopTimer(this.timer);
    const th = this.th, sim = R().simulateClassroom(th), lamp = this.scene.querySelector('#c-lamp'), now = this.scene.querySelector('#c-now');
    this.running = true; this.shown = []; this.scene.querySelector('#c-log').innerHTML = ''; this.ctx.refresh(); this.ctx.pose('interact');
    const finish = () => {
      this.running = false; this.cursor = null; this.shown = sim.episodes; lamp.classList.remove('on');
      const isNoisy = e => R().NOISY.some(n => e.start <= n.end + 1 && e.end >= n.start - 1 && e.start >= n.start - 1 && e.end <= n.end + 1);
      now.textContent = `阈值 ${th} dB：提示 ${sim.alarms} 次`;
      this.scene.querySelector('#c-log').innerHTML = sim.episodes.map(e => `<li class="${isNoisy(e) ? '' : 'false-alarm'}">${e.startLabel}—${e.endLabel} 超过阈值 → 提示${isNoisy(e) ? '（喧哗）' : '（正常聊天时也提示了）'}</li>`).join('') || '<li>整个课间都没有超过阈值：喧哗时也没提示。</li>';
      this.draw();
      const msg = sim.fit ? `阈值 ${th} dB：只在两段喧哗时提示，正常聊天不打扰。` : sim.falseAlarms ? `阈值 ${th} dB：正常聊天时也提示了 ${sim.falseAlarms} 次，太敏感了。` : `阈值 ${th} dB：有 ${sim.missed} 段喧哗没有提示，太迟钝了。`;
      this.ctx.say(msg, sim.fit ? 'good' : 'bad');
      this.ctx.addTrial({ threshold: th, alarms: sim.alarms, falseAlarms: sim.falseAlarms, caught: sim.caught, overSec: sim.overSec, fit: sim.fit, at: Date.now() }, { design: { threshold: th } });
      this.runs();
    };
    if (reduced()) { finish(); return; }
    this.cursor = 0;
    this.timer = this.every(() => {
      this.cursor = Math.min(60, this.cursor + 1);
      const v = this.series[this.cursor], hit = sim.episodes.filter(e => e.start <= this.cursor && !this.shown.includes(e));
      if (hit.length) { this.shown.push(...hit); this.ctx.sfx?.('alarm'); }
      lamp.classList.toggle('on', v > th);
      now.textContent = `${R().secLabel(this.cursor)} · ${v} dB ${v > th ? '> ' + th + ' 提示！' : '≤ ' + th}`;
      this.draw();
      if (this.cursor >= 60) { this.stopTimer(this.timer); finish(); }
    }, 70);
  }
  runs() {
    const ts = (this.ctx.record().trials || []).filter(t => Number.isInteger(t.threshold));
    const uniq = [...new Map(ts.map(t => [t.threshold, t])).values()];
    this.controls.querySelector('#c-runs').innerHTML = uniq.length ? '已试：' + uniq.slice(-5).map(t => `<span class="run-pill ${t.fit ? 'std' : 'bad'}">${t.threshold} dB → ${t.alarms} 次 ${t.fit ? '✓' : '✗'}</span>`).join('') : '';
  }
}

export const experimentClasses = { flow: FlowExperiment, wave: WaveExperiment, life: LifeExperiment, threshold: ThresholdExperiment, design: DesignExperiment };
