/* 第5课《连续变化的数据》共享规则：浏览器与课堂服务使用同一份判定。 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LessonRules = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* 每站对应教参的学习目标（goal 1—3）与教学重难点（focus：key=重点“连续量数据的表现形式”，hard=难点“阈值的含义与作用”）。 */
  const GOALS = ['了解控制系统工作时产生的数据', '了解连续量的表现形式及应用', '能说出阈值在控制系统中的作用'];
  const FOCI = { key: '重点：连续量数据的表现形式', hard: '难点：阈值的含义与作用' };
  const stages = [
    { id: 'flow', name: '画监测系统示意图：什么在流动', short: '数据流动', points: 10, goal: 1, focus: null, textbook: '课文导入·噪声监测系统组成' },
    { id: 'wave', name: '学习活动1：分析采集的数据及特点', short: '波形与散点', points: 10, goal: 2, focus: 'key', textbook: '学习活动1' },
    { id: 'life', name: '学习活动2：感受生活中的连续量', short: '生活连续量', points: 10, goal: 2, focus: 'key', textbook: '学习活动2' },
    { id: 'threshold', name: '学习活动3：找阈值，看阈值的作用', short: '阈值的作用', points: 10, goal: 3, focus: 'hard', textbook: '学习活动3' },
    { id: 'design', name: '拓展与提升：给教室噪声监测器定阈值', short: '定阈值', points: 10, goal: 3, focus: 'hard', textbook: '拓展与提升' }
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
  /* 教材插图“噪声监测系统组成”：声音 → 数据采集装置 → 数据处理装置 → 数据输出装置。学生先把三个装置放进示意图。 */
  const schematicParts = { collect: '数据采集装置', process: '数据处理装置', output: '数据输出装置' };
  const schematicAnswer = { s1: 'collect', s2: 'process', s3: 'output' };
  function schematicOk(slots) { return !!slots && typeof slots === 'object' && Object.entries(schematicAnswer).every(([k, v]) => slots[k] === v); }
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

  /* ---------- 第5站（教材“拓展与提升”）：课间教室噪声，每10秒一个读数，共10分钟（仿真数据） ---------- */
  // 正常聊天约50—62 dB；两段喧哗（追跑打闹/大声喊）约70—78 dB。
  const NOISY = [{ start: 14, end: 19, label: '追跑打闹' }, { start: 41, end: 45, label: '有人大声喊' }];
  const ACCEPT = 65; // 仿真投票：大部分同学能接受的音量（教材：把大部分同学能接受的音量数值作为阈值）
  const STANDARDS = [
    { place: '居民区、学校（1类区）', day: 55, night: 45 },
    { place: '商业、居住混合区（2类区）', day: 60, night: 50 }
  ]; // GB 3096—2008《声环境质量标准》户外环境噪声限值（dB），教学引用
  let classCache = null;
  function classroomNoise() {
    if (classCache) return classCache.slice();
    const out = [];
    for (let i = 0; i <= 60; i++) {
      let v = 56 + 4 * Math.sin(i / 2.7) + 2 * Math.sin(i / 1.3 + 1) + 1.2 * Math.sin(i * 1.9);
      for (const n of NOISY) if (i >= n.start && i <= n.end) v = 74 + 2.5 * Math.sin(i * 1.7);
      out.push(round1(v));
    }
    classCache = out;
    return out.slice();
  }
  function secLabel(i) { const s = i * 10; return Math.floor(s / 60) + '分' + String(s % 60).padStart(2, '0') + '秒'; }
  /** 课间10分钟里的提示：连续超过阈值的一段算一次（间隔不足20秒视为同一次）。fit=只在两段喧哗时提示，且两段都提示到。 */
  function simulateClassroom(threshold) {
    const series = classroomNoise(), eps = [];
    let cur = null;
    series.forEach((v, i) => {
      if (v > threshold) { if (cur && i - cur.end <= 2) { cur.end = i; cur.peak = Math.max(cur.peak, v); } else { cur = { start: i, end: i, peak: v }; eps.push(cur); } }
    });
    const inNoisy = e => NOISY.some(n => e.start <= n.end && e.end >= n.start && e.start >= n.start - 1 && e.end <= n.end + 1);
    const falseAlarms = eps.filter(e => !inNoisy(e)).length;
    const caught = NOISY.filter(n => eps.some(e => e.start <= n.end && e.end >= n.start)).length;
    return { alarms: eps.length, overSec: series.filter(v => v > threshold).length * 10, falseAlarms, caught, missed: NOISY.length - caught, fit: falseAlarms === 0 && caught === NOISY.length, episodes: eps.map(e => ({ ...e, startLabel: secLabel(e.start), endLabel: secLabel(e.end) })) };
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
  /* 教材活动2.3“在校园生活中，哪些数据属于连续量？”＋教参蓝栏举例（上课铃声、接水水面、阳光时强时弱、生长期身高、烧水水温）。 */
  const lifeCards = {
    bell: { label: '一阵上课铃声的响度', kind: 'c' },
    cup: { label: '接水时杯中水面的高度', kind: 'c' },
    height: { label: '生长期同学的身高', kind: 'c' },
    water: { label: '烧水时壶里的水温', kind: 'c' },
    people: { label: '班级里的学生人数', kind: 'count' },
    lamp: { label: '教室电灯开关是开还是关', kind: 'state' },
    rope: { label: '一分钟跳绳的个数', kind: 'count' }
  };

  function experimentChecks(stage, record = {}) {
    const ts = Array.isArray(record.trials) ? record.trials.filter(t => t && typeof t === 'object') : [];
    const check = (id, label, complete) => ({ id, label, complete: !!complete });
    if (stage === 'flow') {
      const valid = ts.filter(t => squareScenes[t.scene] && finite(t.db) && t.over === overLimit(t.db));
      return [
        check('schematic', '把三个装置放进噪声监测系统示意图', ts.some(t => t.kind === 'schematic' && schematicOk(t.slots))),
        check('under', '一次未超过55 dB的监测', valid.some(t => !t.over)), check('over', '一次超过55 dB的监测', valid.some(t => t.over))
      ];
    }
    if (stage === 'wave') {
      return [
        check('trace', '画出一段起伏的声音曲线', ts.some(t => t.kind === 'trace' && Number.isInteger(t.samples) && t.samples >= 30 && finite(t.min) && finite(t.max) && t.max - t.min >= 15)),
        check('between', '读出两个散点之间的数值', ts.some(t => t.kind === 'between' && finite(t.t) && finite(t.value) && finite(t.leftT) && finite(t.rightT) && t.leftT < t.t && t.t < t.rightT))
      ];
    }
    if (stage === 'life') {
      return [
        check('curtain', '慢慢拉动窗帘，记录光照变化', ts.some(t => t.kind === 'curtain' && Number.isInteger(t.distinct) && t.distinct >= 8 && finite(t.min) && finite(t.max) && t.max - t.min >= 300))
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
      const valid = ts.filter(t => Number.isInteger(t.threshold) && t.threshold >= 40 && t.threshold <= 90 && t.alarms === simulateClassroom(t.threshold).alarms && t.fit === simulateClassroom(t.threshold).fit);
      return [
        check('fit', '一次只在喧哗时提示的阈值', valid.some(t => t.fit)),
        check('compare', '至少比较两个不同的阈值', new Set(valid.map(t => t.threshold)).size >= 2)
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
    wave: { prediction: 'wave', explain: { collect: 'sound', evidence: 'between', reason: 'continuous' }, transfer: 'mid' },
    life: { prediction: 'gradual', explain: { evidence: 'range', paper: 'together', meter: 'any', ...lifeExplain }, transfer: 'yes' },
    threshold: { prediction: 'more', explain: { evidence: 'threshold', role: 'judge', where: 'compute', ...Object.fromEntries(Object.entries(thresholdCases).map(([k, v]) => ['case:' + k, v.answer])) }, transfer: 'earlier' },
    design: { prediction: 'accept', explain: { evidence: 'context', role: 'decide', raise: 'miss' }, transfer: 'judge' }
  };
  const predictionValues = {
    flow: ['input', 'all', 'output'], wave: ['wave', 'scatter'], life: ['gradual', 'jump'],
    threshold: ['more', 'less', 'same'], design: ['standard', 'accept', 'quiet']
  };
  const transferItems = ['A', 'B'];
  /** 每张卡允许的选项值（服务端拒绝伪造值，也用于句块校验）。 */
  const optionValues = {
    flow: { evidence: ['result', 'device', 'scene'], input: ['sound-data', 'collector', 'early-judge'], compute: ['judge', 'processor', 'raw'], output: ['display', 'screen', 'music'], transfer: ['flow', 'devices', 'matter'] },
    wave: { collect: ['sound', 'light', 'screen'], evidence: ['between', 'gap', 'only'], reason: ['continuous', 'pretty', 'bigger'], transfer: ['mid', 'none', 'same'] },
    life: { evidence: ['range', 'two', 'steps'], paper: ['together', 'onoff', 'none'], meter: ['any', 'marks', 'onoff'], ...Object.fromEntries(Object.keys(lifeCards).map(k => [k, ['c', 'count', 'state']])), transfer: ['yes', 'no', 'steps'] },
    threshold: { evidence: ['threshold', 'louder', 'broken'], role: ['judge', 'still', 'quieter'], where: ['compute', 'input', 'output'], ...Object.fromEntries(Object.entries(thresholdCases).map(([k, v]) => ['case:' + k, v.options])), transfer: ['earlier', 'faster', 'accurate'] },
    design: { evidence: ['context', 'standard', 'louder'], role: ['decide', 'measure', 'volume'], raise: ['miss', 'more', 'same'], transfer: ['judge', 'data', 'device'] }
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
    'scene-as-collect': '分不清监测器要采集的是哪种数据',
    'blow-no-relation': '看不出吹气力度与纸片晃动一起连续变化',
    'meter-marks-only': '认为仪表只能停在刻度线上',
    'no-threshold-ok': '认为没有阈值系统也能判断、或阈值会改变数据本身',
    'standard-copy': '认为标准必须原样照用，不看实际情况',
    'threshold-quiet': '认为阈值越低越好（越安静越好）',
    'ipo-confused': '分不清输入数据、阈值和输出'
  };
  const optionTags = {
    flow: { evidence: { device: 'device-as-data', scene: 'scene-as-data' }, input: { collector: 'device-as-data', 'early-judge': 'stage-mix' }, compute: { processor: 'device-as-data', raw: 'stage-mix' }, output: { screen: 'device-as-data', music: 'scene-as-data' }, transfer: { devices: 'device-as-data', matter: 'scene-as-data' } },
    wave: { collect: { light: 'scene-as-collect', screen: 'device-as-data' }, evidence: { gap: 'gap-no-data', only: 'gap-no-data' }, reason: { pretty: 'pretty-reason', bigger: 'continuous-increasing' }, transfer: { none: 'gap-no-data', same: 'step-change' } },
    life: { evidence: { two: 'cont-as-discrete', steps: 'cont-as-discrete' }, paper: { onoff: 'blow-no-relation', none: 'blow-no-relation' }, meter: { marks: 'meter-marks-only', onoff: 'cont-as-discrete' }, transfer: { no: 'cont-as-discrete', steps: 'step-change' } },
    threshold: { evidence: { louder: 'data-changed', broken: 'data-changed' }, role: { still: 'no-threshold-ok', quieter: 'no-threshold-ok' }, where: { input: 'threshold-is-data', output: 'threshold-is-output' }, transfer: { faster: 'threshold-is-output', accurate: 'threshold-is-device' } },
    design: { evidence: { standard: 'standard-copy', louder: 'data-changed' }, role: { measure: 'threshold-is-device', volume: 'threshold-is-output' }, raise: { more: 'threshold-direction', same: 'threshold-no-effect' }, transfer: { data: 'threshold-is-data', device: 'threshold-is-device' } }
  };
  /** 预测里的初始想法（预测不判对错，只用于大屏“预测→结果”的转变统计）。 */
  const predictionTags = {
    flow: { input: 'only-one-stage', output: 'only-one-stage' }, wave: { scatter: 'gap-no-data' }, life: { jump: 'cont-as-discrete' },
    threshold: { less: 'threshold-direction', same: 'threshold-no-effect' }, design: { standard: 'standard-copy', quiet: 'threshold-quiet' }
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
    design: { saw: ['only-noisy', 'std-ok'], so: ['need', 'copy'] }
  };
  const reflectTags = {
    flow: { screen: 'only-one-stage', device: 'device-as-data', input: 'only-one-stage' }, wave: { dots: 'gap-no-data', scatter: 'gap-no-data' },
    life: { two: 'cont-as-discrete', count: 'countable-continuous' }, threshold: { same: 'threshold-no-effect', data: 'threshold-is-data' }, design: { 'std-ok': 'standard-copy', copy: 'standard-copy' }
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
      experiment: '先把三个装置放进示意图，再记录一次未超过、一次超过55 dB的监测'
    },
    wave: {
      compare: '对照需再检查：你的预测和你画出的曲线一致吗？',
      collect: '采集的数据需再检查：噪声监测系统要采集环境中的哪种数据？',
      evidence: '证据需再检查：你在两个圆点之间读到的数值说明了什么？',
      reason: '曲线更合适的理由需再检查：声音数据在时间上有什么特点？',
      transfer: '两次读数之间的时刻也有数值吗？',
      experiment: '打开（或录）一段声音曲线，并读出两个散点之间的数值'
    },
    life: {
      compare: '对照需再检查：你的预测和光照表的变化一致吗？',
      evidence: '证据需再检查：光照经过了那么多不同读数，说明什么？',
      paper: '吹纸片需再检查：吹气力度一点点变大时，纸片怎样变化？',
      meter: '仪表需再检查：指针或液柱能停在两条刻度线之间吗？',
      sort: '连续量分类需再检查：数据能否在一个范围内取到中间的任意数值？',
      transfer: '新情境：变化时会不会经过中间的数值？',
      experiment: '慢慢拉动窗帘，记录光照的变化'
    },
    threshold: {
      compare: '对照需再检查：你的预测和两次运行的提示次数一致吗？',
      evidence: '证据需再检查：同一晚的数据，什么改变了判断结果？',
      role: '阈值的作用需再检查：没有用来比较的参考值，系统能判断“超标”吗？',
      where: '阈值的位置需再检查：阈值是采集到的数据，还是用来比较的参考值？',
      cases: '案例中的阈值需再检查：找出系统用来比较的那个参考值，而不是测到的数据。',
      transfer: '新情境：只改了参考值，结果会怎样变？',
      experiment: '用55 dB运行一次，再换一个明显不同的阈值运行比较'
    },
    design: {
      compare: '对照需再检查：你预测的阈值依据和你成功的阈值一致吗？',
      evidence: '证据需再检查：为什么不能直接照搬55 dB？看看那次运行提示了几次、在什么时候。',
      design: '你选定的阈值还不能“只在喧哗时提示”：回看提示记录，再调整阈值。',
      role: '阈值作用需再检查：阈值是测量工具，还是比较判断的参考？',
      raise: '阈值调到很高后的结果需再检查：喧哗时的声音还会超过它吗？',
      transfer: '新情境：标准里的那个数，是测到的成绩，还是用来比较的参考？',
      experiment: '找到一个只在喧哗时提示的阈值，并与另一个阈值比较'
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
      const d = obj(r.design);
      designOk = Number.isInteger(d.threshold) && simulateClassroom(d.threshold).fit;
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
   * 证据星（出门门禁看 ★≥2）：
   *   ★1 完成本站（检验通过）；
   *   ★2 解释卡与证据一致——首次或后来修订通过均可（支持二刷达标）；
   *   ★3 首次独立（未用第3级具体帮助）且解释+迁移都对（逐级；迁移三选一不单独给星）。
   * 首次提交字段（explainFirst 等）仍只看第一次，供大屏诊断；星数允许二刷挣到第2颗。
   */
  function stageSummary(stage, st, awarded) {
    st = obj(st);
    const fs = st.firstSubmitted, ls = st.lastSubmitted, latest = st.latest || ls;
    const fa = fs ? assess(stage, fs) : null, la = ls ? assess(stage, ls) : null;
    const firstHint = Number(fs?.conceptHintLevel) || 0, independent = firstHint < 3;
    const explainFirst = !!fa?.parts.explain, transferFirst = !!fa?.parts.transfer;
    const explainOk = !!(fa?.parts.explain || la?.parts.explain);
    // ★2 可二刷挣到；★3 仍要求首次独立且解释+迁移都对
    const stars = awarded ? 1 + (explainOk ? 1 : 0) + (explainFirst && transferFirst && independent ? 1 : 0) : 0;
    const pred = st.first?.prediction || null;
    const reflectSrc = [latest, ls].find(x => validReflect(stage, x?.reflect));
    const reflect = reflectSrc ? { saw: reflectSrc.reflect.saw, so: reflectSrc.reflect.so } : null;
    const rTags = reflect ? [reflectTags[stage][reflect.saw], reflectTags[stage][reflect.so]].filter(Boolean) : [];
    const levels = [latest, ls, fs].map(x => Number(x?.conceptHintLevel) || 0);
    return {
      prediction: pred, predictionCorrect: pred ? pred === goals[stage].prediction : null, predictionTag: pred ? predictionTags[stage][pred] || null : null,
      submitted: !!fs, attempts: Number.isInteger(st.attempts) ? st.attempts : (fs ? 1 : 0), firstPass: !!fa?.pass, passed: !!awarded,
      explainFirst, transferFirst, transferFinal: !!la?.parts.transfer, explainOk,
      firstHintLevel: firstHint, conceptHintLevel: Math.min(3, Math.max(...levels)), opHints: Number(latest?.hints) || 0,
      tagsFirst: fa?.tags || [], tagsLatest: la && !la.pass ? la.tags : [], reflect, reflectTags: [...new Set(rTags)], stars
    };
  }

  /** 二刷教学引导（不给标准答案）：按未完成证据 / 误解标签给观察与思路。attempts≥1 时学生端启用。 */
  function retryGuidance(stage, record = {}) {
    const checks = experimentChecks(stage, record).filter(c => !c.complete);
    const tags = Array.isArray(record._tags) ? record._tags : [];
    const tips = {
      flow: {
        miss: '回看示意图：声音先被谁收进来？谁来算？谁把结果送出去？（教参：先回顾输入—计算—输出，再画示意图。）',
        'device-as-data': '装置是“谁在工作”，数据是它收到、算出、送出的内容。哪一格里的内容会随声音变化？',
        'scene-as-data': '环境里的声音要先被采集，才变成输入数据。计算格里多出来的是什么？',
        'stage-mix': '输入、计算、输出三格各看一眼：哪一格是“比较后才出现”的？',
        default: '对照你的两次监测记录，找出“算”出来的那一条，再选三环节里流动的数据。'
      },
      wave: {
        miss: '先打开监测器记录，再在两个圆点之间的曲线上点一下读数。（教参：先凭第一感觉判断，再体会连续。）',
        'gap-no-data': '你亲手点出的读数在不在圆点上？圆点之间曲线是连着的还是断开的？',
        'pretty-reason': '好看不是理由。任意两个时刻之间还有没有数值？',
        'continuous-increasing': '看你的曲线：声音是一直变大，还是有升有降？',
        default: '比较“只看散点”和“显示曲线”：哪个更能看出声音一直在变？'
      },
      life: {
        miss: '慢慢拉窗帘，让光照表经过许多不同读数；再吹纸片、看仪表。（教参：提供计量仪表，直观感受连续量。）',
        'cont-as-discrete': '能不能取到中间的某个数值？能一个一个数的，通常不是连续量。',
        'blow-no-relation': '轻轻吹和用力吹，纸片晃动一样吗？两者是不是一起连续变化？',
        'meter-marks-only': '车速从40加到41时，指针停在刻度线上，还是可以停在两条刻度之间？',
        default: '用“能否取到中间任意数值”判断：上课铃声、水面高度、人数、开关……哪些是连续量？'
      },
      threshold: {
        miss: '同一晚数据，先用55 dB运行，再换一个相差明显的阈值再运行，比较提示次数。（教参：不强调概念，强调作用。）',
        'data-changed': '两次回放的是同一条曲线吗？变的是红线（阈值），还是声音本身？',
        'no-threshold-ok': '如果没有参考值，64 dB 算“吵”还是“不吵”？和谁比？',
        'threshold-is-data': '测到的读数是输入数据；用来比较、决定是否提示的那个数才是阈值。',
        'threshold-is-device': '传感器、芯片、报警器是装置；阈值是一个参考数值。',
        'threshold-is-output': '提示、报警是输出；阈值是比较时用的参考。',
        default: '阈值变了，同一组数据的判断结果怎样变？在案例里找出那个“参考值”。'
      },
      design: {
        miss: '参考噪声标准和同学能接受的音量，试几个阈值，找到“只在喧哗时提示”的那一档。',
        'standard-copy': '55 dB 是居民区夜间标准。课间正常聊天会不会也超过55？阈值要按实际情况设定。',
        'data-changed': '两次用的是同一段课间录音吗？变的只有阈值。',
        'threshold-direction': '阈值调高，声音更难超过它，提示会变多还是变少？',
        'threshold-no-effect': '回看喧哗时的最高音量：它超过你设的阈值了吗？',
        default: '标准是参考；再问“大部分同学能接受的音量”，两者一起定阈值。'
      }
    }[stage] || { default: '先完成实验证据，再对照自己的数据说清楚。' };
    const lines = [];
    if (checks.length) lines.push('还缺：' + checks.map(c => c.label).join('；') + '。' + (tips.miss || tips.default));
    for (const tag of tags) if (tips[tag]) lines.push(tips[tag]);
    if (!lines.length) lines.push(tips.default);
    return { active: true, title: '二刷小提示', lines: [...new Set(lines)].slice(0, 3) };
  }

  /** 教师测试的达标示例（虚构，不进入班级统计）。 */
  const full = (stage, extra) => ({ explain: { compare: 'match', ...goals[stage].explain }, transfer: goals[stage].transfer, transferItem: 'A', prediction: goals[stage].prediction, ...extra });
  const life = full('life', {}); for (const [k, v] of Object.entries(lifeCards)) life.explain[k] = v.kind;
  const examples = {
    flow: full('flow', { trials: [{ kind: 'schematic', slots: { ...schematicAnswer } }, { scene: 'quiet', db: measureSquare('quiet', 1), over: false }, { scene: 'dance', db: measureSquare('dance', 2), over: true }] }),
    wave: full('wave', { trials: [{ kind: 'trace', source: 'simulation', samples: 60, min: 38, max: 70 }, { kind: 'between', t: 7.5, value: 52.3, leftT: 6, rightT: 8 }] }),
    life: { ...life, trials: [{ kind: 'curtain', distinct: 20, min: 60, max: 800 }] },
    threshold: full('threshold', { trials: [{ threshold: 55, alarms: countAlarms(55) }, { threshold: 45, alarms: countAlarms(45) }] }),
    design: full('design', {
      trials: [55, ACCEPT].map(threshold => { const g = simulateClassroom(threshold); return { threshold, alarms: g.alarms, falseAlarms: g.falseAlarms, caught: g.caught, fit: g.fit }; }),
      design: { threshold: ACCEPT }
    })
  };
  for (const [k, e] of Object.entries(examples)) { e.submitted = true; e.reflect = { saw: reflectOptions[k].saw[0], so: reflectOptions[k].so[0] }; }

  return {
    stages, stageIds, NIGHT_LIMIT, squareScenes, measureSquare, overLimit,
    nightNoise, minuteLabel, alarmEpisodes, countAlarms,
    GOALS, FOCI, schematicParts, schematicAnswer, schematicOk,
    NOISY, ACCEPT, STANDARDS, classroomNoise, secLabel, simulateClassroom,
    thresholdCases, lifeCards, experimentChecks, assess, goals, predictionValues, messages, examples,
    transferItems, optionValues, tagLabels, optionTags, predictionTags, tagFor, reflectOptions, reflectTags, validReflect, answerKey, stageSummary, retryGuidance
  };
});
