/* Kenney CC0 精灵加载：Foliage Pack、Background Elements、UI Pack（见 assets/ 下 License-*.txt）。 */
const base = '/game/assets/';
const files = {
  moon: 'bg/moon_full.png', moonHalf: 'bg/moon_half.png',
  fence: 'bg/fence.png', fencePiece: 'bg/fence_piece.png',
  grass1: 'bg/grass1.png', grass2: 'bg/grass2.png', grass3: 'bg/grass3.png', grass4: 'bg/grass4.png',
  cloud1: 'bg/cloud1.png', cloud2: 'bg/cloud2.png', cloud3: 'bg/cloud3.png',
  houseF: 'bg/house_beige_front.png', houseS: 'bg/house_beige_side.png', houseG: 'bg/house_grey_front.png',
  tree1: 'foliage/foliagePack_010.png', tree2: 'foliage/foliagePack_007.png', tree3: 'foliage/foliagePack_016.png',
  pine: 'foliage/foliagePack_027.png', bush1: 'foliage/foliagePack_004.png', bush2: 'foliage/foliagePack_013.png',
  flower1: 'foliage/foliagePack_leaves_005.png', flower2: 'foliage/foliagePack_leaves_012.png',
  flower3: 'foliage/foliagePack_leaves_018.png', leaf1: 'foliage/foliagePack_leaves_001.png',
  star: 'ui/star.png', starOut: 'ui/star_outline.png', knob: 'ui/knob.png', roundBtn: 'ui/round_btn.png'
};
const cache = {};
let ready = null;
export function loadAssets() {
  if (ready) return ready;
  ready = Promise.all(Object.entries(files).map(([k, f]) => new Promise(res => {
    const im = new Image(); im.onload = im.onerror = () => res(); im.src = base + f; cache[k] = im;
  }))).then(() => cache);
  return ready;
}
export const img = k => cache[k];
/** 画精灵；nightTint 0—1 给白天素材罩一层夜色。 */
export function drawSprite(ctx, key, x, y, w, h, opts = {}) {
  const im = cache[key]; if (!im?.complete || !im.naturalWidth) return false;
  const dw = w ?? im.naturalWidth, dh = h ?? (im.naturalHeight * dw / im.naturalWidth);
  ctx.save();
  if (opts.flip) { ctx.translate(x + dw, y); ctx.scale(-1, 1); x = 0; y = 0; }
  if (opts.opacity != null) ctx.globalAlpha = opts.opacity;
  ctx.drawImage(im, x, y, dw, dh);
  if (opts.nightTint) {
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = `rgba(15,40,80,${opts.nightTint})`;
    ctx.fillRect(x, y, dw, dh);
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore();
  return true;
}
