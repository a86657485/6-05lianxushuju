import { api, download, escape } from './sync.mjs?v=1';
import { Microphone } from './microphone.mjs?v=1';
import { TeacherMicrophoneBridge } from './microphone-bridge.mjs?v=1';
import { summarizeClass, commonErrors } from './teacher-stats.mjs?v=1';
import { renderClassCharts } from './teacher-charts.mjs?v=1';
import { makeScale, pathOf, axes, svgOpen } from './charts.mjs?v=1';

const $ = id => document.getElementById(id), R = window.LessonRules;
let data = null, stats = null, goals = [], selected = null, chartStatus = null, chartStage = null, request = 0;
for (let c = 601; c <= 606; c++) $('teacher-class').add(new Option(c + '班', String(c)));
const time = v => v ? new Date(v).toLocaleTimeString('zh-CN', { hour12: false }) : '未进入';
const done = (s, id) => (s.awards || []).some(a => a.stage === id);
function phase(s, id) { if (done(s, id)) return '✓ 完成'; const r = s.records?.[id]; if (r?.lastSubmitted && !r.lastSubmitted.assessment?.pass) return '需修订'; return r?.first || r?.latest ? '进行中' : '—'; }
function current(s) { if (!s.updated) return '未进入'; const next = R.stages.find(t => !done(s, t.id)); return next ? next.short : '主线完成'; }
const actions = {
  flow: '选一份匿名错例，问：“声音采集装置”和“62.4 dB”，哪个会随声音变化？再让学生换一种声音核对。',
  wave: '让学生在两个散点之间再点一次读数，说说那一刻声音“停”了没有。',
  life: '追问：“班级人数能不能是32.5人？”“窗帘拉到一半时光照是多少？”再改分类。',
  threshold: '在曲线上分别指出“采集到的数据”和“阈值线”，再比较两个阈值的提示次数。',
  design: '并排比较两次运行的最低/最高湿度与浇水次数，问：阈值调高后为什么更早浇水？'
};

async function refresh() {
  const classId = $('teacher-class').value, n = ++request;
  if (data?.classId !== classId) { data = null; stats = null; clearView(); $('class-status').textContent = classId + '班数据加载中…'; }
  try {
    if (!goals.length) goals = (await api('/api/teacher/answers')).goals;
    const incoming = await api('/api/teacher/class?class=' + classId);
    if (n !== request || classId !== $('teacher-class').value) return;
    stats = summarizeClass(incoming, R.stages, goals); data = incoming;
    $('class-status').textContent = `已更新 ${time(incoming.at)} · ${incoming.round} · 每5秒自动刷新`; $('class-status').className = 'note';
    render();
  } catch (e) {
    if (n !== request) return;
    $('class-status').textContent = '数据未更新：' + e.message + (data ? '（下方仍是 ' + time(data.at) + ' 的旧数据）' : ''); $('class-status').className = 'note warning';
  }
}
function clearView() { for (const id of ['summary', 'status-chart', 'stage-chart', 'evidence-chart', 'quiz-chart', 'diagnosis', 'student-rows']) $(id).innerHTML = ''; $('student-detail').hidden = true; }
function render() {
  const ss = data.students, st = stats;
  $('summary').innerHTML = [['名单人数', st.total], ['已进入', st.entered], ['未进入', st.status.notEntered], ['完成主线', st.status.complete], ['已考核', st.quiz.tested]].map(([k, v]) => `<div><b>${v}</b><span>${k}</span></div>`).join('');
  const charts = renderClassCharts(st, { statusFilter: chartStatus, stageFilter: chartStage });
  $('status-chart').innerHTML = charts.statusHtml; $('stage-chart').innerHTML = charts.stageHtml; $('evidence-chart').innerHTML = charts.evidenceHtml; $('quiz-chart').innerHTML = charts.quizHtml;
  document.querySelectorAll('[data-chart-status]').forEach(b => b.onclick = () => { chartStatus = chartStatus === b.dataset.chartStatus ? null : b.dataset.chartStatus; render(); });
  document.querySelectorAll('[data-chart-stage]').forEach(b => b.onclick = () => { chartStage = chartStage === b.dataset.chartStage ? null : b.dataset.chartStage; render(); });
  const q = $('teacher-search').value.trim(), unfinished = $('unfinished').checked;
  const status = s => !s.updated ? 'notEntered' : R.stages.every(t => done(s, t.id)) ? 'complete' : 'inProgress';
  let rows = ss.filter(s => (!q || s.student.name.includes(q)) && (!unfinished || !R.stages.every(t => done(s, t.id))));
  if (chartStatus) rows = rows.filter(s => status(s) === chartStatus);
  if (chartStage) rows = rows.filter(s => !done(s, chartStage));
  $('chart-filter').innerHTML = (chartStatus || chartStage ? `明细筛选：${chartStatus ? { notEntered: '未进入', inProgress: '进行中', complete: '完成主线' }[chartStatus] : ''}${chartStage ? '「' + R.stages.find(t => t.id === chartStage).short + '」未完成' : ''} · <button id="clear-filter" class="subtle">清除图表筛选</button>` : '') + (q ? ` 姓名搜索“${escape(q)}”只影响明细，上方图表仍为全班。` : '');
  $('clear-filter')?.addEventListener('click', () => { chartStatus = null; chartStage = null; render(); });
  $('student-rows').innerHTML = rows.map(s => `<tr><td>${escape(s.student.name)}${s.student.manual ? ' <small>手动</small>' : ''}</td><td>${current(s)}</td>${R.stages.map(t => `<td class="phase">${phase(s, t.id)}</td>`).join('')}<td>${(s.awards || []).length}/5</td><td>${s.points || 0}</td><td>${s.quizAttempts?.[0]?.score ?? '未考'} / ${s.quizAttempts?.at(-1)?.score ?? '未考'}</td><td>${time(s.updated)}</td><td><button data-student="${escape(s.student.id)}">查看证据</button></td></tr>`).join('') || '<tr><td colspan="12">没有符合条件的学生。</td></tr>';
  $('student-rows').querySelectorAll('[data-student]').forEach(b => b.onclick = () => { selected = b.dataset.student; detail(); });
  if (selected) detail();
  $('diagnosis').innerHTML = '<h2>看到证据，再决定怎样支持</h2>' + R.stages.map(t => {
    const row = st.stages.find(x => x.id === t.id), top = commonErrors(ss, t.id);
    return `<p><b>${t.name}</b> · 已提交 ${row.assessment.submitted}，未提交 ${row.assessment.unanswered}；首次符合 ${row.assessment.firstPassed}/${row.assessment.submitted}，最近符合 ${row.assessment.latestPassed}/${row.assessment.submitted}。${row.assessment.submitted ? top.length ? '最近提交中的常见卡点：' + top.map(([e, c]) => escape(e) + '（' + c + '人）').join('；') + '。<br><span class="note">建议：' + actions[t.id] + '</span>' : '已提交记录暂无共同卡点。' : '尚无证据。'}</p>`;
  }).join('') + '<p class="note">未提交不计为错误；积分只说明完成了哪些关卡，理解看解释与迁移证据。讨论错例时隐去姓名。</p>';
}
function detail() {
  const s = data?.students.find(x => x.student.id === selected); if (!s) return;
  $('student-detail').hidden = false;
  const label = (st, rec) => !rec ? '尚无证据' : rec.assessment?.pass ? '符合目标' : '需修订：' + escape((rec.assessment?.errors || []).filter(e => e !== '请提交本次解释后再检验').join('；'));
  $('student-detail').innerHTML = `<h2>${escape(s.student.name)} 的过程证据</h2><p>${s.student.classId}班 · ${data.round} · ${s.points || 0} 通关积分 · 旧轮次 ${s.roundHistory?.length || 0} 份</p>` +
    R.stages.map(t => { const v = s.records?.[t.id] || {}; return `<details><summary>${t.name} · ${phase(s, t.id)}</summary><p>首次预测：${escape(v.first?.prediction || '尚无证据')}；首次提交：${label(t.id, v.firstSubmitted)}；最近提交：${label(t.id, v.lastSubmitted)}；提示 ${v.latest?.hints || 0} 次；实验记录 ${v.latest?.trials?.length || 0} 条。</p><pre>${escape(JSON.stringify({ 最近: v.latest ? { ...v.latest, lastTrace: undefined } : null }, null, 1))}</pre></details>`; }).join('') +
    `<details><summary>考核：首次与最近</summary><p>首次 ${s.quizAttempts?.[0]?.score ?? '未考'}，最近 ${s.quizAttempts?.at(-1)?.score ?? '未考'}；共 ${s.quizAttempts?.length || 0} 次。</p>${(s.quizAttempts || []).map((a, i) => `<p>第${i + 1}次 ${a.score}分：${Object.entries(a.byGoal || {}).map(([g, v]) => escape(g) + ' ' + v.right + '/' + v.total).join('，')}</p>`).join('')}</details><button id="detail-close">收起详情</button>`;
  $('detail-close').onclick = () => { selected = null; $('student-detail').hidden = true; };
}
$('teacher-class').onchange = () => { selected = null; chartStatus = null; chartStage = null; $('student-detail').hidden = true; refresh(); };
$('teacher-search').oninput = () => data && render(); $('unfinished').onchange = () => data && render();
$('class-export').onclick = () => data && download('第5课-' + data.classId + '-' + data.round + '.json', data);
$('new-round').onclick = async () => {
  if (!data || !confirm('为' + data.classId + '班开启新轮次？旧轮次记录会保留，本轮进度和积分重新开始。')) return;
  try { await api('/api/teacher/new-round', { classId: data.classId }); await refresh(); } catch (e) { $('class-status').textContent = e.message; }
};

/* ---------- 现场噪声监测：相对响度 + 阈值 ---------- */
let level = 0, active = false, sampleAt = 0, trace = [], alarm = false, alarmCount = 0, sharing = false, bridge = null;
const callbacks = { onSample: s => { level = Math.round(s.level * 1000) / 10; sampleAt = Date.now(); }, onStatus: s => { active = s.state === 'listening'; if (!active) level = 0; $('mic-status').textContent = s.message; share(); } };
const mic = new Microphone(callbacks);
$('mic-start').onclick = () => { alarmCount = 0; trace = []; bridge ? bridge.start() : mic.start(); };
$('mic-stop').onclick = () => { bridge ? bridge.stop() : mic.stop(); active = false; level = 0; share(); };
$('mic-calibrate').onclick = () => bridge ? bridge.calibrate() : mic.calibrate();
$('live-th').oninput = () => { $('live-th-val').textContent = $('live-th').value; drawLive(); share(); };
function drawLive() {
  const th = Number($('live-th').value), s = makeScale({ width: 640, height: 200, xMin: 0, xMax: 30, yMin: 0, yMax: 100 });
  const now = Date.now(), pts = trace.filter(p => now - p[0] <= 30000).map(p => [30 - (now - p[0]) / 1000, p[1]]);
  $('live-chart').innerHTML = svgOpen(s, '教室相对响度曲线') + axes(s, { xTicks: [[0, '30秒前'], [30, '现在']], yTicks: [0, 25, 50, 75, 100], yLabel: '相对响度（不是分贝）' }) + `<rect x="${s.pad.l}" y="${s.pad.t}" width="${s.iw}" height="${s.y(th) - s.pad.t}" class="over-zone"/>` + (pts.length > 1 ? `<path d="${pathOf(pts, s)}" class="curve"/>` : '') + `<line x1="${s.pad.l}" x2="${s.width - s.pad.r}" y1="${s.y(th)}" y2="${s.y(th)}" class="threshold-line"/></svg>`;
}
setInterval(() => {
  if (Date.now() - sampleAt > 1000) level = 0;
  const th = Number($('live-th').value);
  if (active) { trace.push([Date.now(), level]); trace = trace.filter(p => Date.now() - p[0] <= 31000); }
  const over = active && level > th;
  if (over && !alarm) alarmCount++;
  alarm = over;
  $('live-lamp').classList.toggle('on', alarm);
  $('live-level').textContent = active ? `相对响度 ${level.toFixed(0)} ${alarm ? '> 阈值，提示！' : '≤ 阈值'}` : '未采声';
  $('live-count').textContent = `本次提示 ${alarmCount} 次`;
  drawLive();
}, 100);
async function share() {
  if (sharing) return; sharing = true;
  try { await api('/api/teacher/live', { level: active ? level : 0, threshold: Number($('live-th').value), alarm, active, alarmCount }); $('live-sync').textContent = (active ? '现场数据正在共享给学生（第2关“观察教师现场”）' : '当前没有采声') + ' · ' + time(new Date()); }
  catch (e) { $('live-sync').textContent = '现场数据未同步：' + e.message; }
  finally { sharing = false; }
}
setInterval(() => { if (active) share(); }, 300);
window.addEventListener('pagehide', () => { bridge?.stop(); mic.stop(); });

async function boot() {
  if (!window.isSecureContext) { const c = await api('/api/teacher/microphone-context'); bridge = new TeacherMicrophoneBridge({ microphoneUrl: c.microphoneUrl, ...callbacks }); }
  await refresh(); drawLive(); setInterval(refresh, 5000);
}
boot().catch(e => { $('class-status').textContent = '教师大屏打开失败：' + e.message; });
