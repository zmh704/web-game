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
  GS.skillCooldown = GS.skillCooldownTime; // 20秒冷却
  GS.skillActive = GS.skillDuration; // 10秒持续

  var isQike = GS.character === 'qike';
  if (isQike) {
    moveSpeed = 12;
    showMessage('⚡ 疾风冲刺! (持续10秒)', 0xff8800);
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

  } else {
    showMessage('🛡️ 能量护盾! (持续10秒)', 0x9944ff);
    GS._shielded = true;
    AudioMgr.playSkill();

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
  if (!statusEl) return;

  if (GS.skillActive > 0) {
    // 技能激活中
    statusEl.textContent = '⚡ 激活中 ' + Math.ceil(GS.skillActive) + 's';
    statusEl.style.color = '#44ff88';
    cdFillEl.style.width = '100%';
    cdFillEl.style.background = 'linear-gradient(90deg, #44ff88, #88ffcc)';
    cdTextEl.textContent = '持续 ' + Math.ceil(GS.skillActive) + 's';
  } else if (GS.skillCooldown > 0) {
    // 冷却中
    var cdPct = ((GS.skillCooldownTime - GS.skillCooldown) / GS.skillCooldownTime * 100);
    statusEl.textContent = '⏳ 冷却 ' + Math.ceil(GS.skillCooldown) + 's';
    statusEl.style.color = '#ff8844';
    cdFillEl.style.width = cdPct + '%';
    cdFillEl.style.background = 'linear-gradient(90deg, #ff8844, #ffcc44)';
    cdTextEl.textContent = '冷却 ' + Math.ceil(GS.skillCooldown) + 's';
  } else {
    // 就绪
    statusEl.textContent = '✨ 就绪 (按Q/技能键)';
    statusEl.style.color = '#ffd700';
    cdFillEl.style.width = '100%';
    cdFillEl.style.background = 'linear-gradient(90deg, #ffd700, #ffcc44)';
    cdTextEl.textContent = '就绪';
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
  if (GS.countdown > 0 || attackCooldown > 0 || !GS.curWeapon || !GS.weapons[GS.curWeapon] || GS.gameOver || !GS.running) return;
  // 攻击速度宝石减少冷却时间
  var _caps = getDynamicCaps();
  attackCooldown = Math.max(0.15, 0.5 - Math.min((GS.atkSpeedBonus || 0), _caps.atkSpeedCap));
  AudioMgr.playAttack();
  var w = GS.weapons[GS.curWeapon];
  var dmg = w.dmg + Math.min((GS.atkBonus || 0) + (GS.levelAtkBonus || 0), _caps.atkCap);  // 攻击宝石+等级增加攻击力（动态上限）

  if (GS.character === 'qike' && GS.skillActive > 0) dmg *= 1.5;

  var dir = new THREE.Vector3(0, 0, -1);
  dir.applyQuaternion(camera.quaternion);
  dir.y = 0; dir.normalize();

  // 辅助瞄准：寻找最近且与玩家方向接近的活跃怪物
  var allActiveMonsters = monsters.concat(bosses);
  var closestMon = null, closestDot = -1;
  allActiveMonsters.forEach(function(m) {
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

function monsterAttack(m) {
  if (GS.gameOver || !GS.running) return;
  if (!m || !m.userData || !m.userData.active) return;
  // 每只怪物独立攻击冷却（不再共用全局冷却）
  if (m.userData.attackCooldown > 0) return;
  m.userData.attackCooldown = 1.5;

  var t = m.userData.type || {};
  var dir = new THREE.Vector3().subVectors(player.position, m.position);
  var dist = dir.length();
  if (dist < 3.5 * (t.scale || 1)) {
    var dmg = t.dmg || 10;
    // 防御宝石+等级减少受到的伤害（动态上限）
    var _defCap = getDynamicCaps().defCap;
    var _totalDef = Math.min((GS.defBonus || 0) + (GS.levelDefBonus || 0), _defCap);
    dmg = Math.max(1, dmg - _totalDef);
    if (GS._shielded) {
      dmg = Math.ceil(dmg * 0.1);
      showMessage('🛡️ 护盾格挡!', 0x9944ff);
    }
    GS.hp -= dmg;
    updateHUD();
    hitFlash = 0.3;
    showMessage('💥 被击中! -' + dmg + '❤️', 0xff4444);
    AudioMgr.playHurt();
    clampPlayer();
    if (GS.hp <= 0) { GS.hp = 0; GS.gameOver = true; GS.running = false; showGameOver() }
  }
}

function showGameOver() {
  document.getElementById('result-title').textContent = GS.hp <= 0 ? '💔 闯关失败...' : '🎉 通关成功!';
  document.getElementById('final-answers').textContent = '✅ 答对题目: ' + GS.correct + '/' + GS.total;
  document.getElementById('final-weapons').textContent = '⚔️ 获得武器: ' + GS.weaponCount + '/3';
  document.getElementById('game-over').style.display = 'flex';
  if (isPointerLocked) document.exitPointerLock();
}

function gameWin() {
  showMessage('🏆 通关成功!', 0xffd700);
  GS.gameOver = true;
  GS.running = false;

  GS.totalStars += GS.stars;

  var hasNext = GS.chapter < CHAPTERS.length;
  if (hasNext) {
    ProgressMgr.unlockChapter(GS.chapter + 1);
  }

  document.getElementById('result-title').textContent = '🎉 章节 ' + GS.chapter + ' 通关!';
  document.getElementById('final-answers').textContent = '✅ 答对题目: ' + GS.correct + '/' + GS.total;
  document.getElementById('final-weapons').textContent = '⚔️ 获得武器: ' + GS.weaponCount + '/3';

  var nextBtn = document.getElementById('next-chapter-btn');
  if (hasNext) {
    nextBtn.style.display = 'inline-block';
  } else {
    nextBtn.style.display = 'none';
    document.getElementById('result-title').textContent = '🎊 全部章节通关!';
  }

  document.getElementById('game-over').style.display = 'flex';
  if (isPointerLocked) document.exitPointerLock();
}

function nextChapter() {
  if (GS.chapter < CHAPTERS.length) {
    location.reload();
  }
}