/* 第5课《连续变化的数据》共享规则：浏览器与课堂服务使用同一份判定。 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LessonRules = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const stages = [
    { id: 'flow', name: '数据在哪里流动', short: '数据流动', points: 10 },
    { id: 'wave', name: '声音数据的样子', short: '波形与散点', points: 10 },
    { id: 'life', name: '生活中的连续量', short: '生活连续量', points: 10 },
    { id: 'threshold', name: '阈值：何时该提示', short: '阈值', points: 10 },
    { id: 'design', name: '种植园自动浇水', short: '迁移设计', points: 10 }
  ];
  const stageIds = stages.map(s => s.id);
  const NIGHT_LIMIT = 55; // 教材案例1：夜间超过55 dB发出提示
  const round1 = v => Math.round(v * 10) / 10;
  const finite = v => typeof v === 'number' && Number.isFinite(v);

  /* ---------- 关卡1：噪声监测器的输入—计算—输出 ---------- */
  const squareScenes = {
    quiet: { label: '夜深人静', base: 38 },
    chat: { label: '几个人小声聊天', base: 49 },
    dance: { label: '广场舞音乐', base: 66 }
  };
  /** 仿真读数：在基准值附近连续波动（±2.5 dB），同一seed结果固定。 */
  function measureSquare(scene, seed = 0) {
    const s = squareScenes[scene];
    if (!s) return null;
    return round1(s.base + 2.5 * Math.sin(seed * 1.7 + s.base));
  }
  /** 计算环节：与阈值比较。教材写“超过”，等于阈值不算超过。 */
  function overLimit(value, limit = NIGHT_LIMIT) { return finite(value) && value > limit; }

  /* ---------- 关卡4：一晚的噪声曲线（20:00—23:00，每分钟一个读数，仿真数据） ---------- */
  const bumps = [
    { c: 16, w: 11, a: 19 },   // 20:05—20:28 广场舞
    { c: 53, w: 4, a: 9 },     // 20:50 前后 散步聊天
    { c: 81, w: 2.2, a: 27 },  // 21:21 摩托车经过
    { c: 108, w: 4, a: 6.5 },  // 21:48 孩子玩耍
    { c: 133, w: 3.5, a: 17 }, // 22:13 大声说笑
    { c: 162, w: 2.5, a: 10.5 } // 22:42 狗叫
  ];
  let nightCache = null;
  function nightNoise() {
    if (nightCache) return nightCache.slice();
    const out = [];
    for (let m = 0; m <= 180; m++) {
      let v = 43 - m * 0.02 + 1.2 * Math.sin(m / 7) + 0.6 * Math.sin(m / 2.3);
      for (const b of bumps) v += b.a * Math.exp(-(((m - b.c) / b.w) ** 4));
      out.push(round1(v));
    }
    nightCache = out;
    return out.slice();
  }
  function minuteLabel(m) {
    const h = 20 + Math.floor(m / 60), mm = m % 60;
    return h + ':' + String(mm).padStart(2, '0');
  }
  /** 超过阈值的连续时段算作一次提示；间隔不足3分钟的视为同一次。 */
  function alarmEpisodes(series, threshold) {
    const eps = [];
    let cur = null;
    series.forEach((v, i) => {
      if (v > threshold) {
        if (cur && i - cur.end <= 3) { cur.end = i; cur.peak = Math.max(cur.peak, v); }
        else { cur = { start: i, end: i, peak: v }; eps.push(cur); }
      }
    });
    return eps.map(e => ({ ...e, startLabel: minuteLabel(e.start), endLabel: minuteLabel(e.end) }));
  }
  function countAlarms(threshold) { return alarmEpisodes(nightNoise(), threshold).length; }

  /* ---------- 关卡5：种植园自动浇水（四天，每半小时一个读数，仿真数据） ---------- */
  const designData = {
    moisture: { label: '土壤湿度', unit: '%', min: 0, max: 100 },
    light: { label: '光照强度', unit: 'lux', min: 0, max: 1000 },
    temp: { label: '空气温度', unit: '℃', min: 0, max: 40 }
  };
  const BAND = { low: 30, high: 70 }; // 这种蔬菜适宜的土壤湿度
  function hourOf(step) { return (step / 2) % 24; }
  const weather = [1, 0.55, 0.6, 1]; // 第2、3天多云：光照弱、气温低
  function dayOf(step) { return Math.min(3, Math.floor(step / 48)); }
  function lightAt(step) {
    const h = hourOf(step);
    if (h < 6 || h >= 18.5) return 0;
    const x = Math.sin(Math.PI * (h - 6) / 12.5);
    return Math.round(Math.min(900, 1100 * x) * weather[dayOf(step)]);
  }
  function tempAt(step) { const h = hourOf(step); return round1(20 + 11 * weather[dayOf(step)] * Math.max(0, Math.sin(Math.PI * (h - 7) / 14))); }
  /**
   * 规则：所选数据“降到阈值及以下”（或“升到阈值及以上”）时开水泵；
   * 水泵每次连续工作5个时段，每段使湿度+5%；白天每半小时蒸发1%，夜晚每1.5小时蒸发1%。
   */
  function simulateGarden({ data = 'moisture', direction = 'below', threshold = 30 } = {}) {
    const steps = 192;
    let m = 56, pump = 0, waterings = 0;
    const moisture = [], pumpOn = [], reading = [];
    for (let i = 0; i < steps; i++) {
      const value = data === 'moisture' ? m : data === 'light' ? lightAt(i) : tempAt(i);
      reading.push(value);
      const trigger = direction === 'below' ? value <= threshold : value >= threshold;
      if (pump === 0 && trigger) { pump = 5; waterings++; }
      if (pump > 0) { m = Math.min(100, m + 5); pump--; pumpOn.push(true); }
      else {
        const h = hourOf(i), day = h >= 7 && h < 17;
        if (day || i % 3 === 0) m = Math.max(0, m - 1);
        pumpOn.push(false);
      }
      moisture.push(m);
    }
    const min = Math.min(56, ...moisture), max = Math.max(56, ...moisture);
    return { moisture, pumpOn, reading, min, max, waterings, fit: min >= BAND.low && max <= BAND.high };
  }

  /* ---------- 证据检查（界面与服务端同一函数） ---------- */
  /* 找阈值：每句话里都有“测到的数据”和“参考值”两个数，干扰项按“把数据当阈值”“把输出当阈值”设计。 */
  const thresholdCases = {
    kettle: { text: '从20 ℃开始烧水，传感器每1秒测一次水温，水温达到100 ℃时电热水壶自动断电。', answer: '100℃', options: ['20℃', '1秒', '100℃'], tags: { '20℃': 'threshold-is-data', '1秒': 'threshold-is-data' } },
    fridge: { text: '冰箱冷藏区现在是6 ℃；温度高于4 ℃时，压缩机就开始制冷。', answer: '4℃', options: ['6℃', '4℃', '压缩机'], tags: { '6℃': 'threshold-is-data', '压缩机': 'threshold-is-device' } },
    heart: { text: '小华的手环测到心率是88次/min；心率超过100次/min时，手环就发出警报。', answer: '100次/min', options: ['88次/min', '100次/min', '发出警报'], tags: { '88次/min': 'threshold-is-data', '发出警报': 'threshold-is-output' } },
    highway: { text: '小夏爸爸的车速表显示95 km/h，这条高速公路车道限速100～120 km/h。', answer: '100～120 km/h', options: ['95 km/h', '100～120 km/h', '车速表'], tags: { '95 km/h': 'threshold-is-data', '车速表': 'threshold-is-device' } }
  };
  /* 生活数据卡：连续量 c；不是连续量的分为“只能一个一个数”（count）和“只有几种状态”（state），两种理由都算判断正确。 */
  const lifeCards = {
    light: { label: '拉窗帘时教室里的光照强度', kind: 'c' },
    water: { label: '烧水时壶里的水温', kind: 'c' },
    cup: { label: '接水时杯中水面的高度', kind: 'c' },
    seedling: { label: '种植园里幼苗的高度', kind: 'c' },
    people: { label: '班级里的学生人数', kind: 'count' },
    lamp: { label: '电灯开关是开还是关', kind: 'state' },
    rope: { label: '一分钟跳绳的个数', kind: 'count' }
  };

  function experimentChecks(stage, record = {}) {
    const ts = Array.isArray(record.trials) ? record.trials.filter(t => t && typeof t === 'object') : [];
    const check = (id, label, complete) => ({ id, label, complete: !!complete });
    if (stage === 'flow') {
      const valid = ts.filter(t => squareScenes[t.scene] && finite(t.db) && t.over === overLimit(t.db));
      return [check('under', '一次未超过55 dB的监测', valid.some(t => !t.over)), check('over', '一次超过55 dB的监测', valid.some(t => t.over))];
    }
    if (stage === 'wave') {
      return [
        check('trace', '画出一段起伏的声音曲线', ts.some(t => t.kind === 'trace' && Number.isInteger(t.samples) && t.samples >= 30 && finite(t.min) && finite(t.max) && t.max - t.min >= 15)),
        check('between', '读出两个散点之间的数值', ts.some(t => t.kind === 'between' && finite(t.t) && finite(t.value) && finite(t.leftT) && finite(t.rightT) && t.leftT < t.t && t.t < t.rightT))
      ];
    }
    if (stage === 'life') {
      return [
        check('curtain', '慢慢拉动窗帘，记录光照变化', ts.some(t => t.kind === 'curtain' && Number.isInteger(t.distinct) && t.distinct >= 8 && finite(t.min) && finite(t.max) && t.max - t.min >= 300)),
        check('kettle', '烧水途中读出一个中间水温', ts.some(t => t.kind === 'kettle' && finite(t.reading) && t.reading > 20 && t.reading < 100))
      ];
    }
    if (stage === 'threshold') {
      const valid = ts.filter(t => Number.isInteger(t.threshold) && t.threshold >= 30 && t.threshold <= 90 && t.alarms === countAlarms(t.threshold));
      return [
        check('standard', '用55 dB阈值运行一次', valid.some(t => t.threshold === NIGHT_LIMIT)),
        check('compare', '换一个明显不同的阈值再运行', valid.some(t => Math.abs(t.threshold - NIGHT_LIMIT) >= 5))
      ];
    }
    if (stage === 'design') {
      const valid = ts.filter(t => designData[t.data] && ['below', 'above'].includes(t.direction) && finite(t.threshold) && t.fit === simulateGarden(t).fit);
      const keys = new Set(valid.map(t => t.data + '|' + t.direction + '|' + t.threshold));
      return [
        check('fit', '一次让湿度保持在30%—70%的运行', valid.some(t => t.fit)),
        check('compare', '至少比较两种不同设置', keys.size >= 2)
      ];
    }
    return [];
  }

  /*
   * 每站“说清楚”的卡片：compare（对照预测与结果）→ evidence（从自己的实验记录中选证据）→ 概念卡 → transfer（新情境，答错后换等价新情境）。
   * compare 的正确值随学生自己的预测而定：预测与目标一致选 match，否则选 differ。
   */
  const lifeExplain = Object.fromEntries(Object.entries(lifeCards).map(([k, v]) => [k, v.kind === 'c' ? 'c' : ['count', 'state']]));
  const goals = {
    flow: { prediction: 'all', explain: { evidence: 'result', input: 'sound-data', compute: 'judge', output: 'display' }, transfer: 'flow' },
    wave: { prediction: 'wave', explain: { evidence: 'between', reason: 'continuous' }, transfer: 'mid' },
    life: { prediction: 'gradual', explain: { evidence: 'range', ...lifeExplain }, transfer: 'yes' },
    threshold: { prediction: 'more', explain: { evidence: 'threshold', where: 'compute', ...Object.fromEntries(Object.entries(thresholdCases).map(([k, v]) => ['case:' + k, v.answer])) }, transfer: 'earlier' },
    design: { prediction: 'low', explain: { evidence: 'direct', role: 'decide', raise: 'often' }, transfer: 'ok' }
  };
  const predictionValues = {
    flow: ['input', 'all', 'output'], wave: ['wave', 'scatter'], life: ['gradual', 'jump'],
    threshold: ['more', 'less', 'same'], design: ['low', 'mid', 'high']
  };
  const transferItems = ['A', 'B'];
  /** 每张卡允许的选项值（服务端拒绝伪造值，也用于句块校验）。 */
  const optionValues = {
    flow: { evidence: ['result', 'device', 'scene'], input: ['sound-data', 'collector', 'early-judge'], compute: ['judge', 'processor', 'raw'], output: ['display', 'screen', 'music'], transfer: ['flow', 'devices', 'matter'] },
    wave: { evidence: ['between', 'gap', 'only'], reason: ['continuous', 'pretty', 'bigger'], transfer: ['mid', 'none', 'same'] },
    life: { evidence: ['range', 'two', 'steps'], ...Object.fromEntries(Object.keys(lifeCards).map(k => [k, ['c', 'count', 'state']])), transfer: ['yes', 'no', 'steps'] },
    threshold: { evidence: ['threshold', 'louder', 'broken'], where: ['compute', 'input', 'output'], ...Object.fromEntries(Object.entries(thresholdCases).map(([k, v]) => ['case:' + k, v.options])), transfer: ['earlier', 'faster', 'accurate'] },
    design: { evidence: ['direct', 'easy', 'any'], role: ['decide', 'measure', 'pump'], raise: ['often', 'later', 'same'], transfer: ['ok', 'x1', 'x2'] }
  };

  /* ---------- 常见误解：干扰项按误解设计，选错时记录误解标签（教师大屏统计） ---------- */
  const tagLabels = {
    'no-compare': '没有把自己的预测与实验结果对照',
    'only-one-stage': '认为只有一个环节有数据',
    'device-as-data': '把装置（麦克风、芯片、显示屏）当成数据',
    'stage-mix': '分不清各环节的数据（把读数当比较结果等）',
    'scene-as-data': '把环境里的声音、物质当成系统里的数据',
    'gap-no-data': '认为两个读数之间没有数值、声音“停了”',
    'step-change': '认为数值要到下次记录才跳变',
    'pretty-reason': '用“好看、清楚”代替连续变化的理由',
    'continuous-increasing': '认为连续变化就是一直变大',
    'cont-as-discrete': '把连续量当成只有几种状态或跳着变',
    'countable-continuous': '把能一个一个数的数（人数、个数）当成连续量',
    'state-continuous': '把开关状态当成连续量',
    'threshold-is-data': '把测到的数据当成阈值',
    'threshold-is-output': '把阈值当成输出（提示、警报、动作）',
    'threshold-is-device': '把阈值当成装置或测量工具',
    'data-changed': '认为提示次数变化是因为数据变了',
    'threshold-no-effect': '认为改阈值不会影响结果',
    'threshold-direction': '弄反阈值调高、调低的后果',
    'any-data': '认为采集什么数据都行，不看需求',
    'threshold-mid': '认为阈值放在范围正中间最合适',
    'threshold-high': '认为阈值设得越高越保险',
    'ipo-confused': '分不清输入数据、阈值和输出'
  };
  const optionTags = {
    flow: { evidence: { device: 'device-as-data', scene: 'scene-as-data' }, input: { collector: 'device-as-data', 'early-judge': 'stage-mix' }, compute: { processor: 'device-as-data', raw: 'stage-mix' }, output: { screen: 'device-as-data', music: 'scene-as-data' }, transfer: { devices: 'device-as-data', matter: 'scene-as-data' } },
    wave: { evidence: { gap: 'gap-no-data', only: 'gap-no-data' }, reason: { pretty: 'pretty-reason', bigger: 'continuous-increasing' }, transfer: { none: 'gap-no-data', same: 'step-change' } },
    life: { evidence: { two: 'cont-as-discrete', steps: 'cont-as-discrete' }, transfer: { no: 'cont-as-discrete', steps: 'step-change' } },
    threshold: { evidence: { louder: 'data-changed', broken: 'data-changed' }, where: { input: 'threshold-is-data', output: 'threshold-is-output' }, transfer: { faster: 'threshold-is-output', accurate: 'threshold-is-device' } },
    design: { evidence: { easy: 'any-data', any: 'any-data' }, role: { measure: 'threshold-is-device', pump: 'threshold-is-output' }, raise: { later: 'threshold-direction', same: 'threshold-no-effect' }, transfer: { x1: 'ipo-confused', x2: 'ipo-confused' } }
  };
  /** 预测里的初始想法（预测不判对错，只用于大屏“预测→结果”的转变统计）。 */
  const predictionTags = {
    flow: { input: 'only-one-stage', output: 'only-one-stage' }, wave: { scatter: 'gap-no-data' }, life: { jump: 'cont-as-discrete' },
    threshold: { less: 'threshold-direction', same: 'threshold-no-effect' }, design: { mid: 'threshold-mid', high: 'threshold-high' }
  };
  function tagFor(stage, key, value) {
    if (!value) return null;
    if (stage === 'life' && lifeCards[key]) {
      const kind = lifeCards[key].kind;
      if (kind === 'c') return value === 'c' ? null : 'cont-as-discrete';
      if (value !== 'c') return null;
      return kind === 'state' ? 'state-continuous' : 'countable-continuous';
    }
    if (key.startsWith('case:')) return thresholdCases[key.slice(5)]?.tags[value] || null;
    return optionTags[stage]?.[key]?.[value] || null;
  }
  /* ---------- 站末句块：我原来以为……实验中我看到……所以我认为……（只记录，不判分；误解句块计入大屏） ---------- */
  const reflectOptions = {
    flow: { saw: ['ipo', 'screen'], so: ['all', 'device', 'input'] },
    wave: { saw: ['between', 'dots'], so: ['continuous', 'scatter'] },
    life: { saw: ['many', 'two'], so: ['continuous', 'count'] },
    threshold: { saw: ['diff', 'same'], so: ['compute', 'data'] },
    design: { saw: ['band', 'any'], so: ['need', 'mid'] }
  };
  const reflectTags = {
    flow: { screen: 'only-one-stage', device: 'device-as-data', input: 'only-one-stage' }, wave: { dots: 'gap-no-data', scatter: 'gap-no-data' },
    life: { two: 'cont-as-discrete', count: 'countable-continuous' }, threshold: { same: 'threshold-no-effect', data: 'threshold-is-data' }, design: { any: 'any-data', mid: 'threshold-mid' }
  };
  function validReflect(stage, r) {
    const o = reflectOptions[stage];
    return !!(o && r && typeof r === 'object' && o.saw.includes(r.saw) && o.so.includes(r.so));
  }

  const messages = {
    flow: {
      compare: '对照需再检查：你的预测和实验里三格出现的内容一致吗？',
      evidence: '证据需再检查：哪条记录是“算”出来的新数据？',
      input: '输入环节需再检查：写的是采集到的数据，还是采集装置？',
      compute: '计算环节需再检查：比较之后“算”出了什么数据？',
      output: '输出环节需再检查：输出的是数据结果，还是显示屏这个设备？',
      transfer: '新系统：数据怎样从输入流到输出？',
      experiment: '记录一次未超过、一次超过55 dB的监测'
    },
    wave: {
      compare: '对照需再检查：你的预测和你画出的曲线一致吗？',
      evidence: '证据需再检查：你在两个圆点之间读到的数值说明了什么？',
      reason: '曲线更合适的理由需再检查：声音数据在时间上有什么特点？',
      transfer: '两次读数之间的时刻也有数值吗？',
      experiment: '画出起伏的声音曲线，并读出两个散点之间的数值'
    },
    life: {
      compare: '对照需再检查：你的预测和光照表的变化一致吗？',
      evidence: '证据需再检查：光照经过了那么多不同读数，说明什么？',
      sort: '连续量分类需再检查：数据能否在一个范围内取到中间的任意数值？',
      transfer: '新情境：变化时会不会经过中间的数值？',
      experiment: '拉动窗帘记录光照变化，并在烧水途中读一个水温'
    },
    threshold: {
      compare: '对照需再检查：你的预测和两次运行的提示次数一致吗？',
      evidence: '证据需再检查：同一晚的数据，什么改变了判断结果？',
      where: '阈值的位置需再检查：阈值是采集到的数据，还是用来比较的参考值？',
      cases: '案例中的阈值需再检查：找出系统用来比较的那个参考值，而不是测到的数据。',
      transfer: '新情境：只改了参考值，结果会怎样变？',
      experiment: '用55 dB运行一次，再换一个明显不同的阈值运行比较'
    },
    design: {
      compare: '对照需再检查：你预测的阈值位置和你成功的方案一致吗？',
      evidence: '证据需再检查：水泵要回应的需求是什么？',
      design: '方案还没让湿度一直保持在30%—70%：回看曲线哪里跑出了绿色带，再调整。',
      role: '阈值作用需再检查：阈值是测量工具，还是比较判断的参考？',
      raise: '阈值调高后的结果需再检查：比较两次运行的浇水次数和最高湿度。',
      transfer: '新情境：分清输入数据、阈值和输出。',
      experiment: '找到一种合适设置，并与另一种设置比较'
    }
  };

  const obj = v => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  /**
   * 判定一份记录。返回 pass、给学生/教师看的 errors、需要修订的卡片 wrong、误解标签 tags，
   * 以及分项 parts（预测、实验、解释、方案、迁移），供“首次/最近”和证据星使用。
   */
  function assess(stage, record) {
    const empty = { prediction: false, experiment: false, explain: false, design: false, transfer: false };
    if (!stageIds.includes(stage) || !record || typeof record !== 'object') return { pass: false, errors: ['还没有本关学习记录'], wrong: [], tags: [], parts: empty };
    const errors = [], wrong = [], tags = new Set();
    const g = goals[stage], m = messages[stage], r = record, ex = obj(r.explain);
    const add = msg => { if (!errors.includes(msg)) errors.push(msg); };
    if (r.submitted !== true) add('请提交本次解释后再检验');
    const predOk = predictionValues[stage].includes(r.prediction);
    if (!predOk) add('先留下你的首次预测');
    const expOk = experimentChecks(stage, r).every(c => c.complete);
    if (!expOk) add(m.experiment);
    const cmp = predOk ? (r.prediction === g.prediction ? 'match' : 'differ') : null;
    if (ex.compare !== cmp) { wrong.push('compare'); add(m.compare); if (ex.compare) tags.add('no-compare'); }
    for (const [k, expect] of Object.entries(g.explain)) {
      const v = ex[k], ok = Array.isArray(expect) ? expect.includes(v) : v === expect;
      if (ok) continue;
      wrong.push(k);
      add(stage === 'life' && lifeCards[k] ? m.sort : k.startsWith('case:') ? m.cases : m[k]);
      const t = tagFor(stage, k, v); if (t) tags.add(t);
    }
    let designOk = true;
    if (stage === 'design') {
      const d = obj(r.design), sim = simulateGarden(d);
      designOk = d.data === 'moisture' && d.direction === 'below' && finite(d.threshold) && sim.fit;
      if (!designOk) add(m.design);
    }
    const transferOk = transferItems.includes(r.transferItem || 'A') && r.transfer === g.transfer;
    if (!transferOk) { wrong.push('transfer'); add(m.transfer); const t = tagFor(stage, 'transfer', r.transfer); if (t) tags.add(t); }
    const explainOk = wrong.every(k => k === 'transfer');
    return { pass: errors.length === 0, errors, wrong, tags: [...tags], parts: { prediction: predOk, experiment: expOk, explain: explainOk, design: designOk, transfer: transferOk } };
  }
  /** 这一站作答的“内容指纹”：内容没变的重复提交（如补写句块）不算新的一次尝试。 */
  function answerKey(r) { const x = obj(r); return JSON.stringify([x.prediction, obj(x.explain), x.transfer, x.transferItem || 'A', obj(x.design)]); }

  /**
   * 一站的证据摘要（服务端写入记录、大屏统计、学生端显示共用）。
   * 证据星：完成本站 1 颗；首次提交时解释卡全对 +1；首次提交时解释卡全对且迁移题也答对，再 +1（逐级，不单独为迁移给星）。
   * 首次提交前用了第3级“具体帮助”的，后两颗不计（记作有支持的表现，不扣积分）。
   */
  function stageSummary(stage, st, awarded) {
    st = obj(st);
    const fs = st.firstSubmitted, ls = st.lastSubmitted, latest = st.latest || ls;
    const fa = fs ? assess(stage, fs) : null, la = ls ? assess(stage, ls) : null;
    const firstHint = Number(fs?.conceptHintLevel) || 0, independent = firstHint < 3;
    const explainFirst = !!fa?.parts.explain, transferFirst = !!fa?.parts.transfer;
    // 星是逐级的：第三颗要求解释和迁移第一次都对（单道三选一的迁移题乱猜也有1/3机会，不能单独给星）
    const stars = awarded ? 1 + (explainFirst && independent ? 1 : 0) + (explainFirst && transferFirst && independent ? 1 : 0) : 0;
    const pred = st.first?.prediction || null;
    const reflectSrc = [latest, ls].find(x => validReflect(stage, x?.reflect));
    const reflect = reflectSrc ? { saw: reflectSrc.reflect.saw, so: reflectSrc.reflect.so } : null;
    const rTags = reflect ? [reflectTags[stage][reflect.saw], reflectTags[stage][reflect.so]].filter(Boolean) : [];
    const levels = [latest, ls, fs].map(x => Number(x?.conceptHintLevel) || 0);
    return {
      prediction: pred, predictionCorrect: pred ? pred === goals[stage].prediction : null, predictionTag: pred ? predictionTags[stage][pred] || null : null,
      submitted: !!fs, attempts: Number.isInteger(st.attempts) ? st.attempts : (fs ? 1 : 0), firstPass: !!fa?.pass, passed: !!awarded,
      explainFirst, transferFirst, transferFinal: !!la?.parts.transfer,
      firstHintLevel: firstHint, conceptHintLevel: Math.min(3, Math.max(...levels)), opHints: Number(latest?.hints) || 0,
      tagsFirst: fa?.tags || [], tagsLatest: la && !la.pass ? la.tags : [], reflect, reflectTags: [...new Set(rTags)], stars
    };
  }

  /** 教师测试的达标示例（虚构，不进入班级统计）。 */
  const full = (stage, extra) => ({ explain: { compare: 'match', ...goals[stage].explain }, transfer: goals[stage].transfer, transferItem: 'A', prediction: goals[stage].prediction, ...extra });
  const life = full('life', {}); for (const [k, v] of Object.entries(lifeCards)) life.explain[k] = v.kind;
  const examples = {
    flow: full('flow', { trials: [{ scene: 'quiet', db: measureSquare('quiet', 1), over: false }, { scene: 'dance', db: measureSquare('dance', 2), over: true }] }),
    wave: full('wave', { trials: [{ kind: 'trace', source: 'simulation', samples: 60, min: 38, max: 70 }, { kind: 'between', t: 7.5, value: 52.3, leftT: 6, rightT: 8 }] }),
    life: { ...life, trials: [{ kind: 'curtain', distinct: 20, min: 60, max: 800 }, { kind: 'kettle', reading: 63.5 }] },
    threshold: full('threshold', { trials: [{ threshold: 55, alarms: countAlarms(55) }, { threshold: 45, alarms: countAlarms(45) }] }),
    design: full('design', {
      trials: [35, 60].map(threshold => { const t = { data: 'moisture', direction: 'below', threshold }, g = simulateGarden(t); return { ...t, fit: g.fit, min: g.min, max: g.max, waterings: g.waterings }; }),
      design: { data: 'moisture', direction: 'below', threshold: 35 }
    })
  };
  for (const [k, e] of Object.entries(examples)) { e.submitted = true; e.reflect = { saw: reflectOptions[k].saw[0], so: reflectOptions[k].so[0] }; }

  return {
    stages, stageIds, NIGHT_LIMIT, squareScenes, measureSquare, overLimit,
    nightNoise, minuteLabel, alarmEpisodes, countAlarms,
    designData, BAND, simulateGarden, lightAt, tempAt,
    thresholdCases, lifeCards, experimentChecks, assess, goals, predictionValues, messages, examples,
    transferItems, optionValues, tagLabels, optionTags, predictionTags, tagFor, reflectOptions, reflectTags, validReflect, answerKey, stageSummary
  };
});
