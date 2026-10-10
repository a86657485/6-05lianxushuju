/*
 * 小递夜巡 · 小区自动管家 —— 游戏规则核心（纯逻辑、可复现，浏览器与服务端共用；服务端用它重算成绩）。
 * 改编自 umehabibaa/Plant_Growing_Game（MIT）：沿用其“土壤湿度随时间连续下降、天气事件（下雨/热浪）改变变化速度、
 * 太干枯萎/太湿烂根”的养成规则；原作由玩家手动点“浇水”，这里改成“传感器→比较阈值→执行器”的自动控制，
 * 玩家只能拖动阈值线、切换采样间隔。另新增路灯、噪声监测两个场景，每关只引入一条新规则。
 * 科学原理就是规则本身：蒸发让湿度连续下降、日落让光照连续变暗、开关一次就磨损一次、采样一次耗一次电、阈值决定报警。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NightCore = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const r1 = v => Math.round(v * 10) / 10;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function rng(seed) { let s = (seed >>> 0) || 1; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const smooth = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);

  /* ---------------- 关卡：每关一条新规则 ---------------- */
  const LEVELS = [
    {
      id: 'garden', n: 1, place: '花园', title: '花园自动浇水', ticks: 240, unit: '%', quantity: '土壤湿度', min: 0, max: 100,
      rule: '新规则：太阳晒、植物喝，土里的水一点点变少——湿度连续下降；热浪时降得更快，下雨时会往上涨。',
      goal: '湿度低于“开泵线”，水泵就自动浇水。把开泵线拖到合适位置，让花一直待在绿色舒适区（30%—80%）。',
      controls: [{ key: 'a', label: '开泵线', def: 15, min: 5, max: 95, color: '#3fc1b5' }],
      zones: [{ from: 30, to: 80, label: '舒适区', color: 'rgba(103,214,140,.16)' }],
      device: '水泵', on: '浇水', off: '停',
      stars: [80, 200, 260],
      discover: { q: '这一关我发现：', options: [
        ['ok', '湿度是一点点连续变化的，系统每一刻都拿读数和开泵线比较，低了就浇水'],
        ['two', '湿度只有“干”和“湿”两种状态，跳来跳去'],
        ['timer', '水泵是按固定时间开的，和读数没关系']] }
    },
    {
      id: 'lamp', n: 2, place: '楼道', title: '楼道自动路灯', ticks: 240, unit: 'lux', quantity: '光照强度', min: 0, max: 450,
      rule: '新规则：太阳落山，光照连续变暗；云和车灯让读数上下抖。灯每开关一次就磨损一次（−6分），开关10次灯泡就烧坏。',
      goal: '读数低于“开灯线”就开灯，高于“关灯线”就关灯。天黑要亮灯，又别让灯一闪一闪。',
      controls: [{ key: 'a', label: '开灯线', def: 100, min: 10, max: 400, color: '#ffd166' }, { key: 'b', label: '关灯线', def: 100, min: 10, max: 400, color: '#ff9f6b' }],
      zones: [{ from: 0, to: 80, label: '天黑要亮灯', color: 'rgba(255,209,102,.10)' }],
      device: '路灯', on: '亮', off: '灭', wearLimit: 10,
      stars: [80, 170, 210],
      discover: { q: '这一关我发现：', options: [
        ['ok', '两条线中间留出缓冲，读数小小一抖不会让灯来回开关'],
        ['high', '开灯线越高越好，灯早点亮就不会出错'],
        ['bulb', '灯一闪一闪是灯泡质量问题，和阈值怎么设没关系']] }
    },
    {
      id: 'sample', n: 3, place: '监测站', title: '噪声监测站的电池', ticks: 300, unit: 'dB', quantity: '声音强度', min: 30, max: 90,
      rule: '新规则：声音连续变化，传感器只在“采样”那一刻读一次数；每读一次耗1格电，电池共120格，要撑到天亮。',
      goal: '超过60 dB的吵闹声要被记录下来。选择多久读一次数：读太勤电池撑不住，读太稀会漏掉短促的声音。',
      controls: [{ key: 'k', label: '采样间隔', def: 1, options: [[1, '每1秒'], [3, '每3秒'], [10, '每10秒']], color: '#7fe6dc' }],
      zones: [{ from: 60, to: 90, label: '要记录', color: 'rgba(255,120,120,.10)' }], fixed: { line: 60, label: '记录线 60 dB' },
      device: '传感器', battery: 120,
      stars: [60, 120, 145],
      discover: { q: '这一关我发现：', options: [
        ['ok', '声音连续变化，两次读数之间也在变；读得太稀会漏掉，太勤又费电，要选合适的间隔'],
        ['less', '读得越少越好，省电最重要'],
        ['same', '两次读数之间声音不会变化，所以多久读一次都一样']] }
    },
    {
      id: 'alarm', n: 4, place: '广场', title: '夜间噪声报警', ticks: 300, unit: 'dB', quantity: '声音强度', min: 30, max: 90,
      rule: '新规则：读数超过“报警线”，小递就出发去劝导。真扰民的声音（大而持久）要管；关门、狗叫这种短短的正常声音去了就是误报。',
      goal: '拖动报警线：太低会白跑很多趟（误报），太高会漏掉真吵闹（漏报，居民投诉）。',
      controls: [{ key: 'a', label: '报警线', def: 50, min: 35, max: 85, color: '#ff7a7a' }],
      zones: [], device: '小递', on: '出发', off: '待命',
      stars: [20, 50, 60],
      discover: { q: '这一关我发现：', options: [
        ['ok', '阈值决定什么时候报警：太低误报多、太高漏报多，同样的数据换个阈值结果就不同'],
        ['low', '报警线越低越安全，宁可多跑几趟'],
        ['sound', '报警多少只由声音大小决定，和阈值设在哪儿无关']] }
    }
  ];
  const byId = Object.fromEntries(LEVELS.map(L => [L.id, L]));

  /* ---------------- 环境：同一个种子 = 同一晚的数据 ---------------- */
  function environment(L, seed) {
    const R = rng(seed * 7919 + L.n * 104729), T = L.ticks, env = { seed, events: [] };
    if (L.id === 'garden') {
      // 天气时间表：晴（正常蒸发）→ 热浪 / 下雨 交替，原作 changeWeather 的四种天气简化为三种
      const w = []; let t = 0, kinds = R() < 0.5 ? ['heat', 'rain'] : ['rain', 'heat'], i = 0;
      while (t < T) { const sunny = 25 + Math.floor(R() * 20); w.push(['sunny', t, Math.min(T, t + sunny)]); t += sunny; if (t >= T) break; const k = kinds[i++ % 2], d = 26 + Math.floor(R() * 14); w.push([k, t, Math.min(T, t + d)]); env.events.push({ kind: k, from: t, to: Math.min(T, t + d) }); t += d; }
      env.weather = Array.from({ length: T }, (_, x) => w.find(s => x >= s[1] && x < s[2])[0]);
      env.noise = Array.from({ length: T }, () => r1((R() - 0.5) * 1.6));
      env.start = 62;
    } else if (L.id === 'lamp') {
      const cars = []; for (let k = 0; k < 3; k++) cars.push(150 + k * 30 + Math.floor(R() * 14));
      env.events = cars.map(c => ({ kind: 'car', from: c, to: c + 4 })).concat([{ kind: 'cloud', from: 40, to: 80 }]);
      const phase = R() * 6;
      env.truth = Array.from({ length: T }, (_, t) => {
        const dusk = 5 + 415 * (1 - smooth(t / 165));
        const cloud = t < 120 ? 28 * Math.sin(t / 9 + phase) * (1 - t / 120) : 0;
        const car = cars.some(c => t >= c && t < c + 4) ? 125 : 0;
        return r1(Math.max(2, dusk + cloud + car));
      });
      env.noise = Array.from({ length: T }, () => r1((R() - 0.5) * 36));
    } else {
      const isAlarm = L.id === 'alarm', ev = [];
      const plan = isAlarm
        ? ['real', 'normal', 'normal', 'real', 'normal', 'normal', 'real', 'normal'].sort(() => R() - 0.5)
        : Array(6).fill('spike');
      const slot = Math.floor((T - 30) / plan.length);
      plan.forEach((kind, i) => {
        const d = kind === 'real' ? 16 + Math.floor(R() * 9) : kind === 'normal' ? 2 + Math.floor(R() * 3) : 4 + Math.floor(R() * 4);
        const from = 15 + i * slot + Math.floor(R() * Math.max(1, slot - d - 4));
        const level = kind === 'real' ? 64 + Math.floor(R() * 9) : kind === 'normal' ? 52 + Math.floor(R() * 7) : 66 + Math.floor(R() * 9);
        ev.push({ kind, from, to: from + d, level, label: kind === 'real' ? ['装修电钻', '音响外放', '深夜聚会'][Math.floor(R() * 3)] : kind === 'normal' ? ['关门声', '狗叫一声', '一阵风'][Math.floor(R() * 3)] : ['摩托车', '关车门', '喇叭'][Math.floor(R() * 3)] });
      });
      env.events = ev;
      const ph = R() * 6;
      env.truth = Array.from({ length: T }, (_, t) => {
        let v = 42 + 5 * Math.sin(t / 23 + ph) + 2.2 * Math.sin(t / 5.3 + ph * 2) + (R() - 0.5) * 2.4;
        for (const e of ev) if (t >= e.from && t < e.to) v = Math.max(v, e.level + (R() - 0.5) * 2.5);
        return r1(v);
      });
    }
    return env;
  }

  /* ---------------- 运行：每一格都是 输入 → 计算 → 输出 ---------------- */
  function defaults(L) { return Object.fromEntries(L.controls.map(c => [c.key, c.def])); }
  function sanitize(L, c, prev) {
    const out = { ...prev };
    for (const d of L.controls) {
      if (!(d.key in c)) continue;
      let v = Number(c[d.key]); if (!Number.isFinite(v)) continue;
      if (d.options) { if (d.options.some(o => o[0] === v)) out[d.key] = v; }
      else out[d.key] = Math.round(clamp(v, d.min, d.max));
    }
    if (L.id === 'lamp' && out.b < out.a) out.b = out.a; // 关灯线不能低于开灯线
    return out;
  }
  function create(levelId, seed) {
    const L = byId[levelId]; if (!L) throw new Error('未知关卡');
    seed = (Number(seed) >>> 0) || 1;
    const env = environment(L, seed);
    return { L, env, seed, t: 0, c: defaults(L), on: false, value: env.start ?? env.truth[0], reading: null, battery: L.battery || 0,
      score: 0, combo: 0, bestCombo: 0, switches: 0, broken: false, log: [], rows: [], handled: new Set(), stats: { good: 0, bad: 0, dry: 0, flood: 0, waste: 0, dark: 0, caught: 0, missed: 0, falseAlarm: 0, samples: 0, water: 0 }, done: false, pops: [] };
  }
  function control(sim, c) {
    const next = sanitize(sim.L, c, sim.c);
    if (Object.keys(next).some(k => next[k] !== sim.c[k])) { sim.c = next; const last = sim.log.at(-1); if (last && last.t === sim.t) Object.assign(last, next); else sim.log.push({ t: sim.t, ...next }); }
    return sim.c;
  }
  function award(sim, pts, good, msg) {
    sim.score = r1(sim.score + pts);
    if (good) { sim.combo++; sim.bestCombo = Math.max(sim.bestCombo, sim.combo); if (sim.combo % 20 === 0) { sim.score = r1(sim.score + 5); sim.pops.push({ t: sim.t, text: `连击×${sim.combo} +5`, good: true }); } }
    else if (good === false) sim.combo = 0;
    if (msg) sim.pops.push({ t: sim.t, text: msg, good: !!good });
  }
  function tick(sim) {
    if (sim.done) return null;
    const { L, env } = sim, t = sim.t, c = sim.c;
    let row = { t };
    if (L.id === 'garden') {
      const w = env.weather[t];
      const evap = w === 'heat' ? 0.95 : w === 'rain' ? -1.05 : 0.45;           // 输入之前：环境按规则连续变化
      sim.reading = r1(clamp(sim.value + env.noise[t], 0, 100));                    // 输入：传感器读数
      const want = sim.reading < c.a;                                              // 计算：读数 < 开泵线？
      sim.on = want;                                                               // 输出：水泵开/关
      sim.value = clamp(sim.value - evap + (sim.on ? 1.6 : 0), 0, 100);
      if (sim.on) { sim.stats.water++; sim.score = r1(sim.score - 0.2); }
      const m = sim.value;
      if (m < 30) { sim.stats.dry++; award(sim, -1.5, false, t % 15 === 0 ? '太干，花蔫了' : ''); }
      else if (m > 85) { sim.stats.flood++; award(sim, -1.5, false, t % 15 === 0 ? '太湿，根要烂了' : ''); }
      else { sim.stats.good++; award(sim, 1, true); }
      row = { t, truth: r1(m), reading: sim.reading, on: sim.on, weather: w, cmp: `${sim.reading} < 开泵线${c.a}？`, yes: want };
    } else if (L.id === 'lamp') {
      const truth = env.truth[t];
      sim.reading = r1(Math.max(0, truth + env.noise[t]));
      const before = sim.on;
      let cmp, yes;
      if (sim.broken) { sim.on = false; cmp = '灯泡已烧坏'; yes = false; }
      else if (sim.reading < c.a) { sim.on = true; cmp = `${sim.reading} < 开灯线${c.a}`; yes = true; }
      else if (sim.reading > c.b) { sim.on = false; cmp = `${sim.reading} > 关灯线${c.b}`; yes = false; }
      else { cmp = `在${c.a}—${c.b}之间，保持`; yes = sim.on; }
      if (!sim.broken && sim.on !== before) {
        sim.switches++; sim.score = r1(sim.score - 6); sim.combo = 0;
        sim.pops.push({ t, text: sim.on ? '开灯 磨损−6' : '关灯 磨损−6', good: false });
        if (sim.switches >= L.wearLimit) { sim.broken = true; sim.on = false; sim.score = r1(sim.score - 20); sim.pops.push({ t, text: '开关太频繁，灯泡烧坏了！−20', good: false }); }
      }
      if (truth < 80) { if (sim.on) { sim.stats.good++; award(sim, 1, true); } else { sim.stats.dark++; award(sim, -2, false, t % 12 === 0 ? '太黑了，路人看不见' : ''); } }
      else if (truth > 200) { if (!sim.on) { sim.stats.good++; award(sim, 0.5, true); } else { sim.stats.waste++; award(sim, -0.5, false); } }
      else { sim.stats.good++; award(sim, 0.5, true); }
      row = { t, truth, reading: sim.reading, on: sim.on, cmp, yes };
    } else if (L.id === 'sample') {
      const truth = env.truth[t];
      let reading = null;
      if (sim.battery > 0 && t % c.k === 0) { reading = truth; sim.battery--; sim.stats.samples++; }
      sim.reading = reading ?? sim.reading;
      const yes = reading !== null && reading > 60;
      sim.on = yes;
      if (yes) for (const e of env.events) if (t >= e.from && t < e.to && !sim.handled.has(e.from)) { sim.handled.add(e.from); sim.stats.caught++; award(sim, 25, true, `记录到「${e.label}」+25`); }
      for (const e of env.events) if (e.to === t + 1 && !sim.handled.has(e.from)) { sim.stats.missed++; award(sim, -10, false, `漏掉了「${e.label}」−10`); }
      if (sim.battery === 0 && reading === null && t % 40 === 0) sim.pops.push({ t, text: '电池没电了，什么也读不到', good: false });
      row = { t, truth, reading, on: yes, cmp: reading === null ? (sim.battery > 0 ? '这一秒不采样' : '没电，无读数') : `${reading} > 60？`, yes };
    } else {
      const truth = env.truth[t]; sim.reading = truth;
      const yes = truth > c.a, rising = yes && !sim.on;
      sim.on = yes;
      if (rising) {
        const e = env.events.find(e => e.kind === 'real' && t >= e.from - 1 && t < e.to);
        if (e && !sim.handled.has(e.from)) { sim.handled.add(e.from); sim.stats.caught++; award(sim, 20, true, `及时劝导「${e.label}」+20`); }
        else if (!e) { sim.stats.falseAlarm++; const n = env.events.find(x => t >= x.from - 1 && t < x.to); award(sim, -8, false, n ? `误报：只是${n.label} −8` : '误报：只是背景声 −8'); }
      }
      for (const e of env.events) if (e.kind === 'real' && e.to === t + 1 && !sim.handled.has(e.from)) { sim.stats.missed++; award(sim, -15, false, `漏报「${e.label}」，居民投诉 −15`); }
      row = { t, truth, reading: truth, on: yes, cmp: `${truth} > 报警线${c.a}？`, yes };
    }
    row.c = { ...c };
    sim.rows.push(row);
    sim.t++;
    if (sim.t >= L.ticks) finish(sim);
    return row;
  }
  function finish(sim) {
    sim.done = true;
    const L = sim.L;
    if (L.id === 'sample' && sim.battery > 0) { const bonus = Math.round(sim.battery * 0.2); sim.score = r1(sim.score + bonus); if (bonus) sim.pops.push({ t: sim.t, text: `电池剩余 ${sim.battery} 格 +${bonus}`, good: true }); }
    sim.stars = L.stars.filter(s => sim.score >= s).length;
  }
  /** 服务端/测试：按控制记录重放整晚，得到权威成绩。 */
  function replay(levelId, seed, log = []) {
    if (!Array.isArray(log) || log.length > 600) throw new Error('操作记录格式不正确');
    const sim = create(levelId, seed); let i = 0;
    const sorted = log.filter(e => e && Number.isInteger(e.t) && e.t >= 0 && e.t < sim.L.ticks).sort((x, y) => x.t - y.t);
    while (!sim.done) { while (i < sorted.length && sorted[i].t <= sim.t) control(sim, sorted[i++]); tick(sim); }
    return result(sim);
  }
  function result(sim) {
    return { level: sim.L.id, seed: sim.seed, score: sim.score, stars: sim.stars ?? 0, stats: { ...sim.stats, switches: sim.switches, broken: sim.broken, battery: sim.battery, bestCombo: sim.bestCombo }, controls: summarizeControls(sim) };
  }
  function summarizeControls(sim) {
    const rows = sim.rows, out = {};
    for (const d of sim.L.controls) { const vals = rows.map(r => r.c[d.key]); out[d.key] = { first: vals[0], last: vals.at(-1), min: Math.min(...vals), max: Math.max(...vals), changes: sim.log.filter(e => d.key in e).length }; }
    return out;
  }
  /** 曲线上任意时刻的值（两次记录之间线性插值）：连续量在两个时刻之间也有值。 */
  function valueAt(rows, x, key = 'truth') {
    if (!rows.length) return null;
    const i = Math.floor(x), f = x - i;
    if (i < 0) return rows[0][key]; if (i >= rows.length - 1) return rows.at(-1)[key];
    const a = rows[i][key], b = rows[i + 1][key];
    return a == null || b == null ? (a ?? b) : r1(a + (b - a) * f);
  }
  /** 解锁规则：最近一次20题考核 ≥ 80 分（服务端调用；前端只用来显示）。 */
  function gate(scores = []) {
    const list = scores.filter(v => Number.isFinite(v));
    const latest = list.length ? list[list.length - 1] : null, best = list.length ? Math.max(...list) : null;
    return { unlocked: latest !== null && latest >= 80, latest, best, pass: 80 };
  }
  return { gate, LEVELS, byId, create, control, tick, replay, result, valueAt, environment, rng, PASS: 80 };
});
