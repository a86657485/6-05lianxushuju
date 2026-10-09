/* 学生端：班级姓名登录 → 五关（先想一想 → 做实验 → 说清楚）→ 20题考核 → 考后挑战。 */
import { ClassroomSync, api, escape } from './sync.mjs?v=1';
import { activities, sceneObservations } from './activities.mjs?v=1';
import { experimentClasses } from './experiments.mjs?v=1';
import { learningProgress, nextExperimentAction, explainTarget, explainKeys } from './journey.mjs?v=1';
import { QuizView } from './quiz.mjs?v=1';
import { Microphone } from './microphone.mjs?v=1';
import { renderStageReference, renderExamReference } from './teacher-guide.mjs?v=1';
import { RewardChallenge } from './reward.mjs?v=1';
import { welcomeArt, xiaodiSvg } from './art.mjs?v=1';

const $ = id => document.getElementById(id);
const R = window.LessonRules;
const mode = location.pathname === '/test' ? 'test' : location.pathname === '/demo' ? 'demo' : 'student';
const local = mode !== 'student';
const STEPS = [['predict', '先想一想'], ['experiment', '做实验'], ['explain', '说清楚']];
let state = null, drafts = {}, stage = 'flow', learningStep = 'predict', experiment = null, activeNode = 'input';
let guideActive = false, hintLevel = {}, reviewed = {}, quiz = null, reward = null, live = null, liveAt = 0, liveTimer = null, mic = null, micLevel = null, storyOpen = false;

const sync = new ClassroomSync((message, pending) => { $('sync-status').textContent = message; $('sync-status').className = pending ? 'warning' : ''; },
  s => { state = s; refreshNav(); });

function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => $('toast').hidden = true, 3500); }
function storage() { return local ? sessionStorage : localStorage; }
function draftKey() { return 'lesson5-drafts:' + state.student.id + ':' + state.round; }
function emptyTransfer(st) { return activities[st].transfer.type === 'cases' ? {} : ''; }
function draft(st = stage) {
  const r = drafts[st] ||= {};
  r.prediction ||= ''; r.trials = Array.isArray(r.trials) ? r.trials : []; r.explain = r.explain && typeof r.explain === 'object' ? r.explain : {};
  if (r.transfer === undefined || (activities[st].transfer.type === 'cases') !== (typeof r.transfer === 'object')) r.transfer = emptyTransfer(st);
  r.hints ||= 0; r.submitted = r.submitted === true; return r;
}
function persist(send = true) {
  const d = draft(); d.editedAt = Date.now();
  try { storage().setItem(draftKey(), JSON.stringify(drafts)); if (local) storage().setItem('lesson5-local-state:' + mode, JSON.stringify(state)); } catch { toast('本机存储不足，请告诉老师'); }
  if (send && mode === 'student') sync.enqueue(stage, d);
}
const awarded = st => (state?.awards || []).some(a => a.stage === st);
const passedNow = st => { const d = drafts[st]; return !!d && d.submitted === true && R.assess(st, d).pass; };
const unlocked = st => { const i = R.stageIds.indexOf(st); return mode === 'test' || i === 0 || awarded(R.stageIds[i - 1]) || passedNow(R.stageIds[i - 1]); };

/* ---------- 登录 ---------- */
async function loadClasses() {
  for (let c = 601; c <= 606; c++) $('class').add(new Option(c + '班', String(c)));
  $('welcome-art').innerHTML = welcomeArt();
  document.querySelectorAll('.xiaodi').forEach(el => el.innerHTML = xiaodiSvg(64));
}
let roster = [];
async function loadRoster() {
  const c = $('class').value; $('name').innerHTML = '<option value="">' + (c ? '加载中…' : '请先选班级') + '</option>'; roster = [];
  if (!c) return;
  try { roster = await api('/api/roster?class=' + c); renderNames(); } catch (e) { $('login-error').textContent = e.message; }
}
function renderNames() {
  const q = $('search').value.trim();
  const list = roster.filter(s => !q || s.name.includes(q));
  $('name').innerHTML = '<option value="">' + (list.length ? '请选择姓名（' + list.length + '人）' : '没有找到，可勾选“名单里没有我”') + '</option>' + list.map(s => `<option value="${escape(s.id)}">${escape(s.name)}${s.manual ? '（手动加入）' : ''}</option>`).join('');
  if (list.length === 1) $('name').value = list[0].id;
  confirmText();
}
function confirmText() {
  const c = $('class').value, manual = $('manual').checked;
  const name = manual ? $('manual-name').value.trim() : roster.find(s => s.id === $('name').value)?.name;
  $('identity-confirm').textContent = c && name ? `请确认：${c}班 · ${name}。这是课堂选名，不是密码账户。` : '班级和姓名用于保存你的学习记录（课堂选名，不是密码账户）。';
}
async function login(body) {
  $('login-error').textContent = ''; $('same-name').hidden = true;
  try { enter(await api('/api/login', body)); }
  catch (e) {
    if (e.status === 409 && e.data?.choices) {
      $('same-name').hidden = false;
      $('same-name').innerHTML = '<p>这个班已经有同名记录。请确认是不是你：</p>' + e.data.choices.map(c => `<button type="button" data-id="${escape(c.id)}">是我：${escape(c.name)}${c.manual ? '（之前手动加入）' : '（名单）'}</button>`).join('') + '<p class="note">如果不是你，请在姓名后加上区分字（如“张三2”）再提交。</p>';
      $('same-name').querySelectorAll('button').forEach(b => b.onclick = () => login({ classId: body.classId, id: b.dataset.id }));
    } else $('login-error').textContent = e.message;
  }
}
$('class').onchange = loadRoster; $('search').oninput = renderNames; $('name').onchange = confirmText; $('manual-name').oninput = confirmText;
$('manual').onchange = () => { $('manual-box').hidden = !$('manual').checked; $('name').disabled = $('manual').checked; confirmText(); };
$('login-form').onsubmit = e => {
  e.preventDefault();
  const classId = $('class').value; if (!classId) { $('login-error').textContent = '请先选择班级'; return; }
  if ($('manual').checked) { const name = $('manual-name').value.trim(); if (!name) { $('login-error').textContent = '请填写姓名'; return; } login({ classId, name }); }
  else { if (!$('name').value) { $('login-error').textContent = '请选择姓名，或勾选“名单里没有我”'; return; } login({ classId, id: $('name').value }); }
};
$('switch').onclick = async () => {
  if (sync.pending()) await sync.flush();
  if (sync.pending() && !confirm('还有 ' + sync.pending() + ' 条记录没有同步到老师那里，它们会留在这台电脑上，下次登录同一身份时补传。确定切换吗？')) return;
  if (!sync.pending() && !confirm('切换学生前已保存当前记录。确定切换吗？')) return;
  try { await api('/api/logout', {}); } catch {}
  experiment?.destroy(); experiment = null; sync.detach(); state = null; drafts = {};
  $('learning').hidden = true; $('login').hidden = false; $('switch').hidden = true; $('identity').textContent = '';
};

function mergeServerRecords() {
  for (const st of R.stageIds) {
    const server = state.records?.[st]?.latest;
    if (!server) continue;
    const mine = drafts[st];
    if (!mine || (Number(server.editedAt) || 0) > (Number(mine.editedAt) || 0)) {
      const { assessment, eventId, created, ...rest } = server; drafts[st] = rest;
    }
  }
}
function enter(s) {
  state = s;
  try { drafts = JSON.parse(storage().getItem(draftKey()) || '{}'); } catch { drafts = {}; }
  if (!local) { mergeServerRecords(); sync.attach(state); }
  $('login').hidden = true; $('learning').hidden = false;
  $('identity').textContent = local ? (mode === 'test' ? '教师测试 · 虚构观察员' : '演示 · 不保存') : `${s.student.classId}班 · ${s.student.name}`;
  $('switch').hidden = local; $('test-tools').hidden = mode !== 'test'; $('demo-bar').hidden = mode !== 'demo';
  stage = R.stageIds.find(st => !awarded(st) && unlocked(st)) || R.stageIds.at(-1);
  if (R.stageIds.every(awarded) && !local) return showEnd();
  showStage(stage);
}

/* ---------- 关卡导航 ---------- */
function refreshNav() {
  if (!state) return;
  const nav = R.stages.map((s, i) => {
    const done = awarded(s.id) || (local && passedNow(s.id));
    return `<button data-stage="${s.id}" class="${s.id === stage && !$('stage-page').hidden ? 'active' : ''} ${done ? 'done' : ''}" ${unlocked(s.id) ? '' : 'disabled title="先完成上一关"'}>${i + 1} ${s.short}</button>`;
  }).join('') + `<button data-quiz class="${!$('quiz-page').hidden ? 'active' : ''}">20题考核</button>`;
  $('stages').innerHTML = nav;
  $('stages').querySelectorAll('[data-stage]').forEach(b => b.onclick = () => showStage(b.dataset.stage));
  $('stages').querySelector('[data-quiz]').onclick = showQuiz;
  $('points').textContent = (state.points || 0) + ' 积分';
}
function showPage(id) { for (const p of ['stage-page', 'quiz-page', 'end-page']) $(p).hidden = p !== id; if (id !== 'quiz-page') { quiz?.close(); } refreshNav(); }

/* ---------- 实验上下文：实验台通过它写记录 ---------- */
const ctx = {
  mode,
  record: () => draft(),
  addTrial(trial, extra = {}) {
    const d = draft();
    d.trials.push(trial);
    while (d.trials.length > 40) {
      const before = R.experimentChecks(stage, d).map(c => c.complete).join();
      const idx = d.trials.findIndex((_, i) => R.experimentChecks(stage, { ...d, trials: d.trials.filter((__, j) => j !== i) }).map(c => c.complete).join() === before);
      d.trials.splice(idx >= 0 ? idx : 0, 1);
    }
    Object.assign(d, extra);
    if (extra.design) { d.submitted = false; reviewed[stage] = false; }
    persist(); renderJourney(); refreshGuide(); renderTrials();
  },
  say(text) { $('say').textContent = text; },
  refresh() { refreshGuide(); },
  live: () => live,
  liveFresh: () => !!live && live.active && Date.now() - liveAt < 2500,
  watchLive(on) {
    clearInterval(liveTimer); liveTimer = null;
    if (on) liveTimer = setInterval(async () => { try { live = await api('/api/live'); liveAt = Date.now(); if (!live.at || live.serverNow - Date.parse(live.at) > 3000) live.active = false; } catch { live = null; } }, 400);
  },
  startMic(status) {
    mic ||= new Microphone({ onSample: s => { micLevel = s.level; }, onStatus: s => { if (s.state !== 'listening') micLevel = s.state === 'stopped' || s.state === 'error' ? null : micLevel; status(s.message); refreshGuide(); } });
    micLevel = null; mic.start();
  },
  stopMic() { mic?.stop(); micLevel = null; },
  micLevel: () => micLevel
};

/* ---------- 关卡页面 ---------- */
function showStage(st) {
  if (!unlocked(st)) return;
  stage = st; const a = activities[st], d = draft();
  showPage('stage-page'); window.scrollTo({ top: 0 });
  $('chapter').textContent = a.chapter; $('stage-title').textContent = a.title; $('stage-goal').textContent = a.goal;
  $('story-text').textContent = a.story; $('scene-observation').textContent = sceneObservations[st]; $('scene-note').textContent = a.note;
  $('say').textContent = ''; $('feedback').textContent = ''; $('feedback').className = 'feedback'; $('hint-text').textContent = ''; guideActive = false;
  $('test-answer-panel').hidden = true;
  experiment?.destroy(); experiment = new experimentClasses[st](ctx); experiment.mount($('scene'), $('controls'));
  const p = learningProgress(st, d, R);
  learningStep = p.initialStep; storyOpen = learningStep === 'predict';
  activeNode = (a.explain.nodes || []).map(n => n[0]).find(k => !d.explain[k]) || 'input';
  renderPrediction(); renderExplain(); renderTrials(); renderJourney(); refreshGuide();
}
function renderPrediction() {
  const a = activities[stage], d = draft();
  $('prediction-panel').innerHTML = `<h3>${escape(a.question)}</h3><div class="choice-row">${a.predict.map(([v, label]) => `<button data-predict="${v}" aria-pressed="${d.prediction === v}" ${d.prediction && d.prediction !== v ? 'disabled' : ''}>${escape(label)}</button>`).join('')}</div>${d.prediction ? '<p class="note">首次预测已保留。猜错没关系，实验会告诉你答案。</p>' : '<p class="note">凭你现在的想法选一个，不扣分。</p>'}`;
  $('prediction-panel').querySelectorAll('[data-predict]').forEach(b => b.onclick = () => {
    const dd = draft(); if (dd.prediction) return;
    dd.prediction = b.dataset.predict; persist(); learningStep = 'experiment'; storyOpen = false; renderPrediction(); renderJourney(); refreshGuide();
  });
}
function renderJourney() {
  const d = draft(), p = learningProgress(stage, d, R), passed = d.submitted && R.assess(stage, d).pass;
  $('learning-steps').innerHTML = STEPS.map(([id, label], i) => `<button data-step="${id}" aria-current="${learningStep === id ? 'step' : 'false'}" ${id === 'experiment' && !d.prediction || id === 'explain' && !p.experimentDone ? 'disabled' : ''}><span>${i + 1}</span>${label}</button>`).join('');
  $('learning-steps').querySelectorAll('button').forEach(b => b.onclick = () => setStep(b.dataset.step));
  $('step-label').textContent = '第 ' + (STEPS.findIndex(s => s[0] === learningStep) + 1) + ' 步 / 3';
  $('step-title').textContent = { predict: '先选一个预测', experiment: '动手做实验', explain: activities[stage].explainTitle }[learningStep];
  $('step-instruction').textContent = { predict: d.prediction ? '这是你最初的预测，已经保留。点击下方按钮回到实验。' : '选好后，页面会带你开始实验。', experiment: '按左侧蓝框提示操作，结果会自动保存。两项都打勾后进入下一步。', explain: '根据刚才的实验作出判断，再试一个新情境。' }[learningStep];
  $('prediction-panel').hidden = learningStep !== 'predict';
  $('experiment-actions').hidden = learningStep === 'predict';
  $('scene-context').hidden = !storyOpen;
  $('story-toggle').textContent = storyOpen ? '收起情境' : '看情境';
  $('experiment-progress').hidden = learningStep !== 'experiment';
  $('experiment-progress').innerHTML = '<div class="checks">' + p.checks.map(c => `<div class="check-item ${c.complete ? 'complete' : ''}"><span>${c.complete ? '✓' : '○'}</span><b>${escape(c.label)}</b><small>${c.complete ? '已自动保存' : '等待实验'}</small></div>`).join('') + '</div>';
  $('trial-details').hidden = learningStep !== 'experiment' || !d.trials.length;
  $('explain-panel').hidden = learningStep !== 'explain';
  $('step-next').hidden = learningStep === 'explain' || (learningStep === 'predict' && !d.prediction);
  $('step-next').disabled = learningStep === 'experiment' && !p.experimentDone;
  $('step-next').textContent = learningStep === 'predict' ? '去做实验 →' : p.experimentDone ? '实验已记好，说清楚 →' : '先完成上面两项实验';
  $('submit').hidden = learningStep !== 'explain' || passed;
  $('submit').disabled = !p.readyToSubmit;
  $('submit').textContent = p.readyToSubmit ? '检验我的解释 →' : '还有未选的项目';
  $('next').hidden = learningStep !== 'explain' || !passed;
  $('next').textContent = stage === R.stageIds.at(-1) ? '五关完成，查看我的学习证据 →' : '本关完成，进入下一站 →';
  $('step-back').hidden = learningStep === 'predict';
  $('step-back').textContent = learningStep === 'experiment' ? '回看我的预测' : '返回实验看看';
  if (passed) { $('feedback').className = 'feedback success'; $('feedback').textContent = awarded(stage) || local ? '实验和解释都已通过，本关积分已记录（同一轮只记一次）。' : '实验和解释都已通过，正在同步积分…'; }
  refreshNav();
}
function setStep(step) {
  const d = draft(), p = learningProgress(stage, d, R);
  if (step === 'experiment' && !d.prediction || step === 'explain' && !p.experimentDone) return;
  learningStep = step; if (step !== 'predict') storyOpen = false; if (step === 'predict') storyOpen = true;
  renderJourney(); refreshGuide();
  if (innerWidth <= 900) (step === 'experiment' ? $('experiment-actions') : document.querySelector('.task-panel')).scrollIntoView({ block: 'start' });
}
function renderTrials() {
  const d = draft();
  $('trial-summary').textContent = '查看已自动保存的 ' + d.trials.length + ' 次结果';
  const fmt = t => {
    if (stage === 'flow') return `${R.squareScenes[t.scene]?.label}：${t.db} dB → ${t.over ? '超标，发提示' : '未超标'}`;
    if (stage === 'wave') return t.kind === 'trace' ? `记录曲线 ${t.samples} 个读数，${t.min}—${t.max}（${t.unit === 'dB' ? '仿真dB' : '相对响度'}，${{ simulation: '模拟', teacher: '教师现场', microphone: '本机麦克风' }[t.source] || t.source}）` : `读数：${t.t}秒时 ${t.value}（在${t.leftT}秒与${t.rightT}秒两个散点之间）`;
    if (stage === 'life') return t.kind === 'curtain' ? `窗帘：光照 ${t.min}—${t.max} lux，经过 ${t.distinct} 个不同读数` : `水温读数：${t.reading} ℃`;
    if (stage === 'threshold') return `阈值 ${t.threshold} dB → ${t.alarms} 次提示`;
    if (stage === 'design') return `${R.designData[t.data]?.label} ${t.direction === 'below' ? '≤' : '≥'} ${t.threshold}${R.designData[t.data]?.unit}：湿度 ${t.min}%—${t.max}%，浇水 ${t.waterings} 次，${t.fit ? '合适' : '不合适'}`;
    return '';
  };
  $('trials').innerHTML = d.trials.slice(-12).map(t => `<li>${escape(fmt(t))}</li>`).join('');
}

/* ---------- 说清楚：解释与迁移 ---------- */
function changed() { const d = draft(); d.submitted = false; reviewed[stage] = false; $('feedback').textContent = ''; $('feedback').className = 'feedback'; persist(); renderExplain(); renderJourney(); refreshGuide(); }
function renderExplain() {
  const a = activities[stage], d = draft(), ex = a.explain;
  let html = '';
  if (ex.type === 'flow') {
    html += '<div class="process-flow">' + ex.nodes.map(([k, title, opts], i) => {
      const sel = opts.find(o => o[0] === d.explain[k]);
      return (i ? '<span class="flow-arrow" aria-hidden="true">→</span>' : '') + `<div class="flow-step"><span class="flow-kind">${title}</span><button type="button" class="flow-node${sel ? ' filled' : ''}" data-explain="${k}" aria-pressed="${activeNode === k}">${sel ? escape(sel[1]) : '点击选择'}</button></div>`;
    }).join('') + '</div>';
    const node = ex.nodes.find(n => n[0] === activeNode) || ex.nodes[0];
    html += `<div class="flow-options"><p>「${node[1]}」环节里流动的<b>数据</b>是：</p><div class="flow-choices">${node[2].map(([v, label]) => `<button type="button" class="flow-choice" data-node="${node[0]}" data-value="${v}" aria-pressed="${d.explain[node[0]] === v}">${escape(label)}</button>`).join('')}</div></div>`;
  } else if (ex.type === 'choices') {
    html += ex.items.map(([k, q, opts]) => `<fieldset class="q" data-explain="${k}"><legend>${escape(q)}</legend><div class="opt-col">${opts.map(([v, label]) => `<button type="button" data-k="${k}" data-value="${v}" aria-pressed="${d.explain[k] === v}">${escape(label)}</button>`).join('')}</div></fieldset>`).join('');
  } else if (ex.type === 'sort') {
    html += '<p class="note">给每张数据卡选一类。判断依据：能否在一个范围里取到中间的任意数值？</p><div class="sort-cards">' + Object.entries(R.lifeCards).map(([k, c]) => `<div class="sort-card" data-explain="${k}"><span>${escape(c.label)}</span><div><button type="button" data-k="${k}" data-value="c" aria-pressed="${d.explain[k] === 'c'}">连续量</button><button type="button" data-k="${k}" data-value="d" aria-pressed="${d.explain[k] === 'd'}">不是连续量</button></div></div>`).join('') + '</div>';
  }
  if (stage === 'design') {
    const ds = d.design, info = ds && R.designData[ds.data];
    html = `<div class="design-summary"><b>我的方案（最近一次运行）：</b>${ds ? `采集${info.label}，${ds.direction === 'below' ? '降到' : '升到'}${ds.threshold}${info.unit}${ds.direction === 'below' ? '及以下' : '及以上'}时打开水泵` : '还没有运行'}<button type="button" id="back-to-experiment" class="subtle">返回实验修改方案</button></div>` + html;
  }
  $('explain').innerHTML = html;
  const t = a.transfer;
  if (t.type === 'choice') $('transfer').innerHTML = `<fieldset class="q"><legend>新情境：${escape(t.question)}</legend><div class="opt-col">${t.options.map(([v, label]) => `<button type="button" data-transfer="${v}" aria-pressed="${d.transfer === v}">${escape(label)}</button>`).join('')}</div></fieldset>`;
  else $('transfer').innerHTML = `<fieldset class="q"><legend>新情境：${escape(t.question)}</legend>${Object.entries(R.thresholdCases).map(([k, c], i) => `<div class="case-card"><p>案例${i + 2}：${escape(c.text)}</p><div class="token-row">${c.options.map(o => `<button type="button" data-case="${k}" data-value="${escape(o)}" aria-pressed="${d.transfer?.[k] === o}">${escape(o)}</button>`).join('')}</div></div>`).join('')}</fieldset>`;
  $('explain').querySelectorAll('.flow-node').forEach(b => b.onclick = () => { activeNode = b.dataset.explain; renderExplain(); refreshGuide(); });
  $('explain').querySelectorAll('.flow-choice').forEach(b => b.onclick = () => {
    draft().explain[b.dataset.node] = b.dataset.value;
    activeNode = ex.nodes.map(n => n[0]).find(k => !draft().explain[k]) || b.dataset.node; changed();
  });
  $('explain').querySelectorAll('[data-k]').forEach(b => b.onclick = () => { draft().explain[b.dataset.k] = b.dataset.value; changed(); });
  $('transfer').querySelectorAll('[data-transfer]').forEach(b => b.onclick = () => { draft().transfer = b.dataset.transfer; changed(); });
  $('transfer').querySelectorAll('[data-case]').forEach(b => b.onclick = () => { const dd = draft(); dd.transfer = { ...dd.transfer, [b.dataset.case]: b.dataset.value }; changed(); });
  const back = $('back-to-experiment'); if (back) back.onclick = () => setStep('experiment');
  markErrors();
}
function markErrors() {
  document.querySelectorAll('.needs-revision').forEach(el => el.classList.remove('needs-revision'));
  if (!reviewed[stage]) return;
  const d = draft(), errors = R.assess(stage, { ...d, submitted: true }).errors, m = R.messages[stage];
  for (const k of explainKeys(stage, R)) {
    const wrong = stage === 'life' ? d.explain[k] !== R.lifeCards[k].kind : errors.includes(m[k]);
    if (wrong && d.explain[k]) document.querySelector(`[data-explain="${k}"]`)?.classList.add('needs-revision');
  }
  if (errors.includes(m.transfer)) $('transfer').classList.add('needs-revision');
}
function submit() {
  const d = draft(); d.submitted = true; reviewed[stage] = true;
  const result = R.assess(stage, d);
  persist();
  if (result.pass) {
    if (local && !awarded(stage)) { state.awards.push({ stage, points: 10, created: new Date().toISOString() }); state.points = state.awards.length * 10; persist(false); }
    $('feedback').className = 'feedback success'; $('feedback').textContent = '解释与实验证据一致，通过！';
  } else {
    const shown = result.errors.filter(e => e !== '请提交本次解释后再检验');
    $('feedback').className = 'feedback error';
    $('feedback').innerHTML = '<b>还差一点，标红处需要修订：</b><ul>' + shown.map(e => `<li>${escape(e)}</li>`).join('') + '</ul><p class="note">修改后再点“检验我的解释”。试错不扣分，可以点“给我一点提示”。</p>';
  }
  renderExplain(); renderJourney(); refreshGuide();
}
$('submit').onclick = submit;
$('step-next').onclick = () => setStep(learningStep === 'predict' ? 'experiment' : 'explain');
$('step-back').onclick = () => setStep(learningStep === 'experiment' ? 'predict' : 'experiment');
$('next').onclick = () => { const i = R.stageIds.indexOf(stage); if (i === R.stageIds.length - 1) showEnd(); else showStage(R.stageIds[i + 1]); };
$('story-toggle').onclick = () => { storyOpen = !storyOpen; renderJourney(); };
$('fresh').onclick = () => {
  if (!confirm('清空本关的实验记录和解释，重新做实验？（首次预测、已获积分和老师那里的历史记录都会保留）')) return;
  const d = draft(); d.trials = []; d.explain = {}; d.transfer = emptyTransfer(stage); d.submitted = false; delete d.lastTrace; delete d.design; reviewed[stage] = false;
  persist(); showStage(stage);
};
$('hint').onclick = () => {
  const d = draft(); d.hints++; hintLevel[stage] = Math.min(3, (hintLevel[stage] || 0) + 1); guideActive = true; persist(); refreshGuide();
};

/* 指引：一次只突出当前主要操作；概念提示分三级。 */
function refreshGuide() {
  document.querySelectorAll('.guided-next,.current-control').forEach(el => el.classList.remove('guided-next', 'current-control'));
  if ($('stage-page').hidden || !state) return;
  const d = draft(), p = learningProgress(stage, d, R);
  let target = null;
  if (learningStep === 'predict') target = { selector: d.prediction ? '#step-next' : '#prediction-panel .choice-row', label: d.prediction ? '去做实验' : '选择一个预测' };
  else if (learningStep === 'experiment') {
    const next = nextExperimentAction(stage, p.checks, experiment?.options() || {});
    $('experiment-instruction').textContent = next.instruction; target = { selector: next.selector, label: next.instruction };
  } else {
    $('experiment-instruction').textContent = '需要核对时，可以继续操作左侧实验，或点右侧“返回实验看看”。';
    const errors = reviewed[stage] ? R.assess(stage, { ...d, submitted: true }).errors : [];
    const passed = d.submitted && R.assess(stage, d).pass;
    target = passed ? { selector: '#next', label: '进入下一站' } : (stage === 'flow' && !p.explainDone) ? { selector: '.flow-choices', label: '为当前环节选一张词卡' } : explainTarget(stage, d, errors, R);
  }
  const el = target?.selector && document.querySelector(target.selector);
  if (el && !el.closest('[hidden]')) el.classList.add(guideActive ? 'guided-next' : 'current-control');
  if (guideActive) {
    const level = hintLevel[stage] || 1, hints = activities[stage].hints;
    $('hint-text').innerHTML = `<b>提示 ${level}/3：</b>${escape(hints[level - 1])}` + (target?.label ? `<br><span class="note">下一步：${escape(target.label)}</span>` : '');
  }
}

/* ---------- 考核、结束页与考后挑战 ---------- */
let bank = null;
async function teacherBank() { if (!bank) bank = await api('/api/teacher/answers'); return bank; }
async function showQuiz() {
  if (mode === 'demo') { toast('演示模式不含20题考核。'); return; }
  experiment?.destroy(); experiment = null;
  showPage('quiz-page');
  quiz = new QuizView($('quiz-page'), { mode, getState: () => state, onState: s => { state = s; refreshNav(); }, onExit: () => showStage(stage), bank: mode === 'test' ? (await teacherBank()).questions : null });
  quiz.open();
}
function showEnd() {
  experiment?.destroy(); experiment = null; showPage('end-page');
  const rows = R.stages.map(s => {
    const rec = state.records?.[s.id] || {}, d = drafts[s.id] || {};
    const first = local ? (d.submitted ? (R.assess(s.id, d).pass ? '通过' : '需修订') : '—') : rec.firstSubmitted ? (rec.firstSubmitted.assessment?.pass ? '首次即通过' : '首次需修订') : '尚无证据';
    return `<tr><td>${s.name}</td><td>${awarded(s.id) || passedNow(s.id) ? '✓ 已完成' : '未完成'}</td><td>${first}</td><td>${d.hints || 0}</td></tr>`;
  }).join('');
  const quizzes = state.quizAttempts || [];
  $('end-page').innerHTML = `<div class="result-card"><p class="eyebrow">主线完成</p><h1>你用数据解释了监测系统</h1><p class="score">${state.points || 0}<small> 积分</small></p>
    <table class="end-table"><thead><tr><th>关卡</th><th>状态</th><th>第一次提交</th><th>用过的提示</th></tr></thead><tbody>${rows}</tbody></table>
    <p>积分记录的是完成了哪些关卡；理解还要看你的解释和下面的20题考核。${quizzes.length ? `已考 ${quizzes.length} 次：首次 ${quizzes[0].score} 分，最近 ${quizzes.at(-1).score} 分。` : '还没有参加20题考核。'}</p>
    <div class="choice-row"><button id="end-quiz" class="primary">${quizzes.length ? '再考一次 · 新抽20题' : '开始20题考核'}</button><button id="end-back">回看关卡</button></div></div>`;
  $('end-quiz').onclick = showQuiz; $('end-back').onclick = () => showStage(stage);
}

/* ---------- 教师测试工具（只在 /test，记录留在本页） ---------- */
function testTools() {
  const back = document.createElement('a'); back.href = '/teacher'; back.textContent = '返回大屏'; $('test-tools').append(back);
  $('test-answer').onclick = () => { $('test-answer-panel').hidden = false; $('test-answer-panel').innerHTML = renderStageReference(stage, R); $('test-guide-close').onclick = () => $('test-answer-panel').hidden = true; };
  $('fill-example').onclick = () => {
    const ex = structuredClone(R.examples[stage]);
    if (stage === 'wave') ex.lastTrace = { unit: 'dB', points: Array.from({ length: 100 }, (_, i) => [i / 10, Math.round((50 + 15 * Math.sin(i / 12)) * 10) / 10]) };
    drafts[stage] = ex; reviewed[stage] = true; persist(false); showStage(stage); toast('已载入本关达标示例（虚构），可点“检验我的解释”。');
  };
  $('test-bank').onclick = async () => { const b = await teacherBank(); $('test-answer-panel').hidden = false; $('test-answer-panel').innerHTML = renderExamReference(b.questions); $('test-guide-close').onclick = () => $('test-answer-panel').hidden = true; };
  $('test-quiz').onclick = () => { $('test-answer-panel').hidden = true; showQuiz(); };
  $('test-reward').onclick = () => { $('test-answer-panel').hidden = true; experiment?.destroy(); experiment = null; showPage('end-page'); $('end-page').innerHTML = '<div class="result-card"><p class="eyebrow">教师隔离测试 · 考后挑战</p><h1>阈值调校挑战</h1><p>直接体验，不用先提交考核；不影响任何成绩。</p><button id="reward-back">返回学习</button><section id="reward-stage"></section></div>'; reward?.destroy(); reward = new RewardChallenge($('reward-stage')); $('reward-back').onclick = () => showStage(stage); scrollTo(0, 0); };
  $('test-reset').onclick = () => { if (!confirm('清空本页的测试状态？')) return; sessionStorage.clear(); location.reload(); };
}

/* ---------- 启动 ---------- */
async function boot() {
  await loadClasses();
  if (local) {
    let saved = null; try { saved = JSON.parse(sessionStorage.getItem('lesson5-local-state:' + mode) || 'null'); } catch {}
    enter(saved || { student: { id: mode, name: mode === 'test' ? '测试观察员' : '演示观察员', classId: '—' }, round: mode, records: {}, awards: [], points: 0, quizAttempts: [] });
    if (mode === 'test') testTools();
    return;
  }
  try { enter(await api('/api/me')); } catch { $('login').hidden = false; }
}
window.addEventListener('pagehide', () => { mic?.stop(); });
boot();
export { RewardChallenge };
