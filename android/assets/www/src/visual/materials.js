// ============================================================
// VX.materials - 程序化贴图 + 统一材质工厂
// 不依赖任何外部图片资源，全部用 Canvas 现场绘制
// ============================================================
var VX = window.VX || {};

VX.texCache = {};

VX.materials = {
  // ---------- Canvas 基础 ----------
  _canvas: function (size) {
    var c = document.createElement('canvas');
    c.width = c.height = size || 256;
    return c;
  },

  // repeatX / repeatY：贴图在 UV 上的重复次数。缺省 repeatY = repeatX
  _finish: function (canvas, repeatX, repeatY) {
    var t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    var rx = repeatX || 1;
    var ry = (repeatY === undefined) ? rx : repeatY;
    t.repeat.set(rx, ry);
    t.anisotropy = 8;
    if (THREE.SRGBColorSpace !== undefined) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  },

  // 9 宫格重复绘制：贴图必须四边可无缝拼接，否则平铺后会出现规则网格接缝
  _repeat9: function (size, fn) {
    for (var ox = -1; ox <= 1; ox++) {
      for (var oy = -1; oy <= 1; oy++) fn(ox * size, oy * size);
    }
  },

  _blot: function (g, x, y, r, col, alpha) {
    var grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, col + Math.floor(alpha * 255).toString(16).padStart(2, '0'));
    grad.addColorStop(1, col + '00');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  },

  // 在画布上撒柔和色斑
  _spots: function (g, size, count, colors, alpha, rMin, rMax, seamless) {
    for (var i = 0; i < count; i++) {
      var x = Math.random() * size;
      var y = Math.random() * size;
      var r = rMin + Math.random() * (rMax - rMin);
      var col = colors[Math.floor(Math.random() * colors.length)];
      if (seamless) {
        this._repeat9(size, function (dx, dy) { this._blot(g, x + dx, y + dy, r, col, alpha); }.bind(this));
      } else {
        this._blot(g, x, y, r, col, alpha);
      }
    }
  },

  _speckle: function (g, size, count, colors, maxR, seamless) {
    for (var i = 0; i < count; i++) {
      var col = colors[Math.floor(Math.random() * colors.length)];
      var x = Math.random() * size;
      var y = Math.random() * size;
      var r = 0.4 + Math.random() * (maxR || 1.4);
      var paint = function (px, py, rr, cc) {
        g.fillStyle = cc;
        g.beginPath();
        g.arc(px, py, rr, 0, Math.PI * 2);
        g.fill();
      };
      if (seamless) {
        this._repeat9(size, function (dx, dy) { paint(x + dx, y + dy, r, col); });
      } else {
        paint(x, y, r, col);
      }
    }
  },

  // ---------- 地面贴图 ----------
  // tiles：贴图在 UV 上的平铺次数，由「世界尺寸 / 目标贴图边长」换算而来，
  //        否则大尺寸地面会把 256px 贴图拉伸成一片糊掉的纯色
  ground: function (theme, tiles) {
    var n = Math.max(1, Math.round(tiles || 15));
    var key = 'ground_' + theme.decor + '_' + n;
    if (VX.texCache[key]) return VX.texCache[key];
    var S = 256, c = this._canvas(S), g = c.getContext('2d');
    var base = theme.ground, spot = theme.groundSpot, dark = theme.groundDark;

    g.fillStyle = base;
    g.fillRect(0, 0, S, S);
    var self = this;

    // 大面积明暗起伏：让地面有"土丘/阴影"的层次，而不是一整片纯色。
    // 对比度刻意压低 —— 地面贴图在掠射角下会被透视压扁成大色斑，
    // 色斑对比一高，平铺周期就会变成明显的横向带状条纹。
    this._spots(g, S, 26, [spot, dark], 0.30, 22, 74, true);
    this._spots(g, S, 12, ['#ffffff', base], 0.06, 30, 90, true);

    // 画一条可选无缝复制的线段
    function stroke9(points, style, width) {
      self._repeat9(S, function (dx, dy) {
        g.strokeStyle = style;
        g.lineWidth = width;
        g.beginPath();
        g.moveTo(points[0] + dx, points[1] + dy);
        for (var q = 2; q < points.length; q += 2) g.lineTo(points[q] + dx, points[q + 1] + dy);
        g.stroke();
      });
    }

    if (theme.decor === 'forest') {
      this._speckle(g, S, 340, [dark, '#6aa351', '#5d9550'], 1.0, true);
      // 草叶短笔画
      for (var i = 0; i < 220; i++) {
        var x = Math.random() * S, y = Math.random() * S;
        var style = Math.random() > 0.5 ? 'rgba(120,170,90,0.55)' : 'rgba(80,130,70,0.55)';
        stroke9([x, y, x + 1.5, y - 4, x + (Math.random() - 0.5) * 5, y - 7], style, 1);
      }
    } else if (theme.decor === 'ice') {
      this._speckle(g, S, 260, ['#ffffff', '#c8dfea', '#eaf6ff'], 1.3, true);
      for (var k = 0; k < 14; k++) {
        var sx = Math.random() * S, sy = Math.random() * S;
        stroke9(
          [sx, sy,
            sx + (Math.random() - 0.5) * 60, sy + (Math.random() - 0.5) * 60,
            sx + (Math.random() - 0.5) * 90, sy + (Math.random() - 0.5) * 90],
          'rgba(255,255,255,0.5)', 0.6 + Math.random());
      }
    } else if (theme.decor === 'desert') {
      this._speckle(g, S, 320, [dark, '#e5cb9c', '#c9a468'], 1.0, true);
      // 风纹：频率取 2π*k/S，保证跨贴图边界时相位连续
      for (var w = 0; w < 18; w++) {
        g.strokeStyle = 'rgba(180,150,100,0.35)';
        g.lineWidth = 1.5;
        g.beginPath();
        var wy = (w / 18) * S;
        g.moveTo(0, wy);
        for (var wx = 0; wx <= S; wx += 16) {
          g.lineTo(wx, wy + Math.sin(wx * (Math.PI * 2 * 3 / S) + w) * 5);
        }
        g.stroke();
      }
    } else if (theme.decor === 'volcano') {
      this._speckle(g, S, 800, ['#4a2f2a', '#7d4f45', '#2f1e1c'], 1.6, true);
      for (var v = 0; v < 10; v++) {
        var vx = Math.random() * S, vy = Math.random() * S;
        stroke9([vx, vy, vx + (Math.random() - 0.5) * 50, vy + (Math.random() - 0.5) * 50],
          'rgba(255,110,50,0.6)', 1 + Math.random() * 1.5);
      }
    } else {
      // space
      this._speckle(g, S, 260, ['#ffffff', '#c9b8ff', '#8f7fe8'], 1.2, true);
      g.strokeStyle = 'rgba(140,120,220,0.25)';
      g.lineWidth = 1;
      for (var s = 0; s <= S; s += 32) {
        g.beginPath(); g.moveTo(s, 0); g.lineTo(s, S); g.stroke();
        g.beginPath(); g.moveTo(0, s); g.lineTo(S, s); g.stroke();
      }
    }

    var tex = this._finish(c, n);
    VX.texCache[key] = tex;
    return tex;
  },

  // ---------- 墙体贴图 ----------
  // tiles / tilesY：横向、纵向平铺次数（墙段长度各不相同，必须按实际尺寸换算）
  wall: function (theme, tiles, tilesY) {
    var n = Math.max(0.4, tiles || 3);
    var ny = Math.max(0.4, tilesY === undefined ? n : tilesY);
    var rk = n.toFixed(2) + 'x' + ny.toFixed(2);
    var key = 'wall_' + theme.decor + '_' + rk;
    if (VX.texCache[key]) return VX.texCache[key];
    var S = 256, c = this._canvas(S), g = c.getContext('2d');
    var baseHex = '#' + theme.wall.toString(16).padStart(6, '0');
    var darkHex = '#' + theme.wallDark.toString(16).padStart(6, '0');

    g.fillStyle = baseHex;
    g.fillRect(0, 0, S, S);
    this._spots(g, S, 20, [darkHex, baseHex], 0.28, 24, 84, true);

    if (theme.decor === 'forest') {
      // 竖向木纹/树篱：纯粹的竖线，避免斜向拉丝（会被长墙面放大成斜条纹）
      for (var i = 0; i < 46; i++) {
        var x = (i / 46) * S + (Math.random() - 0.5) * 2;
        g.strokeStyle = 'rgba(28,56,32,' + (0.10 + Math.random() * 0.14) + ')';
        g.lineWidth = 1 + Math.random() * 2;
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, S);
        g.stroke();
      }
      this._speckle(g, S, 400, ['#3f6b45', '#6f9c68', '#2f5238'], 1.5, true);
    } else if (theme.decor === 'ice') {
      for (var b = 0; b < 5; b++) {
        g.strokeStyle = 'rgba(255,255,255,0.35)';
        g.lineWidth = 1.2;
        g.beginPath();
        g.moveTo(0, (b / 5) * S);
        g.lineTo(S, (b / 5) * S + 6);
        g.stroke();
      }
      this._speckle(g, S, 300, ['#ffffff', '#cfe8f7'], 1.4, true);
    } else if (theme.decor === 'desert') {
      // 砖块
      for (var row = 0; row < 6; row++) {
        var y = (row / 6) * S;
        g.strokeStyle = 'rgba(120,90,50,0.35)';
        g.lineWidth = 1.4;
        g.beginPath(); g.moveTo(0, y); g.lineTo(S, y); g.stroke();
        for (var col = 0; col < 4; col++) {
          var x2 = (col / 4) * S + (row % 2 ? S / 8 : 0);
          g.beginPath(); g.moveTo(x2, y); g.lineTo(x2, y + S / 6); g.stroke();
        }
      }
    } else if (theme.decor === 'volcano') {
      this._speckle(g, S, 500, ['#2f1e1c', '#5a3a34', '#8a4a38'], 1.8, true);
      g.strokeStyle = 'rgba(255,120,50,0.45)';
      for (var v2 = 0; v2 < 8; v2++) {
        g.lineWidth = 1.5;
        g.beginPath();
        var sx2 = Math.random() * S, sy2 = Math.random() * S;
        g.moveTo(sx2, sy2);
        g.lineTo(sx2 + (Math.random() - 0.5) * 70, sy2 + Math.random() * 50);
        g.stroke();
      }
    } else {
      this._speckle(g, S, 220, ['#ffffff', '#b28dff'], 1.2, true);
      g.strokeStyle = 'rgba(178,141,255,0.35)';
      g.lineWidth = 1.5;
      for (var p = 0; p <= S; p += 64) {
        g.beginPath(); g.moveTo(p, 0); g.lineTo(p, S); g.stroke();
        g.beginPath(); g.moveTo(0, p); g.lineTo(S, p); g.stroke();
      }
    }

    var tex = this._finish(c, n, ny);
    VX.texCache[key] = tex;
    return tex;
  },

  // ---------- 木纹 ----------
  wood: function () {
    if (VX.texCache.wood) return VX.texCache.wood;
    var S = 128, c = this._canvas(S), g = c.getContext('2d');
    g.fillStyle = '#b98a5a';
    g.fillRect(0, 0, S, S);
    for (var i = 0; i < 26; i++) {
      g.strokeStyle = 'rgba(110,72,40,' + (0.08 + Math.random() * 0.16) + ')';
      g.lineWidth = 0.6 + Math.random() * 1.6;
      g.beginPath();
      var y = (i / 26) * S;
      g.moveTo(0, y);
      for (var x = 0; x <= S; x += 8) {
        g.lineTo(x, y + Math.sin(x * 0.09 + i) * 2.2);
      }
      g.stroke();
    }
    this._spots(g, S, 8, ['#8a5f38'], 0.2, 6, 20);
    var tex = this._finish(c, 1);
    VX.texCache.wood = tex;
    return tex;
  },

  // ---------- 材质工厂 ----------
  std: function (color, opts) {
    opts = opts || {};
    var m = new THREE.MeshStandardMaterial({
      color: color,
      roughness: opts.rough === undefined ? 0.72 : opts.rough,
      metalness: opts.metal === undefined ? 0.02 : opts.metal,
      map: opts.map || null,
      transparent: !!opts.transparent,
      opacity: opts.opacity === undefined ? 1 : opts.opacity,
      side: opts.side || THREE.FrontSide,
      flatShading: !!opts.flat
    });
    if (opts.emissive !== undefined) {
      m.emissive = new THREE.Color(opts.emissive);
      m.emissiveIntensity = opts.emissiveIntensity === undefined ? 0.3 : opts.emissiveIntensity;
    }
    return m;
  },

  // 皮肤：低粗糙、轻微次表面感
  skin: function (color) {
    return this.std(color, { rough: 0.55, metal: 0 });
  },

  // 布料
  cloth: function (color) {
    return this.std(color, { rough: 0.88, metal: 0 });
  },

  // 金属
  metal: function (color) {
    return this.std(color, { rough: 0.34, metal: 0.35 });
  },

  // 环境贴图：等距柱状渐变，供 PBR 材质产生反射
  // 注意：它会作为 IBL 参与漫反射照明，亮度过高会把所有颜色洗白，
  //      所以整体压暗一档，只留金属/光滑面需要的反射层次
  envMap: function (skyHex, groundHex) {
    var c = document.createElement('canvas');
    c.width = 256; c.height = 128;
    var g = c.getContext('2d');
    var grad = g.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, '#eef4fa');
    grad.addColorStop(0.42, '#' + new THREE.Color(skyHex).getHexString());
    grad.addColorStop(0.5, '#e6eef6');
    grad.addColorStop(0.56, '#' + new THREE.Color(groundHex).getHexString());
    grad.addColorStop(1, '#2b3529');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 128);
    // 压暗：IBL 漫反射贡献降到原来的 ~45%
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.fillRect(0, 0, 256, 128);
    var t = new THREE.CanvasTexture(c);
    t.mapping = THREE.EquirectangularReflectionMapping;
    if (THREE.SRGBColorSpace !== undefined) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  },

  // 发光体（自发光但不受光）
  glow: function (color, opacity, additive) {
    var m = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: opacity === undefined ? 0.5 : opacity,
      side: THREE.DoubleSide
    });
    if (additive) m.blending = THREE.AdditiveBlending;
    m.depthWrite = false;
    return m;
  },

  // 半透明能量体
  energy: function (color, opacity) {
    return this.std(color, {
      rough: 0.15, metal: 0.1, transparent: true, opacity: opacity || 0.55,
      emissive: color, emissiveIntensity: 0.6
    });
  }
};

window.VX = VX;
