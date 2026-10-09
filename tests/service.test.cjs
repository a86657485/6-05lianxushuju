'use strict';
/* 课堂服务集成测试：使用虚构名单与临时数据库，不触碰正式 runtime/。 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createService } = require('../server.cjs');
const R = require('../public/rules.js');

const roster = [
  { id: 't601-a', classId: '601', name: '虚构甲' }, { id: 't601-b', classId: '601', name: '虚构乙' },
  { id: 't601-c', classId: '601', name: '虚构甲' }, { id: 't602-a', classId: '602', name: '虚构丙' }
];
function lanIp() { for (const nets of Object.values(os.networkInterfaces())) for (const n of nets || []) if (n.family === 'IPv4' && !n.internal) return n.address; return null; }

async function start(dir, opts = {}) {
  const svc = createService({ roster, runtimeDir: dir, ...opts });
  await new Promise(r => svc.server.listen(0, opts.host || '127.0.0.1', r));
  const host = opts.host || '127.0.0.1', port = svc.server.address().port;
  return { svc, base: `http://${host}:${port}`, stop: () => new Promise(r => svc.server.close(() => { svc.close(); r(); })) };
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
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'lesson5-test-'));
const send = (c, me, stage, record, eventId = stage + '-' + Math.random()) => c('/api/event', { sid: me.student.id, round: me.round, stage, eventId, record });

test('登录：只列六年级、空姓名拒绝、同名需确认、手动加入归班', async () => {
  const dir = tmp(), s = await start(dir), c = client(s.base);
  try {
    assert.equal((await c('/api/roster?class=501')).status, 400);
    assert.equal((await c('/api/roster?class=601')).body.length, 3);
    assert.equal((await c('/api/login', { classId: '601', name: '  ' })).status, 400);
    const dup = await c('/api/login', { classId: '601', name: '虚构甲' });
    assert.equal(dup.status, 409); assert.equal(dup.body.choices.length, 2, '同名两人都列出供确认');
    assert.equal((await c('/api/login', { classId: '602', id: 't601-a' })).status, 400, '姓名不属于所选班级');
    const manual = await c('/api/login', { classId: '602', name: '名单外同学' });
    assert.equal(manual.status, 200); assert.ok(manual.body.student.id.startsWith('manual-')); assert.equal(manual.body.student.classId, '602');
    assert.ok((await c('/api/roster?class=602')).body.some(x => x.name === '名单外同学' && x.manual));
    assert.equal((await c('/api/me')).body.student.name, '名单外同学');
  } finally { await s.stop(); }
});

test('关卡：按顺序解锁，积分同轮只记一次，首次预测与首次提交保留', async () => {
  const dir = tmp(), s = await start(dir), c = client(s.base);
  try {
    const me = (await c('/api/login', { classId: '601', id: 't601-a' })).body;
    assert.equal((await send(c, me, 'wave', R.examples.wave)).status, 409, '未完成上一关不能提交下一关');
    const wrongFirst = { ...R.examples.flow, prediction: 'input', explain: { ...R.examples.flow.explain, output: 'screen' } };
    let st = (await send(c, me, 'flow', wrongFirst)).body;
    assert.equal(st.points, 0); assert.equal(st.records.flow.firstSubmitted.assessment.pass, false);
    const ok = { ...R.examples.flow, prediction: 'input' };
    st = (await send(c, me, 'flow', ok, 'same-id')).body; assert.equal(st.points, 10);
    st = (await send(c, me, 'flow', ok, 'same-id')).body; assert.equal(st.points, 10, '重复补传不加分');
    assert.equal(st.records.flow.history.length, 2, '重复事件只记录一次');
    st = (await send(c, me, 'flow', { ...ok, editedAt: Date.now() + 5 })).body; assert.equal(st.points, 10, '重做通过不重复加分');
    assert.equal(st.records.flow.first.prediction, 'input');
    assert.equal(st.records.flow.firstSubmitted.assessment.pass, false, '首次提交证据保留');
    assert.equal(st.records.flow.lastSubmitted.assessment.pass, true);
    for (const stage of R.stageIds.slice(1)) st = (await send(c, me, stage, R.examples[stage])).body;
    assert.equal(st.points, 50); assert.equal(st.awards.length, 5);
  } finally { await s.stop(); }
});

test('旧设备迟到的补传不覆盖较新的记录；伪造实验不通过', async () => {
  const dir = tmp(), s = await start(dir), c = client(s.base);
  try {
    const me = (await c('/api/login', { classId: '601', id: 't601-b' })).body;
    const t = Date.now();
    await send(c, me, 'flow', { ...R.examples.flow, editedAt: t });
    const st = (await send(c, me, 'flow', { ...R.examples.flow, submitted: false, prediction: 'all', editedAt: t - 60000 })).body;
    assert.equal(st.records.flow.latest.submitted, true, '旧时间戳的记录不覆盖最近记录');
    const forged = { ...R.examples.flow, trials: [{ scene: 'quiet', db: 70, over: false }, { scene: 'dance', db: 40, over: true }] };
    const me2 = (await client(s.base)('/api/login', { classId: '602', id: 't602-a' })).body;
    const c2 = client(s.base); await c2('/api/login', { classId: '602', id: 't602-a' });
    const r = (await send(c2, me2, 'flow', forged)).body; assert.equal(r.points, 0);
    assert.equal((await c('/api/event', { sid: 't602-a', round: me.round, stage: 'flow', eventId: 'x', record: {} })).status, 403, '不能替别人写记录');
  } finally { await s.stop(); }
});

test('20题考核：不泄露答案、未答不能交、可重考并保留历史', async () => {
  const dir = tmp(), s = await start(dir), c = client(s.base);
  try {
    const me = (await c('/api/login', { classId: '601', id: 't601-a' })).body;
    const e1 = (await c('/api/exam/create', { sid: me.student.id, round: me.round })).body;
    assert.equal(e1.questions.length, 20); assert.ok(e1.questions.every(q => q.answer === undefined && q.explanation === undefined));
    assert.equal((await c('/api/exam/create', { sid: me.student.id, round: me.round })).body.id, e1.id, '未提交前返回同一试卷');
    const partial = Object.fromEntries(e1.questions.slice(0, 19).map(q => [q.id, 0]));
    assert.equal((await c('/api/exam/submit', { sid: me.student.id, round: me.round, examId: e1.id, answers: partial })).status, 400);
    const r1 = (await c('/api/exam/submit', { sid: me.student.id, round: me.round, examId: e1.id, answers: Object.fromEntries(e1.questions.map(q => [q.id, 0])) })).body;
    assert.equal(r1.feedback.length, 20); assert.ok(r1.feedback.every(q => Number.isInteger(q.answer) && q.explanation));
    assert.equal(Object.values(r1.byGoal).reduce((n, v) => n + v.total, 0), 20);
    const e2 = (await c('/api/exam/create', { sid: me.student.id, round: me.round })).body; assert.notEqual(e2.id, e1.id);
    const answers = {}; for (const q of e2.questions) answers[q.id] = 1;
    await c('/api/exam/submit', { sid: me.student.id, round: me.round, examId: e2.id, answers });
    const meNow = (await c('/api/me')).body; assert.equal(meNow.quizAttempts.length, 2); assert.equal(meNow.quizAttempts[0].id, e1.id);
    assert.equal(meNow.points, 0, '考核成绩与通关积分分开');
  } finally { await s.stop(); }
});

test('教师接口：本机可用；新轮次保留旧轮；重启后记录恢复；现场数据校验', async () => {
  const dir = tmp(); let s = await start(dir); const c = client(s.base);
  try {
    const me = (await c('/api/login', { classId: '601', id: 't601-a' })).body;
    await send(c, me, 'flow', R.examples.flow);
    const cls = (await c('/api/teacher/class?class=601')).body;
    assert.equal(cls.students.length, 3); assert.equal(cls.students.find(x => x.student.id === 't601-a').points, 10);
    assert.ok(cls.students.every(x => x.student.classId === '601'));
    const ans = (await c('/api/teacher/answers')).body; assert.equal(ans.questions.length, 40); assert.equal(ans.goals.length, 5);
    assert.equal((await c('/api/teacher/live', { level: 150, threshold: 60, alarm: false, active: true, alarmCount: 0 })).status, 400);
    assert.equal((await c('/api/teacher/live', { level: 70, threshold: 60, alarm: true, active: true, alarmCount: 1 })).status, 200);
    assert.equal((await c('/api/live')).body.alarm, true);
    const round = (await c('/api/teacher/new-round', { classId: '601' })).body.round; assert.equal(round, 'r2');
    assert.equal((await send(c, me, 'flow', R.examples.flow)).status, 409, '旧轮次的补传被拒绝而不是覆盖新轮');
    const me2 = (await c('/api/me')).body; assert.equal(me2.round, 'r2'); assert.equal(me2.points, 0);
    await s.stop(); s = await start(dir); const c2 = client(s.base);
    const again = (await c2('/api/login', { classId: '601', id: 't601-a' })).body; assert.equal(again.round, 'r2');
    const cls2 = (await c2('/api/teacher/class?class=601')).body; assert.deepEqual(cls2.students.find(x => x.student.id === 't601-a').roundHistory, ['r1']);
    assert.equal((await c2('/teacher')).status, 200);
  } finally { await s.stop(); }
});

test('教师页面与接口：非教师设备访问被拒绝，学生入口正常', async t => {
  const ip = lanIp(); if (!ip) return t.skip('没有可用的局域网地址');
  const dir = tmp(), s = await start(dir, { host: ip, networkInterfaces: () => ({ lo: [{ address: '127.0.0.1', family: 'IPv4' }] }) });
  const c = client(s.base);
  try {
    for (const p of ['/teacher', '/test', '/teacher.mjs', '/api/teacher/class?class=601', '/api/teacher/answers', '/teacher-microphone']) assert.equal((await c(p)).status, 403, p);
    assert.equal((await c('/api/teacher/new-round', { classId: '601' })).status, 403);
    assert.equal((await c('/')).status, 200); assert.equal((await c('/rules.js')).status, 200);
    const html = (await c('/')).body; assert.ok(!html.includes('/teacher"') && !html.includes('/test"'), '学生页不出现教师入口');
    assert.equal((await c('/roster.json')).status, 404); assert.equal((await c('/../roster.json')).status, 404);
  } finally { await s.stop(); }
  const s2 = await start(tmp(), { host: ip, teacherAllow: ip + '/32', networkInterfaces: () => ({}) });
  try { assert.equal((await client(s2.base)('/api/teacher/class?class=601')).status, 200, 'TEACHER_ALLOW 中的设备可访问'); } finally { await s2.stop(); }
});
