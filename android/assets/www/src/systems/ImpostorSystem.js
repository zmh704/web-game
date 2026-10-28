// ============================================================
// ImpostorSystem - 伪装者（Doppelgänger）
//
// 玩法：场上会随机出现一只「伪装者」。它随机挑一名队友，复制那个人的
// 角色模型、名字标签、脚下光环，然后像队友一样朝你走过来 —— 贴近的
// 瞬间撕掉伪装开始攻击。
//
// 三条硬约定：
//   1. 伪装期间外形与真正的队友**完全一致**（同一套 createPlayer 模型 +
//      同一套名字标签绘制逻辑）。破绽只有两个：
//        · 它出现在不该出现的地方（真队友还在别处）
//        · 正对着它看够时间会「看破」，或者打它一下就露馅
//   2. 不进 monsters / bosses 数组。原因见下面「为什么不塞进 monsters」。
//   3. 每个客户端各跑自己那一只，伤害本地结算 —— 和现有怪物伤害模型
//      （各端给自己的玩家扣血）保持一致，不需要新增同步协议。
//
// 为什么不塞进 monsters 数组：
//   武器的命中判定（木棍 / 子弹 / 自动瞄准）是 `monsters.concat(bosses)`，
//   塞进去确实能白拿一整套打击手感，但主机的联机快照会把 monsters 里
//   每一个实体按「怪物类型名」下发给加入者，加入者据此重建模型 ——
//   伪装者会被重建成一只「追风怪」，伪装当场失效，而且会凭空多出一只怪。
//   所以这里独立维护 impostors 列表，再在三个命中点显式并入目标集合。
// ============================================================

var IMPOSTOR = {
  enabled: true,

  // ---- 出场节奏 ----
  firstDelay: 30,          // 开局多少秒后第一次出现
  respawnMin: 45,          // 被打死 / 溜走之后，最短隔多久再来
  respawnMax: 80,

  // ---- 数值 ----
  hp: 70,                  // 基础血量（再乘章节威胁与难度系数）
  // 单次伤害基准（走 monsterHitDamage 同一条结算链）。
  // 原来 8 太低了：第 3 章一次只掉 12 点，比普通小怪（约 30）弱一大截，
  // 被"伪装者"偷袭一下几乎没有感觉，伪装被发现也就无所谓了。
  // 调到 15 后：第 1 章 15、第 3 章 22、第 5 章 29 —— 和同期小怪同一量级，
  // 但因为它是"贴脸偷袭"，仍然值得玩家认真对待。
  dmg: 15,
  // 伪装状态下的第一下（真正的"偷袭"）额外加成：这是它唯一的威慑点。
  // 之后进入正常对拼，伤害回到 dmg 基准。
  ambushMul: 1.35,
  speedHunt: 3.6,          // 伪装状态的移速：仍比玩家(5)慢，站着不动的玩家才会被摸到
  speedRevealed: 5.2,      // 现形后的追击速度：略快于玩家基础移速，跑不掉只能打（有靴子就能甩开）
  attackRange: 2.2,        // 贴身判定的半径（原来 2.4，隔两米挨打很出戏）
  attackCooldown: 1.5,
  knockback: 1.6,          // 偷袭命中后的击退距离

  // ---- 出场位置 ----
  spawnDistMin: 16,        // 出生点离玩家 16~26 米：能看见有人走过来，但不会贴脸刷
  spawnDistMax: 26,

  // ---- 行为 ----
  combatLimit: 12,         // 现形后最多纠缠多少秒就化作黑雾溜走
  vanishHpPct: 0.22,       // 血量低于这个比例也会溜走（不给击杀奖励）

  // ---- 看破机制 ----
  lookRange: 9.0,          // 盯着它看的判定距离
  lookDot: 0.86,           // 视线夹角阈值（1 = 必须正对）
  lookTime: 1.4,           // 连续盯多久会看破伪装

  starsReward: 60
};

var impostors = [];
var _impostorSpawnTimer = IMPOSTOR.firstDelay;
var _impostorHintShown = false;
// 联机同步用的实体 id（主机分配，加入者按 id 找本地模型）
var _impostorSeq = 0;

// ============================================================
// 生命周期
// ============================================================
function initImpostorSystem() {
  clearImpostorScene();
  _impostorSpawnTimer = IMPOSTOR.firstDelay;
  _impostorHintShown = false;
}

function clearImpostorScene() {
  for (var i = impostors.length - 1; i >= 0; i--) {
    var m = impostors[i];
    if (m && m.parent) {
      try { scene.remove(m); } catch (e) { }
    }
    disposeImpostorModel(m);
  }
  impostors.length = 0;
}

function disposeImpostorModel(root) {
  if (!root || !root.traverse) return;
  root.traverse(function (o) {
    if (o.geometry) { try { o.geometry.dispose(); } catch (e) { } }
    if (o.material) {
      // 只回收这个模型自己 new 出来的材质（createPlayer 每个部件都是新建的，
      // VX.materials 里没有缓存池，所以这里 dispose 不会伤到别的角色）
      if (o.material.map) { try { o.material.map.dispose(); } catch (e) { } }
      try { o.material.dispose(); } catch (e) { }
    }
  });
}

// ============================================================
// 选伪装对象
//
// 联机：从房间里**其他玩家**里随机挑一个（跳过自己 / 已撤离的人）。
// 单机：队伍里只有你，那就伪装成你自己 —— 镜子里多出来的那个人。
// ============================================================
function pickImpostorDisguise() {
  var pool = [];

  if (GS.mode === 'multiplayer' && typeof PeerManager !== 'undefined' && PeerManager.players) {
    for (var pid in PeerManager.players) {
      if (pid === PeerManager.playerId) continue;
      var p = PeerManager.players[pid];
      if (!p) continue;
      if (p.escaped) continue;
      pool.push({
        character: p.character || 'qike',
        name: p.name || '队友',
        // 冒充谁就要带上谁的队伍编号 —— 真队友标签是「P2 小明」，
        // 伪装者只有「小明」的话，扫一眼就对上了，破绽太大。
        teamNo: (typeof SyncManager !== 'undefined' && SyncManager.teamNoOf)
          ? SyncManager.teamNoOf(pid) : (p.teamNo || 0),
        // 等级也要抄过去：真队友标签是「P2 小明 Lv.3」，少一段也是破绽
        level: p.level || 1,
        peerId: pid
      });
    }
  }

  if (pool.length === 0) {
    var cid = GS.character || 'qike';
    pool.push({
      character: cid,
      name: (typeof characterName === 'function') ? characterName(cid) : '队友',
      level: 1,
      teamNo: 0,          // 单机没有队伍编号
      peerId: null
    });
  }

  return pool[Math.floor(Math.random() * pool.length)];
}

// 在玩家周围找一个"不打扰"的落点。
//
// 统一走 pickEnemySpawnSpot（见 MonsterSystem.js）：不在玩家房间、
// 离所有在场玩家足够远（默认 16 米，比其它敌人近 —— 它要"走过来"才像队友）。
// 拿不到统一选点时才退回旧的"以玩家为圆心 16~26 米随机"。
function pickImpostorSpawnPos() {
  var minD = (typeof spawnDistFor === 'function') ? spawnDistFor('impostor') : IMPOSTOR.spawnDistMin;
  if (typeof pickEnemySpawnSpot === 'function') {
    var spot = pickEnemySpawnSpot({ minDist: minD });
    if (spot) return spot;
  }

  var base = player.position;

  for (var i = 0; i < 24; i++) {
    var ang = Math.random() * Math.PI * 2;
    var d = IMPOSTOR.spawnDistMin + Math.random() * (IMPOSTOR.spawnDistMax - IMPOSTOR.spawnDistMin);
    var x = base.x + Math.cos(ang) * d;
    var z = base.z + Math.sin(ang) * d;
    if (typeof inPlayArea === 'function' && !inPlayArea(x, z, 1)) continue;
    return new THREE.Vector3(x, groundY, z);
  }

  var myRoom = null;
  if (typeof roomIndexOf === 'function' && typeof ROOMS !== 'undefined') {
    myRoom = ROOMS[roomIndexOf(base.x, base.z)];
  }
  var pool = ROOMS.filter(function (r) { return r !== myRoom; });
  var rm = pool.length ? pool[Math.floor(Math.random() * pool.length)] : ROOMS[0];
  return new THREE.Vector3(rm.cx, groundY, rm.cz);
}

// ============================================================
// 建模：复用 createPlayer(true, character)，保证和真队友一模一样
// ============================================================
function drawImpostorLabel(canvas, ctx, texture, text, hpPct, revealed) {
  ctx.clearRect(0, 0, 256, 64);
  ctx.fillStyle = revealed ? 'rgba(60,0,0,0.55)' : 'rgba(0,0,0,0.5)';
  if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(0, 0, 256, 64, 8); ctx.fill(); }
  else { ctx.fillRect(0, 0, 256, 64); }

  ctx.fillStyle = revealed ? '#ff5566' : '#ffffff';
  ctx.font = 'bold 26px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 28);

  var pct = Math.max(0, Math.min(1, hpPct));
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(28, 48, 200, 8);
  ctx.fillStyle = revealed ? '#ff3344' : (pct > 0.5 ? '#44ff88' : (pct > 0.25 ? '#ffcc44' : '#ff5544'));
  ctx.fillRect(28, 48, 200 * pct, 8);

  if (texture) texture.needsUpdate = true;
}

// 画伪装者头顶标签。
//
// 伪装期间**直接复用队友那套 SyncManager._drawNameLabel**（同字号、同编号薄荷色、
// 同血条位置）—— 任何像素级差异都会让"这是假队友"变成一眼能看出来的破绽。
// 现形之后才换成红底 + "伪装者"。
function paintImpostorLabel(canvas, ctx, texture, disguise, hpPct, revealed) {
  var d = disguise || {};
  if (!revealed && typeof SyncManager !== 'undefined' && SyncManager._drawNameLabel) {
    SyncManager._drawNameLabel(canvas, ctx, texture, d.name || '队友',
      hpPct, d.level || 1, d.teamNo || 0);
    return;
  }
  drawImpostorLabel(canvas, ctx, texture,
    revealed ? '伪装者' : (d.name || '队友'),
    hpPct, revealed);
}

function createImpostorModel(disguise) {
  var root = (typeof createPlayer === 'function')
    ? createPlayer(true, disguise.character)
    : new THREE.Group();

  var old = root.userData || {};
  var rig = old.rig;
  var stick = old.stick;

  // 头顶名字标签：宽高/字号/位置全部对齐 SyncManager._drawNameLabel，
  // 差一个像素都会让"两个人长得不一样"，伪装就没意义了
  var canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  var ctx = canvas.getContext('2d');
  var texture = new THREE.CanvasTexture(canvas);
  var spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  var sprite = new THREE.Sprite(spriteMat);
  sprite.scale.set(1.5, 0.375, 1);
  sprite.position.y = 1.6;
  root.add(sprite);
  paintImpostorLabel(canvas, ctx, texture, disguise, 1, false);

  // 脚下光环：颜色跟着被冒充的角色走（和真队友同一个颜色）
  var auraColor = (typeof CHARACTER_AURA !== 'undefined' && CHARACTER_AURA[disguise.character])
    ? CHARACTER_AURA[disguise.character] : 0x44ff88;
  var aura = new THREE.Mesh(
    new THREE.RingGeometry(0.35, 0.45, 16),
    new THREE.MeshBasicMaterial({ color: auraColor, transparent: true, opacity: 0.15, side: THREE.DoubleSide })
  );
  aura.rotation.x = -Math.PI / 2;
  aura.position.y = 0.02;
  root.add(aura);

  root.userData = {
    radius: 0.38,
    rig: rig,
    stick: stick,
    aura: aura,
    label: { sprite: sprite, canvas: canvas, ctx: ctx, texture: texture }
  };

  return root;
}

// ============================================================
// 生成
// ============================================================
function impostorMaxHp() {
  var threat = (typeof BALANCE !== 'undefined' && BALANCE.chapterThreat) ? BALANCE.chapterThreat(GS.chapter) : 1;
  var diff = (typeof balanceDiff === 'function') ? balanceDiff(GS.difficulty) : { hp: 1 };
  return Math.max(30, Math.round(IMPOSTOR.hp * threat * (diff.hp || 1)));
}

function spawnImpostor() {
  if (!IMPOSTOR.enabled) return null;
  if (typeof player === 'undefined' || !player) return null;
  if (!GS.running || GS.gameOver || GS.escaped || GS.downed) return null;

  // 联机里伪装者只能由主机生成。
  //
  // 原来每个客户端各跑一只「本地幻觉」，结果就是你屏幕上有个"队友"走过来，
  // 别人那边根本没有这个人 —— 你被一个别人看不见的东西追着打，
  // 也没法喊队友帮忙；伪装机制彻底失去意义（它骗的本来就应该是全队）。
  // 现在主机是唯一权威：出场时机、位置、伪装对象、现形状态都在主机，
  // 加入者按快照重建本地模型（见 createRemoteImpostor / _syncImpostors）。
  if (GS.mode === 'multiplayer' && !GS.isHost) return null;

  // 场上最多一只：多了就不是"多出来一个人"，而是怪物围城
  for (var k = 0; k < impostors.length; k++) {
    if (impostors[k] && impostors[k].userData && impostors[k].userData.active) return null;
  }

  var disguise = pickImpostorDisguise();
  var root = createImpostorModel(disguise);
  root.position.copy(pickImpostorSpawnPos());
  root.rotation.y = Math.random() * Math.PI * 2;
  // 落点可能正好压在墙上（随机角度 + 半径 0.38），出生就推出去：
  // 它只在移动时做碰撞，若不在这里收一次，会卡在墙里原地不动
  if (typeof resolveWallCollision === 'function') {
    resolveWallCollision(root.position, 0.38, root.position.y);
  }
  scene.add(root);

  var maxHp = impostorMaxHp();
  var rig = root.userData.rig;
  var stick = root.userData.stick;
  var aura = root.userData.aura;
  var label = root.userData.label;
  var meshes = (window.VX && VX.rig) ? VX.rig.collectMeshes(root) : [];

  root.userData = {
    // ---- 战斗接口：命中判定 / 伤害守卫 / 血条都读这几个字段 ----
    isImpostor: true,
    active: true,
    isBoss: false,
    // 联机同步 id：加入者按它找本地那份模型，主机按它接收伤害上报
    netId: 'imp_' + (++_impostorSeq),
    type: { hp: maxHp, dmg: IMPOSTOR.dmg, name: '伪装者', scale: 1 },
    hp: maxHp,
    maxHp: maxHp,
    radius: 0.38,

    // ---- 状态机 ----
    revealed: false,
    hitFlash: 0,
    staggerTimer: 0,
    attackCooldown: 0.8,      // 刚出生给半秒缓冲，避免贴脸瞬秒
    attackAnim: 0,
    walkPhase: 0,
    moveAmt: 0,
    lookTimer: 0,
    combatTimer: 0,

    // ---- 伪装信息 ----
    disguise: disguise,

    // ---- 模型引用 ----
    rig: rig,
    stick: stick,
    aura: aura,
    label: label,
    meshes: meshes
  };

  impostors.push(root);

  // 第一次出现给一句提示：不然玩家会以为是联机同步错乱
  if (!_impostorHintShown) {
    _impostorHintShown = true;
    showMessage('👀 队伍里好像多了一个人… 盯着看不清的那位看两秒', 0xccbbff);
  }

  return root;
}

// ============================================================
// 每帧更新
//
// 单机 / 主机：跑完整的出场调度 + AI（唯一权威）
// 加入者：不生成、不跑 AI，只维护主机快照同步下来的那一只：
//   插值移动 → 步态动画 → 本地偷袭结算（自己的血自己扣）→ 看破检测
// ============================================================
function updateImpostors(delta) {
  if (typeof player === 'undefined' || !player) return;

  var isJoiner = (GS.mode === 'multiplayer' && !GS.isHost);

  if (isJoiner) {
    // 加入者：本地这一只完全由快照驱动，这里不做出场调度
    for (var j = impostors.length - 1; j >= 0; j--) {
      var rj = impostors[j];
      if (!rj || !rj.parent || !rj.userData || !rj.userData.active) {
        impostors.splice(j, 1);
        continue;
      }
      updateRemoteImpostor(rj, delta);
    }
    return;
  }

  // 出场调度只在真正能跑的时候倒计时：答题 / 结算 / 撤离 / 开场倒计时期间不偷跑
  var _canSpawn = (typeof canSpawnEnemiesNow === 'function')
    ? canSpawnEnemiesNow()
    : (GS.running && !GS.gameOver && !GS.escaped);
  if (IMPOSTOR.enabled && _canSpawn) {
    _impostorSpawnTimer -= delta;
    if (_impostorSpawnTimer <= 0) {
      if (spawnImpostor()) {
        _impostorSpawnTimer = IMPOSTOR.respawnMin + Math.random() * (IMPOSTOR.respawnMax - IMPOSTOR.respawnMin);
      } else {
        _impostorSpawnTimer = 5;   // 条件不满足（倒地/已有活体），5 秒后再试
      }
    }
  }

  for (var i = impostors.length - 1; i >= 0; i--) {
    var m = impostors[i];
    if (!m || !m.parent || !m.userData || !m.userData.active) {
      impostors.splice(i, 1);
      continue;
    }
    updateSingleImpostor(m, delta);
  }
}

// ============================================================
// 加入者：更新主机同步过来的那一只
//
// 位置完全由快照插值得到（不在本地挪怪，否则会出现"我这儿有只怪、
// 主机那边它还在别处"的分裂 —— 影子 AI 那次已经踩过一次了）。
// ============================================================
function updateRemoteImpostor(m, delta) {
  var ud = m.userData;
  var tm = (typeof clock !== 'undefined' && clock) ? clock.elapsedTime : 0;

  if (ud.attackCooldown > 0) ud.attackCooldown -= delta;
  if (ud.attackAnim > 0) ud.attackAnim -= delta;
  if (ud.hitFlash > 0) {
    ud.hitFlash -= delta;
    if (ud.hitFlash <= 0 && window.VX && VX.rig) VX.rig.resetFlash(ud.meshes, 0x000000, 0);
  }

  // ---- 位置插值（与 updateSyncedMonsters 同一套窗口）----
  ud.interpTime = (ud.interpTime || 0) + delta;
  var win = (typeof SyncManager !== 'undefined' && SyncManager.interpWindow)
    ? SyncManager.interpWindow() / 1000
    : 0.09;
  var t = Math.min(1, ud.interpTime / Math.max(0.03, win));
  var px = m.position.x, pz = m.position.z;
  m.position.x = ud.prevX + (ud.targetX - ud.prevX) * t;
  m.position.z = ud.prevZ + (ud.targetZ - ud.prevZ) * t;

  var moved = Math.abs(m.position.x - px) + Math.abs(m.position.z - pz);
  var targetAmt = moved > 0.0015 ? 1 : 0;
  ud.moveAmt = ud.moveAmt + (targetAmt - ud.moveAmt) * (1 - Math.exp(-9 * delta));
  if (targetAmt > 0) {
    ud.walkPhase += delta * (ud.revealed ? 11 : 7);
    // 朝向也跟着插值方向走（不自转，避免抖动）
    if (ud.targetX !== ud.prevX || ud.targetZ !== ud.prevZ) {
      m.rotation.y = Math.atan2(ud.targetX - ud.prevX, ud.targetZ - ud.prevZ);
    }
  }

  // ---- 看破：我盯着它看也能看穿（结果上报给主机，全队一起看到它现形）----
  if (!ud.revealed && !GS.downed && !GS.escaped && typeof camera !== 'undefined' && camera) {
    var toP = new THREE.Vector3().subVectors(player.position, m.position);
    var dist = toP.length();
    toP.y = 0;
    if (toP.lengthSq() > 0.0001) {
      var camDir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      camDir.y = 0;
      if (camDir.lengthSq() > 0.0001) {
        camDir.normalize();
        var toIt = toP.clone().multiplyScalar(-1).normalize();
        if (dist < IMPOSTOR.lookRange && camDir.dot(toIt) > IMPOSTOR.lookDot) {
          ud.lookTimer = (ud.lookTimer || 0) + delta;
          if (ud.lookTimer >= IMPOSTOR.lookTime) {
            ud.lookTimer = 0;
            // 本地先现形（立刻有反馈），同时让主机把这一只也揭示出来
            revealImpostor(m, '👁 看清了！那不是' + ud.disguise.name + '，是伪装者！');
            if (typeof PeerManager !== 'undefined' && PeerManager.connected) {
              PeerManager.broadcast('impostor_look', { netId: ud.netId });
            }
          }
        } else {
          ud.lookTimer = Math.max(0, (ud.lookTimer || 0) - delta * 0.6);
        }
      }
    }
  }

  // ---- 贴脸偷袭：加入者自己挨打自己结算（血量本来就是各自权威）----
  if (!GS.downed && !GS.escaped && !GS.gameOver && ud.attackCooldown <= 0) {
    if (player.position.distanceTo(m.position) < IMPOSTOR.attackRange) {
      impostorAttack(m);
      if (!ud.active) return;
    }
  }

  animateImpostor(m, ud.moveAmt, delta, tm);
  refreshImpostorLabel(m);
}

// ============================================================
// 加入者：按主机快照重建伪装者（外观与主机那只完全一致）
// ============================================================
function createRemoteImpostor(data) {
  var disguise = {
    character: data.character || 'qike',
    name: data.name || '队友',
    // 伪装对象的编号/等级也要跟主机一致，否则加入者这边标签会"少一截"，一眼露馅
    teamNo: data.teamNo || 0,
    level: data.level || 1,
    peerId: null
  };
  var root = createImpostorModel(disguise);
  root.position.set(data.x, groundY, data.z);
  root.rotation.y = data.rotY || 0;

  var maxHp = data.maxHp || impostorMaxHp();
  var ud = root.userData;

  ud.isImpostor = true;
  ud.isRemote = true;          // 标记：AI 不归本地管
  ud.netId = data.id;
  ud.active = true;
  ud.isBoss = false;
  ud.type = { hp: maxHp, dmg: IMPOSTOR.dmg, name: '伪装者', scale: 1 };
  ud.hp = (typeof data.hp === 'number') ? data.hp : maxHp;
  ud.maxHp = maxHp;

  ud.revealed = false;
  ud.hitFlash = 0;
  ud.staggerTimer = 0;
  ud.attackCooldown = 0.8;
  ud.attackAnim = 0;
  ud.walkPhase = 0;
  ud.moveAmt = 0;
  ud.lookTimer = 0;
  ud.combatTimer = 0;
  ud.disguise = disguise;
  // 受击闪红 / 现形泛红都靠这份网格列表（spawnImpostor 里是同样一份，别漏）
  ud.meshes = (window.VX && VX.rig) ? VX.rig.collectMeshes(root) : [];

  // 插值起点/终点
  ud.prevX = data.x;
  ud.prevZ = data.z;
  ud.targetX = data.x;
  ud.targetZ = data.z;
  ud.interpTime = 0;

  scene.add(root);
  impostors.push(root);

  // 现形状态由主机决定：新创建时就已经现形过的话立刻补上
  if (data.revealed) revealImpostor(root, null);

  return root;
}

// ============================================================
// 加入者：把快照里的最新状态套到本地模型上
// ============================================================
function applyRemoteImpostorState(m, data) {
  var ud = m.userData;
  if (!ud) return;

  // 位置：记录旧的目标（判断"主机有没有还在推动它"不需要，插值即可）
  ud.prevX = m.position.x;
  ud.prevZ = m.position.z;
  ud.targetX = data.x;
  ud.targetZ = data.z;
  ud.interpTime = 0;

  // 血量以主机为准
  if (typeof data.hp === 'number') ud.hp = data.hp;
  if (typeof data.maxHp === 'number' && data.maxHp > 0) ud.maxHp = data.maxHp;

  // 刚被现形：播本地效果（提示只在状态翻转时弹一次，不会被 20Hz 快照刷屏）
  if (data.revealed && !ud.revealed) {
    revealImpostor(m, '😱 ' + (ud.disguise ? ud.disguise.name : '队友') + ' 是伪装者！');
  }

  // 主机刚挥了一爪：补一段挥击动画，别让加入者看到"站桩挨打"
  if (data.attackSeq !== undefined && data.attackSeq !== ud.lastAttackSeq) {
    if (ud.lastAttackSeq !== undefined) ud.attackAnim = 0.38;
    ud.lastAttackSeq = data.attackSeq;
  }
}

function updateSingleImpostor(m, delta) {
  var ud = m.userData;
  var tm = (typeof clock !== 'undefined' && clock) ? clock.elapsedTime : 0;

  // 整局结束才收掉。
  // 主机自己撤离后处于"观战等待队友"，世界照常跑、快照照常发 ——
  // 这时候不能把伪装者收掉，否则队友那边它会凭空消失。
  if (GS.gameOver && !ud.done) {
    vanishImpostor(m, false);
    return;
  }

  if (ud.attackCooldown > 0) ud.attackCooldown -= delta;

  // 受击闪红：命中后 0.25 秒内整体泛红，之后复位
  if (ud.hitFlash > 0) {
    ud.hitFlash -= delta;
    if (ud.hitFlash <= 0 && window.VX && VX.rig) VX.rig.resetFlash(ud.meshes, 0x000000, 0);
  }

  // 挥击动作衰减
  if (ud.attackAnim > 0) ud.attackAnim -= delta;

  // 受击硬直：被打中会短暂僵住，给玩家"打断"的反馈
  if (ud.staggerTimer > 0) {
    ud.staggerTimer -= delta;
    animateImpostor(m, 0, delta, tm);
    return;
  }

  // 追击目标：**最近的活人**（联机时可能是队友，不只是主机自己）。
  // 原来写死追本机 player，伪装者永远朝主机走，队友站在旁边它看都不看。
  // 注意下面的"攻击判定"仍然只对本机玩家生效（见 distLocal）——
  // 每端只能结算自己的血，主机不能替队友扣血。
  var chaseTarget = player.position;
  if (typeof nearestAlivePlayerPos === 'function') {
    var _np = nearestAlivePlayerPos(m.position);
    if (_np) chaseTarget = _np;
  }
  var toP = new THREE.Vector3().subVectors(chaseTarget, m.position);
  var dist = toP.length();          // 到"追击目标"的距离：只用于移动
  var distLocal = player.position.distanceTo(m.position);  // 到本机玩家：用于看破与出手
  toP.y = 0;

  // ---------- 看破：正对着它看够时间 ----------
  if (!ud.revealed && !GS.downed && typeof camera !== 'undefined' && camera) {
    var camDir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    camDir.y = 0;
    var toLocal = new THREE.Vector3().subVectors(player.position, m.position);
    toLocal.y = 0;
    if (camDir.lengthSq() > 0.0001 && toLocal.lengthSq() > 0.0001) {
      camDir.normalize();
      var toIt = toLocal.clone().multiplyScalar(-1).normalize();
      if (distLocal < IMPOSTOR.lookRange && camDir.dot(toIt) > IMPOSTOR.lookDot) {
        ud.lookTimer += delta;
        if (ud.lookTimer >= IMPOSTOR.lookTime) {
          revealImpostor(m, '👁 看清了！那不是' + ud.disguise.name + '，是伪装者！');
        }
      } else {
        ud.lookTimer = Math.max(0, ud.lookTimer - delta * 0.6);
      }
    }
  }

  // ---------- 移动 ----------
  // 伪装状态像队友一样直线靠近；跨房间时借怪物那套"先走门"的导航，
  // 否则它会顶着墙原地滑步（玩家看到的是一只穿墙怪，不是伪装者）。
  var wantDist = IMPOSTOR.attackRange * 0.85;
  var targetAmt = 0;
  if (!GS.downed && !GS.escaped && !GS.gameOver && dist > wantDist) {
    var speed = ud.revealed ? IMPOSTOR.speedRevealed : IMPOSTOR.speedHunt;
    var dir = toP.clone().normalize();
    if (typeof monsterNavDir === 'function') dir = monsterNavDir(m, chaseTarget, dir);

    var step = speed * delta;
    m.position.add(dir.clone().multiplyScalar(step));
    m.rotation.y = Math.atan2(dir.x, dir.z);
    ud.walkPhase += delta * (ud.revealed ? 11 : 7);
    targetAmt = 1;

    if (typeof resolveWallCollision === 'function') {
      resolveWallCollision(m.position, ud.radius, m.position.y);
    }
  }
  // 步幅做帧率无关的平滑：目标停下时四肢不会"啪"一下定住
  ud.moveAmt = ud.moveAmt + (targetAmt - ud.moveAmt) * (1 - Math.exp(-9 * delta));

  // ---------- 现形后：纠缠太久 / 血太少 → 溜走 ----------
  if (ud.revealed) {
    ud.combatTimer += delta;
    if (ud.combatTimer > IMPOSTOR.combatLimit || ud.hp <= ud.maxHp * IMPOSTOR.vanishHpPct) {
      vanishImpostor(m, true);
      return;
    }
  }

  // ---------- 偷袭 ----------
  if (!GS.downed && !GS.escaped && !GS.gameOver && distLocal < IMPOSTOR.attackRange && ud.attackCooldown <= 0) {
    impostorAttack(m);
    if (!ud.active) return;
  }

  animateImpostor(m, ud.moveAmt, delta, tm);
  refreshImpostorLabel(m);
}

// ============================================================
// 程序化步态
//
// 远端队友模型是没有动画的（位置靠同步插值），伪装者必须有 ——
// 一个"滑行"的人偶比任何红眼睛都更像 bug，一眼就露馅。
// ============================================================
function animateImpostor(m, moveAmt, delta, tm) {
  var ud = m.userData;
  var rig = ud.rig;
  if (!rig) return;

  var sw = Math.max(0, Math.min(1, moveAmt || 0));
  var p = ud.walkPhase;
  var amp = 0.66 * sw;

  rig.hipL.rotation.x = Math.sin(p) * amp;
  rig.hipR.rotation.x = -Math.sin(p) * amp;
  rig.hipL.rotation.z = Math.sin(p) * 0.03 * sw;
  rig.hipR.rotation.z = -Math.sin(p) * 0.03 * sw;

  var armAmp = 0.5 * sw;
  if (rig.shoulderL) {
    rig.shoulderL.rotation.x = -Math.sin(p) * armAmp;
    rig.shoulderL.rotation.z = -0.12;
  }
  if (rig.shoulderR) {
    rig.shoulderR.rotation.x = Math.sin(p) * armAmp;
    rig.shoulderR.rotation.z = 0.12;
  }

  rig.torso.position.y = 0.46 + Math.abs(Math.sin(p)) * 0.05 * sw;
  rig.torso.rotation.x = sw * 0.1;
  rig.torso.rotation.z = Math.sin(p) * 0.05 * sw;

  if (ud.revealed) {
    // 现形后：脑袋不自然地抽搐 + 上身左右晃 —— 最直观的"这玩意儿不是人"
    rig.head.rotation.z = Math.sin(tm * 11) * 0.16;
    rig.head.rotation.y = Math.sin(tm * 7.3) * 0.22;
    rig.torso.rotation.z += Math.sin(tm * 6) * 0.05;
    // 头顶标记环缓慢起伏，夜里更容易被注意到
    if (ud.revealGlow) ud.revealGlow.position.y = 2.0 + Math.sin(tm * 3) * 0.07;
    // 整体泛暗红：外形还是那个人，但"气色"已经不对了
    if (ud.hitFlash <= 0 && window.VX && VX.rig && ud.meshes && ud.meshes.length) {
      VX.rig.flash(ud.meshes, 0x5a1218, 0.16 + Math.sin(tm * 5.2) * 0.08);
    }
    // 木棍举起来
    if (ud.stick && ud.stick.body) {
      ud.stick.body.visible = true;
      ud.stick.knot.visible = true;
      ud.stick.glow.visible = true;
    }
  } else {
    rig.head.rotation.z = -Math.sin(p) * 0.05 * sw;
    rig.head.rotation.x = Math.sin(tm * 0.85) * 0.028;
    rig.head.rotation.y = 0;
  }

  // 挥击：右肩到头顶再劈下来（伪装期间也一样，只是没人注意）
  if (ud.attackAnim > 0) {
    var at = 1 - Math.max(0, ud.attackAnim) / 0.38;
    var swing = Math.sin(Math.PI * at);
    rig.shoulderR.rotation.x = -1.9 * swing;
    rig.shoulderR.rotation.z = 0.12 - 0.5 * swing;
    rig.torso.rotation.y = -0.4 * swing;
  } else {
    rig.torso.rotation.y = Math.sin(p) * 0.05 * sw;
  }

  // 眨眼：不眨眼的人偶会立刻被认出
  var blink = (Math.sin(tm * 1.9 + (ud.blinkPhase || 0)) > 0.985) ? 0.12 : 1;
  if (rig.eyeL) rig.eyeL.scale.y = blink;
  if (rig.eyeR) rig.eyeR.scale.y = blink;
}

// 名字标签只在"内容真的变了"时重画（canvas 重绘 + 纹理上传不便宜）
function refreshImpostorLabel(m) {
  var ud = m.userData;
  var lb = ud.label;
  if (!lb || !lb.ctx) return;

  var frac = ud.maxHp > 0 ? (ud.hp / ud.maxHp) : 1;
  // 签名里要带上编号/等级：队友升级或换号时伪装者的标签也得跟着重画
  var d = ud.disguise || {};
  var sig = (ud.revealed
    ? 'REV'
    : ('D|' + (d.teamNo || 0) + '|' + (d.level || 1) + '|' + (d.name || '')))
    + '|' + Math.round(frac * 20);
  if (lb.lastSig === sig) return;
  lb.lastSig = sig;
  paintImpostorLabel(lb.canvas, lb.ctx, lb.texture, d, frac, ud.revealed);
}

// ============================================================
// 现形
// ============================================================
function revealImpostor(m, msg) {
  var ud = m.userData;
  if (!ud || ud.revealed || !ud.active) return;

  ud.revealed = true;
  ud.combatTimer = 0;
  ud.attackCooldown = Math.min(ud.attackCooldown, 0.3);

  // 脚下光环变血红、放大
  if (ud.aura) {
    ud.aura.material.color.setHex(0xff2233);
    ud.aura.material.opacity = 0.5;
    ud.aura.scale.set(1.35, 1.35, 1.35);
  }

  // 头顶一圈血红光环做标记。
  // 这里刻意不用球体：球体挂在 1.55 高度会正好糊住整张脸，
  // 玩家反而看不清"现形后的它长什么样"。平躺的细环在夜里够醒目又不挡脸。
  var glowMat = (window.VX && VX.materials)
    ? VX.materials.glow(0xff2233, 0.75, true)
    : new THREE.MeshBasicMaterial({ color: 0xff2233, transparent: true, opacity: 0.75 });
  var glow = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.05, 8, 18), glowMat);
  glow.position.y = 2.0;
  glow.rotation.x = Math.PI / 2;
  m.add(glow);
  ud.revealGlow = glow;

  if (ud.label) ud.label.lastSig = '';
  refreshImpostorLabel(m);
  if (window.VX && VX.vfx) {
    var p = m.position.clone();
    p.y += 1.2;
    VX.vfx.impact(p, 0xff2233, { scale: 1.1, chipColor: 0xff2233, chipCount: 8 });
  }
  if (typeof AudioMgr !== 'undefined' && AudioMgr.playHurt) AudioMgr.playHurt();
  if (msg && typeof showMessage === 'function') showMessage(msg, 0xff3344);
}

// ============================================================
// 偷袭
//
// 伤害链路刻意对齐 monsterAttack：护盾/无敌/击退/震屏/血条/死亡判定
// 全部复用同一套，避免出现"被伪装者打死不进结算界面"这种洞。
// ============================================================
function impostorAttack(m) {
  if (GS.gameOver || !GS.running || GS.downed || GS.escaped) return;
  var ud = m && m.userData;
  if (!ud || !ud.active) return;

  ud.attackCooldown = IMPOSTOR.attackCooldown;
  ud.attackAnim = 0.38;
  // 挥击序号：快照里带上，加入者据此补一段挥击动画
  // （否则它那边只看到自己的血在掉、伪装者站着一动不动）
  ud.attackSeq = (ud.attackSeq || 0) + 1;

  // 第一下是"偷袭"：伪装状态下贴上来这一击要更疼，
  // 否则玩家挨了一下根本不会在意 —— 伪装被发现也就没代价了。
  var wasDisguised = !ud.revealed;

  // 第一次动手才撕掉伪装 —— 之前它一直"是队友"
  if (wasDisguised) {
    revealImpostor(m, '😱 ' + ud.disguise.name + ' 撕下了伪装！');
    // 加入者本地挨的这一下，主机并不知道它已经动手了（攻击不广播），
    // 主机那边它还会顶着"队友"的脸继续晃。这里把"已现形"报给主机一次，
    // 快照就会让所有人的画面一致。
    if (GS.mode === 'multiplayer' && !GS.isHost && ud.isRemote && !ud._revealReported) {
      ud._revealReported = true;
      if (typeof PeerManager !== 'undefined' && PeerManager.connected) {
        PeerManager.broadcast('impostor_look', { netId: ud.netId });
      }
    }
  }

  var dmg = (typeof monsterHitDamage === 'function') ? monsterHitDamage(m) : IMPOSTOR.dmg;
  if (wasDisguised) dmg = Math.round(dmg * (IMPOSTOR.ambushMul || 1));
  if (GS._shielded) {
    dmg = Math.ceil(dmg * 0.1);
    showMessage('🛡️ 护盾格挡!', 0x9944ff);
  }
  if (GS._invulnTimer > 0) dmg = 0;

  GS.hp = Math.max(0, (typeof currentPlayerHp === 'function' ? currentPlayerHp() : GS.hp) - dmg);
  if (typeof updateHUD === 'function') updateHUD();
  if (typeof hitFlash !== 'undefined') hitFlash = 0.3;
  showMessage(wasDisguised ? ('🗡️ 被伪装者偷袭! -' + dmg + '❤️') : ('🗡️ 伪装者挥击! -' + dmg + '❤️'), 0xff3344);
  if (typeof AudioMgr !== 'undefined' && AudioMgr.playHurt) AudioMgr.playHurt();
  if (typeof playHurtAnimation === 'function') playHurtAnimation();

  if (window.VX && VX.vfx) {
    var hp = player.position.clone();
    hp.y += 0.9;
    VX.vfx.impact(hp, 0xff2233, { scale: 1.0, chipColor: 0xff2233, chipCount: 7, groundRing: false });
    VX.vfx.shake(0.1, 0.24);
  }

  // 击退：沿"它 → 你"方向弹开
  var dir = new THREE.Vector3().subVectors(player.position, m.position);
  dir.y = 0;
  if (dir.lengthSq() > 0.0001) {
    dir.normalize();
    player.position.add(dir.multiplyScalar(IMPOSTOR.knockback));
    // 原来只调 clampPlayer（只钳活动范围），贴墙被打时会被顶进墙体里，
    // 接着整帧都在被碰撞推出来、镜头跟着抖。这里补一次墙体推出。
    if (typeof resolveWallCollision === 'function' && player.userData) {
      resolveWallCollision(player.position, (player.userData.radius || 0.4) * (player.scale.x || 1), player.position.y);
    }
    if (typeof clampPlayer === 'function') clampPlayer();
  }

  if (GS.hp <= 0 && typeof handlePlayerDeath === 'function') handlePlayerDeath('impostor');
}

// ============================================================
// 受击 / 击杀 / 溜走
// ============================================================

// 返回 true 表示这一下把它打死了。
//
// 伤害链路刻意不走 dealMonsterDamage：
//   · 单机 / 主机：本地权威扣血，死亡由 defeatImpostor 收尾
//   · 加入者：本地预测扣血（立刻有反馈）+ 上报主机做权威结算，
//     死亡判定一律交给主机 —— 加入者只把血压到 1 点，等快照里它消失
function damageImpostor(m, dealt) {
  var ud = m && m.userData;
  if (!ud || !ud.active) return false;

  var dmg = (typeof dealt === 'number' && isFinite(dealt)) ? dealt : 0;
  var isJoiner = (GS.mode === 'multiplayer' && !GS.isHost);
  var reportToHost = isJoiner && typeof PeerManager !== 'undefined' && PeerManager.connected;

  if (reportToHost) {
    PeerManager.broadcast('monster_damage', {
      netId: ud.netId || null,
      dmg: dmg,
      isImpostor: true
    });
    // 预测**不判死**：伤害包还没到主机时本地就移除的话，
    // 主机那只还活着，50ms 后快照又把它建回来 —— 看起来就是"打死了又复活"。
    // 所以血条可以打到 0，但移除动作交给主机（快照里它消失 = 真的死了）。
    ud.hp = Math.max(0, ud.hp - dmg);
  } else {
    ud.hp -= dmg;
  }

  ud.hitFlash = 0.25;
  ud.staggerTimer = Math.max(ud.staggerTimer || 0, 0.22);
  // 硬直期间 AI 不跑（也就没有碰撞），被打退时可能正好压进墙里，
  // 这里补一次推出，否则硬直结束后它会从墙体内部开始移动
  if (typeof resolveWallCollision === 'function') {
    resolveWallCollision(m.position, ud.radius || 0.38, m.position.y);
  }

  // 打中即露馅：这一下就是玩家"验人"的手段
  if (!ud.revealed) revealImpostor(m, '👊 打中了！这个' + ud.disguise.name + '是假的！');

  if (window.VX && VX.rig) VX.rig.flash(ud.meshes, 0xff3b3b, 0.85);

  // 加入者的击杀判定一律以主机为准
  if (reportToHost) return false;
  return ud.hp <= 0;
}

function defeatImpostor(m) {
  var ud = m.userData;
  if (!ud || ud.done) return;
  ud.done = true;
  ud.active = false;

  GS.stars += IMPOSTOR.starsReward;
  GS.killCount = (GS.killCount || 0) + 1;

  showMessage('🪞 伪装者被拆穿了! 星星 +' + IMPOSTOR.starsReward, 0xffd700);
  if (typeof AudioMgr !== 'undefined' && AudioMgr.playSkill) AudioMgr.playSkill();

  if (typeof spawnFragmentDrop === 'function') spawnFragmentDrop(m.position.clone());

  if (window.VX && VX.vfx) {
    var p = m.position.clone();
    p.y += 1.0;
    VX.vfx.impact(p, 0xff5566, { scale: 1.5, chipColor: 0x552233, chipCount: 16, groundRing: true });
    VX.vfx.shake(0.08, 0.3);
  }

  if (typeof updateHUD === 'function') updateHUD();

  removeImpostorFromScene(m);
  _impostorSpawnTimer = Math.max(
    _impostorSpawnTimer,
    IMPOSTOR.respawnMin + Math.random() * (IMPOSTOR.respawnMax - IMPOSTOR.respawnMin)
  );
}

function vanishImpostor(m, escaped) {
  var ud = m.userData;
  if (!ud || ud.done) return;
  ud.done = true;
  ud.active = false;

  if (escaped && typeof showMessage === 'function') {
    showMessage('💨 伪装者化作黑雾溜走了…', 0x8866aa);
  }

  if (window.VX && VX.vfx) {
    var p = m.position.clone();
    p.y += 1.0;
    VX.vfx.impact(p, 0x331133, { scale: 1.2, chipColor: 0x221122, chipCount: 12 });
  }

  removeImpostorFromScene(m, true);

  _impostorSpawnTimer = Math.max(
    _impostorSpawnTimer,
    IMPOSTOR.respawnMin + Math.random() * (IMPOSTOR.respawnMax - IMPOSTOR.respawnMin)
  );
}

// fade=true：先缩起来浮上半空再移除，避免"啪一下消失"像是渲染出错
function removeImpostorFromScene(m, fade) {
  var idx = impostors.indexOf(m);
  if (idx !== -1) impostors.splice(idx, 1);

  if (!fade) {
    if (m.parent) scene.remove(m);
    disposeImpostorModel(m);
    return;
  }

  var startT = (typeof clock !== 'undefined' && clock) ? clock.elapsedTime : 0;
  var baseY = m.position.y;
  var iv = setInterval(function () {
    if (!m || !m.parent) { clearInterval(iv); return; }
    var now = (typeof clock !== 'undefined' && clock) ? clock.elapsedTime : startT;
    var t = Math.min(1, (now - startT) / 0.4);
    var sc = 1 - t * 0.85;
    m.scale.set(sc, sc, sc);
    m.position.y = baseY + t * 1.6;
    if (t >= 1) {
      clearInterval(iv);
      if (m.parent) scene.remove(m);
      disposeImpostorModel(m);
    }
  }, 40);
}

// ============================================================
// 攻击目标集合
//
// onlyRevealed=true：给"自动瞄准 / 怪物血条"用。
//   伪装状态的它不该被辅助瞄准锁定 —— 那等于免费送玩家一个雷达。
// onlyRevealed=false：给木棍 / 子弹的真实命中判定用，伪装状态也能打。
// ============================================================
function getImpostorTargets(onlyRevealed) {
  var out = [];
  for (var i = 0; i < impostors.length; i++) {
    var m = impostors[i];
    if (!m || !m.parent || !m.userData || !m.userData.active) continue;
    if (onlyRevealed && !m.userData.revealed) continue;
    out.push(m);
  }
  return out;
}

// ============================================================
// 联机：按 netId 找本地那一只（主机收伤害上报 / 加入者找模型都用它）
// ============================================================
function findImpostorByNetId(netId) {
  if (!netId) return null;
  for (var i = 0; i < impostors.length; i++) {
    var m = impostors[i];
    if (m && m.userData && m.userData.netId === netId && m.userData.active) return m;
  }
  return null;
}

// ============================================================
// 导出
// ============================================================
window.IMPOSTOR = IMPOSTOR;
window.impostors = impostors;
window.initImpostorSystem = initImpostorSystem;
window.spawnImpostor = spawnImpostor;
window.updateImpostors = updateImpostors;
window.getImpostorTargets = getImpostorTargets;
window.damageImpostor = damageImpostor;
window.defeatImpostor = defeatImpostor;
window.revealImpostor = revealImpostor;
window.createRemoteImpostor = createRemoteImpostor;
window.applyRemoteImpostorState = applyRemoteImpostorState;
window.findImpostorByNetId = findImpostorByNetId;
window.removeImpostorFromScene = removeImpostorFromScene;
