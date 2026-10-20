// ============================================================
// 状态同步模块 - 世界状态快照、远程玩家渲染、插值
// ============================================================

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
  sendSnapshot: function () {
    if (!PeerManager.isHost || !PeerManager.connected) return;
    var snapshot = this._buildSnapshot();
    PeerManager.broadcast('world_snapshot', snapshot);
  },

  // ============================================================
  // 构建完整世界状态快照（供 sendSnapshot 和 world_state_request 使用）
  // ============================================================
  _buildSnapshot: function () {
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
          hp: p.hp || 100,
          maxHp: p.maxHp || 100,
          energy: p.energy || 0,
          energyMax: p.energyMax || 5,
          fragments: p.fragments || 0,
          curWeapon: p.curWeapon || '木棍',
          isJumping: p.isJumping || false,
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
        if (m && m.userData) {
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
        if (b && b.userData && b.userData.active) {
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
    var chestStates = [];
    if (typeof window.normalChests !== 'undefined') {
      window.normalChests.forEach(function (c) {
        if (c && c.userData) {
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
    if (typeof window.energyOrb !== 'undefined' && window.energyOrb && window.energyOrb.parent) {
      energyOrbState = {
        active: true,
        x: window.energyOrb.position.x,
        z: window.energyOrb.position.z,
        cooldown: window.energyOrb.userData.cooldown || 0
      };
    }

    // 道具状态
    var itemStates = [];
    if (typeof window.items !== 'undefined') {
      window.items.forEach(function (it) {
        if (it && it.userData && it.userData.active) {
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
    var fragmentStates = [];
    if (typeof window.fragmentDrops !== 'undefined') {
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
      hp: GS.hp || 100,
      maxHp: (GS.maxHp || 100) + (GS.maxHpBonus || 0) + (GS.levelHpBonus || 0),
      energy: GS.energy || 0,
      energyMax: GS.energyMax || 5,
      fragments: GS.fragments || 0,
      curWeapon: GS.curWeapon || '木棍',
      isJumping: GS.isJumping || false,
      isCaptured: (typeof window.captureState !== 'undefined' && window.captureState) ? window.captureState.captured : false,
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
  applySnapshot: function (snapshot) {
    if (!snapshot) {
      console.warn('[Sync] applySnapshot: 快照为空');
      return;
    }



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
        // 同步主机权威状态到 GS
        if (p.hp !== undefined) {
          // 仅当主机HP高于本地时才接受（治疗同步），本地伤害通过 sendInput 发送给主机
          // 防止快照撤销加入者本地受到的怪物/弹丸伤害
          if (p.hp > GS.hp) {
            GS.hp = p.hp;
          }
        }
        if (p.energy !== undefined) {
          // 能量同步：主机能量更高时才同步（防止覆盖加入者本地答题获取的能量）
          if (p.energy > GS.energy) {
            GS.energy = p.energy;
          }
        }
        if (p.fragments !== undefined) {
          // 碎片同步：取最大值（防止覆盖加入者本地获取的碎片）
          if (p.fragments > GS.fragments) {
            GS.fragments = p.fragments;
          }
        }
        if (p.correct !== undefined) GS.correct = Math.max(GS.correct, p.correct);
        if (p.total !== undefined) GS.total = Math.max(GS.total, p.total);
        if (p.energyMax !== undefined) GS.energyMax = p.energyMax;
        if (p.level !== undefined) GS.level = p.level;
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

      // 创建或更新远程玩家
      if (!self.remotePlayers[p.id]) {
        self.createRemotePlayer(p.id, p.character, p.playerName || '玩家');
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
          isCaptured: p.isCaptured,
          skillActive: p.skillActive,
          level: p.level
        };
        rp.interpStartTime = Date.now();
        rp.interpDuration = Math.max(50, this.snapshotInterval * 1.5);

        // 更新头顶名字标签（重绘 Sprite 贴图：名字 + 等级 + 血条）
        if (rp.nameLabel && rp.labelCanvas && rp.labelCtx) {
          var hpFrac = (p.maxHp > 0) ? (p.hp / p.maxHp) : 1;
          self._drawNameLabel(rp.labelCanvas, rp.labelCtx, rp.labelTexture,
            p.playerName || rp.playerName || '玩家', hpFrac, p.level || 1);
        }
      }
    });

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

    // 为每个怪物创建或更新
    snapshot.monsters.forEach(function (ms) {
      if (!ms.active) return;

      // 查找是否已有对应怪物
      var found = null;
      for (var i = 0; i < localMonsters.length; i++) {
        if (localMonsters[i].userData && localMonsters[i].userData.netId === ms.id) {
          found = localMonsters[i];
          break;
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
          found.userData.hp = ms.hp;
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
            localMonsters.push(g);
          }
        }
      }
    });
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
          hp: 500
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
          found.userData.active = !cs.destroyed && found.userData.active !== false;
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
            active: !cs.destroyed,
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
    if (!snapshot.energyOrb) return;
    var localScene = window.scene;

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
    var group = new THREE.Group();

    // ===== 与本地玩家一致的角色模型 =====
    var isQike = character === 'qike';
    var isBoy = isQike;
    var mainColor = isBoy ? 0xff8800 : 0xcc77ff;
    var hairColor = isBoy ? 0x553322 : 0x663344;
    var browColor = isBoy ? 0x553322 : 0x885566;
    var eyeColor = isBoy ? 0x222222 : 0x442266;
    var eyeSize = isBoy ? 0.1 : 0.12;
    var pupilSize = isBoy ? 0.055 : 0.07;

    // 身体
    var bodyMat = new THREE.MeshStandardMaterial({ color: mainColor, roughness: 0.5, emissive: mainColor, emissiveIntensity: 0.05 });
    var body = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 0.65, 10), bodyMat);
    body.position.y = 0.8; body.castShadow = true; group.add(body);

    // 腰带
    var belt = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.04, 4, 12), new THREE.MeshStandardMaterial({ color: 0xffd700, roughness: 0.3 }));
    belt.position.y = 0.55; belt.rotation.x = Math.PI / 2; group.add(belt);

    // 妙妙：裙子
    if (!isBoy) {
      var skirtMat = new THREE.MeshStandardMaterial({ color: 0xaa66ff, roughness: 0.6 });
      var skirt = new THREE.Mesh(new THREE.ConeGeometry(0.6, 0.28, 10), skirtMat);
      skirt.position.y = 0.38; group.add(skirt);
      var ruffle = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.04, 6, 12), new THREE.MeshStandardMaterial({ color: 0xff88cc, roughness: 0.6 }));
      ruffle.position.y = 0.2; ruffle.rotation.x = Math.PI / 2; group.add(ruffle);
    }

    // 头部
    var headMat = new THREE.MeshStandardMaterial({ color: 0xffcc99, roughness: 0.3 });
    var head = new THREE.Mesh(new THREE.SphereGeometry(0.38, 14, 14), headMat);
    head.position.y = 1.25; head.castShadow = true; group.add(head);

    // 头发（半球）
    var hair = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 10, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.8 }));
    hair.position.y = 1.45; group.add(hair);

    // 妙妙：双辫子
    if (!isBoy) {
      var braidMat = new THREE.MeshStandardMaterial({ color: 0x885566, roughness: 0.8 });
      var bowMat = new THREE.MeshStandardMaterial({ color: 0xff88cc, roughness: 0.5 });
      var braidSegments = 5;
      [-1, 1].forEach(function (side) {
        var braidGroup = new THREE.Group();
        for (var bi = 0; bi < braidSegments; bi++) {
          var seg = new THREE.Mesh(new THREE.CylinderGeometry(0.06 - bi * 0.008, 0.065 - bi * 0.008, 0.18, 6), braidMat);
          seg.position.y = -bi * 0.18;
          braidGroup.add(seg);
        }
        braidGroup.position.set(side * 0.32, 1.35, 0.1);
        braidGroup.rotation.z = side * 0.25;
        braidGroup.rotation.x = -0.15;
        group.add(braidGroup);
        var bow = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), bowMat);
        bow.position.set(side * 0.32, 1.35 - braidSegments * 0.18, 0.1);
        group.add(bow);
      });
    }

    // 眼睛
    [[-0.13, 1.32, 0.33], [0.13, 1.32, 0.33]].forEach(function (p) {
      var eyeW = new THREE.Mesh(new THREE.SphereGeometry(eyeSize, 8, 8), new THREE.MeshStandardMaterial({ color: 0xffffff }));
      eyeW.position.set(p[0], p[1], p[2]); group.add(eyeW);
      var eyeB = new THREE.Mesh(new THREE.SphereGeometry(pupilSize, 8, 8), new THREE.MeshStandardMaterial({ color: eyeColor }));
      eyeB.position.set(p[0], p[1], p[2] + 0.04); group.add(eyeB);
      var eyeH = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 6), new THREE.MeshStandardMaterial({ color: 0xffffff }));
      eyeH.position.set(p[0] + 0.03, p[1] + 0.03, p[2] + 0.08); group.add(eyeH);
      // 妙妙：睫毛
      if (!isBoy) {
        var lashMat = new THREE.MeshStandardMaterial({ color: 0x442266, roughness: 0.8 });
        for (var li = 0; li < 4; li++) {
          var lash = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.002, 0.002), lashMat);
          lash.position.set(p[0] + (li - 1.5) * 0.025, p[1] - 0.07, p[2] + 0.05);
          lash.rotation.z = (li - 1.5) * 0.1;
          group.add(lash);
        }
        for (var li2 = 0; li2 < 4; li2++) {
          var lash2 = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.002, 0.002), lashMat);
          lash2.position.set(p[0] + (li2 - 1.5) * 0.025, p[1] + 0.09, p[2] + 0.05);
          lash2.rotation.z = (li2 - 1.5) * -0.1;
          group.add(lash2);
        }
      }
    });

    // 眉毛
    var browMat = new THREE.MeshStandardMaterial({ color: browColor, roughness: 0.8 });
    var browW = isBoy ? 0.16 : 0.14;
    var browH = isBoy ? 0.025 : 0.018;
    [-0.18, 0.18].forEach(function (bx) {
      var brow = new THREE.Mesh(new THREE.BoxGeometry(browW, browH, 0.02), browMat);
      brow.position.set(bx, 1.4, 0.36); group.add(brow);
    });

    // 嘴巴
    var mouth = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.015, 6, 12), new THREE.MeshStandardMaterial({ color: 0xff6666 }));
    mouth.position.set(0, 1.18, 0.36); mouth.rotation.x = Math.PI / 2; group.add(mouth);

    group.position.set(0, 0, 0);

    // 添加到场景
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
    var auraColor = isQike ? 0x44ff88 : 0xcc66ff;
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
      var interpDuration = rp.interpDuration || Math.max(50, this.snapshotInterval * 1.5);
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

        // 呼吸动画
        rp.mesh.position.y = Math.sin(now * 0.003) * 0.02;
      }

      // 名字标签朝向相机
      if (rp.nameLabel && localCamera) {
        // Sprite 自动面向相机，不需要额外操作
      }
    }
  },

  // ============================================================
  // 加入者：怪物位置插值更新（不运行 AI，仅做平滑插值，带外推）
  // ============================================================
  updateSyncedMonsters: function (delta) {
    if (GS.mode !== 'multiplayer' || GS.isHost) return;
    var now = Date.now();
    // 插值窗口：使用快照间隔的 1.5 倍，自适应网络延迟
    var interpWin = this.snapshotInterval * 1.5 / 1000;
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
  // 加入者：发送输入到主机
  // ============================================================
  sendInput: function () {
    if (GS.mode !== 'multiplayer' || GS.isHost) return;
    if (!PeerManager.connected) return;

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
      hp: GS.hp || 100,
      energyMax: GS.energyMax || 5,
      maxHp: GS.maxHp || 100,
      correct: GS.correct || 0,
      total: GS.total || 0,
      curWeapon: GS.curWeapon || '木棍',
      isCaptured: (typeof window.captureState !== 'undefined' && window.captureState) ? window.captureState.captured : false
    };

    // 收集按键状态
    if (typeof window.keys !== 'undefined') {
      if (window.keys['w'] || window.keys['arrowup']) input.moveZ = -1;
      if (window.keys['s'] || window.keys['arrowdown']) input.moveZ = 1;
      if (window.keys['a'] || window.keys['arrowleft']) input.moveX = -1;
      if (window.keys['d'] || window.keys['arrowright']) input.moveX = 1;
    }

    // 发送输入到主机（每帧发送以确保位置同步）
    PeerManager.broadcast('player_input', input);
  },

  // ============================================================
  // 初始化联机模式
  // ============================================================
  initMultiplayerMode: function () {
    var self = this;
    console.log('[Sync] initMultiplayerMode: GS.mode=' + GS.mode + ' GS.isHost=' + GS.isHost + ' PeerManager.isHost=' + PeerManager.isHost);

    if (GS.isHost) {
      // 主机模式：注册消息处理器
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
          p.hp = data.hp || 100;
          p.maxHp = data.maxHp || 100;
          p.energyMax = data.energyMax || 5;
          p.correct = data.correct || 0;
          p.total = data.total || 0;
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
        } else {
          console.warn('[Sync] 收到加入者答题，但找不到对应题目，fromPeerId:', fromPeerId);
        }
      });

      // 加入者请求完整世界状态
      PeerManager.on('world_state_request', function (data, fromPeerId) {
        // 立即发送一次完整快照给请求者
        var snapshot = self._buildSnapshot();
        PeerManager.sendTo(fromPeerId, 'world_snapshot', snapshot);
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
        if (!target || !target.userData || !target.userData.active) return;
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
            if (typeof spawnChaser === 'function' && typeof CHASER_RESPAWN_DELAY !== 'undefined') {
              setTimeout(function () { if (GS.running && !GS.gameOver) spawnChaser(); }, CHASER_RESPAWN_DELAY * 1000);
            }
          } else if (typeof onMonsterDefeated === 'function') {
            onMonsterDefeated(target);
          }
        }
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
        if (data && data.correct !== undefined) {
          // 更新本地状态
          if (data.correct) {
            GS.correct++;
            GS.stars += 10;
            if (typeof gainEnergy === 'function') gainEnergy(3);
          }
          // 更新答题界面显示
          var overlay = document.getElementById('quiz-overlay');
          var rewardEl = document.getElementById('quiz-reward');
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
          var closeBtn = document.getElementById('quiz-close');
          if (closeBtn) closeBtn.style.display = 'inline-block';
        }
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

      // 接收道具拾取通知：主机端道具被拾取，加入者同步移除
      PeerManager.on('item_pickup_sync', function (data) {
        if (!data) return;
        // 移除对应房间中的对应类型道具
        if (typeof window.items !== 'undefined' && data.itemType) {
          for (var ii = 0; ii < window.items.length; ii++) {
            var it = window.items[ii];
            if (it.userData && it.userData.itemType && it.userData.itemType.id === data.itemType && it.userData.active) {
              it.userData.active = false;
              if (it.parent) {
                try { window.scene.remove(it); } catch (e) { }
              }
              window.items.splice(ii, 1);
              break;
            }
          }
        }
      });

      // 接收宝箱刷新通知
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
          case 'player_rescued':
            if (typeof breakFreeFromCapture === 'function' && data.playerId === PeerManager.playerId) {
              breakFreeFromCapture();
            }
            break;
          case 'escape':
            if (typeof startEscape === 'function') {
              startEscape();
            }
            break;
          case 'item_pickup':
            // 显示拾取提示
            if (typeof showMessage === 'function' && data.message) {
              showMessage(data.message, 0xffd700);
            }
            break;
        }
      });

      PeerManager.on('game_over', function (data) {
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

      PeerManager.on('chat_broadcast', function (data) {
        if (data) {
          MultiplayerUI.addChatMessage(data.playerName || '未知', data.text || '');
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
  if (overlay.style.display === 'flex') return;

  var q = window._currentQuizQuestion;
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

  document.getElementById('quiz-close').onclick = function () {
    overlay.style.display = 'none';
    GS.running = true;
  };

  GS.running = false;
}

// ============================================================
// 主机：发送答题触发到特定玩家
// ============================================================
function triggerQuizForPlayer(peerId, questionData) {
  // 存储到远程问卷缓存，供主机答题结果处理器验证答案
  if (typeof SyncManager !== 'undefined') {
    if (!SyncManager._remoteQuizQuestions) SyncManager._remoteQuizQuestions = {};
    SyncManager._remoteQuizQuestions[peerId] = questionData;
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