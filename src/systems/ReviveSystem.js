// ============================================================
// ReviveSystem - 联机倒地待救 + 复活 + 观战
//
// 需求：联机模式下死亡不再直接结束整局；倒地的角色可以由队友救起，
//       等待期间进入观战视角。
//
// 设计要点：
//   · 死亡入口统一收敛到 handlePlayerDeath()。原来 5 处各自写了
//     `GS.hp=0; GS.gameOver=true; GS.running=false; showGameOver()`
//     （子弹打中、怪物近战、抓捕者、木棍……），联机想改一个都改不过来。
//   · 倒地 ≠ 死亡：单机/通关失败仍然走原来的结算界面，只有联机才进入待救态。
//   · 复活采用"靠近 + 持续 3 秒"，不需要额外按键 —— 桌面和触屏行为一致，
//     也不会和攻击/技能按钮抢手势。
//   · 复活由发起方广播 player_revived，被救者本地恢复血量；
//     血量本身每帧都在同步，其他人看到的就是血条从 0 涨回去。
// ============================================================

var REVIVE_CFG = {
  range: 3.2,          // 队友进入这个距离开始计算救援
  holdTime: 3.0,       // 需要持续待在一起的秒数
  hpRatio: 0.5,        // 复活后恢复的血量比例
  invulnTime: 2.5,     // 复活后的无敌时间，避免刚站起来被秒
  allDownGrace: 3.0,     // 加入者本地判负的宽限期，留给主机广播到达
  reviveGrace: 1.5       // 救援进度宽容期：被怪物击退脱圈后多久内还能续上
};

/** 是否处于"合作模式"（联机且整局还没结束） */
function isCoopRun() {
  return GS.mode === 'multiplayer' && !GS.gameOver;
}

// ============================================================
// 死亡入口（所有伤害结算最终都走这里）
// ============================================================
function handlePlayerDeath(cause) {
  GS.hp = 0;

  // 单机 / 已在结算界面：维持原来的失败流程
  if (!isCoopRun()) {
    if (!GS.gameOver) {
      GS.gameOver = true;
      GS.running = false;
      if (typeof showGameOver === 'function') showGameOver();
    }
    return;
  }

  // 倒地已经生效过就不重复触发（倒地后还会持续受到伤害判定）
  if (GS.downed) return;

  GS.downed = true;
  GS._reviveHold = 0;
  GS._downAt = Date.now();

  // 退出可能正在进行的技能状态，避免倒在地上还在飞行/开护盾
  if (typeof GS !== 'undefined') {
    GS._flying = false;
    GS._shielded = false;
    GS.skillActive = 0;
    // 清掉跳跃状态：倒地后 y 由爬行姿态统一压到地面，
    // 留着 isJumping=true 会让 updateJump 每帧继续改 y，出现抖动。
    GS.isJumping = false;
    GS.canJump = true;
    if (typeof flashlightActive !== 'undefined' && flashlightActive && typeof toggleFlashlight === 'function') {
      try { toggleFlashlight(); } catch (e) { }
    }
  }

  if (typeof PeerManager !== 'undefined' && PeerManager.connected) {
    PeerManager.broadcast('player_down', { playerId: PeerManager.playerId, cause: cause || 'hp' });
  }

  showSpectatorHud(true);
  if (typeof showMessage === 'function') {
    showMessage('💀 你倒下了！可以慢慢爬行，队友靠近 3 秒能救你', 0xff6b6b);
  }
  if (typeof AudioMgr !== 'undefined' && AudioMgr.playHurt) AudioMgr.playHurt();
}

/** 被队友救起 */
function reviveLocalPlayer() {
  if (!GS.downed) return;
  GS.downed = false;
  GS._reviveHold = 0;
  // 与 updateHUD 里的算法保持一致（基础 + 道具 + 等级加成）
  var maxHp = (GS.maxHp || 100) + (GS.maxHpBonus || 0) + (GS.levelHpBonus || 0);
  GS.hp = Math.max(1, Math.round(maxHp * REVIVE_CFG.hpRatio));
  GS._invulnTimer = REVIVE_CFG.invulnTime;
  showSpectatorHud(false);
  if (typeof updateHUD === 'function') updateHUD();
  if (typeof showMessage === 'function') showMessage('✨ 你被救起来了！', 0x66ffcc);
  if (typeof AudioMgr !== 'undefined' && AudioMgr.playSkill) AudioMgr.playSkill();
}

// ============================================================
// 观战 HUD
// ============================================================
function showSpectatorHud(on) {
  var el = document.getElementById('spectate-hud');
  if (!el) return;
  if (on) el.classList.remove('hidden');
  else el.classList.add('hidden');
}

function updateSpectatorHud(pct) {
  var fill = document.getElementById('spec-revive-fill');
  var pctEl = document.getElementById('spec-revive-pct');
  if (fill) fill.style.width = Math.round(pct * 100) + '%';
  if (pctEl) pctEl.textContent = Math.round(pct * 100) + '%';
}

function showReviveHud(on, name, pct) {
  var el = document.getElementById('revive-hud');
  if (!el) return;
  if (!on) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  var t = document.getElementById('revive-text');
  if (t) t.textContent = '正在救援 ' + (name || '队友') + '…';
  var f = document.getElementById('revive-fill');
  if (f) f.style.width = Math.round((pct || 0) * 100) + '%';
}

// ============================================================
// 每帧更新
// ============================================================
function updateReviveSystem(delta) {
  if (!isCoopRun()) {
    showReviveHud(false, '', 0);
    return;
  }

  // 无敌计时
  if (GS._invulnTimer > 0) GS._invulnTimer -= delta;

  // ---- 自己倒地：更新观战进度 + 全员倒地兜底 ----
  if (GS.downed) {
    updateSpectatorHud(GS._reviveHold ? Math.min(1, GS._reviveHold / REVIVE_CFG.holdTime) : 0);

    // 加入者兜底：正常路径是主机判定后广播 all_down。
    // 但如果这条广播丢了（或主机已结算不再发包），加入者会永远卡在观战界面。
    // 这里本地也判一次：全队都倒地且已经等过宽限期 → 自己走失败结算。
    if (!GS.isHost) {
      if (isSquadWiped()) {
        GS._allDownWait = (GS._allDownWait || 0) + delta;
        if (GS._allDownWait >= REVIVE_CFG.allDownGrace) {
          GS._allDownWait = 0;
          GS.gameOver = true;
          GS.running = false;
          showSpectatorHud(false);
          if (typeof showMessage === 'function') showMessage('💔 全员倒下…', 0xff4444);
          if (typeof showGameOver === 'function') showGameOver();
        }
      } else {
        GS._allDownWait = 0;
      }
    }
    return;
  }

  // ---- 活着：寻找范围内倒地的队友，累计救援进度 ----
  var target = findDownedTeammateInRange();
  if (!target) {
    // 目标脱离范围时不清零，给一段宽容期。
    // 救援过程中救援者会被怪物击退（monsterAttack 里有 knockback），
    // 一旦被弹开就前功尽弃、永远救不起来 —— 这是联机救援最常见的失败原因。
    // 1.5 秒内回到范围内可以接着算。
    GS._reviveGrace = (GS._reviveGrace || 0) + delta;
    if (GS._reviveGrace > REVIVE_CFG.reviveGrace) {
      GS._reviveHold = 0;
      GS._reviveTargetId = null;
      GS._reviveGrace = 0;
      showReviveHud(false, '', 0);
    }
  } else {
    GS._reviveGrace = 0;
    if (GS._reviveTargetId !== target.id) {
      GS._reviveTargetId = target.id;
      GS._reviveHold = 0;
    }
    GS._reviveHold = (GS._reviveHold || 0) + delta;
    var pct = Math.min(1, GS._reviveHold / REVIVE_CFG.holdTime);
    showReviveHud(true, target.name, pct);
    if (pct >= 1) {
      doRevive(target.id);
      GS._reviveHold = 0;
      GS._reviveTargetId = null;
      showReviveHud(false, '', 0);
    }
  }
}

/** 找最近的一个倒下且没被救起的队友 */
function findDownedTeammateInRange() {
  if (typeof PeerManager === 'undefined' || !player) return null;
  var best = null, bestD = REVIVE_CFG.range;

  for (var pid in PeerManager.players) {
    if (pid === PeerManager.playerId) continue;
    if (!isPlayerDowned(pid)) continue;
    var pos = playerWorldPos(pid);
    if (!pos) continue;
    var dx = pos.x - player.position.x;
    var dz = pos.z - player.position.z;
    var d = Math.sqrt(dx * dx + dz * dz);
    if (d < bestD) {
      bestD = d;
      var p = PeerManager.players[pid];
      best = { id: pid, name: (p && p.name) || '队友' };
    }
  }
  return best;
}

/** 某个队友是否处于倒地待救状态 */
function isPlayerDowned(pid) {
  if (typeof PeerManager !== 'undefined' && PeerManager.players && PeerManager.players[pid]
      && PeerManager.players[pid].downed) return true;
  if (typeof SyncManager !== 'undefined' && SyncManager.remotePlayers
      && SyncManager.remotePlayers[pid] && SyncManager.remotePlayers[pid].state
      && SyncManager.remotePlayers[pid].state.downed) return true;
  return false;
}

/** 取队友的世界坐标（优先用实际模型位置，两端都可靠） */
function playerWorldPos(pid) {
  if (typeof SyncManager !== 'undefined' && SyncManager.remotePlayers
      && SyncManager.remotePlayers[pid] && SyncManager.remotePlayers[pid].mesh) {
    return SyncManager.remotePlayers[pid].mesh.position;
  }
  var p = (typeof PeerManager !== 'undefined' && PeerManager.players) ? PeerManager.players[pid] : null;
  return (p && p.position) ? p.position : null;
}

/** 发起复活 */
function doRevive(targetId) {
  if (typeof PeerManager === 'undefined' || !PeerManager.connected) return;
  PeerManager.broadcast('player_revived', {
    targetId: targetId,
    byId: PeerManager.playerId
  });
  if (typeof showMessage === 'function') showMessage('✨ 救起了队友！', 0x66ffcc);
}

// ============================================================
// 联机消息
// ============================================================
function initReviveNetwork() {
  if (typeof PeerManager === 'undefined') return;

  // 有人倒下：记下状态（血量同步本来就是 0，这里补一个显式标记）
  PeerManager.on('player_down', function (data) {
    if (!data || !data.playerId) return;
    if (PeerManager.players && PeerManager.players[data.playerId]) {
      PeerManager.players[data.playerId].downed = true;
    }
    if (data.playerId === PeerManager.playerId) {
      if (!GS.downed) handlePlayerDeath('remote');
    } else {
      var p = PeerManager.players[data.playerId];
      if (typeof showMessage === 'function') {
        showMessage('💀 ' + ((p && p.name) || '队友') + ' 倒下了！靠近救援', 0xff9a3c);
      }
    }
  });

  // 有人被救起
  PeerManager.on('player_revived', function (data) {
    if (!data || !data.targetId) return;
    if (PeerManager.players && PeerManager.players[data.targetId]) {
      PeerManager.players[data.targetId].downed = false;
    }
    if (data.targetId === PeerManager.playerId) {
      reviveLocalPlayer();
    }
  });

  // 全员倒地 → 失败（由主机判定，避免各端算法不一致）
  PeerManager.on('all_down', function () {
    if (GS.gameOver) return;
    GS.gameOver = true;
    GS.running = false;
    showSpectatorHud(false);
    if (typeof showGameOver === 'function') showGameOver();
  });
}

/**
 * 是否「全队阵亡」：自己倒地，且所有队友也都倒地（没有队友时也算）。
 *
 * 抽成独立函数是为了让主机和加入者用**同一套判定**：
 * 主机负责权威广播，加入者用它做本地兜底（见 updateReviveSystem），
 * 避免 all_down 广播丢包时大家都卡在观战界面出不来。
 */
function isSquadWiped() {
  if (!GS.downed) return false;
  if (typeof PeerManager === 'undefined' || !PeerManager.players) return true;
  for (var pid in PeerManager.players) {
    if (pid === PeerManager.playerId) continue;
    if (!isPlayerDowned(pid)) return false;
  }
  return true;
}

/** 主机判定：所有人都倒地了就结束本局 */
function checkAllDown() {
  if (!GS.isHost || !isCoopRun()) return;
  if (!isSquadWiped()) return;

  if (GS._allDownSent) return;
  GS._allDownSent = true;
  if (typeof PeerManager !== 'undefined' && PeerManager.connected) {
    PeerManager.broadcast('all_down', {});
  }
  if (typeof showMessage === 'function') showMessage('💔 全员倒下…', 0xff4444);
  GS.gameOver = true;
  GS.running = false;
  showSpectatorHud(false);
  if (typeof showGameOver === 'function') showGameOver();
}

// ============================================================
// Backward compatibility
// ============================================================
window.REVIVE_CFG = REVIVE_CFG;
window.handlePlayerDeath = handlePlayerDeath;
window.reviveLocalPlayer = reviveLocalPlayer;
window.updateReviveSystem = updateReviveSystem;
window.checkAllDown = checkAllDown;
window.initReviveNetwork = initReviveNetwork;
window.showSpectatorHud = showSpectatorHud;
