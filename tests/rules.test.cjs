'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../public/rules.js');

test('关卡1：超过55 dB才算超标，等于55不算', () => {
  assert.equal(R.overLimit(55), false);
  assert.equal(R.overLimit(55.1), true);
  for (let seed = 0; seed < 50; seed++) {
    assert.equal(R.overLimit(R.measureSquare('quiet', seed)), false);
    assert.equal(R.overLimit(R.measureSquare('chat', seed)), false);
    assert.equal(R.overLimit(R.measureSquare('dance', seed)), true);
  }
});

test('关卡1：实验记录必须与比较规则一致', () => {
  const sch = { kind: 'schematic', slots: { s1: 'collect', s2: 'process', s3: 'output' } };
  const ok = R.experimentChecks('flow', { trials: [sch, { scene: 'quiet', db: 40, over: false }, { scene: 'dance', db: 66, over: true }] });
  assert.ok(ok.every(c => c.complete));
  const noSch = R.experimentChecks('flow', { trials: [{ scene: 'quiet', db: 40, over: false }, { scene: 'dance', db: 66, over: true }] });
  assert.equal(noSch.find(c => c.id === 'schematic').complete, false, '没画示意图不算完成');
  const badSch = R.experimentChecks('flow', { trials: [{ kind: 'schematic', slots: { s1: 'process', s2: 'collect', s3: 'output' } }] });
  assert.equal(badSch.find(c => c.id === 'schematic').complete, false, '装置位置放错不算');
  const forged = R.experimentChecks('flow', { trials: [{ scene: 'quiet', db: 40, over: true }] });
  assert.ok(forged.every(c => !c.complete), '读数与判断不一致的记录不能计入');
});

test('关卡4：同一晚数据，阈值越低提示越多；55 dB为3次', () => {
  assert.equal(R.nightNoise().length, 181);
  assert.equal(R.countAlarms(55), 3);
  assert.ok(R.countAlarms(45) > R.countAlarms(55));
  assert.ok(R.countAlarms(65) < R.countAlarms(55));
  assert.equal(R.countAlarms(90), 0);
  for (let t = 40; t < 90; t++) assert.ok(R.countAlarms(t) >= 0);
});

test('关卡4：伪造的提示次数不计入实验', () => {
  const c = R.experimentChecks('threshold', { trials: [{ threshold: 55, alarms: 9 }, { threshold: 45, alarms: R.countAlarms(45) }] });
  assert.equal(c.find(x => x.id === 'standard').complete, false);
  assert.equal(c.find(x => x.id === 'compare').complete, true);
});

test('关卡5（拓展与提升）：照搬55 dB会在正常聊天时提示；约62—76 dB只在喧哗时提示；太高漏报', () => {
  assert.equal(R.classroomNoise().length, 61);
  const s55 = R.simulateClassroom(55);
  assert.equal(s55.fit, false); assert.ok(s55.falseAlarms >= 3, '标准值55照搬到课间教室会误报');
  assert.equal(R.simulateClassroom(R.ACCEPT).fit, true, '同学能接受的音量65 dB合适');
  const fits = []; for (let t = 40; t <= 90; t++) if (R.simulateClassroom(t).fit) fits.push(t);
  assert.ok(fits[0] >= 60 && fits.at(-1) <= 77, JSON.stringify(fits));
  assert.ok(R.simulateClassroom(80).missed === 2, '阈值太高，喧哗也不提示');
  const forged = R.experimentChecks('design', { trials: [{ threshold: 65, alarms: 9, fit: true }] });
  assert.equal(forged.find(c => c.id === 'fit').complete, false, '伪造的提示次数不计入');
});

test('每关达标示例通过，错误解释给出对应修订信息', () => {
  for (const s of R.stageIds) { const a = R.assess(s, R.examples[s]); assert.equal(a.pass, true, s); assert.deepEqual(a.errors, [], s); assert.deepEqual(a.wrong, [], s); }
  const wrongFlow = { ...R.examples.flow, explain: { ...R.examples.flow.explain, input: 'collector' } };
  assert.ok(R.assess('flow', wrongFlow).errors.includes(R.messages.flow.input));
  const wrongLife = { ...R.examples.life, explain: { ...R.examples.life.explain, people: 'c' } };
  assert.ok(R.assess('life', wrongLife).errors.includes(R.messages.life.sort));
  const wrongCase = { ...R.examples.threshold, explain: { ...R.examples.threshold.explain, 'case:fridge': '压缩机' } };
  assert.ok(R.assess('threshold', wrongCase).errors.includes(R.messages.threshold.cases));
  assert.deepEqual(R.assess('threshold', wrongCase).tags, ['threshold-is-device']);
  const wrongTransfer = { ...R.examples.threshold, transfer: 'faster' };
  assert.ok(R.assess('threshold', wrongTransfer).errors.includes(R.messages.threshold.transfer));
  assert.equal(R.assess('threshold', wrongTransfer).parts.explain, true, '迁移错不影响解释判断');
  const badDesign = { ...R.examples.design, design: { threshold: 55 } };
  assert.ok(R.assess('design', badDesign).errors.includes(R.messages.design.design));
  assert.deepEqual(R.assess('design', { ...R.examples.design, explain: { ...R.examples.design.explain, evidence: 'standard' } }).tags, ['standard-copy']);
  // 每站都标注对应的教参学习目标；重难点落在第2—5站
  assert.deepEqual(R.stages.map(s => s.goal), [1, 2, 2, 3, 3]);
  assert.deepEqual(R.stages.map(s => s.focus), [null, 'key', 'key', 'hard', 'hard']);
});

test('未提交、未预测、缺实验均不能通过', () => {
  const r = { ...R.examples.wave, submitted: false };
  assert.equal(R.assess('wave', r).pass, false);
  assert.equal(R.assess('wave', { ...R.examples.wave, prediction: '' }).pass, false);
  assert.equal(R.assess('wave', { ...R.examples.wave, trials: [] }).pass, false);
  assert.ok(R.assess('wave', { ...R.examples.wave, trials: [{ kind: 'trace', samples: 100, min: 50, max: 55 }, R.examples.wave.trials[1]] }).errors.includes(R.messages.wave.experiment), '起伏不足15的曲线不计入');
  assert.equal(R.assess('nope', {}).pass, false);
});

test('乱点的学生：按学生端同样的重试规则点到通过，几乎拿不到满三星，通关多为两星；记录里留下误解与多次尝试', () => {
  const { simulate } = require('../tools/guess-sim.cjs');
  let seed = 42; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (const s of R.stageIds) {
    const N = 3000, runs = Array.from({ length: N }, () => simulate(s, rnd));
    const three = runs.filter(m => m.stars === 3).length / N, avg = runs.reduce((n, m) => n + m.stars, 0) / N;
    assert.ok(three < 0.03, `${s} 满星比例 ${three}`);
    assert.ok(avg < 2.2, `${s} 平均星 ${avg}`); // 通关即 ★★（二刷可出门），满 ★★★ 仍很少
    assert.ok(runs.every(m => m.passed && m.stars >= 1), '仍可完成本站（不卡死），但证据星反映质量');
    assert.ok(runs.filter(m => m.attempts > 1).length / N > 0.9, `${s} 绝大多数需要多次检验`);
    assert.ok(runs.filter(m => m.tagsFirst.length).length / N > 0.9, `${s} 首次检验几乎都留下误解标签`);
  }
});
