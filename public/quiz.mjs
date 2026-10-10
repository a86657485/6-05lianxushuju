/* 20题考核：提交前可改、不显示正误；提交后错题在前并给答案与解析；可重复考核。 */
import { api, escape, uniqueId } from './sync.mjs?v=1';

export function renderExamReview(feedback) {
  const numbered = feedback.map((q, i) => ({ ...q, number: i + 1 }));
  const wrong = numbered.filter(q => !q.correct), right = numbered.filter(q => q.correct);
  const item = (q, open) => `<details ${open ? 'open' : ''}><summary>第${q.number}题 · ${escape(q.goal)} · ${escape(q.prompt)}</summary><p>你的选择：${escape(q.options[q.chosen] ?? '未答')}</p><p><b>正确答案：${escape(q.options[q.answer])}</b></p><p>解析：${escape(q.explanation)}</p></details>`;
  return `<section id="wrong-review" class="exam-review"><h2>错题 ${wrong.length} 道 · 答案与解析</h2>${wrong.length ? '<p>错题已展开。先看自己的选择，再看正确答案和原因；需要时回到对应关卡再做一次实验。</p>' + wrong.map(q => item(q, true)).join('') : '<p>这次没有错题。</p>'}<h2>答对 ${right.length} 道</h2>${right.map(q => item(q, false)).join('')}</section>`;
}
export function goalSummary(feedback) {
  const out = {};
  for (const q of feedback) { out[q.goal] ||= { right: 0, total: 0 }; out[q.goal].total++; if (q.correct) out[q.goal].right++; }
  return out;
}
/** 教师测试卷：按三条学习目标抽题；默认 7/7/6 共20题。 */
export function pickLocal(questions, perGoal = [6, 7, 7]) {
  const goals = [...new Set(questions.map(q => q.goal))];
  const counts = Array.isArray(perGoal) ? perGoal : goals.map(() => perGoal);
  return goals.flatMap((g, i) => questions.filter(q => q.goal === g).map(q => ({ q, n: Math.random() })).sort((a, b) => a.n - b.n).slice(0, counts[i] ?? counts[0]).map(v => v.q));
}

export class QuizView {
  constructor(container, { getState, mode, onState, onExit, bank }) { Object.assign(this, { container, getState, mode, onState, onExit, bank }); this.page = 0; this.answers = {}; }
  key() { const s = this.getState(); return 'lesson5-exam:' + s.student.id + ':' + s.round; }
  persist() { try { localStorage.setItem(this.key(), JSON.stringify({ examId: this.exam?.id, answers: this.answers, page: this.page })); } catch { this.note = '本机存储不足，请保持页面开启。'; } }
  close() {}
  async open(newPaper = false) {
    this.close(); this.result = null; this.note = '';
    try {
      if (this.mode === 'student') {
        const s = this.getState();
        if (!newPaper && !s.currentExam && s.quizAttempts?.length) { this.result = s.quizAttempts.at(-1); return this.render(); }
        this.exam = await api('/api/exam/create', { sid: s.student.id, round: s.round });
        this.answers = {}; this.page = 0;
        let disk = null; try { disk = JSON.parse(localStorage.getItem(this.key()) || 'null'); } catch {}
        if (disk?.examId === this.exam.id) { this.answers = disk.answers || {}; this.page = disk.page || 0; }
      } else {
        this.exam = { id: uniqueId(), questions: pickLocal(this.bank) }; this.answers = {}; this.page = 0;
      }
      this.render();
    } catch (e) {
      this.container.innerHTML = `<div class="result-card"><h2>考核还未载入</h2><p>${escape(e.message)}</p><button id="retry-exam">重新连接</button><button id="back-exam">返回学习</button></div>`;
      this.container.querySelector('#retry-exam').onclick = () => this.open(newPaper); this.container.querySelector('#back-exam').onclick = this.onExit;
    }
  }
  render() {
    if (this.result) return this.renderResult();
    const qs = this.exam.questions, answered = qs.filter(q => Number.isInteger(this.answers[q.id])).length, pages = Math.ceil(qs.length / 5);
    const unanswered = qs.map((q, i) => Number.isInteger(this.answers[q.id]) ? null : i + 1).filter(Boolean);
    this.container.innerHTML = `<div class="quiz-wrap"><p class="eyebrow">${this.mode === 'test' ? '教师隔离测试卷 · 不计成绩' : '独立考核 · 每次20题'}</p><h1>用新情境检验理解</h1><p>提交前可以修改答案，提交后统一显示对错与解析。考核得分与通关积分分别记录。</p>
      <div class="quiz-nav"><b id="quiz-count">已答 ${answered}/${qs.length} · 第 ${this.page + 1}/${pages} 页</b><div class="page-dots">${Array.from({ length: pages }, (_, p) => `<button data-page="${p}" aria-current="${p === this.page}">${p + 1}</button>`).join('')}</div><button id="leave-exam">保存作答，返回学习</button>${this.mode === 'test' ? '<button id="quiz-fill">填入参考答案</button>' : ''}</div>
      <div class="quiz-group">${qs.slice(this.page * 5, this.page * 5 + 5).map((q, j) => `<fieldset class="question"><legend>${this.page * 5 + j + 1} · ${escape(q.goal)}</legend><h3>${escape(q.prompt)}</h3>${q.options.map((o, i) => `<label><input type="radio" name="${escape(q.id)}" value="${i}" ${this.answers[q.id] === i ? 'checked' : ''}>${escape(o)}</label>`).join('')}</fieldset>`).join('')}</div>
      <p class="error" role="alert">${escape(this.note || '')}</p><p class="note" id="unanswered">${unanswered.length ? '未答题号：' + unanswered.join('、') : '全部已答，可以提交。'}</p>
      <div class="quiz-nav"><button id="prev-exam" ${this.page === 0 ? 'disabled' : ''}>上一页</button><button id="submit-exam" class="primary">提交20题</button><button id="next-exam" ${this.page === pages - 1 ? 'disabled' : ''}>下一页</button></div></div>`;
    this.container.scrollIntoView({ block: 'start' });
    const c = this.container;
    c.querySelectorAll('input[type=radio]').forEach(el => el.onchange = () => {
      this.answers[el.name] = Number(el.value); this.persist();
      const n = qs.filter(q => Number.isInteger(this.answers[q.id])).length;
      c.querySelector('#quiz-count').textContent = `已答 ${n}/${qs.length} · 第 ${this.page + 1}/${pages} 页`;
      const un = qs.map((q, i) => Number.isInteger(this.answers[q.id]) ? null : i + 1).filter(Boolean);
      c.querySelector('#unanswered').textContent = un.length ? '未答题号：' + un.join('、') : '全部已答，可以提交。';
    });
    c.querySelectorAll('[data-page]').forEach(b => b.onclick = () => { this.page = Number(b.dataset.page); this.persist(); this.render(); });
    c.querySelector('#prev-exam').onclick = () => { this.page--; this.persist(); this.render(); };
    c.querySelector('#next-exam').onclick = () => { this.page++; this.persist(); this.render(); };
    c.querySelector('#leave-exam').onclick = () => { this.persist(); this.onExit(); };
    c.querySelector('#submit-exam').onclick = () => this.submit();
    const fill = c.querySelector('#quiz-fill'); if (fill) fill.onclick = () => { qs.forEach(q => this.answers[q.id] = q.answer); this.render(); };
  }
  async submit() {
    const qs = this.exam.questions;
    if (qs.some(q => !Number.isInteger(this.answers[q.id]))) { this.note = '还有未答题，请先完成（见下方未答题号）。'; return this.render(); }
    const b = this.container.querySelector('#submit-exam'); b.disabled = true;
    try {
      if (this.mode === 'student') {
        const s = this.getState();
        this.result = await api('/api/exam/submit', { sid: s.student.id, round: s.round, examId: this.exam.id, answers: this.answers });
        this.onState(await api('/api/me')); try { localStorage.removeItem(this.key()); } catch {}
      } else {
        const feedback = qs.map(q => ({ ...q, chosen: this.answers[q.id], correct: this.answers[q.id] === q.answer }));
        this.result = { score: feedback.filter(q => q.correct).length * 5, feedback, byGoal: goalSummary(feedback) };
      }
      this.render();
    } catch (e) { this.note = e.message + '；作答已保存在本机，请联网后再提交。'; this.persist(); this.render(); }
  }
  renderResult() {
    const r = this.result, attempts = this.mode === 'student' ? this.getState().quizAttempts?.length : 0;
    const goals = r.byGoal || goalSummary(r.feedback);
    this.container.innerHTML = `<div class="result-card"><p class="eyebrow">${attempts ? `本轮第 ${attempts} 次20题考核` : '测试卷反馈 · 不计成绩'}</p><h1>看看这次理解的证据</h1><p class="score">${r.score}<small>/100</small></p>
      <p>本次答对 ${r.score / 5}/20 题。一次表现不能单独证明稳定掌握；重考高分也不能代替新情境迁移。</p>
      <div class="goal-bars">${Object.entries(goals).map(([g, v]) => `<div><span>${escape(g)}</span><i style="--w:${v.total ? v.right / v.total * 100 : 0}%"></i><b>${v.right}/${v.total}</b></div>`).join('')}</div>
      <div class="choice-row"><button id="return-study" class="primary">回到关卡，检验薄弱处</button><button id="retry-quiz">再考一次 · 新抽20题</button></div>
      ${gameEntry(this.mode, r.score, this.mode === 'student' ? this.getState().quizAttempts : [])}${renderExamReview(r.feedback)}</div>`;
    this.container.scrollIntoView({ block: 'start' });
    this.container.querySelector('#return-study').onclick = this.onExit;
    this.container.querySelector('#retry-quiz').onclick = () => this.open(true);
  }
}

/** 奖励小游戏入口：最近一次考核 ≥80 分才解锁（服务端 /api/game/status 再次判定）。 */
export const GAME_PASS = 80;
export function gameEntry(mode, latest, attempts = []) {
  if (mode === 'test') return `<div class="game-entry open" id="game-entry"><b>🎮 奖励小游戏 · 智能限速卡丁车</b><span>教师测试：不受分数限制，记录只留在本页。</span><a class="go-btn" id="game-link" href="/game-test">试玩卡丁车小游戏</a></div>`;
  if (mode !== 'student') return '';
  if (latest == null) return `<div class="game-entry locked" id="game-entry"><b>🔒 奖励小游戏 · 考核80分以上解锁</b><span>还没有参加20题考核。</span></div>`;
  const best = attempts.length ? Math.max(...attempts.map(a => a.score)) : latest;
  if (latest >= GAME_PASS) return `<div class="game-entry open" id="game-entry"><b>🎮 奖励小游戏已解锁</b><span>开卡丁车巡查：方向键驾驶，车速表是连续数据，限速线是你设的阈值。</span><a class="go-btn" id="game-link" href="/game">进入卡丁车小游戏</a></div>`;
  return `<div class="game-entry locked" id="game-entry"><b>🔒 奖励小游戏 · 考核80分以上解锁</b><span>这次 ${latest} 分，你的最好成绩 ${best} 分。看完错题再考一次吧。</span></div>`;
}
