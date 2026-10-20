// ============================================================
// MonsterSystem - Monster spawning, boss, energy orb, fragments
// ============================================================

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

  var x = room.cx + (Math.random() - 0.5) * (roomSize - 12);
  var z = room.cz + (Math.random() - 0.5) * (roomSize - 12);
  g.position.set(x, groundY, z);
  scene.add(g);

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

// 刷新小怪（被击败后立即刷新，不在同一个房间）
// 刷新时重新随机选择远程/近战类型
function respawnMonster(m) {
  var baseT = pickMinionType();
  var t = scaleMonsterType(baseT);

  // 选择一个与上次不同的房间
  var candidates = ROOMS.filter(function (r) {
    return r !== lastMonsterSpawnRoom;
  });
  if (candidates.length === 0) candidates = ROOMS;
  var rm = candidates[Math.floor(Math.random() * candidates.length)];

  var g = buildMonsterMesh(t);
  if (t.scale && t.scale !== 1) g.scale.setScalar(t.scale);

  var x = rm.cx + (Math.random() - 0.5) * (roomSize - 12);
  var z = rm.cz + (Math.random() - 0.5) * (roomSize - 12);
  g.position.set(x, groundY, z);
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
