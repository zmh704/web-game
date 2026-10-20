// ============================================================
// NightSystem - 夜晚可见度
//
// 需求：游戏默认是夜晚，只能看见一定距离；打开手电筒能看得更远；
//       队友如果就在身边，能被看见。
//
// 实现思路：可见距离由**雾**统一控制，而不是逐个物体做剔除。
//   · Fog 是逐片元的，所有几何体（地板、墙、怪物、队友）都会随距离
//     平滑融进雾色，不需要为每个物体写可见性判断，也没有硬切的突变感。
//   · 雾色取夜空地平线的颜色，远处的墙正好和天空连成一片，看起来就是"看不到"。
//   · 手电筒开启 = 把雾距推远 + 一盏聚光灯，而不是把整个场景调亮。
//
// 唯一需要特殊处理的是**队友名字标签**：它是 Sprite 且 depthTest=false，
// 会浮在雾上面，天黑了也能从很远的地方透出来 —— 那等于给了透视。
// 所以标签要单独按距离隐藏（见 updateNightVisibility）。
// ============================================================

var NIGHT_CFG = {
  fogNear: 7,
  fogFar: 22,          // 没有手电筒：最远看清约 22 米
  flashFogNear: 14,
  flashFogFar: 56,     // 手电筒打开：约 56 米
  // 名字标签跟着"实际能看清的距离"走：
  // 雾从 near 开始淡出，到 fogFar 完全看不见，所以标签要收得更紧，
  // 否则会出现"人已经糊成一团、名字还清清楚楚飘在那儿"的怪画面。
  // 关灯 fogFar=22 → 标签最远约 13.6 米；开灯 fogFar=56 → 约 35 米。
  labelCutRatio: 0.62,
  labelFadeRatio: 0.38
};

/** 当前该用的雾色：取夜空地平线色 */
function nightFogHex() {
  if (typeof VX !== 'undefined' && VX.palette && VX.palette.nightFog) {
    return VX.palette.nightFog(GS.chapter);
  }
  return 0x0a1020;
}

/**
 * 按当前手电筒状态重设雾距。
 *
 * 全项目只有这一处写 scene.fog —— 之前 initScene / buildRoom / 手电筒开关
 * 三处各写一套数字（8/13、46/118、15/30），互相打架：
 * 手电筒打开反而比默认更近，等于"开灯看得更少"。
 */
function applyNightFog() {
  if (typeof scene === 'undefined' || !scene) return;
  var on = (typeof flashlightActive !== 'undefined') && flashlightActive;
  var near = on ? NIGHT_CFG.flashFogNear : NIGHT_CFG.fogNear;
  var far = on ? NIGHT_CFG.flashFogFar : NIGHT_CFG.fogFar;
  if (!scene.fog) {
    scene.fog = new THREE.Fog(nightFogHex(), near, far);
  } else {
    scene.fog.color.setHex(nightFogHex());
    scene.fog.near = near;
    scene.fog.far = far;
  }
}

/** 把 initScene 里那套"白天"的灯压成月光 */
function applyNightLights() {
  var L = window.GAME_LIGHTS;
  if (L) {
    if (L.hemi) {
      L.hemi.intensity = 0.10;
      // 天光偏冷蓝，地面反弹色压到接近黑：夜里地面不反光
      if (L.hemi.color) L.hemi.color.setHex(0x8ea8d8);
      if (L.hemi.groundColor) L.hemi.groundColor.setHex(0x0a1020);
    }
    if (L.dir) {
      L.dir.intensity = 0.30;
      if (L.dir.color) L.dir.color.setHex(0xb9ccff);
    }
    if (L.fill) L.fill.intensity = 0.05;
    if (L.rim) L.rim.intensity = 0.10;
  }
  // 关键：IBL 环境贴图是"无方向"的全局补光，只要它还开着，
  // 把 hemi / dir 调到 0.1 也照样满地亮 —— 这是第一版调不暗的根本原因。
  if (typeof scene !== 'undefined' && scene && 'environmentIntensity' in scene) {
    scene.environmentIntensity = 0.16;
  }
  // 曝光压一档：ACES 下 0.72 左右刚好是"能看清轮廓但不刺眼"的月色
  if (typeof renderer !== 'undefined' && renderer) {
    renderer.toneMappingExposure = 0.72;
  }
}

/** 天空换成夜晚渐变 */
function applyNightSky() {
  if (typeof VX === 'undefined' || !VX.palette || !VX.palette.nightSkyCss) return;
  document.body.style.background = VX.palette.nightSkyCss(GS.chapter);
}

/**
 * 队友名字标签按距离显隐。
 *
 * 队友的模型本身会随雾自然变暗，不用管；但名字标签是 Sprite 且
 * depthTest=false，会穿透雾一直显示 —— 天黑了还能看到远处队友的名字，
 * 等于破坏了"夜里只能看见一定距离"。
 */
function updateNightVisibility() {
  if (typeof player === 'undefined' || !player) return;
  if (typeof SyncManager === 'undefined' || !SyncManager.remotePlayers) return;
  if (!scene || !scene.fog) return;

  var farLimit = scene.fog.far * NIGHT_CFG.labelCutRatio;
  var fadeFrom = scene.fog.far * NIGHT_CFG.labelFadeRatio;

  for (var pid in SyncManager.remotePlayers) {
    var rp = SyncManager.remotePlayers[pid];
    if (!rp || !rp.mesh) continue;
    var label = rp.nameLabel || rp.mesh.userData.nameLabel;
    if (!label) continue;

    var dx = rp.mesh.position.x - player.position.x;
    var dz = rp.mesh.position.z - player.position.z;
    var d = Math.sqrt(dx * dx + dz * dz);

    if (d >= farLimit) {
      label.visible = false;
    } else {
      label.visible = true;
      // 靠近视野边缘时淡出，别"啪"一下消失
      if (d <= fadeFrom) {
        if (label.material) label.material.opacity = 1;
      } else {
        var k = (d - fadeFrom) / Math.max(0.001, farLimit - fadeFrom);
        if (label.material) label.material.opacity = Math.max(0, 1 - k);
      }
    }
  }
}

// ============================================================
// Backward compatibility
// ============================================================
window.NIGHT_CFG = NIGHT_CFG;
window.applyNightFog = applyNightFog;
window.applyNightLights = applyNightLights;
window.applyNightSky = applyNightSky;
window.updateNightVisibility = updateNightVisibility;
