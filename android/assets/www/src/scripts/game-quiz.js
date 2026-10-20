// ============================================================
// 答题系统
// ============================================================
function showMessage(text, color) {
  var el = document.getElementById('message');
  el.textContent = text;
  el.style.color = color ? '#' + color.toString(16).padStart(6, '0') : '#ffd700';
  el.style.opacity = '1';
  clearTimeout(el._timeout);
  el._timeout = setTimeout(function () { el.style.opacity = '0' }, 1500);
}

// 获取角色名字
function getCharName() {
  return (typeof characterName === 'function') ? characterName(GS.character)
    : (GS.character === 'qike' ? '奇奇' : '妙妙');
}

// 随机发放一件未拥有的武器（全拥有则补星星），返回奖励文本
function grantRandomWeapon() {
  var lockedW = REWARD_WEAPON_LIST.filter(function (n) { return !GS.weapons[n] });
  if (lockedW.length > 0) {
    var wn = lockedW[Math.floor(Math.random() * lockedW.length)];
    GS.weapons[wn] = WEAPONS[wn];
    GS.weaponAmmo[wn] = WEAPONS[wn].type === 'rope' ? 1 : 20;
    GS.weaponCount++;
    if (!GS.curWeapon) GS.curWeapon = wn;
    updateWeaponBar();
    createWeaponGetEffect();
    return WEAPONS[wn].icon + ' ' + wn;
  }
  // 已拥有全部武器：随机重置一把的弹药
  var ownedW = REWARD_WEAPON_LIST.filter(function (n) { return GS.weapons[n] });
  if (ownedW.length > 0) {
    var rn = ownedW[Math.floor(Math.random() * ownedW.length)];
    GS.weaponAmmo[rn] = WEAPONS[rn].type === 'rope' ? 1 : 20;
    updateWeaponBar();
    return '🔄 ' + rn + ' 弹药重置';
  }
  GS.stars += 10;
  return '⭐ 星星+10';
}

// 当前正在答题的宝箱（防止重复触发）- 全局变量
window.currentQuizChest = null;

// chestItem 为空 = 金色宝箱(答对+3能量); 传入普通宝盒道具 = 答对开出1-3碎片+1武器
function showQuiz(chestItem) {
  var overlay = document.getElementById('quiz-overlay');
  if (overlay.style.display === 'flex') return;

  // 防止重复答题：如果已有正在答题的宝箱，直接返回
  if (window.currentQuizChest && !chestItem) return; // 金色宝箱不能与普通宝箱同时答题
  if (window.currentQuizChest && window.currentQuizChest !== chestItem) return; // 不同宝箱不能同时答题

  var isGolden = !chestItem;

  // 普通宝盒：如果已经处于非激活状态，说明已被答题或正在答题，不再触发
  if (!isGolden && chestItem && chestItem.userData && !chestItem.userData.active) return;

  // 普通宝盒：答题开始时立即标记为非激活，防止重复触发（同金色宝箱逻辑）
  if (!isGolden && chestItem && chestItem.userData) {
    chestItem.userData.active = false;
    window.currentQuizChest = chestItem; // 记录当前答题的宝箱（使用全局变量）
  }

  var pool = QDB[GS.difficulty] || QDB.easy;

  // 不重复机制：记录已用题目索引
  if (!GS.usedQuestions) GS.usedQuestions = {};
  if (!GS.usedQuestions[GS.difficulty]) GS.usedQuestions[GS.difficulty] = [];
  var used = GS.usedQuestions[GS.difficulty];

  // 如果所有题目都用完了，重置已用列表
  var available = [];
  for (var idx = 0; idx < pool.length; idx++) {
    if (used.indexOf(idx) === -1) available.push(idx);
  }
  if (available.length === 0) {
    // 全部用完，重置
    GS.usedQuestions[GS.difficulty] = [];
    for (var ri = 0; ri < pool.length; ri++) available.push(ri);
  }

  // 从可用题目中随机选一个
  var randIdx = Math.floor(Math.random() * available.length);
  var chosenIdx = available[randIdx];
  used.push(chosenIdx);

  var q = pool[chosenIdx];
  GS.total++;

  // 答题会暂停主循环，进度条不会自动回收，这里主动收起
  if (typeof hideChestProgress === 'function') hideChestProgress();

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
      var charName = getCharName();
      // 普通宝盒一次性：无论答对答错，答题后即销毁（10秒后随机在其他房间刷新）
      if (!isGolden && chestItem && typeof window.destroyChestItem === 'function') {
        window.destroyChestItem(chestItem);
      }
      if (i === q.a) {
        GS.correct++;
        AudioMgr.playQuiz();
        GS.stars += 10;
        // 解锁宝箱时，同一房间内的怪物被激怒并攻击角色
        var playerRoom = roomIndexOf(player.position.x, player.position.z);
        var activeMonsters = (window.monsters || []).concat(window.bosses || []);
        for (var agIdx = 0; agIdx < activeMonsters.length; agIdx++) {
          var agM = activeMonsters[agIdx];
          if (!agM.userData.active) continue;
          var mRoom = roomIndexOf(agM.position.x, agM.position.z);
          if (mRoom === playerRoom) {
            agM.userData.aggroTimer = Math.max(agM.userData.aggroTimer || 0, 5.0);
            agM.userData.lastAttackedTime = clock.elapsedTime;
          }
        }
        // 开箱惊醒睡眠中的Boss（无论Boss在哪个房间）
        if (typeof wakeAllBosses === 'function') wakeAllBosses();

        var rewardMsg;
        if (isGolden) {
          // 金色宝箱：开箱爆点 → 直接获得3点能量
          if (window.VX && VX.vfx && energyOrb) {
            var _gp = energyOrb.position.clone();
            _gp.y += 0.6;
            VX.vfx.impact(_gp, 0xffd700, {
              scale: 1.7,
              chipColor: 0xffc233,
              chipCount: 14,
              streakCount: 8
            });
            VX.vfx.shake(0.05, 0.25);
          }
          consumeEnergyOrb();
          gainEnergy(3);
          rewardMsg = charName + '，你好棒！回答正确！打开金色宝箱获得：🔋能量x3';
        } else {
          // 普通宝盒：开箱爆点 → 1-3个能量碎片 + 1件武器（宝盒已在上方统一销毁）
          if (window.VX && VX.vfx && chestItem) {
            var _cp = chestItem.position.clone();
            _cp.y += 0.6;
            VX.vfx.impact(_cp, 0xaa77ff, {
              scale: 1.35,
              chipColor: 0x7c5cff,
              chipCount: 10
            });
          }
          var fragCount = 1 + Math.floor(Math.random() * 3);
          for (var fi = 0; fi < fragCount; fi++) gainFragment();
          var rewardText = grantRandomWeapon();
          rewardMsg = charName + '，你好棒！回答正确！打开宝盒获得：💠能量碎片x' + fragCount + '  ' + rewardText;
        }
        document.getElementById('quiz-reward').textContent = rewardMsg;
        document.getElementById('quiz-reward').style.display = 'block';
        document.getElementById('quiz-reward').style.color = '#44ff88';
      } else {
        // 普通宝箱答错会直接销毁，给一个灰色散逸提示"它没了"
        if (!isGolden && window.VX && VX.vfx && chestItem) {
          var _wp = chestItem.position.clone();
          _wp.y += 0.5;
          VX.vfx.impact(_wp, 0x9aa6ae, {
            scale: 0.9,
            chipColor: 0x8a939a,
            chipCount: 6,
            streakCount: 4,
            light: false,
            shake: false
          });
        }
        var wrongMsg = charName + '，回答错误，正确答案应该是「' + q.o[q.a] + '」，';
        wrongMsg += isGolden ? '宝箱还在原地，过一会儿可以再试一次！' : '宝盒消失了，去找下一个吧！';
        document.getElementById('quiz-reward').textContent = wrongMsg;
        document.getElementById('quiz-reward').style.display = 'block';
        document.getElementById('quiz-reward').style.color = '#ff8888';
        if (isGolden && energyOrb) {
          // 原来只有 2 秒，等于点一下就能无限重试，金色宝箱几乎没有门槛；
          // 8 秒足够让小朋友认真看题，又不至于等太久
          energyOrb.userData.cooldown = 8;
          energyOrb.userData.openProgress = 0;
        }
      }
      document.getElementById('quiz-close').style.display = 'inline-block';
      updateHUD();
    };
    optContainer.appendChild(btn);
  });
  var closeQuiz = function () {
    overlay.style.display = 'none';
    // 普通宝箱在答题结束后立即销毁（同金色宝箱逻辑）
    if (!isGolden && chestItem && typeof window.destroyChestItem === 'function') {
      window.destroyChestItem(chestItem);
    }
    // 重置当前答题宝箱，允许下一次答题
    window.currentQuizChest = null;
    GS.running = true;
  };
  document.getElementById('quiz-close').onclick = closeQuiz;
  GS.running = false;

  // 兜底自动收尾：答题会把 GS.running 置 false，只有点按钮才恢复。
  // 玩家没点（分心、切后台）时整局会永久卡住，这里 3 秒后自动关闭——
  // 关闭动作和手点完全一致，不会吞掉宝箱奖励。
  if (window.__quizAutoCloseTimer) clearTimeout(window.__quizAutoCloseTimer);
  window.__quizAutoCloseTimer = setTimeout(function () {
    if (overlay.style.display !== 'flex') return;
    closeQuiz();
  }, 3000);
}

function createWeaponGetEffect() {
  for (var i = 0; i < 20; i++) {
    (function () {
      var p = new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 4, 4),
        new THREE.MeshBasicMaterial({ color: [0xffd700, 0xff6600, 0x44ff88][Math.floor(Math.random() * 3)], transparent: true, opacity: 1 })
      );
      p.position.copy(player.position);
      p.position.y += 1.5;
      var v = new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2);
      p.userData = { vel: v, life: 1 };
      scene.add(p);
      projectiles.push(p);
    })();
  }
}