// ============================================================
// 更新循环
// ============================================================
function update(delta) {
  if (!GS.running || GS.gameOver) return;

  // （已移除中央房间额外刷怪：全场只保持1只Boss+1只小怪）

  if (attackCooldown > 0) attackCooldown -= delta;
  if (hitFlash > 0) hitFlash -= delta;
  if (monsterHitFlash > 0) monsterHitFlash -= delta;

  updateJump(delta);
  updateSkillTimers(delta);

  // 如果被抓住，不能移动
  if (captureState && captureState.captured) {
    // 移动键无效
  } else {
    var moveDir = new THREE.Vector3();
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
        moveVec.normalize().multiplyScalar((moveSpeed + baseSpeedBonus) * delta);
        player.position.add(moveVec);
        clampPlayer();
        player.rotation.y = Math.atan2(moveVec.x, moveVec.z);
      }
    }
  }

  var smoothFactor = IS_TOUCH ? 15 : 6;
  mouse.x += (targetMouse.x - mouse.x) * delta * smoothFactor;
  mouse.y += (targetMouse.y - mouse.y) * delta * smoothFactor;

  var camOffset = new THREE.Vector3(0, 3, 6);
  var euler = new THREE.Euler(0, 0, 0, 'YXZ');
  var quat = new THREE.Quaternion().setFromEuler(euler);
  var rotOffset = camOffset.clone().applyQuaternion(quat);
  var yQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), mouse.x);
  rotOffset.applyQuaternion(yQuat);

  var targetPos = player.position.clone().add(rotOffset);
  camera.position.lerp(targetPos, 0.1);
  camera.lookAt(player.position.x, player.position.y + 1.2, player.position.z);

  updateMonster(delta);
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

  if (energyOrb && energyOrb.userData.active) {
    // 金色宝箱：轻微浮动 + 光晕脉动
    energyOrb.position.y = groundY + Math.sin(clock.elapsedTime * 2 + energyOrb.userData.floatPhase) * 0.06;
    if (energyOrb.userData.glow) {
      energyOrb.userData.glow.material.opacity = 0.08 + Math.sin(clock.elapsedTime * 3) * 0.05;
    }
    if (energyOrb.userData.cooldown > 0) {
      energyOrb.userData.cooldown -= delta;
    } else if (player.position.distanceTo(energyOrb.position) < 2) {
      showQuiz();
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
          // 命中伤害限制：Boss至少25发、小怪10发子弹击杀
          // 抓捕者也按10发计算
          var isChaser = (tm === chaserMonster);
          var minHits = tm.userData.isBoss ? 25 : 10;
          var perHitCap = Math.ceil((tm.userData.type.hp || 100) / minHits);
          var dealt = Math.max(1, Math.min(p.userData.damage, perHitCap));
          tm.userData.hp -= dealt;
          monsterHitFlash = 0.2;
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

          if (tm.userData.hp <= 0) {
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

  // 检查怪物攻击玩家逻辑（怪物可出房间追击，近战范围内即可攻击）
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

  if (hitFlash > 0) {
    document.body.style.backgroundColor = 'rgba(255,0,0,0.03)';
  } else {
    document.body.style.backgroundColor = '';
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
  var rm = m.userData.homeRoom;

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

  var dir = new THREE.Vector3().subVectors(player.position, m.position);
  var dist = dir.length();
  dir.y = 0;

  var home = m.userData.homeRoom;
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

  if (monsterHitFlash > 0) {
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
  DOOR_POSITIONS.forEach(function(dp) {
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

  var cx = ox + player.position.x * scale, cz = oz + player.position.z * scale;
  ctx.fillStyle = '#44ff88';
  ctx.beginPath(); ctx.arc(cx, cz, 3.5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#44ff88';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(cx, cz);
  ctx.lineTo(cx + Math.sin(player.rotation.y) * 9, cz + Math.cos(player.rotation.y) * 9);
  ctx.stroke();

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
// 动画循环
// ============================================================
function animate() {
  requestAnimationFrame(animate);
  var delta = Math.min(clock.getDelta(), 0.05);
  update(delta);
  renderer.render(scene, camera);
}

// ============================================================
// 启动入口
// ============================================================
function init() {
  applyLevelBonuses();
  initScene();
}