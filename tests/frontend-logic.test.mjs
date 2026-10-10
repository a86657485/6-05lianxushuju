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

test('说清楚：一张卡一个问题，先补未答，再改标红，最后检验', () => {
  assert.deepEqual(cardKeys('flow', R), ['input', 'compute', 'output', 'transfer']);
  assert.equal(cardKeys('life', R).length, 8);
  assert.deepEqual(cardKeys('threshold', R).slice(2), ['case:kettle', 'case:fridge', 'case:heart', 'case:highway']);
  const empty = { ...R.examples.wave, explain: {}, transfer: '' };
  assert.equal(explainTarget('wave', empty, [], R).card, 'reason');
  const rec = { ...R.examples.wave, explain: { reason: 'pretty', points: 'samples' } };
  const errors = R.assess('wave', rec).errors;
  const wrong = wrongCards('wave', rec, errors, R);
  assert.deepEqual(wrong, ['reason']);
  assert.equal(explainTarget('wave', rec, errors, R, wrong).selector, '[data-card="reason"] .card-options');
  assert.equal(explainTarget('wave', rec, errors, R, []).selector, '#check', '改过后回到检验');
  const life = { ...R.examples.life, explain: { ...R.examples.life.explain, lamp: 'c' } };
  assert.deepEqual(wrongCards('life', life, R.assess('life', life).errors, R), ['lamp']);
  const th = { ...R.examples.threshold, transfer: { ...R.examples.threshold.transfer, fridge: '冷藏区' } };
  assert.deepEqual(wrongCards('threshold', th, R.assess('threshold', th).errors, R), ['case:fridge']);
  const design = { ...R.examples.design, design: { data: 'moisture', direction: 'below', threshold: 60 } };
  assert.equal(explainTarget('design', design, R.assess('design', design).errors, R).selector, '#back-to-experiment');
});

test('连续曲线：散点取样与两点之间读数', () => {
  const pts = Array.from({ length: 101 }, (_, i) => [i / 10, 40 + i / 5]);
  const dots = samplePoints(pts, 2);
  assert.deepEqual(dots.map(d => d[0]), [0, 2, 4, 6, 8, 10]);
  const { left, right } = neighbours(dots, 3.1);
  assert.equal(left[0], 2); assert.equal(right[0], 4);
  assert.ok(Math.abs(valueAt(pts, 3.15) - 46.3) < 1e-9);
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
  const html = renderClassCharts(s);
  assert.ok(html.stageHtml.includes('2/3')); assert.ok(html.evidenceHtml.includes('尚无证据'));
  assert.throws(() => summarizeClass({ classId: '601', students: [fakeStudent('x', '602')] }, R.stages), /不一致/);
  const empty = renderClassCharts(summarizeClass({ classId: '603', round: 'r1', students: [] }, R.stages, quiz.groups));
  assert.ok(empty.quizHtml.includes('尚无证据'));
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
