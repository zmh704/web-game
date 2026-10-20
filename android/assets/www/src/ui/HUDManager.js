// ============================================================
// HUD Manager - All DOM HUD updates
// ============================================================

function updateHUD() {
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
  var lvlEl = document.getElementById('level-text');
  if (lvlEl) lvlEl.textContent = 'Lv.' + (GS.level || 1);
  if (GS.monsterMaxHp > 0) {
    document.getElementById('monster-hp-fill').style.width = (GS.monsterHp / GS.monsterMaxHp * 100) + '%';
  }
  updateBuffs();
  updateMPPlayerList();
  updateConnectionStatus();
}

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

function getOtherPlayerEnergy() {
  var all = getAllOtherPlayerEnergy();
  if (all && all.length > 0) return all[0];
  return null;
}

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
    var hp = isSelf ? GS.hp : (PeerManager.players[p.id] && PeerManager.players[p.id].hp ? PeerManager.players[p.id].hp : GS.hp);
    var energy = isSelf ? GS.energy : (PeerManager.players[p.id] ? PeerManager.players[p.id].energy || 0 : 0);
    var fragments = isSelf ? GS.fragments : (PeerManager.players[p.id] ? PeerManager.players[p.id].fragments || 0 : 0);
    item.innerHTML = '<span class="dot online"></span>' +
      '<span class="name">' + (p.isHost ? '👑 ' : '') + (typeof escapeHtml === 'function' ? escapeHtml(p.name || '玩家') : (p.name || '玩家')) + (isSelf ? ' (我)' : '') + '</span>' +
      '<span class="hp-bar-mini"><span class="hp-fill-mini" style="width:' + Math.max(0, hp) + '%"></span></span>' +
      '<span class="energy-bar-mini">🔋' + energy + '/' + eMax + '</span>';
    container.appendChild(item);
  });
}

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
// Backward compatibility
// ============================================================
if (typeof window !== 'undefined') {
  window.updateHUD = updateHUD;
  window.getAllOtherPlayerEnergy = getAllOtherPlayerEnergy;
  window.getOtherPlayerEnergy = getOtherPlayerEnergy;
  window.updateMPPlayerList = updateMPPlayerList;
  window.updateConnectionStatus = updateConnectionStatus;
  window.updateBuffs = updateBuffs;
}
