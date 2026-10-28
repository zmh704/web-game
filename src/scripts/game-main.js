// ============================================================
// 更新循环
// ============================================================
var _gameOverBroadcasted = false; // 防止重复广播

// 加入者本地怪物攻击检测（在 sendInput 前执行，确保发送最新 HP）
function joinerLocalMonsterAttack(delta) {
  if (typeof monsters === 'undefined' || !player) return;
  // 倒地待救 / 复活无敌期间不再结算怪物伤害。
  // 原来倒地后还会继续挨打，而扣血用的是 `(GS.hp || 100)` ——
  // hp=0 会被当成 100，倒在地上反而"满血复活"，血条来回跳。
  if (GS.downed) return;
  if (GS._invulnTimer > 0) return;
  // 检测小怪
  for (var li = 0; li < monsters.length; li++) {
    var lm = monsters[li];
    if (!lm || !lm.userData || !lm.userData.active) continue;
    // 只结算"房主世界里真实存在"的怪物（快照创建的怪都带 netId）。
    // 没有 netId 的只可能是本地某条代码路径漏创建的幽灵怪——
    // 房主那边根本看不到它，让它咬人就是"我被打了但队友什么都看不见"。
    if (!lm.userData.netId) continue;
    if (lm.userData.boundTimer > 0 || lm.userData.staggerTimer > 0) continue;
    if (lm.userData.attackCooldown === undefined) lm.userData.attackCooldown = 0;
    lm.userData.attackCooldown -= delta;
    if (lm.userData.attackCooldown > 0) continue;
    var lDist = player.position.distanceTo(lm.position);
    // 判定半径与主机端统一（见 monsterAttackReach）：不再用 3.5×体型 这种
    // 远超画面距离的值，否则加入者会"隔空挨打"、队友那边看不到任何挥爪。
    var lRange = (typeof monsterAttackReach === 'function')
      ? monsterAttackReach(lm)
      : 3.5 * ((lm.userData.type && lm.userData.type.scale) || 1);
    if (lDist < lRange) {
      // 命中后直接复用 monsterAttack() 的完整流程：
      // 攻击特效、受击动画、音效、伤害提示、击退、无敌/护盾判定、死亡判定全在里面。
      // 原来这里只做 `GS.hp -= dmg`，加入者被怪物打时没有任何反馈 ——
      // 没有爪击光带、没有"被击中"提示、没有击退，看起来像"怪物在空气里挥爪"。
      if (typeof monsterAttack === 'function') {
        monsterAttack(lm);
      } else {
        lm.userData.attackCooldown = 1.5;
        var lDmg = (typeof monsterHitDamage === 'function') ? monsterHitDamage(lm) : 10;
        GS.hp = Math.max(0, currentPlayerHp() - lDmg);
        hitFlash = 0.3; updateHUD();
        if (GS.hp <= 0) handlePlayerDeath('hp');
      }
      return;
    }
  }
  // 检测Boss
  if (typeof bosses !== 'undefined') {
    for (var bi = 0; bi < bosses.length; bi++) {
      var lb = bosses[bi];
      if (!lb || !lb.userData || !lb.userData.active) continue;
      if (!lb.userData.netId) continue;   // 同小怪：无 netId 的本地幽灵怪不结算
      if (lb.userData.boundTimer > 0 || lb.userData.staggerTimer > 0) continue;
      if (lb.userData.attackCooldown === undefined) lb.userData.attackCooldown = 0;
      lb.userData.attackCooldown -= delta;
      if (lb.userData.attackCooldown > 0) continue;
      var _lbReach = (typeof monsterAttackReach === 'function')
        ? monsterAttackReach(lb)
        : 3.5 * ((lb.userData.type && lb.userData.type.scale) || 1);
      if (player.position.distanceTo(lb.position) < _lbReach) {
        if (typeof monsterAttack === 'function') {
          monsterAttack(lb);
        } else {
          lb.userData.attackCooldown = 1.5;
          var bDmg = (typeof monsterHitDamage === 'function') ? monsterHitDamage(lb) : 10;
          GS.hp = Math.max(0, currentPlayerHp() - bDmg);
          hitFlash = 0.3; updateHUD();
          if (GS.hp <= 0) handlePlayerDeath('hp');
        }
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
      GS.hp = Math.max(0, currentPlayerHp() - 15);
      hitFlash = 0.3; updateHUD();
      if (typeof AudioMgr !== 'undefined' && AudioMgr.playHurt) AudioMgr.playHurt();
      if (typeof showMessage === 'function') showMessage('💥 被追捕者击中! -15❤️', 0xff4444);
      if (GS.hp <= 0) handlePlayerDeath('hp');
    }
  }
}

// ============================================================
// 宝箱开启：靠近 + 停留一段时间才开箱
//
// 旧逻辑是「进入半径立刻弹答题」，问题有两个：
//   1. 玩家跑过墙角（5 个普通宝箱都刷在墙角）时会被强制弹题，
//      而弹题会把 GS.running 设为 false 直接冻住游戏，节奏被打断得很生硬；
//   2. 玩家没有任何"我正在开箱"的预期。
// 现在改成停留读条：进圈开始积攒进度，出圈回退，攒满才开箱。
// 跑过去根本来不及攒满，停下来才开——不需要额外按键，触屏也通用。
// ============================================================
var CHEST_HOLD_TIME = { gold: 0.85, normal: 1.0 };  // 读条时长（秒）
var CHEST_HOLD_RANGE = { gold: 2.4, normal: 2.0 };  // 触发半径（米）

// 加入者上报开箱后，本地先冷却这么久再重试。
// 不设冷却的话，主机迟迟不回执时本地会每帧重发一条 chest_interact（60Hz），
// 进度条刚满就归零、立刻又满 —— 玩家看到的就是"一直在重复开启宝箱"。
var CHEST_INTERACT_COOLDOWN = 1.2;

var _chestUI = null, _chestUIMissing = false;
function chestProgressUI() {
  if (_chestUI) return _chestUI;
  if (_chestUIMissing) return null;   // 查不到就记住，避免每帧 querySelector
  var root = document.getElementById('chest-progress');
  if (!root) { _chestUIMissing = true; return null; }
  _chestUI = {
    root: root,
    icon: root.querySelector('.cp-icon'),
    label: root.querySelector('.cp-label'),
    fill: root.querySelector('.cp-fill')
  };
  return _chestUI;
}

function hideChestProgress() {
  var ui = chestProgressUI();
  if (ui && !ui.root.classList.contains('hidden')) ui.root.classList.add('hidden');
}

// 推进某个宝箱的开箱进度，返回是否已攒满
function tickChestHold(chest, delta, isGolden) {
  var key = isGolden ? 'gold' : 'normal';
  var need = CHEST_HOLD_TIME[key];
  var range = CHEST_HOLD_RANGE[key];

  // 只用水平距离。
  // 宝箱本身在做上下浮动（position.y 在 0.75~0.95 之间），玩家 y≈0，
  // 用 position.distanceTo() 会把这段高度算进去：站在 1.9 米处，
  // 实测距离已经是 2.08 米 —— 超过 2.0 的判定半径，进度条就永远不动。
  // 联机时加入者只能靠这段本地读条上报（主机侧阈值更小），
  // 所以这里必须按"地面距离"算，才和玩家看到的贴身程度一致。
  var _hdx = player.position.x - chest.position.x;
  var _hdz = player.position.z - chest.position.z;
  var dist = Math.sqrt(_hdx * _hdx + _hdz * _hdz);
  var prog = chest.userData.openProgress || 0;

  if (dist < range) {
    prog += delta / need;
  } else {
    // 离开后回退得比积攒快一些，避免"蹭一下就跑"也能开
    prog -= delta / (need * 0.55);
  }
  prog = Math.max(0, Math.min(1, prog));
  chest.userData.openProgress = prog;

  if (dist < range && prog > 0.02) {
    var ui = chestProgressUI();
    if (ui) {
      ui.root.classList.remove('hidden', 'cooling');
      if (isGolden) ui.root.classList.add('golden');
      else ui.root.classList.remove('golden');
      ui.icon.textContent = isGolden ? '🎁' : '📦';
      ui.label.textContent = isGolden ? '正在开启金色宝箱…' : '正在开启宝箱…';
      ui.fill.style.width = (prog * 100).toFixed(0) + '%';
    }
  }

  return prog >= 1;
}

// 第三人称「飞船挡住镜头」检测用的射线，复用同一个实例，避免每帧 new
var _shipBlockRay = null;

// ============================================================
// 视角模式（第一人称 / 第三人称）
// ------------------------------------------------------------
// 唯一判定入口：相机、模型显隐、按钮文案都从这里取，避免各处判断不一致
// 出现"人物藏起来了但镜头还在背后"这种错位。
// ============================================================
function isFirstPersonView() {
  if (GS.cameraMode !== 'first') return false;
  if (typeof player === 'undefined' || !player || !player.parent) return false;
  if (GS.downed) return false;                  // 倒地待救：必须看得见队友和救援进度
  if (GS.escaped || GS.escaping) return false;  // 撤离动画 / 观战等待：交给第三人称镜头
  return true;
}

// 切换视角。HUD「视角」按钮和键盘 V 都走这里。
function toggleCameraMode() {
  GS.cameraMode = (GS.cameraMode === 'first') ? 'third' : 'first';
  // 记住偏好：下次进游戏沿用同一视角，不用每局重点
  try { localStorage.setItem('mf_cameraMode', GS.cameraMode); } catch (e) { }

  // 立刻把模型显隐摆正，别等下一帧 —— 第一人称第一帧会看到自己的后脑勺
  if (typeof player !== 'undefined' && player) player.visible = !isFirstPersonView();
  updateViewButton();

  if (typeof showMessage === 'function') {
    showMessage(GS.cameraMode === 'first' ? '👁 第一人称视角' : '🎥 第三人称视角', 0x66ffcc);
  }
  return GS.cameraMode;
}

// 按钮状态：图标与描边跟着当前视角走，一眼能看出现在是哪个
function updateViewButton() {
  var btn = document.getElementById('hud-view-btn');
  if (!btn) return;
  var fp = (GS.cameraMode === 'first');
  btn.classList.toggle('is-first', fp);
  var iconEl = btn.querySelector('.icon');
  if (iconEl) iconEl.textContent = fp ? '👁' : '🎥';
  btn.title = fp ? '当前：第一人称（点击切回第三人称）' : '当前：第三人称（点击切到第一人称）';
}

// 从本地偏好恢复视角（进游戏时调用；localStorage 不可用时静默回退默认值）
function loadCameraMode() {
  try {
    var m = localStorage.getItem('mf_cameraMode');
    if (m === 'first' || m === 'third') GS.cameraMode = m;
  } catch (e) { }
  updateViewButton();
}

window.isFirstPersonView = isFirstPersonView;
window.toggleCameraMode = toggleCameraMode;
window.updateViewButton = updateViewButton;
window.loadCameraMode = loadCameraMode;

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

  // 安全网：整局被"暂停"卡住时自动恢复。
  //
  // GS.running 只有三处会置 false：答题、逃生动画、结算。逃生/结算各有自己的
  // 状态位（escaping / gameOver），所以「running=false 且这两个都不成立、
  // 答题框也不可见」只可能是异常残留 —— 一旦发生，人物不动、怪物不打人、
  // 宝箱也开不了，表现就是"联机里什么都点不动"。这里兜住它。
  if (!GS.running && !GS.gameOver && !GS.escaping && !(GS.countdown > 0)) {
    var _qo = document.getElementById('quiz-overlay');
    if (!_qo || _qo.style.display !== 'flex') {
      GS.running = true;
      console.warn('[update] GS.running 异常为 false，已自动恢复');
    }
  }

  // 联机主机：即使本机被答题 / 结算暂停，也必须继续发世界快照。
  //
  // 原来发送逻辑在全函数下面那个 `if (!GS.running || GS.gameOver) return;` 之后，
  // 主机一开答题（GS.running 被置 false）整条快照流就断了：
  // 加入者那边怪物瞬间定格、宝箱没反应、队友停在原地 —— 看起来就是
  // "联机版整个世界卡死了"。快照只是把当前状态原样发出去，
  // 暂停期间继续发没有任何副作用，反而能让队友看到"房主正在答题"的静止画面
  // 而不是以为掉线了。
  if (GS.mode === 'multiplayer' && GS.isHost && (!GS.running || GS.gameOver)) {
    try {
      // 主机自己在答题时，只把「怪物」这一层继续跑完。
      //
      // 房主答题会把 GS.running 置 false（单机时整局暂停是合理的），
      // 但联机时这一暂停会把队友的怪区也冻住：怪物定格、不再追人。
      // monsterAttack 开头本来就有 `!GS.running` 判断，所以这里跑 AI
      // 不会让答题中的房主掉血，只是让怪物继续走动、继续扑向队友。
      if (!GS.gameOver && typeof updateMonster === 'function') {
        updateMonster(delta);
        if (typeof applyEntityCollisions === 'function') applyEntityCollisions();
      }

      SyncManager.snapshotTimer += delta * 1000;
      if (SyncManager.snapshotTimer >= SyncManager.snapshotInterval) {
        SyncManager.snapshotTimer = 0;
        SyncManager.sendSnapshot();
      }
    } catch (e) {
      if (window.__syncErrCount === undefined) window.__syncErrCount = 0;
      window.__syncErrCount++;
      if (window.__syncErrCount <= 3) {
        console.error('[Multiplayer] 暂停期间发送快照出错:', e && e.message);
      }
    }
  }

  // ===== 医院地图：门 / 灯光 / 旋翼 =====
  // 放在暂停判断之前：答题、结算、撤离期间灯该闪还是闪、门该动还是动，
  // 否则一切到答题界面背景里的日光灯就"冻住"，很出戏。
  if (typeof updateHospitalDoors === 'function') updateHospitalDoors(delta);
  if (typeof updateHospitalEffects === 'function') updateHospitalEffects(delta);

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
      // 这里原来只有一句 console.warn，任何同步异常都会被完全静默吞掉，
      // 表现出来就是"某个功能莫名其妙没反应"而且毫无线索。
      // 改成 console.error + 打印堆栈，并限制重复输出。
      window.__syncErrCount = (window.__syncErrCount || 0) + 1;
      if (window.__syncErrCount <= 3) {
        console.error('[Multiplayer] 同步出错，跳过本帧:', e && e.message, '\n', e && e.stack);
      } else if (window.__syncErrCount === 4) {
        console.error('[Multiplayer] 同步持续出错，后续不再重复打印堆栈');
      }
    }
  }

  // （已移除中央房间额外刷怪：全场只保持1只Boss+1只小怪）

  if (attackCooldown > 0) attackCooldown -= delta;
  if (hitFlash > 0) hitFlash -= delta;
  if (monsterHitFlash > 0) monsterHitFlash -= delta;

  updateJump(delta);
  updateSkillTimers(delta);

  // 被抓住时完全不能移动（moveDir 保持零向量，视角仍可转动）。
  // 倒地待救则可以**爬行**：速度压到 25%，能挪到掩体后或爬向队友，
  // 否则倒在地上只能干等，体验太被动。
  var moveDir = new THREE.Vector3();
  if ((captureState && captureState.captured) || GS.escaped) {
    // 被抓住 / 已经撤离（主机观战等待队友）时移动键无效
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
        // moveSpeed 会被技能临时改写（疾风冲刺），加成上限已由 speedCap 拦住
        // 挣脱后短暂加速逃跑
        if (captureState && captureState.escapeBoostTimer > 0) spd *= 1.5;
        // 倒地爬行：只保留四分之一速度，且不吃任何加速加成（爬不快）
        if (GS.downed) spd = (typeof BALANCE !== 'undefined' && BALANCE.player && BALANCE.player.baseSpeed
          ? BALANCE.player.baseSpeed : 5) * 0.25;
        moveVec.normalize().multiplyScalar(spd * delta);
        player.position.add(moveVec);
        clampPlayer();
        player.rotation.y = Math.atan2(moveVec.x, moveVec.z);
      }
    }
  }

  // 贴地：楼梯是连续斜坡、屋顶比一层高 3.7 米，
  // 走路时脚底必须一直贴着当前地面，否则上楼梯会"陷进台阶里"。
  // 跳跃 / 飞行期间不接管（那时候 y 由物理决定）。
  if (player && !GS.isJumping && GS.canJump && !GS._flying && typeof floorYAt === 'function') {
    var _fy = floorYAt(player.position.x, player.position.z, player.position.y);
    if (Math.abs(player.position.y - _fy) > 0.001) player.position.y = _fy;
  }

  // 帧率无关的指数平滑：桌面端更跟手，触屏稍缓
  var smoothK = 1 - Math.exp(-(IS_TOUCH ? 18 : 14) * delta);
  mouse.x += (targetMouse.x - mouse.x) * smoothK;
  mouse.y += (targetMouse.y - mouse.y) * smoothK;

  // ============================================================
  // 视角：第三人称（默认）/ 第一人称 —— HUD「视角」按钮 / 键盘 V 切换
  // ------------------------------------------------------------
  // 两种视角共用同一个 yaw（mouse.x），所以切换瞬间朝向是连续的：
  // 第三人称是"相机在身后看向玩家"，视线方向 = -rotOffset，
  // 而第一人称的前方正是 -rotOffset，切过去相当于镜头从背后推进眼睛里，
  // 不会出现"一换视角就对着墙"。
  // ============================================================
  var firstPerson = isFirstPersonView();

  // 第一人称必须藏起自己的模型：相机就装在头部，不藏的话满屏都是脸和头发。
  // 只在可见性与目标值不一致时才赋值，避免覆盖别处（撤离移除等）对 visible 的处理。
  if (player && player.visible === firstPerson) player.visible = !firstPerson;

  if (firstPerson) {
    // 视线水平方向（与第三人称 lookAt 的 -rotOffset 完全等价）
    var fx = -Math.sin(mouse.x), fz = -Math.cos(mouse.x);
    // 眼高按体型缩放（爸爸 1.07 倍）；走路时加极小幅度上下浮动，静止时完全没有
    var eyeY = 1.58 * (player.scale.y || 1);
    var bob = 0;
    if (typeof playerAnimState !== 'undefined' && playerAnimState.moving) {
      bob = Math.sin((playerAnimState.walkPhase || 0) * 2) * 0.035;
    }
    var eyePos = new THREE.Vector3(
      player.position.x + fx * 0.22,
      player.position.y + eyeY + bob,
      player.position.z + fz * 0.22
    );

    // 第一人称要紧贴头部，不能有跟随延迟（否则"人都跑出去了，画面还在后头"）。
    // 但仍用指数平滑：从第三人称切过来那一瞬是快速推进，不是硬切。
    var fpK = 1 - Math.exp(-26 * delta);
    camera.position.lerp(eyePos, fpK);

    // 命中震屏：偏移在 lookAt 之前叠加，视觉上是画面抖动而不是视线漂移
    if (window.VX && VX.vfx) {
      VX.vfx.tick(delta);
      camera.position.add(VX.vfx.offset);
    }
    // 以 eyePos（而非加了震屏偏移的相机位置）为基准求朝向，
    // 这样震屏只抖位置、不抖视线，不然第一人称会晕
    camera.lookAt(eyePos.x + fx * 10, eyePos.y - 0.12, eyePos.z + fz * 10);

    // 人物朝向跟随视线：联机快照里队友看到的就是你正看着的方向，
    // 否则第一人称下人物会一直朝"上次移动方向"，队友那边看起来像在滑步。
    // 技能腾空旋转期间不覆盖（那时 player.rotation.y 由技能动画驱动）。
    if (typeof playerAnimState === 'undefined' || !(playerAnimState.skillTimer > 0)) {
      player.rotation.y = Math.atan2(fx, fz);
    }
  } else {
    var camOffset = (window.CAM_OFFSET || new THREE.Vector3(0, 3.45, 6.2)).clone();
    // 倒地观战：把镜头抬高拉远一点，能看见队友在干什么（否则贴地视角什么都看不到）
    if (GS.downed) {
      camOffset.y += 3.4;
      camOffset.z += 3.2;
    }
    // 医院是室内，层高只有 3.3 米：默认机位（脚上 3.45 米）会直接插进楼板里。
    // 在楼里压低拉近一档；上了屋顶（露天）再恢复默认的远景。
    if (typeof HMAP !== 'undefined' && HMAP && HMAP.active && player.position.y < HMAP.WH - 0.35) {
      camOffset.set(0, 2.05, 4.5);
      if (GS.downed) { camOffset.y = 2.2; camOffset.z = 5.4; }
    }
    var euler = new THREE.Euler(0, 0, 0, 'YXZ');
    var quat = new THREE.Quaternion().setFromEuler(euler);
    var rotOffset = camOffset.clone().applyQuaternion(quat);
    var yQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), mouse.x);
    rotOffset.applyQuaternion(yQuat);

    var targetPos = player.position.clone().add(rotOffset);

    // 飞船防穿：相机被船壳挡住时把镜头拉到船前面。
    // 飞船就在出生点正前方 6 米、又是撤离必经点，第三人称相机（玩家身后 6.2 米、
    // 高 3.45 米）很容易正好插进船体里 —— 屏幕上只剩一块深色船壳，什么都看不见。
    // 只对飞船这一个大遮挡体做检测（几十个 mesh，开销可忽略），不做全场景射线，
    // 否则 1300+ 个 mesh 每帧扫一遍，手机端扛不住。
    if (!GS.escaping && !GS.escaped && typeof ship !== 'undefined' && ship && ship.parent) {
      var camFocus = new THREE.Vector3(player.position.x, player.position.y + 1.2, player.position.z);
      var camVec = new THREE.Vector3().subVectors(targetPos, camFocus);
      var camWant = camVec.length();
      if (camWant > 0.6) {
        camVec.normalize();
        if (!_shipBlockRay) _shipBlockRay = new THREE.Raycaster();
        _shipBlockRay.set(camFocus, camVec);
        _shipBlockRay.far = camWant;
        var shipHits = _shipBlockRay.intersectObject(ship, true);
        if (shipHits.length) {
          // 停在遮挡点前面一点，最小 1.3 米 —— 再近就贴到自己脑袋上了
          var camSafe = Math.max(1.3, shipHits[0].distance - 0.35);
          targetPos.copy(camFocus).addScaledVector(camVec, camSafe);
        }
      }
    }

    // 医院：室内窄、层高低，机位很容易穿墙到隔壁房间。
    // 从头部朝机位打一根线段，撞墙就把机位拉到墙内侧。
    if (typeof HMAP !== 'undefined' && HMAP && HMAP.active && typeof hospitalCameraLimit === 'function') {
      var camHead = new THREE.Vector3(player.position.x, player.position.y + 1.15, player.position.z);
      var lim = hospitalCameraLimit(camHead, targetPos);
      if (lim < 0.999) {
        targetPos.lerpVectors(camHead, targetPos, lim);
        targetPos.y += 0.12;   // 贴墙时略微抬高，避免看到地面
      }
      // 还在楼里（含楼梯上）时，机位不能高过吊顶 ——
      // 楼板是一块 0.4 米厚的实体，机位钻进去以后会看到"墙糊满屏幕"。
      if (player.position.y < HMAP.ROOF - 0.4) {
        targetPos.y = Math.min(targetPos.y, HMAP.WH - 0.18);
      }
    }

    // 相机跟随也做帧率无关平滑（被拖拽时加快跟随，避免玩家被拖出画面）
    var camK = 1 - Math.exp(-((captureState && captureState.captured) ? 10 : 6) * delta);
    camera.position.lerp(targetPos, camK);
    // 命中震屏：偏移在 lookAt 之前叠加，视觉上是画面抖动而不是视线漂移
    if (window.VX && VX.vfx) {
      VX.vfx.tick(delta);
      camera.position.add(VX.vfx.offset);
    }
    camera.lookAt(player.position.x, player.position.y + 1.05, player.position.z);
  }

  // 联机加入者模式：跳过怪物AI和道具拾取，使用插值
  if (GS.mode === 'multiplayer' && !GS.isHost) {
    if (typeof SyncManager.updateSyncedMonsters === 'function') {
      SyncManager.updateSyncedMonsters(delta);
    }
  } else {
    updateMonster(delta);
  }
  updateItems(delta);

  // 伪装者：主机 / 加入者 / 单机都各跑自己那一只（本地幻觉，见 ImpostorSystem.js）
  if (typeof updateImpostors === 'function') updateImpostors(delta);

  // 更新角色动画
  updatePlayerAnimation(delta, clock.elapsedTime);
  updatePlayerAura(clock.elapsedTime);

  // 更新手电筒
  updateFlashlight(delta);

  // 夜晚可见度：队友名字标签按距离显隐（模型本身靠雾自然淡出，不用管）
  if (typeof updateNightVisibility === 'function') updateNightVisibility();

  // 联机倒地/救援：累计救援进度、判定全员倒地
  if (typeof updateReviveSystem === 'function') updateReviveSystem(delta);
  if (typeof checkAllDown === 'function') checkAllDown();

  // 更新怪物血条（实时显示）
  updateMonsterHPBar();

  // 更新抓捕者系统
  updateCaptureSystem(delta);

  // 一帧内所有位移来源处理完之后，统一收口做墙体碰撞
  applyEntityCollisions();

  // 医院：怪物贴到关着的门会自己推开（只跑在主机/单机）
  if (typeof hospitalMonstersPushDoors === 'function') hospitalMonstersPushDoors();

  // 金色宝箱和普通宝箱更新（加入者只更新动画，不触发答题）
  hideChestProgress();   // 每帧先隐藏，范围内有宝箱时下面会重新显示

  if (energyOrb && energyOrb.userData.active) {
    // 金色宝箱：轻微浮动 + 光晕脉动
    energyOrb.position.y = groundY + Math.sin(clock.elapsedTime * 2 + energyOrb.userData.floatPhase) * 0.06;
    if (energyOrb.userData.glow) {
      // 答错冷却期间光晕压暗，给玩家"现在开不了"的视觉反馈
      var _cdFactor = energyOrb.userData.cooldown > 0 ? 0.2 : 1;
      energyOrb.userData.glow.material.opacity = (0.08 + Math.sin(clock.elapsedTime * 3) * 0.05) * _cdFactor;
    }
    // 冷却提示：主机和加入者都显示
    if (energyOrb.userData.cooldown > 0) {
      energyOrb.userData.cooldown -= delta;
      energyOrb.userData.openProgress = 0;
      // 靠近时提示还要等多久，否则玩家只会觉得"这个宝箱点了没反应"
      if (player.position.distanceTo(energyOrb.position) < CHEST_HOLD_RANGE.gold) {
        var _cui = chestProgressUI();
        if (_cui) {
          _cui.root.classList.remove('hidden');
          _cui.root.classList.add('golden', 'cooling');
          _cui.icon.textContent = '⏳';
          _cui.label.textContent = '宝箱冷却中 ' + Math.max(1, Math.ceil(energyOrb.userData.cooldown)) + ' 秒';
          _cui.fill.style.width = '100%';
        }
      }
    } else if (!GS.escaped && tickChestHold(energyOrb, delta, true)) {
      energyOrb.userData.openProgress = 0;
      if (GS.mode === 'multiplayer' && !GS.isHost) {
        // 加入者：本地读条攒满后上报，由主机触发远程答题。
        //
        // 原来加入者完全不跑这段，开箱全靠主机拿「上报位置」做距离判定
        // （阈值只有 2 米）。位置上报有延迟、还会被快照纠正，
        // 加入者明明站在宝箱上，主机却认为距离不够 —— 这就是"加入者开不了宝箱"。
        // 改成本地读条后，判定用的是加入者自己的精确坐标，且有进度条反馈。
        energyOrb.userData.cooldown = CHEST_INTERACT_COOLDOWN;
        PeerManager.broadcast('chest_interact', { netId: 'gold', isGold: true });
      } else {
        showQuiz();
      }
    }
  }
  // 普通宝箱更新：动画两端都跑，读条两端都跑，但"开箱动作"按角色分流
  for (var ni = 0; ni < normalChests.length; ni++) {
    var nc = normalChests[ni];
    if (!nc.userData.active) continue;
    nc.position.y = 0.85 + Math.sin(clock.elapsedTime * 2 + nc.userData.floatPhase) * 0.1;
    nc.rotation.y += delta * nc.userData.rotSpeed;

    if (nc.userData.cooldown > 0) {
      nc.userData.cooldown -= delta;
      nc.userData.openProgress = 0;
      continue;
    }
    if (!GS.escaped && tickChestHold(nc, delta, false)) {
      nc.userData.openProgress = 0;
      if (GS.mode === 'multiplayer' && !GS.isHost) {
        // 加入者：本地读条攒满后上报，由主机裁决并触发远程答题。
        // 与金色宝箱同理 —— 不依赖主机的位置检测，判定用本地精确坐标。
        // 上报后本地先冷却一小段：主机回执（答题 / chest_reject）需要时间，
        // 不冷却的话这段时间里进度条会一直"满 → 归零 → 又满"地空转。
        nc.userData.cooldown = CHEST_INTERACT_COOLDOWN;
        PeerManager.broadcast('chest_interact', {
          netId: nc.userData.netId || null,
          isGold: false
        });
      } else {
        // 这里不能先置 active=false：showQuiz 开头会用 !active 判断"已答过"直接 return，
        // 原来先置 false 会导致普通宝箱永远弹不出题。防重复交给 showQuiz 内部处理。
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
    // 撤离判定：**只认"自己站在飞船边上"**。
    //
    // 旧逻辑是谁先摸到飞船就 game_event('escape') 广播出去，其他人收到就直接
    // 播起飞动画 —— 结果 3 人房里一个人跑到飞船，另外两个不管在地图哪儿都一起通关。
    // 现在只让当前这个人起飞（startEscape 动的是自己），并广播 player_escaped
    // 让队友和主机知道"这个人已经走了"，其余人要继续自己走过来。
    if ((GS.energy || 0) >= (GS.energyMax || 5) && !GS.escaping && !GS.escaped && !GS.gameOver &&
        player.position.distanceTo(ship.position) < 3) {
      if (GS.mode === 'multiplayer' && typeof PeerManager !== 'undefined' && PeerManager.connected) {
        PeerManager.broadcast('player_escaped', {
          playerId: PeerManager.playerId,
          name: PeerManager.playerName || '队友'
        });
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

    // 重力：碎屑/火星抛物线下落
    if (p.userData.gravity && p.userData.vel) {
      p.userData.vel.y -= p.userData.gravity * delta;
    }

    if (p.userData.vel) {
      p.position.add(p.userData.vel.clone().multiplyScalar(delta));
    }

    p.userData.life -= delta;

    // 自定义逐帧动画：特效层（VX.vfx）全部走这里，避免为每种特效加分支
    if (p.userData.update) {
      p.userData.update(p, delta);
    }

    // billboard：软光面片始终正对相机
    if (p.userData.billboard && camera) {
      p.quaternion.copy(camera.quaternion);
    }

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
      // 倒地待救：怪物子弹直接穿过，不再结算伤害。
      // 否则会反复触发死亡流程，血条在 0 附近抖动。
      if (GS.downed) {
        scene.remove(p);
        projectiles.splice(i, 1);
        continue;
      }
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
        if (GS._invulnTimer > 0) pdmg = 0;   // 复活无敌
        GS.hp -= pdmg;
        hitFlash = 0.3;
        AudioMgr.playHurt();
        updateHUD();
        showMessage('💥 被击中! -' + pdmg + '❤️', 0xff4444);
        scene.remove(p);
        projectiles.splice(i, 1);
        if (GS.hp <= 0) handlePlayerDeath('hp');
        continue;
      }
    }
    // 队友的攻击特效弹（cosmeticShot）：纯装饰。
    // 命中怪物只出爆点 + 闪白，**不扣血、不击退、不判定击杀** ——
    // 伤害由发起攻击的那一端通过 monster_damage 上报、主机权威结算。
    // 不走下面那段，避免同一发子弹被结算两次。
    if (p.userData.cosmeticShot) {
      var cosTargets = monsters.concat(bosses);
      for (var ci = 0; ci < cosTargets.length; ci++) {
        var cm = cosTargets[ci];
        if (!cm.userData.active) continue;
        var cScale = (cm.userData.type && cm.userData.type.scale) || 1;
        if (p.position.distanceTo(cm.position) < 1.8 * cScale) {
          cm.userData.hitFlash = 0.15;
          var fxCol = p.userData.fxColor || 0xffffff;
          if (window.VX && VX.vfx) {
            VX.vfx.impact(p.position, fxCol, { scale: 0.95, chipColor: fxCol, chipCount: 8 });
          }
          AudioMgr.playHit();
          scene.remove(p);
          break;
        }
      }
      // 这里直接 continue，跳过了循环末尾的"寿命到点就移除"，
      // 所以必须自己补一次，否则打空的子弹会永远留在 projectiles 里
      if (p.parent && p.userData.life <= 0) {
        scene.remove(p);
        projectiles.splice(i, 1);
      }
      continue;
    }

    if (p.userData.damage) {
      // 将抓捕者也加入可攻击目标
      var targetMonsters = monsters.concat(bosses);
      if (chaserMonster && chaserMonster.parent && chaserMonster.userData.active) {
        targetMonsters.push(chaserMonster);
      }
      // 伪装者同样吃子弹（伪装状态也能打穿）
      if (typeof getImpostorTargets === 'function') {
        targetMonsters = targetMonsters.concat(getImpostorTargets(false));
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
          // 统一走 playerDamageGuard：只防秒杀，不再压制正常伤害
          var dealt = (typeof playerDamageGuard === 'function')
            ? playerDamageGuard(tm, p.userData.damage)
            : Math.max(1, Math.round(p.userData.damage));
          var _projIsChaser = (typeof chaserMonster !== 'undefined' && tm === chaserMonster);
          // 伪装者：本地结算（它没有 netId，上报会被主机拒收）
          var _projIsImpostor = !!(tm.userData && tm.userData.isImpostor);
          var _projKilled = (_projIsImpostor && typeof damageImpostor === 'function')
            ? damageImpostor(tm, dealt)
            : dealMonsterDamage(tm, dealt, _projIsChaser);
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

          // 命中爆点：白热核心 + 扩散环 + 地面冲击波 + 放射线 + 碎屑 + 点光 + 震屏
          if (window.VX && VX.vfx) {
            VX.vfx.impact(p.position, hitColor, {
              scale: 1.05,
              chipColor: hitColor,
              chipCount: 10
            });
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
              // 35~50 秒后在远处重新生成（延迟与刷新点见 BALANCE.spawn / pickEnemySpawnSpot）
              chaserLeaveTimer = 0;
              setTimeout(function () {
                if (typeof canSpawnEnemiesNow === 'function' && !canSpawnEnemiesNow()) return;
                if (GS.running && !GS.gameOver) spawnChaser();
              }, (typeof chaserRespawnDelayMs === 'function') ? chaserRespawnDelayMs() : 35000);
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
// 追击速度硬上限：普通追击不允许超过 BALANCE.combat.chaseSpeedCap，
// 保证玩家拿到一只急速之靴就能甩开追兵；冲刺/扑击是刻意保留的例外。
function clampChaseSpeed(spd) {
  var combat = (typeof BALANCE !== 'undefined' && BALANCE.combat) ? BALANCE.combat : {};
  var cap = combat.chaseSpeedCap || 5.6;
  var d = (typeof balanceDiff === 'function') ? balanceDiff(GS.difficulty) : { chase: 1 };
  return Math.min(spd, cap * (d.chase || 1));
}

// ============================================================
// 统一墙体碰撞
//
// 每帧对「玩家 / 所有怪物 / 抓捕者」各收一次，位置一律推出墙体。
// 放在这里而不是各个移动分支里，是因为位移来源太多：
//   主动移动、怪物冲刺、受击击退、技能位移、重生落点……
//   逐个分支加碰撞必然漏（而且漏了很难看出来），
//   统一在一帧末尾收口，任何来源的位移都会被纠正。
// ============================================================
function applyEntityCollisions() {
  if (typeof resolveWallCollision !== 'function') return;

  // 玩家：root.scale 会放大模型（爸爸 1.07），半径跟着放大
  if (typeof player !== 'undefined' && player) {
    var pr = (player.userData.radius || 0.4) * (player.scale.x || 1);
    resolveWallCollision(player.position, pr, player.position.y);
  }

  // 小怪 + Boss：userData.radius 已经含过部位缩放，不要再乘 mesh.scale
  var list = [];
  if (typeof monsters !== 'undefined' && monsters) list = list.concat(monsters);
  if (typeof bosses !== 'undefined' && bosses) list = list.concat(bosses);
  for (var i = 0; i < list.length; i++) {
    var m = list[i];
    if (!m || !m.userData || !m.userData.active || !m.parent) continue;
    resolveWallCollision(m.position, m.userData.radius || 0.9, m.position.y);
  }

  // 抓捕者
  if (typeof chaserMonster !== 'undefined' && chaserMonster && chaserMonster.parent) {
    resolveWallCollision(chaserMonster.position, chaserMonster.userData.radius || 1.0, chaserMonster.position.y);
  }
}

function updateMonster(delta) {
  // 处理小怪物列表
  for (var i = monsters.length - 1; i >= 0; i--) {
    var m = monsters[i];
    if (!m.userData.active) {
      if (m.userData.respawnTimer > 0) {
        m.userData.respawnTimer -= delta;
        if (m.userData.respawnTimer <= 0) {
          // 闸门：答题 / 开场倒计时 / 已结算 / 已撤离期间先不补刷，
          // 过一会儿再试 —— 否则玩家答完题一睁眼，脚边就多了一只怪。
          if (typeof canSpawnEnemiesNow === 'function' && !canSpawnEnemiesNow()) {
            var _spCfg = (typeof BALANCE !== 'undefined' && BALANCE.spawn) ? BALANCE.spawn : {};
            m.userData.respawnTimer = _spCfg.retryBlocked || 0.8;
          } else {
            respawnMonster(m);
          }
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
  // 医院：落点要挪出墙体（见 mapSnapOpen）
  if (typeof mapSnapOpen === 'function') {
    var _rs = mapSnapOpen(x, z, 1.1);
    x = _rs.x; z = _rs.z;
  }
  g.position.set(x, groundY, z);
  scene.add(g);

  g.userData = {
    radius: (t.radius || 0.9) * (t.scale || 1),
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

  // 专属模型的走路 / 待机动画（医院的三种怪物）。
  // 放在所有守卫之前：硬直、被束缚的时候也要有细微动作，
  // 否则整个人像被冻住，看着像掉帧。
  if (typeof m.__creatureTick === 'function') {
    try { m.__creatureTick(delta, m); } catch (e) { }
  }

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

  // 联机主机端：怪物追踪最近的「活着的」玩家（含加入者）；单机/加入者端为本地玩家。
  //
  // 这里必须用 nearestAlivePlayerPos 而不是 nearestPlayerPos：
  // 玩家倒地后若仍是追击目标，怪物会贴到尸体旁停住不动（近战只在 dist>2.5 时移动），
  // 而攻击又因为 GS.downed 被拦掉 —— 看起来就是"怪物卡死不走了"。
  var _tgtPos = (typeof nearestAlivePlayerPos === 'function')
    ? nearestAlivePlayerPos(m.position)
    : player.position;

  // 场上没有任何活着的玩家（全员倒地）：怪物原地待机，别围着尸体打转。
  // 这种局面主机很快就会走 all_down 结算，不需要再演算 AI。
  if (!_tgtPos) {
    m.userData.aggroTimer = 0;
    m.userData.attackCooldown = 0;
    return;
  }

  var dir = new THREE.Vector3().subVectors(_tgtPos, m.position);
  var dist = dir.length();
  dir.y = 0;

  // 跨房间时改走门。
  // 怪物只会在同房间内直线追击；目标在墙另一边时，直线走会一直顶着墙
  // 被碰撞推回来 —— 这就是玩家看到的「怪物卡墙」。
  // 注意 dist 仍然用「到真实目标的距离」，攻击判定不受影响。
  var _navDir = dir.clone().normalize();
  if (typeof monsterNavDir === 'function') {
    _navDir = monsterNavDir(m, _tgtPos, _navDir);
  }

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

    // 玩家就在隔壁房间时也必须算"战斗中"。
    // 原来只看直线距离，隔一道墙 dist 很容易超过 25 → Boss 判定脱战 → 5 秒后睡觉，
    // 玩家看到的就是"Boss 明明在墙那边却一动不动"。
    // 房间是 3x3 网格，同房间或相邻房间（曼哈顿 40）都算发现玩家。
    if (!inCombat && _tgtPos && typeof roomIndexOf === 'function' && typeof ROOMS !== 'undefined' && ROOMS) {
      var _bMy = ROOMS[roomIndexOf(m.position.x, m.position.z)];
      var _bTg = ROOMS[roomIndexOf(_tgtPos.x, _tgtPos.z)];
      if (_bMy && _bTg) {
        var _roomDist = Math.abs(_bMy.cx - _bTg.cx) + Math.abs(_bMy.cz - _bTg.cz);
        if (_roomDist <= 40) inCombat = true;
      }
    }
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

    // 目标在「同房间或相邻房间」时，即使直线距离超过追击上限也要追过去 ——
    // 房间是 3x3 网格，隔一道墙直线距离就有 40，旧逻辑会判定"太远了，回家"，
    // 玩家看到的就是"Boss 在墙那边却转身走了"。
    var _bReach = false;
    if (_tgtPos && typeof roomIndexOf === 'function' && typeof ROOMS !== 'undefined' && ROOMS) {
      var _rMy = ROOMS[roomIndexOf(m.position.x, m.position.z)];
      var _rTg = ROOMS[roomIndexOf(_tgtPos.x, _tgtPos.z)];
      if (_rMy && _rTg) {
        _bReach = (Math.abs(_rMy.cx - _rTg.cx) + Math.abs(_rMy.cz - _rTg.cz)) <= 40;
      }
    }
    // 可达时把追击上限放开，让下面的追击分支生效（内部会走 monsterNavDir 导航）
    var _bChaseLimit = _bReach ? 9999 : CHASE_LIMIT_BOSS;

    var shouldReturnHome = false;
    if (dist > _bChaseLimit) {
      shouldReturnHome = true;
    }
    if (timeSinceAttacked > 8.0 && !isAggro && dist > 12 && !_bReach) {
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
    } else if (dist > 2.5 && dist < _bChaseLimit) {
      // 苏醒状态见到角色：主动追击攻击（跨房间时由 _navDir 导航走门）
      var speed = clampChaseSpeed((t.speed || 2) * (m.userData.speedMul || 1) * (isAggro ? 1.4 : 1.0));
      var move = _navDir.clone().multiplyScalar(speed * delta);
      m.position.add(move);
      m.rotation.y = Math.atan2(move.x, move.z);
      m.userData.walkPhase += delta * speed * 3;
    }
  } else {
    // ===== 小怪：全图巡逻，遇到角色就追击攻击 =====
    // 冲刺期间由下面的冲刺逻辑单独驱动位移，这里必须让开，
    // 否则「普通追击 + 冲刺」会叠加成 6 倍移速，玩家完全无法躲避
    if (dist < CHASE_LIMIT && dist > 2.5 && !(m.userData.dashing > 0)) {
      // 遇到角色：发起追击
      var speed = clampChaseSpeed((t.speed || 2) * (m.userData.speedMul || 1) * (isAggro ? 1.4 : 1.0));
      // 扑击型：只在激怒时小幅超出上限，保留"突进"手感但不再离谱
      if (t.charge && isAggro) {
        speed *= 1.5;
      }
      var move = _navDir.clone().multiplyScalar(speed * delta);
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
        var _cbt = (typeof BALANCE !== 'undefined' && BALANCE.combat) ? BALANCE.combat : {};
        // 冲刺速度同样设上限：不封顶的话最快的小怪能冲到玩家移速的 2 倍，根本躲不开
        var _dashSpd = Math.min((t.speed || 2) * (_cbt.dashMul || 3.0),
          (_cbt.chaseSpeedCap || 5.6) * (_cbt.dashSpeedCapMul || 1.5));
        var dashMove = _navDir.clone().multiplyScalar(_dashSpd * delta);
        m.position.add(dashMove);
        m.rotation.y = Math.atan2(dashMove.x, dashMove.z);
        m.userData.walkPhase += delta * 20;
      }
      if (dist < (typeof monsterAttackReach === 'function' ? monsterAttackReach(m) : 3.5 * (t.scale || 1))) {
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

      // 开火瞬间让专属模型播放攻击动画（如幽灵的尖啸）
      if (typeof m.__creatureAttack === 'function') {
        try { m.__creatureAttack(m); } catch (e) { }
      }

      var fb = new THREE.Mesh(
        new THREE.SphereGeometry(0.15, 8, 8),
        new THREE.MeshStandardMaterial({ color: t.emissive || 0xff4422, emissive: t.emissive || 0xff2200, emissiveIntensity: 0.8 })
      );
      fb.position.copy(m.position);
      fb.position.y += 1.0 * (t.scale || 1);
      // 医院幽灵：怨灵弹丸定制——加色发光核心 + 呼吸光壳，替代通用圆球
      if (t.model === 'ghost') {
        fb.material = new THREE.MeshBasicMaterial({
          color: 0x9fffdf, transparent: true, opacity: 0.95,
          blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
        });
        fb.scale.setScalar(0.85);
        var _ghShell = new THREE.Mesh(
          new THREE.SphereGeometry(0.32, 10, 8),
          new THREE.MeshBasicMaterial({
            color: 0x4dffc0, transparent: true, opacity: 0.26,
            blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
          })
        );
        fb.add(_ghShell);
        fb.userData.update = function (o, dt) {
          o.rotation.y += dt * 7;
          var _pk = 1 + Math.sin(clock.elapsedTime * 14) * 0.25;
          if (_ghShell) _ghShell.scale.setScalar(_pk);
        };
      }
      // 瞄准「当前仇恨目标」而不是本地玩家：倒地的人不该继续被弹丸集火
      var aimPoint = _tgtPos.clone();
      aimPoint.y += 0.8;
      var fdir = new THREE.Vector3().subVectors(aimPoint, fb.position).normalize();
      fb.userData = fb.userData || {};
      fb.userData.vel = fdir.multiplyScalar(5);
      fb.userData.life = 4;
      fb.userData.playerDamage = monsterHitDamage(m);
      scene.add(fb);
      projectiles.push(fb);
      AudioMgr.playAttack();
      showMessage('💀 远程怪发射弹丸!', 0xff6600);

      // 广播给加入者：加入者不跑怪物 AI，看不到弹丸，
      // 表现就是"远程怪对着空气开火、我却莫名掉血"。
      if (GS.mode === 'multiplayer' && GS.isHost && typeof PeerManager !== 'undefined' && PeerManager.connected) {
        PeerManager.broadcast('monster_shot', {
          x: fb.position.x, y: fb.position.y, z: fb.position.z,
          dx: fdir.x, dy: fdir.y, dz: fdir.z,
          dmg: monsterHitDamage(m),
          color: t.emissive || 0xff4422
        });
      }
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
      // 不相邻（对角房间）：必须走两道门，先沿 x 再沿 z。
      //
      // 旧写法算出来的是「当前房间朝中间的门」+「目标房间朝中间的门」，
      // 例如从 (0,0) 去 (40,-40) 会得到 (0,0) 和 (20,-20) ——
      // (0,0) 是原地，(20,-20) 是东北房间的**墙角**，根本不是门。
      // 怪物照着这个点直线走，必然顶在墙上卡死。
      //
      // 正确做法：门一定开在「当前房间朝向目标的那面墙」上，
      // 坐标就是 (cx ± 20, cz) 或 (cx, cz ± 20)，且 cz/cx 本身就是房间中心坐标，
      // 所以这道门一定存在。
      var stepX = (nx > cx) ? 1 : -1;
      var stepZ = (nz > cz) ? 1 : -1;
      // 第一道门：当前房间朝目标 x 方向的墙
      waypoints.push({ x: cx + stepX * H, z: cz });
      // 第二道门：过门后所在房间（cx ± 40）朝目标 z 方向的墙
      waypoints.push({ x: cx + stepX * 2 * H, z: cz + stepZ * H });
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
      // 同上：倒地（0 血）时不能被 || 100 当成满血再加 30
      p.hp = Math.min(maxHp, ((typeof p.hp === 'number' ? p.hp : 100)) + 30);
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
    // 已撤离的玩家：不再处理他的输入/拾取，也别把他从场上"重建"回来
    if (p && p.escaped) continue;
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
    // 倒地的人只能爬，不能再开箱 / 捡东西
    if (!p.downed && localEnergyOrb && localEnergyOrb.userData && localEnergyOrb.userData.active) {
      var distToOrb = Math.sqrt(
        Math.pow(p.position.x - localEnergyOrb.position.x, 2) +
        Math.pow(p.position.z - localEnergyOrb.position.z, 2)
      );
      if (distToOrb < 2 && p._quizCooldown <= 0 && !(localEnergyOrb.userData.cooldown > 0)) {
        p._quizCooldown = 2;
        // 和主机本地开箱保持一致：金色宝箱答错后进 8 秒冷却。
        // 原来这里不设冷却，加入者可以每 2 秒无限开同一个金箱刷能量。
        triggerQuizForPlayer(pid, pickRandomQuestion(), true);
      }
    }

    // 检测普通宝箱（使用 per-player 冷却）
    if (!p.downed && localNormalChests) {
      for (var ni = 0; ni < localNormalChests.length; ni++) {
        var nc = localNormalChests[ni];
        if (!nc.userData.active) continue;
        var distToChest = Math.sqrt(
          Math.pow(p.position.x - nc.position.x, 2) +
          Math.pow(p.position.z - nc.position.z, 2)
        );
        if (distToChest < 1.5 && p._quizCooldown <= 0) {
          p._quizCooldown = 2;
          // 必须走 destroyChestItem 而不是只把 active 置 false：
          // 补刷逻辑（30 秒后移除并在别处重生）和跨端广播都在这个函数里，
          // 只置 active=false 会让这个宝箱永远消失、再也不会补刷。
          if (typeof destroyChestItem === 'function') {
            destroyChestItem(nc);
          } else {
            nc.userData.active = false;
          }
          triggerQuizForPlayer(pid, pickRandomQuestion());
          break;
        }
      }
    }

    // 检测道具拾取。
    // 单独 try 保护：这一段前面还有宝箱检测，只要那边抛异常，
    // 加入者就再也捡不到道具了，而异常会被 update() 的 catch 静默吞掉。
    try {
      if (!p.downed && localItems) {
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
          // 广播拾取事件：所有加入者按 netId 移除本地道具，
          // 拾取者本人还要在本地应用道具效果（主机的 applyItemEffectToJoiner
          // 只维护 PeerManager.players 里那份记录，改不到加入者的 GS）。
          PeerManager.broadcast('item_pickup_sync', {
            netId: it.userData.netId || null,
            itemType: it.userData.itemType ? it.userData.itemType.id : null,
            pickerId: pid,
            pickerName: p.name || '队友'
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
    } catch (e) {
      console.error('[Multiplayer] 加入者道具拾取检测出错:', e && e.message);
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

    // 注意：这里原来有一段「加入者 hp<=0 就整队失败」的旧逻辑，
    // 已经被倒地/复活机制取代 —— 加入者血量为 0 只是"倒下待救"，
    // 主机要能过去把他救起来。保留它会导致**队友一倒地，主机这局直接结束**，
    // 表现就是"怪物突然全都不动了"（主机 update 被 gameOver 挡掉）。
    // 「全员倒地」的失败判定统一由 checkAllDown() 负责（见 ReviveSystem.js）。

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
        hp: (typeof p.hp === 'number' ? p.hp : 100),
        maxHp: p.maxHp || 100,
        energy: p.energy || 0,
        energyMax: p.energyMax || 5,
        curWeapon: p.curWeapon || '木棍',
        isJumping: p.isJumping || false,
        // 倒地 / 飞行状态必须带上：updateRemotePlayers 靠这两个字段决定
        // 远端模型的姿态（躺平 / 浮空）。漏了就是"队友倒了，我这边他还站着"。
        downed: !!p.downed,
        flying: !!p.flying,
        isCaptured: !!p.isCaptured,
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
// ============================================================
// 自适应分辨率（动态分辨率缩放）
//
// 手机上 devicePixelRatio 普遍 2.5~3.5，固定按它渲染意味着
// 实际像素是逻辑像素的 6~12 倍，纯 CPU 光栅化直接扛不住 ——
// 这是"操作发顿"最主要的原因。
//
// 做法：每秒统计一次帧率，低于 45fps 就把渲染像素比降一档，
// 高于 58fps 再逐步升回去。canvas 的 CSS 尺寸始终不变，
// 所以 UI 和点击区域完全不受影响，只是画面精度变化。
// ============================================================
// 移动端上限压到 1.5：手机 devicePixelRatio 普遍 2.5~3.5，
// 按原值渲染像素是逻辑像素的 6~12 倍，纯 CPU 光栅化扛不住。
// 1.5 配合自适应下调（最低 0.7），在流畅和清晰之间取平衡。
var _isMobileUA = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
var _pixelRatioMax = Math.min(window.devicePixelRatio || 1, _isMobileUA ? 1.5 : 2);
var _pixelRatioNow = _pixelRatioMax;
var _fpsFrames = 0;
var _fpsWindowStart = 0;
var _resCooldownUntil = 0;

function adaptResolution(now) {
  _fpsFrames++;
  if (!_fpsWindowStart) { _fpsWindowStart = now; return; }
  var elapsed = now - _fpsWindowStart;
  if (elapsed < 1000) return;                       // 每秒统计一次

  var fps = _fpsFrames * 1000 / elapsed;
  _fpsFrames = 0;
  _fpsWindowStart = now;

  if (now < _resCooldownUntil) return;               // 调整后至少观察 1.5 秒
  var next = _pixelRatioNow;
  if (fps < 45 && _pixelRatioNow > 0.7) {
    next = Math.max(0.7, _pixelRatioNow - 0.25);     // 掉帧 → 降精度
  } else if (fps > 58 && _pixelRatioNow < _pixelRatioMax) {
    next = Math.min(_pixelRatioMax, _pixelRatioNow + 0.25);   // 富余 → 升回去
  }
  if (next !== _pixelRatioNow) {
    _pixelRatioNow = next;
    renderer.setPixelRatio(next);                   // 内部会重设 drawing buffer，CSS 尺寸不变
    _resCooldownUntil = now + 1500;
    console.log('[Perf] fps=' + fps.toFixed(0) + ' → pixelRatio ' + next);
  }
}

function animate() {
  requestAnimationFrame(animate);
  var delta = Math.min(clock.getDelta(), 0.05);
  var _now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  adaptResolution(_now);

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

  // 加入者端：场景就绪后请求一次完整世界状态（定向发给房主）
  if (GS.mode === 'multiplayer' && !GS.isHost && PeerManager && PeerManager.connected) {    console.log('[Game] init: 加入者模式，请求世界状态');
    setTimeout(function () {
      var _hid = (PeerManager.getHostId && PeerManager.getHostId()) || null;
      if (_hid && _hid !== PeerManager.playerId) {
        PeerManager.sendTo(_hid, 'world_state_request', {});
      } else {
        PeerManager.broadcast('world_state_request', {});
      }
    }, 500);
  }

  // 伪装者：每局重新计时（清掉上一局残留的模型 / 出场倒计时）
  if (typeof initImpostorSystem === 'function') initImpostorSystem();
}