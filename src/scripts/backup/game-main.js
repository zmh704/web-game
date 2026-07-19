// ============================================================
// 更新循环
// ============================================================
function update(delta) {
  if (!GS.running || GS.gameOver) return;

  // === 开局5秒倒计时 ===
  if (GS.countdown > 0) {
    GS.countdown -= delta;
    var countdownEl = document.getElementById('countdown-number');
    var overlayEl = document.getElementById('countdown-overlay');
    var number = Math.ceil(GS.countdown);
    if (countdownEl) countdownEl.textContent = number;
    if (overlayEl) overlayEl.classList.remove('hidden');
    if (GS.countdown <= 0) {
      GS.countdown = 0;
      if (overlayEl) overlayEl.classList.add('hidden');
      showMessage('⚔️ 战斗开始!', 0xffd700);
    }
    // 倒计时期间跳过所有其他更新逻辑
    return;
  }

  if (attackCooldown > 0) attackCooldown -= delta;
  if (hitFlash > 0) hitFlash -= delta;
  if (monsterHitFlash > 0) monsterHitFlash -= delta;

  updateJump(delta);
  updateSkillTimers(delta);

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

  if (energyOrb && energyOrb.userData.active) {
    energyOrb.position.y = 1.2 + Math.sin(clock.elapsedTime * 2 + energyOrb.userData.floatPhase) * 0.15;
    energyOrb.rotation.y += delta * 0.8;
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
    // 能量集满后，玩家主动走到飞船旁触发逃离
    if ((GS.energy || 0) >= (GS.energyMax || 5) && !GS.escaping && player.position.distanceTo(ship.position) < 3) {
      startEscape();
    }
  }

  updateFragments(delta);

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

      if (Math.random() < 0.4) {
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
      // 火球尾迹效果
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
      // 改进火球碰撞检测：使用更大的检测半径 + 水平/垂直分离检测，防止高速火球穿透
      var pdx = p.position.x - player.position.x;
      var pdz = p.position.z - player.position.z;
      var pdy = p.position.y - player.position.y;
      var horizDist = Math.sqrt(pdx * pdx + pdz * pdz);
      var vertDist = Math.abs(pdy);
      // 水平距离 < 2.0 且 垂直距离 < 1.5 即判定为命中（相比之前仅用1.5球体半径，大幅提升捕获率）
      if (horizDist < 2.0 && vertDist < 1.5) {
        var pdmg = p.userData.playerDamage;
        // 防御宝石+等级减少受到的伤害（动态上限）
        var _defCap = getDynamicCaps().defCap;
        var _totalDef = Math.min((GS.defBonus || 0) + (GS.levelDefBonus || 0), _defCap);
        pdmg = Math.max(1, pdmg - _totalDef);
        if (GS._shielded) { pdmg = Math.ceil(pdmg * 0.1); showMessage('🛡️ 护盾格挡!', 0x9944ff); }
        GS.hp -= pdmg;
        hitFlash = 0.3;
        AudioMgr.playHurt();
        updateHUD();
        showMessage('💥 被火球击中! -' + pdmg + '❤️', 0xff4444);
        scene.remove(p);
        projectiles.splice(i, 1);
        if (GS.hp <= 0) { GS.hp = 0; GS.gameOver = true; GS.running = false; showGameOver(); }
        continue;
      }
    }
    if (p.userData.damage) {
      // 合并小怪和Boss作为潜在受击目标列表
      var targetMonsters = monsters.concat(bosses);
      var hitRegistered = false;

      for (var mIdx = 0; mIdx < targetMonsters.length; mIdx++) {
        var tm = targetMonsters[mIdx];
        if (!tm.userData.active) continue;

        var dist = p.position.distanceTo(tm.position);
        var hitScale = (tm.userData.type && tm.userData.type.scale) || 1;

        if (dist < 1.8 * hitScale) {
          tm.userData.hp -= p.userData.damage;
          monsterHitFlash = 0.2;
          AudioMgr.playHit();
          showMessage('💥 命中! -' + p.userData.damage, 0x44ff88);

          // 更新被击中怪物的被攻击时间（如果是Boss，还会有特殊的暴怒逻辑）
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
            onMonsterDefeated(tm);
          }
          hitRegistered = true;
          break; // 跳出内层循环，每个子弹只能击中一只怪
        }
      }
      if (hitRegistered) continue; // 直接处理下一个子弹
    }

    if (p.userData.life <= 0 || (p.material && p.material.opacity !== undefined && p.material.opacity <= 0)) {
      scene.remove(p);
      projectiles.splice(i, 1);
    }
  }

  // 检查怪物攻击玩家逻辑
  var activeMonsters = monsters.concat(bosses);
  for (var mIdx = 0; mIdx < activeMonsters.length; mIdx++) {
    var am = activeMonsters[mIdx];
    if (am.userData.active) {
      // 非Boss怪物：只有玩家在怪物所在房间或怪物被激怒时才攻击
      // Boss：始终可以攻击（包括火球）
      if (!am.userData.isBoss) {
        var playerRoom = roomIndexOf(player.position.x, player.position.z);
        var monsterHomeRoom = roomIndexOf(am.userData.homeRoom.cx, am.userData.homeRoom.cz);
        var isAggro = (am.userData.aggroTimer > 0);
        if (playerRoom !== monsterHomeRoom && !isAggro) continue;
      }
      var mDist = am.position.distanceTo(player.position);
      if (mDist < 3.5 * ((am.userData.type && am.userData.type.scale) || 1)) {
        monsterAttack(am); // 对每只能够攻击玩家的怪物触发攻击
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
      // 如果怪物不活跃（被打败），检查刷新倒计时
      if (m.userData.respawnTimer > 0) {
        m.userData.respawnTimer -= delta;
        if (m.userData.respawnTimer <= 0) {
          // 一分钟后在初始房间重新刷新小怪物
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

// 刷新单个小怪
function respawnMonster(m) {
  // 重生时应用时间增强（始终基于原始模板，避免多次重生复利叠加）
  var baseT = m.userData.baseType || m.userData.type;
  var t = scaleMonsterType(baseT);
  var rm = m.userData.homeRoom;
  
  // 重新建立Mesh
  var g = buildMonsterMesh(t);
  if (t.scale && t.scale !== 1) g.scale.setScalar(t.scale);
  
  var x = rm.cx + (Math.random() - 0.5) * (roomSize - 6);
  var z = rm.cz + (Math.random() - 0.5) * (roomSize - 6);
  g.position.set(x, groundY, z);
  scene.add(g);

  // 复制/重置状态
  g.userData = {
    radius: 0.9 * (t.scale || 1),
    active: true,
    walkPhase: 0,
    type: t,
    baseType: baseT, // 保留原始模板供下次重生计算增强
    isBoss: false,
    speedMul: 1,
    homeRoom: rm,
    returnHomeTimer: 0,
    lastAttackedTime: clock.elapsedTime,
    respawnTimer: 0
  };
  g.userData.hp = t.hp;

  // 用新模型替换数组中的旧模型
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
  // 独立攻击冷却递减
  if (m.userData.attackCooldown > 0) m.userData.attackCooldown -= delta;
  var dir = new THREE.Vector3().subVectors(player.position, m.position);
  var dist = dir.length();
  dir.y = 0;

  var home = m.userData.homeRoom;
  var distToHome = Math.sqrt(Math.pow(m.position.x - home.cx, 2) + Math.pow(m.position.z - home.cz, 2));
  
  // 判断是否被玩家攻击（无论玩家在哪个房间）
  var timeSinceAttacked = clock.elapsedTime - (m.userData.lastAttackedTime || 0);
  var isAggro = (m.userData.aggroTimer > 0);

  // 被攻击后进入暴怒追击状态（持续5秒），追击期间可跨越房间
  if (m.userData.aggroTimer > 0) {
    m.userData.aggroTimer -= delta;
  }
  // 被击中后激怒
  if (timeSinceAttacked < 0.5) {
    m.userData.aggroTimer = 5.0;
  }

  // 怪物是否离开自己房间
  var isOutOfRoom = (distToHome > halfRoom - 1.0);

  // 自动回家和回血逻辑：
  // 如果怪物未被攻击超过8秒，且离开房间较远或距离玩家太远，则自动回家并回血
  var shouldReturnHome = false;
  if (timeSinceAttacked > 8.0 && !isAggro && dist > 12) {
    shouldReturnHome = true;
  }
  // 如果离开房间太远（超出房间边界2个房间），强制回家
  if (distToHome > halfRoom * 2) {
    shouldReturnHome = true;
  }

  if (shouldReturnHome) {
    // 自动回自己的房间（无视边界）
    var homeDir = new THREE.Vector3(home.cx - m.position.x, 0, home.cz - m.position.z);
    var homeDist = homeDir.length();
    if (homeDist > 1.0) {
      var speed = (t.speed || 2) * 2.0;
      var move = homeDir.clone().normalize().multiplyScalar(speed * delta);
      m.position.add(move);
      m.rotation.y = Math.atan2(move.x, move.z);
      m.userData.walkPhase += delta * speed * 3;
    } else {
      // 回到家里，重置aggro，开始回血
      m.userData.aggroTimer = 0;
      if (m.userData.hp < t.hp) {
        m.userData.hp = Math.min(m.userData.hp + delta * 10, t.hp);
      }
    }
  } else if (dist > 2.5 && dist < 25 && (isAggro || roomIndexOf(player.position.x, player.position.z) === roomIndexOf(home.cx, home.cz))) {
    // 追击角色：被激怒时无视房间边界；否则只在同一房间内追击
    var speed = (t.speed || 2) * (m.userData.speedMul || 1) * (isAggro ? 1.4 : 1.0);
    var move = dir.clone().normalize().multiplyScalar(speed * delta);
    m.position.add(move);
    m.rotation.y = Math.atan2(move.x, move.z);
    m.userData.walkPhase += delta * speed * 3;
  }

  // 漂浮或行走动效
  if (t.fly) {
    m.position.y = groundY + 0.6 + Math.sin(clock.elapsedTime * 3) * 0.25;
  } else {
    m.position.y = groundY + Math.abs(Math.sin(m.userData.walkPhase)) * 0.08;
  }

  // Boss远程火球逻辑
  if (m.userData.isBoss) {
    m.userData.rangedTimer -= delta;
    if (m.userData.rangedTimer <= 0 && dist > 3 && dist < 20) {
      m.userData.rangedTimer = m.userData.bossPhase <= 1 ? 1.6 : 2.5;
      var fb = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0xff4422, emissive: 0xff2200, emissiveIntensity: 0.8 })
      );
      fb.position.copy(m.position);
      fb.position.y += 1.2 * (t.scale || 1);
      // 瞄准玩家身体中心，确保火球能命中
      var aimPoint = player.position.clone();
      aimPoint.y += 0.8;
      var fdir = new THREE.Vector3().subVectors(aimPoint, fb.position).normalize();
      fb.userData = { vel: fdir.multiplyScalar(6.5), life: 4, playerDamage: Math.ceil((t.dmg || 15) * 0.7) };
      scene.add(fb);
      projectiles.push(fb);
      AudioMgr.playAttack();
      showMessage('☄️ Boss 发射火球!', 0xff6600);
    }
  }

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
// 小地图
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

  ROOMS.forEach(function (rm) {
    var rx = ox + rm.cx * scale, rz = oz + rm.cz * scale;
    ctx.strokeStyle = 'rgba(200,180,160,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(rx - halfRoom * scale, rz - halfRoom * scale, roomSize * scale, roomSize * scale);
    if (rm.cx === 0 && rm.cz === 0) {
      ctx.fillStyle = 'rgba(255,215,0,0.08)';
      ctx.fillRect(rx - halfRoom * scale, rz - halfRoom * scale, roomSize * scale, roomSize * scale);
    }
    ctx.fillStyle = 'rgba(200,200,200,0.2)';
    ctx.font = '8px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(rm.name, rx, rz + 2);
  });

  ctx.fillStyle = 'rgba(100,200,100,0.25)';
  var G = DOOR_HALF;
  [[0, -halfRoom, 0, halfRoom], [0, halfRoom, 0, -halfRoom], [-halfRoom, 0, halfRoom, 0], [halfRoom, 0, -halfRoom, 0]].forEach(function (d) {
    ctx.fillRect(ox + d[0] * scale - G * scale, oz + d[1] * scale - 2, G * 2 * scale, 4);
  });

  if (ship) {
    var sx = ox + ship.position.x * scale, sz = oz + ship.position.z * scale;
    var shipReady = GS.energy >= (GS.energyMax || 5);
    ctx.fillStyle = shipReady ? '#66ffcc' : '#99aabb';
    ctx.beginPath();
    ctx.moveTo(sx - 8, sz + 6); ctx.lineTo(sx - 5, sz - 6); ctx.lineTo(sx + 5, sz - 6); ctx.lineTo(sx + 8, sz + 6);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = shipReady ? '#66ffcc' : '#99aabb';
    ctx.lineWidth = 1; ctx.stroke();
  }

  if (energyOrb && energyOrb.parent) {
    var ex = ox + energyOrb.position.x * scale, ez = oz + energyOrb.position.z * scale;
    ctx.fillStyle = '#ffd700';
    ctx.beginPath(); ctx.arc(ex, ez, 4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,215,0,0.4)';
    ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(ex, ez, 6, 0, Math.PI * 2); ctx.stroke();
  }

  var activeMonsters = monsters.concat(bosses);
  activeMonsters.forEach(function(m) {
    if (m.userData.active) {
      var mx = ox + m.position.x * scale, mz = oz + m.position.z * scale;
      ctx.fillStyle = m.userData.isBoss ? '#ffd700' : '#ff2244'; // Boss和小怪用不同颜色标识
      ctx.beginPath(); ctx.arc(mx, mz, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = m.userData.isBoss ? 'rgba(255,215,0,0.3)' : 'rgba(255,34,68,0.3)';
      ctx.beginPath(); ctx.arc(mx, mz, 7, 0, Math.PI * 2); ctx.fill();
    }
  });

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
