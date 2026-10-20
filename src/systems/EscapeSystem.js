// ============================================================
// EscapeSystem - Escape animation
// ============================================================

function startEscape() {
  if (GS.escaping) return;
  GS.escaping = true; GS.running = false;
  showMessage('🚀 能量集满! 引擎启动!', 0x66ffcc);
  AudioMgr.playSkill();
  var phase = 0, shipPos = ship.position.clone();
  if (player) {
    player.position.x = ship.position.x;
    player.position.z = ship.position.z;
    player.position.y = ship.position.y + 1.0;
  }
  var PLAYER_SHIP_OFFSET = 1.0;
  var si = setInterval(function () {
    if (!ship || !ship.parent) { clearInterval(si); return; }
    phase += 0.02;
    ship.position.y += phase * 1.2;
    ship.rotation.x += 0.02;
    ship.position.x += Math.sin(phase * 4) * 0.05;
    var ring = ship.userData.ring;
    if (ring) ring.material.opacity = Math.max(0, ring.material.opacity - 0.02);

    if (player) {
      player.position.x = ship.position.x;
      player.position.z = ship.position.z;
      player.position.y = ship.position.y + PLAYER_SHIP_OFFSET;
      player.rotation.y += 0.05;
    }

    if (camera && player) {
      camera.position.lerp(new THREE.Vector3(ship.position.x, ship.position.y + 2, shipPos.z + 9), 0.08);
      camera.lookAt(ship.position.x, ship.position.y, ship.position.z);
    }

    for (var pi = 0; pi < 3; pi++) {
      var pp = new THREE.Mesh(new THREE.SphereGeometry(0.04, 4, 4),
        new THREE.MeshBasicMaterial({ color: [0xff6600, 0xffaa00, 0xff4400][pi], transparent: true, opacity: 0.8 }));
      pp.position.set(shipPos.x + (Math.random() - 0.5) * 0.4, ship.position.y - 0.5, shipPos.z + (Math.random() - 0.5) * 0.4);
      pp.userData = { vel: new THREE.Vector3((Math.random() - 0.5) * 0.5, -2 - Math.random() * 2, (Math.random() - 0.5) * 0.5), life: 0.8, fade: true };
      scene.add(pp); projectiles.push(pp);
    }
    if (ship.position.y > 15) {
      clearInterval(si);
      if (player) scene.remove(player);
      scene.remove(ship);
      gameWin();
    }
  }, 30);
}

// ============================================================
// Backward compatibility
// ============================================================
window.startEscape = startEscape;
