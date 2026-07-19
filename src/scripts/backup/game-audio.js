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
  }
};