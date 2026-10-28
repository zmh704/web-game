// ============================================================
// HospitalMap - 恐怖医院（第 6 章「废弃医院」）
// ------------------------------------------------------------
// 和前五章（3×3 房间网格 + 矮墙）完全不同的地图类型：
//   · 室内医院布局：十字走廊 + 8 个独立房间（手术室/病房/太平间/药房…）
//   · 墙体是**真实楼板高度**（3.3 米到顶），不再是 1.75 米的矮墙
//   · 有楼梯：从一层楼梯间爬到屋顶停机坪（撤离点在上面）
//   · 门可以开关：走近按 E / 点 HUD 按钮，关上的门会挡住人和怪
//
// 三个关键技术点：
//   1. 碰撞改成**带高度区间的 AABB 列表**（wallList），
//      这样"一层的墙"不会挡住"屋顶上的玩家"。原来的网格数学碰撞
//      假设全图只有一个平面，医院有楼板，必须换。
//   2. 地面高度由 hospitalFloorAt() 算：楼梯是连续斜坡，其余按当前
//      高度判断在楼里还是屋顶（同 (x,z) 上下两层）。
//   3. 寻路改成**导航图 BFS**：原来的 monsterNavDir 依赖 3×3 网格，
//      在医院里会指向房间内部的隔墙。这里给医院单独一张
//      走廊/房门/房间中心组成的图，怪物按节点走。
// ============================================================

var HMAP = {
  active: false,
  chapter: 6,

  // ---------- 尺寸 ----------
  B: 50,            // 外墙中心线（±B）
  OT: 0.5,          // 外墙厚
  IT: 0.4,          // 内墙厚
  WH: 3.3,          // 层高（内墙顶部 / 楼板底面）
  ROOF: 3.7,        // 屋顶行走面（楼板顶）
  CW: 5,            // 走廊半宽（竖向走廊 x ∈ [-5,5]）
  WALL_TILE: 2.2,   // 墙面贴图一格代表的米数

  rooms: [],
  wallList: [],     // {x,z,w,d,y0,y1}  参与碰撞的实体墙
  doors: [],        // 门
  doorMap: {},
  stair: null,
  blockRects: [],   // 禁止刷怪/刷道具的区域
  navNodes: [],
  navAdj: {},

  lights: [],       // 会闪烁的灯
  fixtures: [],     // 灯管本体（自发光）
  _phase: 0,
  _built: false
};

// ============================================================
// 贴图：全部 Canvas 现画
// ============================================================
var hmTex = {
  // 医院墙面：下半截瓷砖 + 上半截脏涂料，带水渍与霉斑
  wall: function (tilesX, tilesY) {
    var rx = Math.max(0.4, Math.round(tilesX * 2) / 2);
    var ry = Math.max(0.4, Math.round(tilesY * 2) / 2);
    var key = 'hm_wall_' + rx + 'x' + ry;
    if (VX.texCache[key]) return VX.texCache[key];

    var M = VX.materials, S = 256, c = M._canvas(S), g = c.getContext('2d');

    // 上半：脏污涂料
    var grad = g.createLinearGradient(0, 0, 0, S);
    grad.addColorStop(0, '#5d6157');
    grad.addColorStop(0.42, '#6a6d62');
    grad.addColorStop(0.55, '#585c53');
    grad.addColorStop(1, '#4e5249');
    g.fillStyle = grad;
    g.fillRect(0, 0, S, S);

    // 霉斑：从上往下的暗色晕染
    M._spots(g, S, 16, ['#3f463c', '#4a4f44'], 0.30, 16, 58, true);
    // 顶部水渍竖纹
    for (var i = 0; i < 22; i++) {
      var x = Math.random() * S;
      var len = 30 + Math.random() * 130;
      g.strokeStyle = 'rgba(48,54,45,' + (0.10 + Math.random() * 0.16) + ')';
      g.lineWidth = 1 + Math.random() * 4;
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x + (Math.random() - 0.5) * 6, len);
      g.stroke();
    }
    // 剥落：露出灰底
    for (var k = 0; k < 10; k++) {
      var px = Math.random() * S, py = Math.random() * S * 0.6;
      g.fillStyle = 'rgba(120,118,110,' + (0.25 + Math.random() * 0.3) + ')';
      g.beginPath();
      g.ellipse(px, py, 4 + Math.random() * 14, 3 + Math.random() * 9, Math.random(), 0, Math.PI * 2);
      g.fill();
    }

    // 下半：瓷砖（占 45% 高度）
    var tileTop = S * 0.55;
    g.fillStyle = '#93998c';
    g.fillRect(0, tileTop, S, S - tileTop);
    var cols = 8, rows = 5;
    var tw = S / cols, th = (S - tileTop) / rows;
    for (var r = 0; r < rows; r++) {
      for (var cc = 0; cc < cols; cc++) {
        var shade = 0.92 + Math.random() * 0.16;
        g.fillStyle = 'rgba(' + Math.round(150 * shade) + ',' + Math.round(156 * shade) + ',' + Math.round(142 * shade) + ',1)';
        g.fillRect(cc * tw + 1, tileTop + r * th + 1, tw - 2, th - 2);
        if (Math.random() > 0.9) {
          g.fillStyle = 'rgba(70,72,60,0.35)';
          g.fillRect(cc * tw + 1, tileTop + r * th + 1, tw - 2, th - 2);
        }
      }
    }
    // 瓷砖缝
    g.strokeStyle = 'rgba(58,62,54,0.75)';
    g.lineWidth = 1.5;
    for (var v = 0; v <= cols; v++) {
      g.beginPath(); g.moveTo(v * tw, tileTop); g.lineTo(v * tw, S); g.stroke();
    }
    for (var hh = 0; hh <= rows; hh++) {
      g.beginPath(); g.moveTo(0, tileTop + hh * th); g.lineTo(S, tileTop + hh * th); g.stroke();
    }
    // 踢脚线阴影
    g.fillStyle = 'rgba(28,32,26,0.5)';
    g.fillRect(0, S - 6, S, 6);
    // 墙裙边条
    g.fillStyle = 'rgba(60,70,62,0.55)';
    g.fillRect(0, tileTop - 4, S, 4);

    var t = M._finish(c, rx, ry);
    VX.texCache[key] = t;
    return t;
  },

  // 地面：脏污的浅绿卷材地板（医院经典），带接缝、污渍与拖拽血痕
  floor: function (n) {
    var key = 'hm_floor_' + n;
    if (VX.texCache[key]) return VX.texCache[key];
    var M = VX.materials, S = 256, c = M._canvas(S), g = c.getContext('2d');

    g.fillStyle = '#6f7768';
    g.fillRect(0, 0, S, S);
    M._spots(g, S, 30, ['#626a5c', '#7c8474', '#565d51'], 0.34, 20, 78, true);
    M._speckle(g, S, 420, ['#4e5449', '#868e7d', '#5c6357'], 1.3, true);

    // 卷材接缝：每 64px 一条
    g.strokeStyle = 'rgba(48,54,46,0.5)';
    g.lineWidth = 2;
    for (var i = 0; i <= 4; i++) {
      g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, S); g.stroke();
      g.beginPath(); g.moveTo(0, i * 64); g.lineTo(S, i * 64); g.stroke();
    }
    // 污渍
    for (var k = 0; k < 7; k++) {
      var bx = Math.random() * S, by = Math.random() * S;
      var br = 8 + Math.random() * 20;
      g.fillStyle = 'rgba(38,32,26,' + (0.12 + Math.random() * 0.14) + ')';
      g.beginPath();
      g.ellipse(bx, by, br, br * (0.5 + Math.random() * 0.6), Math.random() * 3, 0, Math.PI * 2);
      g.fill();
    }
    // 干涸血迹拖痕
    for (var b = 0; b < 3; b++) {
      var sx = Math.random() * S, sy = Math.random() * S;
      g.strokeStyle = 'rgba(78,26,22,0.28)';
      g.lineWidth = 3 + Math.random() * 7;
      g.beginPath();
      g.moveTo(sx, sy);
      g.bezierCurveTo(sx + 20, sy + 14, sx + 34, sy + 6, sx + 60, sy + 26);
      g.stroke();
    }

    var t = M._finish(c, n);
    VX.texCache[key] = t;
    return t;
  },

  // 混凝土（屋顶）
  concrete: function (n) {
    var key = 'hm_concrete_' + n;
    if (VX.texCache[key]) return VX.texCache[key];
    var M = VX.materials, S = 256, c = M._canvas(S), g = c.getContext('2d');
    g.fillStyle = '#4a4d48';
    g.fillRect(0, 0, S, S);
    M._spots(g, S, 26, ['#43463f', '#52564e', '#3b3e38'], 0.34, 24, 80, true);
    M._speckle(g, S, 500, ['#3a3d37', '#5b5f56'], 1.4, true);
    // 裂缝
    for (var i = 0; i < 6; i++) {
      var x = Math.random() * S, y = Math.random() * S;
      g.strokeStyle = 'rgba(28,30,26,0.6)';
      g.lineWidth = 1 + Math.random();
      g.beginPath();
      g.moveTo(x, y);
      for (var s = 0; s < 4; s++) {
        x += (Math.random() - 0.5) * 34;
        y += (Math.random() - 0.5) * 34;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    var t = M._finish(c, n);
    VX.texCache[key] = t;
    return t;
  },

  // 天花板：矿棉板吊顶，缺板的地方露出黑
  ceiling: function (n) {
    var key = 'hm_ceiling_' + n;
    if (VX.texCache[key]) return VX.texCache[key];
    var M = VX.materials, S = 256, c = M._canvas(S), g = c.getContext('2d');
    g.fillStyle = '#3a3d38';
    g.fillRect(0, 0, S, S);
    var cell = S / 4;
    for (var r = 0; r < 4; r++) {
      for (var q = 0; q < 4; q++) {
        var missing = Math.random() > 0.86;
        g.fillStyle = missing ? '#0d0f0d' : 'rgba(' + (92 + Math.random() * 18) + ',' + (94 + Math.random() * 16) + ',' + (86 + Math.random() * 14) + ',1)';
        g.fillRect(q * cell + 1.5, r * cell + 1.5, cell - 3, cell - 3);
        if (!missing && Math.random() > 0.7) {
          g.fillStyle = 'rgba(70,60,44,0.35)';
          g.beginPath();
          g.ellipse(q * cell + cell * 0.5, r * cell + cell * 0.5, cell * 0.3, cell * 0.2, Math.random(), 0, Math.PI * 2);
          g.fill();
        }
      }
    }
    g.strokeStyle = 'rgba(22,24,20,0.85)';
    g.lineWidth = 2;
    for (var i = 0; i <= 4; i++) {
      g.beginPath(); g.moveTo(i * cell, 0); g.lineTo(i * cell, S); g.stroke();
      g.beginPath(); g.moveTo(0, i * cell); g.lineTo(S, i * cell); g.stroke();
    }
    var t = M._finish(c, n);
    VX.texCache[key] = t;
    return t;
  },

  // 门板：金属面 + 观察窗 + 踢脚板
  door: function () {
    if (VX.texCache.hm_door) return VX.texCache.hm_door;
    var M = VX.materials, W = 128, Hh = 256;
    var c = document.createElement('canvas');
    c.width = W; c.height = Hh;
    var g = c.getContext('2d');
    g.fillStyle = '#7d8a80';
    g.fillRect(0, 0, W, Hh);
    M._spots(g, W, 24, ['#6d7a70', '#87948a'], 0.22, 8, 30);
    // 压条
    g.strokeStyle = 'rgba(58,66,60,0.8)';
    g.lineWidth = 3;
    g.strokeRect(10, 22, W - 20, Hh - 44);
    // 观察窗
    g.fillStyle = 'rgba(20,26,20,0.92)';
    g.fillRect(28, 62, W - 56, 66);
    g.strokeStyle = '#5c6860';
    g.lineWidth = 4;
    g.strokeRect(28, 62, W - 56, 66);
    g.fillStyle = 'rgba(120,150,130,0.10)';
    g.fillRect(30, 64, W - 60, 28);
    // 踢脚板
    g.fillStyle = '#5b6660';
    g.fillRect(0, Hh - 26, W, 26);
    // 锈迹与血手印
    g.strokeStyle = 'rgba(120,52,32,0.55)';
    for (var i = 0; i < 5; i++) {
      g.lineWidth = 1 + Math.random() * 2;
      var sx = Math.random() * W;
      g.beginPath(); g.moveTo(sx, Hh - 26); g.lineTo(sx + (Math.random() - 0.5) * 10, Hh - 60 - Math.random() * 40); g.stroke();
    }
    g.fillStyle = 'rgba(96,24,20,0.5)';
    [[34, 168], [38, 176], [44, 172], [40, 186]].forEach(function (p) {
      g.beginPath(); g.ellipse(p[0], p[1], 3.4, 6, -0.4, 0, Math.PI * 2); g.fill();
    });
    // 把手
    g.fillStyle = '#b9c2b6';
    g.fillRect(W - 30, 148, 8, 26);
    var t = new THREE.CanvasTexture(c);
    if (THREE.SRGBColorSpace !== undefined) t.colorSpace = THREE.SRGBColorSpace;
    VX.texCache.hm_door = t;
    return t;
  },

  // 血迹贴片（透明底，铺在地面/墙上）
  blood: function (seed) {
    var key = 'hm_blood_' + seed;
    if (VX.texCache[key]) return VX.texCache[key];
    var S = 128, c = VX.materials._canvas(S), g = c.getContext('2d');
    g.clearRect(0, 0, S, S);
    // 主血泊
    var cx = S * 0.5, cy = S * 0.5;
    var grad = g.createRadialGradient(cx, cy, 4, cx, cy, S * 0.45);
    grad.addColorStop(0, 'rgba(88,16,14,0.92)');
    grad.addColorStop(0.55, 'rgba(74,14,12,0.72)');
    grad.addColorStop(1, 'rgba(52,10,10,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.ellipse(cx, cy, S * 0.45, S * 0.34, Math.random(), 0, Math.PI * 2);
    g.fill();
    // 飞溅
    for (var i = 0; i < 46; i++) {
      var a = Math.random() * Math.PI * 2;
      var d = 10 + Math.random() * S * 0.52;
      var r = 0.8 + Math.random() * 4.2;
      g.fillStyle = 'rgba(' + (66 + Math.random() * 30) + ',12,10,' + (0.35 + Math.random() * 0.5) + ')';
      g.beginPath();
      g.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.8, r, 0, Math.PI * 2);
      g.fill();
    }
    var t = new THREE.CanvasTexture(c);
    if (THREE.SRGBColorSpace !== undefined) t.colorSpace = THREE.SRGBColorSpace;
    VX.texCache[key] = t;
    return t;
  }
};

// ============================================================
// 医院布局
// ============================================================
function isHospitalMap() {
  return !!(typeof GS !== 'undefined' && GS && GS.chapter === HMAP.chapter);
}

function hmInitLayout() {
  var RB = HMAP.B - 0.4;   // 房间内沿（贴近外墙内侧）

  // 每个房间记录矩形，楼板/家具/摄像机都用它
  HMAP.rooms = [
    { id: 'or', name: '手术室', x0: -RB, x1: -HMAP.CW, z0: -RB, z1: -23, type: 'or' },
    { id: 'wardA', name: '病房 A', x0: -RB, x1: -HMAP.CW, z0: -23, z1: -HMAP.CW, type: 'ward' },
    { id: 'morgue', name: '太平间', x0: HMAP.CW, x1: RB, z0: -RB, z1: -23, type: 'morgue' },
    { id: 'icu', name: '重症室', x0: HMAP.CW, x1: RB, z0: -23, z1: -HMAP.CW, type: 'icu' },
    { id: 'pharm', name: '药房', x0: -RB, x1: -HMAP.CW, z0: HMAP.CW, z1: 24, type: 'pharm' },
    { id: 'wardB', name: '病房 B', x0: -RB, x1: -HMAP.CW, z0: 24, z1: RB, type: 'ward' },
    { id: 'er', name: '急诊室', x0: HMAP.CW, x1: RB, z0: HMAP.CW, z1: 24, type: 'er' },
    { id: 'stair', name: '楼梯间', x0: HMAP.CW, x1: RB, z0: 24, z1: RB, type: 'stair' }
  ];

  // 楼梯：x[30,42] 从 z=26（地面）升到 z=33.5（屋顶）
  HMAP.stair = { x0: 30, x1: 42, z0: 26, z1: 33.5, steps: 22 };

  // 禁止刷怪/刷道具：楼梯本体（地面层是实心台阶）
  HMAP.blockRects = [
    { x0: 29.4, x1: 42.6, z0: 25.4, z1: 34.0 }
  ];

  // ---------- 导航图 ----------
  // 走廊节点 + 门节点 + 房间中心节点
  var N = [], adj = {};
  function node(id, x, z) { N.push({ id: id, x: x, z: z }); adj[id] = adj[id] || []; return id; }
  function link(a, b) {
    if (!adj[a]) adj[a] = [];
    if (!adj[b]) adj[b] = [];
    if (adj[a].indexOf(b) < 0) adj[a].push(b);
    if (adj[b].indexOf(a) < 0) adj[b].push(a);
  }

  // 竖向走廊
  var vz = [-46, -36, -26, -16, -6, 0, 6, 16, 26, 36, 44];
  var vids = vz.map(function (z) { return node('v' + z, 0, z); });
  for (var i = 0; i < vids.length - 1; i++) link(vids[i], vids[i + 1]);

  // 横向走廊（-27/27 是新门 d_*_s / d_*_n 的走廊侧锚点）
  var hx = [-44, -34, -27, -24, -14, -6, 6, 14, 24, 27, 34, 44];
  var hids = hx.map(function (x) { return node('h' + x, x, 0); });
  for (var j = 0; j < hids.length - 1; j++) link(hids[j], hids[j + 1]);
  link('v0', 'h-6');
  link('v0', 'h6');

  // 门位置（也是门的 id），门两边各连一条边
  var doorDefs = [
    { id: 'd_or', x: -HMAP.CW, z: -36, room: 'v-36', to: 'r_or', roomNode: [-27, -36] },
    { id: 'd_wardA', x: -HMAP.CW, z: -14, room: 'v-16', to: 'r_wardA', roomNode: [-27, -14] },
    { id: 'd_morgue', x: HMAP.CW, z: -36, room: 'v-36', to: 'r_morgue', roomNode: [27, -36] },
    { id: 'd_icu', x: HMAP.CW, z: -14, room: 'v-16', to: 'r_icu', roomNode: [27, -14] },
    { id: 'd_pharm', x: -HMAP.CW, z: 14, room: 'v16', to: 'r_pharm', roomNode: [-27, 14] },
    { id: 'd_wardB', x: -HMAP.CW, z: 36, room: 'v36', to: 'r_wardB', roomNode: [-27, 36] },
    { id: 'd_er', x: HMAP.CW, z: 14, room: 'v16', to: 'r_er', roomNode: [16, 14] },
    { id: 'd_stair', x: HMAP.CW, z: 36, room: 'v36', to: 'r_stair', roomNode: [16, 36] },
    // ---------- 横向走廊两侧的门（h=true：门板沿 x 展开，装在横墙 z=±CW 上） ----------
    // 没有这 4 扇时，横走廊东西两臂是死胡同（两端撞外墙、中途没有任何门）
    { id: 'd_wardA_s', h: true, x: -27, z: -HMAP.CW, label: '病房 A', room: 'h-27', to: 'r_wardA_s', roomNode: [-27, -14] },
    { id: 'd_icu_s',   h: true, x: 27,  z: -HMAP.CW, label: '重症室', room: 'h27',  to: 'r_icu_s',   roomNode: [27, -14] },
    { id: 'd_pharm_n', h: true, x: -27, z: HMAP.CW,  label: '药房',   room: 'h-27', to: 'r_pharm_n', roomNode: [-27, 14] },
    { id: 'd_er_n',    h: true, x: 27,  z: HMAP.CW,  label: '急诊室', room: 'h27',  to: 'r_er_n',    roomNode: [27, 14] },
    // ---------- 相邻房间直通门（装在象限内隔墙 z=-23 / z=24 上） ----------
    { id: 'd_or_ward',   h: true, x: -27, z: -23, label: '手术室', room: 'r_or',    to: 'r_wardA', roomNode: [-27, -14] },
    { id: 'd_morgue_icu', h: true, x: 27,  z: -23, label: '太平间', room: 'r_morgue', to: 'r_icu',   roomNode: [27, -14] },
    { id: 'd_pharm_ward', h: true, x: -27, z: 24,  label: '药房',   room: 'r_pharm',  to: 'r_wardB', roomNode: [-27, 36] },
    { id: 'd_er_stair',   h: true, x: 27,  z: 24,  label: '急诊室', room: 'r_er',    to: 'r_stair', roomNode: [16, 36] }
  ];
  doorDefs.forEach(function (d) {
    node(d.id, d.x, d.z);
    node(d.to, d.roomNode[0], d.roomNode[1]);
    link(d.id, d.room);
    link(d.id, d.to);
    link(d.to, d.id);
  });

  HMAP.navNodes = N;
  HMAP.navAdj = adj;
  HMAP.doorDefs = doorDefs;
}

// ============================================================
// 构建
// ============================================================
function buildHospital() {
  hmInitLayout();
  HMAP.active = true;
  HMAP._built = true;

  var M = VX.materials;
  scene.background = null;
  if (typeof applyNightSky === 'function') applyNightSky();

  // 医院整体偏冷绿，雾色单独压深一档
  var fogHex = 0x10160f;
  scene.fog = new THREE.Fog(fogHex, 6, 24);
  window.__HOSPITAL_FOG = fogHex;

  // 性能：相机远平面与雾距耦合（同 NightSystem.applyNightFog 的做法）。
  // 医院这里直接设雾不走 applyNightFog，所以 far 收紧要单独做一份：
  // 原来相机 far=120，雾 24 米外的东西其实已经全融进雾色，
  // 却仍参与剔除/绘制 —— 收紧到 32 后，draw call 直接少一小半。
  if (typeof camera !== 'undefined' && camera && camera.isPerspectiveCamera) {
    camera.far = 32;
    camera.updateProjectionMatrix();
  }

  // ---------- 共享材质 ----------
  var wallTileCache = {};
  HMAP.wallMatFor = function (len, h) {
    var k = Math.max(0.5, Math.round(len * 2) / 2);
    var key = k + '_' + h.toFixed(1);
    if (wallTileCache[key]) return wallTileCache[key];
    var mat = new THREE.MeshStandardMaterial({
      map: hmTex.wall(k / HMAP.WALL_TILE, h / HMAP.WALL_TILE),
      roughness: 0.9,
      metalness: 0.02
    });
    wallTileCache[key] = mat;
    return mat;
  };

  var ceilingMat = new THREE.MeshStandardMaterial({
    map: hmTex.ceiling(14), roughness: 0.95, metalness: 0
  });
  var floorCorridorMat = new THREE.MeshStandardMaterial({
    map: hmTex.floor(18), roughness: 0.86, metalness: 0.02
  });
  var floorRoomMat = new THREE.MeshStandardMaterial({
    map: hmTex.floor(9), roughness: 0.88, metalness: 0.02
  });
  var roofMat = new THREE.MeshStandardMaterial({
    map: hmTex.concrete(16), roughness: 0.96, metalness: 0
  });

  HMAP.mats = {
    wallFor: HMAP.wallMatFor,
    ceiling: ceilingMat,
    floorCorridor: floorCorridorMat,
    floorRoom: floorRoomMat,
    roof: roofMat,
    // 材质工厂要转一份进来：HMAP.mats 不是 VX.materials，
    // 直接用 M.std() 会报 "M.std is not a function"（cloth/metal 内部还依赖 this）
    std: function (c, o) { return M.std(c, o); },
    cloth: function (c) { return M.cloth(c); },
    metal: function (c) { return M.metal(c); },
    glow: function (c, o, a) { return M.glow(c, o, a); },
    energy: function (c, o) { return M.energy(c, o); },
    steel: M.std(0x8d958c, { rough: 0.42, metal: 0.45 }),
    steelDark: M.std(0x4a504a, { rough: 0.55, metal: 0.35 }),
    rust: M.std(0x6b4a36, { rough: 0.9, metal: 0.15 }),
    paint: M.std(0x9aa396, { rough: 0.86 }),
    sheet: M.cloth(0xd8dbd0),
    sheetDirty: M.cloth(0xa8ab9c),
    dark: M.std(0x22271f, { rough: 0.8 }),
    glass: M.std(0x2a3a32, { rough: 0.16, metal: 0.2, transparent: true, opacity: 0.55 }),
    lightOn: M.std(0xf2ffe8, { rough: 0.35, emissive: 0xdfffd0, emissiveIntensity: 1.5 }),
    lightOff: M.std(0x6a736a, { rough: 0.6 }),
    exitGreen: M.std(0x2f7a52, { rough: 0.4, emissive: 0x2fff88, emissiveIntensity: 1.1 }),
    paper: M.std(0xcfcabb, { rough: 0.9 })
  };

  buildHospitalFloors();
  buildHospitalWalls();
  buildHospitalDoors();
  buildHospitalStairs();
  buildHospitalRoof();
  buildHospitalProps();

  // 性能：医院是全封闭楼板，那盏会投影的平行光（月光）根本照不进室内，
  // 但它的阴影 pass 每帧仍要把上千个家具网格画一遍。
  // 直接关掉它的投影 —— 室内靠点光和手电，屋顶有雾，肉眼看不出差别。
  if (window.GAME_LIGHTS && window.GAME_LIGHTS.dir) {
    window.GAME_LIGHTS.dir.castShadow = false;
  }
  buildHospitalLights();
  buildHospitalDecals();
  createHospitalHelicopter();

  // ---------- 静态矩阵冻结 ----------
  // 医院有 2600+ 网格，全部 matrixAutoUpdate=true 时渲染器每帧都要为
  // 每个对象重算 4x4 矩阵。而医院里除了门扇（开关动画）、直升机（旋翼）
  // 和玩家，其余东西从建好那一刻起永远不动 —— 冻结它们，每帧省掉
  // 一整遍矩阵重算 + 层级更新。
  // 注意：本函数在建玩家/怪物等动态实体之前执行（buildRoom 阶段），
  // 所以此时场景里只有医院本体，冻结是安全的；动态实体是之后才 add 的。
  (function freezeStaticMatrices() {
    var doorGroups = HMAP.doors.map(function (d) { return d.group; });
    var shipRoot = HMAP.ship || null;
    var count = 0;
    scene.traverse(function (o) {
      // 排除动画对象及其子层级
      var p = o;
      while (p) {
        if (doorGroups.indexOf(p) !== -1) return;
        if (shipRoot && p === shipRoot) return;
        p = p.parent;
      }
      if (o === scene) return;
      o.updateMatrix();
      o.matrixAutoUpdate = false;
      count++;
    });
    console.log('[Perf] 医院静态矩阵冻结 ' + count + ' 个对象');
  })();

  // ---------- 世界导航/出生点修复 ----------
  // 门开着的时候怪物也能过 → 交给 monsterNavDir 的医院分支处理
  window.HMAP = HMAP;
  window.isHospitalMap = isHospitalMap;
  // 把出生点从"虚空"挪到医院走廊（默认 (0,0,-6) 正好在竖向走廊里）
  if (typeof player !== 'undefined' && player) {
    player.position.set(0, 0, -6);
    player.rotation.y = Math.PI;
  }
  console.log('[Hospital] 医院地图构建完成，墙体 ' + HMAP.wallList.length + ' 段，门 ' + HMAP.doors.length + ' 扇');
}

// ---------- 楼板 ----------
function buildHospitalFloors() {
  var M = HMAP.mats;

  // 主楼板（房间 + 走廊整片），直接一块 100×100
  var base = new THREE.Mesh(new THREE.PlaneGeometry(HMAP.B * 2, HMAP.B * 2), M.floorCorridor);
  base.rotation.x = -Math.PI / 2;
  base.position.set(0, 0.001, 0);
  base.receiveShadow = true;
  scene.add(base);

  // 各房间再铺一层（不同 repeat 让房间地板纹理更细，视觉上分区）
  HMAP.rooms.forEach(function (r) {
    var w = r.x1 - r.x0, d = r.z1 - r.z0;
    var f = new THREE.Mesh(new THREE.PlaneGeometry(w, d), M.floorRoom);
    f.rotation.x = -Math.PI / 2;
    f.position.set((r.x0 + r.x1) / 2, 0.004, (r.z0 + r.z1) / 2);
    f.receiveShadow = true;
    scene.add(f);
  });

  // 走廊地面再提亮一点（脏得没那么厉害），并加中线导视条
  var lineMat = M.std(0x3f5a48, { rough: 0.8 });
  [-2.6, 2.6].forEach(function (dx) {
    var l = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 92), lineMat);
    l.rotation.x = -Math.PI / 2;
    l.position.set(dx, 0.008, 0);
    scene.add(l);
  });
}

// ---------- 墙体 ----------
function buildHospitalWalls() {
  var M = HMAP.mats;
  var B = HMAP.B, OT = HMAP.OT, IT = HMAP.IT, WH = HMAP.WH, CW = HMAP.CW;
  var RB = B - 0.4;

  /** 在墙列表里加一段（可选是否建 mesh） */
  function addWall(cx, cz, w, d, y0, y1, mat) {
    var geo = new THREE.BoxGeometry(w, y1 - y0, d);
    var mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(cx, (y0 + y1) / 2, cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    walls.push(mesh);
    HMAP.wallList.push({ x: cx, z: cz, w: w, d: d, y0: y0, y1: y1, mesh: mesh });
    return mesh;
  }

  /** 沿一条线铺墙，gaps 是门洞（{at, w}） */
  function wallRun(orient, fixed, a0, a1, gaps, y0, y1, thick) {
    var list = (gaps || []).slice().sort(function (p, q) { return p.at - q.at; });
    var cur = a0;
    function emit(s, e) {
      var len = e - s;
      if (len < 0.05) return;
      var mat = HMAP.wallMatFor(len, y1 - y0);
      if (orient === 'z') addWall(fixed, (s + e) / 2, thick, len, y0, y1, mat);
      else addWall((s + e) / 2, fixed, len, thick, y0, y1, mat);
    }
    for (var i = 0; i < list.length; i++) {
      var g0 = list[i].at - list[i].w / 2;
      var g1 = list[i].at + list[i].w / 2;
      emit(cur, g0);
      cur = g1;
    }
    emit(cur, a1);
  }

  var doorGapsW = [
    { at: -36, w: 2.0 }, { at: -14, w: 2.0 }, { at: 14, w: 2.0 }, { at: 36, w: 2.0 }
  ];

  // 外墙
  wallRun('x', -B, -B - OT / 2, B + OT / 2, [], 0, WH, OT);
  wallRun('x', B, -B - OT / 2, B + OT / 2, [], 0, WH, OT);
  wallRun('z', -B, -B + OT / 2, B - OT / 2, [], 0, WH, OT);
  wallRun('z', B, -B + OT / 2, B - OT / 2, [], 0, WH, OT);

  // 竖向走廊两侧（x = ±CW），中间留出横向走廊的过道
  wallRun('z', -CW, -RB, -CW, doorGapsW.slice(0, 2), 0, WH, IT);
  wallRun('z', -CW, CW, RB, doorGapsW.slice(2, 4), 0, WH, IT);
  wallRun('z', CW, -RB, -CW, doorGapsW.slice(0, 2), 0, WH, IT);
  wallRun('z', CW, CW, RB, doorGapsW.slice(2, 4), 0, WH, IT);

  // 横向走廊两侧（z = ±CW），北墙开病房A/重症室的门，南墙开药房/急诊的门
  // （原来 4 段全封闭 → 横走廊东西两臂是死胡同）
  wallRun('x', -CW, -RB, -CW, [{ at: -27, w: 2.0 }], 0, WH, IT);
  wallRun('x', -CW, CW, RB, [{ at: 27, w: 2.0 }], 0, WH, IT);
  wallRun('x', CW, -RB, -CW, [{ at: -27, w: 2.0 }], 0, WH, IT);
  wallRun('x', CW, CW, RB, [{ at: 27, w: 2.0 }], 0, WH, IT);

  // 房间之间的隔墙（中段各开一扇直通门：手术室↔病房A 等）
  wallRun('x', -23, -RB, -CW, [{ at: -27, w: 2.0 }], 0, WH, IT);
  wallRun('x', -23, CW, RB, [{ at: 27, w: 2.0 }], 0, WH, IT);
  wallRun('x', 24, -RB, -CW, [{ at: -27, w: 2.0 }], 0, WH, IT);
  wallRun('x', 24, CW, RB, [{ at: 27, w: 2.0 }], 0, WH, IT);
}

// ---------- 门 ----------
function buildHospitalDoors() {
  var M = HMAP.mats;
  var doorTex = hmTex.door();

  HMAP.doorDefs.forEach(function (def, idx) {
    var w = 2.0;
    var h = 2.15;
    // h=true：门装在横墙（z=±CW / 隔墙 z=-23、24）上，门板沿 x 展开；
    // 否则装在竖墙（x=±CW）上，门板沿 z 展开（原有 8 扇）。
    var isX = !!def.h;
    var baseRot = 0;
    var grp = new THREE.Group();
    var openSign;
    if (isX) {
      // 铰链在门的西端；z<0 的墙朝 -z（北）开，z>0 的墙朝 +z（南）开
      grp.position.set(def.x - w / 2, 0, def.z);
      openSign = (def.z < 0) ? 1 : -1;
    } else {
      // 铰链在门的南端；x<0 的墙朝 -x（西）开，x>0 的墙朝 +x（东）开
      grp.position.set(def.x, 0, def.z - w / 2);
      openSign = (def.x < 0) ? 1 : -1;
    }

    var leafMat = new THREE.MeshStandardMaterial({
      map: doorTex, roughness: 0.62, metalness: 0.28
    });
    var leaf;
    if (isX) {
      leaf = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.085), leafMat);
      leaf.position.set(w / 2, h / 2, 0);
    } else {
      leaf = new THREE.Mesh(new THREE.BoxGeometry(0.085, h, w), leafMat);
      leaf.position.set(0, h / 2, w / 2);
    }
    leaf.castShadow = true;
    leaf.receiveShadow = true;
    grp.add(leaf);

    // 门把手（两侧）
    var knobMat = M.steel;
    [0.05, -0.05].forEach(function (off) {
      var knob = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.14, 8), knobMat);
      if (isX) {
        knob.rotation.x = Math.PI / 2;
        knob.position.set(w - 0.24, 1.02, off);
      } else {
        knob.rotation.z = Math.PI / 2;
        knob.position.set(off, 1.02, w - 0.24);
      }
      grp.add(knob);
    });

    scene.add(grp);

    // 门框（两根立柱 + 上梁），固定不动的
    var jambMat = M.steelDark;
    [-1, 1].forEach(function (s) {
      var jamb;
      if (isX) {
        jamb = new THREE.Mesh(new THREE.BoxGeometry(0.14, h + 0.16, 0.16), jambMat);
        jamb.position.set(def.x + s * (w / 2 + 0.07), (h + 0.16) / 2, def.z);
      } else {
        jamb = new THREE.Mesh(new THREE.BoxGeometry(0.16, h + 0.16, 0.14), jambMat);
        jamb.position.set(def.x, (h + 0.16) / 2, def.z + s * (w / 2 + 0.07));
      }
      jamb.castShadow = true;
      scene.add(jamb);
    });
    var head;
    if (isX) {
      head = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.16, 0.18), jambMat);
    } else {
      head = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, w + 0.3), jambMat);
    }
    head.position.set(def.x, h + 0.08, def.z);
    scene.add(head);

    // 门楣过梁：门洞是整面墙高（3.3 米）开出来的，门只有 2.15 米。
    // 不补这一段的话，从走廊能直接看到门上方 1 米多的洞（像墙体破了个口子）。
    var lintelH = HMAP.WH - (h + 0.16);
    if (lintelH > 0.02) {
      var lintel;
      if (isX) {
        lintel = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, lintelH, HMAP.IT),
          HMAP.wallMatFor(w, lintelH));
      } else {
        lintel = new THREE.Mesh(new THREE.BoxGeometry(HMAP.IT, lintelH, w + 0.02),
          HMAP.wallMatFor(w, lintelH));
      }
      lintel.position.set(def.x, h + 0.16 + lintelH / 2, def.z);
      lintel.castShadow = true;
      lintel.receiveShadow = true;
      scene.add(lintel);
    }

    // 门牌：房间名（自发光小牌，黑暗里也能看清）。
    // 新门用 def.label 显式指定文字；朝向：横墙门牌贴在走廊那一面。
    var signRy = isX ? (def.z < 0 ? 0 : Math.PI) : Math.PI / 2 * (def.x > 0 ? -1 : 1);
    var sign = hmMakeSign(def.label || def.id.replace('d_', ''), def.x, h + 0.42, def.z, signRy);
    if (isX) {
      // hmMakeSign 里的偏移是给竖墙用的（沿 x 推出 0.22），横墙门改成沿 z 推出
      sign.position.set(def.x, h + 0.42, def.z + (def.z < 0 ? 0.22 : -0.22));
    }

    var door = {
      id: def.id,
      x: def.x,
      z: def.z,
      w: w,
      h: h,
      horiz: isX,          // 朝向标记：关门的碰撞盒 / 小地图都要转 90°
      group: grp,
      open: false,
      angle: 0,            // 0 = 关，1 = 全开
      target: 0,
      baseRot: baseRot,
      openSign: openSign,
      sign: sign,
      blockedUntil: 0,
      lastToggleAt: 0
    };
    HMAP.doors.push(door);
    HMAP.doorMap[def.id] = door;
  });
}

// 发光门牌（canvas 小贴图）
function hmMakeSign(text, x, y, z, ry) {
  var labelMap = {
    or: '手术室', wardA: '病房 A', morgue: '太平间', icu: '重症室',
    pharm: '药房', wardB: '病房 B', er: '急诊室', stair: '楼梯间'
  };
  var txt = labelMap[text] || '';
  var c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  var g = c.getContext('2d');
  g.fillStyle = '#0d1a12';
  g.fillRect(0, 0, 256, 64);
  g.strokeStyle = 'rgba(90,150,110,0.65)';
  g.lineWidth = 3;
  g.strokeRect(3, 3, 250, 58);
  g.fillStyle = '#9fffc4';
  g.font = 'bold 34px "Microsoft YaHei", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(txt, 128, 34);
  var tex = new THREE.CanvasTexture(c);
  if (THREE.SRGBColorSpace !== undefined) tex.colorSpace = THREE.SRGBColorSpace;
  var mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1.15, 0.29),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.92, depthWrite: false })
  );
  mesh.position.set(x + (x > 0 ? -0.22 : 0.22), y, z);
  mesh.rotation.y = ry;
  scene.add(mesh);
  return mesh;
}

// ---------- 楼梯 ----------
function buildHospitalStairs() {
  var M = HMAP.mats;
  var s = HMAP.stair;
  var w = s.x1 - s.x0;
  var run = s.z1 - s.z0;
  var steps = s.steps;
  var rise = HMAP.ROOF / steps;
  var tread = run / steps;
  var stepMat = HMAP.wallMatFor(2.0, 0.6);

  for (var i = 0; i < steps; i++) {
    var h = rise * (i + 1);
    var st = new THREE.Mesh(new THREE.BoxGeometry(w, h, tread + 0.02), stepMat);
    st.position.set((s.x0 + s.x1) / 2, h / 2, s.z0 + tread * (i + 0.5));
    st.castShadow = true;
    st.receiveShadow = true;
    scene.add(st);
    // 踏面：比踢面深一档的深色板，让台阶在正面/侧面都能看清一级一级
    // （整级做成"从 0 到 h 的实心盒子"时，正面看就是一堵墙，完全没有台阶感）
    var top = new THREE.Mesh(new THREE.BoxGeometry(w - 0.1, 0.04, tread * 0.94), M.steelDark);
    top.position.set((s.x0 + s.x1) / 2, h + 0.02, s.z0 + tread * (i + 0.5));
    top.receiveShadow = true;
    scene.add(top);
    // 防滑条
    var nose = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, 0.08), M.steel);
    nose.position.set((s.x0 + s.x1) / 2, h + 0.03, s.z0 + tread * (i + 1) - 0.06);
    scene.add(nose);
  }

  // 楼梯两侧的墙（防止从侧面掉下去），高度跟随坡度
  [s.x0, s.x1].forEach(function (sx) {
    var side = new THREE.Mesh(new THREE.BoxGeometry(0.24, HMAP.ROOF + 1.1, run), HMAP.wallMatFor(run, HMAP.ROOF + 1.1));
    side.position.set(sx, (HMAP.ROOF + 1.1) / 2, (s.z0 + s.z1) / 2);
    side.castShadow = true;
    side.receiveShadow = true;
    scene.add(side);
    HMAP.wallList.push({ x: sx, z: (s.z0 + s.z1) / 2, w: 0.24, d: run, y0: 0, y1: HMAP.ROOF + 1.1, mesh: side });
  });

  // 楼梯背面封墙：从楼梯后方（z > z1）以地面高度走进台阶内部时，
  // floorYAt 会把脚底瞬间抬到台阶高度 —— 表现为"人突然被吸到半空"。
  // 封一段 3.2 米高的墙挡住地面高度的人和怪；屋顶层（y=3.7）不受影响。
  var backWall = new THREE.Mesh(
    new THREE.BoxGeometry(s.x1 - s.x0 + 0.5, 3.2, 0.3),
    HMAP.wallMatFor(s.x1 - s.x0, 3.2)
  );
  backWall.position.set((s.x0 + s.x1) / 2, 1.6, s.z1 + 0.15);
  backWall.castShadow = true;
  backWall.receiveShadow = true;
  scene.add(backWall);
  HMAP.wallList.push({ x: (s.x0 + s.x1) / 2, z: s.z1 + 0.15, w: s.x1 - s.x0 + 0.5, d: 0.3, y0: 0, y1: 3.2, mesh: backWall });

  // 扶手（沿坡度）
  var railMat = M.steel;
  [s.x0 + 0.35, s.x1 - 0.35].forEach(function (rx) {
    for (var i = 0; i <= 6; i++) {
      var t = i / 6;
      var pz = s.z0 + run * t;
      var py = HMAP.ROOF * t;
      var post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.95, 6), railMat);
      post.position.set(rx, py + 0.48, pz);
      scene.add(post);
    }
    var rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, Math.sqrt(run * run + HMAP.ROOF * HMAP.ROOF)), railMat);
    rail.position.set(rx, HMAP.ROOF / 2 + 0.95, (s.z0 + s.z1) / 2);
    rail.rotation.x = -Math.atan2(HMAP.ROOF, run);
    scene.add(rail);
  });
}

// ---------- 屋顶 ----------
function buildHospitalRoof() {
  var M = HMAP.mats;
  var B = HMAP.B, ROOF = HMAP.ROOF, WH = HMAP.WH;
  var s = HMAP.stair;

  // 楼板 = 室内天花板。挖掉楼梯口
  function slab(cx, cz, w, d) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(w, ROOF - WH, d), M.ceiling);
    m.position.set(cx, (WH + ROOF) / 2, cz);
    m.receiveShadow = true;
    m.castShadow = true;
    scene.add(m);
    return m;
  }
  var holeZ0 = s.z0 - 0.5, holeZ1 = s.z1 + 0.6;
  var holeX0 = s.x0 - 0.5, holeX1 = s.x1 + 0.5;
  slab(0, (-B + holeZ0) / 2, B * 2, holeZ0 + B);
  slab(0, (holeZ1 + B) / 2, B * 2, B - holeZ1);
  slab((-B + holeX0) / 2, (holeZ0 + holeZ1) / 2, holeX0 + B, holeZ1 - holeZ0);
  slab((holeX1 + B) / 2, (holeZ0 + holeZ1) / 2, B - holeX1, holeZ1 - holeZ0);

  // 屋顶地面（抬高 1.2cm：贴着楼板顶面会 z-fighting，
  // 表现出来就是远景里地板一块块闪成吊顶的花纹）
  var roofFloor = new THREE.Mesh(new THREE.PlaneGeometry(B * 2 - 0.6, B * 2 - 0.6), M.roof);
  roofFloor.rotation.x = -Math.PI / 2;
  roofFloor.position.set(0, ROOF + 0.012, 0);
  roofFloor.receiveShadow = true;
  scene.add(roofFloor);

  // 女儿墙（防跌落）+ 碰撞
  var ph = 1.15;
  var pMats = HMAP.wallMatFor(100, ph);
  [[0, -B + 0.25, B * 2 - 0.5, 0.5], [0, B - 0.25, B * 2 - 0.5, 0.5],
  [-B + 0.25, 0, 0.5, B * 2 - 0.5], [B - 0.25, 0, 0.5, B * 2 - 0.5]].forEach(function (p) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(p[2], ph, p[3]), pMats);
    m.position.set(p[0], ROOF + ph / 2, p[1]);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
    HMAP.wallList.push({ x: p[0], z: p[1], w: p[2], d: p[3], y0: ROOF, y1: ROOF + ph, mesh: m });
  });

  // 楼梯口的护栏（留出朝 +z 的出口）
  var guardMat = M.steelDark;
  function guard(cx, cz, w, d) {
    var g = new THREE.Mesh(new THREE.BoxGeometry(w, 1.0, d), guardMat);
    g.position.set(cx, ROOF + 0.5, cz);
    g.castShadow = true;
    scene.add(g);
    HMAP.wallList.push({ x: cx, z: cz, w: w, d: d, y0: ROOF, y1: ROOF + 1.0, mesh: g });
  }
  guard(s.x0 - 0.6, (s.z0 + s.z1) / 2, 0.16, s.z1 - s.z0 + 1.2);   // 西侧
  guard(s.x1 + 0.6, (s.z0 + s.z1) / 2, 0.16, s.z1 - s.z0 + 1.2);   // 东侧
  guard((s.x0 + s.x1) / 2, s.z0 - 0.6, s.x1 - s.x0 + 1.4, 0.16);   // 南侧（楼梯底上方）

  // 屋顶杂物：水箱、空调外机、通风管、天线
  hmRoofProps();
}

// ---------- 屋顶道具 ----------
function hmRoofProps() {
  var M = HMAP.mats;
  var ROOF = HMAP.ROOF;

  // 水箱
  var tank = new THREE.Group();
  var body = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 2.6, 16), M.rust);
  body.position.y = 1.9;
  body.castShadow = true;
  tank.add(body);
  var cap = new THREE.Mesh(new THREE.ConeGeometry(2.5, 0.7, 16), M.steelDark);
  cap.position.y = 3.5;
  tank.add(cap);
  for (var i = 0; i < 4; i++) {
    var a = i * Math.PI / 2 + 0.4;
    var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 1.2, 6), M.steelDark);
    leg.position.set(Math.cos(a) * 1.8, 0.6, Math.sin(a) * 1.8);
    tank.add(leg);
  }
  tank.position.set(-28, ROOF, -28);
  scene.add(tank);
  HMAP.wallList.push({ x: -28, z: -28, w: 4.6, d: 4.6, y0: ROOF, y1: ROOF + 3.2 });

  // 空调外机
  [[10, -30], [18, -30], [26, -30], [-14, 26], [-22, 26]].forEach(function (p) {
    var ac = new THREE.Group();
    var box = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 1.5), M.steel);
    box.position.y = 0.55;
    box.castShadow = true;
    ac.add(box);
    var fan = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.12, 14), M.steelDark);
    fan.rotation.x = Math.PI / 2;
    fan.position.set(0, 0.62, 0.78);
    ac.add(fan);
    ac.position.set(p[0], ROOF, p[1]);
    scene.add(ac);
    HMAP.wallList.push({ x: p[0], z: p[1], w: 2.2, d: 1.5, y0: ROOF, y1: ROOF + 1.1 });
  });

  // 通风管（弯头），横穿屋顶制造遮挡
  var ductMat = M.steel;
  var duct = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.0, 16), ductMat);
  duct.position.set(-6, ROOF + 1.4, 30);
  duct.castShadow = true;
  scene.add(duct);
  [-1, 1].forEach(function (sgn) {
    var leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.4, 0.14), M.steelDark);
    leg.position.set(-6 + sgn * 0.4, ROOF + 0.7, 30 + sgn * 7);
    scene.add(leg);
  });
  HMAP.wallList.push({ x: -6, z: 30, w: 1.1, d: 16, y0: ROOF + 0.9, y1: ROOF + 1.9 });

  // 天线
  var mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 7, 6), M.steelDark);
  mast.position.set(34, ROOF + 3.5, -34);
  scene.add(mast);
  [[1.1, 3.2], [0.8, 5.2]].forEach(function (b) {
    var bar = new THREE.Mesh(new THREE.BoxGeometry(b[0], 0.05, 0.05), M.steelDark);
    bar.position.set(34, ROOF + b[1], -34);
    scene.add(bar);
  });
  // 航空障碍灯（红色闪烁）
  var warn = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 8),
    M.std(0xff2a2a, { emissive: 0xff0000, emissiveIntensity: 2.0, rough: 0.3 }));
  warn.position.set(34, ROOF + 7.1, -34);
  scene.add(warn);
  HMAP.warnLight = warn;

  // 停机坪两侧的泛光灯：夜里天台全靠这两盏找方向
  [[-14, 14], [2, -2]].forEach(function (p, i) {
    var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 5.2, 8), M.steelDark);
    pole.position.set(p[0], ROOF + 2.6, p[1]);
    scene.add(pole);
    var head = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.28, 0.5), M.steelDark);
    head.position.set(p[0], ROOF + 5.3, p[1]);
    head.rotation.x = 0.35;
    scene.add(head);
    var lens = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.42),
      M.std(0xfff4d0, { emissive: 0xfff0c0, emissiveIntensity: 2.2, rough: 0.3 }));
    lens.position.set(p[0], ROOF + 5.16, p[1] + 0.22);
    lens.rotation.x = -Math.PI / 2 + 0.35;
    scene.add(lens);
    var pl = new THREE.PointLight(0xfff0c8, 1.15, 22, 2);
    pl.position.set(p[0], ROOF + 4.9, p[1]);
    scene.add(pl);
    HMAP.lights.push({ light: pl, base: 1.15, phase: Math.random() * 8, mode: i === 1 ? 'flicker' : 'pulse' });
    HMAP.wallList.push({ x: p[0], z: p[1], w: 0.4, d: 0.4, y0: ROOF, y1: ROOF + 5.2 });
  });
}

// ============================================================
// 房间道具
// ============================================================
function buildHospitalProps() {
  var M = HMAP.mats;

  // ---------- 病床 ----------
  function bed(x, z, ry, dirty) {
    var g = new THREE.Group();
    var frame = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.16, 0.94), M.steelDark);
    frame.position.y = 0.52;
    frame.castShadow = true;
    frame.receiveShadow = true;
    g.add(frame);

    var mat = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.18, 0.86), dirty ? M.sheetDirty : M.sheet);
    mat.position.y = 0.66;
    mat.castShadow = true;
    g.add(mat);

    // 床头 / 床尾
    [-1, 1].forEach(function (s) {
      var bars = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.62, 0.94), M.steel);
      bars.position.set(s * 0.97, 0.78, 0);
      g.add(bars);
    });
    // 护栏
    [1, -1].forEach(function (s) {
      var rail = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.05, 0.05), M.steel);
      rail.position.set(0, 0.95, s * 0.44);
      g.add(rail);
      [-0.5, 0.5].forEach(function (rx) {
        var post = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.34, 0.05), M.steel);
        post.position.set(rx, 0.78, s * 0.44);
        g.add(post);
      });
    });
    // 四条腿 + 轮子
    [[-0.85, -0.4], [-0.85, 0.4], [0.85, -0.4], [0.85, 0.4]].forEach(function (p) {
      var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 6), M.steelDark);
      leg.position.set(p[0], 0.26, p[1]);
      g.add(leg);
      var wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.05, 8), M.dark);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(p[0], 0.075, p[1]);
      g.add(wheel);
    });
    // 枕头
    var pillow = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.62), M.sheet);
    pillow.position.set(-0.66, 0.78, 0);
    g.add(pillow);
    // 脏枕头上的一点血
    if (dirty) {
      var stain = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5), bloodPlaneMat(1));
      stain.rotation.x = -Math.PI / 2;
      stain.position.set(0.1, 0.76, 0);
      g.add(stain);
    }

    g.position.set(x, 0, z);
    g.rotation.y = ry || 0;
    scene.add(g);
    HMAP.wallList.push({ x: x, z: z, w: 1.9, d: 0.8, y0: 0, y1: 0.75, rotRy: ry || 0 });
    return g;
  }

  // ---------- 输液架 ----------
  function ivStand(x, z) {
    var g = new THREE.Group();
    var base = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.05, 10), M.steelDark);
    base.position.y = 0.03;
    g.add(base);
    var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 1.85, 8), M.steel);
    pole.position.y = 0.95;
    g.add(pole);
    var hook = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.018, 5, 10, Math.PI), M.steel);
    hook.position.set(0.08, 1.86, 0);
    hook.rotation.y = Math.PI / 2;
    g.add(hook);
    var bag = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.3, 0.06), M.glass);
    bag.position.set(0.16, 1.62, 0);
    g.add(bag);
    g.position.set(x, 0, z);
    g.rotation.y = Math.random() * Math.PI;
    scene.add(g);
  }

  // ---------- 轮椅 ----------
  function wheelchair(x, z, ry, tipped) {
    var g = new THREE.Group();
    var seat = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.08, 0.5), M.steelDark);
    seat.position.y = 0.5;
    g.add(seat);
    var back = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.56, 0.07), M.steelDark);
    back.position.set(0, 0.78, -0.24);
    g.add(back);
    [-1, 1].forEach(function (s) {
      var wheel = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.045, 6, 16), M.dark);
      wheel.rotation.y = Math.PI / 2;
      wheel.position.set(s * 0.31, 0.32, -0.02);
      g.add(wheel);
      var small = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.03, 5, 12), M.dark);
      small.rotation.y = Math.PI / 2;
      small.position.set(s * 0.29, 0.11, 0.3);
      g.add(small);
      var arm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.42), M.steel);
      arm.position.set(s * 0.3, 0.62, 0);
      g.add(arm);
    });
    var foot = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.16), M.steel);
    foot.position.set(0, 0.16, 0.36);
    g.add(foot);

    g.position.set(x, 0, z);
    g.rotation.y = ry || 0;
    if (tipped) {
      g.rotation.z = 1.5;
      g.position.y = 0.4;
    }
    scene.add(g);
  }

  // ---------- 推车 / 担架车 ----------
  function gurney(x, z, ry, bodyBag) {
    var g = new THREE.Group();
    var top = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.1, 0.72), M.steel);
    top.position.y = 0.78;
    top.castShadow = true;
    g.add(top);
    var pad = new THREE.Mesh(new THREE.BoxGeometry(1.84, 0.08, 0.68), bodyBag ? M.dark : M.sheetDirty);
    pad.position.y = 0.86;
    g.add(pad);
    [[-0.82, -0.28], [-0.82, 0.28], [0.82, -0.28], [0.82, 0.28]].forEach(function (p) {
      var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.74, 6), M.steelDark);
      leg.position.set(p[0], 0.38, p[1]);
      g.add(leg);
      var wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 8), M.dark);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(p[0], 0.07, p[1]);
      g.add(wheel);
    });
    // 尸体袋：隆起 + 拉链
    if (bodyBag) {
      var bag = new THREE.Mesh(new THREE.CapsuleGeometry(0.27, 1.28, 4, 8), M.dark);
      bag.rotation.z = Math.PI / 2;
      bag.position.y = 1.08;
      bag.scale.set(0.75, 1, 0.92);
      g.add(bag);
      var zip = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.02, 0.04), M.steel);
      zip.position.set(0, 1.3, 0);
      g.add(zip);
    }
    g.position.set(x, 0, z);
    g.rotation.y = ry || 0;
    scene.add(g);
    HMAP.wallList.push({ x: x, z: z, w: 1.9, d: 0.75, y0: 0, y1: 0.9, rotRy: ry || 0 });
  }

  // ---------- 手术台 ----------
  function opTable(x, z, ry) {
    var g = new THREE.Group();
    var col = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 0.7, 10), M.steel);
    col.position.y = 0.36;
    g.add(col);
    var table = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.12, 0.72), M.steel);
    table.position.y = 0.78;
    table.castShadow = true;
    g.add(table);
    var pad = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.06, 0.66), M.sheetDirty);
    pad.position.y = 0.86;
    g.add(pad);
    // 血迹
    var stain = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.6), bloodPlaneMat(2));
    stain.rotation.x = -Math.PI / 2;
    stain.position.y = 0.9;
    g.add(stain);
    // 手术灯（吊装）
    var armMat = M.steel;
    var arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.5, 6), armMat);
    arm.rotation.z = Math.PI / 2;
    arm.position.set(0.5, HMAP.WH - 0.45, 0);
    g.add(arm);
    var lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.34, 0.2, 14), M.steel);
    lamp.position.set(-0.35, HMAP.WH - 0.55, 0);
    g.add(lamp);
    var lampGlow = new THREE.Mesh(new THREE.CircleGeometry(0.32, 14),
      M.std(0xfff8dc, { emissive: 0xfff0b0, emissiveIntensity: 1.5, rough: 0.3 }));
    lampGlow.rotation.x = Math.PI / 2;
    lampGlow.position.set(-0.35, HMAP.WH - 0.66, 0);
    g.add(lampGlow);
    // 无影灯真的给一盏点光
    var pl = new THREE.PointLight(0xfff0c0, 0.55, 9, 2);
    pl.position.set(-0.35, HMAP.WH - 0.9, 0);
    g.add(pl);

    g.position.set(x, 0, z);
    g.rotation.y = ry || 0;
    scene.add(g);
    HMAP.wallList.push({ x: x, z: z, w: 1.9, d: 0.75, y0: 0, y1: 0.9, rotRy: ry || 0 });
  }

  // ---------- 太平间抽屉墙 ----------
  function morgueWall(x, z, ry, cols, rows) {
    var g = new THREE.Group();
    var wUnit = 0.92, hUnit = 0.72;
    var wTotal = cols * wUnit, hTotal = rows * hUnit;
    var back = new THREE.Mesh(new THREE.BoxGeometry(wTotal + 0.16, hTotal + 0.16, 0.5), M.steelDark);
    back.position.set(0, hTotal / 2 + 0.1, 0);
    back.castShadow = true;
    back.receiveShadow = true;
    g.add(back);

    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var opened = Math.random() > 0.87;
        var px = -wTotal / 2 + wUnit * (c + 0.5);
        var py = 0.1 + hUnit * (r + 0.5);
        var door = new THREE.Mesh(new THREE.BoxGeometry(wUnit - 0.05, hUnit - 0.05, 0.09), M.steel);
        door.position.set(px, py, 0.3 + (opened ? 0.55 : 0));
        if (opened) door.rotation.y = -0.5;
        g.add(door);
        // 把手
        var hd = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 0.05), M.steelDark);
        hd.position.set(px + wUnit * 0.32, py, 0.36 + (opened ? 0.5 : 0));
        if (opened) hd.rotation.y = -0.5;
        g.add(hd);
        // 拉开的那格里露出黑洞
        if (opened) {
          var hole = new THREE.Mesh(new THREE.PlaneGeometry(wUnit - 0.1, hUnit - 0.1),
            new THREE.MeshBasicMaterial({ color: 0x050505 }));
          hole.position.set(px, py, 0.26);
          g.add(hole);
        }
      }
    }
    g.position.set(x, 0, z);
    g.rotation.y = ry || 0;
    scene.add(g);
    HMAP.wallList.push({ x: x, z: z, w: wTotal, d: 0.7, y0: 0, y1: hTotal + 0.1, rotRy: ry || 0 });
  }

  // ---------- 货架（药房） ----------
  function shelf(x, z, ry) {
    var g = new THREE.Group();
    var sideMat = M.steelDark;
    [-1, 1].forEach(function (s) {
      var side = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.9, 0.5), sideMat);
      side.position.set(s * 0.85, 0.95, 0);
      g.add(side);
    });
    for (var i = 0; i < 4; i++) {
      var s2 = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.05, 0.5), M.steel);
      s2.position.y = 0.25 + i * 0.5;
      g.add(s2);
      // 药盒
      for (var b = 0; b < 6; b++) {
        if (Math.random() > 0.62) continue;
        var box = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2 + Math.random() * 0.1, 0.2),
          M.std([0xd8d2bd, 0xb9c9b2, 0xd0b9b9][Math.floor(Math.random() * 3)], { rough: 0.85 }));
        box.position.set(-0.7 + b * 0.26, 0.37 + i * 0.5, 0);
        box.rotation.y = (Math.random() - 0.5) * 0.3;
        g.add(box);
      }
    }
    g.position.set(x, 0, z);
    g.rotation.y = ry || 0;
    scene.add(g);
    HMAP.wallList.push({ x: x, z: z, w: 1.8, d: 0.55, y0: 0, y1: 1.9, rotRy: ry || 0 });
  }

  // ---------- 桌椅 / 柜台 ----------
  function desk(x, z, ry, w) {
    var g = new THREE.Group();
    var top = new THREE.Mesh(new THREE.BoxGeometry(w || 2.4, 0.08, 0.8), M.steelDark);
    top.position.y = 0.95;
    top.castShadow = true;
    g.add(top);
    var front = new THREE.Mesh(new THREE.BoxGeometry(w || 2.4, 0.9, 0.08), M.paint);
    front.position.set(0, 0.48, 0.36);
    g.add(front);
    [-1, 1].forEach(function (s) {
      var leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.95, 0.7), M.steelDark);
      leg.position.set(s * ((w || 2.4) / 2 - 0.1), 0.47, 0);
      g.add(leg);
    });
    // 电脑/显示器
    if (Math.random() > 0.4) {
      var mon = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.36, 0.05), M.dark);
      mon.position.set(0.4, 1.2, -0.15);
      mon.rotation.x = -0.12;
      g.add(mon);
      var scr = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.3),
        M.std(0x0e2a18, { emissive: 0x1f6b3a, emissiveIntensity: 0.55, rough: 0.4 }));
      scr.position.set(0.4, 1.2, -0.11);
      scr.rotation.x = -0.12;
      g.add(scr);
    }
    g.position.set(x, 0, z);
    g.rotation.y = ry || 0;
    scene.add(g);
    HMAP.wallList.push({ x: x, z: z, w: w || 2.4, d: 0.85, y0: 0, y1: 1.0, rotRy: ry || 0 });
  }

  // ---------- 椅子（塑料等候椅） ----------
  function chair(x, z, ry, tipped) {
    var g = new THREE.Group();
    var seat = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.06, 0.44), M.steelDark);
    seat.position.y = 0.45;
    g.add(seat);
    var back = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.5, 0.05), M.steelDark);
    back.position.set(0, 0.7, -0.2);
    back.rotation.x = -0.1;
    g.add(back);
    [[-0.18, -0.17], [0.18, -0.17], [-0.18, 0.17], [0.18, 0.17]].forEach(function (p) {
      var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.45, 5), M.steel);
      leg.position.set(p[0], 0.22, p[1]);
      g.add(leg);
    });
    g.position.set(x, 0, z);
    g.rotation.y = ry || 0;
    if (tipped) { g.rotation.z = 1.5; g.position.y = 0.28; }
    scene.add(g);
  }

  // ---------- 散落纸张 ----------
  function papers(x, z, count) {
    for (var i = 0; i < count; i++) {
      var p = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.29), M.paper);
      p.rotation.x = -Math.PI / 2;
      p.rotation.z = Math.random() * Math.PI;
      p.position.set(x + (Math.random() - 0.5) * 2.6, 0.012 + Math.random() * 0.004, z + (Math.random() - 0.5) * 2.6);
      scene.add(p);
    }
  }

  // ---------- 水坑 ----------
  function puddle(x, z, r) {
    var mat = new THREE.MeshStandardMaterial({
      color: 0x1a2a22, roughness: 0.06, metalness: 0.5,
      transparent: true, opacity: 0.72
    });
    var p = new THREE.Mesh(new THREE.CircleGeometry(r, 16), mat);
    p.rotation.x = -Math.PI / 2;
    p.position.set(x, 0.014, z);
    p.scale.set(1, 1, 0.7 + Math.random() * 0.6);
    scene.add(p);
  }

  // ============================================================
  // 医院里"该有但原来没有"的东西
  // ------------------------------------------------------------
  // 之前每个房间只有 3~5 件家具，走廊几乎是空的，走进去像个毛坯房。
  // 这里补齐一批真实医院常见的物件：医疗柜、床头柜、床帘、监护仪推车、
  // 输液泵、医疗废物桶、自动贩卖机、饮水机、消防箱、公告板、挂钟、
  // 电视、X 光片灯箱、折叠屏风、器械推车、消毒柜、更衣柜、干枯盆栽…
  // 体量大的都会 push 进 wallList 参与碰撞（小的只做视觉）。
  // ============================================================

  /** 登记碰撞盒（地面层障碍） */
  function solid(x, z, w, d, h, ry) {
    HMAP.wallList.push({ x: x, z: z, w: w, d: d, y0: 0, y1: h, rotRy: ry || 0 });
  }

  // ---------- 医疗柜：钢板双开门 + 上格玻璃 ----------
  function cabinet(x, z, ry, w, h) {
    var W = w || 1.15, Hh = h || 1.85;
    var g = new THREE.Group();
    var body = new THREE.Mesh(new THREE.BoxGeometry(W, Hh, 0.46), M.paint);
    body.position.y = Hh / 2;
    hcShadow(body, true);
    g.add(body);
    var glass = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.12, Hh * 0.34), M.glass);
    glass.position.set(0, Hh * 0.77, 0.235);
    g.add(glass);
    [-1, 1].forEach(function (sd) {
      var door = new THREE.Mesh(new THREE.BoxGeometry(W / 2 - 0.05, Hh * 0.5, 0.03), M.steel);
      door.position.set(sd * (W / 4), Hh * 0.28, 0.235);
      g.add(door);
      var hd = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.16, 0.028), M.steelDark);
      hd.position.set(sd * 0.06, Hh * 0.28, 0.26);
      g.add(hd);
    });
    // 柜顶堆的纸箱
    var box = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.3, 0.36), M.paper);
    box.position.set(-W * 0.2, Hh + 0.15, 0);
    box.rotation.y = 0.2;
    g.add(box);
    g.position.set(x, 0, z);
    g.rotation.y = ry || 0;
    scene.add(g);
    solid(x, z, W, 0.5, Hh, ry);
  }

  // ---------- 床头柜 ----------
  function nightstand(x, z, ry) {
    var g = new THREE.Group();
    var body = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.62, 0.44), M.paint);
    body.position.y = 0.31;
    hcShadow(body, true);
    g.add(body);
    var drawer = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.16, 0.02), M.steel);
    drawer.position.set(0, 0.46, 0.22);
    g.add(drawer);
    var knob = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.02), M.steelDark);
    knob.position.set(0, 0.46, 0.24);
    g.add(knob);
    // 水杯 + 药瓶 + 纸巾盒
    var cup = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.1, 8), M.glass);
    cup.position.set(-0.12, 0.67, 0.06);
    g.add(cup);
    var pill = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.08, 8),
      M.std(0xd8e4d0, { rough: 0.35, transparent: true, opacity: 0.85 }));
    pill.position.set(0.06, 0.66, -0.04);
    g.add(pill);
    var tissue = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.12), M.paper);
    tissue.position.set(0.12, 0.66, 0.1);
    g.add(tissue);
    g.position.set(x, 0, z);
    g.rotation.y = ry || 0;
    scene.add(g);
    solid(x, z, 0.5, 0.46, 0.65, ry);
  }

  // ---------- 折叠餐桌 + 两把椅子 ----------
  function diningSet(x, z, ry) {
    var g = new THREE.Group();
    var top = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 18), M.paint);
    top.position.y = 0.72;
    hcShadow(top);
    g.add(top);
    var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.7, 8), M.steelDark);
    pole.position.y = 0.36;
    g.add(pole);
    var base = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.26, 0.04, 12), M.steelDark);
    base.position.y = 0.02;
    g.add(base);
    // 托盘 + 碗
    var tray = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.03, 0.26), M.steel);
    tray.position.set(0.1, 0.76, 0.04);
    g.add(tray);
    var bowl = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.gauze);
    bowl.position.set(0.1, 0.78, 0.04);
    bowl.rotation.x = Math.PI;
    g.add(bowl);
    var cup2 = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.028, 0.09, 8), M.glass);
    cup2.position.set(-0.14, 0.79, -0.08);
    g.add(cup2);
    g.position.set(x, 0, z);
    g.rotation.y = ry || 0;
    scene.add(g);
    solid(x, z, 0.9, 0.9, 0.75, ry);
    // 两把椅子相对而坐
    var a = (ry || 0);
    chair(x + Math.cos(a) * 0.72, z - Math.sin(a) * 0.72, a + Math.PI / 2, false);
    chair(x - Math.cos(a) * 0.72, z + Math.sin(a) * 0.72, a - Math.PI / 2, Math.random() > 0.75);
  }

  // ---------- 床帘（隔断布帘 + 轨道杆） ----------
  function bedCurtain(x, z, ry, len) {
    var L = len || 3.2;
    var g = new THREE.Group();
    var rod = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, L, 8), M.steel);
    rod.rotation.z = Math.PI / 2;
    rod.position.y = 2.25;
    g.add(rod);
    [-1, 1].forEach(function (sd) {
      var bracket = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.05), M.steelDark);
      bracket.position.set(sd * (L / 2 - 0.1), 2.3, 0);
      g.add(bracket);
    });
    var clothMat = new THREE.MeshStandardMaterial({
      color: 0xc8d6d2, roughness: 0.95, transparent: true, opacity: 0.62, side: THREE.DoubleSide
    });
    // 三片帘子，有的拉歪了
    for (var i = 0; i < 3; i++) {
      var w = L / 3.2;
      var panel = new THREE.Mesh(new THREE.PlaneGeometry(w, 2.0, 3, 1), clothMat);
      panel.position.set(-L / 2 + w * (i + 0.5) + (Math.random() - 0.5) * 0.2, 1.22, 0);
      panel.rotation.y = (Math.random() - 0.5) * 0.2;
      g.add(panel);
    }
    g.position.set(x, 0, z);
    g.rotation.y = ry || 0;
    scene.add(g);
  }

  // ---------- 监护仪推车 ----------
  function monitorCart(x, z, ry) {
    var g = new THREE.Group();
    var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.35, 8), M.steel);
    pole.position.y = 0.68;
    g.add(pole);
    var base = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.04, 10), M.steelDark);
    base.position.y = 0.02;
    g.add(base);
    for (var i = 0; i < 3; i++) {
      var wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 8), M.dark);
      wheel.rotation.z = Math.PI / 2;
      var a = i * Math.PI * 2 / 3;
      wheel.position.set(Math.cos(a) * 0.16, 0.05, Math.sin(a) * 0.16);
      g.add(wheel);
    }
    var body = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.34, 0.16), M.steelDark);
    body.position.y = 1.42;
    body.rotation.x = -0.15;
    g.add(body);
    var scr = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.26),
      M.std(0x08200f, { emissive: 0x2fff7a, emissiveIntensity: 0.8, rough: 0.35 }));
    scr.position.set(0, 1.43, 0.09);
    scr.rotation.x = -0.15;
    g.add(scr);
    // 垂下来的线缆
    var cable = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.9, 5), M.dark);
    cable.position.set(0.1, 0.95, 0.06);
    cable.rotation.z = 0.12;
    g.add(cable);
    g.position.set(x, 0, z);
    g.rotation.y = ry || 0;
    scene.add(g);
    solid(x, z, 0.45, 0.45, 1.5);
  }

  // ---------- 输液泵（挂在输液架上的小盒子） ----------
  function ivPump(x, z) {
    var g = new THREE.Group();
    var body = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.2, 0.14), M.steelDark);
    body.position.y = 1.28;
    g.add(body);
    var scr = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.1),
      M.std(0x120c04, { emissive: 0xffa53c, emissiveIntensity: 0.9, rough: 0.3 }));
    scr.position.set(0, 1.32, 0.075);
    g.add(scr);
    var tube = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.7, 5), M.glass);
    tube.position.set(0.06, 0.9, 0.03);
    g.add(tube);
    g.position.set(x, 0, z);
    scene.add(g);
  }

  // ---------- 医疗废物桶（黄色 + 生物危害标） ----------
  function bioBin(x, z) {
    var g = new THREE.Group();
    var body = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.18, 0.58, 14),
      M.std(0xd8b42a, { rough: 0.6 }));
    body.position.y = 0.29;
    hcShadow(body, true);
    g.add(body);
    var lid = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.06, 14), M.steelDark);
    lid.position.y = 0.6;
    g.add(lid);
    // 桶身的警示条
    var band = new THREE.Mesh(new THREE.CylinderGeometry(0.213, 0.213, 0.1, 14, 1, true),
      M.std(0x1a1a18, { rough: 0.7, side: THREE.DoubleSide }));
    band.position.y = 0.4;
    g.add(band);
    var label = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), M.std(0xf0e6c0, { rough: 0.8 }));
    label.position.set(0, 0.28, 0.205);
    g.add(label);
    g.position.set(x, 0, z);
    g.rotation.y = Math.random() * Math.PI * 2;
    scene.add(g);
  }

  // ---------- 普通垃圾桶 ----------
  function trashBin(x, z) {
    var g = new THREE.Group();
    var body = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.16, 0.5, 12), M.steelDark);
    body.position.y = 0.25;
    g.add(body);
    var bag = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.19, 0.06, 12), M.dark);
    bag.position.y = 0.52;
    g.add(bag);
    g.position.set(x, 0, z);
    scene.add(g);
  }

  // ---------- 自动贩卖机（面板发光） ----------
  function vending(x, z, ry) {
    var g = new THREE.Group();
    var body = new THREE.Mesh(new THREE.BoxGeometry(0.92, 1.85, 0.62), M.std(0x8a2a2a, { rough: 0.6 }));
    body.position.y = 0.93;
    hcShadow(body, true);
    g.add(body);
    var glass = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.1), M.std(0x14202a, { rough: 0.3, emissive: 0x244a5a, emissiveIntensity: 0.5 }));
    glass.position.set(0, 1.2, 0.315);
    g.add(glass);
    // 一排排饮料
    for (var r = 0; r < 3; r++) {
      for (var c2 = 0; c2 < 4; c2++) {
        var can = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.16, 0.06),
          M.std([0xd85a5a, 0x5a8fd8, 0x5ad8a0, 0xf0c24a][(r + c2) % 4], { rough: 0.5 }));
        can.position.set(-0.26 + c2 * 0.17, 0.78 + r * 0.32, 0.32);
        g.add(can);
      }
    }
    var panel = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.2), M.std(0x101418, { rough: 0.4, emissive: 0x2a3a20, emissiveIntensity: 0.4 }));
    panel.position.set(0.12, 0.5, 0.315);
    g.add(panel);
    var slot = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.05), M.socket);
    slot.position.set(0, 0.3, 0.33);
    g.add(slot);
    g.position.set(x, 0, z);
    g.rotation.y = ry || 0;
    scene.add(g);
    solid(x, z, 0.95, 0.65, 1.85, ry);
  }

  // ---------- 饮水机 ----------
  function waterCooler(x, z) {
    var g = new THREE.Group();
    var body = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.95, 0.34), M.paint);
    body.position.y = 0.48;
    hcShadow(body, true);
    g.add(body);
    var bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.42, 12), M.glass);
    bottle.position.y = 1.18;
    bottle.scale.y = 1;
    g.add(bottle);
    var water = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.3, 12),
      M.std(0x4fb8e8, { rough: 0.2, transparent: true, opacity: 0.7, emissive: 0x1a4a5a, emissiveIntensity: 0.2 }));
    water.position.y = 1.14;
    g.add(water);
    var tap = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.06), M.steel);
    tap.position.set(0, 0.72, 0.2);
    g.add(tap);
    var tray = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.03, 0.14), M.steelDark);
    tray.position.set(0, 0.62, 0.18);
    g.add(tray);
    g.position.set(x, 0, z);
    g.rotation.y = Math.random() * 0.4 - 0.2;
    scene.add(g);
    solid(x, z, 0.42, 0.4, 1.4);
  }

  // ---------- 消防箱 + 灭火器 ----------
  function fireBox(x, z, ry) {
    var g = new THREE.Group();
    var box = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.8, 0.22), M.std(0xa8342a, { rough: 0.6 }));
    box.position.y = 1.1;
    hcShadow(box);
    g.add(box);
    var glass = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.6), M.glass);
    glass.position.set(0, 1.12, 0.12);
    g.add(glass);
    // 地面上的灭火器
    var ext = new THREE.Group();
    var tank = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.46, 12), M.std(0xa8342a, { rough: 0.5 }));
    tank.position.y = 0.23;
    ext.add(tank);
    var cap2 = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.08, 8), M.steelDark);
    cap2.position.y = 0.49;
    ext.add(cap2);
    var hose = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.3, 6), M.dark);
    hose.position.set(0.09, 0.34, 0.02);
    hose.rotation.z = 0.35;
    ext.add(hose);
    ext.position.set(0.45, 0, 0.1);
    g.add(ext);
    g.position.set(x, 0, z);
    g.rotation.y = ry || 0;
    scene.add(g);
  }

  // ---------- 公告板 ----------
  function noticeBoard(x, z, ry) {
    var g = new THREE.Group();
    var board = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.9, 0.06), M.std(0x6b5a3e, { rough: 0.9 }));
    board.position.y = 1.55;
    hcShadow(board);
    g.add(board);
    for (var i = 0; i < 6; i++) {
      var paper = new THREE.Mesh(new THREE.PlaneGeometry(0.2 + Math.random() * 0.1, 0.26),
        M.std([0xe8e4d4, 0xdcd2b8, 0xc8d8d0][i % 3], { rough: 0.9 }));
      paper.position.set(-0.45 + (i % 3) * 0.42, 1.68 - Math.floor(i / 3) * 0.34, 0.04);
      paper.rotation.z = (Math.random() - 0.5) * 0.12;
      g.add(paper);
    }
    g.position.set(x, 0, z);
    g.rotation.y = ry || 0;
    scene.add(g);
  }

  // ---------- 挂钟 ----------
  function wallClock(x, z, ry) {
    var g = new THREE.Group();
    var face = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.05, 16),
      M.std(0xe4e6de, { rough: 0.5, emissive: 0x2a2f28, emissiveIntensity: 0.3 }));
    face.rotation.x = Math.PI / 2;
    face.position.y = 2.4;
    g.add(face);
    var rim = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.02, 6, 20), M.steelDark);
    rim.position.y = 2.4;
    rim.position.z = 0.02;
    g.add(rim);
    var h1 = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.1, 0.008), M.socket);
    h1.position.set(0, 2.44, 0.035);
    g.add(h1);
    var h2 = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.14, 0.008), M.socket);
    h2.position.set(0.05, 2.4, 0.035);
    h2.rotation.z = -1.1;
    g.add(h2);
    g.position.set(x, 0, z);
    g.rotation.y = ry || 0;
    scene.add(g);
  }

  // ---------- 挂壁电视（雪花屏） ----------
  function tvWall(x, z, ry) {
    var g = new THREE.Group();
    var frame = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.62, 0.08), M.socket);
    frame.position.y = 2.2;
    g.add(frame);
    var scr = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.54),
      M.std(0x8a9a94, { rough: 0.3, emissive: 0x5a6a64, emissiveIntensity: 0.6 }));
    scr.position.set(0, 2.2, 0.045);
    g.add(scr);
    g.position.set(x, 0, z);
    g.rotation.y = ry || 0;
    scene.add(g);
  }

  // ---------- X 光片灯箱 ----------
  function xrayBox(x, z, ry) {
    var g = new THREE.Group();
    var box = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.95, 0.1), M.steelDark);
    box.position.y = 1.6;
    g.add(box);
    var glow = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.86),
      M.std(0xdff0ff, { emissive: 0xbfe0ff, emissiveIntensity: 1.1, rough: 0.4 }));
    glow.position.set(0, 1.6, 0.06);
    g.add(glow);
    // 片子上的骨骼阴影
    var bone = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.7),
      M.std(0x5a6f80, { rough: 1, transparent: true, opacity: 0.55 }));
    bone.position.set(0, 1.6, 0.062);
    g.add(bone);
    g.position.set(x, 0, z);
    g.rotation.y = ry || 0;
    scene.add(g);
  }

  // ---------- 折叠屏风 ----------
  function privacyScreen(x, z, ry) {
    var g = new THREE.Group();
    var mat = new THREE.MeshStandardMaterial({ color: 0xb8c6c0, roughness: 0.95, side: THREE.DoubleSide });
    for (var i = 0; i < 3; i++) {
      var panel = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 1.75), mat);
      panel.position.set(-0.64 + i * 0.64, 0.95, Math.abs(i - 1) * -0.12);
      panel.rotation.y = (i - 1) * 0.28;
      g.add(panel);
      var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.1, 5), M.steelDark);
      leg.position.set(-0.64 + i * 0.64, 0.05, 0);
      g.add(leg);
    }
    g.position.set(x, 0, z);
    g.rotation.y = ry || 0;
    scene.add(g);
  }

  // ---------- 器械推车（两层托盘） ----------
  function trolley(x, z, ry) {
    var g = new THREE.Group();
    [[0.85, 0.5], [0.55, 0.42]].forEach(function (lv) {
      var tray = new THREE.Mesh(new THREE.BoxGeometry(lv[1] * 1.6, 0.04, lv[1]), M.steel);
      tray.position.y = lv[0];
      hcShadow(tray);
      g.add(tray);
      var rail = new THREE.Mesh(new THREE.BoxGeometry(lv[1] * 1.6, 0.05, 0.02), M.steelDark);
      rail.position.set(0, lv[0] + 0.05, -lv[1] / 2);
      g.add(rail);
    });
    [[-0.3, -0.16], [0.3, -0.16], [-0.3, 0.16], [0.3, 0.16]].forEach(function (p) {
      var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.85, 6), M.steel);
      leg.position.set(p[0], 0.43, p[1]);
      g.add(leg);
      var wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 8), M.dark);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(p[0], 0.05, p[1]);
      g.add(wheel);
    });
    // 托盘上的器械：弯盘、剪刀、纱布
    var pan = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.05, 12), M.steel);
    pan.position.set(-0.1, 0.89, 0);
    g.add(pan);
    [-1, 1].forEach(function (sd) {
      var scissor = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.01, 0.16), M.steel);
      scissor.position.set(sd * 0.16, 0.88, 0.1);
      scissor.rotation.y = sd * 0.4;
      g.add(scissor);
    });
    var gauze = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.12), M.gauze);
    gauze.position.set(0.2, 0.88, -0.1);
    g.add(gauze);
    g.position.set(x, 0, z);
    g.rotation.y = ry || 0;
    scene.add(g);
    solid(x, z, 0.8, 0.45, 0.9, ry);
  }

  // ---------- 高压灭菌消毒柜 ----------
  function sterilizer(x, z, ry) {
    var g = new THREE.Group();
    var body = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.5, 0.7), M.steel);
    body.position.y = 0.75;
    hcShadow(body, true);
    g.add(body);
    var door = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.1, 18), M.steelDark);
    door.rotation.x = Math.PI / 2;
    door.position.set(0, 0.85, 0.36);
    g.add(door);
    var wheel = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.018, 6, 14), M.steel);
    wheel.position.set(0, 0.85, 0.42);
    g.add(wheel);
    var panel = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.16),
      M.std(0x101418, { emissive: 0x2a6a3a, emissiveIntensity: 0.5, rough: 0.4 }));
    panel.position.set(0, 1.32, 0.36);
    g.add(panel);
    g.position.set(x, 0, z);
    g.rotation.y = ry || 0;
    scene.add(g);
    solid(x, z, 1.0, 0.75, 1.5, ry);
  }

  // ---------- 一排更衣柜 ----------
  function lockers(x, z, ry, n) {
    var cnt = n || 4;
    var W = 0.44;
    var g = new THREE.Group();
    for (var i = 0; i < cnt; i++) {
      var body = new THREE.Mesh(new THREE.BoxGeometry(W - 0.03, 1.9, 0.42), M.steel);
      body.position.set((i - (cnt - 1) / 2) * W, 0.95, 0);
      hcShadow(body);
      g.add(body);
      var door = new THREE.Mesh(new THREE.BoxGeometry(W - 0.08, 1.7, 0.03), M.steelDark);
      door.position.set((i - (cnt - 1) / 2) * W, 0.98, 0.22);
      if (Math.random() > 0.7) {           // 有的柜门半开着
        door.rotation.y = 0.5;
        door.position.z = 0.28;
        door.position.x -= 0.12;
      }
      g.add(door);
      var vent = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.02), M.socket);
      vent.position.set((i - (cnt - 1) / 2) * W, 1.7, 0.235);
      g.add(vent);
    }
    g.position.set(x, 0, z);
    g.rotation.y = ry || 0;
    scene.add(g);
    solid(x, z, W * cnt, 0.5, 1.9, ry);
  }

  // ---------- 干枯盆栽 ----------
  function deadPlant(x, z) {
    var g = new THREE.Group();
    var pot = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.32, 12), M.std(0x8a6a4a, { rough: 0.9 }));
    pot.position.y = 0.16;
    hcShadow(pot);
    g.add(pot);
    var soil = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.03, 12), M.std(0x2a221a, { rough: 1 }));
    soil.position.y = 0.31;
    g.add(soil);
    for (var i = 0; i < 5; i++) {
      var a = Math.random() * Math.PI * 2;
      var stem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.5 + Math.random() * 0.3, 5),
        M.std(0x5a4a30, { rough: 0.95 }));
      stem.position.set(Math.cos(a) * 0.06, 0.55, Math.sin(a) * 0.06);
      stem.rotation.z = Math.cos(a) * 0.5;
      stem.rotation.x = Math.sin(a) * 0.5;
      g.add(stem);
      var leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.05),
        M.std(0x6a5a38, { rough: 1, side: THREE.DoubleSide }));
      leaf.position.set(Math.cos(a) * 0.18, 0.8, Math.sin(a) * 0.18);
      leaf.rotation.set(Math.random(), Math.random() * 3, Math.random());
      g.add(leaf);
    }
    g.position.set(x, 0, z);
    scene.add(g);
    solid(x, z, 0.4, 0.4, 0.4);
  }

  // ---------- 靠墙立着的折叠担架 ----------
  function stretcherWall(x, z, ry) {
    var g = new THREE.Group();
    var frame = new THREE.Mesh(new THREE.BoxGeometry(0.72, 1.7, 0.1), M.steelDark);
    frame.position.y = 0.85;
    frame.rotation.x = -0.08;
    hcShadow(frame);
    g.add(frame);
    var canvas = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 1.5), M.std(0x9aa89c, { rough: 0.9 }));
    canvas.position.set(0, 0.85, 0.06);
    canvas.rotation.x = -0.08;
    g.add(canvas);
    [[-0.34, 0.75], [0.34, 0.75], [-0.34, 0.2], [0.34, 0.2]].forEach(function (p) {
      var bar = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 6), M.steel);
      bar.position.set(p[0], p[1], 0.04);
      bar.rotation.x = Math.PI / 2;
      g.add(bar);
    });
    g.position.set(x, 0, z);
    g.rotation.y = ry || 0;
    scene.add(g);
    solid(x, z, 0.8, 0.3, 1.7, ry);
  }

  // ---------- 洗手池（带镜子和皂液器） ----------
  function sinkUnit(x, z, ry) {
    var g = new THREE.Group();
    var basin = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.24, 0.5), M.paint);
    basin.position.y = 0.85;
    hcShadow(basin, true);
    g.add(basin);
    var bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.14, 14), M.steel);
    bowl.position.y = 0.95;
    g.add(bowl);
    var faucet = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.28, 8), M.steel);
    faucet.position.set(0, 1.05, -0.16);
    faucet.rotation.x = 0.25;
    g.add(faucet);
    var pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.8, 8), M.steelDark);
    pipe.position.set(0, 0.45, -0.1);
    g.add(pipe);
    // 镜子
    var mirror = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.6),
      M.std(0xc8d8d4, { rough: 0.1, metal: 0.9 }));
    mirror.position.set(0, 1.6, -0.22);
    mirror.rotation.y = Math.PI;
    g.add(mirror);
    // 皂液器
    var soap = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.18, 0.08), M.std(0xd8d8d0, { rough: 0.6 }));
    soap.position.set(0.34, 1.35, -0.16);
    g.add(soap);
    g.position.set(x, 0, z);
    g.rotation.y = ry || 0;
    scene.add(g);
    solid(x, z, 0.9, 0.5, 1.0, ry);
  }

  // ---------- 麻醉机 ----------
  function anesthesia(x, z, ry) {
    var g = new THREE.Group();
    var body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.8, 0.55), M.steel);
    body.position.y = 0.4;
    hcShadow(body, true);
    g.add(body);
    var screen = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.34, 0.1), M.steelDark);
    screen.position.set(0, 1.05, 0.05);
    screen.rotation.x = -0.2;
    g.add(screen);
    var disp = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.26),
      M.std(0x081a10, { emissive: 0x39d47a, emissiveIntensity: 0.75, rough: 0.35 }));
    disp.position.set(0, 1.06, 0.11);
    disp.rotation.x = -0.2;
    g.add(disp);
    // 波纹管
    for (var i = 0; i < 2; i++) {
      var tube2 = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.03, 6, 14, Math.PI), M.dark);
      tube2.position.set(-0.2 + i * 0.4, 0.98, 0.22);
      tube2.rotation.set(0.4, i * 1.2, 0.2);
      g.add(tube2);
    }
    // 钢瓶
    var tank = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.9, 12),
      M.std(0x3f6f8a, { rough: 0.4, metal: 0.4 }));
    tank.position.set(0.45, 0.45, -0.1);
    g.add(tank);
    g.position.set(x, 0, z);
    g.rotation.y = ry || 0;
    scene.add(g);
    solid(x, z, 1.2, 0.6, 1.3, ry);
  }

  // ---------- 药品冷藏柜（玻璃门 + 冷光） ----------
  function medFridge(x, z, ry) {
    var g = new THREE.Group();
    var body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.6, 0.6), M.paint);
    body.position.y = 0.8;
    hcShadow(body, true);
    g.add(body);
    var inner = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 1.2),
      M.std(0x9fd8f0, { emissive: 0x6fc8e8, emissiveIntensity: 0.55, rough: 0.3, transparent: true, opacity: 0.75 }));
    inner.position.set(0, 0.85, 0.305);
    g.add(inner);
    // 里面的药瓶
    for (var i = 0; i < 6; i++) {
      var vial = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.11, 6),
        M.std(0xe8f0e0, { rough: 0.3 }));
      vial.position.set(-0.22 + (i % 3) * 0.22, 0.45 + Math.floor(i / 3) * 0.42, 0.31);
      g.add(vial);
    }
    var handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.4, 0.04), M.steelDark);
    handle.position.set(0.36, 0.85, 0.32);
    g.add(handle);
    g.position.set(x, 0, z);
    g.rotation.y = ry || 0;
    scene.add(g);
    solid(x, z, 0.8, 0.62, 1.6, ry);
  }

  // ============================================================
  // 按房间布置
  // ============================================================
  HMAP.rooms.forEach(function (r) {
    var cx = (r.x0 + r.x1) / 2;
    var cz = (r.z0 + r.z1) / 2;
    var w = r.x1 - r.x0, d = r.z1 - r.z0;

    // 门在这侧，留空
    var doorSide = (r.x1 === -HMAP.CW) ? 'east' : 'west';

    if (r.type === 'or') {
      opTable(cx, cz, 0);
      // 器械台
      var tray = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 0.5), M.steel);
      tray.position.set(cx + 2.6, 0.4, cz - 1.6);
      tray.castShadow = true;
      scene.add(tray);
      HMAP.wallList.push({ x: cx + 2.6, z: cz - 1.6, w: 1.2, d: 0.5, y0: 0, y1: 0.8 });
      // 器械柜
      shelf(r.x0 + 1.6, cz + 3, Math.PI / 2);
      shelf(r.x0 + 1.6, cz + 5.4, Math.PI / 2);
      // 血迹与拖痕
      bloodDecal(cx + 1, cz + 1.6, 2.6, 0);
      bloodDecal(cx - 2.2, cz - 2.4, 1.8, 1);
      papers(cx + 4.2, cz + 4.4, 7);
      // 洗手池
      var sink = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.9, 0.6), M.paint);
      sink.position.set(cx - 3.6, 0.45, r.z0 + 0.6);
      scene.add(sink);
      HMAP.wallList.push({ x: cx - 3.6, z: r.z0 + 0.6, w: 1.6, d: 0.6, y0: 0, y1: 0.9 });

    } else if (r.type === 'ward') {
      // 两张床靠墙
      bed(r.x0 + 2.4, cz - 3.4, 0, Math.random() > 0.5);
      bed(r.x0 + 2.4, cz + 3.4, 0, Math.random() > 0.5);
      ivStand(r.x0 + 1.2, cz - 3.4);
      ivStand(r.x0 + 1.2, cz + 3.4);
      bed(r.x1 - 2.4, cz - 3.2, Math.PI, false);
      ivStand(r.x1 - 1.2, cz - 3.2);
      // 床头柜
      var cab = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.45), M.paint);
      cab.position.set(r.x0 + 2.4, 0.3, cz);
      scene.add(cab);
      // 轮椅、散落物
      wheelchair(r.x1 - 4.2, cz + 5.2, Math.random() * 3, Math.random() > 0.6);
      papers(cx, cz + 1.2, 5);
      puddle(cx + 1.5, cz - 4.4, 0.9);
      bloodDecal(cx + 2.4, cz + 5, 1.9, 2);

    } else if (r.type === 'morgue') {
      morgueWall(cx, r.z0 + 0.9, 0, 6, 3);
      // 南抽屉墙左移 6m：正下方新开了太平间↔重症室直通门（gap x 26~28），原位正好糊住门洞
      morgueWall(cx - 6, r.z1 - 0.9, Math.PI, 6, 3);
      gurney(cx - 3, cz - 2, 0.2, true);
      gurney(cx + 2.6, cz + 1.4, -0.3, false);
      // 地漏附近的血
      bloodDecal(cx - 1, cz + 2.5, 2.8, 3);
      bloodDecal(cx + 3.6, cz - 3, 2.0, 4);
      puddle(cx, cz + 4.4, 1.2);
      papers(cx + 5, cz + 5, 4);

    } else if (r.type === 'icu') {
      bed(r.x0 + 2.6, cz - 3.6, 0, true);
      bed(r.x0 + 2.6, cz + 2.0, 0, false);
      // 监护仪
      [[r.x0 + 1.1, cz - 3.6], [r.x0 + 1.1, cz + 2.0]].forEach(function (p) {
        var mon = new THREE.Group();
        var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.5, 6), M.steel);
        pole.position.y = 0.75;
        mon.add(pole);
        var body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.32, 0.14), M.dark);
        body.position.y = 1.5;
        mon.add(body);
        var scr = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.24),
          M.std(0x08200f, { emissive: 0x2fff7a, emissiveIntensity: 0.85, rough: 0.35 }));
        scr.position.set(0, 1.5, 0.075);
        mon.add(scr);
        mon.position.set(p[0], 0, p[1]);
        scene.add(mon);
      });
      ivStand(r.x1 - 1.4, cz - 1);
      // 氧气瓶
      [[r.x1 - 1.2, cz + 4.2], [r.x1 - 2.0, cz + 4.6]].forEach(function (p) {
        var tank = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.1, 10), M.std(0x3f6f8a, { rough: 0.4, metal: 0.4 }));
        tank.position.set(p[0], 0.55, p[1]);
        tank.castShadow = true;
        scene.add(tank);
      });
      bloodDecal(cx + 1.4, cz + 4.6, 1.7, 5);
      papers(cx - 2, cz + 5.4, 4);

    } else if (r.type === 'pharm') {
      shelf(r.x0 + 1.2, cz - 4.2, Math.PI / 2);
      shelf(r.x0 + 1.2, cz - 1.4, Math.PI / 2);
      shelf(r.x0 + 1.2, cz + 1.4, Math.PI / 2);
      shelf(r.x0 + 1.2, cz + 4.2, Math.PI / 2);
      shelf(r.x1 - 2.0, r.z0 + 2.4, 0);
      shelf(r.x1 - 2.0, r.z0 + 5.0, 0);
      desk(cx + 2, cz + 6, 0, 2.2);
      // 满地药瓶/纸箱
      for (var b = 0; b < 14; b++) {
        var bx = cx + (Math.random() - 0.5) * (w - 6);
        var bz = cz + (Math.random() - 0.5) * (d - 6);
        var bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.16, 6),
          M.std(0xd8e4d0, { rough: 0.3, transparent: true, opacity: 0.8 }));
        bottle.position.set(bx, 0.08, bz);
        bottle.rotation.z = Math.random() > 0.6 ? 1.57 : 0;
        scene.add(bottle);
      }
      papers(cx - 1, cz + 2, 9);
      bloodDecal(cx - 3, cz - 5, 1.6, 6);

    } else if (r.type === 'er') {
      desk(cx + 1, cz - 5.2, Math.PI, 3.0);
      // 等候椅
      for (var i = 0; i < 4; i++) {
        chair(r.x0 + 2 + i * 1.1, cz + 3.4, 0, i === 2);
        chair(r.x0 + 2 + i * 1.1, cz + 5.6, Math.PI, false);
      }
      gurney(cx + 4.4, cz - 1.4, Math.PI / 2, false);
      wheelchair(cx - 5.4, cz + 1.2, 1.2, false);
      papers(cx, cz, 11);
      bloodDecal(cx + 0.5, cz + 5.2, 2.2, 7);
      bloodDecal(cx - 4.5, cz - 2.6, 1.4, 8);

    } else if (r.type === 'stair') {
      // 楼梯本体在 buildHospitalStairs 里；这里补杂物
      gurney(r.x0 + 5.5, r.z1 - 3.0, 0.4, false);
      papers(r.x0 + 8, r.z1 - 6, 6);
      // 通往屋顶的指示牌
      var signC = document.createElement('canvas');
      signC.width = 128; signC.height = 96;
      var sg = signC.getContext('2d');
      sg.fillStyle = '#1f4a30'; sg.fillRect(0, 0, 128, 96);
      sg.fillStyle = '#9fffc4';
      sg.font = 'bold 26px "Microsoft YaHei", sans-serif';
      sg.textAlign = 'center';
      sg.fillText('屋顶', 64, 42);
      sg.fillText('↑', 64, 82);
      var signTex = new THREE.CanvasTexture(signC);
      if (THREE.SRGBColorSpace !== undefined) signTex.colorSpace = THREE.SRGBColorSpace;
      var sm = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.68),
        new THREE.MeshBasicMaterial({ map: signTex, transparent: true }));
      sm.position.set(HMAP.CW + 0.35, 2.0, 30);
      sm.rotation.y = Math.PI / 2;
      scene.add(sm);
    }
  });

  // ============================================================
  // 各房间补家具（第二遍：按房间 id 精确定位，避开已有道具和门口）
  // ------------------------------------------------------------
  // 一次性加在循环外面，比在每个分支里插更清楚，也方便以后调位置。
  // 门口区域（x=±5 那侧 2.5 米内）全部留空，不然会挡住进门的通道。
  // ============================================================
  function roomById(id) {
    for (var i = 0; i < HMAP.rooms.length; i++) if (HMAP.rooms[i].id === id) return HMAP.rooms[i];
    return HMAP.rooms[0];
  }

  // ---- 手术室 ----
  var rOr = roomById('or');
  sterilizer(-46.2, rOr.z1 - 4.5, Math.PI / 2);        // 高压消毒柜，靠西墙
  anesthesia(-38.5, rOr.z0 + 3.2, 0);                  // 麻醉机，靠北墙
  trolley(-32.5, rOr.z0 + 3.4, 0.15);
  trolley(-14.5, rOr.z0 + 6.2, -0.35);
  lockers(-34, rOr.z0 + 1.1, 0, 4);                    // 一排更衣柜
  wallClock(-40.5, rOr.z0 - 0.05, 0);
  xrayBox(-12, rOr.z0 - 0.05, 0);                      // 看片灯箱
  privacyScreen(-20.5, rOr.z1 - 5.5, 0.35);
  trashBin(-23.5, rOr.z0 + 1.2);
  sinkUnit(-31, rOr.z0 + 2.6, 0);                      // 第二组洗手池（靠墙）
  cabinet(-9.5, rOr.z0 + 2.2, -Math.PI / 2);           // 器械柜（靠东侧）
  trolley(-9.5, rOr.z0 + 6.5, -Math.PI / 2);

  // ---- 病房 A / B ----
  ['wardA', 'wardB'].forEach(function (wid, wi) {
    var rw = roomById(wid);
    var wcx = (rw.x0 + rw.x1) / 2, wcz = (rw.z0 + rw.z1) / 2;
    // 床头柜：紧挨两张床
    nightstand(rw.x0 + 4.3, wcz - 3.4, 0);
    nightstand(rw.x0 + 4.3, wcz + 3.4, 0);
    // 床帘：沿着病床拉一道
    bedCurtain(rw.x0 + 4.9, wcz - 3.4, Math.PI / 2, 4.8);
    // 折叠餐桌 + 两把椅子
    diningSet(wcx + 6.5, wcz + (wi ? 5.4 : -5.6), wi ? 0.4 : -0.3);
    // 挂壁电视 + 挂钟
    tvWall(rw.x0 - 0.06, wcz + 5.2, Math.PI / 2);
    wallClock(rw.x0 - 0.05, wcz - 5.4, Math.PI / 2);
    deadPlant(rw.x1 - 3.2, rw.z0 + 2.2);
    trashBin(wcx + 3.2, wcz + 6.6);
    // 床边再加一组输液泵
    ivPump(rw.x0 + 3.4, wcz - 2.1);
    // 房间太长，中间再摆一张床（靠内侧那张被床帘挡住一半，正好有层次）
    bed(rw.x0 + 12.5, wcz + (wi ? -5.6 : 5.6), Math.PI / 2, true);
    ivStand(rw.x0 + 12.5, wcz + (wi ? -7.0 : 7.0));
    nightstand(rw.x0 + 14.2, wcz + (wi ? -5.6 : 5.6), Math.PI / 2);
  });

  // ---- 太平间 ----
  var rMo = roomById('morgue');
  cabinet(48.5, -43.2, -Math.PI / 2);
  cabinet(48.5, -44.6, -Math.PI / 2);
  stretcherWall(7.4, rMo.z0 + 9, Math.PI / 2);
  bioBin(8.6, rMo.z0 + 2.6);
  sinkUnit(48.2, rMo.z1 - 4.5, -Math.PI / 2);
  wallClock(18, rMo.z0 - 0.05, 0);
  gurney(14, rMo.z0 + 6.5, 0.5, true);
  gurney(20, rMo.z1 - 5.5, -0.15, false);

  // ---- 重症室 ----
  var rIcu = roomById('icu');
  monitorCart(10.2, rIcu.z0 + 5.4);
  monitorCart(10.2, rIcu.z1 - 3.6);
  ivPump(9.2, rIcu.z0 + 6.4);
  ivPump(9.2, rIcu.z1 - 2.6);
  privacyScreen(16.5, (rIcu.z0 + rIcu.z1) / 2, 0.3);
  medFridge(48.3, rIcu.z1 - 3.2, -Math.PI / 2);
  bioBin(7.6, rIcu.z1 - 1.2);
  wallClock(20, rIcu.z1 - 0.1, Math.PI);
  bed(rIcu.x0 + 13, rIcu.z1 - 7.5, Math.PI / 2, true);
  ivStand(rIcu.x0 + 13, rIcu.z1 - 9.2);

  // ---- 药房 ----
  var rPh = roomById('pharm');
  medFridge(-48.4, rPh.z0 + 4.4, Math.PI / 2);
  cabinet(-40.5, rPh.z1 - 2.4, 0);
  cabinet(-39.1, rPh.z1 - 2.4, 0);
  trolley(-20, rPh.z1 - 3.6, 0.2);
  deadPlant(-9.5, rPh.z1 - 2.6);
  shelf(-30, rPh.z0 + 2.4, 0);
  shelf(-30, rPh.z1 - 3.2, 0);

  // ---- 急诊室 ----
  var rEr = roomById('er');
  vending(48.4, 8.4, -Math.PI / 2);
  waterCooler(46.6, 21.2);
  noticeBoard(20, 5.1, 0);
  wallClock(34, 5.1, 0);
  xrayBox(48.4, 18, -Math.PI / 2);
  trashBin(13, 22.2);
  trashBin(40.5, 12.5);
  deadPlant(9.2, 21.4);
  desk(22, 21.2, Math.PI, 2.4);                        // 分诊台
  gurney(40, 20.6, 0.7, false);

  // ---- 楼梯间 ----
  var rSt = roomById('stair');
  fireBox(6.6, 40, Math.PI / 2);
  trashBin(7.2, 26.6);
  stretcherWall(8.2, rSt.z1 - 3.2, Math.PI);
  deadPlant(45, rSt.z1 - 2.6);

  // ---------- 走廊道具（有遮挡才有压迫感） ----------
  gurney(-2.6, -30, 0.05, false);
  gurney(2.8, 26, Math.PI + 0.1, true);
  wheelchair(-3.2, 8, 0.6, false);
  wheelchair(3.0, -12, 2.4, true);
  ivStand(-3.4, 20);
  chair(3.4, 40, Math.PI / 2, false);
  desk(0, 44, Math.PI, 2.6);
  papers(0, 12, 8);
  papers(1.6, -22, 6);
  puddle(-1.2, 32, 1.4);
  puddle(2.4, -6, 1.0);
  bloodDecal(0, 18, 2.4, 9);
  bloodDecal(-2.5, -18, 1.8, 10);
  bloodDecal(2.2, 34, 2.0, 11);
  // 走廊：饮水机 / 贩卖机 / 公告板 / 消防箱 / 盆栽
  waterCooler(-4.15, 22.5);
  vending(-4.2, -46.5, Math.PI / 2);
  noticeBoard(-4.68, -24, Math.PI / 2);
  wallClock(4.68, 6, -Math.PI / 2);
  fireBox(4.6, -30.5, -Math.PI / 2);
  trashBin(4.15, -8.5);
  deadPlant(4.2, 41.5);
  stretcherWall(4.6, 23.4, -Math.PI / 2);
  // 走廊：护士站（靠东墙）+ 补给柜
  desk(3.9, 24, -Math.PI / 2, 2.2);   // 不能放门口：原来 z=13 正堵急诊门(门在 z=14)
  cabinet(-4.35, 2, Math.PI / 2);
  gurney(3.3, -30, Math.PI + 0.05, false);   // 原来正对太平间门口
  stretcherWall(-4.5, -8, Math.PI / 2);      // 原来正对病房A门口
  bioBin(4.4, 19);
  // 横向走廊
  noticeBoard(20, -4.68, 0);
  fireBox(-26, 4.6, Math.PI);
  deadPlant(-30, -4.2);
  waterCooler(33, -4.15);
  // 走廊尽头的翻倒病床
  var tippedBed = bed(-2.4, -44, 0.3, true);
  tippedBed.rotation.z = 1.35;
  tippedBed.position.y = 0.5;
}

// 血迹贴片材质（缓存）
function bloodPlaneMat(seed) {
  var key = 'hm_bloodmat_' + seed;
  if (VX.texCache[key]) return VX.texCache[key];
  var m = new THREE.MeshBasicMaterial({
    map: hmTex.blood(seed), transparent: true, opacity: 0.85,
    depthWrite: false, side: THREE.DoubleSide
  });
  VX.texCache[key] = m;
  return m;
}

function bloodDecal(x, z, size, seed) {
  var m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), bloodPlaneMat(seed || 0));
  m.rotation.x = -Math.PI / 2;
  m.rotation.z = Math.random() * Math.PI * 2;
  m.position.set(x, 0.02 + Math.random() * 0.004, z);
  scene.add(m);
}

function buildHospitalDecals() {
  // 墙上的血手印 / 拖拽痕
  var handMat = bloodPlaneMat(21);
  for (var i = 0; i < 10; i++) {
    var onX = Math.random() > 0.5;
    var s = onX ? 1 : 0;
    var d = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.9), handMat);
    if (onX) {
      var x = (Math.random() > 0.5 ? 1 : -1) * (HMAP.CW - 0.22);
      d.position.set(x, 1.1 + Math.random() * 0.7, -30 + Math.random() * 60);
      d.rotation.y = x > 0 ? -Math.PI / 2 : Math.PI / 2;
    } else {
      var z = (Math.random() > 0.5 ? 1 : -1) * (HMAP.CW - 0.22);
      d.position.set(-30 + Math.random() * 60, 1.1 + Math.random() * 0.7, z);
      d.rotation.y = z > 0 ? Math.PI : 0;
    }
    d.rotation.z = (Math.random() - 0.5) * 0.5;
    scene.add(d);
  }
}

// ============================================================
// 灯光：走廊几盏会闪的日光灯 + 应急指示灯
// ============================================================
function buildHospitalLights() {
  var M = HMAP.mats;

  // 室内底光：医院是全封闭楼板，天光一点都进不来。
  // 只靠几盏点光 + 手电筒的话，关灯瞬间是"纯黑"而不是"很暗"——
  // 玩家会以为渲染挂了。这里补一层冷绿环境光，保证能看清墙和地。
  var amb = new THREE.AmbientLight(0x4a5a50, 0.92);
  scene.add(amb);
  var indoorHemi = new THREE.HemisphereLight(0x86a894, 0x232b26, 0.55);
  indoorHemi.position.set(0, 3, 0);
  scene.add(indoorHemi);

  // 医院专用的"月光"：屋顶是露天的，没有这盏的话天台就是一块纯黑。
  // 不开阴影（阴影只会让室内更黑，而室内本来就照不进来）。
  var moon = new THREE.DirectionalLight(0x9fc0e0, 0.95);
  moon.position.set(-24, 34, 18);
  scene.add(moon);

  // 灯管（吊装），部分不亮
  function tube(x, z, lit) {
    var g = new THREE.Group();
    var housing = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.12, 1.5), M.steelDark);
    g.add(housing);
    var lamp = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 1.4), lit ? M.lightOn : M.lightOff);
    lamp.position.y = -0.08;
    g.add(lamp);
    g.position.set(x, HMAP.WH - 0.16, z);
    scene.add(g);
    if (lit) {
      var glow = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.4), M.glow(0xd9ffbe, 0.10, true));
      glow.rotation.x = Math.PI / 2;
      glow.position.set(x, HMAP.WH - 0.2, z);
      scene.add(glow);
    }
    HMAP.fixtures.push({ group: g, lamp: lamp, lit: !!lit });
    return g;
  }

  // 走廊灯：每 12 米一盏，三分之一坏掉
  [-42, -30, -18, -6, 6, 18, 30, 42].forEach(function (z, i) {
    tube(0, z, i % 3 !== 1);
  });
  // 横向走廊
  [-36, -22, 22, 36].forEach(function (x, i) {
    tube(x, 0, i % 2 === 0);
  });

  // 真正带光照的只有 5 盏：多光源在手机上很贵，其余靠自发光读感
  var lightSpots = [
    { x: 0, z: -30, color: 0xcfe8b8, intensity: 1.05, dist: 20 },
    { x: 0, z: -12, color: 0xcfe8b8, intensity: 1.05, dist: 20 },
    { x: 0, z: 14, color: 0xcfe8b8, intensity: 1.0, dist: 20 },
    { x: 0, z: 36, color: 0xcfe8b8, intensity: 0.95, dist: 18 },
    { x: 26, z: 0, color: 0xcfe8b8, intensity: 0.85, dist: 18 }
  ];
  lightSpots.forEach(function (s, i) {
    var pl = new THREE.PointLight(s.color, s.intensity, s.dist, 2);
    pl.position.set(s.x, HMAP.WH - 0.35, s.z);
    scene.add(pl);
    HMAP.lights.push({ light: pl, base: s.intensity, phase: Math.random() * 10, mode: i === 4 ? 'flicker' : 'pulse' });
  });

  // 应急指示灯（绿色，常亮，靠自发光）
  [[-4.6, -23], [4.6, -23], [-4.6, 24], [4.6, 24]].forEach(function (p) {
    var box = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.18, 0.12), M.exitGreen);
    box.position.set(p[0], 2.55, p[1]);
    scene.add(box);
  });

  // 楼梯间：吊一只带铁罩的灯泡。
  // 没这盏灯的话楼梯间是全黑的 —— 玩家根本找不到上楼的路（这是撤离必经点）。
  var s = HMAP.stair;
  [[(s.x0 + s.x1) / 2, s.z0 + 1.2, 0.5, 9], [(s.x0 + s.x1) / 2, s.z1 - 0.8, 3.3, 10]].forEach(function (p) {
    var cord = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 5), M.dark);
    cord.position.set(p[0], HMAP.WH - 0.25, p[1]);
    scene.add(cord);
    var shade = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.24, 10, 1, true), M.steelDark);
    shade.position.set(p[0], HMAP.WH - 0.55, p[1]);
    scene.add(shade);
    var bulb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8),
      M.std(0xfff2c8, { emissive: 0xffcf7a, emissiveIntensity: 1.6, rough: 0.3 }));
    bulb.position.set(p[0], HMAP.WH - 0.66, p[1]);
    scene.add(bulb);
    var pl2 = new THREE.PointLight(0xffcf9a, p[2], p[3], 2);
    pl2.position.set(p[0], HMAP.WH - 0.8, p[1]);
    scene.add(pl2);
    HMAP.lights.push({ light: pl2, base: p[2], phase: Math.random() * 9, mode: 'pulse' });
  });

  // 屋顶航空灯（红）
  HMAP.roofLight = new THREE.PointLight(0xff3020, 0.0, 12, 2);
  HMAP.roofLight.position.set(0, HMAP.ROOF + 3, 18);
  scene.add(HMAP.roofLight);
}

// ============================================================
// 救援直升机（撤离点，在屋顶）
// ============================================================
function createHospitalHelicopter() {
  var M = HMAP.mats;
  var S = VX.shape;
  var g = new THREE.Group();

  var bodyMat = M.std(0x2f4a3d, { rough: 0.45, metal: 0.35 });
  var trimMat = M.std(0xd8d2bd, { rough: 0.5 });
  var darkMat = M.std(0x1b211c, { rough: 0.6 });

  // 机身
  var hull = new THREE.Mesh(new THREE.SphereGeometry(1.15, 18, 12), bodyMat);
  hull.scale.set(1.5, 0.95, 1.0);
  hull.position.y = 1.55;
  hull.castShadow = true;
  g.add(hull);

  // 尾梁
  var tail = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.34, 3.4, 10), bodyMat);
  tail.rotation.z = Math.PI / 2;
  tail.position.set(-2.55, 1.72, 0);
  g.add(tail);

  // 尾桨
  var tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.3, 0.12), trimMat);
  tailRotor.position.set(-4.2, 1.9, 0);
  g.add(tailRotor);

  // 座舱玻璃
  var glass = new THREE.Mesh(new THREE.SphereGeometry(0.92, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    M.std(0x1e3a34, { rough: 0.12, metal: 0.3, transparent: true, opacity: 0.62 }));
  glass.scale.set(1.35, 0.9, 0.95);
  glass.position.set(0.85, 1.75, 0);
  g.add(glass);

  // 主旋翼
  var mast = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.5, 8), darkMat);
  mast.position.y = 2.6;
  g.add(mast);
  var rotor = new THREE.Group();
  for (var i = 0; i < 4; i++) {
    var blade = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.04, 5.2), darkMat);
    blade.rotation.y = i * Math.PI / 2;
    rotor.add(blade);
  }
  rotor.position.y = 2.86;
  g.add(rotor);

  // 起落橇
  [-1, 1].forEach(function (s) {
    var skid = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.2, 8), darkMat);
    skid.rotation.z = Math.PI / 2;
    skid.position.set(0, 0.16, s * 0.85);
    g.add(skid);
    [-1.1, 1.1].forEach(function (dx) {
      var strut = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.7, 6), darkMat);
      strut.position.set(dx, 0.5, s * 0.7);
      strut.rotation.x = s * 0.3;
      g.add(strut);
    });
  });

  // 机身红十字（救援标识）
  var crossMat = M.std(0xd83a3a, { rough: 0.5, emissive: 0x521010, emissiveIntensity: 0.5 });
  var c1 = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.06), crossMat);
  c1.position.set(0, 1.6, 1.02);
  g.add(c1);
  var c2 = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.7, 0.06), crossMat);
  c2.position.set(0, 1.6, 1.02);
  g.add(c2);

  // 顶部信标 + 地面光环（EscapeSystem / HUD 依赖这两个字段）
  var beacon = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 10),
    M.std(0xff4444, { emissive: 0xff2222, emissiveIntensity: 1.6, rough: 0.3 }));
  beacon.position.set(-0.3, 2.5, 0.7);
  g.add(beacon);

  var ring = new THREE.Mesh(VX.shape.ring(2.4, 3.0, 48), M.glow(0x66ffcc, 0.3, true));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  g.add(ring);
  var ring2 = new THREE.Mesh(VX.shape.ring(3.2, 3.34, 48), M.glow(0xffffff, 0.12, true));
  ring2.rotation.x = -Math.PI / 2;
  ring2.position.y = 0.025;
  g.add(ring2);

  // 停机坪标记：H
  var padMat = M.std(0x9aa89c, { rough: 0.85 });
  var padBase = new THREE.Mesh(new THREE.CircleGeometry(5.6, 40), M.std(0x39423a, { rough: 0.95 }));
  padBase.rotation.x = -Math.PI / 2;
  padBase.position.y = 0.012;
  g.add(padBase);
  var h1 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 2.6), padMat);
  h1.position.set(-1.1, 0.03, 0);
  g.add(h1);
  var h2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 2.6), padMat);
  h2.position.set(1.1, 0.03, 0);
  g.add(h2);
  var h3 = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.02, 0.5), padMat);
  h3.position.set(0, 0.03, 0);
  g.add(h3);

  g.userData = {
    ring: ring, ring2: ring2, beacon: beacon, beaconGlow: null,
    rotor: rotor, tailRotor: tailRotor
  };
  g.position.set(-6, HMAP.ROOF, 6);
  scene.add(g);
  ship = g;
  window.ship = g;
  HMAP.ship = g;
}

// ============================================================
// 运行时：碰撞
// ============================================================
/** 把墙的一条 AABB（可能带 y 轴旋转）近似成"局部坐标下的盒子" */
function _hmBoxHit(pos, r, wl) {
  var dx = pos.x - wl.x;
  var dz = pos.z - wl.z;
  var hw = wl.w / 2, hd = wl.d / 2;
  if (wl.rotRy) {
    // 有旋转的家具：转到局部坐标再判
    var c = Math.cos(-wl.rotRy), s = Math.sin(-wl.rotRy);
    var lx = dx * c - dz * s;
    var lz = dx * s + dz * c;
    dx = lx; dz = lz;
    var tmp = hw; hw = hd; hd = tmp;  // 局部轴互换（近似：按较小边做推出）
    hw = Math.max(0.35, Math.min(wl.w, wl.d) / 2);
    hd = Math.max(0.35, Math.max(wl.w, wl.d) / 2);
  }
  var cx = Math.max(-hw, Math.min(hw, dx));
  var cz = Math.max(-hd, Math.min(hd, dz));
  var ox = dx - cx, oz = dz - cz;
  var d2 = ox * ox + oz * oz;
  if (d2 > r * r) return false;

  if (d2 > 1e-6) {
    var d = Math.sqrt(d2);
    var push = r - d;
    var nx = ox / d, nz = oz / d;
    if (wl.rotRy) {
      var c2 = Math.cos(wl.rotRy), s2 = Math.sin(wl.rotRy);
      var wx = nx * c2 - nz * s2;
      var wz = nx * s2 + nz * c2;
      nx = wx; nz = wz;
    }
    pos.x += nx * push;
    pos.z += nz * push;
  } else {
    // 中心在盒子里：按最小穿透方向推出
    var pl = dx + hw, pr = hw - dx, pt = dz + hd, pb = hd - dz;
    var m = Math.min(pl, pr, pt, pb);
    var lx2 = dx, lz2 = dz;
    if (m === pl) lx2 = -hw - r;
    else if (m === pr) lx2 = hw + r;
    else if (m === pt) lz2 = -hd - r;
    else lz2 = hd + r;
    if (wl.rotRy) {
      var c3 = Math.cos(wl.rotRy), s3 = Math.sin(wl.rotRy);
      pos.x += lx2 * c3 - lz2 * s3;
      pos.z += lx2 * s3 + lz2 * c3;
    } else {
      pos.x += lx2 - dx;
      pos.z += lz2 - dz;
    }
  }
  return true;
}

/**
 * 医院墙体碰撞（带高度区间的 AABB）
 * @param {Object} pos 含 x/z
 * @param {number} radius 半径
 * @param {number} y 脚底高度
 */
function hospitalResolveCollision(pos, radius, y) {
  if (!pos) return false;
  var r = (typeof radius === 'number' && radius > 0) ? radius : 0.4;
  var feet = (typeof y === 'number') ? y : 0;
  var head = feet + 1.8;
  var hit = false;

  for (var it = 0; it < 2; it++) {
    var moved = false;

    // 墙
    for (var i = 0; i < HMAP.wallList.length; i++) {
      var wl = HMAP.wallList[i];
      // 高度不重叠就跳过 —— 这是"楼上的墙不挡楼下"的关键
      if (wl.y1 <= feet + 0.15 || wl.y0 >= head) continue;
      if (_hmBoxHit(pos, r, wl)) { moved = true; hit = true; }
    }

    // 关着的门（竖墙门板沿 z 展开 → 碰撞盒 x 窄 z 宽；横墙门相反）
    for (var d = 0; d < HMAP.doors.length; d++) {
      var dr = HMAP.doors[d];
      if (dr.angle > 0.42) continue;          // 开了一条缝就不再挡
      var box = dr.horiz
        ? { x: dr.x, z: dr.z, w: dr.w + 0.1, d: 0.55 }
        : { x: dr.x, z: dr.z, w: 0.55, d: dr.w + 0.1 };
      if (_hmBoxHit(pos, r, box)) { moved = true; hit = true; }
    }

    // 外墙兜底（防止从楼板缝里掉出世界）
    var lim = HMAP.B - 0.6 - r;
    if (pos.x > lim) { pos.x = lim; moved = true; hit = true; }
    if (pos.x < -lim) { pos.x = -lim; moved = true; hit = true; }
    if (pos.z > lim) { pos.z = lim; moved = true; hit = true; }
    if (pos.z < -lim) { pos.z = -lim; moved = true; hit = true; }

    if (!moved) break;
  }
  return hit;
}

/** 点是否被墙/门挡住（刷怪、道具落点用） */
function hospitalBlocked(x, z, r) {
  var rr = (r === undefined) ? 0.9 : r;
  for (var i = 0; i < HMAP.blockRects.length; i++) {
    var b = HMAP.blockRects[i];
    if (x > b.x0 - rr && x < b.x1 + rr && z > b.z0 - rr && z < b.z1 + rr) return true;
  }
  for (var j = 0; j < HMAP.wallList.length; j++) {
    var wl = HMAP.wallList[j];
    if (wl.y0 > 0.4) continue;             // 只关心地面层的障碍
    if (Math.abs(x - wl.x) < wl.w / 2 + rr && Math.abs(z - wl.z) < wl.d / 2 + rr) return true;
  }
  // 楼梯口附近也别刷（会跟台阶重叠）
  var s = HMAP.stair;
  if (s && x > s.x0 - 1 && x < s.x1 + 1 && z > s.z0 - 1 && z < s.z1 + 1) return true;
  return false;
}

/** 把落点挪到最近的可站立位置（螺旋搜索） */
function hospitalSnapOpen(x, z, r) {
  if (!HMAP.active) return { x: x, z: z };
  if (!hospitalBlocked(x, z, r)) return { x: x, z: z };
  var rr = (r === undefined) ? 0.9 : r;
  for (var ring = 1; ring <= 16; ring++) {
    var rad = ring * 1.1;
    for (var k = 0; k < 10; k++) {
      var ang = (k / 10) * Math.PI * 2 + ring * 0.37;
      var nx = x + Math.cos(ang) * rad;
      var nz = z + Math.sin(ang) * rad;
      if (Math.abs(nx) > HMAP.B - 1.4 || Math.abs(nz) > HMAP.B - 1.4) continue;
      if (!hospitalBlocked(nx, nz, rr)) return { x: nx, z: nz };
    }
  }
  return { x: 0, z: 6 };
}

// ============================================================
// 运行时：地面高度
// ============================================================
/**
 * 医院的地面高度。
 * 同一个 (x,z) 有"楼里"和"屋顶"两层，靠当前高度区分：
 *   · 站在楼梯斜坡上 → 返回斜坡高度
 *   · 当前 y 接近屋顶高度 → 屋顶
 *   · 否则 → 一层地面
 */
function hospitalFloorAt(x, z, curY) {
  var s = HMAP.stair;
  if (s && x > s.x0 - 0.2 && x < s.x1 + 0.2 && z > s.z0 - 0.2 && z <= s.z1 + 0.35) {
    var t = (z - s.z0) / (s.z1 - s.z0);
    t = Math.max(0, Math.min(1, t));
    return t * HMAP.ROOF;
  }
  return (typeof curY === 'number' && curY > HMAP.ROOF - 0.9) ? HMAP.ROOF : 0;
}

/** 统一入口：别的章节就是 groundY */
function floorYAt(x, z, curY) {
  if (HMAP.active) return hospitalFloorAt(x, z, curY);
  return (typeof groundY !== 'undefined') ? groundY : 0;
}

/** 刷怪/刷道具的落点修正统一入口 */
function mapSnapOpen(x, z, r) {
  if (HMAP.active) return hospitalSnapOpen(x, z, r);
  return { x: x, z: z };
}

// ============================================================
// 运行时：导航（导航图 BFS）
// ============================================================
function hmNearestNode(x, z) {
  var best = null, bd = 1e9;
  for (var i = 0; i < HMAP.navNodes.length; i++) {
    var n = HMAP.navNodes[i];
    var d = Math.abs(n.x - x) + Math.abs(n.z - z);
    if (d < bd) { bd = d; best = n; }
  }
  return best;
}

function hmBfs(fromId, toId) {
  if (fromId === toId) return [fromId];
  var prev = {}, seen = {};
  var q = [fromId];
  seen[fromId] = true;
  while (q.length) {
    var cur = q.shift();
    var adj = HMAP.navAdj[cur] || [];
    for (var i = 0; i < adj.length; i++) {
      var nx = adj[i];
      if (seen[nx]) continue;
      seen[nx] = true;
      prev[nx] = cur;
      if (nx === toId) {
        var path = [nx];
        var p = cur;
        while (p !== undefined) {
          path.unshift(p);
          p = prev[p];
        }
        return path;
      }
      q.push(nx);
    }
  }
  return [fromId];
}

/**
 * 怪物导航（医院版）：沿导航图节点走
 * 和原版 monsterNavDir 的接口完全一致，直接替换
 */
function hospitalNavDir(m, targetPos, fallbackDir) {
  if (!m || !targetPos) return fallbackDir;
  var from = hmNearestNode(m.position.x, m.position.z);
  var to = hmNearestNode(targetPos.x, targetPos.z);
  if (!from || !to || from.id === to.id) return fallbackDir;

  var ud = m.userData || (m.userData = {});
  var now = Date.now();
  if (!ud._navPath || ud._navTo !== to.id || (now - (ud._navAt || 0)) > 900) {
    ud._navPath = hmBfs(from.id, to.id);
    ud._navTo = to.id;
    ud._navAt = now;
  }
  var path = ud._navPath;
  if (!path || path.length < 2) return fallbackDir;

  // 推进：走到当前路点附近就换下一个
  var guard = 0;
  while (path.length > 2 && guard++ < 8) {
    var n1 = HMAP.navNodes.filter(function (n) { return n.id === path[1]; })[0];
    if (!n1) break;
    var dd = Math.sqrt(Math.pow(n1.x - m.position.x, 2) + Math.pow(n1.z - m.position.z, 2));
    if (dd < 1.6) path.shift();
    else break;
  }
  var nextId = path[1];
  var node = null;
  for (var i = 0; i < HMAP.navNodes.length; i++) {
    if (HMAP.navNodes[i].id === nextId) { node = HMAP.navNodes[i]; break; }
  }
  if (!node) return fallbackDir;

  var dx = node.x - m.position.x;
  var dz = node.z - m.position.z;
  var len = Math.sqrt(dx * dx + dz * dz);
  if (len < 0.02) return fallbackDir;
  return new THREE.Vector3(dx / len, 0, dz / len);
}

// ============================================================
// 运行时：门
// ============================================================
/** 找到玩家附近可交互的门 */
function nearestHospitalDoor(maxDist) {
  if (!HMAP.active) return null;
  // 门都装在一层；站在屋顶上时，正下方 3.7 米处的门不该弹"开门"提示
  if (typeof player === 'undefined' || !player) return null;
  if (player.position.y > 1.6) return null;
  var md = maxDist === undefined ? 2.6 : maxDist;
  var best = null, bd = 1e9;
  for (var i = 0; i < HMAP.doors.length; i++) {
    var d = HMAP.doors[i];
    var dist = Math.sqrt(Math.pow(d.x - player.position.x, 2) + Math.pow(d.z - player.position.z, 2));
    if (dist < bd && dist < md) { bd = dist; best = d; }
  }
  return best;
}

/** 动画帧：推门/关门 */
function updateHospitalDoors(delta) {
  if (!HMAP.active) return;

  for (var i = 0; i < HMAP.doors.length; i++) {
    var d = HMAP.doors[i];
    if (Math.abs(d.angle - d.target) > 0.001) {
      var speed = 2.6 * delta;
      if (d.angle < d.target) d.angle = Math.min(d.target, d.angle + speed);
      else d.angle = Math.max(d.target, d.angle - speed);
    }
    // 角度映射：全开约 105°，朝房间里侧开
    var rot = d.openSign * d.angle * 1.83;
    d.group.rotation.y = d.baseRot + rot;
    if (d.sign) d.sign.material.opacity = d.angle > 0.5 ? 0.45 : 0.92;
  }

  // 门开着的时候别让玩家卡在门板里 —— 门板本身不参与碰撞（只在关上时挡）
  updateDoorHud();
}

var _lastDoorHud = null;
function updateDoorHud() {
  var btn = document.getElementById('hud-door-btn');
  if (!btn) return;
  var d = nearestHospitalDoor(2.8);
  if (!d) {
    if (_lastDoorHud !== null) { btn.classList.add('hidden'); _lastDoorHud = null; }
    return;
  }
  btn.classList.remove('hidden');
  var want = d.open ? '关门' : '开门';
  if (_lastDoorHud !== want) {
    _lastDoorHud = want;
    btn.innerHTML = '<span class="icon">🚪</span><span class="view-label">' + want + '</span>';
  }
}

/** 开关最近的门（玩家主动） */
function toggleNearbyDoor() {
  if (!HMAP.active) return;
  var d = nearestHospitalDoor(2.8);
  if (!d) return;
  var open = !d.open;
  setHospitalDoor(d.id, open, false);
  if (typeof PeerManager !== 'undefined' && PeerManager && PeerManager.connected) {
    try {
      PeerManager.broadcast('door_toggle', { id: d.id, open: open, by: (GS && GS.playerId) || null });
    } catch (e) { }
  }
  if (typeof AudioMgr !== 'undefined' && AudioMgr.playScratch) {
    try { AudioMgr.playScratch(0.35); } catch (e) { }
  }
}

/** 设置门状态（本地 + 接收同步都用它） */
function setHospitalDoor(id, open, instant) {
  var d = HMAP.doorMap[id];
  if (!d) return;
  d.open = !!open;
  d.target = open ? 1 : 0;
  if (instant) d.angle = d.target;
  d.blockedUntil = Date.now() + 350;
}

/** 快照同步用：读取全部门状态 */
function hospitalDoorState() {
  if (!HMAP.active) return null;
  var out = [];
  for (var i = 0; i < HMAP.doors.length; i++) {
    out.push({ id: HMAP.doors[i].id, open: HMAP.doors[i].open ? 1 : 0 });
  }
  return out;
}

/** 快照同步用：应用门状态 */
function applyHospitalDoorState(list) {
  if (!HMAP.active || !list) return;
  for (var i = 0; i < list.length; i++) {
    var s = list[i];
    var d = HMAP.doorMap[s.id];
    if (!d) continue;
    var want = !!s.open;
    if (d.open !== want) setHospitalDoor(s.id, want, false);
  }
}

/**
 * 怪物/追捕者撞门：贴到关着的门前会自己推开。
 * 只跑在主机（联机）或单机。
 */
function hospitalMonstersPushDoors() {
  if (!HMAP.active) return;
  if (typeof GS !== 'undefined' && GS.mode === 'multiplayer' && !GS.isHost) return;

  var list = [];
  if (typeof monsters !== 'undefined' && monsters) list = list.concat(monsters);
  if (typeof bosses !== 'undefined' && bosses) list = list.concat(bosses);
  if (typeof chaserMonster !== 'undefined' && chaserMonster) list.push(chaserMonster);
  if (typeof getImpostorTargets === 'function') {
    try { list = list.concat(getImpostorTargets(true) || []); } catch (e) { }
  }

  for (var i = 0; i < list.length; i++) {
    var m = list[i];
    if (!m || !m.userData || !m.userData.active) continue;
    for (var j = 0; j < HMAP.doors.length; j++) {
      var d = HMAP.doors[j];
      if (d.open) { d._pushAt = 0; continue; }
      var dx = d.x - m.position.x, dz = d.z - m.position.z;
      if (dx * dx + dz * dz > 2.6 * 2.6) continue;
      // 推门有 0.45 秒的"掰门"延迟，给玩家关门争取时间
      if (!d._pushAt) d._pushAt = Date.now() + 450;
      else if (Date.now() > d._pushAt) {
        setHospitalDoor(d.id, true, false);
        d._pushAt = 0;
        if (typeof PeerManager !== 'undefined' && PeerManager && PeerManager.connected && GS.mode === 'multiplayer' && GS.isHost) {
          try { PeerManager.broadcast('door_toggle', { id: d.id, open: true }); } catch (e) { }
        }
      }
    }
  }

  // 没有怪贴着门 → 清掉"掰门"计时，避免怪物走后门被瞬间推开
  for (var k = 0; k < HMAP.doors.length; k++) {
    var dr = HMAP.doors[k];
    if (dr.open || !dr._pushAt) continue;
    var near = false;
    for (var q = 0; q < list.length && !near; q++) {
      var mm = list[q];
      if (!mm || !mm.userData || !mm.userData.active) continue;
      var ddx = dr.x - mm.position.x, ddz = dr.z - mm.position.z;
      if (ddx * ddx + ddz * ddz <= 2.6 * 2.6) near = true;
    }
    if (!near) dr._pushAt = 0;
  }
}

/** 每帧：灯光闪烁 + 旋翼 + 屋顶红灯 */
function updateHospitalEffects(delta) {
  if (!HMAP.active) return;
  HMAP._phase += delta;

  // 日光灯：一盏在抽搐，其余缓慢呼吸
  for (var i = 0; i < HMAP.lights.length; i++) {
    var L = HMAP.lights[i];
    var v;
    if (L.mode === 'flicker') {
      var t = HMAP._phase * 6.0 + L.phase;
      v = (Math.sin(t) > 0.1) ? 0.75 : 0.05;
      if (Math.random() > 0.985) v = 0.02;
    } else {
      v = 0.86 + Math.sin(HMAP._phase * 1.7 + L.phase) * 0.14;
    }
    L.light.intensity = L.base * v;
  }

  // 坏灯管的自发光也跟着暗
  for (var f = 0; f < HMAP.fixtures.length; f++) {
    var fx = HMAP.fixtures[f];
    if (!fx.lit) continue;
  }

  // 直升机旋翼：撤离时转起来，平时慢转
  if (ship && ship.userData && ship.userData.rotor) {
    var spin = (GS.escaping ? 26 : 1.2);
    ship.userData.rotor.rotation.y += delta * spin;
    if (ship.userData.tailRotor) ship.userData.tailRotor.rotation.x += delta * spin * 2.2;
  }

  // 屋顶航空警示灯
  if (HMAP.warnLight && HMAP.warnLight.material) {
    var on = Math.sin(HMAP._phase * 2.2) > 0.4;
    HMAP.warnLight.material.emissiveIntensity = on ? 2.4 : 0.15;
    if (HMAP.roofLight) HMAP.roofLight.intensity = on ? 0.55 : 0.0;
  }
}

/**
 * 第三人称镜头遮挡：从角色头部到理想机位之间打一根"粗细为 pad"的线段，
 * 撞到墙就把机位拉到墙前。
 *
 * 室内地图必须有这个：楼层只有 3.3 米高、房间十几米见方，
 * 角色往墙边一站，4.5 米外那个机位就已经穿到隔壁房间去了 ——
 * 画面里会直接看到墙外，甚至穿到别的房间看队友。
 * 只测墙（71 段 AABB），不测家具和地形，开销可以忽略。
 */
function hospitalCameraLimit(from, to) {
  var dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  var best = 1, pad = 0.3;

  for (var i = 0; i < HMAP.wallList.length; i++) {
    var w = HMAP.wallList[i];
    if (w.y1 < 1.1) continue;          // 矮家具不挡镜头，否则贴着床走会一直被拉近
    var t = _segAabb(from.x, from.y, from.z, dx, dy, dz, w, pad);
    if (t < best) best = t;
  }
  for (var d = 0; d < HMAP.doors.length; d++) {
    var dr = HMAP.doors[d];
    if (dr.angle > 0.42) continue;
    var t2 = _segAabb(from.x, from.y, from.z, dx, dy, dz,
      { x: dr.x, z: dr.z, w: 0.5, d: dr.w, y0: 0, y1: dr.h }, pad);
    if (t2 < best) best = t2;
  }
  return Math.max(0.16, best - 0.03);
}

/** 线段与 AABB 求交，返回进入参数 t（0~1）；不交返回 1 */
function _segAabb(ox, oy, oz, dx, dy, dz, box, pad) {
  var p = pad || 0;
  var minX = box.x - box.w / 2 - p, maxX = box.x + box.w / 2 + p;
  var minY = box.y0 - p, maxY = box.y1 + p;
  var minZ = box.z - box.d / 2 - p, maxZ = box.z + box.d / 2 + p;

  var tmin = 0, tmax = 1;
  // x
  if (Math.abs(dx) < 1e-8) {
    if (ox < minX || ox > maxX) return 1;
  } else {
    var t1 = (minX - ox) / dx, t2 = (maxX - ox) / dx;
    if (t1 > t2) { var tt = t1; t1 = t2; t2 = tt; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return 1;
  }
  // y
  if (Math.abs(dy) < 1e-8) {
    if (oy < minY || oy > maxY) return 1;
  } else {
    var u1 = (minY - oy) / dy, u2 = (maxY - oy) / dy;
    if (u1 > u2) { var uu = u1; u1 = u2; u2 = uu; }
    if (u1 > tmin) tmin = u1;
    if (u2 < tmax) tmax = u2;
    if (tmin > tmax) return 1;
  }
  // z
  if (Math.abs(dz) < 1e-8) {
    if (oz < minZ || oz > maxZ) return 1;
  } else {
    var v1 = (minZ - oz) / dz, v2 = (maxZ - oz) / dz;
    if (v1 > v2) { var vv = v1; v1 = v2; v2 = vv; }
    if (v1 > tmin) tmin = v1;
    if (v2 < tmax) tmax = v2;
    if (tmin > tmax) return 1;
  }
  if (tmin < 0 || tmin > 1) return 1;
  return tmin;
}

// ============================================================
// 小地图：医院平面图
// ============================================================
function drawHospitalMinimap(ctx, ox, oz, scale, H) {
  // 房间
  for (var i = 0; i < HMAP.rooms.length; i++) {
    var r = HMAP.rooms[i];
    var x0 = ox + r.x0 * scale, x1 = ox + r.x1 * scale;
    var z0 = oz + r.z0 * scale, z1 = oz + r.z1 * scale;
    ctx.fillStyle = 'rgba(120,150,130,0.13)';
    ctx.fillRect(x0, z0, x1 - x0, z1 - z0);
    ctx.strokeStyle = 'rgba(160,190,170,0.42)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x0, z0, x1 - x0, z1 - z0);
    ctx.fillStyle = 'rgba(190,220,200,0.55)';
    ctx.font = '7px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(r.name, (x0 + x1) / 2, (z0 + z1) / 2);
  }

  // 楼梯
  var s = HMAP.stair;
  ctx.fillStyle = 'rgba(255,214,102,0.42)';
  ctx.fillRect(ox + s.x0 * scale, oz + s.z0 * scale, (s.x1 - s.x0) * scale, (s.z1 - s.z0) * scale);

  // 门：开着绿色，关着红色
  for (var d = 0; d < HMAP.doors.length; d++) {
    var dr = HMAP.doors[d];
    ctx.fillStyle = dr.open ? 'rgba(110,240,150,0.9)' : 'rgba(240,110,90,0.9)';
    var px = ox + dr.x * scale, pz = oz + dr.z * scale;
    if (dr.horiz) ctx.fillRect(px - dr.w * scale / 2, pz - 2, dr.w * scale, 4);
    else ctx.fillRect(px - 2, pz - dr.w * scale / 2, 4, dr.w * scale);
  }

  // 当前层提示
  var onRoof = player && player.position.y > HMAP.ROOF - 0.8;
  ctx.fillStyle = onRoof ? 'rgba(255,214,102,0.85)' : 'rgba(160,200,175,0.7)';
  ctx.font = 'bold 8px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(onRoof ? '屋顶' : '一层', 4, 118);
}

// ============================================================
// 导出
// ============================================================
window.HMAP = HMAP;
window.isHospitalMap = isHospitalMap;
window.buildHospital = buildHospital;
window.hospitalResolveCollision = hospitalResolveCollision;
window.hospitalFloorAt = hospitalFloorAt;
window.floorYAt = floorYAt;
window.mapSnapOpen = mapSnapOpen;
window.hospitalNavDir = hospitalNavDir;
window.updateHospitalDoors = updateHospitalDoors;
window.toggleNearbyDoor = toggleNearbyDoor;
window.setHospitalDoor = setHospitalDoor;
window.hospitalDoorState = hospitalDoorState;
window.applyHospitalDoorState = applyHospitalDoorState;
window.hospitalMonstersPushDoors = hospitalMonstersPushDoors;
window.updateHospitalEffects = updateHospitalEffects;
window.drawHospitalMinimap = drawHospitalMinimap;
window.hospitalCameraLimit = hospitalCameraLimit;
window.bloodDecal = bloodDecal;
