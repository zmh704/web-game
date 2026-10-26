// ============================================================
// 游戏状态
// ============================================================
var GS = {
  hp: 100, maxHp: 100,   // 实际初始值由 BALANCE.player.baseHp 覆盖（见 selectChapter）
  stars: 0,
  totalStars: 0,
  weapons: {},
  curWeapon: null,
  correct: 0, total: 0,
  difficulty: 'medium',
  chapter: 1,
  character: 'qike',
  monsterHp: 100, monsterMaxHp: 100,
  running: false, gameOver: false,
  weaponCount: 0,
  jumpPower: 0,
  isJumping: false,
  canJump: true,
  inSecondRoom: false,
  energy: 0,
  energyMax: 5,        // 撤离所需能量(按章节配置，见selectChapter)
  // ---- 联机倒地 / 复活（见 ReviveSystem.js）----
  downed: false,        // 已倒地待救（联机专用，单机永远 false）
  _reviveHold: 0,       // 当前救援累计秒数
  _reviveTargetId: null,
  _invulnTimer: 0,      // 复活后的短暂无敌
  _allDownSent: false,  // 「全员倒地」只广播一次
  fragments: 0,        // 能量碎片(击杀小怪掉落，2个合成1点能量)
  escaping: false,
  // 已撤离（联机）：本人已经坐上飞船起飞，正在等待队友 / 已经结算。
  // 和 escaping 的区别：escaping 是"起飞动画进行中"，escaped 是"我已经走了"。
  // 主机先撤离时不能把世界停下来（否则队友全冻住），靠这个标记进入观战等待。
  escaped: false,
  skillEnergy: 100,
  skillMax: 100,
  skillReady: true,
  skillCooldown: 0,   // 技能冷却剩余时间(秒)
  skillActive: 0,     // 技能持续剩余时间(秒)
  skillDuration: 3,   // 技能持续总时长(秒)
  skillCooldownTime: 20, // 技能冷却总时长(秒)
  // 道具系统：玩家属性加成
  moveSpeedBonus: 0,      // 急速之靴增加的移动速度
  atkBonus: 0,            // 攻击宝石增加的攻击力
  atkSpeedBonus: 0,      // 攻击宝石增加的攻击速度(减少冷却)
  defBonus: 0,            // 防御宝石增加的防御
  maxHpBonus: 0,          // 防御宝石增加的血量上限
  killCount: 0,            // 累计击杀怪物数，用于怪物增强
  level: 1,                 // 角色等级
  levelHpBonus: 0,          // 等级增加的血量
  levelAtkBonus: 0,         // 等级增加的攻击力
  levelDefBonus: 0,         // 等级增加的防御
  levelSpeedBonus: 0,       // 等级增加的速度
  usedQuestions: null,       // 已用题目索引（每局重置）
  // 手电筒现在是夜晚看清远处的唯一手段，默认就带在身上。
  // 以前要靠开箱/拾取才拿到，结果开局一片漆黑、什么都看不见。
  hasFlashlight: true,       // 是否拥有手电筒
  weaponAmmo: {},             // 武器弹药数
  // 联机模式字段
  mode: 'single',              // 'single' | 'multiplayer'
  isHost: false,               // 联机模式下是否为"主机"
  playerId: null               // 联机模式下的玩家ID
};

// ============================================================
// 动态属性上限系统（基于当前章节Boss属性）
// 避免道具/等级叠加过高导致失衡
// ============================================================
function getDynamicCaps() {
  // 上限统一从 BALANCE.caps 读取（作用于「等级成长 + 道具」的总和）。
  // 旧实现按 Boss 伤害推导，导致上限随章节乱跳，且第 2~3 个道具就触顶作废。
  var c = (typeof BALANCE !== 'undefined' && BALANCE.caps) ? BALANCE.caps : {};
  return {
    atkCap: c.atk || 45,
    defCap: c.def || 20,
    speedCap: c.speed || 3,
    atkSpeedCap: c.atkSpeed || 0.2
  };
}

// ============================================================
// 角色等级系统
// ============================================================
function applyLevelBonuses() {
  var lvl = GS.level || 1;
  var g = (typeof BALANCE !== 'undefined' && BALANCE.level) ? BALANCE.level : {};
  // 等级只提供温和成长：生命是主收益，攻/防/速留出空间给道具，
  // 否则等级一高就把 BALANCE.caps 顶满，捡道具完全没感觉
  GS.levelHpBonus = Math.round((lvl - 1) * (g.hp === undefined ? 6 : g.hp));
  GS.levelAtkBonus = (lvl - 1) * (g.atk === undefined ? 0.5 : g.atk);
  GS.levelDefBonus = (lvl - 1) * (g.def === undefined ? 0.5 : g.def);
  GS.levelSpeedBonus = (lvl - 1) * (g.speed === undefined ? 0.1 : g.speed);
}

function levelUp() {
  GS.level = (GS.level || 1) + 1;
  applyLevelBonuses();
  // 升级时按最大生命的百分比回血（后期血量上限高，固定 +20 会几乎没有意义）
  var maxHp = GS.maxHp + (GS.maxHpBonus || 0) + (GS.levelHpBonus || 0);
  var healPct = (typeof BALANCE !== 'undefined' && BALANCE.level) ? (BALANCE.level.healPct || 0.25) : 0.25;
  GS.hp = Math.min(maxHp, GS.hp + Math.max(20, Math.round(maxHp * healPct)));
  showMessage('🎉 升级! Lv.' + GS.level + ' 生命上限提升', 0xffd700);
  AudioMgr.playSkill();
  updateHUD();
}

// ============================================================
// ============================================================
// 当前血量
//
// 不能写 `GS.hp || 100`：血量 0 是**合法状态**（倒地待救），
// 而 `0 || 100 === 100`，会把倒地的人算成满血 —— 挨一下反而"回血"，
// 上报给队友的血条也会显示满血。联机倒地加入后这个坑立刻暴露。
// ============================================================
function currentPlayerHp() {
  var v = GS.hp;
  return (typeof v === 'number' && !isNaN(v)) ? v : 100;
}

// 能量系统 - 统一入口
// 两条获取路线：1.答对题+1能量  2.打怪(小怪掉碎片/Boss直接+1)
// 能量集满5点后回到中央飞船即可逃离通关
// ============================================================
// 把能量加到本地（fromRemote=true 表示这几点是队友带回来的，不再向外转发）
function applyEnergyGain(n, fromRemote) {
  if (GS.gameOver) return 0;
  n = n || 1;
  var max = GS.energyMax || 5;
  var gained = 0;
  for (var i = 0; i < n && GS.energy < max; i++) {
    GS.energy++;
    levelUp(); // 每获得1点能量升1级，两条路线成长一致
    gained++;
  }
  if (gained <= 0) return 0;

  updateHUD();
  if (GS.energy >= max) {
    showMessage('🚀 能量集满! 快回飞船起飞!', 0x66ffcc);
    // 能量已满，移除场上的金色宝箱
    if (typeof energyOrb !== 'undefined' && energyOrb) {
      try { scene.remove(energyOrb); } catch (e) { }
      energyOrb = null;
    }
  } else if (fromRemote) {
    showMessage('🔋 队友带回能量 +' + gained + ' (' + GS.energy + '/' + max + ')', 0x66ffcc);
  } else {
    showMessage('🔋 能量+' + gained + ' (' + GS.energy + '/' + max + ')', 0x66ffcc);
  }
  return gained;
}

// 联机模式下能量是「全队共享」的一个池子：
// 任何人答题、开宝箱、合成碎片得到的能量，都会加到同一个池里，所有人看到同一个进度。
// 做法是「本地先应用 + 广播增量」，接收方只应用、不再转发，
// 各端数值天然一致，也不依赖快照时序（快照只做兜底校准）。
function gainEnergy(n) {
  var gained = applyEnergyGain(n, false);
  if (gained > 0 && GS.mode === 'multiplayer' &&
    typeof PeerManager !== 'undefined' && PeerManager.connected) {
    PeerManager.broadcast('energy_shared', { delta: gained });
  }
}

function gainFragment() {
  if (GS.gameOver || GS.energy >= (GS.energyMax || 5)) return;
  GS.fragments = (GS.fragments || 0) + 1;
  if (GS.fragments >= 2) {
    GS.fragments = 0;
    showMessage('🔹 碎片合成! 获得能量!', 0x44ddff);
    gainEnergy(1);
  } else {
    showMessage('🔹 能量碎片 ' + GS.fragments + '/2', 0x44ddff);
    updateHUD();
  }
}

// ============================================================
// 进度保存系统
// ============================================================
var ProgressMgr = {
  save: function () {
    var data = {
      chapters: CHAPTERS.map(function (c) { return { id: c.id, unlocked: c.unlocked } }),
      character: GS.character,
      difficulty: GS.difficulty,
      totalStars: GS.totalStars || 0
    };
    localStorage.setItem('miracleForest_progress', JSON.stringify(data));
  },
  load: function () {
    var saved = localStorage.getItem('miracleForest_progress');
    if (!saved) return;
    try {
      var data = JSON.parse(saved);
      GS.totalStars = data.totalStars || 0;
      // 恢复章节解锁状态
      if (data.chapters && data.chapters.length > 0) {
        data.chapters.forEach(function (savedCh) {
          var chapter = CHAPTERS.find(function (c) { return c.id === savedCh.id });
          if (chapter) {
            chapter.unlocked = savedCh.unlocked;
          }
        });
      }
    } catch (e) {
      console.warn('加载进度失败', e);
    }
  },
  unlockChapter: function (id) {
    var chapter = CHAPTERS.find(function (c) { return c.id === id });
    if (chapter) {
      chapter.unlocked = true;
      this.save();
    }
  }
};

// ============================================================
// 选择流程
// ============================================================
var selectedChar = 'qike';
// 联机"创建房间"的默认难度 = 中级（章节默认第 3 章，见 MP_DEFAULT_CHAPTER）。
// 单机流程会在难度选择界面覆盖它，不受影响。
var selectedDiff = 'medium';
// 联机"创建房间"的默认章节 = 第 3 章（难度默认初级）。
// 单机流程会在章节选择界面里覆盖它，所以这里改默认值不影响单机。
var MP_DEFAULT_CHAPTER = 3;
var selectedChapter = MP_DEFAULT_CHAPTER;

function selectCharacter(ch) {
  selectedChar = ch;
  document.getElementById('char-select').classList.add('hidden');
  document.getElementById('diff-select').classList.remove('hidden');
}

function backToCharSelect() {
  document.getElementById('diff-select').classList.add('hidden');
  document.getElementById('char-select').classList.remove('hidden');
}

function backToDiffSelect() {
  document.getElementById('chapter-select').classList.add('hidden');
  document.getElementById('diff-select').classList.remove('hidden');
}

function selectDifficulty(d) {
  selectedDiff = d;
  GS.difficulty = d;
  document.getElementById('diff-select').classList.add('hidden');
  showChapterSelect();
}

function showChapterSelect() {
  ProgressMgr.load();
  document.getElementById('chapter-select').classList.remove('hidden');
  var grid = document.getElementById('chapter-grid');
  grid.innerHTML = '';

  CHAPTERS.forEach(function (ch) {
    var card = document.createElement('div');
    card.className = 'chapter-card' + (ch.unlocked ? '' : ' locked');
    card.style.setProperty('--chapter-color', ch.color);

    var html = '<div class="chapter-num">Chapter ' + ch.id + '</div>';
    html += '<div class="chapter-icon">' + ch.icon + '</div>';
    html += '<div class="chapter-name">' + ch.name + '</div>';
    html += '<div class="chapter-desc">' + ch.desc + '</div>';
    html += '<div class="chapter-energy">🔋 撤离需要 ' + (ch.escapeEnergy || 5) + ' 能量</div>';

    if (ch.unlocked) {
      card.onclick = function () { selectChapter(ch.id) };
    } else {
      html += '<div class="lock-icon">🔒</div>';
    }

    card.innerHTML = html;
    grid.appendChild(card);
  });
}

function selectChapter(id) {
  selectedChapter = id;
  GS.chapter = id;
  GS.character = selectedChar;
  // 重置每局游戏的状态
  GS.hp = GS.maxHp = (typeof BALANCE !== 'undefined' && BALANCE.player) ? BALANCE.player.baseHp : 100;
  GS.stars = 0;
  GS.weapons = {};
  GS.weaponAmmo = {};
  GS.curWeapon = null;
  // 默认武器：木棍（无限使用，伤害最低）
  GS.weapons['木棍'] = WEAPONS['木棍'];
  GS.weaponAmmo['木棍'] = Infinity;
  GS.curWeapon = '木棍';
  GS.correct = 0; GS.total = 0;
  GS.weaponCount = 0;
  GS.energy = 0;
  var chData = CHAPTERS.find(function (c) { return c.id === id; });
  GS.energyMax = (chData && chData.escapeEnergy) || 5;
  GS.fragments = 0;
  GS.escaping = false;
  GS.escaped = false;
  GS.gameOver = false;
  GS.running = false;
  GS.skillEnergy = 100;
  GS.skillReady = true;
  GS.skillCooldown = 0;
  GS.skillActive = 0;
  // 重置道具加成
  GS.moveSpeedBonus = 0;
  GS.atkBonus = 0;
  GS.atkSpeedBonus = 0;
  GS.defBonus = 0;
  GS.maxHpBonus = 0;
  GS.killCount = 0;
  GS.level = 1;
  GS.usedQuestions = {};
  GS.downed = false;
  GS._reviveHold = 0;
  GS._reviveTargetId = null;
  GS._reviveGrace = 0;
  GS._invulnTimer = 0;
  GS._allDownSent = false;
  if (typeof showSpectatorHud === 'function') showSpectatorHud(false);
  GS.hasFlashlight = true;   // 默认自带，见上方说明
  document.getElementById('chapter-select').classList.add('hidden');
  // 初始化技能UI
  updateSkillHUD();
  init();
}

// ============================================================
// 返回主菜单
// ============================================================
function backToMainMenu() {
  // 退出游戏回到主菜单（任何状态下都可以退出）
  GS.running = false;
  GS.gameOver = false;
  try { localStorage.removeItem('miracleForest_pending'); } catch (e) { }
  if (typeof isPointerLocked !== 'undefined' && isPointerLocked) {
    try { document.exitPointerLock(); } catch (e) { }
  }
  // Android 壳：优先让壳重新加载。
  // 页面自己的 location.reload() 在 WebView 里配合 no-store 偶发不触发，
  // 表现出来就是"点了退出没反应"。壳端 loadUrl 是确定可靠的。
  if (window.AndroidHost && typeof window.AndroidHost.reloadGame === 'function') {
    try { window.AndroidHost.reloadGame(); return; } catch (e) { }
  }
  location.reload();
}

// ============================================================
// HUD 更新
// ============================================================
function updateHUD() {
  // 计算含道具加成的最大血量
  var maxHp = GS.maxHp + (GS.maxHpBonus || 0) + (GS.levelHpBonus || 0);
  document.getElementById('hp-text').textContent = GS.hp + '/' + maxHp;
  document.getElementById('hp-fill').style.width = Math.max(0, (GS.hp / maxHp * 100)) + '%';
  var deposited = GS.energy || 0;
  var eMax = GS.energyMax || 5;
  document.getElementById('energy-text').textContent = deposited + '/' + eMax;
  document.getElementById('energy-fill').style.width = (deposited / eMax * 100) + '%';
  var subEl = document.getElementById('energy-sub');
  if (subEl) {
    if (GS.escaped) {
      subEl.textContent = '⏳ 已撤离，等待队友…';
    } else if (deposited >= eMax) {
      subEl.textContent = '回飞船起飞！';
    } else {
      subEl.textContent = '碎片 ' + (GS.fragments || 0) + '/2';
    }
    // 联机模式：显示所有玩家能量进度
    if (GS.mode === 'multiplayer' && typeof PeerManager !== 'undefined') {
      var others = getAllOtherPlayerEnergy();
      if (others && others.length > 0) {
        var energyParts = [];
        others.forEach(function (o) {
          energyParts.push(o.name + ': ' + o.energy + '/' + eMax);
        });
        if (energyParts.length > 0) {
          subEl.textContent += ' | ' + energyParts.join(' ');
        }
      }
    }
  }
  // 更新角色等级
  var lvlEl = document.getElementById('level-text');
  if (lvlEl) lvlEl.textContent = 'Lv.' + (GS.level || 1);
  if (GS.monsterMaxHp > 0) {
    document.getElementById('monster-hp-fill').style.width = (GS.monsterHp / GS.monsterMaxHp * 100) + '%';
  }
  updateBuffs();
  // 更新联机玩家列表 HUD
  updateMPPlayerList();
  // 更新连接状态
  updateConnectionStatus();
}

// 获取所有其他玩家的能量进度（联机模式）
function getAllOtherPlayerEnergy() {
  if (typeof PeerManager === 'undefined') return null;
  var result = [];
  for (var pid in PeerManager.players) {
    if (pid !== PeerManager.playerId) {
      var p = PeerManager.players[pid];
      result.push({
        name: p.name || '玩家',
        energy: p.energy || 0,
        fragments: p.fragments || 0,
        isHost: p.isHost || false
      });
    }
  }
  return result.length > 0 ? result : null;
}

// 获取对方的能量进度（联机模式，保留向后兼容）
function getOtherPlayerEnergy() {
  var all = getAllOtherPlayerEnergy();
  if (all && all.length > 0) return all[0];
  return null;
}

// 更新联机玩家列表 HUD
function updateMPPlayerList() {
  if (GS.mode !== 'multiplayer') return;
  var container = document.getElementById('mp-player-list-content');
  var titleEl = document.getElementById('mp-player-list');
  if (!container || !titleEl) return;
  titleEl.classList.remove('hidden');

  container.innerHTML = '';
  var players = PeerManager.getPlayerList();
  var eMax = GS.energyMax || 5;
  players.forEach(function (p) {
    var item = document.createElement('div');
    item.className = 'mp-player-list-item';
    var isSelf = p.id === PeerManager.playerId;
    // 血量按「当前 / 上限」换算成百分比。
    // 旧写法直接把 hp 当百分比用，两个后果：
    //   ① 血量 0（倒地）时 `hp ? hp : GS.hp` 会 fallback 到自己的血量，显示成满血；
    //   ② maxHp 因道具/等级加成超过 100 后，血条宽度会超过 100% 溢出。
    var rec = PeerManager.players[p.id] || null;
    var hp = isSelf ? currentPlayerHp() : (rec && typeof rec.hp === 'number' ? rec.hp : null);
    var maxHp = isSelf
      ? ((GS.maxHp || 100) + (GS.maxHpBonus || 0) + (GS.levelHpBonus || 0))
      : (rec && rec.maxHp ? rec.maxHp : 100);
    var hpPct = (hp === null || !maxHp) ? 100 : Math.max(0, Math.min(100, Math.round(hp / maxHp * 100)));
    var isDown = isSelf ? !!GS.downed : !!(rec && rec.downed);
    var energy = isSelf ? GS.energy : (rec ? rec.energy || 0 : 0);
    var fragments = isSelf ? GS.fragments : (rec ? rec.fragments || 0 : 0);
    item.innerHTML = '<span class="dot online"></span>' +
      '<span class="name">' + (p.isHost ? '👑 ' : '') + (typeof escapeHtml === 'function' ? escapeHtml(p.name || '玩家') : (p.name || '玩家')) + (isSelf ? ' (我)' : '') + '</span>' +
      '<span class="hp-bar-mini"><span class="hp-fill-mini" style="width:' + hpPct + '%' + (isDown ? ';background:#ff6b6b' : '') + '"></span></span>' +
      '<span class="energy-bar-mini">' + (isDown ? '💀 倒地' : '🔋' + energy + '/' + eMax) + '</span>';
    container.appendChild(item);
  });
}

// 更新连接状态指示器
function updateConnectionStatus() {
  var el = document.getElementById('connection-status');
  if (!el) return;
  if (GS.mode !== 'multiplayer') {
    el.classList.add('hidden');
    return;
  }
  el.classList.remove('hidden');
  if (PeerManager.connected) {
    el.className = 'connected';
    el.textContent = '📡';
    el.title = '已连接';
  } else {
    el.className = 'disconnected';
    el.textContent = '📡';
    el.title = '连接断开';
  }
}

// 更新增益状态栏
function updateBuffs() {
  var container = document.getElementById('buff-icons');
  if (!container) return;
  container.innerHTML = '';
  var buffs = [];
  if (GS.moveSpeedBonus > 0) buffs.push({ icon: '👢', count: GS.moveSpeedBonus.toFixed(1), label: '速度+' + GS.moveSpeedBonus.toFixed(1) });
  if (GS.atkBonus > 0) buffs.push({ icon: '💎', count: GS.atkBonus, label: '攻击+' + GS.atkBonus });
  if (GS.atkSpeedBonus > 0) buffs.push({ icon: '⚡', count: '+' + (GS.atkSpeedBonus * 100).toFixed(0) + '%', label: '攻速+' + (GS.atkSpeedBonus * 100).toFixed(0) + '%' });
  if (GS.defBonus > 0) buffs.push({ icon: '🛡️', count: GS.defBonus, label: '防御+' + GS.defBonus });
  if (GS.maxHpBonus > 0) buffs.push({ icon: '❤️', count: GS.maxHpBonus, label: '血量+' + GS.maxHpBonus });
  if (GS.killCount > 0) buffs.push({ icon: '💀', count: GS.killCount, label: '击杀' + GS.killCount });

  buffs.forEach(function (b) {
    var el = document.createElement('div');
    el.className = 'buff-icon';
    el.title = b.label;
    el.innerHTML = b.icon + '<span class="count">' + b.count + '</span>';
    container.appendChild(el);
  });
}

// ============================================================
// 返回/导航按钮兜底接管
//
// 菜单里的返回按钮用的是内联 onclick。一旦出现「全局函数被同名变量覆盖 /
// 脚本加载顺序变化 / 属性被缓存成旧版本」，用户看到的就是"点了没反应"，
// 而且在控制台不一定有报错，极难排查。
//
// 这里在 capture 阶段统一接管：从 onclick 属性里解析出函数名并调用，
// 再阻止事件继续传播，避免内联处理器重复执行一次。
// 解析或查找失败时完全放行，交回原本的内联 onclick。
// ============================================================
document.addEventListener('click', function (e) {
  var el = e.target;
  var btn = (el && el.closest) ? el.closest('.back-btn[onclick]') : null;
  if (!btn) return;

  var attr = btn.getAttribute('onclick') || '';
  // 只接管「纯无参调用」形式（如 onclick="backToCharSelect()"）。
  // 带参数或写得更复杂的表达式一律放行，避免这里传错实参。
  var m = /^\s*([A-Za-z_$][\w$]*)\s*\(\s*\)\s*;?\s*$/.exec(attr);
  if (!m) return;

  var fn = window[m[1]];
  if (typeof fn !== 'function') {
    console.warn('[导航] 找不到处理函数 ' + m[1] + '，放行给内联 onclick');
    return;
  }

  e.preventDefault();
  e.stopPropagation();
  try {
    fn.call(btn);
  } catch (err) {
    console.error('[导航] 执行 ' + m[1] + ' 出错:', err);
  }
}, true);
