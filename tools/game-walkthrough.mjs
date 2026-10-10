/*
 * 奖励小游戏无头走查（虚构学生、临时数据库，跑完即删）：
 *  1) 考核85分的学生：报告站出现唯一发光入口 → 进入游戏 → 拖动阈值线 → 四关全部玩完并选“我发现” → 总成绩与班级排行；
 *  2) 考核60分的学生：报告站与 /game 都显示“考核80分以上解锁”和最好成绩，接口拒绝提交；
 *  3) 教师大屏的小游戏面板；1920×1080、手机竖屏截图；全程收集控制台错误。
 * 用法：PLAYWRIGHT=/path/to/playwright/index.mjs node tools/game-walkthrough.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const { createService } = require('../server.cjs');
const quiz = require('../quiz.cjs');
const N = require('../public/game/night-core.js');

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../docs/screenshots/奖励小游戏');
fs.mkdirSync(OUT, { recursive: true });
const names = ['周一帆', '陈子墨', '王乐乐', '赵晨曦', '林小雨', '孙浩然', '李思琪', '吴天佑'];
const roster = names.map((name, i) => ({ id: 'demo-601-' + (i + 1), classId: '601', name }));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lesson5-gamewalk-'));
const svc = createService({ roster, runtimeDir: dir });
await new Promise(r => svc.server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${svc.server.address().port}`;
const errors = [], checks = [];
const ok = (cond, msg) => { checks.push((cond ? '✓ ' : '✗ ') + msg); if (!cond) process.exitCode = 1; };

async function api(ctx, p, body) { const r = await ctx.request.fetch(BASE + p, { method: body ? 'POST' : 'GET', data: body, headers: body ? { 'Content-Type': 'application/json', Origin: BASE } : {} }); return { status: r.status(), body: await r.json() }; }
async function exam(ctx, me, right) {
  const e = (await api(ctx, '/api/exam/create', { sid: me.student.id, round: me.round })).body; const answers = {};
  e.questions.forEach((q, i) => { const o = quiz.questions.find(x => x.id === q.id), c = q.options.indexOf(o.options[o.answer]); answers[q.id] = i < right ? c : (c + 1) % q.options.length; });
  return (await api(ctx, '/api/exam/submit', { sid: me.student.id, round: me.round, examId: e.id, answers })).body;
}
async function student(browser, idx, right, viewport = { width: 1366, height: 768 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') errors.push(`[${names[idx]}] ${m.text()}`); });
  page.on('pageerror', e => errors.push(`[${names[idx]}] ${e.message}`));
  const me = (await api(ctx, '/api/login', { classId: '601', id: roster[idx].id })).body;
  const r = right == null ? null : await exam(ctx, me, right);
  return { ctx, page, me, score: r?.score };
}
/** 只有一个发光主要操作，且在视口内 */
async function singleCta(page, label) {
  const info = await page.evaluate(() => { const vis = [...document.querySelectorAll('.cta')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.height && getComputedStyle(e).visibility !== 'hidden' && !e.closest('[hidden]'); }); const r = vis[0]?.getBoundingClientRect(); return { n: vis.length, inView: !!r && r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth, text: vis[0]?.textContent.trim().slice(0, 30) }; });
  ok(info.n === 1 && info.inView, `${label}：唯一主要操作「${info.text || '无'}」在视口内（${info.n}个）`);
}
const shot = (page, name) => page.screenshot({ path: path.join(OUT, name) });

const browser = await chromium.launch();
try {
  // ---------- 先让几位虚构同学玩过，排行榜有数据 ----------
  const plan = [[1, 18, [[{ t: 0, a: 42 }], [{ t: 0, a: 90, b: 240 }], [{ t: 0, k: 3 }], [{ t: 0, a: 61 }]]], [2, 17, [[{ t: 0, a: 38 }], [{ t: 0, a: 100, b: 100 }], [{ t: 0, k: 10 }], [{ t: 0, a: 56 }]]], [3, 20, [[{ t: 0, a: 50 }], [{ t: 0, a: 80, b: 200 }], [{ t: 0, k: 3 }], [{ t: 0, a: 63 }]]], [4, 16, [[{ t: 0, a: 30 }], [{ t: 0, a: 120, b: 160 }], [{ t: 0, k: 1 }], [{ t: 0, a: 50 }]]]];
  for (const [i, right, logs] of plan) {
    const s = await student(browser, i, right);
    for (const [j, L] of N.LEVELS.entries()) {
      await api(s.ctx, '/api/game/result', { sid: s.me.student.id, round: s.me.round, runId: 'seed-' + i + j, level: L.id, seed: 100 + i * 10 + j, log: logs[j] });
      await api(s.ctx, '/api/game/discover', { sid: s.me.student.id, round: s.me.round, level: L.id, choice: (i + j) % 3 ? 'ok' : L.discover.options[1][0] });
    }
    await s.ctx.close();
  }
  // 另有一位76分（锁定）的同学，大屏显示“解锁人数”
  { const s = await student(browser, 6, 15); await s.ctx.close(); }

  // ---------- 1) 85分学生 ----------
  const A = await student(browser, 0, 17);
  ok(A.score === 85, `周一帆考核 ${A.score} 分`);
  const p = A.page;
  await p.goto(BASE + '/'); await p.waitForSelector('#place-quiz');
  await p.click('#place-quiz'); await p.waitForSelector('#game-entry.open', { timeout: 15000 }); await p.waitForTimeout(600);
  await singleCta(p, '报告站（已解锁）'); await shot(p, '01-报告站-已解锁入口.png');
  await p.click('#game-link'); await p.waitForURL(/\/game$/); await p.waitForSelector('#intro-card');
  await singleCta(p, '第1关开场'); await shot(p, '02-第1关开场.png');
  // 拖动开泵线：从 15% 拖到约 42%
  const box = await p.locator('#chart').boundingBox();
  const geo = await p.evaluate(() => { const c = document.getElementById('chart'); const r = c.getBoundingClientRect(); return { W: r.width, H: r.height }; });
  const yOf = v => box.y + 24 + (1 - v / 100) * (geo.H - 24 - 26);
  const hx = box.x + geo.W - 104 + 50;
  await p.mouse.move(hx, yOf(15)); await p.mouse.down(); await p.mouse.move(hx, yOf(30), { steps: 5 }); await p.mouse.move(hx, yOf(42), { steps: 5 }); await p.mouse.up();
  const a1 = await p.evaluate(() => __nightgame.sim.c.a);
  ok(a1 >= 38 && a1 <= 46, `拖动阈值线：开泵线 15% → ${a1}%`);
  await p.click('#go'); await p.waitForTimeout(5200);
  await shot(p, '03-第1关运行中-数据流.png');
  const flow = await p.evaluate(() => [document.getElementById('f-in').textContent, document.getElementById('f-cmp').textContent, document.getElementById('f-out').textContent]);
  ok(/%/.test(flow[0]) && /</.test(flow[1]) && /水泵/.test(flow[2]), `数据流逐秒显示：${flow.join(' → ')}`);
  await p.evaluate(() => __nightgame.fastForward()); await p.waitForSelector('#result-card');
  await p.waitForTimeout(800);
  await singleCta(p, '第1关结果（先选发现）');
  // 先选错一句，再选对
  await p.click('#disc [data-d="two"]'); await p.waitForTimeout(200);
  ok(await p.locator('#next').isDisabled(), '选错“我发现”时不能进入下一关');
  await p.click('#disc [data-d="ok"]'); await p.waitForTimeout(300);
  await p.mouse.move(box.x + geo.W * 0.4, box.y + geo.H * 0.5); await p.waitForTimeout(200);
  const scrub = await p.locator('#scrub').textContent();
  ok(/第\d+\.\d秒/.test(scrub), `曲线任意时刻读数：${scrub}`);
  await singleCta(p, '第1关结果（已选发现）'); await shot(p, '04-第1关结果-我发现-任意时刻读数.png');
  // 第2关：先用默认一条线跑（会闪），同一晚再试拉开两条线
  await p.click('#next'); await p.waitForSelector('#intro-card');
  await p.click('#go'); await p.waitForTimeout(400); await p.evaluate(() => __nightgame.fastForward()); await p.waitForSelector('#result-card');
  const sw1 = await p.evaluate(() => __nightgame.sim.switches);
  await p.click('#again'); await p.waitForSelector('#intro-card');
  for (let i = 0; i < 15; i++) await p.click('[data-step="b:1"]');
  await p.click('#go'); await p.waitForTimeout(400); await p.evaluate(() => __nightgame.fastForward()); await p.waitForSelector('#result-card');
  const sw2 = await p.evaluate(() => __nightgame.sim.switches);
  ok(sw1 > sw2, `同一晚：一条线开关 ${sw1} 次 → 两条线开关 ${sw2} 次`);
  ok(await p.locator('.g-compare').count() === 1, '结果卡对比“同一晚上次/这次”');
  await p.click('#disc [data-d="ok"]'); await p.waitForTimeout(300); await shot(p, '05-第2关-同一晚对比-两条线.png');
  // 第3关：每1秒 → 电池耗尽；切到每3秒
  await p.click('#next'); await p.waitForSelector('#intro-card');
  await p.click('[data-k="3"]'); await p.click('#go'); await p.waitForTimeout(6000); await shot(p, '06-第3关运行中-采样点.png');
  await p.evaluate(() => __nightgame.fastForward()); await p.waitForSelector('#result-card');
  await p.click('#disc [data-d="ok"]'); await p.waitForTimeout(300); await shot(p, '07-第3关结果-真实曲线揭晓.png');
  // 第4关：报警线拖到 61
  await p.click('#next'); await p.waitForSelector('#intro-card');
  for (let i = 0; i < 11; i++) await p.click('[data-step="a:1"]');
  await p.click('#go'); await p.waitForTimeout(400); await p.evaluate(() => __nightgame.fastForward()); await p.waitForSelector('#result-card');
  await p.click('#disc [data-d="ok"]'); await p.waitForTimeout(300); await shot(p, '08-第4关结果-报警线.png');
  await p.click('#next'); await p.waitForSelector('#final-card'); await p.waitForTimeout(300);
  await singleCta(p, '总成绩'); await shot(p, '09-总成绩-班级排行.png');
  const st = (await api(A.ctx, '/api/game/status')).body;
  const shown = await p.evaluate(() => document.querySelector('#final-card .g-big').textContent);
  ok(Number(shown) === st.game.total, `总成绩页显示 ${shown} 分 = 服务端 ${st.game.total} 分`);
  ok(st.game.plays === 5 && Object.keys(st.game.best).length === 4, `服务端记录：${st.game.plays} 局、四关最好成绩，总分 ${st.game.total}`);
  ok(st.leaderboard.some(b => b.name === '周一帆'), `排行榜含本人（第${st.leaderboard.findIndex(b => b.name === '周一帆') + 1}名）`);
  // 1920×1080
  await p.setViewportSize({ width: 1920, height: 1080 }); await p.click('[data-l="0"]'); await p.waitForSelector('#intro-card'); await p.click('#go'); await p.waitForTimeout(4000);
  await shot(p, '10-1920x1080-第1关运行中.png'); await p.evaluate(() => { __nightgame.fastForward(); });
  await A.ctx.close();

  // ---------- 2) 60分学生：锁定 ----------
  const B = await student(browser, 5, 12);
  ok(B.score === 60, `孙浩然考核 ${B.score} 分`);
  await B.page.goto(BASE + '/'); await B.page.waitForSelector('#place-quiz'); await B.page.click('#place-quiz');
  await B.page.waitForSelector('#game-entry.locked', { timeout: 15000 });
  const lockText = await B.page.locator('#game-entry').textContent();
  ok(lockText.includes('考核80分以上解锁') && lockText.includes('最好成绩 60 分'), `报告站锁定卡：${lockText.trim()}`);
  await B.page.goto(BASE + '/game'); await B.page.waitForSelector('#gate-card.locked');
  await singleCta(B.page, '锁定卡');
  ok((await B.page.locator('#gate-card').textContent()).includes('最好成绩 60 分'), '/game 锁定卡显示最好成绩');
  await shot(B.page, '11-60分-锁定卡.png');
  const forged = await api(B.ctx, '/api/game/result', { sid: B.me.student.id, round: B.me.round, runId: 'x', level: 'garden', seed: 5, log: [], unlocked: true });
  ok(forged.status === 403, `伪造解锁提交被拒（${forged.status} ${forged.body.error}）`);
  ok(await B.page.locator('#hud').isHidden(), '锁定时不显示游戏界面');
  await B.ctx.close();

  // ---------- 3) 手机竖屏 ----------
  const M = await student(browser, 7, 18, { width: 390, height: 844 });
  await M.page.goto(BASE + '/game'); await M.page.waitForSelector('#intro-card'); await singleCta(M.page, '手机竖屏开场');
  await M.page.click('#go'); await M.page.waitForTimeout(3000); await shot(M.page, '12-手机竖屏.png');
  await M.ctx.close();

  // ---------- 4) 教师大屏 ----------
  const T = await browser.newContext({ viewport: { width: 1920, height: 1080 } }); const tp = await T.newPage();
  tp.on('console', m => { if (m.type() === 'error') errors.push('[教师] ' + m.text()); }); tp.on('pageerror', e => errors.push('[教师] ' + e.message));
  await tp.goto(BASE + '/teacher'); await tp.waitForSelector('#c-game .g-wrap', { timeout: 15000 });
  await tp.locator('#c-game').scrollIntoViewIfNeeded(); await tp.waitForTimeout(300);
  await tp.locator('#c-game').screenshot({ path: path.join(OUT, '13-教师大屏-小游戏面板.png') });
  const panel = await tp.locator('#c-game').textContent();
  ok(/解锁 \d+\/8/.test(panel) && panel.includes('本班排行'), '大屏小游戏面板：' + panel.match(/解锁 \d+\/8 人 · 玩过 \d+ 人/)?.[0]);
  // 教师测试试玩
  await tp.goto(BASE + '/game-test'); await tp.waitForSelector('#intro-card'); ok(await tp.locator('[data-l="3"]').isEnabled(), '教师测试模式：四关直接可选，不受分数限制');
  await T.close();
} finally {
  await browser.close();
  await new Promise(r => svc.server.close(r)); svc.close();
  fs.rmSync(dir, { recursive: true, force: true });
}
ok(errors.length === 0, `控制台错误 ${errors.length} 条`);
console.log(checks.join('\n'));
if (errors.length) console.log(errors.join('\n'));
fs.writeFileSync(path.join(OUT, '走查结果.txt'), checks.join('\n') + '\n' + (errors.length ? errors.join('\n') + '\n' : ''));
