// Only measures relative microphone amplitude. LessonRules decides the lamp state.
export class Microphone {
  constructor({ onSample = () => {}, onStatus = () => {}, pauseWhenHidden = true } = {}) {
    this.onSample = onSample;
    this.onStatus = onStatus;
    this.backgroundSampling = !pauseWhenHidden;
    this.session = 0;
    this.frame = 0;
    this.noiseFloor = 0;
    this.lastSample = 0;
    this.visibilityHandler = () => {
      if (pauseWhenHidden && document.hidden && this.context) {
        this.stop();
        this.onStatus({ state: 'stopped', message: '页面已切到后台，麦克风已暂停。回来后可重新开启。' });
      }
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  async start() {
    if (this.context || this.starting) return;
    const session = ++this.session;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      this.onStatus({ state: 'error', message: '请选择页面提供的声音来源后继续实验。' });
      return;
    }
    this.starting = true;
    try {
      this.onStatus({ state: 'calibrating', message: '请允许使用麦克风。开启后先安静片刻，测量教室背景声音。' });
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false });
      if (session !== this.session) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      this.stream = stream;
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) throw new Error('unsupported_audio');
      this.context = new AudioContext();
      await this.context.resume();
      if (session !== this.session) return;
      this.source = this.context.createMediaStreamSource(stream);
      if (this.backgroundSampling) {
        if (!this.context.audioWorklet || !window.AudioWorkletNode) throw new Error('unsupported_background_audio');
        await this.context.audioWorklet.addModule('/microphone-level-worklet.js?v=1');
        if (session !== this.session) return;
        this.processor = new window.AudioWorkletNode(this.context, 'lesson-microphone-level');
        this.processor.port.onmessage = event => {
          if (session === this.session && Number.isFinite(event.data?.raw)) this.processRawSample(event.data.raw, performance.now());
        };
        this.processor.onprocessorerror = () => {this.stop();this.onStatus({state:'error',message:'声音分析已停止，请重新开启麦克风。'});};
        this.source.connect(this.processor);
        // The worklet writes zeros only: this keeps background analysis running without replaying sound.
        this.processor.connect(this.context.destination);
        this.calibrate();
      } else {
        this.analyser = this.context.createAnalyser();
        this.analyser.fftSize = 1024;
        this.samples = new Float32Array(this.analyser.fftSize);
        this.source.connect(this.analyser);
        this.calibrate();
        this.read(session);
      }
    } catch (error) {
      if (session !== this.session) return;
      this.release();
      const messages = {
        NotAllowedError: '麦克风权限未开启。可在浏览器地址旁允许麦克风后重试，或使用模拟声音。',
        NotFoundError: '这台电脑没有可用麦克风。请使用教师机实测，或选择模拟声音。',
        NotReadableError: '麦克风暂时无法使用，可能被其他程序占用。关闭占用程序后重试，或选择模拟声音。',
        SecurityError: '浏览器限制了麦克风访问。请检查本机入口或 HTTPS 设置。'
      };
      this.onStatus({ state: 'error', message: (error.message==='unsupported_background_audio'?'当前浏览器不支持后台采声。请用本机教师网址保持前台测试，或换用支持后台音频的浏览器。':messages[error.name] || '麦克风未能开启。请检查设备和浏览器权限，或选择模拟声音。') });
    } finally {
      if (session === this.session) this.starting = false;
    }
  }

  calibrate() {
    if (!this.context) return;
    this.calibration = [];
    this.calibrationEnd = performance.now() + 1500;
    this.smoothedLevel = 0;
    this.onStatus({ state: 'calibrating', message: '正在测量背景声音（约 1.5 秒），请暂时保持安静。' });
  }

  read(session) {
    if (session !== this.session || !this.analyser) return;
    const now = performance.now();
    if (now - this.lastSample >= 32) {
      this.lastSample = now;
      this.analyser.getFloatTimeDomainData(this.samples);
      let mean = 0;
      for (const value of this.samples) mean += value;
      mean /= this.samples.length;
      let sum = 0;
      for (const value of this.samples) sum += (value - mean) ** 2;
      this.processRawSample(Math.sqrt(sum / this.samples.length), now);
    }
    this.frame = requestAnimationFrame(() => this.read(session));
  }

  processRawSample(raw, now) {
    let level = 0;
    if (this.calibration) {
      this.calibration.push(raw);
      if (now >= this.calibrationEnd) {
        this.calibration.sort((a, b) => a - b);
        this.noiseFloor = this.calibration[Math.floor(this.calibration.length * 0.7)] || 0;
        this.calibration = null;
        this.onStatus({ state: 'listening', message: '正在采集真实声音。请正常说话或轻拍手，观察响度和灯的变化。此数值是相对响度，不是分贝。' });
      }
    } else {
      const aboveNoise = Math.max(0, raw - this.noiseFloor * 1.3 - 0.001);
      const target = Math.min(1, aboveNoise / Math.max(0.018, this.noiseFloor * 4));
      this.smoothedLevel += (target - this.smoothedLevel) * (target > this.smoothedLevel ? 0.7 : 0.32);
      level = Math.max(0, Math.min(1, this.smoothedLevel));
    }
    this.onSample({ level, raw, source: 'microphone' });
  }

  release() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.source?.disconnect();
    this.analyser?.disconnect();
    if (this.processor) {this.processor.port.onmessage=null;this.processor.port.close();this.processor.disconnect();this.processor.onprocessorerror=null;}
    this.stream?.getTracks().forEach(track => track.stop());
    if (this.context && this.context.state !== 'closed') this.context.close().catch(() => {});
    this.context = null;
    this.stream = null;
    this.source = null;
    this.analyser = null;
    this.processor = null;
    this.calibration = null;
  }

  stop() {
    this.session++;
    this.starting = false;
    this.release();
    this.onSample({ level: 0, raw: 0, source: 'microphone' });
    this.onStatus({ state: 'stopped', message: '麦克风已关闭，声音采集已停止。' });
  }

  destroy() {
    this.stop();
    document.removeEventListener('visibilitychange', this.visibilityHandler);
  }
}
