import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const R = require('../public/rules.js');
globalThis.LessonRules = R;
const { learningProgress, nextExperimentAction, explainTarget } = await import('../public/journey.mjs');
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

test('实验指引直接指向要操作的控件', () => {
  const checks = R.experimentChecks('flow', { trials: [] });
  assert.equal(nextExperimentAction('flow', checks).selector, '#src-quiet');
  const half = R.experimentChecks('flow', { trials: [{ scene: 'quiet', db: 40, over: false }] });
  assert.equal(nextExperimentAction('flow', half).selector, '#src-dance');
  assert.equal(nextExperimentAction('wave', R.experimentChecks('wave', {}), { source: 'teacher', liveFresh: false }).selector, '#source-sim');
  assert.equal(nextExperimentAction('threshold', R.experimentChecks('threshold', {})).selector, '#th-slider');
  assert.equal(nextExperimentAction('design', R.experimentChecks('design', R.examples.design)).selector, '#step-next');
});

test('提交后的错误定位到需要修订的项', () => {
  const rec = { ...R.examples.wave, explain: { reason: 'pretty', points: 'samples' } };
  const errors = R.assess('wave', rec).errors;
  assert.equal(explainTarget('wave', rec, errors, R).selector, '[data-explain="reason"]');
  const life = { ...R.examples.life, explain: { ...R.examples.life.explain, lamp: 'c' } };
  assert.equal(explainTarget('life', life, R.assess('life', life).errors, R).selector, '[data-explain="lamp"]');
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
