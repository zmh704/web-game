// ============================================================
// MonsterSystem - Monster spawning, boss, energy orb, fragments
// ============================================================

// ============================================================
// 敌人刷新规则（小怪 / Boss / 抓捕者 / 伪装者共用）
//
// 统一收口的原因见 BALANCE.spawn 的注释：原来四个系统各写一段随机选点，
// 既不避让玩家房间，也不看离玩家多远，联机时还只避开主机。
// ============================================================

function _spawnCfg() {
  return (typeof BALANCE !== 'undefined' && BALANCE.spawn) ? BALANCE.spawn : {
    minDistFromPlayer: 18, avoidPlayerRoom: true, retryBlocked: 0.8
  };
}

// 场上所有"还在玩"的玩家位置（主机端把加入者也算进来）
function collectActivePlayerPositions() {
  var pts = [];
  if (typeof player !== 'undefined' && player && player.position) {
    pts.push(player.position);
  }
  if (GS.mode === 'multiplayer' && GS.isHost &&
      typeof PeerManager !== 'undefined' && PeerManager.players) {
    for (var pid in PeerManager.players) {
      var pp = PeerManager.players[pid];
      if (!pp || !pp.position) continue;
      if (pp.escaped) continue;          // 已撤离的人不占位
      pts.push(pp.position);
    }
  }
  return pts;
}

// 刷新闸门：答题 / 开场倒计时 / 已结算 / 已撤离时都不该往场上塞怪
function canSpawnEnemiesNow() {
  if (!GS.running || GS.gameOver || GS.escaped) return false;
  if (GS.countdown > 0) return false;
  return true;
}

// 选一个"不打扰玩家"的刷新点：不在玩家所在房间，且离所有在场玩家 ≥ minDist。
// 40 次随机都失败时，退化为「离所有玩家最远的房间中心」，保证一定给得出坐标。
function pickEnemySpawnSpot(opts) {
  opts = opts || {};
  var cfg = _spawnCfg();
  var minDist = (opts.minDist !== undefined) ? opts.minDist : (cfg.minDistFromPlayer || 18);
  var avoidPlayerRoom = (opts.avoidPlayerRoom !== undefined) ? opts.avoidPlayerRoom : (cfg.avoidPlayerRoom !== false);
  var excludeRoom = opts.excludeRoom || null;

  if (typeof ROOMS === 'undefined' || !ROOMS || !ROOMS.length) return null;
  var span = (typeof roomSize !== 'undefined' && roomSize) ? roomSize : 40;
  var pts = collectActivePlayerPositions();

  var myRoom = null;
  if (avoidPlayerRoom && typeof player !== 'undefined' && player && typeof roomIndexOf === 'function') {
    myRoom = ROOMS[roomIndexOf(player.position.x, player.position.z)];
  }

  for (var attempt = 0; attempt < 40; attempt++) {
    var rm = ROOMS[Math.floor(Math.random() * ROOMS.length)];
    if (!rm) continue;
    if (excludeRoom && rm === excludeRoom) continue;
    if (avoidPlayerRoom && myRoom && rm === myRoom) continue;

    var x = rm.cx + (Math.random() - 0.5) * (span - 12);
    var z = rm.cz + (Math.random() - 0.5) * (span - 12);
    if (typeof inPlayArea === 'function' && !inPlayArea(x, z, 1)) continue;

    var ok = true;
    for (var i = 0; i < pts.length; i++) {
      var dx = x - pts[i].x, dz = z - pts[i].z;
      if (Math.sqrt(dx * dx + dz * dz) < minDist) { ok = false; break; }
    }
    if (!ok) continue;

    return new THREE.Vector3(x, groundY, z);
  }

  // 兜底：找离所有玩家最远的房间中心
  var far = null, farD = -1;
  for (var r = 0; r < ROOMS.length; r++) {
    var dMin = Infinity;
    for (var j = 0; j < pts.length; j++) {
      var ddx = ROOMS[r].cx - pts[j].x, ddz = ROOMS[r].cz - pts[j].z;
      dMin = Math.min(dMin, Math.sqrt(ddx * ddx + ddz * ddz));
    }
    if (dMin > farD) { farD = dMin; far = ROOMS[r]; }
  }
  if (far) return new THREE.Vector3(far.cx, groundY, far.cz);
  return null;
}

// 敌人离玩家多远才能"合法"被刷出来（给各系统读默认值时用）
function spawnDistFor(kind) {
  var cfg = _spawnCfg();
  if (kind === 'boss') return cfg.bossSpawnDist || 22;
  if (kind === 'chaser') return cfg.chaserSpawnDist || 24;
  if (kind === 'impostor') return cfg.impostorSpawnDist || 16;
  return cfg.minionRespawnDist || 20;
}

window.pickEnemySpawnSpot = pickEnemySpawnSpot;
window.canSpawnEnemiesNow = canSpawnEnemiesNow;
window.spawnDistFor = spawnDistFor;
window.collectActivePlayerPositions = collectActivePlayerPositions;

// Boss系统 - 全场只有一只Boss
function spawnBossInRoom(room) {
  // 如果Boss还活着，不移除
  var existingBoss = null;
  for (var i = 0; i < bosses.length; i++) {
    if (bosses[i].userData.active) {
      existingBoss = bosses[i];
      break;
    }
  }
  if (existingBoss) return; // Boss还活着，不移除

  var chd = currentChapterData();
  var t = BOSSES[chd.id] || BOSSES[1];

  // 应用时间增强
  var scaledT = scaleMonsterType(t);

  var g = buildMonsterMesh(scaledT);
  if (scaledT.scale && scaledT.scale !== 1) g.scale.setScalar(scaledT.scale);

  // 落点：优先守在金箱那间房（剧情上"Boss 守着宝箱"），
  // 但那间房必须先满足"不是玩家当前房间 + 离所有玩家足够远"；
  // 不满足就退到统一选点，绝不让 Boss 直接刷在玩家脚边。
  var minD = (typeof spawnDistFor === 'function') ? spawnDistFor('boss') : 22;
  // 守在金箱房间时标准放宽一点（15 米）：Boss 和宝箱在同一间房是原本的设计，
  // 只要玩家不在那间房、并且不是贴脸，就优先保留这个关系。
  var roomMinD = Math.min(minD, 15);
  var pts = (typeof collectActivePlayerPositions === 'function') ? collectActivePlayerPositions() : [];
  var roomOk = !!room;
  if (roomOk) {
    if (typeof roomIndexOf === 'function' && typeof player !== 'undefined' && player) {
      if (ROOMS[roomIndexOf(player.position.x, player.position.z)] === room) roomOk = false;
    }
    for (var pi = 0; pi < pts.length && roomOk; pi++) {
      var rdx = room.cx - pts[pi].x, rdz = room.cz - pts[pi].z;
      if (Math.sqrt(rdx * rdx + rdz * rdz) < roomMinD) roomOk = false;
    }
  }

  if (roomOk) {
    var x = room.cx + (Math.random() - 0.5) * (roomSize - 12);
    var z = room.cz + (Math.random() - 0.5) * (roomSize - 12);
    g.position.set(x, groundY, z);
  } else {
    var spot = (typeof pickEnemySpawnSpot === 'function')
      ? pickEnemySpawnSpot({ minDist: minD })
      : null;
    if (spot) {
      g.position.copy(spot);
      room = (typeof roomIndexOf === 'function') ? ROOMS[roomIndexOf(spot.x, spot.z)] : room;
    } else {
      g.position.set(room ? room.cx : 0, groundY, room ? room.cz : 0);
    }
  }
  scene.add(g);

  // homeRoom 不能为空：Boss 的"回家"逻辑要读 room.cx / room.cz
  if (!room) room = ROOMS[0];

  g.userData = {
    radius: 0.9 * (scaledT.scale || 1),
    active: true,
    walkPhase: 0,
    type: scaledT,
    isBoss: true,
    speedMul: 1,
    rangedTimer: 2.5,
    bossPhase: 3,
    homeRoom: room,
    returnHomeTimer: 0,
    lastAttackedTime: clock.elapsedTime,
    respawnTimer: 0
  };
  g.userData.hp = scaledT.hp;

  bosses.push(g);
  lastBossSpawnRoom = room;
  showMessage("👑 " + scaledT.name + " 出现了! 击败它可获得能量!", 0xff4444);
}

// 初始化怪物 - 全场只有1只小怪和1只Boss
// 随机选择小怪类型：50%概率远程攻击型，50%概率近战型（近战怪每10秒急速冲刺）
var RANGED_MINIONS = ['暗影射手', '毒液喷射者'];
function pickMinionType() {
  if (Math.random() < 0.5) {
    var name = RANGED_MINIONS[Math.floor(Math.random() * RANGED_MINIONS.length)];
    return MONSTER_TYPES[name];
  }
  var chd = currentChapterData();
  var monsterTypes = chd.monsters;
  if (!monsterTypes || monsterTypes.length === 0) monsterTypes = ["追风怪"];
  var mName = monsterTypes[Math.floor(Math.random() * monsterTypes.length)];
  return MONSTER_TYPES[mName] || MONSTER_TYPES["追风怪"];
}

// 金色宝箱系统（原能量球）：答题解锁，开出3点能量，30秒刷新
function spawnEnergyOrb() {
  if (GS.gameOver || GS.energy >= (GS.energyMax || 5)) return;

  // 宝箱不能刷新在中间的房间内
  var eligibleRooms = ROOMS.filter(function (r) {
    return !(r.cx === 0 && r.cz === 0) && r !== lastEnergyOrbRoom;
  });
  if (eligibleRooms.length === 0) {
    eligibleRooms = ROOMS.filter(function (r) { return !(r.cx === 0 && r.cz === 0); });
  }
  var targetRoom = eligibleRooms[Math.floor(Math.random() * eligibleRooms.length)];

  var x = targetRoom.cx + (Math.random() - 0.5) * (roomSize - 12);
  var z = targetRoom.cz + (Math.random() - 0.5) * (roomSize - 12);

  // 金色宝箱模型
  var chest = new THREE.Group();
  var goldMat = new THREE.MeshStandardMaterial({ color: 0xddaa22, metalness: 0.7, roughness: 0.3, emissive: 0xaa7700, emissiveIntensity: 0.25 });
  var darkGoldMat = new THREE.MeshStandardMaterial({ color: 0xbb8811, metalness: 0.6, roughness: 0.4 });
  var body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.65, 0.75), goldMat);
  body.position.y = 0.33; body.castShadow = true; chest.add(body);
  var lid = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 1.1, 12, 1, false, 0, Math.PI), darkGoldMat);
  lid.rotation.z = Math.PI / 2;
  lid.position.y = 0.66; chest.add(lid);
  // 金属包边
  var trimMat = new THREE.MeshStandardMaterial({ color: 0xffe066, metalness: 0.9, roughness: 0.2, emissive: 0xffcc44, emissiveIntensity: 0.3 });
  [-0.4, 0.4].forEach(function (tx) {
    var trim = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.68, 0.78), trimMat);
    trim.position.set(tx, 0.33, 0); chest.add(trim);
  });
  // 锁扣
  var lock = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.08), trimMat);
  lock.position.set(0, 0.5, 0.4); chest.add(lock);
  // 光柱与光晕
  var glow = new THREE.Mesh(new THREE.SphereGeometry(1.0, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xffd700, transparent: true, opacity: 0.1, side: THREE.DoubleSide }));
  glow.position.y = 0.5; chest.add(glow);
  var beam = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.4, 8, 8, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd700, transparent: true, opacity: 0.15, side: THREE.DoubleSide }));
  beam.position.y = 4; chest.add(beam);

  chest.position.set(x, groundY, z);
  chest.rotation.y = Math.random() * Math.PI * 2;
  chest.userData = { active: true, cooldown: 0, floatPhase: Math.random() * Math.PI * 2, glow: glow, isChest: true };
  scene.add(chest);
  energyOrb = chest;
  window.energyOrb = chest;
  lastEnergyOrbRoom = targetRoom;
  showMessage("🎁 金色宝箱出现在" + targetRoom.name + "房间! 靠近并停留即可开启", 0xffd700);

  // Boss刷新到宝箱所在的房间（不通知位置）
  spawnBossInRoom(targetRoom);
}

function consumeEnergyOrb() {
  if (!energyOrb) return;
  scene.remove(energyOrb);
  energyOrb = null;
  window.energyOrb = null;
  if (GS.energy < (GS.energyMax || 5)) {
    // 金色宝箱刷新时间：30秒
    setTimeout(spawnEnergyOrb, 30000);
  }
}

// 初始化怪物
function initMonsters() {
  monsters.forEach(function (m) { if (m.parent) scene.remove(m); });
  monsters = [];
  bosses.forEach(function (b) { if (b.parent) scene.remove(b); });
  bosses = [];

  var chd = currentChapterData();

  // 随机选一个非中央房间生成小怪
  var candidates = ROOMS.filter(function (r) { return !(r.cx === 0 && r.cz === 0); });
  var spawnRoom = candidates[Math.floor(Math.random() * candidates.length)];
  lastMonsterSpawnRoom = spawnRoom;

  var t = pickMinionType();
  // 应用时间增强
  var scaledT = scaleMonsterType(t);

  var g = buildMonsterMesh(scaledT);
  if (scaledT.scale && scaledT.scale !== 1) g.scale.setScalar(scaledT.scale);

  var x = spawnRoom.cx + (Math.random() - 0.5) * (roomSize - 12);
  var z = spawnRoom.cz + (Math.random() - 0.5) * (roomSize - 12);
  g.position.set(x, groundY, z);
  scene.add(g);

  g.userData = {
    radius: 0.9 * (scaledT.scale || 1),
    active: true,
    walkPhase: 0,
    type: scaledT,
    baseType: t,
    isBoss: false,
    speedMul: 1,
    homeRoom: spawnRoom,
    returnHomeTimer: 0,
    rangedTimer: 2,
    dashTimer: 10,
    lastAttackedTime: clock.elapsedTime,
    respawnTimer: 0
  };
  g.userData.hp = scaledT.hp;
  monsters.push(g);

  if (typeof fragmentDrops !== 'undefined') {
    fragmentDrops.forEach(function (f) { if (f.parent) scene.remove(f); });
    fragmentDrops.length = 0;
  }

  // Boss在金色宝箱刷新时生成，不在init时生成

  centerRoomMonsterTimer = 30;
  centerRoomMonstersSpawned = true; // 不再额外刷怪：全场只有1只小怪+1只Boss

  // 生成抓捕者
  spawnChaser();
}

// 中央房间怪物刷新
function spawnCenterRoomMonsters() {
  if (centerRoomMonstersSpawned) return;
  centerRoomMonstersSpawned = true;

  var centerRoom = ROOMS[0];
  var t = pickMinionType();
  var scaledT = scaleMonsterType(t);

  // 中央房间刷1只怪物
  var g = buildMonsterMesh(scaledT);
  if (scaledT.scale && scaledT.scale !== 1) g.scale.setScalar(scaledT.scale);

  var x = centerRoom.cx + (Math.random() - 0.5) * (roomSize - 12);
  var z = centerRoom.cz + (Math.random() - 0.5) * (roomSize - 12);
  if (Math.abs(x) < 6) x = x < 0 ? -8 : 8;
  if (Math.abs(z) < 6) z = z < 0 ? -8 : 8;
  g.position.set(x, groundY, z);
  scene.add(g);

  g.userData = {
    radius: 0.9 * (scaledT.scale || 1),
    active: true,
    walkPhase: 0,
    type: scaledT,
    baseType: t,
    isBoss: false,
    speedMul: 1,
    homeRoom: centerRoom,
    returnHomeTimer: 0,
    rangedTimer: 2,
    dashTimer: 10,
    lastAttackedTime: clock.elapsedTime,
    respawnTimer: 0
  };
  g.userData.hp = scaledT.hp;
  monsters.push(g);
  lastMonsterSpawnRoom = centerRoom;
  // 不通知怪物刷新
}

// 刷新小怪（被击败后延迟补刷，换一个房间 + 离玩家足够远）
// 刷新时重新随机选择远程/近战类型
function respawnMonster(m) {
  var baseT = pickMinionType();
  var t = scaleMonsterType(baseT);

  var g = buildMonsterMesh(t);
  if (t.scale && t.scale !== 1) g.scale.setScalar(t.scale);

  // 统一选点：不在玩家房间、离所有在场玩家 ≥ minionRespawnDist。
  // 原来只是"随机挑一个和上次不同的房间"，会直接刷在玩家背后 ——
  // 刚打死一只，脚边立刻又跳出来一只，体验非常糟。
  var minD = (typeof spawnDistFor === 'function') ? spawnDistFor('minion') : 20;
  var spot = (typeof pickEnemySpawnSpot === 'function')
    ? pickEnemySpawnSpot({ minDist: minD, excludeRoom: lastMonsterSpawnRoom })
    : null;

  var rm = lastMonsterSpawnRoom;
  if (spot) {
    g.position.copy(spot);
    if (typeof roomIndexOf === 'function') {
      rm = ROOMS[roomIndexOf(spot.x, spot.z)] || rm;
    }
  } else {
    // 兜底（理论上不会走到）：退回"和上次不同的房间"
    var candidates = ROOMS.filter(function (r) { return r !== lastMonsterSpawnRoom; });
    if (candidates.length === 0) candidates = ROOMS;
    rm = candidates[Math.floor(Math.random() * candidates.length)];
    g.position.set(
      rm.cx + (Math.random() - 0.5) * (roomSize - 12),
      groundY,
      rm.cz + (Math.random() - 0.5) * (roomSize - 12)
    );
  }
  if (!rm) rm = ROOMS[0];
  scene.add(g);

  g.userData = {
    radius: 0.9 * (t.scale || 1),
    active: true,
    walkPhase: 0,
    type: t,
    baseType: baseT,
    isBoss: false,
    speedMul: 1,
    homeRoom: rm,
    returnHomeTimer: 0,
    rangedTimer: 2,
    dashTimer: 10,
    lastAttackedTime: clock.elapsedTime,
    respawnTimer: 0
  };
  g.userData.hp = t.hp;

  var idx = monsters.indexOf(m);
  if (idx !== -1) {
    monsters[idx] = g;
  } else {
    monsters.push(g);
  }
  lastMonsterSpawnRoom = rm;
  // 不通知怪物刷新位置
}

window.spawnBossInRoom = spawnBossInRoom;
window.pickMinionType = pickMinionType;
window.spawnEnergyOrb = spawnEnergyOrb;
window.consumeEnergyOrb = consumeEnergyOrb;
window.initMonsters = initMonsters;
window.spawnCenterRoomMonsters = spawnCenterRoomMonsters;
window.respawnMonster = respawnMonster;
