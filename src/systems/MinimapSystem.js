// ============================================================
// MinimapSystem - Minimap rendering
// ============================================================

// 小地图刷新节流（毫秒）。小地图信息变化很慢，60fps 重绘纯属浪费：
// 每帧都要 clearRect + 十几个绘制调用 + canvas 纹理上传。
var MINIMAP_INTERVAL_MS = 100;   // 10fps
var _lastMinimapAt = 0;

function updateMinimap() {
  var now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  if (now - _lastMinimapAt < MINIMAP_INTERVAL_MS) return;
  _lastMinimapAt = now;

  var canvas = document.getElementById('minimap-canvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  // 绘制逻辑始终在 120×120 的坐标系里（下面所有坐标都按它写死），
  // 但画布真实分辨率是 240×240 —— 用一次 setTransform 把逻辑坐标放大到画布像素，
  // 这样小地图显示尺寸变大后不会糊，下面的绘制代码一行都不用改。
  var w = 120, h = 120;
  ctx.setTransform(canvas.width / w, 0, 0, canvas.height / h, 0, 0);
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, w, h);

  var minX = -halfRoom - 20, minZ = -halfRoom - 20;
  var totalX = (halfRoom + 20) * 2, totalZ = (halfRoom + 20) * 2;
  var scale = Math.min(w / totalX, h / totalZ) * 0.9;
  var ox = w / 2, oz = h / 2;
  var H = halfRoom;

  ROOMS.forEach(function (rm) {
    var rx = ox + rm.cx * scale, rz = oz + rm.cz * scale;
    ctx.strokeStyle = 'rgba(200,180,160,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(rx - H * scale, rz - H * scale, roomSize * scale, roomSize * scale);
    if (rm.cx === 0 && rm.cz === 0) {
      ctx.fillStyle = 'rgba(255,215,0,0.08)';
      ctx.fillRect(rx - H * scale, rz - H * scale, roomSize * scale, roomSize * scale);
    }
    ctx.fillStyle = 'rgba(200,200,200,0.2)';
    ctx.font = '8px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(rm.name, rx, rz + 2);
  });

  // 画门（绿色小方块表示门洞）
  var G = DOOR_HALF;
  ctx.fillStyle = 'rgba(100,200,100,0.35)';
  DOOR_POSITIONS.forEach(function (dp) {
    var dx = dp[0], dz = dp[1];
    var isVertical = (dx === -H || dx === H);
    if (isVertical) {
      ctx.fillRect(ox + dx * scale - 2, oz + dz * scale - G * scale, 4, G * 2 * scale);
    } else {
      ctx.fillRect(ox + dx * scale - G * scale, oz + dz * scale - 2, G * 2 * scale, 4);
    }
  });

  if (ship) {
    var sx = ox + ship.position.x * scale, sz = oz + ship.position.z * scale;
    var shipReady = GS.energy >= (GS.energyMax || 5);
    var sc = shipReady ? '#66ffcc' : '#99aabb';
    // 火箭形状：机身 + 尖头 + 两侧尾翼 + 尾焰
    ctx.save();
    ctx.translate(sx, sz);
    ctx.fillStyle = sc;
    // 机身
    ctx.beginPath();
    ctx.moveTo(0, -9);          // 尖头
    ctx.quadraticCurveTo(4.5, -3, 3.5, 4);
    ctx.lineTo(-3.5, 4);
    ctx.quadraticCurveTo(-4.5, -3, 0, -9);
    ctx.closePath(); ctx.fill();
    // 尾翼
    ctx.beginPath();
    ctx.moveTo(3.5, 0); ctx.lineTo(7, 6); ctx.lineTo(3.5, 5); ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-3.5, 0); ctx.lineTo(-7, 6); ctx.lineTo(-3.5, 5); ctx.closePath(); ctx.fill();
    // 舷窗
    ctx.fillStyle = 'rgba(20,40,60,0.9)';
    ctx.beginPath(); ctx.arc(0, -2, 1.8, 0, Math.PI * 2); ctx.fill();
    // 尾焰（能量集满时闪烁）
    if (shipReady) {
      ctx.fillStyle = 'rgba(255,170,60,0.9)';
      ctx.beginPath();
      ctx.moveTo(-2, 5); ctx.lineTo(0, 9 + Math.sin(clock.elapsedTime * 8) * 1.5); ctx.lineTo(2, 5);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  if (energyOrb && energyOrb.parent) {
    var ex = ox + energyOrb.position.x * scale, ez = oz + energyOrb.position.z * scale;
    // 金色宝箱：大号闪烁金色标记
    var pulseSize = 4 + Math.sin(clock.elapsedTime * 4) * 1.5;
    ctx.fillStyle = '#ffd700';
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.arc(ex, ez, pulseSize, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,215,0,0.6)';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(ex, ez, 7, 0, Math.PI * 2); ctx.stroke();
    // 宝箱图标：小十字 + 圆点
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 7px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🎁', ex, ez);
  }

  // 小地图不显示怪物位置

  // 小地图显示怪物位置（联机模式加入者端显示同步的怪物）
  if (GS.mode === 'multiplayer' && !GS.isHost) {
    // 显示小怪（红色点）
    if (typeof monsters !== 'undefined') {
      for (var mi = 0; mi < monsters.length; mi++) {
        var mm = monsters[mi];
        if (mm && mm.userData && mm.userData.active && mm.parent) {
          var mmx = ox + mm.position.x * scale, mmz = oz + mm.position.z * scale;
          ctx.fillStyle = 'rgba(255,50,50,0.6)';
          ctx.beginPath(); ctx.arc(mmx, mmz, 2, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
    // 显示Boss（紫色大点）
    if (typeof bosses !== 'undefined') {
      for (var bi = 0; bi < bosses.length; bi++) {
        var bb = bosses[bi];
        if (bb && bb.userData && bb.userData.active && bb.parent) {
          var bbx = ox + bb.position.x * scale, bbz = oz + bb.position.z * scale;
          ctx.fillStyle = 'rgba(180,50,255,0.8)';
          ctx.beginPath(); ctx.arc(bbx, bbz, 3.5, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = 'rgba(180,50,255,0.4)';
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(bbx, bbz, 5, 0, Math.PI * 2); ctx.stroke();
        }
      }
    }
    // 显示追捕者（白色闪烁点）
    if (typeof chaserMonster !== 'undefined' && chaserMonster && chaserMonster.parent) {
      var cx2 = ox + chaserMonster.position.x * scale, cz2 = oz + chaserMonster.position.z * scale;
      var pulse2 = 2 + Math.sin(clock.elapsedTime * 4) * 0.5;
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath(); ctx.arc(cx2, cz2, pulse2, 0, Math.PI * 2); ctx.fill();
    }
  } else if (GS.mode !== 'multiplayer') {
    // 单机模式：显示怪物位置（原有逻辑保留）
  }

  var cx = ox + player.position.x * scale, cz = oz + player.position.z * scale;
  ctx.fillStyle = '#44ff88';
  ctx.beginPath(); ctx.arc(cx, cz, 3.5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#44ff88';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(cx, cz);
  ctx.lineTo(cx + Math.sin(player.rotation.y) * 9, cz + Math.cos(player.rotation.y) * 9);
  ctx.stroke();

  // 联机模式：显示远程玩家位置
  if (GS.mode === 'multiplayer' && typeof SyncManager !== 'undefined') {
    for (var rpid in SyncManager.remotePlayers) {
      var rp = SyncManager.remotePlayers[rpid];
      if (rp && rp.state) {
        var rx = ox + rp.state.x * scale, rz = oz + rp.state.z * scale;
        ctx.fillStyle = '#66ccff';
        ctx.beginPath(); ctx.arc(rx, rz, 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(102,204,255,0.5)';
        ctx.font = '6px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(rp.playerName || '玩家', rx, rz - 5);
      }
    }
  }

  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(2, 2, 50, 8);
  var miniMax = GS.energyMax || 5;
  ctx.fillStyle = '#66ffcc';
  ctx.fillRect(3, 3, (GS.energy / miniMax) * 44, 6);
  ctx.fillStyle = 'rgba(200,240,220,0.5)';
  ctx.font = '7px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('🔋' + GS.energy + '/' + miniMax, 4, 9);
}

// ============================================================
// Backward compatibility
// ============================================================
window.updateMinimap = updateMinimap;
