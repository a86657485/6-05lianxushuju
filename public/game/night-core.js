/* 兼容旧引用：奖励小游戏已改为赛车 RaceCore。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./race-core.js'));
  else root.NightCore = root.RaceCore;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Race) {
  return Race;
});
