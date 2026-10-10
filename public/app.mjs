/*
 * 学生端（沉浸版）：班级姓名登录 → 夜晚小区地图 → 五个地点（想一想 → 做实验 → 说清楚）→ 巡查报告站（20题考核）。
 * 任何时刻只突出一个主要操作（focus.mjs），判定、积分与记录沿用 rules.js / 课堂服务。
 */
import { ClassroomSync, api, escape } from './sync.mjs?v=1';
import { activities, takeaways, places } from './activities.mjs?v=2';
import { experimentClasses } from './experiments.mjs?v=2';
import { learningProgress, nextExperimentAction, explainTarget, explainKeys, cardKeys, cardAnswered, wrongCards } from './journey.mjs?v=2';
import { QuizView } from './quiz.mjs?v=1';
import { Microphone } from './microphone.mjs?v=1';
import { renderStageReference, renderExamReference } from './teacher-guide.mjs?v=1';
import { RewardChallenge } from './reward.mjs?v=1';
import { mapBackground, mapPath, placeIcon, sprite, pickCharacter, xiaodiSvg, CHARACTERS } from './world.mjs?v=2';
import { setFocus, place as placeCoach, spotlight } from './focus.mjs?v=2';
import { sound } from './sfx.mjs?v=2';

const $ = id => document.getElementById(id);
const R = window.LessonRules;
const mode = location.pathname === '/test' ? 'test' : location.pathname === '/demo' ? 'demo' : 'student';
const local = mode !== 'student';
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const ORDER = [...R.stageIds, 'quiz'];
const STEPS = [['predict', '想一想'], ['experiment', '做实验'], ['explain', '说清楚']];
let state = null, drafts = {}, stage = 'flow', learningStep = 'predict', experiment = null, screen = 'login';
let hintLevel = {}, revisit = {}, reviewed = {}, quiz = null, reward = null, live = null, liveAt = 0, liveTimer = null, mic = null, micLevel = null;
let character = 'maleAdventurer', avatarAt = 'flow', walking = false, shownCard = null, sayText = '', sayTone = '', hintText = '', mapNote = '';
let login = { classId: '', id: '', manual: false };

const sync = new ClassroomSync((message, pending) => { $('sync-status').textContent = message; $('sync-status').className = 'hud-sync' + (pending ? ' warning' : ''); },
  s => { state = s; renderHud(); if (screen === 'map') renderMap(); });

function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => $('toast').hidden = true, 3200); }
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
const doneStage = st => awarded(st) || passedNow(st);
const unlocked = st => { if (st === 'quiz') return true; const i = R.stageIds.indexOf(st); return mode === 'test' || i === 0 || doneStage(R.stageIds[i - 1]); };
const currentTarget = () => R.stageIds.find(st => !doneStage(st) && unlocked(st)) || 'quiz';

function show(id) {
  screen = id;
  for (const s of ['login', 'map', 'level', 'quiz-page', 'end-page']) $(s).hidden = s !== (id === 'quiz' ? 'quiz-page' : id === 'end' ? 'end-page' : id);
  $('hud').hidden = id === 'login';
  $('menu').hidden = true;
  if (id !== 'quiz') quiz?.close();
  if (id !== 'level') { experiment?.destroy(); experiment = null; }
  $('celebrate').hidden = true;
  renderHud(); refreshGuide();
}

/* ---------------- 登录 ---------------- */
let roster = [];
function loginSetup() {
  $('login-bg').innerHTML = mapBackground();
  $('class-tiles').innerHTML = [601, 602, 603, 604, 605, 606].map(c => `<button type="button" class="tile" data-class="${c}" aria-pressed="false">${c}<small>班</small></button>`).join('');
  $('class-tiles').querySelectorAll('[data-class]').forEach(b => b.onclick = () => { sound.play('tap'); pickClass(b.dataset.class); });
}
async function pickClass(c) {
  login = { classId: c, id: '', manual: false };
  $('class-tiles').querySelectorAll('[data-class]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.class === c)));
  $('step-name').hidden = false; $('manual-box').hidden = true; $('same-name').hidden = true; $('search').value = '';
  $('name-grid').innerHTML = '<p class="note">名单加载中…</p>'; roster = []; loginGuide();
  try { roster = await api('/api/roster?class=' + c); renderNames(); } catch (e) { $('login-error').textContent = e.message; }
}
function renderNames() {
  const q = $('search').value.trim(), list = roster.filter(s => !q || s.name.includes(q));
  $('name-grid').innerHTML = list.length ? list.map(s => `<button type="button" class="name-chip" data-id="${escape(s.id)}" aria-pressed="${login.id === s.id}">${escape(s.name)}${s.manual ? '<small>手动</small>' : ''}</button>`).join('') : '<p class="note">没有找到。可以点“名单里没有我”。</p>';
  $('name-grid').querySelectorAll('[data-id]').forEach(b => b.onclick = () => { sound.play('tap'); login.id = b.dataset.id; login.manual = false; $('manual-box').hidden = true; renderNames(); });
  confirmText();
}
function chosenName() { return login.manual ? $('manual-name').value.trim() : roster.find(s => s.id === login.id)?.name; }
function confirmText() {
  const name = chosenName();
  $('identity-confirm').textContent = login.classId && name ? `请确认：${login.classId}班 · ${name}` : '';
  $('login-submit').hidden = !(login.classId && name);
  loginGuide();
}
$('search').oninput = renderNames;
$('manual-toggle').onclick = () => { login.manual = true; login.id = ''; $('manual-box').hidden = false; renderNames(); $('manual-name').focus(); };
$('manual-name').oninput = confirmText;
async function doLogin(body) {
  $('login-error').textContent = ''; $('same-name').hidden = true;
  try { enter(await api('/api/login', body)); }
  catch (e) {
    if (e.status === 409 && e.data?.choices) {
      $('same-name').hidden = false; $('login-submit').hidden = true;
      $('same-name').innerHTML = '<p>这个班已经有同名记录。哪个是你？</p><div class="same-choices">' + e.data.choices.map(c => `<button type="button" data-id="${escape(c.id)}">是我：${escape(c.name)}${c.manual ? '（之前手动加入）' : '（名单）'}</button>`).join('') + '</div><p class="note">都不是你？在名字后加一个区分字（如“张三2”）。</p>';
      $('same-name').querySelectorAll('button').forEach(b => b.onclick = () => doLogin({ classId: body.classId, id: b.dataset.id }));
      loginGuide();
    } else $('login-error').textContent = e.message;
  }
}
$('login-form').onsubmit = e => {
  e.preventDefault();
  if (!login.classId) { $('login-error').textContent = '请先选择班级'; return; }
  if (login.manual) { const name = $('manual-name').value.trim(); if (!name) { $('login-error').textContent = '请写下你的名字'; return; } doLogin({ classId: login.classId, name }); }
  else { if (!login.id) { $('login-error').textContent = '请点你的名字'; return; } doLogin({ classId: login.classId, id: login.id }); }
};
function loginGuide() {
  if (screen !== 'login') return;
  if (!$('same-name').hidden) return setFocus(document.querySelector('#same-name .same-choices'), '选一个');
  if (!login.classId) return setFocus($('class-tiles'), '先点你的班级');
  if (!chosenName()) return setFocus(login.manual ? $('manual-name') : $('name-grid'), login.manual ? '写下你的名字' : '找到并点你的名字');
  setFocus($('login-submit'), '确认无误，出发！');
}
$('switch').onclick = async () => {
  $('menu').hidden = true;
  if (sync.pending()) await sync.flush();
  if (sync.pending() && !confirm('还有 ' + sync.pending() + ' 条记录没有同步到老师那里，它们会留在这台电脑上，下次登录同一身份时补传。确定切换吗？')) return;
  if (!sync.pending() && !confirm('切换学生前已保存当前记录。确定切换吗？')) return;
  try { await api('/api/logout', {}); } catch {}
  experiment?.destroy(); experiment = null; sync.detach(); state = null; drafts = {}; login = { classId: '', id: '', manual: false };
  $('step-name').hidden = true; $('login-submit').hidden = true; $('identity-confirm').textContent = '';
  $('class-tiles').querySelectorAll('[data-class]').forEach(b => b.setAttribute('aria-pressed', 'false'));
  show('login');
};

function mergeServerRecords() {
  for (const st of R.stageIds) {
    const server = state.records?.[st]?.latest;
    if (!server) continue;
    const mine = drafts[st];
    if (!mine || (Number(server.editedAt) || 0) > (Number(mine.editedAt) || 0)) { const { assessment, eventId, created, ...rest } = server; drafts[st] = rest; }
  }
}
function enter(s) {
  state = s;
  try { drafts = JSON.parse(storage().getItem(draftKey()) || '{}'); } catch { drafts = {}; }
  if (!local) { mergeServerRecords(); sync.attach(state); }
  character = pickCharacter(s.student.id);
  $('identity').textContent = local ? (mode === 'test' ? '教师测试 · 虚构巡查员' : '演示 · 不保存') : `${s.student.classId}班 · ${s.student.name}`;
  $('switch').hidden = local; $('test-tools').hidden = mode !== 'test'; $('demo-bar').hidden = mode !== 'demo';
  document.body.classList.toggle('with-tools', mode !== 'student');
  const t = currentTarget(), i = ORDER.indexOf(t);
  avatarAt = i > 0 ? ORDER[i - 1] : 'flow';
  if (mode === 'demo') toast('演示模式：可以体验全部流程，记录只留在这个页面。');
  showMap(t === 'flow' && !draft('flow').prediction ? '欢迎你，巡查员！夜里小区有人反映太吵。我们去广场看看那台噪声监测器。' : '');
}

/* ---------------- HUD ---------------- */
function renderHud() {
  if (!state) return;
  $('hud-avatar-img').src = sprite(character, 'idle');
  $('hud-progress').innerHTML = R.stages.map((s, i) => `<li class="${doneStage(s.id) ? 'done' : ''} ${screen === 'level' && stage === s.id ? 'here' : ''}" title="${i + 1} ${s.name}">${doneStage(s.id) ? '★' : i + 1}</li>`).join('') + `<li class="quiz ${(state.quizAttempts || []).length ? 'done' : ''}" title="20题巡查报告">📋</li>`;
  $('points').textContent = '★ ' + (state.points || 0);
  $('sound').textContent = sound.on ? '🔊' : '🔇';
  $('fresh').hidden = $('trials-btn').hidden = $('story-btn').hidden = screen !== 'level';
}
$('sound').onclick = () => { sound.toggle(); sound.play('tap'); renderHud(); };
$('menu-btn').onclick = () => { $('menu').hidden = !$('menu').hidden; $('menu-btn').setAttribute('aria-expanded', String(!$('menu').hidden)); renderHud(); };
$('hud-avatar').onclick = () => { const keys = Object.keys(CHARACTERS); character = keys[(keys.indexOf(character) + 1) % keys.length]; try { localStorage.setItem('lesson5-character', character); } catch {} renderHud(); if (screen === 'map') renderMap(); if (screen === 'level') pose('idle'); };
$('help').onclick = () => {
  sound.play('hint');
  if (screen === 'level') {
    const d = draft(); d.hints++; hintLevel[stage] = Math.min(3, (hintLevel[stage] || 0) + 1); persist();
    const level = hintLevel[stage];
    hintText = `提示 ${level}/3：${activities[stage].hints[level - 1]}`;
    renderBubble();
  } else if (screen === 'map') { mapNote = '亮着光圈、有小手指着的地点，就是下一站。点它出发！'; renderMap(); }
  spotlight();
};
document.addEventListener('pointerdown', e => { if (!$('spot').hidden && !e.target.closest('#help')) $('spot').hidden = true; if (!$('menu').hidden && !e.target.closest('#menu,#menu-btn')) $('menu').hidden = true; });

/* ---------------- 小区地图 ---------------- */
function showMap(note = '') { mapNote = note; show('map'); renderMap(); }
function renderMap() {
  if (screen !== 'map') return;
  const target = currentTarget();
  const placeHtml = ORDER.map((k, i) => {
    const p = places[k], done = k === 'quiz' ? (state.quizAttempts || []).length > 0 : doneStage(k), open = unlocked(k);
    return `<button type="button" class="place ${done ? 'done' : ''} ${open ? '' : 'locked'} ${k === target ? 'next' : ''}" id="place-${k}" data-place="${k}" style="--x:${p.x};--y:${p.y}" aria-label="${k === 'quiz' ? '' : '第' + (i + 1) + '站 '}${p.name}${done ? '（已完成）' : open ? '' : '（未解锁）'}">
      <span class="place-icon">${placeIcon(k)}<i class="place-badge">${done ? '★' : open ? (k === 'quiz' ? '📋' : i + 1) : '🔒'}</i></span><span class="place-name">${p.name}</span></button>`;
  }).join('');
  const a = places[avatarAt] || places.flow;
  $('map-world').innerHTML = mapBackground() + mapPath(ORDER) + placeHtml + `<img id="map-avatar" class="map-avatar" alt="" src="${sprite(character, 'idle')}" style="--x:${a.x};--y:${a.y}">`;
  $('map-world').querySelectorAll('[data-place]').forEach(b => b.onclick = () => goPlace(b.dataset.place));
  $('map-xiaodi').innerHTML = xiaodiSvg(40);
  for (let f = 0; f < 8; f++) new Image().src = sprite(character, 'walk' + f);
  const t = places[target];
  $('map-say').innerHTML = escape(mapNote || (target === 'quiz' ? (R.stageIds.every(doneStage) ? '五站全部完成！去“巡查报告站”完成20题考核。' : '去巡查报告站。') : `下一站：${t.name}。${t.line}`));
  refreshGuide();
}
function goPlace(k) {
  if (walking) return;
  if (!unlocked(k)) { sound.play('bad'); const i = R.stageIds.indexOf(k); mapNote = `先完成第${i}站“${places[R.stageIds[i - 1]].name}”，这里才会亮起来。`; renderMap(); return; }
  sound.play('tap');
  const go = () => k === 'quiz' ? showEnd() : showStage(k);
  const av = $('map-avatar'), to = places[k], from = places[avatarAt] || places.flow;
  avatarAt = k;
  if (reduced() || !av || (to.x === from.x && to.y === from.y)) return go();
  walking = true; setFocus(null);
  av.classList.toggle('flip', to.x < from.x);
  let f = 0; const frames = setInterval(() => { av.src = sprite(character, 'walk' + (f++ % 8)); }, 70);
  av.style.setProperty('--x', to.x); av.style.setProperty('--y', to.y);
  setTimeout(() => { clearInterval(frames); walking = false; go(); }, 750);
}

/* ---------------- 实验上下文：实验通过它写记录 ---------------- */
const ctx = {
  mode,
  record: () => draft(),
  addTrial(trial, extra = {}) {
    const d = draft(), before = learningProgress(stage, d, R).checks.map(c => c.complete);
    d.trials.push(trial);
    while (d.trials.length > 40) {
      const was = R.experimentChecks(stage, d).map(c => c.complete).join();
      const idx = d.trials.findIndex((_, i) => R.experimentChecks(stage, { ...d, trials: d.trials.filter((__, j) => j !== i) }).map(c => c.complete).join() === was);
      d.trials.splice(idx >= 0 ? idx : 0, 1);
    }
    Object.assign(d, extra);
    if (extra.design) { d.submitted = false; reviewed[stage] = false; }
    persist();
    const after = learningProgress(stage, d, R).checks.map(c => c.complete);
    const newly = after.some((c, i) => c && !before[i]);
    if (newly) { sound.play('badge'); pose(after.every(Boolean) ? 'show' : 'idle'); }
    renderLevelChrome(newly ? after.findIndex((c, i) => c && !before[i]) : -1); refreshGuide();
  },
  say(text, tone = '') { sayText = text; sayTone = tone; hintText = ''; if (tone === 'bad') sound.play('bad'); renderBubble(); },
  refresh() { refreshGuide(); },
  pose: name => pose(name),
  sfx: name => sound.play(name),
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
function pose(name) {
  const img = $('actor'); if (!img) return;
  img.src = sprite(character, name);
  clearTimeout(pose.t);
  if (name !== 'idle' && name !== 'think') pose.t = setTimeout(() => { img.src = sprite(character, 'idle'); }, 1400);
}

/* ---------------- 地点（关卡） ---------------- */
function showStage(st) {
  if (!unlocked(st)) return;
  stage = st; const a = activities[st], d = draft(), i = R.stageIds.indexOf(st);
  show('level');
  $('chapter').textContent = `第${i + 1}站 · ${places[st].name}`; $('stage-title').textContent = a.title;
  sayText = ''; sayTone = ''; hintText = ''; shownCard = null; $('trial-pop').hidden = true;
  $('test-answer-panel').hidden = true;
  experiment = new experimentClasses[st](ctx); experiment.mount($('scene'), $('controls'));
  const p = learningProgress(st, d, R);
  learningStep = p.initialStep;
  if (learningStep === 'explain' && !reviewed[st] && d.submitted) reviewed[st] = true;
  if (reviewed[st] && !revisit[st]) revisit[st] = wrongCards(st, d, R.assess(st, { ...d, submitted: true }).errors, R);
  pose(learningStep === 'predict' ? 'think' : 'idle');
  renderLevel();
}
function setStep(step) {
  const d = draft(), p = learningProgress(stage, d, R);
  if (step === 'experiment' && !d.prediction || step === 'explain' && !p.experimentDone) return;
  learningStep = step; shownCard = null; sayText = ''; hintText = '';
  pose(step === 'predict' ? 'think' : 'idle');
  renderLevel();
}
function renderLevel() { renderThink(); renderExplain(); renderLevelChrome(); refreshGuide(); }
function renderLevelChrome(popIndex = -1) {
  const d = draft(), p = learningProgress(stage, d, R);
  $('steps').innerHTML = STEPS.map(([id, label], i) => {
    const reach = id === 'predict' || (id === 'experiment' && d.prediction) || (id === 'explain' && p.experimentDone);
    const done = id === 'predict' ? !!d.prediction : id === 'experiment' ? p.experimentDone : passedNow(stage);
    return `<li><button type="button" data-step="${id}" class="step ${learningStep === id ? 'now' : ''} ${done ? 'done' : ''}" ${reach ? '' : 'disabled'} aria-current="${learningStep === id ? 'step' : 'false'}"><i>${done ? '✓' : i + 1}</i>${label}</button></li>`;
  }).join('');
  $('steps').querySelectorAll('[data-step]').forEach(b => b.onclick = () => setStep(b.dataset.step));
  $('evidence').innerHTML = p.checks.map((c, i) => `<span class="badge ${c.complete ? 'got' : ''} ${i === popIndex ? 'pop' : ''}" title="${escape(c.label)}"><i>${c.complete ? '✓' : '?'}</i>${escape(c.label)}</span>`).join('');
  $('evidence').hidden = learningStep !== 'experiment';
  $('go-explain').hidden = !(learningStep === 'experiment' && p.experimentDone);
  $('think-layer').hidden = learningStep !== 'predict';
  $('explain-layer').hidden = learningStep !== 'explain';
  $('level-main').classList.toggle('dimmed', learningStep !== 'experiment');
  renderBubble(); renderHud();
}
function renderBubble() {
  if (screen !== 'level') return;
  $('bubble-xiaodi').innerHTML ||= xiaodiSvg(34);
  const d = draft();
  let main = '';
  if (learningStep === 'predict') main = d.prediction ? '这是你最初的想法，已经保留。' : '先凭第一感觉选一个，不扣分。';
  else if (learningStep === 'experiment') main = nextExperimentAction(stage, learningProgress(stage, d, R).checks, experiment?.options() || {}).instruction;
  else main = passedNow(stage) ? '本站已通过！' : reviewed[stage] && (revisit[stage] || []).length ? '标红的卡片还要再想想。根据实验结果改一改。' : '一张卡一个问题。想想刚才的实验，选出你的答案。';
  $('say-main').textContent = main;
  $('say-sub').textContent = hintText || sayText;
  $('say-sub').className = hintText ? 'hint' : sayTone;
}

/* 想一想：情境 + 预测（首次预测保留，不判对错） */
function renderThink() {
  const a = activities[stage], d = draft();
  if (learningStep !== 'predict') { $('think-layer').innerHTML = ''; return; }
  $('think-layer').innerHTML = `<div class="think-card"><div class="story"><img src="${sprite(character, 'think')}" alt="" width="54" height="72"><p>${escape(a.story)}</p></div>
    <p class="kicker">想一想</p><h2>${escape(a.question)}</h2>
    <div class="card-options think-options">${a.predict.map(([v, label]) => `<button type="button" class="opt" data-predict="${v}" aria-pressed="${d.prediction === v}" ${d.prediction && d.prediction !== v ? 'disabled' : ''}>${escape(label)}</button>`).join('')}</div>
    ${d.prediction ? '<p class="note">首次预测已保留。猜错没关系，实验会告诉你。</p><button type="button" id="think-back" class="go-btn">去做实验 →</button>' : '<p class="note">凭你现在的想法选一个，不扣分。</p>'}</div>`;
  $('think-layer').querySelectorAll('[data-predict]').forEach(b => b.onclick = () => {
    const dd = draft(); if (dd.prediction) return;
    dd.prediction = b.dataset.predict; persist(); sound.play('tap');
    b.classList.add('chosen'); $('think-layer').querySelectorAll('[data-predict]').forEach(x => { if (x !== b) x.disabled = true; });
    setFocus(null); sayText = '想法记下了！去做实验检验它。'; sayTone = 'good'; renderBubble();
    setTimeout(() => { if (screen === 'level' && learningStep === 'predict') setStep('experiment'); }, reduced() ? 0 : 800);
  });
  const back = $('think-back'); if (back) back.onclick = () => setStep('experiment');
}
$('go-explain').onclick = () => { sound.play('tap'); setStep('explain'); };
$('to-map').onclick = () => showMap();

/* 说清楚：一张卡一个问题，选完自动翻到下一张 */
function cardHtml(key) {
  const a = activities[stage], d = draft(), ex = a.explain, keys = cardKeys(stage, R), n = keys.indexOf(key) + 1;
  const wrong = reviewed[stage] && (revisit[stage] || []).includes(key), m = R.messages[stage];
  const opt = (v, label, on) => `<button type="button" class="opt" data-key="${escape(key)}" data-value="${escape(v)}" aria-pressed="${on}">${escape(label)}</button>`;
  let kicker = `说清楚 ${n}/${keys.length}`, visual = '', q = '', opts = '', msg = '';
  if (key === 'transfer') {
    kicker += ' · 新情境'; q = a.transfer.question; opts = a.transfer.options.map(([v, l]) => opt(v, l, d.transfer === v)).join(''); msg = m.transfer;
  } else if (key.startsWith('case:')) {
    const c = R.thresholdCases[key.slice(5)], idx = Object.keys(R.thresholdCases).indexOf(key.slice(5));
    kicker += ' · 找阈值'; visual = `<p class="case-text">案例${idx + 2}：${escape(c.text)}</p>`; q = '系统用来比较的参考值（阈值）是哪一个？';
    opts = c.options.map(o => opt(o, o, d.transfer?.[key.slice(5)] === o)).join(''); msg = m.transfer;
  } else if (ex.type === 'flow') {
    const node = ex.nodes.find(nn => nn[0] === key);
    visual = `<div class="mini-ipo">${ex.nodes.map(([k, t]) => `<span class="${k === key ? 'on' : ''} ${d.explain[k] ? 'filled' : ''}">${t}</span>`).join('<i>→</i>')}</div>`;
    q = `「${node[1]}」环节里流动的数据是？`; opts = node[2].map(([v, l]) => opt(v, l, d.explain[key] === v)).join(''); msg = m[key];
  } else if (ex.type === 'sort') {
    const c = R.lifeCards[key];
    kicker = `数据卡 ${n}/${keys.length - 1}`; visual = `<p class="data-card">${escape(c.label)}</p>`; q = '它是连续量吗？';
    opts = opt('c', '是连续量', d.explain[key] === 'c') + opt('d', '不是连续量', d.explain[key] === 'd'); msg = m.sort;
  } else {
    const it = ex.items.find(i => i[0] === key); q = it[1]; opts = it[2].map(([v, l]) => opt(v, l, d.explain[key] === v)).join(''); msg = m[key];
  }
  return `<div class="qcard ${wrong ? 'needs-revision' : ''}" data-card="${escape(key)}" data-explain="${escape(key)}"><p class="kicker">${kicker}</p>${visual}<h2>${escape(q)}</h2><div class="card-options">${opts}</div>${wrong ? `<p class="card-msg">✗ ${escape(msg)}</p>` : ''}</div>`;
}
function summaryHtml() {
  const d = draft(), passed = passedNow(stage), m = R.messages[stage];
  const errors = reviewed[stage] ? R.assess(stage, { ...d, submitted: true }).errors : [];
  const designBad = stage === 'design' && errors.includes(m.design);
  if (passed) return `<div class="qcard summary" data-card="summary"><p class="kicker">本站已通过</p><h2>${escape(takeaways[stage])}</h2><button type="button" id="next" class="go-btn">回到地图 →</button></div>`;
  if (designBad) return `<div class="qcard summary needs-revision" data-card="summary"><p class="kicker">方案需要调整</p><h2>${escape(m.design)}</h2><button type="button" id="back-to-experiment" class="go-btn">回到种植园改方案</button></div>`;
  return `<div class="qcard summary" data-card="summary"><p class="kicker">全部选好了</p><h2>检验你的解释和实验证据是否一致</h2><button type="button" id="check" class="go-btn">检验我的解释</button><p class="note">试错不扣分，错了可以改。</p></div>`;
}
function renderExplain() {
  if (learningStep !== 'explain') { $('explain-layer').innerHTML = ''; return; }
  const d = draft(), keys = cardKeys(stage, R), errors = reviewed[stage] ? R.assess(stage, { ...d, submitted: true }).errors : [];
  const target = passedNow(stage) ? { card: 'summary' } : explainTarget(stage, d, errors, R, revisit[stage] || []);
  const card = shownCard || target.card;
  let design = '';
  if (stage === 'design') { const ds = d.design, info = ds && R.designData[ds.data]; design = `<p class="my-design">我的方案：${ds ? `采集${info.label}，${ds.direction === 'below' ? '降到' : '升到'}${ds.threshold}${info.unit}时开水泵` : '还没有运行'}</p>`; }
  const dots = [...keys, 'summary'].map((k, i) => `<button type="button" class="dot-btn ${k === card ? 'on' : ''} ${k !== 'summary' && cardAnswered(stage, d, k) ? 'filled' : ''} ${(revisit[stage] || []).includes(k) && reviewed[stage] ? 'wrong' : ''}" data-goto="${escape(k)}" aria-label="${k === 'summary' ? '检验' : '第' + (i + 1) + '张'}">${k === 'summary' ? '✓' : i + 1}</button>`).join('');
  $('explain-layer').innerHTML = `<div class="explain-wrap">${design}<div class="card-dots">${dots}</div>${card === 'summary' ? summaryHtml() : cardHtml(card)}
    <div class="card-nav"><button type="button" id="explain-back" class="ghost-btn">回去看实验</button>${card !== target.card && target.card ? '<button type="button" id="card-resume" class="ghost-btn">继续 →</button>' : ''}</div></div>`;
  const L = $('explain-layer');
  L.querySelectorAll('[data-goto]').forEach(b => b.onclick = () => { shownCard = b.dataset.goto; renderExplain(); refreshGuide(); });
  L.querySelectorAll('[data-key]').forEach(b => b.onclick = () => choose(b.dataset.key, b.dataset.value, b));
  $('explain-back').onclick = () => setStep('experiment');
  const resume = $('card-resume'); if (resume) resume.onclick = () => { shownCard = null; renderExplain(); refreshGuide(); };
  const check = $('check'); if (check) check.onclick = submit;
  const next = $('next'); if (next) next.onclick = () => showMap();
  const back = $('back-to-experiment'); if (back) back.onclick = () => setStep('experiment');
}
function choose(key, value, btn) {
  const d = draft();
  if (key === 'transfer') d.transfer = value;
  else if (key.startsWith('case:')) d.transfer = { ...(typeof d.transfer === 'object' ? d.transfer : {}), [key.slice(5)]: value };
  else d.explain[key] = value;
  d.submitted = false; revisit[stage] = (revisit[stage] || []).filter(k => k !== key);
  persist(); sound.play('tap');
  btn.closest('.card-options').querySelectorAll('[data-key]').forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
  btn.classList.add('chosen'); setFocus(null);
  setTimeout(() => { if (screen !== 'level' || learningStep !== 'explain') return; shownCard = null; renderExplain(); renderLevelChrome(); refreshGuide(); }, reduced() ? 0 : 350);
}
function submit() {
  const d = draft(), wasAwarded = awarded(stage); d.submitted = true; reviewed[stage] = true;
  const result = R.assess(stage, d);
  persist();
  revisit[stage] = result.pass ? [] : wrongCards(stage, d, result.errors, R);
  shownCard = null;
  if (result.pass) {
    if (local && !awarded(stage)) { state.awards.push({ stage, points: 10, created: new Date().toISOString() }); state.points = state.awards.length * 10; persist(false); }
    renderExplain(); renderLevelChrome(); celebrate(wasAwarded);
  } else {
    sound.play('bad'); sayText = `有 ${revisit[stage].length || 1} 处和实验证据对不上，已经标红。`; sayTone = 'bad';
    renderExplain(); renderLevelChrome(); refreshGuide();
  }
}
function celebrate(already) {
  const i = R.stageIds.indexOf(stage), last = i === R.stageIds.length - 1;
  sound.play('star'); pose('cheer0');
  const frames = setInterval(() => { const img = $('celebrate').querySelector('img'); if (img) img.src = sprite(character, img.src.includes('cheer0') ? 'cheer1' : 'cheer0'); }, 380);
  $('celebrate').innerHTML = `<div class="celebrate-card"><img src="${sprite(character, 'cheer0')}" alt="" width="96" height="128"><div class="star-burst">★ ${already ? '' : '+10'}</div>
    <p class="kicker">第${i + 1}站 · ${places[stage].name} 完成！</p><h2>${escape(takeaways[stage])}</h2>
    <p class="note">${already ? '本站积分之前已记录（同一轮只记一次）。' : mode === 'student' ? '实验和解释都通过，积分已记录（同一轮只记一次）。' : '演示/测试：积分只留在本页。'}</p>
    <button type="button" id="celebrate-next" class="go-btn">${last ? '去巡查报告站 →' : '回到地图，去下一站 →'}</button></div>`;
  $('celebrate').hidden = false;
  $('celebrate-next').onclick = () => { clearInterval(frames); $('celebrate').hidden = true; showMap(last ? '五站全部完成！最后去“巡查报告站”完成20题考核。' : `太棒了！下一站：${places[R.stageIds[i + 1]].name}。`); };
  refreshGuide(); renderHud();
}

/* 菜单：实验记录、情境、重做 */
$('trials-btn').onclick = () => {
  $('menu').hidden = true; const d = draft();
  const fmt = t => {
    if (stage === 'flow') return `${R.squareScenes[t.scene]?.label}：${t.db} dB → ${t.over ? '超标，发提示' : '未超标'}`;
    if (stage === 'wave') return t.kind === 'trace' ? `声音曲线 ${t.samples} 个读数，${t.min}—${t.max}（${t.unit === 'dB' ? '仿真dB' : '相对响度'}）` : `读数：${t.t}秒时 ${t.value}（在${t.leftT}秒与${t.rightT}秒之间）`;
    if (stage === 'life') return t.kind === 'curtain' ? `窗帘：光照 ${t.min}—${t.max} lux，${t.distinct} 个不同读数` : `水温读数：${t.reading} ℃`;
    if (stage === 'threshold') return `阈值 ${t.threshold} dB → ${t.alarms} 次提示`;
    if (stage === 'design') return `${R.designData[t.data]?.label} ${t.direction === 'below' ? '≤' : '≥'} ${t.threshold}${R.designData[t.data]?.unit}：湿度 ${t.min}%—${t.max}%，${t.fit ? '合适' : '不合适'}`;
    return '';
  };
  $('trial-pop').innerHTML = `<b>本站已自动保存 ${d.trials.length} 次实验</b><ol>${d.trials.slice(-10).map(t => `<li>${escape(fmt(t))}</li>`).join('') || '<li>还没有实验记录</li>'}</ol><button type="button" id="trial-close" class="ghost-btn">关闭</button>`;
  $('trial-pop').hidden = false; $('trial-close').onclick = () => $('trial-pop').hidden = true;
};
$('story-btn').onclick = () => { $('menu').hidden = true; sayText = activities[stage].story; sayTone = ''; hintText = ''; renderBubble(); };
$('fresh').onclick = () => {
  $('menu').hidden = true;
  if (!confirm('清空本站的实验记录和解释，重新做实验？（首次预测、已获积分和老师那里的历史记录都会保留）')) return;
  const d = draft(); d.trials = []; d.explain = {}; d.transfer = emptyTransfer(stage); d.submitted = false; delete d.lastTrace; delete d.design; reviewed[stage] = false; revisit[stage] = [];
  persist(); showStage(stage);
};

/* ---------------- 唯一主要操作 ---------------- */
function refreshGuide() {
  if (!$('celebrate').hidden) return setFocus($('celebrate-next'), '点这里继续');
  if (screen === 'login') return loginGuide();
  if (screen === 'map') {
    if (walking) return setFocus(null);
    const t = currentTarget();
    return setFocus($('place-' + t), t === 'quiz' ? '去完成20题考核' : '点这里出发');
  }
  if (screen === 'end') return setFocus($('end-quiz'), '开始20题考核');
  if (screen === 'quiz') return quizGuide();
  if (screen !== 'level') return setFocus(null);
  const d = draft(), p = learningProgress(stage, d, R);
  if (learningStep === 'predict') return d.prediction ? setFocus($('think-back'), '去做实验') : setFocus(document.querySelector('.think-options'), '选一个你的想法');
  if (learningStep === 'experiment') {
    const next = nextExperimentAction(stage, p.checks, experiment?.options() || {});
    renderBubble();
    return setFocus(next.selector && document.querySelector(next.selector), next.tip);
  }
  if (passedNow(stage)) return setFocus($('next'), '回到地图');
  const errors = reviewed[stage] ? R.assess(stage, { ...d, submitted: true }).errors : [];
  const target = explainTarget(stage, d, errors, R, revisit[stage] || []);
  const shown = shownCard || target.card;
  if (shown !== target.card) {
    const el = document.querySelector(`[data-card="${shown}"] .card-options`);
    return shown !== 'summary' && !cardAnswered(stage, d, shown) ? setFocus(el, '选一个答案') : setFocus($('card-resume'), '继续');
  }
  setFocus(document.querySelector(target.selector), target.label);
}
function quizGuide() {
  const c = $('quiz-page');
  if (c.querySelector('#return-study')) return setFocus(c.querySelector('#return-study'), '回到地图');
  const sets = [...c.querySelectorAll('fieldset.question')];
  const open = sets.find(f => !f.querySelector('input:checked'));
  if (open) return setFocus(open, '选一个答案');
  const next = c.querySelector('#next-exam');
  if (next && !next.disabled) return setFocus(next, '下一页');
  setFocus(c.querySelector('#submit-exam'), '检查后提交');
}
new MutationObserver(() => { if (screen === 'quiz') quizGuide(); }).observe($('quiz-page'), { childList: true, subtree: true, attributes: true, attributeFilter: ['checked'] });
$('quiz-page').addEventListener('change', () => quizGuide());

/* ---------------- 巡查报告站：考核与结束页 ---------------- */
let bank = null;
async function teacherBank() { if (!bank) bank = await api('/api/teacher/answers'); return bank; }
async function showQuiz() {
  if (mode === 'demo') { toast('演示模式不含20题考核。'); return; }
  show('quiz');
  quiz = new QuizView($('quiz-page'), { mode, getState: () => state, onState: s => { state = s; renderHud(); }, onExit: () => showMap(), bank: mode === 'test' ? (await teacherBank()).questions : null });
  await quiz.open(); quizGuide();
}
function showEnd() {
  show('end');
  const rows = R.stages.map((s, i) => {
    const rec = state.records?.[s.id] || {}, d = drafts[s.id] || {};
    const first = local ? (d.submitted ? (R.assess(s.id, d).pass ? '通过' : '需修订') : '—') : rec.firstSubmitted ? (rec.firstSubmitted.assessment?.pass ? '首次即通过' : '首次需修订') : '尚无证据';
    return `<tr><td>${i + 1} ${places[s.id].name}</td><td>${doneStage(s.id) ? '★ 已完成' : '未完成'}</td><td>${first}</td><td>${d.hints || 0}</td></tr>`;
  }).join('');
  const quizzes = state.quizAttempts || [], left = R.stageIds.filter(s => !doneStage(s)).length;
  $('end-page').innerHTML = `<div class="result-card report"><img src="${sprite(character, left ? 'idle' : 'cheer0')}" alt="" width="72" height="96" class="report-actor"><p class="eyebrow">巡查报告站</p><h1>${left ? `还有 ${left} 站没完成` : '你用数据解释了监测系统'}</h1><p class="score">${state.points || 0}<small> 积分</small></p>
    <table class="end-table"><thead><tr><th>地点</th><th>状态</th><th>第一次提交</th><th>用过的提示</th></tr></thead><tbody>${rows}</tbody></table>
    <p>积分记录的是完成了哪些地点；理解还要看你的解释和20题考核。${quizzes.length ? `已考 ${quizzes.length} 次：首次 ${quizzes[0].score} 分，最近 ${quizzes.at(-1).score} 分。` : '还没有参加20题考核。'}</p>
    <div class="end-actions"><button type="button" id="end-quiz" class="go-btn">${quizzes.length ? '再考一次 · 新抽20题' : '开始20题考核'}</button><button type="button" id="end-back" class="ghost-btn">回到地图</button></div></div>`;
  $('end-quiz').onclick = showQuiz; $('end-back').onclick = () => showMap();
  refreshGuide();
}

/* ---------------- 教师测试工具（只在 /test，记录留在本页） ---------------- */
function testTools() {
  const back = document.createElement('a'); back.href = '/teacher'; back.textContent = '返回大屏'; $('test-tools').append(back);
  const panel = html => { $('test-answer-panel').hidden = false; $('test-answer-panel').innerHTML = html; const c = $('test-guide-close'); if (c) c.onclick = () => $('test-answer-panel').hidden = true; };
  $('test-answer').onclick = () => panel(renderStageReference(stage, R));
  $('fill-example').onclick = () => {
    const ex = structuredClone(R.examples[stage]); ex.submitted = false;
    if (stage === 'wave') ex.lastTrace = { unit: 'dB', points: Array.from({ length: 100 }, (_, i) => [i / 10, Math.round((50 + 15 * Math.sin(i / 12)) * 10) / 10]) };
    drafts[stage] = ex; reviewed[stage] = false; revisit[stage] = []; persist(false); showStage(stage); toast('已载入本站达标示例（虚构），可直接“检验我的解释”。');
  };
  $('test-bank').onclick = async () => { const b = await teacherBank(); panel(renderExamReference(b.questions)); };
  $('test-quiz').onclick = () => { $('test-answer-panel').hidden = true; showQuiz(); };
  $('test-reward').onclick = () => { $('test-answer-panel').hidden = true; show('end'); $('end-page').innerHTML = '<div class="result-card"><p class="eyebrow">教师隔离测试 · 考后挑战</p><h1>阈值调校挑战</h1><p>直接体验，不用先提交考核；不影响任何成绩。</p><button type="button" id="reward-back" class="ghost-btn">回到地图</button><section id="reward-stage"></section></div>'; reward?.destroy(); reward = new RewardChallenge($('reward-stage')); $('reward-back').onclick = () => showMap(); setFocus(null); };
  $('test-reset').onclick = () => { if (!confirm('清空本页的测试状态？')) return; sessionStorage.clear(); location.reload(); };
}

/* ---------------- 启动 ---------------- */
async function boot() {
  loginSetup();
  if (local) {
    let saved = null; try { saved = JSON.parse(sessionStorage.getItem('lesson5-local-state:' + mode) || 'null'); } catch {}
    enter(saved || { student: { id: mode, name: mode === 'test' ? '测试巡查员' : '演示巡查员', classId: '—' }, round: mode, records: {}, awards: [], points: 0, quizAttempts: [] });
    if (mode === 'test') testTools();
    return;
  }
  try { enter(await api('/api/me')); } catch { show('login'); }
}
addEventListener('pagehide', () => { mic?.stop(); });
boot();
export { RewardChallenge, explainKeys };
