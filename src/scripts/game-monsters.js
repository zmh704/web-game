// ============================================================
// 怪物造型构建 - 头身分离的卡通生物
// 结构：躯干 + 独立的头 + 四肢 + 类型配件
// 这样五官始终贴在头上，不会被身体吞掉，剪影也更像生物
// ============================================================

function _monsterTint(hex, sDelta, lDelta) {
  var c = new THREE.Color(hex);
  var hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, Math.max(0.06, Math.min(1, hsl.s + sDelta)), Math.max(0.06, Math.min(0.92, hsl.l + lDelta)));
  return c.getHex();
}

function buildMonsterMesh(t) {
  var S = VX.shape, M = VX.materials;
  var g = new THREE.Group();

  var isBoss = (t.scale || 1) >= 2;
  var k = isBoss ? 1.16 : 1.0;          // 只微调比例，整体缩放由调用方负责
  var isFly = !!t.fly;
  var isRanged = !!t.ranged;
  var isCharge = !!t.charge;

  // ---------------- 配色 ----------------
  var bodyHex = _monsterTint(t.color, 0.16, 0.3);
  var bellyHex = _monsterTint(t.color, 0.0, 0.58);
  var darkHex = _monsterTint(t.color, 0.06, 0.02);
  var accentHex = (t.emissive !== undefined) ? t.emissive : 0xffb066;

  var matBody = M.std(bodyHex, { rough: 0.66 });
  var matBelly = M.std(bellyHex, { rough: 0.72 });
  var matDark = M.std(darkHex, { rough: 0.78 });
  var matAccent = M.std(accentHex, { rough: 0.38, emissive: accentHex, emissiveIntensity: 0.5 });
  var matWhite = M.std(0xfdf9f0, { rough: 0.4 });
  var matIris = M.std(accentHex, { rough: 0.22, emissive: accentHex, emissiveIntensity: 0.3 });
  var matPupil = M.std(0x17121f, { rough: 0.28 });
  var matTooth = M.std(0xfff8ea, { rough: 0.3 });

  // ============================================================
  // 尺寸基准（脚底 y=0）
  // ============================================================
  var torsoR = 0.55 * k;         // 躯干横向半径
  var torsoY = 0.76 * k;         // 躯干中心高度（抬高以露出腿）
  var headR = 0.42 * k;          // 头半径
  var headY = torsoY + torsoR * 0.98 + headR * 0.92;

  // ============================================================
  // 腿：四条短粗腿，外扩到躯干之外，保证可见
  // ============================================================
  var legs = [];
  var legR = 0.105 * k;
  var legTopY = torsoY - torsoR * 0.34;
  var legReach = torsoR * 0.94;

  for (var li = 0; li < 4; li++) {
    var ang = (li / 4) * Math.PI * 2 + Math.PI * 0.25;
    var lx = Math.cos(ang) * legReach;
    var lz = Math.sin(ang) * legReach * 0.78;

    var legGroup = new THREE.Group();
    legGroup.position.set(lx, legTopY, lz);

    var leg = new THREE.Mesh(S.capsule(legR, legTopY * 0.72, 8, 4), matDark);
    leg.position.y = -legTopY * 0.34;
    leg.rotation.z = Math.cos(ang) * 0.24;
    leg.rotation.x = -Math.sin(ang) * 0.24;
    leg.castShadow = true;
    legGroup.add(leg);

    var foot = new THREE.Mesh(S.ellipsoid(legR * 1.5, legR * 0.72, legR * 1.7, 10), matDark);
    foot.position.set(Math.cos(ang) * 0.045, -legTopY * 0.78, Math.sin(ang) * 0.045);
    foot.castShadow = true;
    legGroup.add(foot);

    // 爪尖
    for (var ci = 0; ci < 3; ci++) {
      var claw = new THREE.Mesh(S.taper(0.004, 0.03, 0.11, 6), matTooth);
      claw.position.set((ci - 1) * legR * 0.72, -legTopY * 0.82, Math.sin(ang) * 0.1 + legR * 1.15);
      claw.rotation.x = 1.75;
      legGroup.add(claw);
    }

    g.add(legGroup);
    legs.push({ group: legGroup, phase: li * Math.PI / 2, baseY: legTopY });
  }

  // ============================================================
  // 躯干
  // ============================================================
  var torso = new THREE.Group();
  torso.position.y = torsoY;
  g.add(torso);

  var body = new THREE.Mesh(S.ellipsoid(torsoR * 0.94, torsoR * 1.08, torsoR * 0.9, 20), matBody);
  if (isCharge) body.scale.z = 1.15;
  body.castShadow = true;
  body.receiveShadow = true;
  torso.add(body);

  // 腹部浅色
  var belly = new THREE.Mesh(S.ellipsoid(torsoR * 0.66, torsoR * 0.62, torsoR * 0.36, 14), matBelly);
  belly.position.set(0, -torsoR * 0.2, torsoR * 0.66);
  torso.add(belly);

  // 胸背甲片（Boss）
  if (isBoss) {
    var plate = new THREE.Mesh(S.ellipsoid(torsoR * 0.9, torsoR * 0.62, torsoR * 0.42, 14), matDark);
    plate.position.set(0, torsoR * 0.42, torsoR * 0.42);
    plate.rotation.x = -0.3;
    torso.add(plate);
  }

  // ============================================================
  // 手臂
  // ============================================================
  var arms = [];
  var armCount = (isFly || isCharge) ? 0 : 2;
  for (var ai = 0; ai < armCount; ai++) {
    var side = ai === 0 ? -1 : 1;
    var armGroup = new THREE.Group();
    armGroup.position.set(side * torsoR * 0.86, torsoR * 0.16, torsoR * 0.24);

    var upper = new THREE.Mesh(S.capsule(0.072 * k, 0.16 * k, 8, 4), matBody);
    upper.position.y = -0.11 * k;
    upper.rotation.z = side * 0.42;
    upper.castShadow = true;
    armGroup.add(upper);

    var hand = new THREE.Mesh(new THREE.SphereGeometry(0.095 * k, 10, 10), matDark);
    hand.position.set(side * 0.11 * k, -0.235 * k, 0.02);
    armGroup.add(hand);

    if (isBoss) {
      for (var cj = 0; cj < 3; cj++) {
        var ac = new THREE.Mesh(S.taper(0.004, 0.028, 0.13, 6), matTooth);
        ac.position.set(side * (0.08 + cj * 0.04), -0.3 * k, 0.06);
        ac.rotation.x = 0.85;
        armGroup.add(ac);
      }
    }

    torso.add(armGroup);
    arms.push({ group: armGroup, side: side, base: side * 0.42 });
  }

  // ============================================================
  // 头
  // ============================================================
  var head = new THREE.Group();
  head.position.set(0, headY, torsoR * 0.1);
  g.add(head);

  // 脖子
  var neck = new THREE.Mesh(new THREE.CylinderGeometry(headR * 0.44, headR * 0.62, headR * 0.62, 12), matBody);
  neck.position.set(0, -headR * 0.82, -0.02);
  head.add(neck);

  var skull = new THREE.Mesh(S.ellipsoid(headR, headR * 0.94, headR * 0.92, 18), matBody);
  skull.castShadow = true;
  head.add(skull);

  // ---- 眼睛（贴在头前表面）----
  var eyeR = headR * 0.34;
  var eyeX = headR * 0.42;
  var eyeY = headR * 0.1;
  var eyeZ = headR * 0.86;
  var eyeGroups = [];

  var eyeCount = Math.min(t.eyes || 2, 2);
  for (var ei = 0; ei < eyeCount; ei++) {
    var ex = eyeCount === 1 ? 0 : (ei === 0 ? -eyeX : eyeX);
    var eye = new THREE.Group();
    eye.position.set(ex, eyeY, eyeZ);

    var white = new THREE.Mesh(S.ellipsoid(eyeR, eyeR * 1.16, eyeR * 0.62, 14), matWhite);
    eye.add(white);

    var iris = new THREE.Mesh(new THREE.SphereGeometry(eyeR * 0.72, 14, 14), matIris);
    iris.position.z = eyeR * 0.38;
    eye.add(iris);

    var pupil = new THREE.Mesh(new THREE.SphereGeometry(eyeR * 0.38, 12, 12), matPupil);
    pupil.position.z = eyeR * 0.58;
    eye.add(pupil);

    var shine = new THREE.Mesh(new THREE.SphereGeometry(eyeR * 0.2, 8, 8), matWhite);
    shine.position.set(-eyeR * 0.2, eyeR * 0.28, eyeR * 0.6);
    eye.add(shine);

    var shine2 = new THREE.Mesh(new THREE.SphereGeometry(eyeR * 0.1, 6, 6), matWhite);
    shine2.position.set(eyeR * 0.22, -eyeR * 0.16, eyeR * 0.58);
    eye.add(shine2);

    // 细眉骨：只压住眼睛上缘一点点，保留凶相但不挡眼
    var brow = new THREE.Mesh(S.roundedBox(eyeR * 1.5, eyeR * 0.16, eyeR * 0.2, eyeR * 0.06, 2), matDark);
    brow.position.set(0, eyeR * 0.92, eyeR * 0.3);
    brow.rotation.z = ei === 0 ? -0.22 : 0.22;
    eye.add(brow);

    head.add(eye);
    eyeGroups.push(eye);
  }

  // 额外小眼（保留多眼怪特征）
  var extra = Math.min(Math.max((t.eyes || 0) - 2, 0), 3);
  for (var xi = 0; xi < extra; xi++) {
    var sx = (xi - (extra - 1) / 2) * headR * 0.42;
    var se = new THREE.Mesh(S.ellipsoid(headR * 0.13, headR * 0.15, headR * 0.08, 8), matIris);
    se.position.set(sx, headR * 0.52, headR * 0.62);
    head.add(se);
    var sp = new THREE.Mesh(new THREE.SphereGeometry(headR * 0.06, 6, 6), matPupil);
    sp.position.set(sx, headR * 0.52, headR * 0.68);
    head.add(sp);
  }

  // ---- 嘴 ----
  var mouthY = -headR * 0.42;
  var mouthZ = headR * 0.88;

  if (isFly) {
    // 鸟喙
    var beak = new THREE.Mesh(S.taper(0.02, headR * 0.3, headR * 0.62, 4), matAccent);
    beak.position.set(0, mouthY + headR * 0.1, mouthZ + headR * 0.18);
    beak.rotation.set(Math.PI / 2, Math.PI / 4, 0);
    head.add(beak);
  } else {
    var mouth = new THREE.Mesh(
      S.ellipsoid(headR * 0.42, headR * 0.2, headR * 0.13, 12),
      M.std(0x2a1520, { rough: 0.5 })
    );
    mouth.position.set(0, mouthY, mouthZ - headR * 0.04);
    head.add(mouth);

    // 两颗圆润小牙
    if (t.fangs) {
      [-1, 1].forEach(function (mx) {
        var tooth = new THREE.Mesh(S.taper(0.004, 0.045, 0.13, 6), matTooth);
        tooth.position.set(mx * headR * 0.22, mouthY + headR * 0.1, mouthZ + headR * 0.02);
        tooth.rotation.x = Math.PI + 0.18;
        head.add(tooth);
      });
    }
  }

  // ---- 头部配件 ----
  if (isRanged) {
    // 兜帽
    var hood = new THREE.Mesh(
      new THREE.SphereGeometry(headR * 1.16, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.62),
      matDark
    );
    hood.position.y = headR * 0.06;
    hood.scale.set(1, 1.12, 1);
    head.add(hood);
    var hoodTip = new THREE.Mesh(S.taper(0.02, headR * 0.34, headR * 0.5, 10), matDark);
    hoodTip.position.set(0, headR * 0.92, -headR * 0.1);
    hoodTip.rotation.x = -0.35;
    head.add(hoodTip);
    // 兜帽下的阴影
    var shade = new THREE.Mesh(S.ellipsoid(headR * 0.75, headR * 0.42, headR * 0.12, 12), M.std(0x120d18, { rough: 0.9 }));
    shade.position.set(0, headR * 0.12, headR * 0.62);
    head.add(shade);
  } else if (t.spikes) {
    var hornCount = isBoss ? 3 : 2;
    for (var hi = 0; hi < hornCount; hi++) {
      var ha = hornCount === 1 ? 0 : (hi - (hornCount - 1) / 2) * 0.62;
      var horn = new THREE.Mesh(S.taper(0.006, headR * 0.19, headR * 0.78, 8), matAccent);
      horn.position.set(Math.sin(ha) * headR * 0.42, headR * 0.82, Math.cos(ha) * headR * 0.12 - headR * 0.1);
      horn.rotation.z = ha * 0.7;
      horn.rotation.x = -0.28;
      head.add(horn);
    }
  } else {
    // 圆耳朵
    [-1, 1].forEach(function (side) {
      var ear = new THREE.Mesh(S.ellipsoid(headR * 0.2, headR * 0.3, headR * 0.14, 10), matBody);
      ear.position.set(side * headR * 0.62, headR * 0.62, -headR * 0.1);
      ear.rotation.z = side * 0.42;
      head.add(ear);
      var inner = new THREE.Mesh(S.ellipsoid(headR * 0.11, headR * 0.18, headR * 0.07, 8), matBelly);
      inner.position.set(side * headR * 0.66, headR * 0.62, -headR * 0.02);
      inner.rotation.z = side * 0.42;
      head.add(inner);
    });
  }

  // Boss 王冠角
  if (isBoss) {
    var crown = new THREE.Mesh(new THREE.CylinderGeometry(headR * 0.34, headR * 0.42, headR * 0.26, 8), M.metal(0xffc94a));
    crown.position.y = headR * 0.95;
    head.add(crown);
    for (var pi = 0; pi < 3; pi++) {
      var pj = new THREE.Mesh(S.taper(0.004, 0.05, headR * 0.42, 6), M.metal(0xffc94a));
      pj.position.set((pi - 1) * headR * 0.26, headR * 1.22, 0);
      pj.rotation.z = (pi - 1) * -0.2;
      head.add(pj);
    }
  }

  // ============================================================
  // 背部配件
  // ============================================================
  var wingRefs = [];
  if (isFly) {
    [-1, 1].forEach(function (side) {
      var wingG = new THREE.Group();
      wingG.position.set(side * torsoR * 0.6, torsoR * 0.42, -torsoR * 0.42);

      var wingMat = M.std(_monsterTint(t.color, 0.06, 0.4), {
        rough: 0.55, transparent: true, opacity: 0.9, side: THREE.DoubleSide
      });
      var wing = new THREE.Mesh(new THREE.CircleGeometry(torsoR * 1.05, 14, 0, Math.PI * 0.86), wingMat);
      wing.rotation.set(0, side * Math.PI / 2, Math.PI * 0.1);
      wing.scale.set(1, 1.2, 1);
      wingG.add(wing);

      var bone = new THREE.Mesh(S.capsule(0.026, torsoR * 0.8, 6, 4), matDark);
      bone.position.set(0, torsoR * 0.4, 0);
      bone.rotation.z = side * 1.1;
      wingG.add(bone);

      g.add(wingG);
      wingRefs.push(wingG);
    });
  }

  if (isRanged) {
    var cannon = new THREE.Mesh(S.taper(headR * 0.24, headR * 0.34, headR * 0.9, 12), matDark);
    cannon.position.set(0, torsoR * 1.25, -torsoR * 0.55);
    cannon.rotation.x = 0.5;
    cannon.castShadow = true;
    torso.add(cannon);
    var muzzle = new THREE.Mesh(new THREE.SphereGeometry(headR * 0.26, 12, 12), matAccent);
    muzzle.position.set(0, torsoR * 1.4, -torsoR * 0.82);
    torso.add(muzzle);
    var muzzleGlow = new THREE.Mesh(new THREE.SphereGeometry(headR * 0.5, 10, 10), M.glow(accentHex, 0.22, true));
    muzzleGlow.position.copy(muzzle.position);
    torso.add(muzzleGlow);
  }

  // ============================================================
  // 尾巴
  // ============================================================
  var tailG = new THREE.Group();
  tailG.position.set(0, torsoR * 0.05, -torsoR * 0.86);
  torso.add(tailG);

  for (var ti = 0; ti < 4; ti++) {
    var seg = new THREE.Mesh(
      new THREE.SphereGeometry(0.125 * k - ti * 0.021 * k, 8, 8),
      ti >= 3 ? matAccent : matBody
    );
    seg.position.set(0, -ti * ti * 0.018, -ti * 0.185 * k);
    seg.castShadow = true;
    tailG.add(seg);
  }
  var tailTip = new THREE.Mesh(new THREE.SphereGeometry(0.105 * k, 10, 10), matAccent);
  tailTip.position.set(0, -0.03, -0.76 * k);
  tailG.add(tailTip);
  var tailGlow = new THREE.Mesh(new THREE.SphereGeometry(0.2 * k, 10, 10), M.glow(accentHex, 0.18, true));
  tailGlow.position.copy(tailTip.position);
  tailG.add(tailGlow);

  // ============================================================
  // 落地阴影
  // ============================================================
  var shadowDisc = new THREE.Mesh(
    new THREE.CircleGeometry(torsoR * 0.92, 24),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.16, depthWrite: false })
  );
  shadowDisc.rotation.x = -Math.PI / 2;
  shadowDisc.position.y = 0.015;
  g.add(shadowDisc);

  // ============================================================
  // 程序化待机动画
  // ============================================================

  g.onBeforeRender = function () {
    if (typeof clock === 'undefined' || !clock) return;
    var tm = clock.elapsedTime;

    // 呼吸
    var br = Math.sin(tm * 2.0 + torsoR * 4);
    torso.scale.set(1 + br * 0.022, 1 - br * 0.018, 1 + br * 0.022);
    torso.position.y = torsoY + br * 0.012;
    head.position.y = headY + br * 0.02 + (isFly ? Math.sin(tm * 2.4) * 0.12 + 0.12 : 0);
    head.rotation.z = Math.sin(tm * 0.9) * 0.035;
    head.rotation.y = Math.sin(tm * 0.55) * 0.1;

    // 眨眼
    for (var i = 0; i < eyeGroups.length; i++) {
      var eye = eyeGroups[i];
      var cyc = (tm * 0.36 + i * 0.42) % 1;
      eye.scale.y = cyc > 0.95 ? 0.12 : 1;
    }

    // 腿起伏
    for (var l = 0; l < legs.length; l++) {
      legs[l].group.position.y = legs[l].baseY + Math.sin(tm * 2.0 + legs[l].phase) * 0.018;
    }

    // 手臂摆动
    for (var a = 0; a < arms.length; a++) {
      arms[a].group.rotation.x = Math.sin(tm * 1.5 + a * 1.4) * 0.14;
      arms[a].group.rotation.z = arms[a].base + Math.sin(tm * 1.2 + a) * 0.06;
    }

    // 尾巴
    tailG.rotation.y = Math.sin(tm * 1.8) * 0.28;
    tailG.rotation.x = Math.sin(tm * 1.3) * 0.08;

    // 翅膀
    for (var w = 0; w < wingRefs.length; w++) {
      wingRefs[w].rotation.z = (w === 0 ? 1 : -1) * Math.sin(tm * 8.5) * 0.5;
    }

    // 飞行体的地面阴影
    if (isFly) {
      var hAbove = head.position.y - headY;
      var sc = Math.max(0.55, 1 - hAbove * 0.5);
      shadowDisc.scale.set(sc, sc, sc);
    }
  };

  // ---- 性能：只有 Boss 投影 ----
  // 小怪单个模型就有 40+ 个 mesh，场上同时有 11 只。
  // 全部投影意味着阴影 pass 每帧多渲染 400+ 个 mesh，
  // 而小怪的影子落在草地上几乎看不出来 —— 代价远大于收益。
  // 这里统一覆盖前面逐处设置的 castShadow。
  g.traverse(function (o) {
    if (o.isMesh) o.castShadow = isBoss;
  });

  return g;
}


function currentChapterData() { return CHAPTERS[GS.chapter - 1] || CHAPTERS[0]; }

// ============================================================
// 时间增强：怪物随游戏时长缓慢变强（替代旧的击杀数增强）
// ============================================================
function timeScale() {
  var cfg = (typeof BALANCE !== 'undefined' && BALANCE.timeScale) ? BALANCE.timeScale : {};
  var minutes = (clock && clock.elapsedTime || 0) / 60;
  return Math.min(1 + minutes * (cfg.perMinute === undefined ? 0.08 : cfg.perMinute), cfg.max || 1.35);
}

// 按时间系数 + 难度系数放大怪物类型数值（返回克隆，不修改原始数据）
// 这是「难度」真正影响战斗的地方：简单难度怪物血更少，困难难度更肉
function scaleMonsterType(t) {
  var s = timeScale();
  var cfg = (typeof BALANCE !== 'undefined' && BALANCE.timeScale) ? BALANCE.timeScale : {};
  var diff = (typeof balanceDiff === 'function') ? balanceDiff(GS.difficulty) : { hp: 1 };
  var scaled = {};
  for (var k in t) scaled[k] = t[k];
  scaled.hp = Math.ceil((t.hp || 100) * s * (diff.hp || 1));
  scaled.dmg = Math.ceil((t.dmg || 10) * s);
  // 速度增幅上限单独压住：怪物一旦比玩家快，就没有"跑开"这个选项了
  scaled.speed = (t.speed || 2) * Math.min(s, cfg.maxSpeedRatio || 1.15);
  return scaled;
}

// ============================================================
// 能量碎片掉落物（击杀小怪掉落，拾取2个合成1点能量）
// ============================================================
var fragmentDrops = [];

function spawnFragmentDrop(pos) {
  var g = new THREE.Group();
  var core = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.25),
    new THREE.MeshStandardMaterial({ color: 0xffd700, emissive: 0xffd700, emissiveIntensity: 0.9, transparent: true, opacity: 0.95 })
  );
  g.add(core);
  // 内层发光
  var innerGlow = new THREE.Mesh(
    new THREE.SphereGeometry(0.35, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xffd700, transparent: true, opacity: 0.25, side: THREE.DoubleSide })
  );
  g.add(innerGlow);
  // 外层大光晕
  var outerGlow = new THREE.Mesh(
    new THREE.SphereGeometry(0.55, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.1, side: THREE.DoubleSide })
  );
  g.add(outerGlow);
  g.position.set(pos.x, 0.8, pos.z);
  g.userData = { floatPhase: Math.random() * Math.PI * 2 };
  scene.add(g);
  fragmentDrops.push(g);
}

// 碎片漂浮动画与拾取检测（在update循环中调用）
function updateFragments(delta) {
  for (var i = fragmentDrops.length - 1; i >= 0; i--) {
    var f = fragmentDrops[i];
    f.position.y = 0.8 + Math.sin(clock.elapsedTime * 2.5 + f.userData.floatPhase) * 0.15;
    f.rotation.y += delta * 2;
    if (player && player.position.distanceTo(f.position) < 1.5) {
      scene.remove(f);
      fragmentDrops.splice(i, 1);
      AudioMgr.playQuiz();
      gainFragment();
    }
  }
}

// 怪物死亡处理逻辑
function onMonsterDefeated(m) {
  // 伪装者走自己的结算（不进 monsters 数组里的星星/碎片/10秒刷新那一套）
  if (m && m.userData && m.userData.isImpostor) {
    if (typeof defeatImpostor === 'function') defeatImpostor(m);
    return;
  }
  m.userData.active = false;
  var isBoss = m.userData.isBoss;

  // 击败获得星星奖励
  GS.stars += isBoss ? 100 : 50;
  GS.killCount = (GS.killCount || 0) + 1;

  if (isBoss) {
    // Boss击杀：直接获得1点能量，掉落2个碎片，10秒后刷新
    showMessage('🏆 击败了 ' + m.userData.type.name + '! 获得能量+2碎片!', 0xffd700);
    gainEnergy(1);
    // Boss掉落2个碎片
    spawnFragmentDrop(m.position.clone());
    spawnFragmentDrop(m.position.clone());
    // Boss 不单独计时补刷：它跟着「金色宝箱」一起出现（见 spawnEnergyOrb →
    // spawnBossInRoom），金箱回收 30 秒后重新刷出时 Boss 才会回来。
    // 原来这里设了 respawnTimer = 10，但 updateMonster 的 Boss 分支从来没有
    // 消费过这个计时器 —— 等于一行永远不生效的死代码，容易误导后来改的人。
    m.userData.deathTime = clock.elapsedTime;
  } else {
    // 小怪：死亡位置掉落能量碎片，延迟 8~12 秒在远处补刷
    showMessage('🎉 怪物被击败! 掉落了能量碎片!', 0x44ff88);
    spawnFragmentDrop(m.position.clone());
    var _spCfg = (typeof BALANCE !== 'undefined' && BALANCE.spawn) ? BALANCE.spawn : {};
    var _rMin = _spCfg.minionRespawnMin || 8;
    var _rMax = _spCfg.minionRespawnMax || 12;
    m.userData.respawnTimer = _rMin + Math.random() * Math.max(0, _rMax - _rMin);
    m.userData.deathTime = clock.elapsedTime;
  }
  updateHUD();

  // 死亡动效：螺旋升天
  var escapeInterval = setInterval(function () {
    if (!m.parent) return clearInterval(escapeInterval);
    m.position.y += 0.3;
    m.position.x += Math.sin(clock.elapsedTime * 5) * 0.2;
    m.rotation.x += 0.1;
    m.rotation.z += 0.08;
    if (m.position.y > 8) {
      clearInterval(escapeInterval);
      scene.remove(m);
      // 刷新计时已在上面设置，这里不再重复设置
    }
  }, 50);
}
