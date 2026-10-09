/* 考后选做挑战“阈值调校”：读懂需求，把阈值设到合适位置，看监测曲线验证。不影响成绩与积分。 */
import { makeScale, pathOf, axes, svgOpen } from './charts.mjs?v=1';
import { escape } from './sync.mjs?v=1';

function series(fn, n = 120) { return Array.from({ length: n }, (_, i) => [i, Math.round(fn(i) * 10) / 10]); }
export const rounds = [
  { title: '夜间噪声监测', need: '小区规定：夜间声音超过55 dB发出提示。', unit: 'dB', min: 30, max: 80, answer: 55, dir: 'above', data: series(i => 45 + 8 * Math.sin(i / 9) + (i > 70 && i < 82 ? 14 : 0)) },
  { title: '电热水壶', need: '水温达到100 ℃时自动断电。', unit: '℃', min: 0, max: 110, answer: 100, dir: 'above', data: series(i => Math.min(100, 20 + 80 * (1 - Math.exp(-i / 30)) / (1 - Math.exp(-3.4)))) },
  { title: '运动手环', need: '心率超过100次/min时发出警报。', unit: '次/min', min: 50, max: 150, answer: 100, dir: 'above', data: series(i => 80 + 30 * Math.sin(i / 14) + 6 * Math.sin(i / 3)) },
  { title: '种植园浇水', need: '土壤湿度降到35%及以下时打开水泵。', unit: '%', min: 0, max: 100, answer: 35, dir: 'below', data: series(i => 62 - (i % 60) * 0.55) },
  { title: '教室自动灯', need: '光照强度低于300 lux时开灯。', unit: 'lux', min: 0, max: 800, answer: 300, dir: 'below', data: series(i => 520 - 380 * Math.sin(i / 38)) }
];
export function judge(round, value) {
  const tolerance = (round.max - round.min) * 0.01;
  return Math.abs(value - round.answer) <= tolerance;
}
export class RewardChallenge {
  constructor(container) { this.container = container; this.index = 0; this.score = 0; this.done = []; this.render(); }
  render() {
    const r = rounds[this.index];
    if (!r) { this.container.innerHTML = `<div class="reward"><h2>挑战完成：${this.score}/${rounds.length}</h2><p>你为 ${this.score} 个系统找准了阈值。阈值来自需求和标准，而不是曲线上最高或最低的点。</p><button id="reward-again">再玩一次</button></div>`; this.container.querySelector('#reward-again').onclick = () => { this.index = 0; this.score = 0; this.done = []; this.render(); }; return; }
    const start = Math.round((r.min + r.max) / 2);
    this.container.innerHTML = `<div class="reward"><p class="eyebrow">阈值调校挑战 · 第 ${this.index + 1}/${rounds.length} 关 · 选做，不计分</p><h2>${escape(r.title)}</h2><p><b>需求：</b>${escape(r.need)}</p><div id="reward-chart"></div>
      <label class="knob-row">把阈值设到合适位置<input id="reward-th" type="range" min="${r.min}" max="${r.max}" step="1" value="${start}"><b id="reward-val">${start} ${r.unit}</b></label>
      <div class="choice-row"><button id="reward-check" class="primary">检验</button><span id="reward-msg" role="status"></span></div></div>`;
    const slider = this.container.querySelector('#reward-th');
    const draw = v => {
      const s = makeScale({ width: 600, height: 200, xMin: 0, xMax: 119, yMin: r.min, yMax: r.max });
      const hits = r.data.filter(p => r.dir === 'above' ? p[1] >= v : p[1] <= v);
      this.container.querySelector('#reward-chart').innerHTML = svgOpen(s, r.title + '数据曲线') + axes(s, { yTicks: [r.min, r.answer === v ? v : Math.round((r.min + r.max) / 2), r.max], yLabel: r.unit }) +
        `<path d="${pathOf(r.data, s)}" class="curve"/>${hits.map(p => `<circle cx="${s.x(p[0])}" cy="${s.y(p[1])}" r="2.5" class="alarm-point"/>`).join('')}<line x1="${s.pad.l}" x2="${s.width - s.pad.r}" y1="${s.y(v)}" y2="${s.y(v)}" class="threshold-line"/></svg>`;
      this.container.querySelector('#reward-val').textContent = v + ' ' + r.unit;
    };
    slider.oninput = () => draw(Number(slider.value)); draw(start);
    this.container.querySelector('#reward-check').onclick = () => {
      const v = Number(slider.value), ok = judge(r, v), msg = this.container.querySelector('#reward-msg');
      if (ok) { this.score++; msg.textContent = '✓ 正确！红点是系统会作出反应的时刻。'; setTimeout(() => { this.index++; this.render(); }, 1200); }
      else { msg.textContent = '再看看需求里的数字：系统要拿数据和哪个数比较？'; }
    };
  }
  destroy() { this.container.innerHTML = ''; }
}
