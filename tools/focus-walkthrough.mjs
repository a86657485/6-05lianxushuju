/* 沉浸版完整走查：机器人“学生”只点亮着的主要操作（选项组里按需选一个），每一步记录焦点。 */
/*
 * 用法（先启动课堂服务，最好用临时数据库和虚构名单）：
 *   PLAYWRIGHT=/path/to/node_modules/playwright/index.mjs BASE=http://127.0.0.1:8796 W=1366 H=768 SHOTS=docs/screenshots/沉浸版 node tools/focus-walkthrough.mjs
 *   MODE=demo 走 /demo（不登录、不写数据）；REDUCED=1 模拟“减少动态效果”；NAME=手动填写的姓名（填名单里已有的名字会触发同名确认）。
 * 每一步检查：页面上恰好一个发光的主要操作（.cta），它在视口内，且中心没有被其他元素挡住。结果写入 OUTDIR/focus-<尺寸>.json。
 */
import fs from 'node:fs';
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:8797';
const W = Number(process.env.W || 1366), H = Number(process.env.H || 768);
const MODE = process.env.MODE || 'student';           // student | demo
const SHOTS = process.env.SHOTS || '';                  // 截图目录（空则不截）
const TAG = process.env.TAG || `${W}x${H}`;
const MOBILE = W < 700;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, isMobile: MOBILE, hasTouch: MOBILE, reducedMotion: process.env.REDUCED ? 'reduce' : 'no-preference' });
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
await page.waitForSelector('#map:not([hidden])'); await page.waitForTimeout(500);
await focus('地图：第1站'); await shot('03-小区地图');
const G = await goals();

async function answerCards(stage, wrong = {}) {
  for (let guard = 0; guard < 30; guard++) {
    await page.waitForTimeout(450);
    const where = await page.evaluate(() => { const c = document.querySelector('.cta'); return c ? (c.id || (c.closest('[data-card]')?.dataset.card) || c.className) : ''; });
    if (where === 'check' || where === 'next' || where === 'celebrate-next' || where === 'back-to-experiment') return where;
    const card = where;
    let value;
    if (card === 'transfer') value = G[stage].transfer;
    else if (card.startsWith('case:')) value = G[stage].transfer[card.slice(5)];
    else value = G[stage].explain[card];
    if (wrong[card] && !wrong[card].used) { value = wrong[card].value; wrong[card].used = true; }
    await chooseIn(`${stage} 说清楚：卡片 ${card}`, `[data-value="${value}"]`);
  }
  throw new Error('卡片循环未结束');
}
async function finishStage(stage, shotName, wrong) {
  await waitCta('#go-explain'); await focus(`${stage} 实验完成`); if (shotName) await shot(shotName + '-实验证据');
  await cta().click();
  let r = await answerCards(stage, wrong);
  if (r === 'check') {
    if (shotName) await shot(shotName + '-说清楚');
    await clickCta(`${stage} 检验`);
    await page.waitForTimeout(500);
    if (await page.isVisible('#celebrate:not([hidden])')) r = 'celebrate';
    else {
      await focus(`${stage} 标红后修订`); if (shotName) await shot(shotName + '-标红修订');
      // 求助按钮：提示与聚光灯
      await page.click('#help'); await page.waitForTimeout(300); if (shotName) await shot(shotName + '-求助聚光灯'); await page.mouse.click(5, H - 5); 
      r = await answerCards(stage, {});
      if (r === 'back-to-experiment') return 'redo';
      await clickCta(`${stage} 再次检验`);
      await page.waitForSelector('#celebrate:not([hidden])');
    }
  }
  await page.waitForSelector('#celebrate:not([hidden])');
  await focus(`${stage} 通关庆祝`); if (shotName) await shot(shotName + '-通关');
  await cta().click(); await page.waitForSelector('#map:not([hidden])'); await page.waitForTimeout(400);
  return 'ok';
}
async function enterStage(stage, n) {
  await clickCta(`地图：前往第${n}站`);
  await page.waitForSelector('#level:not([hidden])'); await page.waitForTimeout(900);
  await focus(`${stage} 想一想`);
}

/* ---------- 第1站 广场监测器 ---------- */
await enterStage('flow', 1); await shot('04-第1站-想一想');
await chooseIn('flow 预测', `[data-predict="${G.flow.prediction}"]`); await page.waitForTimeout(1000);
await clickCta('flow 实验1'); await page.waitForTimeout(1700);
await clickCta('flow 实验2'); await page.waitForTimeout(1700); await shot('05-第1站-广场监测器');
await finishStage('flow', '06-第1站', { input: { value: 'collector' } });

/* ---------- 第2站 声音记录亭 ---------- */
await enterStage('wave', 2);
await chooseIn('wave 预测', `[data-predict="scatter"]`); await page.waitForTimeout(1000);
await clickCta('wave 开始录音');
await waitCta('.fader'); await focus('wave 录音中：拖推杆');
for (const v of [40, 55, 70, 85, 75, 60, 45, 35, 50, 70, 88, 80, 60, 40, 32, 50, 66, 80, 70, 55, 42, 36, 50, 64]) { await page.locator('#knob').fill(String(v)); await page.waitForTimeout(400); }
await waitCta('#wave-chart', 15000); await focus('wave 在两个圆点之间点'); await shot('07-第2站-录好曲线');
{ const box = await page.locator('#wave-chart svg').boundingBox(); const s = { l: 52, r: 18, w: 640 }; const t = 3.1; const x = box.x + (s.l + t / 10 * (s.w - s.l - s.r)) / s.w * box.width; await page.mouse.click(x, box.y + box.height * 0.5); }
await page.waitForTimeout(400); await shot('08-第2站-两点之间读数');
await finishStage('wave', '', {});

/* ---------- 第3站 3号楼小明家 ---------- */
await enterStage('life', 3);
await chooseIn('life 预测', `[data-predict="${G.life.prediction}"]`); await page.waitForTimeout(1000);
await focus('life 拉窗帘');
for (let v = 5; v <= 100; v += 5) { await page.locator('#curtain').fill(String(v)); await page.waitForTimeout(60); }
await page.waitForTimeout(1300);
await clickCta('life 开始烧水'); await waitCta('#kettle-read'); await page.waitForTimeout(1300);
await focus('life 读水温'); await shot('09-第3站-窗帘与水壶'); await cta().click(); await page.waitForTimeout(300);
await finishStage('life', '10-第3站', { lamp: { value: 'c' } });

/* ---------- 第4站 物业控制室 ---------- */
await enterStage('threshold', 4);
await chooseIn('threshold 预测', `[data-predict="same"]`); await page.waitForTimeout(1000);
await clickCta('threshold 55运行'); await waitCta('#th-slider', 30000);
await focus('threshold 换阈值'); await page.locator('#th-slider').fill('45'); await page.waitForTimeout(200);
await clickCta('threshold 45运行'); await page.waitForTimeout(600); await shot('11-第4站-回放中');
await waitCta('#go-explain', 30000); await shot('12-第4站-两次阈值对比');
await finishStage('threshold', '13-第4站', { 'case:fridge': { value: '冷藏区' } });

/* ---------- 第5站 屋顶种植园 ---------- */
await enterStage('design', 5);
await chooseIn('design 预测', `[data-predict="${G.design.prediction}"]`); await page.waitForTimeout(1000);
await chooseIn('design ①选数据', '#g-data-moisture');
await chooseIn('design ②选方向', '#g-dir-below');
await focus('design ③设阈值'); await page.locator('#g-threshold').fill('60'); await page.waitForTimeout(200);
await clickCta('design 运行60%'); await waitCta('.fader', 30000); await shot('14-第5站-阈值60不合适');
await focus('design 调整阈值'); await page.locator('#g-threshold').fill('35'); await page.waitForTimeout(200);
await clickCta('design 运行35%'); await waitCta('#go-explain', 30000); await shot('15-第5站-阈值35合适');
await finishStage('design', '16-第5站', {});
await focus('地图：巡查报告站'); await shot('17-五站完成地图');

/* ---------- 20题考核 ---------- */
if (MODE === 'student') {
  await clickCta('地图：前往巡查报告站'); await page.waitForSelector('#end-page:not([hidden])'); await page.waitForTimeout(800);
  await focus('报告站：开始考核'); await shot('18-巡查报告站');
  await cta().click(); await page.waitForSelector('fieldset.question');
  await focus('考核：第1题'); await shot('19-考核作答');
  for (let guard = 0; guard < 60; guard++) {
    await page.waitForTimeout(150);
    const kind = await page.evaluate(() => { const c = document.querySelector('.cta'); return c ? (c.tagName === 'FIELDSET' ? 'q' : c.id) : ''; });
    if (kind === 'q') { await page.locator('.cta label').nth(guard % 3).click(); continue; }
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
  server = { points: me.points, quizAttempts: me.quizAttempts?.length };
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
console.log(JSON.stringify({ tag: TAG, steps: log.length, failures: fails, errors, points, server }, null, 1));
fs.writeFileSync(`${process.env.OUTDIR || '.'}/focus-${TAG}.json`, JSON.stringify({ tag: TAG, viewport: [W, H], mode: MODE, steps: log, failures: fails, consoleErrors: errors, points, server }, null, 1));
await browser.close();
