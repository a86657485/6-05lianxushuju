'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { isTeacherAddress, parseAllowList, normalizeAddress, teacherOrigins } = require('../teacher-access.cjs');
const nets = { en0: [{ address: '192.168.1.10', family: 'IPv4' }], lo0: [{ address: '127.0.0.1', family: 'IPv4' }] };

test('教师设备：本机回环与本机网卡地址可访问，其他学生设备不可', () => {
  assert.ok(isTeacherAddress('127.0.0.1', nets));
  assert.ok(isTeacherAddress('::1', nets));
  assert.ok(isTeacherAddress('::ffff:127.0.0.1', nets));
  assert.ok(isTeacherAddress('192.168.1.10', nets));
  assert.ok(isTeacherAddress('::ffff:192.168.1.10', nets));
  assert.equal(isTeacherAddress('192.168.1.23', nets), false);
  assert.equal(isTeacherAddress(undefined, nets), false);
});
test('按部署追加教师设备或网段（TEACHER_ALLOW）', () => {
  const allow = parseAllowList('192.168.1.23, 10.0.5.0/24, bad, 1.2.3.4/4');
  assert.equal(allow.length, 2, '无效项与过宽网段被忽略');
  assert.ok(isTeacherAddress('192.168.1.23', nets, allow));
  assert.ok(isTeacherAddress('10.0.5.77', nets, allow));
  assert.equal(isTeacherAddress('10.0.6.1', nets, allow), false);
  assert.equal(isTeacherAddress('192.168.1.24', nets, allow), false);
});
test('地址规范化与教师麦克风窗口来源', () => {
  assert.equal(normalizeAddress('::ffff:c0a8:010a'), '192.168.1.10');
  const o = teacherOrigins(8796, nets);
  assert.ok(o.includes('http://localhost:8796') && o.includes('http://192.168.1.10:8796'));
});
