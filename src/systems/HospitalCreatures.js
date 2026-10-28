// ============================================================
// HospitalCreatures - 废弃医院的三种专属怪物
// ------------------------------------------------------------
// 医院原来复用的是通用"团块怪"造型（球体躯干 + 四条短腿 + 大牙），
// 放在走廊里完全出戏 —— 玩家要的是「主刀医生 / 疯魔病人 / 邪恶幽灵」。
//
// 这里给三种怪物各写一套人形模型，按 1.75 米人体比例搭：
//   · 髋 0.98 / 肩 1.45 / 头心 1.66 / 头顶 1.86
//   · 肩宽 ±0.20、肘 1.12、腕 0.86
//
// 两个造型上的关键决定：
//   1. **衣服不能做成封闭的桶**。用 LatheGeometry 的 phiStart/phiLength
//      开一道口子（白大褂开前襟、病号服开前胸），里面露出绿色刷手服 / 肋骨。
//      否则整个人就是一根白柱子，头、手臂、身体细节全被吞掉。
//   2. 头、脖子、手臂都落在衣服半径之外，保证轮廓读得出来。
//
// 所有模型：
//   · 脚底在 y = 0，面朝 +z（和 m.rotation.y = atan2(dir.x, dir.z) 一致）
//   · 通过 __creatureTick(delta, m) 做走路/待机动画
//     （怪物系统会整个替换 userData，所以动画函数挂在对象本体上）
//   · 不自己乘 t.scale：调用方会 g.scale.setScalar(t.scale)
// ============================================================

// ============================================================
// 程序化贴图
// ============================================================
var hcTex = {
  /** 脏白大褂：米白布面 + 洗不掉的黄渍 + 喷溅状血迹 */
  gown: function () {
    if (VX.texCache.hc_gown) return VX.texCache.hc_gown;
    var M = VX.materials, S = 256, c = M._canvas(S), g = c.getContext('2d');
    g.fillStyle = '#c9cec2';
    g.fillRect(0, 0, S, S);
    M._spots(g, S, 22, ['#b3b8a8', '#dbe0d2', '#a2a696'], 0.34, 22, 76, true);
    // 陈旧黄渍
    for (var i = 0; i < 30; i++) {
      g.fillStyle = 'rgba(150,132,86,' + (0.12 + Math.random() * 0.2) + ')';
      g.beginPath();
      g.ellipse(Math.random() * S, Math.random() * S, 4 + Math.random() * 20, 3 + Math.random() * 14, Math.random() * 3, 0, Math.PI * 2);
      g.fill();
    }
    // 血：主片 + 喷溅（刻意做大，远看也要能看见）
    for (var b = 0; b < 5; b++) {
      var bx = Math.random() * S, by = S * 0.3 + Math.random() * S * 0.65;
      var grad = g.createRadialGradient(bx, by, 2, bx, by, 34 + Math.random() * 26);
      grad.addColorStop(0, 'rgba(104,18,16,0.9)');
      grad.addColorStop(0.55, 'rgba(88,16,14,0.5)');
      grad.addColorStop(1, 'rgba(80,16,14,0)');
      g.fillStyle = grad;
      g.beginPath(); g.arc(bx, by, 60, 0, Math.PI * 2); g.fill();
    }
    for (var k = 0; k < 90; k++) {
      g.fillStyle = 'rgba(' + (70 + Math.random() * 40) + ',12,10,' + (0.35 + Math.random() * 0.5) + ')';
      g.beginPath();
      g.arc(Math.random() * S, Math.random() * S, 0.8 + Math.random() * 3.8, 0, Math.PI * 2);
      g.fill();
    }
    // 布纹
    g.strokeStyle = 'rgba(170,176,164,0.3)';
    g.lineWidth = 1;
    for (var v = 0; v < S; v += 5) {
      g.beginPath(); g.moveTo(0, v); g.lineTo(S, v); g.stroke();
    }
    var t = M._finish(c, 1);
    VX.texCache.hc_gown = t;
    return t;
  },

  /** 病号服：淡蓝底 + 细格纹 + 撕裂处的破口 */
  patientGown: function () {
    if (VX.texCache.hc_pgown) return VX.texCache.hc_pgown;
    var M = VX.materials, S = 256, c = M._canvas(S), g = c.getContext('2d');
    g.fillStyle = '#b3c8d2';
    g.fillRect(0, 0, S, S);
    M._spots(g, S, 20, ['#9db5c0', '#c6d9e0'], 0.3, 24, 70, true);
    g.strokeStyle = 'rgba(130,158,172,0.45)';
    g.lineWidth = 1;
    for (var i = 0; i < S; i += 16) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i, S); g.stroke();
      g.beginPath(); g.moveTo(0, i); g.lineTo(S, i); g.stroke();
    }
    for (var k = 0; k < 20; k++) {
      g.fillStyle = 'rgba(88,96,80,' + (0.12 + Math.random() * 0.2) + ')';
      g.beginPath();
      g.ellipse(Math.random() * S, Math.random() * S, 6 + Math.random() * 22, 4 + Math.random() * 14, Math.random() * 3, 0, Math.PI * 2);
      g.fill();
    }
    for (var b = 0; b < 4; b++) {
      var bx = Math.random() * S, by = Math.random() * S;
      var grad = g.createRadialGradient(bx, by, 2, bx, by, 36);
      grad.addColorStop(0, 'rgba(92,16,14,0.85)');
      grad.addColorStop(1, 'rgba(70,14,12,0)');
      g.fillStyle = grad;
      g.beginPath(); g.arc(bx, by, 40, 0, Math.PI * 2); g.fill();
    }
    var t = M._finish(c, 1);
    VX.texCache.hc_pgown = t;
    return t;
  },

  /** 尸斑皮肤：灰白 + 紫青淤斑 + 细血管 */
  skin: function () {
    if (VX.texCache.hc_skin) return VX.texCache.hc_skin;
    var M = VX.materials, S = 256, c = M._canvas(S), g = c.getContext('2d');
    g.fillStyle = '#b9ae9c';
    g.fillRect(0, 0, S, S);
    M._spots(g, S, 24, ['#a89d8c', '#c8bfae', '#9d9184'], 0.34, 20, 70, true);
    for (var i = 0; i < 16; i++) {
      g.fillStyle = 'rgba(96,74,108,' + (0.12 + Math.random() * 0.2) + ')';
      g.beginPath();
      g.ellipse(Math.random() * S, Math.random() * S, 8 + Math.random() * 22, 6 + Math.random() * 16, Math.random() * 3, 0, Math.PI * 2);
      g.fill();
    }
    for (var v = 0; v < 16; v++) {
      var x = Math.random() * S, y = Math.random() * S;
      g.strokeStyle = 'rgba(78,62,86,0.32)';
      g.lineWidth = 0.6 + Math.random();
      g.beginPath();
      g.moveTo(x, y);
      for (var s = 0; s < 3; s++) {
        x += (Math.random() - 0.5) * 40;
        y += (Math.random() - 0.5) * 40;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    var t = M._finish(c, 1);
    VX.texCache.hc_skin = t;
    return t;
  },

  /** 绷带：发黄的纱布 + 横向缠绕纹 + 渗血 */
  bandage: function () {
    if (VX.texCache.hc_bandage) return VX.texCache.hc_bandage;
    var M = VX.materials, S = 128, c = M._canvas(S), g = c.getContext('2d');
    g.fillStyle = '#d8d2bc';
    g.fillRect(0, 0, S, S);
    M._spots(g, S, 18, ['#c6bfa8', '#e6e0cc', '#b3ad96'], 0.3, 12, 40, true);
    g.strokeStyle = 'rgba(150,140,112,0.5)';
    g.lineWidth = 2;
    for (var y = 6; y < S; y += 14) {
      g.beginPath();
      g.moveTo(0, y);
      for (var x = 0; x <= S; x += 8) g.lineTo(x, y + Math.sin(x * 0.2) * 1.6);
      g.stroke();
    }
    for (var b = 0; b < 3; b++) {
      g.fillStyle = 'rgba(92,20,16,0.55)';
      g.beginPath();
      g.ellipse(Math.random() * S, Math.random() * S, 6 + Math.random() * 10, 4 + Math.random() * 8, 0, 0, Math.PI * 2);
      g.fill();
    }
    var t = M._finish(c, 1);
    VX.texCache.hc_bandage = t;
    return t;
  }
};

/** 橡胶围裙：深灰橡胶 + 大范围干涸血渍 + 磨白的褶痕 */
hcTex.apron = function () {
  if (VX.texCache.hc_apron) return VX.texCache.hc_apron;
  var M = VX.materials, S = 256, c = M._canvas(S), g = c.getContext('2d');
  g.fillStyle = '#7b8478';
  g.fillRect(0, 0, S, S);
  M._spots(g, S, 24, ['#6c746a', '#8b9488', '#5f675e'], 0.36, 20, 70, true);
  // 橡胶的褶痕
  for (var i = 0; i < 22; i++) {
    var x = Math.random() * S;
    g.strokeStyle = 'rgba(32,36,32,' + (0.12 + Math.random() * 0.18) + ')';
    g.lineWidth = 1 + Math.random() * 3;
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x + (Math.random() - 0.5) * 26, S);
    g.stroke();
  }
  // 血：从上往下淌的痕迹
  for (var b = 0; b < 6; b++) {
    var bx = 40 + Math.random() * (S - 80);
    var top = Math.random() * S * 0.3;
    var len = 60 + Math.random() * 160;
    var grad = g.createLinearGradient(0, top, 0, top + len);
    grad.addColorStop(0, 'rgba(96,16,14,0.9)');
    grad.addColorStop(1, 'rgba(80,14,12,0)');
    g.fillStyle = grad;
    g.fillRect(bx - 6 - Math.random() * 8, top, 12 + Math.random() * 16, len);
  }
  for (var k = 0; k < 70; k++) {
    g.fillStyle = 'rgba(' + (70 + Math.random() * 40) + ',12,10,' + (0.3 + Math.random() * 0.5) + ')';
    g.beginPath();
    g.arc(Math.random() * S, S * 0.4 + Math.random() * S * 0.6, 0.8 + Math.random() * 4, 0, Math.PI * 2);
    g.fill();
  }
  var t = M._finish(c, 1);
  VX.texCache.hc_apron = t;
  return t;
};

// 共用材质（每个怪物一份，避免跨实例改材质互相影响）
function hcMats() {
  var M = VX.materials;
  return {
    gown: new THREE.MeshStandardMaterial({
      map: hcTex.gown(), color: 0xd6dbcd, roughness: 0.9, metalness: 0,
      side: THREE.DoubleSide
    }),
    pgown: new THREE.MeshStandardMaterial({
      map: hcTex.patientGown(), color: 0xc2d5dd, roughness: 0.92, metalness: 0,
      side: THREE.DoubleSide
    }),
    skin: new THREE.MeshStandardMaterial({
      map: hcTex.skin(), color: 0xbfb3a1, roughness: 0.72, metalness: 0
    }),
    bandage: new THREE.MeshStandardMaterial({
      map: hcTex.bandage(), color: 0xdad4c0, roughness: 0.95, metalness: 0
    }),
    scrub: M.cloth(0x3d6b56),
    cap: M.cloth(0x4b7f68),
    glove: M.std(0x5e2420, { rough: 0.42, metal: 0.05 }),
    boot: M.std(0x221d19, { rough: 0.72 }),
    blood: M.std(0x54100e, { rough: 0.5, emissive: 0x2a0604, emissiveIntensity: 0.45 }),
    steel: M.metal(0xc9d2d8),
    steelDark: M.std(0x5c666c, { rough: 0.4, metal: 0.55 }),
    lens: M.std(0xe6fff0, { emissive: 0xa8ffcc, emissiveIntensity: 1.8, rough: 0.25 }),
    eyeSick: M.std(0xaaffc6, { emissive: 0x4dff88, emissiveIntensity: 2.4, rough: 0.3 }),
    eyeMilk: M.std(0xeef6e8, { emissive: 0xc4eccf, emissiveIntensity: 1.2, rough: 0.4 }),
    socket: M.std(0x090c09, { rough: 0.9 }),
    gauze: M.cloth(0xe4dfcf)
  };
}

function hcShadow(mesh, receive) {
  mesh.castShadow = true;
  if (receive) mesh.receiveShadow = true;
  return mesh;
}

/**
 * 开口圆柱衣摆：衣服只包住一圈，留一道口子露出里面的身体。
 * LatheGeometry 里 phi=0 对应 +z（模型正面）。
 * @param {number} gapRad 开口角度（弧度）
 * @param {boolean} backGap true = 开口朝后
 */
function hcOpenLathe(points, gapRad, backGap, seg) {
  var start = backGap ? (Math.PI + gapRad / 2) : (gapRad / 2);
  var len = Math.PI * 2 - gapRad;
  return new THREE.LatheGeometry(points, seg || 22, start, len);
}

/** 由 [半径, 高度] 数组拼轮廓点（从下到上） */
function hcProfile(rows) {
  return rows.map(function (r) { return new THREE.Vector2(Math.max(0.001, r[0]), r[1]); });
}

// ============================================================
// 主刀医生（Boss）
// 模型身高 1.86 → 乘 t.scale(1.28) 约 2.4 米
// ============================================================
function hcBuildSurgeon(t) {
  var S = VX.shape, M = hcMats();
  var g = new THREE.Group();

  // ---------------- 腿：绿色刷手裤 + 胶靴 ----------------
  function buildLeg(side) {
    // 胖子腿：短粗、站距宽，膝盖被肉挤得看不出棱
    var leg = new THREE.Group();
    leg.position.set(side * 0.15, 0.94, 0);
    var thigh = new THREE.Mesh(S.capsule(0.13, 0.28, 10, 4), M.scrub);
    thigh.position.y = -0.17;
    hcShadow(thigh);
    leg.add(thigh);
    var knee = new THREE.Mesh(new THREE.SphereGeometry(0.115, 10, 8), M.scrub);
    knee.position.y = -0.36;
    leg.add(knee);
    var shin = new THREE.Mesh(S.capsule(0.10, 0.3, 10, 4), M.scrub);
    shin.position.y = -0.58;
    hcShadow(shin);
    leg.add(shin);
    var boot = new THREE.Mesh(S.roundedBox(0.19, 0.13, 0.36, 0.045, 2), M.boot);
    boot.position.set(0, -0.84, 0.06);
    hcShadow(boot);
    leg.add(boot);
    return leg;
  }
  var legL = buildLeg(-1), legR = buildLeg(1);
  g.add(legL, legR);

  // ---------------- 躯干（重度驼背：手术做多了，腰直不起来） ----------------
  var torso = new THREE.Group();
  torso.position.y = 0.98;
  torso.rotation.x = 0.17;
  g.add(torso);

  // 里面的绿色刷手服（前襟敞开时能看见）—— 胖子版整体加宽
  var scrubBody = new THREE.Mesh(new THREE.CylinderGeometry(0.255, 0.23, 0.6, 14), M.scrub);
  scrubBody.position.y = 0.22;
  scrubBody.scale.z = 0.9;
  hcShadow(scrubBody);
  torso.add(scrubBody);
  // 肚腩：从前襟缺口里挤出来的那团（重体力干饭人的肚子比胸还高）
  var belly = new THREE.Mesh(S.ellipsoid(0.20, 0.17, 0.16, 16), M.scrub);
  belly.position.set(0, 0.02, 0.135);
  belly.scale.set(1.15, 0.95, 1);
  hcShadow(belly);
  torso.add(belly);
  // 肚子上的血手印（拖人时蹭的）
  var bellyBlood = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.14), bloodPlaneMat(36));
  bellyBlood.position.set(0.05, 0.06, 0.29);
  bellyBlood.rotation.z = -0.3;
  torso.add(bellyBlood);
  // 刷手服上的血
  // 刷手服上的血：做小一点、贴得更近，不然远看就是一个红圆点
  var chestBlood = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.19), bloodPlaneMat(33));
  chestBlood.position.set(0.02, 0.18, 0.168);
  chestBlood.rotation.z = 0.4;
  torso.add(chestBlood);

  // 白大褂：开前襟（缺口 76°），下摆略外扩
  // 大衣顶只到肩线（相对躯干 +0.4 → 世界 1.38），
  // 之前做到 1.60 会把整个脑袋包进去，只剩一顶帽子露在外面
  // 胖子大衣：整体放宽，前襟缺口也加宽（1.6rad）好让肚腩露出来
  var coatRows = hcProfile([
    [0.30, -0.36],    // 下摆（膝上）
    [0.285, -0.16],
    [0.268, 0.04],
    [0.252, 0.24],
    [0.242, 0.4]      // 肩
  ]);
  var coat = new THREE.Mesh(hcOpenLathe(coatRows, 1.6, false, 26), M.gown);
  coat.position.y = 0.14;
  coat.scale.z = 0.86;
  hcShadow(coat, true);
  torso.add(coat);

  // 腰带
  var belt = new THREE.Mesh(new THREE.TorusGeometry(0.285, 0.032, 6, 24), M.steelDark);
  belt.rotation.x = Math.PI / 2;
  belt.position.y = -0.02;
  belt.scale.z = 0.9;
  torso.add(belt);

  // 听诊器
  var steth = new THREE.Group();
  var tube = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.015, 5, 18, Math.PI * 1.15), M.steelDark);
  tube.rotation.x = Math.PI / 2;
  tube.rotation.z = -0.35;
  tube.position.set(0.01, 0.46, 0.02);
  steth.add(tube);
  var chestPiece = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.028, 10), M.steel);
  chestPiece.position.set(-0.09, 0.2, 0.175);
  chestPiece.rotation.x = Math.PI / 2;
  steth.add(chestPiece);
  torso.add(steth);

  // 下摆滴血
  [[0.16, -0.42], [-0.02, -0.45], [0.2, -0.4]].forEach(function (p, i) {
    var drip = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.13 + i * 0.05, 6), M.blood);
    drip.position.set(p[0], p[1], 0.18 - i * 0.06);
    drip.rotation.x = Math.PI;
    torso.add(drip);
  });

  // 前襟缺口里垂出来的肠子（干涸发黑，一动往下坠）
  var gutMat = VX.materials.std(0x451d1a, { rough: 0.88 });
  for (var gi = 0; gi < 3; gi++) {
    var gut = new THREE.Mesh(new THREE.TorusGeometry(0.052 - gi * 0.008, 0.014, 6, 12, Math.PI * 1.35), gutMat);
    gut.position.set((gi - 1) * 0.055, -0.16 + gi * 0.05, 0.155);
    gut.rotation.x = Math.PI / 2 + 0.35;
    gut.rotation.z = gi * 0.7;
    torso.add(gut);
  }
  var gutDrip = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.16, 6), M.blood);
  gutDrip.position.set(0.03, -0.34, 0.17);
  gutDrip.rotation.x = Math.PI;
  torso.add(gutDrip);

  // ---------------- 手臂（在衣服轮廓之外） ----------------
  function buildArm(side) {
    // 胖子手臂：粗、圆、略外张（架在肚子两侧）
    var arm = new THREE.Group();
    arm.position.set(side * 0.275, 1.38, 0.01);
    var shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.108, 12, 10), M.gown);
    shoulder.scale.set(1, 0.92, 0.95);
    hcShadow(shoulder);
    arm.add(shoulder);
    var upper = new THREE.Mesh(S.capsule(0.085, 0.24, 10, 4), M.gown);
    upper.position.y = -0.19;
    hcShadow(upper);
    arm.add(upper);
    var elbow = new THREE.Mesh(new THREE.SphereGeometry(0.078, 10, 8), M.gown);
    elbow.position.y = -0.36;
    arm.add(elbow);
    var fore = new THREE.Mesh(S.capsule(0.07, 0.22, 10, 4), M.gown);
    fore.position.y = -0.52;
    hcShadow(fore);
    arm.add(fore);
    var cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.076, 0.06, 10), M.glove);
    cuff.position.y = -0.64;
    arm.add(cuff);
    var glove = new THREE.Mesh(S.capsule(0.075, 0.12, 10, 4), M.glove);
    glove.position.y = -0.71;
    hcShadow(glove);
    arm.add(glove);

    arm.userData.hand = new THREE.Group();
    arm.userData.hand.position.y = -0.78;
    arm.add(arm.userData.hand);
    return arm;
  }
  var armL = buildArm(-1), armR = buildArm(1);
  armL.rotation.z = 0.14;
  armR.rotation.z = -0.12;
  g.add(armL, armR);

  // 右手大刀：医院后厨的巨型剁骨刀，木柄缠布，刀身带豁口和陈年血垢
  var dao = new THREE.Group();
  // 木柄（手握在下端，刀身朝上）
  var hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.030, 0.034, 0.62, 8), M.boot);
  hilt.position.y = 0.31;
  hcShadow(hilt);
  dao.add(hilt);
  // 柄上的缠布（红布条，斩过太多东西）
  var clothRing = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.1, 8),
    VX.materials.std(0x7a1f1a, { rough: 0.95 }));
  clothRing.position.y = 0.09;
  dao.add(clothRing);
  // 护手盘
  var guard = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.026, 10), M.steelDark);
  guard.position.y = 0.63;
  dao.add(guard);
  // 刀身：宽厚的剁骨刀（刀背厚、刀刃薄，前面那道是刃）
  var daoBlade = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.52, 0.26), M.steel);
  daoBlade.position.set(0, 0.91, 0.075);
  hcShadow(daoBlade);
  dao.add(daoBlade);
  // 刀背（加厚的一条，厚度感）
  var spine = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.52, 0.05), M.steelDark);
  spine.position.set(0, 0.91, -0.06);
  dao.add(spine);
  // 刃口（发亮 + 血垢）
  var edge = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.52, 0.02), VX.materials.std(0xd8e6e2, { rough: 0.18, metal: 0.6 }));
  edge.position.set(0, 0.91, 0.208);
  dao.add(edge);
  var edgeBlood = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.4, 0.012), M.blood);
  edgeBlood.position.set(0, 0.86, 0.216);
  dao.add(edgeBlood);
  // 刀身上的豁口（两处崩刃，砍在骨头上崩的）
  [[0.24, -0.02], [0.08, 0.01]].forEach(function (np) {
    var nick = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.05, 4), M.steelDark);
    nick.position.set(0, np[0], np[1] + 0.208);
    nick.rotation.x = Math.PI;
    dao.add(nick);
  });
  // 刀尖朝下的引导点（劈砍落地时溅渣用）
  var daoTip = new THREE.Object3D();
  daoTip.position.set(0, 0.66, 0.21);
  dao.add(daoTip);
  // 静止姿态：刀背扛在右肩上（刀口朝外），手术做累了就拄着歇
  dao.rotation.z = -0.5;
  dao.rotation.x = 0.35;
  armR.userData.hand.add(dao);

  // 左手空着，微微前伸——随时准备把人按住
  armL.rotation.x = 0.35;

  // ---------------- 脖子 + 头 ----------------
  var neck = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.062, 0.11, 10), M.skin);
  neck.position.set(0, 1.48, 0.01);
  g.add(neck);

  var head = new THREE.Group();
  head.position.set(0, 1.66, 0.015);
  g.add(head);

  var skull = new THREE.Mesh(S.ellipsoid(0.108, 0.135, 0.118, 14), M.skin);
  hcShadow(skull);
  head.add(skull);
  var jaw = new THREE.Mesh(S.ellipsoid(0.088, 0.07, 0.1, 12), M.skin);
  jaw.position.set(0, -0.1, 0.018);
  head.add(jaw);

  // 头顶开过两次颅：一条 Y 形缝合疤 + 发黑的缝线
  var sutureMat = VX.materials.std(0x3d2828, { rough: 0.92 });
  var sutureMain = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.13, 0.01), sutureMat);
  sutureMain.position.set(0.02, 0.075, 0.085);
  sutureMain.rotation.x = 0.75;
  head.add(sutureMain);
  var sutureSide = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.09, 0.01), sutureMat);
  sutureSide.position.set(-0.032, 0.085, 0.06);
  sutureSide.rotation.x = 0.5;
  sutureSide.rotation.z = -0.6;
  head.add(sutureSide);
  for (var sti = 0; sti < 4; sti++) {
    var tick = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.005, 0.008), sutureMat);
    tick.position.set(0.02 - sti * 0.004, 0.05 + sti * 0.03, 0.1 - sti * 0.012);
    tick.rotation.z = (sti % 2 === 0 ? 0.5 : -0.5);
    head.add(tick);
  }

  // 手术帽
  var cap = new THREE.Mesh(new THREE.SphereGeometry(0.122, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), M.cap);
  cap.position.y = 0.038;
  cap.scale.set(1.02, 1.1, 1.02);
  hcShadow(cap);
  head.add(cap);
  var capBand = new THREE.Mesh(new THREE.TorusGeometry(0.118, 0.016, 6, 20), M.cap);
  capBand.rotation.x = Math.PI / 2;
  capBand.position.y = 0.016;
  head.add(capBand);

  // 口罩：被扯到了下巴底下——他不想让你看见的东西就在口罩上面
  var mask = new THREE.Mesh(S.roundedBox(0.165, 0.115, 0.062, 0.03, 3), M.gauze);
  mask.position.set(0, -0.185, 0.05);
  mask.rotation.x = 0.55;
  hcShadow(mask);
  head.add(mask);
  [-1, 1].forEach(function (s) {
    var strap = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.012, 0.13), M.gauze);
    strap.position.set(s * 0.105, -0.1, 0.015);
    strap.rotation.y = s * 0.4;
    head.add(strap);
  });

  // 露出来的嘴：缝合线崩开，歪斜的残牙 + 顺嘴角淌下的血
  var mouthCavity = new THREE.Mesh(S.ellipsoid(0.05, 0.034, 0.02, 8), M.socket);
  mouthCavity.position.set(0.012, -0.102, 0.092);
  mouthCavity.rotation.x = 0.25;
  head.add(mouthCavity);
  for (var mti = 0; mti < 5; mti++) {
    var mtooth = new THREE.Mesh(new THREE.ConeGeometry(0.007, 0.02 + Math.random() * 0.018, 4), M.gauze);
    mtooth.position.set(-0.03 + mti * 0.016 + (Math.random() - 0.5) * 0.006, -0.094 - (mti % 2) * 0.014, 0.1);
    mtooth.rotation.x = Math.PI + 0.25 + (Math.random() - 0.5) * 0.5;
    mtooth.rotation.z = (Math.random() - 0.5) * 0.4;
    head.add(mtooth);
  }
  var mouthBlood = new THREE.Mesh(new THREE.PlaneGeometry(0.032, 0.1), bloodPlaneMat(35));
  mouthBlood.position.set(0.014, -0.158, 0.096);
  head.add(mouthBlood);

  // 眼窝：左眼是早就不动的鱼白眼，右眼在暗处发着绿光
  [-1, 1].forEach(function (s) {
    var socket = new THREE.Mesh(S.ellipsoid(0.038, 0.032, 0.018, 10), M.socket);
    socket.position.set(s * 0.046, 0.022, 0.104);
    head.add(socket);
    var eye = new THREE.Mesh(new THREE.SphereGeometry(0.017, 10, 8), s === -1 ? M.eyeMilk : M.eyeSick);
    eye.position.set(s * 0.046, 0.022, 0.116);
    head.add(eye);
    if (s === 1) {
      var halo = new THREE.Mesh(new THREE.SphereGeometry(0.038, 8, 8), VX.materials.glow(0x6cff9a, 0.26, true));
      halo.position.copy(eye.position);
      head.add(halo);
    }
  });

  // 额头头镜
  var mirrorArm = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.07, 6), M.steelDark);
  mirrorArm.position.set(0, 0.11, 0.075);
  mirrorArm.rotation.x = Math.PI / 2.6;
  head.add(mirrorArm);
  var mirror = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.014, 12), M.steel);
  mirror.position.set(0, 0.108, 0.1);
  mirror.rotation.x = Math.PI / 2 - 0.45;
  head.add(mirror);
  var mirrorLens = new THREE.Mesh(new THREE.CircleGeometry(0.023, 12), M.lens);
  mirrorLens.position.set(0, 0.111, 0.107);
  mirrorLens.rotation.x = -0.45;
  head.add(mirrorLens);
  var lampGlow = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 10), VX.materials.glow(0xc8ffe0, 0.2, true));
  lampGlow.position.set(0, 0.112, 0.115);
  head.add(lampGlow);

  // ---------------- 动画 ----------------
  g.__creatureTick = function (delta, m) {
    var st = g.__st || (g.__st = { amp: 0, lastPhase: -1, t: Math.random() * 6, atk: 0 });
    st.t += delta;
    if (st.atk > 0) st.atk -= delta;
    var phase = (m && m.userData && m.userData.walkPhase) ? m.userData.walkPhase : 0;
    var moved = Math.abs(phase - st.lastPhase) > 0.0004;
    st.lastPhase = phase;
    st.amp += ((moved ? 1 : 0) - st.amp) * Math.min(1, delta * 7);

    var sw = Math.sin(phase) * st.amp;
    var sw2 = Math.sin(phase + Math.PI) * st.amp;

    legL.rotation.x = sw * 0.52;
    legR.rotation.x = sw2 * 0.52;
    legL.rotation.z = 0.02 + Math.abs(sw) * 0.03;
    legR.rotation.z = -0.02 - Math.abs(sw2) * 0.03;

    // 静止/走路姿态：右臂把大刀扛在肩上（局部 z 让刀身搭肩），
    // 走路时刀随步伐轻轻颠；左手前伸保持平衡
    armR.rotation.x = sw2 * 0.26 - 0.42;
    armR.rotation.z = -0.12 - Math.abs(sw) * 0.04;
    armL.rotation.x = sw * 0.3 + 0.3;

    torso.position.y = 0.98 + Math.abs(sw) * 0.025;
    torso.rotation.x = 0.17 + Math.sin(st.t * 1.5) * 0.014;
    torso.rotation.z = Math.sin(phase) * 0.022 * st.amp;
    torso.rotation.y = Math.sin(st.t * 0.8) * 0.05;

    head.rotation.y = Math.sin(st.t * 0.65) * 0.3;
    head.rotation.x = Math.sin(st.t * 1.8) * 0.035 - 0.02;
    head.position.y = 1.66 + Math.abs(sw) * 0.015;

    // ===== 攻击动画：大刀过顶劈砍，幅度拉满 =====
    // 总时长 0.8s：蓄力 0.28s（刀抡到身后、躯干拧转发力）→
    // 劈下 0.18s（二次方缓动，越落越快）→ 命中顿挫 → 收势 0.34s
    if (st.atk > 0) {
      var AP = 1 - st.atk / 0.8;          // 0→1 进度
      if (AP < 0.35) {
        // 蓄力：刀从肩上抡向身后上方，躯干右拧后仰
        var wu = AP / 0.35;
        var wuE = wu * wu * (3 - 2 * wu);  // smoothstep
        armR.rotation.x = -0.42 - 2.55 * wuE;      // 手臂抡过头顶到身后
        armR.rotation.z = -0.12 - 0.55 * wuE;
        dao.rotation.x = 0.35 - 0.85 * wuE;        // 刀身放平，刃口朝后
        dao.rotation.z = -0.5 - 0.4 * wuE;
        torso.rotation.y = -0.6 * wuE;             // 拧腰
        torso.rotation.x = 0.17 - 0.3 * wuE;       // 后仰
        torso.rotation.z = 0.12 * wuE;
        head.rotation.x = -0.02 - 0.3 * wuE;       // 仰头盯目标
        head.rotation.y = -0.45 * wuE;
        armL.rotation.x = 0.3 + 0.7 * wuE;         // 左手前按
        st.hitDone = false;
      } else if (AP < 0.575) {
        // 劈砍：二次方加速，从身后直劈到身前地面
        var cp = (AP - 0.35) / 0.225;
        var cpE = cp * cp;
        armR.rotation.x = -2.97 + 4.35 * cpE;      // -2.97 → +1.38
        armR.rotation.z = -0.67 + 0.75 * cp;
        dao.rotation.x = -0.5 + 1.15 * cp;         // 刃口转向前下
        dao.rotation.z = -0.9 + 0.55 * cp;
        torso.rotation.y = -0.6 + 1.05 * cpE;      // 拧腰回正带过冲
        torso.rotation.x = -0.13 + 0.75 * cpE;     // 整个人压下去
        torso.rotation.z = 0.12 - 0.3 * cpE;
        head.rotation.x = -0.32 + 0.62 * cpE;
        head.rotation.y = -0.45 + 0.75 * cpE;
        armL.rotation.x = 1.0 - 0.45 * cp;
        if (!st.hitDone && cp > 0.55) {
          // 劈中瞬间：刀尖位置溅起骨渣 + 一道弧光
          st.hitDone = true;
          try {
            var _wp = new THREE.Vector3();
            daoTip.getWorldPosition(_wp);
            if (window.VX && VX.vfx) {
              VX.vfx.impact(_wp, 0x8a939a, { scale: 1.5, chipCount: 14, streakCount: 8, shake: true });
            }
          } catch (e) { }
        }
      } else {
        // 收势：慢慢回到扛刀姿态
        var rc = (AP - 0.575) / 0.425;
        var rcE = rc * rc * (3 - 2 * rc);
        armR.rotation.x = 1.38 + (-0.42 - 1.38) * rcE;
        armR.rotation.z = 0.08 + (-0.12 - 0.08) * rcE;
        dao.rotation.x = 0.65 + (0.35 - 0.65) * rcE;
        dao.rotation.z = -0.35 + (-0.5 + 0.35) * rcE;
        torso.rotation.y = 0.45 * (1 - rcE);
        torso.rotation.x = 0.62 - 0.45 * rcE;
        torso.rotation.z = -0.18 * (1 - rcE);
        head.rotation.x = 0.3 * (1 - rcE) - 0.02;
        head.rotation.y = 0.3 * (1 - rcE);
        armL.rotation.x = 0.55 - 0.25 * rcE;
      }
    }

    // 狂暴表现：血越少，右眼的绿光越偏红、越亮（血条压力直接写在脸上）
    var bp = (m && m.userData && m.userData.bossPhase) || 3;
    if (M.eyeSick) {
      M.eyeSick.emissiveIntensity = 1.7 + (3 - bp) * 0.9 + Math.sin(st.t * 5) * 0.3;
      M.eyeSick.emissive.setHex(bp <= 2 ? 0xff5a3c : 0x4dff88);
    }
  };

  // 攻击动画钩子（monsterAttack 命中时由 game-combat.js 调用）
  g.__creatureAttack = function () {
    var st = g.__st || (g.__st = { amp: 0, lastPhase: -1, t: Math.random() * 6, atk: 0 });
    st.atk = 0.8;      // 大刀劈砍全程 0.8s：蓄力→劈下→收势
    st.hitDone = false;
  };

  return g;
}

// ============================================================
// 疯魔病人（身高 1.7）
// ============================================================
function hcBuildPatient(t) {
  var S = VX.shape, M = hcMats();
  var g = new THREE.Group();

  // ---------------- 腿：赤脚、细、一条缠绷带 ----------------
  function buildLeg(side, bandaged) {
    var leg = new THREE.Group();
    leg.position.set(side * 0.085, 0.9, 0);
    var thigh = new THREE.Mesh(S.capsule(0.072, 0.28, 10, 4), M.skin);
    thigh.position.y = -0.17;
    hcShadow(thigh);
    leg.add(thigh);
    var knee = new THREE.Mesh(new THREE.SphereGeometry(0.062, 10, 8), M.skin);
    knee.position.y = -0.35;
    leg.add(knee);
    var shin = new THREE.Mesh(S.capsule(0.052, 0.32, 10, 4), bandaged ? M.bandage : M.skin);
    shin.position.y = -0.58;
    hcShadow(shin);
    leg.add(shin);
    var foot = new THREE.Mesh(S.ellipsoid(0.062, 0.045, 0.12, 10), M.skin);
    foot.position.set(0, -0.855, 0.045);
    hcShadow(foot);
    leg.add(foot);
    for (var i = 0; i < 4; i++) {
      var toe = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 5), M.skin);
      toe.position.set(-0.036 + i * 0.024, -0.862, 0.14);
      leg.add(toe);
    }
    return leg;
  }
  var legL = buildLeg(-1, false), legR = buildLeg(1, true);
  g.add(legL, legR);

  // 左脚踝的束缚镣：铁环 + 三节断开的锁链（他在拖着脚走）
  var shackle = new THREE.Mesh(new THREE.TorusGeometry(0.062, 0.012, 6, 14), M.steelDark);
  shackle.position.set(-0.085, 0.12, 0.02);
  shackle.rotation.x = Math.PI / 2;
  g.add(shackle);
  for (var chi = 0; chi < 3; chi++) {
    var link = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.007, 5, 10), M.steelDark);
    link.position.set(-0.085 - chi * 0.035, 0.1 - chi * 0.05, 0.06 + chi * 0.02);
    link.rotation.y = chi * 0.8;
    link.rotation.x = 0.4;
    g.add(link);
  }

  // ---------------- 躯干（佝偻） ----------------
  var torso = new THREE.Group();
  torso.position.y = 0.9;
  torso.rotation.x = 0.2;
  g.add(torso);

  // 皮包骨的胸腹
  var core = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.115, 0.54, 12), M.skin);
  core.position.y = 0.27;
  core.scale.z = 0.82;
  hcShadow(core);
  torso.add(core);

  // 胸腔暗腔 + 五根肋骨（瘦得皮包骨，敞开的前襟下根根分明）
  var cavity = new THREE.Mesh(S.ellipsoid(0.082, 0.105, 0.04, 10), M.socket);
  cavity.position.set(0, 0.3, 0.07);
  torso.add(cavity);
  for (var ri = 0; ri < 5; ri++) {
    var rib = new THREE.Mesh(new THREE.TorusGeometry(0.105 - ri * 0.006, 0.01, 5, 14, Math.PI * 1.02), M.skin);
    rib.position.set(0, 0.42 - ri * 0.062, 0.082);
    rib.rotation.x = Math.PI / 2;
    rib.rotation.z = Math.PI;
    rib.scale.z = 0.55;
    torso.add(rib);
  }
  // 露出来的一小团脏器
  // 这里的 M 是 hcMats() 的返回值，不是 VX.materials
  var gut = new THREE.Mesh(S.blob(0.055, 0.2, 8), VX.materials.std(0x5a2a2a, { rough: 0.8 }));
  gut.position.set(0, 0.14, 0.07);
  torso.add(gut);

  // 病号服：开口朝前（缺口 72°），只盖两侧和后背
  var gownRows = hcProfile([
    [0.248, -0.3],
    [0.224, -0.1],
    [0.203, 0.12],
    [0.186, 0.32],
    [0.178, 0.46]
  ]);
  var gown = new THREE.Mesh(hcOpenLathe(gownRows, 1.05, false, 24), M.pgown);
  gown.position.y = 0.16;
  gown.scale.z = 0.84;
  hcShadow(gown, true);
  torso.add(gown);

  // 撕裂的下摆布条
  for (var fi = 0; fi < 7; fi++) {
    var a = (fi / 7) * Math.PI * 2 + 0.3;
    var rag = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.14 + Math.random() * 0.12, 0.014), M.pgown);
    rag.position.set(Math.cos(a) * 0.215, -0.36 - Math.random() * 0.08, Math.sin(a) * 0.18);
    rag.rotation.y = -a;
    rag.rotation.x = 0.1;
    rag.rotation.z = (Math.random() - 0.5) * 0.3;
    torso.add(rag);
  }
  // 背后凸起的脊椎
  for (var si = 0; si < 6; si++) {
    var vert = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), M.skin);
    vert.position.set(0, -0.02 + si * 0.075, -0.135);
    torso.add(vert);
  }

  // 肩部：一块皮肤把头和身体连起来（不然脑袋像浮在半空）
  var shoulders = new THREE.Mesh(S.ellipsoid(0.175, 0.075, 0.1, 12), M.skin);
  shoulders.position.set(0, 0.44, -0.005);
  shoulders.scale.z = 0.8;
  torso.add(shoulders);

  // ---------------- 手臂：细长、前伸 ----------------
  function buildArm(side, strap) {
    var arm = new THREE.Group();
    arm.position.set(side * 0.165, 1.32, 0.01);
    var upper = new THREE.Mesh(S.capsule(0.042, 0.28, 8, 4), M.skin);
    upper.position.y = -0.18;
    hcShadow(upper);
    arm.add(upper);
    var elbow = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), M.skin);
    elbow.position.y = -0.34;
    arm.add(elbow);
    var fore = new THREE.Mesh(S.capsule(0.036, 0.27, 8, 4), M.skin);
    fore.position.y = -0.5;
    hcShadow(fore);
    arm.add(fore);
    var palm = new THREE.Mesh(S.ellipsoid(0.05, 0.062, 0.032, 8), M.skin);
    palm.position.y = -0.68;
    arm.add(palm);
    for (var f = 0; f < 4; f++) {
      var fx = -0.03 + f * 0.02;
      var finger = new THREE.Mesh(S.capsule(0.009, 0.1, 6, 3), M.skin);
      finger.position.set(fx, -0.75, 0.012);
      finger.rotation.x = 0.4;
      arm.add(finger);
      var claw = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.035, 4), M.skin);
      claw.position.set(fx, -0.81, 0.055);
      claw.rotation.x = 2.6;
      arm.add(claw);
    }
    if (strap) {
      var strapM = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.18, 0.01), M.bandage);
      strapM.position.set(0, -0.76, -0.055);
      strapM.rotation.x = 0.22;
      arm.add(strapM);
      var buckle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.026, 0.018), M.steelDark);
      buckle.position.set(0, -0.85, -0.075);
      arm.add(buckle);
    }
    return arm;
  }
  var armL = buildArm(-1, true), armR = buildArm(1, false);
  armL.rotation.x = -0.5;
  armR.rotation.x = -0.42;
  g.add(armL, armR);

  // 右腕还挂着没拔的输液针：软管垂下来，吊袋里是发黑的药液
  var ivGroup = new THREE.Group();
  var ivTube1 = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.16, 6), M.glove);
  ivTube1.position.set(0.02, -0.84, 0.04);
  ivTube1.rotation.z = 0.35;
  ivGroup.add(ivTube1);
  var ivTube2 = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.12, 6), M.glove);
  ivTube2.position.set(0.07, -0.98, 0.04);
  ivTube2.rotation.z = -0.5;
  ivGroup.add(ivTube2);
  var ivBag = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.03),
    new THREE.MeshStandardMaterial({
      color: 0xc9d4c9, roughness: 0.5, metalness: 0,
      transparent: true, opacity: 0.72
    }));
  ivBag.position.set(0.055, -1.1, 0.04);
  ivBag.rotation.z = -0.1;
  ivGroup.add(ivBag);
  var ivFluid = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.05, 0.022), VX.materials.std(0x3a1418, { rough: 0.4 }));
  ivFluid.position.set(0.055, -1.13, 0.04);
  ivGroup.add(ivFluid);
  armR.add(ivGroup);

  // ---------------- 脖子 + 头 ----------------
  var neck = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.058, 0.11, 10), M.skin);
  neck.position.set(0, 1.42, 0.01);
  neck.rotation.x = 0.2;
  g.add(neck);

  var head = new THREE.Group();
  head.position.set(0, 1.53, 0.04);
  head.rotation.z = 0.2;
  head.rotation.x = 0.16;
  g.add(head);

  // 头要略大一点：太小的脑袋远看像根木棍（1.7 米身高的 6.5 头身）
  var skull = new THREE.Mesh(S.ellipsoid(0.105, 0.128, 0.115, 14), M.skin);
  hcShadow(skull);
  head.add(skull);

  // 绷带：一块包住头顶 + 两道缠过眼睛的细带
  // （原来用 4 个粗圆环，远看像头顶摞了几个垫圈）
  var wrap = new THREE.Mesh(S.ellipsoid(0.113, 0.09, 0.122, 14), M.bandage);
  wrap.position.set(0, 0.046, -0.004);
  head.add(wrap);
  [0.022, -0.026].forEach(function (yy) {
    var band = new THREE.Mesh(new THREE.TorusGeometry(0.109, 0.013, 5, 18), M.bandage);
    band.rotation.x = Math.PI / 2 + 0.1;
    band.position.set(0, yy, 0.004);
    head.add(band);
  });
  // 垂下来的一截绷带头
  var tail = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.1, 0.008), M.bandage);
  tail.position.set(0.062, -0.09, -0.03);
  tail.rotation.z = 0.2;
  tail.rotation.x = 0.15;
  head.add(tail);
  // 露出的那只眼（浑浊发白）
  var eye = new THREE.Mesh(new THREE.SphereGeometry(0.027, 10, 8), M.eyeMilk);
  eye.position.set(-0.042, 0.004, 0.108);
  head.add(eye);
  var iris = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 6), M.socket);
  iris.position.set(-0.042, 0.004, 0.126);
  iris.scale.z = 0.5;
  head.add(iris);
  var eyeGlow = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), VX.materials.glow(0xcfffe0, 0.26, true));
  eyeGlow.position.copy(eye.position);
  head.add(eyeGlow);
  var tear = new THREE.Mesh(new THREE.PlaneGeometry(0.026, 0.09), bloodPlaneMat(32));
  tear.position.set(-0.042, -0.055, 0.112);
  head.add(tear);

  // 脱臼的大张嘴：下颌几乎挂不住，残牙稀稀拉拉，嘴角一直淌血
  var jaw = new THREE.Mesh(S.ellipsoid(0.07, 0.05, 0.062, 10), M.skin);
  jaw.position.set(0, -0.115, 0.045);
  jaw.rotation.x = 0.85;
  head.add(jaw);
  var mouth = new THREE.Mesh(S.ellipsoid(0.048, 0.046, 0.03, 8), M.socket);
  mouth.position.set(0, -0.085, 0.1);
  head.add(mouth);
  for (var ti2 = 0; ti2 < 5; ti2++) {
    var tooth = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.028, 4), M.gauze);
    tooth.position.set(-0.03 + ti2 * 0.015, -0.064 - (ti2 % 2) * 0.01, 0.108);
    tooth.rotation.x = Math.PI + 0.2 + (Math.random() - 0.5) * 0.4;
    head.add(tooth);
  }
  var mouthDrip = new THREE.Mesh(new THREE.PlaneGeometry(0.028, 0.12), bloodPlaneMat(36));
  mouthDrip.position.set(0.012, -0.15, 0.104);
  head.add(mouthDrip);

  // ---------------- 动画：拖着一条腿 + 抽搐 + 冲刺扑击 ----------------
  g.__creatureTick = function (delta, m) {
    var st = g.__st || (g.__st = { amp: 0, lastPhase: -1, t: Math.random() * 6, tw: 0, hold: 0, atk: 0 });
    st.t += delta;
    if (st.atk > 0) st.atk -= delta;
    var phase = (m && m.userData && m.userData.walkPhase) ? m.userData.walkPhase : 0;
    var moved = Math.abs(phase - st.lastPhase) > 0.0004;
    st.lastPhase = phase;
    st.amp += ((moved ? 1 : 0) - st.amp) * Math.min(1, delta * 7);

    var sw = Math.sin(phase) * st.amp;
    legL.rotation.x = sw * 0.5;
    legR.rotation.x = Math.sin(phase + 1.2) * st.amp * 0.2 - 0.12;
    legR.rotation.z = -0.05;

    armL.rotation.x = -0.5 + sw * 0.2;
    armR.rotation.x = -0.42 + Math.sin(phase + Math.PI) * 0.18;
    armL.rotation.z = 0.1 + Math.sin(st.t * 1.3) * 0.05;
    armR.rotation.z = -0.1 - Math.sin(st.t * 1.1) * 0.05;

    // 抽搐
    st.tw -= delta;
    var twitch = 0;
    if (st.tw <= 0) { st.tw = 2.2 + Math.random() * 2.6; st.hold = 0.16; }
    if (st.hold > 0) {
      st.hold -= delta;
      twitch = Math.sin((0.16 - st.hold) * 60) * 0.3;
    }

    torso.position.y = 0.9 - Math.abs(sw) * 0.018;
    torso.rotation.x = 0.2 + Math.sin(st.t * 1.7) * 0.02;
    torso.rotation.z = Math.sin(phase) * 0.05 * st.amp + twitch * 0.18;

    head.rotation.z = 0.2 + twitch * 0.65 + Math.sin(st.t * 0.9) * 0.04;
    head.rotation.y = Math.sin(st.t * 0.55) * 0.22;
    head.position.y = 1.55 - Math.abs(sw) * 0.012;
    jaw.rotation.x = 0.85;

    // 冲刺扑击姿态：整个人前倾，双臂直直伸向猎物，嘴张到最大
    var pouncing = !!(m && m.userData && m.userData.dashing > 0);
    if (pouncing) {
      torso.rotation.x = 0.52;
      torso.position.y = 0.86;
      armL.rotation.x = -1.75;
      armR.rotation.x = -1.85;
      armL.rotation.z = 0.22;
      armR.rotation.z = -0.22;
      head.rotation.x = -0.3;
      jaw.rotation.x = 1.15;
      legL.rotation.x = 0.85;
      legR.rotation.x = -0.45;
    }

    // 攻击动画：双臂乱挠（狂乱地扑撕）
    if (st.atk > 0) {
      var ap = 1 - st.atk / 0.5;
      var k = Math.sin(ap * Math.PI);
      armL.rotation.x = -0.5 - k * 1.6;
      armR.rotation.x = -0.42 - k * 1.5;
      armL.rotation.z = 0.1 + k * 0.85;
      armR.rotation.z = -0.1 - k * 0.85;
      torso.rotation.x = 0.2 + k * 0.28;
      jaw.rotation.x = 0.85 - k * 0.5;
    }
  };

  // 攻击动画钩子（monsterAttack 命中时由 game-combat.js 调用）
  g.__creatureAttack = function () {
    var st = g.__st || (g.__st = { amp: 0, lastPhase: -1, t: Math.random() * 6, tw: 0, hold: 0, atk: 0 });
    st.atk = 0.5;
  };

  return g;
}

// ============================================================
// 邪恶幽灵（衣摆到地，整体再靠 fly 抬到 0.6 米高）
// ============================================================
function hcBuildGhost(t) {
  var S = VX.shape, M = hcMats();
  var g = new THREE.Group();

  var shroudMat = new THREE.MeshStandardMaterial({
    color: 0xa9d8c8, roughness: 0.9, metalness: 0,
    transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false
  });
  var shroudDark = new THREE.MeshStandardMaterial({
    color: 0x7fb6a4, roughness: 0.92, metalness: 0,
    transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false
  });
  var armMat = new THREE.MeshStandardMaterial({
    color: 0xc4e8d8, roughness: 0.85, metalness: 0,
    transparent: true, opacity: 0.72, side: THREE.DoubleSide, depthWrite: false
  });
  // 眼睛用 Basic：不吃光照，任何时候都是两点亮光
  var eyeMat = new THREE.MeshBasicMaterial({ color: 0xd8fff2 });
  var eyeHaloMat = new THREE.MeshBasicMaterial({
    color: 0x8dffd8, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false
  });

  var body = new THREE.Group();
  g.add(body);

  // 寿衣：上窄下宽，底部散开
  var rows = hcProfile([
    [0.4, 0.02],
    [0.34, 0.22],
    [0.26, 0.5],
    [0.2, 0.78],
    [0.17, 1.02],
    [0.155, 1.2]
  ]);
  var shroud = new THREE.Mesh(new THREE.LatheGeometry(rows, 22), shroudMat);
  shroud.scale.z = 0.86;
  body.add(shroud);

  // 兜帽：比肩部明显大一圈，才看得出"头"
  var hood = new THREE.Mesh(new THREE.SphereGeometry(0.208, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.8), shroudMat);
  hood.position.set(0, 1.31, 0.01);
  hood.scale.set(1, 1.18, 1.08);
  body.add(hood);
  var hoodRim = new THREE.Mesh(new THREE.TorusGeometry(0.196, 0.026, 6, 22), shroudDark);
  hoodRim.rotation.x = Math.PI / 2 - 0.16;
  hoodRim.position.set(0, 1.2, 0.03);
  body.add(hoodRim);
  // 兜帽里的黑腔（比眼睛浅，眼睛要凸在它前面）
  var voidM = new THREE.Mesh(
    new THREE.SphereGeometry(0.155, 14, 10),
    new THREE.MeshBasicMaterial({ color: 0x030706, transparent: true, opacity: 0.95 })
  );
  voidM.position.set(0, 1.28, 0.03);
  voidM.scale.set(1, 1.12, 0.72);
  body.add(voidM);

  // 眼睛
  var eyeHalos = [];
  [-1, 1].forEach(function (s) {
    var eye = new THREE.Mesh(new THREE.SphereGeometry(0.026, 10, 8), eyeMat);
    eye.position.set(s * 0.062, 1.31, 0.155);
    body.add(eye);
    var halo = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), eyeHaloMat.clone());
    halo.position.copy(eye.position);
    body.add(halo);
    eyeHalos.push(halo);
  });

  // 兜帽里那张脸：死灰的皮肤浮在黑腔前面，只有轮廓看得见
  var ghostFaceMat = new THREE.MeshStandardMaterial({
    color: 0xcfe0d6, roughness: 0.85, metalness: 0,
    transparent: true, opacity: 0.8, depthWrite: false
  });
  var ghostFace = new THREE.Mesh(S.ellipsoid(0.125, 0.15, 0.07, 14), ghostFaceMat);
  ghostFace.position.set(0, 1.27, 0.095);
  ghostFace.scale.z = 0.7;
  body.add(ghostFace);
  // 尖啸的嘴：黑洞洞，一直张到脱臼，喊的时候会越张越大
  var ghostMouth = new THREE.Mesh(
    S.ellipsoid(0.05, 0.08, 0.03, 10),
    new THREE.MeshBasicMaterial({ color: 0x03110c, transparent: true, opacity: 0.96 })
  );
  ghostMouth.position.set(0, 1.185, 0.15);
  body.add(ghostMouth);

  // 胸前的病人识别牌：人是哪床的，早就没人记得了
  var idBand = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.055),
    new THREE.MeshBasicMaterial({ color: 0xdfe8e2, transparent: true, opacity: 0.65, side: THREE.DoubleSide }));
  idBand.position.set(0, 0.9, 0.215);
  idBand.rotation.x = 0.12;
  body.add(idBand);

  // 手臂：半透明，垂在身侧，指节细长得不像活人
  function ghostArm(side) {
    var arm = new THREE.Group();
    arm.position.set(side * 0.215, 1.13, 0.01);
    var upper = new THREE.Mesh(S.capsule(0.045, 0.28, 8, 4), armMat);
    upper.position.y = -0.17;
    arm.add(upper);
    var fore = new THREE.Mesh(S.capsule(0.036, 0.26, 8, 4), armMat);
    fore.position.y = -0.48;
    arm.add(fore);
    for (var f = 0; f < 4; f++) {
      var finger = new THREE.Mesh(S.capsule(0.009, 0.15, 6, 3), armMat);
      finger.position.set(-0.036 + f * 0.024, -0.72, 0.015);
      finger.rotation.x = 0.45;
      arm.add(finger);
      // 指尖发黑的爪尖
      var tip = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.04, 4), armMat);
      tip.position.set(-0.036 + f * 0.024, -0.82, 0.05);
      tip.rotation.x = 2.6;
      arm.add(tip);
    }
    return arm;
  }
  var armL = ghostArm(-1), armR = ghostArm(1);
  body.add(armL, armR);

  // 绕着身子转的三粒怨魂光点（像从它身上散出来的）
  var orbs = [];
  for (var oi = 0; oi < 3; oi++) {
    var orb = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 6), eyeHaloMat.clone());
    orb.userData.oa = oi * (Math.PI * 2 / 3);
    body.add(orb);
    orbs.push(orb);
  }

  // 底部飘带
  var wisps = [];
  for (var i = 0; i < 10; i++) {
    var a = (i / 10) * Math.PI * 2;
    var h = 0.42 + Math.random() * 0.3;
    var wisp = new THREE.Mesh(new THREE.PlaneGeometry(0.12, h), shroudDark);
    wisp.position.set(Math.cos(a) * 0.37, h / 2 - 0.04, Math.sin(a) * 0.32);
    wisp.rotation.y = -a + Math.PI / 2;
    body.add(wisp);
    wisps.push({ mesh: wisp, phase: Math.random() * Math.PI * 2, h: h });
  }

  // 幽光（别太大，否则整个人糊成一团）
  var aura = new THREE.Mesh(new THREE.SphereGeometry(0.62, 14, 12), VX.materials.glow(0x7dffd0, 0.06, true));
  aura.position.y = 0.86;
  aura.scale.set(1, 1.35, 1);
  g.add(aura);

  // ---------------- 动画 ----------------
  g.__creatureTick = function (delta, m) {
    var st = g.__st || (g.__st = { t: Math.random() * 6, atk: 0 });
    st.t += delta;
    if (st.atk > 0) st.atk -= delta;
    var t2 = st.t;

    body.position.y = Math.sin(t2 * 1.5) * 0.06;
    body.rotation.z = Math.sin(t2 * 0.75) * 0.045;
    body.rotation.x = Math.sin(t2 * 1.05) * 0.03;

    armL.rotation.x = -0.12 + Math.sin(t2 * 1.2) * 0.2;
    armR.rotation.x = -0.12 + Math.sin(t2 * 1.2 + Math.PI) * 0.2;
    armL.rotation.z = 0.16 + Math.sin(t2 * 0.9) * 0.07;
    armR.rotation.z = -0.16 - Math.sin(t2 * 0.9) * 0.07;

    for (var i = 0; i < wisps.length; i++) {
      var w = wisps[i];
      w.mesh.rotation.z = Math.sin(t2 * 2.0 + w.phase) * 0.3;
      w.mesh.rotation.x = Math.cos(t2 * 1.6 + w.phase) * 0.2;
      w.mesh.position.y = w.h / 2 - 0.02 + Math.sin(t2 * 2.3 + w.phase) * 0.05;
    }

    // 怨魂光点绕身盘旋
    for (var o2 = 0; o2 < orbs.length; o2++) {
      var orb = orbs[o2];
      var oa = orb.userData.oa;
      orb.position.set(Math.cos(t2 * 1.1 + oa) * 0.44, 0.85 + Math.sin(t2 * 1.7 + oa) * 0.3, Math.sin(t2 * 1.1 + oa) * 0.44);
      orb.material.opacity = 0.25 + Math.abs(Math.sin(t2 * 2.4 + oa)) * 0.3;
    }

    // 尖啸的嘴一直在轻轻开合——它停不下来
    var scream = 1 + Math.abs(Math.sin(t2 * 1.35)) * 0.4;
    if (st.atk > 0) {
      // 攻击（发射怨弹）时：嘴张到最大，脸向前探，眼爆亮
      scream = 2.2;
      var k = Math.sin((1 - st.atk / 0.6) * Math.PI);
      ghostFace.position.z = 0.095 + k * 0.05;
      armL.rotation.x = -0.12 - k * 1.1;
      armR.rotation.x = -0.12 - k * 1.1;
      armL.rotation.z = 0.16 + k * 0.5;
      armR.rotation.z = -0.16 - k * 0.5;
      for (var eh = 0; eh < eyeHalos.length; eh++) {
        if (eyeHalos[eh].material) eyeHalos[eh].material.opacity = 0.85;
      }
    }
    ghostMouth.scale.set(1, scream, 1);
    ghostFaceMat.opacity = 0.7 + Math.sin(t2 * 3.1) * 0.12;

    var pulse = 0.25 + Math.abs(Math.sin(t2 * 2.0)) * 0.3;
    if (st.atk <= 0) {
      for (var e = 0; e < eyeHalos.length; e++) {
        if (eyeHalos[e].material) eyeHalos[e].material.opacity = pulse;
      }
    }
    aura.material.opacity = 0.045 + Math.abs(Math.sin(t2 * 1.2)) * 0.045;
  };

  // 攻击动画钩子（game-main.js 远程开火时调用）：尖啸 + 一圈幽绿冲击
  g.__creatureAttack = function () {
    var st = g.__st || (g.__st = { t: Math.random() * 6, atk: 0 });
    st.atk = 0.6;
    if (window.VX && VX.vfx) {
      var p = g.position.clone();
      p.y += 1.25;
      VX.vfx.impact(p, 0x4dffc0, { scale: 0.85, chips: false, streakCount: 6, groundRing: false, shake: false });
    }
  };

  return g;
}

// ============================================================
// 停尸房管理员（医院的"抓捕者"）
// ------------------------------------------------------------
// 原来的抓捕者是紫袍暗影 + 利爪的幻想造型，在医院走廊里很出戏。
// 换成现实里最贴切的角色：一个穿着橡胶围裙、拎着手电和注射器的
// 大块头护工 —— 他负责把"不听话的病人"拖去主刀医生那里。
//
// 保留原有 visual 契约（applyChaserLook 依赖）：
//   eyes[]  → 护目镜的两片镜片（琥珀色，会随状态变色）
//   core    → 手电筒灯头
//   disc    → 手电筒打在地上的光斑（贴地，"在找你"的直观提示）
//   hem     → 注射器里的药液
// ============================================================
function hcBuildOrderly() {
  var S = VX.shape, M = hcMats();
  var g = new THREE.Group();

  var apronMat = new THREE.MeshStandardMaterial({
    map: hcTex.apron(), color: 0xffffff, roughness: 0.44, metalness: 0.04,
    side: THREE.DoubleSide
  });
  var scrubMat = VX.materials.cloth(0x5d6b5e);           // 灰绿刷手服
  var scrubDark = VX.materials.cloth(0x47524a);
  var bagMat = VX.materials.std(0x1c1f1f, { rough: 0.62, metal: 0.05 });   // 尸袋 / 橡胶
  var lensMat = VX.materials.glow(0xffc46a, 0.55, true);
  var eyeMat = VX.materials.glow(0xffb347, 0.85, true);
  var fluidMat = VX.materials.glow(0x6cff9a, 0.75, true);
  [lensMat, eyeMat, fluidMat].forEach(function (mm) { mm.toneMapped = false; });

  // ---------------- 靴子 / 腿 ----------------
  function buildLeg(side) {
    var leg = new THREE.Group();
    leg.position.set(side * 0.115, 1.0, 0);
    var thigh = new THREE.Mesh(S.capsule(0.11, 0.3, 10, 4), scrubDark);
    thigh.position.y = -0.18;
    hcShadow(thigh);
    leg.add(thigh);
    var shin = new THREE.Mesh(S.capsule(0.088, 0.32, 10, 4), scrubDark);
    shin.position.y = -0.58;
    hcShadow(shin);
    leg.add(shin);
    // 高筒胶靴（有翻边）
    var bootTop = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.1, 0.3, 12), bagMat);
    bootTop.position.y = -0.72;
    hcShadow(bootTop);
    leg.add(bootTop);
    var boot = new THREE.Mesh(S.roundedBox(0.19, 0.14, 0.34, 0.05, 2), bagMat);
    boot.position.set(0, -0.92, 0.05);
    hcShadow(boot);
    leg.add(boot);
    return leg;
  }
  var legL = buildLeg(-1), legR = buildLeg(1);
  g.add(legL, legR);

  // ---------------- 躯干（宽厚） ----------------
  var torso = new THREE.Group();
  torso.position.y = 1.02;
  torso.rotation.x = 0.05;
  g.add(torso);

  var chest = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.245, 0.62, 16), scrubMat);
  chest.position.y = 0.3;
  chest.scale.z = 0.82;
  hcShadow(chest);
  torso.add(chest);
  // 短袖的袖子（露出手臂）
  [-1, 1].forEach(function (s2) {
    var sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.125, 0.16, 12), scrubMat);
    sleeve.position.set(s2 * 0.25, 0.52, 0);
    sleeve.rotation.z = s2 * 0.22;
    torso.add(sleeve);
  });

  // 橡胶围裙：包住正面约 100°，从胸到膝
  var apron = new THREE.Mesh(
    new THREE.CylinderGeometry(0.245, 0.275, 0.9, 16, 1, true, -0.76, 1.52),
    apronMat
  );
  apron.position.set(0, -0.06, 0.012);
  hcShadow(apron, true);
  torso.add(apron);
  // 围裙的系带
  var apronTie = new THREE.Mesh(new THREE.TorusGeometry(0.252, 0.018, 5, 20), M.gauze);
  apronTie.rotation.x = Math.PI / 2;
  apronTie.position.y = 0.46;
  apronTie.scale.z = 0.84;
  torso.add(apronTie);
  // 围裙下缘的血滴
  [[0.12, -0.5], [-0.08, -0.52], [0.22, -0.47]].forEach(function (p, i) {
    var drip = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.14 + i * 0.06, 6), M.blood);
    drip.position.set(p[0], p[1], 0.26 - i * 0.045);
    drip.rotation.x = Math.PI;
    torso.add(drip);
  });

  // 腰间的钥匙串 + 束缚带
  var keyRing = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.008, 5, 10), M.steel);
  keyRing.position.set(0.2, 0.02, 0.19);
  keyRing.rotation.y = 0.4;
  torso.add(keyRing);
  for (var ki = 0; ki < 3; ki++) {
    var key = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.055, 0.008), M.steel);
    key.position.set(0.185 + ki * 0.014, -0.03, 0.2);
    key.rotation.z = 0.2 - ki * 0.2;
    torso.add(key);
  }
  var strap = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.34, 0.014), M.gauze);
  strap.position.set(-0.19, -0.1, 0.2);
  strap.rotation.z = -0.12;
  torso.add(strap);
  var buckle = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.03, 0.02), M.steelDark);
  buckle.position.set(-0.2, -0.28, 0.205);
  torso.add(buckle);

  // 腰间挂着的拖尸铁钩：钩尖发暗，挂着一条干掉的黑血
  var hookRing = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.006, 5, 10), M.steel);
  hookRing.position.set(0.24, 0.02, 0.2);
  torso.add(hookRing);
  var hookLink = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.007, 5, 10), M.steelDark);
  hookLink.position.set(0.245, -0.04, 0.19);
  hookLink.rotation.x = 0.35;
  torso.add(hookLink);
  var hookArc = new THREE.Mesh(new THREE.TorusGeometry(0.038, 0.009, 6, 12, Math.PI * 1.4), M.steelDark);
  hookArc.position.set(0.245, -0.12, 0.19);
  hookArc.rotation.z = -0.9;
  torso.add(hookArc);
  var hookTip = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.055, 6), M.steelDark);
  hookTip.position.set(0.275, -0.175, 0.19);
  hookTip.rotation.z = -2.2;
  torso.add(hookTip);
  var hookBlood = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.05, 5), M.blood);
  hookBlood.position.set(0.272, -0.21, 0.19);
  hookBlood.rotation.x = Math.PI;
  torso.add(hookBlood);

  // 肩上的尸袋（斜背）
  var bag = new THREE.Mesh(S.capsule(0.15, 0.7, 10, 4), bagMat);
  bag.position.set(0.02, 0.34, -0.22);
  bag.rotation.z = 0.62;
  bag.rotation.x = 0.1;
  bag.scale.set(1, 1, 0.82);
  hcShadow(bag);
  torso.add(bag);
  var bagStrap = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.9, 0.02), bagMat);
  bagStrap.position.set(-0.02, 0.32, 0.2);
  bagStrap.rotation.z = 0.55;
  torso.add(bagStrap);

  // ---------------- 手臂 ----------------
  function buildArm(side) {
    var arm = new THREE.Group();
    arm.position.set(side * 0.272, 1.52, 0);
    // 肩头用刷手服包一层：只留小臂露皮肤，否则肩上是两个"肉球"
    var cap2 = new THREE.Mesh(new THREE.SphereGeometry(0.098, 12, 10), scrubMat);
    cap2.scale.set(1, 0.92, 0.95);
    hcShadow(cap2);
    arm.add(cap2);
    var upper = new THREE.Mesh(S.capsule(0.078, 0.26, 10, 4), M.skin);
    upper.position.y = -0.2;
    hcShadow(upper);
    arm.add(upper);
    var elbow = new THREE.Mesh(new THREE.SphereGeometry(0.072, 10, 8), M.skin);
    elbow.position.y = -0.34;
    arm.add(elbow);
    var fore = new THREE.Mesh(S.capsule(0.062, 0.26, 10, 4), M.skin);
    fore.position.y = -0.5;
    hcShadow(fore);
    arm.add(fore);
    // 长筒橡胶手套
    var cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.066, 0.08, 10), M.glove);
    cuff.position.y = -0.64;
    arm.add(cuff);
    var glove = new THREE.Mesh(S.capsule(0.062, 0.14, 10, 4), M.glove);
    glove.position.y = -0.72;
    hcShadow(glove);
    arm.add(glove);

    arm.userData.hand = new THREE.Group();
    arm.userData.hand.position.y = -0.82;
    arm.add(arm.userData.hand);
    return arm;
  }
  var armL = buildArm(-1), armR = buildArm(1);
  g.add(armL, armR);

  // 左手：手电筒（灯头 = visual.core）
  var torch = new THREE.Group();
  var torchBody = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.038, 0.24, 10), bagMat);
  torchBody.rotation.x = Math.PI / 2;
  torchBody.position.z = 0.06;
  torch.add(torchBody);
  var torchHead = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.045, 0.07, 12), M.steelDark);
  torchHead.rotation.x = Math.PI / 2;
  torchHead.position.z = 0.2;
  torch.add(torchHead);
  var torchLens = new THREE.Mesh(new THREE.CircleGeometry(0.05, 14), lensMat);
  torchLens.position.z = 0.236;
  torch.add(torchLens);
  torch.rotation.x = -0.15;
  armL.userData.hand.add(torch);

  // 右手：老式玻璃注射器（药液 = visual.hem）
  var syringe = new THREE.Group();
  var barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.19, 12),
    new THREE.MeshStandardMaterial({
      color: 0xcfe6e0, roughness: 0.12, metalness: 0.05,
      transparent: true, opacity: 0.5
    }));
  barrel.rotation.x = Math.PI / 2;
  barrel.position.z = 0.09;
  syringe.add(barrel);
  var fluid = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.12, 10), fluidMat);
  fluid.rotation.x = Math.PI / 2;
  fluid.position.z = 0.07;
  syringe.add(fluid);
  var plunger = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.14, 8), M.steel);
  plunger.rotation.x = Math.PI / 2;
  plunger.position.z = -0.06;
  syringe.add(plunger);
  var flange = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.012, 12), M.steelDark);
  flange.rotation.x = Math.PI / 2;
  flange.position.z = -0.005;
  syringe.add(flange);
  var needle = new THREE.Mesh(new THREE.ConeGeometry(0.006, 0.11, 6), M.steel);
  needle.rotation.x = Math.PI / 2;
  needle.position.z = 0.24;
  syringe.add(needle);
  syringe.rotation.x = -0.35;
  armR.userData.hand.add(syringe);

  // ---------------- 脖子 + 头 ----------------
  var neck = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.1, 10), M.skin);
  neck.position.set(0, 1.6, 0.01);
  g.add(neck);

  var head = new THREE.Group();
  head.position.set(0, 1.76, 0.015);
  head.rotation.x = 0.1;
  g.add(head);

  var skull = new THREE.Mesh(S.ellipsoid(0.132, 0.155, 0.14, 16), M.skin);
  hcShadow(skull);
  head.add(skull);
  // 剃光的头顶（更亮一点）
  var crown = new THREE.Mesh(new THREE.SphereGeometry(0.133, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.45), M.skin);
  crown.position.y = 0.028;
  crown.scale.set(1, 1.1, 1.02);
  head.add(crown);
  // 下颌 + 耳
  var jaw = new THREE.Mesh(S.ellipsoid(0.108, 0.082, 0.115, 12), M.skin);
  jaw.position.set(0, -0.112, 0.015);
  head.add(jaw);
  [-1, 1].forEach(function (s3) {
    var ear = new THREE.Mesh(S.ellipsoid(0.024, 0.046, 0.032, 8), M.skin);
    ear.position.set(s3 * 0.128, 0.0, 0.0);
    head.add(ear);
  });
  // 浓眉（压低，显得阴沉）
  var brow = new THREE.Mesh(S.roundedBox(0.21, 0.032, 0.05, 0.012, 2), VX.materials.std(0x3a3229, { rough: 0.9 }));
  brow.position.set(0, 0.058, 0.118);
  head.add(brow);

  // 护目镜：一条带子 + 两片镜片（镜片就是 visual.eyes）
  var goggleStrap = new THREE.Mesh(new THREE.TorusGeometry(0.124, 0.014, 6, 20), bagMat);
  goggleStrap.rotation.x = Math.PI / 2 + 0.12;
  goggleStrap.position.y = 0.022;
  head.add(goggleStrap);
  var eyes = [];
  [-1, 1].forEach(function (s4) {
    var rim = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.03, 14), M.steelDark);
    rim.rotation.x = Math.PI / 2 - 0.12;
    rim.position.set(s4 * 0.055, 0.02, 0.108);
    head.add(rim);
    var lens = new THREE.Mesh(new THREE.CircleGeometry(0.038, 14), eyeMat.clone());
    lens.position.set(s4 * 0.055, 0.022, 0.124);
    lens.rotation.x = -0.12;
    head.add(lens);
    var halo = new THREE.Mesh(new THREE.SphereGeometry(0.062, 12, 10), eyeMat.clone());
    halo.position.copy(lens.position);
    head.add(halo);
    eyes.push({ core: lens, halo: halo });
  });

  // 口罩：挂在脖子/下巴下面（刚摘下来的感觉）
  var mask = new THREE.Mesh(S.roundedBox(0.165, 0.1, 0.05, 0.025, 3), M.gauze);
  mask.position.set(0, -0.15, 0.075);
  mask.rotation.x = 0.55;
  head.add(mask);
  [-1, 1].forEach(function (s5) {
    var earloops = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.005, 4, 10), M.gauze);
    earloops.position.set(s5 * 0.085, -0.12, 0.03);
    earloops.rotation.y = Math.PI / 2;
    head.add(earloops);
  });
  // 下巴上的胡茬 / 血
  var chinBlood = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.05), bloodPlaneMat(34));
  chinBlood.position.set(0.02, -0.095, 0.108);
  head.add(chinBlood);

  // 左颊一道缝合疤：缝得很潦草，线头还挂着
  var oSuture = VX.materials.std(0x3d2828, { rough: 0.92 });
  var cheekScar = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.06, 0.01), oSuture);
  cheekScar.position.set(-0.08, -0.005, 0.122);
  cheekScar.rotation.z = 0.35;
  head.add(cheekScar);
  [0.02, -0.018].forEach(function (dy) {
    var tickS = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.005, 0.008), oSuture);
    tickS.position.set(-0.08, -0.005 + dy, 0.124);
    tickS.rotation.z = dy > 0 ? 1.15 : 1.95;
    head.add(tickS);
  });
  // 顺眼角淌下来的一道旧血
  var faceBlood = new THREE.Mesh(new THREE.PlaneGeometry(0.022, 0.1), bloodPlaneMat(37));
  faceBlood.position.set(0.062, 0.01, 0.12);
  faceBlood.rotation.z = -0.15;
  head.add(faceBlood);

  // ---------------- 手电筒光斑（原来脚下那圈暗影盘） ----------------
  var pool = new THREE.Mesh(new THREE.CircleGeometry(1.15, 28), VX.materials.glow(0xffc46a, 0.2, true));
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(0, 0.03, 0.85);       // 光斑落在身前，像手电筒照出来的
  pool.scale.set(0.85, 1, 1.15);
  pool.material.toneMapped = false;
  g.add(pool);
  // 手电筒的光柱（很淡的锥体，暗示"光在扫"）
  var beam = new THREE.Mesh(
    new THREE.ConeGeometry(0.62, 2.2, 16, 1, true),
    VX.materials.glow(0xffc46a, 0.06, true)
  );
  beam.rotation.x = -Math.PI / 2;
  beam.position.set(0, 0.42, 1.14);
  beam.material.toneMapped = false;
  g.add(beam);

  // ---------------- 程序化动画（挂在会被渲染的 mesh 上） ----------------
  // Group 不进渲染列表，onBeforeRender 不会触发，必须挂 Mesh。
  apron.onBeforeRender = function () {
    if (typeof clock === 'undefined' || !clock) return;
    var tm = clock.elapsedTime;
    // 抓捕前扑动画：0.7 秒，双臂猛地前伸（capturePlayer 触发）
    if (g.__grab > 0) {
      g.__grab -= (tm - (g.__lastTm || tm));
      var gp = Math.max(0, g.__grab) / 0.7;
      var gk = Math.sin((1 - gp) * Math.PI);
      armL.rotation.x = -0.62 - gk * 0.75;
      armR.rotation.x = -0.25 - gk * 0.95;
      armL.rotation.z = 0.1 - gk * 0.25;
      armR.rotation.z = -0.12 + gk * 0.25;
      torso.rotation.x = 0.05 + gk * 0.3;
      head.rotation.x = 0.1 + gk * 0.25;
      g.__lastTm = tm;
      return;
    }
    g.__lastTm = tm;
    var walk = (g.userData && g.userData.walkPhase) || 0;
    var sw = Math.sin(walk);

    // 沉重的步伐
    legL.rotation.x = sw * 0.42;
    legR.rotation.x = -sw * 0.42;
    legL.rotation.z = 0.02;
    legR.rotation.z = -0.02;

    // 左手一直举着手电（前伸），右手拿注射器随步伐轻晃
    armL.rotation.x = -0.62 + Math.sin(tm * 1.5) * 0.05;
    armL.rotation.z = 0.1;
    armR.rotation.x = -0.25 - sw * 0.28;
    armR.rotation.z = -0.12;

    // 躯干起伏
    torso.position.y = 1.02 + Math.abs(sw) * 0.03;
    torso.rotation.z = sw * 0.02;

    // 头：左右缓慢扫视（在找人）
    head.rotation.y = Math.sin(tm * 0.75) * 0.3;
    head.rotation.x = 0.1 + Math.sin(tm * 1.6) * 0.04;

    // 光斑/光柱随呼吸微微明灭
    var pulse = 0.75 + Math.sin(tm * 2.4) * 0.25;
    if (beam.material) beam.material.opacity = 0.04 + pulse * 0.03;
  };

  // 抓捕动画钩子（capturePlayer 时由 ChaserSystem.js 调用）
  g.__creatureGrab = function () {
    g.__grab = 0.7;
    if (typeof clock !== 'undefined' && clock) g.__lastTm = clock.elapsedTime;
  };

  // ---------------- visual 契约 ----------------
  g.userData.visual = {
    eyes: eyes,
    core: torchLens,
    disc: pool,
    hem: fluid,
    baseEyeColor: 0xffb347,
    baseTrimColor: 0x6cff9a
  };

  return g;
}

// ============================================================
// 入口：按 t.model 分发；不是医院怪物就返回 null（走通用造型）
// ============================================================
function buildHospitalCreature(t) {
  if (!t || !t.model) return null;
  var g = null;
  try {
    if (t.model === 'surgeon') g = hcBuildSurgeon(t);
    else if (t.model === 'patient') g = hcBuildPatient(t);
    else if (t.model === 'ghost') g = hcBuildGhost(t);
  } catch (e) {
    console.error('[HospitalCreatures] 建模失败，回退通用造型:', t.model, e && e.message);
    return null;
  }
  // 兼容：万一某个建模函数把动画写在了 userData.tick 上，这里补一次
  if (g && !g.__creatureTick && g.userData && g.userData.tick) g.__creatureTick = g.userData.tick;
  return g;
}

// ============================================================
// 医院怪物的主题化攻击特效（替代通用爪击斩线）
// ------------------------------------------------------------
// 由 game-combat.js 的 createMonsterAttackEffect 调用。
// 返回 true = 已处理（调用方不再追加通用特效）。
//   主刀医生：钢色锯弧横扫 + 血色斩线 + 血点骨屑 + 重震屏
//   疯魔病人：五道乱爪血痕 + 皮屑血点
//   邪恶幽灵：走远程弹丸，近战特效不会走到这里（防御性返回 true）
// ============================================================
function hospitalAttackFX(m) {
  if (!m || !m.userData || !m.userData.type) return false;
  var model = m.userData.type.model;
  if (model !== 'surgeon' && model !== 'patient' && model !== 'ghost') return false;
  if (model === 'ghost') return true;   // 幽灵是远程怪，弹丸自带特效
  if (!window.VX || !VX.vfx) return true;

  var t = m.userData.type;
  var dir = new THREE.Vector3().subVectors(player.position, m.position);
  dir.y = 0;
  if (dir.lengthSq() < 0.0001) dir.set(0, 0, 1);
  dir.normalize();
  var scale = t.scale || 1;
  var mid = new THREE.Vector3().addVectors(m.position, player.position).multiplyScalar(0.5);
  mid.y += 1.0 * scale;

  if (model === 'surgeon') {
    // 骨锯横扫：一道钢灰色月牙 + 底下的血色爪痕，最后甩出一片血点
    VX.vfx.slash(mid, dir, 0xcfd8dc, { radius: 2.0 * scale, arc: 2.5, life: 0.3 });
    VX.vfx.slashLines(mid, dir, 0x8a1410, { count: 3, length: 1.9 * scale, spread: 0.3 * scale });
    VX.vfx.impact(mid, 0x7a100c, {
      scale: 0.9, chipColor: 0x5a0e0c, chipCount: 8,
      streakCount: 5, groundRing: false
    });
    VX.vfx.shake(0.14, 0.3);
  } else {
    // 疯魔病人：五道乱爪，又快又脏
    VX.vfx.slashLines(mid, dir, 0x9b1a12, { count: 5, length: 1.5 * scale, spread: 0.42 * scale });
    VX.vfx.impact(mid, 0x6e120e, {
      scale: 0.75, chipColor: 0x4a0c0a, chipCount: 6,
      streakCount: 4, groundRing: false
    });
    VX.vfx.shake(0.09, 0.22);
  }
  return true;
}

// ============================================================
// 导出
// ============================================================
window.buildHospitalCreature = buildHospitalCreature;
window.buildHospitalOrderly = hcBuildOrderly;
window.hospitalAttackFX = hospitalAttackFX;
window.HC_MODELS = { surgeon: true, patient: true, ghost: true };
