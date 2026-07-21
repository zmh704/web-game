// ============================================================
// 怪物系统 - 多种类怪物 + 章节 Boss
// ============================================================

// 参数化怪物模型构建
function buildMonsterMesh(t) {
  var g = new THREE.Group();

  var bodyMat = new THREE.MeshStandardMaterial({
    color: t.color, roughness: 0.6, metalness: 0.3,
    emissive: t.emissive, emissiveIntensity: 0.15
  });
  var body = new THREE.Mesh(new THREE.SphereGeometry(0.85, 16, 16), bodyMat);
  body.position.y = 0.8; body.castShadow = true; g.add(body);

  var stripeMat = new THREE.MeshStandardMaterial({ color: 0x440000, roughness: 0.5, transparent: true, opacity: 0.45 });
  for (var si = 0; si < 5; si++) {
    var stripe = new THREE.Mesh(new THREE.TorusGeometry(0.6 + si * 0.05, 0.025, 6, 16), stripeMat);
    stripe.position.y = 0.5 + si * 0.15; stripe.rotation.x = Math.PI / 2; g.add(stripe);
  }

  var eyeCount = t.eyes || 2;
  for (var ei = 0; ei < eyeCount; ei++) {
    var a = (ei - (eyeCount - 1) / 2) * 0.55;
    var ex = Math.sin(a) * 0.55;
    var ez = Math.cos(a) * 0.55;
    var ey = 0.9 + (ei % 3) * 0.1;
    var eyeWhite = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 8), new THREE.MeshStandardMaterial({ color: 0xddbbbb }));
    eyeWhite.position.set(ex, ey, ez); g.add(eyeWhite);
    var pupilMat = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 0.6 });
    var pupil = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 0.02), pupilMat);
    pupil.position.set(ex * 1.05, ey, ez * 1.05); g.add(pupil);
    var highlight = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 6), new THREE.MeshBasicMaterial({ color: 0xff6666 }));
    highlight.position.set(ex * 1.1, ey + 0.03, ez * 1.1); g.add(highlight);
    for (var vs = 0; vs < 2; vs++) {
      var vein = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.06, 0.01), new THREE.MeshBasicMaterial({ color: 0xcc3333, transparent: true, opacity: 0.5 }));
      vein.position.set(ex + ((Math.random() - 0.5) * 0.12), ey + 0.03 + Math.random() * 0.08, ez * 1.08);
      vein.rotation.z = (Math.random() - 0.5) * 0.4;
      g.add(vein);
    }
  }

  if (t.fangs) {
    var mMat = new THREE.MeshStandardMaterial({ color: 0x440000, roughness: 0.9 });
    var m = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), mMat);
    m.position.set(0, 0.48, 0.78); g.add(m);
    var fangMat = new THREE.MeshStandardMaterial({ color: 0xeeddcc, roughness: 0.3 });
    [-0.1, 0.1].forEach(function (fx) {
      var fang = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.12, 4), fangMat);
      fang.position.set(fx, 0.42, 0.82);
      fang.rotation.x = 0.35; fang.rotation.z = fx * 2.5;
      g.add(fang);
    });
  }

  var antennaMat = new THREE.MeshStandardMaterial({ color: 0x330011, roughness: 0.7 });
  [[-0.3, 1.3, 0.2], [0.3, 1.3, 0.2]].forEach(function (p) {
    var stem = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.35, 5), antennaMat);
    stem.position.set(p[0], p[1], p[2]); stem.rotation.x = -0.3; g.add(stem);
    var bulb = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), new THREE.MeshStandardMaterial({ color: 0xff2200, emissive: 0xff0000, emissiveIntensity: 0.5 }));
    bulb.position.set(p[0] - 0.04, p[1] + 0.22, p[2] - 0.04);
    g.add(bulb);
  });

  if (t.spikes) {
    var spikeMat = new THREE.MeshStandardMaterial({ color: t.emissive, roughness: 0.4, emissive: t.emissive, emissiveIntensity: 0.2 });
    for (var sk = 0; sk < 4; sk++) {
      var spike = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.35, 6), spikeMat);
      spike.position.set(0, 1.35 + sk * 0.05, -0.15 - sk * 0.2);
      spike.rotation.x = -0.5 - sk * 0.15;
      g.add(spike);
    }
  }

  if (t.fly) {
    var wingMat = new THREE.MeshBasicMaterial({ color: t.color, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
    [-1, 1].forEach(function (side) {
      var wing = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.45), wingMat);
      wing.position.set(side * 0.75, 1.0, -0.1);
      wing.rotation.y = side * 0.4;
      wing.rotation.z = side * 0.25;
      g.add(wing);
    });
  }

  var legPositions = t.fly ? [[-0.4, 0.2, 0.4], [0.4, 0.2, 0.4], [-0.4, 0.2, -0.4], [0.4, 0.2, -0.4]] : [
    [-0.5, 0.3, 0.5], [-0.5, 0.3, -0.5],
    [0.5, 0.3, 0.5], [0.5, 0.3, -0.5],
    [-0.3, 0.15, 0.7], [0.3, 0.15, 0.7]
  ];
  var legMat = new THREE.MeshStandardMaterial({ color: t.color, roughness: 0.6 });
  legPositions.forEach(function (p, idx) {
    var legGroup = new THREE.Group();
    var upperLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.25, 6), legMat);
    upperLeg.position.y = 0.125; legGroup.add(upperLeg);
    var lowerLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.22, 6), legMat);
    lowerLeg.position.set(0, -0.12, -0.15); lowerLeg.rotation.x = 0.5; legGroup.add(lowerLeg);
    var claw = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), new THREE.MeshStandardMaterial({ color: t.emissive, roughness: 0.5 }));
    claw.position.set(0.02, -0.25, -0.25); legGroup.add(claw);
    legGroup.position.set(p[0], p[1], p[2]);
    legGroup.rotation.z = idx % 2 === 0 ? 0.5 : -0.5;
    g.add(legGroup);
  });

  var tailMat = new THREE.MeshStandardMaterial({ color: t.color, roughness: 0.6 });
  for (var ti = 0; ti < 5; ti++) {
    var tSeg = new THREE.Mesh(new THREE.SphereGeometry(0.05 + ti * 0.01, 6, 6), tailMat);
    tSeg.position.set(0, 0.3 + ti * 0.12, -0.6 - ti * 0.15); g.add(tSeg);
  }
  var tailTip = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), new THREE.MeshStandardMaterial({ color: 0xffd700, emissive: 0xffd700, emissiveIntensity: 0.5 }));
  tailTip.position.set(0, 0.78, -1.2); g.add(tailTip);

  var glowSphere = new THREE.Mesh(
    new THREE.SphereGeometry(1.1, 12, 12),
    new THREE.MeshBasicMaterial({ color: t.emissive, transparent: true, opacity: 0.08, side: THREE.DoubleSide })
  );
  glowSphere.position.y = 0.8; g.add(glowSphere);

  return g;
}

function currentChapterData() { return CHAPTERS[GS.chapter - 1] || CHAPTERS[0]; }

// ============================================================
// 时间增强：怪物随游戏时长缓慢变强（替代旧的击杀数增强）
// ============================================================
function timeScale() {
  var minutes = (clock && clock.elapsedTime || 0) / 60;
  return Math.min(1 + minutes * 0.08, 1.5);
}

// 按时间系数放大怪物类型数值（返回克隆，不修改原始数据）
function scaleMonsterType(t) {
  var s = timeScale();
  var scaled = {};
  for (var k in t) scaled[k] = t[k];
  scaled.hp = Math.ceil((t.hp || 100) * s);
  scaled.dmg = Math.ceil((t.dmg || 10) * s);
  scaled.speed = (t.speed || 2) * Math.min(s, 1.3); // 速度增幅上限低一些，避免追不上
  return scaled;
}

// ============================================================
// 能量碎片掉落物（击杀小怪掉落，拾取2个合成1点能量）
// ============================================================
var fragmentDrops = [];

function spawnFragmentDrop(pos) {
  var g = new THREE.Group();
  var core = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.22),
    new THREE.MeshStandardMaterial({ color: 0x44ddff, emissive: 0x44ddff, emissiveIntensity: 0.7, transparent: true, opacity: 0.9 })
  );
  g.add(core);
  var glow = new THREE.Mesh(
    new THREE.SphereGeometry(0.4, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0x44ddff, transparent: true, opacity: 0.15, side: THREE.DoubleSide })
  );
  g.add(glow);
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
  m.userData.active = false;
  var isBoss = m.userData.isBoss;

  // 击败获得星星奖励
  GS.stars += isBoss ? 100 : 50;
  GS.killCount = (GS.killCount || 0) + 1;

  if (isBoss) {
    // Boss一次性击杀：直接获得1点能量，不再复活
    showMessage('🏆 击败了 ' + m.userData.type.name + '! 获得能量!', 0xffd700);
    gainEnergy(1);
  } else {
    // 小怪：死亡位置掉落能量碎片
    showMessage('🎉 怪物被击败! 掉落了能量碎片!', 0x44ff88);
    spawnFragmentDrop(m.position.clone());
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

      if (!isBoss) {
        // 小怪一分钟后重新刷新；Boss不复活
        m.userData.respawnTimer = 60;
        m.userData.deathTime = clock.elapsedTime;
      }
    }
  }, 50);
}
