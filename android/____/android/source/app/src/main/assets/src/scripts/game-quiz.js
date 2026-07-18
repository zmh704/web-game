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
  return GS.character === 'qike' ? '奇奇' : '妙妙';
}

function showQuiz() {
  var overlay = document.getElementById('quiz-overlay');
  if (overlay.style.display === 'flex') return;

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
      if (i === q.a) {
        GS.correct++;
        AudioMgr.playQuiz();
        GS.stars += 10;
        // 解锁能量球时，同一房间内的怪物被激怒并攻击角色
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
        var lockedW = WEAPON_LIST.filter(function (n) { return !GS.weapons[n] });
        var rewardText = '';
        if (lockedW.length > 0) {
          var wn = lockedW[Math.floor(Math.random() * lockedW.length)];
          GS.weapons[wn] = WEAPONS[wn];
          GS.weaponCount++;
          if (!GS.curWeapon) GS.curWeapon = wn;
          updateWeaponBar();
          rewardText = WEAPONS[wn].icon + ' ' + wn;
          createWeaponGetEffect();
        } else {
          GS.stars += 10;
          rewardText = '⭐ 星星+10';
        }
        consumeEnergyOrb();
        // 能量直接计入（gainEnergy内部处理升级和集满提示）
        gainEnergy(1);
        document.getElementById('quiz-reward').textContent = charName + '，你好棒！回答正确！获得奖励：🔋能量+1 (' + GS.energy + '/' + (GS.energyMax || 5) + ')  ' + rewardText;
        document.getElementById('quiz-reward').style.display = 'block';
        document.getElementById('quiz-reward').style.color = '#44ff88';
      } else {
        document.getElementById('quiz-reward').textContent = charName + '，回答错误，正确答案应该是「' + q.o[q.a] + '」，继续加油！';
        document.getElementById('quiz-reward').style.display = 'block';
        document.getElementById('quiz-reward').style.color = '#ff8888';
        if (energyOrb) energyOrb.userData.cooldown = 2;
      }
      document.getElementById('quiz-close').style.display = 'inline-block';
      updateHUD();
    };
    optContainer.appendChild(btn);
  });
  document.getElementById('quiz-close').onclick = function () {
    overlay.style.display = 'none';
    GS.running = true;
  };
  GS.running = false;
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