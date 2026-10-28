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
// DOM 更新节流：按钮文案一秒最多变一次，没必要每帧重建 innerHTML
// （每帧重建会触发整块按钮的布局/绘制，在低端机上肉眼可见地拖帧）
var _flashBtnState = '';

// ============================================================
// 性能关键：手电筒的灯是**常驻**的，开关只改强度，不做 add/remove。
// three.js 的着色器程序按"灯光数量/类型"选择变体 —— 场景里一旦多了一盏
// 聚光灯，所有受光材质都要重新编译一遍（实测 +9 个程序，表现为
// 第一次开手电时全场卡 30~100ms）。灯常驻在场景里（关闭时 intensity=0），
// 材质变体在开局 renderer.compile 时就全部编译好，游戏中途零编译。
// ============================================================
function ensureFlashlightLight() {
  if (flashlightSpotLight) return;
  flashlightSpotLight = new THREE.SpotLight(0xfff4d0, 0);
  flashlightSpotLight.angle = 0.44;
  flashlightSpotLight.penumbra = 0.42;
  flashlightSpotLight.decay = 1.1;
  // 要覆盖到"开灯后能看见的雾距"（NIGHT_CFG.flashFogFar ≈ 52），
  // 否则雾放远了、光却打不到，远处还是一片黑
  flashlightSpotLight.distance = 56;
  // 性能：不投影。阴影会让这盏灯每帧把全场 2600+ 网格重画一遍阴影贴图。
  // 雾夜环境里"光里有没有影子"几乎看不出来，省下的开销是整场级别的。
  flashlightSpotLight.castShadow = false;
  flashlightSpotLight.userData._dir = new THREE.Vector3();
  flashlightSpotLight.userData._tgt = new THREE.Vector3();
  scene.add(flashlightSpotLight);
  scene.add(flashlightSpotLight.target);

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
  cone.visible = false;
  flashlightSpotLight.add(cone);
  flashlightSpotLight.userData.cone = cone;

  // 环境光补光同样常驻（AmbientLight 数量变化也会触发全场材质重编译）
  if (!GS._flashlightAmbient) {
    GS._flashlightAmbient = new THREE.AmbientLight(0xbfd0ff, 0);
    scene.add(GS._flashlightAmbient);
  }
}

function setFlashlightLit(on) {
  ensureFlashlightLight();
  flashlightSpotLight.intensity = on ? 3.2 : 0;
  if (flashlightSpotLight.userData.cone) {
    flashlightSpotLight.userData.cone.visible = on;
  }
  if (GS._flashlightAmbient) {
    GS._flashlightAmbient.intensity = on ? 0.06 : 0;
  }
}

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
    setFlashlightLit(true);
    // 雾距统一走 NightSystem（开灯 ≈52 米，关灯 ≈19 米）
    if (typeof applyNightFog === 'function') applyNightFog();
  } else {
    showMessage('🔦 手电筒关闭', 0xffff44);
    flashlightCooldown = FLASHLIGHT_COOLDOWN;
    // 灯不销毁，只把强度归零（见 ensureFlashlightLight 的说明）
    setFlashlightLit(false);
    // 关闭时回到夜晚雾距（NightSystem 统一给的 ~19 米）
    if (typeof applyNightFog === 'function') applyNightFog();
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

      // 电量耗尽：灯常驻，强度归零即可（雾距回到夜晚值 ~19 米）
      setFlashlightLit(false);
      if (typeof applyNightFog === 'function') applyNightFog();
      showMessage('🔦 手电筒电量耗尽', 0xffff44);
    } else {
      if (flashlightSpotLight && player) {
        // 复用临时向量（在 ensureFlashlightLight 里创建）：这里每帧执行
        var dir = flashlightSpotLight.userData._dir.set(0, 0, -1);
        dir.applyQuaternion(camera.quaternion);
        flashlightSpotLight.position.copy(player.position);
        flashlightSpotLight.position.y += 1.5;
        var targetPos = flashlightSpotLight.userData._tgt.copy(player.position).add(dir.multiplyScalar(8));
        targetPos.y = 0;
        flashlightSpotLight.target.position.copy(targetPos);
      }
    }
  }

  var flashlightBtn = document.getElementById('btn-flashlight');
  if (flashlightBtn) {
    // 先算出这一帧该显示什么，和上次一样就跳过 DOM 写入
    var state;
    if (!GS.hasFlashlight) state = 'locked';
    else if (flashlightActive) state = 'on:' + Math.ceil(flashlightDuration);
    else if (flashlightCooldown > 0) state = 'cd:' + Math.ceil(flashlightCooldown);
    else state = 'ready';

    if (state !== _flashBtnState) {
      _flashBtnState = state;
      if (!GS.hasFlashlight) {
        flashlightBtn.innerHTML = '<span class="icon">🔦</span>🔒';
        flashlightBtn.style.borderColor = 'rgba(100,100,100,0.3)';
        flashlightBtn.style.background = 'rgba(30,30,30,0.4)';
      } else if (flashlightActive) {
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
