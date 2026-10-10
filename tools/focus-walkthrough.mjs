/* RPG 闯关版完整走查（校园地图 → NPC 对话进站）：机器人“学生”只点亮着的主要操作（选项组里按需选一个），每一步记录焦点。 */
/*
 * 用法（先启动课堂服务，最好用临时数据库和虚构名单）：
 *   PLAYWRIGHT=/path/to/node_modules/playwright/index.mjs BASE=http://127.0.0.1:8796 W=1366 H=768 SHOTS=docs/screenshots/rpg闯关版 node tools/focus-walkthrough.mjs
 *   MODE=demo 走 /demo（不登录、不写数据）；REDUCED=1 模拟“减少动态效果”；NAME=手动填写的姓名（填名单里已有的名字会触发同名确认）。
 *   GUESS=1 “乱点的学生”：只跟着发光的操作做实验，所有判断都随机选，错了再随机改，直到通过；最后读取服务端证据摘要。
 * 每一步检查：页面上恰好一个发光的主要操作（.cta），它在视口内，且中心没有被其他元素挡住。结果写入 OUTDIR/focus-<尺寸>.json。
 */
import fs from 'node:fs';
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:8797';
const W = Number(process.env.W || 1366), H = Number(process.env.H || 768);
const MODE = process.env.MODE || 'student';           // student | demo
const GUESS = !!process.env.GUESS;                      // 1 = “乱点的学生”：预测、卡片、句块都随机选，答错就再随机改，直到通过
let seed = Number(process.env.SEED || 7); const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const PRED = {};
const SHOTS = process.env.SHOTS || '';                  // 截图目录（空则不截）
const TAG = process.env.TAG || `${W}x${H}`;
const MOBILE = W < 700;
const REDUCED_MS = process.env.REDUCED ? 150 : 2600;
const browser = await chromium.launch();
const ctx = await browser.newContext({ bypassCSP: true, viewport: { width: W, height: H }, deviceScaleFactor: 1, isMobile: MOBILE, hasTouch: MOBILE, reducedMotion: process.env.REDUCED ? 'reduce' : 'no-preference' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push('pageerror ' + e.message));
page.on('console', m => { if (m.type() === 'error' && !/401|409/.test(m.text())) errors.push('console ' + m.text()); });
const log = [], fails = [];
const shot = async name => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };

/** 读取当前焦点：亮着的 .cta 个数、是否在视口内、中心点是否被遮挡、贴着的提示。 */
async function focus(label, { allowNone = false } = {}) {
  await page.waitForTimeout(MOBILE ? 650 : 250);
  const f = await page.evaluate(() => {
    const vis = el => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && !el.closest('[hidden]'); };
    const ctas = [...document.querySelectorAll('.cta')].filter(vis);
    const el = ctas[0];
    if (!el) return { count: 0 };
    const r = el.getBoundingClientRect();
    const inView = r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight + 1 && r.right <= innerWidth + 1;
    const cx = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), cy = Math.min(innerHeight - 1, Math.max(0, r.top + Math.min(r.height / 2, 30)));
    const hit = document.elementFromPoint(cx, cy);
    const coach = document.getElementById('coach');
    return { count: ctas.length, id: el.id || el.className.split(' ').filter(c => c !== 'cta').join('.'), tag: el.tagName.toLowerCase(), text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24), tip: coach.hidden ? '' : coach.textContent.trim(), inView, unobscured: !!hit && (el === hit || el.contains(hit)), rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] };
  });
  const ok = allowNone ? f.count <= 1 : f.count === 1 && f.inView && f.unobscured;
  log.push({ step: label, ...f, ok });
  if (!ok) fails.push(label + ' ' + JSON.stringify(f));
  return f;
}
const cta = () => page.locator('.cta').first();
async function clickCta(label, opts) { const f = await focus(label, opts); await cta().click(); return f; }
async function waitCta(sel, timeout = 25000) { await page.waitForFunction(s => { const c = document.querySelector('.cta'); return c && (c.matches(s) || !!c.querySelector(s) || !!c.closest(s)); }, sel, { timeout }); }
async function chooseIn(label, selector) { await focus(label); await page.locator('.cta ' + selector).first().click(); await page.waitForTimeout(500); }
const goals = async () => page.evaluate(() => window.LessonRules.goals);

/* ---------- 登录 ---------- */
if (MODE === 'student') {
  await page.goto(BASE + '/'); await page.waitForSelector('#class-tiles .tile');
  await focus('登录：选班级'); await shot('01-登录-选班级');
  await page.locator('.cta [data-class="601"]').click(); await page.waitForSelector('.name-chip');
  await focus('登录：点名字');
  await page.fill('#search', '林'); await page.waitForTimeout(200);
  // 同名：手动填写一个名单里已有的名字，触发同名确认
  await page.click('#manual-toggle'); await focus('登录：手动填写'); await page.fill('#manual-name', process.env.NAME || '林小雨');
  await clickCta('登录：确认身份');
  await page.waitForSelector('#same-name:not([hidden]) button'); await focus('登录：同名确认'); await shot('02-登录-同名确认');
  await page.locator('.cta button').first().click();
} else { await page.goto(BASE + '/demo'); }
await page.waitForSelector('#map:not([hidden])');
await page.waitForSelector('.rpg-canvas');
await page.waitForTimeout(800);
await shot('03-校园地图总览');
// 走近第1站 NPC，截「靠近可对话」与「下一站未解锁」
await page.evaluate(() => window.__enterPlace && null);
await page.waitForFunction(() => typeof window.__enterPlace === 'function');
await page.keyboard.down('ArrowLeft'); await page.waitForTimeout(900); await page.keyboard.up('ArrowLeft');
await page.keyboard.down('ArrowUp'); await page.waitForTimeout(1200); await page.keyboard.up('ArrowUp');
await page.waitForTimeout(400);
await shot('03b-走近监测站NPC');
const talkVisible = await page.locator('#rpg-talk:not([hidden])').count();
if (talkVisible) await shot('03c-对话按钮已出现');
const G = await goals();

const STOP = ['check', 'next', 'celebrate-next', 'back-to-experiment', 'reflect-saw', 'reflect-so', 'reflect-done'];
const SHOT_CARDS = new Set();
async function answerCards(stage, wrong = {}) {
  for (let guard = 0; guard < 40; guard++) {
    await page.waitForTimeout(450);
    const where = await page.evaluate(() => { const c = document.querySelector('.cta'); return c ? (c.id || (c.closest('[data-card]')?.dataset.card) || c.className) : ''; });
    if (STOP.includes(where)) return where;
    const card = where;
    let value;
    if (GUESS) {
      const vals = await page.locator('.cta [data-value]:not([disabled])').evaluateAll(bs => bs.map(b => b.dataset.value));
      value = vals[Math.floor(rnd() * vals.length)];
    } else if (card === 'compare') value = PRED[stage] === G[stage].prediction ? 'match' : 'differ';
    else if (card === 'transfer') value = G[stage].transfer;
    else { const v = G[stage].explain[card]; value = Array.isArray(v) ? v[0] : v; }
    if (wrong[card] && !wrong[card].used) { value = wrong[card].value; wrong[card].used = true; }
    if ((card === 'compare' || card === 'evidence' || card === 'transfer') && !SHOT_CARDS.has(stage + card)) { SHOT_CARDS.add(stage + card); await shot(`卡片-${stage}-${card}`); }
    await chooseIn(`${stage} 说清楚：卡片 ${card}`, `[data-value="${value}"]`);
  }
  throw new Error('卡片循环未结束');
}
async function reflect(stage, shotName) {
  for (const id of ['reflect-saw', 'reflect-so']) {
    await waitCta('#' + id); await focus(`${stage} 句块：${id}`);
    const n = await page.locator(`#${id} [data-value]`).count();
    await page.locator(`#${id} [data-value]`).nth(GUESS ? Math.floor(rnd() * n) : 0).click(); await page.waitForTimeout(300);
  }
  await waitCta('#reflect-done'); await focus(`${stage} 句块：完成`); if (shotName) await shot(shotName + '-句块收获');
  await cta().click();
}
let checks = {};
async function finishStage(stage, shotName, wrong) {
  await waitCta('#go-explain'); await focus(`${stage} 实验完成`); if (shotName) await shot(shotName + '-实验证据');
  await cta().click();
  checks[stage] = 0;
  for (let round = 0; round < 40; round++) {
    const r = await answerCards(stage, round === 0 ? wrong : {});
    if (r === 'back-to-experiment') return 'redo';
    if (r === 'check') {
      if (shotName && round === 0) await shot(shotName + '-说清楚');
      await clickCta(`${stage} 检验${round ? '（第' + (round + 1) + '次）' : ''}`); checks[stage]++;
      await page.waitForTimeout(600);
      const passed = await page.evaluate(() => !!document.querySelector('#reflect-saw'));
      if (passed) break;
      await focus(`${stage} 标红后修订`);
      if (round === 0 && shotName) {
        await shot(shotName + '-标红修订');
        await page.waitForSelector('#retry-guide:not([hidden])', { timeout: 3000 }).catch(() => {});
        if (stage === 'flow') await shot('两星-02-二刷出现引导');
        await page.click('#help'); await page.waitForTimeout(300); await shot(shotName + '-想法提示'); await page.mouse.click(5, H - 5);
      }
      continue;
    }
    if (r.startsWith('reflect')) break;
  }
  await reflect(stage, shotName);
  await page.waitForSelector('#celebrate:not([hidden])');
  await focus(`${stage} 通关庆祝`); if (shotName) await shot(shotName + '-通关');
  if (stage === 'flow') await shot('两星-03-满两星可回地图');
  await cta().click(); await page.waitForSelector('#map:not([hidden])');
  await page.waitForSelector('.rpg-canvas'); await page.waitForTimeout(600);
  if (stage === 'flow') {
    // 走向数据展示墙（wave），应显示未解锁
    await page.keyboard.down('ArrowRight'); await page.waitForTimeout(1600); await page.keyboard.up('ArrowRight');
    await page.keyboard.down('ArrowUp'); await page.waitForTimeout(900); await page.keyboard.up('ArrowUp');
    await page.waitForTimeout(400);
    await shot('06b-下一站未解锁');
  }
  return 'ok';
}
async function predict(stage, value) {
  if (GUESS) { await page.waitForSelector('.cta [data-predict]'); const vals = await page.locator('.cta [data-predict]').evaluateAll(bs => bs.map(b => b.dataset.predict)); value = vals[Math.floor(rnd() * vals.length)]; }
  PRED[stage] = value;
  await chooseIn(`${stage} 预测`, `[data-predict="${value}"]`); await page.waitForTimeout(1000);
}
async function enterStage(stage, n) {
  await page.waitForSelector('#map:not([hidden])');
  await page.waitForFunction(() => typeof window.__enterPlace === 'function');
  // 先截一次「下一站锁定」：若还有后续站，尝试对话锁定的 NPC（应灰显）
  if (n === 1) {
    await page.evaluate(() => {
      const talk = document.querySelector('#rpg-talk');
      // 不强制；走查截图已在登录后拍过总览
    });
  }
  await page.evaluate(id => window.__enterPlace(id), stage);
  await page.waitForSelector('#level:not([hidden])'); await page.waitForTimeout(900);
  await focus(`${stage} 想一想`);
}

/* ---------- 第1站 广场监测器 ---------- */
await enterStage('flow', 1); await shot('04-第1站-想一想');
await page.waitForSelector('#to-map');
await shot('两星-01-未满两星地图锁定');
await predict('flow', G.flow.prediction);
/* 教参：回顾IPO后，先把噪声监测系统的工作过程示意图画出来（先放错一次，看反馈） */
async function placePart(part, slot) { await chooseIn(`flow 示意图：选${part}`, `[data-part="${part}"]`); await chooseIn(`flow 示意图：放到${slot}`, `[data-slot="${slot}"]`); }
await shot('04b-第1站-示意图待画');
if (GUESS) { const order = ['collect', 'process', 'output'].sort(() => rnd() - .5); for (const [i, s] of ['s1', 's2', 's3'].entries()) await placePart(order[i], s); }
else { await placePart('collect', 's1'); await placePart('output', 's2'); await placePart('process', 's3'); }
await page.waitForTimeout(400); await shot('04c-第1站-示意图放错反馈');
for (let guard = 0; guard < 6; guard++) {
  if (await page.evaluate(() => !!document.querySelector('#src-quiet'))) break;
  const need = await page.evaluate(() => { const ans = window.LessonRules.schematicAnswer; const filled = [...document.querySelectorAll('[data-slot]')].filter(b => b.classList.contains('filled')).map(b => b.dataset.slot); const s = Object.keys(ans).find(k => !filled.includes(k)); return [ans[s], s]; });
  await placePart(need[0], need[1]);
}
await page.waitForTimeout(400); await shot('04d-第1站-示意图完成');
await clickCta('flow 实验1'); await page.waitForTimeout(1700);
await clickCta('flow 实验2'); await page.waitForTimeout(1700); await shot('05-第1站-广场监测器');
await finishStage('flow', '06-第1站', { input: { value: 'collector' }, transfer: { value: 'devices' } });

/* ---------- 第2站 声音记录亭 ---------- */
await enterStage('wave', 2);
await predict('wave', 'scatter');
await clickCta('wave 打开监测器记录');
await waitCta('#wave-chart', 15000); await focus('wave 在两个圆点之间点'); await shot('07-第2站-监测器记录');
{ const box = await page.locator('#wave-chart svg').boundingBox(); const s = { l: 52, r: 18, w: 640 }; const t = 3.1; const x = box.x + (s.l + t / 10 * (s.w - s.l - s.r)) / s.w * box.width; await page.mouse.click(x, box.y + box.height * 0.5); }
await page.waitForTimeout(400); await shot('08-第2站-两点之间读数');
await finishStage('wave', '', {});

/* ---------- 第3站 3号楼小明家 ---------- */
await enterStage('life', 3);
await predict('life', G.life.prediction);
await focus('life 拉窗帘');
for (let v = 5; v <= 100; v += 5) { await page.locator('#curtain').fill(String(v)); await page.waitForTimeout(60); }
await page.waitForTimeout(1300); await shot('09-第3站-窗帘与仪表');
await finishStage('life', '10-第3站', { lamp: { value: 'c' }, compare: { value: 'differ' } });

/* ---------- 第4站 物业控制室 ---------- */
await enterStage('threshold', 4);
await predict('threshold', 'same');
await clickCta('threshold 55运行'); await waitCta('#th-slider', 30000);
await focus('threshold 换阈值'); await page.locator('#th-slider').fill('45'); await page.waitForTimeout(200);
await clickCta('threshold 45运行'); await page.waitForTimeout(600); await shot('11-第4站-回放中');
await waitCta('#go-explain', 30000); await shot('12-第4站-两次阈值对比');
await finishStage('threshold', '13-第4站', { 'case:fridge': { value: '6℃' } });

/* ---------- 第5站 教室噪声监测器（教材“拓展与提升”） ---------- */
await enterStage('design', 5); await shot('14a-第5站-想一想');
await predict('design', 'standard');
if (GUESS) {
  let runs = 0;
  for (; runs < 200; runs++) {
    if (await page.evaluate(() => document.querySelector('.cta')?.id === 'go-explain')) break;
    await page.locator('#c-threshold').fill(String(40 + Math.floor(rnd() * 51))); await page.waitForTimeout(80);
    await page.click('#run-class'); await page.waitForTimeout(REDUCED_MS + 2400);
  }
  checks.designRuns = runs + 1;
} else {
await chooseIn('design 依据：参考标准55', '#c-std');
await clickCta('design 运行55'); await waitCta('.fader', 30000); await shot('14-第5站-照搬55误报');
await focus('design 调整阈值'); await page.locator('#c-threshold').fill(String(G.design && 65)); await page.waitForTimeout(200);
await clickCta('design 运行65'); await waitCta('#go-explain', 30000); await shot('15-第5站-65只在喧哗时提示');
}
await finishStage('design', '16-第5站', { evidence: { value: 'standard' } });
await page.waitForSelector('.rpg-canvas'); await page.waitForTimeout(500);
await focus('地图：出门条', { allowNone: true }); await shot('17-五站完成地图');

/* ---------- 20题考核 ---------- */
if (MODE === 'student') {
  await page.evaluate(() => window.__enterPlace('quiz'));
  await page.waitForSelector('#end-page:not([hidden])'); await page.waitForTimeout(800);
  await focus('出门条：开始考核'); await shot('18-出门条考核');
  await cta().click(); await page.waitForSelector('fieldset.question');
  await focus('考核：第1题'); await shot('19-考核作答');
  for (let guard = 0; guard < 60; guard++) {
    await page.waitForTimeout(150);
    const kind = await page.evaluate(() => { const c = document.querySelector('.cta'); return c ? (c.tagName === 'FIELDSET' ? 'q' : c.id) : ''; });
    if (kind === 'q') { await page.locator('.cta label').nth(GUESS ? Math.floor(rnd() * 4) : guard % 3).click(); continue; }
    if (kind === 'next-exam') { await clickCta('考核：下一页'); continue; }
    if (kind === 'submit-exam') { await clickCta('考核：提交'); break; }
    if (kind === 'return-study') break;
  }
  await page.waitForSelector('#return-study'); await page.waitForTimeout(500);
  await focus('考核：成绩页'); await shot('20-考核成绩与错题解析');
}
/* ---------- 服务端核对 + 教师大屏 + 测试模式 ---------- */
let server = null;
if (MODE === 'student') {
  const me = await page.evaluate(() => fetch('/api/me').then(r => r.json()));
  server = { points: me.points, stars: me.stars, quizAttempts: me.quizAttempts?.length, quizScore: me.quizAttempts?.[0]?.score,
    stations: Object.fromEntries(Object.entries(me.records).map(([k, v]) => [k, { stars: v.summary?.stars, firstPass: v.summary?.firstPass, explainFirst: v.summary?.explainFirst, transferFirst: v.summary?.transferFirst, attempts: v.summary?.attempts, prediction: v.summary?.prediction, predictionCorrect: v.summary?.predictionCorrect, tagsFirst: v.summary?.tagsFirst, reflect: v.summary?.reflect, hintLevel: v.summary?.conceptHintLevel }])), checks };
  const watch = p => { p.on('pageerror', e => errors.push(p.url() + ' ' + e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(p.url() + ' ' + m.text()); }); };
  const t = await page.context().newPage(); watch(t); await t.setViewportSize({ width: W, height: H });
  await t.goto(BASE + '/teacher'); await t.waitForTimeout(1500);
  const sel = t.locator('select').first(); if (await sel.count()) { await sel.selectOption('601').catch(() => {}); await t.waitForTimeout(1500); }
  if (SHOTS) await t.screenshot({ path: `${SHOTS}/21-教师大屏.png` });
  server.teacherHasStudent = (await t.textContent('body')).includes(process.env.NAME || '');
  const tp = await page.context().newPage(); watch(tp); await tp.setViewportSize({ width: W, height: H });
  await tp.goto(BASE + '/test'); await tp.waitForTimeout(1500);
  if (SHOTS) await tp.screenshot({ path: `${SHOTS}/22-教师测试模式.png` });
  server.testModePlaces = await tp.locator('.place:not([disabled])').count();
  await t.close(); await tp.close();
}
const points = await page.textContent('#points');
console.log(JSON.stringify({ tag: TAG, guess: GUESS, steps: log.length, failures: fails, errors, points, server }, null, 1));
fs.writeFileSync(`${process.env.OUTDIR || '.'}/focus-${TAG}.json`, JSON.stringify({ tag: TAG, viewport: [W, H], mode: MODE, steps: log, failures: fails, consoleErrors: errors, points, server }, null, 1));
await browser.close();
