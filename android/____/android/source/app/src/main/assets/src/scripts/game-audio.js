// ============================================================
// 音频系统 - 真实音频文件 + 程序化音效备选
// ============================================================
var AudioMgr = {
  ctx: null,
  bgmNode: null,
  enabled: true,
  audioCache: {},
  audioBufferCache: {}, // 存储通过 AudioContext 解码的 AudioBuffer
  audioBasePath: 'src/assets/audio/',
  useRealAudio: true,

  // 音频文件映射
  audioFiles: {
    bgm: 'background_music.mp3',
    growl: 'growl.mp3',
    scream: 'scream.mp3',
    attack: 'attack.mp3',
    hit: 'hit.mp3',
    hurt: 'hurt.mp3',
    skill: 'skill.mp3',
    quiz: 'quiz.mp3',
    whisper: 'whisper.mp3',
    scratch: 'scratch.mp3'
  },

  init: function () {
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.loadAllAudio();

      // 添加用户交互监听器，解决浏览器自动播放限制
      var self = this;
      var startAudioOnInteraction = function () {
        if (self.ctx.state === 'suspended') {
          self.ctx.resume();
        }
        // 如果背景音乐还没播放，无论音频文件是否加载完成都尝试播放
        // （若真实音频未加载完成，会自动回退到程序化音效）
        if (!self.bgmNode) {
          self.createBGM();
        }
        // 移除监听器
        document.removeEventListener('click', startAudioOnInteraction);
        document.removeEventListener('keydown', startAudioOnInteraction);
        document.removeEventListener('touchstart', startAudioOnInteraction);
      };

      document.addEventListener('click', startAudioOnInteraction);
      document.addEventListener('keydown', startAudioOnInteraction);
      document.addEventListener('touchstart', startAudioOnInteraction);
    } catch (e) {
      console.warn('音频初始化失败', e);
      this.enabled = false;
    }
  },

  // 加载所有音频文件
  loadAllAudio: function () {
    var self = this;

    // 检查是否在本地文件系统运行
    var isLocalFile = window.location.protocol === 'file:';
    if (isLocalFile) {
      console.warn('检测到本地文件系统，音频文件需要通过HTTP服务器访问');
      console.warn('请使用以下命令启动服务器:');
      console.warn('  python -m http.server 8000');
      console.warn('  or');
      console.warn('  npx serve .');
    }

    Object.keys(this.audioFiles).forEach(function (key) {
      var filename = self.audioFiles[key];
      var audio = new Audio();

      // 尝试两种路径
      var pathsToTry = [
        self.audioBasePath + filename,
        './' + filename  // 备用路径
      ];

      var attempts = 0;
      var tryLoad = function () {
        if (attempts >= pathsToTry.length) {
          console.warn('音频加载失败，将使用程序化音效:', filename);
          return;
        }

        audio.src = pathsToTry[attempts];
        audio.preload = 'auto';
        audio.volume = 0.5;
        attempts++;
      };

      tryLoad();

      audio.addEventListener('canplaythrough', function () {
        self.audioCache[key] = audio;
        console.log('✓ 音频加载成功:', filename, '(' + (pathsToTry[attempts - 1]) + ')');

        // 对 BGM 额外处理：优先用 HTMLAudioElement 播放（兼容所有环境，包括 Android WebView）
        // 再尝试 fetch + AudioContext 解码增强
        if (key === 'bgm' && self.ctx) {
          var bgmUrl = audio.currentSrc || audio.src;

          // 方式1：直接通过 HTMLAudioElement cloneNode 播放（可靠，与怪物音效机制一致）
          var isRealBgmPlaying = self.bgmNode && (self.bgmNode instanceof HTMLAudioElement || self.bgmNode.buffer);
          if (!isRealBgmPlaying) {
            // 停止当前 BGM（可能是程序化音效）
            if (self.bgmNode) {
              try { if (self.bgmNode.stop) self.bgmNode.stop(); } catch (e) { }
              try { if (self.bgmNode.disconnect) self.bgmNode.disconnect(); } catch (e) { }
              try { if (self.bgmNode.noteOff) self.bgmNode.noteOff(0); } catch (e) { }
            }
            try {
              var bgmClone = audio.cloneNode();
              bgmClone.volume = 0.3;
              bgmClone.loop = true;
              bgmClone.play().catch(function (e) {
                console.warn('BGM HTMLAudio 播放失败:', e.message);
              });
              self.bgmNode = bgmClone;
              console.log('✓ BGM 通过 HTMLAudioElement 播放成功（加载完成后）');
            } catch (e) {
              console.warn('BGM HTMLAudio 创建失败:', e.message);
            }
          }

          // 方式2：额外通过 fetch + AudioContext 解码（用于绕过 HTMLAudioElement 自动播放限制）
          fetch(bgmUrl).then(function (res) {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.arrayBuffer();
          }).then(function (data) {
            return self.ctx.decodeAudioData(data);
          }).then(function (buffer) {
            self.audioBufferCache.bgm = buffer;
            console.log('✓ BGM 已解码为 AudioBuffer, 时长:', buffer.duration.toFixed(1) + 's');
            // 解码完成后，如果还没用真实音频播放，自动切换到真实音频
            self._startDecodedBGM();
          }).catch(function (err) {
            console.warn('BGM 解码跳过（HTMLAudioElement 已播放）:', err.message);
          });
        }
      }, { once: true });

      audio.addEventListener('error', function () {
        if (attempts < pathsToTry.length) {
          tryLoad();
        } else {
          console.warn('✗ 音频加载失败，将使用程序化音效:', filename);
        }
      });

      // 3秒超时
      setTimeout(function () {
        if (!self.audioCache[key]) {
          console.warn('⏱ 音频加载超时，将使用程序化音效:', filename);
        }
      }, 3000);
    });
  },

  // 播放真实音频文件
  playRealAudio: function (key, vol) {
    if (!this.enabled) return false;
    var audio = this.audioCache[key];
    if (!audio) return false;

    try {
      var clone = audio.cloneNode();
      clone.volume = vol !== undefined ? vol : 0.5;
      clone.play().catch(function () {
        return false;
      });
      return true;
    } catch (e) {
      return false;
    }
  },

  // 背景音乐 - 优先使用 HTMLAudioElement 循环播放（兼容所有环境）
  createBGM: function () {
    if (!this.enabled || !this.ctx) return;

    var self = this;

    // 优先使用 HTMLAudioElement 直接循环播放 BGM（与音效播放方式一致，兼容 file:// 和 http://）
    if (this.useRealAudio && this.audioCache.bgm) {
      console.log('BGM 使用 HTMLAudioElement 循环播放');
      try {
        var bgmClone = this.audioCache.bgm.cloneNode();
        bgmClone.volume = 0.3;
        bgmClone.loop = true;
        bgmClone.play().catch(function (e) {
          console.warn('HTMLAudioElement BGM 播放失败，回退到程序化音效:', e.message);
          self.createProceduralBGM();
        });
        this.bgmNode = bgmClone;
        console.log('✓ BGM 通过 HTMLAudioElement 循环播放');
      } catch (e) {
        console.warn('HTMLAudioElement BGM 创建失败，回退到程序化音效:', e.message);
        this.createProceduralBGM();
      }
    }
    // 尝试用 AudioContext 解码播放（fetch 方式用于 HTTP 环境）
    else if (this.useRealAudio && this.audioBufferCache.bgm) {
      this._startDecodedBGM();
    }
    // 无真实音频，直接使用程序化音效
    else {
      console.log('无可用 BGM 文件，使用程序化音效（等待文件加载完成后自动切换）');
      this.createProceduralBGM();
    }

    // 环境音效循环
    this.startAmbientLoops();
  },

  // 使用已解码的 AudioBuffer 播放 BGM
  _startDecodedBGM: function () {
    try {
      if (!this.enabled || !this.ctx || !this.audioBufferCache.bgm) return;
      // 停止当前 BGM（可能是程序化音效或 HTMLAudioElement）
      if (this.bgmNode) {
        // 如果是 HTMLAudioElement，调用 pause()
        if (this.bgmNode instanceof HTMLAudioElement) {
          try { this.bgmNode.pause(); this.bgmNode = null; } catch (e) { }
        } else {
          try { if (this.bgmNode.stop) this.bgmNode.stop(); } catch (e) { }
          try { if (this.bgmNode.disconnect) this.bgmNode.disconnect(); } catch (e) { }
          try { if (this.bgmNode.noteOff) this.bgmNode.noteOff(0); } catch (e) { }
        }
      }
      var buffer = this.audioBufferCache.bgm;
      var source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      var gainNode = this.ctx.createGain();
      gainNode.gain.value = 0.3;
      source.connect(gainNode);
      gainNode.connect(this.ctx.destination);
      source.start(0);
      this.bgmNode = source;
      console.log('✓ BGM 通过 AudioContext 播放成功（解码方式）');
    } catch (e) {
      console.warn('BGM 解码播放失败:', e.message);
    }
  },

  // 程序化背景音乐（备选）
  createProceduralBGM: function () {
    if (!this.enabled || !this.ctx) return;
    var ctx = this.ctx;
    var o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
    var filt = ctx.createBiquadFilter(), g = ctx.createGain();
    o1.type = 'sawtooth'; o1.frequency.value = 52;
    o2.type = 'sawtooth'; o2.frequency.value = 55.4;
    filt.type = 'lowpass'; filt.frequency.value = 180;
    g.gain.value = 0.12;
    var lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.type = 'sine'; lfo.frequency.value = 0.11;
    lg.gain.value = 0.02;
    lfo.connect(lg); lg.connect(g.gain);
    o1.connect(filt); o2.connect(filt); filt.connect(g); g.connect(ctx.destination);
    o1.start(); o2.start(); lfo.start();
    this.bgmNode = g;
  },

  // 环境音效循环
  startAmbientLoops: function () {
    var self = this;

    // 怪物吼叫声
    var growlLoop = function () {
      if (!AudioMgr.enabled) return;
      if (self.useRealAudio && self.audioCache.growl) {
        self.playRealAudio('growl', 0.3);
      } else {
        self.playGrowl(0.5);
      }
      setTimeout(growlLoop, 9000 + Math.random() * 15000);
    };
    setTimeout(growlLoop, 7000);

    // 尖叫声
    var screamLoop = function () {
      if (!AudioMgr.enabled) return;
      if (self.useRealAudio && self.audioCache.scream) {
        self.playRealAudio('scream', 0.3);
      } else {
        self.playScream(0.3);
      }
      setTimeout(screamLoop, 12000 + Math.random() * 20000);
    };
    setTimeout(screamLoop, 10000);
  },

  // ============================================================
  // 音效播放方法（优先真实音频，备选程序化）
  // ============================================================
  playGrowl: function (vol) {
    if (this.useRealAudio && this.playRealAudio('growl', vol)) return;
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
    if (this.useRealAudio && this.playRealAudio('quiz', 0.4)) return;
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
    if (this.useRealAudio && this.playRealAudio('attack', 0.4)) return;
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
    if (this.useRealAudio && this.playRealAudio('hit', 0.4)) return;
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
    if (this.useRealAudio && this.playRealAudio('skill', 0.4)) return;
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
    if (this.useRealAudio && this.playRealAudio('hurt', 0.4)) return;
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
    if (this.useRealAudio && this.playRealAudio('scream', vol)) return;
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
    if (this.useRealAudio && this.playRealAudio('whisper', vol)) return;
    if (!this.enabled || !this.ctx) return;
    var ctx = this.ctx;
    var v = vol || 1;
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
    if (this.useRealAudio && this.playRealAudio('scratch', vol)) return;
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
  },

  // ============================================================
  // 配音系统（Web Speech API）
  // ============================================================
  voiceQueue: [],
  voiceEnabled: true,
  lastVoiceTime: 0,
  VOICE_COOLDOWN: 2.5,

  speak: function (text, rate, pitch) {
    if (!this.voiceEnabled || !window.speechSynthesis) return;
    var now = Date.now();
    if (now - this.lastVoiceTime < this.VOICE_COOLDOWN) {
      this.voiceQueue.push({ text: text, rate: rate, pitch: pitch });
      return;
    }
    this._doSpeak(text, rate, pitch);
    this.lastVoiceTime = now;
  },

  _doSpeak: function (text, rate, pitch) {
    if (!this.voiceEnabled || !window.speechSynthesis) return;
    var utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.rate = (rate !== undefined) ? rate : 1.1;
    utterance.pitch = (pitch !== undefined) ? pitch : 1.2;
    utterance.volume = 0.9;
    var self = this;
    utterance.onend = function () {
      self.lastVoiceTime = Date.now();
      if (self.voiceQueue.length > 0) {
        var next = self.voiceQueue.shift();
        setTimeout(function () { self._doSpeak(next.text, next.rate, next.pitch); }, 300);
      }
    };
    window.speechSynthesis.speak(utterance);
  },

  stopVoice: function () {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
      this.voiceQueue = [];
    }
  },

  // 角色配音快捷方法
  playCharacterVoice: function (action) {
    var isQike = (typeof GS !== 'undefined') ? GS.character === 'qike' : true;
    var voiceConfig = {
      attack: { qike: '看我的', miaomiao: '呀！', rate: 1.2, pitch: isQike ? 1.0 : 1.4 },
      skill: { qike: '疾风冲刺', miaomiao: '能量护盾', rate: 1.1, pitch: isQike ? 1.1 : 1.3 },
      hurt: { qike: '哎哟', miaomiao: '啊', rate: 1.3, pitch: isQike ? 0.9 : 1.5 },
      victory: { qike: '我们赢了', miaomiao: '太棒了', rate: 1.0, pitch: isQike ? 1.0 : 1.3 },
      defeat: { qike: '失败了...', miaomiao: '没关系，再来', rate: 0.9, pitch: isQike ? 0.8 : 1.2 },
      quiz: { qike: '这个问题难不倒我', miaomiao: '让我想想', rate: 1.1, pitch: isQike ? 1.0 : 1.3 },
      escape: { qike: '快上飞船！', miaomiao: '得救了', rate: 1.2, pitch: isQike ? 1.1 : 1.3 }
    };
    var cfg = voiceConfig[action];
    if (cfg) {
      var text = isQike ? cfg.qike : cfg.miaomiao;
      this.speak(text, cfg.rate, cfg.pitch);
    }
  }
};