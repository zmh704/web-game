// ============================================================
// Item Type Data
// ============================================================

export const ITEM_TYPES = [
  {
    id: 'hpPotion', name: '生命药水', icon: '❤️', color: 0xff4488,
    desc: '恢复30点生命值',
    apply: function () {
      var maxHp = GS.maxHp + (GS.maxHpBonus || 0);
      GS.hp = Math.min(maxHp, GS.hp + 30);
      showMessage('❤️ 生命药水! 恢复30点生命', 0xff4488);
    }
  },
  {
    id: 'speedBoots', name: '急速之靴', icon: '👢', color: 0x44ddff,
    desc: '移动速度+1.5',
    apply: function () {
      GS.moveSpeedBonus = (GS.moveSpeedBonus || 0) + 1.5;
      showMessage('👢 急速之靴! 速度+' + GS.moveSpeedBonus.toFixed(1), 0x44ddff);
    }
  },
  {
    id: 'weapon', name: '武器', icon: '⚔️', color: 0xff8800,
    desc: '随机获得一把新武器（20发子弹，捆仙绳仅1次）',
    apply: function () {
      var lockedW = REWARD_WEAPON_LIST.filter(function (n) { return !GS.weapons[n] });
      if (lockedW.length > 0) {
        var wn = lockedW[Math.floor(Math.random() * lockedW.length)];
        GS.weapons[wn] = WEAPONS[wn];
        GS.weaponAmmo[wn] = WEAPONS[wn].type === 'rope' ? 1 : 20; // 捆仙绳一次性
        GS.weaponCount++;
        if (!GS.curWeapon) GS.curWeapon = wn;
        updateWeaponBar();
        showMessage('⚔️ 获得武器: ' + wn + (WEAPONS[wn].type === 'rope' ? ' (1次)' : ' (20发)'), 0xff8800);
        createWeaponGetEffect();
      } else {
        // 已拥有全部武器，捡到重置子弹
        var ownedW = REWARD_WEAPON_LIST.filter(function (n) { return GS.weapons[n] });
        if (ownedW.length > 0) {
          var wn = ownedW[Math.floor(Math.random() * ownedW.length)];
          GS.weaponAmmo[wn] = WEAPONS[wn].type === 'rope' ? 1 : 20;
          GS.curWeapon = wn;
          updateWeaponBar();
          showMessage('⚔️ 弹药重置: ' + wn, 0xff8800);
        } else {
          GS.stars += 20;
          showMessage('⭐ +20星', 0xffd700);
        }
      }
    }
  },
  {
    id: 'atkGem', name: '攻击宝石', icon: '💎', color: 0xff3333,
    desc: '攻击力+10，攻击速度提升',
    apply: function () {
      GS.atkBonus = (GS.atkBonus || 0) + 10;
      GS.atkSpeedBonus = (GS.atkSpeedBonus || 0) + 0.05;
      showMessage('💎 攻击宝石! 攻击力+10, 攻速提升', 0xff3333);
    }
  },
  {
    id: 'defGem', name: '防御宝石', icon: '🛡️', color: 0x4488ff,
    desc: '血量上限+20，防御+5',
    apply: function () {
      GS.maxHpBonus = (GS.maxHpBonus || 0) + 20;
      GS.defBonus = (GS.defBonus || 0) + 5;
      showMessage('🛡️ 防御宝石! 血量上限+20, 防御+5', 0x4488ff);
    }
  },
  {
    id: 'chest', name: '普通宝盒', icon: '🎁', color: 0xaa77ff,
    desc: '答题解锁：随机1-3个能量碎片+1件武器',
    isChest: true,
    apply: function () { } // 宝盒不即时生效，走答题流程
  },
  {
    id: 'flashlight', name: '手电筒', icon: '🔦', color: 0xffff44,
    desc: '开启手电筒增加视线距离',
    apply: function () {
      GS.hasFlashlight = true;
      showMessage('🔦 获得手电筒! 按F开启', 0xffff44);
      if (!flashlightActive && flashlightCooldown <= 0) {
        toggleFlashlight();
      }
    }
  },
  {
    id: 'fragment', name: '能量碎片', icon: '💠', color: 0xffd700,
    desc: '获得1个能量碎片（2个合成1点能量）',
    apply: function () {
      gainFragment();
      showMessage('💠 获得能量碎片! (' + (GS.fragments || 0) + '/2)', 0xffd700);
    }
  }
];

// ============================================================
// Backward compatibility
// ============================================================
if (typeof window !== 'undefined') {
  window.ITEM_TYPES = ITEM_TYPES;
}
