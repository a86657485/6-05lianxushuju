/* 兼容入口：地图与角色定义在 rpg.mjs（俯视校园 RPG）。关卡内场景插画仍用 world-art.mjs。 */
export {
  places, CHARACTERS, sprite, pickCharacter, guideSvg,
  mapBackground, paintLoginPreview, mountRpg,
} from './rpg.mjs';

import { xiaodi } from './world-art.mjs';
/** 关卡/地图气泡里的向导小递（与导入页同画风）。 */
export function xiaodiSvg(size = 64) {
  return `<svg viewBox="0 0 80 100" width="${size}" height="${size * 1.25}" aria-hidden="true">${xiaodi(0, 0, 1)}</svg>`;
}

/** 旧版百分比路径/地点图标（教师页或旧截图兼容）；RPG 主界面不再使用。 */
export function mapPath() { return ''; }
export function placeIcon() { return ''; }
