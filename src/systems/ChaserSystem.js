// ============================================================
// ChaserSystem - Chaser AI, capture mechanics
// ============================================================

// 构建「暗影猎手」追捕者
//
// 造型原则：
//   1. 与全场的明亮卡通风统一 —— 用深紫暗影色系 + 高饱和发光点缀制造压迫感，
//      而不是旧版的写实恐怖（白衣、血迹、血泪、獠牙），后者对 5~10 岁过于惊悚，
//      也和刚重做的场景/角色/怪物完全不是一个画风。
//   2. 无腿、悬空漂浮：既强化"追捕者"的压迫感，也避开旧模型小腿和脚陷进地里的问题
//      （旧版 foot.position.y = -0.28，根节点贴地，脚整只在 y=0 以下）。
//   3. 手臂挂在枢轴上，走路时前后摆动；暗影下摆持续飘动。
function buildChaserMesh() {
  var S = VX.shape, M = VX.materials;
  var g = new THREE.Group();

  var CLOTH = 0x2b2450;       // 斗篷
  var CLOTH_DARK = 0x171331;  // 内衬 / 兜帽
  var TRIM = 0x7b5cff;        // 紫色镶边
  var EYE = 0xff2b4d;         // 血红眼（保留威胁感）
  var CLAW = 0xb9aaff;

  var matCloth = M.std(CLOTH, { rough: 0.82 });
  var matDark = M.std(CLOTH_DARK, { rough: 0.92 });
  var matTrim = M.std(TRIM, { rough: 0.4, metal: 0.35 });
  var matClaw = M.std(CLAW, { rough: 0.32, metal: 0.45 });
  var matVoid = M.std(0x08060f, { rough: 1 });

  // 自发光材质：关掉色调映射才会真的"亮"（否则会被 ACES 压成灰）
  function litMat(color, opacity, additive) {
    var mm = M.glow(color, opacity, additive);
    mm.toneMapped = false;
    return mm;
  }

  // ---------- 地面暗影领域盘 ----------
  var disc = new THREE.Mesh(new THREE.CircleGeometry(0.9, 32), litMat(0x6a4dff, 0.20, true));
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.035;
  g.add(disc);

  // ---------- 飘浮的下摆 ----------
  // 注意：S.taper 生成的 LatheGeometry 以原点为中心（y 从 -h/2 到 +h/2），
  // 所以 position.y 要取裙摆中心，而不是底边
  var SKIRT_H = 1.02;
  var skirt = new THREE.Mesh(S.taper(0.34, 0.86, SKIRT_H, 24), matDark);
  skirt.position.y = 0.16 + SKIRT_H / 2;
  g.add(skirt);

  // 下摆边缘的发光镶边，让轮廓在暗色里也能读出来
  var hem = new THREE.Mesh(new THREE.TorusGeometry(0.84, 0.028, 8, 40), litMat(TRIM, 0.5, true));
  hem.rotation.x = Math.PI / 2;
  hem.position.y = 0.17;
  g.add(hem);

  // ---------- 躯干 ----------
  var torso = new THREE.Mesh(S.ellipsoid(0.36, 0.44, 0.32, 20), matCloth);
  torso.position.y = 1.02;
  torso.castShadow = true;
  g.add(torso);

  // 胸口暗影核心（状态灯：平时微光，追击/冲刺时爆亮）
  var core = new THREE.Mesh(S.ellipsoid(0.13, 0.16, 0.10, 14), litMat(EYE, 0.8, true));
  core.position.set(0, 1.04, 0.28);
  g.add(core);

  // ---------- 肩甲尖角 ----------
  [-1, 1].forEach(function (side) {
    var spike = new THREE.Mesh(S.crystal(0.17), matTrim);
    spike.position.set(side * 0.37, 1.18, 0);
    spike.scale.set(0.85, 1.7, 0.85);
    spike.rotation.z = side * -0.55;
    g.add(spike);
  });

  // ---------- 兜帽 ----------
  var hood = new THREE.Mesh(
    new THREE.SphereGeometry(0.37, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.62),
    matDark
  );
  hood.position.y = 1.34;
  hood.scale.set(1, 1.15, 1.04);
  hood.rotation.x = -0.10;
  hood.castShadow = true;
  g.add(hood);

  // 兜帽尖角（向后上方延伸，制造轮廓张力）
  var hoodTip = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.5, 12), matDark);
  hoodTip.position.set(0, 1.66, -0.18);
  hoodTip.rotation.x = 0.55;
  g.add(hoodTip);

  // ---------- 兜帽里的空洞 ----------
  var face = new THREE.Mesh(S.ellipsoid(0.26, 0.27, 0.23, 18), matVoid);
  face.position.set(0, 1.33, 0.05);
  g.add(face);

  // ---------- 眼睛 ----------
  // 特意放进 headG（第二层）：updateChaser 里会遍历 m.children 调 emissiveIntensity，
  // 挂在第一层会被反复覆盖，眼睛亮度就无法随状态变化了。
  var headG = new THREE.Group();
  headG.position.y = 1.33;
  g.add(headG);

  var eyes = [];
  [-1, 1].forEach(function (side) {
    var eyeG = new THREE.Group();
    eyeG.position.set(side * 0.12, 0.015, 0.245);

    var eyeCore = new THREE.Mesh(new THREE.SphereGeometry(0.05, 14, 14), litMat(EYE, 1, false));
    eyeG.add(eyeCore);

    var halo = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 14), litMat(EYE, 0.3, true));
    eyeG.add(halo);

    headG.add(eyeG);
    eyes.push({ core: eyeCore, halo: halo });
  });

  // ---------- 双臂 + 利爪 ----------
  var arms = [];
  [-1, 1].forEach(function (side) {
    var shoulder = new THREE.Group();
    shoulder.position.set(side * 0.37, 1.12, 0);
    g.add(shoulder);

    var upper = new THREE.Mesh(S.capsule(0.078, 0.32, 8, 6), matCloth);
    upper.position.y = -0.19;
    upper.castShadow = true;
    shoulder.add(upper);

    var fore = new THREE.Mesh(S.capsule(0.062, 0.30, 8, 6), matDark);
    fore.position.y = -0.49;
    shoulder.add(fore);

    var hand = new THREE.Mesh(S.ellipsoid(0.086, 0.092, 0.082, 12), matClaw);
    hand.position.y = -0.67;
    shoulder.add(hand);

    // 三根利爪
    for (var ci = 0; ci < 3; ci++) {
      var claw = new THREE.Mesh(S.crystal(0.052), matClaw);
      claw.position.set((ci - 1) * 0.058, -0.78, 0.03);
      claw.scale.set(0.7, 1.9, 0.7);
      claw.rotation.x = 0.32;
      shoulder.add(claw);
    }

    arms.push(shoulder);
  });

  // ---------- 暗影须（下摆飘带）----------
  var wisps = [];
  for (var wi = 0; wi < 6; wi++) {
    var ang = (wi / 6) * Math.PI * 2;
    var wisp = new THREE.Mesh(S.blob(0.14, 0.34, 10), litMat(0x6a4dff, 0.2, true));
    wisp.position.set(Math.cos(ang) * 0.52, 0.44, Math.sin(ang) * 0.52);
    wisp.scale.set(1, 1.9, 1);
    g.add(wisp);
    wisps.push({ mesh: wisp, baseY: 0.44, phase: wi * 1.05 });
  }

  // ============================================================
  // 程序化动画
  //
  // 钩子必须挂在「会被渲染的 Mesh」上：three 的 projectObject 里对 Group 只做
  // `n = t.renderOrder`，Group 永远不进渲染列表，所以 Group 上的 onBeforeRender
  // 根本不会触发（game-monsters.js / ItemSystem.js 里挂在 Group 上的动画因此一直是死的）。
  // 这里挂在 hood 上，每帧都会被渲染到。
  // ============================================================
  hood.onBeforeRender = function () {
    if (typeof clock === 'undefined' || !clock) return;
    var tm = clock.elapsedTime;
    var walk = (g.userData && g.userData.walkPhase) || 0;

    // 手臂：走路时前后摆，站定时轻微浮动
    var swing = Math.sin(walk) * 0.38;
    arms[0].rotation.x = swing;
    arms[1].rotation.x = -swing;
    arms[0].rotation.z = 0.16 + Math.sin(tm * 1.6) * 0.06;
    arms[1].rotation.z = -0.16 - Math.sin(tm * 1.6) * 0.06;

    // 暗影须飘动
    for (var i = 0; i < wisps.length; i++) {
      var w = wisps[i];
      w.mesh.position.y = w.baseY + Math.sin(tm * 1.9 + w.phase) * 0.07;
      w.mesh.scale.y = 1.9 + Math.sin(tm * 2.3 + w.phase) * 0.28;
    }

    // 眼睛呼吸式脉动
    var pulse = 0.9 + Math.sin(tm * 3.2) * 0.14;
    eyes[0].halo.scale.setScalar(pulse);
    eyes[1].halo.scale.setScalar(pulse);

    // 地面暗影盘缓慢自转
    disc.rotation.z = tm * 0.45;
  };

  // 交给外部（updateChaser）做状态表现的引用。
  // 注意：spawnChaser 里会整体重赋 g.userData，需要把 visual 取出来再接回去。
  g.userData = {
    visual: {
      eyes: eyes,
      core: core,
      disc: disc,
      hem: hem,
      baseEyeColor: EYE,
      baseTrimColor: TRIM
    }
  };

  return g;
}

// ============================================================
// 追捕者的状态表现
//
// 眼睛、胸口核心、脚下暗影盘一起变色，玩家不看 UI 也能读出它在干什么：
//   巡逻 = 暗紫微光  发现/追击 = 血红  冲刺 = 更亮更红  眩晕 = 冷色高频闪烁
// 旧实现是对 m.children 统一调 emissiveIntensity，所有部件同亮度，读不出状态。
// ============================================================
function applyChaserLook(m, state) {
  var v = m && m.userData && m.userData.visual;
  if (!v) return;

  var tm = (typeof clock !== 'undefined' && clock) ? clock.elapsedTime : 0;
  var eyeCol, eyeOp, haloOp, discCol, discOp, coreOp;

  if (state === 'stunned') {
    // 眩晕：冷色 + 高频闪烁，明确告诉玩家"现在安全，快跑"
    eyeCol = 0x9fb4c8;
    eyeOp = 0.25 + Math.abs(Math.sin(tm * 14)) * 0.45;
    haloOp = 0.10;
    discCol = 0x7f93a6;
    discOp = 0.08;
    coreOp = 0.12;
  } else if (state === 'sprint') {
    eyeCol = 0xff0033;
    eyeOp = 1;
    haloOp = 0.55 + Math.sin(tm * 18) * 0.15;
    discCol = 0xff2244;
    discOp = 0.36;
    coreOp = 1;
  } else if (state === 'chase') {
    eyeCol = 0xff2244;
    eyeOp = 0.95;
    haloOp = 0.4 + Math.sin(tm * 6) * 0.08;
    discCol = 0xff3355;
    discOp = 0.26;
    coreOp = 0.85;
  } else if (state === 'capture') {
    // 挟持中：像冲刺一样亮，但脉动更沉——它在专心拖人
    eyeCol = 0xff0040;
    eyeOp = 1;
    haloOp = 0.5;
    discCol = 0xff0040;
    discOp = 0.4;
    coreOp = 1;
  } else {
    // 巡逻
    eyeCol = v.baseEyeColor;
    eyeOp = 0.62 + Math.sin(tm * 2.2) * 0.1;
    haloOp = 0.22;
    discCol = 0x6a4dff;
    discOp = 0.18;
    coreOp = 0.55;
  }

  // 受击：整只眼睛刷白，作为"打中了"的即时反馈
  if (m.userData && m.userData.hitFlash > 0) {
    eyeCol = 0xffffff;
    eyeOp = 1;
    haloOp = 0.6;
  }

  for (var i = 0; i < v.eyes.length; i++) {
    var e = v.eyes[i];
    e.core.material.color.setHex(eyeCol);
    e.core.material.opacity = eyeOp;
    e.halo.material.color.setHex(eyeCol);
    e.halo.material.opacity = haloOp;
  }
  if (v.core && v.core.material) {
    v.core.material.color.setHex(eyeCol);
    v.core.material.opacity = coreOp;
  }
  if (v.disc && v.disc.material) {
    v.disc.material.color.setHex(discCol);
    v.disc.material.opacity = discOp;
  }
  if (v.hem && v.hem.material) {
    v.hem.material.color.setHex(state === 'stunned' ? 0x7f93a6 : v.baseTrimColor);
  }
}

// 生成抓捕者（追捕者） - 巡逻者，遇到角色快速追击并抓捕
function spawnChaser() {
  if (chaserMonster && chaserMonster.parent) {
    scene.remove(chaserMonster);
    chaserMonster = null;
  }

  var g = buildChaserMesh();
  // buildChaserMesh 在 userData.visual 里存了眼睛/暗影盘等引用，
  // 下面会整体重赋 g.userData，先把引用取出来再接回去
  var _visual = g.userData.visual;

  // 抓捕者初始位置在远离玩家的非中央房间
  var candidates = ROOMS.filter(function (r) { return !(r.cx === 0 && r.cz === 0); });
  var room = candidates[Math.floor(Math.random() * candidates.length)];
  var x = room.cx + (Math.random() - 0.5) * (roomSize - 12);
  var z = room.cz + (Math.random() - 0.5) * (roomSize - 12);
  g.position.set(x, groundY, z);
  scene.add(g);

  g.userData = {
    radius: 0.9,
    active: true,
    walkPhase: 0,
    type: { name: '追捕者', speed: 3.0, chaseSpeed: 7.0, hp: 500, scale: 1 },
    isChaser: true,
    hp: 500,
    speedMul: 1,
    homeRoom: room,
    roamTimer: 0,
    wanderTarget: null,
    isChasing: false
  };
  g.userData.visual = _visual;
  chaserMonster = g;
  window.chaserMonster = g;
  chaserLeaveTimer = CHASER_LEAVE_DURATION;
  showMessage('🌑 暗影追捕者出现了! 它在四处搜寻你!', 0x7b5cff);

  // 登场：原地炸开一团暗影，让"它来了"有存在感
  if (window.VX && VX.vfx) {
    var _spawnPos = g.position.clone();
    _spawnPos.y += 0.9;
    VX.vfx.impact(_spawnPos, 0x7b5cff, {
      scale: 1.4,
      chipColor: 0x2b2450,
      chipCount: 10,
      streakCount: 8
    });
  }
}

// 抓捕者尝试抓住最近的玩家（主机权威）：主机→本地捕获；加入者→事件通知
function tryChaserGrab(m, GRAB_RANGE) {
  var bestPid = 'host';
  var bestD = m.position.distanceTo(player.position);
  if (GS.mode === 'multiplayer' && GS.isHost && typeof PeerManager !== 'undefined') {
    for (var pid in PeerManager.players) {
      if (pid === PeerManager.playerId) continue;
      var pp = PeerManager.players[pid];
      if (pp && pp.position && !pp.isCaptured) {
        var dx = m.position.x - pp.position.x, dz = m.position.z - pp.position.z;
        var d = Math.sqrt(dx * dx + dz * dz);
        if (d < bestD) { bestD = d; bestPid = pid; }
      }
    }
  }
  if (bestD >= GRAB_RANGE) return;

  if (bestPid === 'host') {
    capturePlayer();
    m.userData.captiveId = 'host';
  } else {
    // 抓住加入者：标记状态并通知该加入者，本地不动其位置（贴住即可）
    var cp = PeerManager.players[bestPid];
    cp.isCaptured = true;
    cp._captureAck = false; // 等待加入者确认，防止在途 input 立即误解除
    m.userData.captiveId = bestPid;
    m.userData.deliveredToBoss = false;
    m.userData.isChasing = false;
    m.userData.captiveTimer = 0;
    if (typeof PeerManager.sendTo === 'function') {
      PeerManager.sendTo(bestPid, 'game_event', { event: 'player_captured', playerId: bestPid });
    }
    showMessage('🕸️ 追捕者抓住了 ' + (cp.name || '队友') + '!', 0xff8844);
  }
}

// 主机端：抓捕者挟持加入者期间的表现（拖着加入者向Boss移动，等待其挣脱或死亡）
function updateChaserHoldingJoiner(m, delta, GRAB_RANGE) {
  var pid = m.userData.captiveId;
  var p = (typeof PeerManager !== 'undefined' && PeerManager.players) ? PeerManager.players[pid] : null;

  // 加入者离开 / 已挣脱(通过 input 上报 isCaptured=false) / 超时 → 解除挟持
  m.userData.captiveTimer = (m.userData.captiveTimer || 0) + delta;
  if (!p || !p.position || !p.isCaptured || m.userData.captiveTimer > 30) {
    releaseChaserCaptive(m, p, true);
    return;
  }

  // 与单机 captureState.captured 分支一致：抓捕者向 Boss 移动，加入者跟随抓捕者
  var bossTarget = null;
  for (var bIdx = 0; bIdx < bosses.length; bIdx++) {
    if (bosses[bIdx].userData.active && bosses[bIdx].parent) { bossTarget = bosses[bIdx]; break; }
  }
  var dt = bossTarget ? { x: bossTarget.position.x, z: bossTarget.position.z }
    : (lastBossSpawnRoom ? { x: lastBossSpawnRoom.cx, z: lastBossSpawnRoom.cz }
      : { x: m.position.x, z: m.position.z });

  var dragSpeed = ((m.userData.type && m.userData.type.speed) || 3.0) * 2.0 * delta;
  var dDir = new THREE.Vector3(dt.x - m.position.x, 0, dt.z - m.position.z);
  var dDist = dDir.length();
  if (dDist > 3.0) {
    dDir.normalize();
    var dMove = dDir.clone().multiplyScalar(dragSpeed);
    m.position.add(dMove);
    m.rotation.y = Math.atan2(dMove.x, dMove.z);
    m.userData.walkPhase = (m.userData.walkPhase || 0) + delta * 6;
    // 拖着加入者跟随（在抓捕者身后1.5单位）——写入 p.position，快照会把它下发给加入者
    p.position.x = m.position.x - dDir.x * 1.5;
    p.position.z = m.position.z - dDir.z * 1.5;
  }
  m.position.y = groundY + Math.abs(Math.sin(m.userData.walkPhase || 0)) * 0.05;

  // 挟持期间：眼睛与暗影盘进入"捕获"状态
  applyChaserLook(m, 'capture');
}

// 解除抓捕者对加入者的挟持（击退 + 冷却）；notify=true 时通知该加入者挣脱
function releaseChaserCaptive(m, p, notify) {
  var pid = m.userData.captiveId;
  m.userData.captiveId = null;
  m.userData.deliveredToBoss = false;
  m.userData.isChasing = false;
  m.userData.staggerTimer = 2.0;
  m.userData.captiveTimer = 0;
  captureState.grabCooldown = 12;
  if (p) { p.isCaptured = false; p._captureAck = false; }
  // 击退抓捕者
  if (p && p.position) {
    var kb = new THREE.Vector3(m.position.x - p.position.x, 0, m.position.z - p.position.z);
    if (kb.length() > 0) { kb.normalize().multiplyScalar(6); m.position.add(kb); }
  }
  if (notify && pid && pid !== 'host' && typeof PeerManager !== 'undefined' && typeof PeerManager.sendTo === 'function') {
    PeerManager.sendTo(pid, 'game_event', { event: 'player_rescued', playerId: pid });
  }
}

// 抓捕者AI更新
function updateChaser(delta) {
  if (!chaserMonster || !chaserMonster.parent || !chaserMonster.userData.active) return;

  var m = chaserMonster;
  var t = m.userData.type;
  // 联机主机端：抓捕者追踪最近的玩家（含加入者）；单机/加入者端为本地玩家
  var _chaserTgt = (typeof nearestPlayerPos === 'function') ? nearestPlayerPos(m.position) : player.position;
  var dist = m.position.distanceTo(_chaserTgt);

  // 捆仙绳束缚：完全无法移动和抓捕
  if (m.userData.boundTimer > 0) {
    m.userData.boundTimer -= delta;
    if (m.userData.bindRings) {
      m.userData.bindRings.rotation.y += delta * 3;
    }
    return;
  }

  // 受击/挣脱硬直：原地眩晕（被抓状态下不生效，防止卡住拖拽）
  if (!captureState.captured && m.userData.staggerTimer > 0) {
    m.userData.staggerTimer -= delta;
    // 眩晕期间切冷色闪烁：玩家能一眼看出"它现在动不了"
    applyChaserLook(m, 'stunned');
    return;
  }

  // （抓捕冷却统一在 updateCaptureSystem 中递减，此处不再重复扣减）

  var CHASE_RANGE = 18; // 发现玩家的距离
  var GRAB_RANGE = 1.8; // 抓捕距离

  // ===== 联机主机端：抓捕者正挟持某个加入者 =====
  if (GS.mode === 'multiplayer' && GS.isHost && m.userData.captiveId && m.userData.captiveId !== 'host') {
    updateChaserHoldingJoiner(m, delta, GRAB_RANGE);
    return;
  }

  if (captureState.captured) {
    // 被抓模式：怪物拖着玩家前往Boss所在的房间
    // 优先以存活Boss的实际位置为目标；没有Boss时退回随机游走
    var bossTarget = null;
    for (var bIdx = 0; bIdx < bosses.length; bIdx++) {
      if (bosses[bIdx].userData.active && bosses[bIdx].parent) {
        bossTarget = bosses[bIdx];
        break;
      }
    }

    var dt;
    if (bossTarget) {
      dt = { x: bossTarget.position.x, z: bossTarget.position.z };
    } else if (lastBossSpawnRoom) {
      dt = { x: lastBossSpawnRoom.cx, z: lastBossSpawnRoom.cz };
    } else {
      // 没有Boss也没有Boss房间记录：随机选房间拖拽（原行为）
      if (!m.userData.dragTarget || m.userData.dragChangeTimer <= 0) {
        var targetRoom = ROOMS[Math.floor(Math.random() * ROOMS.length)];
        m.userData.dragTarget = {
          x: targetRoom.cx + (Math.random() - 0.5) * (roomSize - 12),
          z: targetRoom.cz + (Math.random() - 0.5) * (roomSize - 12)
        };
        m.userData.dragChangeTimer = 3 + Math.random() * 2;
      }
      m.userData.dragChangeTimer -= delta;
      dt = m.userData.dragTarget;
    }

    var dragSpeed = (t.speed || 3.0) * 2.0 * delta;
    var dDir = new THREE.Vector3(dt.x - m.position.x, 0, dt.z - m.position.z);
    var dDist = dDir.length();
    // 距离Boss/目标点3以上继续拖，否则原地按住玩家
    if (dDist > 3.0) {
      dDir.normalize();
      // 拖拽目标可能在对角房间，也要走门，否则抓着人一起卡在墙上
      if (typeof monsterNavDir === 'function') dDir = monsterNavDir(m, dt, dDir);
      var dMove = dDir.clone().multiplyScalar(dragSpeed);
      m.position.add(dMove);
      m.rotation.y = Math.atan2(dMove.x, dMove.z);
      m.userData.walkPhase += delta * 6;

      // 拖拽玩家跟着怪物移动（在怪物身后1.5单位）
      player.position.x = m.position.x - dDir.x * 1.5;
      player.position.z = m.position.z - dDir.z * 1.5;
      player.position.y = groundY;
    } else if (bossTarget && !m.userData.deliveredToBoss) {
      // 已把玩家拖到Boss面前
      m.userData.deliveredToBoss = true;
      showMessage('👑 你被拖到了Boss面前! 快挣脱!', 0xff4444);
    }

    // 被抓时：进入"捕获"状态表现
    applyChaserLook(m, 'capture');
    return;
  }

  if (dist < CHASE_RANGE && !m.userData.isChasing) {
    // 发现玩家，开始追击
    m.userData.isChasing = true;
    showMessage('⚠️ 追捕者发现你了! 快跑!', 0xff4444);
    // 锁定瞬间来一圈红色冲击波，不看文字也知道被盯上了
    if (window.VX && VX.vfx) {
      var _lockPos = m.position.clone();
      _lockPos.y += 1.1;
      VX.vfx.impact(_lockPos, 0xff2244, {
        scale: 1.15,
        chips: false,
        groundRing: true,
        streakCount: 7,
        light: false
      });
      VX.vfx.shake(0.035, 0.16);
    }
  } else if (dist >= CHASE_RANGE * 1.5) {
    m.userData.isChasing = false;
  }

  if (m.userData.isChasing) {
    // 追击模式：冲刺/冷却交替，给玩家逃跑机会
    // 初始化冲刺计时器
    if (m.userData.sprintTimer === undefined) m.userData.sprintTimer = 0;
    if (m.userData.sprintCooldown === undefined) m.userData.sprintCooldown = 0;

    // 冲刺冷却递减
    if (m.userData.sprintCooldown > 0) {
      m.userData.sprintCooldown -= delta;
    }

    // 冲刺计时递减
    var isSprinting = m.userData.sprintTimer > 0;
    if (isSprinting) {
      m.userData.sprintTimer -= delta;
    }

    // 冲刺结束后进入冷却
    if (!isSprinting && m.userData.sprintCooldown <= 0) {
      // 开始新一轮冲刺（持续1.5秒）
      m.userData.sprintTimer = 1.5;
      m.userData.sprintCooldown = 5.0; // 5秒冷却
      isSprinting = true;
      // 冲刺起步：脚下炸开一小圈暗影，给玩家"它加速了"的预警
      if (window.VX && VX.vfx) {
        var _sprintPos = m.position.clone();
        _sprintPos.y = groundY + 0.06;
        VX.vfx.impact(_sprintPos, 0xff0033, {
          scale: 0.85,
          chips: false,
          streakCount: 5,
          light: false,
          shake: false
        });
      }
    }

    var chaseSpeed;
    if (isSprinting) {
      // 冲刺速度：快速接近
      chaseSpeed = (t.chaseSpeed || 7.0) * delta;
      // 冲刺时显示警告
      if (Math.random() < 0.02) showMessage('💨 追捕者冲刺中!', 0xff4444);
    } else {
      // 冷却中：缓慢移动（比巡逻稍快一点）
      chaseSpeed = (t.speed || 3.0) * 0.8 * delta;
    }

    var dir = new THREE.Vector3().subVectors(_chaserTgt, m.position);
    dir.y = 0;
    if (dir.length() > 0) {
      // 和普通怪物一样：跨房间时先朝门走，否则会顶着墙被碰撞推回来（卡墙）
      var _cNav = dir.clone().normalize();
      if (typeof monsterNavDir === 'function') _cNav = monsterNavDir(m, _chaserTgt, _cNav);
      var move = _cNav.multiplyScalar(chaseSpeed);
      m.position.add(move);
      m.rotation.y = Math.atan2(move.x, move.z);
      m.userData.walkPhase += delta * (isSprinting ? 10 : 4);
    }

    // 冲刺时抓捕最近的玩家（主机权威：可抓主机或加入者）
    if (isSprinting && captureState.grabCooldown <= 0 && !m.userData.captiveId) {
      tryChaserGrab(m, GRAB_RANGE);
    }
  } else {
    // 巡逻模式：随机游荡
    m.userData.roamTimer = (m.userData.roamTimer || 0) + delta;
    if (!m.userData.wanderTarget || m.userData.roamTimer > 8) {
      var rm = ROOMS[Math.floor(Math.random() * ROOMS.length)];
      m.userData.wanderTarget = {
        x: rm.cx + (Math.random() - 0.5) * (roomSize - 14),
        z: rm.cz + (Math.random() - 0.5) * (roomSize - 14)
      };
      m.userData.roamTimer = 0;
    }
    var speed = (t.speed || 3.0) * 0.6 * delta;
    var wt = m.userData.wanderTarget;
    var wDir = new THREE.Vector3(wt.x - m.position.x, 0, wt.z - m.position.z);
    if (wDir.length() > 0.5) {
      var _wNav = wDir.clone().normalize();
      if (typeof monsterNavDir === 'function') _wNav = monsterNavDir(m, wt, _wNav);
      var wMove = _wNav.multiplyScalar(speed);
      m.position.add(wMove);
      m.rotation.y = Math.atan2(wMove.x, wMove.z);
      m.userData.walkPhase += delta * 3;
    }
  }

  // 呼吸起伏
  m.position.y = groundY + Math.abs(Math.sin(m.userData.walkPhase)) * 0.08;

  // 状态表现：冲刺 > 追击 > 巡逻
  // 旧实现给所有部件同一个 emissiveIntensity，看不出追捕者在干什么
  if (m.userData.hitFlash > 0) m.userData.hitFlash -= delta;

  var _look;
  if (m.userData.sprintTimer > 0) _look = 'sprint';
  else if (m.userData.isChasing) _look = 'chase';
  else _look = 'patrol';
  applyChaserLook(m, _look);
}

// 抓捕者系统 - 抓捕/挣脱
function capturePlayer() {
  if (captureState.captured) return;
  if (GS.gameOver || !GS.running) return;

  captureState.captured = true;
  captureState.tapCount = 0;
  captureState.dmgTimer = 0;
  // 注意：冷却在挣脱/送达时设置，被抓瞬间不设（否则挣脱快时冷却反而先走完）

  // 显示挣脱进度条
  var bar = document.getElementById('capture-bar');
  if (bar) bar.classList.remove('hidden');

  // 攻击按钮变为挣脱模式
  var attackBtn = document.getElementById('btn-attack');
  if (attackBtn) attackBtn.classList.add('capture-mode');

  // 被抓紫晕脉动
  var vig = document.getElementById('hit-vignette');
  if (vig) vig.classList.add('captured');

  // 更新UI
  updateCaptureUI();

  // 玩家不能移动
  // 播放被抓动画效果
  if (chaserMonster && chaserMonster.parent) {
    // 清除之前的拖拽目标，开始拖向Boss房间
    chaserMonster.userData.dragTarget = null;
    chaserMonster.userData.deliveredToBoss = false;
    chaserMonster.userData.isChasing = false;
  }
  showMessage('🕸️ 追捕者正拖着你去Boss房间! 快点击攻击挣脱!', 0xff4444);
  AudioMgr.playHurt();

  // 被抓住的瞬间：一大团暗影爆开 + 明显震屏，让"被抓"有分量
  if (window.VX && VX.vfx && chaserMonster && chaserMonster.parent) {
    var _grabPos = chaserMonster.position.clone();
    _grabPos.y += 1.0;
    VX.vfx.impact(_grabPos, 0xff0040, {
      scale: 1.7,
      chipColor: 0x7b5cff,
      chipCount: 12,
      streakCount: 10
    });
    VX.vfx.shake(0.11, 0.34);
  }
  if (navigator.vibrate) { try { navigator.vibrate([80, 40, 80]); } catch (e) { } }
}

function updateCaptureUI() {
  var pct = Math.min(100, (captureState.tapCount / captureState.maxTap) * 100);
  var fillEl = document.getElementById('capture-bar-fill');
  var countEl = document.getElementById('capture-bar-count');
  if (fillEl) fillEl.style.width = pct + '%';
  if (countEl) countEl.textContent = captureState.tapCount + '/' + captureState.maxTap;
}

function onCaptureTap() {
  if (!captureState.captured) return;

  captureState.tapCount++;
  captureState.tapDecayTimer = 0; // 点击重置衰减计时
  updateCaptureUI();

  // 点击反馈：音效+震动（移动端）
  AudioMgr.playHit();
  if (navigator.vibrate) { try { navigator.vibrate(30); } catch (e) { } }

  if (captureState.tapCount >= captureState.maxTap) {
    // 挣脱成功
    breakFreeFromCapture();
  }
}

function breakFreeFromCapture() {
  captureState.captured = false;
  captureState.tapCount = 0;
  // 挣脱后给2.5秒加速逃跑窗口
  captureState.escapeBoostTimer = 2.5;

  // 隐藏进度条
  var bar = document.getElementById('capture-bar');
  if (bar) bar.classList.add('hidden');

  // 攻击按钮恢复正常
  var attackBtn = document.getElementById('btn-attack');
  if (attackBtn) attackBtn.classList.remove('capture-mode');

  // 关闭被抓紫晕
  var vig = document.getElementById('hit-vignette');
  if (vig) vig.classList.remove('captured');

  showMessage('💪 挣脱成功! 抓紧时间快跑!', 0x44ff88);
  AudioMgr.playSkill();

  // 挣脱：绿色冲击波，和被抓的暗红爆点形成强对比
  if (window.VX && VX.vfx && chaserMonster && chaserMonster.parent) {
    var _freePos = chaserMonster.position.clone();
    _freePos.y += 1.0;
    VX.vfx.impact(_freePos, 0x44ff88, {
      scale: 1.5,
      chipColor: 0x7b5cff,
      chipCount: 10,
      streakCount: 10
    });
    VX.vfx.shake(0.08, 0.28);
  }

  // 重置离开计时器（挣脱后抓捕者还会多待一会儿）
  chaserLeaveTimer = Math.max(chaserLeaveTimer, 20);

  // 击退抓捕者
  if (chaserMonster && chaserMonster.parent) {
    var knockback = new THREE.Vector3().subVectors(chaserMonster.position, player.position);
    knockback.y = 0;
    if (knockback.length() > 0) {
      knockback.normalize().multiplyScalar(6);
      chaserMonster.position.add(knockback);
    }
    // 抓捕者被击退后眩晕2秒，且短时间内不再追击/抓捕
    chaserMonster.userData.isChasing = false;
    chaserMonster.userData.deliveredToBoss = false;
    chaserMonster.userData.captiveId = null;
    chaserMonster.userData.staggerTimer = 2.0;
  }
  // 统一冷却：挣脱后12秒内不会再次被抓
  captureState.grabCooldown = 12;
}

// 在update中处理抓捕者相关逻辑
function updateCaptureSystem(delta) {
  // 抓捕者离开计时器（只在非抓捕状态时倒计时，加入者由主机快照同步）
  if (!captureState.captured && chaserMonster && chaserMonster.parent) {
    // 加入者不管理抓捕者生命周期，由主机快照同步控制
    if (GS.mode === 'multiplayer' && !GS.isHost) {
      // 跳过
    } else {
      chaserLeaveTimer -= delta;
      if (chaserLeaveTimer <= 0) {
        // 抓捕者自动离开
        if (chaserMonster && chaserMonster.parent) {
          scene.remove(chaserMonster);
          chaserMonster = null;
          window.chaserMonster = null;
        }
        showMessage('👋 追捕者离开了，稍后会重新出现', 0x8888ff);
        // 30秒后重新生成
        setTimeout(function () {
          if (GS.running && !GS.gameOver) {
            spawnChaser();
          }
        }, CHASER_RESPAWN_DELAY * 1000);
        return;
      }
    }
  }

  // 被抓期间持续掉血 + 挣脱进度缓慢衰减（制造拉扯对抗感）
  if (captureState.captured) {
    // 联机加入者端：贴着本地抓捕者模型移动（模拟被拖拽效果）
    if (GS.mode === 'multiplayer' && !GS.isHost && typeof chaserMonster !== 'undefined' && chaserMonster && chaserMonster.parent && player) {
      var _cDir = new THREE.Vector3(chaserMonster.position.x - player.position.x, 0, chaserMonster.position.z - player.position.z);
      if (_cDir.length() > 1.5) {
        _cDir.normalize();
        player.position.x = chaserMonster.position.x - _cDir.x * 1.5;
        player.position.z = chaserMonster.position.z - _cDir.z * 1.5;
      }
    }
    captureState.dmgTimer += delta;
    if (captureState.dmgTimer >= 1.0) {
      captureState.dmgTimer = 0;
      if (GS._invulnTimer > 0) { captureState.dmgTimer = 0; }
      else GS.hp -= 3;
      if (GS.hp <= 0) {
        // 先解除被抓捕状态再走统一死亡入口：
        // 联机下这里是"倒地待救"，不能直接 showGameOver 结束整局
        captureState.captured = false;
        var bar = document.getElementById('capture-bar');
        if (bar) bar.classList.add('hidden');
        var attackBtn = document.getElementById('btn-attack');
        if (attackBtn) attackBtn.classList.remove('capture-mode');
        var vig = document.getElementById('hit-vignette');
        if (vig) vig.classList.remove('captured');
        handlePlayerDeath('capture');
      }
      updateHUD();
    }
    // 每1.2秒不点击就掉1点挣脱进度（最多掉到0），点得慢就挣不脱
    captureState.tapDecayTimer += delta;
    if (captureState.tapDecayTimer >= 1.2) {
      captureState.tapDecayTimer = 0;
      if (captureState.tapCount > 0) {
        captureState.tapCount--;
        updateCaptureUI();
      }
    }
  } else {
    captureState.tapDecayTimer = 0;
  }

  // 挣脱后加速逃跑窗口递减
  if (captureState.escapeBoostTimer > 0) {
    captureState.escapeBoostTimer -= delta;
  }

  // 抓捕者冷却
  if (captureState.grabCooldown > 0) {
    captureState.grabCooldown -= delta;
  }

  // 更新抓捕者AI（加入者跳过，由主机权威执行）
  if (GS.mode !== 'multiplayer' || GS.isHost) {
    updateChaser(delta);
  }
}

// ============================================================
// Backward compatibility
// ============================================================
window.spawnChaser = spawnChaser;
window.buildChaserMesh = buildChaserMesh;
window.updateChaser = updateChaser;
window.tryChaserGrab = tryChaserGrab;
window.updateChaserHoldingJoiner = updateChaserHoldingJoiner;
window.releaseChaserCaptive = releaseChaserCaptive;
window.capturePlayer = capturePlayer;
window.breakFreeFromCapture = breakFreeFromCapture;
window.updateCaptureSystem = updateCaptureSystem;
window.updateCaptureUI = updateCaptureUI;
window.onCaptureTap = onCaptureTap;
