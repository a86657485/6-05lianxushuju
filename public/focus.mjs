/*
 * 焦点引导：任何时刻只突出一个“当前主要操作”（.cta），旁边贴一句话提示和指示手。
 * 求助时用聚光灯压暗其他区域几秒。动画尊重“减少动态效果”。
 */
let current = null, tipText = '', raf = 0;
const $ = id => document.getElementById(id);
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
function host(el) {
  // 滑块等表单控件不能显示伪元素光圈，把高亮放在它的外框上
  if (el && ['INPUT', 'SELECT'].includes(el.tagName)) return el.closest('.ctl') || el.parentElement;
  return el;
}
export function setFocus(el, tip = '') {
  const h = host(el), prev = current;
  document.querySelectorAll('.cta').forEach(n => { if (n !== h) n.classList.remove('cta'); });
  current = h && h.isConnected && !h.closest('[hidden]') ? h : null;
  tipText = current ? tip : '';
  if (current) {
    current.classList.add('cta'); current.dataset.ctaTip = tip;
    if (current !== prev) {
      const r = current.getBoundingClientRect(), bar = document.querySelector('.level-screen:not([hidden]) .guide-bar');
      const limit = bar && !bar.contains(current) && getComputedStyle(bar).position === 'sticky' ? bar.getBoundingClientRect().top : innerHeight;
      if (r.top < 0 || r.bottom > limit || r.left < 0 || r.right > innerWidth) current.scrollIntoView({ block: 'center', inline: 'nearest', behavior: reduced() ? 'auto' : 'smooth' });
    }
  }
  place();
}
export function focusTarget() { return current; }
export function place() {
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => {
    const coach = $('coach');
    if (!coach) return;
    if (!current || !current.isConnected || current.closest('[hidden]') || !tipText) { coach.hidden = true; return; }
    const r = current.getBoundingClientRect();
    if (!r.width && !r.height) { coach.hidden = true; return; }
    coach.hidden = false; coach.querySelector('.coach-text').textContent = tipText;
    const cw = coach.offsetWidth, ch = coach.offsetHeight, vw = innerWidth, vh = innerHeight, gap = 16, top0 = 56;
    const clamp = ([x, y, side]) => [Math.min(vw - cw - 8, Math.max(8, x)), Math.min(vh - ch - 4, Math.max(top0, y)), side];
    const midY = r.top + Math.min(r.height / 2, 60) - ch / 2;
    const candidates = [
      [r.left + r.width / 2 - cw / 2, r.top - ch - gap - 10, 'above'],
      [r.right + gap + 30, midY, 'right'],
      [r.left - cw - gap - 30, midY, 'left'],
      [r.left + r.width / 2 - cw / 2, r.bottom + gap + 10, 'below']
    ];
    // 宽的目标（选项组、名单）优先放左右两侧
    if (r.width > 380) candidates.push(candidates.shift());
    // 选一个不挡住其他按钮和文字的位置
    const avoid = [...document.querySelectorAll('button,input,h1,h2,h3,p,label,legend,td,summary,.goal-bars div,.ipo-box,.place,.fader,.pick-group,.badge,.data-card,.case-text')]
      .filter(e => !e.closest('#coach') && !current.contains(e) && !e.contains(current) && !e.closest('[hidden]'))
      .map(e => e.getBoundingClientRect()).filter(b => b.width && b.height);
    const fits = ([x, y]) => x >= 4 && y >= top0 && x + cw <= vw - 4 && y + ch <= vh - 2;
    const cost = ([x, y]) => avoid.reduce((sum, b) => sum + Math.max(0, Math.min(x + cw + 30, b.right) - Math.max(x - 4, b.left)) * Math.max(0, Math.min(y + ch + 30, b.bottom) - Math.max(y - 4, b.top)), 0)
      + (Math.max(0, Math.min(x + cw, r.right) - Math.max(x, r.left)) * Math.max(0, Math.min(y + ch, r.bottom) - Math.max(y, r.top))) * 4;
    let best = null, bestCost = Infinity;
    for (const c of candidates) { const k = clamp(c), v = cost(k) + (fits(c) ? 0 : 5000); if (v < bestCost - 1) { best = k; bestCost = v; } if (v === 0) break; }
    let [x, y, side] = best;
    coach.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    coach.className = 'coach ' + side;
    const hand = coach.querySelector('.coach-hand');
    hand.style.left = side === 'above' || side === 'below' ? Math.max(8, Math.min(cw - 30, r.left + r.width / 2 - x - 14)) + 'px' : '';
  });
}
/** 求助：聚光灯照亮当前主要操作，其余变暗；点击任意处或几秒后消失。 */
export function spotlight(ms = 2600) {
  const spot = $('spot');
  if (!spot || !current) return;
  const r = current.getBoundingClientRect(), pad = 10;
  spot.style.setProperty('--x', (r.left - pad) + 'px'); spot.style.setProperty('--y', (r.top - pad) + 'px');
  spot.style.setProperty('--w', (r.width + pad * 2) + 'px'); spot.style.setProperty('--h', (r.height + pad * 2) + 'px');
  spot.hidden = false;
  clearTimeout(spotlight.t); spotlight.t = setTimeout(() => spot.hidden = true, ms);
}
addEventListener('resize', place);
addEventListener('scroll', place, true);
setInterval(() => { if (current) place(); }, 700);
