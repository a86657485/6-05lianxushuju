'use strict';
/* 第5课《连续变化的数据》课堂服务：名单登录、关卡证据、积分去重、20题考核、教师大屏。 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const { DatabaseSync } = require('node:sqlite');
const quiz = require('./quiz.cjs');
const { isTeacherAddress, teacherOrigins, parseAllowList } = require('./teacher-access.cjs');

const BASE = __dirname;
const CLASSES = ['601', '602', '603', '604', '605', '606'];
const COOKIE_STUDENT = 'lesson5_student';
const DEFAULT_PORT = 8796;

function shuffleQuestion(q) {
  const order = q.options.map((_, i) => i).map(i => ({ i, n: crypto.randomInt(0, 1e9) })).sort((a, b) => a.n - b.n).map(v => v.i);
  return { ...q, options: order.map(i => q.options[i]), answer: order.indexOf(q.answer) };
}

function createService(options = {}) {
  const networkInterfaces = options.networkInterfaces || os.networkInterfaces;
  const allow = parseAllowList(options.teacherAllow ?? process.env.TEACHER_ALLOW);
  const runtimeDir = options.runtimeDir || path.join(BASE, 'runtime');
  fs.mkdirSync(runtimeDir, { recursive: true, mode: 0o700 });
  let roster = options.roster;
  if (!roster) {
    const source = fs.existsSync(path.join(BASE, 'roster.json')) ? 'roster.json' : 'roster.example.json';
    roster = JSON.parse(fs.readFileSync(path.join(BASE, source), 'utf8'));
    if (source.includes('example')) console.warn('使用明确标注的样例名单，请按说明导入六年级正式名单。');
  }
  const rules = require('./public/rules.js');
  const stages = rules.stageIds;
  const pointsOf = id => rules.stages.find(s => s.id === id).points;
  const db = new DatabaseSync(path.join(runtimeDir, 'classroom.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000;
    CREATE TABLE IF NOT EXISTS students(id TEXT PRIMARY KEY, classId TEXT NOT NULL, name TEXT NOT NULL, manual INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS rounds(classId TEXT PRIMARY KEY, n INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS states(sid TEXT NOT NULL, round TEXT NOT NULL, json TEXT NOT NULL, PRIMARY KEY(sid, round));
    CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, role TEXT NOT NULL, sid TEXT, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS events(id TEXT NOT NULL, sid TEXT NOT NULL, round TEXT NOT NULL, PRIMARY KEY(id, sid, round));
    CREATE TABLE IF NOT EXISTS exams(id TEXT PRIMARY KEY, sid TEXT NOT NULL, round TEXT NOT NULL, json TEXT NOT NULL);`);
  const rosterIds = new Set();
  for (const s of roster) {
    if (!CLASSES.includes(String(s.classId)) || !s.id || !String(s.name).trim()) throw new Error('名单包含不合法的六年级班级或身份');
    rosterIds.add(String(s.id));
    db.prepare('INSERT INTO students VALUES(?,?,?,0) ON CONFLICT(id) DO UPDATE SET classId=excluded.classId, name=excluded.name, manual=0')
      .run(String(s.id), String(s.classId), String(s.name).trim());
  }
  for (const c of CLASSES) db.prepare('INSERT OR IGNORE INTO rounds VALUES(?,1)').run(c);

  let live = { at: null, level: 0, threshold: 60, alarm: false, active: false, alarmCount: 0 };
  const now = () => new Date().toISOString();
  const student = id => { const s = db.prepare('SELECT * FROM students WHERE id=?').get(id); return s ? { ...s, manual: !!s.manual } : null; };
  const roundOf = classId => 'r' + db.prepare('SELECT n FROM rounds WHERE classId=?').get(classId).n;
  const roundFor = s => roundOf(s.classId);
  const emptyStage = () => ({ first: null, latest: null, firstSubmitted: null, lastSubmitted: null, history: [] });
  const initial = (s, round) => ({ student: s, round, records: Object.fromEntries(stages.map(k => [k, emptyStage()])), awards: [], points: 0, updated: null, quizAttempts: [] });

  function state(s, round = roundFor(s)) {
    const row = db.prepare('SELECT json FROM states WHERE sid=? AND round=?').get(s.id, round);
    const data = row ? JSON.parse(row.json) : initial(s, round);
    data.student = s;
    for (const k of stages) data.records[k] ||= emptyStage();
    const open = db.prepare('SELECT json FROM exams WHERE sid=? AND round=? ORDER BY rowid DESC').all(s.id, round).map(r => JSON.parse(r.json)).find(e => !e.submitted);
    if (open) data.currentExam = { id: open.id, round: open.round, questions: open.questions.map(quiz.publicQuestion) };
    else delete data.currentExam;
    return data;
  }
  function save(data) {
    data.updated = now();
    const copy = { ...data }; delete copy.currentExam;
    db.prepare('INSERT INTO states VALUES(?,?,?) ON CONFLICT(sid, round) DO UPDATE SET json=excluded.json').run(data.student.id, data.round, JSON.stringify(copy));
  }
  function cookieSession(req) {
    const token = (req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith(COOKIE_STUDENT + '='))?.slice(COOKIE_STUDENT.length + 1);
    if (!token) return null;
    return db.prepare('SELECT * FROM sessions WHERE token=? AND role=? AND expires>?').get(token, 'student', Date.now());
  }
  function json(res, status, data) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); }
  function fail(status, message, extra = {}) { throw Object.assign(new Error(message), { status, ...extra }); }
  function teacher(req) { if (!isTeacherAddress(req.socket.remoteAddress, networkInterfaces(), allow)) fail(403, '教师入口仅限教师设备访问'); }
  function signedStudent(req) { const session = cookieSession(req); if (!session) fail(401, '请先选择班级与姓名'); const s = student(session.sid); if (!s) fail(401, '学生身份不存在'); return s; }
  function matchIdentity(req, body) {
    const s = signedStudent(req);
    if (body.sid !== s.id) fail(403, '记录身份与当前学生不一致');
    if (body.round !== roundFor(s)) fail(409, '课堂已经开启新轮次，旧轮次记录未覆盖，请刷新查看', { round: roundFor(s) });
    return s;
  }
  function setSession(res, sid) {
    const token = crypto.randomBytes(24).toString('hex');
    db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(token, 'student', sid, Date.now() + 7 * 86400000);
    res.setHeader('Set-Cookie', `${COOKIE_STUDENT}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800`);
  }
  async function readBody(req) {
    let size = 0; const parts = [];
    for await (const chunk of req) { size += chunk.length; if (size > 128 * 1024) fail(413, '提交内容过大'); parts.push(chunk); }
    if (!parts.length) return {};
    try { const body = JSON.parse(Buffer.concat(parts).toString()); if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, '提交格式不正确'); return body; }
    catch (e) { if (e.status) throw e; fail(400, '提交格式不正确'); }
  }
  function examFor(s, id) {
    const row = db.prepare('SELECT json FROM exams WHERE id=? AND sid=?').get(String(id), s.id);
    if (!row) fail(404, '考核不存在');
    const e = JSON.parse(row.json);
    if (e.round !== roundFor(s)) fail(409, '本次考核属于旧轮次');
    return e;
  }
  function classPayload(classId, full = false) {
    const round = roundOf(classId);
    const students = db.prepare('SELECT * FROM students WHERE classId=? ORDER BY rowid').all(classId)
      .filter(s => rosterIds.has(s.id) || s.manual)
      .map(s => {
        s.manual = !!s.manual;
        const current = state(s);
        delete current.currentExam;
        // 大屏只需要摘要与必要的过程记录：去掉曲线原始点，历史只留时间与结果，减轻每5秒刷新的体积（导出 full=1 保留完整记录）
        for (const k of stages) {
          if (full) { current.records[k].summary = rules.stageSummary(k, current.records[k], (current.awards || []).some(a => a.stage === k)); continue; }
          const st = current.records[k];
          for (const f of ['first', 'latest', 'firstSubmitted', 'lastSubmitted']) if (st[f]) { st[f] = { ...st[f] }; delete st[f].lastTrace; delete st[f].firstCheck; }
          st.history = (st.history || []).map(h => ({ created: h.created, submitted: h.submitted === true, pass: !!h.assessment?.pass }));
          st.summary = rules.stageSummary(k, st, (current.awards || []).some(a => a.stage === k));
        }
        current.stars = stages.reduce((n, k) => n + current.records[k].summary.stars, 0);
        if (!full) current.quizAttempts = (current.quizAttempts || []).map(q => ({ id: q.id, score: q.score, byGoal: q.byGoal, created: q.created }));
        current.roundHistory = db.prepare('SELECT round FROM states WHERE sid=? AND round<>?').all(s.id, current.round).map(r => r.round);
        return current;
      });
    return { classId, at: now(), round, students };
  }

  function handleEvent(req, body) {
    const s = matchIdentity(req, body);
    if (!stages.includes(body.stage)) fail(400, '未知关卡');
    if (typeof body.eventId !== 'string' || !body.eventId.trim() || body.eventId.length > 120) fail(400, '缺少有效记录标识');
    const r = body.record;
    if (!r || typeof r !== 'object' || Array.isArray(r)) fail(400, '缺少学习记录');
    if (r.trials !== undefined && (!Array.isArray(r.trials) || r.trials.length > 60 || r.trials.some(t => !t || typeof t !== 'object' || Array.isArray(t)))) fail(400, '实验记录格式不正确');
    const data = state(s);
    if (db.prepare('SELECT 1 FROM events WHERE id=? AND sid=? AND round=?').get(body.eventId, s.id, data.round)) return data; // 补传去重
    const index = stages.indexOf(body.stage);
    if (index && !data.awards.some(a => a.stage === stages[index - 1])) fail(409, '请先完成上一必做关卡');
    const assessment = rules.assess(body.stage, r);
    const received = Date.now();
    const editTime = (rec, fallback) => Number.isFinite(rec?.editedAt) && rec.editedAt >= 0 && rec.editedAt <= received + 60000 ? rec.editedAt : fallback;
    const record = { ...r, editedAt: editTime(r, received), eventId: body.eventId, assessment, created: new Date(received).toISOString() };
    const st = data.records[body.stage];
    const stale = !!st.latest && record.editedAt < editTime(st.latest, Date.parse(st.latest.created) || 0); // 旧设备迟到的补传不覆盖新记录
    if (!st.first && rules.predictionValues[body.stage].includes(record.prediction)) st.first = record;
    if (!stale) st.latest = record;
    if (record.submitted === true) {
      // 作答内容变了才算新的一次尝试（补写站末句块、重复补传不算）
      const prevKey = st.lastSubmittedKey ?? null, key = rules.answerKey(record);
      if (key !== prevKey) { st.attempts = (st.attempts || 0) + 1; st.lastSubmittedKey = key; }
      if (!st.firstSubmitted) st.firstSubmitted = record; if (!stale) st.lastSubmitted = record;
    }
    st.history.push(record);
    if (st.history.length > 40) st.history = st.first ? [st.first, ...st.history.filter(h => h.eventId !== st.first.eventId).slice(-39)] : st.history.slice(-40);
    if (!stale && assessment.pass && !data.awards.some(a => a.stage === body.stage)) {
      data.awards.push({ stage: body.stage, points: pointsOf(body.stage), created: now(), eventId: body.eventId });
      data.points = data.awards.reduce((n, a) => n + a.points, 0);
    }
    // 证据摘要由服务端按规则重算：首次/最近、尝试次数、提示、误解标签、迁移、证据星
    for (const k of stages) data.records[k].summary = rules.stageSummary(k, data.records[k], data.awards.some(a => a.stage === k));
    data.stars = stages.reduce((n, k) => n + data.records[k].summary.stars, 0);
    db.exec('BEGIN IMMEDIATE');
    try { save(data); db.prepare('INSERT INTO events VALUES(?,?,?)').run(body.eventId, s.id, data.round); db.exec('COMMIT'); }
    catch (e) { db.exec('ROLLBACK'); throw e; }
    return data;
  }

  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; media-src 'self' blob:; object-src 'none'; frame-ancestors 'self'");
    try {
      const url = new URL(req.url, 'http://localhost'); const p = url.pathname;
      if (!['GET', 'POST', 'HEAD'].includes(req.method)) fail(405, '不支持的请求方法');
      if (req.method === 'POST' && req.headers.origin) { let same = false; try { same = new URL(req.headers.origin).host === req.headers.host; } catch {} if (!same) fail(403, '不接受来自其他页面的提交'); }
      const body = req.method === 'POST' ? await readBody(req) : {};
      if (p === '/api/classes' && req.method === 'GET') return json(res, 200, { classes: CLASSES });
      if (p === '/api/roster' && req.method === 'GET') {
        const c = url.searchParams.get('class'); if (!CLASSES.includes(c)) fail(400, '请选择六年级班级');
        return json(res, 200, db.prepare('SELECT id,name,manual FROM students WHERE classId=? ORDER BY rowid').all(c).filter(s => rosterIds.has(s.id) || s.manual).map(s => ({ ...s, manual: !!s.manual })));
      }
      if (p === '/api/login' && req.method === 'POST') {
        const classId = String(body.classId || ''); if (!CLASSES.includes(classId)) fail(400, '请选择六年级班级');
        let s;
        if (body.id) { s = student(String(body.id)); if (!s || s.classId !== classId) fail(400, '姓名不属于所选班级'); }
        else {
          if (typeof body.name !== 'string') fail(400, '请输入姓名文字');
          const name = body.name.trim(); if (!name || name.length > 30) fail(400, '请输入有效姓名，最多30个字符');
          const matches = db.prepare('SELECT * FROM students WHERE classId=? AND name=?').all(classId, name);
          if (matches.length) fail(409, '已有同名记录，请确认并选择已有身份', { choices: matches.map(m => ({ id: m.id, name: m.name, manual: !!m.manual })) });
          s = { id: 'manual-' + crypto.randomUUID(), classId, name, manual: true };
          db.prepare('INSERT INTO students VALUES(?,?,?,1)').run(s.id, classId, name);
        }
        const data = state(s); if (!data.updated) save(data); setSession(res, s.id); return json(res, 200, state(s));
      }
      if (p === '/api/me' && req.method === 'GET') return json(res, 200, state(signedStudent(req)));
      if (p === '/api/logout' && req.method === 'POST') {
        const session = cookieSession(req); if (session) db.prepare('DELETE FROM sessions WHERE token=?').run(session.token);
        res.setHeader('Set-Cookie', `${COOKIE_STUDENT}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`); return json(res, 200, { ok: true });
      }
      if (p === '/api/event' && req.method === 'POST') return json(res, 200, handleEvent(req, body));
      if (p === '/api/exam/create' && req.method === 'POST') {
        const s = matchIdentity(req, body), data = state(s);
        if (data.currentExam) return json(res, 200, data.currentExam);
        const e = { id: crypto.randomUUID(), sid: s.id, round: data.round, created: now(), questions: quiz.pickQuestions().map(shuffleQuestion), submitted: null };
        db.prepare('INSERT INTO exams VALUES(?,?,?,?)').run(e.id, s.id, e.round, JSON.stringify(e));
        return json(res, 200, { id: e.id, round: e.round, questions: e.questions.map(quiz.publicQuestion) });
      }
      if (p === '/api/exam/submit' && req.method === 'POST') {
        const s = matchIdentity(req, body), e = examFor(s, body.examId);
        if (e.submitted) return json(res, 200, e.submitted);
        const answers = body.answers;
        if (!answers || typeof answers !== 'object' || e.questions.some(q => !Number.isInteger(answers[q.id]) || answers[q.id] < 0 || answers[q.id] >= q.options.length)) fail(400, '请完成全部20题后提交');
        const feedback = e.questions.map(q => ({ ...q, correct: answers[q.id] === q.answer, chosen: answers[q.id] }));
        const byGoal = {};
        for (const q of feedback) { byGoal[q.goal] ||= { right: 0, total: 0 }; byGoal[q.goal].total++; if (q.correct) byGoal[q.goal].right++; }
        const result = { id: e.id, score: feedback.filter(q => q.correct).length * 5, byGoal, feedback, created: now() };
        e.submitted = result;
        const data = state(s); data.quizAttempts.push(result); delete data.currentExam;
        db.exec('BEGIN IMMEDIATE');
        try { db.prepare('UPDATE exams SET json=? WHERE id=?').run(JSON.stringify(e), e.id); save(data); db.exec('COMMIT'); }
        catch (error) { db.exec('ROLLBACK'); throw error; }
        return json(res, 200, result);
      }
      if (p === '/api/live' && req.method === 'GET') return json(res, 200, { ...live, serverNow: Date.now() });
      if (p.startsWith('/api/teacher/')) {
        teacher(req);
        if (p === '/api/teacher/microphone-context' && req.method === 'GET') { const port = server.address().port; return json(res, 200, { microphoneUrl: `http://localhost:${port}/teacher-microphone`, allowedOrigins: teacherOrigins(port, networkInterfaces()) }); }
        if (p === '/api/teacher/class' && req.method === 'GET') { const classId = url.searchParams.get('class'); if (!CLASSES.includes(classId)) fail(400, '请选择六年级班级'); return json(res, 200, classPayload(classId, url.searchParams.get('full') === '1')); }
        if (p === '/api/teacher/answers' && req.method === 'GET') return json(res, 200, { questions: quiz.questions, goals: quiz.groups });
        if (p === '/api/teacher/new-round' && req.method === 'POST') {
          if (!CLASSES.includes(body.classId)) fail(400, '请选择六年级班级');
          db.prepare('UPDATE rounds SET n=n+1 WHERE classId=?').run(body.classId);
          return json(res, 200, { ok: true, classId: body.classId, round: roundOf(body.classId) });
        }
        if (p === '/api/teacher/live' && req.method === 'POST') {
          const ok = Number.isFinite(body.level) && body.level >= 0 && body.level <= 100 && Number.isFinite(body.threshold) && body.threshold >= 0 && body.threshold <= 100
            && typeof body.alarm === 'boolean' && typeof body.active === 'boolean' && Number.isInteger(body.alarmCount) && body.alarmCount >= 0;
          if (!ok) fail(400, '现场监测数据不正确');
          live = { at: now(), level: body.level, threshold: body.threshold, alarm: body.alarm, active: body.active, alarmCount: body.alarmCount };
          return json(res, 200, live);
        }
      }
      if (p.startsWith('/api/')) fail(404, '接口不存在');
      if (['/test', '/teacher', '/teacher-microphone'].includes(p)) teacher(req);
      const aliases = { '/': 'index.html', '/teacher': 'teacher.html', '/teacher-microphone': 'teacher-microphone.html', '/test': 'index.html', '/demo': 'index.html' };
      let relative = aliases[p];
      if (!relative) {
        let decoded; try { decoded = decodeURIComponent(p); } catch { fail(400, '地址格式不正确'); }
        if (decoded.includes('..') || decoded.includes('\\') || decoded.includes('\0')) fail(404, '文件不存在');
        relative = decoded.replace(/^\/+/, '');
      }
      const publicRoot = path.join(BASE, 'public'), file = path.resolve(publicRoot, relative);
      if (!file.startsWith(publicRoot + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) fail(404, '文件不存在');
      if (!fs.realpathSync(file).startsWith(fs.realpathSync(publicRoot) + path.sep)) fail(404, '文件不存在');
      if (['teacher.html', 'teacher-microphone.html', 'teacher.mjs', 'teacher-microphone.mjs', 'demo-class.json'].includes(path.basename(file))) teacher(req);
      const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ogg': 'audio/ogg', '.webp': 'image/webp' };
      const ext = path.extname(file);
      res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control': ['.html', '.js', '.mjs', '.css'].includes(ext) ? 'no-cache' : 'public, max-age=3600' });
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(file).pipe(res);
    } catch (e) {
      if (res.headersSent) { res.destroy(); return; }
      json(res, e.status || 500, { error: e.status ? e.message : '服务暂时无法保存，请稍后重试', ...(e.choices ? { choices: e.choices } : {}), ...(e.round ? { round: e.round } : {}) });
      if (!e.status) console.error('课堂服务错误:', e.message);
    }
  });
  return { server, close: () => db.close(), runtimeDir };
}

function lanAddresses() {
  const out = [];
  for (const [name, nets] of Object.entries(os.networkInterfaces())) {
    if (/^(docker|br-|veth|utun|awdl|llw|bridge|vmnet|lo)/.test(name)) continue;
    for (const net of nets || []) if (net.family === 'IPv4' && !net.internal) out.push(net.address);
  }
  return out;
}

if (require.main === module) {
  const service = createService();
  const port = Number(process.env.PORT) || DEFAULT_PORT;
  service.server.listen(port, '0.0.0.0', () => {
    console.log(`教师本机入口：http://localhost:${port}/teacher（免密码，限教师设备访问）`);
    for (const ip of lanAddresses()) console.log(`学生局域网入口：http://${ip}:${port}`);
    console.log('课堂数据保存在 runtime/classroom.sqlite；关闭此窗口即停止服务。');
  });
  const shutdown = () => service.server.close(() => { service.close(); process.exit(0); });
  process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
}
module.exports = { createService, CLASSES, DEFAULT_PORT };
