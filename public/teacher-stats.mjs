/** 由“一个班 + 当前轮次”的数据计算所有图表数字，口径集中在这里。 */
export function summarizeClass(payload, stages, goals = []) {
  if (!payload || !Array.isArray(payload.students)) throw new Error('学生数据未能读取');
  if (!payload.classId) throw new Error('班级信息缺失');
  const students = payload.students;
  if (students.some(s => String(s.student?.classId) !== String(payload.classId))) throw new Error('班级数据不一致，请重新加载');
  const total = students.length;
  const has = (s, id) => (s.awards || []).some(a => a.stage === id);
  const complete = students.filter(s => stages.every(st => has(s, st.id))).length;
  const entered = students.filter(s => Boolean(s.updated)).length;
  if (complete > entered) throw new Error('完成状态与进入人数不一致，请重新加载');
  const status = { notEntered: total - entered, inProgress: entered - complete, complete };
  const stageRows = stages.map(st => {
    const answered = students.filter(s => Boolean(s.records?.[st.id]?.lastSubmitted));
    return {
      id: st.id, name: st.name, short: st.short,
      complete: students.filter(s => has(s, st.id)).length,
      started: students.filter(s => Boolean(s.records?.[st.id]?.first || s.records?.[st.id]?.latest)).length,
      assessment: {
        submitted: answered.length,
        firstPassed: answered.filter(s => s.records[st.id].firstSubmitted?.assessment?.pass === true).length,
        latestPassed: answered.filter(s => s.records[st.id].lastSubmitted?.assessment?.pass === true).length,
        unanswered: total - answered.length
      }
    };
  });
  const tested = students.filter(s => (s.quizAttempts || []).length);
  const goalRows = goals.map(goal => {
    const rate = pick => { let right = 0, n = 0; for (const s of tested) { const v = pick(s.quizAttempts).byGoal?.[goal]; if (v) { right += v.right; n += v.total; } } return { right, n }; };
    return { goal, first: rate(a => a[0]), latest: rate(a => a.at(-1)) };
  });
  const scores = tested.map(s => ({ first: s.quizAttempts[0].score, latest: s.quizAttempts.at(-1).score }));
  const avg = k => scores.length ? Math.round(scores.reduce((n, v) => n + v[k], 0) / scores.length) : null;
  return { classId: String(payload.classId), round: payload.round, at: payload.at, total, entered, status, stages: stageRows, quiz: { tested: tested.length, untested: total - tested.length, firstAvg: avg('first'), latestAvg: avg('latest'), goals: goalRows } };
}
/** 某关最近一次提交里出现最多的待修订原因（典型误解）。 */
export function commonErrors(students, stageId, limit = 3) {
  const counts = {};
  for (const s of students) for (const e of s.records?.[stageId]?.lastSubmitted?.assessment?.errors || []) if (e !== '请提交本次解释后再检验') counts[e] = (counts[e] || 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, limit);
}
