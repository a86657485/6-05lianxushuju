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
  const thresholdCases = {
    kettle: { text: '用电热水壶烧水时，水温达到100 ℃，电热水壶会自动断电。', answer: '100℃', options: ['烧水时', '100℃', '自动断电'] },
    fridge: { text: '小智家冰箱的冷藏区维持在4 ℃。', answer: '4℃', options: ['冰箱', '冷藏区', '4℃'] },
    heart: { text: '小华的智能手环在监测人体健康时，当心率超过100次/min，就会发出警报。', answer: '100次/min', options: ['智能手环', '100次/min', '发出警报'] },
    highway: { text: '小夏爸爸在限速100～120 km/h的高速公路车道上开车。', answer: '100～120 km/h', options: ['高速公路', '100～120 km/h', '开车'] }
  };
  const lifeCards = {
    light: { label: '拉窗帘时教室里的光照强度', kind: 'c' },
    water: { label: '烧水时壶里的水温', kind: 'c' },
    cup: { label: '接水时杯中水面的高度', kind: 'c' },
    seedling: { label: '种植园里幼苗的高度', kind: 'c' },
    people: { label: '班级里的学生人数', kind: 'd' },
    lamp: { label: '电灯开关是开还是关', kind: 'd' },
    rope: { label: '一分钟跳绳的个数', kind: 'd' }
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

  const goals = {
    flow: { prediction: 'all', explain: { input: 'sound-data', compute: 'judge', output: 'display' }, transfer: 'flow' },
    wave: { prediction: 'wave', explain: { reason: 'continuous', points: 'samples' }, transfer: 'mid' },
    life: { prediction: 'gradual', explain: Object.fromEntries(Object.entries(lifeCards).map(([k, v]) => [k, v.kind])), transfer: 'yes' },
    threshold: { prediction: 'more', explain: { where: 'compute', why: 'lower' }, transfer: Object.fromEntries(Object.entries(thresholdCases).map(([k, v]) => [k, v.answer])) },
    design: { prediction: 'on', explain: { role: 'decide', raise: 'often' }, transfer: 'ok' }
  };
  const predictionValues = {
    flow: ['input', 'all', 'output'], wave: ['wave', 'scatter'], life: ['gradual', 'jump'],
    threshold: ['more', 'less', 'same'], design: ['on', 'off']
  };

  const messages = {
    flow: {
      input: '输入节点需再检查：写的是采集到的数据，还是采集装置？',
      compute: '计算节点需再检查：处理装置“算”出了什么数据？',
      output: '输出节点需再检查：输出的是数据结果，还是显示屏这个设备？',
      transfer: '新系统：数据怎样从输入流到输出？',
      experiment: '记录一次未超过、一次超过55 dB的监测'
    },
    wave: {
      reason: '曲线更合适的理由需再检查：声音数据在时间上有什么特点？',
      points: '散点代表什么需再检查：两个点之间声音停止了吗？',
      transfer: '两次读数之间的时刻也有数值吗？',
      experiment: '画出起伏的声音曲线，并读出两个散点之间的数值'
    },
    life: {
      sort: '连续量分类需再检查：数据能否在一个范围内取到中间的任意数值？',
      transfer: '指针从0转到60 km/h，会经过中间的数值吗？',
      experiment: '拉动窗帘记录光照变化，并在烧水途中读一个水温'
    },
    threshold: {
      where: '阈值的位置需再检查：阈值是采集到的数据，还是用来比较的参考值？',
      why: '阈值变化的原因需再检查：环境声音没变，什么改变了判断结果？',
      transfer: '案例中的阈值需再检查：找出系统用来比较的那个参考值。',
      experiment: '用55 dB运行一次，再换一个明显不同的阈值运行比较'
    },
    design: {
      design: '浇水方案需再检查：选湿度数据、降到阈值就浇水，并让曲线保持在30%—70%。',
      role: '阈值作用需再检查：阈值是测量工具，还是比较判断的参考？',
      raise: '阈值调高后的结果需再检查：比较两次运行的浇水次数和最高湿度。',
      transfer: '鱼缸案例：分清输入数据、阈值和输出。',
      experiment: '找到一种合适设置，并与另一种设置比较'
    }
  };

  function assess(stage, record) {
    const errors = [];
    if (!stageIds.includes(stage) || !record || typeof record !== 'object') return { pass: false, errors: ['还没有本关学习记录'] };
    const g = goals[stage], m = messages[stage], r = record;
    if (r.submitted !== true) errors.push('请提交本次解释后再检验');
    if (!predictionValues[stage].includes(r.prediction)) errors.push('先留下你的首次预测');
    if (experimentChecks(stage, r).some(c => !c.complete)) errors.push(m.experiment);
    const ex = r.explain && typeof r.explain === 'object' ? r.explain : {};
    if (stage === 'life') {
      if (Object.entries(g.explain).some(([k, v]) => ex[k] !== v)) errors.push(m.sort);
    } else if (stage === 'design') {
      const d = r.design && typeof r.design === 'object' ? r.design : {};
      const sim = simulateGarden(d);
      const okDesign = d.data === 'moisture' && d.direction === 'below' && finite(d.threshold) && sim.fit;
      if (!okDesign) errors.push(m.design);
      for (const k of Object.keys(g.explain)) if (ex[k] !== g.explain[k]) errors.push(m[k]);
    } else {
      for (const k of Object.keys(g.explain)) if (ex[k] !== g.explain[k]) errors.push(m[k]);
    }
    if (stage === 'threshold') {
      const tr = r.transfer && typeof r.transfer === 'object' ? r.transfer : {};
      if (Object.entries(g.transfer).some(([k, v]) => tr[k] !== v)) errors.push(m.transfer);
    } else if (r.transfer !== g.transfer) errors.push(m.transfer);
    return { pass: errors.length === 0, errors };
  }

  /** 教师测试的达标示例（虚构，不进入班级统计）。 */
  const examples = {
    flow: { prediction: 'all', trials: [{ scene: 'quiet', db: measureSquare('quiet', 1), over: false }, { scene: 'dance', db: measureSquare('dance', 2), over: true }], explain: goals.flow.explain, transfer: 'flow' },
    wave: { prediction: 'wave', trials: [{ kind: 'trace', source: 'simulation', samples: 60, min: 38, max: 70 }, { kind: 'between', t: 7.5, value: 52.3, leftT: 5, rightT: 10 }], explain: goals.wave.explain, transfer: 'mid' },
    life: { prediction: 'gradual', trials: [{ kind: 'curtain', distinct: 20, min: 60, max: 800 }, { kind: 'kettle', reading: 63.5 }], explain: goals.life.explain, transfer: 'yes' },
    threshold: { prediction: 'more', trials: [{ threshold: 55, alarms: countAlarms(55) }, { threshold: 45, alarms: countAlarms(45) }], explain: goals.threshold.explain, transfer: goals.threshold.transfer },
    design: {
      prediction: 'on',
      trials: [{ data: 'moisture', direction: 'below', threshold: 35, fit: simulateGarden({ data: 'moisture', direction: 'below', threshold: 35 }).fit }, { data: 'moisture', direction: 'below', threshold: 60, fit: simulateGarden({ data: 'moisture', direction: 'below', threshold: 60 }).fit }],
      design: { data: 'moisture', direction: 'below', threshold: 35 }, explain: goals.design.explain, transfer: 'ok'
    }
  };
  for (const e of Object.values(examples)) e.submitted = true;

  return {
    stages, stageIds, NIGHT_LIMIT, squareScenes, measureSquare, overLimit,
    nightNoise, minuteLabel, alarmEpisodes, countAlarms,
    designData, BAND, simulateGarden, lightAt, tempAt,
    thresholdCases, lifeCards, experimentChecks, assess, goals, predictionValues, messages, examples
  };
});
