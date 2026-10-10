/* Headless：考核≥80 解锁卡丁车并驾驶一关；<80 见锁定卡；教师测试可进；无控制台错误。 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createService } = require('../server.cjs');
const quiz = require('../quiz.cjs');
const R = require('../public/game/race-core.js');

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SHOT = path.resolve(ROOT, '../docs/screenshots/奖励小游戏');
fs.mkdirSync(SHOT, { recursive: true });
const roster = [{ id: 'w601-a', classId: '601', name: '虚构驰一' }, { id: 'w601-b', classId: '601', name: '虚构驰二' }];
let ok = 0, fail = 0;
const check = (name, cond) => { if (cond) { ok++; console.log('✓', name); } else { fail++; console.error('✗', name); } };

async function start() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'l5-kart-'));
  const svc = createService({ roster, runtimeDir: dir });
  await new Promise(r => svc.server.listen(0, '127.0.0.1', r));
  return { base: `http://127.0.0.1:${svc.server.address().port}`, stop: () => new Promise(r => svc.server.close(() => { svc.close(); r(); })), dir };
}
async function api(ctx, p, body) {
  const res = await ctx.request.fetch(ctx.base + p, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...(ctx.cookie ? { cookie: ctx.cookie } : {}) }, data: body === undefined ? undefined : body });
  const sc = res.headers()['set-cookie']; if (sc) ctx.cookie = sc.split(';')[0];
  const ct = res.headers()['content-type'] || '';
  return { status: res.status(), body: ct.includes('json') ? await res.json() : await res.text() };
}
async function exam(ctx, me, right) {
  const e = (await api(ctx, '/api/exam/create', { sid: me.student.id, round: me.round })).body;
  const answers = {};
  e.questions.forEach((q, i) => {
    const orig = quiz.questions.find(x => x.id === q.id), correct = q.options.indexOf(orig.options[orig.answer]);
    answers[q.id] = i < right ? correct : (correct + 1) % q.options.length;
  });
  return (await api(ctx, '/api/exam/submit', { sid: me.student.id, round: me.round, examId: e.id, answers })).body;
}

const browser = await chromium.launch({ headless: true });
const S = await start();
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  // A: locked under 80 — API 登录后带 cookie 打开 /game
  const B = { base: S.base, request: page.context().request, cookie: '', me: null };
  B.me = (await api(B, '/api/login', { classId: '601', id: 'w601-a' })).body;
  // 把 API Set-Cookie 同步到浏览器上下文
  if (B.cookie) {
    const [nv] = B.cookie.split('=');
    const val = B.cookie.slice(nv.length + 1);
    await page.context().addCookies([{ name: nv, value: val, url: S.base }]);
  }
  await exam(B, B.me, 15); // 75
  await page.goto(S.base + '/game');
  await page.waitForSelector('#game-locked, .gate-card');
  const locked = await page.textContent('body');
  check('75分显示锁定文案', /80/.test(locked) && /解锁/.test(locked));
  await page.screenshot({ path: path.join(SHOT, '01-锁定-75分.png'), fullPage: true });

  // forge reject
  const forged = await api(B, '/api/game/result', { sid: B.me.student.id, round: B.me.round, runId: 'x', level: 'school', seed: 5, log: [], unlocked: true });
  check('伪造解锁被拒', forged.status === 403);

  // B: unlock 80 and play
  await exam(B, B.me, 16); // 80
  await page.goto(S.base + '/game');
  await page.waitForSelector('#hub-card, .level-card');
  check('80分解锁见到选关', await page.locator('.level-card').count() >= 4);
  await page.screenshot({ path: path.join(SHOT, '02-选关大厅.png') });

  await page.click('.level-card[data-lv="school"]');
  await page.waitForSelector('#setup-card, #start-race');
  await page.screenshot({ path: path.join(SHOT, '03-设限速阈值.png') });
  await page.click('#start-race');
  await page.waitForSelector('#race-canvas');
  // drive: hold up for a bit
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(2500);
  await page.keyboard.up('ArrowUp');
  await page.screenshot({ path: path.join(SHOT, '04-手动驾驶-车速表.png') });
  await page.click('#mode-auto');
  await page.waitForTimeout(2000);
  check('可切换自动驾驶', await page.locator('#mode-auto.on').count() === 1);
  await page.screenshot({ path: path.join(SHOT, '04b-自动驾驶-阈值巡航.png') });
  await page.click('#mode-manual');
  // 一关约20秒：持续加油直到结算（自动驾驶更快跟阈值跑完）
  await page.click('#mode-auto');
  await page.waitForSelector('#result-card', { timeout: 45000 });
  check('跑完出现结算', await page.locator('#result-card').count() === 1);
  await page.screenshot({ path: path.join(SHOT, '05-结算与发现.png') });
  await page.click('[data-d="ok"]');
  await page.waitForTimeout(300);

  // teacher test
  const tp = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await tp.goto(S.base + '/game-test');
  await tp.waitForSelector('#hub-card, .level-card');
  check('教师测试可进', await tp.locator('.level-card').count() >= 1);
  await tp.screenshot({ path: path.join(SHOT, '06-教师测试.png') });
  await tp.close();

  check('无控制台错误', errors.length === 0);
  if (errors.length) console.error(errors.slice(0, 5));
} finally {
  await browser.close();
  await S.stop();
}
console.log(`\nwalkthrough ${ok} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
