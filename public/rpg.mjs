/**
 * 俯视校园 RPG：瓦片地图 + 键盘/触屏摇杆走动 + 靠近交互。
 * 素材：Kenney Tiny Town（CC0）+ 原创校园角色像素（自五年级生活算法站同套路）。
 * 主题：噪声监测校园（监测站、数据墙、窗帘教室、阈值控制室、教室噪声角、出门条）。
 */
const TILE = 16;
let SCALE = 3; // 屏幕像素 = 瓦片像素 × SCALE（随视口调整）
const SPEED = 96; // 世界像素/秒

/** Kenney Tiny Town 常用瓦片编号 */
const T = {
  grass: 0, grass2: 1, flower: 2,
  treeTL: 6, treeTR: 7, treeBL: 18, treeBR: 19,
  tree2TL: 8, tree2TR: 9, tree2BL: 20, tree2BR: 21,
  bush: 5, bush2: 17,
  path: 25, pathN: 13, pathS: 37, pathW: 24, pathE: 26,
  pathNW: 12, pathNE: 14, pathSW: 36, pathSE: 38,
  pathAlone: 39,
  fenceH: 45, fenceV: 56, fenceTL: 44, fenceTR: 46, fenceBL: 68, fenceBR: 70,
  wallB: 48, wallB2: 49, wallB3: 50, // 灰蓝教学楼
  wallR: 52, wallR2: 53, wallR3: 54, // 砖红
  wallG: 76, wallG2: 77,
  roof: 63, roof2: 67, roofR: 63, roofR2: 67, roofDark: 51,
  door: 85, door2: 89, window: 84, window2: 88,
  sign: 83, well: 104, crate: 69, cart: 57,
  archL: 111, archR: 113, archMid: 112, archTop: 114,
  stone: 96, stone2: 97,
};

/** 校园尺寸 */
const MAP_W = 28;
const MAP_H = 18;

function buildLayers() {
  // ground layer + solid mask + overlays (trees etc drawn after)
  const ground = Array.from({ length: MAP_H }, () => Array(MAP_W).fill(T.grass));
  const solid = Array.from({ length: MAP_H }, () => Array(MAP_W).fill(false));
  const deco = Array.from({ length: MAP_H }, () => Array(MAP_W).fill(0));

  const paint = (x, y, tile, block = false) => {
    if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return;
    ground[y][x] = tile;
    if (block) solid[y][x] = true;
  };
  const putDeco = (x, y, tile, block = true) => {
    if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return;
    deco[y][x] = tile;
    if (block) solid[y][x] = true;
  };

  // fill grass + border fence/trees
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    ground[y][x] = (x + y) % 7 === 0 ? T.grass2 : T.grass;
    if (x === 0 || y === 0 || x === MAP_W - 1 || y === MAP_H - 1) {
      solid[y][x] = true;
      ground[y][x] = T.bush;
    }
  }

  // flowers
  [[4, 7], [22, 4], [6, 13], [20, 12]].forEach(([x, y]) => paint(x, y, T.flower));

  // helper: rect building
  function building(x, y, w, h, style = 'B') {
    const wall = style === 'R' ? T.wallR : style === 'L' ? T.wallG : style === 'F' ? T.wallR2 : T.wallB;
    const wall2 = style === 'R' ? T.wallR2 : style === 'L' ? T.wallG2 : style === 'F' ? T.wallR3 : T.wallB2;
    const roof = style === 'R' || style === 'F' ? T.roofR : T.roof;
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
      const t = dy === 0 ? roof : ((dx + dy) % 2 ? wall : wall2);
      paint(x + dx, y + dy, t, true);
    }
  }

  // 监测站门口（左上：噪声监测系统）
  building(3, 2, 5, 3, 'R');
  paint(5, 4, T.door, true);
  paint(4, 3, T.window, true);
  // 站点 NPC/牌子由渲染层绘制在可站立的路径格上

  // 数据展示墙（右上：波形与散点）
  building(14, 2, 5, 3, 'B');
  paint(16, 4, T.door, true);
  paint(15, 3, T.window, true);
  paint(17, 3, T.window2, true);

  // 窗帘教室（左中下：生活中的连续量）
  building(3, 9, 5, 3, 'L');
  paint(5, 11, T.door, true);
  paint(4, 10, T.window, true);

  // 阈值控制室（右中下：找阈值）
  building(14, 9, 5, 3, 'F');
  paint(16, 11, T.door, true);
  paint(15, 10, T.window, true);

  // 教室噪声角（右上偏外小亭：定教室阈值）
  for (let dx = 0; dx < 4; dx++) {
    paint(21 + dx, 2, T.fenceH, true);
    paint(21 + dx, 5, T.fenceH, true);
  }
  paint(21, 3, T.fenceV, true); paint(21, 4, T.fenceV, true);
  paint(24, 3, T.fenceV, true); paint(24, 4, T.fenceV, true);
  paint(22, 3, T.path); paint(23, 3, T.path); paint(22, 4, T.path); paint(23, 4, T.path);
  putDeco(22, 3, T.crate, false);
  paint(22, 5, T.door2, false); // opening in fence south

  // 校门 / 出门条考核（下方石拱，中间可走）
  paint(11, 14, T.stone, true); paint(12, 14, T.archL, true); paint(13, 14, T.path, false); paint(14, 14, T.archR, true); paint(15, 14, T.stone2, true);
  paint(11, 15, T.stone, true); paint(12, 15, T.stone, true); paint(13, 15, T.path, false); paint(14, 15, T.stone2, true); paint(15, 15, T.stone2, true);
  solid[14][13] = false; solid[15][13] = false;
  // 校门两侧树篱
  paint(10, 14, T.bush, true); paint(16, 14, T.bush, true);

  // 小路网络
  const pathCells = [];
  const addPath = (x0, y0, x1, y1) => {
    let x = x0, y = y0;
    while (true) {
      pathCells.push([x, y]);
      if (x === x1 && y === y1) break;
      if (x < x1) x++; else if (x > x1) x--;
      else if (y < y1) y++; else if (y > y1) y--;
    }
  };
  // vertical spine
  addPath(13, 5, 13, 14);
  // to 监测站
  addPath(5, 5, 5, 7); addPath(5, 7, 13, 7);
  // to 数据展示墙
  addPath(16, 5, 16, 7); addPath(16, 7, 13, 7);
  // to 教室噪声角
  addPath(22, 6, 22, 7); addPath(22, 7, 16, 7);
  // to 窗帘教室
  addPath(5, 12, 5, 13); addPath(5, 13, 13, 13);
  // to 阈值控制室
  addPath(16, 12, 16, 13); addPath(16, 13, 13, 13);
  // courtyard
  addPath(10, 7, 16, 7); addPath(10, 13, 16, 13);

  for (const [x, y] of pathCells) {
    if (!solid[y][x] || ground[y][x] === T.path) {
      // don't overwrite building solids except we skip if solid building
      if (solid[y][x] && ![T.path, T.grass, T.grass2, T.flower].includes(ground[y][x])) continue;
      paint(x, y, T.path, false);
      solid[y][x] = false;
    }
  }
  // ensure door fronts walkable
  [[5, 5], [16, 5], [5, 12], [16, 12], [22, 6], [13, 14], [13, 15], [22, 5]].forEach(([x, y]) => {
    paint(x, y, T.path, false);
    solid[y][x] = false;
    deco[y][x] = 0;
  });

  // corner trees (2×2)
  function tree(x, y) {
    putDeco(x, y, T.treeTL, true);
    putDeco(x + 1, y, T.treeTR, true);
    putDeco(x, y + 1, T.treeBL, true);
    putDeco(x + 1, y + 1, T.treeBR, true);
    paint(x, y, T.grass); paint(x + 1, y, T.grass);
    paint(x, y + 1, T.grass); paint(x + 1, y + 1, T.grass);
    solid[y][x] = solid[y][x + 1] = solid[y + 1][x] = solid[y + 1][x + 1] = true;
  }
  tree(1, 1); tree(24, 1); tree(1, 15); tree(24, 15);
  tree(1, 8); tree(25, 8);

  // 井 / 校园装饰
  putDeco(7, 5, T.well, true);

  return { ground, solid, deco };
}

/** 站点：交互点（世界像素中心）+ 面向 */
/** 地点：交互点（瓦片坐标）+ NPC。顺序与 rules.stageIds 一致，末尾 quiz。 */
export const places = {
  flow:      { tx: 5,  ty: 5,  name: '监测站门口',   label: '画示意图·数据流动', npc: 'teacher',   line: '广场边的噪声监测系统。先把它的工作过程画出来。' },
  wave:      { tx: 16, ty: 5,  name: '数据展示墙',   label: '波形与散点',       npc: 'teacher',   line: '监测器记下的声音数据，用哪种图表示更合适？' },
  life:      { tx: 5,  ty: 12, name: '窗帘教室',     label: '生活中的连续量',   npc: 'lab',       line: '拉窗帘、吹纸片、看仪表——哪些是连续量？' },
  threshold: { tx: 16, ty: 12, name: '阈值控制室',   label: '找阈值看作用',     npc: 'classmate', line: '同一晚的噪声，换一个阈值，提示次数怎样变？' },
  design:    { tx: 22, ty: 6,  name: '教室噪声角',   label: '定教室阈值',       npc: 'classmate', line: '给课间教室定一个阈值，只在喧哗时提示。' },
  quiz:      { tx: 13, ty: 15, name: '出门条',       label: '20题巡查报告',     npc: 'sign',      line: '五站都走完了？来这里完成20题考核。' },
};

export const CHARACTERS = { maleAdventurer: '男巡查员', femaleAdventurer: '女巡查员' };
export function pickCharacter(id) {
  try { const saved = localStorage.getItem('lesson5-character'); if (CHARACTERS[saved]) return saved; } catch {}
  let h = 0; for (const ch of String(id || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 2 ? 'femaleAdventurer' : 'maleAdventurer';
}
export function sprite(character, pose) {
  return `/assets/kenney/characters/${character}_${pose}.png`;
}
export function guideSvg(size = 64) {
  // keep small robot guide for bubble
  return `<svg viewBox="0 0 80 100" width="${size}" height="${size * 1.25}" aria-hidden="true">
    <ellipse cx="40" cy="94" rx="28" ry="5" fill="#000" opacity=".12"/>
    <rect x="16" y="20" width="48" height="36" rx="12" fill="#fff" stroke="#c9d8de" stroke-width="2"/>
    <rect x="22" y="26" width="36" height="22" rx="8" fill="#1a4a5c"/>
    <circle cx="32" cy="37" r="4" fill="#7fe6dc"/><circle cx="48" cy="37" r="4" fill="#7fe6dc"/>
    <rect x="24" y="58" width="32" height="20" rx="7" fill="#fff" stroke="#c9d8de" stroke-width="2"/>
    <rect x="10" y="60" width="10" height="14" rx="4" fill="#2a9d8f"/><rect x="60" y="60" width="10" height="14" rx="4" fill="#2a9d8f"/>
    <circle cx="30" cy="84" r="5" fill="#607984"/><circle cx="50" cy="84" r="5" fill="#607984"/>
    <circle cx="40" cy="10" r="5" fill="#ffb020"/></svg>`;
}

/** 登录页用的静态俯视预览（不跑游戏循环） */
export function mapBackground() {
  return `<div class="login-rpg-preview" aria-hidden="true">
    <canvas id="login-rpg-canvas" width="840" height="540"></canvas>
  </div>`;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error('load ' + src));
    im.src = src;
  });
}

async function loadTownTiles() {
  const imgs = {};
  const need = new Set(Object.values(T));
  await Promise.all([...need].map(async id => {
    try { imgs[id] = await loadImage(`/assets/kenney/tiny-town/Tiles/tile_${String(id).padStart(4, '0')}.png`); }
    catch { imgs[id] = null; }
  }));
  return imgs;
}

async function loadActors(character) {
  const who = character === 'femaleAdventurer' ? 'girl' : 'boy';
  const dirs = ['down', 'left', 'right', 'up'];
  const frames = {};
  await Promise.all(dirs.flatMap(d => [0, 1].map(async fr => {
    frames[`${d}${fr}`] = await loadImage(`/assets/pixel/${who}_${d}${fr}.png`);
  })));
  const npcs = {
    teacher: await loadImage('/assets/pixel/npc_teacher.png'),
    classmate: await loadImage('/assets/pixel/npc_classmate.png'),
    lab: await loadImage('/assets/pixel/npc_lab.png'),
    sign: await loadImage('/assets/kenney/tiny-town/Tiles/tile_0083.png'),
  };
  return { frames, npcs, who };
}

/**
 * 挂载 RPG 到容器。返回控制句柄。
 * @param {HTMLElement} host
 * @param {{ character: string, spawnPlace?: string, onInteract: (id:string)=>void, getMeta: (id:string)=>{open:boolean,done:boolean,badge:string,optional?:boolean}, nextTarget: ()=>string }} opts
 */
export async function mountRpg(host, opts) {
  const layers = buildLayers();
  const canvas = document.createElement('canvas');
  canvas.className = 'rpg-canvas';
  canvas.setAttribute('aria-label', '噪声监测校园地图，方向键或摇杆走动');
  host.innerHTML = '';
  host.appendChild(canvas);

  // HUD overlays inside map
  const ui = document.createElement('div');
  ui.className = 'rpg-ui';
  ui.innerHTML = `
    <div class="rpg-stick" id="rpg-stick" aria-hidden="true">
      <div class="rpg-stick-base"><div class="rpg-stick-knob" id="rpg-stick-knob"></div></div>
    </div>
    <button type="button" class="rpg-talk" id="rpg-talk" hidden>对话</button>
    <div class="rpg-hint" id="rpg-hint">方向键 / WASD 走动 · 靠近后按空格或点「对话」</div>
  `;
  host.appendChild(ui);

  const [tiles, actors] = await Promise.all([loadTownTiles(), loadActors(opts.character)]);

  const spawn = places[opts.spawnPlace];
  const player = {
    // 默认站在校园中庭，走近站点再对话（更像宝可梦走动感）
    x: spawn ? spawn.tx * TILE + TILE / 2 : 13 * TILE + 8,
    y: spawn ? spawn.ty * TILE + TILE / 2 + TILE : 8 * TILE + 8,
    dir: 'down',
    frame: 0,
    moving: false,
    foot: 0,
  };
  if (!opts.spawnPlace || opts.spawnPlace === 'flow' && !opts.resumeExact) {
    player.x = 13 * TILE + 8;
    player.y = 8 * TILE + 8;
  }
  if (layers.solid[Math.floor(player.y / TILE)]?.[Math.floor(player.x / TILE)]) {
    player.x = 13 * TILE + 8;
    player.y = 8 * TILE + 8;
  }

  const keys = new Set();
  let stick = { x: 0, y: 0, active: false };
  let nearId = null;
  let running = true;
  let last = performance.now();
  let cam = { x: 0, y: 0 };

  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  function resize() {
    const w = host.clientWidth || 800;
    const h = host.clientHeight || 600;
    canvas.width = w;
    canvas.height = h;
    // 手机略缩小倍率，多看见一些校园；桌面保持 3
    SCALE = w < 500 ? 2.5 : w < 900 ? 2.75 : 3;
  }
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(host);

  function solidAt(px, py) {
    const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return true;
    return layers.solid[ty][tx];
  }
  function tryMove(dx, dy, dt) {
    if (!dx && !dy) { player.moving = false; return; }
    player.moving = true;
    const len = Math.hypot(dx, dy) || 1;
    const nx = player.x + (dx / len) * SPEED * dt;
    const ny = player.y + (dy / len) * SPEED * dt;
    const r = 5;
    // axis-separated collision
    if (!solidAt(nx - r, player.y - r) && !solidAt(nx + r, player.y - r) && !solidAt(nx - r, player.y + r) && !solidAt(nx + r, player.y + r))
      player.x = nx;
    if (!solidAt(player.x - r, ny - r) && !solidAt(player.x + r, ny - r) && !solidAt(player.x - r, ny + r) && !solidAt(player.x + r, ny + r))
      player.y = ny;
    if (Math.abs(dx) > Math.abs(dy)) player.dir = dx < 0 ? 'left' : 'right';
    else player.dir = dy < 0 ? 'up' : 'down';
    player.foot += dt * 8;
    player.frame = Math.floor(player.foot) % 2;
  }

  function inputVec() {
    let dx = 0, dy = 0;
    if (keys.has('ArrowLeft') || keys.has('a') || keys.has('A')) dx -= 1;
    if (keys.has('ArrowRight') || keys.has('d') || keys.has('D')) dx += 1;
    if (keys.has('ArrowUp') || keys.has('w') || keys.has('W')) dy -= 1;
    if (keys.has('ArrowDown') || keys.has('s') || keys.has('S')) dy += 1;
    if (stick.active && (Math.abs(stick.x) > 0.2 || Math.abs(stick.y) > 0.2)) {
      dx = stick.x; dy = stick.y;
    }
    return [dx, dy];
  }

  function findNear() {
    let best = null, bestD = 36;
    for (const [id, p] of Object.entries(places)) {
      const px = p.tx * TILE + TILE / 2;
      const py = p.ty * TILE + TILE / 2;
      const d = Math.hypot(player.x - px, player.y - py);
      if (d < bestD) { bestD = d; best = id; }
    }
    return best;
  }

  function drawTile(img, tx, ty, sx, sy) {
    if (!img) {
      ctx.fillStyle = '#6aaa5a';
      ctx.fillRect(sx, sy, TILE * SCALE, TILE * SCALE);
      return;
    }
    ctx.drawImage(img, sx, sy, TILE * SCALE, TILE * SCALE);
  }

  function draw() {
    const w = canvas.width, h = canvas.height;
    cam.x = player.x * SCALE - w / 2;
    cam.y = player.y * SCALE - h / 2;
    const maxX = MAP_W * TILE * SCALE - w;
    const maxY = MAP_H * TILE * SCALE - h;
    cam.x = Math.max(0, Math.min(maxX, cam.x));
    cam.y = Math.max(0, Math.min(maxY, cam.y));

    ctx.fillStyle = '#5a9a4a';
    ctx.fillRect(0, 0, w, h);

    const t0x = Math.floor(cam.x / (TILE * SCALE));
    const t0y = Math.floor(cam.y / (TILE * SCALE));
    const t1x = Math.min(MAP_W - 1, t0x + Math.ceil(w / (TILE * SCALE)) + 1);
    const t1y = Math.min(MAP_H - 1, t0y + Math.ceil(h / (TILE * SCALE)) + 1);

    for (let ty = Math.max(0, t0y); ty <= t1y; ty++) {
      for (let tx = Math.max(0, t0x); tx <= t1x; tx++) {
        const sx = Math.floor(tx * TILE * SCALE - cam.x);
        const sy = Math.floor(ty * TILE * SCALE - cam.y);
        drawTile(tiles[layers.ground[ty][tx]], tx, ty, sx, sy);
      }
    }
    // deco
    for (let ty = Math.max(0, t0y); ty <= t1y; ty++) {
      for (let tx = Math.max(0, t0x); tx <= t1x; tx++) {
        const d = layers.deco[ty][tx];
        if (!d) continue;
        const sx = Math.floor(tx * TILE * SCALE - cam.x);
        const sy = Math.floor(ty * TILE * SCALE - cam.y);
        drawTile(tiles[d], tx, ty, sx, sy);
      }
    }

    // station markers + NPCs
    const target = opts.nextTarget?.() || '';
    for (const [id, p] of Object.entries(places)) {
      const meta = opts.getMeta?.(id) || { open: true, done: false, badge: '' };
      const px = p.tx * TILE + TILE / 2;
      const py = p.ty * TILE + TILE / 2;
      const sx = Math.floor(px * SCALE - cam.x);
      const sy = Math.floor(py * SCALE - cam.y);
      const npcImg = actors.npcs[p.npc] || actors.npcs.sign;
      if (npcImg) ctx.drawImage(npcImg, sx - 8 * SCALE, sy - 12 * SCALE, 16 * SCALE, 16 * SCALE);

      // name plate
      ctx.font = `bold ${11 * Math.max(1, SCALE / 2)}px "PingFang SC","Microsoft YaHei",sans-serif`;
      const label = `${p.name}`;
      const tw = ctx.measureText(label).width;
      const bx = sx - tw / 2 - 6, by = sy + 10 * SCALE;
      ctx.fillStyle = id === target ? '#ffd36b' : meta.done ? '#dff5e8' : meta.open ? 'rgba(255,255,255,.92)' : 'rgba(180,180,180,.85)';
      ctx.strokeStyle = meta.open ? '#2f6fed' : '#888';
      ctx.lineWidth = 2;
      roundRect(ctx, bx, by, tw + 12, 18, 8);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#1a2a3a';
      ctx.fillText(label, sx - tw / 2, by + 13);

      // badge
      if (meta.badge) {
        ctx.beginPath();
        ctx.arc(sx + 14 * SCALE / 2, sy - 14 * SCALE / 2, 10, 0, Math.PI * 2);
        ctx.fillStyle = meta.done ? '#ffb020' : '#eef5ff';
        ctx.fill();
        ctx.strokeStyle = '#7eb6d4';
        ctx.stroke();
        ctx.fillStyle = '#1a2a3a';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(meta.badge, sx + 14 * SCALE / 2, sy - 14 * SCALE / 2 + 4);
        ctx.textAlign = 'left';
      }
      if (!meta.open) {
        ctx.fillStyle = 'rgba(0,0,0,.35)';
        ctx.fillRect(sx - 10 * SCALE, sy - 14 * SCALE, 20 * SCALE, 20 * SCALE);
      }
      if (id === target) {
        // bounce arrow
        const ay = sy - 22 * SCALE + Math.sin(performance.now() / 200) * 4;
        ctx.fillStyle = '#ffb020';
        ctx.beginPath();
        ctx.moveTo(sx, ay + 10); ctx.lineTo(sx - 8, ay); ctx.lineTo(sx + 8, ay);
        ctx.closePath(); ctx.fill();
      }
    }

    // player
    const fr = player.moving ? player.frame : 0;
    const pimg = actors.frames[`${player.dir}${fr}`];
    const psx = Math.floor(player.x * SCALE - cam.x);
    const psy = Math.floor(player.y * SCALE - cam.y);
    if (pimg) ctx.drawImage(pimg, psx - 8 * SCALE, psy - 12 * SCALE, 16 * SCALE, 16 * SCALE);

    // near highlight ring
    if (nearId) {
      const p = places[nearId];
      const sx = Math.floor((p.tx * TILE + TILE / 2) * SCALE - cam.x);
      const sy = Math.floor((p.ty * TILE + TILE / 2) * SCALE - cam.y);
      ctx.strokeStyle = 'rgba(255,211,107,.9)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(sx, sy - 4, 18, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function updateNear() {
    const id = findNear();
    nearId = id;
    const talk = ui.querySelector('#rpg-talk');
    if (!id) { talk.hidden = true; return; }
    const meta = opts.getMeta?.(id) || { open: true };
    talk.hidden = false;
    talk.disabled = !meta.open;
    talk.textContent = meta.open ? `对话 · ${places[id].name}` : `${places[id].name}（未解锁）`;
    talk.classList.toggle('ready', !!meta.open);
  }

  function interact() {
    if (!nearId) return;
    const meta = opts.getMeta?.(nearId) || { open: true };
    if (!meta.open) return;
    opts.onInteract?.(nearId);
  }

  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const [dx, dy] = inputVec();
    tryMove(dx, dy, dt);
    updateNear();
    draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  const onKey = e => {
    if (!running) return;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Spacebar'].includes(e.key) || /^[wasdWASD]$/.test(e.key)) {
      e.preventDefault();
    }
    if (e.type === 'keydown') {
      keys.add(e.key);
      if (e.key === ' ' || e.key === 'Spacebar' || e.key === 'Enter') interact();
    } else keys.delete(e.key);
  };
  window.addEventListener('keydown', onKey, { passive: false });
  window.addEventListener('keyup', onKey);

  // virtual stick
  const stickEl = ui.querySelector('#rpg-stick');
  const knob = ui.querySelector('#rpg-stick-knob');
  const setStick = (x, y) => {
    const max = 36;
    const len = Math.hypot(x, y) || 1;
    const nx = x / len * Math.min(len, max);
    const ny = y / len * Math.min(len, max);
    stick.x = nx / max;
    stick.y = ny / max;
    stick.active = true;
    knob.style.transform = `translate(${nx}px,${ny}px)`;
  };
  const endStick = () => {
    stick = { x: 0, y: 0, active: false };
    knob.style.transform = 'translate(0,0)';
  };
  const stickPtr = e => {
    const rect = stickEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const t = e.touches ? e.touches[0] : e;
    setStick(t.clientX - cx, t.clientY - cy);
  };
  stickEl.addEventListener('pointerdown', e => { stickEl.setPointerCapture(e.pointerId); stickPtr(e); e.preventDefault(); });
  stickEl.addEventListener('pointermove', e => { if (stick.active || e.buttons) stickPtr(e); });
  stickEl.addEventListener('pointerup', endStick);
  stickEl.addEventListener('pointercancel', endStick);
  stickEl.addEventListener('touchstart', e => { stickPtr(e); e.preventDefault(); }, { passive: false });
  stickEl.addEventListener('touchmove', e => { stickPtr(e); e.preventDefault(); }, { passive: false });
  stickEl.addEventListener('touchend', endStick);

  ui.querySelector('#rpg-talk').onclick = () => interact();

  // hide hint after first move
  let hinted = false;
  const hintTimer = setInterval(() => {
    if (player.moving && !hinted) {
      hinted = true;
      const h = ui.querySelector('#rpg-hint');
      if (h) h.classList.add('fade');
      clearInterval(hintTimer);
    }
  }, 400);

  return {
    destroy() {
      running = false;
      ro.disconnect();
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      clearInterval(hintTimer);
      host.innerHTML = '';
    },
    setCharacter(c) {
      loadActors(c).then(a => { Object.assign(actors, a); });
    },
    getAvatarPlace() {
      // nearest place by distance for resume
      return findNear() || opts.spawnPlace || 'flow';
    },
    refresh() { /* meta read live via getMeta */ },
  };
}

/** 登录页轻量预览：画一张静态校园缩略图 */
export async function paintLoginPreview(canvas) {
  if (!canvas) return;
  try {
    const layers = buildLayers();
    const tiles = await loadTownTiles();
    const scale = 1.5;
    canvas.width = MAP_W * TILE * scale;
    canvas.height = MAP_H * TILE * scale;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < MAP_W; tx++) {
      const img = tiles[layers.ground[ty][tx]];
      const sx = tx * TILE * scale, sy = ty * TILE * scale;
      if (img) ctx.drawImage(img, sx, sy, TILE * scale, TILE * scale);
      else { ctx.fillStyle = '#6aaa5a'; ctx.fillRect(sx, sy, TILE * scale, TILE * scale); }
      const d = layers.deco[ty][tx];
      if (d && tiles[d]) ctx.drawImage(tiles[d], sx, sy, TILE * scale, TILE * scale);
    }
  } catch {}
}
