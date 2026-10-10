/*
 * 奖励小游戏场景绘制（精致版）：与主应用 world-art 同一夜晚小区画风，
 * 叠用 Kenney CC0 素材（月亮、栅栏、草地、树、花、星星）并加夜色色调。
 */
import { xiaodi } from '/world-art.mjs';
import { drawPlant } from '/game/plant-art.mjs?v=2';
import { drawSprite } from '/game/assets.mjs?v=1';

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- 通用 ---------- */
export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
export function label(ctx, text, x, y, color = '#e8f1f7', size = 15, align = 'center') {
  ctx.font = `bold ${size}px 'PingFang SC','Microsoft YaHei','Noto Sans CJK SC',sans-serif`;
  ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 4; ctx.fillText(text, x, y); ctx.shadowBlur = 0;
}
function glow(ctx, x, y, r, rgbaInner, rgbaOuter = 'rgba(0,0,0,0)') {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgbaInner); g.addColorStop(1, rgbaOuter);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
}
function badge(ctx, text, x, y, bg = 'rgba(8,20,40,.78)', color = '#ffd36b') {
  ctx.font = `bold 14px 'PingFang SC','Microsoft YaHei','Noto Sans CJK SC',sans-serif`;
  const w = ctx.measureText(text).width + 18;
  roundRect(ctx, x - w / 2, y - 14, w, 28, 10); ctx.fillStyle = bg; ctx.fill();
  ctx.strokeStyle = 'rgba(255,211,107,.35)'; ctx.lineWidth = 1.5; ctx.stroke();
  label(ctx, text, x, y, color, 14);
}

/* ---------- 夜空背景（每关略有不同） ---------- */
const bgCache = {};
export function nightSky(ctx, W, H, levelId, seed = 1) {
  const key = levelId + '|' + Math.round(W) + 'x' + Math.round(H);
  if (!bgCache[key]) {
    const c = document.createElement('canvas'); c.width = Math.round(W); c.height = Math.round(H);
    const g = c.getContext('2d');
    const sky = g.createLinearGradient(0, 0, 0, H);
    const pal = {
      garden: ['#0a1428', '#152a4a', '#1a3550'],
      lamp: ['#070e1c', '#101e38', '#182848'],
      sample: ['#0b1224', '#142038', '#1c2c48'],
      alarm: ['#0c101c', '#1a2034', '#242840']
    }[levelId] || ['#0b1630', '#13284a', '#1d3a66'];
    sky.addColorStop(0, pal[0]); sky.addColorStop(.55, pal[1]); sky.addColorStop(1, pal[2]);
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    // 星点（同步绘制）
    let r = ((seed + 11) * 1664525 + 1013904223) >>> 0;
    for (let i = 0; i < 100; i++) {
      r = (r * 1664525 + 1013904223) >>> 0; const rx = (r / 4294967296) * W;
      r = (r * 1664525 + 1013904223) >>> 0; const ry = (r / 4294967296) * H * 0.55;
      r = (r * 1664525 + 1013904223) >>> 0; const rr = 0.5 + (r / 4294967296) * 1.8;
      r = (r * 1664525 + 1013904223) >>> 0; g.globalAlpha = 0.35 + (r / 4294967296) * 0.6;
      g.fillStyle = '#fff'; g.beginPath(); g.arc(rx, ry, rr, 0, 7); g.fill();
    }
    g.globalAlpha = 1;
    // 远山剪影
    g.fillStyle = 'rgba(8,18,36,.85)';
    g.beginPath(); g.moveTo(0, H * .62);
    for (let i = 0; i <= 8; i++) g.lineTo(W * i / 8, H * (.52 + ((i * 17 + seed) % 7) / 100));
    g.lineTo(W, H); g.lineTo(0, H); g.fill();
    bgCache[key] = { c };
  }
  const b = bgCache[key];
  ctx.drawImage(b.c, 0, 0, W, H);
  // 月亮（Kenney）
  const mx = W * .86, my = H * .12, ms = Math.min(56, W * .07);
  if (!drawSprite(ctx, 'moon', mx - ms / 2, my - ms / 2, ms, ms, { opacity: .95 })) {
    glow(ctx, mx, my, ms, 'rgba(255,246,216,.95)', 'rgba(255,246,216,0)');
  } else {
    glow(ctx, mx, my, ms * 1.6, 'rgba(255,246,200,.22)', 'rgba(255,246,200,0)');
  }
  // 薄云（夜色）
  drawSprite(ctx, 'cloud1', W * .08, H * .08, W * .18, null, { nightTint: .55, opacity: .55 });
  drawSprite(ctx, 'cloud2', W * .45, H * .05, W * .14, null, { nightTint: .6, opacity: .4 });
}

function ground(ctx, W, H, y, color = '#14263f') {
  const g = ctx.createLinearGradient(0, y, 0, H);
  g.addColorStop(0, color); g.addColorStop(1, '#0a1424');
  ctx.fillStyle = g; ctx.fillRect(0, y, W, H - y);
}
function cityRow(ctx, W, base, seed) {
  const blocks = [
    [0.01, 0.15, 0.72, "#1b3550"], [0.18, 0.12, 0.52, "#1a3150"],
    [0.55, 0.18, 0.78, "#16304a"], [0.76, 0.10, 0.48, "#1c3858"], [0.88, 0.11, 0.58, "#152a44"]
  ];
  let r = (seed * 1664525 + 1013904223) >>> 0;
  for (let i = 0; i < blocks.length; i++) {
    const [fx, fw, fh, col] = blocks[i];
    const x = W * fx, w = W * fw, h = base * fh * 0.85, top = base - h;
    ctx.fillStyle = col; ctx.fillRect(x, top, w, h);
    ctx.fillStyle = "#122438"; ctx.fillRect(x - 3, top - 8, w + 6, 10);
    const colsN = Math.max(2, Math.floor(w / 26)), rowsN = Math.max(2, Math.floor(h / 30));
    const gx = w / colsN, gy = (h - 14) / rowsN;
    for (let c = 0; c < colsN; c++) for (let rr = 0; rr < rowsN; rr++) {
      r = (r * 1664525 + 1013904223) >>> 0;
      const on = (r / 4294967296) < 0.42;
      ctx.fillStyle = on ? ((r % 10) < 7 ? "#ffd88a" : "#ffe9b8") : "#0f2236";
      ctx.globalAlpha = on ? 0.95 : 0.88;
      const wx = x + c * gx + gx * 0.2, wy = top + 10 + rr * gy;
      ctx.fillRect(wx, wy, gx * 0.55, gy * 0.48);
    }
    ctx.globalAlpha = 1;
  }
}

/* ---------- 粒子 ---------- */
export class Particles {
  constructor() { this.list = []; }
  emit(kind, x, y, n = 8) {
    if (reduced()) return;
    for (let i = 0; i < n; i++) {
      this.list.push({
        kind, x, y,
        vx: (Math.random() - .5) * (kind === 'water' ? 40 : 80),
        vy: kind === 'water' ? 20 + Math.random() * 60 : -40 - Math.random() * 80,
        life: 1, age: 0, r: 2 + Math.random() * 3,
        hue: kind === 'spark' ? 45 + Math.random() * 20 : kind === 'glow' ? 48 : 190
      });
    }
    if (this.list.length > 80) this.list.splice(0, this.list.length - 80);
  }
  update(dt) {
    for (const p of this.list) {
      p.age += dt; p.life -= dt * (p.kind === 'water' ? .9 : 1.2);
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.kind === 'water') p.vy += 120 * dt; else p.vy += 30 * dt;
    }
    this.list = this.list.filter(p => p.life > 0);
  }
  draw(ctx) {
    for (const p of this.list) {
      ctx.globalAlpha = Math.max(0, p.life);
      if (p.kind === 'water') {
        ctx.fillStyle = '#7fd8ff'; ctx.beginPath();
        ctx.ellipse(p.x, p.y, p.r * .6, p.r * 1.2, 0, 0, 7); ctx.fill();
      } else if (p.kind === 'glow') {
        glow(ctx, p.x, p.y, p.r * 4, `rgba(255,220,120,${.5 * p.life})`, 'rgba(255,220,120,0)');
      } else {
        ctx.fillStyle = `hsl(${p.hue} 90% 65%)`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }
}

/* ---------- 小递（更大更精致 + 姿态） ---------- */
let xiaodiImg = null;
export function ensureXiaodi() {
  if (xiaodiImg) return xiaodiImg;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="150" viewBox="0 0 80 100">${xiaodi(0, 0, 1, { eye: '#7fe6dc', lamp: '#5ff0e0' })}</svg>`;
  xiaodiImg = new Image(); xiaodiImg.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  return xiaodiImg;
}
export function drawXiaodi(ctx, x, y, sc = 1, opts = {}) {
  const im = ensureXiaodi();
  const bob = reduced() ? 0 : Math.sin((opts.t || 0) * 3) * 3;
  const w = 80 * sc, h = 100 * sc;
  // 地面阴影
  ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.beginPath(); ctx.ellipse(x + w / 2, y + h - 4, w * .28, 6, 0, 0, 7); ctx.fill();
  if (im.complete) ctx.drawImage(im, x, y + bob, w, h);
}

/* ---------- 四关场景 ---------- */
export function sceneGarden(ctx, W, H, sim, row, t, particles) {
  nightSky(ctx, W, H, 'garden', 3);
  cityRow(ctx, W, H * .72, 3);
  ground(ctx, W, H, H * .72, '#1a2e28');
  // 草地条带（Kenney grass，夜色）
  for (let i = 0; i < 6; i++) drawSprite(ctx, 'grass' + ((i % 4) + 1), W * (.05 + i * .16), H * .78, W * .14, null, { nightTint: .45, opacity: .85 });
  // 栅栏
  drawSprite(ctx, 'fence', W * .08, H * .68, W * .28, null, { nightTint: .35, opacity: .9 });
  drawSprite(ctx, 'fence', W * .55, H * .68, W * .28, null, { nightTint: .35, opacity: .9, flip: true });
  // 背景树
  drawSprite(ctx, 'tree1', W * .02, H * .42, W * .14, null, { nightTint: .5 });
  drawSprite(ctx, 'tree2', W * .82, H * .4, W * .16, null, { nightTint: .5 });
  drawSprite(ctx, 'bush1', W * .18, H * .66, W * .08, null, { nightTint: .4 });
  drawSprite(ctx, 'bush2', W * .72, H * .66, W * .09, null, { nightTint: .4 });

  const m = row ? row.truth : sim.value, w = row?.weather || 'sunny';
  const mood = m < 30 ? 'dry' : m > 85 ? 'wet' : 'ok';
  const prog = Math.min(1, sim.stats.good / (sim.L.ticks * .8));
  // 花坛
  const bedY = H * .86, bedW = W * .55, bedX = W * .22;
  ctx.fillStyle = '#4a3428'; roundRect(ctx, bedX, bedY - 18, bedW, 36, 14); ctx.fill();
  ctx.fillStyle = '#3a281c'; roundRect(ctx, bedX + 6, bedY - 12, bedW - 12, 24, 10); ctx.fill();
  // 湿润水面反光
  const wet = Math.min(.7, m / 120);
  ctx.fillStyle = `rgba(80,160,220,${wet})`;
  roundRect(ctx, bedX + 10, bedY - 8, (bedW - 20) * Math.max(.15, m / 100), 16, 8); ctx.fill();
  // 三株花
  const plants = [[bedX + bedW * .2, .85], [bedX + bedW * .5, 1], [bedX + bedW * .78, .9]];
  for (const [px, k] of plants) {
    ctx.save(); ctx.translate(px, bedY - 6); ctx.scale(k * Math.min(1.1, W / 700), k * Math.min(1.1, W / 700));
    drawPlant(ctx, 0, 0, prog, mood, t * 1000 + px);
    ctx.restore();
  }
  // 小花点缀（Kenney leaves）
  if (mood === 'ok' && prog > .4) {
    drawSprite(ctx, 'flower1', bedX + bedW * .12, bedY - 40, 28, null, { nightTint: .15 });
    drawSprite(ctx, 'flower2', bedX + bedW * .62, bedY - 36, 26, null, { nightTint: .15 });
  }

  // 水泵（精致）
  const px = W * .12, py = H * .62;
  glow(ctx, px + 28, py + 20, 40, 'rgba(63,193,181,.15)', 'rgba(63,193,181,0)');
  ctx.fillStyle = '#2a9d94'; roundRect(ctx, px, py, 56, 52, 12); ctx.fill();
  ctx.fillStyle = '#1a706a'; roundRect(ctx, px + 8, py + 10, 40, 16, 6); ctx.fill();
  ctx.fillStyle = '#7fe6dc'; ctx.fillRect(px + 22, py - 14, 12, 18);
  label(ctx, '水泵', px + 28, py + 66, '#9fb3c8', 13);
  // 水管
  ctx.strokeStyle = '#2b8f86'; ctx.lineWidth = 7; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(px + 56, py + 14); ctx.quadraticCurveTo(W * .25, H * .55, bedX + 20, bedY - 20); ctx.stroke();
  if (row?.on) {
    if (!reduced() && Math.random() < .4) particles?.emit('water', bedX + bedW * .3, bedY - 30, 2);
    // 水柱
    ctx.strokeStyle = 'rgba(127,216,255,.7)'; ctx.lineWidth = 3;
    for (let i = 0; i < 5; i++) {
      const p = ((t * 1.8 + i / 5) % 1);
      ctx.beginPath(); ctx.arc(bedX + 40 + p * 80, bedY - 40 + p * p * 50, 2.5, 0, 7); ctx.fillStyle = '#9ae8ff'; ctx.fill();
    }
    badge(ctx, '💧 浇水中', px + 28, py - 24, 'rgba(20,60,70,.85)', '#7fe6dc');
  }

  // 湿度传感器探针
  const sx = bedX + bedW - 20, sy = bedY - 50;
  ctx.fillStyle = '#c9d8de'; ctx.fillRect(sx, sy, 6, 48);
  ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.arc(sx + 3, sy, 10, 0, 7); ctx.fill();
  glow(ctx, sx + 3, sy, 22, 'rgba(255,209,102,.35)', 'rgba(255,209,102,0)');
  badge(ctx, `湿度 ${row ? row.reading : '—'}%`, sx - 10, sy - 28);

  // 天气
  if (w === 'rain') {
    if (!reduced()) {
      ctx.strokeStyle = 'rgba(160,210,255,.55)'; ctx.lineWidth = 1.5;
      for (let i = 0; i < 50; i++) {
        const x = (i * 97 + t * 180) % W, y = (i * 53 + t * 320) % (H * .75);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 5, y + 14); ctx.stroke();
      }
    }
    badge(ctx, '🌧 下雨 · 湿度往上涨', W / 2, H * .08, 'rgba(30,60,90,.8)', '#9fd8ff');
  } else if (w === 'heat') {
    glow(ctx, W * .7, H * .2, 80, 'rgba(255,140,80,.12)', 'rgba(255,140,80,0)');
    badge(ctx, '🌡 闷热 · 蒸发加快', W / 2, H * .08, 'rgba(60,30,20,.8)', '#ffb38a');
  } else badge(ctx, '晴 · 水分慢慢蒸发', W / 2, H * .08, 'rgba(20,35,55,.7)', '#cfe0ee');

  badge(ctx, mood === 'dry' ? '太干了！' : mood === 'wet' ? '太湿了！' : '舒服 ✨', W / 2, H * .36,
    mood === 'ok' ? 'rgba(20,60,40,.8)' : 'rgba(60,25,25,.8)', mood === 'ok' ? '#4cd28a' : '#ff9a8e');

  drawXiaodi(ctx, W * .78, H * .52, Math.min(1.15, W / 700), { t });
}

export function sceneLamp(ctx, W, H, sim, row, t, particles) {
  nightSky(ctx, W, H, 'lamp', 7);
  cityRow(ctx, W, H * .7, 7);
  ground(ctx, W, H, H * .7, '#121c30');
  // 天黑遮罩
  const lux = row ? row.truth : sim.env.truth[0];
  const dark = 1 - Math.min(1, lux / 420);
  ctx.fillStyle = `rgba(0,4,16,${dark * .5})`; ctx.fillRect(0, 0, W, H * .7);

  drawSprite(ctx, 'tree3', W * .05, H * .38, W * .13, null, { nightTint: .55 });
  drawSprite(ctx, 'pine', W * .88, H * .36, W * .12, null, { nightTint: .5 });

  // 路灯杆
  const lx = W * .48, top = H * .28;
  ctx.fillStyle = '#5c6f86';
  ctx.fillRect(lx - 6, top, 12, H * .7 - top);
  // 灯臂
  ctx.fillRect(lx - 6, top, 70, 8);
  const on = row?.on && !sim.broken;
  const lampX = lx + 58, lampY = top + 14;
  if (on) {
    // 灯罩光锥
    const beam = ctx.createRadialGradient(lampX, lampY, 4, lampX, lampY + 80, 160);
    beam.addColorStop(0, 'rgba(255,230,150,.85)'); beam.addColorStop(.45, 'rgba(255,210,100,.28)'); beam.addColorStop(1, 'rgba(255,200,80,0)');
    ctx.fillStyle = beam;
    ctx.beginPath(); ctx.moveTo(lampX - 12, lampY); ctx.lineTo(lampX - 90, H * .72); ctx.lineTo(lampX + 100, H * .72); ctx.closePath(); ctx.fill();
    if (!reduced() && Math.random() < .15) particles?.emit('glow', lampX, lampY + 10, 1);
  }
  // 灯罩
  ctx.fillStyle = sim.broken ? '#444' : on ? '#ffe9a8' : '#8a96a6';
  ctx.beginPath(); ctx.ellipse(lampX, lampY, 20, 10, 0, 0, 7); ctx.fill();
  if (on) glow(ctx, lampX, lampY, 36, 'rgba(255,230,150,.55)', 'rgba(255,230,150,0)');
  if (sim.broken) badge(ctx, '💥 灯泡烧坏了', lampX, top - 20, 'rgba(60,20,20,.85)', '#ff9a8e');

  // 寿命格
  const lifeY = H * .92, lifeX = W * .5 - 70;
  label(ctx, '灯泡寿命', lifeX - 50, lifeY, '#9fb3c8', 12, 'left');
  for (let i = 0; i < sim.L.wearLimit; i++) {
    const x = lifeX + i * 15;
    roundRect(ctx, x, lifeY - 7, 11, 14, 3);
    ctx.fillStyle = i < sim.switches ? '#ff6b5d' : '#2c4766'; ctx.fill();
    if (i >= sim.switches) { ctx.strokeStyle = '#3a5a7c'; ctx.stroke(); }
  }

  // 车灯
  for (const e of sim.env.events) if (e.kind === 'car' && row && row.t >= e.from - 6 && row.t < e.to + 6) {
    const p = (row.t - e.from + 6) / (e.to - e.from + 12);
    const cx = W * 1.05 - p * W * 1.2;
    ctx.fillStyle = '#c94b4b'; roundRect(ctx, cx, H * .66, 70, 26, 6); ctx.fill();
    ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); ctx.arc(cx + 14, H * .66 + 26, 8, 0, 7); ctx.arc(cx + 56, H * .66 + 26, 8, 0, 7); ctx.fill();
    const head = ctx.createRadialGradient(cx, H * .68, 0, cx - 80, H * .68, 140);
    head.addColorStop(0, 'rgba(255,250,200,.5)'); head.addColorStop(1, 'rgba(255,250,200,0)');
    ctx.fillStyle = head; ctx.beginPath(); ctx.moveTo(cx, H * .67); ctx.lineTo(cx - 160, H * .58); ctx.lineTo(cx - 160, H * .78); ctx.closePath(); ctx.fill();
    badge(ctx, '🚗 车灯晃过，读数突然变大', W / 2, H * .12, 'rgba(40,35,20,.85)', '#ffe9a8');
  }

  // 光照传感器
  ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.arc(lx, top - 8, 8, 0, 7); ctx.fill();
  badge(ctx, `光照 ${row ? row.reading : '—'} lux`, lx - 70, top - 28);

  if (row && row.truth < 80 && !on) badge(ctx, '好黑，看不清路！', W * .22, H * .55, 'rgba(40,20,30,.85)', '#ff9a8e');

  const walk = reduced() ? 0 : Math.sin(t) * 8;
  drawXiaodi(ctx, W * .18 + walk, H * .5, Math.min(1.1, W / 700), { t });
}

export function sceneSample(ctx, W, H, sim, row, t, particles) {
  nightSky(ctx, W, H, 'sample', 11);
  cityRow(ctx, W, H * .7, 11);
  ground(ctx, W, H, H * .7, '#121c2e');
  drawSprite(ctx, 'tree1', W * .02, H * .4, W * .12, null, { nightTint: .55 });
  drawSprite(ctx, 'bush1', W * .75, H * .64, W * .1, null, { nightTint: .4 });

  // 监测杆
  const mx = W * .48, top = H * .32;
  ctx.fillStyle = '#5c6f86'; ctx.fillRect(mx - 7, top + 40, 14, H * .7 - top - 40);
  // 传感器外壳
  roundRect(ctx, mx - 48, top, 96, 52, 14); ctx.fillStyle = '#1a3a48'; ctx.fill();
  ctx.strokeStyle = '#3fc1b5'; ctx.lineWidth = 3; ctx.stroke();
  roundRect(ctx, mx - 36, top + 10, 72, 20, 6); ctx.fillStyle = '#0b1630'; ctx.fill();
  label(ctx, '噪声传感器', mx, top + 68, '#9fb3c8', 13);

  if (row?.reading != null) {
    const hot = row.on;
    ctx.strokeStyle = hot ? '#ff7a7a' : '#7fe6dc'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(mx, top + 26, 36 + (reduced() ? 0 : Math.sin(t * 6) * 2), 0, 7); ctx.stroke();
    if (hot) glow(ctx, mx, top + 26, 50, 'rgba(255,100,100,.25)', 'rgba(255,100,100,0)');
    badge(ctx, `读到 ${row.reading} dB`, mx, top - 18, hot ? 'rgba(60,25,25,.85)' : 'rgba(20,50,55,.85)', hot ? '#ff9a8e' : '#7fe6dc');
    if (hot && !reduced() && Math.random() < .2) particles?.emit('spark', mx, top, 2);
  } else if (row) {
    badge(ctx, sim.battery ? '休眠中（这一秒不读数）' : '没电了', mx, top - 18, 'rgba(20,30,45,.8)', '#9fb3c8');
  }

  // 电池
  const bx = W * .72, by = H * .28, bw = Math.min(160, W * .2), bh = 36;
  label(ctx, '电池', bx - 10, by - 18, '#9fb3c8', 13, 'left');
  roundRect(ctx, bx, by, bw, bh, 8); ctx.strokeStyle = '#9fb3c8'; ctx.lineWidth = 2; ctx.stroke();
  const pct = sim.battery / sim.L.battery;
  roundRect(ctx, bx + 3, by + 3, (bw - 6) * pct, bh - 6, 5);
  ctx.fillStyle = pct > .25 ? '#4cd28a' : '#ff7a7a'; ctx.fill();
  // 电池正极
  ctx.fillStyle = '#9fb3c8'; roundRect(ctx, bx + bw, by + 10, 8, 16, 3); ctx.fill();
  label(ctx, `${sim.battery}/${sim.L.battery}`, bx + bw / 2, by + bh / 2, '#e8f1f7', 14);

  // 声源事件
  for (const e of sim.env.events) if (row && row.t >= e.from && row.t < e.to) {
    const sx = W * .2, sy = H * .55;
    badge(ctx, `📢 ${e.label}`, sx, sy - 40, 'rgba(50,25,30,.9)', '#ffb4a8');
    if (!reduced()) {
      for (let i = 1; i <= 3; i++) {
        ctx.strokeStyle = `rgba(255,150,140,${.65 - i * .15})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(sx, sy + 20, 18 * i + (t * 28 % 16), -0.9, 0.9); ctx.stroke();
      }
    }
  }

  badge(ctx, `已记录 ${sim.stats.caught} · 漏掉 ${sim.stats.missed}`, W / 2, H * .1);
  drawXiaodi(ctx, W * .58, H * .5, Math.min(1.1, W / 700), { t });
}

export function sceneAlarm(ctx, W, H, sim, row, t, particles) {
  nightSky(ctx, W, H, 'alarm', 13);
  cityRow(ctx, W, H * .68, 13);
  ground(ctx, W, H, H * .68, '#141c2c');
  // 广场地面
  ctx.fillStyle = '#1a2840'; roundRect(ctx, W * .08, H * .72, W * .84, 28, 8); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.lineWidth = 2;
  for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(W * (.08 + i * .14), H * .72); ctx.lineTo(W * (.08 + i * .14), H * .72 + 28); ctx.stroke(); }

  drawSprite(ctx, 'tree2', W * .02, H * .38, W * .12, null, { nightTint: .5 });
  drawSprite(ctx, 'bush2', W * .85, H * .62, W * .1, null, { nightTint: .4 });

  // 噪声监测屏（精致）
  const sx = W * .1, sy = H * .28;
  roundRect(ctx, sx, sy, 130, 70, 12); ctx.fillStyle = '#0d1520'; ctx.fill();
  ctx.strokeStyle = row?.on ? '#ff6b5d' : '#3a5a7c'; ctx.lineWidth = 3; ctx.stroke();
  if (row?.on) glow(ctx, sx + 65, sy + 35, 70, 'rgba(255,80,80,.2)', 'rgba(255,80,80,0)');
  label(ctx, '噪声监测屏', sx + 65, sy - 14, '#9fb3c8', 12);
  ctx.fillStyle = row?.on ? '#ff7a7a' : '#7fe6dc';
  ctx.font = `bold 28px 'DejaVu Sans Mono',Consolas,monospace`; ctx.textAlign = 'center';
  ctx.fillText(row ? `${row.reading}` : '—', sx + 55, sy + 42);
  ctx.font = `bold 14px 'PingFang SC','Microsoft YaHei',sans-serif`;
  ctx.fillText('dB', sx + 105, sy + 42);
  ctx.fillStyle = row?.on ? '#ff3b30' : '#4cd964';
  ctx.beginPath(); ctx.arc(sx + 112, sy + 14, 6, 0, 7); ctx.fill();

  // 事件声源
  const ev = row && sim.env.events.find(e => row.t >= e.from && row.t < e.to);
  if (ev) {
    const ex = W * .7, ey = H * .5;
    badge(ctx, (ev.kind === 'real' ? '📢 ' : '🔈 ') + ev.label, ex, ey - 50, 'rgba(40,25,35,.9)', ev.kind === 'real' ? '#ffb4a8' : '#cfe0ee');
    if (!reduced()) {
      for (let i = 1; i <= 3; i++) {
        ctx.strokeStyle = `rgba(255,150,140,${.6 - i * .15})`; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(ex, ey + 30, 16 * i + (t * 30 % 16), -0.85, 0.85); ctx.stroke();
      }
    }
    if (ev.kind === 'real' && !reduced() && Math.random() < .25) particles?.emit('spark', ex, ey, 3);
  }

  const going = row?.on;
  const ix = going ? W * .55 : W * .28;
  const bob = reduced() ? 0 : (going ? Math.sin(t * 10) * 5 : Math.sin(t * 2) * 2);
  drawXiaodi(ctx, ix + bob, H * .48, Math.min(1.15, W / 700), { t: t * (going ? 2 : 1) });
  badge(ctx, going ? '🚀 小递出发劝导！' : '小递待命', ix + 40, H * .46, going ? 'rgba(50,40,15,.9)' : 'rgba(20,30,45,.8)', going ? '#ffd36b' : '#9fb3c8');

  badge(ctx, `劝导 ${sim.stats.caught} · 误报 ${sim.stats.falseAlarm} · 漏报 ${sim.stats.missed}`, W / 2, H * .1);
}

export function drawScene(ctx, W, H, L, sim, row, t, particles) {
  const fn = { garden: sceneGarden, lamp: sceneLamp, sample: sceneSample, alarm: sceneAlarm }[L.id];
  fn(ctx, W, H, sim, row, t, particles);
}
