import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const R = require('../public/rules.js');
globalThis.LessonRules = R;
const { learningProgress, nextExperimentAction, explainTarget, cardKeys, wrongCards } = await import('../public/journey.mjs');
const { summarizeClass, commonErrors } = await import('../public/teacher-stats.mjs');
const { renderClassCharts } = await import('../public/teacher-charts.mjs');
const { renderExamReview, pickLocal, goalSummary } = await import('../public/quiz.mjs');
const { rounds, judge } = await import('../public/reward.mjs');
const { samplePoints, neighbours, valueAt } = await import('../public/charts.mjs');
const quiz = require('../quiz.cjs');

test('学习三步：先预测，再实验，最后说清楚', () => {
  assert.equal(learningProgress('flow', {}, R).initialStep, 'predict');
  assert.equal(learningProgress('flow', { prediction: 'all', trials: [] }, R).initialStep, 'experiment');
  const ex = R.examples.flow;
  const p = learningProgress('flow', { ...ex, explain: {}, transfer: '' }, R);
  assert.equal(p.initialStep, 'explain'); assert.equal(p.readyToSubmit, false);
  assert.equal(learningProgress('flow', ex, R).readyToSubmit, true);
  assert.equal(learningProgress('threshold', { ...R.examples.threshold, transfer: { kettle: '100℃' } }, R).readyToSubmit, false, '四个案例都要找');
});

test('实验指引：每一刻只指向一个具体控件，并附一句话提示', () => {
  const checks = R.experimentChecks('flow', { trials: [] });
  assert.equal(nextExperimentAction('flow', checks).selector, '#src-quiet');
  assert.ok(nextExperimentAction('flow', checks).tip.length <= 16, '贴在控件旁的提示要短');
  const half = R.experimentChecks('flow', { trials: [{ scene: 'quiet', db: 40, over: false }] });
  assert.equal(nextExperimentAction('flow', half).selector, '#src-dance');
  assert.equal(nextExperimentAction('flow', half, { busy: true }).selector, null, '运行动画时只观察');
  assert.equal(nextExperimentAction('wave', R.experimentChecks('wave', {}), { source: 'teacher', liveFresh: false }).selector, '#source-sim');
  assert.equal(nextExperimentAction('wave', R.experimentChecks('wave', {}), { source: 'simulation', recording: true }).selector, '#knob');
  const th0 = R.experimentChecks('threshold', {});
  assert.equal(nextExperimentAction('threshold', th0, { threshold: 55 }).selector, '#run-monitor', '阈值已是55就直接运行');
  assert.equal(nextExperimentAction('threshold', th0, { threshold: 60 }).selector, '#th-slider');
  const th1 = R.experimentChecks('threshold', { trials: [{ threshold: 55, alarms: R.countAlarms(55) }] });
  assert.equal(nextExperimentAction('threshold', th1, { threshold: 55 }).selector, '#th-slider', '要换一个明显不同的阈值');
  assert.equal(nextExperimentAction('threshold', th1, { threshold: 45 }).selector, '#run-monitor');
  const d0 = R.experimentChecks('design', {});
  assert.equal(nextExperimentAction('design', d0, {}).selector, '#g-data', '先选数据（不预先替学生选好）');
  assert.equal(nextExperimentAction('design', d0, { data: 'moisture' }).selector, '#g-dir');
  assert.equal(nextExperimentAction('design', d0, { data: 'moisture', direction: 'below' }).selector, '#g-threshold');
  assert.equal(nextExperimentAction('design', d0, { data: 'moisture', direction: 'below', thresholdSet: true }).selector, '#run-garden');
  assert.equal(nextExperimentAction('design', d0, { data: 'moisture', direction: 'below', thresholdSet: true, alreadyRun: true }).selector, '#g-threshold', '同一方案不重复运行');
  assert.equal(nextExperimentAction('design', R.experimentChecks('design', R.examples.design)).selector, '#go-explain');
});

test('说清楚：对照预测→自己的证据→概念卡→新情境；改标红；通过后写句块', () => {
  assert.deepEqual(cardKeys('flow', R), ['compare', 'evidence', 'input', 'compute', 'output', 'transfer']);
  assert.equal(cardKeys('life', R).length, 2 + Object.keys(R.lifeCards).length + 1, '对照+证据+数据卡+迁移');
  assert.deepEqual(cardKeys('threshold', R).slice(3, 7), ['case:kettle', 'case:fridge', 'case:heart', 'case:highway']);
  const empty = { ...R.examples.wave, explain: {}, transfer: '' };
  assert.equal(explainTarget('wave', empty, R).card, 'compare', '先对照自己的预测');
  const rec = { ...R.examples.wave, explain: { ...R.examples.wave.explain, reason: 'pretty' } };
  assert.deepEqual(wrongCards('wave', rec, R), ['reason']);
  assert.deepEqual(R.assess('wave', rec).tags, ['pretty-reason'], '误解标签');
  assert.equal(explainTarget('wave', rec, R, { revisit: ['reason'], reviewed: true }).selector, '[data-card="reason"] .card-options');
  assert.equal(explainTarget('wave', rec, R, { reviewed: true }).selector, '#check', '改过后回到检验');
  const mismatch = { ...R.examples.wave, prediction: 'scatter' };
  assert.deepEqual(wrongCards('wave', mismatch, R), ['compare'], '预测与结果不同却说“一致”要改');
  const life = { ...R.examples.life, explain: { ...R.examples.life.explain, lamp: 'c' } };
  assert.deepEqual(wrongCards('life', life, R), ['lamp']); assert.deepEqual(R.assess('life', life).tags, ['state-continuous']);
  const th = { ...R.examples.threshold, explain: { ...R.examples.threshold.explain, 'case:fridge': '6℃' } };
  assert.deepEqual(wrongCards('threshold', th, R), ['case:fridge']); assert.deepEqual(R.assess('threshold', th).tags, ['threshold-is-data']);
  const design = { ...R.examples.design, design: { data: 'moisture', direction: 'below', threshold: 60 } };
  assert.equal(explainTarget('design', design, R, { reviewed: true }).selector, '#back-to-experiment');
  const passed = { ...R.examples.flow, reflect: {} };
  assert.equal(explainTarget('flow', passed, R, { passed: true }).selector, '#reflect-saw');
  assert.equal(explainTarget('flow', { ...passed, reflect: { saw: 'ipo', so: 'all' }, reflectDone: true }, R, { passed: true }).selector, '#next');
});

test('证据星：第一次就对才得后两颗；用了“具体帮助”不计；靠重试完成只得1颗', () => {
  const ex = R.examples.flow, wrong = { ...ex, explain: { ...ex.explain, compute: 'raw' } };
  const st = (first, last, extra = {}) => ({ first, firstSubmitted: first, lastSubmitted: last, latest: last, attempts: first === last ? 1 : 2, ...extra });
  assert.equal(R.stageSummary('flow', st(ex, ex), true).stars, 3);
  assert.equal(R.stageSummary('flow', st(wrong, ex), true).stars, 1, '解释首次错：迁移首次对也不单独给星（三选一可能是猜的）');
  assert.equal(R.stageSummary('flow', st({ ...ex, transfer: 'devices' }, ex), true).stars, 2, '解释首次全对、迁移首次错');
  assert.equal(R.stageSummary('flow', st({ ...wrong, transfer: 'devices' }, ex), true).stars, 1);
  assert.equal(R.stageSummary('flow', st({ ...ex, conceptHintLevel: 3 }, { ...ex, conceptHintLevel: 3 }), true).stars, 1, '第3级具体帮助');
  assert.equal(R.stageSummary('flow', st(ex, ex), false).stars, 0, '未通过不给星');
  const m = R.stageSummary('flow', st(wrong, ex), true);
  assert.equal(m.attempts, 2); assert.deepEqual(m.tagsFirst, ['stage-mix']); assert.equal(m.explainFirst, false); assert.equal(m.transferFirst, true);
});

function fakeStudent(id, classId, opts = {}) {
  const records = Object.fromEntries(R.stageIds.map(s => [s, { first: null, latest: null, firstSubmitted: null, lastSubmitted: null, history: [] }]));
  return { student: { id, classId, name: id }, updated: opts.entered ? '2026-10-10T00:00:00Z' : null, awards: (opts.awards || []).map(stage => ({ stage, points: 10 })), points: (opts.awards || []).length * 10, records: { ...records, ...(opts.records || {}) }, quizAttempts: opts.quiz || [] };
}
test('班级图表口径：分母、未提交、首次/最近、考核按目标', () => {
  const sub = (pass, errors = []) => ({ assessment: { pass, errors } });
  const students = [
    fakeStudent('a', '601', { entered: true, awards: R.stageIds, records: { flow: { firstSubmitted: sub(false, [R.messages.flow.input]), lastSubmitted: sub(true) } }, quiz: [{ score: 60, byGoal: { [quiz.groups[0]]: { right: 2, total: 4 } } }, { score: 90, byGoal: { [quiz.groups[0]]: { right: 4, total: 4 } } }] }),
    fakeStudent('b', '601', { entered: true, awards: ['flow'], records: { flow: { firstSubmitted: sub(false, [R.messages.flow.input]), lastSubmitted: sub(false, [R.messages.flow.input]) } } }),
    fakeStudent('c', '601')
  ];
  const s = summarizeClass({ classId: '601', round: 'r1', at: 'x', students }, R.stages, quiz.groups);
  assert.deepEqual(s.status, { notEntered: 1, inProgress: 1, complete: 1 });
  const flow = s.stages[0];
  assert.equal(flow.complete, 2); assert.deepEqual(flow.assessment, { submitted: 2, firstPassed: 0, latestPassed: 1, unanswered: 1 });
  assert.equal(s.quiz.tested, 1); assert.equal(s.quiz.firstAvg, 60); assert.equal(s.quiz.latestAvg, 90);
  assert.deepEqual(s.quiz.goals[0].first, { right: 2, n: 4 });
  assert.deepEqual(commonErrors(students, 'flow')[0], [R.messages.flow.input, 1]);
  const html = renderClassCharts(s, { R });
  assert.ok(html.progress.includes('2/3')); assert.ok(html.mastery.includes('<svg'));
  assert.throws(() => summarizeClass({ classId: '601', students: [fakeStudent('x', '602')] }, R.stages), /不一致/);
  const empty = renderClassCharts(summarizeClass({ classId: '603', round: 'r1', students: [] }, R.stages, quiz.groups));
  for (const k of ['progress', 'mastery', 'mis', 'pred', 'hint', 'quiz', 'timeline', 'threshold', 'garden']) assert.ok(empty[k].includes('尚无证据'), k + ' 空班显示尚无证据');
});

test('大屏证据口径：首次/最终、误解可点开、预测转变、提示级别、阈值气泡', () => {
  const now = Date.parse('2026-10-10T02:00:00Z'), iso = m => new Date(now - m * 60000).toISOString();
  const ex = R.examples.flow, wrong = { ...ex, explain: { ...ex.explain, input: 'collector' }, transfer: 'devices', prediction: 'input', conceptHintLevel: 1 };
  wrong.explain.compare = 'differ';
  const right = { ...wrong, explain: { ...ex.explain, compare: 'differ' }, transfer: 'flow', transferItem: 'B' };
  const rec = (first, last, pass) => ({ first, latest: last, firstSubmitted: first, lastSubmitted: last, attempts: 2, history: [{ created: iso(5), submitted: true, pass: false }, { created: iso(2), submitted: true, pass }] });
  const thr = R.examples.threshold;
  const students = [
    fakeStudent('甲', '601', { entered: true, awards: ['flow'], records: { flow: rec(wrong, right, true), threshold: { latest: { trials: thr.trials }, history: [] } } }),
    fakeStudent('乙', '601', { entered: true, records: { flow: rec(wrong, wrong, false), threshold: { latest: { trials: thr.trials.slice(0, 1) }, history: [] } } }),
    fakeStudent('丙', '601', { entered: true, awards: ['flow'], records: { flow: rec(ex, ex, true) } })
  ];
  for (const s of students) s.awards.forEach(a => a.created = iso(2));
  const st = summarizeClass({ classId: '601', round: 'r1', at: new Date(now).toISOString(), students }, R.stages, quiz.groups, R, now);
  const f = st.stages[0];
  assert.deepEqual(f.evidence, { submitted: 3, explainFirst: 1, transferFirst: 1, passed: 2, attemptsAvg: 2 });
  assert.deepEqual(f.stars, { one: 1, two: 0, three: 1 }, '甲首次错→1星，丙首次全对→3星');
  assert.deepEqual(f.prediction, { n: 3, correct: 1, revised: 1, pending: 1 });
  assert.deepEqual(f.hints.levels, [1, 2, 0, 0]);
  const dev = st.misconceptions.find(m => m.tag === 'device-as-data');
  assert.equal(dev.count, 2); assert.equal(dev.unresolved, 1, '乙仍存在，甲已纠正');
  assert.deepEqual(dev.students.map(x => [x.name, x.resolved]), [['甲', true], ['乙', false]]);
  const t55 = st.thresholds.find(t => t.threshold === 55); assert.equal(t55.n, 2); assert.equal(t55.alarms, R.countAlarms(55));
  assert.equal(st.timeline.minutes.reduce((n, m) => n + m.checks, 0), 6); assert.equal(st.timeline.minutes.reduce((n, m) => n + m.passes, 0), 2);
  const html = renderClassCharts(st, { misTag: 'device-as-data', R });
  assert.ok(html.mis.includes(R.tagLabels['device-as-data'])); assert.ok(html.mis.includes('仍存在：乙'));
  assert.ok(html.threshold.includes('<circle')); assert.ok(html.garden.includes('尚无证据'));
});

test('考核反馈：错题在前并给答案与解析；教师测试卷每目标4题', () => {
  const fb = quiz.questions.slice(0, 3).map((q, i) => ({ ...q, chosen: i === 0 ? q.answer : (q.answer + 1) % q.options.length, correct: i === 0 }));
  const html = renderExamReview(fb);
  assert.ok(html.indexOf('错题 2 道') < html.indexOf('答对 1 道'));
  assert.ok(html.includes('正确答案') && html.includes('解析'));
  const paper = pickLocal(quiz.questions); assert.equal(paper.length, 20);
  for (const g of quiz.groups) assert.equal(paper.filter(q => q.goal === g).length, 4);
  assert.deepEqual(goalSummary(fb)[quiz.groups[0]], { right: 1, total: 3 });
});

test('考后挑战：阈值来自需求，容差为量程1%', () => {
  assert.equal(rounds.length, 5);
  for (const r of rounds) { assert.ok(judge(r, r.answer)); assert.equal(judge(r, r.answer + (r.max - r.min) * 0.05), false); }
});

test('沉浸版素材：全部本地、体积小，并在素材来源中登记', async () => {
  const fs = await import('node:fs'), path = await import('node:path'), { fileURLToPath } = await import('node:url');
  const root = fileURLToPath(new URL('../public/', import.meta.url));
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  const files = walk(root), total = files.reduce((s, f) => s + fs.statSync(f).size, 0);
  assert.ok(total < 15 * 1024 * 1024, '学生端全部文件小于15 MB');
  const doc = fs.readFileSync(new URL('../docs/素材来源.md', import.meta.url), 'utf8');
  assert.ok(doc.includes('CC0') && doc.includes('kenney.nl/assets/toon-characters') && doc.includes('kenney.nl/assets/interface-sounds'));
  for (const f of files.filter(f => f.includes('/assets/kenney/sfx/'))) assert.ok(doc.includes(path.basename(f, '.ogg')), '音效已登记：' + f);
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.ok(!/https?:\/\//.test(html.replace(/<a [^>]*>/g, '')), '学生页不引用外网资源');
});

test('奖励小游戏入口与教师面板：79锁定显示最好成绩、80进入、测试模式不受限；大屏面板有空状态', async () => {
  const { gameEntry } = await import('../public/quiz.mjs');
  const locked = gameEntry('student', 79, [{ score: 85 }, { score: 79 }]);
  assert.ok(locked.includes('考核80分以上解锁') && locked.includes('最好成绩 85 分') && !locked.includes('href="/game"'));
  assert.ok(gameEntry('student', 80, [{ score: 80 }]).includes('href="/game"'));
  assert.ok(gameEntry('test', 0).includes('href="/game-test"'));
  assert.ok(gameEntry('student', null).includes('还没有参加20题考核'));
  assert.equal(gameEntry('demo', 100), '');
  const { gameChart } = await import('../public/teacher-charts.mjs');
  assert.ok(gameChart([{ student: { name: '甲' }, gameGate: { unlocked: false } }]).includes('尚无学生解锁'));
  const s = { student: { name: '乙' }, gameGate: { unlocked: true }, game: { plays: 2, total: 300, stars: 5, discoveries: { garden: { firstCorrect: true } }, runs: [{ level: 'garden', controls: { a: { last: 40 } } }, { level: 'sample', controls: { k: { last: 3 } } }] } };
  const html = gameChart([s]);
  assert.ok(html.includes('解锁 1/1') && html.includes('首选正确 1/1') && html.includes('乙'));
});
