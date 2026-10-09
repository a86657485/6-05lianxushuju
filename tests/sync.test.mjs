import test from 'node:test';
import assert from 'node:assert/strict';
const { ClassroomSync } = await import('../public/sync.mjs');

test('断网时记录留在本机队列，恢复后按顺序补传', async () => {
  const store = new Map(); const storage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  let online = false; const received = [];
  globalThis.fetch = async (url, init) => {
    if (!online) throw new TypeError('network down');
    const body = JSON.parse(init.body); received.push(body.eventId);
    return { ok: true, status: 200, json: async () => ({ student: { id: 's1' }, round: 'r1', got: received.length }) };
  };
  const statuses = []; let latest = null;
  const sync = new ClassroomSync((m, p) => statuses.push([m, p]), s => latest = s, storage);
  clearInterval(sync.timer);
  await sync.attach({ student: { id: 's1' }, round: 'r1' });
  await sync.enqueue('flow', { a: 1 }); await sync.enqueue('flow', { a: 2 });
  assert.equal(sync.pending(), 2); assert.ok(statuses.at(-1)[0].includes('已存本机'));
  assert.equal(JSON.parse(store.get('lesson5-outbox:s1:r1')).length, 2, '队列写入本机存储');
  online = true; await sync.flush();
  assert.equal(sync.pending(), 0); assert.equal(received.length, 2); assert.equal(latest.got, 2);
  const restored = new ClassroomSync(() => {}, () => {}, storage); clearInterval(restored.timer);
  await restored.attach({ student: { id: 's1' }, round: 'r1' }); assert.equal(restored.pending(), 0);
});
