/* 学生记录先存本机待同步队列，再按顺序补传；服务端按记录标识去重。 */
export async function api(url, data) {
  const res = await fetch(url, { method: data === undefined ? 'GET' : 'POST', headers: data === undefined ? {} : { 'Content-Type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data) });
  let value = {};
  try { value = await res.json(); } catch { value = { error: '服务返回了无法读取的内容' }; }
  if (!res.ok) { const e = Error(value.error || '连接失败'); e.status = res.status; e.data = value; throw e; }
  return value;
}
export function uniqueId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
}
export class ClassroomSync {
  constructor(onStatus, onState, storage = globalThis.localStorage) {
    this.onStatus = onStatus; this.onState = onState; this.storage = storage;
    this.busy = false; this.epoch = 0; this.queue = [];
    if (typeof setInterval === 'function') this.timer = setInterval(() => this.flush(), 4000);
    globalThis.addEventListener?.('online', () => this.flush());
  }
  attach(state) {
    this.epoch++; this.state = state; this.key = 'lesson5-outbox:' + state.student.id + ':' + state.round;
    this.queue = this.read(); this.blocked = false;
    this.onStatus(this.queue.length ? '待同步记录已恢复' : '已载入课堂记录', !!this.queue.length);
    return this.flush();
  }
  read() { try { return JSON.parse(this.storage.getItem(this.key) || '[]'); } catch { this.onStatus('本机记录读取失败，请联系老师', true); return []; } }
  disk() { try { this.storage.setItem(this.key, JSON.stringify(this.queue)); } catch { this.onStatus('本机存储不足，请告诉老师', true); } }
  enqueue(stage, record) {
    if (!this.state) return;
    this.queue.push({ eventId: uniqueId(), sid: this.state.student.id, round: this.state.round, stage, record: structuredClone(record) });
    this.disk(); this.onStatus('已存本机 · 正在同步', true); return this.flush();
  }
  async flush() {
    if (this.busy || this.blocked || !this.queue?.length) return;
    this.busy = true; const epoch = this.epoch;
    try {
      while (this.queue.length && epoch === this.epoch) {
        const event = this.queue[0];
        const s = await api('/api/event', event);
        if (epoch !== this.epoch) return;
        this.queue.shift(); this.disk(); this.state = s; this.onState(s);
      }
      if (epoch === this.epoch) this.onStatus('已同步 · ' + new Date().toLocaleTimeString('zh-CN', { hour12: false }), false);
    } catch (e) {
      if (epoch === this.epoch) {
        if ([401, 403, 409, 400].includes(e.status)) this.blocked = true;
        this.onStatus(this.blocked ? e.message + ' · 本机记录已保留，请告诉老师' : '连接中断 · 已存本机，恢复后自动补传', true);
      }
    } finally {
      this.busy = false;
      if (epoch !== this.epoch && this.queue?.length) this.flush();
    }
  }
  pending() { return this.queue?.length || 0; }
  detach() { this.epoch++; this.state = null; this.queue = []; this.blocked = false; }
}
export function download(name, data) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function escape(s) { return String(s ?? '').replace(/[&<>"']/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[x])); }
