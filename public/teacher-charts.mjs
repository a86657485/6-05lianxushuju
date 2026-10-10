/*
 * 教师大屏图表（手写SVG/HTML，离线、无第三方库）。每个函数返回一个图表卡片的HTML；
 * 数据不足时显示“尚无证据”，并在副标题写明分母与口径。
 */
const esc = s => String(s ?? '').replace(/[&<>"']/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[x]));
const pct = (n, t) => t ? Math.round(n / t * 100) : 0;
const w = (n, t) => t ? (n / t * 100).toFixed(2) : 0;
const C = { done: '#1f9d6b', prog: '#2b7fb8', none: '#c9d5db', red: '#d64f45', amber: '#f0a500', light: '#9fd6bf', ink: '#12303f', muted: '#5d7682', blue2: '#86b9dc' };
const empty = (msg = '尚无证据') => `<p class="no-evidence">${msg}</p>`;
const card = (title, sub, body, extra = '') => `<h2>${title}</h2><p class="chart-subtitle">${sub}</p>${body}${extra}`;
const legend = items => `<div class="dash-legend">${items.map(([c, l]) => `<span><i style="background:${c}"></i>${l}</span>`).join('')}</div>`;
function stack(parts, total, label) {
  const segs = parts.filter(p => p[0] > 0).map(([n, c, t]) => `<span style="width:${w(n, total)}%;background:${c}" title="${esc(t)} ${n}人">${pct(n, total) >= 9 ? n : ''}</span>`).join('');
  return `<div class="stack" role="img" aria-label="${esc(label)}">${segs || '<span class="stack-empty"></span>'}</div>`;
}

export function kpiHtml(st) {
  const items = [['名单人数', st.total], ['已进入', st.entered], ['完成五站', st.status.complete], ['平均证据星', st.starsAvg ?? '—', '每站满3颗'], ['已考核', st.quiz.tested], ['考核平均', st.quiz.tested ? `${st.quiz.firstAvg}→${st.quiz.latestAvg}` : '—', '首次→最近']];
  return items.map(([k, v, t]) => `<div class="kpi"><b>${esc(v)}</b><span>${k}${t ? `<small>${t}</small>` : ''}</span></div>`).join('');
}

/** 五站进度：每站 已完成/进行中/未开始（分母=全班），点一站筛选下方明细中未完成者。 */
export function progressChart(st, { stageFilter = null } = {}) {
  const rows = st.stages.map((s, i) => `<button type="button" class="dash-row" data-chart-stage="${s.id}" aria-pressed="${stageFilter === s.id}"><span class="row-label">${i + 1} ${esc(s.short)}</span>${stack([[s.complete, C.done, '已完成'], [s.inProgress, C.prog, '进行中'], [s.notStarted, C.none, '未开始']], st.total, `${s.name}：完成${s.complete}，进行中${s.inProgress}，未开始${s.notStarted}`)}<b>${s.complete}/${st.total}</b></button>`).join('');
  return card('① 五站进度', `分母：本班 ${st.total} 人。点一站，下方明细只看该站未完成的同学。`, st.entered ? `<div class="dash-rows">${rows}</div>` + legend([[C.done, '已完成'], [C.prog, '进行中'], [C.none, '未开始']]) : empty('尚无证据：还没有同学进入'));
}

/** 学习目标掌握：每站“首次解释一致”“迁移首答正确”“最终通过”（分母=该站已提交人数）。 */
export function masteryChart(st) {
  const any = st.stages.some(s => s.evidence.submitted);
  if (!any) return card('② 各站目标：第一次 vs 最终', '分母：该站已提交检验的人数', empty());
  const W = 620, H = 300, pl = 44, pb = 52, pt = 14, iw = W - pl - 10, ih = H - pt - pb, gw = iw / st.stages.length, bw = gw / 4.4;
  const y = v => pt + ih * (1 - v / 100);
  let svg = `<svg viewBox="0 0 ${W} ${H}" class="dash-svg" role="img" aria-label="各站首次解释、迁移首答与最终通过的比例">`;
  for (const v of [0, 50, 100]) svg += `<line x1="${pl}" x2="${W - 10}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${pl - 6}" y="${y(v) + 5}" text-anchor="end" class="tick">${v}%</text>`;
  st.stages.forEach((s, i) => {
    const e = s.evidence, x0 = pl + i * gw + gw * 0.12;
    [[e.explainFirst, C.amber], [e.transferFirst, C.blue2], [e.passed, C.done]].forEach(([n, c], j) => {
      const p = pct(n, e.submitted), x = x0 + j * (bw + 3);
      if (e.submitted) svg += `<rect x="${x}" y="${y(p)}" width="${bw}" height="${ih - (y(p) - pt)}" fill="${c}" rx="3"><title>${n}/${e.submitted}</title></rect><text x="${x + bw / 2}" y="${y(p) - 5}" text-anchor="middle" class="val">${p}</text>`;
    });
    svg += `<text x="${pl + i * gw + gw / 2}" y="${H - pb + 22}" text-anchor="middle" class="lab">${i + 1} ${esc(s.short)}</text><text x="${pl + i * gw + gw / 2}" y="${H - pb + 42}" text-anchor="middle" class="tick">${e.submitted ? 'n=' + e.submitted : '尚无证据'}</text>`;
  });
  return card('② 各站目标：第一次 vs 最终', '分母：该站已提交检验的人数（未提交不计作错误）。数字为百分比。', svg + '</svg>' + legend([[C.amber, '首次解释就与证据一致'], [C.blue2, '迁移题首答正确'], [C.done, '最终通过']]));
}

/** 常见误解：干扰项按误解设计；首次检验选到即计入，可点开看是哪些同学。 */
export function misconceptionChart(st, { selected = null } = {}) {
  const list = st.misconceptions.slice(0, 7);
  if (!list.length) return card('③ 常见误解（首次检验）', '学生选了按误解设计的干扰项时记录', empty());
  const max = Math.max(...list.map(m => m.count));
  const rows = list.map(m => `<button type="button" class="mis-row" data-tag="${esc(m.tag)}" aria-pressed="${selected === m.tag}"><span class="mis-label">${esc(m.label)}</span><span class="mis-bar"><i style="width:${w(m.unresolved, max)}%;background:${C.red}"></i><i style="width:${w(m.count - m.unresolved, max)}%;background:${C.light}"></i></span><b>${m.count}<small>人次</small></b></button>`).join('');
  const sel = st.misconceptions.find(m => m.tag === selected);
  const list2 = arr => { const t = arr.map(x => x.name + '（' + stageName(x.stage) + (x.fromReflect ? '·句块' : '') + '）'); return t.length ? esc(t.slice(0, 14).join('、')) + (t.length > 14 ? ` 等${t.length}人次（见下方明细）` : '') : '无'; };
  const names = sel ? `<div class="mis-names"><b>${esc(sel.label)}</b><p><span class="tagdot" style="background:${C.red}"></span>仍存在：${list2(sel.students.filter(x => !x.resolved))}</p><p><span class="tagdot" style="background:${C.light}"></span>已纠正：${list2(sel.students.filter(x => x.resolved))}</p></div>` : '<p class="note">点一条误解，看是哪些同学（讨论时隐去姓名）。</p>';
  return card('③ 常见误解（首次检验）', '红=还没纠正，浅绿=已纠正（通过且最近提交、句块里不再出现）', `<div class="mis-rows">${rows}</div>${names}`);
}
const STAGE_NAMES = { flow: '第1站', wave: '第2站', life: '第3站', threshold: '第4站', design: '第5站' };
const stageName = id => STAGE_NAMES[id] || id;

/** 预测→结果：先预测，实验后对照；预测不同的同学有没有改变想法。 */
export function predictionChart(st) {
  if (!st.stages.some(s => s.prediction.n)) return card('④ 预测 → 实验后的转变', '分母：该站已留下预测的人数', empty());
  const rows = st.stages.map((s, i) => { const p = s.prediction; return `<div class="dash-row static"><span class="row-label">${i + 1} ${esc(s.short)}</span>${p.n ? stack([[p.correct, C.done, '预测就符合'], [p.revised, C.amber, '预测不同→已修正'], [p.pending, C.red, '预测不同→还没修正']], p.n, `${s.name} 预测转变`) : '<span class="stack"><span class="stack-empty"></span></span>'}<b>${p.n ? `${p.revised}/${p.n - p.correct}` : '—'}</b></div>`; }).join('');
  return card('④ 预测 → 实验后的转变', '分母：该站已留下预测的人数；右侧数字 = 预测不同的同学中已修正的人数', `<div class="dash-rows">${rows}</div>` + legend([[C.done, '预测就符合'], [C.amber, '预测不同→实验后修正'], [C.red, '预测不同→还没修正']]));
}

/** 想法提示：说清楚环节用到第几级（第3级“具体帮助”记为有帮助完成）。 */
export function hintChart(st) {
  if (!st.stages.some(s => s.hints.n)) return card('⑤ 想法提示使用', '分母：已到“说清楚”环节的人数', empty());
  const cs = ['#d9e6ec', '#bfe0d2', '#f7d58a', '#e58f86'];
  const rows = st.stages.map((s, i) => { const h = s.hints; return `<div class="dash-row static"><span class="row-label">${i + 1} ${esc(s.short)}</span>${h.n ? stack(h.levels.map((n, l) => [n, cs[l], ['没用提示', '观察提示', '思路提示', '具体帮助'][l]]), h.n, `${s.name} 提示`) : '<span class="stack"><span class="stack-empty"></span></span>'}<b>${h.n ? 'n=' + h.n : '—'}</b></div>`; }).join('');
  return card('⑤ 想法提示使用', '分母：已到“说清楚”环节的人数；操作提示可直接给，不计入', `<div class="dash-rows">${rows}</div>` + legend([[cs[0], '没用'], [cs[1], '1 观察'], [cs[2], '2 思路'], [cs[3], '3 具体帮助']]));
}

/** 20题考核：分数分布（首次/最近）+ 按目标正确率。 */
export function quizChart(st) {
  const q = st.quiz;
  if (!q.tested) return card('⑥ 20题考核', `已考 0 人，未考 ${q.untested} 人`, empty());
  const W = 330, H = 230, pl = 30, pb = 36, pt = 18, ih = H - pt - pb, max = Math.max(1, ...q.hist.first, ...q.hist.latest), gw = (W - pl - 6) / q.hist.labels.length;
  let svg = `<svg viewBox="0 0 ${W} ${H}" class="dash-svg" role="img" aria-label="考核分数分布">`;
  q.hist.labels.forEach((l, i) => {
    [[q.hist.first[i], C.blue2], [q.hist.latest[i], C.done]].forEach(([n, c], j) => { const h = ih * n / max, x = pl + i * gw + 6 + j * (gw / 2 - 4); svg += `<rect x="${x}" y="${pt + ih - h}" width="${gw / 2 - 6}" height="${h}" fill="${c}" rx="2"/>${n ? `<text x="${x + gw / 4 - 3}" y="${pt + ih - h - 4}" text-anchor="middle" class="val">${n}</text>` : ''}`; });
    svg += `<text x="${pl + i * gw + gw / 2}" y="${H - pb + 20}" text-anchor="middle" class="tick">${l}</text>`;
  });
  svg += `<line x1="${pl}" x2="${W - 4}" y1="${pt + ih}" y2="${pt + ih}" class="axis"/></svg>`;
  const goals = q.goals.map(g => `<div class="goal-row"><span>${esc(g.goal)}</span><span class="mini-bar"><i style="width:${w(g.first.right, g.first.n)}%;background:${C.blue2}"></i></span><span class="mini-bar"><i style="width:${w(g.latest.right, g.latest.n)}%;background:${C.done}"></i></span><b>${pct(g.latest.right, g.latest.n)}%</b></div>`).join('');
  return card('⑥ 20题考核', `已考 ${q.tested} 人，未考 ${q.untested} 人；平均分 首次 ${q.firstAvg} → 最近 ${q.latestAvg}`, `<div class="quiz-split"><div>${svg}<p class="note center">分数分布（人数）</p></div><div class="goal-rows"><p class="note">按目标正确率（分母=被抽到的题数）</p>${goals}</div></div>` + legend([[C.blue2, '首次'], [C.done, '最近']]));
}

/** 实时动态：最近30分钟每分钟的记录、检验与通关。 */
export function timelineChart(st) {
  const t = st.timeline, total = t.minutes.reduce((n, m) => n + m.events, 0);
  const lastTxt = t.last ? '最近一次同步 ' + new Date(t.last).toLocaleTimeString('zh-CN', { hour12: false }) : '还没有同步记录';
  if (!total) return card('⑦ 实时动态（最近30分钟）', lastTxt, empty('尚无证据：最近30分钟没有学习记录'));
  const W = 620, H = 230, pl = 36, pb = 34, pt = 16, ih = H - pt - pb, iw = W - pl - 10, bw = iw / 30, max = Math.max(1, ...t.minutes.map(m => m.events));
  let svg = `<svg viewBox="0 0 ${W} ${H}" class="dash-svg" role="img" aria-label="最近30分钟每分钟的学习记录数">`;
  for (const v of [0, Math.ceil(max / 2), max]) svg += `<line x1="${pl}" x2="${W - 10}" y1="${pt + ih - ih * v / max}" y2="${pt + ih - ih * v / max}" class="grid"/><text x="${pl - 6}" y="${pt + ih - ih * v / max + 5}" text-anchor="end" class="tick">${v}</text>`;
  t.minutes.forEach((m, i) => {
    const x = pl + i * bw, h = ih * m.events / max, hc = ih * m.checks / max;
    svg += `<rect x="${x + 1}" y="${pt + ih - h}" width="${bw - 2}" height="${h}" fill="${C.blue2}"><title>${m.events} 条记录</title></rect><rect x="${x + 1}" y="${pt + ih - hc}" width="${bw - 2}" height="${hc}" fill="${C.prog}"/>`;
    if (m.passes) svg += `<circle cx="${x + bw / 2}" cy="${pt + ih - h - 12}" r="${Math.min(11, 5 + m.passes * 1.5)}" fill="${C.amber}"/><text x="${x + bw / 2}" y="${pt + ih - h - 7}" text-anchor="middle" class="val small">${m.passes}</text>`;
  });
  [[0, '30分钟前'], [10, '20分钟前'], [20, '10分钟前'], [29, '现在']].forEach(([i, l]) => { svg += `<text x="${pl + i * bw + bw / 2}" y="${H - 10}" text-anchor="middle" class="tick">${l}</text>`; });
  return card('⑦ 实时动态（最近30分钟）', `${lastTxt}；30分钟内 ${total} 条记录`, svg + '</svg>' + legend([[C.blue2, '操作与作答记录'], [C.prog, '其中提交检验'], [C.amber, '通过一站（数字=人数）']]));
}

/** 第4站：同学们试过的阈值（气泡大小=人数），与规则得出的提示次数曲线对照。 */
export function thresholdChart(st, R) {
  if (!st.thresholds.length) return card('⑧ 第4站：大家把阈值放在哪里', '每个气泡=一种阈值，越大表示越多同学试过', empty());
  const W = 620, H = 260, pl = 40, pb = 40, pt = 14, iw = W - pl - 14, ih = H - pt - pb, x = v => pl + (v - 30) / 60 * iw, ymax = 8, y = v => pt + ih * (1 - v / ymax);
  let svg = `<svg viewBox="0 0 ${W} ${H}" class="dash-svg" role="img" aria-label="阈值与提示次数气泡图">`;
  for (const v of [0, 2, 4, 6, 8]) svg += `<line x1="${pl}" x2="${W - 14}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${pl - 6}" y="${y(v) + 5}" text-anchor="end" class="tick">${v}</text>`;
  for (const v of [30, 40, 50, 55, 60, 70, 80, 90]) svg += `<text x="${x(v)}" y="${H - pb + 20}" text-anchor="middle" class="tick">${v}</text>`;
  if (R?.countAlarms) svg += `<path d="${Array.from({ length: 61 }, (_, i) => 30 + i).map((t, i) => (i ? 'L' : 'M') + x(t).toFixed(1) + ' ' + y(R.countAlarms(t)).toFixed(1)).join(' ')}" fill="none" stroke="#b9c8cf" stroke-width="2" stroke-dasharray="5 4"/>`;
  svg += `<line x1="${x(55)}" x2="${x(55)}" y1="${pt}" y2="${pt + ih}" stroke="${C.red}" stroke-width="2" stroke-dasharray="6 4"/><text x="${x(55) + 6}" y="${pt + 14}" class="tick" fill="${C.red}">小区标准55</text>`;
  const max = Math.max(...st.thresholds.map(t => t.n));
  for (const t of st.thresholds) { const r = 6 + 14 * Math.sqrt(t.n / max); svg += `<circle cx="${x(Math.min(90, Math.max(30, t.threshold)))}" cy="${y(Math.min(ymax, t.alarms))}" r="${r.toFixed(1)}" fill="${t.threshold === 55 ? C.red : t.threshold < 55 ? C.prog : C.done}" fill-opacity=".72" stroke="#fff"><title>阈值${t.threshold} dB → ${t.alarms}次提示：${t.n}人</title></circle>${t.n > 1 ? `<text x="${x(t.threshold)}" y="${y(t.alarms) + 5}" text-anchor="middle" class="val small light">${t.n}</text>` : ''}`; }
  svg += `<text x="${W - 14}" y="${H - 6}" text-anchor="end" class="axis-label">阈值（dB）</text><text x="${pl}" y="${pt - 2}" class="axis-label">提示次数</text></svg>`;
  const lower = st.thresholds.filter(t => t.threshold < 55).reduce((n, t) => n + t.n, 0), higher = st.thresholds.filter(t => t.threshold > 55).reduce((n, t) => n + t.n, 0);
  return card('⑧ 第4站：大家把阈值放在哪里', `气泡大小=试过该阈值的人数；虚线=同一晚数据按规则得出的提示次数。调低 ${lower} 人次，调高 ${higher} 人次`, svg);
}

/** 第5站：湿度方案的阈值与4天湿度范围（竖线=最低到最高；绿=保持在30%—70%）。同一阈值合并，数字=人数。 */
export function gardenChart(st) {
  if (!st.garden.length) return card('⑨ 第5站：浇水方案', '每条竖线=同学们试过的一个“土壤湿度·降到阈值就浇水”方案', empty());
  const W = 620, H = 260, pl = 40, pb = 40, pt = 18, iw = W - pl - 14, ih = H - pt - pb, x = v => pl + v / 100 * iw, y = v => pt + ih * (1 - v / 100);
  const by = new Map(); for (const g of st.garden) { const r = by.get(g.threshold) || { ...g, n: 0, names: [] }; r.n++; r.names.push(g.name); by.set(g.threshold, r); }
  let svg = `<svg viewBox="0 0 ${W} ${H}" class="dash-svg" role="img" aria-label="浇水阈值与4天湿度范围"><rect x="${pl}" y="${y(70)}" width="${iw}" height="${y(30) - y(70)}" fill="#e3f4ea"/>`;
  for (const v of [0, 30, 70, 100]) svg += `<line x1="${pl}" x2="${W - 14}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${pl - 6}" y="${y(v) + 5}" text-anchor="end" class="tick">${v}</text>`;
  for (const v of [0, 20, 30, 45, 60, 80, 100]) svg += `<text x="${x(v)}" y="${H - pb + 20}" text-anchor="middle" class="tick">${v}</text>`;
  for (const g of by.values()) {
    const c = g.fit ? C.done : C.red, cx = x(g.threshold);
    svg += `<g><title>阈值${g.threshold}%：湿度${g.min}%—${g.max}%（${g.n}人：${esc(g.names.join('、'))}）</title><line x1="${cx}" x2="${cx}" y1="${y(Math.min(100, g.max))}" y2="${y(Math.max(0, g.min))}" stroke="${c}" stroke-width="7" stroke-linecap="round" opacity=".8"/><text x="${cx}" y="${y(Math.min(100, g.max)) - 8}" text-anchor="middle" class="val small">${g.n}</text></g>`;
  }
  svg += `<text x="${W - 14}" y="${H - 6}" text-anchor="end" class="axis-label">开水泵的阈值（%）</text><text x="${pl}" y="${pt - 6}" class="axis-label">4天里的湿度范围（%）</text></svg>`;
  const fit = st.garden.filter(g => g.fit).length;
  return card('⑨ 第5站：浇水方案', `竖线=4天最低到最高湿度，浅绿带=适宜30%—70%，线上数字=人数。合适 ${fit} 次，不合适 ${st.garden.length - fit} 次`, svg);
}

/** 一次生成全部图表卡片（键名对应 teacher.html 里的卡片）。 */
export function renderClassCharts(st, { stageFilter = null, misTag = null, R = globalThis.LessonRules } = {}) {
  return {
    kpi: kpiHtml(st), progress: progressChart(st, { stageFilter }), mastery: masteryChart(st), mis: misconceptionChart(st, { selected: misTag }),
    pred: predictionChart(st), hint: hintChart(st), quiz: quizChart(st), timeline: timelineChart(st), threshold: thresholdChart(st, R), garden: gardenChart(st)
  };
}
