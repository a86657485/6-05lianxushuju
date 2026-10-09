'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const quiz = require('../quiz.cjs');

test('题库40题：5个目标各8题，答案索引有效、无重复题干', () => {
  assert.equal(quiz.questions.length, 40);
  assert.equal(quiz.groups.length, 5);
  for (const g of quiz.groups) assert.equal(quiz.questions.filter(q => q.goal === g).length, 8);
  for (const q of quiz.questions) { assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length, q.id); assert.ok(q.explanation.length > 5); assert.equal(new Set(q.options).size, q.options.length, q.id); }
  assert.equal(new Set(quiz.questions.map(q => q.prompt)).size, 40);
});
test('每次抽20题，每个目标4题，公开题目不含答案', () => {
  for (let i = 0; i < 20; i++) {
    const p = quiz.pickQuestions();
    assert.equal(p.length, 20); assert.equal(new Set(p.map(q => q.id)).size, 20);
    for (const g of quiz.groups) assert.equal(p.filter(q => q.goal === g).length, 4);
  }
  const pub = quiz.publicQuestion(quiz.questions[0]);
  assert.equal(pub.answer, undefined); assert.equal(pub.explanation, undefined);
});
test('正确答案不集中在同一选项位置（服务端还会打乱选项）', () => {
  const pos = [0, 0, 0, 0]; for (const q of quiz.questions) pos[q.answer]++;
  assert.ok(Math.max(...pos) < 30);
});
