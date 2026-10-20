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

  // 蹬地那一下的初速度先衰减掉，再交给爬升/下沉控制
  if (playerVelY > 0) {
    y += playerVelY * delta;
    playerVelY = Math.max(0, playerVelY - 9 * delta);
  } else if (isJumpHeld()) {
    y = Math.min(FLIGHT_MAX_Y, y + FLIGHT_RISE * delta);
  } else {
    y = Math.max(FLIGHT_MIN_Y, y - FLIGHT_SINK * delta);
  }

  player.position.y = y;
  playerVelY = 0;
}

function updateJump(delta) {
  if (GS._flying) { updateFlight(delta); return; }
  if (!GS.isJumping && GS.canJump) return;
  playerVelY += gravity * delta;
  player.position.y += playerVelY * delta;
  if (player.position.y <= groundY) {
    player.position.y = groundY;
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
