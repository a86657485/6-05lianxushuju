/* 教师测试模式中的标准操作、答案与题库参考。 */
import { escape } from './sync.mjs?v=1';
import { activities, operations } from './activities.mjs?v=1';

export function renderStageReference(stage, R) {
  const a = activities[stage], g = R.goals[stage];
  const label = (choices, v) => choices.find(([k]) => k === v)?.[1] || v;
  let explain = '';
  if (a.explain.type === 'flow') explain = '<div class="test-reference-flow">' + a.explain.nodes.map(([k, t, opts], i) => `${i ? '<span aria-hidden="true">→</span>' : ''}<div><b>${t}</b><p>${escape(label(opts, g.explain[k]))}</p></div>`).join('') + '</div>';
  else if (a.explain.type === 'choices') explain = '<ul>' + a.explain.items.map(([k, q, opts]) => `<li>${escape(q)} → <b>${escape(label(opts, g.explain[k]))}</b></li>`).join('') + '</ul>';
  else explain = '<ul>' + Object.entries(R.lifeCards).map(([k, c]) => `<li>${escape(c.label)} → <b>${c.kind === 'c' ? '连续量' : '不是连续量'}</b></li>`).join('') + '</ul>';
  if (stage === 'design') explain = '<p><b>可接受方案：</b>采集土壤湿度，“降到阈值及以下时”开水泵，阈值30%—45%（仿真结果均保持在30%—70%）。多解按约束判断。</p>' + explain;
  if (stage === 'threshold') explain += '<p class="note"><b>课堂追问素材：</b>仿真夜间数据的提示次数为 40→5、45→6、50→4、55→3、60→2、65→1、70→0；阈值低于约40 dB时，几乎整晚都超标，连成一次长时间提示（页面同时显示“超标累计分钟”）。若有学生调到很低反而次数变少，可追问“提示次数少，是不是更安静？”，引出阈值要按需求合理设置。</p>';
  const transfer = a.transfer.type === 'cases'
    ? '<ul>' + Object.values(R.thresholdCases).map(c => `<li>${escape(c.text)} → <b>${escape(c.answer)}</b></li>`).join('') + '</ul>'
    : `<p>${escape(a.transfer.question)} → <b>${escape(label(a.transfer.options, g.transfer))}</b></p>`;
  return `<div class="test-reference"><button id="test-guide-close" type="button">收起参考</button><p class="eyebrow">教师隔离测试 · 本关参考</p><h2>${escape(a.title)}</h2>
    <h3>标准操作（可以直接告诉学生）</h3><ol>${(operations[stage] || []).map(s => `<li>${escape(s)}</li>`).join('')}</ol>
    <p><b>预测：</b>${escape(a.question)} 参考：${escape(label(a.predict, g.prediction))}（预测不判对错，只保留首次想法）</p>
    <h3>解释的判定</h3>${explain}<h3>新情境判断</h3>${transfer}
    <p class="note">可先亲自操作，再点“载入本关达标示例”核对。示例与测试记录只留在本页，不进入班级统计。</p></div>`;
}
export function renderExamReference(questions) {
  return `<div class="test-reference"><button id="test-guide-close" type="button">收起参考</button><p class="eyebrow">教师隔离测试 · 题库参考</p><h2>20题考核题库（共 ${questions.length} 题）</h2>
    <p>5个目标各8题，每次每个目标随机抽4题，选项顺序也会打乱。</p><div class="test-reference-bank">${questions.map((q, i) => `<details><summary>${i + 1} · ${escape(q.goal)} · ${escape(q.prompt)}</summary><p><b>正确答案：${escape(q.options[q.answer])}</b></p><p>解析：${escape(q.explanation)}</p></details>`).join('')}</div></div>`;
}
