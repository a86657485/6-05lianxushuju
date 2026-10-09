const rate = (n, t) => t ? Math.round(n / t * 100) : 0;
const share = (n, t) => t ? (n / t * 100).toFixed(2) : 0;
const esc = s => String(s ?? '').replace(/[&<>"']/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[x]));
export function renderClassCharts(summary, { statusFilter = null, stageFilter = null } = {}) {
  const { total, status, stages, quiz } = summary;
  const states = [['notEntered', '未进入', '#aabdc5'], ['inProgress', '进行中', '#2b8298'], ['complete', '完成主线', '#248477']];
  const statusHtml = `<h2>全班学习状态</h2><p class="chart-subtitle">${summary.classId}班 · ${esc(summary.round)} · 共 ${total} 人（含手动加入）</p>
    <div class="status-track" role="img" aria-label="${states.map(([k, l]) => `${l}${status[k]}人`).join('，')}">${total ? states.map(([k, , c]) => `<span style="width:${share(status[k], total)}%;background:${c}"></span>`).join('') : '<span class="empty-track"></span>'}</div>
    <div class="status-legend">${states.map(([k, l]) => `<button type="button" class="legend-item" data-chart-status="${k}" aria-pressed="${statusFilter === k}"><i class="legend-dot legend-${k}"></i><span>${l}</span><b>${status[k]} 人 · ${rate(status[k], total)}%</b></button>`).join('')}</div>`;
  const stageHtml = `<h2>五关完成情况（必做）</h2><p class="chart-subtitle">分母为本班 ${total} 人；点击一关查看未完成者</p>
    <div class="chart-rows">${stages.map((st, i) => `<button type="button" class="stage-chart-row" data-chart-stage="${st.id}" aria-pressed="${stageFilter === st.id}"><span class="row-label">${i + 1} ${esc(st.short)}</span><span class="chart-bar"><i style="width:${rate(st.complete, total)}%"></i></span><b>${st.complete}/${total} · ${rate(st.complete, total)}%</b></button>`).join('')}</div>`;
  const evidenceHtml = `<h2>提交解释后的目标表现</h2><p class="chart-subtitle">首次与最近都以本关已正式提交人数为分母；未提交单列，不计作错误。</p><div class="evidence-grid">${stages.map(st => {
    const { submitted, firstPassed, latestPassed, unanswered } = st.assessment;
    return `<div class="evidence-item"><h3>${esc(st.name)}</h3><p>已提交 ${submitted}/${total} · 未提交 ${unanswered}</p>${submitted ? `<div class="evidence-measure"><span>首次符合</span><div class="chart-bar first"><i style="width:${rate(firstPassed, submitted)}%"></i></div><b>${firstPassed}/${submitted}</b></div><div class="evidence-measure"><span>最近符合</span><div class="chart-bar recent"><i style="width:${rate(latestPassed, submitted)}%"></i></div><b>${latestPassed}/${submitted}</b></div>` : '<p class="no-evidence">尚无证据</p>'}</div>`;
  }).join('')}</div>`;
  const quizHtml = `<h2>20题考核 · 按目标正确率</h2><p class="chart-subtitle">已考 ${quiz.tested} 人，未考 ${quiz.untested} 人；分母为已考学生在该目标上被抽到的题数。${quiz.tested ? `平均分：首次 ${quiz.firstAvg}，最近 ${quiz.latestAvg}。` : ''}</p>${quiz.tested ? `<div class="evidence-grid">${quiz.goals.map(g => `<div class="evidence-item"><h3>${esc(g.goal)}</h3><div class="evidence-measure"><span>首次</span><div class="chart-bar first"><i style="width:${rate(g.first.right, g.first.n)}%"></i></div><b>${g.first.right}/${g.first.n}</b></div><div class="evidence-measure"><span>最近</span><div class="chart-bar recent"><i style="width:${rate(g.latest.right, g.latest.n)}%"></i></div><b>${g.latest.right}/${g.latest.n}</b></div></div>`).join('')}</div>` : '<p class="no-evidence">尚无证据</p>'}`;
  return { statusHtml, stageHtml, evidenceHtml, quizHtml };
}
