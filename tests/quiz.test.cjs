'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const quiz = require('../quiz.cjs');

test('题库对齐三条学习目标：目标1、2各10题，目标3（难点）14题；标注重难点', () => {
  assert.equal(quiz.groups.length, 3);
  assert.deepEqual(quiz.groups, ['控制系统工作时产生的数据', '连续量的表现形式及应用', '阈值在控制系统中的作用']);
  assert.deepEqual(quiz.groups.map(g => quiz.questions.filter(q => q.goal === g).length), [10, 10, 14]);
  assert.equal(quiz.questions.length, 34);
  assert.deepEqual(quiz.FOCUS, [null, '重点：连续量数据的表现形式', '难点：阈值的含义与作用']);
  // 教参：阈值重在作用——目标3里直接问“阈值是什么”的概念题不超过1道
  assert.ok(quiz.questions.filter(q => q.goal === quiz.groups[2] && /阈值是什么/.test(q.prompt)).length <= 1);
  // 教材学习活动3的五个案例都进入题库（55 dB、100 ℃、4 ℃、100次/min、100～120 km/h）
  for (const k of ['55 dB', '100 ℃', '4 ℃', '100次/min', '100～120 km/h']) assert.ok(quiz.questions.some(q => q.goal === quiz.groups[2] && q.prompt.includes(k)), k);
});

test('每次抽20题，按 6+7+7 覆盖三目标（重难点多抽），公开题目不含答案', () => {
  for (let i = 0; i < 20; i++) {
    const p = quiz.pickQuestions();
    assert.equal(p.length, 20); assert.equal(new Set(p.map(q => q.id)).size, 20);
    assert.equal(p.filter(q => q.goal === quiz.groups[0]).length, 6);
    assert.equal(p.filter(q => q.goal === quiz.groups[1]).length, 7);
    assert.equal(p.filter(q => q.goal === quiz.groups[2]).length, 7);
    assert.ok(p.every(q => Number.isInteger(q.answer)));
  }
  const pub = quiz.publicQuestion(quiz.questions[0]);
  assert.equal(pub.answer, undefined); assert.equal(pub.explanation, undefined);
  assert.equal(pub.goal, quiz.groups[0]);
});
