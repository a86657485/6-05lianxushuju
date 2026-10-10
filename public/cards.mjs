/*
 * “说清楚”卡片（纯函数，界面与测试共用）：
 *   compare  对照：我的预测 vs 我的实验结果（正确答案取决于学生自己的预测）
 *   evidence 证据：题干与选项用学生自己的实验数据生成
 *   概念卡   干扰项按常见误解设计
 *   transfer 新情境：答错后换成等价的另一个新情境（A↔B），首答单独记录
 * 选项按学生打乱顺序；答错的选项会被划掉并给出针对这个误解的反馈。
 */
import { activities } from './activities.mjs';

const esc = s => String(s ?? '').replace(/[&<>"']/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[x]));
const f1 = v => Number.isFinite(v) ? (Math.round(v * 10) / 10).toFixed(1) : '?';

export function cardKeys(stage, R) {
  const k = ['compare', 'evidence'];
  if (stage === 'flow') k.push('input', 'compute', 'output');
  if (stage === 'wave') k.push('reason');
  if (stage === 'life') k.push(...Object.keys(R.lifeCards));
  if (stage === 'threshold') k.push('where', ...Object.keys(R.thresholdCases).map(c => 'case:' + c));
  if (stage === 'design') k.push('role', 'raise');
  return [...k, 'transfer'];
}
export const explainKeys = (stage, R) => cardKeys(stage, R).filter(k => k !== 'transfer');

/** 从学生自己的实验记录里取出证据卡要用的数（题干里的 {token}）。 */
export function cardData(stage, record, R) {
  const ts = (Array.isArray(record?.trials) ? record.trials : []).filter(t => t && typeof t === 'object');
  const d = {};
  if (stage === 'flow') {
    const ok = ts.filter(t => R.squareScenes[t.scene] && Number.isFinite(t.db));
    const under = ok.filter(t => !t.over).at(-1), over = ok.filter(t => t.over).at(-1);
    Object.assign(d, { quietDb: f1(under?.db), quietScene: R.squareScenes[under?.scene]?.label || '安静时', overDb: f1(over?.db), overScene: R.squareScenes[over?.scene]?.label || '吵闹时' });
  } else if (stage === 'wave') {
    const tr = ts.filter(t => t.kind === 'trace' && t.max - t.min >= 15).at(-1), b = ts.filter(t => t.kind === 'between').at(-1);
    Object.assign(d, { samples: tr?.samples ?? '?', min: tr?.min ?? '?', max: tr?.max ?? '?', t: b?.t ?? '?', v: b?.value ?? '?', left: b?.leftT ?? '?', right: b?.rightT ?? '?' });
  } else if (stage === 'life') {
    const c = ts.filter(t => t.kind === 'curtain').sort((x, y) => (y.distinct || 0) - (x.distinct || 0))[0], k = ts.filter(t => t.kind === 'kettle' && t.reading < 100).at(-1);
    Object.assign(d, { n: c?.distinct ?? '?', min: c?.min ?? '?', max: c?.max ?? '?', r: k?.reading ?? '?' });
  } else if (stage === 'threshold') {
    const runs = ts.filter(t => Number.isInteger(t.threshold) && t.alarms === R.countAlarms(t.threshold));
    const std = runs.filter(t => t.threshold === R.NIGHT_LIMIT).at(-1), other = runs.filter(t => Math.abs(t.threshold - R.NIGHT_LIMIT) >= 5).at(-1);
    Object.assign(d, { a: std?.alarms ?? '?', x: other?.threshold ?? '?', b: other?.alarms ?? '?' });
  } else if (stage === 'design') {
    const fit = ts.filter(t => R.designData[t.data] && t.fit).at(-1);
    Object.assign(d, { th: fit?.threshold ?? '?', min: fit?.min ?? '?', max: fit?.max ?? '?', th25: Number.isFinite(fit?.threshold) ? Math.min(100, fit.threshold + 25) : '?' });
  }
  return d;
}
export const fill = (text, d) => String(text).replace(/\{(\w+)\}/g, (_, k) => d[k] ?? '?');

/** “我的数据”：对照卡与修订时给学生回看的几行实验结果。 */
export function dataLines(stage, record, R) {
  const ts = (Array.isArray(record?.trials) ? record.trials : []).filter(t => t && typeof t === 'object'), d = cardData(stage, record, R);
  if (stage === 'flow') return [`${d.quietScene}：声音 ${d.quietDb} dB → ${d.quietDb} ≤ 55，未超标 → 只显示数值`, `${d.overScene}：声音 ${d.overDb} dB → ${d.overDb} > 55，超标 → 显示并发出提示`];
  if (stage === 'wave') return [`你的曲线：10秒里 ${d.samples} 个读数，在 ${d.min}—${d.max} 之间连续起伏`, `圆点：每2秒才记一个读数`, `你在 ${d.t} 秒（${d.left} 秒与 ${d.right} 秒两个圆点之间）读到 ${d.v}`];
  if (stage === 'life') return [`窗帘：光照从 ${d.max} 降到 ${d.min} lux，经过 ${d.n} 个不同读数`, `烧水：途中读到 ${d.r} ℃`];
  if (stage === 'threshold') {
    const uniq = [...new Map(ts.filter(t => Number.isInteger(t.threshold)).map(t => [t.threshold, t])).values()].sort((a, b) => b.threshold - a.threshold);
    return [...uniq.slice(0, 4).map(t => `阈值 ${t.threshold} dB → 这一晚 ${t.alarms} 次提示`), '每次回放的都是同一晚的噪声曲线'];
  }
  if (stage === 'design') return ts.filter(t => R.designData[t.data]).slice(-4).map(t => `${R.designData[t.data].label}${t.direction === 'below' ? '降到' : '升到'}${t.threshold}${R.designData[t.data].unit}开泵：湿度 ${t.min}%—${t.max}%，浇水 ${t.waterings ?? '?'} 次 ${t.fit ? '✓ 合适' : '✗ 不合适'}`);
  return [];
}

/** 确定的伪随机打乱：同一学生、同一张卡每次顺序一样，不同学生顺序不同。 */
export function shuffleFor(items, seed) {
  let h = 2166136261; for (const ch of String(seed)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  const rnd = () => { h += 0x6D2B79F5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}
export const ruledKey = (key, record) => key === 'transfer' ? 'transfer:' + (record.transferItem || 'A') : key;

/**
 * 一张卡的内容：kicker、题目、可视区域（HTML）、选项（已按学生打乱，答错过的标 ruledOut）、某个选项的针对性反馈。
 */
export function cardSpec(stage, key, record, R, seed = '') {
  const a = activities[stage], d = cardData(stage, record, R), keys = cardKeys(stage, R), n = keys.indexOf(key) + 1;
  const predLabel = a.predict.find(p => p[0] === record.prediction)?.[1] || '（还没有预测）';
  let kicker = `说清楚 ${n}/${keys.length}`, question = '', visual = '', options = [], feedback = () => '';
  const fb = a.feedback || {};
  if (key === 'compare') {
    kicker += ' · 对照预测';
    question = '实验结果和你的预测一致吗？';
    visual = `<div class="compare-box"><p><b>我的预测</b><span>${esc(a.question)}<br>→ ${esc(predLabel)}</span></p><p><b>我的实验结果</b><span>${dataLines(stage, record, R).map(esc).join('<br>')}</span></p></div>`;
    options = [['match', '一致：结果和我预测的一样'], ['differ', '不一致：结果和我预测的不一样']];
    feedback = v => v === 'differ' ? `再对照一次：你预测「${predLabel}」，实验结果也是这样吗？` : `你预测「${predLabel}」。看看你的实验结果，真的一样吗？`;
  } else if (key === 'evidence') {
    kicker += ' · 用我的数据';
    const c = a.cards.evidence; question = fill(c.q, d);
    options = c.options.map(([v, l]) => [v, fill(l, d)]);
    feedback = v => fill(fb.evidence?.[v] || R.messages[stage].evidence, d);
  } else if (key === 'transfer') {
    const item = record.transferItem === 'B' ? 'B' : 'A', t = a.transfer[item];
    kicker += item === 'B' ? ' · 换一个新情境' : ' · 新情境';
    question = t.q; options = t.options;
    feedback = v => fill(fb.transfer?.[v] || R.messages[stage].transfer, d);
  } else if (stage === 'life' && R.lifeCards[key]) {
    const card = R.lifeCards[key];
    kicker = `说清楚 ${n}/${keys.length} · 数据卡`;
    visual = `<p class="data-card">${esc(card.label)}</p>`;
    question = a.cards.sort.q; options = a.cards.sort.options;
    feedback = () => card.kind === 'c' ? fb.sortC : card.kind === 'state' ? fb.sortState : fb.sortCount;
  } else if (key.startsWith('case:')) {
    const c = R.thresholdCases[key.slice(5)], idx = Object.keys(R.thresholdCases).indexOf(key.slice(5));
    kicker += ' · 找阈值';
    visual = `<p class="case-text">案例${idx + 2}：${esc(c.text)}</p>`;
    question = a.cards.case.q; options = c.options.map(o => [o, o]);
    feedback = () => fb.case;
  } else {
    const c = a.cards[key];
    if (c.ipo) visual = `<div class="mini-ipo">${[['input', '输入'], ['compute', '计算'], ['output', '输出']].map(([k, t]) => `<span class="${k === key ? 'on' : ''} ${record.explain?.[k] ? 'filled' : ''}">${t}</span>`).join('<i>→</i>')}</div>`;
    question = fill(c.q, d); options = c.options.map(([v, l]) => [v, fill(l, d)]);
    feedback = v => fill(fb[key]?.[v] || R.messages[stage][key], d);
  }
  const ruled = record.ruledOut?.[ruledKey(key, record)] || [];
  const shown = key === 'compare' ? options : shuffleFor(options, seed + '|' + stage + '|' + ruledKey(key, record));
  return { key, kicker, question, visual, options: shown.map(([value, label]) => ({ value, label, ruledOut: ruled.includes(value) })), feedback };
}

/** 想法提示（说清楚环节）：观察 → 思路 → 具体帮助，第3级记为“有帮助完成”。 */
export function conceptHint(stage, level, record, R) {
  return fill(activities[stage].conceptHints[Math.max(1, Math.min(3, level)) - 1], cardData(stage, record, R));
}
