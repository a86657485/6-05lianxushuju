/* 第5课导入页：翻页、视频、实时数字、选做麦克风、投票。离线可用，无外部依赖。 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var stage = $('stage'), scenes = Array.prototype.slice.call(document.querySelectorAll('.scene'));
  var cur = 0, step = 0, started = null, reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- 小递与图标（与课堂应用同一造型） ---------- */
  var XIAODI = '<svg viewBox="0 0 80 96" role="img" aria-label="小递"><ellipse cx="40" cy="93" rx="28" ry="4" fill="#000" opacity=".18"/><circle cx="40" cy="8" r="5" fill="#3fc1b5"/><rect x="38" y="10" width="4" height="8" fill="#9fb3bd"/>' +
    '<rect x="14" y="18" width="52" height="38" rx="14" fill="#fff" stroke="#c9d8de" stroke-width="2"/><rect x="21" y="25" width="38" height="24" rx="9" fill="#173d50"/><circle cx="32" cy="37" r="5" fill="#7fe6dc"/><circle cx="48" cy="37" r="5" fill="#7fe6dc"/>' +
    '<rect x="22" y="58" width="36" height="22" rx="8" fill="#fff" stroke="#c9d8de" stroke-width="2"/><rect x="8" y="60" width="10" height="16" rx="5" fill="#3fc1b5"/><g class="arm"><rect x="62" y="60" width="10" height="16" rx="5" fill="#3fc1b5"/></g><circle cx="30" cy="84" r="5" fill="#607984"/><circle cx="50" cy="84" r="5" fill="#607984"/></svg>';
  document.querySelectorAll('[data-xiaodi]').forEach(function (el) { el.innerHTML = XIAODI; });
  var ICONS = {
    mic: '<svg viewBox="0 0 100 100"><rect x="34" y="10" width="32" height="52" rx="16" fill="#176e93"/><path d="M24 46 a26 26 0 0 0 52 0" fill="none" stroke="#173d50" stroke-width="7" stroke-linecap="round"/><rect x="46" y="72" width="8" height="14" fill="#173d50"/><rect x="32" y="84" width="36" height="7" rx="3" fill="#173d50"/></svg>',
    chip: '<svg viewBox="0 0 100 100"><rect x="22" y="22" width="56" height="56" rx="10" fill="#277f79"/><rect x="34" y="34" width="32" height="32" rx="5" fill="#7fe6dc"/>' + [30, 42, 54, 66].map(function (p) { return '<rect x="' + (p - 2) + '" y="10" width="4" height="12" fill="#173d50"/><rect x="' + (p - 2) + '" y="78" width="4" height="12" fill="#173d50"/><rect x="10" y="' + (p - 2) + '" width="12" height="4" fill="#173d50"/><rect x="78" y="' + (p - 2) + '" width="12" height="4" fill="#173d50"/>'; }).join('') + '</svg>',
    lamp: '<svg viewBox="0 0 100 100"><circle class="glow" cx="50" cy="42" r="40" fill="#ffd36b" opacity="0"/><path d="M50 12 a26 26 0 0 0 -15 47 v10 h30 v-10 a26 26 0 0 0 -15 -47z" fill="#ffe9a8" stroke="#173d50" stroke-width="5"/><rect x="36" y="72" width="28" height="7" rx="3" fill="#607984"/><rect x="38" y="82" width="24" height="7" rx="3" fill="#607984"/></svg>'
  };
  var icoEls = document.querySelectorAll('.recap .ico');
  ['mic', 'chip', 'lamp'].forEach(function (k, i) { if (icoEls[i]) icoEls[i].innerHTML = ICONS[k]; });

  /* ---------- 缩放到投影尺寸（16:9 舞台按窗口等比缩放） ---------- */
  function fit() { var s = Math.min(innerWidth / 1920, innerHeight / 1080); stage.style.setProperty('--s', s); }
  addEventListener('resize', fit); fit();

  /* ---------- 翻页 ---------- */
  var dots = $('dots');
  scenes.forEach(function (sc, i) { var b = document.createElement('button'); b.type = 'button'; b.title = (i + 1) + ' ' + sc.dataset.title; b.setAttribute('aria-label', '第' + (i + 1) + '屏：' + sc.dataset.title); b.onclick = function () { go(i, 0); }; dots.appendChild(b); });
  function stepsOf(i) { return Number(scenes[i].dataset.steps || 0); }
  function applySteps() {
    var sc = scenes[cur];
    sc.querySelectorAll('[class*="step-"]').forEach(function (el) { var m = el.className.match(/step-(\d+)/); el.classList.toggle('shown', m && Number(m[1]) <= step); });
    if (sc.classList.contains('recap')) { sc.classList.toggle('flowing', step >= 1); sc.classList.toggle('revealed', step >= 2); var g = sc.querySelector('.glow'); if (g) g.setAttribute('opacity', step >= 1 ? '.45' : '0'); }
    if (sc.classList.contains('video-scene')) sc.classList.toggle('with-q', step >= 1);
  }
  function go(i, s) {
    if (i < 0 || i >= scenes.length) return;
    var prev = scenes[cur], changed = i !== cur;
    if (changed) { leave(prev); prev.classList.remove('active'); }
    cur = i; step = s == null ? 0 : s;
    scenes[cur].classList.add('active');
    Array.prototype.forEach.call(dots.children, function (d, k) { d.classList.toggle('on', k === cur); });
    $('scene-name').textContent = (cur + 1) + '/' + scenes.length + ' ' + scenes[cur].dataset.title;
    applySteps();
    if (changed || s == null) enter(scenes[cur]);
    if (!started && cur > 0) started = Date.now();
    try { history.replaceState(null, '', '#' + (cur + 1)); } catch (e) { /* file:// 某些浏览器不允许 */ }
  }
  function next() { if (step < stepsOf(cur)) { step++; applySteps(); } else if (cur < scenes.length - 1) go(cur + 1, 0); }
  function prev() { if (step > 0) { step--; applySteps(); } else if (cur > 0) go(cur - 1, stepsOf(cur - 1)); }
  $('next').onclick = next; $('prev').onclick = prev;

  function enter(sc) {
    if (sc.classList.contains('video-scene')) playVideo(true);
    if (sc.classList.contains('life')) startLive();
    if (sc.classList.contains('mic')) startChart();
    if (sc.classList.contains('poll')) drawPoll();
  }
  function leave(sc) {
    if (sc.classList.contains('video-scene')) { video.pause(); }
    if (sc.classList.contains('life')) stopLive();
    if (sc.classList.contains('mic')) { stopMic(); stopChart(); }
  }

  /* ---------- 键盘 / 翻页笔 ---------- */
  addEventListener('keydown', function (e) {
    if (e.target && e.target.isContentEditable) { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); e.target.blur(); try { localStorage.setItem('lesson5-intro-url', e.target.textContent.trim()); } catch (x) {} } return; }
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    var k = e.key;
    if (!$('blackout').hidden && k !== 'F5') { $('blackout').hidden = true; e.preventDefault(); return; }
    if (k === 'ArrowRight' || k === 'PageDown' || k === ' ' || k === 'Enter' || k === 'ArrowDown') { e.preventDefault(); next(); }
    else if (k === 'ArrowLeft' || k === 'PageUp' || k === 'Backspace' || k === 'ArrowUp') { e.preventDefault(); prev(); }
    else if (k === 'Home') go(0, 0); else if (k === 'End') go(scenes.length - 1, 0);
    else if (/^[1-9]$/.test(k) && Number(k) <= scenes.length) go(Number(k) - 1, 0);
    else if (k === 'f' || k === 'F') toggleFs();
    else if ((k === 'p' || k === 'P' || k === 'k' || k === 'K') && scenes[cur].classList.contains('video-scene')) toggleVideo();
    else if ((k === 'r' || k === 'R') && scenes[cur].classList.contains('video-scene')) { video.currentTime = 0; playVideo(); }
    else if ((k === 'a' || k === 'A' || k === 'b' || k === 'B') && scenes[cur].classList.contains('poll')) vote(k.toLowerCase());
    else if (k === '.') $('blackout').hidden = false;
    else if (k === '?' || k === 'h' || k === 'H') $('help-panel').hidden = !$('help-panel').hidden;
    else if (k === 'Escape') $('help-panel').hidden = true;
  });
  $('blackout').onclick = function () { $('blackout').hidden = true; };
  $('help').onclick = function () { $('help-panel').hidden = !$('help-panel').hidden; };
  $('help-close').onclick = function () { $('help-panel').hidden = true; };

  /* ---------- 全屏 ---------- */
  function toggleFs() {
    var d = document;
    if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
    else { var el = d.documentElement, req = el.requestFullscreen || el.webkitRequestFullscreen; if (req) req.call(el); }
  }
  $('fs').onclick = toggleFs;
  document.addEventListener('fullscreenchange', function () { $('fs').textContent = document.fullscreenElement ? '退出全屏' : '⛶ 全屏'; });

  /* ---------- 控制栏与鼠标自动隐藏 ---------- */
  var idleT;
  function wake() { $('controls').classList.remove('idle'); document.body.classList.remove('hide-cursor'); clearTimeout(idleT); idleT = setTimeout(function () { $('controls').classList.add('idle'); document.body.classList.add('hide-cursor'); }, 2600); }
  addEventListener('mousemove', wake); wake();
  setInterval(function () {
    if (!started) return;
    var s = Math.floor((Date.now() - started) / 1000), el = $('timer');
    el.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    el.classList.toggle('over', s > 240);
  }, 500);

  /* ---------- 视频 ---------- */
  var video = $('intro-video'), wrap = video.parentNode;
  function fmt(t) { t = Math.max(0, Math.floor(t || 0)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); }
  function syncVideoUi() {
    var paused = video.paused || video.ended;
    $('video-play').hidden = !paused; wrap.classList.toggle('paused', paused);
    $('video-toggle').textContent = paused ? '播放' : video.muted ? '🔇 点我开声音' : '暂停';
    $('video-time').textContent = fmt(video.currentTime) + ' / ' + fmt(video.duration || 22);
  }
  function playVideo(fromStart) {
    if (fromStart && (video.ended || video.currentTime > 0.5)) video.currentTime = 0;
    var p = video.play();
    if (p && p.catch) p.catch(function () { video.muted = true; video.play().catch(function () {}); syncVideoUi(); });
  }
  function toggleVideo() { if (video.muted && !video.paused) { video.muted = false; syncVideoUi(); return; } if (video.paused || video.ended) playVideo(video.ended); else video.pause(); }
  ['play', 'pause', 'ended', 'timeupdate', 'loadedmetadata'].forEach(function (ev) { video.addEventListener(ev, syncVideoUi); });
  video.addEventListener('ended', function () { if (scenes[cur].classList.contains('video-scene') && step < 1) { step = 1; applySteps(); } });
  video.addEventListener('error', function () { $('video-time').textContent = '视频无法播放：请用 Chrome / Edge 打开'; });
  video.onclick = toggleVideo; $('video-play').onclick = function () { playVideo(video.ended); };
  $('video-toggle').onclick = toggleVideo; $('video-replay').onclick = function () { video.currentTime = 0; playVideo(); };
  syncVideoUi();

  /* ---------- 生活中的显示屏：连续跳动的数字和小曲线 ---------- */
  var liveTimer = null, liveT = 0, nums = Array.prototype.slice.call(document.querySelectorAll('.live-num')), sparks = Array.prototype.slice.call(document.querySelectorAll('.spark')), hist = nums.map(function () { return []; });
  function liveVal(i, t) { var b = Number(nums[i].dataset.base), a = Number(nums[i].dataset.amp); return b + a * (0.6 * Math.sin(t / 7 + i * 2) + 0.3 * Math.sin(t / 2.3 + i) + 0.15 * Math.sin(t / 0.9 + i * 3)); }
  function tickLive() {
    liveT += 1;
    nums.forEach(function (el, i) {
      var v = liveVal(i, liveT); hist[i].push(v); if (hist[i].length > 60) hist[i].shift();
      if (liveT % 2 === 0) el.textContent = v.toFixed(1);
      var c = sparks[i], g = c.getContext('2d'), b = Number(el.dataset.base), a = Number(el.dataset.amp) * 1.3;
      g.clearRect(0, 0, c.width, c.height); g.strokeStyle = '#176e93'; g.lineWidth = 4; g.lineJoin = 'round'; g.beginPath();
      hist[i].forEach(function (y, k) { var x = k / 59 * c.width, yy = c.height / 2 - (y - b) / a * (c.height / 2 - 6); if (k) g.lineTo(x, yy); else g.moveTo(x, yy); });
      g.stroke();
    });
  }
  function startLive() { stopLive(); for (var k = 0; k < 60; k++) tickLive(); liveTimer = setInterval(tickLive, reduced ? 1000 : 160); }
  function stopLive() { clearInterval(liveTimer); liveTimer = null; }

  /* ---------- 选做：麦克风相对响度（不是分贝） ---------- */
  var ac = null, stream = null, analyser = null, buf = null, simDown = false, level = 0, chartTimer = null, series = [];
  function setStatus(t) { $('mic-status').textContent = t; }
  function startMic() {
    if (stream) { stopMic(); return; }
    var md = navigator.mediaDevices;
    if (!md || !md.getUserMedia) { setStatus('这个浏览器不能使用麦克风（可能是旧版浏览器）。请按住“模拟声音”演示。'); return; }
    setStatus('正在请求麦克风……请在浏览器弹出的提示中点“允许”。');
    md.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }).then(function (s) {
      stream = s; var AC = window.AudioContext || window.webkitAudioContext; ac = new AC();
      var src = ac.createMediaStreamSource(s); analyser = ac.createAnalyser(); analyser.fftSize = 1024; buf = new Float32Array(analyser.fftSize); src.connect(analyser);
      $('mic-start').textContent = '■ 关闭麦克风'; $('mic-start').classList.add('on');
      setStatus('麦克风已开启：只计算响度，不录音、不保存。');
    }).catch(function (err) {
      setStatus((err && err.name === 'NotAllowedError' ? '麦克风没有被允许。' : '没有找到可用的麦克风。') + '可以按住“模拟声音”演示。');
    });
  }
  function stopMic() {
    if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
    if (ac) ac.close().catch(function () {});
    stream = null; ac = null; analyser = null;
    $('mic-start').textContent = '🎤 开启麦克风'; $('mic-start').classList.remove('on');
  }
  function readLevel() {
    var target;
    if (analyser) {
      analyser.getFloatTimeDomainData(buf); var sum = 0; for (var i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      var rms = Math.sqrt(sum / buf.length), db = 20 * Math.log10(rms + 1e-7); // 相对值：-70 → 0，-10 → 100
      target = Math.max(0, Math.min(100, (db + 70) / 60 * 100));
      if (simDown) target = Math.max(target, 75);
    } else target = simDown ? 72 + 8 * Math.sin(Date.now() / 90) : 12 + 2 * Math.sin(Date.now() / 700);
    level += (target - level) * (target > level ? 0.5 : 0.18);
    return level;
  }
  function drawChart() {
    var c = $('mic-chart'), g = c.getContext('2d'), W = c.width, H = c.height, padL = 70, padB = 46, padT = 16;
    g.clearRect(0, 0, W, H); g.fillStyle = '#f6fafb'; g.fillRect(padL, padT, W - padL - 10, H - padT - padB);
    g.font = '24px sans-serif'; g.fillStyle = '#607984'; g.strokeStyle = '#d8e5ea'; g.lineWidth = 2;
    [0, 25, 50, 75, 100].forEach(function (v) { var y = padT + (H - padT - padB) * (1 - v / 100); g.beginPath(); g.moveTo(padL, y); g.lineTo(W - 10, y); g.stroke(); g.fillText(String(v), 14, y + 8); });
    g.fillText('15秒前', padL, H - 12); g.fillText('现在', W - 70, H - 12);
    g.strokeStyle = '#176e93'; g.lineWidth = 5; g.lineJoin = 'round'; g.beginPath();
    series.forEach(function (v, k) { var x = padL + k / 299 * (W - padL - 10), y = padT + (H - padT - padB) * (1 - v / 100); if (k) g.lineTo(x, y); else g.moveTo(x, y); });
    g.stroke();
  }
  function tickChart() {
    var v = readLevel(); series.push(v); if (series.length > 300) series.shift();
    $('mic-num').textContent = String(Math.round(v)); $('mic-bar').style.width = v.toFixed(1) + '%';
    drawChart();
  }
  function startChart() { stopChart(); series = []; chartTimer = setInterval(tickChart, 50); }
  function stopChart() { clearInterval(chartTimer); chartTimer = null; }
  $('mic-start').onclick = startMic;
  var sim = $('mic-sim');
  sim.addEventListener('pointerdown', function (e) { simDown = true; sim.setPointerCapture && sim.setPointerCapture(e.pointerId); });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (ev) { sim.addEventListener(ev, function () { simDown = false; }); });
  sim.addEventListener('keydown', function (e) { if (e.key === 'Enter') { simDown = true; e.stopPropagation(); } });
  sim.addEventListener('keyup', function (e) { if (e.key === 'Enter') simDown = false; });

  /* ---------- 投票（不揭示答案） ---------- */
  var votes = { a: 0, b: 0 };
  function drawPoll() {
    var pts = []; for (var i = 0; i <= 200; i++) { var x = i / 200; pts.push([30 + x * 580, 150 - 70 * Math.sin(x * 9) * Math.exp(-Math.pow(x - .55, 2) / .12) - 22 * Math.sin(x * 31)]); }
    var axes = '<line x1="30" y1="270" x2="615" y2="270" stroke="#9fb3bd" stroke-width="3"/><line x1="30" y1="20" x2="30" y2="270" stroke="#9fb3bd" stroke-width="3"/>';
    $('poll-a').innerHTML = axes + '<path d="' + pts.map(function (p, k) { return (k ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ') + '" fill="none" stroke="#176e93" stroke-width="6" stroke-linejoin="round"/>';
    $('poll-b').innerHTML = axes + pts.filter(function (p, k) { return k % 20 === 0; }).map(function (p) { return '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="13" fill="#e2725b"/>'; }).join('');
  }
  function vote(k) {
    votes[k]++; $('count-' + k).textContent = votes[k];
    var card = document.querySelector('[data-vote="' + k + '"]'); card.classList.remove('bump'); void card.offsetWidth; card.classList.add('bump'); setTimeout(function () { card.classList.remove('bump'); }, 180);
  }
  document.querySelectorAll('[data-vote]').forEach(function (b) { b.onclick = function () { vote(b.dataset.vote); b.blur(); }; });
  $('poll-reset').onclick = function () { votes = { a: 0, b: 0 }; $('count-a').textContent = '0'; $('count-b').textContent = '0'; };

  /* ---------- 课堂网址：教师可直接点击修改，保存在本机 ---------- */
  try { var saved = localStorage.getItem('lesson5-intro-url'); if (saved) $('app-url').textContent = saved; } catch (e) {}
  $('app-url').addEventListener('blur', function () { try { localStorage.setItem('lesson5-intro-url', $('app-url').textContent.trim()); } catch (e) {} });

  /* 让翻页按钮点击后不保留焦点，避免空格键再次触发按钮 */
  document.querySelectorAll('#controls button, .video-bar button, .video-play, .mic-buttons button, .mini').forEach(function (b) { b.addEventListener('click', function () { if (b !== sim) b.blur(); }); });

  var start = Number((location.hash || '').slice(1));
  go(start >= 1 && start <= scenes.length ? start - 1 : 0, 0);
  enter(scenes[cur]);
})();
