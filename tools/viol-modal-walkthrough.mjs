/* Headless：校区关按住↑触发超速弹窗 → 截取倒计时 / 答题 / 恢复 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createService } = require('../server.cjs');
const quiz = require('../quiz.cjs');

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SHOT = path.resolve(ROOT, '../docs/screenshots/奖励小游戏/超速弹窗');
fs.mkdirSync(SHOT, { recursive: true });
const roster = [{ id: 'v601-a', classId: '601', name: '虚构超速生' }];

async function start() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'l5-viol-'));
  const svc = createService({ roster, runtimeDir: dir });
  await new Promise(r => svc.server.listen(0, '127.0.0.1', r));
  return { base: `http://127.0.0.1:${svc.server.address().port}`, stop: () => new Promise(r => svc.server.close(() => { svc.close(); r(); })), dir };
}
async function api(ctx, p, body) {
  const res = await ctx.request.fetch(ctx.base + p, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(ctx.cookie ? { cookie: ctx.cookie } : {}) },
    data: body === undefined ? undefined : body
  });
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
let ok = 0, fail = 0;
const check = (n, c) => { if (c) { ok++; console.log('✓', n); } else { fail++; console.error('✗', n); } };
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const B = { base: S.base, request: page.context().request, cookie: '', me: null };
  B.me = (await api(B, '/api/login', { classId: '601', id: 'v601-a' })).body;
  if (B.cookie) {
    const name = B.cookie.split('=')[0];
    await page.context().addCookies([{ name, value: B.cookie.slice(name.length + 1), url: S.base }]);
  }
  await exam(B, B.me, 16);
  await page.goto(S.base + '/game');
  await page.waitForSelector('.level-card');
  await page.click('.level-card[data-lv="school"]');
  await page.waitForSelector('#start-race');
  // 设较低阈值，更容易超速
  const slider = page.locator('#ctrl-a, input[name="a"], input[data-key="a"]').first();
  if (await slider.count()) {
    await slider.fill('35');
  } else {
    await page.evaluate(() => {
      const inp = document.querySelector('input[type="range"]');
      if (inp) { inp.value = 35; inp.dispatchEvent(new Event('input', { bubbles: true })); }
    });
  }
  await page.click('#start-race');
  await page.waitForSelector('#race-canvas');
  await page.locator('#race-canvas').click();
  // 按住加速直到弹窗
  await page.keyboard.down('ArrowUp');
  const modal = page.locator('#viol-modal:not([hidden]), .viol-modal:not([hidden])');
  await modal.waitFor({ timeout: 15000 });
  check('超速弹窗出现', await modal.isVisible());
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SHOT, '01-知识点倒计时.png') });
  // 等满 3 秒
  await page.waitForSelector('#viol-next:not([disabled])', { timeout: 8000 });
  await page.screenshot({ path: path.join(SHOT, '02-倒计时结束可继续.png') });
  await page.click('#viol-next');
  await page.waitForSelector('#viol-opts');
  await page.screenshot({ path: path.join(SHOT, '03-超速问答题.png') });
  // 按 RaceCore 暴露的当前题答案作答（页面会话里 vs.q.answer）
  const ansIdx = await page.evaluate(() => {
    // play.mjs 未挂全局；根据选项文案在 QUIZ 里反查
    const q = document.querySelector('.viol-card h2')?.textContent || '';
    const opts = [...document.querySelectorAll('#viol-opts button')].map(b => b.textContent.replace(/^\d/, '').trim());
    return { q, opts };
  });
  // 用键盘 1-4：从 race-core 找正确项
  const R = require('../public/game/race-core.js');
  const pool = Object.values(R.QUIZ).flat();
  const item = pool.find(x => ansIdx.q.includes(x.q.slice(0, 12)) || x.q.includes(ansIdx.q.slice(0, 12)));
  const choice = item ? item.a : 1;
  await page.keyboard.press(String(choice + 1));
  await page.waitForTimeout(700);
  const fb = await page.locator('#viol-fb').textContent().catch(() => '');
  check('答对反馈', /正确/.test(fb || ''));
  await page.waitForFunction(() => {
    const m = document.getElementById('viol-modal');
    return !m || m.hidden || getComputedStyle(m).display === 'none';
  }, { timeout: 5000 }).catch(() => {});
  await page.keyboard.up('ArrowUp');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SHOT, '04-答题后继续巡查.png') });
  check('截图已写入超速弹窗目录', fs.readdirSync(SHOT).filter(f => f.endsWith('.png')).length >= 3);
  console.log('shots', fs.readdirSync(SHOT));
} catch (e) {
  fail++; console.error(e);
} finally {
  await browser.close();
  await S.stop();
}
console.log(`viol-walkthrough ok=${ok} fail=${fail}`);
process.exit(fail ? 1 : 0);
