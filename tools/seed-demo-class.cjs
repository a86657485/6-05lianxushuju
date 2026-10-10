#!/usr/bin/env node
/*
 * 生成“虚构班级”数据，用于预览/截图教师大屏（不碰正式 runtime/）。
 * 用法：node tools/seed-demo-class.cjs <临时目录> [--export public/demo-class.json] [--serve]
 *  - 在临时目录建一个独立数据库，用虚构名单（601班40人）经真实接口逐条提交学习记录（服务端照常重新判定）；
 *  - 时间用模拟时钟铺开在“最近约30分钟”，让实时动态图有内容；
 *  - --export 时把教师接口返回的班级数据写成演示文件（/teacher?demo=1 使用）；
 *  - --serve 时生成后继续运行这个临时服务（恢复真实时钟），便于打开 /teacher 截图，Ctrl+C 结束。
 * 用完删除临时目录即可清除全部测试数据。
 */
const fs = require('node:fs'), path = require('node:path');
const dir = process.argv[2];
if (!dir) { console.error('请给出临时目录'); process.exit(1); }
const exportAt = process.argv.indexOf('--export') > 0 ? process.argv[process.argv.indexOf('--export') + 1] : null;
fs.mkdirSync(dir, { recursive: true });

/* 模拟时钟：服务端里的 Date.now()/new Date() 都读这里 */
const RealDate = Date; let fake = RealDate.now();
globalThis.Date = class extends RealDate { constructor(...a) { a.length ? super(...a) : super(fake); } static now() { return fake; } };

const { createService } = require('../server.cjs');
const R = require('../public/rules.js'), quiz = require('../quiz.cjs');
let seed = 20261010; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = a => a[Math.floor(rnd() * a.length)];
const sur = '王李张刘陈杨黄赵吴周徐孙马朱胡郭何林罗高'.split(''), giv = ['子涵', '一诺', '浩然', '欣怡', '宇轩', '梓萱', '雨桐', '俊熙', '思远', '若溪', '沐阳', '可馨', '明哲', '嘉怡', '天佑', '语彤', '家豪', '诗涵', '博文', '晨曦'];
const roster = Array.from({ length: 40 }, (_, i) => ({ id: 'demo-601-' + (i + 1), classId: '601', name: '（虚构）' + sur[i % 20] + giv[(i * 7 + Math.floor(i / 20) * 3) % 20] }));

const svc = createService({ roster, runtimeDir: dir });
const SERVE = process.argv.includes('--serve');
svc.server.listen(SERVE ? Number(process.env.PORT) || 8798 : 0, '127.0.0.1', async () => {
  const base = `http://127.0.0.1:${svc.server.address().port}`;
  const post = async (p, body, cookie) => { const r = await fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) }); const j = await r.json(); if (!r.ok) throw new Error(p + ' ' + JSON.stringify(j)); return { j, cookie: r.headers.get('set-cookie')?.split(';')[0] }; };
  const END = RealDate.now() - 30000, START = END - 32 * 60000;
  const predP = { flow: .6, wave: .4, life: .5, threshold: .45, design: .35 };
  const wrongOf = (stage, k) => { const g = R.goals[stage].explain[k], opts = R.optionValues[stage][k].filter(v => Array.isArray(g) ? !g.includes(v) : v !== g); return pick(opts); };
  const trialsFor = stage => {
    if (stage === 'threshold') { const alt = [pick([40, 45, 50]), pick([60, 65, 70])].slice(0, 1 + Math.floor(rnd() * 2)); return [55, ...alt].map(t => ({ threshold: t, alarms: R.countAlarms(t) })); }
    if (stage === 'design') { const ths = [pick([20, 25, 50, 60]), pick([30, 35, 40, 45])]; if (rnd() < .4) ths.unshift(pick([10, 55, 70])); return ths.map(threshold => { const t = { data: 'moisture', direction: 'below', threshold }, g = R.simulateGarden(t); return { ...t, fit: g.fit, min: g.min, max: g.max, waterings: g.waterings }; }); }
    return structuredClone(R.examples[stage].trials);
  };
  /* 每位学生：能力 a，走到第 depth 站；未进入的 3 人不产生记录 */
  const plans = roster.map((s, i) => ({ s, a: .35 + rnd() * .6, depth: i < 3 ? -1 : i < 6 ? 2 : i < 10 ? 3 : i < 16 ? 4 : 5 }));
  const events = [];
  for (const p of plans) {
    if (p.depth < 0) continue;
    let t = START + rnd() * 4 * 60000;
    const at = () => (t += (25 + rnd() * 70) * 1000);
    for (let i = 0; i <= Math.min(p.depth, 4); i++) {
      const stage = R.stageIds[i], finish = i < p.depth, g = R.goals[stage];
      const prediction = rnd() < predP[stage] + (p.a - .6) * .4 ? g.prediction : pick(R.predictionValues[stage].filter(v => v !== g.prediction));
      const hints = Math.floor(rnd() * 3), hintLevel = rnd() < (1 - p.a) * .9 ? 1 + Math.floor(rnd() * 3) : 0;
      const trials = trialsFor(stage), base = { prediction, trials: [], hints: 0, conceptHintLevel: 0 };
      if (stage === 'design') base.design = { ...trials.find(x => x.fit) };
      if (base.design) { delete base.design.fit; delete base.design.min; delete base.design.max; delete base.design.waterings; }
      events.push({ p, stage, t: at(), record: { ...base } });
      events.push({ p, stage, t: at(), record: { ...base, trials, hints } });
      if (!finish && rnd() < .3) continue; // 正在做实验
      const ex = { compare: rnd() < .72 + p.a * .25 ? (prediction === g.prediction ? 'match' : 'differ') : (prediction === g.prediction ? 'differ' : 'match') };
      for (const k of Object.keys(g.explain)) ex[k] = rnd() < .4 + p.a * .55 + hintLevel * .05 ? (Array.isArray(g.explain[k]) ? g.explain[k][0] : g.explain[k]) : wrongOf(stage, k);
      const fix = () => { for (const k of Object.keys(g.explain)) if (rnd() < .75) ex[k] = Array.isArray(g.explain[k]) ? g.explain[k][0] : g.explain[k]; ex.compare = prediction === g.prediction ? 'match' : 'differ'; };
      let transfer = rnd() < .35 + p.a * .55 ? g.transfer : pick(R.optionValues[stage].transfer.filter(v => v !== g.transfer)), item = 'A';
      for (let n = 0; n < 5; n++) {
        if (n === 4 && finish) { fix(); for (const k of Object.keys(g.explain)) ex[k] = Array.isArray(g.explain[k]) ? g.explain[k][0] : g.explain[k]; }
        const rec = { ...base, trials, hints, conceptHintLevel: Math.min(3, hintLevel + (n > 1 ? 1 : 0)), explain: { ...ex }, transfer, transferItem: item, submitted: true };
        events.push({ p, stage, t: at(), record: rec });
        const res = R.assess(stage, rec);
        if (res.pass) { const ro = R.reflectOptions[stage]; events.push({ p, stage, t: at(), record: { ...rec, reflect: { saw: rnd() < p.a + .2 ? ro.saw[0] : ro.saw[1], so: rnd() < p.a + .15 ? ro.so[0] : pick(ro.so.slice(1)) }, reflectDone: true } }); break; }
        if (!finish && n >= 1) break; // 还在修订
        fix(); if (!res.parts.transfer) { item = item === 'A' ? 'B' : 'A'; transfer = rnd() < .8 ? g.transfer : transfer; }
        if (n === 3) transfer = g.transfer;
      }
    }
    if (p.depth === 5 && rnd() < .85) events.push({ p, quiz: true, t: at() }), rnd() < .4 && events.push({ p, quiz: true, t: at(), retake: true });
  }
  events.sort((x, y) => x.t - y.t);
  const span = events.at(-1).t - events[0].t, scale = Math.min(1, (END - START) / span);
  const cookies = {}, counter = {};
  for (const e of events) {
    fake = Math.round(START + (e.t - events[0].t) * scale);
    const s = e.p.s;
    if (!cookies[s.id]) cookies[s.id] = (await post('/api/login', { classId: '601', id: s.id })).cookie;
    if (e.quiz) {
      const exam = (await post('/api/exam/create', { sid: s.id, round: 'r1' }, cookies[s.id])).j, answers = {};
      for (const q of exam.questions) { const orig = quiz.questions.find(x => x.id === q.id), right = q.options.indexOf(orig.options[orig.answer]); answers[q.id] = rnd() < .4 + e.p.a * .5 + (e.retake ? .1 : 0) ? right : (right + 1) % q.options.length; }
      await post('/api/exam/submit', { sid: s.id, round: 'r1', examId: exam.id, answers }, cookies[s.id]);
      continue;
    }
    counter[s.id] = (counter[s.id] || 0) + 1;
    await post('/api/event', { sid: s.id, round: 'r1', stage: e.stage, eventId: `seed-${s.id}-${counter[s.id]}`, record: { ...e.record, editedAt: fake } }, cookies[s.id]);
  }
  fake = RealDate.now();
  const cls = await (await fetch(base + '/api/teacher/class?class=601')).json();
  console.log(JSON.stringify({ students: cls.students.length, events: events.length, complete: cls.students.filter(x => x.awards.length === 5).length, quiz: cls.students.filter(x => x.quizAttempts.length).length }));
  if (exportAt) { cls.demo = true; fs.writeFileSync(exportAt, JSON.stringify(cls)); console.log('演示数据已写入', exportAt, Math.round(fs.statSync(exportAt).size / 1024) + ' KB'); }
  if (SERVE) { globalThis.Date = RealDate; console.log('临时服务：' + base + '/teacher'); return; }
  svc.server.close(() => { svc.close(); process.exit(0); });
});
