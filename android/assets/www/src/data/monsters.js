// ============================================================
// Monster Type Data
// ============================================================

export const MONSTER_TYPES = {
    '追风怪': { color: 0xaa2244, emissive: 0xcc1144, eyes: 6, speed: 2.8, hp: 320, dmg: 10, scale: 1.1, spikes: true, fangs: true },
    '冰晶兽': { color: 0x4488aa, emissive: 0x2266cc, eyes: 4, speed: 2.3, hp: 360, dmg: 12, scale: 1.2, spikes: true, fangs: true },
    '霜刺虫': { color: 0x553366, emissive: 0x8844aa, eyes: 8, speed: 3.5, hp: 280, dmg: 8, scale: 0.7, spikes: true },
    '沙暴灵': { color: 0x663322, emissive: 0xaa4422, eyes: 3, speed: 3.0, hp: 340, dmg: 12, scale: 1, fangs: true },
    '沙蝎': { color: 0x442211, emissive: 0x883311, eyes: 6, speed: 3.8, hp: 300, dmg: 14, scale: 0.8, spikes: true },
    '熔岩怪': { color: 0x881100, emissive: 0xff3300, eyes: 4, speed: 2.5, hp: 400, dmg: 15, scale: 1.15, spikes: true, fangs: true },
    '火蜥蜴': { color: 0x992200, emissive: 0xcc3300, eyes: 4, speed: 4.0, hp: 300, dmg: 10, scale: 0.85, fangs: true },
    '烈焰鸟': { color: 0x661100, emissive: 0xcc4400, eyes: 4, speed: 4.4, hp: 260, dmg: 9, scale: 0.65, fly: true, fangs: true },
    '星灵': { color: 0x442266, emissive: 0x8844dd, eyes: 5, speed: 3.2, hp: 340, dmg: 13, scale: 0.9, fly: true },
    '虚空兽': { color: 0x1a0a33, emissive: 0x440099, eyes: 7, speed: 2.8, hp: 420, dmg: 16, scale: 1.3, spikes: true, fangs: true },
    '陨石龙': { color: 0x331144, emissive: 0x6622cc, eyes: 4, speed: 3.6, hp: 380, dmg: 14, scale: 1.1, spikes: true, fangs: true },
    // 新增远程攻击怪物
    '暗影射手': { color: 0x220044, emissive: 0x6600aa, eyes: 4, speed: 1.8, hp: 280, dmg: 8, scale: 0.9, ranged: true, rangedCooldown: 2.0, fangs: true },
    '毒液喷射者': { color: 0x224400, emissive: 0x44aa00, eyes: 6, speed: 1.5, hp: 260, dmg: 7, scale: 0.8, ranged: true, rangedCooldown: 1.8, fangs: true },
    // 新增快速扑击怪物
    '影狼': { color: 0x111122, emissive: 0x4444aa, eyes: 4, speed: 4.5, hp: 260, dmg: 12, scale: 0.7, charge: true, fangs: true, spikes: true },
    '突袭者': { color: 0x331111, emissive: 0xaa2222, eyes: 2, speed: 5.0, hp: 240, dmg: 15, scale: 0.6, charge: true, fangs: true },
    // 抓捕者（巡逻+快速抓捕+持续扣血）
    '追捕者': { color: 0x111133, emissive: 0x4444ff, eyes: 6, speed: 3.0, hp: 500, dmg: 5, scale: 0.9, spikes: true, fangs: true, chaser: true, chaseSpeed: 7.0 }
};

export const BOSSES = {
    1: { name: '森林守护者', color: 0x116611, emissive: 0x119933, eyes: 4, speed: 2.2, hp: 800, dmg: 34, scale: 2.2, spikes: true, fangs: true },
    2: { name: '冰霜巨人', color: 0x224477, emissive: 0x3399ff, eyes: 3, speed: 2.0, hp: 850, dmg: 36, scale: 2.4, spikes: true, fangs: true },
    3: { name: '法老之魂', color: 0x664411, emissive: 0xcc8822, eyes: 2, speed: 2.4, hp: 900, dmg: 38, scale: 2.2, fangs: true },
    4: { name: '炎魔领主', color: 0x771100, emissive: 0xcc2200, eyes: 4, speed: 2.6, hp: 950, dmg: 40, scale: 2.5, spikes: true, fangs: true },
    5: { name: '虚空主宰', color: 0x330066, emissive: 0x6600cc, eyes: 8, speed: 2.8, hp: 1000, dmg: 42, scale: 2.7, spikes: true, fangs: true }
};

// ============================================================
// Backward compatibility
// ============================================================
if (typeof window !== 'undefined') {
  window.MONSTER_TYPES = MONSTER_TYPES;
  window.BOSSES = BOSSES;
}
