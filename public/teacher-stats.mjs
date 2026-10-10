/*
 * 由“一个班 + 当前轮次”的数据计算大屏所有图表数字，口径集中在这里（纯函数，便于测试）。
 * 证据摘要 summary 由服务端按 rules.stageSummary 重算；缺少时（旧记录、测试数据）在这里用同一函数补算。
 */
const isoMs = v => { const t = Date.parse(v); return Number.isFinite(t) ? t : null; };

export function summarizeClass(payload, stages, goals = [], R = globalThis.LessonRules, now = Date.now()) {
  if (!payload || !Array.isArray(payload.students)) throw new Error('学生数据未能读取');
  if (!payload.classId) throw new Error('班级信息缺失');
  const students = payload.students;
  if (students.some(s => String(s.student?.classId) !== String(payload.classId))) throw new Error('班级数据不一致，请重新加载');
  const total = students.length;
  const has = (s, id) => (s.awards || []).some(a => a.stage === id);
  const sum = (s, id) => s.records?.[id]?.summary || (R?.stageSummary ? R.stageSummary(id, s.records?.[id] || {}, has(s, id)) : { stars: has(s, id) ? 1 : 0, tagsFirst: [], tagsLatest: [], reflectTags: [] });
  const complete = students.filter(s => stages.every(st => has(s, st.id))).length;
  const entered = students.filter(s => Boolean(s.updated)).length;
  if (complete > entered) throw new Error('完成状态与进入人数不一致，请重新加载');
  const status = { notEntered: total - entered, inProgress: entered - complete, complete };

  const stageRows = stages.map(st => {
    const rec = s => s.records?.[st.id] || {};
    const answered = students.filter(s => Boolean(rec(s).lastSubmitted));
    const started = students.filter(s => Boolean(rec(s).first || rec(s).latest));
    const sums = students.map(s => ({ s, m: sum(s, st.id), done: has(s, st.id), started: Boolean(rec(s).first || rec(s).latest), sub: Boolean(rec(s).firstSubmitted) }));
    const subd = sums.filter(x => x.sub);
    const stars = [0, 1, 2, 3].map(n => sums.filter(x => x.done && x.m.stars === n).length);
    const withPred = sums.filter(x => x.m.prediction);
    const reached = sums.filter(x => x.sub || x.m.conceptHintLevel > 0);
    return {
      id: st.id, name: st.name, short: st.short, goal: st.goal || null, focus: st.focus || null,
      complete: sums.filter(x => x.done).length,
      started: started.length,
      inProgress: sums.filter(x => x.started && !x.done).length,
      notStarted: total - started.length,
      assessment: {
        submitted: answered.length,
        firstPassed: answered.filter(s => s.records[st.id].firstSubmitted?.assessment?.pass === true).length,
        latestPassed: answered.filter(s => s.records[st.id].lastSubmitted?.assessment?.pass === true).length,
        unanswered: total - answered.length
      },
      evidence: { submitted: subd.length, explainFirst: subd.filter(x => x.m.explainFirst).length, transferFirst: subd.filter(x => x.m.transferFirst).length, passed: subd.filter(x => x.done).length, attemptsAvg: subd.length ? Math.round(subd.reduce((n, x) => n + (x.m.attempts || 1), 0) / subd.length * 10) / 10 : null },
      stars: { one: stars[1], two: stars[2], three: stars[3] },
      prediction: {
        n: withPred.length,
        correct: withPred.filter(x => x.m.predictionCorrect).length,
        revised: withPred.filter(x => !x.m.predictionCorrect && x.done).length,
        pending: withPred.filter(x => !x.m.predictionCorrect && !x.done).length
      },
      hints: { n: reached.length, levels: [0, 1, 2, 3].map(l => reached.filter(x => (x.m.conceptHintLevel || 0) === l).length), opAvg: started.length ? Math.round(sums.filter(x => x.started).reduce((n, x) => n + (x.m.opHints || 0), 0) / started.length * 10) / 10 : null }
    };
  });

  /* 误解：首次检验时选了按误解设计的干扰项；已通过且最近提交/句块里不再出现记为“已纠正” */
  const mis = {};
  for (const s of students) for (const st of stages) {
    const m = sum(s, st.id), first = m.tagsFirst || [];
    for (const tag of first) {
      const resolved = has(s, st.id) && !(m.tagsLatest || []).includes(tag) && !(m.reflectTags || []).includes(tag);
      const row = mis[tag] ||= { tag, label: R?.tagLabels?.[tag] || tag, students: [], stages: new Set() };
      row.stages.add(st.id);
      row.students.push({ id: s.student.id, name: s.student.name, stage: st.id, resolved });
    }
    for (const tag of m.reflectTags || []) if (!first.includes(tag)) {
      const row = mis[tag] ||= { tag, label: R?.tagLabels?.[tag] || tag, students: [], stages: new Set() };
      row.stages.add(st.id); row.students.push({ id: s.student.id, name: s.student.name, stage: st.id, resolved: false, fromReflect: true });
    }
  }
  const misconceptions = Object.values(mis).map(r => ({ ...r, stages: [...r.stages], count: r.students.length, unresolved: r.students.filter(x => !x.resolved).length })).sort((a, b) => b.count - a.count || b.unresolved - a.unresolved);

  /* 20题考核：平均、按目标、分数分布 */
  const tested = students.filter(s => (s.quizAttempts || []).length);
  const goalRows = goals.map(goal => {
    const rate = pick => { let right = 0, n = 0; for (const s of tested) { const v = pick(s.quizAttempts).byGoal?.[goal]; if (v) { right += v.right; n += v.total; } } return { right, n }; };
    return { goal, first: rate(a => a[0]), latest: rate(a => a.at(-1)) };
  });
  const scores = tested.map(s => ({ first: s.quizAttempts[0].score, latest: s.quizAttempts.at(-1).score }));
  const avg = k => scores.length ? Math.round(scores.reduce((n, v) => n + v[k], 0) / scores.length) : null;
  const bins = [[0, 59, '<60'], [60, 69, '60–69'], [70, 79, '70–79'], [80, 89, '80–89'], [90, 100, '90–100']];
  const hist = { labels: bins.map(b => b[2]), first: bins.map(([lo, hi]) => scores.filter(v => v.first >= lo && v.first <= hi).length), latest: bins.map(([lo, hi]) => scores.filter(v => v.latest >= lo && v.latest <= hi).length) };

  /* 实时动态：最近30分钟每分钟的记录数、检验次数与通关 */
  const end = Math.max(now, isoMs(payload.at) || 0), start = end - 30 * 60000;
  const minutes = Array.from({ length: 30 }, (_, i) => ({ t: start + i * 60000, events: 0, checks: 0, passes: 0 }));
  const slot = t => { if (t === null || t < start || t > end) return null; return minutes[Math.min(29, Math.floor((t - start) / 60000))]; };
  for (const s of students) {
    for (const st of stages) for (const h of s.records?.[st.id]?.history || []) { const m = slot(isoMs(h.created)); if (m) { m.events++; if (h.submitted) m.checks++; } }
    for (const a of s.awards || []) { const m = slot(isoMs(a.created)); if (m) m.passes++; }
  }
  const last = students.map(s => isoMs(s.updated)).filter(Boolean).sort((a, b) => b - a)[0] || null;

  /* 第4站：学生运行过的阈值与提示次数（同一学生同一阈值只计一次）；第5站：教室噪声监测器试过的阈值与结果 */
  const thr = new Map(), cls = new Map();
  for (const s of students) {
    const ts = s.records?.threshold?.latest?.trials || [];
    for (const t of ts) if (Number.isInteger(t.threshold) && Number.isInteger(t.alarms)) {
      const k = t.threshold + '|' + t.alarms, row = thr.get(k) || { threshold: t.threshold, alarms: t.alarms, students: new Set() };
      row.students.add(s.student.name); thr.set(k, row);
    }
    for (const t of s.records?.design?.latest?.trials || []) if (Number.isInteger(t.threshold) && Number.isInteger(t.alarms)) {
      const row = cls.get(t.threshold) || { threshold: t.threshold, alarms: t.alarms, falseAlarms: t.falseAlarms || 0, fit: !!t.fit, students: new Set() };
      row.students.add(s.student.name); cls.set(t.threshold, row);
    }
  }
  const thresholds = [...thr.values()].map(r => ({ threshold: r.threshold, alarms: r.alarms, n: r.students.size, names: [...r.students] })).sort((a, b) => a.threshold - b.threshold);
  const classroom = [...cls.values()].map(r => ({ threshold: r.threshold, alarms: r.alarms, falseAlarms: r.falseAlarms, fit: r.fit, n: r.students.size, names: [...r.students] })).sort((a, b) => a.threshold - b.threshold);
  /* 按教参三条学习目标与两项重难点汇总：对应站的首次解释一致率、最终通过，以及20题考核该目标的首次/最近正确率（考核目标按顺序对应）。 */
  const targets = [1, 2, 3].map(g => {
    const rows = stageRows.filter(r => r.goal === g), ev = k => rows.reduce((n, r) => n + r.evidence[k], 0);
    const q = goalRows[g - 1];
    return { goal: g, label: R?.GOALS?.[g - 1] || ('目标' + g), foci: [...new Set(rows.map(r => r.focus).filter(Boolean))].map(f => R?.FOCI?.[f] || f), stations: rows.map(r => r.short),
      submitted: ev('submitted'), explainFirst: ev('explainFirst'), transferFirst: ev('transferFirst'), passed: ev('passed'),
      quizFirst: q && q.first.n ? Math.round(q.first.right / q.first.n * 100) : null, quizLatest: q && q.latest.n ? Math.round(q.latest.right / q.latest.n * 100) : null };
  });
  const doneStars = students.flatMap(s => stages.filter(st => has(s, st.id)).map(st => sum(s, st.id).stars));
  return {
    classId: String(payload.classId), round: payload.round, at: payload.at, total, entered, status, stages: stageRows,
    starsAvg: doneStars.length ? Math.round(doneStars.reduce((n, v) => n + v, 0) / doneStars.length * 10) / 10 : null,
    misconceptions, thresholds, classroom, targets, garden: classroom,
    timeline: { start, end, minutes, last },
    quiz: { tested: tested.length, untested: total - tested.length, firstAvg: avg('first'), latestAvg: avg('latest'), goals: goalRows, hist }
  };
}
/** 某关最近一次提交里出现最多的待修订原因（典型卡点）。 */
export function commonErrors(students, stageId, limit = 3) {
  const counts = {};
  for (const s of students) for (const e of s.records?.[stageId]?.lastSubmitted?.assessment?.errors || []) if (e !== '请提交本次解释后再检验') counts[e] = (counts[e] || 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, limit);
}
