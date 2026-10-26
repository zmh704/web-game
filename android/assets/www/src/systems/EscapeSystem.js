// ============================================================
// EscapeSystem - Escape animation
//
// 撤离是**每人各走各的**：谁自己跑到飞船边、且能量集满，谁就起飞。
//
// 两种表现：
//   · 常规（单人 / 加入者 / 最后一个撤离的人）——**整艘飞船拔地而起**，
//     角色站在船上一起升空，尾焰 + 光环渐隐 + 镜头后拉。这是玩家记得的"坐飞船逃跑"。
//   · 主机先撤、队友还在场 —— 飞船必须留在原地（否则主机的观战视角里
//     队友没船可坐了），改成角色升空登船 + 飞船引擎原地爆闪。
// ============================================================

function startEscape() {
  if (GS.escaping || GS.escaped) return;

  // 主机自己先走、但队友还在场：不能停世界（否则队友端直接冻住），
  // 转成"观战等待"，等队友都撤了 / 都倒了再结算。
  var othersLeft = (typeof hasOtherActivePlayers === 'function') ? hasOtherActivePlayers() : false;
  var hostWaiting = (GS.mode === 'multiplayer' && GS.isHost && othersLeft);

  GS.escaping = true;
  if (!hostWaiting) GS.running = false;

  showMessage(hostWaiting ? '🚀 你已撤离，等待队友…' : '🚀 能量集满! 引擎启动!', 0x66ffcc);
  if (typeof AudioMgr !== 'undefined' && AudioMgr.playSkill) AudioMgr.playSkill();

  // 起飞主体：有人留下时是"自己升空"，否则是"整艘飞船升空"
  var flyShip = !hostWaiting && typeof ship !== 'undefined' && !!ship && !!ship.parent;
  var shipStart = (typeof ship !== 'undefined' && ship && ship.position) ? ship.position.clone() : null;

  // 常规起飞：把角色放到船上（和旧版一致，看起来是"人站在船上被带走"）
  if (flyShip && player) {
    player.position.x = ship.position.x;
    player.position.z = ship.position.z;
    player.position.y = ship.position.y + 1.0;
  }

  var me = player;
  var startY = me ? me.position.y : 0;
  var phase = 0;

  var si = setInterval(function () {
    phase += 0.02;

    if (flyShip) {
      // ---------- 整艘飞船拔地而起 ----------
      ship.position.y += phase * 1.2;
      ship.rotation.x += 0.02;
      ship.position.x += Math.sin(phase * 4) * 0.05;

      // 光环：不直接淡到 0，改成亮青色脉冲 —— 夜里船体本来就偏暗，
      // 光环彻底消失后屏幕上只剩一坨黑影，"飞船升空"根本看不出来。
      var ring = ship.userData && ship.userData.ring;
      if (ring && ring.material) {
        ring.material.color.setHex(0x66ffcc);
        ring.material.opacity = 0.35 + Math.abs(Math.sin(phase * 9)) * 0.45;
        ring.rotation.z += 0.22;
      }

      // 角色贴着船一起升空
      if (me && me.parent) {
        me.position.x = ship.position.x;
        me.position.z = ship.position.z;
        me.position.y = ship.position.y + 1.0;
        me.rotation.y += 0.05;
      }

      // 引擎尾焰：从船底往下喷
      if (typeof scene !== 'undefined' && typeof projectiles !== 'undefined' && shipStart) {
        for (var pi = 0; pi < 3; pi++) {
          var pp = new THREE.Mesh(
            new THREE.SphereGeometry(0.04, 4, 4),
            new THREE.MeshBasicMaterial({
              color: [0xff6600, 0xffaa00, 0xff4400][pi],
              transparent: true, opacity: 0.8
            })
          );
          pp.position.set(
            shipStart.x + (Math.random() - 0.5) * 0.4,
            ship.position.y - 0.5,
            shipStart.z + (Math.random() - 0.5) * 0.4
          );
          pp.userData = {
            vel: new THREE.Vector3((Math.random() - 0.5) * 0.5, -2 - Math.random() * 2, (Math.random() - 0.5) * 0.5),
            life: 0.8, fade: true
          };
          scene.add(pp); projectiles.push(pp);
        }
      }

      // 镜头后拉仰拍，把"飞船升空"完整收进画面。
      // 旧机位只退到 z+9：飞船本身就有四五米宽，一贴身整个屏幕都是船壳，
      // 看起来像"镜头糊在船身上"，根本看不出船在上升。退到 z+18、抬高到
      // 船顶上方，才能同时看到船体、站在船上的角色和背后的天空。
      if (typeof camera !== 'undefined' && camera) {
        // 机位：站在地面斜后方仰望，让飞船"从画面里往上冲出去"。
        // 距离 12 米、机位比飞船低 1.5 米 —— 太近整屏都是船壳，太远船又变成一个小点。
        camera.position.lerp(
          new THREE.Vector3(ship.position.x, ship.position.y - 1.5, shipStart.z + 12),
          0.14
        );
        camera.lookAt(ship.position.x, ship.position.y + 2.2, ship.position.z);
      }

      if (ship.position.y > 15) {
        clearInterval(si);
        if (me && me.parent) scene.remove(me);
        if (ship && ship.parent) scene.remove(ship);
        finishEscape(hostWaiting);
      }
      return;
    }

    // ---------- 主机先撤离、飞船必须留在原地：角色升空登船 ----------
    if (!me || !me.parent) {
      clearInterval(si);
      finishEscape(hostWaiting);
      return;
    }

    me.position.y += 0.18 + phase * 0.9;
    me.rotation.y += 0.06;

    // 飞船引擎原地爆闪（表示"能量正被这台船吸走"）
    if (typeof ship !== 'undefined' && ship && ship.userData && ship.userData.ring && ship.userData.ring.material) {
      var _ring = ship.userData.ring;
      _ring.material.color.setHex(0x66ffcc);
      _ring.material.opacity = 0.35 + Math.abs(Math.sin(phase * 9)) * 0.45;
      _ring.rotation.z += 0.25;
    }

    // 脚下的推进器尾焰
    if (typeof scene !== 'undefined' && typeof projectiles !== 'undefined' && Math.random() < 0.6) {
      var pp2 = new THREE.Mesh(
        new THREE.SphereGeometry(0.045, 4, 4),
        new THREE.MeshBasicMaterial({
          color: [0xff6600, 0xffaa00, 0xff4400][Math.floor(Math.random() * 3)],
          transparent: true, opacity: 0.85
        })
      );
      pp2.position.set(
        me.position.x + (Math.random() - 0.5) * 0.35,
        me.position.y - 0.7,
        me.position.z + (Math.random() - 0.5) * 0.35
      );
      pp2.userData = {
        vel: new THREE.Vector3((Math.random() - 0.5) * 0.4, -1.8 - Math.random() * 1.5, (Math.random() - 0.5) * 0.4),
        life: 0.8, fade: true
      };
      scene.add(pp2); projectiles.push(pp2);
    }

    // 镜头跟着自己上升（update() 已经停了，这里手动接管）
    if (typeof camera !== 'undefined' && camera) {
      var _focus = new THREE.Vector3(me.position.x, me.position.y + 1.6, me.position.z);
      camera.position.lerp(new THREE.Vector3(me.position.x, me.position.y + 3.2, me.position.z + 6.5), 0.1);
      camera.lookAt(_focus);
    }

    if (me.position.y - startY > 13) {
      clearInterval(si);
      if (me.parent) scene.remove(me);
      finishEscape(hostWaiting);
    }
  }, 30);
}

// 起飞结束：要么本局结束（单人 / 最后一个人），要么进入观战等待
function finishEscape(hostWaiting) {
  GS.escaping = false;

  if (hostWaiting) {
    GS.escaped = true;
    showMessage('⏳ 你已撤离，等待队友完成…', 0x66ffcc);
    // 场上其实已经没人了（例如另一个队友刚好也撤了），直接结算
    if (typeof hasOtherActivePlayers === 'function' && !hasOtherActivePlayers() && !GS.gameOver) {
      if (typeof gameWin === 'function') gameWin();
    }
    return;
  }

  GS.escaped = true;
  if (typeof gameWin === 'function') gameWin();
}

// ============================================================
// Backward compatibility
// ============================================================
window.startEscape = startEscape;
window.finishEscape = finishEscape;
