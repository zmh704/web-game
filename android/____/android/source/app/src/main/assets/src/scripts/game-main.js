// ============================================================
// 更新循环
// ============================================================
var _gameOverBroadcasted = false; // 防止重复广播

// 加入者本地怪物攻击检测（在 sendInput 前执行，确保发送最新 HP）
function joinerLocalMonsterAttack(delta) {
  if (typeof monsters === 'undefined' || !player) return;
  // 检测小怪
  for (var li = 0; li < monsters.length; li++) {
    var lm = monsters[li];
    if (!lm || !lm.userData || !lm.userData.active) continue;
    if (lm.userData.boundTimer > 0 || lm.userData.staggerTimer > 0) continue;
    if (lm.userData.attackCooldown === undefined) lm.userData.attackCooldown = 0;
    lm.userData.attackCooldown -= delta;
    if (lm.userData.attackCooldown > 0) continue;
    var lDist = player.position.distanceTo(lm.position);
    var lRange = (!lm.userData.isBoss && lm.userData.type && lm.userData.type.ranged) ? 8 : 3.5;
    if (lDist < lRange * ((lm.userData.type && lm.userData.type.scale) || 1)) {
      lm.userData.attackCooldown = 1.5;
      var lDmg = (typeof monsterHitDamage === 'function') ? monsterHitDamage(lm) : 10;
      GS.hp = Math.max(0, (GS.hp || 100) - lDmg);
      hitFlash = 0.3; updateHUD();
      if (GS.hp <= 0) { GS.hp = 0; GS.gameOver = true; GS.running = false; showGameOver(); }
      return;
    }
  }
  // 检测Boss
  if (typeof bosses !== 'undefined') {
    for (var bi = 0; bi < bosses.length; bi++) {
      var lb = bosses[bi];
      if (!lb || !lb.userData || !lb.userData.active) continue;
      if (lb.userData.boundTimer > 0 || lb.userData.staggerTimer > 0) continue;
      if (lb.userData.attackCooldown === undefined) lb.userData.attackCooldown = 0;
      lb.userData.attackCooldown -= delta;
      if (lb.userData.attackCooldown > 0) continue;
      if (player.position.distanceTo(lb.position) < 3.5 * ((lb.userData.type && lb.userData.type.scale) || 1)) {
        lb.userData.attackCooldown = 1.5;
        var bDmg = (typeof monsterHitDamage === 'function') ? monsterHitDamage(lb) : 10;
        GS.hp = Math.max(0, (GS.hp || 100) - bDmg);
        hitFlash = 0.3; updateHUD();
        if (GS.hp <= 0) { GS.hp = 0; GS.gameOver = true; GS.running = false; showGameOver(); }
        return;
      }
    }
  }
  // 检测抓捕者
  if (typeof chaserMonster !== 'undefined' && chaserMonster && chaserMonster.parent && chaserMonster.userData && chaserMonster.userData.active) {
    if (chaserMonster.userData.attackCooldown === undefined) chaserMonster.userData.attackCooldown = 0;
    chaserMonster.userData.attackCooldown -= delta;
    if (chaserMonster.userData.attackCooldown <= 0 && player.position.distanceTo(chaserMonster.position) < 2.5) {
      chaserMonster.userData.attackCooldown = 3.0;
      GS.hp = Math.max(0, (GS.hp || 100) - 15);
      hitFlash = 0.3; updateHUD();
      if (GS.hp <= 0) { GS.hp = 0; GS.gameOver = true; GS.running = false; showGameOver(); }
    }
  }
}

function update(delta) {
  // 联机模式：如果游戏结束，广播一次 game_over 并退出
  if (GS.mode === 'multiplayer' && GS.isHost && GS.gameOver && !_gameOverBroadcasted && typeof PeerManager !== 'undefined') {
    _gameOverBroadcasted = true;
    // 区分失败（HP=0）和通关（逃跑成功）
    var resultType = (GS.hp <= 0) ? 'defeat' : 'escape';
    PeerManager.broadcast('game_over', {
      winner: resultType,
      stats: { correct: GS.correct, total: GS.total, stars: GS.stars, energy: GS.energy }
    });
  }

  if (!GS.running || GS.gameOver) return;

  // 加入者本地怪物攻击检测（在 sendInput 之前执行，确保发送最新 HP）
  if (GS.mode === 'multiplayer' && !GS.isHost && typeof monsters !== 'undefined' && player) {
    joinerLocalMonsterAttack(delta);
  }

  // ===== 联机模式同步 =====
  if (GS.mode === 'multiplayer') {
    try {
      if (GS.isHost) {
        // 处理加入者的移动输入
        processJoinerInputs(delta);

        // 主机：每50ms发送世界状态快照
        SyncManager.snapshotTimer += delta * 1000;
        if (SyncManager.snapshotTimer >= SyncManager.snapshotInterval) {
          SyncManager.snapshotTimer = 0;
          SyncManager.sendSnapshot();
        }
      } else {
        // 加入者：发送玩家输入到主机
        SyncManager.sendInput();
      }
      // 更新远程玩家位置（插值）
      SyncManager.updateRemotePlayers(delta);
    } catch (e) {
      console.warn('[Multiplayer] 同步出错，跳过:', e.message);
    }
  }

  // （已移除中央房间额外刷怪：全场只保持1只Boss+1只小怪）

  if (attackCooldown > 0) attackCooldown -= delta;
  if (hitFlash > 0) hitFlash -= delta;
  if (monsterHitFlash > 0) monsterHitFlash -= delta;

  updateJump(delta);
  updateSkillTimers(delta);

  // 如果被抓住，不能移动（moveDir 保持零向量，视角仍可转动）
  var moveDir = new THREE.Vector3();
  if (captureState && captureState.captured) {
    // 移动键无效
  } else {
    if (keys['w'] || keys['arrowup']) moveDir.z -= 1;
    if (keys['s'] || keys['arrowdown']) moveDir.z += 1;
    if (keys['a'] || keys['arrowleft']) moveDir.x -= 1;
    if (keys['d'] || keys['arrowright']) moveDir.x += 1;

    if (moveDir.length() > 0) {
      moveDir.normalize();
      var camDir = new THREE.Vector3(0, 0, -1);
      camDir.applyQuaternion(camera.quaternion);
      camDir.y = 0; camDir.normalize();
      var camRight = new THREE.Vector3(1, 0, 0);
      camRight.applyQuaternion(camera.quaternion);
      camRight.y = 0; camRight.normalize();

      var moveVec = new THREE.Vector3();
      moveVec.addScaledVector(camDir, -moveDir.z);
      moveVec.addScaledVector(camRight, moveDir.x);
      moveVec.y = 0;
      if (moveVec.length() > 0) {
        var _caps = getDynamicCaps();
        var baseSpeedBonus = Math.min((GS.moveSpeedBonus || 0) + (GS.levelSpeedBonus || 0), _caps.speedCap);
        var spd = moveSpeed + baseSpeedBonus;
        // 挣脱后短暂加速逃跑
        if (captureState && captureState.escapeBoostTimer > 0) spd *= 1.5;
        moveVec.normalize().multiplyScalar(spd * delta);
        player.position.add(moveVec);
        clampPlayer();
        player.rotation.y = Math.atan2(moveVec.x, moveVec.z);
      }
    }
  }

  // 帧率无关的指数平滑：桌面端更跟手，触屏稍缓
  var smoothK = 1 - Math.exp(-(IS_TOUCH ? 18 : 14) * delta);
  mouse.x += (targetMouse.x - mouse.x) * smoothK;
  mouse.y += (targetMouse.y - mouse.y) * smoothK;

  var camOffset = new THREE.Vector3(0, 3, 6);
  var euler = new THREE.Euler(0, 0, 0, 'YXZ');
  var quat = new THREE.Quaternion().setFromEuler(euler);
  var rotOffset = camOffset.clone().applyQuaternion(quat);
  var yQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), mouse.x);
  rotOffset.applyQuaternion(yQuat);

  var targetPos = player.position.clone().add(rotOffset);
  // 相机跟随也做帧率无关平滑（被拖拽时加快跟随，避免玩家被拖出画面）
  var camK = 1 - Math.exp(-((captureState && captureState.captured) ? 10 : 6) * delta);
  camera.position.lerp(targetPos, camK);
  camera.lookAt(player.position.x, player.position.y + 1.2, player.position.z);

  // 联机加入者模式：跳过怪物AI和道具拾取，使用插值
  if (GS.mode === 'multiplayer' && !GS.isHost) {
    if (typeof SyncManager.updateSyncedMonsters === 'function') {
      SyncManager.updateSyncedMonsters(delta);
    }
  } else {
    updateMonster(delta);
  }
  updateItems(delta);

  // 更新角色动画
  updatePlayerAnimation(delta, clock.elapsedTime);
  updatePlayerAura(clock.elapsedTime);

  // 更新手电筒
  updateFlashlight(delta);

  // 更新怪物血条（实时显示）
  updateMonsterHPBar();

  // 更新抓捕者系统
  updateCaptureSystem(delta);

  // 金色宝箱和普通宝箱更新（加入者只更新动画，不触发答题）
  if (energyOrb && energyOrb.userData.active) {
    // 金色宝箱：轻微浮动 + 光晕脉动
    energyOrb.position.y = groundY + Math.sin(clock.elapsedTime * 2 + energyOrb.userData.floatPhase) * 0.06;
    if (energyOrb.userData.glow) {
      energyOrb.userData.glow.material.opacity = 0.08 + Math.sin(clock.elapsedTime * 3) * 0.05;
    }
    // 加入者不触发答题，由主机 processJoinerInputs 处理
    if (GS.mode !== 'multiplayer' || GS.isHost) {
      if (energyOrb.userData.cooldown > 0) {
        energyOrb.userData.cooldown -= delta;
      } else if (player.position.distanceTo(energyOrb.position) < 2) {
        showQuiz();
      }
    }
  }
  // 普通宝箱更新（加入者只更新动画，不触发答题）
  if (GS.mode !== 'multiplayer' || GS.isHost) {
    for (var ni = 0; ni < normalChests.length; ni++) {
      var nc = normalChests[ni];
      if (!nc.userData.active) continue;
      nc.position.y = 1.0 + Math.sin(clock.elapsedTime * 2 + nc.userData.floatPhase) * 0.2;
      nc.rotation.y += delta * nc.userData.rotSpeed;
      if (player.position.distanceTo(nc.position) < 1.5) {
        nc.userData.active = false;
        showQuiz(nc);
      }
    }
  }
  if (ship) {
    if (ship.userData.ring) {
      ship.userData.ring.rotation.z += delta * 0.8;
      var shipFull = (GS.energy || 0) >= (GS.energyMax || 5);
      ship.userData.ring.material.color.setHex(shipFull ? 0x66ffcc : 0x44ff88);
      ship.userData.ring.material.opacity = shipFull ? 0.5 + Math.sin(clock.elapsedTime * 6) * 0.25 : 0.3;
    }
    if ((GS.energy || 0) >= (GS.energyMax || 5) && !GS.escaping && player.position.distanceTo(ship.position) < 3) {
      // 联机模式：通知所有加入者逃生开始
      if (GS.mode === 'multiplayer' && GS.isHost && typeof PeerManager !== 'undefined') {
        PeerManager.broadcast('game_event', { event: 'escape' });
      }
      startEscape();
    }
  }

  updateFragments(delta);

  // 性能优化：硬限制 projectiles 数量上限
  if (projectiles.length > 500) {
    var excess = projectiles.splice(0, projectiles.length - 300);
    excess.forEach(function (p) { try { scene.remove(p); } catch (e) { } });
  }

  // 更新移动状态（用于动画）
  if (moveDir.length() > 0) {
    playerAnimState.moving = true;
    playerAnimState.idle = false;
  } else {
    playerAnimState.moving = false;
    playerAnimState.idle = true;
  }

  for (var i = projectiles.length - 1; i >= 0; i--) {
    var p = projectiles[i];
    if (!p.parent) { projectiles.splice(i, 1); continue; }

    if (p.userData.vel) {
      p.position.add(p.userData.vel.clone().multiplyScalar(delta));
    }

    p.userData.life -= delta;

    if (p.userData.weapon) {
      var w = p.userData.weapon;
      if (w.type === 'orb' && p.userData.shell) {
        p.userData.shell.rotation.x += delta * 3;
        p.userData.shell.rotation.y += delta * 2;
        p.userData.ring.rotation.z += delta * 4;
        var pulse = 1 + Math.sin(clock.elapsedTime * 8) * 0.15;
        p.scale.set(pulse, pulse, pulse);
      }
      if (w.type === 'beam') {
        p.rotation.z += delta * 6;
      }

      // 性能优化：大幅降低拖尾粒子生成率
      if (Math.random() < 0.04 && projectiles.length < 200) {
        var trail = new THREE.Mesh(
          new THREE.SphereGeometry(0.05, 4, 4),
          new THREE.MeshBasicMaterial({ color: w.color, transparent: true, opacity: 0.7 })
        );
        trail.position.copy(p.position);
        trail.userData = { life: 0.3, vel: new THREE.Vector3(0, 0, 0), fade: true };
        scene.add(trail);
        projectiles.push(trail);
      }
    }

    if (p.userData.expandSpeed) {
      p.scale.x += delta * p.userData.expandSpeed;
      p.scale.y += delta * p.userData.expandSpeed;
      p.material.opacity -= delta * 1.5;
    }

    if (p.userData.shrink) {
      p.scale.multiplyScalar(1 - delta * 6);
      p.material.opacity -= delta * 5;
    }

    if (p.userData.fade && p.material && p.material.opacity) {
      p.material.opacity -= delta * 2.5;
      p.scale.multiplyScalar(1 - delta * 1.5);
    }

    if (p.userData.playerDamage) {
      if (Math.random() < 0.5) {
        var ftrail = new THREE.Mesh(
          new THREE.SphereGeometry(0.07, 4, 4),
          new THREE.MeshBasicMaterial({ color: 0xff6622, transparent: true, opacity: 0.7 })
        );
        ftrail.position.copy(p.position);
        ftrail.userData = { life: 0.3, fade: true };
        scene.add(ftrail);
        projectiles.push(ftrail);
      }
      var pdx = p.position.x - player.position.x;
      var pdz = p.position.z - player.position.z;
      var pdy = p.position.y - player.position.y;
      var horizDist = Math.sqrt(pdx * pdx + pdz * pdz);
      var vertDist = Math.abs(pdy);
      if (horizDist < 2.0 && vertDist < 1.5) {
        // playerDamage 已按"击杀所需次数"计算（防御已计入），此处不再重复减防
        var pdmg = p.userData.playerDamage;
        if (GS._shielded) { pdmg = Math.ceil(pdmg * 0.1); showMessage('🛡️ 护盾格挡!', 0x9944ff); }
        GS.hp -= pdmg;
        hitFlash = 0.3;
        AudioMgr.playHurt();
        updateHUD();
        showMessage('💥 被击中! -' + pdmg + '❤️', 0xff4444);
        scene.remove(p);
        projectiles.splice(i, 1);
        if (GS.hp <= 0) { GS.hp = 0; GS.gameOver = true; GS.running = false; showGameOver(); }
        continue;
      }
    }
    if (p.userData.damage) {
      // 将抓捕者也加入可攻击目标
      var targetMonsters = monsters.concat(bosses);
      if (chaserMonster && chaserMonster.parent && chaserMonster.userData.active) {
        targetMonsters.push(chaserMonster);
      }
      var hitRegistered = false;

      for (var mIdx = 0; mIdx < targetMonsters.length; mIdx++) {
        var tm = targetMonsters[mIdx];
        if (!tm.userData.active) continue;

        var dist = p.position.distanceTo(tm.position);
        var hitScale = (tm.userData.type && tm.userData.type.scale) || 1;

        if (dist < 1.8 * hitScale) {
          // 命中伤害限制：Boss至少20发(正好一匣弹药)、小怪10发子弹击杀
          // 抓捕者也按10发计算
          var isChaser = (tm === chaserMonster);
          var minHits = tm.userData.isBoss ? 20 : 10;
          var perHitCap = Math.ceil((tm.userData.type.hp || 100) / minHits);
          var dealt = Math.max(1, Math.min(p.userData.damage, perHitCap));
          var _projIsChaser = (typeof chaserMonster !== 'undefined' && tm === chaserMonster);
          var _projKilled = dealMonsterDamage(tm, dealt, _projIsChaser);
          tm.userData.hitFlash = 0.2;
          // 命中硬直：短暂停顿+微击退，让子弹有"打中了"的手感
          tm.userData.staggerTimer = Math.max(tm.userData.staggerTimer || 0, tm.userData.isBoss ? 0.1 : 0.2);
          if (!tm.userData.isBoss && p.userData.vel) {
            var kb = p.userData.vel.clone();
            kb.y = 0;
            if (kb.lengthSq() > 0.0001) {
              tm.position.add(kb.normalize().multiplyScalar(0.35));
            }
          }
          AudioMgr.playHit();
          showMessage('💥 命中! -' + dealt, 0x44ff88);

          tm.userData.lastAttackedTime = clock.elapsedTime;

          var hitColor = p.userData.weapon ? p.userData.weapon.color : 0xffd700;

          var explode = new THREE.Mesh(
            new THREE.SphereGeometry(0.4, 8, 8),
            new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1 })
          );
          explode.position.copy(p.position);
          explode.userData = { life: 0.25, expandSpeed: 3, fade: true };
          scene.add(explode);
          projectiles.push(explode);

          for (var ringIdx = 0; ringIdx < 2; ringIdx++) {
            (function (delay, rColor) {
              setTimeout(function () {
                var expRing = new THREE.Mesh(
                  new THREE.RingGeometry(0.15, 0.2, 16),
                  new THREE.MeshBasicMaterial({ color: rColor, transparent: true, opacity: 0.8, side: THREE.DoubleSide })
                );
                expRing.position.copy(p.position);
                expRing.lookAt(camera.position);
                expRing.userData = { expandSpeed: 4, life: 0.4, fade: true };
                scene.add(expRing);
                projectiles.push(expRing);
              }, delay);
            })(ringIdx * 40, ringIdx === 0 ? hitColor : 0xffd700);
          }

          for (var jParticle = 0; jParticle < 15; jParticle++) {
            (function () {
              var sp = new THREE.Mesh(
                new THREE.SphereGeometry(0.05 + Math.random() * 0.03, 4, 4),
                new THREE.MeshBasicMaterial({ color: [hitColor, 0xffd700, 0xffffff][Math.floor(Math.random() * 3)], transparent: true, opacity: 1 })
              );
              sp.position.copy(p.position);
              var angle = Math.random() * Math.PI * 2;
              var speed = 2 + Math.random() * 3;
              sp.userData = {
                vel: new THREE.Vector3(Math.cos(angle) * speed, Math.random() * 2, Math.sin(angle) * speed),
                life: 0.6,
                fade: true
              };
              scene.add(sp);
              projectiles.push(sp);
            })();
          }

          for (var arc = 0; arc < 5; arc++) {
            var arcParticle = new THREE.Mesh(
              new THREE.BoxGeometry(0.02, 0.15, 0.02),
              new THREE.MeshBasicMaterial({ color: 0xaaffff, transparent: true, opacity: 0.9 })
            );
            arcParticle.position.copy(p.position);
            arcParticle.position.x += ((Math.random() - 0.5) * 0.8);
            arcParticle.position.y += ((Math.random() - 0.5) * 0.6);
            arcParticle.position.z += ((Math.random() - 0.5) * 0.8);
            arcParticle.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
            arcParticle.userData = { life: 0.2, fade: true };
            scene.add(arcParticle);
            projectiles.push(arcParticle);
          }

          scene.remove(p);
          projectiles.splice(i, 1);
          updateHUD();

          if (tm.userData.isBoss && tm.userData.hp > 0) {
            var ratio = tm.userData.hp / tm.userData.type.hp;
            if (ratio <= 0.33 && tm.userData.bossPhase > 1) {
              tm.userData.bossPhase = 1;
              tm.userData.speedMul = 1.5;
              showMessage('🔥 Boss 狂暴了!', 0xff2200);
              AudioMgr.playHurt();
            } else if (ratio <= 0.66 && tm.userData.bossPhase > 2) {
              tm.userData.bossPhase = 2;
              tm.userData.speedMul = 1.25;
              showMessage('⚠️ Boss 变强了!', 0xffaa00);
            }
          }

          if (_projKilled) {
            // 判断是否为抓捕者
            if (tm === chaserMonster) {
              // 抓捕者被击败
              tm.userData.active = false;
              if (tm.parent) scene.remove(tm);
              chaserMonster = null;
              showMessage('⚔️ 追捕者被击败了! 稍后会出现新的', 0x44ff88);
              AudioMgr.playSkill();
              spawnFragmentDrop(tm.position.clone());
              // 30秒后重新生成
              chaserLeaveTimer = 0;
              setTimeout(function () {
                if (GS.running && !GS.gameOver) spawnChaser();
              }, CHASER_RESPAWN_DELAY * 1000);
            } else {
              onMonsterDefeated(tm);
            }
          }
          hitRegistered = true;
          break;
        }
      }
      if (hitRegistered) continue;
    }

    if (p.userData.life <= 0 || (p.material && p.material.opacity !== undefined && p.material.opacity <= 0)) {
      scene.remove(p);
      projectiles.splice(i, 1);
    }
  }

  // 检查怪物攻击玩家逻辑（加入者跳过，由主机权威决定）
  if (GS.mode !== 'multiplayer' || GS.isHost) {
    var activeMonsters = monsters.concat(bosses);
    for (var mIdx = 0; mIdx < activeMonsters.length; mIdx++) {
      var am = activeMonsters[mIdx];
      if (am.userData.active) {
        var mDist = am.position.distanceTo(player.position);
        // 远程小怪攻击距离更远；Boss与近战小怪只能近距离攻击
        var attackRange = (!am.userData.isBoss && am.userData.type && am.userData.type.ranged) ? 8 : 3.5;
        if (mDist < attackRange * ((am.userData.type && am.userData.type.scale) || 1)) {
          monsterAttack(am);
        }
      }
    }
  }

  // 受击红晕：伤害越新越浓，随 hitFlash 衰减淡出
  var vig = document.getElementById('hit-vignette');
  if (vig && !(captureState && captureState.captured)) {
    vig.style.opacity = hitFlash > 0 ? Math.min(1, hitFlash * 3).toFixed(2) : '0';
  }

  updateMinimap();
}

// ============================================================
// 怪物 AI 更新 (支持多怪物与返回初始房间逻辑)
// ============================================================
function updateMonster(delta) {
  // 处理小怪物列表
  for (var i = monsters.length - 1; i >= 0; i--) {
    var m = monsters[i];
    if (!m.userData.active) {
      if (m.userData.respawnTimer > 0) {
        m.userData.respawnTimer -= delta;
        if (m.userData.respawnTimer <= 0) {
          respawnMonster(m);
        }
      }
      continue;
    }
    updateSingleMonsterAI(m, delta);
  }

  // 处理大怪物 (Boss) 列表
  for (var j = bosses.length - 1; j >= 0; j--) {
    var b = bosses[j];
    if (!b.userData.active) {
      continue;
    }
    updateSingleMonsterAI(b, delta);
  }
}

// 刷新单个小怪（注：game-scene.js 中的同名函数会覆盖此实现）
function respawnMonster(m) {
  var baseT = (typeof pickMinionType === 'function') ? pickMinionType() : (m.userData.baseType || m.userData.type);
  var t = scaleMonsterType(baseT);
  var rm = m.userData.homeRoom || ROOMS[roomIndexOf(m.position.x, m.position.z)] || ROOMS[0];

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
  showMessage("👾 守护怪在 " + rm.name + " 房间重新刷新了!", 0x88ccff);
}

// 单个怪物的运动和AI更新
function updateSingleMonsterAI(m, delta) {
  var t = m.userData.type || {};
  if (m.userData.attackCooldown > 0) m.userData.attackCooldown -= delta;

  // 捆仙绳束缚：完全无法移动和攻击
  if (m.userData.boundTimer > 0) {
    m.userData.boundTimer -= delta;
    if (m.userData.bindRings) {
      m.userData.bindRings.rotation.y += delta * 3;
    }
    return;
  }

  // 受击硬直：命中后短暂停顿，让攻击有打断感
  if (m.userData.staggerTimer > 0) {
    m.userData.staggerTimer -= delta;
    return;
  }

  // 联机主机端：怪物追踪最近的玩家（含加入者）；单机/加入者端为本地玩家
  var _tgtPos = (typeof nearestPlayerPos === 'function') ? nearestPlayerPos(m.position) : player.position;
  var dir = new THREE.Vector3().subVectors(_tgtPos, m.position);
  var dist = dir.length();
  dir.y = 0;

  var home = m.userData.homeRoom;
  // 安全兜底：没有 homeRoom 的怪物（如加入者端同步创建的）使用中央房间
  if (!home) {
    home = ROOMS[0];
  }
  var distToHome = Math.sqrt(Math.pow(m.position.x - home.cx, 2) + Math.pow(m.position.z - home.cz, 2));

  var timeSinceAttacked = clock.elapsedTime - (m.userData.lastAttackedTime || 0);
  var isAggro = (m.userData.aggroTimer > 0);

  if (m.userData.aggroTimer > 0) {
    m.userData.aggroTimer -= delta;
  }
  if (timeSinceAttacked < 0.5) {
    m.userData.aggroTimer = 5.0;
  }

  var isOutOfRoom = (distToHome > halfRoom - 1.0);

  // 追击距离上限：超过就放弃追击
  var CHASE_LIMIT = m.userData.isBoss ? 25 : 20;

  if (m.userData.isBoss) {
    // ===== Boss：睡眠系统 + 守卫出生房间 =====
    if (m.userData.sleeping === undefined) {
      m.userData.sleeping = false;
      m.userData.nonCombatTimer = 0;
    }

    // 被攻击立即惊醒（子弹/木棍命中都会刷新lastAttackedTime）
    if (m.userData.sleeping && timeSinceAttacked < 0.5) {
      wakeBoss(m, '💢 Boss被攻击惊醒了!');
    }

    if (m.userData.sleeping) {
      // --- 睡眠中：不移动不攻击，倒计时苏醒 ---
      m.userData.sleepTimer -= delta;

      // 睡眠回血（每秒约5%最大生命）
      if (m.userData.hp < t.hp) {
        m.userData.hp = Math.min(m.userData.hp + delta * t.hp * 0.05, t.hp);
      }

      // 💤 气泡粒子
      m.userData.zzTimer = (m.userData.zzTimer || 0) - delta;
      if (m.userData.zzTimer <= 0) {
        m.userData.zzTimer = 1.2;
        var zz = new THREE.Mesh(
          new THREE.TorusGeometry(0.12, 0.04, 6, 10),
          new THREE.MeshBasicMaterial({ color: 0xaaddff, transparent: true, opacity: 0.8 })
        );
        zz.position.copy(m.position);
        zz.position.y += 2.0 * (t.scale || 1);
        zz.position.x += (Math.random() - 0.5) * 0.5;
        zz.userData = { vel: new THREE.Vector3(0.2, 0.8, 0), life: 1.5, fade: true };
        scene.add(zz);
        projectiles.push(zz);
      }

      // 睡眠呼吸起伏
      m.position.y = groundY + Math.sin(clock.elapsedTime * 1.5) * 0.03;

      if (m.userData.sleepTimer <= 0) {
        wakeBoss(m, '👁️ Boss苏醒了! 小心!');
      }
      return; // 睡眠状态跳过所有移动/攻击逻辑
    }

    // --- 苏醒状态 ---
    var CHASE_LIMIT_BOSS = 25;
    // 战斗判定：见到角色（追击范围内）/ 被激怒 / 最近被攻击
    var inCombat = isAggro || dist < CHASE_LIMIT_BOSS || timeSinceAttacked < 5;
    if (inCombat) {
      m.userData.nonCombatTimer = 0;
    } else {
      // 非战斗状态持续5秒 → 进入睡眠（随机10-20秒后苏醒一次）
      m.userData.nonCombatTimer += delta;
      if (m.userData.nonCombatTimer >= 5) {
        m.userData.sleeping = true;
        m.userData.sleepTimer = 10 + Math.random() * 10;
        m.userData.nonCombatTimer = 0;
        m.userData.zzTimer = 0;
        return;
      }
    }

    var shouldReturnHome = false;
    if (dist > CHASE_LIMIT_BOSS) {
      shouldReturnHome = true;
    }
    if (timeSinceAttacked > 8.0 && !isAggro && dist > 12) {
      shouldReturnHome = true;
    }

    if (shouldReturnHome) {
      var homeDir = new THREE.Vector3(home.cx - m.position.x, 0, home.cz - m.position.z);
      var homeDist = homeDir.length();
      if (homeDist > 1.0) {
        var speed = (t.speed || 2) * 2.0;
        var move = homeDir.clone().normalize().multiplyScalar(speed * delta);
        m.position.add(move);
        m.rotation.y = Math.atan2(move.x, move.z);
        m.userData.walkPhase += delta * speed * 3;
      } else {
        m.userData.aggroTimer = 0;
      }
      // 脱战状态回血（每秒约5%最大生命）
      if (m.userData.hp < t.hp) {
        m.userData.hp = Math.min(m.userData.hp + delta * t.hp * 0.05, t.hp);
      }
    } else if (dist > 2.5 && dist < CHASE_LIMIT_BOSS) {
      // 苏醒状态见到角色：主动追击攻击
      var speed = (t.speed || 2) * (m.userData.speedMul || 1) * (isAggro ? 1.4 : 1.0);
      var move = dir.clone().normalize().multiplyScalar(speed * delta);
      m.position.add(move);
      m.rotation.y = Math.atan2(move.x, move.z);
      m.userData.walkPhase += delta * speed * 3;
    }
  } else {
    // ===== 小怪：全图巡逻，遇到角色就追击攻击 =====
    if (dist < CHASE_LIMIT && dist > 2.5) {
      // 遇到角色：发起追击
      var speed = (t.speed || 2) * (m.userData.speedMul || 1) * (isAggro ? 1.4 : 1.0);
      if (t.charge && isAggro) {
        speed *= 2.5;
      }
      var move = dir.clone().normalize().multiplyScalar(speed * delta);
      m.position.add(move);
      m.rotation.y = Math.atan2(move.x, move.z);
      m.userData.walkPhase += delta * speed * 3;
      // 追击中重置房间停留计时
      m.userData.roomStayTimer = 0;
      m.userData.travelWaypoints = null;
    } else if (dist >= CHASE_LIMIT) {
      // 未遇到角色：房间内游荡，停留超10秒换房间
      updateMinionWander(m, t, delta);
    }
  }

  // 近战小怪：每10秒一次急速冲刺攻击
  if (!m.userData.isBoss && !t.ranged) {
    if (m.userData.dashTimer === undefined) m.userData.dashTimer = 10;
    if (m.userData.dashing > 0) {
      m.userData.dashing -= delta;
      if (dist > 1.5) {
        var dashMove = dir.clone().normalize().multiplyScalar((t.speed || 2) * 5 * delta);
        m.position.add(dashMove);
        m.rotation.y = Math.atan2(dashMove.x, dashMove.z);
        m.userData.walkPhase += delta * 20;
      }
      if (dist < 3.5 * (t.scale || 1)) {
        m.userData.dashing = 0;
        monsterAttack(m);
      }
    } else {
      m.userData.dashTimer -= delta;
      if (m.userData.dashTimer <= 0 && dist > 3 && dist < CHASE_LIMIT) {
        m.userData.dashTimer = 10;
        m.userData.dashing = 1.0;
        showMessage('⚡ 小怪发起急速冲刺!', 0xff8844);
      }
    }
  }

  if (t.fly) {
    m.position.y = groundY + 0.6 + Math.sin(clock.elapsedTime * 3) * 0.25;
  } else {
    m.position.y = groundY + Math.abs(Math.sin(m.userData.walkPhase)) * 0.08;
  }

  // 远程攻击怪物发射弹丸
  if (t.ranged && !m.userData.isBoss) {
    m.userData.rangedTimer -= delta;
    if (m.userData.rangedTimer <= 0 && dist > 3 && dist < 15) {
      m.userData.rangedTimer = t.rangedCooldown || 2.5;
      var fb = new THREE.Mesh(
        new THREE.SphereGeometry(0.15, 8, 8),
        new THREE.MeshStandardMaterial({ color: t.emissive || 0xff4422, emissive: t.emissive || 0xff2200, emissiveIntensity: 0.8 })
      );
      fb.position.copy(m.position);
      fb.position.y += 1.0 * (t.scale || 1);
      var aimPoint = player.position.clone();
      aimPoint.y += 0.8;
      var fdir = new THREE.Vector3().subVectors(aimPoint, fb.position).normalize();
      fb.userData = { vel: fdir.multiplyScalar(5), life: 4, playerDamage: monsterHitDamage(m) };
      scene.add(fb);
      projectiles.push(fb);
      AudioMgr.playAttack();
      showMessage('💀 远程怪发射弹丸!', 0xff6600);
    }
  }

  // Boss只能近战攻击（狂暴阶段仅提升移速），不再远程发射火球

  // 发光动画与受击闪烁
  m.children.forEach(function (child, idx) {
    if (child.isMesh && child.material) {
      if (child.material.emissive) {
        child.material.emissiveIntensity = 0.1 + Math.sin(clock.elapsedTime * 2 + idx) * 0.08;
      }
    }
  });

  if (m.children[0] && m.children[0].geometry && m.children[0].geometry.type === 'SphereGeometry') {
    var breathe = 1 + Math.sin(clock.elapsedTime * 1.2) * 0.03;
    m.children[0].scale.setScalar(breathe);
  }

  // 逐怪受击闪光（只有被打中的怪变亮）
  if (m.userData.hitFlash > 0) {
    m.userData.hitFlash -= delta;
    m.children.forEach(function (child) {
      if (child.isMesh && child.material.emissiveIntensity !== undefined) {
        child.material.emissiveIntensity = 0.8;
      }
    });
  } else {
    for (var ci = 0; ci < m.children.length; ci++) {
      var child = m.children[ci];
      if (child.isMesh && child.material.emissiveIntensity !== undefined && child.material.emissiveIntensity > 0.5) {
        child.material.emissiveIntensity = 0.15;
      }
    }
  }
}

// ============================================================
// Boss睡眠/苏醒
// ============================================================
function wakeBoss(m, msg) {
  if (!m.userData.sleeping) return;
  m.userData.sleeping = false;
  m.userData.sleepTimer = 0;
  m.userData.nonCombatTimer = 0;
  if (msg) showMessage(msg, 0xff4444);
  // 惊醒特效：红色冲击环
  var ring = new THREE.Mesh(
    new THREE.RingGeometry(0.3, 0.45, 20),
    new THREE.MeshBasicMaterial({ color: 0xff3322, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
  );
  ring.position.copy(m.position);
  ring.position.y += 1.5 * ((m.userData.type && m.userData.type.scale) || 1);
  ring.rotation.x = -Math.PI / 2;
  ring.userData = { expandSpeed: 8, life: 0.5, fade: true };
  scene.add(ring);
  projectiles.push(ring);
  AudioMgr.playHurt();
}

// 解锁宝箱时惊醒所有睡眠中的Boss（在答题正确时调用）
function wakeAllBosses() {
  bosses.forEach(function (b) {
    if (b.userData.active && b.userData.sleeping) {
      wakeBoss(b, '💢 Boss被宝箱惊醒了! 快跑!');
      b.userData.aggroTimer = 8.0; // 惊醒后主动攻击
    }
  });
}

// ============================================================
// 小怪巡逻：房间内游荡，停留超过10秒随机去下一个房间
// （3x3网格地图，相邻房间之间直接通过门移动）
// ============================================================
function updateMinionWander(m, t, delta) {
  var speed = (t.speed || 2) * 0.8; // 巡逻速度略慢

  // 脱战巡逻时回血（每秒约5%最大生命）
  if (m.userData.hp < t.hp) {
    m.userData.hp = Math.min(m.userData.hp + delta * t.hp * 0.05, t.hp);
  }

  // 正在跨房间移动：沿路径点前进
  if (m.userData.travelWaypoints && m.userData.travelWaypoints.length > 0) {
    var wp = m.userData.travelWaypoints[0];
    var wpDir = new THREE.Vector3(wp.x - m.position.x, 0, wp.z - m.position.z);
    var wpDist = wpDir.length();
    if (wpDist < 1.5) {
      m.userData.travelWaypoints.shift();
      if (m.userData.travelWaypoints.length === 0) {
        // 抵达新房间
        m.userData.homeRoom = m.userData.travelTargetRoom || m.userData.homeRoom;
        m.userData.roomStayTimer = 0;
        m.userData.wanderTarget = null;
      }
    } else {
      var mv = wpDir.normalize().multiplyScalar(speed * 1.5 * delta); // 赶路稍快
      m.position.add(mv);
      m.rotation.y = Math.atan2(mv.x, mv.z);
      m.userData.walkPhase += delta * speed * 4;
    }
    return;
  }

  // 房间停留计时
  m.userData.roomStayTimer = (m.userData.roomStayTimer || 0) + delta;

  if (m.userData.roomStayTimer > 10) {
    // 超过10秒：随机选下一个房间，规划路径
    var curRoom = ROOMS[roomIndexOf(m.position.x, m.position.z)];
    var candidates = ROOMS.filter(function (r) { return r !== curRoom; });
    var nextRoom = candidates[Math.floor(Math.random() * candidates.length)];

    // 3x3网格路径规划：相邻房间直接走门，不相邻房间经过中间房间
    var waypoints = [];
    var cx = curRoom.cx, cz = curRoom.cz;
    var nx = nextRoom.cx, nz = nextRoom.cz;
    var H = halfRoom;

    // 判断是否相邻（曼哈顿距离=40）
    var isAdjacent = (Math.abs(cx - nx) + Math.abs(cz - nz)) <= 40;

    if (isAdjacent) {
      // 相邻房间：直接通过中间的门
      var midX = (cx + nx) / 2;
      var midZ = (cz + nz) / 2;
      waypoints.push({ x: midX, z: midZ });
    } else {
      // 不相邻（对角房间）：经过中间房间的门
      // 先到当前房间通向中间的门
      var toMidX = cx === 0 ? 0 : (cx > 0 ? H : -H);
      var toMidZ = cz === 0 ? 0 : (cz > 0 ? H : -H);
      waypoints.push({ x: toMidX, z: toMidZ });
      // 再到目标房间的门
      var fromMidX = nx === 0 ? 0 : (nx > 0 ? H : -H);
      var fromMidZ = nz === 0 ? 0 : (nz > 0 ? H : -H);
      waypoints.push({ x: fromMidX, z: fromMidZ });
    }
    // 目标房间内随机落点
    waypoints.push({
      x: nextRoom.cx + (Math.random() - 0.5) * (roomSize - 14),
      z: nextRoom.cz + (Math.random() - 0.5) * (roomSize - 14)
    });

    m.userData.travelWaypoints = waypoints;
    m.userData.travelTargetRoom = nextRoom;
    m.userData.roomStayTimer = 0;
    return;
  }

  // 房间内随机游荡
  if (!m.userData.wanderTarget ||
    Math.abs(m.position.x - m.userData.wanderTarget.x) + Math.abs(m.position.z - m.userData.wanderTarget.z) < 1.5) {
    var rm = ROOMS[roomIndexOf(m.position.x, m.position.z)];
    m.userData.wanderTarget = {
      x: rm.cx + (Math.random() - 0.5) * (roomSize - 14),
      z: rm.cz + (Math.random() - 0.5) * (roomSize - 14)
    };
  }
  var wt = m.userData.wanderTarget;
  var wDir = new THREE.Vector3(wt.x - m.position.x, 0, wt.z - m.position.z);
  if (wDir.length() > 0.5) {
    var wMv = wDir.normalize().multiplyScalar(speed * delta);
    m.position.add(wMv);
    m.rotation.y = Math.atan2(wMv.x, wMv.z);
    m.userData.walkPhase += delta * speed * 3;
  }
}

// ============================================================
// 小地图（3x3网格 + 12扇门）
// ============================================================
function updateMinimap() {
  var canvas = document.getElementById('minimap-canvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var w = 120, h = 120;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, w, h);

  var minX = -halfRoom - 20, minZ = -halfRoom - 20;
  var totalX = (halfRoom + 20) * 2, totalZ = (halfRoom + 20) * 2;
  var scale = Math.min(w / totalX, h / totalZ) * 0.9;
  var ox = w / 2, oz = h / 2;
  var H = halfRoom;

  ROOMS.forEach(function (rm) {
    var rx = ox + rm.cx * scale, rz = oz + rm.cz * scale;
    ctx.strokeStyle = 'rgba(200,180,160,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(rx - H * scale, rz - H * scale, roomSize * scale, roomSize * scale);
    if (rm.cx === 0 && rm.cz === 0) {
      ctx.fillStyle = 'rgba(255,215,0,0.08)';
      ctx.fillRect(rx - H * scale, rz - H * scale, roomSize * scale, roomSize * scale);
    }
    ctx.fillStyle = 'rgba(200,200,200,0.2)';
    ctx.font = '8px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(rm.name, rx, rz + 2);
  });

  // 画门（绿色小方块表示门洞）
  var G = DOOR_HALF;
  ctx.fillStyle = 'rgba(100,200,100,0.35)';
  DOOR_POSITIONS.forEach(function (dp) {
    var dx = dp[0], dz = dp[1];
    var isVertical = (dx === -H || dx === H);
    if (isVertical) {
      ctx.fillRect(ox + dx * scale - 2, oz + dz * scale - G * scale, 4, G * 2 * scale);
    } else {
      ctx.fillRect(ox + dx * scale - G * scale, oz + dz * scale - 2, G * 2 * scale, 4);
    }
  });

  if (ship) {
    var sx = ox + ship.position.x * scale, sz = oz + ship.position.z * scale;
    var shipReady = GS.energy >= (GS.energyMax || 5);
    var sc = shipReady ? '#66ffcc' : '#99aabb';
    // 火箭形状：机身 + 尖头 + 两侧尾翼 + 尾焰
    ctx.save();
    ctx.translate(sx, sz);
    ctx.fillStyle = sc;
    // 机身
    ctx.beginPath();
    ctx.moveTo(0, -9);          // 尖头
    ctx.quadraticCurveTo(4.5, -3, 3.5, 4);
    ctx.lineTo(-3.5, 4);
    ctx.quadraticCurveTo(-4.5, -3, 0, -9);
    ctx.closePath(); ctx.fill();
    // 尾翼
    ctx.beginPath();
    ctx.moveTo(3.5, 0); ctx.lineTo(7, 6); ctx.lineTo(3.5, 5); ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-3.5, 0); ctx.lineTo(-7, 6); ctx.lineTo(-3.5, 5); ctx.closePath(); ctx.fill();
    // 舷窗
    ctx.fillStyle = 'rgba(20,40,60,0.9)';
    ctx.beginPath(); ctx.arc(0, -2, 1.8, 0, Math.PI * 2); ctx.fill();
    // 尾焰（能量集满时闪烁）
    if (shipReady) {
      ctx.fillStyle = 'rgba(255,170,60,0.9)';
      ctx.beginPath();
      ctx.moveTo(-2, 5); ctx.lineTo(0, 9 + Math.sin(clock.elapsedTime * 8) * 1.5); ctx.lineTo(2, 5);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  if (energyOrb && energyOrb.parent) {
    var ex = ox + energyOrb.position.x * scale, ez = oz + energyOrb.position.z * scale;
    // 金色宝箱：大号闪烁金色标记
    var pulseSize = 4 + Math.sin(clock.elapsedTime * 4) * 1.5;
    ctx.fillStyle = '#ffd700';
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.arc(ex, ez, pulseSize, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,215,0,0.6)';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(ex, ez, 7, 0, Math.PI * 2); ctx.stroke();
    // 宝箱图标：小十字 + 圆点
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 7px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🎁', ex, ez);
  }

  // 小地图不显示怪物位置

  // 小地图显示怪物位置（联机模式加入者端显示同步的怪物）
  if (GS.mode === 'multiplayer' && !GS.isHost) {
    // 显示小怪（红色点）
    if (typeof monsters !== 'undefined') {
      for (var mi = 0; mi < monsters.length; mi++) {
        var mm = monsters[mi];
        if (mm && mm.userData && mm.userData.active && mm.parent) {
          var mmx = ox + mm.position.x * scale, mmz = oz + mm.position.z * scale;
          ctx.fillStyle = 'rgba(255,50,50,0.6)';
          ctx.beginPath(); ctx.arc(mmx, mmz, 2, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
    // 显示Boss（紫色大点）
    if (typeof bosses !== 'undefined') {
      for (var bi = 0; bi < bosses.length; bi++) {
        var bb = bosses[bi];
        if (bb && bb.userData && bb.userData.active && bb.parent) {
          var bbx = ox + bb.position.x * scale, bbz = oz + bb.position.z * scale;
          ctx.fillStyle = 'rgba(180,50,255,0.8)';
          ctx.beginPath(); ctx.arc(bbx, bbz, 3.5, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = 'rgba(180,50,255,0.4)';
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(bbx, bbz, 5, 0, Math.PI * 2); ctx.stroke();
        }
      }
    }
    // 显示追捕者（白色闪烁点）
    if (typeof chaserMonster !== 'undefined' && chaserMonster && chaserMonster.parent) {
      var cx2 = ox + chaserMonster.position.x * scale, cz2 = oz + chaserMonster.position.z * scale;
      var pulse2 = 2 + Math.sin(clock.elapsedTime * 4) * 0.5;
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath(); ctx.arc(cx2, cz2, pulse2, 0, Math.PI * 2); ctx.fill();
    }
  } else if (GS.mode !== 'multiplayer') {
    // 单机模式：显示怪物位置（原有逻辑保留）
  }

  var cx = ox + player.position.x * scale, cz = oz + player.position.z * scale;
  ctx.fillStyle = '#44ff88';
  ctx.beginPath(); ctx.arc(cx, cz, 3.5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#44ff88';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(cx, cz);
  ctx.lineTo(cx + Math.sin(player.rotation.y) * 9, cz + Math.cos(player.rotation.y) * 9);
  ctx.stroke();

  // 联机模式：显示远程玩家位置
  if (GS.mode === 'multiplayer' && typeof SyncManager !== 'undefined') {
    for (var rpid in SyncManager.remotePlayers) {
      var rp = SyncManager.remotePlayers[rpid];
      if (rp && rp.state) {
        var rx = ox + rp.state.x * scale, rz = oz + rp.state.z * scale;
        ctx.fillStyle = '#66ccff';
        ctx.beginPath(); ctx.arc(rx, rz, 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(102,204,255,0.5)';
        ctx.font = '6px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(rp.playerName || '玩家', rx, rz - 5);
      }
    }
  }

  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(2, 2, 50, 8);
  var miniMax = GS.energyMax || 5;
  ctx.fillStyle = '#66ffcc';
  ctx.fillRect(3, 3, (GS.energy / miniMax) * 44, 6);
  ctx.fillStyle = 'rgba(200,240,220,0.5)';
  ctx.font = '7px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('🔋' + GS.energy + '/' + miniMax, 4, 9);
}

// ============================================================
// 主机：应用道具效果到加入者（用于联机模式下加入者拾取道具）
// ============================================================
function applyItemEffectToJoiner(p, itemId) {
  switch (itemId) {
    case 'hpPotion':
      var maxHp = (p.maxHp || 100) + (p.maxHpBonus || 0);
      p.hp = Math.min(maxHp, (p.hp || 100) + 30);
      break;
    case 'speedBoots':
      p.moveSpeedBonus = (p.moveSpeedBonus || 0) + 1.5;
      break;
    case 'weapon':
      p.curWeapon = '几何能量珠';
      break;
    case 'atkGem':
      p.atkBonus = (p.atkBonus || 0) + 10;
      p.atkSpeedBonus = (p.atkSpeedBonus || 0) + 0.05;
      break;
    case 'defGem':
      p.maxHpBonus = (p.maxHpBonus || 0) + 20;
      p.defBonus = (p.defBonus || 0) + 5;
      break;
    case 'flashlight':
      p.hasFlashlight = true;
      break;
    case 'fragment':
      p.fragments = (p.fragments || 0) + 1;
      if (p.fragments >= 2) {
        p.fragments = 0;
        p.energy = (p.energy || 0) + 1;
      }
      break;
  }
}

// ============================================================
// 主机：处理加入者的移动输入
// ============================================================
function processJoinerInputs(delta) {
  if (GS.mode !== 'multiplayer' || !GS.isHost) return;
  if (typeof PeerManager === 'undefined') return;

  var localEnergyOrb = window.energyOrb;
  var localNormalChests = window.normalChests;
  var localItems = window.items;

  for (var pid in PeerManager.players) {
    if (pid === PeerManager.playerId) continue;
    var p = PeerManager.players[pid];
    // 位置由加入者通过 player_input 发送，主机直接信任（客户端预测）
    if (!p.position) {
      p.position = { x: 0, z: -4 };
      p.rotationY = 0;
    }

    // 处理加入者技能状态（用于快照同步给其他加入者）
    if (p.skill) {
      p.skillActive = 3.0;
      p.skill = false;
    }
    if (p.skillActive > 0) {
      p.skillActive -= delta;
    }

    // 检测加入者是否靠近宝箱
    if (p._quizCooldown === undefined) p._quizCooldown = 0;
    if (p._quizCooldown > 0) p._quizCooldown -= delta;

    // 检测金色宝箱（使用 per-player 冷却，避免被全局 currentQuizChest 阻塞）
    if (localEnergyOrb && localEnergyOrb.userData && localEnergyOrb.userData.active) {
      var distToOrb = Math.sqrt(
        Math.pow(p.position.x - localEnergyOrb.position.x, 2) +
        Math.pow(p.position.z - localEnergyOrb.position.z, 2)
      );
      if (distToOrb < 2 && p._quizCooldown <= 0) {
        p._quizCooldown = 2;
        // 触发答题
        triggerQuizForPlayer(pid, pickRandomQuestion());
      }
    }

    // 检测普通宝箱（使用 per-player 冷却）
    if (localNormalChests) {
      for (var ni = 0; ni < localNormalChests.length; ni++) {
        var nc = localNormalChests[ni];
        if (!nc.userData.active) continue;
        var distToChest = Math.sqrt(
          Math.pow(p.position.x - nc.position.x, 2) +
          Math.pow(p.position.z - nc.position.z, 2)
        );
        if (distToChest < 1.5 && p._quizCooldown <= 0) {
          p._quizCooldown = 2;
          nc.userData.active = false;
          triggerQuizForPlayer(pid, pickRandomQuestion());
          break;
        }
      }
    }

    // 检测道具拾取
    if (localItems) {
      for (var ii = 0; ii < localItems.length; ii++) {
        var it = localItems[ii];
        if (!it.userData.active) continue;
        var distToItem = Math.sqrt(
          Math.pow(p.position.x - it.position.x, 2) +
          Math.pow(p.position.z - it.position.z, 2)
        );
        if (distToItem < 1.5) {
          it.userData.active = false;
          // 应用道具效果到加入者状态
          var itemId = it.userData.itemType ? it.userData.itemType.id : null;
          if (itemId) {
            applyItemEffectToJoiner(p, itemId);
          }
          // 通知加入者拾取道具
          PeerManager.sendTo(pid, 'game_event', {
            event: 'item_pickup',
            itemType: it.userData.itemType ? it.userData.itemType.id : 'unknown',
            message: it.userData.itemType ? it.userData.itemType.desc : '拾取道具'
          });
          // 移除道具并安排刷新
          var pickRoom = null;
          for (var ri = 0; ri < ROOMS.length; ri++) {
            if (Math.abs(it.position.x - ROOMS[ri].cx) < roomSize / 2 &&
              Math.abs(it.position.z - ROOMS[ri].cz) < roomSize / 2) {
              pickRoom = ROOMS[ri];
              break;
            }
          }
          // 从场景移除
          if (it.parent) scene.remove(it);
          localItems.splice(ii, 1);
          ii--;
          // 10秒后刷新
          if (pickRoom) {
            (function (room, roomCx, roomCz) {
              setTimeout(function () {
                spawnItemsInRoom(room);
                // 联机模式：广播道具刷新通知
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

    // 检测加入者拾取碎片（由主机权威处理）
    var localFragments = window.fragmentDrops;
    if (localFragments) {
      for (var fi = 0; fi < localFragments.length; fi++) {
        var ff = localFragments[fi];
        if (!ff.parent) continue;
        var distToFrag = Math.sqrt(
          Math.pow(p.position.x - ff.position.x, 2) +
          Math.pow(p.position.z - ff.position.z, 2)
        );
        if (distToFrag < 1.5) {
          // 加入者拾取碎片
          if (p.fragments === undefined) p.fragments = 0;
          p.fragments = (p.fragments || 0) + 1;
          if (p.fragments >= 2) {
            p.fragments = 0;
            p.energy = (p.energy || 0) + 1;
          }
          // 移除碎片
          if (ff.parent) scene.remove(ff);
          localFragments.splice(fi, 1);
          fi--;
          break;
        }
      }
    }

    // 加入者怪物攻击由本地 update() 检测，主机不再重复计算

    // 检测加入者死亡
    if (p.hp <= 0 && !GS.gameOver) {
      GS.gameOver = true;
      GS.running = false;
      if (!_gameOverBroadcasted) {
        _gameOverBroadcasted = true;
        PeerManager.broadcast('game_over', {
          winner: 'defeat',
          stats: { correct: GS.correct, total: GS.total, stars: GS.stars, energy: GS.energy }
        });
      }
      showGameOver();
    }

    // 更新远程玩家 3D 模型位置（主机端渲染加入者）
    var rp = SyncManager.remotePlayers[pid];
    if (rp) {
      // 主机端：加入者位置每帧更新，直接设置位置（不插值，避免延迟卡顿）
      rp.mesh.position.x = p.position.x;
      rp.mesh.position.z = p.position.z;
      rp.mesh.rotation.y = p.rotationY || 0;
      // 保存状态供快照使用（其他加入者通过快照接收位置）
      rp.state = {
        x: p.position.x,
        z: p.position.z,
        rotY: p.rotationY || 0,
        hp: p.hp || 100,
        maxHp: p.maxHp || 100,
        energy: p.energy || 0,
        energyMax: p.energyMax || 5,
        curWeapon: p.curWeapon || '木棍',
        isJumping: p.isJumping || false,
        level: p.level || 1
      };
      rp.prevState = rp.state;
      rp.interpStartTime = Date.now();
      rp.interpDuration = 100;
    } else {
      // 远程玩家模型不存在，尝试创建
      SyncManager.createRemotePlayer(pid, p.character || 'qike', p.name || '玩家');
    }
  }
}

// 选取随机题目
function pickRandomQuestion() {
  var pool = QDB[GS.difficulty] || QDB.easy;
  if (!GS.usedQuestions) GS.usedQuestions = {};
  if (!GS.usedQuestions[GS.difficulty]) GS.usedQuestions[GS.difficulty] = [];
  var used = GS.usedQuestions[GS.difficulty];
  var available = [];
  for (var idx = 0; idx < pool.length; idx++) {
    if (used.indexOf(idx) === -1) available.push(idx);
  }
  if (available.length === 0) {
    GS.usedQuestions[GS.difficulty] = [];
    for (var ri = 0; ri < pool.length; ri++) available.push(ri);
  }
  var randIdx = Math.floor(Math.random() * available.length);
  var chosenIdx = available[randIdx];
  used.push(chosenIdx);
  return pool[chosenIdx];
}

// ============================================================
// 动画循环
// ============================================================
function animate() {
  requestAnimationFrame(animate);
  var delta = Math.min(clock.getDelta(), 0.05);
  try {
    update(delta);
  } catch (e) {
    console.error('[Game] update() 出错:', e);
  }
  try {
    renderer.render(scene, camera);
  } catch (e) {
    console.error('[Game] render() 出错:', e);
  }
}

// ============================================================
// 启动入口
// ============================================================
function init() {
  console.log('[Game] init() 调用: GS.mode=' + GS.mode + ' GS.isHost=' + GS.isHost + ' PeerManager.connected=' + (PeerManager ? PeerManager.connected : 'N/A'));
  applyLevelBonuses();
  // 重置联机广播标志
  _gameOverBroadcasted = false;
  // 先初始化联机同步（注册消息处理器，确保不丢失快照）
  if (GS.mode === 'multiplayer' && SyncManager) {
    SyncManager.initMultiplayerMode();
  }
  // 再初始化场景（场景中会设置 window.scene 等供同步模块使用）
  initScene();

  // 主机端：为所有已连接的加入者创建远程玩家 3D 模型
  if (GS.mode === 'multiplayer' && GS.isHost && PeerManager && PeerManager.connected) {
    console.log('[Game] init: 主机模式，创建远程玩家模型');
    var playerList = PeerManager.getPlayerList();
    playerList.forEach(function (p) {
      if (p.id !== PeerManager.playerId) {
        // 延迟创建，确保场景就绪
        setTimeout(function () {
          SyncManager.createRemotePlayer(p.id, p.character || 'qike', p.name || '玩家');
        }, 100);
      }
    });
  }

  // 加入者端：场景就绪后请求一次完整世界状态
  if (GS.mode === 'multiplayer' && !GS.isHost && PeerManager && PeerManager.connected) {
    console.log('[Game] init: 加入者模式，请求世界状态');
    setTimeout(function () {
      PeerManager.broadcast('world_state_request', {});
    }, 500);
  }
}