/* 用SVG绘制连续曲线、散点与阈值线；所有坐标由同一组数据换算，画面与记录一致。 */
export function makeScale({ width = 640, height = 260, pad = { l: 52, r: 18, t: 16, b: 34 }, xMin = 0, xMax = 1, yMin = 0, yMax = 100 }) {
  const iw = width - pad.l - pad.r, ih = height - pad.t - pad.b;
  const x = v => pad.l + (v - xMin) / (xMax - xMin) * iw;
  const y = v => pad.t + (1 - (Math.max(yMin, Math.min(yMax, v)) - yMin) / (yMax - yMin)) * ih;
  const invX = px => xMin + (px - pad.l) / iw * (xMax - xMin);
  return { width, height, pad, iw, ih, x, y, invX, xMin, xMax, yMin, yMax };
}
export function pathOf(points, s) {
  return points.map((p, i) => (i ? 'L' : 'M') + s.x(p[0]).toFixed(1) + ' ' + s.y(p[1]).toFixed(1)).join(' ');
}
export function axes(s, { xTicks = [], yTicks = [], xLabel = '', yLabel = '' } = {}) {
  const { pad, width, height } = s;
  const yl = yTicks.map(v => `<line x1="${pad.l}" x2="${width - pad.r}" y1="${s.y(v)}" y2="${s.y(v)}" class="grid"/><text x="${pad.l - 6}" y="${s.y(v) + 4}" text-anchor="end" class="tick">${v}</text>`).join('');
  const xl = xTicks.map(([v, label]) => `<text x="${s.x(v)}" y="${height - pad.b + 18}" text-anchor="middle" class="tick">${label}</text>`).join('');
  return `<g class="axes">${yl}${xl}<line x1="${pad.l}" x2="${pad.l}" y1="${pad.t}" y2="${height - pad.b}" class="axis"/><line x1="${pad.l}" x2="${width - pad.r}" y1="${height - pad.b}" y2="${height - pad.b}" class="axis"/><text x="${pad.l}" y="${pad.t - 4}" class="axis-label">${yLabel}</text><text x="${width - pad.r}" y="${height - 2}" text-anchor="end" class="axis-label">${xLabel}</text></g>`;
}
export function svgOpen(s, label, cls = '') { return `<svg viewBox="0 0 ${s.width} ${s.height}" class="chart ${cls}" role="img" aria-label="${label}">`; }
/** 由连续读数取等间隔散点（例如每2秒一个点）。 */
export function samplePoints(points, every) {
  const out = []; let next = points.length ? points[0][0] : 0;
  for (const p of points) if (p[0] >= next - 1e-9) { out.push(p); next = p[0] + every; }
  return out;
}
/** 找到时刻t左右两侧最近的散点。 */
export function neighbours(samples, t) {
  let left = null, right = null;
  for (const p of samples) { if (p[0] < t) left = p; else if (p[0] > t && !right) right = p; }
  return { left, right };
}
/** 连续曲线上某一时刻的数值（线性插值）。 */
export function valueAt(points, t) {
  if (!points.length) return null;
  if (t <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1], [x1, y1] = points[i];
    if (t <= x1) return y0 + (y1 - y0) * (t - x0) / (x1 - x0 || 1);
  }
  return points.at(-1)[1];
}
