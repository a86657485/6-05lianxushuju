/*
 * 花朵绘制：改编自 umehabibaa/Plant_Growing_Game（MIT）+ 精致化改写。
 * 成长进度由“待在舒适区的时间”决定；太干下垂变黄，太湿变褐并带水滴感。
 */
export function drawPlant(ctx, x, base, progress, mood, now = 0) {
  const height = 36 + progress * 165;
  const stem = mood === 'dry' ? '#a89440' : mood === 'wet' ? '#5a4a32' : '#3d9a58';
  const leaf = mood === 'dry' ? '#c4b04a' : mood === 'wet' ? '#6d5a3a' : '#4caf50';
  const leafDark = mood === 'dry' ? '#8a7830' : mood === 'wet' ? '#4a3a28' : '#2e7d46';
  const sway = Math.sin(now / 480) * (mood === 'dry' ? 2 : 5);
  const droop = (mood === 'dry' ? 28 : mood === 'wet' ? 12 : 0) + sway;
  ctx.save();
  // 地面阴影
  ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.ellipse(x, base + 2, 18 + progress * 10, 5, 0, 0, 7); ctx.fill();
  // 茎（渐变）
  const sg = ctx.createLinearGradient(x, base, x + droop, base - height);
  sg.addColorStop(0, stem); sg.addColorStop(1, leaf);
  ctx.strokeStyle = sg; ctx.lineWidth = 5 + progress * 7; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x, base);
  ctx.quadraticCurveTo(x + droop * .35, base - height / 2, x + droop, base - height + droop * .4);
  ctx.stroke();
  // 叶片
  const ls = Math.min(1.15, 0.45 + progress);
  drawLeaf(ctx, x + droop * .15, base - height * .4, -1, leaf, leafDark, ls);
  drawLeaf(ctx, x + droop * .1, base - height * .28, 1, leaf, leafDark, ls);
  if (progress > 0.45) drawLeaf(ctx, x + droop * .3, base - height * .62, 1, leaf, leafDark, ls * .85);
  if (progress > 0.7) drawLeaf(ctx, x + droop * .25, base - height * .72, -1, leaf, leafDark, ls * .75);
  const hx = x + droop, hy = base - height + droop * .4;
  if (progress >= 0.82) drawFlowerHead(ctx, hx, hy, mood, now);
  else if (progress >= 0.48) drawBud(ctx, hx, hy, mood);
  // 太湿：茎上水珠
  if (mood === 'wet') {
    ctx.fillStyle = 'rgba(127,216,255,.7)';
    for (const [dx, dy] of [[-4, -height * .3], [6, -height * .5], [0, -height * .7]]) {
      ctx.beginPath(); ctx.ellipse(x + droop * .3 + dx, base + dy, 2.2, 3.5, 0, 0, 7); ctx.fill();
    }
  }
  ctx.restore();
}
function drawLeaf(ctx, x, y, dir, color, dark, scale) {
  ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale); ctx.rotate((-Math.PI / 4.2) * dir);
  const g = ctx.createLinearGradient(0, -8, 30 * dir, 8);
  g.addColorStop(0, color); g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(16 * dir, 0, 22, 11, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.2)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(2 * dir, 0); ctx.lineTo(28 * dir, 0); ctx.stroke();
  ctx.restore();
}
function drawBud(c, x, y, mood) {
  c.save(); c.translate(x, y);
  const g = c.createRadialGradient(0, -12, 2, 0, -8, 20);
  g.addColorStop(0, mood === 'ok' ? '#ffcc66' : '#a08850');
  g.addColorStop(1, mood === 'ok' ? '#e89420' : '#706040');
  c.fillStyle = g; c.beginPath(); c.ellipse(0, -10, 14, 20, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#3d9a58'; c.beginPath(); c.arc(0, 2, 14, 0, Math.PI); c.fill();
  c.restore();
}
function drawFlowerHead(c, x, y, mood, now = 0) {
  c.save(); c.translate(x, y); c.scale(1.15, 1.15);
  const rot = reducedOk() ? 0 : now / 3000;
  c.rotate(rot);
  const petal = mood === 'ok' ? '#ffb020' : '#a08850';
  const petal2 = mood === 'ok' ? '#ff8c00' : '#806840';
  for (let i = 0; i < 12; i++) {
    c.rotate(Math.PI / 6);
    const g = c.createLinearGradient(8, 0, 36, 0);
    g.addColorStop(0, petal); g.addColorStop(1, petal2);
    c.fillStyle = g;
    c.beginPath(); c.ellipse(24, 0, 22, 9, 0, 0, Math.PI * 2); c.fill();
  }
  const core = c.createRadialGradient(0, 0, 2, 0, 0, 18);
  core.addColorStop(0, '#5a3a18'); core.addColorStop(1, '#2a1810');
  c.fillStyle = core; c.beginPath(); c.arc(0, 0, 17, 0, Math.PI * 2); c.fill();
  // 籽点
  if (mood === 'ok') {
    c.fillStyle = 'rgba(255,220,120,.45)';
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4 + rot; c.beginPath(); c.arc(Math.cos(a) * 8, Math.sin(a) * 8, 2, 0, 7); c.fill();
    }
  }
  c.restore();
}
function reducedOk() { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } }
