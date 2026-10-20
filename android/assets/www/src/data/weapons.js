// ============================================================
// Weapon Data
// ============================================================

export const WEAPONS = {
    '木棍': { dmg: 45, color: 0x9a6b3f, icon: '🪵', desc: '默认·近战敲打怪物，可无限使用，需近身冒险', type: 'stick', speed: 0, size: 0.15, infinite: true },
    '捆仙绳': { dmg: 0, color: 0xffcc44, icon: '🪢', desc: '神器·精准束缚视线内怪物3秒(一次性)', type: 'rope', speed: 0, size: 0.2 },
    '几何能量珠': { dmg: 35, color: 0x00ff88, icon: '🔮', desc: '数学·翠绿光弹', type: 'orb', speed: 15, size: 0.18, pulse: true },
    '字母连发弓': { dmg: 30, color: 0x4488ff, icon: '🏹', desc: '英语·蓝光箭矢', type: 'arrow', speed: 20, size: 0.15, trail: true }
};

export const WEAPON_LIST = ['木棍', '捆仙绳', '几何能量珠', '字母连发弓'];
// 可通过道具/答题获得的武器（木棍为默认武器，不在奖励池中）
export const REWARD_WEAPON_LIST = ['捆仙绳', '几何能量珠', '字母连发弓'];

// ============================================================
// Backward compatibility
// ============================================================
if (typeof window !== 'undefined') {
  window.WEAPONS = WEAPONS;
  window.WEAPON_LIST = WEAPON_LIST;
  window.REWARD_WEAPON_LIST = REWARD_WEAPON_LIST;
}
