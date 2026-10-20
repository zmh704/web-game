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
    // 加入者：把伤害上报给主机，由主机权威扣血/判定死亡，本地不改 HP、不击杀
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

// 返回距离 fromPos 最近的玩家位置（联机主机端把加入者也纳入目标）
function nearestPlayerPos(fromPos) {
  if (!player) return fromPos;
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
      if (!GS.running) return clearInterval(trailInterval);
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
    statusEl.textContent = '⚡ 激活中 ' + Math.ceil(GS.skillActive) + 's';
    statusEl.style.color = '#44ff88';
    cdFillEl.style.width = '100%';
    cdFillEl.style.background = 'linear-gradient(90deg, #44ff88, #88ffcc)';
    cdTextEl.textContent = '持续 ' + Math.ceil(GS.skillActive) + 's';
    if (skillBtn) skillBtn.innerHTML = '<span class="icon">✨</span>⚡' + Math.ceil(GS.skillActive) + 's';
  } else if (GS.skillCooldown > 0) {
    // 冷却中
    var cdPct = ((GS.skillCooldownTime - GS.skillCooldown) / GS.skillCooldownTime * 100);
    statusEl.textContent = '⏳ 冷却 ' + Math.ceil(GS.skillCooldown) + 's';
    statusEl.style.color = '#ff8844';
    cdFillEl.style.width = cdPct + '%';
    cdFillEl.style.background = 'linear-gradient(90deg, #ff8844, #ffcc44)';
    cdTextEl.textContent = '冷却 ' + Math.ceil(GS.skillCooldown) + 's';
    if (skillBtn) skillBtn.innerHTML = '<span class="icon">✨</span>' + Math.ceil(GS.skillCooldown) + 's';
  } else {
    // 就绪
    statusEl.textContent = '✨ 技能就绪';
    statusEl.style.color = '#ffd700';
    cdFillEl.style.width = '100%';
    cdFillEl.style.background = 'linear-gradient(90deg, #ffd700, #ffcc44)';
    cdTextEl.textContent = '就绪';
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
        moveSpeed = 5;
        showMessage('⚡ 疾风冲刺结束', 0xff8800);
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
function attack() {
  // 如果被抓住，攻击按钮变为挣脱（需等待game-scene.js加载）
  if (typeof captureState !== 'undefined' && captureState && captureState.captured) {
    onCaptureTap();
    return;
  }

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
  attackCooldown = Math.max(0.15, 0.5 - Math.min((GS.atkSpeedBonus || 0), _caps.atkSpeedCap));
  AudioMgr.playAttack();
  playAttackAnimation();
  var w = GS.weapons[GS.curWeapon];
  var dmg = w.dmg + Math.min((GS.atkBonus || 0) + (GS.levelAtkBonus || 0), _caps.atkCap);  // 攻击宝石+等级增加攻击力（动态上限）

  if (GS.character === 'qike' && GS.skillActive > 0) dmg *= 1.5;

  var dir = new THREE.Vector3(0, 0, -1);
  dir.applyQuaternion(camera.quaternion);
  dir.y = 0; dir.normalize();

  // 辅助瞄准：寻找最近且与玩家方向接近的活跃怪物（含追捕者）
  var allActiveMonsters = monsters.concat(bosses);
  if (typeof chaserMonster !== 'undefined' && chaserMonster && chaserMonster.parent && chaserMonster.userData.active) {
    allActiveMonsters.push(chaserMonster);
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

  proj.position.copy(player.position);
  proj.position.y += 1.2;

  var angle = Math.atan2(dir.x, dir.z);
  proj.rotation.y = -angle;

  proj.userData = {
    vel: dir.clone().multiplyScalar(w.speed),
    life: 3,
    damage: dmg,
    weapon: w,
    spinPhase: Math.random() * Math.PI * 2
  };
  scene.add(proj);
  projectiles.push(proj);

  for (var i = 0; i < 3; i++) {
    (function (delay) {
      setTimeout(function () {
        var ring = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.25, 16), new THREE.MeshBasicMaterial({ color: w.color, transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
        ring.position.copy(player.position);
        ring.position.y += 1.2;
        ring.lookAt(camera.position);
        ring.userData = { expandSpeed: 2, life: 0.4 };
        scene.add(ring);
        projectiles.push(ring);
      }, delay);
    })(i * 50);
  }

  var flash = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }));
  flash.position.copy(player.position);
  flash.position.y += 1.2;
  flash.userData = { life: 0.15, shrink: true };
  scene.add(flash);
  projectiles.push(flash);

  showMessage(w.icon + ' 攻击!', w.color);
}

// ============================================================
// 怪物对玩家的单次伤害
// Boss: 最多3次击杀玩家；小怪: 最多5次击杀玩家（根据防御随机浮动）
// ============================================================
function monsterHitDamage(m) {
  var maxHp = GS.maxHp + (GS.maxHpBonus || 0) + (GS.levelHpBonus || 0);
  var caps = getDynamicCaps();
  var totalDef = Math.min((GS.defBonus || 0) + (GS.levelDefBonus || 0), caps.defCap);
  var defRatio = caps.defCap > 0 ? Math.min(1, totalDef / caps.defCap) : 0;
  var isBoss = m && m.userData && m.userData.isBoss;
  // 击杀所需次数：Boss 3~4次，小怪 5~7次（防御越高次数越多，附带随机浮动）
  var hits = isBoss ? (3 + defRatio) : (5 + defRatio * 2);
  hits -= Math.random() * 0.35; // 随机浮动（只会让伤害略高，保证不超过上限次数）
  hits = Math.max(1.5, hits);
  return Math.ceil(maxHp / hits);
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
  attackCooldown = Math.max(0.2, 0.6 - Math.min((GS.atkSpeedBonus || 0), _caps.atkSpeedCap));
  AudioMgr.playAttack();

  var dir = new THREE.Vector3(0, 0, -1);
  dir.applyQuaternion(camera.quaternion);
  dir.y = 0; dir.normalize();

  // === 挥棒动画：使用角色身上的木棍，大幅挥动 ===
  // 确保木棍可见
  if (player && player.userData.stick) {
    player.userData.stick.body.visible = true;
    player.userData.stick.knot.visible = true;
    player.userData.stick.glow.visible = true;
    // 放大木棍动画效果
    player.userData.stick.body.scale.set(1.8, 1.8, 1.8);
    player.userData.stick.knot.scale.set(1.8, 1.8, 1.8);
    player.userData.stick.glow.scale.set(1.8, 1.8, 1.8);
    player.userData.stick.glow.material.opacity = 0.5;
  }
  // 额外挥棒光效
  var swingTrail = new THREE.Mesh(
    new THREE.TorusGeometry(0.7, 0.04, 6, 16),
    new THREE.MeshBasicMaterial({ color: 0xffd700, transparent: true, opacity: 0.6, side: THREE.DoubleSide })
  );
  swingTrail.position.copy(player.position);
  swingTrail.position.y += 0.9;
  swingTrail.position.add(dir.clone().multiplyScalar(0.6));
  swingTrail.rotation.y = Math.atan2(dir.x, dir.z);
  swingTrail.rotation.x = Math.PI / 2;
  scene.add(swingTrail);
  // 快速挥动动画
  var swingT = 0;
  var swingInterval = setInterval(function () {
    swingT += 0.12;
    swingTrail.rotation.x = Math.PI / 2 + swingT * 6;
    swingTrail.scale.x = 1 + swingT * 1.5;
    swingTrail.material.opacity -= 0.08;
    // 同时挥动角色身上的木棍
    if (player && player.userData.stick) {
      player.userData.stick.body.rotation.x += 0.15;
      player.userData.stick.body.rotation.z += 0.1;
    }
    if (swingT >= 0.5) {
      clearInterval(swingInterval);
      scene.remove(swingTrail);
      // 恢复木棍大小
      if (player && player.userData.stick) {
        player.userData.stick.body.scale.set(1, 1, 1);
        player.userData.stick.knot.scale.set(1, 1, 1);
        player.userData.stick.glow.scale.set(1, 1, 1);
        player.userData.stick.glow.material.opacity = 0.15;
      }
    }
  }, 16);

  // === 命中判定：前方较大范围（含追捕者）===
  var MELEE_RANGE = 5.0;
  var allActive = monsters.concat(bosses);
  if (typeof chaserMonster !== 'undefined' && chaserMonster && chaserMonster.parent && chaserMonster.userData.active) {
    allActive.push(chaserMonster);
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

  // 伤害计算：木棍敲打，小怪最多5下击杀，Boss最多10下击杀
  var dmg = w.dmg + Math.min((GS.atkBonus || 0) + (GS.levelAtkBonus || 0), _caps.atkCap);
  if (GS.character === 'qike' && GS.skillActive > 0) dmg *= 1.5;
  var minHits = target.userData.isBoss ? 10 : 5;
  var perHitCap = Math.ceil((target.userData.type.hp || 100) / (minHits + Math.random() * 2));
  var dealt = Math.max(1, Math.min(Math.round(dmg), perHitCap));

  var _isChaserTarget = (typeof chaserMonster !== 'undefined' && target === chaserMonster);
  var _meleeKilled = dealMonsterDamage(target, dealt, _isChaserTarget);
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

  // 命中特效：木屑飞溅 + 冲击星
  var hitPos = target.position.clone();
  hitPos.y += 1.0 * ((target.userData.type && target.userData.type.scale) || 1);
  for (var i = 0; i < 8; i++) {
    var chip = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.05, 0.05),
      new THREE.MeshBasicMaterial({ color: i % 2 === 0 ? 0x9a6b3f : 0xffdd88, transparent: true, opacity: 1 })
    );
    chip.position.copy(hitPos);
    var a = Math.random() * Math.PI * 2;
    chip.userData = {
      vel: new THREE.Vector3(Math.cos(a) * (1.5 + Math.random() * 2), 1.5 + Math.random() * 2, Math.sin(a) * (1.5 + Math.random() * 2)),
      life: 0.5, fade: true
    };
    scene.add(chip);
    projectiles.push(chip);
  }
  var star = new THREE.Mesh(
    new THREE.RingGeometry(0.15, 0.25, 5),
    new THREE.MeshBasicMaterial({ color: 0xffdd44, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
  );
  star.position.copy(hitPos);
  star.lookAt(camera.position);
  star.userData = { expandSpeed: 5, life: 0.3, fade: true };
  scene.add(star);
  projectiles.push(star);

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

function monsterAttack(m) {
  if (GS.gameOver || !GS.running) return;
  if (!m || !m.userData || !m.userData.active) return;
  if (m.userData.boundTimer > 0) return; // 被捆仙绳束缚，无法攻击
  if (m.userData.staggerTimer > 0) return; // 受击硬直中，无法攻击
  if (m.userData.sleeping) return; // Boss睡眠中不会主动攻击
  // 每只怪物独立攻击冷却（不再共用全局冷却）
  if (m.userData.attackCooldown > 0) return;
  m.userData.attackCooldown = 1.5;

  var t = m.userData.type || {};
  var dir = new THREE.Vector3().subVectors(player.position, m.position);
  var dist = dir.length();
  if (dist < 3.5 * (t.scale || 1)) {
    // 伤害按"击杀所需次数"计算（Boss最少3次，小怪最少5次，防御已计入）
    var dmg = monsterHitDamage(m);
    if (GS._shielded) {
      dmg = Math.ceil(dmg * 0.1);
      showMessage('🛡️ 护盾格挡!', 0x9944ff);
    }
    GS.hp -= dmg;
    updateHUD();
    hitFlash = 0.3;
    showMessage('💥 被击中! -' + dmg + '❤️', 0xff4444);
    AudioMgr.playHurt();
    playHurtAnimation();

    // === 攻击特效 ===
    createMonsterAttackEffect(m);

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
    if (GS.hp <= 0) { GS.hp = 0; GS.gameOver = true; GS.running = false; showGameOver() }
  }
}

// 怪物攻击特效：爪击斩线 + 冲击环 + 飞溅粒子
function createMonsterAttackEffect(m) {
  var t = m.userData.type || {};
  var effColor = t.emissive || 0xff3322;
  var mid = new THREE.Vector3().addVectors(m.position, player.position).multiplyScalar(0.5);
  mid.y += 1.0;

  // 爪击斩线（3道）
  for (var ci = 0; ci < 3; ci++) {
    var slash = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 1.2, 0.06),
      new THREE.MeshBasicMaterial({ color: effColor, transparent: true, opacity: 0.9 })
    );
    slash.position.copy(mid);
    slash.position.x += (ci - 1) * 0.25;
    slash.rotation.z = -0.6 + ci * 0.15;
    slash.rotation.y = Math.random() * 0.5;
    slash.userData = { life: 0.3, fade: true };
    scene.add(slash);
    projectiles.push(slash);
  }

  // 冲击环
  var ring = new THREE.Mesh(
    new THREE.RingGeometry(0.2, 0.32, 20),
    new THREE.MeshBasicMaterial({ color: effColor, transparent: true, opacity: 0.8, side: THREE.DoubleSide })
  );
  ring.position.copy(player.position);
  ring.position.y += 0.9;
  ring.lookAt(camera.position);
  ring.userData = { expandSpeed: 6, life: 0.35, fade: true };
  scene.add(ring);
  projectiles.push(ring);

  // 飞溅粒子
  for (var pi = 0; pi < 10; pi++) {
    var sp = new THREE.Mesh(
      new THREE.SphereGeometry(0.05 + Math.random() * 0.04, 4, 4),
      new THREE.MeshBasicMaterial({ color: pi % 2 === 0 ? effColor : 0xffddaa, transparent: true, opacity: 1 })
    );
    sp.position.copy(mid);
    var pAngle = Math.random() * Math.PI * 2;
    var pSpeed = 2 + Math.random() * 2.5;
    sp.userData = {
      vel: new THREE.Vector3(Math.cos(pAngle) * pSpeed, 1 + Math.random() * 2, Math.sin(pAngle) * pSpeed),
      life: 0.5,
      fade: true
    };
    scene.add(sp);
    projectiles.push(sp);
  }
}

function showGameOver() {
  var failed = GS.hp <= 0;
  document.getElementById('result-title').textContent = failed ? '💔 闯关失败...' : '🎉 通关成功!';
  document.getElementById('final-answers').textContent = '✅ 答对题目: ' + GS.correct + '/' + GS.total;
  document.getElementById('final-weapons').textContent = '⚔️ 获得武器: ' + GS.weaponCount + '/3';
  if (failed) AudioMgr.playCharacterVoice('defeat');
  // 失败时不显示"下一章节"按钮（只有通关后由gameWin控制显示）
  var nextBtn = document.getElementById('next-chapter-btn');
  if (nextBtn) nextBtn.style.display = 'none';
  document.getElementById('game-over').style.display = 'flex';
  try { if (isPointerLocked) document.exitPointerLock(); } catch (e) { }
}

function gameWin() {
  showMessage('🏆 通关成功!', 0xffd700);
  GS.gameOver = true;
  GS.running = false;

  GS.totalStars += GS.stars;

  var hasNext = GS.chapter < CHAPTERS.length;
  if (hasNext) {
    ProgressMgr.unlockChapter(GS.chapter + 1);
  } else {
    // 最后一章也要保存累计星星
    ProgressMgr.save();
  }

  document.getElementById('result-title').textContent = '🎉 章节 ' + GS.chapter + ' 通关!';
  document.getElementById('final-answers').textContent = '✅ 答对题目: ' + GS.correct + '/' + GS.total;
  document.getElementById('final-weapons').textContent = '⚔️ 获得武器: ' + GS.weaponCount + '/3';
  AudioMgr.playCharacterVoice('victory');

  var nextBtn = document.getElementById('next-chapter-btn');
  if (hasNext) {
    nextBtn.style.display = 'inline-block';
  } else {
    nextBtn.style.display = 'none';
    document.getElementById('result-title').textContent = '🎊 全部章节通关!';
  }

  document.getElementById('game-over').style.display = 'flex';
  try { if (isPointerLocked) document.exitPointerLock(); } catch (e) { }
}

// 下一章节：保存衔接信息后刷新页面，加载时自动直接进入下一章
function nextChapter() {
  if (GS.chapter >= CHAPTERS.length) return;
  var btn = document.getElementById('next-chapter-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ 加载中...'; }
  try {
    localStorage.setItem('miracleForest_pending', JSON.stringify({
      chapter: GS.chapter + 1,
      character: GS.character,
      difficulty: GS.difficulty
    }));
  } catch (e) { console.warn('保存章节衔接信息失败', e); }
  location.reload();
}

// 重新选择：清除衔接信息，回到选择界面
function restartGame() {
  var btn = document.getElementById('restart-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ 加载中...'; }
  try { localStorage.removeItem('miracleForest_pending'); } catch (e) { }
  location.reload();
}