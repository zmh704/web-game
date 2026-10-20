// ============================================================
// VX.anim - 缓动与动画驱动工具
// ============================================================
var VX = window.VX || {};

VX.anim = {
  easeOutCubic: function (t) { return 1 - Math.pow(1 - t, 3); },
  easeInCubic: function (t) { return t * t * t; },
  easeInOutSine: function (t) { return -(Math.cos(Math.PI * t) - 1) / 2; },
  easeOutBack: function (t) {
    var c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  easeOutElastic: function (t) {
    var c4 = (2 * Math.PI) / 3;
    return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  },

  // 帧率无关的平滑插值
  damp: function (current, target, lambda, dt) {
    return current + (target - current) * (1 - Math.exp(-lambda * dt));
  },

  // 静息呼吸：返回 -1..1 的缓慢波动
  breathe: function (time, speed) {
    return Math.sin(time * (speed || 1.8));
  },

  // 二次弹跳（落地、拾取）
  bounce: function (t) {
    return Math.abs(Math.sin(t * Math.PI)) * (1 - t);
  }
};

// ============================================================
// 关节骨架工具：给模型挂上可摆动的枢轴
// ============================================================
VX.rig = {
  // 创建一个带枢轴的肢体：pivot 在关节位置，几何体向下/向前延伸
  limb: function (geo, mat, pivotPos, rotZ) {
    var pivot = new THREE.Group();
    pivot.position.set(pivotPos[0], pivotPos[1], pivotPos[2]);
    if (rotZ) pivot.rotation.z = rotZ;
    var mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    pivot.add(mesh);
    return { pivot: pivot, mesh: mesh };
  },

  // 让枢轴在 X 轴上摆动（前后迈步/摆臂）
  swing: function (pivot, angle, damp) {
    if (!pivot) return;
    pivot.rotation.x = angle;
  },

  // 收集模型里的所有 Mesh 用于受击闪红
  collectMeshes: function (root, out) {
    out = out || [];
    root.traverse(function (o) {
      if (o.isMesh && o.material && o.material.emissive !== undefined) out.push(o);
    });
    return out;
  },

  // 受击闪色
  flash: function (meshes, color, intensity) {
    for (var i = 0; i < meshes.length; i++) {
      var m = meshes[i].material;
      if (!m) continue;
      m.emissive.setHex(color);
      m.emissiveIntensity = intensity === undefined ? 0.9 : intensity;
    }
  },

  resetFlash: function (meshes, restColor, restIntensity) {
    for (var i = 0; i < meshes.length; i++) {
      var m = meshes[i].material;
      if (!m) continue;
      m.emissive.setHex(restColor || 0x000000);
      m.emissiveIntensity = restIntensity === undefined ? 0 : restIntensity;
    }
  }
};

window.VX = VX;
