// ============================================================
// WeaponBar - Weapon bar UI
// ============================================================

function buildWeaponBar() {
  var bar = document.getElementById('weapon-bar');
  bar.innerHTML = '';
  WEAPON_LIST.forEach(function (name) {
    var w = WEAPONS[name];
    var btn = document.createElement('button');
    btn.className = 'weapon-btn locked';
    btn.innerHTML = '<span class="icon">' + w.icon + '</span>' + name + '<span class="ammo-count"></span>';
    btn.dataset.weapon = name;
    var handler = function (e) { e.preventDefault(); if (GS.weapons[name] && !GS.gameOver) selectWeapon(name); };
    btn.addEventListener('click', handler);
    btn.addEventListener('touchstart', handler, { passive: false });
    bar.appendChild(btn);
  });
  updateWeaponBar();
}

function updateWeaponBar() {
  var btns = document.querySelectorAll('.weapon-btn');
  btns.forEach(function (btn) {
    var n = btn.dataset.weapon;
    var hasWeapon = GS.weapons[n];
    var ammo = GS.weaponAmmo[n] || 0;
    btn.className = 'weapon-btn' + (hasWeapon ? (GS.curWeapon === n ? ' active' : '') : ' locked');
    var ammoSpan = btn.querySelector('.ammo-count');
    if (ammoSpan) {
      // 木棍等无限武器显示∞
      ammoSpan.textContent = hasWeapon ? (isFinite(ammo) ? ' (' + ammo + ')' : ' (∞)') : '';
    }
  });
}

function selectWeapon(name) {
  GS.curWeapon = name;
  updateWeaponBar();
  var ammo = GS.weaponAmmo[name] || 0;
  showMessage('⚔️ 切换 ' + name + (isFinite(ammo) ? ' (' + ammo + '发)' : ' (∞)'), 0x4488ff);
  // 显示/隐藏角色身上的木棍
  if (player && player.userData.stick) {
    var isStick = name === '木棍' || (GS.weapons[name] && GS.weapons[name].type === 'stick');
    player.userData.stick.body.visible = isStick;
    player.userData.stick.knot.visible = isStick;
    player.userData.stick.glow.visible = isStick;
  }
}

// ============================================================
// Backward compatibility
// ============================================================
window.buildWeaponBar = buildWeaponBar;
window.updateWeaponBar = updateWeaponBar;
window.selectWeapon = selectWeapon;
