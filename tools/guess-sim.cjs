#!/usr/bin/env node
/*
 * “乱点的学生”蒙特卡洛模拟：按学生端同样的规则（预测随机、每张卡随机选、检验后错项划掉再随机改、
 * 迁移答错换情境）点到通过为止，用服务端同一套 rules.assess / stageSummary 计分。
 * 用法：node tools/guess-sim.cjs [次数=20000]
 */
const R = require('../public/rules.js');
function simulate(stage, rnd = Math.random) {
  const g = R.goals[stage], pick = a => a[Math.floor(rnd() * a.length)];
  const keys = ['compare', ...Object.keys(g.explain)];
  const opts = k => k === 'compare' ? ['match', 'differ'] : R.optionValues[stage][k];
  const rec = { ...structuredClone(R.examples[stage]), prediction: pick(R.predictionValues[stage]), explain: {}, transferItem: 'A', submitted: true, conceptHintLevel: 0 };
  const ruled = {};
  for (const k of keys) rec.explain[k] = pick(opts(k));
  rec.transfer = pick(R.optionValues[stage].transfer);
  const st = { first: rec, attempts: 0 };
  for (let n = 0; n < 50; n++) {
    const snap = structuredClone(rec); st.attempts++;
    if (!st.firstSubmitted) st.firstSubmitted = snap; st.lastSubmitted = st.latest = snap;
    const a = R.assess(stage, snap);
    if (a.pass) return R.stageSummary(stage, st, true);
    for (const k of a.wrong) {
      if (k === 'transfer') { rec.transferItem = rec.transferItem === 'A' ? 'B' : 'A'; rec.transfer = pick(R.optionValues[stage].transfer); continue; }
      (ruled[k] ||= new Set()).add(rec.explain[k]);
      rec.explain[k] = pick(opts(k).filter(v => !ruled[k].has(v)));
    }
  }
  throw new Error('未在50次内通过');
}
function run(N = 20000) {
  const out = {};
  for (const s of R.stageIds) {
    const stars = [0, 0, 0, 0]; let att = 0, tagged = 0;
    for (let i = 0; i < N; i++) { const m = simulate(s); stars[m.stars]++; att += m.attempts; if (m.tagsFirst.length) tagged++; }
    out[s] = { 一星: +(stars[1] / N * 100).toFixed(1), 两星: +(stars[2] / N * 100).toFixed(1), 三星: +(stars[3] / N * 100).toFixed(2), 平均星: +((stars[1] + 2 * stars[2] + 3 * stars[3]) / N).toFixed(2), 平均检验次数: +(att / N).toFixed(1), 首次留下误解标签: +(tagged / N * 100).toFixed(1) };
  }
  return out;
}
module.exports = { simulate, run };
if (require.main === module) { const N = Number(process.argv[2]) || 20000; console.log(`乱点的学生 × ${N} 次/站（百分比）`); console.table(run(N)); }
