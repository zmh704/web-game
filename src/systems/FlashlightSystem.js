// ============================================================
// FlashlightSystem - Flashlight toggle and update
// ============================================================

// 手电筒相关
var flashlightActive = false;
var flashlightSpotLight = null;
var flashlightDuration = 0;
var flashlightCooldown = 0;
// 手电筒现在是夜晚唯一的"看远"手段（见 NightSystem），
// 所以续航要够长、冷却要够短，不然大半时间都在黑暗里干等。
var FLASHLIGHT_MAX_DURATION = 30;
var FLASHLIGHT_COOLDOWN = 10;

function toggleFlashlight() {
  if (!GS.hasFlashlight) {
    showMessage('🔦 还没有手电筒，去房间中寻找吧!', 0xffff44);
    return;
  }
  if (flashlightCooldown > 0) {
    showMessage('⏳ 手电筒冷却中 (' + Math.ceil(flashlightCooldown) + 's)', 0xffff44);
    return;
  }

  flashlightActive = !flashlightActive;

  if (flashlightActive) {
    flashlightDuration = FLASHLIGHT_MAX_DURATION;
    showMessage('🔦 手电筒开启! 持续' + FLASHLIGHT_MAX_DURATION + '秒', 0xffff44);

    if (!flashlightSpotLight) {
      flashlightSpotLight = new THREE.SpotLight(0xfff4d0, 3.2);
      flashlightSpotLight.angle = 0.44;
      flashlightSpotLight.penumbra = 0.42;
      flashlightSpotLight.decay = 1.1;
      // 要覆盖到"开灯后能看见的雾距"（NIGHT_CFG.flashFogFar ≈ 52），
      // 否则雾放远了、光却打不到，远处还是一片黑
      flashlightSpotLight.distance = 56;
      flashlightSpotLight.castShadow = true;
      scene.add(flashlightSpotLight);

      var coneMat = new THREE.MeshBasicMaterial({
        color: 0xfff4d0,
        transparent: true,
        opacity: 0.045,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      var cone = new THREE.Mesh(new THREE.ConeGeometry(7, 16, 16, 1, true), coneMat);
      cone.rotation.x = Math.PI / 2;
      cone.position.z = -8;
      flashlightSpotLight.add(cone);
      flashlightSpotLight.userData.cone = cone;
    }

    // 雾距统一走 NightSystem（开灯 ≈52 米，关灯 ≈19 米）
    if (typeof applyNightFog === 'function') applyNightFog();

    // 只加一点点环境光提亮近处，不能加太多 ——
    // 环境光是无方向的，加多了会把远处也照亮，等于雾白推了
    if (!GS._flashlightAmbient) {
      GS._flashlightAmbient = new THREE.AmbientLight(0xbfd0ff, 0.06);
      scene.add(GS._flashlightAmbient);
    }
  } else {
    showMessage('🔦 手电筒关闭', 0xffff44);
    flashlightCooldown = FLASHLIGHT_COOLDOWN;

    if (flashlightSpotLight) {
      scene.remove(flashlightSpotLight);
      flashlightSpotLight = null;
    }

    // 关闭时回到夜晚雾距（NightSystem 统一给的 ~19 米）
    if (typeof applyNightFog === 'function') applyNightFog();

    if (GS._flashlightAmbient) {
      scene.remove(GS._flashlightAmbient);
      GS._flashlightAmbient = null;
    }
  }
}

function updateFlashlight(delta) {
  if (flashlightCooldown > 0) {
    flashlightCooldown -= delta;
    if (flashlightCooldown < 0) flashlightCooldown = 0;
  }

  if (flashlightActive) {
    flashlightDuration -= delta;
    if (flashlightDuration <= 0) {
      flashlightDuration = 0;
      flashlightActive = false;
      flashlightCooldown = FLASHLIGHT_COOLDOWN;

      if (flashlightSpotLight) {
        scene.remove(flashlightSpotLight);
        flashlightSpotLight = null;
      }
      // 电量耗尽：雾距回到夜晚值（~19 米）
      if (typeof applyNightFog === 'function') applyNightFog();
      if (GS._flashlightAmbient) {
        scene.remove(GS._flashlightAmbient);
        GS._flashlightAmbient = null;
      }
      showMessage('🔦 手电筒电量耗尽', 0xffff44);
    } else {
      if (flashlightSpotLight && player) {
        var dir = new THREE.Vector3(0, 0, -1);
        dir.applyQuaternion(camera.quaternion);
        flashlightSpotLight.position.copy(player.position);
        flashlightSpotLight.position.y += 1.5;
        var targetPos = player.position.clone().add(dir.multiplyScalar(8));
        targetPos.y = 0;
        flashlightSpotLight.target.position.copy(targetPos);
        scene.add(flashlightSpotLight.target);
      }
    }
  }

  var flashlightBtn = document.getElementById('btn-flashlight');
  if (flashlightBtn) {
    if (GS.hasFlashlight) {
      if (flashlightActive) {
        flashlightBtn.innerHTML = '<span class="icon">🔦</span>' + Math.ceil(flashlightDuration) + 's';
        flashlightBtn.style.borderColor = 'rgba(255,255,100,0.8)';
        flashlightBtn.style.background = 'rgba(80,80,30,0.6)';
      } else if (flashlightCooldown > 0) {
        flashlightBtn.innerHTML = '<span class="icon">🔦</span><span class="cd-text">' + Math.ceil(flashlightCooldown) + 's</span>';
        flashlightBtn.style.borderColor = 'rgba(100,100,100,0.5)';
        flashlightBtn.style.background = 'rgba(50,50,50,0.5)';
      } else {
        flashlightBtn.innerHTML = '<span class="icon">🔦</span>手电';
        flashlightBtn.style.borderColor = 'rgba(100,180,255,0.5)';
        flashlightBtn.style.background = 'rgba(30,60,100,0.55)';
      }
    } else {
      flashlightBtn.innerHTML = '<span class="icon">🔦</span>🔒';
      flashlightBtn.style.borderColor = 'rgba(100,100,100,0.3)';
      flashlightBtn.style.background = 'rgba(30,30,30,0.4)';
    }
  }
}

// ============================================================
// Backward compatibility
// ============================================================
window.toggleFlashlight = toggleFlashlight;
window.updateFlashlight = updateFlashlight;
window.flashlightActive = flashlightActive;
window.flashlightSpotLight = flashlightSpotLight;
window.flashlightDuration = flashlightDuration;
window.flashlightCooldown = flashlightCooldown;
window.FLASHLIGHT_MAX_DURATION = FLASHLIGHT_MAX_DURATION;
window.FLASHLIGHT_COOLDOWN = FLASHLIGHT_COOLDOWN;
