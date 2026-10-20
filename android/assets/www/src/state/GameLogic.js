// ============================================================
// Game Logic Helpers
// ============================================================

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
// Backward compatibility
// ============================================================
if (typeof window !== 'undefined') {
  window.getDynamicCaps = getDynamicCaps;
  window.applyLevelBonuses = applyLevelBonuses;
  window.levelUp = levelUp;
  window.gainEnergy = gainEnergy;
  window.gainFragment = gainFragment;
}
