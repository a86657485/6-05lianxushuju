'use strict';
/* 奖励小游戏：解锁门槛（最近一次考核≥80分）、服务端重放计分、伪造解锁/伪造成绩被拒、教师测试入口、规则本身体现学习目标。 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createService } = require('../server.cjs');
const quiz = require('../quiz.cjs');
const N = require('../public/game/night-core.js');

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
/** 按目标分数作答：前 right 题选正确答案，其余选错（题目选项已打乱，用文字对答案）。 */
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

test('解锁规则：79 锁定、80 解锁，看最近一次而不是最好一次', () => {
  assert.equal(N.gate([79]).unlocked, false);
  assert.equal(N.gate([80]).unlocked, true);
  assert.equal(N.gate([]).unlocked, false);
  const g = N.gate([90, 75]); assert.equal(g.unlocked, false, '最近一次75分：重新锁定'); assert.equal(g.best, 90); assert.equal(g.latest, 75);
  assert.equal(N.gate([60, 85]).unlocked, true);
});

test('服务端门禁：未考/75分锁定并拒绝提交成绩，80分解锁；成绩按操作记录重放，伪造分数无效', async () => {
  const s = await start(), c = client(s.base);
  try {
    const me = (await c('/api/login', { classId: '601', id: 'g601-a' })).body;
    let st = (await c('/api/game/status')).body;
    assert.equal(st.unlocked, false); assert.equal(st.latest, null);
    assert.equal((await c('/api/game/result', run(me, 'garden', 7, [{ t: 0, a: 45 }]))).status, 403, '未考核不能提交');
    assert.equal((await takeExam(c, me, 15)).score, 75);
    st = (await c('/api/game/status')).body; assert.equal(st.unlocked, false); assert.equal(st.best, 75);
    const forged = await c('/api/game/result', { ...run(me, 'garden', 7, [{ t: 0, a: 45 }]), unlocked: true, claimed: 9999 });
    assert.equal(forged.status, 403, '前端声称解锁也没用'); assert.equal(forged.body.error, '考核80分以上解锁');
    assert.equal((await c('/api/game/discover', { sid: me.student.id, round: me.round, level: 'garden', choice: 'ok' })).status, 403);
    assert.equal((await takeExam(c, me, 16)).score, 80);
    st = (await c('/api/game/status')).body; assert.equal(st.unlocked, true); assert.equal(st.latest, 80);
    const log = [{ t: 0, a: 45 }];
    const out = await c('/api/game/result', { ...run(me, 'garden', 7, log, 'r1'), claimed: 9999 });
    assert.equal(out.status, 200);
    assert.equal(out.body.result.score, N.replay('garden', 7, log).score, '分数以服务端重放为准');
    assert.notEqual(out.body.result.score, 9999);
    assert.equal(out.body.result.claimed, 9999, '保留自报值便于老师核对');
    const again = await c('/api/game/result', { ...run(me, 'garden', 7, log, 'r1') });
    assert.equal(again.body.status.game.plays, 1, '同一局补传只记一次');
    assert.equal((await c('/api/game/result', run(me, 'nope', 7, log))).status, 400);
    assert.equal((await c('/api/game/result', run(me, 'garden', 0, log))).status, 400);
    assert.equal((await c('/api/game/result', run(me, 'garden', 7, Array(700).fill({ t: 1, a: 50 })))).status, 400);
    const d = await c('/api/game/discover', { sid: me.student.id, round: me.round, level: 'garden', choice: 'two' });
    assert.equal(d.body.discovery.firstCorrect, false);
    const d2 = await c('/api/game/discover', { sid: me.student.id, round: me.round, level: 'garden', choice: 'ok' });
    assert.equal(d2.body.discovery.correct, true); assert.equal(d2.body.discovery.firstCorrect, false, '首选记录保留');
    // 别人的身份不能代交
    assert.equal((await c('/api/game/result', { ...run(me, 'garden', 7, log), sid: 'g601-b' })).status, 403);
    // 排行榜与教师数据
    st = (await c('/api/game/status')).body;
    assert.equal(st.leaderboard[0].name, '虚构游一');
    const cls = (await c('/api/teacher/class?class=601')).body;
    const a = cls.students.find(x => x.student.id === 'g601-a');
    assert.equal(a.gameGate.unlocked, true); assert.equal(a.game.best.garden.score, out.body.result.score);
    assert.equal(a.game.runs[0].controls.a.last, 45, '记录学生选择的阈值');
    // 再考低分：重新锁定
    await takeExam(c, me, 10);
    assert.equal((await c('/api/game/status')).body.unlocked, false);
    assert.equal((await c('/api/game/result', run(me, 'garden', 7, log))).status, 403);
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

test('规则体现学习目标：同一晚数据，阈值不同结果不同；单阈值闪烁、两条线不闪；采样太稀漏事件、太密没电；报警线误报/漏报权衡', () => {
  const seeds = [1, 2, 3, 4, 5];
  const avg = (lv, log, f = r => r.score) => seeds.reduce((n, s) => n + f(N.replay(lv, s, log)), 0) / seeds.length;
  // ① 湿度连续变化：开泵线太低→太干，太高→太湿，合适→最好
  assert.ok(avg('garden', [{ t: 0, a: 40 }]) > avg('garden', [{ t: 0, a: 15 }]) + 100);
  assert.ok(avg('garden', [{ t: 0, a: 40 }]) > avg('garden', [{ t: 0, a: 75 }]) + 100);
  assert.ok(avg('garden', [{ t: 0, a: 15 }], r => r.stats.dry) > 60, '开泵线太低：长时间太干');
  assert.ok(avg('garden', [{ t: 0, a: 80 }], r => r.stats.flood) > 60, '开泵线太高：长时间太湿');
  const e = N.create('garden', 3); const rows = []; while (!e.done) rows.push(N.tick(e));
  assert.ok(rows.every((r, i) => !i || Math.abs(r.truth - rows[i - 1].truth) <= 2.7), '湿度每秒只变一点点：连续变化');
  // ② 两个阈值（回差）避免频繁开关
  const single = avg('lamp', [{ t: 0, a: 100, b: 100 }], r => r.stats.switches), band = avg('lamp', [{ t: 0, a: 100, b: 250 }], r => r.stats.switches);
  assert.ok(single >= 8 && band <= 2, `单阈值开关${single}次，两条线${band}次`);
  assert.ok(avg('lamp', [{ t: 0, a: 100, b: 250 }]) > avg('lamp', [{ t: 0, a: 100, b: 100 }]) + 60);
  // ③ 采样间隔：每3秒最好；每1秒电池耗尽；每10秒漏事件
  const k1 = N.replay('sample', 2, [{ t: 0, k: 1 }]), k3 = N.replay('sample', 2, [{ t: 0, k: 3 }]), k10 = N.replay('sample', 2, [{ t: 0, k: 10 }]);
  assert.equal(k1.stats.battery, 0); assert.ok(k1.stats.missed > 0);
  assert.equal(k3.stats.missed, 0); assert.ok(k10.stats.missed > 0);
  assert.ok(k3.score > k1.score && k3.score > k10.score);
  // ④ 报警线：低→误报多，高→漏报多
  assert.ok(avg('alarm', [{ t: 0, a: 45 }], r => r.stats.falseAlarm) >= 5);
  assert.ok(avg('alarm', [{ t: 0, a: 75 }], r => r.stats.missed) >= 2.5);
  assert.ok(avg('alarm', [{ t: 0, a: 61 }]) > avg('alarm', [{ t: 0, a: 45 }]) + 50);
  // 同一晚、同一操作 → 完全相同（可复现，服务端才能重算）
  assert.deepEqual(N.replay('alarm', 9, [{ t: 0, a: 58 }, { t: 100, a: 62 }]), N.replay('alarm', 9, [{ t: 0, a: 58 }, { t: 100, a: 62 }]));
  // 中途改阈值会改变结果
  assert.notEqual(N.replay('garden', 4, [{ t: 0, a: 15 }]).score, N.replay('garden', 4, [{ t: 0, a: 15 }, { t: 60, a: 45 }]).score);
  // 任意时刻的值（两个时刻之间插值）
  assert.equal(N.valueAt([{ truth: 40 }, { truth: 50 }], 0.5), 45);
});
