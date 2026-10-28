// ============================================================
// JumpSystem - Jump physics
// ============================================================

function tryJump() {
  if (GS.gameOver || !GS.running) return;
  if (!GS.canJump) return;
  GS.canJump = false;
  playerVelY = 5.5;
  GS.isJumping = true;
}

// ============================================================
// 飞行（爸爸的技能）
//
// 和跳跃走同一套 y 轴逻辑，所以直接挂在 updateJump 里分流：
// 飞行期间彻底绕开重力，改由 updateFlight 自己控高度。
// ============================================================
var FLIGHT_MIN_Y = 2.6;   // 松开跳跃键时的最低悬停高度
var FLIGHT_MAX_Y = 7.0;   // 一直按住能爬到的最高高度
var FLIGHT_RISE = 5.2;    // 按住时的爬升速度 (m/s)
var FLIGHT_SINK = 1.7;    // 松开后缓慢下沉速度 (m/s)

function isJumpHeld() {
  return (typeof keys !== 'undefined') && !!keys[' '];
}

function startFlight() {
  GS._flying = true;
  // 置 isJumping 有两个作用：① 压掉走路动画（updatePlayerAnimation 里判 !GS.isJumping）
  // ② 保证落地判定后面能走重力分支
  GS.isJumping = true;
  GS.canJump = false;
  // 从地面起飞时给一下蹬地的初速度，手感上不像被"吸"上去
  playerVelY = (player && player.position.y <= groundY + 0.05) ? 6.4 : 0;
}

function endFlight() {
  GS._flying = false;
  playerVelY = 0;        // 交给 updateJump 的重力自由落体，不要瞬移回地面
  GS.isJumping = true;   // 否则 updateJump 开头会直接 return，人卡在半空
}

function updateFlight(delta) {
  if (!player) return;
  var y = player.position.y;

  // 医院是室内：飞行不能把头顶顶穿楼板。
  // 而且 floorYAt 是按"当前高度"区分楼层/屋顶的 —— 一旦飞过 ROOF-0.9
  // 就会被判定成"在屋顶上"，人被瞬间吸到楼上。所以室内把上限压低，
  // 屋顶（开阔天空）则放开。
  var maxY = FLIGHT_MAX_Y;
  var minY = FLIGHT_MIN_Y;
  if (typeof HMAP !== 'undefined' && HMAP && HMAP.active) {
    var onRoof = y > HMAP.ROOF - 0.9;
    if (onRoof) {
      minY = HMAP.ROOF + 0.6;
      maxY = HMAP.ROOF + 4.6;
    } else {
      minY = 0.8;
      maxY = HMAP.WH - 0.6;    // 别超过 2.8，否则会被判成屋顶层
    }
  }

  // 蹬地那一下的初速度先衰减掉，再交给爬升/下沉控制
  if (playerVelY > 0) {
    y += playerVelY * delta;
    playerVelY = Math.max(0, playerVelY - 9 * delta);
  } else if (isJumpHeld()) {
    y = Math.min(maxY, y + FLIGHT_RISE * delta);
  } else {
    y = Math.max(minY, y - FLIGHT_SINK * delta);
  }

  player.position.y = Math.max(minY, Math.min(maxY, y));
  playerVelY = 0;
}

function updateJump(delta) {
  if (GS._flying) { updateFlight(delta); return; }
  if (!GS.isJumping && GS.canJump) return;
  playerVelY += gravity * delta;
  player.position.y += playerVelY * delta;

  // 落地高度不再是常量 groundY：医院有楼梯和屋顶，
  // floorYAt() 会按当前位置给出真实地面（斜坡 / 一层 / 屋顶）。
  var fy = (typeof floorYAt === 'function')
    ? floorYAt(player.position.x, player.position.z, player.position.y)
    : groundY;

  if (player.position.y <= fy) {
    player.position.y = fy;
    playerVelY = 0;
    GS.isJumping = false;
    GS.canJump = true;
  }
  for (var i = 0; i < furniture.length; i++) {
    var f = furniture[i];
    var dx = player.position.x - f.position.x;
    var dz = player.position.z - f.position.z;
    var dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 1.2 && playerVelY < 0) {
      var topY = f.position.y;
      f.children.forEach(function (child) {
        var box = child.geometry;
        if (box && box.parameters) {
          var h = box.parameters.height || box.parameters.radius || 0;
          if (child.position.y + h / 2 > topY) topY = child.position.y + h / 2;
        }
      });
      var platformY = f.position.y + topY || f.position.y + 0.6;
      if (player.position.y <= platformY + 0.1 && player.position.y >= platformY - 0.5) {
        player.position.y = platformY + 0.01;
        playerVelY = 0;
        GS.isJumping = false;
        GS.canJump = true;
      }
    }
  }
}

// ============================================================
// Backward compatibility
// ============================================================
window.tryJump = tryJump;
window.updateJump = updateJump;
window.startFlight = startFlight;
window.endFlight = endFlight;
window.updateFlight = updateFlight;
