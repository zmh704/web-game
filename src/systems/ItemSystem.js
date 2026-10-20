// ============================================================
// ItemSystem - All item/chest logic
// ============================================================

var items = [];
var normalChests = [];

var ITEM_TYPES = [
  {
    id: 'hpPotion', name: '生命药水', icon: '❤️', color: 0xff4488,
    desc: '恢复35%生命值（至少30点）',
    apply: function () {
      // 百分比回血：后期血量上限到 200+ 时，固定 +30 会几乎没有意义
      var it = (typeof BALANCE !== 'undefined' && BALANCE.items) ? BALANCE.items : {};
      var maxHp = GS.maxHp + (GS.maxHpBonus || 0) + (GS.levelHpBonus || 0);
      var heal = Math.max(it.potionHealMin || 30, Math.round(maxHp * (it.potionHealPct || 0.35)));
      heal = Math.min(heal, maxHp - GS.hp);
      GS.hp = Math.min(maxHp, GS.hp + heal);
      showMessage('❤️ 生命药水! 恢复 ' + heal + ' 点生命', 0xff4488);
    }
  },
  {
    id: 'speedBoots', name: '急速之靴', icon: '👢', color: 0x44ddff,
    desc: '移动速度+1.5',
    apply: function () {
      var it = (typeof BALANCE !== 'undefined' && BALANCE.items) ? BALANCE.items : {};
      GS.moveSpeedBonus = (GS.moveSpeedBonus || 0) + (it.bootsSpeed || 1.5);
      showMessage('👢 急速之靴! 速度+' + GS.moveSpeedBonus.toFixed(1), 0x44ddff);
    }
  },
  {
    id: 'weapon', name: '武器', icon: '⚔️', color: 0xff8800,
    desc: '随机获得一把新武器（20发子弹，捆仙绳仅1次）',
    apply: function () {
      var lockedW = REWARD_WEAPON_LIST.filter(function (n) { return !GS.weapons[n] });
      if (lockedW.length > 0) {
        var wn = lockedW[Math.floor(Math.random() * lockedW.length)];
        GS.weapons[wn] = WEAPONS[wn];
        GS.weaponAmmo[wn] = WEAPONS[wn].type === 'rope' ? 1 : ((BALANCE.items && BALANCE.items.ammoPerPickup) || 30); // 捆仙绳一次性
        GS.weaponCount++;
        if (!GS.curWeapon) GS.curWeapon = wn;
        updateWeaponBar();
        showMessage('⚔️ 获得武器: ' + wn + (WEAPONS[wn].type === 'rope' ? ' (1次)' : ' (' + GS.weaponAmmo[wn] + '发)'), 0xff8800);
        createWeaponGetEffect();
      } else {
        // 已拥有全部武器，捡到重置子弹
        var ownedW = REWARD_WEAPON_LIST.filter(function (n) { return GS.weapons[n] });
        if (ownedW.length > 0) {
          var wn = ownedW[Math.floor(Math.random() * ownedW.length)];
          GS.weaponAmmo[wn] = WEAPONS[wn].type === 'rope' ? 1 : ((BALANCE.items && BALANCE.items.ammoPerPickup) || 30);
          GS.curWeapon = wn;
          updateWeaponBar();
          showMessage('⚔️ 弹药重置: ' + wn, 0xff8800);
        } else {
          GS.stars += 20;
          showMessage('⭐ +20星', 0xffd700);
        }
      }
    }
  },
  {
    id: 'atkGem', name: '攻击宝石', icon: '💎', color: 0xff3333,
    desc: '攻击力+10，攻击速度提升',
    apply: function () {
      var it = (typeof BALANCE !== 'undefined' && BALANCE.items) ? BALANCE.items : {};
      GS.atkBonus = (GS.atkBonus || 0) + (it.atkGemAtk || 10);
      GS.atkSpeedBonus = (GS.atkSpeedBonus || 0) + (it.atkGemAtkSpeed || 0.05);
      showMessage('💎 攻击宝石! 攻击力+' + (it.atkGemAtk || 10) + ', 攻速提升', 0xff3333);
    }
  },
  {
    id: 'defGem', name: '防御宝石', icon: '🛡️', color: 0x4488ff,
    desc: '血量上限+20，防御+5',
    apply: function () {
      var it = (typeof BALANCE !== 'undefined' && BALANCE.items) ? BALANCE.items : {};
      var addHp = it.defGemHp || 20;
      GS.maxHpBonus = (GS.maxHpBonus || 0) + addHp;
      GS.defBonus = (GS.defBonus || 0) + (it.defGemDef || 5);
      // 加血上限时同步回一点血，否则玩家会看到"血量没变多"
      GS.hp = Math.min(GS.maxHp + GS.maxHpBonus + (GS.levelHpBonus || 0), GS.hp + addHp);
      showMessage('🛡️ 防御宝石! 血量上限+' + addHp + ', 防御+' + (it.defGemDef || 5), 0x4488ff);
    }
  },
  {
    id: 'chest', name: '普通宝盒', icon: '🎁', color: 0xaa77ff,
    desc: '答题解锁：随机1-3个能量碎片+1件武器',
    isChest: true,
    apply: function () { } // 宝盒不即时生效，走答题流程
  },
  {
    id: 'flashlight', name: '手电筒', icon: '🔦', color: 0xffff44,
    desc: '开启手电筒增加视线距离',
    apply: function () {
      GS.hasFlashlight = true;
      showMessage('🔦 获得手电筒! 按F开启', 0xffff44);
      if (!flashlightActive && flashlightCooldown <= 0) {
        toggleFlashlight();
      }
    }
  },
  {
    id: 'fragment', name: '能量碎片', icon: '💠', color: 0xffd700,
    desc: '获得1个能量碎片（2个合成1点能量）',
    apply: function () {
      gainFragment();
      showMessage('💠 获得能量碎片! (' + (GS.fragments || 0) + '/2)', 0xffd700);
    }
  }
];

// 生成漂浮道具的3D模型
// 视觉规则：物件本身精修 + 底部能量光环 + 轻微自发光，保证一眼可辨识
function _itemBase(g, color, radius) {
  var S = VX.shape, M = VX.materials;
  var ring = new THREE.Mesh(S.ring(radius * 0.82, radius, 30), M.glow(color, 0.58, true));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.015;
  g.add(ring);

  var ring2 = new THREE.Mesh(S.ring(radius * 1.12, radius * 1.2, 30), M.glow(color, 0.24, true));
  ring2.rotation.x = -Math.PI / 2;
  ring2.position.y = 0.012;
  g.add(ring2);

  // 光环自转（不依赖 userData，避免被外部覆盖后失效）
  g.onBeforeRender = function () {
    if (typeof clock === 'undefined' || !clock) return;
    var tm = clock.elapsedTime;
    ring.rotation.z = tm * 0.9;
    ring2.rotation.z = -tm * 0.55;
    var pulse = 1 + Math.sin(tm * 2.4) * 0.06;
    ring.scale.set(pulse, pulse, pulse);
  };
  return g;
}

function buildItemMesh(itemType) {
  var S = VX.shape, M = VX.materials;
  var g = new THREE.Group();
  var color = itemType.color;

  // ---------------- 普通宝盒 ----------------
  if (itemType.id === 'chest') {
    var boxMat = M.std(0x8f63d8, { rough: 0.46, metal: 0.12, emissive: 0x5b34b0, emissiveIntensity: 0.22 });
    var lidMat = M.std(0x7a4fc4, { rough: 0.42, metal: 0.14 });
    var trimMat = M.std(0xd7a8ff, { rough: 0.24, metal: 0.45, emissive: 0x9a5cff, emissiveIntensity: 0.35 });
    var goldMat = M.metal(0xffd166);

    var body = new THREE.Mesh(S.roundedBox(0.64, 0.4, 0.46, 0.055, 3), boxMat);
    body.position.y = 0.22;
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);

    // 拱形盖
    var lid = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.64, 14, 1, false, 0, Math.PI), lidMat);
    lid.rotation.z = Math.PI / 2;
    lid.position.y = 0.42;
    lid.castShadow = true;
    g.add(lid);

    // 金属包边（两道竖向）
    [-0.2, 0.2].forEach(function (bx) {
      var band = new THREE.Mesh(S.roundedBox(0.06, 0.66, 0.5, 0.02, 2), trimMat);
      band.position.set(bx, 0.3, 0);
      g.add(band);
    });

    // 锁扣 + 竖长钥匙孔
    var lock = new THREE.Mesh(S.roundedBox(0.11, 0.13, 0.05, 0.022, 2), goldMat);
    lock.position.set(0, 0.34, 0.245);
    g.add(lock);
    var keyholeDot = new THREE.Mesh(new THREE.CircleGeometry(0.018, 10), M.std(0x2e1c0c, { rough: 0.85 }));
    keyholeDot.position.set(0, 0.355, 0.272);
    g.add(keyholeDot);
    var keyholeSlot = new THREE.Mesh(S.roundedBox(0.014, 0.05, 0.01, 0.005, 2), M.std(0x2e1c0c, { rough: 0.85 }));
    keyholeSlot.position.set(0, 0.325, 0.272);
    g.add(keyholeSlot);
    // 顶部铆钉，压住"脸"的联想
    [-0.19, 0.19].forEach(function (rx) {
      var rivet = new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 8), trimMat);
      rivet.position.set(rx, 0.36, 0.235);
      g.add(rivet);
    });

    // 缝隙发光
    var seam = new THREE.Mesh(S.roundedBox(0.56, 0.022, 0.02, 0.008, 2), M.glow(0xc79bff, 0.7, true));
    seam.position.set(0, 0.405, 0.232);
    g.add(seam);

    // 底部磁悬浮光环
    _itemBase(g, 0xb98cff, 0.46);
    return g;
  }

  // ---------------- 武器：发光的短剑 ----------------
  if (itemType.id === 'weapon') {
    var bladeMat = M.std(0xdfe8ff, { rough: 0.16, metal: 0.55, emissive: 0x4d8fff, emissiveIntensity: 0.28 });
    var edgeMat = M.glow(0x9fd0ff, 0.85, true);
    var gripMat = M.std(0x8a5a30, { rough: 0.8, map: M.wood() });
    var goldMat2 = M.metal(0xffd166);

    // 刃身：中间厚、两边发光
    var blade = new THREE.Mesh(S.roundedBox(0.115, 0.7, 0.032, 0.016, 2), bladeMat);
    blade.position.y = 0.5;
    blade.castShadow = true;
    g.add(blade);

    var tip = new THREE.Mesh(new THREE.ConeGeometry(0.062, 0.2, 4), bladeMat);
    tip.position.y = 0.92;
    tip.rotation.y = Math.PI / 4;
    g.add(tip);

    [-0.04, 0.04].forEach(function (ex) {
      var edge = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.68, 0.014), edgeMat);
      edge.position.set(ex * 1.35, 0.5, 0);
      g.add(edge);
    });

    // 护手
    var guard = new THREE.Mesh(S.roundedBox(0.34, 0.055, 0.08, 0.026, 3), goldMat2);
    guard.position.y = 0.16;
    g.add(guard);
    [-0.16, 0.16].forEach(function (gx) {
      var tipBall = new THREE.Mesh(new THREE.SphereGeometry(0.042, 10, 10), goldMat2);
      tipBall.position.set(gx, 0.155, 0);
      g.add(tipBall);
    });

    // 握柄 + 缠绳
    var grip = new THREE.Mesh(S.capsule(0.035, 0.16, 8, 4), gripMat);
    grip.position.y = 0.03;
    g.add(grip);
    for (var w = 0; w < 3; w++) {
      var wrap = new THREE.Mesh(new THREE.TorusGeometry(0.038, 0.009, 6, 12), M.std(0x5a3820, { rough: 0.9 }));
      wrap.position.y = -0.01 + w * 0.045;
      wrap.rotation.x = Math.PI / 2;
      g.add(wrap);
    }

    // 柄尾宝石
    var pommel = new THREE.Mesh(S.crystal(0.06), M.std(0x5aa8ff, { rough: 0.15, emissive: 0x2f7fff, emissiveIntensity: 0.8 }));
    pommel.position.y = -0.1;
    g.add(pommel);

    _itemBase(g, 0x6fb0ff, 0.4);
    return g;
  }

  // ---------------- 能量碎片 ----------------
  if (itemType.id === 'fragment') {
    var crystal = new THREE.Mesh(S.crystal(0.3), M.std(0xffd166, {
      rough: 0.12, metal: 0.25, transparent: true, opacity: 0.94,
      emissive: 0xffb300, emissiveIntensity: 1.0
    }));
    crystal.position.y = 0.28;
    crystal.castShadow = true;
    g.add(crystal);

    // 内部核心
    var inner = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 12), M.glow(0xfff3c0, 0.38, true));
    inner.position.y = 0.28;
    g.add(inner);

    // 环绕的碎光环
    for (var r = 0; r < 2; r++) {
      var orbit = new THREE.Mesh(S.ring(0.3 + r * 0.12, 0.34 + r * 0.12, 26), M.glow(0xffd166, 0.28 - r * 0.1, true));
      orbit.rotation.x = -Math.PI / 2 + (r ? 0.5 : 0);
      orbit.position.y = 0.28;
      g.add(orbit);
    }

    var halo = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 10), M.glow(0xffc233, 0.07, true));
    halo.position.y = 0.28;
    g.add(halo);

    _itemBase(g, 0xffc233, 0.32);
    return g;
  }

  // ---------------- 药水 ----------------
  if (itemType.id === 'hpPotion') {
    var glassMat = M.std(0xffffff, { rough: 0.08, metal: 0.05, transparent: true, opacity: 0.42 });
    var liquidMat = M.std(0xff4d6d, { rough: 0.2, emissive: 0xff2d55, emissiveIntensity: 0.55, transparent: true, opacity: 0.92 });

    var flask = new THREE.Mesh(new THREE.SphereGeometry(0.19, 16, 14), glassMat);
    flask.position.y = 0.24;
    flask.scale.y = 1.05;
    g.add(flask);

    var liquid = new THREE.Mesh(new THREE.SphereGeometry(0.155, 14, 12), liquidMat);
    liquid.position.y = 0.21;
    liquid.scale.y = 0.92;
    g.add(liquid);

    var neckM = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.085, 0.14, 12), glassMat);
    neckM.position.y = 0.43;
    g.add(neckM);

    var cork = new THREE.Mesh(S.roundedBox(0.1, 0.09, 0.1, 0.02, 2), M.std(0xa9743f, { rough: 0.9 }));
    cork.position.y = 0.52;
    g.add(cork);

    // 十字标
    var crossV = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, 0.01), M.glow(0xffffff, 0.9));
    crossV.position.set(0, 0.25, 0.19);
    g.add(crossV);
    var crossH = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.01), M.glow(0xffffff, 0.9));
    crossH.position.set(0, 0.25, 0.19);
    g.add(crossH);

    _itemBase(g, 0xff4d6d, 0.34);
    return g;
  }

  // ---------------- 急速之靴 ----------------
  if (itemType.id === 'speedBoots') {
    var bootMat = M.std(0x4fc3ff, { rough: 0.45, emissive: 0x1f8fd0, emissiveIntensity: 0.25 });

    var shaft = new THREE.Mesh(S.roundedBox(0.15, 0.24, 0.16, 0.04, 3), bootMat);
    shaft.position.set(0, 0.24, -0.02);
    g.add(shaft);

    var foot = new THREE.Mesh(S.roundedBox(0.17, 0.11, 0.34, 0.05, 3), bootMat);
    foot.position.set(0, 0.1, 0.06);
    g.add(foot);

    var sole = new THREE.Mesh(S.roundedBox(0.18, 0.045, 0.35, 0.02, 2), M.std(0xe8f4ff, { rough: 0.6 }));
    sole.position.set(0, 0.03, 0.06);
    g.add(sole);

    // 翅膀装饰
    [-1, 1].forEach(function (sd) {
      var wing = new THREE.Mesh(new THREE.CircleGeometry(0.1, 10, 0, Math.PI), M.glow(0xbdeaff, 0.6, true));
      wing.position.set(sd * 0.11, 0.3, -0.05);
      wing.rotation.set(0, sd * Math.PI / 2, 0.5);
      g.add(wing);
    });

    _itemBase(g, 0x4fc3ff, 0.34);
    return g;
  }

  // ---------------- 攻击 / 防御宝石 ----------------
  if (itemType.id === 'atkGem' || itemType.id === 'defGem') {
    var isAtk = itemType.id === 'atkGem';
    var gemColor = isAtk ? 0xff5252 : 0x4d8dff;
    var gemMat = M.std(gemColor, {
      rough: 0.08, metal: 0.2, transparent: true, opacity: 0.95,
      emissive: gemColor, emissiveIntensity: 0.55
    });

    var gem = new THREE.Mesh(S.crystal(0.26), gemMat);
    gem.position.y = 0.32;
    gem.rotation.y = Math.PI / 4;
    gem.castShadow = true;
    g.add(gem);

    // 金属爪镶
    for (var pi = 0; pi < 4; pi++) {
      var ang = pi * Math.PI / 2 + Math.PI / 4;
      var prong = new THREE.Mesh(S.capsule(0.018, 0.12, 6, 4), M.metal(0xd9b45a));
      prong.position.set(Math.cos(ang) * 0.22, 0.32, Math.sin(ang) * 0.22);
      prong.rotation.set(Math.sin(ang) * 0.3, 0, -Math.cos(ang) * 0.3);
      g.add(prong);
    }

    var base = new THREE.Mesh(S.ring(0.05, 0.14, 20), M.metal(0xd9b45a));
    base.rotation.x = -Math.PI / 2;
    base.position.y = 0.14;
    g.add(base);

    _itemBase(g, gemColor, 0.34);
    return g;
  }

  // ---------------- 手电筒 ----------------
  if (itemType.id === 'flashlight') {
    var bodyMat = M.std(0x6b7488, { rough: 0.32, metal: 0.28 });
    var headMat = M.std(0x666d7d, { rough: 0.3, metal: 0.4 });

    var body = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.34, 14), bodyMat);
    body.position.y = 0.24;
    body.rotation.x = 0.3;
    g.add(body);

    var head = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.095, 0.14, 14), headMat);
    head.position.set(0, 0.44, 0.06);
    head.rotation.x = 0.3;
    g.add(head);

    var gripRing = new THREE.Mesh(new THREE.TorusGeometry(0.082, 0.018, 6, 14), M.std(0xffc94a, { rough: 0.35, metal: 0.3 }));
    gripRing.position.y = 0.2;
    gripRing.rotation.x = Math.PI / 2;
    g.add(gripRing);

    var lens = new THREE.Mesh(new THREE.CircleGeometry(0.115, 16), M.std(0xfff6c0, {
      rough: 0.1, emissive: 0xffe066, emissiveIntensity: 1.1
    }));
    lens.position.set(0, 0.47, 0.125);
    lens.rotation.x = 0.3;
    g.add(lens);

    var beam = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.5, 14, 1, true), M.glow(0xfff0a0, 0.14, true));
    beam.position.set(0, 0.56, 0.26);
    beam.rotation.x = Math.PI / 2 + 0.3;
    g.add(beam);

    _itemBase(g, 0xffe066, 0.34);
    return g;
  }

  // ---------------- 兜底：发光宝珠 ----------------
  var core = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 12), M.energy(color || 0xffd166, 0.9));
  core.position.y = 0.28;
  g.add(core);
  _itemBase(g, color || 0xffd166, 0.34);
  return g;
}

function spawnItems() {
  items.forEach(function (it) {
    if (it.parent) scene.remove(it);
  });
  items = [];

  ROOMS.forEach(function (rm) {
    spawnItemsInRoom(rm);
  });
}

function spawnItemsInRoom(rm) {
  // 统计房间内现有道具（总数 + 每种类型数量）
  var existingCount = 0;
  var typeCounts = {};
  items.forEach(function (it) {
    if (Math.abs(it.position.x - rm.cx) < roomSize / 2 && Math.abs(it.position.z - rm.cz) < roomSize / 2) {
      existingCount++;
      var tid = it.userData.itemType.id;
      typeCounts[tid] = (typeCounts[tid] || 0) + 1;
    }
  });

  // 每个房间随机刷新5-10个道具
  var maxCount = 5 + Math.floor(Math.random() * 6);
  var spawnCount = maxCount - existingCount;
  if (spawnCount <= 0) return;

  for (var i = 0; i < spawnCount; i++) {
    var itemType;
    if (rm.cx === 0 && rm.cz === 0 && existingCount === 0 && i === 0) {
      var weaponType = null;
      for (var wt = 0; wt < ITEM_TYPES.length; wt++) {
        if (ITEM_TYPES[wt].id === 'weapon') { weaponType = ITEM_TYPES[wt]; break; }
      }
      itemType = weaponType || ITEM_TYPES[Math.floor(Math.random() * ITEM_TYPES.length)];
    } else {
      // 同一房间内同一道具不能同时存在大于2个（宝盒由独立系统管理，不走随机池）
      var allowed = ITEM_TYPES.filter(function (t) { return !t.isChest && (typeCounts[t.id] || 0) < 2; });
      if (allowed.length === 0) break;
      itemType = allowed[Math.floor(Math.random() * allowed.length)];
    }
    typeCounts[itemType.id] = (typeCounts[itemType.id] || 0) + 1;
    var x = rm.cx + (Math.random() - 0.5) * (roomSize - 12);
    var z = rm.cz + (Math.random() - 0.5) * (roomSize - 12);
    if (rm.cx === 0 && rm.cz === 0) {
      if (Math.abs(x) < 8) x = x < 0 ? -10 : 10;
      if (Math.abs(z) < 8) z = z < 0 ? -10 : 10;
    }
    var mesh = buildItemMesh(itemType);
    // 悬浮高度：贴近地面才有"可拾取物"的读感，1.0 会飘到胸口高度像贴在空中的图
    mesh.position.set(x, 0.62, z);
    // 联机模式：赋予唯一 netId，用于主机快照同步
    if (!mesh.userData.netId) {
      mesh.userData.netId = 'i_' + Math.random().toString(36).substr(2, 8);
    }
    mesh.userData = {
      netId: mesh.userData.netId,
      itemType: itemType,
      active: true,
      floatPhase: Math.random() * Math.PI * 2,
      rotSpeed: 1 + Math.random() * 0.5
    };
    scene.add(mesh);
    items.push(mesh);
  }
}

// ============================================================
// 普通宝盒独立刷新系统
// 全场同时最多5个；只刷在房间墙角；不刷在Boss房间和金色宝箱房间；
// 每个宝盒答题一次（无论对错）即销毁，30秒后随机换其他房间补刷
// ============================================================
var CHEST_MAX_COUNT = 5;

function chestTypeDef() {
  for (var i = 0; i < ITEM_TYPES.length; i++) {
    if (ITEM_TYPES[i].isChest) return ITEM_TYPES[i];
  }
  return null;
}

function countChests() {
  var n = 0;
  normalChests.forEach(function (it) {
    if (it.userData.itemType && it.userData.itemType.isChest && it.userData.active) n++;
  });
  return n;
}

function roomOfPosition(pos) {
  for (var ri = 0; ri < ROOMS.length; ri++) {
    if (Math.abs(pos.x - ROOMS[ri].cx) < roomSize / 2 &&
      Math.abs(pos.z - ROOMS[ri].cz) < roomSize / 2) {
      return ROOMS[ri];
    }
  }
  return null;
}

// 宝盒可刷新的房间：排除Boss所在房间、金色宝箱所在房间、已有宝盒的房间（防重叠）、指定房间（刚销毁的那间）
function chestEligibleRooms(excludeRoom) {
  return ROOMS.filter(function (r) {
    if (excludeRoom && r === excludeRoom) return false;
    // 排除金色宝箱所在房间
    if (energyOrb) {
      var grIdx = roomIndexOf(energyOrb.position.x, energyOrb.position.z);
      if (grIdx !== -1 && r === ROOMS[grIdx]) return false;
    }
    // 该房间已有宝盒则不再刷（每房间最多1个，避免同角重叠连续触发答题）
    for (var ii = 0; ii < normalChests.length; ii++) {
      var it = normalChests[ii];
      if (it.userData.itemType && it.userData.itemType.isChest &&
        Math.abs(it.position.x - r.cx) < roomSize / 2 &&
        Math.abs(it.position.z - r.cz) < roomSize / 2) return false;
    }
    for (var bi = 0; bi < bosses.length; bi++) {
      var b = bosses[bi];
      if (!b.userData.active) continue;
      if (Math.abs(b.position.x - r.cx) < roomSize / 2 &&
        Math.abs(b.position.z - r.cz) < roomSize / 2) return false;
    }
    return true;
  });
}

function spawnChest(excludeRoom) {
  if (countChests() >= CHEST_MAX_COUNT) return;
  var ct = chestTypeDef();
  if (!ct) return;

  var eligible = chestEligibleRooms(excludeRoom);
  if (eligible.length === 0) eligible = chestEligibleRooms(null);
  if (eligible.length === 0) return;
  var rm = eligible[Math.floor(Math.random() * eligible.length)];

  // 固定刷新在房间墙角（四角随机选一个，微小偏移避免完全重叠）
  var cornerOff = halfRoom - 3; // 距墙3个单位，避免嵌墙
  var corners = [
    [-cornerOff, -cornerOff], [cornerOff, -cornerOff],
    [-cornerOff, cornerOff], [cornerOff, cornerOff]
  ];
  var c = corners[Math.floor(Math.random() * corners.length)];
  var x = rm.cx + c[0] + (Math.random() - 0.5) * 1.5;
  var z = rm.cz + c[1] + (Math.random() - 0.5) * 1.5;

  var mesh = buildItemMesh(ct);
  mesh.position.set(x, 1.0, z);
  // 联机模式：赋予唯一 netId
  if (!mesh.userData.netId) {
    mesh.userData.netId = 'c_' + Math.random().toString(36).substr(2, 8);
  }
  mesh.userData = {
    netId: mesh.userData.netId,
    itemType: ct,
    active: true,
    floatPhase: Math.random() * Math.PI * 2,
    rotSpeed: 1 + Math.random() * 0.5
  };
  scene.add(mesh);
  normalChests.push(mesh);
}

// 初始铺满5个宝盒
function spawnInitialChests() {
  for (var i = 0; i < CHEST_MAX_COUNT; i++) spawnChest(null);
}

// 销毁宝盒（答题后无论对错都调用）：显示盖子打开状态，30秒后移除并补刷
function destroyChestItem(it) {
  if (!it || it.userData.destroyed) return;
  it.userData.destroyed = true;
  it.userData.active = false;

  // 视觉：打开盖子
  if (it.children.length >= 5) {
    var lid = it.children[1]; // 盖子
    if (lid) lid.rotation.x = -Math.PI * 0.5;
    var lock = it.children[2]; // 锁
    if (lock) lock.visible = false;
    var glow = it.children[3]; // 光晕
    if (glow && glow.material) glow.material.opacity = 0.04;
    var ring = it.children[4]; // 光环
    if (ring) ring.visible = false;
  }

  var fromRoom = roomOfPosition(it.position);

  // 广播"这个宝箱被打开了"。
  // 不发的话：加入者开箱后自己那边宝箱还在（走过去又没反应），
  // 主机本地开箱时其他加入者也看不到宝箱消失。
  if (GS.mode === 'multiplayer' && GS.isHost && typeof PeerManager !== 'undefined' && PeerManager.connected) {
    PeerManager.broadcast('chest_opened', {
      netId: it.userData.netId || null,
      x: it.position.x,
      z: it.position.z
    });
  }

  // 30秒后：移除已打开的空宝箱，在其他房间补刷新宝箱
  var tryRespawn = function () {
    if (GS.gameOver) return;
    // 游戏暂停中（如答题界面未关），延后重试，宝盒不丢失
    if (!GS.running) { setTimeout(tryRespawn, 2000); return; }
    // 移除打开的宝箱
    var idx = normalChests.indexOf(it);
    if (idx !== -1) normalChests.splice(idx, 1);
    if (it.parent) scene.remove(it);
    spawnChest(fromRoom);
    // 联机模式：主机广播宝箱重生通知
    if (GS.mode === 'multiplayer' && GS.isHost && typeof PeerManager !== 'undefined') {
      PeerManager.broadcast('chest_refresh', {
        fromRoomCx: fromRoom ? fromRoom.cx : null,
        fromRoomCz: fromRoom ? fromRoom.cz : null
      });
    }
  };
  setTimeout(tryRespawn, 30000);
}

function updateItems(delta) {
  // 联机加入者模式：本地先做拾取判定，再让主机确认。
  //
  // 原来这里直接 return，完全依赖主机拿"上报的位置"来判断距离：
  // 一旦位置同步有偏差、或主机那边在宝箱逻辑里抛异常被 try/catch 吞掉，
  // 加入者就永远捡不到道具。改成加入者本地也判定、立即生效（更跟手），
  // 再广播 item_picked 让主机做权威记录与去重。
  if (GS.mode === 'multiplayer' && !GS.isHost) {
    for (var si = 0; si < items.length; si++) {
      var sit = items[si];
      if (!sit.userData.active) continue;
      sit.position.y = 1.0 + Math.sin(clock.elapsedTime * 2 + sit.userData.floatPhase) * 0.2;
      sit.rotation.y += delta * sit.userData.rotSpeed;

      if (!window.currentQuizChest && player &&
        player.position.distanceTo(sit.position) < 1.5) {
        var sitType = sit.userData.itemType;
        if (!sitType || typeof sitType.apply !== 'function') continue;

        sitType.apply();                       // 本地立即生效
        sit.userData.active = false;
        try { scene.remove(sit); } catch (e) { }
        items.splice(si, 1);

        // 记录"本地已应用"，避免稍后收到主机的 item_pickup_sync 又应用一次
        if (typeof SyncManager !== 'undefined') {
          SyncManager.markLocalPick(sit.userData.netId);
        }
        // 通知主机：这是权威端，请移除该道具并广播给其他人
        if (typeof PeerManager !== 'undefined' && PeerManager.connected) {
          PeerManager.broadcast('item_picked', {
            netId: sit.userData.netId || null,
            itemType: sitType.id,
            pickerId: PeerManager.playerId,
            pickerName: PeerManager.playerName || '队友'
          });
        }
        return;
      }
    }
    return;
  }

  // 答题期间跳过所有物品交互，防止重复触发
  var quizOverlay = document.getElementById('quiz-overlay');
  var quizActive = quizOverlay && quizOverlay.style.display === 'flex';

  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    if (!it.userData.active) continue;
    it.position.y = 1.0 + Math.sin(clock.elapsedTime * 2 + it.userData.floatPhase) * 0.2;
    it.rotation.y += delta * it.userData.rotSpeed;
    if (it.children.length > 2) {
      var ring = it.children[2];
      if (ring) ring.rotation.z += delta * 2;
    }
    if (player && !quizActive && !window.currentQuizChest && player.position.distanceTo(it.position) < 1.5) {
      var itemType = it.userData.itemType;

      itemType.apply();

      // 联机：主机捡走的道具要在所有加入者的场景里一起消失。
      // （原来完全没广播，加入者那边会一直留着这个已经没用的道具）
      if (GS.mode === 'multiplayer' && typeof PeerManager !== 'undefined' && PeerManager.connected) {
        PeerManager.broadcast('item_pickup_sync', {
          netId: it.userData.netId || null,
          itemType: itemType.id,
          pickerId: PeerManager.playerId,
          pickerName: PeerManager.playerName || '主机'
        });
      }

      for (var j = 0; j < 12; j++) {
        (function () {
          var sp = new THREE.Mesh(
            new THREE.SphereGeometry(0.05, 4, 4),
            new THREE.MeshBasicMaterial({ color: itemType.color, transparent: true, opacity: 1 })
          );
          sp.position.copy(it.position);
          var angle = Math.random() * Math.PI * 2;
          sp.userData = {
            vel: new THREE.Vector3(Math.cos(angle) * 2, 2 + Math.random() * 2, Math.sin(angle) * 2),
            life: 0.5, fade: true
          };
          scene.add(sp);
          projectiles.push(sp);
        })();
      }
      var pickRoom = null;
      for (var ri = 0; ri < ROOMS.length; ri++) {
        if (Math.abs(it.position.x - ROOMS[ri].cx) < roomSize / 2 &&
          Math.abs(it.position.z - ROOMS[ri].cz) < roomSize / 2) {
          pickRoom = ROOMS[ri];
          break;
        }
      }
      scene.remove(it);
      items.splice(i, 1);
      i--;
      updateHUD();

      // 联机模式：主机广播道具拾取事件，通知加入者该房间将有新道具刷新
      if (GS.mode === 'multiplayer' && GS.isHost && typeof PeerManager !== 'undefined') {
        PeerManager.broadcast('item_pickup_sync', {
          roomCx: pickRoom ? pickRoom.cx : 0,
          roomCz: pickRoom ? pickRoom.cz : 0,
          itemType: itemType.id
        });
      }

      if (pickRoom) {
        (function (room, roomCx, roomCz) {
          // 普通道具刷新时间：10秒
          setTimeout(function () {
            spawnItemsInRoom(room);
            // 联机模式：主机广播道具刷新通知
            if (GS.mode === 'multiplayer' && GS.isHost && typeof PeerManager !== 'undefined') {
              PeerManager.broadcast('item_refresh', {
                roomCx: roomCx,
                roomCz: roomCz
              });
            }
          }, 10000);
        })(pickRoom, pickRoom.cx, pickRoom.cz);
      }
    }
  }
}

window.ITEM_TYPES = ITEM_TYPES;
window.items = items;
window.normalChests = normalChests;
window.buildItemMesh = buildItemMesh;
window.spawnItems = spawnItems;
window.spawnItemsInRoom = spawnItemsInRoom;
window.updateItems = updateItems;
window.spawnChest = spawnChest;
window.destroyChestItem = destroyChestItem;
window.spawnInitialChests = spawnInitialChests;
window.chestEligibleRooms = chestEligibleRooms;
window.chestTypeDef = chestTypeDef;
window.countChests = countChests;
window.roomOfPosition = roomOfPosition;
