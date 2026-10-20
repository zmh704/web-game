// ============================================================
// VX.shape - 造型工具：圆角、有机体、渐细体
// 目的：消除基础几何体的尖锐棱角，让模型有"被捏过"的手作感
// ============================================================
var VX = window.VX || {};

VX.shape = {
  // 圆角立方体（三轴都带倒角）
  roundedBox: function (w, h, d, r, seg) {
    r = Math.min(r === undefined ? 0.1 : r, Math.min(w, h, d) / 2 - 0.001);
    seg = seg || 3;
    var shape = new THREE.Shape();
    var hw = w / 2, hh = h / 2;
    shape.moveTo(-hw + r, -hh);
    shape.lineTo(hw - r, -hh);
    shape.quadraticCurveTo(hw, -hh, hw, -hh + r);
    shape.lineTo(hw, hh - r);
    shape.quadraticCurveTo(hw, hh, hw - r, hh);
    shape.lineTo(-hw + r, hh);
    shape.quadraticCurveTo(-hw, hh, -hw, hh - r);
    shape.lineTo(-hw, -hh + r);
    shape.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
    shape.closePath();
    var geo = new THREE.ExtrudeGeometry(shape, {
      depth: Math.max(0.001, d - 2 * r),
      bevelEnabled: true,
      bevelThickness: r,
      bevelSize: r,
      bevelSegments: seg,
      curveSegments: seg
    });
    geo.center();
    geo.computeVertexNormals();
    return geo;
  },

  // 胶囊体（圆柱 + 两端半球），适合四肢
  capsule: function (radius, length, rSeg, hSeg) {
    return new THREE.CapsuleGeometry(radius, Math.max(0.001, length), hSeg || 4, rSeg || 12);
  },

  // 圆润锥形/水滴：用旋转体做渐变曲面，比 ConeGeometry 柔和
  taper: function (rTop, rBottom, height, seg, profile) {
    seg = seg || 16;
    var pts = [];
    var steps = 10;
    for (var i = 0; i <= steps; i++) {
      var t = i / steps;
      // 默认用缓入缓出的半径曲线，形成鼓起的腹部
      var e = profile ? profile(t) : Math.sin(t * Math.PI * 0.5);
      var y = -height / 2 + t * height;
      var rr = rBottom + (rTop - rBottom) * e;
      pts.push(new THREE.Vector2(Math.max(0.001, rr), y));
    }
    return new THREE.LatheGeometry(pts, seg);
  },

  // 有机团块：球体顶点加低频扰动，做出软体感
  blob: function (radius, wobble, seg) {
    var geo = new THREE.SphereGeometry(radius, seg || 18, (seg || 18) - 2);
    var pos = geo.attributes.position;
    var v = new THREE.Vector3();
    for (var i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      var n = Math.sin(v.x * 2.1) * Math.cos(v.y * 1.7) * Math.sin(v.z * 1.9);
      var s = 1 + n * (wobble === undefined ? 0.06 : wobble);
      pos.setXYZ(i, v.x * s, v.y * s, v.z * s);
    }
    geo.computeVertexNormals();
    return geo;
  },

  // 椭球
  ellipsoid: function (rx, ry, rz, seg) {
    var g = new THREE.SphereGeometry(1, seg || 18, (seg || 18) - 2);
    g.scale(rx, ry, rz);
    return g;
  },

  // 平滑环
  ring: function (inner, outer, seg) {
    return new THREE.RingGeometry(inner, outer, seg || 32);
  },

  // 菱形水晶
  crystal: function (size) {
    var g = new THREE.OctahedronGeometry(size, 0);
    g.scale(1, 1.55, 1);
    return g;
  }
};

window.VX = VX;
