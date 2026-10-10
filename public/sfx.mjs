/* 音效（Kenney Interface Sounds，CC0）。默认关闭，HUD 上的喇叭按钮开关；首次播放时才加载文件。 */
const files = { tap: 'select_002', good: 'confirmation_002', bad: 'error_006', star: 'maximize_006', hint: 'question_001', badge: 'drop_002', alarm: 'switch_002' };
const cache = {};
let on = false;
try { on = localStorage.getItem('lesson5-sound') === 'on'; } catch {}
export const sound = {
  get on() { return on; },
  toggle() { on = !on; try { localStorage.setItem('lesson5-sound', on ? 'on' : 'off'); } catch {} return on; },
  play(name) {
    if (!on || !files[name]) return;
    try {
      const a = cache[name] ||= new Audio('/assets/kenney/sfx/' + files[name] + '.ogg');
      a.volume = 0.5; a.currentTime = 0; a.play().catch(() => {});
    } catch {}
  }
};
