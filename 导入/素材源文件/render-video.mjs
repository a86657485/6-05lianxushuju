import { chromium } from '/workspace/tools/pw/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const DIR = '/workspace/l5/work/intro/frames'; fs.rmSync(DIR, { recursive: true, force: true }); fs.mkdirSync(DIR);
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.goto('file://' + process.cwd() + '/video.html');
const meta = await p.evaluate(() => window.META); console.log(JSON.stringify(meta));
fs.writeFileSync('meta.json', JSON.stringify(meta));
const N = 22 * 25;
for (let i = 0; i < N; i++) { await p.evaluate(t => frame(t), i / 25); await p.screenshot({ path: `${DIR}/f${String(i).padStart(4, '0')}.png` }); }
await b.close(); console.log('frames', N);
