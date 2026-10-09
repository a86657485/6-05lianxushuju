/* 学习三步的进度、下一步操作指引与提示定位（纯函数，便于测试）。 */
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

/** 实验步骤中“下一步点哪里”：操作指引可以直接告诉学生。 */
export function nextExperimentAction(stage, checks, o = {}) {
  const missing = checks.find(c => !c.complete);
  if (!missing) return { selector: '#step-next', instruction: '实验结果已自动保存。点击右侧“实验已记好，说清楚 →”。' };
  if (stage === 'flow') {
    if (o.busy) return { selector: null, instruction: '监测器正在采集声音，稍等片刻看三格过程图。' };
    return missing.id === 'under'
      ? { selector: '#src-quiet', instruction: '点击“夜深人静”或“几个人小声聊天”，让监测器测一次，看三个环节出现了什么。' }
      : { selector: '#src-dance', instruction: '点击“广场舞音乐”，再测一次，比较这次三个环节有什么不同。' };
  }
  if (stage === 'wave') {
    if (missing.id === 'trace') {
      if (o.source === 'teacher' && !o.liveFresh) return { selector: '#source-sim', instruction: '老师还没开启现场监测。可以等一等，或改选“模拟旋钮”。' };
      if (o.recording) return { selector: o.source === 'simulation' ? '#knob' : null, instruction: o.source === 'simulation' ? '正在记录：慢慢左右拖动旋钮，让声音时大时小。' : '正在记录：请附近同学正常说话或轻拍手，让声音有大有小。' };
      if (o.lastSpanSmall) return { selector: '#record', instruction: '刚才的声音几乎没有变化。再点“开始记录”，这次让声音时大时小。' };
      return { selector: '#record', instruction: '点击“开始记录”，在10秒内让声音时大时小（拖动旋钮），曲线会自动画出来。' };
    }
    return { selector: '#wave-chart', instruction: '曲线上的圆点是每隔2秒记下的读数。在两个圆点之间的曲线上点一下，读出那一刻的声音。' };
  }
  if (stage === 'life') {
    if (missing.id === 'curtain') return { selector: '#curtain', instruction: '慢慢拖动“窗帘拉上多少”滑块，看光照表和曲线怎样变化（至少经过8个不同读数）。' };
    if (o.kettleRunning) return { selector: '#kettle-read', instruction: '水温正在上升。趁它还没到100 ℃，点“读出此刻水温”。' };
    return { selector: '#kettle-start', instruction: '点击“开始加热”，观察温度计和曲线，在途中读出一个水温。' };
  }
  if (stage === 'threshold') {
    if (o.running) return { selector: null, instruction: '监测正在回放这一晚的数据，注意报警灯和提示记录。' };
    return missing.id === 'standard'
      ? { selector: '#th-slider', instruction: '把阈值滑块调到55 dB（小区夜间标准），再点“运行监测”。' }
      : { selector: '#th-slider', instruction: '把阈值换成一个明显不同的数（如45或65 dB），再点“运行监测”，比较提示次数。' };
  }
  if (stage === 'design') {
    if (o.running) return { selector: null, instruction: '正在运行4天的仿真，观察湿度曲线和水泵。' };
    return missing.id === 'fit'
      ? { selector: '#run-garden', instruction: '选好数据、比较方式和阈值，点“运行4天”，让湿度曲线留在绿色带（30%—70%）里。' }
      : { selector: '#g-threshold', instruction: '再换一种设置（例如换一个阈值）运行一次，比较两次结果。' };
  }
  return { selector: null, instruction: '' };
}

/** 解释步骤中，提交后的错误定位到需要修订的位置。 */
export function explainTarget(stage, record, errors, rules) {
  const a = activities[stage];
  const m = rules.messages[stage];
  if (stage === 'design' && errors.includes(m.design)) return { selector: '#back-to-experiment', label: '返回实验，调整浇水方案后再运行' };
  for (const k of explainKeys(stage, rules)) {
    if (!record.explain?.[k]) return { selector: `[data-explain="${k}"]`, label: '完成这一项' };
  }
  if (stage === 'life' && errors.includes(m.sort)) {
    const wrong = Object.entries(rules.lifeCards).find(([k, v]) => record.explain?.[k] !== v.kind);
    if (wrong) return { selector: `[data-explain="${wrong[0]}"]`, label: '再想想这张卡片' };
  }
  if (a.explain.type !== 'sort') for (const k of explainKeys(stage, rules)) if (errors.includes(m[k])) return { selector: `[data-explain="${k}"]`, label: '修订这一项' };
  if (!transferDone(stage, record, rules) || errors.includes(m.transfer)) return { selector: '#transfer', label: '完成新情境判断' };
  return { selector: '#submit', label: '检验我的解释' };
}
