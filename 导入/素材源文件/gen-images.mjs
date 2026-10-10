import { chromium } from '/workspace/tools/pw/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const OUT = process.argv[2]; fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
await p.goto('file://' + process.cwd() + '/render.html');
const jobs = {
  'cover': 'Scenes.cover()',
  'night-square': "Scenes.nightSquare({t:.3, value:'??.?', dance:1})",
  'upstairs-window': 'Scenes.window()',
  'screen-park': 'Scenes.park()', 'screen-museum': 'Scenes.museum()', 'screen-road': 'Scenes.road()'
};
for (const [n, expr] of Object.entries(jobs)) {
  await p.evaluate(e => { document.getElementById('c').innerHTML = eval(e); }, expr);
  await p.screenshot({ path: `${OUT}/${n}.jpg`, type: 'jpeg', quality: 84 });
  console.log(n, fs.statSync(`${OUT}/${n}.jpg`).size);
}
await b.close();
