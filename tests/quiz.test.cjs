'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const quiz = require('../quiz.cjs');

test('题库对齐三条学习目标，每目标10题', () => {
  assert.equal(quiz.groups.length, 3);
  assert.deepEqual(quiz.groups, ['控制系统工作时产生的数据', '连续量的表现形式及应用', '阈值在控制系统中的作用']);
  for (const g of quiz.groups) assert.equal(quiz.questions.filter(q => q.goal === g).length, 10);
  assert.equal(quiz.questions.length, 30);
});

test('每次抽20题，按 7+7+6 覆盖三目标，公开题目不含答案', () => {
  for (let i = 0; i < 20; i++) {
    const p = quiz.pickQuestions();
    assert.equal(p.length, 20); assert.equal(new Set(p.map(q => q.id)).size, 20);
    assert.equal(p.filter(q => q.goal === quiz.groups[0]).length, 7);
    assert.equal(p.filter(q => q.goal === quiz.groups[1]).length, 7);
    assert.equal(p.filter(q => q.goal === quiz.groups[2]).length, 6);
    assert.ok(p.every(q => Number.isInteger(q.answer)));
  }
  const pub = quiz.publicQuestion(quiz.questions[0]);
  assert.equal(pub.answer, undefined); assert.equal(pub.explanation, undefined);
  assert.equal(pub.goal, quiz.groups[0]);
});
