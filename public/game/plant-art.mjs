/*
 * 花朵绘制：改编自 umehabibaa/Plant_Growing_Game（MIT，script.js 的 drawPlant / drawLeaf / drawBud / drawFlowerHead）。
 * 版权声明见同目录 LICENSE-Plant_Growing_Game.txt。改动：成长进度由“待在舒适区的时间”决定；太干时下垂变黄，太湿时变褐。
 */
export function drawPlant(ctx, x, base, progress, mood, now = 0) {
  // progress 0..1；mood: 'ok' | 'dry' | 'wet'
  const height = 30 + progress * 150;
  const color = mood === 'dry' ? '#b8a245' : mood === 'wet' ? '#6d5a3a' : '#4CAF50';
  const droop = (mood === 'dry' ? 26 : mood === 'wet' ? 10 : 0) + Math.sin(now / 500) * 4;
  ctx.save();
  ctx.strokeStyle = color; ctx.lineWidth = 4 + progress * 7; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x, base);
  ctx.quadraticCurveTo(x + droop * .4, base - height / 2, x + droop, base - height + droop * .5);
  ctx.stroke();
  const leaf = Math.min(1, 0.4 + progress);
  drawLeaf(ctx, x + droop * .2, base - height / 2, -1, color, leaf);
  drawLeaf(ctx, x + droop * .1, base - height / 3, 1, color, leaf);
  if (progress > 0.55) drawLeaf(ctx, x + droop * .35, base - height * .7, 1, color, leaf * .8);
  const hx = x + droop, hy = base - height + droop * .5;
  if (progress >= 0.85) drawFlowerHead(ctx, hx, hy, mood);
  else if (progress >= 0.5) drawBud(ctx, hx, hy, mood);
  ctx.restore();
}
function drawLeaf(ctx, x, y, dir, color, scale) {
  ctx.save(); ctx.fillStyle = color; ctx.translate(x, y); ctx.scale(scale, scale); ctx.rotate((-Math.PI / 4) * dir);
  ctx.beginPath(); ctx.ellipse(15 * dir, 0, 20, 10, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
}
function drawBud(c, x, y, mood) {
  c.save(); c.translate(x, y);
  c.fillStyle = mood === 'ok' ? '#FFA500' : '#a08850';
  c.beginPath(); c.ellipse(0, -10, 15, 22, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#4CAF50'; c.beginPath(); c.arc(0, 0, 15, 0, Math.PI); c.fill(); c.restore();
}
function drawFlowerHead(c, x, y, mood) {
  // 原作的向日葵（Sunflower）花头
  c.save(); c.translate(x, y); c.scale(1.1, 1.1);
  c.fillStyle = mood === 'ok' ? 'orange' : '#a08850';
  for (let i = 0; i < 12; i++) { c.rotate(Math.PI / 6); c.beginPath(); c.ellipse(25, 0, 25, 10, 0, 0, Math.PI * 2); c.fill(); }
  c.fillStyle = '#3d2b1f'; c.beginPath(); c.arc(0, 0, 20, 0, Math.PI * 2); c.fill(); c.restore();
}
