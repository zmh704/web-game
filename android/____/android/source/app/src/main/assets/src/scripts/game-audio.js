// ============================================================
// 音频系统 - 程序化音效生成
// ============================================================
var AudioMgr = {
  ctx: null,
  bgmNode: null,
  enabled: true,
  init: function () {
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.createBGM();
    } catch (e) {
      console.warn('音频初始化失败', e);
      this.enabled = false;
    }
  },
  // 背景音乐：恐怖低频音墙 + 不谐和音
  createBGM: function () {
    if (!this.enabled || !this.ctx) return;
    var ctx = this.ctx;
    var o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
    var filt = ctx.createBiquadFilter(), g = ctx.createGain();
    o1.type = 'sawtooth'; o1.frequency.value = 52;
    o2.type = 'sawtooth'; o2.frequency.value = 55.4;
    filt.type = 'lowpass'; filt.frequency.value = 180;
    g.gain.value = 0.045;
    var lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.type = 'sine'; lfo.frequency.value = 0.11;
    lg.gain.value = 0.02;
    lfo.connect(lg); lg.connect(g.gain);
    o1.connect(filt); o2.connect(filt); filt.connect(g); g.connect(ctx.destination);
    o1.start(); o2.start(); lfo.start();
    this.bgmNode = g;
    var creepy = function () {
      if (!AudioMgr.enabled) return;
      var freqs = [233.08, 246.94, 311.13, 466.16];
      var osc = ctx.createOscillator(), cg = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freqs[Math.floor(Math.random() * freqs.length)];
      osc.detune.value = (Math.random() - 0.5) * 40;
      cg.gain.setValueAtTime(0.0001, ctx.currentTime);
      cg.gain.exponentialRampToValueAtTime(0.05, ctx.currentTime + 1.2);
      cg.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 3.5);
      osc.connect(cg); cg.connect(ctx.destination);
      osc.start(); osc.stop(ctx.currentTime + 3.6);
      setTimeout(creepy, 6000 + Math.random() * 9000);
    };
    setTimeout(creepy, 4000);
    var growlLoop = function () {
      if (!AudioMgr.enabled) return;
      AudioMgr.playGrowl(0.5);
      setTimeout(growlLoop, 9000 + Math.random() * 15000);
    };
    setTimeout(growlLoop, 7000);
    
    // 增加更多恐怖音效：尖叫声、低语声、脚步声
    var screamLoop = function () {
      if (!AudioMgr.enabled) return;
      AudioMgr.playScream(0.3);
      setTimeout(screamLoop, 12000 + Math.random() * 20000);
    };
    setTimeout(screamLoop, 10000);
    
    var whisperLoop = function () {
      if (!AudioMgr.enabled) return;
      AudioMgr.playWhisper(0.2);
      setTimeout(whisperLoop, 15000 + Math.random() * 25000);
    };
    setTimeout(whisperLoop, 18000);
    
    var scratchLoop = function () {
      if (!AudioMgr.enabled) return;
      AudioMgr.playScratch(0.25);
      setTimeout(scratchLoop, 20000 + Math.random() * 30000);
    };
    setTimeout(scratchLoop, 25000);
  },
  playGrowl: function (vol) {
    if (!this.enabled || !this.ctx) return;
    var ctx = this.ctx;
    var v = vol || 1;
    var o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(85 + Math.random() * 30, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(32, ctx.currentTime + 1.1);
    var vib = ctx.createOscillator(), vg = ctx.createGain();
    vib.type = 'sine'; vib.frequency.value = 9 + Math.random() * 5;
    vg.gain.value = 13;
    vib.connect(vg); vg.connect(o.frequency);
    f.type = 'lowpass'; f.frequency.value = 280;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.2 * v, ctx.currentTime + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.25);
    o.connect(f); f.connect(g); g.connect(ctx.destination);
    o.start(); vib.start();
    o.stop(ctx.currentTime + 1.3); vib.stop(ctx.currentTime + 1.3);
  },
  playQuiz: function () {
    if (!this.enabled || !this.ctx) return;
    var ctx = this.ctx;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = 523.25;
    osc.frequency.exponentialRampToValueAtTime(783.99, ctx.currentTime + 0.15);
    gain.gain.value = 0.15;
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
  },
  playAttack: function () {
    if (!this.enabled || !this.ctx) return;
    var ctx = this.ctx;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = 150;
    osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.1);
    gain.gain.value = 0.12;
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  },
  playHit: function () {
    if (!this.enabled || !this.ctx) return;
    var ctx = this.ctx;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 800;
    osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.08);
    gain.gain.value = 0.18;
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  },
  playSkill: function () {
    if (!this.enabled || !this.ctx) return;
    var ctx = this.ctx;
    for (var i = 0; i < 3; i++) {
      (function (delay) {
        setTimeout(function () {
          var osc = ctx.createOscillator();
          var gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = 400 + delay * 150;
          gain.gain.value = 0.1;
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + 0.25);
        }, delay);
      })(i * 50);
    }
  },
  playHurt: function () {
    if (!this.enabled || !this.ctx) return;
    var ctx = this.ctx;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = 180;
    osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.15);
    gain.gain.value = 0.2;
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
  },
  // 恐怖尖叫声
  playScream: function (vol) {
    if (!this.enabled || !this.ctx) return;
    var ctx = this.ctx;
    var v = vol || 1;
    var o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(800 + Math.random() * 400, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.3);
    o.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.8);
    var vib = ctx.createOscillator(), vg = ctx.createGain();
    vib.type = 'sine'; vib.frequency.value = 15 + Math.random() * 8;
    vg.gain.value = 30;
    vib.connect(vg); vg.connect(o.frequency);
    f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 3;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.15 * v, ctx.currentTime + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.0);
    o.connect(f); f.connect(g); g.connect(ctx.destination);
    o.start(); vib.start();
    o.stop(ctx.currentTime + 1.0); vib.stop(ctx.currentTime + 1.0);
  },
  // 恐怖低语声
  playWhisper: function (vol) {
    if (!this.enabled || !this.ctx) return;
    var ctx = this.ctx;
    var v = vol || 1;
    // 白噪声模拟低语
    var bufferSize = ctx.sampleRate * 0.8;
    var buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.sin(i * 0.02) * (1 - i / bufferSize);
    }
    var source = ctx.createBufferSource();
    source.buffer = buffer;
    var f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 400 + Math.random() * 600; f.Q.value = 2;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.08 * v, ctx.currentTime + 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.8);
    source.connect(f); f.connect(g); g.connect(ctx.destination);
    source.start();
  },
  // 抓挠/刮擦声
  playScratch: function (vol) {
    if (!this.enabled || !this.ctx) return;
    var ctx = this.ctx;
    var v = vol || 1;
    var o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = 'square';
    o.frequency.setValueAtTime(200 + Math.random() * 100, ctx.currentTime);
    o.frequency.linearRampToValueAtTime(80 + Math.random() * 50, ctx.currentTime + 0.6);
    f.type = 'highpass'; f.frequency.value = 1000;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.1 * v, ctx.currentTime + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.7);
    o.connect(f); f.connect(g); g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.7);
  }
};