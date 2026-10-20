// ============================================================
// 游戏状态
// ============================================================
var GS = {
  hp: 100, maxHp: 100,
  stars: 0,
  totalStars: 0,
  weapons: {},
  curWeapon: null,
  correct: 0, total: 0,
  difficulty: 'easy',
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
  fragments: 0,        // 能量碎片(击杀小怪掉落，2个合成1点能量)
  escaping: false,
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
  hasFlashlight: false,      // 是否拥有手电筒
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
  var ch = GS.chapter || 1;
  var boss = BOSSES[ch];
  if (!boss) {
    return { atkCap: 30, defCap: 15, speedCap: 3, atkSpeedCap: 0.1 };
  }
  return {
    // 攻击加成上限 = boss伤害的50%（最低10）
    atkCap: Math.max(10, Math.ceil(boss.dmg * 0.5)),
    // 防御加成上限 = boss伤害的30%（最低5）
    defCap: Math.max(5, Math.ceil(boss.dmg * 0.3)),
    // 速度加成上限 = 1 + boss速度（最低2）
    speedCap: Math.max(2, 1 + Math.ceil(boss.speed)),
    // 攻速加成上限（固定）
    atkSpeedCap: 0.1
  };
}

// ============================================================
// 角色等级系统
// ============================================================
function applyLevelBonuses() {
  var lvl = GS.level || 1;
  GS.levelHpBonus = (lvl - 1) * 10;        // 每级+10最大生命
  GS.levelAtkBonus = (lvl - 1) * 2;        // 每级+2攻击力
  GS.levelDefBonus = (lvl - 1) * 1;        // 每级+1防御
  GS.levelSpeedBonus = (lvl - 1) * 0.3;    // 每级+0.3速度
}

function levelUp() {
  GS.level = (GS.level || 1) + 1;
  applyLevelBonuses();
  // 升级时回血
  var maxHp = GS.maxHp + (GS.maxHpBonus || 0) + (GS.levelHpBonus || 0);
  GS.hp = Math.min(maxHp, GS.hp + 20);
  showMessage('🎉 升级! 当前Lv.' + GS.level + ' 全属性提升!', 0xffd700);
  AudioMgr.playSkill();
  updateHUD();
}

// ============================================================
// 能量系统 - 统一入口
// 两条获取路线：1.答对题+1能量  2.打怪(小怪掉碎片/Boss直接+1)
// 能量集满5点后回到中央飞船即可逃离通关
// ============================================================
function gainEnergy(n) {
  if (GS.gameOver) return;
  n = n || 1;
  var max = GS.energyMax || 5;
  for (var i = 0; i < n && GS.energy < max; i++) {
    GS.energy++;
    levelUp(); // 每获得1点能量升1级，两条路线成长一致
  }
  updateHUD();
  if (GS.energy >= max) {
    showMessage('🚀 能量集满! 快回飞船起飞!', 0x66ffcc);
    // 能量已满，移除场上的金色宝箱
    if (typeof energyOrb !== 'undefined' && energyOrb) {
      try { scene.remove(energyOrb); } catch (e) { }
      energyOrb = null;
    }
  } else {
    showMessage('🔋 能量+1 (' + GS.energy + '/' + max + ')', 0x66ffcc);
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
var selectedDiff = 'easy';
var selectedChapter = 1;

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
  GS.hp = GS.maxHp = 100;
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
  GS.hasFlashlight = false;
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
    if (deposited >= eMax) {
      subEl.textContent = '🚀 回飞船起飞!';
    } else {
      subEl.textContent = '🔹 碎片: ' + (GS.fragments || 0) + '/2';
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
    // 使用玩家实际HP：自己有 GS.hp，远程玩家从 PeerManager.players 读取
    var hp = isSelf ? GS.hp : (PeerManager.players[p.id] && PeerManager.players[p.id].hp ? PeerManager.players[p.id].hp : GS.hp);
    // 读取玩家能量
    var energy = isSelf ? GS.energy : (PeerManager.players[p.id] ? PeerManager.players[p.id].energy || 0 : 0);
    var fragments = isSelf ? GS.fragments : (PeerManager.players[p.id] ? PeerManager.players[p.id].fragments || 0 : 0);
    item.innerHTML = '<span class="dot online"></span>' +
      '<span class="name">' + (p.isHost ? '👑 ' : '') + (typeof escapeHtml === 'function' ? escapeHtml(p.name || '玩家') : (p.name || '玩家')) + (isSelf ? ' (我)' : '') + '</span>' +
      '<span class="hp-bar-mini"><span class="hp-fill-mini" style="width:' + Math.max(0, hp) + '%"></span></span>' +
      '<span class="energy-bar-mini">🔋' + energy + '/' + eMax + '</span>';
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