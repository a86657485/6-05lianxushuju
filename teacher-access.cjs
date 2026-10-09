'use strict';
/*
 * 教师大屏、答案与管理接口的访问范围。
 * 默认：教师电脑自身（localhost 与本机各网卡地址）。
 * 需要让另一台教师设备（如讲台平板）访问时，启动前设置 TEACHER_ALLOW，
 * 例如 TEACHER_ALLOW=192.168.1.23 或 TEACHER_ALLOW=192.168.1.0/24（逗号分隔）。
 * 页面和管理接口使用同一判断；隐藏入口不当作认证。
 */
const { isIP } = require('node:net');

function normalizeAddress(address) {
  if (typeof address !== 'string') return null;
  const value = address.split('%')[0];
  if (isIP(value) === 4) return value;
  if (isIP(value) !== 6) return null;
  const normalized = new URL(`http://[${value}]/`).hostname.slice(1, -1);
  const mapped = normalized.match(/^::ffff:([0-9a-f]+):([0-9a-f]+)$/);
  if (mapped) {
    const high = parseInt(mapped[1], 16), low = parseInt(mapped[2], 16);
    return [high >>> 8, high & 255, low >>> 8, low & 255].join('.');
  }
  const dotted = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) return dotted[1];
  return normalized;
}
function localAddresses(interfaces) {
  return Object.values(interfaces).flat().map(net => normalizeAddress(net?.address)).filter(Boolean);
}
function ipv4ToInt(ip) { return ip.split('.').reduce((n, p) => (n << 8) + Number(p), 0) >>> 0; }
function parseAllowList(text) {
  return String(text || '').split(',').map(s => s.trim()).filter(Boolean).map(entry => {
    const [ip, bits] = entry.split('/');
    if (isIP(ip) !== 4) return null;
    const prefix = bits === undefined ? 32 : Number(bits);
    if (!Number.isInteger(prefix) || prefix < 8 || prefix > 32) return null; // 不允许过宽的网段
    return { base: ipv4ToInt(ip), prefix };
  }).filter(Boolean);
}
function inAllowList(address, allow) {
  if (!address || isIP(address) !== 4) return false;
  const n = ipv4ToInt(address);
  return allow.some(({ base, prefix }) => {
    const mask = prefix === 32 ? 0xffffffff : (~((1 << (32 - prefix)) - 1)) >>> 0;
    return ((n & mask) >>> 0) === ((base & mask) >>> 0);
  });
}
function isTeacherAddress(address, interfaces, allow = []) {
  const normalized = normalizeAddress(address);
  if (!normalized) return false;
  if (normalized === '::1' || normalized.startsWith('127.')) return true;
  if (localAddresses(interfaces).includes(normalized)) return true;
  return inAllowList(normalized, allow);
}
function teacherOrigins(port, interfaces) {
  return [...new Set(['localhost', '127.0.0.1', '::1', ...localAddresses(interfaces)]
    .map(a => new URL(`http://${a.includes(':') ? '[' + a + ']' : a}:${port}`).origin))];
}
module.exports = { isTeacherAddress, teacherOrigins, normalizeAddress, parseAllowList };
