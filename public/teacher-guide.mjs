/* 教师测试模式中的标准操作、答案与题库参考（逆向设计版：对照、证据、概念、迁移A/B、句块）。 */
import { escape } from './sync.mjs?v=1';
import { activities, operations } from './activities.mjs?v=5';
import { cardKeys, cardSpec } from './cards.mjs?v=5';

export function renderStageReference(stage, R) {
  const a = activities[stage], g = R.goals[stage], ex = R.examples[stage];
  const label = (choices, v) => choices.find(([k]) => k === v)?.[1] || v;
  const rows = cardKeys(stage, R).filter(k => k !== 'transfer' && k !== 'compare').map(k => {
    const sp = cardSpec(stage, k, ex, R, 'teacher'), want = g.explain[k];
    const ok = sp.options.filter(o => Array.isArray(want) ? want.includes(o.value) : o.value === want).map(o => o.label).join(' / ');
    const wrong = sp.options.filter(o => !(Array.isArray(want) ? want.includes(o.value) : o.value === want)).map(o => { const tag = R.tagFor(stage, k, o.value); return `${escape(o.label)}${tag ? `<small>（误解：${escape(R.tagLabels[tag])}）</small>` : ''}`; }).join('；');
    return `<li>${escape(sp.question)}<br>→ <b>${escape(ok)}</b><br><span class="note">干扰项：${wrong}</span></li>`;
  }).join('');
  const tr = ['A', 'B'].map(item => { const t = a.transfer[item]; return `<li>情境${item}：${escape(t.q)} → <b>${escape(label(t.options, g.transfer))}</b></li>`; }).join('');
  const design = stage === 'design' ? '<p><b>可接受阈值：</b>约62—76 dB（课间正常聊天最高约62 dB，两段喧哗约72—76 dB），多解按“只在喧哗时提示”判断。照搬55 dB会在正常聊天时提示4次；45 dB几乎整个课间都在响；77 dB以上喧哗也不提示。教参：重在体会阈值“依据实际情况设定、可参考标准”的作用，不考概念。</p>' : '';
  const th = stage === 'threshold' ? '<p class="note"><b>课堂追问素材：</b>仿真夜间数据的提示次数为 40→5、45→6、50→4、55→3、60→2、65→1、70→0；阈值低于约40 dB时几乎整晚超标，连成一次长时间提示（页面同时显示“超标累计分钟”）。若有学生调到很低反而次数变少，可追问“提示次数少，是不是更安静？”。</p>' : '';
  return `<div class="test-reference"><button id="test-guide-close" type="button">收起参考</button><p class="eyebrow">教师隔离测试 · 本站参考</p><h2>${escape(a.title)}</h2>
    <h3>标准操作（可以直接告诉学生）</h3><ol>${(operations[stage] || []).map(s => `<li>${escape(s)}</li>`).join('')}</ol>
    <p><b>预测：</b>${escape(a.question)} 目标答案：${escape(label(a.predict, g.prediction))}。预测不判对错；“对照预测”卡的正确答案取决于学生自己的预测（预测与目标一致选“一致”，否则选“不一致”）。</p>
    ${design}<h3>说清楚：证据卡与概念卡</h3><p class="note">证据卡题干用学生自己的实验数据生成；选项顺序按学生打乱；答错的选项被划掉并显示针对该误解的反馈。</p><ol>${rows}</ol>${th}
    <h3>新情境（迁移）</h3><p class="note">第一次用情境A；答错后换成等价的情境B（再错再换回A），“迁移首答”只看第一次。</p><ul>${tr}</ul>
    <h3>证据星</h3><p>完成本站 ★；第一次检验时解释卡全对 ★；第一次检验时解释全对且迁移题也答对 ★（逐级：迁移题是三选一，单独答对可能是猜的，所以不单独给星）。首次检验前用了第3级“具体帮助”的，后两颗不计。积分（每站10分）照常。</p>
    <p class="note">可先亲自操作，再点“载入本站达标示例”核对。示例与测试记录只留在本页，不进入班级统计。</p></div>`;
}
export function renderExamReference(questions) {
  return `<div class="test-reference"><button id="test-guide-close" type="button">收起参考</button><p class="eyebrow">教师隔离测试 · 题库参考</p><h2>20题考核题库（共 ${questions.length} 题）</h2>
    <p>按教参三条学习目标组卷：目标1抽6题，目标2（重点：连续量的表现形式）抽7题，目标3（难点：阈值的作用）抽7题，共20题；选项顺序会打乱。</p><div class="test-reference-bank">${questions.map((q, i) => `<details><summary>${i + 1} · ${escape(q.goal)} · ${escape(q.prompt)}</summary><p><b>正确答案：${escape(q.options[q.answer])}</b></p><p>解析：${escape(q.explanation)}</p></details>`).join('')}</div></div>`;
}
