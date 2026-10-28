// ============================================================
// VX.vfx - 战斗特效层
//
// 设计目标：把「命中 / 挥砍 / 发射 / 受击」四种表现抽成一套可复用的原语，
// 替换掉原来散落在 game-combat.js 与 game-main.js 里三份各写一遍的
// 纯色球 + 纯色环（无加色混合、无重力、无朝向、无光照反馈）。
//
// 三个基础原语：
//   glow   —— 加色混合的软光点（贴图 sprite，始终朝向相机）
//   ring   —— 冲击波环（贴图 sprite，或压扁贴地做地面冲击波）
//   streak —— 放射状冲击线（拉长的软光面片，沿屏幕角度射出）
//
// 所有特效都是普通 Object3D，挂上 userData.life 后 push 进 projectiles 数组，
// 由 game-main.js 的统一循环驱动 userData.update(obj, delta) 做逐帧动画。
// 支持的可选字段：vel / gravity / fade / update / billboard
// ============================================================
var VX = window.VX || {};

VX.vfx = (function () {
  var glowTex = null, ringTex = null;

  // 相机震动状态（模块内维护，game-main 每帧取 offset）
  var shakeAmp = 0, shakeDur = 0.001, shakeTimer = 0;
  var offset = new THREE.Vector3();
  var impactLight = null, lightTimer = 0, lightDur = 0.001, lightPower = 0;

  // ------------------------------------------------------------
  // 贴图：径向渐变光斑 / 环
  // ------------------------------------------------------------
  function makeCanvas(size) {
    var c = document.createElement('canvas');
    c.width = c.height = size;
    return c;
  }

  function toTex(c) {
    var t = new THREE.CanvasTexture(c);
    if (THREE.SRGBColorSpace !== undefined) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  function getGlow() {
    if (glowTex) return glowTex;
    var S = 128, c = makeCanvas(S), g = c.getContext('2d');
    var gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0.00, 'rgba(255,255,255,1)');
    gr.addColorStop(0.20, 'rgba(255,255,255,0.86)');
    gr.addColorStop(0.45, 'rgba(255,255,255,0.36)');
    gr.addColorStop(0.72, 'rgba(255,255,255,0.09)');
    gr.addColorStop(1.00, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, S, S);
    glowTex = toTex(c);
    return glowTex;
  }

  function getRing() {
    if (ringTex) return ringTex;
    var S = 256, c = makeCanvas(S), g = c.getContext('2d');
    var gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0.00, 'rgba(255,255,255,0)');
    gr.addColorStop(0.46, 'rgba(255,255,255,0)');
    gr.addColorStop(0.66, 'rgba(255,255,255,0.42)');
    gr.addColorStop(0.80, 'rgba(255,255,255,0.95)');
    gr.addColorStop(0.90, 'rgba(255,255,255,0.26)');
    gr.addColorStop(1.00, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, S, S);
    ringTex = toTex(c);
    return ringTex;
  }

  // 加色混合材质：toneMapped=false 让亮部不被 ACES 压暗，特效才够"亮"
  function glowMat(color, opacity, tex) {
    return new THREE.MeshBasicMaterial({
      map: tex || getGlow(),
      color: color,
      transparent: true,
      opacity: opacity === undefined ? 1 : opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false
    });
  }

  function flatMat(color, opacity) {
    return new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: opacity === undefined ? 1 : opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false
    });
  }

  function groundY() {
    return (typeof window.groundY === 'number') ? window.groundY : 0;
  }

  // 共享几何体：所有特效都用同一个单位面片/单位立方体 + scale 控制尺寸，
  // 避免每次命中都新建十几个 BufferGeometry（战斗中每秒可能触发多次）
  var unitPlane = null, unitBox = null;
  function plane() {
    if (!unitPlane) unitPlane = new THREE.PlaneGeometry(1, 1);
    return unitPlane;
  }
  function box() {
    if (!unitBox) unitBox = new THREE.BoxGeometry(1, 1, 1);
    return unitBox;
  }

  // 碎屑材质缓存：按颜色复用 MeshBasicMaterial（碎屑不再做透明度淡出，
  // 只做缩放消失，所以材质可以安全共享 —— 连续战斗时每秒少创建几十个材质对象）
  var chipMatCache = {};
  function chipMat(color, highlight) {
    var key = (highlight ? 'h' : 'c') + color;
    if (!chipMatCache[key]) {
      chipMatCache[key] = new THREE.MeshBasicMaterial({
        color: highlight ? 0xfff0c0 : color, toneMapped: false
      });
    }
    return chipMatCache[key];
  }

  function push(obj) {
    if (!window.scene) return null;
    window.scene.add(obj);
    if (window.projectiles) window.projectiles.push(obj);
    return obj;
  }

  // 归一化进度：0 → 1
  function prog(o, total) {
    return 1 - Math.max(0, o.userData.life) / total;
  }

  // ------------------------------------------------------------
  // 单点脉冲光照：常驻一盏灯复用，避免运行时增删灯导致材质重编译卡顿
  // ------------------------------------------------------------
  function ensureLight() {
    if (impactLight || !window.scene) return;
    impactLight = new THREE.PointLight(0xffffff, 0, 6, 2);
    impactLight.position.set(0, -999, 0);
    window.scene.add(impactLight);
  }

  function flashLight(pos, color, power, dur) {
    ensureLight();
    if (!impactLight) return;
    impactLight.position.copy(pos);
    impactLight.color.setHex(color);
    lightPower = power;
    lightDur = dur || 0.18;
    lightTimer = lightDur;
    impactLight.intensity = power;
  }

  // ------------------------------------------------------------
  // 相机震动
  // ------------------------------------------------------------
  function shake(power, dur) {
    shakeAmp = Math.max(shakeAmp, power);
    shakeDur = Math.max(shakeDur, dur || 0.18);
    shakeTimer = shakeDur;
  }

  // ------------------------------------------------------------
  // 月牙形挥砍弧：两端收窄的带状 BufferGeometry
  // ------------------------------------------------------------
  function arcRibbon(rIn, rOut, a0, a1, seg) {
    var pos = [], idx = [];
    for (var i = 0; i <= seg; i++) {
      var t = i / seg;
      var a = a0 + (a1 - a0) * t;
      var taper = Math.sin(Math.PI * t);              // 中点最宽，两端收成尖 → 月牙
      var rI = rIn + (rOut - rIn) * (1 - taper) * 0.62;
      pos.push(Math.cos(a) * rI, Math.sin(a) * rI, 0);
      pos.push(Math.cos(a) * rOut, Math.sin(a) * rOut, 0);
    }
    for (var j = 0; j < seg; j++) {
      var b = j * 2;
      idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    return g;
  }

  // ------------------------------------------------------------
  // 命中爆点：白热核心 + 扩散环 + 地面冲击波 + 放射冲击线 + 碎屑 + 光照
  // ------------------------------------------------------------
  function impact(pos, color, opts) {
    opts = opts || {};
    var S = opts.scale || 1;
    var col = (color === undefined || color === null) ? 0xffd166 : color;

    // 1) 白热核心
    var coreTotal = 0.16;
    var core = new THREE.Mesh(plane(), glowMat(0xffffff, 1));
    core.position.copy(pos);
    core.scale.setScalar(1.5 * S);
    core.userData = {
      life: coreTotal,
      billboard: true,
      update: function (o) {
        var t = prog(o, coreTotal);
        o.scale.setScalar((1.5 + t * 2.0) * S);
        o.material.opacity = Math.max(0, 1 - t * t * 1.25);
      }
    };
    push(core);

    // 2) 朝向相机的彩色扩散环
    var ringTotal = 0.34;
    var ring = new THREE.Mesh(plane(), glowMat(col, 0.95, getRing()));
    ring.position.copy(pos);
    ring.scale.setScalar(1.1 * S);
    ring.userData = {
      life: ringTotal,
      billboard: true,
      update: function (o) {
        var t = prog(o, ringTotal);
        o.scale.setScalar((1.1 + t * 3.2) * S);
        o.material.opacity = Math.max(0, 0.95 * (1 - t) * (1 - t));
      }
    };
    push(ring);

    // 3) 贴地冲击波（压扁的环）
    if (opts.groundRing !== false) {
      var gTotal = 0.42;
      var gRing = new THREE.Mesh(plane(), glowMat(col, 0.5, getRing()));
      gRing.rotation.x = -Math.PI / 2;
      gRing.position.set(pos.x, groundY() + 0.05, pos.z);
      gRing.scale.set(0.7 * S, 0.7 * S, 1);
      gRing.userData = {
        life: gTotal,
        update: function (o) {
          var t = prog(o, gTotal);
          var s = (0.7 + t * 4.0) * S;
          o.scale.set(s, s, 1);
          o.material.opacity = Math.max(0, 0.5 * (1 - t));
        }
      };
      push(gRing);
    }

    // 4) 放射冲击线
    if (opts.streaks !== false) {
      var n = opts.streakCount || 6;
      for (var i = 0; i < n; i++) {
        (function (idx) {
          var ang = (idx / n) * Math.PI * 2 + Math.random() * 0.4;
          var len = (0.8 + Math.random() * 0.55) * S;
          var sTotal = 0.2 + Math.random() * 0.08;
          var st = new THREE.Mesh(plane(),
            glowMat(idx % 3 === 0 ? 0xffffff : col, 0.9));
          st.position.copy(pos);
          if (window.camera) st.lookAt(window.camera.position);
          st.rotateZ(ang);
          st.translateX(len * 0.5);
          st.scale.set(len, 0.12 * S, 1);
          st.userData = {
            life: sTotal,
            update: function (o) {
              var t = prog(o, sTotal);
              o.material.opacity = Math.max(0, 0.9 * (1 - t));
              o.scale.x = len * (1 + t * 0.85);
            }
          };
          push(st);
        })(i);
      }
    }

    // 5) 碎屑（带重力、自旋、落地弹跳）
    if (opts.chips !== false) {
      var chipColor = (opts.chipColor === undefined) ? col : opts.chipColor;
      var cn = opts.chipCount || 8;
      for (var c2 = 0; c2 < cn; c2++) {
        var sz = (0.045 + Math.random() * 0.05) * S;
        var chip = new THREE.Mesh(
          box(),
          chipMat(chipColor, c2 % 3 === 0)
        );
        chip.scale.set(sz, sz * 0.85, sz * 0.7);
        chip.position.copy(pos);
        var a2 = Math.random() * Math.PI * 2;
        var sp = (2.0 + Math.random() * 2.6) * Math.sqrt(S);
        chip.userData = {
          vel: new THREE.Vector3(Math.cos(a2) * sp, (1.8 + Math.random() * 2.4) * Math.sqrt(S), Math.sin(a2) * sp),
          gravity: 9.0,
          life: 0.55 + Math.random() * 0.25,
          // 材质按颜色缓存共享，不能写 fade（fade 会改共享材质的 opacity）——
          // 改成在 update 里做缩放消失，视觉效果等价
          spin: new THREE.Vector3((Math.random() - 0.5) * 15, (Math.random() - 0.5) * 15, (Math.random() - 0.5) * 15),
          update: function (o, dt) {
            var s3 = o.userData.spin;
            o.rotation.x += s3.x * dt;
            o.rotation.y += s3.y * dt;
            o.rotation.z += s3.z * dt;
            o.scale.multiplyScalar(Math.max(0, 1 - dt * 1.6));
            var gy = groundY() + 0.04;
            if (o.position.y < gy) {
              o.position.y = gy;
              o.userData.vel.y *= -0.34;
              o.userData.vel.x *= 0.68;
              o.userData.vel.z *= 0.68;
            }
          }
        };
        push(chip);
      }
    }

    // 6) 短促点光，让爆点照亮周围
    if (opts.light !== false) {
      flashLight(pos, col, 5 * S, 0.2);
    }

    if (opts.shake !== false) shake(0.028 * S, 0.14);
  }

  // ------------------------------------------------------------
  // 挥砍弧：贴着角色胸口高度扫出一道月牙
  // ------------------------------------------------------------
  function slash(origin, dir, color, opts) {
    opts = opts || {};
    var R = opts.radius || 1.4;
    var arc = opts.arc || 2.0;
    var col = (color === undefined || color === null) ? 0xffe08a : color;
    // 弧的平分线对齐 role 朝向：局部 +X 经 rotation.y 旋转后应指向 dir
    var yaw = Math.atan2(dir.x, dir.z) - Math.PI / 2;

    var g = new THREE.Group();
    g.position.copy(origin);
    g.rotation.y = yaw;

    var mat = flatMat(col, 0.9);
    var m = new THREE.Mesh(arcRibbon(R * 0.52, R, -arc / 2, arc / 2, 26), mat);
    m.rotation.x = -Math.PI / 2;
    g.add(m);

    var coreMat = flatMat(0xffffff, 0.7);
    var mc = new THREE.Mesh(arcRibbon(R * 0.74, R * 0.94, -arc * 0.4, arc * 0.4, 22), coreMat);
    mc.rotation.x = -Math.PI / 2;
    g.add(mc);

    var total = opts.life || 0.26;
    g.userData = {
      life: total,
      update: function (o) {
        var t = prog(o, total);
        var sweep = -0.72 + t * 1.44;
        m.rotation.z = sweep;
        mc.rotation.z = sweep;
        var e = 1 - t;
        mat.opacity = 0.9 * e * e;
        coreMat.opacity = 0.7 * e * e;
        var s = 1 + t * 0.2;
        o.scale.set(s, s, s);
      }
    };
    push(g);
    return g;
  }

  // ------------------------------------------------------------
  // 爪击斩线：数道斜向光带，用于怪物攻击
  // ------------------------------------------------------------
  function slashLines(pos, dir, color, opts) {
    opts = opts || {};
    var n = opts.count || 3;
    var len = opts.length || 1.5;
    var spread = opts.spread || 0.3;
    var col = (color === undefined || color === null) ? 0xff4d3d : color;
    // dir 是水平方向，取其垂直方向做横向铺开
    var px = -dir.z, pz = dir.x;

    for (var i = 0; i < n; i++) {
      (function (idx) {
        var off = (idx - (n - 1) / 2) * spread;
        var total = 0.2 + idx * 0.035;
        var q = new THREE.Mesh(plane(),
          glowMat(idx === Math.floor(n / 2) ? 0xffffff : col, 0.95));
        q.position.set(pos.x + px * off, pos.y, pos.z + pz * off);
        if (window.camera) q.lookAt(window.camera.position);
        q.rotateZ(0.72);
        q.scale.set(len, 0.1, 1);
        q.userData = {
          life: total,
          update: function (o) {
            var t = prog(o, total);
            o.material.opacity = Math.max(0, 0.95 * (1 - t));
            o.scale.x = len * (1 - t * 0.22);
          }
        };
        push(q);
      })(i);
    }
  }

  // ------------------------------------------------------------
  // 发射闪光：枪口白闪 + 朝向弹道的光环 + 前冲火星
  // ------------------------------------------------------------
  function muzzle(pos, dir, color) {
    var col = (color === undefined || color === null) ? 0xffd166 : color;

    var fTotal = 0.12;
    var flash = new THREE.Mesh(plane(), glowMat(0xffffff, 1));
    flash.position.copy(pos);
    flash.scale.setScalar(0.5);
    flash.userData = {
      life: fTotal,
      billboard: true,
      update: function (o) {
        var t = prog(o, fTotal);
        o.scale.setScalar(0.5 + t * 0.85);
        o.material.opacity = Math.max(0, 1 - t);
      }
    };
    push(flash);

    var rTotal = 0.24;
    var ring = new THREE.Mesh(plane(), glowMat(col, 0.8, getRing()));
    ring.position.copy(pos);
    ring.lookAt(pos.clone().add(dir));
    ring.scale.setScalar(0.45);
    ring.userData = {
      life: rTotal,
      update: function (o) {
        var t = prog(o, rTotal);
        o.scale.setScalar(0.45 + t * 1.5);
        o.material.opacity = Math.max(0, 0.8 * (1 - t));
      }
    };
    push(ring);

    for (var i = 0; i < 3; i++) {
      (function () {
        var sp = new THREE.Mesh(plane(), glowMat(col, 0.85));
        sp.position.copy(pos);
        var sTotal = 0.18;
        var jitter = new THREE.Vector3(
          (Math.random() - 0.5) * 0.18,
          (Math.random() - 0.5) * 0.18,
          (Math.random() - 0.5) * 0.18
        );
        sp.userData = {
          vel: dir.clone().multiplyScalar(6).add(jitter),
          life: sTotal,
          billboard: true,
          update: function (o) {
            var t = prog(o, sTotal);
            o.scale.setScalar((0.3 + t * 0.5) * (1 - t));
            o.material.opacity = Math.max(0, 0.85 * (1 - t));
          }
        };
        push(sp);
      })();
    }

    flashLight(pos, col, 2.2, 0.1);
  }

  // ------------------------------------------------------------
  // 每帧推进：相机震动 + 点光衰减
  // ------------------------------------------------------------
  function tick(delta) {
    // 震动
    if (shakeTimer > 0) {
      shakeTimer -= delta;
      var k = Math.max(0, shakeTimer / shakeDur);
      var a = shakeAmp * k * k;
      var t = (typeof performance !== 'undefined' ? performance.now() : Date.now()) * 0.001;
      offset.set(
        Math.sin(t * 61.0) * a,
        Math.sin(t * 47.3 + 1.7) * a * 0.7,
        Math.sin(t * 53.7 + 3.1) * a * 0.5
      );
      if (shakeTimer <= 0) {
        shakeAmp = 0;
        offset.set(0, 0, 0);
      }
    } else {
      offset.set(0, 0, 0);
    }

    // 点光衰减
    if (lightTimer > 0 && impactLight) {
      lightTimer -= delta;
      var lt = Math.max(0, lightTimer / lightDur);
      impactLight.intensity = lightPower * lt * lt;
      if (lightTimer <= 0) {
        lightTimer = 0;
        impactLight.intensity = 0;
      }
    }
  }

  return {
    // 预热：把复用的点光源提前建好，避免第一次命中时才加灯
    // （运行时改变灯数量会让所有材质重新编译着色器，会出现明显掉帧）
    ensureLight: ensureLight,
    impact: impact,
    slash: slash,
    slashLines: slashLines,
    muzzle: muzzle,
    shake: shake,
    tick: tick,
    offset: offset,
    arcRibbon: arcRibbon,
    flashLight: flashLight
  };
})();
