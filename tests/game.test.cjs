'use strict';
/* 奖励小游戏（智能限速卡丁车）：解锁门槛、服务端重放、伪造拒绝、教师入口、规则体现学习目标。 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createService } = require('../server.cjs');
const quiz = require('../quiz.cjs');
const R = require('../public/game/race-core.js');

const roster = [{ id: 'g601-a', classId: '601', name: '虚构游一' }, { id: 'g601-b', classId: '601', name: '虚构游二' }, { id: 'g601-c', classId: '601', name: '虚构游三' }];
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'lesson5-game-'));
function lanIp() { for (const nets of Object.values(os.networkInterfaces())) for (const n of nets || []) if (n.family === 'IPv4' && !n.internal) return n.address; return null; }
async function start(opts = {}) {
  const svc = createService({ roster, runtimeDir: tmp(), ...opts });
  const host = opts.host || '127.0.0.1';
  await new Promise(r => svc.server.listen(0, host, r));
  return { base: `http://${host}:${svc.server.address().port}`, stop: () => new Promise(r => svc.server.close(() => { svc.close(); r(); })) };
}
function client(base) {
  let cookie = '';
  return async (p, body) => {
    const res = await fetch(base + p, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const sc = res.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const ct = res.headers.get('content-type') || '';
    return { status: res.status, body: ct.includes('json') ? await res.json() : await res.text() };
  };
}
async function takeExam(c, me, right) {
  const e = (await c('/api/exam/create', { sid: me.student.id, round: me.round })).body;
  const answers = {};
  e.questions.forEach((q, i) => {
    const orig = quiz.questions.find(x => x.id === q.id), correct = q.options.indexOf(orig.options[orig.answer]);
    answers[q.id] = i < right ? correct : (correct + 1) % q.options.length;
  });
  return (await c('/api/exam/submit', { sid: me.student.id, round: me.round, examId: e.id, answers })).body;
}
const run = (me, level, seed, log, runId = level + Math.random()) => ({ sid: me.student.id, round: me.round, runId, level, seed, log });
const driveLog = (ctrl) => [{ t: 0, ...ctrl, u: 1, d: 0, l: 0, r: 0 }];

test('解锁规则：79 锁定、80 解锁，看最近一次而不是最好一次', () => {
  assert.equal(R.gate([79]).unlocked, false);
  assert.equal(R.gate([80]).unlocked, true);
  assert.equal(R.gate([]).unlocked, false);
  const g = R.gate([90, 75]); assert.equal(g.unlocked, false, '最近一次75分：重新锁定'); assert.equal(g.best, 90); assert.equal(g.latest, 75);
  assert.equal(R.gate([60, 85]).unlocked, true);
});

test('服务端门禁：未考/75分锁定并拒绝提交成绩，80分解锁；成绩按操作记录重放，伪造分数无效', async () => {
  const s = await start(), c = client(s.base);
  try {
    const me = (await c('/api/login', { classId: '601', id: 'g601-a' })).body;
    let st = (await c('/api/game/status')).body;
    assert.equal(st.unlocked, false); assert.equal(st.latest, null);
    const log = driveLog({ a: 40 });
    assert.equal((await c('/api/game/result', run(me, 'school', 7, log))).status, 403, '未考核不能提交');
    assert.equal((await takeExam(c, me, 15)).score, 75);
    st = (await c('/api/game/status')).body; assert.equal(st.unlocked, false); assert.equal(st.best, 75);
    const forged = await c('/api/game/result', { ...run(me, 'school', 7, log), unlocked: true, claimed: 9999 });
    assert.equal(forged.status, 403, '前端声称解锁也没用'); assert.equal(forged.body.error, '考核80分以上解锁');
    assert.equal((await c('/api/game/discover', { sid: me.student.id, round: me.round, level: 'school', choice: 'ok' })).status, 403);
    assert.equal((await takeExam(c, me, 16)).score, 80);
    st = (await c('/api/game/status')).body; assert.equal(st.unlocked, true); assert.equal(st.latest, 80);
    const out = await c('/api/game/result', { ...run(me, 'school', 7, log, 'r1'), claimed: 9999 });
    assert.equal(out.status, 200);
    assert.equal(out.body.result.score, R.replay('school', 7, log).score, '分数以服务端重放为准');
    assert.notEqual(out.body.result.score, 9999);
    assert.equal(out.body.result.claimed, 9999, '保留自报值便于老师核对');
    const again = await c('/api/game/result', { ...run(me, 'school', 7, log, 'r1') });
    assert.equal(again.body.status.game.plays, 1, '同一局补传只记一次');
    assert.equal((await c('/api/game/result', run(me, 'nope', 7, log))).status, 400);
    assert.equal((await c('/api/game/result', run(me, 'school', 0, log))).status, 400);
    assert.equal((await c('/api/game/result', run(me, 'school', 7, Array(700).fill({ t: 1, a: 50 })))).status, 400);
    const d = await c('/api/game/discover', { sid: me.student.id, round: me.round, level: 'school', choice: 'jump' });
    assert.equal(d.body.discovery.firstCorrect, false);
    const d2 = await c('/api/game/discover', { sid: me.student.id, round: me.round, level: 'school', choice: 'ok' });
    assert.equal(d2.body.discovery.correct, true); assert.equal(d2.body.discovery.firstCorrect, false, '首选记录保留');
    assert.equal((await c('/api/game/result', { ...run(me, 'school', 7, log), sid: 'g601-b' })).status, 403);
    st = (await c('/api/game/status')).body;
    assert.equal(st.leaderboard[0].name, '虚构游一');
    const cls = (await c('/api/teacher/class?class=601')).body;
    const a = cls.students.find(x => x.student.id === 'g601-a');
    assert.equal(a.gameGate.unlocked, true); assert.equal(a.game.best.school.score, out.body.result.score);
    assert.equal(a.game.runs[0].controls.a.last, 40, '记录学生选择的阈值');
    await takeExam(c, me, 10);
    assert.equal((await c('/api/game/status')).body.unlocked, false);
    assert.equal((await c('/api/game/result', run(me, 'school', 7, log))).status, 403);
  } finally { await s.stop(); }
});

test('教师测试入口 /game-test 只给教师设备；学生入口 /game 人人可打开但由接口决定是否解锁', async () => {
  const ip = lanIp();
  if (!ip) return;
  const s = await start({ host: '0.0.0.0', networkInterfaces: () => ({ eth0: [{ family: 'IPv4', internal: false, address: '10.255.255.1' }] }) });
  try {
    const port = new URL(s.base).port;
    const local = await fetch(`http://127.0.0.1:${port}/game-test`); assert.equal(local.status, 200, '教师本机可进入测试试玩');
    const remote = await fetch(`http://${ip}:${port}/game-test`); assert.equal(remote.status, 403, '学生设备不能进入测试试玩');
    assert.equal((await fetch(`http://${ip}:${port}/game`)).status, 200);
    assert.equal((await fetch(`http://${ip}:${port}/api/game/status`)).status, 401, '未登录不给状态');
  } finally { await s.stop(); }
});

test('规则体现学习目标：连续车速+限速阈值；回差减闪烁；采样稀密权衡；分区阈值改变结果；真正开车输入可重放', () => {
  const seeds = [1, 2, 3, 4, 5];
  const avg = (lv, ctrl, f = r => r.score) => seeds.reduce((n, s) => n + f(R.replay(lv, s, driveLog(ctrl))), 0) / seeds.length;
  // ① 合适校区限速 > 太低（到不了）和太高（罚单）
  assert.ok(avg('school', { a: 40 }) > avg('school', { a: 15 }) + 80);
  assert.ok(avg('school', { a: 40 }) > avg('school', { a: 80 }) + 20);
  const e = R.create('school', 3); const rows = [];
  R.control(e, { u: 1 }); while (!e.done) rows.push(R.tick(e));
  assert.ok(rows.every((r, i) => !i || Math.abs(r.truth - rows[i - 1].truth) <= 12), '车速每帧只变一点点：连续变化');
  // ② 回差：两条线分开时开关更少、分数更高
  const sameSw = avg('rain', { a: 50, b: 50 }, r => r.stats.switches);
  const gapSw = avg('rain', { a: 40, b: 70 }, r => r.stats.switches);
  assert.ok(sameSw > gapSw, `无回差开关${sameSw} > 有回差${gapSw}`);
  assert.ok(avg('rain', { a: 40, b: 70 }) > avg('rain', { a: 50, b: 50 }) + 30);
  // ③ 采样：每0.2秒最好
  const k1 = R.replay('sample', 2, driveLog({ k: 1 })), k4 = R.replay('sample', 2, driveLog({ k: 4 })), k12 = R.replay('sample', 2, driveLog({ k: 12 }));
  assert.equal(k1.stats.battery, 0);
  assert.ok(k4.stats.missed < k12.stats.missed || k4.score > k12.score);
  assert.ok(k4.score > k1.score && k4.score > k12.score);
  // ④ 分区阈值
  assert.ok(avg('zones', { a: 38, b: 95, c: 55 }) > avg('zones', { a: 20, b: 120, c: 90 }) + 50);
  // 可复现 + 中途改阈值改变结果
  assert.deepEqual(R.replay('school', 9, [{ t: 0, a: 40, u: 1 }, { t: 80, a: 70 }]), R.replay('school', 9, [{ t: 0, a: 40, u: 1 }, { t: 80, a: 70 }]));
  assert.notEqual(R.replay('school', 4, [{ t: 0, a: 25, u: 1 }]).score, R.replay('school', 4, [{ t: 0, a: 25, u: 1 }, { t: 60, a: 42 }]).score);
  assert.equal(R.valueAt([{ truth: 40 }, { truth: 50 }], 0.5), 45);
  // 方向键驾驶：有油门才跑得远
  const idle = R.replay('school', 1, [{ t: 0, a: 40, u: 0 }]);
  const go = R.replay('school', 1, [{ t: 0, a: 40, u: 1 }]);
  assert.ok(go.stats.distance > idle.stats.distance + 50, '按加速键才真正开车');
  // 自动驾驶：不按键也能按阈值巡航；手动猛加速更容易超速吃罚单
  const manual = R.replay('school', 8, [{ t: 0, a: 40, u: 1, auto: 0 }]);
  const auto = R.replay('school', 8, [{ t: 0, a: 40, u: 0, auto: 1 }]);
  assert.ok(auto.stats.laps > 0.5, '自动驾驶能跟着阈值跑完大半圈');
  assert.ok(manual.stats.tickets + 0.01 >= auto.stats.tickets, '手动油门更容易触发阈值干预/罚单');
  assert.ok(R.replay('school', 8, [{ t: 0, a: 40, auto: 1 }, { t: 100, auto: 0, u: 1 }]).stats.distance > 0, '中途可切换模式');
});

test('超速弹窗：阅读满3秒才算有效；不足3秒服务端拒绝；答错须再读', () => {
  const base = { zone: 'school', zoneLabel: '校区', speed: 70, limit: 40, goal: 'threshold' };
  // <3s 阅读
  assert.throws(() => R.validateViolation({ ...base, reads: [{ ms: 2999 }], answers: [{ qid: 't1', choice: 1, correct: true }] }), /3秒/);
  // 有效
  const ok = R.validateViolation({ ...base, reads: [{ ms: 3000 }], answers: [{ qid: 't1', choice: 1, correct: true }] });
  assert.equal(ok.firstOk, true);
  // 答错后只读一次不够
  assert.throws(() => R.validateViolation({
    ...base,
    reads: [{ ms: 3000 }],
    answers: [{ qid: 't1', choice: 0, correct: false }, { qid: 't2', choice: 1, correct: true }]
  }), /重新阅读/);
  // 答错 + 两段阅读 + 换题答对
  const ok2 = R.validateViolation({
    ...base,
    reads: [{ ms: 3000 }, { ms: 3100 }],
    answers: [{ qid: 't1', choice: 0, correct: false }, { qid: 't2', choice: 1, correct: true }]
  });
  assert.equal(ok2.firstOk, false);
  // 题目池按三目标
  assert.equal(R.GOALS.length, 3);
  assert.equal(R.QUIZ.data.length, 4);
  assert.equal(R.QUIZ.continuous.length, 4);
  assert.equal(R.QUIZ.threshold.length, 4);
  // 换题：avoid 后不立刻重复（池够大时）
  const a = R.pickQuestion('threshold', []);
  const b = R.pickQuestion('threshold', [a.id, ...R.QUIZ.threshold.filter(q => q.id !== a.id).slice(0, 2).map(q => q.id)]);
  assert.ok(b.id);
});

test('超速弹窗：replay 拒绝阅读不足的日志；合法 viol 会记入 stats', async () => {
  const s = await start(), c = client(s.base);
  try {
    const me = (await c('/api/login', { classId: '601', id: 'g601-a' })).body;
    await takeExam(c, me, 16);
    const bad = await c('/api/game/result', run(me, 'school', 3, [
      { t: 0, a: 40, u: 1 },
      { t: 30, viol: { zone: 'school', speed: 70, limit: 40, goal: 'threshold', reads: [{ ms: 1000 }], answers: [{ qid: 't1', choice: 1, correct: true }] } }
    ], 'bad-read'));
    assert.equal(bad.status, 400, '阅读不足应拒绝');
    const goodLog = [
      { t: 0, a: 35, u: 1 },
      { t: 40, viol: { zone: 'school', zoneLabel: '校区', speed: 72, limit: 35, goal: 'data', reads: [{ ms: 3200 }], answers: [{ qid: 'd1', choice: 1, correct: true }] } }
    ];
    const out = await c('/api/game/result', run(me, 'school', 5, goodLog, 'ok-viol'));
    assert.equal(out.status, 200);
    assert.ok(out.body.result.stats.violations >= 1);
    assert.ok(out.body.result.stats.quizAsked >= 1);
    assert.equal(out.body.result.stats.quizByGoal.data.asked, 1);
  } finally { await s.stop(); }
});

test('超速边沿：shouldQuiz 在超过阈值时触发，冷却期内不重复', () => {
  const sim = R.create('school', 2, { a: 40 });
  R.control(sim, { u: 1, auto: 0 });
  let hit = null;
  for (let i = 0; i < 200 && !hit; i++) {
    R.tick(sim);
    hit = R.shouldQuiz(sim);
  }
  assert.ok(hit, '超速应触发弹窗');
  assert.equal(hit.goal === 'data' || hit.goal === 'continuous' || hit.goal === 'threshold', true);
  assert.ok(hit.knowledge.body.includes('km/h'));
  // 立即再问：应空（边沿已过）
  assert.equal(R.shouldQuiz(sim), null);
});
