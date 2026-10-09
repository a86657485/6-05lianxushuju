import { api } from './sync.mjs?v=1';
import { Microphone } from './microphone.mjs?v=1';
const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search), parentOrigin = params.get('parentOrigin'), channel = params.get('channel');
let connected = false, level = 0;
function notify(type, data = {}) { if (connected && window.opener && !window.opener.closed) window.opener.postMessage({ type, channel, ...data }, parentOrigin); }
const mic = new Microphone({ pauseWhenHidden: false, onSample: s => { level = s.level; notify('teacher-microphone-sample', { level }); }, onStatus: s => { $('helper-status').textContent = s.message; notify('teacher-microphone-status', s); } });
$('helper-start').onclick = () => mic.start(); $('helper-stop').onclick = () => mic.stop(); $('helper-calibrate').onclick = () => mic.calibrate();
$('helper-close').onclick = () => { mic.stop(); window.close(); };
window.addEventListener('message', e => {
  if (!connected || e.source !== window.opener || e.origin !== parentOrigin || e.data?.channel !== channel || e.data?.type !== 'teacher-microphone-command') return;
  if (e.data.action === 'start') mic.start(); if (e.data.action === 'stop') mic.stop(); if (e.data.action === 'calibrate') mic.calibrate();
});
const timer = setInterval(() => { $('helper-meter').style.width = level * 100 + '%'; $('helper-level').textContent = Math.round(level * 100); if (connected && window.opener?.closed) { mic.stop(); window.close(); } }, 80);
window.addEventListener('pagehide', () => { clearInterval(timer); mic.destroy(); });
async function boot() {
  const context = await api('/api/teacher/microphone-context');
  if (parentOrigin || channel) {
    if (!window.opener || !context.allowedOrigins.includes(parentOrigin) || !/^[A-Za-z0-9-]{16,80}$/.test(channel || '')) throw Error('请从教师大屏重新打开麦克风窗口。');
    connected = true; $('helper-start').disabled = false; $('helper-connection').textContent = '已连接教师大屏；实测响度会同步过去。'; notify('teacher-microphone-ready');
  } else { $('helper-start').disabled = false; $('helper-status').textContent = '点击开启并允许使用麦克风。'; $('helper-connection').textContent = '单独测试窗口；从教师大屏打开时会同步。'; }
}
boot().catch(e => { $('helper-status').textContent = e.message; $('helper-start').disabled = true; });
