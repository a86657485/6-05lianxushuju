/*
 * 小递夜巡 · 智能限速卡丁车 —— 规则核心（纯逻辑、可复现；浏览器与服务端共用重算成绩）。
 * 驾驶手感改编自 jakesgordon/javascript-racer（MIT）：↑/W 加速、↓/S 减速、←→/A D 转向；
 * 车速是连续量；学生设置的分区「限速线」是阈值——超速触发警告/自动减速，阈值高低改变巡查得分。
 * 科学原理就是规则：速度连续变化；系统拿读数和阈值比较再决定输出；阈值太低/太高都有代价；回差减少「闪烁刹车」。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RaceCore = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const r1 = v => Math.round(v * 10) / 10;
  function rng(seed) { let s = (seed >>> 0) || 1; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  const FPS = 20; // 服务端重放固定 20 帧/秒
  const MAX_LOG = 500;
  const READ_MS = 3000; // 知识点至少阅读 3 秒
  const COOLDOWN_TICKS = 60; // 约 3 秒内不重复弹窗
  const GOALS = [
    { id: 'data', name: '控制系统工作时产生的数据' },
    { id: 'continuous', name: '连续量的表现形式及应用' },
    { id: 'threshold', name: '阈值在控制系统中的作用' }
  ];
  /* 超速弹窗：知识点卡片（按三目标） */
  const KNOWLEDGE = {
    data: [
      '控制系统工作时，输入、计算、输出各环节都在产生或传递数据。车速表读数是输入数据，和限速比较后得到判断，刹车指令是输出数据。',
      '装置（车速传感器、刹车）不是数据；“63 km/h”“超速了”“刹车”这些才是流动着的数据。'
    ],
    continuous: [
      '车速是连续量：在一定范围内连续变化，加速时会经过中间的许多数值，不是只有“快/慢”两档。',
      '车速表指针（或数字）连续变化，用曲线能看出任意时刻的速度；两次读数之间车速仍可能在变。'
    ],
    threshold: [
      '阈值是用来和数据比较、得出判断的参考值。限速线就是阈值：系统拿车速和它比较，再决定是否警告或刹车。',
      '同样的车速数据，换一个阈值，系统输出就可能不同——阈值太低会频繁干预，太高则疏于提醒。'
    ]
  };
  /* 快问：每目标若干题，误解干扰项 */
  const QUIZ = {
    data: [
      { id: 'd1', q: '刚才超速时，一直在系统里流动、被拿来比较的是什么？', options: ['方向盘和轮胎', '车速数据（读数）', '限速牌的铁皮', '小递的衣服'], a: 1, tip: '输入的是车速数据，不是装置本身。' },
      { id: 'd2', q: '“超过限速→系统判断超速→输出刹车”里，哪一步产生了新的判断数据？', options: ['只有踩油门时', '计算：把车速和阈值比较', '路边的树', '显示屏外壳'], a: 1, tip: '计算环节比较后产生判断结果数据。' },
      { id: 'd3', q: '下面哪一项是数据，而不是装置？', options: ['刹车片', '车速传感器', '此刻车速 63 km/h', '方向盘'], a: 2, tip: '63 km/h 是采集到的数据。' },
      { id: 'd4', q: '自动驾驶时“读数→比较→刹车指令”，这三个分别主要属于？', options: ['装饰、装饰、装饰', '输入数据、计算、输出数据', '只有输出才是数据', '都不是数据'], a: 1, tip: '数据贯穿输入、计算、输出。' }
    ],
    continuous: [
      { id: 'c1', q: '车速从 30 加到 60，中间会经过 45 吗？', options: ['会，车速是连续变化的', '不会，指针直接跳过去', '只会经过整十', '只有刹车才经过'], a: 0, tip: '连续量在范围内会经过中间值。' },
      { id: 'c2', q: '车速表上的数字一直在变，说明车速属于？', options: ['只有开/关两种状态', '连续量', '人数统计', '不是数据'], a: 1, tip: '车速在范围内连续变化。' },
      { id: 'c3', q: '用曲线表示一段时间内的车速，比每隔很久记一个点更好，是因为？', options: ['曲线好看', '连续变化看得更清楚，短促超速不易漏', '点越多越费电所以别画', '两者完全一样'], a: 1, tip: '连续量用曲线（或更密采样）更合适。' },
      { id: 'c4', q: '“连续量一定越来越大”对吗？', options: ['对', '不对，可以增大、减小或起伏', '对，只有变大才叫连续', '连续量不会变'], a: 1, tip: '连续指中间无跳跃，不是只增不减。' }
    ],
    threshold: [
      { id: 't1', q: '校区“限速 40 km/h”在控制系统里扮演什么角色？', options: ['输入的车速数据本身', '阈值：用来比较并决定是否干预', '输出装置', '装饰用的牌子'], a: 1, tip: '限速是阈值（参考值）。' },
      { id: 't2', q: '你刚才 63 km/h、阈值 40，系统为什么刹车？', options: ['随机刹车', '把连续车速和阈值比较后，判断超速并输出刹车', '因为车是红色的', '因为没有限速牌'], a: 1, tip: '阈值比较后决定输出。' },
      { id: 't3', q: '同一段车速，把阈值从 40 调到 80，最可能？', options: ['更早、更频繁被刹', '更不容易触发警告/刹车', '车速数据本身变了', '连续量消失'], a: 1, tip: '阈值变了，判断结果就变。' },
      { id: 't4', q: '阈值设得太低，可能带来什么问题？', options: ['很少干预', '正常车速也频繁警告/刹车', '采集不到车速', '数据不再连续'], a: 1, tip: '阈值过低会导致频繁干预。' }
    ]
  };


  const LEVELS = [
    {
      id: 'school', n: 1, place: '校门口', title: '校门口限速卡丁车', ticks: 400, // 20 秒
      goalTag: '目标1—3：车速数据→与限速比较→刹车', 
      unit: 'km/h', quantity: '车速', min: 0, max: 120,
      rule: '新规则：车速是连续变化的。你真正开车（↑加速 ↓减速 ←→转向），同时拖动「校区限速」阈值。系统每一刻拿车速和限速比较：超了就警告并自动轻刹。',
      goal: '在校区把限速线设合适：太低经常被刹、到不了终点；太高会吃罚单。完成约 1 圈并少吃罚单。',
      controls: [{ key: 'a', label: '校区限速', def: 55, min: 25, max: 90, color: '#ff7a7a' }],
      zones: [
        { id: 'school', from: 0.00, to: 0.45, label: '校区', limitKey: 'a', soft: 1.0 },
        { id: 'open', from: 0.45, to: 1.00, label: '开放路段', fixed: 90, soft: 1.0 }
      ],
      lapsGoal: 1, trackLen: 280, maxSpeed: 120, stars: [40, 90, 130],
      discover: { q: '这一关对应学习目标，我发现：', options: [
        ['ok', '车速是连续量；限速是阈值；系统拿读数和阈值比较后才输出刹车（数据→计算→输出）'],
        ['jump', '车速只有“快/慢”两档，不是连续变化'],
        ['timer', '限速牌只是装饰，和控制无关']] }
    },
    {
      id: 'rain', n: 2, place: '雨夜', title: '雨夜双阈值（警告+刹车）', ticks: 420,
      // 目标对齐审查：回差（双阈值）超出教材与教参要求（教参：阈值不强调概念，只初步了解作用），不在选关中出现；保留定义只为旧记录可重放。
      hidden: true, goalTag: '超出本课要求（已下线）',
      unit: 'km/h', quantity: '车速', min: 0, max: 120,
      rule: '新规则：两条线——警告线、刹车线。超过警告线只闪灯；超过刹车线才自动重刹。两条线之间留缓冲（回差），车速小小抖动不会「闪烁刹车」磨损轮胎。',
      goal: '把警告线与刹车线拉开一点：既要管住超速，又别让刹车一闪一闪（磨损扣分）。',
      controls: [
        { key: 'a', label: '警告线', def: 50, min: 20, max: 100, color: '#ffd166' },
        { key: 'b', label: '刹车线', def: 50, min: 20, max: 100, color: '#ff7a7a' }
      ],
      zones: [{ id: 'wet', from: 0, to: 1, label: '雨夜全线', warnKey: 'a', brakeKey: 'b', soft: 1.0 }],
      lapsGoal: 1, trackLen: 300, maxSpeed: 110, wearLimit: 40, stars: [40, 95, 140],
      discover: { q: '这一关对应学习目标，我发现：', options: [
        ['ok', '阈值决定何时干预：两条阈值留出回差，连续读数小抖动时输出更稳定'],
        ['high', '警告线越高越好，和阈值怎么比较无关'],
        ['tire', '刹车闪烁只怪轮胎，和阈值设置无关']] }
    },
    {
      id: 'sample', n: 3, place: '隧道', title: '隧道车速表采样', ticks: 440,
      goalTag: '目标2·重点：连续量与散点读数',
      unit: 'km/h', quantity: '车速', min: 0, max: 120,
      rule: '新规则：真实车速一直在变，但车速表只在“采样”那一刻更新；采样太稀会漏掉超速瞬间，太密耗电（仪表会黑屏）。',
      goal: '选合适的采样间隔，既抓住超速，又撑到驶出隧道。限速固定 60，你负责开车。',
      controls: [{ key: 'k', label: '采样间隔', def: 1, options: [[1, '每0.05秒'], [4, '每0.2秒'], [12, '每0.6秒']], color: '#7fe6dc' }],
      zones: [{ id: 'tunnel', from: 0, to: 1, label: '隧道', fixed: 60, soft: 1.0 }],
      lapsGoal: 1, trackLen: 260, maxSpeed: 100, battery: 120, stars: [35, 85, 125],
      discover: { q: '这一关对应学习目标，我发现：', options: [
        ['ok', '车速是连续量，用曲线/密采样更能看出变化；两次读数之间仍在变'],
        ['less', '读得越少越好，连续量在两点之间不会变'],
        ['same', '多久读一次都一样，因为车速不是连续量']] }
    },
    {
      id: 'zones', n: 4, place: '夜间巡查', title: '三区限速巡查', ticks: 480,
      goalTag: '目标3·难点：依路段设定阈值（如教材案例5限速）',
      unit: 'km/h', quantity: '车速', min: 0, max: 120,
      rule: '新规则：校区 / 高架 / 隧道三种路段，你分别设三条限速阈值。同一辆车、同样开车，换阈值结果就不同——太松罚单多，太紧到不了终点。',
      goal: '为三个路段设限速，开完约 1.2 圈：少罚单、少熄火式猛刹、尽量按时到达。',
      controls: [
        { key: 'a', label: '校区限速', def: 40, min: 20, max: 70, color: '#ff7a7a' },
        { key: 'b', label: '高架限速', def: 90, min: 50, max: 120, color: '#5ad1ff' },
        { key: 'c', label: '隧道限速', def: 55, min: 30, max: 90, color: '#ffd166' }
      ],
      zones: [
        { id: 'school', from: 0.00, to: 0.28, label: '校区', limitKey: 'a' },
        { id: 'highway', from: 0.28, to: 0.62, label: '高架', limitKey: 'b' },
        { id: 'tunnel', from: 0.62, to: 0.85, label: '隧道', limitKey: 'c' },
        { id: 'school2', from: 0.85, to: 1.00, label: '校区', limitKey: 'a' }
      ],
      lapsGoal: 1.0, trackLen: 320, maxSpeed: 120, stars: [50, 110, 160],
      discover: { q: '这一关对应学习目标，我发现：', options: [
        ['ok', '阈值的作用是比较后决定输出：同样车速数据，换阈值，系统行为就不同'],
        ['low', '阈值越低越好，不需要和数据比较'],
        ['drive', '得分只看开车技术，阈值没有作用']] }
    }
  ];
  const byId = Object.fromEntries(LEVELS.map(L => [L.id, L]));

  function gate(scores = []) {
    const list = scores.filter(v => Number.isFinite(v));
    const latest = list.length ? list[list.length - 1] : null, best = list.length ? Math.max(...list) : null;
    return { unlocked: latest !== null && latest >= 80, latest, best, pass: 80 };
  }

  function buildTrack(L, seed) {
    const R = rng(seed * 9973 + L.n * 131), segs = [];
    const n = 240;
    const bends = [];
    let t = 10;
    while (t < n - 20) {
      const len = 12 + Math.floor(R() * 18);
      const dir = R() < 0.5 ? -1 : 1;
      const strength = (L.id === 'rain' ? 3.2 : 2.2) * (0.6 + R() * 0.8);
      bends.push({ from: t, to: Math.min(n - 5, t + len), curve: dir * strength });
      t += len + 8 + Math.floor(R() * 20);
    }
    for (let i = 0; i < n; i++) {
      const p = i / n;
      let curve = 0;
      for (const b of bends) {
        if (i >= b.from && i < b.from + 4) curve = b.curve * ((i - b.from) / 4);
        else if (i >= b.to - 4 && i < b.to) curve = b.curve * ((b.to - i) / 4);
        else if (i >= b.from && i < b.to) curve = b.curve;
      }
      const yAmp = L.id === 'sample' ? 0 : (L.id === 'rain' ? 12 : 8);
      const y = Math.sin(p * Math.PI * 2) * yAmp + Math.sin(p * Math.PI * 5) * (yAmp * 0.25);
      let zoneId = L.zones[L.zones.length - 1].id, zoneLabel = L.zones[L.zones.length - 1].label;
      for (const z of L.zones) if (p >= z.from && p < z.to) { zoneId = z.id; zoneLabel = z.label; break; }
      segs.push({ curve, y, zoneId, zoneLabel });
    }
    return segs;
  }

  function zoneAt(L, progress) {
    const p = ((progress % 1) + 1) % 1;
    for (const z of L.zones) if (p >= z.from && p < z.to) return z;
    return L.zones[L.zones.length - 1];
  }

  function limitOf(z, ctrl) {
    if (z.fixed != null) return z.fixed;
    if (z.limitKey) return ctrl[z.limitKey];
    if (z.warnKey || z.brakeKey) return null; // dual handled separately
    return 80;
  }

  function defaultControls(L) {
    const c = {};
    for (const x of L.controls) {
      if (x.options) c[x.key] = x.def;
      else c[x.key] = x.def;
    }
    return c;
  }

  function create(levelId, seed, controls) {
    const L = byId[levelId]; if (!L) throw new Error('未知关卡');
    if (!Number.isInteger(seed) || seed < 1) throw new Error('bad seed');
    const ctrl = { ...defaultControls(L), ...(controls || {}) };
    for (const x of L.controls) {
      if (x.options) {
        const ok = x.options.some(o => o[0] === ctrl[x.key]);
        if (!ok) ctrl[x.key] = x.def;
      } else ctrl[x.key] = clamp(Number(ctrl[x.key]) || x.def, x.min, x.max);
    }
    return {
      L, seed, t: 0, done: false,
      speed: 0, // km/h continuous
      pos: 0, // metres along track
      x: 0, // -1..1 lateral
      ctrl,
      keys: { u: 0, d: 0, l: 0, r: 0 },
      auto: 0, // 1=自动驾驶：输入车速→比较阈值→输出油门/刹车
      track: buildTrack(L, seed),
      reading: 0, // displayed speed (sampling)
      battery: L.battery || null,
      switches: 0, // brake on/off edges
      braking: false, warn: false,
      stats: { tickets: 0, overTicks: 0, warnTicks: 0, brakeTicks: 0, distance: 0, falseAlarm: 0, missed: 0, dry: 0, flood: 0, water: 0, battery: L.battery || 0, violations: 0, quizAsked: 0, quizFirstOk: 0, quizByGoal: {} },
      history: [],
      lastSample: -999,
      broken: false,
      overLimit: false,
      violCooldownUntil: 0,
      zoneViolated: {}, // zoneId -> true after first quiz
      paused: false,
      pendingViol: null
    };
  }

  function applyLogEntry(sim, e) {
    if (!e || typeof e !== 'object') return;
    if (e.u != null) sim.keys.u = e.u ? 1 : 0;
    if (e.d != null) sim.keys.d = e.d ? 1 : 0;
    if (e.l != null) sim.keys.l = e.l ? 1 : 0;
    if (e.r != null) sim.keys.r = e.r ? 1 : 0;
    if (e.auto != null) sim.auto = e.auto ? 1 : 0;
    for (const x of sim.L.controls) {
      if (e[x.key] == null) continue;
      if (x.options) {
        if (x.options.some(o => o[0] === e[x.key])) sim.ctrl[x.key] = e[x.key];
      } else sim.ctrl[x.key] = clamp(Number(e[x.key]), x.min, x.max);
    }
    if (e.viol) applyViolation(sim, e.viol);
  }

  function validateViolation(v) {
    if (!v || typeof v !== 'object') throw new Error('缺少超速答题记录');
    const reads = Array.isArray(v.reads) ? v.reads : [];
    if (!reads.length) throw new Error('知识点阅读时间不足');
    for (const r of reads) {
      const ms = Number(r && r.ms);
      if (!Number.isFinite(ms) || ms < READ_MS) throw new Error('知识点须阅读满3秒');
    }
    const answers = Array.isArray(v.answers) ? v.answers : [];
    if (!answers.length) throw new Error('请完成超速问答题');
    // 每答错一次，后面必须多一段 ≥3s 阅读
    let wrong = 0;
    for (let i = 0; i < answers.length; i++) {
      const ans = answers[i];
      const pool = Object.values(QUIZ).flat();
      const item = pool.find(q => q.id === ans.qid);
      if (!item) throw new Error('未知题目');
      const ok = Number(ans.choice) === item.a;
      if (ok !== !!ans.correct) throw new Error('答题记录不一致');
      if (!ok) wrong++;
      else {
        // 答对时：reads 数量应 >= wrong+1
        if (reads.length < wrong + 1) throw new Error('答错后须重新阅读满3秒');
        return { goal: v.goal, firstOk: answers[0] && !!answers[0].correct, qid: ans.qid };
      }
    }
    throw new Error('超速问答题未答对');
  }

  function applyViolation(sim, v) {
    const info = validateViolation(v);
    const limit = Number(v.limit);
    if (Number.isFinite(limit)) sim.speed = Math.min(sim.speed, Math.max(0, limit));
    sim.keys.u = 0;
    sim.overLimit = false;
    sim.violCooldownUntil = sim.t + COOLDOWN_TICKS;
    if (v.zone) sim.zoneViolated[v.zone] = true;
    sim.stats.violations = (sim.stats.violations || 0) + 1;
    sim.stats.quizAsked = (sim.stats.quizAsked || 0) + 1;
    if (info.firstOk) sim.stats.quizFirstOk = (sim.stats.quizFirstOk || 0) + 1;
    const g = info.goal || 'threshold';
    const bag = sim.stats.quizByGoal[g] || { asked: 0, firstOk: 0 };
    bag.asked++; if (info.firstOk) bag.firstOk++;
    sim.stats.quizByGoal[g] = bag;
    sim.paused = false;
    sim.pendingViol = null;
  }

  function currentLimit(sim, z) {
    if (!z) z = zoneAt(sim.L, (sim.pos / sim.L.trackLen) % 1);
    if (z.warnKey) return Math.max(sim.ctrl[z.warnKey], sim.ctrl[z.brakeKey]);
    return limitOf(z, sim.ctrl);
  }

  function pickGoal(sim) {
    // 轮转三目标
    const i = (sim.stats.violations || 0) % GOALS.length;
    return GOALS[i];
  }

  function knowledgeFor(goalId, ctx) {
    const lines = KNOWLEDGE[goalId] || KNOWLEDGE.threshold;
    const base = lines[(ctx.n || 0) % lines.length];
    const speed = Math.round(ctx.speed || 0), limit = Math.round(ctx.limit || 0), zone = ctx.zoneLabel || '本路段';
    return {
      goalId,
      goalName: (GOALS.find(g => g.id === goalId) || GOALS[2]).name,
      title: '超速了！先看清本节课知识点',
      body: `${base} 你刚才 ${speed} km/h，超过了${zone}阈值 ${limit} km/h——系统拿连续车速和阈值比较后，输出了警告/刹车。`,
      readMs: READ_MS
    };
  }

  function pickQuestion(goalId, avoidIds = []) {
    const pool = (QUIZ[goalId] || QUIZ.threshold).filter(q => !avoidIds.includes(q.id));
    const list = pool.length ? pool : (QUIZ[goalId] || QUIZ.threshold);
    const q = list[Math.floor(Math.random() * list.length)];
    return { id: q.id, goalId, q: q.q, options: q.options.slice(), tip: q.tip, answer: q.a };
  }

  /** 客户端：本帧是否应暂停并弹窗（越阈/强行超速边沿 + 冷却） */
  function shouldQuiz(sim) {
    if (sim.done || sim.paused) return null;
    if (sim.t < sim.violCooldownUntil) return null;
    const z = zoneAt(sim.L, (sim.pos / sim.L.trackLen) % 1);
    const limit = currentLimit(sim, z);
    if (limit == null || !Number.isFinite(limit)) return null;
    const over = sim.speed > limit;
    const edge = over && !sim.overLimit;
    sim.overLimit = over;
    if (!edge) return null;
    const goal = pickGoal(sim);
    const ctx = { speed: sim.speed, limit, zoneLabel: z.label, zone: z.id, n: sim.stats.violations || 0 };
    return {
      t: sim.t,
      zone: z.id,
      zoneLabel: z.label,
      speed: r1(sim.speed),
      limit: r1(limit),
      goal: goal.id,
      knowledge: knowledgeFor(goal.id, ctx)
    };
  }


  function tick(sim) {
    if (sim.done) return snapshot(sim);
    const L = sim.L, dt = 1 / FPS;
    const progress = (sim.pos / L.trackLen) % 1;
    const z = zoneAt(L, progress);
    const seg = sim.track[Math.floor(progress * sim.track.length) % sim.track.length];

    // --- drive physics (javascript-racer style, mapped to km/h) ---
    const maxV = L.maxSpeed;
    const accel = maxV / 3.2, brake = -maxV / 1.6, decel = -maxV / 5.5;
    // 先算本段限速目标（自动驾驶用；手动模式稍后阈值只做干预）
    let limitEarly = null, warnEarly = null, brakeEarly = null;
    if (z.warnKey) { warnEarly = sim.ctrl[z.warnKey]; brakeEarly = sim.ctrl[z.brakeKey]; limitEarly = Math.max(warnEarly, brakeEarly); }
    else limitEarly = limitOf(z, sim.ctrl);
    const cruiseTarget = (limitEarly != null ? Math.max(12, limitEarly - 3) : maxV * 0.55);

    if (sim.auto) {
      // 自动驾驶 = 控制系统：输入(车速) → 计算(与阈值比较) → 输出(油门/刹车)；方向自回正
      const err = cruiseTarget - sim.speed;
      if (err > 4) sim.speed += accel * dt * Math.min(1, err / 20);
      else if (err < -2) sim.speed += brake * dt * Math.min(1, (-err) / 25);
      else sim.speed += decel * 0.35 * dt;
      // 轻轻回正车道
      sim.x += (-sim.x) * Math.min(1, dt * 2.5);
    } else {
      if (sim.keys.u) sim.speed += accel * dt;
      else if (sim.keys.d) sim.speed += brake * dt;
      else sim.speed += decel * dt;
      const dx = dt * 2.2 * (sim.speed / maxV);
      if (sim.keys.l) sim.x -= dx;
      if (sim.keys.r) sim.x += dx;
      // centrifugal on curves
      sim.x -= dx * 0.35 * (seg?.curve || 0) * (sim.speed / maxV);
    }
    sim.x = clamp(sim.x, -1.2, 1.2);
    if (Math.abs(sim.x) > 1) { // off road
      sim.speed *= 0.97;
      if (sim.speed > maxV * 0.25) sim.speed -= maxV * 0.35 * dt;
    }

    // --- threshold → output (science as rules) ---
    let limit = null, warnL = null, brakeL = null;
    if (z.warnKey) { warnL = sim.ctrl[z.warnKey]; brakeL = sim.ctrl[z.brakeKey]; limit = brakeL; }
    else limit = limitOf(z, sim.ctrl);

    let wantBrake = false, wantWarn = false;
    const truth = sim.speed; // continuous truth

    // sampling for speedometer (level sample)
    let sampleEvery = 1;
    if (L.id === 'sample') sampleEvery = sim.ctrl.k || 1;
    const shouldSample = (sim.t - sim.lastSample) >= sampleEvery;
    if (L.id === 'sample') {
      if (shouldSample && sim.battery > 0) {
        sim.battery -= 1; sim.stats.battery = sim.battery; sim.lastSample = sim.t; sim.reading = truth;
      } else if (sim.battery <= 0) {
        sim.broken = true; // black screen — no new readings
      }
    } else {
      sim.reading = truth;
    }

    const sensed = (L.id === 'sample') ? sim.reading : truth;

    if (L.id === 'rain') {
      const lo = Math.min(warnL, brakeL), hi = Math.max(warnL, brakeL);
      // Schmitt：超过刹车线才刹，掉回警告线以下才松（回差=可玩性+科学）
      if (sensed > lo) wantWarn = true;
      if (sim.braking) wantBrake = sensed > lo; // stay on until below warn
      else wantBrake = sensed > hi;
    } else if (L.id === 'sample') {
      if (!sim.broken && sensed > 60) wantBrake = true;
      else if (!sim.broken && sim.braking) wantBrake = sensed > 55; // small band
      if (truth > 60 && sensed <= 60) sim.stats.missed += dt;
    } else {
      // 普通限速：超限刹，低于限速-5 再松，避免阈值附近闪烁
      const band = 5;
      if (sensed > limit) wantWarn = true;
      if (sim.braking) wantBrake = sensed > (limit - band);
      else wantBrake = sensed > limit;
    }

    if (wantBrake) {
      // 阈值输出：手动仍可短时冲过阈值（才能触发「超速弹窗」），但持续被刹回；自动驾驶贴线
      if (sim.auto) {
        sim.speed += (-maxV / 4.5) * dt;
        sim.stats.brakeTicks++;
      } else {
        // 校区/分区：允许短时越线以触发超速弹窗；雨夜回差关保持强刹，突出闪烁对比
        if ((L.id === 'school' || L.id === 'zones') && sim.keys.u) {
          const overBy = Math.max(0, sim.speed - (limit ?? sim.speed));
          if (overBy < 10) sim.speed += (-maxV / 7) * dt;
          else sim.speed += (-maxV / 1.9) * dt;
        } else {
          sim.speed += (-maxV / 1.8) * dt;
          if (sim.keys.u) sim.speed += (-accel * 0.85) * dt;
        }
        sim.stats.brakeTicks++;
        sim.stats.overTicks += dt;
        if (L.id !== 'sample') sim.stats.tickets += dt * 0.25;
      }
    }
    if (wantWarn) sim.stats.warnTicks++;

    if (wantBrake !== sim.braking) {
      sim.switches++;
      if (L.wearLimit && sim.switches >= L.wearLimit) sim.broken = true;
    }
    sim.braking = wantBrake;
    sim.warn = wantWarn;

    if (sim.broken && L.id === 'rain') sim.speed *= 0.94;

    sim.speed = clamp(sim.speed, 0, maxV);
    // distance: km/h → m/s
    const mps = sim.speed / 3.6;
    sim.pos += mps * dt;
    sim.stats.distance = sim.pos;

    // progress pressure: too-low limits stall
    if (L.id === 'school' || L.id === 'zones') {
      if (wantBrake && sim.speed < 8) sim.stats.dry += dt; // "stalled by over-strict threshold"
    }

    // 同步越阈状态（供边沿检测）；弹窗由客户端 shouldQuiz 触发
    {
      const limNow = currentLimit(sim, z);
      if (limNow != null) {
        const over = sim.speed > limNow;
        if (!sim.paused) {
          // 不在此处清 overLimit 边沿，留给 shouldQuiz；若本帧未检查则保持
          if (!over) sim.overLimit = false;
        }
      }
    }
    sim.t++;
    if (sim.t >= L.ticks) sim.done = true;
    const row = snapshot(sim);
    sim.history.push(row);
    return row;
  }

  function snapshot(sim) {
    const L = sim.L;
    const progress = (sim.pos / L.trackLen);
    const z = zoneAt(L, progress);
    return {
      t: sim.t,
      truth: r1(sim.speed),
      reading: r1(sim.reading),
      on: sim.braking,
      warn: sim.warn,
      x: r1(sim.x),
      pos: r1(sim.pos),
      progress: r1(progress),
      zone: z.id,
      zoneLabel: z.label,
      ctrl: { ...sim.ctrl },
      battery: sim.battery,
      broken: sim.broken,
      auto: !!sim.auto
    };
  }

  function scoreOf(sim) {
    const L = sim.L;
    const laps = sim.pos / L.trackLen;
    let score = Math.round(Math.min(1.2, laps / L.lapsGoal) * 120);
    // penalties
    score -= Math.round(sim.stats.tickets * 5);
    score -= Math.round(sim.stats.overTicks * 1.2);
    if (L.id === 'rain') {
      score -= Math.max(0, sim.switches - 6) * 4;
      if (sim.broken) score -= 35;
      const gap = Math.abs(sim.ctrl.b - sim.ctrl.a);
      if (gap < 5) score -= 55; // 几乎无回差：闪烁刹车
      else if (gap >= 15 && gap <= 45) score += 45;
      else if (gap > 45) score += 15;
      sim.stats.falseAlarm = Math.max(0, sim.switches - 6);
    }
    if (L.id === 'sample') {
      if (sim.battery <= 0) score -= 40;
      score -= Math.round(sim.stats.missed * 8);
      if (sim.ctrl.k === 4) score += 40;
      if (sim.ctrl.k === 1) score -= 25;
      if (sim.ctrl.k === 12) score -= 30;
    }
    if (L.id === 'school') {
      // sweet spot around 35–50 for school zone
      const a = sim.ctrl.a;
      if (a >= 35 && a <= 50) score += 35;
      if (a < 28) score -= 25;
      if (a > 70) score -= 30;
    }
    if (L.id === 'zones') {
      const okA = sim.ctrl.a >= 30 && sim.ctrl.a <= 45;
      const okB = sim.ctrl.b >= 80 && sim.ctrl.b <= 105;
      const okC = sim.ctrl.c >= 45 && sim.ctrl.c <= 65;
      if (okA) score += 20; else score -= 15;
      if (okB) score += 20; else score -= 15;
      if (okC) score += 20; else score -= 15;
      // falseAlarm/miss metaphor
      sim.stats.falseAlarm = Math.round(sim.stats.brakeTicks / 20);
      sim.stats.missed = Math.round(sim.stats.tickets);
    }
    score = Math.max(0, Math.min(220, score));
    let stars = 0;
    if (score >= L.stars[0]) stars = 1;
    if (score >= L.stars[1]) stars = 2;
    if (score >= L.stars[2]) stars = 3;
    // need some distance to get stars
    if (laps < L.lapsGoal * 0.45) stars = Math.min(stars, 1);
    if (laps < L.lapsGoal * 0.2) { stars = 0; score = Math.min(score, 25); }
    return { score, stars };
  }

  function expandLog(log) {
    if (!Array.isArray(log)) throw new Error('bad log');
    if (log.length > MAX_LOG) throw new Error('log too long');
    return log.slice().sort((a, b) => (a.t || 0) - (b.t || 0));
  }

  function replay(levelId, seed, log) {
    const L = byId[levelId]; if (!L) throw new Error('未知关卡');
    const entries = expandLog(log);
    for (const e of entries) if (e.viol) validateViolation(e.viol);
    const sim = create(levelId, seed);
    let i = 0;
    while (!sim.done) {
      while (i < entries.length && (entries[i].t || 0) <= sim.t) { applyLogEntry(sim, entries[i]); i++; }
      tick(sim);
      const trig = shouldQuiz(sim);
      if (trig && !entries.some(e => e.viol && (e.t || 0) === trig.t)) {
        sim.violCooldownUntil = sim.t + COOLDOWN_TICKS;
      }
    }
    let { score, stars } = scoreOf(sim);
    score = Math.max(0, score - (sim.stats.violations || 0) * 5);
    if (score < L.stars[0]) stars = 0;
    else if (score < L.stars[1]) stars = Math.min(stars, 1);
    else if (score < L.stars[2]) stars = Math.min(stars, 2);
    const controls = {};
    for (const x of L.controls) controls[x.key] = { last: sim.ctrl[x.key] };
    return {
      level: levelId, seed, score, stars,
      stats: { ...sim.stats, switches: sim.switches, distance: r1(sim.pos), laps: r1(sim.pos / L.trackLen), battery: sim.battery ?? sim.stats.battery },
      controls,
      final: snapshot(sim)
    };
  }

  function valueAt(rows, t) {
    if (!rows.length) return 0;
    if (t <= 0) return rows[0].truth;
    if (t >= rows.length - 1) return rows[rows.length - 1].truth;
    const i = Math.floor(t), f = t - i;
    return rows[i].truth * (1 - f) + rows[i + 1].truth * f;
  }

  function control(sim, patch) {
    applyLogEntry(sim, { ...patch, t: sim.t });
  }

  return { LEVELS, byId, gate, create, tick, replay, control, valueAt, FPS, MAX_LOG, READ_MS, GOALS, KNOWLEDGE, QUIZ, zoneAt, snapshot, shouldQuiz, knowledgeFor, pickQuestion, validateViolation, currentLimit };
});
