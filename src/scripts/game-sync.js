// ============================================================
// 状态同步模块 - 世界状态快照、远程玩家渲染、插值
// ============================================================

// 场上是否还有"没撤离"的其他玩家。
//
// 撤离改成各走各的之后，主机需要靠它决定两件事：
//   1. 自己先撤离时，是直接结算，还是转观战等队友（见 EscapeSystem）；
//   2. 队友逐个撤离后，是不是该结算了。
// 倒地的队友仍然算"在场"——他还能被扶起来，不能当成已离场。
function hasOtherActivePlayers() {
  if (typeof PeerManager === 'undefined' || !PeerManager.players) return false;
  for (var pid in PeerManager.players) {
    if (pid === PeerManager.playerId) continue;
    var p = PeerManager.players[pid];
    if (!p) continue;
    if (p.escaped) continue;
    return true;
  }
  return false;
}
window.hasOtherActivePlayers = hasOtherActivePlayers;

// 某个玩家已经撤离：主机把他从场上摘掉（模型、输入、怪物目标），
// 其他端只提示一句。撤离是各走各的，不再把全队一起带走。
function markPlayerEscaped(pid, name) {
  if (!pid || typeof PeerManager === 'undefined' || pid === PeerManager.playerId) return;

  var rec = PeerManager.players && PeerManager.players[pid];
  if (rec) rec.escaped = true;

  if (GS.isHost && typeof SyncManager !== 'undefined' && SyncManager.remotePlayers) {
    var rp = SyncManager.remotePlayers[pid];
    if (rp && rp.mesh) {
      try { if (rp.mesh.parent) rp.mesh.parent.remove(rp.mesh); } catch (e) { }
    }
    delete SyncManager.remotePlayers[pid];
  }

  if (typeof showMessage === 'function') {
    showMessage('🚀 ' + (name || (rec && rec.name) || '队友') + ' 已撤离!', 0x66ffcc);
  }

  // 主机自己在观战等队友，队友都走完了就结算
  if (GS.isHost && GS.escaped && !GS.gameOver && !hasOtherActivePlayers()) {
    if (typeof gameWin === 'function') gameWin();
  }
}
window.markPlayerEscaped = markPlayerEscaped;

var SyncManager = {
  remotePlayers: {},    // { peerId: { mesh, state, lerpTarget, nameLabel, prevState } }
  snapshotInterval: 50, // 快照间隔 (ms) = 20Hz
  snapshotTimer: 0,
  lastSnapshot: null,   // 最后收到的快照（用于插值）
  prevSnapshot: null,   // 上一个快照
  snapshotTime: 0,      // 收到快照的时间
  interpDuration: 50,   // 插值持续时长 (ms)
  _remoteQuizQuestions: {}, // 远程加入者的答题缓存 { peerId: questionData }

  // ============================================================
  // 主机：发送世界状态快照
  // ============================================================
  // 低频实体（宝箱/道具/碎片/能量球）的位置是固定的，只在被拾取或销毁时变化，
  // 没必要跟着 20Hz 一起发。每 5 次快照带一次（≈4Hz），快照体积能少一半左右。
  _snapSeq: 0,
  _entityEvery: 5,

  sendSnapshot: function () {
    if (!PeerManager.isHost || !PeerManager.connected) return;

    this._snapSeq++;
    var includeEntities = (this._snapSeq % this._entityEvery === 1);

    var snapshot = this._buildSnapshot(includeEntities);
    PeerManager.broadcast('world_snapshot', snapshot);
  },

  // ============================================================
  // 构建完整世界状态快照（供 sendSnapshot 和 world_state_request 使用）
  // ============================================================
  _buildSnapshot: function (includeEntities) {
    // includeEntities：默认 true（新加入者请求完整状态时用）。
    // 周期快照传 false 时，宝箱/道具/碎片/能量球这几个字段会留空，
    // JSON 序列化时自动省略，接收端各 _syncXxx 都有空值保护。
    if (includeEntities === undefined) includeEntities = true;

    // 收集所有玩家状态
    var playerStates = [];
    // 主机自己的状态
    var hostState = this._collectLocalPlayerState();
    playerStates.push(hostState);

    // 加入者的状态（从本地记录中获取）
    for (var pid in PeerManager.players) {
      if (pid !== PeerManager.playerId) {
        var p = PeerManager.players[pid];
        playerStates.push({
          id: pid,
          playerName: p.name,
          character: p.character,
          x: p.position ? p.position.x : 0,
          z: p.position ? p.position.z : 0,
          rotY: p.rotationY || 0,
          hp: (typeof p.hp === 'number' ? p.hp : 100),
          maxHp: p.maxHp || 100,
          energy: p.energy || 0,
          energyMax: p.energyMax || 5,
          fragments: p.fragments || 0,
          curWeapon: p.curWeapon || '木棍',
          isJumping: p.isJumping || false,
          flying: p.flying || false,
          downed: p.downed || false,
          escaped: p.escaped || false,
          isCaptured: p.isCaptured || false,
          skillActive: p.skillActive || 0,
          skillCooldown: p.skillCooldown || 0,
          level: p.level || 1,
          correct: p.correct || 0,
          total: p.total || 0
        });
      }
    }

    // 收集怪物状态
    var monsterStates = [];
    if (typeof window.monsters !== 'undefined') {
      window.monsters.forEach(function (m) {
        // 不在场景里的实体一律不下发：房主本地已经看不见它（已被移除、
        // 或等待重生的尸体），继续广播会让加入者凭空多出一只
        // "房主看不见的怪物"，还会在加入者本地结算攻击。
        if (m && m.userData && m.parent) {
          if (!m.userData.netId) m.userData.netId = 'm_' + Math.random().toString(36).substr(2, 8);
          monsterStates.push({
            id: m.userData.netId,
            type: m.userData.type ? (m.userData.type.name || '追风怪') : '追风怪',
            x: m.position.x,
            z: m.position.z,
            hp: m.userData.hp || 100,
            maxHp: (m.userData.type && m.userData.type.hp) || 100,
            active: m.userData.active || false,
            isBoss: m.userData.isBoss || false,
            sleeping: m.userData.sleeping || false,
            boundTimer: m.userData.boundTimer || 0,
            staggerTimer: m.userData.staggerTimer || 0,
            scale: (m.userData.type && m.userData.type.scale) || 1
          });
        }
      });
    }

    // Boss 状态
    if (typeof window.bosses !== 'undefined') {
      window.bosses.forEach(function (b) {
        if (b && b.userData && b.userData.active && b.parent) {
          if (!b.userData.netId) b.userData.netId = 'b_' + Math.random().toString(36).substr(2, 8);
          monsterStates.push({
            id: b.userData.netId,
            type: b.userData.type ? (b.userData.type.name || 'Boss') : 'Boss',
            x: b.position.x,
            z: b.position.z,
            hp: b.userData.hp || 100,
            maxHp: (b.userData.type && b.userData.type.hp) || 100,
            active: true,
            isBoss: true,
            sleeping: b.userData.sleeping || false,
            boundTimer: b.userData.boundTimer || 0,
            bossPhase: b.userData.bossPhase || 3,
            scale: (b.userData.type && b.userData.type.scale) || 1
          });
        }
      });
    }

    // 抓捕者状态
    var chaserState = null;
    if (typeof window.chaserMonster !== 'undefined' && window.chaserMonster && window.chaserMonster.parent) {
      chaserState = {
        x: window.chaserMonster.position.x,
        z: window.chaserMonster.position.z,
        active: true,
        isChasing: window.chaserMonster.userData.isChasing || false,
        sprintTimer: window.chaserMonster.userData.sprintTimer || 0,
        sprintCooldown: window.chaserMonster.userData.sprintCooldown || 0,
        targetPlayerId: window.chaserMonster.userData.targetPlayerId || null
      };
    }

    // 宝箱状态
    var chestStates = null;
    if (includeEntities && typeof window.normalChests !== 'undefined') {
      chestStates = [];
      window.normalChests.forEach(function (c) {
        if (c && c.userData && c.parent) {
          if (!c.userData.netId) c.userData.netId = 'c_' + Math.random().toString(36).substr(2, 8);
          chestStates.push({
            id: c.userData.netId,
            room: '未知',
            active: c.userData.active || false,
            destroyed: c.userData.destroyed || false,
            x: c.position.x,
            z: c.position.z
          });
        }
      });
    }

    // 能量球/金色宝箱状态
    var energyOrbState = null;
    if (includeEntities && typeof window.energyOrb !== 'undefined' && window.energyOrb && window.energyOrb.parent) {
      energyOrbState = {
        active: true,
        x: window.energyOrb.position.x,
        z: window.energyOrb.position.z,
        cooldown: window.energyOrb.userData.cooldown || 0
      };
    }

    // 道具状态
    var itemStates = null;
    if (includeEntities && typeof window.items !== 'undefined') {
      itemStates = [];
      window.items.forEach(function (it) {
        if (it && it.userData && it.userData.active && it.parent) {
          if (!it.userData.netId) it.userData.netId = 'i_' + Math.random().toString(36).substr(2, 8);
          itemStates.push({
            id: it.userData.netId,
            type: it.userData.itemType ? it.userData.itemType.id : 'unknown',
            x: it.position.x,
            z: it.position.z,
            active: true
          });
        }
      });
    }

    // 碎片掉落状态
    var fragmentStates = null;
    if (includeEntities && typeof window.fragmentDrops !== 'undefined') {
      fragmentStates = [];
      window.fragmentDrops.forEach(function (f) {
        if (f && f.parent) {
          if (!f.userData.netId) f.userData.netId = 'f_' + Math.random().toString(36).substr(2, 8);
          fragmentStates.push({
            id: f.userData.netId,
            x: f.position.x,
            z: f.position.z
          });
        }
      });
    }

    // 构建世界快照
    return {
      players: playerStates,
      monsters: monsterStates,
      chaser: chaserState,
      chests: chestStates,
      energyOrb: energyOrbState,
      items: itemStates,
      fragments: fragmentStates,
      ship: {
        energyFull: (GS.energy || 0) >= (GS.energyMax || 5)
      },
      // 团队共享能量：正常靠 energy_shared 事件实时同步，这里用于兜底校准
      // （事件丢失、或加入者中途进来时需要立刻对齐到当前进度）
      teamEnergy: GS.energy || 0,
      // 撤离所需能量上限 —— 也必须由主机下发。
      // 它其实是章节常量（escapeEnergy），但加入者一旦拿不到就退回默认 5，
      // 第 2 章起（8/12/16/20）就会出现"加入者能量满了能飞、主机还不够"的分裂。
      teamEnergyMax: GS.energyMax || 5,
      gameTime: typeof window.clock !== 'undefined' && window.clock ? window.clock.elapsedTime : 0,
      gameOver: GS.gameOver || false,
      escaping: GS.escaping || false,
      ts: Date.now()
    };
  },

  // ============================================================
  // 收集本地玩家状态
  // ============================================================
  _collectLocalPlayerState: function () {
    var state = {
      id: PeerManager.playerId,
      playerName: PeerManager.playerName,
      character: GS.character || 'qike',
      hp: (typeof currentPlayerHp === 'function' ? currentPlayerHp() : (GS.hp || 100)),
      maxHp: (GS.maxHp || 100) + (GS.maxHpBonus || 0) + (GS.levelHpBonus || 0),
      energy: GS.energy || 0,
      energyMax: GS.energyMax || 5,
      fragments: GS.fragments || 0,
      curWeapon: GS.curWeapon || '木棍',
      isJumping: GS.isJumping || false,
      flying: GS._flying || false,
      downed: GS.downed || false,
      isCaptured: (typeof window.captureState !== 'undefined' && window.captureState) ? window.captureState.captured : false,
      // 已撤离：加入者据此把主机/队友的模型收起来，不再画一个"还站在飞船边的人"
      escaped: GS.escaped || false,
      skillActive: GS.skillActive || 0,
      skillCooldown: GS.skillCooldown || 0,
      level: GS.level || 1,
      killCount: GS.killCount || 0,
      correct: GS.correct || 0,
      total: GS.total || 0
    };
    // 如果有玩家对象，加入位置信息
    if (typeof window.player !== 'undefined' && window.player) {
      state.x = window.player.position.x;
      state.z = window.player.position.z;
      state.rotY = window.player.rotation.y;
    }
    return state;
  },

  // ============================================================
  // 加入者：接收并应用世界状态快照
  // ============================================================
  // 自适应插值窗口
  //
  // 原来插值窗口写死成 snapshotInterval * 1.5（75ms）。网络一抖动，
  // 两个快照的间隔可能到 120ms+，但插值还在 75ms 就结束了，
  // 剩下的时间远程玩家/怪物是"停住"的，刷新到下一个快照再跳一下 —— 这就是卡顿感。
  // 这里用指数平滑跟踪真实到达间隔，窗口按 1.6 倍自适应。
  _measureSnapshotGap: function () {
    var now = Date.now();
    if (this._lastSnapAt) {
      var gap = now - this._lastSnapAt;
      if (gap > 5 && gap < 600) {
        this._smoothedGap = (this._smoothedGap === undefined)
          ? gap
          : this._smoothedGap * 0.82 + gap * 0.18;
      }
    }
    this._lastSnapAt = now;
  },

  interpWindow: function () {
    var base = this._smoothedGap || this.snapshotInterval;
    return Math.max(50, Math.min(220, base * 1.6));
  },

  applySnapshot: function (snapshot) {
    if (!snapshot) {
      console.warn('[Sync] applySnapshot: 快照为空');
      return;
    }

    this._measureSnapshotGap();



    // 保存历史快照用于插值
    this.prevSnapshot = this.lastSnapshot;
    this.lastSnapshot = snapshot;
    this.snapshotTime = Date.now();

    if (!snapshot.players) return;

    // 更新远程玩家列表
    var connectedPeerIds = {};
    var localPlayer = window.player;
    var localCaptureState = window.captureState;
    var self = this; // 保存 SyncManager 引用，用于回调中

    snapshot.players.forEach(function (p) {
      if (p.id === PeerManager.playerId) {
        // 这是自己的状态，加入者使用客户端预测，不强制修正位置
        // 例外：被抓捕者拖拽时无条件接受主机权威位置
        if (localPlayer) {
          var dx = p.x - localPlayer.position.x;
          var dz = p.z - localPlayer.position.z;
          var dist = Math.sqrt(dx * dx + dz * dz);
          var isCaptured = (localCaptureState && localCaptureState.captured) || p.isCaptured;
          if (isCaptured || dist > 5.0) {
            localPlayer.position.x = p.x;
            localPlayer.position.z = p.z;
          }
        }
        // ---- 自身属性：一律以「本地」为权威 ----
        //
        // 每名玩家的 HP / 能量 / 碎片 / 等级都是自己算的：
        //   · HP   —— 加入者本地跑 joinerLocalMonsterAttack 扣血
        //   · 能量 —— 本地答题、开宝箱、捡碎片
        //   · 等级 —— 由能量驱动
        // 主机只是通过 player_input 汇总这些值用于显示队友状态。
        //
        // 旧实现用 Math.max 合并，只要 input 丢一个包，快照里的旧值就会把本地血量
        // "拉回去"，表现就是血条回弹、怪物好像打不死人、等级莫名其妙掉回 1。
        // 这里不再做任何覆盖，只同步真正需要主机裁决的字段。
        //
        // ⚠ energyMax 绝对不能从"我自己那条记录"里取：
        // 那条记录是主机按我上报的值回显的，开局瞬间主机还没收到过我的 input，
        // 回显的是默认 5 —— 会把 selectChapter 刚按章节算好的 8/12/16/20 覆盖成 5，
        // 然后我再把 5 报回去，双方就锁死在 5。第 2~5 章"加入者能飞、创建者不能飞"
        // 就是这么来的。上限由主机在 teamEnergyMax 里单独下发（见下）。

        // 被抓住 / 挣脱：主机权威（抓捕判定在主机侧）
        if (p.isCaptured !== undefined && localCaptureState) {
          // 如果主机说被捕获，但本地还没捕获
          if (p.isCaptured && !localCaptureState.captured && typeof window.capturePlayer === 'function') {
            window.capturePlayer();
          }
          // 如果主机说已挣脱，但本地还在捕获状态
          if (!p.isCaptured && localCaptureState.captured && typeof window.breakFreeFromCapture === 'function') {
            window.breakFreeFromCapture();
          }
        }
        // 同步到 PeerManager.players 确保下次快照发送正确状态
        if (PeerManager.players[PeerManager.playerId]) {
          PeerManager.players[PeerManager.playerId].energy = GS.energy;
          PeerManager.players[PeerManager.playerId].fragments = GS.fragments;
          PeerManager.players[PeerManager.playerId].hp = GS.hp;
          PeerManager.players[PeerManager.playerId].maxHp = GS.maxHp;
          PeerManager.players[PeerManager.playerId].energyMax = GS.energyMax;
          PeerManager.players[PeerManager.playerId].level = GS.level;
          PeerManager.players[PeerManager.playerId].correct = GS.correct;
          PeerManager.players[PeerManager.playerId].total = GS.total;
        }
        // 同步后刷新 HUD
        if (typeof updateHUD === 'function') updateHUD();
        return;
      }
      connectedPeerIds[p.id] = true;

      // 已撤离的队友：把他的模型收掉，不再跟随、不再画出来。
      // 撤离是各走各的，谁走了谁从场上消失，剩下的人继续。
      if (p.escaped) {
        var _erp = self.remotePlayers[p.id];
        if (_erp && _erp.mesh) {
          try { if (_erp.mesh.parent) _erp.mesh.parent.remove(_erp.mesh); } catch (e) { }
        }
        delete self.remotePlayers[p.id];
        if (PeerManager.players && PeerManager.players[p.id]) {
          PeerManager.players[p.id].escaped = true;
        }
        return;
      }

      // 创建或更新远程玩家
      if (!self.remotePlayers[p.id]) {
        self.createRemotePlayer(p.id, p.character, p.playerName || '玩家');
      }

      // 队友的战斗状态回写到 PeerManager.players。
      //
      // 加入者侧的 PeerManager.players 只在进房时建过一次（只有 id/名字/角色），
      // 快照不会整体替换它 —— 不回写的话，加入者看到的队友血条永远是初始值：
      //   · hp / maxHp 用于队友列表的血条宽度
      //   · downed 用于"靠近救援"的判定
      //   · level 用于队友名字标签
      // 这几个字段以前只有 downed 写了，hp 一直没写，所以加入者看队友血量是不动的。
      if (PeerManager.players && PeerManager.players[p.id]) {
        var _rec = PeerManager.players[p.id];
        if (p.hp !== undefined && p.hp !== null) {
          // 倒地时主机上报的就是 0，必须原样写进去（不能用 || 兜底）
          _rec.hp = p.hp;
        }
        if (p.maxHp) _rec.maxHp = p.maxHp;
        if (p.energy !== undefined) _rec.energy = p.energy;
        if (p.fragments !== undefined) _rec.fragments = p.fragments;
        if (p.level !== undefined) _rec.level = p.level;
        if (p.downed !== undefined) _rec.downed = !!p.downed;
      }

      // 更新远程玩家的目标状态（用于插值）
      var rp = self.remotePlayers[p.id];
      if (rp) {
        // 保存上一个状态用于插值
        rp.prevState = rp.state || { x: p.x, z: p.z, rotY: p.rotY };
        rp.state = {
          x: p.x,
          z: p.z,
          rotY: p.rotY || 0,
          hp: p.hp,
          maxHp: p.maxHp,
          energy: p.energy,
          energyMax: p.energyMax,
          curWeapon: p.curWeapon,
          isJumping: p.isJumping,
          flying: p.flying,
          downed: p.downed,
          isCaptured: p.isCaptured,
          skillActive: p.skillActive,
          level: p.level
        };
        rp.interpStartTime = Date.now();
        // 原来这里写的是 this.snapshotInterval，但在 forEach 回调里 this 是 window，
        // 结果是 NaN（靠后面的 || 兜底才没炸）。改用 self 并自适应窗口。
        rp.interpDuration = self.interpWindow();

        // 更新头顶名字标签（重绘 Sprite 贴图：名字 + 等级 + 血条）
        // 这段每 50ms 跑一次，原来每次都重画 canvas 并触发纹理上传，
        // 三个人就是每秒上百次 GPU 上传——是联机卡顿的主要来源之一。
        // 现在只在内容真正变化时重绘，血量按 5% 粒度比较。
        if (rp.nameLabel && rp.labelCanvas && rp.labelCtx) {
          var hpFrac = (p.maxHp > 0) ? (p.hp / p.maxHp) : 1;
          var lv = p.level || 1;
          var nm = p.playerName || rp.playerName || '玩家';
          var sig = nm + '|' + lv + '|' + Math.round(hpFrac * 20);
          if (rp.lastLabelSig !== sig) {
            rp.lastLabelSig = sig;
            self._drawNameLabel(rp.labelCanvas, rp.labelCtx, rp.labelTexture, nm, hpFrac, lv);
          }
        }
      }
    });

    // ---- 团队共享能量的兜底校准 ----
    // 正常路径靠 energy_shared 事件实时同步（本地拿到立刻广播给队友）。
    // 这里只处理两种情况：事件丢失，以及加入者中途进来需要立刻对齐当前进度。
    // 注意等级由能量驱动，要一起补上，但不要走 levelUp()（那会弹"升级"提示刷屏）。
    // 撤离上限以主机为准：加入者的 energyMax 只从主机下发的字段取，
    // 不从自己那条回显记录取（原因见上面 `自身属性` 那段注释）。
    if (!GS.isHost && snapshot.teamEnergyMax !== undefined && snapshot.teamEnergyMax > 0) {
      if (GS.energyMax !== snapshot.teamEnergyMax) {
        GS.energyMax = snapshot.teamEnergyMax;
        if (typeof updateHUD === 'function') updateHUD();
      }
    }

    if (!GS.isHost && snapshot.teamEnergy !== undefined) {
      var _te = Math.min(snapshot.teamEnergy, GS.energyMax || 5);
      var _need = _te - (GS.energy || 0);
      if (_need > 0) {
        GS.energy = _te;
        GS.level = (GS.level || 1) + _need;
        if (typeof applyLevelBonuses === 'function') applyLevelBonuses();
        if (typeof updateHUD === 'function') updateHUD();
      }
    }

    // 清理已断线的远程玩家
    for (var pid in this.remotePlayers) {
      if (!connectedPeerIds[pid]) {
        this.removeRemotePlayer(pid);
      }
    }

    // 更新怪物状态（只对加入者有效）
    if (GS.mode === 'multiplayer' && !GS.isHost) {
      this._syncMonsters(snapshot);
      this._syncChaser(snapshot);
      this._syncChests(snapshot);
      this._syncEnergyOrb(snapshot);
      this._syncItems(snapshot);
      this._syncFragments(snapshot);
      this._syncShip(snapshot);
    }
  },

  // ============================================================
  // 怪物同步（加入者端）
  // ============================================================
  _syncMonsters: function (snapshot) {
    if (!snapshot.monsters) return;

    // 确保 monster 数组存在
    if (typeof window.monsters === 'undefined') return;
    var localMonsters = window.monsters;
    var localScene = window.scene;

    // 记录本帧快照里仍然存在的怪物 id，用于末尾清理本地残留
    var seenIds = {};

    // 为每个怪物创建或更新
    snapshot.monsters.forEach(function (ms) {
      if (!ms.active) return;
      seenIds[ms.id] = true;

      // 查找是否已有对应怪物。
      // 必须同时扫 monsters 和 bosses：Boss 现在归 bosses 数组，
      // 只扫 monsters 会「找不到 → 每帧重新创建一个」，几十帧下来堆出几十个 Boss
      // 副本（mesh + 几何体全泄漏），画面和性能都会崩。
      var found = null;
      var _searchPools = [localMonsters, (typeof window.bosses !== 'undefined' && window.bosses) ? window.bosses : []];
      for (var _pi = 0; _pi < _searchPools.length && !found; _pi++) {
        var _pool = _searchPools[_pi];
        for (var i = 0; i < _pool.length; i++) {
          if (_pool[i].userData && _pool[i].userData.netId === ms.id) {
            found = _pool[i];
            break;
          }
        }
      }

      if (found) {
        // 更新现有怪物位置（插值）
        if (found.userData) {
          found.userData.prevX = found.position.x;
          found.userData.prevZ = found.position.z;
          found.userData.targetX = ms.x;
          found.userData.targetZ = ms.z;
          found.userData.interpTime = 0;
          // hp：加入者本地刚预测扣过血（400ms 内）时不能直接用快照覆盖 ——
          // 手机上"伤害上报"经常比"主机处理完再发快照"先到，直接覆盖会让
          // 血条瞬间跳回满血再掉下去，玩家看到的就是"打怪不掉血"。
          // 窗口内取两者较小值（主机结算结果只会更低），窗口外以主机为准。
          if (found.userData.localHpAt && Date.now() - found.userData.localHpAt < 400) {
            found.userData.hp = Math.min(found.userData.hp, ms.hp);
          } else {
            found.userData.hp = ms.hp;
            found.userData.localHpAt = 0;
          }
          // 确保攻击冷却初始化（加入者本地怪物攻击检测需要）
          if (found.userData.attackCooldown === undefined) found.userData.attackCooldown = 0;
          // 防御：如果怪物不在场景中，添加到场景
          if (!found.parent && localScene) {
            localScene.add(found);
          }
          // 如果怪物已被击败（HP<=0），在本地置为不活跃（不重复调用死亡逻辑）
          if (ms.hp <= 0 && found.userData.active) {
            found.userData.active = false;
            // 加入者端不调用死亡逻辑，只需隐藏怪物
            if (found.parent) {
              localScene.remove(found);
            }
          }
        }
      } else {
        // 创建新怪物
        if (typeof window.buildMonsterMesh === 'function' && typeof window.MONSTER_TYPES !== 'undefined') {
          var typeDef = window.MONSTER_TYPES[ms.type];
          // 也检查 BOSSES 表（Boss 类型定义在 BOSSES 中）
          if (!typeDef && typeof window.BOSSES !== "undefined") {
            for (var bi = 1; bi <= 5; bi++) {
              if (window.BOSSES[bi] && window.BOSSES[bi].name === ms.type) {
                typeDef = window.BOSSES[bi];
                break;
              }
            }
          }
          if (typeDef) {
            var t = typeof window.scaleMonsterType === 'function' ? window.scaleMonsterType(typeDef) : typeDef;
            var g = window.buildMonsterMesh(t);
            if (t.scale && t.scale !== 1) g.scale.setScalar(t.scale);
            g.position.set(ms.x, 0, ms.z);
            if (localScene) { localScene.add(g); } else { console.warn("[Sync] _syncMonsters: window.scene 未定义，怪物未添加到场景!"); }
            g.userData = {
              netId: ms.id,
              type: t,
              active: true,
              hp: ms.hp,
              isBoss: ms.isBoss || false,
              sleeping: ms.sleeping || false,
              scale: ms.scale || 1,
              prevX: ms.x,
              prevZ: ms.z,
              targetX: ms.x,
              targetZ: ms.z,
              interpTime: 0,
              attackCooldown: 0, // 初始化攻击冷却，供加入者本地怪物攻击检测使用
              homeRoom: window.ROOMS ? window.ROOMS[0] : null
            };
            // Boss 必须进 bosses 数组，不能和普通小怪混在一起：
            // 加入者原来一律 push 到 monsters，导致本地 bosses 恒为空、
            // 两端数组语义对不上（血量统计、Boss 专属分支、小地图都会读错）。
            if (ms.isBoss) {
              if (typeof window.bosses !== 'undefined' && window.bosses) window.bosses.push(g);
              else localMonsters.push(g);   // 兜底：没有 bosses 数组时退回 monsters
            } else {
              localMonsters.push(g);
            }
          }
        }
      }
    });

    // 清理：主机已经不再发送的怪物（被击败或移除）必须从本地数组里彻底删掉。
    // 原来只把 mesh 从场景移除、数组里留着，于是数组越积越多，
    // 每帧的线性查找越来越慢、死怪的几何体也不释放——这就是"玩得越久越卡"的直接原因。
    // 两个数组都要清：Boss 现在归 bosses，只扫 monsters 会留下一堆死 Boss
    var _sweep = function (arr) {
      if (!arr) return;
      for (var li = arr.length - 1; li >= 0; li--) {
        var lm = arr[li];
        var lid = (lm && lm.userData) ? lm.userData.netId : null;
        // 保留条件：有 netId 且本帧快照里仍然存在。
        // 没有 netId 的一律清掉 —— 它不是房主世界里发下来的怪物
        // （快照创建的怪都会带 netId），只可能是某条本地代码路径漏创建的，
        // 留着它就会出现"只有加入者自己看得见、还会咬人"的幽灵怪。
        if (!(lid && seenIds[lid])) {
          if (lm.parent && localScene) {
            try { localScene.remove(lm); } catch (e) { }
          }
          lm.traverse(function (ch) {
            if (ch.geometry) ch.geometry.dispose();
            if (ch.material) {
              if (ch.material.map) ch.material.map.dispose();
              ch.material.dispose();
            }
          });
          arr.splice(li, 1);
        }
      }
    };
    _sweep(localMonsters);
    _sweep(window.bosses);
  },

  // ============================================================
  // 抓捕者同步（加入者端）
  // ============================================================
  _syncChaser: function (snapshot) {
    if (!snapshot.chaser || !snapshot.chaser.active) {
      // 抓捕者不存在，移除本地
      // 使用 window 对象确保访问全局变量
      if (typeof window.chaserMonster !== 'undefined' && window.chaserMonster && window.chaserMonster.parent) {
        try { window.scene.remove(window.chaserMonster); } catch (e) { }
        window.chaserMonster = null;
      }
      return;
    }

    var cs = snapshot.chaser;
    // 如果本地没有抓捕者，创建一个
    var localChaser = (typeof window.chaserMonster !== 'undefined') ? window.chaserMonster : null;
    if (!localChaser || !localChaser.parent) {
      if (typeof window.buildChaserMesh === 'function') {
        var g = window.buildChaserMesh();
        g.position.set(cs.x, 0, cs.z);
        if (typeof window.scene !== 'undefined') window.scene.add(g);
        g.userData = {
          netId: 'chaser',
          active: true,
          type: { name: '追捕者', speed: 3.0, chaseSpeed: 7.0, hp: 500, scale: 1 },
          isChaser: true,
          hp: 500,
          prevX: cs.x,
          prevZ: cs.z,
          targetX: cs.x,
          targetZ: cs.z,
          interpTime: 0,
          attackCooldown: 0
        };
        window.chaserMonster = g;
      }
    } else {
      // 更新位置
      localChaser.userData.prevX = localChaser.position.x;
      localChaser.userData.prevZ = localChaser.position.z;
      localChaser.userData.targetX = cs.x;
      localChaser.userData.targetZ = cs.z;
      localChaser.userData.interpTime = 0;
      // 防御：如果追捕者不在场景中，添加到场景
      if (!localChaser.parent && typeof window.scene !== 'undefined') {
        window.scene.add(localChaser);
      }
    }
  },

  // ============================================================
  // 宝箱同步
  // ============================================================
  _syncChests: function (snapshot) {
    if (!snapshot.chests) return;
    if (typeof window.normalChests === 'undefined') return;
    if (typeof window.buildItemMesh === 'undefined' || typeof window.ITEM_TYPES === 'undefined') return;

    var localScene = window.scene;
    var localChests = window.normalChests;

    // 收集快照中的宝箱ID
    var snapshotChestIds = {};
    snapshot.chests.forEach(function (cs) {
      snapshotChestIds[cs.id] = cs;

      // 主机端已经开过的宝箱：在主机场景里只是一个"盖子打开"的残影，
      // 要等 30 秒补刷计时器跑完才会从数组里删掉。这段时间它会一直出现在
      // 每 5 帧一次的实体快照里 —— 加入者如果照单重建，就会把刚被
      // chest_opened 删掉的箱子又摆回原地，看起来像"宝箱根本没打开"。
      // 所以这里直接把 destroyed 的当作不存在：不重建，本地有残影也一并清掉。
      if (cs.destroyed) {
        for (var di = localChests.length - 1; di >= 0; di--) {
          var dc = localChests[di];
          if (!dc || !dc.userData || dc.userData.netId !== cs.id) continue;
          dc.userData.active = false;
          dc.userData.destroyed = true;
          if (dc.parent && localScene) {
            try { localScene.remove(dc); } catch (e) { }
          }
          localChests.splice(di, 1);
          break;
        }
        return;
      }

      // 查找本地是否已存在该宝箱
      var found = null;
      for (var i = 0; i < localChests.length; i++) {
        if (localChests[i].userData && localChests[i].userData.netId === cs.id) {
          found = localChests[i];
          break;
        }
      }

      if (found) {
        // 更新现有宝箱位置（插值）
        if (found.userData) {
          found.userData.prevX = found.position.x;
          found.userData.prevZ = found.position.z;
          found.userData.targetX = cs.x;
          found.userData.targetZ = cs.z;
          found.userData.interpTime = 0;
          // 同步 active 状态（主机端答题销毁后同步）
          found.userData.destroyed = cs.destroyed || false;
          // 以主机为准：主机端一旦进入答题（active=false）或已经开过，
          // 本地这只箱子也要停手。原来的写法是
          // `found.userData.active = !cs.destroyed && found.userData.active !== false`，
          // 只要本地曾经被置过一次 false 就永远回不来，反过来 local 为 true 时
          // 又完全不看主机的 active —— 两侧状态会越走越偏，最后加入者对着
          // 一个主机已经不认的箱子反复读条。
          found.userData.active = !cs.destroyed && (cs.active !== false);
          // 防御：如果宝箱不在场景中，添加到场景
          if (!found.parent && localScene) {
            localScene.add(found);
          }
        }
      } else {
        // 创建新宝箱
        // 查找普通宝箱类型定义
        var chestTypeDef = null;
        for (var ct = 0; ct < window.ITEM_TYPES.length; ct++) {
          if (window.ITEM_TYPES[ct].isChest) {
            chestTypeDef = window.ITEM_TYPES[ct];
            break;
          }
        }
        if (chestTypeDef && typeof window.buildItemMesh === 'function') {
          var mesh = window.buildItemMesh(chestTypeDef);
          mesh.position.set(cs.x, 1.0, cs.z);
          if (localScene) { localScene.add(mesh); }
          mesh.userData = {
            netId: cs.id,
            itemType: chestTypeDef,
            active: !cs.destroyed && (cs.active !== false),
            destroyed: cs.destroyed || false,
            floatPhase: Math.random() * Math.PI * 2,
            rotSpeed: 1 + Math.random() * 0.5,
            prevX: cs.x,
            prevZ: cs.z,
            targetX: cs.x,
            targetZ: cs.z,
            interpTime: 0
          };
          localChests.push(mesh);
      
        }
      }
    });

    // 移除主机已不存在的宝箱
    for (var i = localChests.length - 1; i >= 0; i--) {
      var localChest = localChests[i];
      if (localChest.userData && localChest.userData.netId && !snapshotChestIds[localChest.userData.netId]) {
        if (localChest.parent && localScene) {
          try { localScene.remove(localChest); } catch (e) { }
        }
        localChests.splice(i, 1);
      }
    }
  },

  // ============================================================
  // 能量球同步（加入者端：根据主机状态创建/移除能量球）
  // ============================================================
  _syncEnergyOrb: function (snapshot) {
    var localScene = window.scene;

    // 主机那边已经没有金色宝箱了（答对开掉、能量集满被收走、或还没刷出来）：
    // 快照里这个字段会被直接省略（对象的 undefined 属性不会被序列化）。
    //
    // 这里必须主动删掉本地的金箱。原来只有 active=false 才删，字段缺失走的是
    // 开头那句 `if (!snapshot.energyOrb) return;` —— 于是加入者会永远留着一个
    // 主机根本不存在 的幽灵金箱：站上去读条 → 上报 chest_interact →
    // 主机找不到金箱、静默忽略 → 本地读条重新开始 …… 无限循环。
    // 玩家看到的就是「一直在重复开启宝箱，但宝箱永远打不开」。
    if (!snapshot.energyOrb) {
      if (window.energyOrb && window.energyOrb.parent) {
        try { localScene.remove(window.energyOrb); } catch (e) { }
      }
      window.energyOrb = null;
      if (typeof energyOrb !== 'undefined') energyOrb = null;
      return;
    }

    if (snapshot.energyOrb.active) {
      // 主机说有能量球，本地没有则创建（使用完整金色宝箱模型）
      if (!window.energyOrb || !window.energyOrb.parent) {
        // 使用完整金色宝箱模型（与 spawnEnergyOrb 一致）
        if (typeof THREE !== 'undefined') {
          var g = new THREE.Group();
          var goldMat = new THREE.MeshStandardMaterial({ color: 0xddaa22, metalness: 0.7, roughness: 0.3, emissive: 0xaa7700, emissiveIntensity: 0.25 });
          var darkGoldMat = new THREE.MeshStandardMaterial({ color: 0xbb8811, metalness: 0.6, roughness: 0.4 });
          var body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.65, 0.75), goldMat);
          body.position.y = 0.33; body.castShadow = true; g.add(body);
          var lid = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 1.1, 12, 1, false, 0, Math.PI), darkGoldMat);
          lid.rotation.z = Math.PI / 2;
          lid.position.y = 0.66; g.add(lid);
          // 金属包边
          var trimMat = new THREE.MeshStandardMaterial({ color: 0xffe066, metalness: 0.9, roughness: 0.2, emissive: 0xffcc44, emissiveIntensity: 0.3 });
          [-0.4, 0.4].forEach(function (tx) {
            var trim = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.68, 0.78), trimMat);
            trim.position.set(tx, 0.33, 0); g.add(trim);
          });
          // 锁扣
          var lock = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.08), trimMat);
          lock.position.set(0, 0.5, 0.4); g.add(lock);
          // 光柱与光晕
          var glow = new THREE.Mesh(new THREE.SphereGeometry(1.0, 12, 12),
            new THREE.MeshBasicMaterial({ color: 0xffd700, transparent: true, opacity: 0.1, side: THREE.DoubleSide }));
          glow.position.y = 0.5; g.add(glow);
          var beam = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.4, 8, 8, 1, true),
            new THREE.MeshBasicMaterial({ color: 0xffd700, transparent: true, opacity: 0.15, side: THREE.DoubleSide }));
          beam.position.y = 4; g.add(beam);
          g.position.set(snapshot.energyOrb.x, 0, snapshot.energyOrb.z);
          g.userData = { active: true, cooldown: 0, floatPhase: Math.random() * Math.PI * 2, glow: glow, isChest: true };
          if (localScene) localScene.add(g);
          window.energyOrb = g;
        }
      } else {
        // 更新位置
        window.energyOrb.position.x = snapshot.energyOrb.x;
        window.energyOrb.position.z = snapshot.energyOrb.z;
      }
    } else {
      // 主机说没有能量球，本地有则移除
      if (window.energyOrb && window.energyOrb.parent) {
        try { localScene.remove(window.energyOrb); } catch (e) { }
        window.energyOrb = null;
      }
    }
  },

  // ============================================================
  // 道具同步
  // ============================================================
  _syncItems: function (snapshot) {
    if (!snapshot.items) return;
    if (typeof window.items === 'undefined') return;

    var localScene = window.scene;
    var localItems = window.items;



    // 收集当前快照中的道具ID
    var snapshotIds = {};
    snapshot.items.forEach(function (itemState) {
      if (!itemState.active) return;
      snapshotIds[itemState.id] = itemState;
      
      // 查找本地是否已存在该道具
      var found = null;
      for (var i = 0; i < localItems.length; i++) {
        if (localItems[i].userData && localItems[i].userData.netId === itemState.id) {
          found = localItems[i];
          break;
        }
      }
      
      if (found) {
        // 更新现有道具位置（平滑移动）
        if (found.userData) {
          found.userData.prevX = found.position.x;
          found.userData.prevZ = found.position.z;
          found.userData.targetX = itemState.x;
          found.userData.targetZ = itemState.z;
          found.userData.interpTime = 0;
          found.userData.active = true; // 确保active状态同步
        }
        // 防御：如果道具不在场景中（例如之前创建时场景未就绪），添加到场景
        if (!found.parent && localScene) {
          localScene.add(found);
      
        }
      } else {
        // 创建新道具
        if (typeof window.buildItemMesh === 'function' && typeof window.ITEM_TYPES !== 'undefined') {
          var itemTypeDef = window.ITEM_TYPES.find(function (t) { return t.id === itemState.type; });
          if (itemTypeDef) {
            var mesh = window.buildItemMesh(itemTypeDef);
            mesh.position.set(itemState.x, 1.0, itemState.z);
            if (localScene) { localScene.add(mesh); }
            mesh.userData = {
              netId: itemState.id,
              itemType: itemTypeDef,
              active: true,
              prevX: itemState.x,
              prevZ: itemState.z,
              targetX: itemState.x,
              targetZ: itemState.z,
              interpTime: 0,
              floatPhase: Math.random() * Math.PI * 2,
              rotSpeed: 1 + Math.random() * 0.5,
              pickupRange: 1.5
            };
            localItems.push(mesh);
        
          } else {
            console.warn('[Sync] _syncItems: 未找到道具类型 ' + itemState.type);
          }
        } else {
          console.warn('[Sync] _syncItems: buildItemMesh 或 ITEM_TYPES 不可用');
        }
      }
    });
    
    // 移除主机已经不存在的道具
    for (var i = localItems.length - 1; i >= 0; i--) {
      var localItem = localItems[i];
      if (localItem.userData && localItem.userData.netId && !snapshotIds[localItem.userData.netId]) {
        // 道具已在主机端被拾取或销毁
        if (localItem.parent && localScene) {
          try { localScene.remove(localItem); } catch (e) { }
        }
        if (localItem.geometry) localItem.geometry.dispose();
        if (localItem.material) {
          if (localItem.material.map) localItem.material.map.dispose();
          localItem.material.dispose();
        }
        localItems.splice(i, 1);
      }
    }
  },

  // ============================================================
  // 飞船同步
  // ============================================================
  _syncShip: function (snapshot) {
    if (!snapshot.ship) return;
    if (typeof window.ship === 'undefined' || !window.ship) return;
    // 飞船能量状态由主机控制
    if (snapshot.ship.energyFull && window.ship.userData && window.ship.userData.ring) {
      window.ship.userData.ring.material.color.setHex(0x66ffcc);
    }
  },

  // ============================================================
  // 碎片掉落同步（加入者端）
  // ============================================================
  _syncFragments: function (snapshot) {
    if (!snapshot.fragments) return;
    if (typeof window.fragmentDrops === 'undefined') return;

    var localScene = window.scene;
    var localFragments = window.fragmentDrops;
    var snapshotIds = {};

    snapshot.fragments.forEach(function (fs) {
      snapshotIds[fs.id] = fs;

      // 查找本地是否已存在该碎片
      var found = null;
      for (var i = 0; i < localFragments.length; i++) {
        if (localFragments[i].userData && localFragments[i].userData.netId === fs.id) {
          found = localFragments[i];
          break;
        }
      }

      if (!found) {
        // 创建新碎片（与 spawnFragmentDrop 视觉一致）
        if (typeof THREE !== 'undefined') {
          var g = new THREE.Group();
          var core = new THREE.Mesh(
            new THREE.OctahedronGeometry(0.25),
            new THREE.MeshStandardMaterial({ color: 0xffd700, emissive: 0xffd700, emissiveIntensity: 0.9, transparent: true, opacity: 0.95 })
          );
          g.add(core);
          var innerGlow = new THREE.Mesh(
            new THREE.SphereGeometry(0.35, 8, 8),
            new THREE.MeshBasicMaterial({ color: 0xffd700, transparent: true, opacity: 0.25, side: THREE.DoubleSide })
          );
          g.add(innerGlow);
          var outerGlow = new THREE.Mesh(
            new THREE.SphereGeometry(0.55, 8, 8),
            new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.1, side: THREE.DoubleSide })
          );
          g.add(outerGlow);
          g.position.set(fs.x, 0.8, fs.z);
          g.userData = { netId: fs.id, floatPhase: Math.random() * Math.PI * 2 };
          if (localScene) localScene.add(g);
          localFragments.push(g);
        }
      } else {
        // 更新位置
        found.position.x = fs.x;
        found.position.z = fs.z;
        // 防御：如果碎片不在场景中，添加到场景
        if (!found.parent && localScene) {
          localScene.add(found);
        }
      }
    });

    // 移除主机已不存在的碎片
    for (var i = localFragments.length - 1; i >= 0; i--) {
      var localF = localFragments[i];
      if (localF.userData && localF.userData.netId && !snapshotIds[localF.userData.netId]) {
        if (localF.parent && localScene) {
          try { localScene.remove(localF); } catch (e) { }
        }
        localFragments.splice(i, 1);
      }
    }
  },

  // ============================================================
  // 创建远程玩家模型
  // ============================================================
  createRemotePlayer: function (peerId, character, name) {
    var self = this;
    if (this.remotePlayers[peerId]) return; // 已存在

    // 检查 Three.js 场景是否就绪
    if (typeof THREE === 'undefined' || typeof window.scene === 'undefined') {
      // 延迟创建
      setTimeout(function () { self.createRemotePlayer(peerId, character, name); }, 500);
      return;
    }

    var localScene = window.scene;
    // ===== 与本地玩家完全相同的角色模型 =====
    //
    // 这里原本是一套手搓的「圆柱身体 + 球头」模型，和 createPlayer() 做出来的
    // 骨架化卡通造型完全是两个东西 —— 于是「自己看到的自己」和「队友看到的你」
    // 形象对不上。直接复用同一个构建函数，保证两边一模一样。
    var group = (typeof createPlayer === 'function')
      ? createPlayer(true, character)
      : new THREE.Group();
    group.userData = group.userData || {};
    group.userData.isRemote = true;
    localScene.add(group);

    // 创建名字标签（使用 Three.js Sprite）
    var canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    var ctx = canvas.getContext('2d');

    var texture = new THREE.CanvasTexture(canvas);
    var spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    var sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(1.5, 0.375, 1);
    sprite.position.y = 1.6;
    group.add(sprite);
    // 初次绘制（满血）
    this._drawNameLabel(canvas, ctx, texture, name, 1, 1);

    // 高亮光环（区分玩家）
    var auraColor = (typeof CHARACTER_AURA !== 'undefined' && CHARACTER_AURA[character])
      ? CHARACTER_AURA[character] : 0x44ff88;
    var auraMat = new THREE.MeshBasicMaterial({ color: auraColor, transparent: true, opacity: 0.15, side: THREE.DoubleSide });
    var aura = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.45, 16), auraMat);
    aura.rotation.x = -Math.PI / 2;
    aura.position.y = 0.02;
    group.add(aura);

    // 存储远程玩家信息
    this.remotePlayers[peerId] = {
      mesh: group,
      nameLabel: sprite,
      labelCanvas: canvas,
      labelCtx: ctx,
      labelTexture: texture,
      character: character,
      playerName: name,
      state: { x: 0, z: 0, rotY: 0 },
      prevState: { x: 0, z: 0, rotY: 0 },
      interpStartTime: Date.now(),
      interpDuration: 100
    };


  },

  // 记录「本地已经应用过这个道具」，用于去重（见 item_pickup_sync 处理器）
  markLocalPick: function (netId) {
    if (!netId) return;
    this._localPicks = this._localPicks || {};
    this._localPicks[netId] = true;
  },

  // ============================================================
  // 绘制/重绘远程玩家头顶标签（名字 + HP 条）
  // ============================================================
  _drawNameLabel: function (canvas, ctx, texture, text, hpPct, level) {
    ctx.clearRect(0, 0, 256, 64);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(0, 0, 256, 64, 8); ctx.fill(); }
    else { ctx.fillRect(0, 0, 256, 64); }
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 26px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var label = text + (level ? ' Lv.' + level : '');
    ctx.fillText(label, 128, 28);
    // HP 条
    var pct = Math.max(0, Math.min(1, hpPct));
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(28, 48, 200, 8);
    ctx.fillStyle = pct > 0.5 ? '#44ff88' : (pct > 0.25 ? '#ffcc44' : '#ff5544');
    ctx.fillRect(28, 48, 200 * pct, 8);
    if (texture) texture.needsUpdate = true;
  },

  // ============================================================
  // 移除远程玩家
  // ============================================================
  removeRemotePlayer: function (peerId) {
    var rp = this.remotePlayers[peerId];
    if (rp && rp.mesh) {
      try { (window.scene || scene).remove(rp.mesh); } catch (e) { }
      // 清理材质和几何体
      rp.mesh.traverse(function (child) {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (child.material.map) child.material.map.dispose();
          child.material.dispose();
        }
      });
    }
    delete this.remotePlayers[peerId];

  },

  // ============================================================
  // 每帧更新远程玩家位置（插值）
  // ============================================================
  updateRemotePlayers: function (delta) {
    if (GS.mode !== 'multiplayer') return;

    var now = Date.now();
    var localCamera = window.camera;

    for (var pid in this.remotePlayers) {
      var rp = this.remotePlayers[pid];
      if (!rp || !rp.mesh || !rp.state) continue;

      // 计算插值进度
      var elapsed = now - rp.interpStartTime;
      var interpDuration = rp.interpDuration || this.interpWindow();
      var t = Math.min(1, elapsed / interpDuration);

      if (rp.prevState && rp.state) {
        // 线性插值位置
        rp.mesh.position.x = rp.prevState.x + (rp.state.x - rp.prevState.x) * t;
        rp.mesh.position.z = rp.prevState.z + (rp.state.z - rp.prevState.z) * t;

        // 旋转插值（处理角度环绕）
        var rotDiff = rp.state.rotY - rp.prevState.rotY;
        if (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
        if (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
        rp.mesh.rotation.y = rp.prevState.rotY + rotDiff * t;

        // 呼吸浮动；跳跃状态单独抬高，否则跳跃在别人眼里完全看不出来
        var _breathe = Math.sin(now * 0.003) * 0.02;
        if (rp.state.downed) {
          // 倒地待救：趴在地上，队友一眼能看出这个人倒了、需要救援。
          // 欧拉顺序要先 Y 后 X（YXZ），否则躺下之后再转朝向会"原地打转"，
          // 队友看到的爬行方向就和身体朝向对不上。
          if (rp.mesh.rotation.order !== 'YXZ') rp.mesh.rotation.order = 'YXZ';
          rp.mesh.position.y = 0.12;
          rp.mesh.rotation.x = -Math.PI / 2;
        } else {
          if (rp.mesh.rotation.order !== 'XYZ') rp.mesh.rotation.order = 'XYZ';
          rp.mesh.rotation.x = 0;
          // 飞行中的队友要明显浮在半空，否则在别人眼里只是"跳了一下"
          rp.mesh.position.y = rp.state.flying ? (2.8 + _breathe)
            : (rp.state.isJumping ? (0.55 + _breathe) : _breathe);
        }
      }

      // 攻击挥臂：收到队友的 attack_fx 时这里会有一段 0.38 秒的挥动。
      // 远端模型没有逐帧动画系统，不主动复位的话手臂会永久停在抬起的位置。
      if (rp.attackAnim > 0) {
        rp.attackAnim -= delta;
        var rrig = rp.mesh.userData && rp.mesh.userData.rig;
        if (rrig && rrig.shoulderR) {
          var at = 1 - Math.max(0, rp.attackAnim) / 0.38;
          rrig.shoulderR.rotation.x = -Math.sin(Math.PI * at) * 1.7;
          if (rp.attackAnim <= 0) rrig.shoulderR.rotation.x = 0;
        }
      }

      // 名字标签朝向相机
      if (rp.nameLabel && localCamera) {
        // Sprite 自动面向相机，不需要额外操作
      }
    }
  },

  // ============================================================
  // 加入者：怪物位置插值更新（不运行 AI，仅做平滑插值）
  //
  // 位置唯一权威是主机。加入者绝不自己挪怪物 ——
  // 一旦本地私自移动，就会出现"加入者这边有只怪扑上来打我，
  // 主机/其他队友那边根本没有这只怪"的分裂画面。
  // 主机那边怪物不动的情况统一由主机解决（暂停时也继续跑怪物 AI，见 game-main.js）。
  // ============================================================
  updateSyncedMonsters: function (delta) {
    if (GS.mode !== 'multiplayer' || GS.isHost) return;
    var now = Date.now();
    // 插值窗口按真实到达间隔自适应（同远程玩家）
    var interpWin = this.interpWindow() / 1000;
    // 小怪插值
    if (typeof window.monsters !== 'undefined') {
      for (var i = 0; i < window.monsters.length; i++) {
        var m = window.monsters[i];
        if (!m || !m.userData || m.userData.targetX === undefined || !m.userData.active) continue;
        m.userData.interpTime = (m.userData.interpTime || 0) + delta;
        var t = Math.min(1, m.userData.interpTime / interpWin);
        m.position.x = m.userData.prevX + (m.userData.targetX - m.userData.prevX) * t;
        m.position.z = m.userData.prevZ + (m.userData.targetZ - m.userData.prevZ) * t;
        // 浮空动画
        if (m.userData.type && m.userData.type.fly) {
          m.position.y = 0.6 + Math.sin(now * 0.003) * 0.25;
        } else {
          m.position.y = Math.abs(Math.sin(m.userData.walkPhase || 0)) * 0.08;
        }
        // 发光动画
        m.children.forEach(function (child, idx) {
          if (child.isMesh && child.material && child.material.emissive) {
            child.material.emissiveIntensity = 0.1 + Math.sin(now * 0.002 + idx) * 0.08;
          }
        });
      }
    }
    // Boss 插值
    if (typeof window.bosses !== 'undefined') {
      for (var j = 0; j < window.bosses.length; j++) {
        var b = window.bosses[j];
        if (!b || !b.userData || b.userData.targetX === undefined || !b.userData.active) continue;
        b.userData.interpTime = (b.userData.interpTime || 0) + delta;
        var t2 = Math.min(1, b.userData.interpTime / interpWin);
        b.position.x = b.userData.prevX + (b.userData.targetX - b.userData.prevX) * t2;
        b.position.z = b.userData.prevZ + (b.userData.targetZ - b.userData.prevZ) * t2;
      }
    }
    // 抓捕者插值
    if (typeof window.chaserMonster !== 'undefined' && window.chaserMonster && window.chaserMonster.parent) {
      var c = window.chaserMonster;
      if (c.userData && c.userData.targetX !== undefined) {
        c.userData.interpTime = (c.userData.interpTime || 0) + delta;
        var t3 = Math.min(1, c.userData.interpTime / interpWin);
        c.position.x = c.userData.prevX + (c.userData.targetX - c.userData.prevX) * t3;
        c.position.z = c.userData.prevZ + (c.userData.targetZ - c.userData.prevZ) * t3;
      }
      // 加入者被抓时：贴着抓捕者移动（插值完成后立即执行，确保位置最新）
      if (typeof window.captureState !== 'undefined' && window.captureState && window.captureState.captured &&
          typeof window.player !== 'undefined' && window.player) {
        var _cx = c.position.x, _cz = c.position.z;
        var _px = window.player.position.x, _pz = window.player.position.z;
        var _dx = _cx - _px, _dz = _cz - _pz;
        var _dd = Math.sqrt(_dx * _dx + _dz * _dz);
        if (_dd > 1.5) {
          var _scale = (_dd - 1.5) / _dd;
          window.player.position.x += _dx * _scale;
          window.player.position.z += _dz * _scale;
        }
      }
    }
  },

  // ============================================================
  // 加入者：重放主机那边怪物的一次攻击特效
  //
  // 主机的怪物攻击（claw 光带 + 角色受击爆点）原本只在主机本地播，
  // 加入者完全看不到 —— 队友那边正在被围殴、屏幕上却毫无动静。
  // 这里按主机下发的起止坐标在本地重画一遍。
  // ============================================================
  _replayMonsterAttackFx: function (data) {
    if (!data || typeof THREE === 'undefined') return;
    if (!window.VX || !VX.vfx) return;

    var fromX = data.x || 0, fromZ = data.z || 0;
    // 优先用本地那只怪的实际位置：它可能还在插值，比快照坐标更贴近屏幕上的样子
    if (data.netId) {
      var pools = [window.monsters || [], window.bosses || []];
      var hit = null;
      for (var pi = 0; pi < pools.length && !hit; pi++) {
        for (var i = 0; i < pools[pi].length; i++) {
          var mm = pools[pi][i];
          if (mm && mm.userData && mm.userData.netId === data.netId) { hit = mm; break; }
        }
      }
      if (hit) { fromX = hit.position.x; fromZ = hit.position.z; }
    }

    var toX = (data.tx === undefined || data.tx === null) ? fromX : data.tx;
    var toZ = (data.tz === undefined || data.tz === null) ? fromZ : data.tz;

    var dx = toX - fromX, dz = toZ - fromZ;
    var len = Math.sqrt(dx * dx + dz * dz);
    if (len < 0.0001) { dx = 0; dz = 1; len = 1; }

    var scale = data.scale || 1;
    var color = (data.color === undefined || data.color === null) ? 0xff3322 : data.color;
    var dir = new THREE.Vector3(dx / len, 0, dz / len);
    var mid = new THREE.Vector3((fromX + toX) / 2, 1.0, (fromZ + toZ) / 2);

    VX.vfx.slashLines(mid, dir, color, {
      count: 3,
      length: 1.7 * scale,
      spread: 0.34 * scale
    });

    // 只有"打的就是我"时才加受击爆点和震屏，打队友只放光带
    var me = window.player;
    if (me) {
      var mdx = me.position.x - toX, mdz = me.position.z - toZ;
      if (Math.sqrt(mdx * mdx + mdz * mdz) < 2.5) {
        var hitPos = new THREE.Vector3(me.position.x, me.position.y + 0.85, me.position.z);
        VX.vfx.impact(hitPos, color, {
          scale: 0.95,
          groundRing: false,
          streakCount: 7,
          chipColor: color,
          chipCount: 6
        });
        VX.vfx.shake(0.03, 0.18);
      }
    }
  },

  // ============================================================
  // 加入者：发送输入到主机
  // ============================================================
  sendInput: function () {
    if (GS.mode !== 'multiplayer' || GS.isHost) return;
    if (!PeerManager.connected) return;

    // 输入包限流到 30Hz。
    // 原来每帧（60Hz）都发一整包 JSON 给主机，主机再转发/处理，
    // 局域网带宽根本不是瓶颈，但 JSON 序列化 + parse 的 CPU 开销会直接吃掉帧率。
    var _nowMs = Date.now();
    if (this._lastInputAt && _nowMs - this._lastInputAt < 33) return;
    this._lastInputAt = _nowMs;

    // 记录最后发送的 HP 和能量，用于防止快照撤销本地变化
    this._lastSentHp = GS.hp;
    this._lastSentEnergy = GS.energy;
    this._lastSentFragments = GS.fragments;

    var input = {
      moveX: 0,
      moveZ: 0,
      attack: false,
      jump: false,
      skill: false,
      mouseX: (typeof window.mouse !== 'undefined' ? window.mouse.x : 0),
      flashlight: false,
      posX: (typeof window.player !== 'undefined' && window.player) ? window.player.position.x : 0,
      posZ: (typeof window.player !== 'undefined' && window.player) ? window.player.position.z : 0,
      rotY: (typeof window.player !== 'undefined' && window.player) ? window.player.rotation.y : 0,
      energy: GS.energy || 0,
      fragments: GS.fragments || 0,
      hp: (typeof currentPlayerHp === 'function' ? currentPlayerHp() : (GS.hp || 100)),
      energyMax: GS.energyMax || 5,
      maxHp: GS.maxHp || 100,
      correct: GS.correct || 0,
      total: GS.total || 0,
      curWeapon: GS.curWeapon || '木棍',
      level: GS.level || 1,
      downed: GS.downed || false,
      isCaptured: (typeof window.captureState !== 'undefined' && window.captureState) ? window.captureState.captured : false
    };

    // 收集按键状态
    if (typeof window.keys !== 'undefined') {
      if (window.keys['w'] || window.keys['arrowup']) input.moveZ = -1;
      if (window.keys['s'] || window.keys['arrowdown']) input.moveZ = 1;
      if (window.keys['a'] || window.keys['arrowleft']) input.moveX = -1;
      if (window.keys['d'] || window.keys['arrowright']) input.moveX = 1;
    }

    // 发送输入到主机（每帧发送以确保位置同步）。
    // 用 sendTo 定向发给房主，而不是 broadcast —— 原来广播会让房间里
    // 每个加入者都收到彼此的位置包（3 人房流量翻 3 倍），而加入者根本
    // 不处理 player_input，纯粹是浪费。
    var _hostId = (PeerManager.getHostId && PeerManager.getHostId()) || null;
    if (_hostId && _hostId !== PeerManager.playerId) {
      PeerManager.sendTo(_hostId, 'player_input', input);
    } else {
      // 兜底：列表里暂时找不到房主（刚重连、列表还没刷回来）时退回广播
      PeerManager.broadcast('player_input', input);
    }
  },

  // ============================================================
  // 初始化联机模式
  // ============================================================
  initMultiplayerMode: function () {
    var self = this;

    // 每局开局 init() 都会走到这里，而 PeerManager.on() 只是往数组里 push、没有去重。
    // 于是从第二局开始，同一份快照会被处理两遍（位置被插值重置两次、伤害重复结算、
    // 远程玩家被清理两遍），表现出来就是"越玩越乱、越玩越卡"。
    // 这里先把本模块负责的消息类型全部清空，再重新注册一次。
    var _MY_TOPICS = [
      'world_state_request', 'world_snapshot', 'player_input', 'monster_damage', 'monster_damage_reject',
      'item_pickup_sync', 'item_picked', 'item_refresh', 'chest_refresh', 'chest_opened', 'monster_shot', 'chest_interact',
      'chest_reject', 'monster_attack_fx',
      'quiz_answer', 'quiz_trigger', 'quiz_result',
      'game_event', 'game_over', 'chat_broadcast', 'energy_shared', 'attack_fx',
      'player_down', 'player_revived', 'all_down', 'player_escaped'
    ];
    if (typeof PeerManager.off === 'function') {
      _MY_TOPICS.forEach(function (topic) { PeerManager.off(topic); });
    }

    console.log('[Sync] initMultiplayerMode: GS.mode=' + GS.mode + ' GS.isHost=' + GS.isHost + ' PeerManager.isHost=' + PeerManager.isHost);

    // 队友的攻击特效（开火 / 挥砍 / 放技能）。
    //
    // 必须注册在 if (GS.isHost) 之前 —— 双方都要能"看到别人在打"。
    // 一开始我把它写进了 else（加入者）分支里，结果主机根本收不到，
    // 症状就是"加入者开火，主机屏幕上什么都没有"。
    PeerManager.on('attack_fx', function (data, fromPeerId) {
      if (!data) return;
      if (typeof spawnRemoteAttackFx === 'function') {
        spawnRemoteAttackFx(data, fromPeerId);
      }
    });

    // 倒地 / 复活 / 全员倒地：同样主机和加入者都要注册（见上面 attack_fx 的说明）
    if (typeof initReviveNetwork === 'function') initReviveNetwork();

    // 能量全队共享：谁答题 / 开宝箱 / 合成都广播一次增量，所有人各自加到本地池子。
    //
    // 必须放在双方共用区：原来写在 `if (GS.isHost)` 里，只有主机收得到 ——
    // 3 人房里「加入者 B 拿到的能量，加入者 C 收不到」，只能靠 50ms 一次的快照兜底，
    // 会出现能量条卡顿/短暂不一致。服务器广播会排除发送者，所以不会重复计算。
    PeerManager.on('energy_shared', function (data) {
      if (!data || !data.delta) return;
      if (typeof applyEnergyGain === 'function') applyEnergyGain(data.delta, true);
    });

    // game_event / chat_broadcast 必须双方都注册。
    //
    // 这两块原来写在下面的 else（加入者）分支里，主机收不到 ——
    // 于是"加入者先跑到飞船触发逃生"这条路径主机完全没有反应，
    // 表现就是加入者自己飞走了、主机还留在原地。
    PeerManager.on('game_event', function (data) {
      if (!data) return;
      switch (data.event) {
        case 'monster_defeated':
          // 碎片掉落已通过快照 _syncFragments 同步，此处不再重复创建
          break;
        case 'player_captured':
          if (typeof capturePlayer === 'function' && data.playerId === PeerManager.playerId) {
            capturePlayer();
          }
          break;
        case 'captive_delivered':
          // 主机通知：你已被追捕者拖到 Boss 面前。
          // 伤害与进度清零由本地结算（血量本来就是各自权威的）。
          if (data.playerId && data.playerId === PeerManager.playerId) {
            if (typeof applyCaptiveDeliveredPenalty === 'function') {
              applyCaptiveDeliveredPenalty(data.bossName);
            }
          }
          break;
        case 'player_rescued':
          if (typeof breakFreeFromCapture === 'function' && data.playerId === PeerManager.playerId) {
            breakFreeFromCapture();
          }
          break;
        case 'escape':
          // 旧版本（≤ 10-19y）把撤离当作"全队事件"广播这个 type。
          // 新逻辑下不再执行全队起飞，只把发送者记成已撤离 ——
          // 否则一个老客户端摸到飞船，整个房间都会被它带走。
          if (data.playerId) {
            if (typeof markPlayerEscaped === 'function') markPlayerEscaped(data.playerId, data.name);
          }
          if (!GS.isHost) {
            if (typeof showMessage === 'function') showMessage('ℹ️ 撤离需要每个人自己走到飞船', 0x88ccff);
          }
          break;
        case 'item_pickup':
          if (typeof showMessage === 'function' && data.message) {
            showMessage(data.message, 0xffd700);
          }
          break;
      }
    });

    // 撤离：**每个玩家自己走到飞船**才能走，不再"一个人带走全队"。
    // 发送方广播"我撤了"，其他人继续各自玩；主机负责把这个人从场上摘掉，
    // 并在场上没有人剩下时结算。
    PeerManager.on('player_escaped', function (data, fromPeerId) {
      var pid = (data && data.playerId) || fromPeerId;
      if (!pid || pid === PeerManager.playerId) return;
      if (typeof markPlayerEscaped === 'function') markPlayerEscaped(pid, data && data.name);
    });

    PeerManager.on('chat_broadcast', function (data) {      if (data) {
        MultiplayerUI.addChatMessage(data.playerName || '未知', data.text || '');
      }
    });

    if (GS.isHost) {
      // 主机模式：注册消息处理器

      // 加入者上报"我读完条了，要开这个宝箱"。
      //
      // 加入者本地跑 tickChestHold 读条（判定用本地精确坐标），攒满后发这条消息；
      // 主机在这里做最终裁决（冷却 / 倒地 / 距离粗校验）再触发远程答题。
      // 这样开箱不再依赖主机拿上报位置做距离判定，避免同步延迟导致"站在宝箱上却开不了"。
      PeerManager.on('chest_interact', function (data, fromPeerId) {
        if (!data || !fromPeerId) return;

        // 明确回一条"开不了"，让加入者知道该停手。
        // 不回的话，加入者那边只能一直读条重试；如果本地那个宝箱其实是个幽灵
        // （主机早没了），就会无限循环「读条 → 上报 → 没反应」，
        // 玩家看到的就是"一直在重复开启宝箱，但宝箱永远打不开"。
        var reject = function (reason) {
          PeerManager.sendTo(fromPeerId, 'chest_reject', {
            netId: data.netId || null,
            isGold: !!data.isGold,
            reason: reason || 'gone'
          });
        };

        var p = PeerManager.players[fromPeerId];
        if (!p || !p.position) { reject('position'); return; }
        if (p.downed) { reject('downed'); return; }
        if (p._quizCooldown > 0) { reject('cooldown'); return; }

        if (data.isGold) {
          var orb = (typeof window.energyOrb !== 'undefined') ? window.energyOrb : null;
          if (!orb || !orb.userData || !orb.userData.active) { reject('gone'); return; }
          if (orb.userData.cooldown > 0) { reject('cooldown'); return; }
          // 距离只做防作弊的粗校验：加入者本地已经读过条，这里放宽到 4 米
          var dg = Math.sqrt(
            Math.pow(p.position.x - orb.position.x, 2) +
            Math.pow(p.position.z - orb.position.z, 2)
          );
          if (dg > 4) { reject('far'); return; }
          p._quizCooldown = 2;
          if (typeof triggerQuizForPlayer === 'function') {
            triggerQuizForPlayer(fromPeerId, pickRandomQuestion(), true);
          }
        } else {
          if (!data.netId) { reject('gone'); return; }
          var arr = (typeof window.normalChests !== 'undefined') ? window.normalChests : [];
          var nc = null;
          for (var ci = 0; ci < arr.length; ci++) {
            if (arr[ci].userData && arr[ci].userData.netId === data.netId && arr[ci].userData.active) {
              nc = arr[ci];
              break;
            }
          }
          if (!nc) { reject('gone'); return; }
          var dn = Math.sqrt(
            Math.pow(p.position.x - nc.position.x, 2) +
            Math.pow(p.position.z - nc.position.z, 2)
          );
          if (dn > 4) { reject('far'); return; }
          p._quizCooldown = 2;
          if (typeof destroyChestItem === 'function') destroyChestItem(nc);
          else nc.userData.active = false;
          if (typeof triggerQuizForPlayer === 'function') {
            triggerQuizForPlayer(fromPeerId, pickRandomQuestion(), false);
          }
        }
      });

      PeerManager.on('player_input', function (data, fromPeerId) {
        // 更新加入者的移动状态和能量/HP/答题等状态
        if (PeerManager.players[fromPeerId]) {
          var p = PeerManager.players[fromPeerId];
          p.moveX = data.moveX || 0;
          p.moveZ = data.moveZ || 0;
          p.attack = data.attack || false;
          p.jump = data.jump || false;
          p.skill = data.skill || false;
          p.mouseX = data.mouseX || 0;
          // 使用加入者发送的绝对位置（客户端预测，主机信任）
          if (data.posX !== undefined && data.posZ !== undefined) {
            if (!p.position) p.position = { x: 0, z: 0 };
            p.position.x = data.posX;
            p.position.z = data.posZ;
            p.rotationY = data.rotY || 0;
          }
          // 同步加入者状态到主机
          p.energy = data.energy || 0;
          p.fragments = data.fragments || 0;
          // hp=0（倒地）是合法值，不能写成 `data.hp || 100`
          p.hp = (typeof data.hp === 'number') ? data.hp : 100;
          p.maxHp = data.maxHp || 100;
          p.energyMax = data.energyMax || 5;
          p.downed = !!data.downed;
          p.correct = data.correct || 0;
          p.total = data.total || 0;
          p.level = data.level || 1;   // 队友名字标签要显示正确等级
          p.isCaptured = data.isCaptured || false;
          // 加入者挣脱后上报 isCaptured=false：主机解除抓捕者挟持
          if (!p.isCaptured && typeof chaserMonster !== 'undefined' && chaserMonster &&
              chaserMonster.userData && chaserMonster.userData.captiveId === fromPeerId) {
            if (typeof releaseChaserCaptive === 'function') {
              releaseChaserCaptive(chaserMonster, p, false); // 加入者已自行挣脱，无需再通知
            }
          }
          p.curWeapon = data.curWeapon || '木棍';
        }
      });

      // 答题结果（来自加入者）
      PeerManager.on('quiz_answer', function (data, fromPeerId) {
        if (!data) return;
        // 不要检查 window.currentQuizChest！该变量只在主机本地答题时设置
        // 加入者的答题由 triggerQuizForPlayer 触发，主机问卷保存在 _remoteQuizQuestions
        var answerIndex = data.answerIndex;
        var currentQuestion = self._remoteQuizQuestions && self._remoteQuizQuestions[fromPeerId];
        // 如果没有远程问卷，尝试使用本地 currentQuizQuestion（兼容旧逻辑）
        if (!currentQuestion && window._currentQuizQuestion) {
          currentQuestion = window._currentQuizQuestion;
        }
        if (currentQuestion) {
          var correct = (answerIndex === currentQuestion.a);
          // 处理答题结果
          if (correct) {
            GS.correct++;
            GS.stars += 10;
            // 触发能量奖励
            if (typeof gainEnergy === 'function') gainEnergy(3);
          } else {
            // 金色宝箱答错 → 和主机本地开箱一致，进 8 秒冷却。
            // 不加的话加入者可以每 2 秒无限开同一个金箱刷能量。
            var _qMeta = self._remoteQuizMeta && self._remoteQuizMeta[fromPeerId];
            if (_qMeta && _qMeta.isGold && typeof window.energyOrb !== 'undefined' && window.energyOrb
                && window.energyOrb.userData) {
              window.energyOrb.userData.cooldown = 8;
              window.energyOrb.userData.openProgress = 0;
            }
          }
          PeerManager.sendTo(fromPeerId, 'quiz_result', {
            correct: correct,
            correctAnswer: currentQuestion.a,
            playerId: fromPeerId
          });
          // 清理远程问卷缓存
          if (self._remoteQuizQuestions) {
            delete self._remoteQuizQuestions[fromPeerId];
          }
          if (self._remoteQuizMeta) {
            delete self._remoteQuizMeta[fromPeerId];
          }
        } else {
          // 找不到对应题目（题面丢了 / 加入者重复提交 / 主机刚重开过一局）。
          // 必须回一条结果：加入者的答题界面是靠 quiz_result 才会自动收尾的，
          // 不回的话那道题会一直挂在加入者屏幕上、GS.running 永远是 false，
          // 整局卡死 —— 怪物不动、宝箱不开、人也走不了。
          console.warn('[Sync] 收到加入者答题，但找不到对应题目，fromPeerId:', fromPeerId);
          PeerManager.sendTo(fromPeerId, 'quiz_result', {
            correct: false,
            correctAnswer: -1,
            unknown: true,
            playerId: fromPeerId
          });
        }
      });

      // 加入者请求完整世界状态
      PeerManager.on('world_state_request', function (data, fromPeerId) {
        // 立即发送一次完整快照给请求者
        var snapshot = self._buildSnapshot();
        PeerManager.sendTo(fromPeerId, 'world_snapshot', snapshot);
      });

      // 加入者上报"怪物打了我一下"：主机这边也要把爪击光带画出来，
      // 否则房主只会看到队友血条往下掉，却看不到是哪只怪在打他。
      PeerManager.on('monster_attack_fx', function (data) {
        if (!data) return;
        if (typeof SyncManager !== 'undefined' && SyncManager._replayMonsterAttackFx) {
          SyncManager._replayMonsterAttackFx(data);
        }
      });

      // 加入者上报对怪物/抓捕者造成的伤害：主机权威扣血与判定死亡
      PeerManager.on('monster_damage', function (data, fromPeerId) {
        if (!data || !data.dmg) return;
        var target = null;
        if (data.isChaser) {
          target = (typeof window.chaserMonster !== 'undefined') ? window.chaserMonster : null;
        } else if (typeof findMonsterByNetId === 'function') {
          target = findMonsterByNetId(data.netId);
        }
        if (!target || !target.userData || !target.userData.active) {
          // 找不到目标：多半是加入者打的是一只刚被击杀 / 刚重生换新 id 的旧怪。
          // 必须回一条拒绝 —— 加入者本地已经预测扣过血了，不补回去的话
          // 那只怪的血条会一直停在错误值上，玩家就以为"打了没反应"。
          if (window.__mdRejectAt === undefined || Date.now() - window.__mdRejectAt > 3000) {
            window.__mdRejectAt = Date.now();
            console.warn('[Sync] monster_damage 找不到目标（已死亡/重生/不存在）netId=', data.netId);
          }
          PeerManager.sendTo(fromPeerId, 'monster_damage_reject', {
            netId: data.netId || null,
            dmg: data.dmg,
            isChaser: !!data.isChaser
          });
          return;
        }
        target.userData.hp -= data.dmg;
        target.userData.lastAttackedTime = (typeof clock !== 'undefined' && clock) ? clock.elapsedTime : 0;
        target.userData.hitFlash = 0.2;
        // Boss 阶段变化（与主机本地命中一致）
        if (target.userData.isBoss && target.userData.hp > 0 && target.userData.type) {
          var ratio = target.userData.hp / target.userData.type.hp;
          if (ratio <= 0.33 && target.userData.bossPhase > 1) {
            target.userData.bossPhase = 1; target.userData.speedMul = 1.5;
          } else if (ratio <= 0.66 && target.userData.bossPhase > 2) {
            target.userData.bossPhase = 2; target.userData.speedMul = 1.25;
          }
        }
        if (target.userData.hp <= 0) {
          if (data.isChaser || target.userData.isChaser) {
            // 抓捕者被击败：与主机本地击败逻辑一致
            target.userData.active = false;
            if (target.parent && typeof window.scene !== 'undefined') window.scene.remove(target);
            window.chaserMonster = null;
            if (typeof spawnFragmentDrop === 'function') spawnFragmentDrop(target.position.clone());
            if (typeof spawnChaser === 'function') {
              setTimeout(function () {
                if (typeof canSpawnEnemiesNow === 'function' && !canSpawnEnemiesNow()) return;
                if (GS.running && !GS.gameOver) spawnChaser();
              }, (typeof chaserRespawnDelayMs === 'function') ? chaserRespawnDelayMs() : 35000);
            }
          } else if (typeof onMonsterDefeated === 'function') {
            onMonsterDefeated(target);
          }
        }
      });

      // 加入者上报的拾取：主机是权威端，负责移除道具、记录效果、补刷、再广播。
      //
      // 这段原来被写进了下面的加入者分支 —— 结果房主根本收不到拾取通知，
      // 只能靠"拿上报位置轮询距离"这条慢路径兜底；而其他加入者会把它当成
      // 权威消息处理并再广播一次 item_pickup_sync，拾取者于是把同一件道具
      // 的效果应用两遍（三人房里防御宝石 +20 变 +40，药水双倍回血）。
      PeerManager.on('item_picked', function (data, fromPeerId) {
        if (!data || !data.itemType) return;
        if (fromPeerId && fromPeerId === PeerManager.playerId) return;

        var pid = data.pickerId || fromPeerId;
        var hostItems = window.items;
        var pickedPos = null;

        if (hostItems) {
          for (var hi = hostItems.length - 1; hi >= 0; hi--) {
            var hit = hostItems[hi];
            if (!hit || !hit.userData) continue;
            var match = data.netId
              ? (hit.userData.netId === data.netId)
              : (hit.userData.active && hit.userData.itemType &&
                hit.userData.itemType.id === data.itemType);
            if (!match) continue;

            pickedPos = { x: hit.position.x, z: hit.position.z };
            hit.userData.active = false;
            if (hit.parent && window.scene) { try { window.scene.remove(hit); } catch (e) { } }
            hostItems.splice(hi, 1);
            break;
          }
        }

        // 维护主机侧的玩家记录。
        // 只有当本次上报真的消费掉了道具时才记一笔：
        // 主机的 processJoinerInputs 可能抢先处理了同一件道具（它也按位置检测），
        // 那样 pickedPos 为 null，就不要把效果记两遍。
        var jp = PeerManager.players[pid];
        if (pickedPos && jp && typeof applyItemEffectToJoiner === 'function') {
          applyItemEffectToJoiner(jp, data.itemType);
        }

        // 10 秒后补刷一个道具，并通知所有加入者
        if (pickedPos && typeof ROOMS !== 'undefined') {
          var pickRoom = null;
          for (var ri = 0; ri < ROOMS.length; ri++) {
            if (Math.abs(pickedPos.x - ROOMS[ri].cx) < roomSize / 2 &&
              Math.abs(pickedPos.z - ROOMS[ri].cz) < roomSize / 2) {
              pickRoom = ROOMS[ri];
              break;
            }
          }
          if (pickRoom && typeof spawnItemsInRoom === 'function') {
            (function (room) {
              setTimeout(function () {
                spawnItemsInRoom(room);
                PeerManager.broadcast('item_refresh', { roomCx: room.cx, roomCz: room.cz });
              }, 10000);
            })(pickRoom);
          }
        }

        // 广播给其他加入者，让他们场景里的道具也消失
        PeerManager.broadcast('item_pickup_sync', {
          netId: data.netId || null,
          itemType: data.itemType,
          pickerId: pid,
          pickerName: data.pickerName || '队友'
        });
      });
    } else {
      // 加入者模式：注册消息处理器
      PeerManager.on('world_snapshot', function (data) {
        self.applySnapshot(data);
      });

      PeerManager.on('quiz_trigger', function (data) {
        // 显示答题界面
        if (data && typeof showQuiz === 'function') {
          // 保存当前题目
          window._currentQuizQuestion = {
            q: data.question,
            o: data.options,
            a: data.correctAnswer
          };
          // 禁用本地答题触发，使用主机下发的题目
          showQuizFromHost(data);
        }
      });

      // 接收主机验证的答题结果
      PeerManager.on('quiz_result', function (data) {
        if (!data || data.correct === undefined) return;

        // 已经有结果了：换成"看结果"的计时，不再是开放式等待
        clearQuizIdleTimer();
        window.__quizIdleAction = null;

        var overlay = document.getElementById('quiz-overlay');
        var rewardEl = document.getElementById('quiz-reward');
        var closeBtn = document.getElementById('quiz-close');

        var closeAfterResult = function (ms) {
          var _quizToken = (window.__quizResultToken = (window.__quizResultToken || 0) + 1);
          armQuizIdleTimer(function () {
            if (_quizToken !== window.__quizResultToken) return;   // 又来了一道新题，别误关
            var ov = document.getElementById('quiz-overlay');
            if (!ov || ov.style.display !== 'flex') return;
            ov.style.display = 'none';
            if (!GS.gameOver && !GS.escaping) GS.running = true;
          }, ms);
        };

        // unknown：主机那边已经找不到这道题了（题面缓存对不上 / 主机重开过一局）。
        // 只把界面收掉，不算错也不给奖励 —— 重点是别让整局永久停在答题状态。
        if (data.unknown) {
          if (rewardEl) {
            rewardEl.textContent = '这道题已失效，继续冒险吧';
            rewardEl.style.color = '#88ccff';
            rewardEl.style.display = 'block';
          }
          if (closeBtn) closeBtn.style.display = 'inline-block';
          closeAfterResult(2000);
          return;
        }

        // 更新本地状态
        if (data.correct) {
          GS.correct++;
          GS.stars += 10;
          if (typeof gainEnergy === 'function') gainEnergy(3);
        }
        // 更新答题界面显示
        if (rewardEl) {
          if (data.correct) {
            rewardEl.textContent = '✅ 回答正确！获得能量+3！';
            rewardEl.style.color = '#44ff88';
          } else {
            rewardEl.textContent = '❌ 回答错误，继续加油！';
            rewardEl.style.color = '#ff8888';
          }
          rewardEl.style.display = 'block';
        }
        if (closeBtn) closeBtn.style.display = 'inline-block';

        // 作答后留够时间看结果（原来 3 秒太短，小朋友还没看清奖了什么都关了）；
        // 期间点"继续冒险"仍然可以立即关闭。
        closeAfterResult(QUIZ_RESULT_CLOSE_MS);
      });

      // 接收道具刷新通知：主机端道具被拾取后10秒刷新
      PeerManager.on('item_refresh', function (data) {
        if (!data) return;
        // 找到对应房间并刷新道具
        if (typeof ROOMS !== 'undefined' && typeof spawnItemsInRoom === 'function') {
          var room = null;
          for (var ri = 0; ri < ROOMS.length; ri++) {
            if (ROOMS[ri].cx === data.roomCx && ROOMS[ri].cz === data.roomCz) {
              room = ROOMS[ri];
              break;
            }
          }
          if (room) {
            spawnItemsInRoom(room);
          }
        }
      });

      // 道具被拾取（主机捡的 / 队友捡的都走这条）
      // 注意：加入者捡道具上报的是 item_picked，这条处理器只在**主机分支**注册
      // （见下方 GS.isHost 分支）。加入者收到它必须直接忽略——
      // 原来把它注册进了加入者分支，第三个加入者会把自己当成权威端再广播一次
      // item_pickup_sync，拾取者于是把同一件道具的效果应用两遍（属性翻倍）。
      PeerManager.on('item_pickup_sync', function (data) {
        if (!data) return;

        // ---- 1) 移除本地对应道具 ----
        // 优先按 netId 精确匹配：原来只按类型删，同名道具会误删别人的那个。
        if (typeof window.items !== 'undefined') {
          for (var ii = 0; ii < window.items.length; ii++) {
            var it = window.items[ii];
            if (!it || !it.userData) continue;
            var match = data.netId
              ? (it.userData.netId === data.netId)
              : (it.userData.active && it.userData.itemType && data.itemType &&
                it.userData.itemType.id === data.itemType);
            if (!match) continue;

            it.userData.active = false;
            if (it.parent && window.scene) {
              try { window.scene.remove(it); } catch (e) { }
            }
            window.items.splice(ii, 1);
            break;
          }
        }

        // ---- 2) 自己捡的，要在本地真正生效 ----
        // 主机端 applyItemEffectToJoiner 只改了 PeerManager.players 里那份记录，
        // 加入者的 GS 完全没变——这就是"捡了道具没效果"的根本原因。
        if (data.pickerId === PeerManager.playerId && data.itemType) {
          // 加入者已经在本地先应用过一次（见 ItemSystem.updateItems 的加入者分支），
          // 这里不能重复 apply，否则同一个道具的效果会翻倍。
          var _alreadyLocal = !!(data.netId && self._localPicks && self._localPicks[data.netId]);
          if (data.netId && self._localPicks) delete self._localPicks[data.netId];
          if (_alreadyLocal) return;   // 本地已生效，只移除不再 apply

          var def = null;
          if (typeof window.ITEM_TYPES !== 'undefined') {
            for (var k = 0; k < window.ITEM_TYPES.length; k++) {
              if (window.ITEM_TYPES[k].id === data.itemType) { def = window.ITEM_TYPES[k]; break; }
            }
          }
          if (def && typeof def.apply === 'function') {
            def.apply();   // 内部会改 GS 并弹提示
            if (typeof updateHUD === 'function') updateHUD();
          }
        }
      });

      // 接收宝箱刷新通知
      // 有人打开宝箱：本地同步移除。
      // 加入者的宝箱补刷完全依赖主机（这里不能调 destroyChestItem，否则本地也会
      // 再 spawn 一个，两端数量翻倍），所以只做移除，等主机的 chest_refresh 补位。
      // 远程怪物的弹丸：加入者不跑怪物 AI，看不到弹丸本体，
      // 表现就是"远程怪对着空气开火、我却莫名掉血"。这里按主机广播重建弹丸，
      // 命中判定沿用本地 projectiles 循环（p.userData.playerDamage）。
      PeerManager.on('monster_shot', function (data) {
        if (!data || typeof THREE === 'undefined') return;
        if (typeof window.scene === 'undefined' || !window.scene) return;
        var fb = new THREE.Mesh(
          new THREE.SphereGeometry(0.15, 8, 8),
          new THREE.MeshStandardMaterial({
            color: data.color || 0xff4422,
            emissive: data.color || 0xff2200,
            emissiveIntensity: 0.8
          })
        );
        fb.position.set(data.x || 0, data.y || 1, data.z || 0);
        fb.userData = {
          vel: new THREE.Vector3(
            (data.dx || 0) * 5,
            (data.dy || 0) * 5,
            (data.dz || -1) * 5
          ),
          life: 4,
          playerDamage: data.dmg || 10,
          remoteShot: true
        };
        window.scene.add(fb);
        if (typeof window.projectiles !== 'undefined' && window.projectiles) {
          window.projectiles.push(fb);
        }
      });

      // 主机回执："这个宝箱开不了"。
      //
      // reason=gone 说明主机那边根本没有这个宝箱/金箱了 —— 本地这份是幽灵，
      // 直接删掉，否则玩家会对着空气一遍遍读条，永远打不开。
      // 其它原因（冷却 / 倒地 / 距离偏差）只做提示，还能再试。
      PeerManager.on('chest_reject', function (data) {
        if (!data) return;
        if (typeof hideChestProgress === 'function') hideChestProgress();

        if (data.reason === 'gone') {
          if (data.isGold) {
            if (window.energyOrb && window.energyOrb.parent) {
              try { window.scene.remove(window.energyOrb); } catch (e) { }
            }
            window.energyOrb = null;
            if (typeof energyOrb !== 'undefined') energyOrb = null;
            if (typeof showMessage === 'function') showMessage('🎁 这个金色宝箱已经被开掉了', 0xffd700);
            return;
          }
          var _rejArr = window.normalChests || [];
          for (var _ri = _rejArr.length - 1; _ri >= 0; _ri--) {
            var _rc = _rejArr[_ri];
            if (!_rc || !_rc.userData || _rc.userData.netId !== data.netId) continue;
            _rc.userData.active = false;
            _rc.userData.destroyed = true;
            if (_rc.parent && window.scene) { try { window.scene.remove(_rc); } catch (e) { } }
            _rejArr.splice(_ri, 1);
            break;
          }
          if (typeof showMessage === 'function') showMessage('📦 这个宝箱已经被队友打开了', 0xffd700);
          return;
        }

        // 'cooldown' 不提示：那通常就是主机刚给这名玩家弹了题、或者刚开过，
        // 答题界面/进度条本身已经够表达了，再弹一条文字只会挡住题面。
        if (data.reason === 'downed') {
          if (typeof showMessage === 'function') showMessage('💀 倒地状态下不能开宝箱', 0xff8888);
        } else if (data.reason === 'far') {
          if (typeof showMessage === 'function') showMessage('📍 离宝箱太远了，走近一点再试', 0x88ccff);
        }
      });

      // 队友那边的怪物挥爪 / 命中特效。
      //
      // 怪物 AI 只跑在主机上，而 claw 光带、受击爆点这些全是本地特效 ——
      // 不广播的话，加入者只看到怪物在原地"隔空咬人"，完全没有打击感。
      PeerManager.on('monster_attack_fx', function (data) {
        if (!data) return;
        if (typeof SyncManager !== 'undefined' && SyncManager._replayMonsterAttackFx) {
          SyncManager._replayMonsterAttackFx(data);
        }
      });

      // 主机拒收了这次伤害（打的是已死亡 / 刚重生换 id 的旧怪）：
      // 把本地预测扣掉的血补回去，否则那只怪的血条会一直停在错误值上，
      // 玩家就以为"我打了但怪不掉血"。
      PeerManager.on('monster_damage_reject', function (data) {
        if (!data) return;
        var m = (typeof findMonsterByNetId === 'function') ? findMonsterByNetId(data.netId) : null;
        if (!m && data.isChaser && typeof window.chaserMonster !== 'undefined') {
          m = window.chaserMonster;
        }
        if (m && m.userData && typeof data.dmg === 'number' && data.dmg > 0) {
          var maxHp = (m.userData.type && m.userData.type.hp) || m.userData.maxHp || 100;
          m.userData.hp = Math.min(maxHp, (m.userData.hp || 0) + data.dmg);
        }
      });

      PeerManager.on('chest_opened', function (data) {
        if (!data) return;
        var arr = window.normalChests || [];
        for (var ci = arr.length - 1; ci >= 0; ci--) {
          var c = arr[ci];
          if (!c || !c.userData) continue;
          var hit = data.netId
            ? (c.userData.netId === data.netId)
            : (typeof data.x === 'number'
                && Math.abs(c.position.x - data.x) < 0.8
                && Math.abs(c.position.z - data.z) < 0.8);
          if (!hit) continue;
          c.userData.active = false;
          c.userData.destroyed = true;
          if (c.parent && window.scene) { try { window.scene.remove(c); } catch (e) { } }
          arr.splice(ci, 1);
          break;
        }
      });

      PeerManager.on('chest_refresh', function (data) {
        if (!data) return;
        // 主机端宝箱重生了，加入者同步创建
        if (typeof spawnChest === 'function') {
          var excludeRoom = null;
          if (typeof ROOMS !== 'undefined' && data.fromRoomCx !== undefined) {
            for (var ri = 0; ri < ROOMS.length; ri++) {
              if (ROOMS[ri].cx === data.fromRoomCx && ROOMS[ri].cz === data.fromRoomCz) {
                excludeRoom = ROOMS[ri];
                break;
              }
            }
          }
          spawnChest(excludeRoom);
        }
      });

      PeerManager.on('game_over', function (data) {
        // 已经自己结算过了（比如本人在飞船边先撤离，已经看过结算画面）就别再刷一遍
        if (GS.gameOver) return;
        if (data) {
          GS.gameOver = true;
          GS.running = false;
          // 同步主机端的统计数据
          if (data.stats) {
            GS.correct = data.stats.correct || GS.correct;
            GS.total = data.stats.total || GS.total;
            GS.stars = data.stats.stars || GS.stars;
            GS.energy = data.stats.energy || GS.energy;
          }
          if (typeof showGameOver === 'function') {
            var title = document.getElementById('result-title');
            var answers = document.getElementById('final-answers');
            var weapons = document.getElementById('final-weapons');
            var gameOverEl = document.getElementById('game-over');
            if (title) title.textContent = (data.winner === 'defeat') ? '💔 闯关失败...' : '🎉 章节 ' + GS.chapter + ' 通关!';
            if (answers) answers.textContent = '✅ 答对题目: ' + GS.correct + '/' + GS.total;
            if (weapons) weapons.textContent = '⚔️ 获得武器: ' + (GS.weaponCount || 0) + '/3';
            if (gameOverEl) gameOverEl.style.display = 'flex';
          }
        }
      });

    }
  }
};

// ============================================================
// 主机触发的答题（加入者端）
// ============================================================
function showQuizFromHost(data) {
  var overlay = document.getElementById('quiz-overlay');
  if (!data) return;

  // 题目优先用本次消息里的，拿不到才退回缓存。
  // 旧代码这里有一句 `if (overlay.style.display === 'flex') return;`：
  // 只要上一题界面因为任何原因没关干净，后面每一次开箱都会被静默丢弃，
  // 玩家看到的就是"宝箱再也开不了、怪物也不动了"。这里改成直接覆盖重建。
  var q = (data.question && data.options)
    ? { q: data.question, o: data.options, a: data.correctAnswer }
    : window._currentQuizQuestion;
  if (!q) return;

  overlay.style.display = 'flex';
  document.getElementById('quiz-question').textContent = q.q;
  var optContainer = document.getElementById('quiz-options');
  optContainer.innerHTML = '';
  document.getElementById('quiz-reward').style.display = 'none';
  document.getElementById('quiz-close').style.display = 'none';

  q.o.forEach(function (opt, i) {
    var btn = document.createElement('button');
    btn.className = 'opt-btn';
    btn.textContent = opt;
    btn.onclick = function () {
      if (btn.classList.contains('correct') || btn.classList.contains('wrong')) return;
      var btns = optContainer.querySelectorAll('.opt-btn');
      btns.forEach(function (b, i2) {
        if (i2 === q.a) b.classList.add('correct');
        else b.classList.add('wrong');
        b.onclick = null;
      });
      // 发送答案到主机（使用 broadcast 确保送达）
      PeerManager.broadcast('quiz_answer', {
        answerIndex: i
      });
      document.getElementById('quiz-close').style.display = 'inline-block';
    };
    optContainer.appendChild(btn);
  });

  // 收尾（手点 / 兜底超时 / 收到结果后自动关 都走这里）
  var closeHostQuiz = function () {
    var ov = document.getElementById('quiz-overlay');
    if (ov) ov.style.display = 'none';
    clearQuizIdleTimer();
    window.__quizIdleAction = null;
    if (!GS.gameOver && !GS.escaping) GS.running = true;
  };
  var closeHostQuizByIdle = function () {
    var ov = document.getElementById('quiz-overlay');
    if (!ov || ov.style.display !== 'flex') return;
    closeHostQuiz();
  };

  document.getElementById('quiz-close').onclick = function () { closeHostQuiz(); };

  GS.running = false;

  // 兜底收尾：万一主机那边没有回 quiz_result（丢包 / 主机中途重开一局 /
  // 题面在主机侧缓存里对不上），这道题就会一直挂在屏幕上。
  // 答题期间 GS.running 被置 false，整局随之永久卡死 ——
  // 怪物不动、宝箱不开、人物也走不了，而且看不出是"卡在答题"。
  //
  // 注意必须是「30 秒没有任何操作」才收，而不是打开后固定几秒：
  // 玩家读题、思考都会超过 3 秒，时间一到把框关掉就成了
  // 「还没选答案页面就被关了」。任何点击 / 触摸 / 按键都会重新计时。
  window.__quizIdleAction = function () {
    var ov = document.getElementById('quiz-overlay');
    if (!ov || ov.style.display !== 'flex') { window.__quizIdleAction = null; return; }
    armQuizIdleTimer(closeHostQuizByIdle);
  };
  armQuizIdleTimer(closeHostQuizByIdle);
}

// ============================================================
// 主机：发送答题触发到特定玩家
// ============================================================
function triggerQuizForPlayer(peerId, questionData, isGold) {
  // 存储到远程问卷缓存，供主机答题结果处理器验证答案
  if (typeof SyncManager !== 'undefined') {
    if (!SyncManager._remoteQuizQuestions) SyncManager._remoteQuizQuestions = {};
    SyncManager._remoteQuizQuestions[peerId] = questionData;
    // 单独存元数据，不要往 questionData 上挂字段 ——
    // pickRandomQuestion() 返回的是题库里的对象引用，改了会污染后续所有题目。
    if (!SyncManager._remoteQuizMeta) SyncManager._remoteQuizMeta = {};
    SyncManager._remoteQuizMeta[peerId] = { isGold: !!isGold };
  }
  PeerManager.sendTo(peerId, 'quiz_trigger', {
    question: questionData.q,
    options: questionData.o,
    correctAnswer: questionData.a,
    chestId: 'remote'
  });
}

// ============================================================
// 主机：发送游戏事件
// ============================================================
function broadcastGameEvent(event, eventData) {
  PeerManager.broadcast('game_event', {
    event: event,
    data: eventData || {},
    playerId: PeerManager.playerId
  });
}