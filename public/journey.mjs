/* 学习三步的进度、“当前唯一主要操作”与解释卡片顺序（纯函数，便于测试）。 */
import { activities } from './activities.mjs';

export function explainKeys(stage, rules) {
  const a = activities[stage];
  if (a.explain.type === 'flow') return a.explain.nodes.map(n => n[0]);
  if (a.explain.type === 'choices') return a.explain.items.map(i => i[0]);
  if (a.explain.type === 'sort') return Object.keys(rules.lifeCards);
  return [];
}
export function explainDone(stage, record, rules) {
  const ex = record.explain || {};
  return explainKeys(stage, rules).every(k => !!ex[k]);
}
export function transferDone(stage, record, rules) {
  if (activities[stage].transfer.type === 'cases') {
    const tr = record.transfer && typeof record.transfer === 'object' ? record.transfer : {};
    return Object.keys(rules.thresholdCases).every(k => !!tr[k]);
  }
  return typeof record.transfer === 'string' && !!record.transfer;
}
export function learningProgress(stage, record, rules) {
  const checks = rules.experimentChecks(stage, record);
  const experimentDone = checks.length > 0 && checks.every(c => c.complete);
  const eDone = explainDone(stage, record, rules), tDone = transferDone(stage, record, rules);
  return {
    checks, experimentDone, explainDone: eDone, transferDone: tDone,
    initialStep: !record.prediction ? 'predict' : !experimentDone ? 'experiment' : 'explain',
    readyToSubmit: !!record.prediction && experimentDone && eDone && tDone
  };
}

/**
 * 实验步骤中“下一步点哪里”。操作方法可以直接告诉学生：
 * selector 是此刻唯一要突出的控件；tip 是贴在控件旁的一句话；instruction 是小递气泡里的完整说明。
 * selector 为 null 表示正在运行动画，只需观察。
 */
export function nextExperimentAction(stage, checks, o = {}) {
  const missing = checks.find(c => !c.complete);
  const act = (selector, tip, instruction) => ({ selector, tip, instruction: instruction || tip });
  if (!missing) return act('#go-explain', '实验记好了，去说清楚', '两项实验证据都已自动保存。点亮着的“说清楚”按钮。');
  if (stage === 'flow') {
    if (o.busy) return act(null, '', '监测器正在工作：看声音数据怎样从输入流到输出。');
    return missing.id === 'under'
      ? act('#src-quiet', '先点“夜深人静”', '让广场安静下来，看监测器的三个环节里出现了什么。')
      : act('#src-dance', '再点“广场舞音乐”', '换成广场舞音乐再测一次，比较三个环节有什么不同。');
  }
  if (stage === 'wave') {
    if (missing.id === 'trace') {
      if (o.source === 'teacher' && !o.liveFresh) return act('#source-sim', '改用“模拟推杆”', '老师还没开启现场监测。可以等一等，或改用模拟推杆。');
      if (o.recording) return o.source === 'simulation'
        ? act('#knob', '左右拖动，让声音忽大忽小', '正在记录：慢慢左右拖动推杆，曲线会跟着起伏。')
        : act(null, '', '正在记录：请附近同学说话或轻拍手，让声音有大有小。');
      if (o.lastSpanSmall) return act('#record', '再录一次，这次让声音大起大落', '刚才声音几乎没有变化（起伏不足15）。再录一次。');
      return act('#record', '点这里开始录10秒', '点红色录音键，然后在10秒里拖动推杆，让声音时大时小。');
    }
    return act('#wave-chart', '在两个圆点之间点一下', '圆点是每2秒记下的读数。在两个圆点中间的曲线上点一下，看那一刻有没有数值。');
  }
  if (stage === 'life') {
    if (missing.id === 'curtain') return act('#curtain', '慢慢拖动，拉上窗帘', '慢慢拖动窗帘把手，看光照表和曲线怎样变化（至少经过8个不同读数）。');
    if (o.kettleRunning) return act('#kettle-read', '趁没烧开，读一次水温', '水温正在上升。趁它还没到100 ℃，读出此刻的水温。');
    return act('#kettle-start', '点“开始烧水”', '打开电热水壶，看温度计和曲线怎样变化。');
  }
  if (stage === 'threshold') {
    if (o.running) return act(null, '', '正在回放这一晚：注意报警灯什么时候亮。');
    if (missing.id === 'standard') return o.threshold === 55
      ? act('#run-monitor', '阈值是55，点“运行监测”', '红线就是阈值。小区夜间标准是55 dB，先用它回放这一晚。')
      : act('#th-slider', '把红线调到 55', '拖动阈值滑块，把红线调到小区夜间标准 55 dB。');
    return Number.isInteger(o.threshold) && Math.abs(o.threshold - 55) >= 5
      ? act('#run-monitor', '用新阈值再运行一次', '数据还是同一晚，只换了阈值。再运行一次，比较提示次数。')
      : act('#th-slider', '换一个阈值（如45或65）', '把红线拖到一个明显不同的位置（比55低或高至少5），再运行比较。');
  }
  if (stage === 'design') {
    if (o.running) return act(null, '', '正在运行4天：看湿度曲线有没有跑出绿色带。');
    if (!o.data) return act('#g-data', '①选：系统采集什么数据', '先决定传感器测什么。三种数据都可以试，结果会告诉你哪种合适。');
    if (!o.direction) return act('#g-dir', '②选：什么时候开水泵', '数据“降到”阈值时浇水，还是“升到”阈值时浇水？');
    if (!o.thresholdSet) return act('#g-threshold', '③拖动设定阈值', '拖动滑块，设定开水泵的阈值。');
    if (o.alreadyRun) return missing.id === 'fit'
      ? act('#g-threshold', '调整阈值（或数据）再试', '这个方案已经运行过。看看曲线哪里跑出了绿色带，改一改再运行。')
      : act('#g-threshold', '换一种设置，再比较一次', '已经找到合适的方案。再换一种设置运行，比较两次结果。');
    return act('#run-garden', '点“运行4天”检验方案', '方案设好了，运行4天的仿真看看湿度能不能保持在30%—70%。');
  }
  return act(null, '', '');
}

/** 解释卡片的顺序：每个解释项一张卡，迁移题一张（阈值关为4张案例卡）。 */
export function cardKeys(stage, rules) {
  const keys = explainKeys(stage, rules);
  if (activities[stage].transfer.type === 'cases') return [...keys, ...Object.keys(rules.thresholdCases).map(k => 'case:' + k)];
  return [...keys, 'transfer'];
}
export function cardAnswered(stage, record, key) {
  if (key === 'transfer') return typeof record.transfer === 'string' && !!record.transfer;
  if (key.startsWith('case:')) return !!(record.transfer && typeof record.transfer === 'object' && record.transfer[key.slice(5)]);
  return !!record.explain?.[key];
}
/** 提交后哪些卡片需要修订（与 rules.assess 的错误信息对应）。 */
export function wrongCards(stage, record, errors, rules) {
  const m = rules.messages[stage], out = [];
  for (const k of explainKeys(stage, rules)) {
    if (stage === 'life' ? errors.includes(m.sort) && record.explain?.[k] !== rules.lifeCards[k].kind : errors.includes(m[k])) out.push(k);
  }
  if (errors.includes(m.transfer)) {
    if (activities[stage].transfer.type === 'cases') { for (const [k, c] of Object.entries(rules.thresholdCases)) if (record.transfer?.[k] !== c.answer) out.push('case:' + k); }
    else out.push('transfer');
  }
  return out;
}
/**
 * 解释步骤的下一张卡与唯一主要操作：未答的卡 → 需要修订且还没改的卡 → 检验按钮。
 * revisit：上次检验标出、学生尚未改动的卡片。
 */
export function explainTarget(stage, record, errors, rules, revisit = []) {
  const m = rules.messages[stage];
  if (stage === 'design' && errors.includes(m.design)) return { card: 'summary', selector: '#back-to-experiment', label: '回去调整浇水方案' };
  const keys = cardKeys(stage, rules);
  const open = keys.find(k => !cardAnswered(stage, record, k));
  if (open) return { card: open, selector: `[data-card="${open}"] .card-options`, label: '选一个答案' };
  const fix = keys.find(k => revisit.includes(k));
  if (fix) return { card: fix, selector: `[data-card="${fix}"] .card-options`, label: '再想想，改一改' };
  return { card: 'summary', selector: '#check', label: '检验我的解释' };
}
