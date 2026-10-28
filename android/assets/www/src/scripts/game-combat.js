// ============================================================
// 联机战斗辅助（主机权威结算）
// ============================================================

// 按 netId 在小怪/Boss 列表中查找怪物
function findMonsterByNetId(netId) {
  if (!netId) return null;
  if (typeof monsters !== 'undefined') {
    for (var i = 0; i < monsters.length; i++) {
      if (monsters[i] && monsters[i].userData && monsters[i].userData.netId === netId) return monsters[i];
    }
  }
  if (typeof bosses !== 'undefined') {
    for (var j = 0; j < bosses.length; j++) {
      if (bosses[j] && bosses[j].userData && bosses[j].userData.netId === netId) return bosses[j];
    }
  }
  return null;
}

// 对怪物造成伤害：加入者上报主机由主机权威结算，主机/单机本地结算。
// 返回 true 表示本地已确认击杀（仅主机/单机会返回 true，加入者恒为 false）。
function dealMonsterDamage(m, dealt, isChaser) {
  if (!m || !m.userData) return false;
  if (GS.mode === 'multiplayer' && !GS.isHost) {
    // 加入者：本地先做**预测扣血**，让血条立刻动起来，再上报主机权威结算。
    //
    // 原来本地一行都不改，只能干等主机的快照把新血量带回来 —— 手机上
    // 快照一抖（主机切后台 / 掉帧 / 网络抖动），玩家打了好几下
    // 血条纹丝不动，看起来就是"加入者打怪不掉血"。
    // 快照到来时 _syncMonsters 会用主机结算后的真实 hp 整体覆盖，
    // 所以这里的预测不会被重复计算；主机若拒收（见 monster_damage_reject）
    // 会通知本地把血补回去。
    if (typeof dealt === 'number' && isFinite(dealt) && dealt > 0) {
      m.userData.hp = Math.max(0, (m.userData.hp || 0) - dealt);
      // 记下预测时间：_syncMonsters 在这个窗口内不会用快照里的旧血量
      // 把预测盖掉（主机还没处理到 monster_damage 时快照里还是满血）。
      m.userData.localHpAt = Date.now();
    }
    if (typeof PeerManager !== 'undefined') {
      PeerManager.broadcast('monster_damage', {
        netId: m.userData.netId || null,
        dmg: dealt,
        isChaser: !!isChaser
      });
    }
    return false;
  }
  // 主机 / 单机：本地权威结算
  m.userData.hp -= dealt;
  return m.userData.hp <= 0;
}

// 返回距离 fromPos 最近的「还活着」的玩家位置；全员倒地时返回 null。
//
// 为什么必须排除倒地玩家：
//   怪物的近战逻辑是「dist > 2.5 才移动，进入 2.5 内就停下来打」。
//   玩家倒地后如果不被排除，怪物会一路贴到尸体旁停下，
//   而 monsterAttack 又被 GS.downed 拦掉 —— 表现就是**怪物贴着你一动不动**。
//   倒地期间怪物应该转去追还活着的队友，而不是围着尸体打转。
function nearestAlivePlayerPos(fromPos) {
  if (!player || !fromPos) return null;
  var best = null, bestD = Infinity;

  // 自己：没倒地且血量 > 0 才算活人
  if (!GS.downed && currentPlayerHp() > 0) {
    best = player.position.clone();
    bestD = fromPos.distanceTo(player.position);
  }

  // 队友（只有主机持有其他人的位置）
  if (GS.mode === 'multiplayer' && GS.isHost && typeof PeerManager !== 'undefined') {
    for (var pid in PeerManager.players) {
      if (pid === PeerManager.playerId) continue;
      var pp = PeerManager.players[pid];
      if (!pp || !pp.position) continue;
      if (pp.downed) continue;
      if (pp.escaped) continue;   // 已撤离的人不该再被怪物追
      if (typeof pp.hp === 'number' && pp.hp <= 0) continue;
      var dx = fromPos.x - pp.position.x, dz = fromPos.z - pp.position.z;
      var d = Math.sqrt(dx * dx + dz * dz);
      if (d < bestD) {
        bestD = d;
        best = new THREE.Vector3(pp.position.x, player.position.y, pp.position.z);
      }
    }
  }
  return best;
}

// 返回距离 fromPos 最近的玩家位置（联机主机端把加入者也纳入目标）。
// 优先返回活人；全员倒地时退回所有人里最近的一个，保证调用方拿到有效坐标。
function nearestPlayerPos(fromPos) {
  if (!player) return fromPos;
  var alive = nearestAlivePlayerPos(fromPos);
  if (alive) return alive;

  var best = player.position;
  if (GS.mode === 'multiplayer' && GS.isHost && typeof PeerManager !== 'undefined') {
    var bestD = fromPos.distanceTo(player.position);
    for (var pid in PeerManager.players) {
      if (pid === PeerManager.playerId) continue;
      var pp = PeerManager.players[pid];
      if (pp && pp.position) {
        var dx = fromPos.x - pp.position.x, dz = fromPos.z - pp.position.z;
        var d = Math.sqrt(dx * dx + dz * dz);
        if (d < bestD) {
          bestD = d;
          best = new THREE.Vector3(pp.position.x, player.position.y, pp.position.z);
        }
      }
    }
  }
  return best;
}

// ============================================================
// 技能系统
// ============================================================
function useSkill() {
  if (GS.gameOver || !GS.running || GS.countdown > 0) return;
  if (GS.downed) return;   // 倒地待救时不能放技能
  if (!GS.skillReady) return;
  if (GS.skillCooldown > 0) return;
  // 安全检查：场景和玩家是否就绪
  if (typeof scene === 'undefined' || !scene || typeof player === 'undefined' || !player) {
    console.warn('useSkill: 场景未就绪');
    return;
  }

  GS.skillReady = false;
  GS.skillEnergy = 0;
  // 先更新UI，确保用户看到反馈
  showMessage('✨ 技能释放!', 0xcc88ff);
  AudioMgr.playCharacterVoice('skill');
  playSkillAnimation();
  GS.skillCooldown = GS.skillCooldownTime; // 20秒冷却
  GS.skillActive = GS.skillDuration; // 3秒持续

  // 把"谁在哪儿放技能"广播出去，队友端据此在原地画对应颜色的光环。
  // 技能本身是本地状态机（疾风/护盾/飞行）没法简单复制，所以只同步视觉。
  broadcastAttackFx({
    kind: 'skill',
    character: GS.character,
    x: player ? player.position.x : 0,
    y: player ? player.position.y : 0,
    z: player ? player.position.z : 0,
    color: GS.character === 'qike' ? 0xff8800
      : (GS.character === 'baba' ? 0x8fd6ff : 0x9944ff)
  });

  var isQike = GS.character === 'qike';
  if (isQike) {
    moveSpeed = 12;
    showMessage('⚡ 疾风冲刺! (持续3秒)', 0xff8800);
    AudioMgr.playSkill();

    for (var i = 0; i < 8; i++) {
      (function (idx) {
        setTimeout(function () {
          var lightning = new THREE.Mesh(
            new THREE.BoxGeometry(0.04, 0.6, 0.04),
            new THREE.MeshBasicMaterial({ color: 0xffee00, transparent: true, opacity: 0.8 })
          );
          var angle = Math.PI * 2 * idx / 8;
          lightning.position.copy(player.position);
          lightning.position.x += Math.cos(angle) * 0.6;
          lightning.position.z += Math.sin(angle) * 0.6;
          lightning.position.y += 0.8;
          lightning.rotation.z = Math.random() * 0.4 - 0.2;
          lightning.userData = { life: 0.4, fade: true };
          scene.add(lightning);
          projectiles.push(lightning);
        }, idx * 30);
      })(i);
    }

    for (var r = 0; r < 4; r++) {
      (function (delay) {
        setTimeout(function () {
          var ring = new THREE.Mesh(
            new THREE.TorusGeometry(0.5 + delay * 0.15, 0.08, 8, 16),
            new THREE.MeshBasicMaterial({ color: 0xff8800, transparent: true, opacity: 0.7 })
          );
          ring.position.copy(player.position);
          ring.position.y += 0.5;
          ring.rotation.x = Math.PI / 2;
          ring.userData = { expandSpeed: 3, life: 0.5, fade: true };
          scene.add(ring);
          projectiles.push(ring);
        }, delay);
      })(r * 60);
    }

    var trailInterval = setInterval(function () {
      // 技能持续时间结束后必须停掉，否则会一直以 20Hz 生成拖尾粒子（原来只判 GS.running）
      if (!GS.running || GS.gameOver || GS.skillActive <= 0) {
        clearInterval(trailInterval);
        return;
      }
      for (var t = 0; t < 3; t++) {
        var trail = new THREE.Mesh(
          new THREE.SphereGeometry(0.08, 6, 6),
          new THREE.MeshBasicMaterial({ color: [0xffee00, 0xff8800, 0xffd700][t], transparent: true, opacity: 0.8 })
        );
        trail.position.copy(player.position);
        trail.position.y += 0.3 + Math.random() * 0.8;
        trail.position.x += (Math.random() - 0.5) * 0.4;
        trail.position.z += (Math.random() - 0.5) * 0.4;
        trail.userData = { life: 0.4, fade: true, vel: new THREE.Vector3(0, 0.2, 0) };
        scene.add(trail);
        projectiles.push(trail);
      }
    }, 50);

    // 技能持续期间保持加速，结束时恢复
    // 注意：GS.skillActive在update中被递减，当归零时恢复速度

    // 确保移动速度立即生效
    moveSpeed = 12;

    // 创建技能光环
    createPlayerAura(0xff8800, 0.5);

  } else if (GS.character === 'baba') {
    // 爸爸：🕊️ 飞行 —— 离地悬停 3 秒。
    // 和奇奇(地面提速)、妙妙(减伤)区分开：爸爸是机动型，能正面躲开地面怪物的近身攻击。
    showMessage('🕊️ 起飞! (持续3秒，按住跳跃键继续爬升)', 0x8fd6ff);
    AudioMgr.playSkill();

    if (typeof startFlight === 'function') startFlight();

    // 起飞气流：脚下一圈向上飘的环
    for (var u = 0; u < 3; u++) {
      (function (idx) {
        setTimeout(function () {
          if (!GS.running || !player) return;
          var gust = new THREE.Mesh(
            new THREE.TorusGeometry(0.42 + idx * 0.12, 0.05, 8, 18),
            new THREE.MeshBasicMaterial({ color: 0x8fd6ff, transparent: true, opacity: 0.7 })
          );
          gust.position.copy(player.position);
          gust.position.y += 0.1;
          gust.rotation.x = Math.PI / 2;
          gust.userData = { life: 0.6, fade: true, vel: new THREE.Vector3(0, 2.6, 0) };
          scene.add(gust);
          projectiles.push(gust);
        }, idx * 80);
      })(u);
    }

    // 空中水平机动比走路快，这样飞行才有意义
    moveSpeed = Math.max(moveSpeed, 9.5);
    createPlayerAura(0x8fd6ff, 0.5);

  } else {
    showMessage('🛡️ 能量护盾! (持续3秒)', 0x9944ff);
    GS._shielded = true;
    AudioMgr.playSkill();
    playSkillAnimation();

    // 移除旧护盾（防止重复）
    if (GS._shieldMesh) {
      try { scene.remove(GS._shieldMesh); } catch (e) { }
      GS._shieldMesh = null;
    }

    var shieldGeo = new THREE.SphereGeometry(0.9, 16, 16);
    var shieldMat = new THREE.MeshBasicMaterial({
      color: 0x9944ff,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide
    });
    var shield = new THREE.Mesh(shieldGeo, shieldMat);
    shield.position.copy(player.position);
    shield.position.y += 0.8;
    scene.add(shield);

    var hexRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.85, 0.04, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xcc77ff, transparent: true, opacity: 0.6 })
    );
    hexRing.position.copy(shield.position);
    shield.add(hexRing);

    var orbitRings = [];
    for (var ri = 0; ri < 3; ri++) {
      var oRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.7 + ri * 0.1, 0.025, 8, 16),
        new THREE.MeshBasicMaterial({ color: 0xaa66ff, transparent: true, opacity: 0.5 })
      );
      oRing.position.copy(shield.position);
      oRing.rotation.x = Math.PI / 2 + ri * 0.4;
      shield.add(oRing);
      orbitRings.push(oRing);
    }

    var shieldParticles = [];
    for (var sp = 0; sp < 12; sp++) {
      var sPart = new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 6, 6),
        new THREE.MeshBasicMaterial({ color: 0xdd99ff, transparent: true, opacity: 0.8 })
      );
      var angle = Math.PI * 2 * sp / 12;
      sPart.position.set(Math.cos(angle) * 0.85, 0, Math.sin(angle) * 0.85);
      shield.add(sPart);
      shieldParticles.push({ mesh: sPart, angle: angle, radius: 0.85 });
    }

    // 保存护盾引用以便在技能结束时移除
    GS._shieldMesh = shield;
    var shieldPhase = 0;
    var shieldUpdate = setInterval(function () {
      if (!GS._shielded || !GS.running || !player.parent) {
        try { scene.remove(shield); } catch (e) { }
        GS._shieldMesh = null;
        return clearInterval(shieldUpdate);
      }
      shieldPhase += 0.05;
      shield.position.copy(player.position);
      shield.position.y += 0.8;
      shield.rotation.y += 0.02;
      hexRing.rotation.z += 0.03;
      var pulse = 1 + Math.sin(shieldPhase * 3) * 0.08;
      shield.scale.set(pulse, pulse, pulse);
      orbitRings.forEach(function (r, idx) {
        r.rotation.z += 0.015 * (idx + 1);
      });
      shieldParticles.forEach(function (sp, idx) {
        sp.angle += 0.04;
        sp.mesh.position.set(
          Math.cos(sp.angle) * sp.radius,
          Math.sin(shieldPhase * 2 + idx * 0.5) * 0.3,
          Math.sin(sp.angle) * sp.radius
        );
      });
    }, 30);

    // 护盾会在GS.skillActive归零时在update中移除
  }

  updateSkillHUD();
}

// 更新技能UI
function updateSkillHUD() {
  var statusEl = document.getElementById('skill-status');
  var cdFillEl = document.getElementById('skill-cd-fill');
  var cdTextEl = document.getElementById('skill-cd-text');
  var skillBtn = document.getElementById('btn-skill');
  if (!statusEl) return;

  if (GS.skillActive > 0) {
    // 技能激活中
    statusEl.textContent = '激活中 ' + Math.ceil(GS.skillActive) + 's';
    statusEl.style.color = '#17a86a';
    cdFillEl.style.width = '100%';
    cdFillEl.style.background = 'linear-gradient(90deg, #59e0b6, #16a97a)';
    cdTextEl.textContent = '持续 ' + Math.ceil(GS.skillActive) + 's';
    if (skillBtn) skillBtn.innerHTML = '<span class="icon">✨</span>⚡' + Math.ceil(GS.skillActive) + 's';
  } else if (GS.skillCooldown > 0) {
    // 冷却中
    var cdPct = ((GS.skillCooldownTime - GS.skillCooldown) / GS.skillCooldownTime * 100);
    statusEl.textContent = '冷却 ' + Math.ceil(GS.skillCooldown) + 's';
    statusEl.style.color = '#d1720a';
    cdFillEl.style.width = cdPct + '%';
    cdFillEl.style.background = 'linear-gradient(90deg, #ffa64d, #f2b53c)';
    cdTextEl.textContent = '冷却 ' + Math.ceil(GS.skillCooldown) + 's';
    if (skillBtn) skillBtn.innerHTML = '<span class="icon">✨</span>' + Math.ceil(GS.skillCooldown) + 's';
  } else {
    // 就绪
    statusEl.textContent = '技能就绪';
    statusEl.style.color = '#cf8f16';
    cdFillEl.style.width = '100%';
    cdFillEl.style.background = 'linear-gradient(90deg, #ffd166, #f0a83a)';
    cdTextEl.textContent = '';
    if (skillBtn) skillBtn.innerHTML = '<span class="icon">✨</span>技能';
  }
}

// 在update中每帧调用，处理技能持续和冷却计时
function updateSkillTimers(delta) {
  // 技能持续时间递减
  if (GS.skillActive > 0) {
    GS.skillActive -= delta;
    if (GS.skillActive <= 0) {
      GS.skillActive = 0;
      // 技能结束
      if (GS.character === 'qike') {
        moveSpeed = (typeof BASE_MOVE_SPEED !== 'undefined') ? BASE_MOVE_SPEED : 5;
        showMessage('⚡ 疾风冲刺结束', 0xff8800);
      } else if (GS.character === 'baba') {
        // 结束飞行：交还给重力自由下落，同时把被飞行改写的移速恢复
        if (typeof endFlight === 'function') endFlight();
        moveSpeed = (typeof BASE_MOVE_SPEED !== 'undefined') ? BASE_MOVE_SPEED : 5;
        showMessage('🕊️ 飞行结束，准备落地', 0x8fd6ff);
      } else {
        GS._shielded = false;
        // 移除护盾视觉
        if (GS._shieldMesh) {
          try { scene.remove(GS._shieldMesh); } catch (e) { }
          GS._shieldMesh = null;
        }
        showMessage('🛡️ 能量护盾消失', 0x9944ff);
      }
    }
  }

  // 技能冷却递减
  if (GS.skillCooldown > 0) {
    GS.skillCooldown -= delta;
    if (GS.skillCooldown <= 0) {
      GS.skillCooldown = 0;
      GS.skillReady = true;
      GS.skillEnergy = GS.skillMax;
      showMessage('✨ 技能已就绪!', 0xffd700);
      AudioMgr.playQuiz();
    }
  }

  updateSkillHUD();
}

// ============================================================
// 攻击系统
// ============================================================
// 攻击特效同步
//
// 问题：走位、血条、怪物状态都同步了，但**攻击动作和特效是本地的** ——
// 你在自己屏幕上放了一炮，队友那边只看到怪物的血条掉了，看不到你打。
//
// 做法：开火 / 挥棒 / 放技能时广播一条轻量事件，队友端按事件在原地重建
// 一份**纯装饰**的特效（不结算任何伤害，伤害仍然走 monster_damage 由主机权威结算）。
// ============================================================
function broadcastAttackFx(data) {
  if (typeof GS === 'undefined' || GS.mode !== 'multiplayer') return;
  if (typeof PeerManager === 'undefined' || !PeerManager.broadcast) return;
  if (!PeerManager.ws || PeerManager.ws.readyState !== 1) return;
  PeerManager.broadcast('attack_fx', data);
}

/**
 * 队友端：按收到的事件重建特效。
 * 这里创建的所有东西都不带 damage，只负责"看起来像真的在打"。
 */
function spawnRemoteAttackFx(data, fromPeerId) {
  if (!data || !data.kind) return;
  if (typeof scene === 'undefined' || !scene) return;

  // 让发起攻击的那个队友模型也挥一下手臂 —— 只有子弹飞出来、人却站着不动很怪
  if (fromPeerId && typeof SyncManager !== 'undefined' && SyncManager.remotePlayers) {
    var _rp = SyncManager.remotePlayers[fromPeerId];
    if (_rp) _rp.attackAnim = 0.38;
  }

  if (data.kind === 'shot') {
    // 复刻一发同款弹药，但 damage = 0、标记 cosmeticShot，
    // 更新循环里命中怪物只出爆点和闪白，不扣血、不击退、不判定击杀。
    var pseudoWeapon = {
      type: data.wtype || 'arrow',
      color: data.color || 0xffd700,
      speed: data.speed || 30
    };
    var proj = buildProjectileMesh(pseudoWeapon);
    proj.position.set(data.x || 0, data.y || 1.2, data.z || 0);
    var dir = new THREE.Vector3(data.dx || 0, 0, data.dz || -1);
    if (dir.lengthSq() < 0.0001) dir.set(0, 0, -1);
    dir.normalize();
    proj.rotation.y = -Math.atan2(dir.x, dir.z);

    var sShell = proj.userData.shell;
    var sRing = proj.userData.ring;
    proj.userData = {
      vel: dir.clone().multiplyScalar(pseudoWeapon.speed),
      life: 1.8,
      damage: 0,
      weapon: pseudoWeapon,
      spinPhase: Math.random() * Math.PI * 2,
      cosmeticShot: true,
      fxColor: pseudoWeapon.color
    };
    if (sShell) proj.userData.shell = sShell;
    if (sRing) proj.userData.ring = sRing;
    scene.add(proj);
    projectiles.push(proj);

    if (window.VX && VX.vfx) {
      VX.vfx.muzzle(proj.position.clone(), dir.clone(), pseudoWeapon.color);
    }
    return;
  }

  if (data.kind === 'slash') {
    // 近战挥砍：复用本地同款 slash 特效，参数保持一致，两边看起来才一样
    var color = data.color || 0xffe08a;
    var sdir = new THREE.Vector3(data.dx || 0, 0, data.dz || -1);
    if (sdir.lengthSq() < 0.0001) sdir.set(0, 0, -1);
    sdir.normalize();
    var spos = new THREE.Vector3(data.x || 0, data.y || 0.92, data.z || 0);
    if (window.VX && VX.vfx) {
      VX.vfx.slash(spos, sdir, color, { radius: 1.85, arc: 2.25, life: 0.26 });
    } else {
      // 兜底：没有 VFX 层时至少画一道弧
      var arc = new THREE.Mesh(
        new THREE.TorusGeometry(1.0, 0.055, 6, 20, Math.PI * 0.9),
        new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
      );
      arc.position.copy(spos);
      arc.rotation.x = Math.PI / 2;
      arc.rotation.z = Math.atan2(sdir.x, sdir.z);
      arc.userData = { life: 0.28, fade: true };
      scene.add(arc);
      projectiles.push(arc);
    }
    return;
  }

  if (data.kind === 'skill') {
    // 队友放技能：在「他的位置」放一圈特征色光环。
    // 不要调 createPlayerAura —— 那个是围着自己（player）生成的，会放错位置。
    var auraColor = data.color || 0xcc88ff;
    var ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.7, 0.05, 8, 22),
      new THREE.MeshBasicMaterial({ color: auraColor, transparent: true, opacity: 0.8 })
    );
    ring.position.set(data.x || 0, (data.y || 0) + 0.3, data.z || 0);
    ring.rotation.x = Math.PI / 2;
    ring.userData = { life: 0.7, fade: true, expandSpeed: 3.2 };
    scene.add(ring);
    projectiles.push(ring);
    return;
  }

  if (data.kind === 'impact') {
    if (window.VX && VX.vfx) {
      var ic = data.color || 0xffffff;
      VX.vfx.impact(
        new THREE.Vector3(data.x || 0, data.y || 1, data.z || 0),
        ic, { scale: 0.9, chipColor: ic, chipCount: 8 }
      );
    }
  }
}

// ============================================================
// 按武器类型构建弹药外观
//
// 原来这段是写死在 attack() 里的，队友端要画一样的子弹只能复制一份，
// 复制两份就会漂移（改了一处忘另一处）。抽成函数，本地和「队友攻击特效」共用。
// ============================================================
function buildProjectileMesh(w) {
  var proj;
  if (w.type === 'beam') {
    var beamGeo = new THREE.CylinderGeometry(0.08, 0.12, 0.6, 8);
    var beamMat = new THREE.MeshStandardMaterial({
      color: w.color, emissive: w.color, emissiveIntensity: 0.8, transparent: true, opacity: 0.9
    });
    proj = new THREE.Mesh(beamGeo, beamMat);
    proj.rotation.z = Math.PI / 2;
    var tip = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.25, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }));
    tip.rotation.z = -Math.PI / 2; tip.position.x = 0.4; proj.add(tip);
    var aura = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.18, 0.65, 8), new THREE.MeshBasicMaterial({ color: w.color, transparent: true, opacity: 0.15 }));
    aura.rotation.z = Math.PI / 2; proj.add(aura);
  } else if (w.type === 'orb') {
    var orbMat = new THREE.MeshStandardMaterial({ color: w.color, emissive: w.color, emissiveIntensity: 0.7, transparent: true, opacity: 0.85 });
    proj = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12), orbMat);
    var core = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }));
    proj.add(core);
    var shellGeo = new THREE.TetrahedronGeometry(0.22);
    var shell = new THREE.Mesh(shellGeo, new THREE.MeshBasicMaterial({ color: w.color, transparent: true, opacity: 0.25, wireframe: true }));
    proj.add(shell);
    proj.userData.shell = shell;
    var ring = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.02, 8, 16), new THREE.MeshBasicMaterial({ color: w.color, transparent: true, opacity: 0.4 }));
    ring.rotation.x = Math.PI / 2; proj.add(ring);
    proj.userData.ring = ring;
  } else {
    var arrowMat = new THREE.MeshStandardMaterial({ color: w.color, emissive: w.color, emissiveIntensity: 0.6, transparent: true, opacity: 0.9 });
    var arrowShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6), arrowMat);
    arrowShaft.rotation.z = Math.PI / 2;
    proj = new THREE.Group();
    proj.add(arrowShaft);
    var arrowHead = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.2, 6), arrowMat);
    arrowHead.rotation.z = -Math.PI / 2; arrowHead.position.x = 0.35; proj.add(arrowHead);
    var featherMat = new THREE.MeshBasicMaterial({ color: 0xaaccff, transparent: true, opacity: 0.6 });
    [-0.2, -0.25].forEach(function (px) {
      var feather = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.12), featherMat);
      feather.position.set(px, 0.05, 0); proj.add(feather);
    });
    var glow = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.52, 6), new THREE.MeshBasicMaterial({ color: w.color, transparent: true, opacity: 0.2 }));
    glow.rotation.z = Math.PI / 2; proj.add(glow);
  }
  return proj;
}

function attack() {
  // 如果被抓住，攻击按钮变为挣脱（需等待game-scene.js加载）
  if (typeof captureState !== 'undefined' && captureState && captureState.captured) {
    onCaptureTap();
    return;
  }

  if (GS.downed) return;   // 倒地待救时不能攻击
  if (GS.escaped) return;  // 已撤离，不再参与战斗
  if (attackCooldown > 0 || !GS.curWeapon || !GS.weapons[GS.curWeapon] || GS.gameOver || !GS.running) return;
  var w = GS.weapons[GS.curWeapon];

  // 捆仙绳：100%精准束缚视线内怪物3秒，一次性使用
  if (w.type === 'rope') {
    useBindingRope(w);
    return;
  }

  // 木棍：近距离敲打攻击
  if (w.type === 'stick') {
    stickMeleeAttack(w);
    return;
  }

  // 检查弹药（木棍等无限武器不消耗）
  var isInfinite = w.infinite || !isFinite(GS.weaponAmmo[GS.curWeapon]);
  var curAmmo = GS.weaponAmmo[GS.curWeapon] || 0;
  if (!isInfinite && curAmmo <= 0) {
    showMessage('⛔ 弹药耗尽! 寻找武器补给', 0xff4444);
    // 从装备栏移除
    delete GS.weapons[GS.curWeapon];
    delete GS.weaponAmmo[GS.curWeapon];
    GS.weaponCount = Math.max(0, GS.weaponCount - 1);
    // 切换到其他可用武器（木棍永远可用）
    var available = WEAPON_LIST.filter(function (n) { return GS.weapons[n] && GS.weaponAmmo[n] > 0; });
    if (available.length > 0) {
      GS.curWeapon = available[0];
      showMessage('⚔️ 自动切换: ' + GS.curWeapon, 0x4488ff);
    } else {
      GS.curWeapon = null;
    }
    updateWeaponBar();
    return;
  }
  // 消耗1发子弹（无限武器不消耗）
  if (!isInfinite) {
    GS.weaponAmmo[GS.curWeapon] = curAmmo - 1;
  }
  updateWeaponBar();
  // 攻击速度宝石减少冷却时间
  var _caps = getDynamicCaps();
  var _pc2 = (typeof BALANCE !== 'undefined' && BALANCE.player) ? BALANCE.player : {};
  attackCooldown = Math.max(_pc2.minCooldown || 0.15,
    (_pc2.rangedCooldown || 0.5) - Math.min((GS.atkSpeedBonus || 0), _caps.atkSpeedCap));
  AudioMgr.playAttack();
  playAttackAnimation();
  var w = GS.weapons[GS.curWeapon];
  var dmg = w.dmg + Math.min((GS.atkBonus || 0) + (GS.levelAtkBonus || 0), _caps.atkCap);  // 攻击宝石+等级增加攻击力（动态上限）

  if (GS.character === 'qike' && GS.skillActive > 0) dmg *= 1.5;
  else if (GS.character === 'baba' && GS.skillActive > 0) dmg *= 1.3;

  var dir = new THREE.Vector3(0, 0, -1);
  dir.applyQuaternion(camera.quaternion);
  dir.y = 0; dir.normalize();

  // 辅助瞄准：寻找最近且与玩家方向接近的活跃怪物（含追捕者）
  var allActiveMonsters = monsters.concat(bosses);
  if (typeof chaserMonster !== 'undefined' && chaserMonster && chaserMonster.parent && chaserMonster.userData.active) {
    allActiveMonsters.push(chaserMonster);
  }
  // 伪装者只在「已现形」时参与辅助瞄准：否则等于给玩家免费雷达，
  // 一开火就自动指向那位"看起来正常"的队友，伪装机制直接失效
  if (typeof getImpostorTargets === 'function') {
    allActiveMonsters = allActiveMonsters.concat(getImpostorTargets(true));
  }
  var closestMon = null, closestDot = -1;
  allActiveMonsters.forEach(function (m) {
    if (!m.userData.active) return;
    var mDir = new THREE.Vector3().subVectors(m.position, player.position);
    mDir.y = 0;
    var mDist = mDir.length();
    var playerRoomIdx = roomIndexOf(player.position.x, player.position.z);
    var monsterRoomIdx = roomIndexOf(m.position.x, m.position.z);
    if (playerRoomIdx === monsterRoomIdx && mDist < 15) {
      mDir.normalize();
      var dot = dir.dot(mDir);
      if (dot > closestDot) {
        closestDot = dot;
        closestMon = m;
      }
    }
  });
  if (closestMon && closestDot > 0.3) {
    var aimDir = new THREE.Vector3().subVectors(closestMon.position, player.position);
    aimDir.y = 0; aimDir.normalize();
    dir.lerp(aimDir, 0.6).normalize();
  }

  var proj = buildProjectileMesh(w);

  proj.position.copy(player.position);
  proj.position.y += 1.2;

  var angle = Math.atan2(dir.x, dir.z);
  proj.rotation.y = -angle;

  // buildProjectileMesh 给能量球挂了 shell / ring 两个自转部件，
  // 这里整体替换 userData 会把它们冲掉（更新循环里就拿不到、不会自转了），先存下来
  var _pShell = proj.userData.shell;
  var _pRing = proj.userData.ring;
  proj.userData = {
    vel: dir.clone().multiplyScalar(w.speed),
    life: 3,
    damage: dmg,
    weapon: w,
    spinPhase: Math.random() * Math.PI * 2
  };
  if (_pShell) proj.userData.shell = _pShell;
  if (_pRing) proj.userData.ring = _pRing;
  scene.add(proj);
  projectiles.push(proj);

  // 枪口特效：白闪 + 沿弹道扩散的光环 + 前冲火星
  if (window.VX && VX.vfx) {
    VX.vfx.muzzle(proj.position.clone(), dir.clone(), w.color);
    VX.vfx.shake(0.016, 0.09);
  }

  // 把这次开火广播给队友 —— 否则别人只看到血条在掉，看不到你在打
  broadcastAttackFx({
    kind: 'shot',
    x: proj.position.x, y: proj.position.y, z: proj.position.z,
    dx: dir.x, dz: dir.z,
    color: w.color, speed: w.speed, wtype: w.type,
    icon: w.icon
  });

  showMessage(w.icon + ' 攻击!', w.color);
}

// ============================================================
// 玩家对怪物的单次伤害守卫
//
// 旧实现用 perHitCap = hp / minHits 给每发伤害设上限，本意是防止秒杀 Boss，
// 但它同时也把「攻击宝石 +10 / 等级 +攻击」全部吃掉了 —— 远程武器一发
// 被压到 hp/10，加多少攻击力都打不出来。
//
// 现在只保留「防秒杀」这一条真正的下限：Boss 至少挨 8 下、小怪至少挨 3 下。
// 正常伤害不再设上限，攻击加成会真实反映在击杀速度上。
// ============================================================
function playerDamageGuard(target, dmg) {
  if (!target || !target.userData) return Math.max(1, Math.round(dmg));
  var proto = (target.userData.type && target.userData.type.hp) || target.userData.maxHp || 100;
  var combat = (typeof BALANCE !== 'undefined' && BALANCE.combat) ? BALANCE.combat : {};
  var guard = target.userData.isBoss ? (combat.bossHitGuard || 8) : (combat.minionHitGuard || 3);
  var cap = Math.max(1, Math.ceil(proto / guard));
  return Math.max(1, Math.min(Math.round(dmg), cap));
}

// ============================================================
// 怪物对玩家的单次伤害（绝对伤害模型）
//
// 旧实现是「最大生命 ÷ 固定次数」，有两个硬伤：
//   1. 章节完全不影响受到多少伤害 —— 第 5 章和第 1 章掉血一样快
//   2. 防御宝石的 +20 血量上限会同时抬高每次伤害，等于自己削自己
//
// 现在改成绝对伤害：数据表里的 dmg 是「第 1 章基准值」，再乘
// 章节威胁系数与难度系数，最后减去防御减免（最多减 50%）。
// 这样 +血量上限 能实打实多扛几下，防御也能实打实减伤。
// ============================================================
function monsterHitDamage(m) {
  var t = (m && m.userData && (m.userData.type || m.userData)) || {};
  var base = t.dmg || 10;

  // 章节威胁 + 难度系数
  var threat = (typeof BALANCE !== 'undefined') ? BALANCE.chapterThreat(GS.chapter) : 1;
  // Boss 的章节增幅打折：Boss 基础伤害本来就高，再按满额乘上去，
  // 第 5 章会出现"两下秒杀"，对小朋友过于劝退
  if (m && m.userData && m.userData.isBoss) {
    var bf = (typeof BALANCE !== 'undefined' && BALANCE.combat) ? (BALANCE.combat.bossThreatFactor || 0.55) : 0.55;
    threat = 1 + (threat - 1) * bf;
  }
  var diff = (typeof balanceDiff === 'function') ? balanceDiff(GS.difficulty) : { damage: 1 };
  var dmg = base * threat * (diff.damage || 1);

  // 防御减免：按绝对值扣，最多减免 50%，保证再肉也还是会掉血
  var caps = getDynamicCaps();
  var totalDef = Math.min((GS.defBonus || 0) + (GS.levelDefBonus || 0), caps.defCap);
  var maxReduce = (typeof BALANCE !== 'undefined' && BALANCE.combat)
    ? (BALANCE.combat.maxDefenseReduction || 0.5) : 0.5;
  var reduce = Math.min(totalDef, dmg * maxReduce);

  return Math.max(1, Math.round(dmg - reduce));
}

// ============================================================
// 捆仙绳：100%精准束缚视线内的怪物3秒，一个只能使用一次
// ============================================================
function useBindingRope(w) {
  // 寻找视线内（同房间或15米内且在镜头前方）的怪物
  var dir = new THREE.Vector3(0, 0, -1);
  dir.applyQuaternion(camera.quaternion);
  dir.y = 0; dir.normalize();

  var allActive = monsters.concat(bosses);
  // 追捕者也可被捆仙绳束缚
  if (typeof chaserMonster !== 'undefined' && chaserMonster && chaserMonster.parent && chaserMonster.userData.active) {
    allActive.push(chaserMonster);
  }
  var target = null, bestDot = 0.2; // 只要求大致朝向即可（100%精准锁定）
  allActive.forEach(function (m) {
    if (!m.userData.active || m.userData.boundTimer > 0) return;
    var mDir = new THREE.Vector3().subVectors(m.position, player.position);
    mDir.y = 0;
    var mDist = mDir.length();
    if (mDist > 18) return;
    mDir.normalize();
    var dot = dir.dot(mDir);
    if (dot > bestDot) { bestDot = dot; target = m; }
  });

  if (!target) {
    showMessage('🪢 视线内没有怪物!', 0xffcc44);
    return;
  }

  // 消耗掉捆仙绳（一次性）
  delete GS.weapons['捆仙绳'];
  delete GS.weaponAmmo['捆仙绳'];
  GS.weaponCount = Math.max(0, GS.weaponCount - 1);
  if (GS.curWeapon === '捆仙绳') {
    var available = WEAPON_LIST.filter(function (n) { return GS.weapons[n] && (GS.weaponAmmo[n] || 0) > 0; });
    GS.curWeapon = available.length > 0 ? available[0] : null;
  }
  updateWeaponBar();

  // 束缚3秒
  target.userData.boundTimer = 3;
  attackCooldown = 0.5;
  AudioMgr.playSkill();
  showMessage('🪢 捆仙绳! ' + (target.userData.type.name || '怪物') + ' 被束缚3秒!', 0xffcc44);

  // 束缚视觉：金色绳环绕怪物
  var ringGroup = new THREE.Group();
  var scale = (target.userData.type && target.userData.type.scale) || 1;
  for (var ri = 0; ri < 4; ri++) {
    var ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.9 * scale, 0.05, 8, 20),
      new THREE.MeshBasicMaterial({ color: 0xffcc44, transparent: true, opacity: 0.85 })
    );
    ring.position.y = (0.4 + ri * 0.35) * scale;
    ring.rotation.x = Math.PI / 2;
    ring.rotation.z = ri * 0.5;
    ringGroup.add(ring);
  }
  target.add(ringGroup);
  target.userData.bindRings = ringGroup;

  // 3秒后移除束缚视觉（束缚计时在AI中递减）
  setTimeout(function () {
    if (target.userData.bindRings) {
      try { target.remove(target.userData.bindRings); } catch (e) { }
      target.userData.bindRings = null;
    }
  }, 3000);
}

// ============================================================
// 木棍近战：挥棒敲打面前的怪物
// ============================================================
function stickMeleeAttack(w) {
  var _caps = getDynamicCaps();
  var _pc = (typeof BALANCE !== 'undefined' && BALANCE.player) ? BALANCE.player : {};
  attackCooldown = Math.max(_pc.minCooldown || 0.15,
    (_pc.meleeCooldown || 0.55) - Math.min((GS.atkSpeedBonus || 0), _caps.atkSpeedCap));
  AudioMgr.playAttack();

  var dir = new THREE.Vector3(0, 0, -1);
  dir.applyQuaternion(camera.quaternion);
  dir.y = 0; dir.normalize();

  // === 挥棒动画：使用角色身上的木棍，大幅挥动 ===
  // 注意：棍身旋转由 updatePlayerAnimation 驱动肩关节完成，
  // 这里只做一次"放大脉冲"，不能改 rotation（旧实现用 setInterval 累加旋转，
  // 挥完不会归零，木棍会永久歪掉）
  if (player && player.userData.stick) {
    var _stk = player.userData.stick;
    _stk.body.visible = true;
    _stk.knot.visible = true;
    _stk.glow.visible = true;
    _stk.body.scale.setScalar(1.55);
    _stk.knot.scale.setScalar(1.55);
    _stk.glow.scale.setScalar(1.55);
    _stk.glow.material.opacity = 0.5;
    setTimeout(function () {
      if (!player || !player.userData.stick) return;
      var s2 = player.userData.stick;
      s2.body.scale.setScalar(1);
      s2.knot.scale.setScalar(1);
      s2.glow.scale.setScalar(1);
      s2.glow.material.opacity = 0.15;
    }, 180);
  }

  // 挥砍弧：贴着胸口高度扫出一道月牙 + 轻微震屏
  if (window.VX && VX.vfx) {
    VX.vfx.slash(
      new THREE.Vector3(player.position.x, player.position.y + 0.92, player.position.z),
      dir, 0xffe08a, { radius: 1.85, arc: 2.25, life: 0.26 }
    );
    VX.vfx.shake(0.03, 0.15);
  }

  // 把挥砍广播给队友（不带伤害，纯视觉）
  broadcastAttackFx({
    kind: 'slash',
    x: player.position.x, y: player.position.y + 0.92, z: player.position.z,
    dx: dir.x, dz: dir.z,
    color: 0xffe08a
  });

  // === 命中判定：前方较大范围（含追捕者 / 伪装者）===
  var MELEE_RANGE = 5.0;
  var allActive = monsters.concat(bosses);
  if (typeof chaserMonster !== 'undefined' && chaserMonster && chaserMonster.parent && chaserMonster.userData.active) {
    allActive.push(chaserMonster);
  }
  // 伪装状态的伪装者也要能打：挥空一棒"验人"是玩家拆穿它的主要手段之一
  if (typeof getImpostorTargets === 'function') {
    allActive = allActive.concat(getImpostorTargets(false));
  }
  var target = null, bestDot = 0.15;
  allActive.forEach(function (m) {
    if (!m.userData.active) return;
    var mDir = new THREE.Vector3().subVectors(m.position, player.position);
    mDir.y = 0;
    var mDist = mDir.length();
    var scale = (m.userData.type && m.userData.type.scale) || 1;
    if (mDist > MELEE_RANGE * scale) return;
    mDir.normalize();
    var dot = dir.dot(mDir);
    if (dot > bestDot) { bestDot = dot; target = m; }
  });

  if (!target) {
    showMessage('🪵 挥棒落空!', 0x9a6b3f);
    playAttackAnimation();
    return;
  }

  // 伤害计算：木棍敲打
  var dmg = w.dmg + Math.min((GS.atkBonus || 0) + (GS.levelAtkBonus || 0), _caps.atkCap);
  if (GS.character === 'qike' && GS.skillActive > 0) dmg *= 1.5;
  else if (GS.character === 'baba' && GS.skillActive > 0) dmg *= 1.3;
  var dealt = playerDamageGuard(target, dmg);

  var _isChaserTarget = (typeof chaserMonster !== 'undefined' && target === chaserMonster);
  // 伪装者不进 monsters 数组（原因见 ImpostorSystem.js 顶部），
  // 所以它也不能走 dealMonsterDamage —— 那条路会给加入者广播一个没有
  // netId 的 monster_damage，主机会当成无效包丢掉，血条来回跳。
  var _isImpostorTarget = !!(target.userData && target.userData.isImpostor);
  var _meleeKilled = (_isImpostorTarget && typeof damageImpostor === 'function')
    ? damageImpostor(target, dealt)
    : dealMonsterDamage(target, dealt, _isChaserTarget);
  target.userData.lastAttackedTime = clock.elapsedTime;
  target.userData.hitFlash = 0.25;
  // 木棍命中：小怪明显击退+硬直，近战风险的回报
  target.userData.staggerTimer = Math.max(target.userData.staggerTimer || 0, target.userData.isBoss ? 0.15 : 0.35);
  if (!target.userData.isBoss) {
    var kbDir = new THREE.Vector3().subVectors(target.position, player.position);
    kbDir.y = 0;
    if (kbDir.lengthSq() > 0.0001) {
      target.position.add(kbDir.normalize().multiplyScalar(1.2));
    }
  }
  monsterHitFlash = 0.2;
  AudioMgr.playHit();
  showMessage('🪵 敲打! -' + dealt, 0xccaa66);

  // 命中特效：白热爆点 + 爪击状冲击线 + 木屑（带重力）
  var hitPos = target.position.clone();
  hitPos.y += 1.0 * ((target.userData.type && target.userData.type.scale) || 1);
  if (window.VX && VX.vfx) {
    var _hs = (target.userData.type && target.userData.type.scale) || 1;
    VX.vfx.impact(hitPos, 0xffd166, {
      scale: 1.0 * Math.min(1.3, _hs),
      chipColor: 0x9a6b3f,
      chipCount: 9
    });
    VX.vfx.slashLines(hitPos, dir, 0xffe9a8, { count: 3, length: 1.35, spread: 0.26 });
  }

  // Boss阶段变化（与子弹命中一致）
  if (target.userData.isBoss && target.userData.hp > 0) {
    var ratio = target.userData.hp / target.userData.type.hp;
    if (ratio <= 0.33 && target.userData.bossPhase > 1) {
      target.userData.bossPhase = 1;
      target.userData.speedMul = 1.5;
      showMessage('🔥 Boss 狂暴了!', 0xff2200);
      AudioMgr.playHurt();
    } else if (ratio <= 0.66 && target.userData.bossPhase > 2) {
      target.userData.bossPhase = 2;
      target.userData.speedMul = 1.25;
      showMessage('⚠️ Boss 变强了!', 0xffaa00);
    }
  }

  if (_meleeKilled) {
    onMonsterDefeated(target);
  }
  updateHUD();
}

// 怪物近战判定半径：基础半径 + 体型小幅加成。
//
// 旧实现到处写 `3.5 × 体型`：
//   小怪（scale 1~1.4）→ 3.5~4.9 米，Boss（scale 2.2）→ 7.7 米，
//   手还没伸到、血条先掉，是"莫名其妙挨打"的主要来源。
// 现在小怪约 2.7~2.9 米，Boss 约 3.6 米，和画面上的爪子长度对得上。
function monsterAttackReach(m) {
  var cfg = (typeof BALANCE !== 'undefined' && BALANCE.attack) ? BALANCE.attack : {};
  var t = (m && m.userData && m.userData.type) || {};
  var base = (m && m.userData && m.userData.isBoss) ? (cfg.bossRange || 2.6) : (cfg.minionRange || 2.2);
  return base + (cfg.rangePerScale || 0.45) * (t.scale || 1);
}

function monsterAttack(m) {
  if (GS.gameOver || !GS.running) return;
  if (GS.downed) return;   // 倒地待救时怪物不再追打，避免血量被反复压到 0
  if (GS.escaped) return;  // 已经撤离（主机观战等待队友），不该继续挨打
  if (!m || !m.userData || !m.userData.active) return;
  if (m.userData.boundTimer > 0) return; // 被捆仙绳束缚，无法攻击
  if (m.userData.staggerTimer > 0) return; // 受击硬直中，无法攻击
  if (m.userData.sleeping) return; // Boss睡眠中不会主动攻击

  var t = m.userData.type || {};
  var _atkCfg = (typeof BALANCE !== 'undefined' && BALANCE.attack) ? BALANCE.attack : {};

  // 每只怪物独立攻击冷却（不再共用全局冷却）。
  // Boss 用更长的间隔：体型大、判定宽，再按小怪的节奏连击就没法躲了。
  if (m.userData.attackCooldown > 0) return;
  m.userData.attackCooldown = m.userData.isBoss
    ? (_atkCfg.bossCooldown || 2.2)
    : (_atkCfg.minionCooldown || 1.6);

  var dir = new THREE.Vector3().subVectors(player.position, m.position);
  var dist = dir.length();
  if (dist < monsterAttackReach(m)) {
    // 专属模型的攻击动画（主刀医生劈锯 / 病人乱挠）
    if (typeof m.__creatureAttack === 'function') {
      try { m.__creatureAttack(m); } catch (e) { }
    }
    // 伤害按"击杀所需次数"计算（Boss最少3次，小怪最少5次，防御已计入）
    var dmg = monsterHitDamage(m);
    if (GS._shielded) {
      dmg = Math.ceil(dmg * 0.1);
      showMessage('🛡️ 护盾格挡!', 0x9944ff);
    }
    // 复活后的短暂无敌：不倒翁期挨打不掉血
    if (GS._invulnTimer > 0) dmg = 0;
    GS.hp -= dmg;
    updateHUD();
    hitFlash = 0.3;
    showMessage('💥 被击中! -' + dmg + '❤️', 0xff4444);
    AudioMgr.playHurt();
    playHurtAnimation();

    // === 攻击特效 ===
    createMonsterAttackEffect(m);

    // 联机：把这次挥爪广播给房间里的其他端。
    // 怪物 AI 只跑在主机上，爪击光带是纯本地特效 —— 不广播的话，
    // 其他人只会看到怪物在原地"隔空咬人"，一点打击反馈都没有。
    // 加入者本地也会调用 monsterAttack（它自己挨打时），所以这里不再限定 isHost。
    if (GS.mode === 'multiplayer' && typeof PeerManager !== 'undefined' && PeerManager.connected) {
      PeerManager.broadcast('monster_attack_fx', {
        netId: m.userData.netId || null,
        x: m.position.x,
        z: m.position.z,
        tx: player.position.x,
        tz: player.position.z,
        color: t.emissive || 0xff3322,
        scale: t.scale || 1
      });
    }

    // === 击退：将角色沿怪物→角色方向弹开一小段距离 ===
    var knockDir = dir.clone();
    knockDir.y = 0;
    if (knockDir.lengthSq() < 0.0001) knockDir.set(0, 0, 1);
    knockDir.normalize();
    var knockDist = m.userData.isBoss ? 3.0 : 2.0;
    player.position.add(knockDir.multiplyScalar(knockDist));
    playerVelY = Math.max(playerVelY, 2.5); // 小幅弹起
    GS.isJumping = true;
    GS.canJump = false;

    clampPlayer();
    if (GS.hp <= 0) handlePlayerDeath('hp');
  }
}

// 怪物攻击特效：爪击光带 + 受击爆点 + 震屏
function createMonsterAttackEffect(m) {
  if (!window.VX || !VX.vfx) return;
  // 医院专属怪物（主刀医生 / 疯魔病人）：主题化攻击特效替代通用爪击
  if (typeof hospitalAttackFX === 'function' && hospitalAttackFX(m)) return;
  var t = m.userData.type || {};
  var effColor = t.emissive || 0xff3322;
  var scale = t.scale || 1;

  // 怪物 → 角色 的水平方向
  var dir = new THREE.Vector3().subVectors(player.position, m.position);
  dir.y = 0;
  if (dir.lengthSq() < 0.0001) dir.set(0, 0, 1);
  dir.normalize();

  var mid = new THREE.Vector3().addVectors(m.position, player.position).multiplyScalar(0.5);
  mid.y += 1.0;

  // 爪击：从怪物甩向角色的三道斜向光带
  VX.vfx.slashLines(mid, dir, effColor, {
    count: 3,
    length: 1.7 * scale,
    spread: 0.34 * scale
  });

  // 角色身上的受击爆点（不要地面冲击波，避免和击退动作打架）
  var hitPos = player.position.clone();
  hitPos.y += 0.85;
  VX.vfx.impact(hitPos, effColor, {
    scale: 0.95,
    groundRing: false,
    streakCount: 7,
    chipColor: effColor,
    chipCount: 6
  });

  // Boss 打人更重
  VX.vfx.shake(m.userData.isBoss ? 0.11 : 0.075, 0.26);
}

function showGameOver() {
  var failed = GS.hp <= 0;
  // 主机要告诉服务器"这局打完了"，解除房间"对局中"标记，
  // 否则本局结束后想加入房间的新玩家会被一直拒之门外。
  if (GS.mode === 'multiplayer' && GS.isHost && typeof PeerManager !== 'undefined' && PeerManager.connected) {
    try { PeerManager._send({ type: 'end_game' }); } catch (e) { }
  }
  document.getElementById('result-title').textContent = failed ? '💔 闯关失败...' : '🎉 通关成功!';
  document.getElementById('final-answers').textContent = '✅ 答对题目: ' + GS.correct + '/' + GS.total;
  document.getElementById('final-weapons').textContent = '⚔️ 获得武器: ' + GS.weaponCount + '/3';
  if (failed) AudioMgr.playCharacterVoice('defeat');
  document.getElementById('game-over').style.display = 'flex';
  try { if (isPointerLocked) document.exitPointerLock(); } catch (e) { }
}

function gameWin() {
  showMessage('🏆 通关成功!', 0xffd700);
  GS.gameOver = true;
  GS.running = false;

  // 主机：通知服务器本局结束（见 showGameOver 注释）
  if (GS.mode === 'multiplayer' && GS.isHost && typeof PeerManager !== 'undefined' && PeerManager.connected) {
    try { PeerManager._send({ type: 'end_game' }); } catch (e) { }
  }

  GS.totalStars += GS.stars;
  // 已经没有"下一章"这个概念了：地图全部解锁，通关只累计星星
  ProgressMgr.save();

  var mapName = (typeof mapDataById === 'function') ? mapDataById(GS.chapter).name : '';
  document.getElementById('result-title').textContent = '🎉 ' + (mapName ? mapName + ' ' : '') + '通关!';
  document.getElementById('final-answers').textContent = '✅ 答对题目: ' + GS.correct + '/' + GS.total;
  document.getElementById('final-weapons').textContent = '⚔️ 获得武器: ' + GS.weaponCount + '/3';
  AudioMgr.playCharacterVoice('victory');

  document.getElementById('game-over').style.display = 'flex';
  try { if (isPointerLocked) document.exitPointerLock(); } catch (e) { }
}

// 重新选择：清除衔接信息，回到选择界面
function restartGame() {
  var btn = document.getElementById('restart-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ 加载中...'; }
  try { localStorage.removeItem('miracleForest_pending'); } catch (e) { }
  location.reload();
}