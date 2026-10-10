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
  const ok = R.experimentChecks('flow', { trials: [{ scene: 'quiet', db: 40, over: false }, { scene: 'dance', db: 66, over: true }] });
  assert.ok(ok.every(c => c.complete));
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

test('关卡5：只有“湿度、降到阈值及以下、30—45%”能保持在适宜范围', () => {
  const fits = [];
  for (const data of Object.keys(R.designData)) for (const direction of ['below', 'above']) {
    const info = R.designData[data];
    for (let t = info.min; t <= info.max; t += data === 'light' ? 10 : 1) if (R.simulateGarden({ data, direction, threshold: t }).fit) fits.push([data, direction, t]);
  }
  assert.ok(fits.length > 0);
  assert.ok(fits.every(([d, dir, t]) => d === 'moisture' && dir === 'below' && t >= 30 && t <= 45), JSON.stringify(fits));
  const low = R.simulateGarden({ threshold: 35 }), high = R.simulateGarden({ threshold: 60 });
  assert.ok(high.waterings > low.waterings && high.max > 70, '阈值调高后浇水更频繁、过湿');
  assert.ok(R.simulateGarden({ threshold: 25 }).min < 30, '阈值太低会缺水');
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
  const badDesign = { ...R.examples.design, design: { data: 'moisture', direction: 'below', threshold: 60 } };
  assert.ok(R.assess('design', badDesign).errors.includes(R.messages.design.design));
  const lightDesign = { ...R.examples.design, design: { data: 'light', direction: 'below', threshold: 100 } };
  assert.equal(R.assess('design', lightDesign).pass, false);
});

test('未提交、未预测、缺实验均不能通过', () => {
  const r = { ...R.examples.wave, submitted: false };
  assert.equal(R.assess('wave', r).pass, false);
  assert.equal(R.assess('wave', { ...R.examples.wave, prediction: '' }).pass, false);
  assert.equal(R.assess('wave', { ...R.examples.wave, trials: [] }).pass, false);
  assert.ok(R.assess('wave', { ...R.examples.wave, trials: [{ kind: 'trace', samples: 100, min: 50, max: 55 }, R.examples.wave.trials[1]] }).errors.includes(R.messages.wave.experiment), '起伏不足15的曲线不计入');
  assert.equal(R.assess('nope', {}).pass, false);
});

test('乱点的学生：按学生端同样的重试规则点到通过，几乎拿不到满星，记录里留下误解与多次尝试', () => {
  const { simulate } = require('../tools/guess-sim.cjs');
  let seed = 42; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (const s of R.stageIds) {
    const N = 3000, runs = Array.from({ length: N }, () => simulate(s, rnd));
    const three = runs.filter(m => m.stars === 3).length / N, avg = runs.reduce((n, m) => n + m.stars, 0) / N;
    assert.ok(three < 0.03, `${s} 满星比例 ${three}`);
    assert.ok(avg < 1.15, `${s} 平均星 ${avg}`);
    assert.ok(runs.every(m => m.passed && m.stars >= 1), '仍可完成本站（不卡死），但证据星反映质量');
    assert.ok(runs.filter(m => m.attempts > 1).length / N > 0.9, `${s} 绝大多数需要多次检验`);
    assert.ok(runs.filter(m => m.tagsFirst.length).length / N > 0.9, `${s} 首次检验几乎都留下误解标签`);
  }
});
