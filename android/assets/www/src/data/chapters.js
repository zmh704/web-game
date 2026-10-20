// ============================================================
// Chapter Data
// ============================================================

export const CHAPTERS = [
    {
        id: 1,
        name: '翠绿森林',
        icon: '🌲',
        color: '#44dd88',
        desc: '探索神秘的翠绿森林，邂逅第一批奇幻生物',
        bgColor: 0x1a2e1a,
        floorColor: 0x2a4a2a,
        wallColor: 0x3a5a3a,
        fogColor: 0x1a2e1a,
        monsters: ['追风怪'],
        bossName: '森林守护者',
        escapeEnergy: 5,
        unlocked: true
    },
    {
        id: 2,
        name: '冰雪峡谷',
        icon: '❄️',
        color: '#44aaff',
        desc: '穿越寒冷的冰雪峡谷，挑战冰晶生物',
        bgColor: 0x1a1e2e,
        floorColor: 0x2a3a4a,
        wallColor: 0x3a4a6a,
        fogColor: 0x1a2e3e,
        monsters: ['冰晶兽', '霜刺虫'],
        bossName: '冰霜巨人',
        escapeEnergy: 8,
        unlocked: false
    },
    {
        id: 3,
        name: '金沙沙漠',
        icon: '🏜️',
        color: '#ffaa44',
        desc: '穿越炽热的金沙沙漠，发现远古金字塔的秘密',
        bgColor: 0x2e2a1a,
        floorColor: 0x4a4a2a,
        wallColor: 0x6a5a3a,
        fogColor: 0x3e2e1a,
        monsters: ['沙暴灵', '沙蝎'],
        bossName: '法老之魂',
        escapeEnergy: 12,
        unlocked: false
    },
    {
        id: 4,
        name: '熔岩火山',
        icon: '🌋',
        color: '#ff4444',
        desc: '深入危险的熔岩火山，面对烈焰中的强敌',
        bgColor: 0x2e1a1a,
        floorColor: 0x4a2a2a,
        wallColor: 0x6a3a3a,
        fogColor: 0x3e1a1a,
        monsters: ['熔岩怪', '火蜥蜴', '烈焰鸟'],
        bossName: '炎魔领主',
        escapeEnergy: 16,
        unlocked: false
    },
    {
        id: 5,
        name: '星空彼岸',
        icon: '🌌',
        color: '#aa44ff',
        desc: '飞向浩瀚的星空彼岸，迎接最终的挑战',
        bgColor: 0x1a1a2e,
        floorColor: 0x2a2a4a,
        wallColor: 0x3a3a6a,
        fogColor: 0x1a1a3e,
        monsters: ['星灵', '虚空兽', '陨石龙'],
        bossName: '虚空主宰',
        escapeEnergy: 20,
        unlocked: false
    }
];

// ============================================================
// Backward compatibility
// ============================================================
if (typeof window !== 'undefined') {
  window.CHAPTERS = CHAPTERS;
}
