// ============================================================
// RoomSystem - 场景构建
// 视觉重做要点：
// 1. 地面使用程序化 Canvas 贴图，取代纯色 + 网格线
// 2. 墙改为有厚度的矮墙 + 墙顶装饰边，开阔视野
// 3. 植被/碎石用 InstancedMesh 批量绘制，控制 draw call
// 4. 家具全部圆角化并使用木纹/石纹材质
// ============================================================

var VX_ROOM = {
  wallH: 1.75,
  wallT: 0.34,
  // 保留这两个值只作为"极端情况下的上限参考"。
  // 实际可见距离统一由 NightSystem 的 NIGHT_CFG 决定（夜晚 + 手电筒），
  // 不要再往 scene.fog 里写死数字 —— 之前这里写 46/118，
  // 手电筒那边写 15/30，结果开灯反而看得更近。
  fogNear: 46,
  fogFar: 118
};

function buildRoom() {
  var theme = VX.palette.theme(GS.chapter);
  var M = VX.materials, S = VX.shape;
  var chapterData = CHAPTERS[GS.chapter - 1] || CHAPTERS[0];

  // 背景与雾：天空用 CSS 渐变铺在画布下方，
  // 雾色取渐变的地平线端，远处几何体才能自然融进天空。
  //
  // 现在整局都是夜晚：天空用 nightSkyCss，雾距由 NightSystem 统一给
  // （没开手电筒 ~19 米，开了 ~52 米），这里不再写死数值。
  scene.background = null;
  if (typeof applyNightSky === 'function') {
    applyNightSky();
  } else {
    document.body.style.background = VX.palette.skyCss(GS.chapter);
  }
  if (typeof applyNightFog === 'function') {
    applyNightFog();
  } else {
    scene.fog = new THREE.Fog(theme.fog, VX_ROOM.fogNear, VX_ROOM.fogFar);
  }

  // ---------- 材质 ----------
  // 地面每块 tile 2.5 米，40 米房间正好 16 次平铺。
  // 必须是整数：多块地板相邻时 UV 才能对齐，否则接缝处图案错位出现竖线
  var FLOOR_TILE = 2.5;
  var floorMat = new THREE.MeshStandardMaterial({
    map: M.ground(theme, Math.round(roomSize / FLOOR_TILE)),
    roughness: 0.94,
    metalness: 0.0
  });

  // 墙体材质：每段墙长度差异极大（内墙 3~20 米，外墙 120 米），
  // 共用一张固定 repeat 的贴图必然被拉伸，这里按长度逐段生成
  var WALL_TILE = 2.6;
  var wallMatCache = {};
  function wallMatFor(len) {
    var k = Math.max(0.5, Math.round(len * 2) / 2);
    if (wallMatCache[k]) return wallMatCache[k];
    var m = new THREE.MeshStandardMaterial({
      map: M.wall(theme, k / WALL_TILE, VX_ROOM.wallH / WALL_TILE),
      roughness: 0.88,
      metalness: 0.02
    });
    wallMatCache[k] = m;
    return m;
  }
  var trimMat = M.std(theme.trim, { rough: 0.62 });
  var woodMat = M.std(0xb98a5a, { rough: 0.78, map: M.wood() });
  var woodDarkMat = M.std(0x8a6038, { rough: 0.8, map: M.wood() });
  var stoneMat = M.std(theme.wallDark, { rough: 0.92 });

  VX_ROOM.theme = theme;
  VX_ROOM.wood = woodMat;
  VX_ROOM.woodDark = woodDarkMat;
  VX_ROOM.stone = stoneMat;

  // ---------- 地面 ----------
  ROOMS.forEach(function (rm) {
    var floor = new THREE.Mesh(new THREE.PlaneGeometry(roomSize, roomSize), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(rm.cx, groundY, rm.cz);
    floor.receiveShadow = true;
    scene.add(floor);
  });

  // ---------- 墙体 ----------
  var WALL_H = VX_ROOM.wallH, WALL_T = VX_ROOM.wallT;

  function wallSeg(cx, cz, len, ry) {
    var wall = new THREE.Mesh(new THREE.BoxGeometry(len, WALL_H, WALL_T), wallMatFor(len));
    wall.position.set(cx, WALL_H / 2, cz);
    wall.rotation.y = ry;
    wall.castShadow = true;
    wall.receiveShadow = true;
    scene.add(wall);
    walls.push(wall);

    // 墙顶压边
    var cap = new THREE.Mesh(new THREE.BoxGeometry(len, 0.14, WALL_T + 0.12), trimMat);
    cap.position.set(cx, WALL_H + 0.03, cz);
    cap.rotation.y = ry;
    cap.castShadow = true;
    scene.add(cap);
  }

  var H = halfRoom, G = DOOR_HALF;
  var S_HALF = H * 3;

  function addSegmentedWall(fixedCoord, ry, doorPositions) {
    var prev = -S_HALF;
    var sortedDoors = doorPositions.slice().sort(function (a, b) { return a - b; });
    sortedDoors.forEach(function (dp) {
      var gapStart = dp - G;
      var gapEnd = dp + G;
      if (gapStart > prev + 0.01) {
        var segCenter = (prev + gapStart) / 2;
        var segLen = gapStart - prev;
        if (ry === 0) wallSeg(segCenter, fixedCoord, segLen, 0);
        else wallSeg(fixedCoord, segCenter, segLen, Math.PI / 2);
      }
      prev = gapEnd;
    });
    if (S_HALF > prev + 0.01) {
      var segCenter2 = (prev + S_HALF) / 2;
      var segLen2 = S_HALF - prev;
      if (ry === 0) wallSeg(segCenter2, fixedCoord, segLen2, 0);
      else wallSeg(fixedCoord, segCenter2, segLen2, Math.PI / 2);
    }
  }

  // 外墙
  wallSeg(0, -S_HALF, 2 * S_HALF, 0);
  wallSeg(0, S_HALF, 2 * S_HALF, 0);
  wallSeg(-S_HALF, 0, 2 * S_HALF, Math.PI / 2);
  wallSeg(S_HALF, 0, 2 * S_HALF, Math.PI / 2);

  // 内墙（带门洞）
  addSegmentedWall(-H, Math.PI / 2, [-2 * H, 0, 2 * H]);
  addSegmentedWall(H, Math.PI / 2, [-2 * H, 0, 2 * H]);
  addSegmentedWall(-H, 0, [-2 * H, 0, 2 * H]);
  addSegmentedWall(H, 0, [-2 * H, 0, 2 * H]);

  // ---------- 门框 ----------
  DOOR_POSITIONS.forEach(function (dp) {
    var dx = dp[0], dz = dp[1];
    var isVertical = (dx === -H || dx === H);
    var frameH = WALL_H + 0.5;

    function pillar(px, pz, pRy) {
      var p = new THREE.Mesh(S.roundedBox(0.26, frameH, 0.26, 0.05, 2), woodMat);
      p.position.set(px, frameH / 2, pz);
      p.rotation.y = pRy;
      p.castShadow = true;
      scene.add(p);
    }
    if (isVertical) {
      [-1, 1].forEach(function (s) { pillar(dx, dz + s * (G + 0.16), 0); });
      var beam = new THREE.Mesh(S.roundedBox(0.3, 0.3, G * 2 + 0.62, 0.06, 2), woodDarkMat);
      beam.position.set(dx, frameH - 0.12, dz);
      beam.castShadow = true;
      scene.add(beam);
    } else {
      [-1, 1].forEach(function (s) { pillar(dx + s * (G + 0.16), dz, 0); });
      var beam2 = new THREE.Mesh(S.roundedBox(G * 2 + 0.62, 0.3, 0.3, 0.06, 2), woodDarkMat);
      beam2.position.set(dx, frameH - 0.12, dz);
      beam2.castShadow = true;
      scene.add(beam2);
    }

    // 门楣小灯：用自发光材质，避免额外光源开销
    var lampGlow = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 10, 10),
      M.std(theme.accent, { emissive: theme.accent, emissiveIntensity: 1.2, rough: 0.3 })
    );
    lampGlow.position.set(dx, frameH + 0.06, dz);
    scene.add(lampGlow);
    var halo = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 10), M.glow(theme.accent, 0.16, true));
    halo.position.copy(lampGlow.position);
    scene.add(halo);
  });

  // ---------- 家具 ----------
  ROOMS.forEach(function (rm, idx) {
    var rx = rm.cx, rz = rm.cz;
    if (idx === 0) {
      createRug(rx, groundY, rz, 0x9a5f3a);
      createLamp(rx - 7.5, groundY, rz - 7.5);
      createLamp(rx + 7.5, groundY, rz + 7.5);
      createObstacle(rx - 9, groundY, rz - 9, 0x6d8a72);
      createObstacle(rx + 9, groundY, rz + 9, 0x8a7a6d);
      return;
    }
    var jobs = [createTable, createChair, createBed, createBookshelf, createChest, createPool, createCabinet, createLamp, createObstacle];
    var count = 3 + Math.floor(Math.random() * 2);
    for (var fi = 0; fi < count; fi++) {
      var fn = jobs[Math.floor(Math.random() * jobs.length)];
      var ax = rx + (Math.random() - 0.5) * 15;
      var az = rz + (Math.random() - 0.5) * 15;
      if (fn === createObstacle) fn(ax, groundY, az, [0x6d8a72, 0x8a7a6d, 0x7a7a8a][Math.floor(Math.random() * 3)]);
      else if (fn === createTable) fn(ax, groundY, az, [0x9a6b42, 0x8a5c38, 0xa87a50][Math.floor(Math.random() * 3)]);
      else fn(ax, groundY, az);
    }
  });

  createLargeObstacles();
  createShip();
  scatterGroundDecor(theme);
  addChapterDecorations(chapterData);
}

// ============================================================
// 地面散落装饰：灌木 / 石块 / 草簇 / 花（实例化，极少 draw call）
// ============================================================
function scatterGroundDecor(theme) {
  var S = VX.shape, M = VX.materials;

  var bushMat = M.std(theme.decor === 'ice' ? 0xbfe0ef : theme.decor === 'desert' ? 0xc8a86a :
    theme.decor === 'volcano' ? 0x5a3a32 : theme.decor === 'space' ? 0x4a4288 : 0x5aa855,
    { rough: 0.9, flat: true });
  var rockMat = M.std(theme.decor === 'ice' ? 0xcfdfe8 : theme.decor === 'space' ? 0x3d3768 : 0x8b8577, { rough: 0.95, flat: true });
  var grassMat = M.std(theme.decor === 'ice' ? 0xd8eef8 : theme.decor === 'desert' ? 0xd4b478 :
    theme.decor === 'volcano' ? 0x6e4a3e : theme.decor === 'space' ? 0x5a4f9a : 0x63a85e,
    { rough: 0.85, flat: true });

  // 生成位置：每房间随机散布，避开中心飞船与墙边
  var spots = [];
  ROOMS.forEach(function (rm) {
    for (var i = 0; i < 9; i++) {
      var x = rm.cx + (Math.random() - 0.5) * (roomSize - 6);
      var z = rm.cz + (Math.random() - 0.5) * (roomSize - 6);
      if (Math.abs(x) < 4.5 && Math.abs(z) < 4.5) continue; // 让开飞船
      spots.push([x, z]);
    }
  });

  var dummy = new THREE.Object3D();

  // 灌木
  var bushGeo = S.blob(0.44, 0.32, 9);
  var bushes = new THREE.InstancedMesh(bushGeo, bushMat, spots.length);
  bushes.castShadow = true;
  bushes.receiveShadow = true;
  spots.forEach(function (p, i) {
    var s = 0.75 + Math.random() * 0.75;
    dummy.position.set(p[0], 0.34 * s, p[1]);
    dummy.rotation.set(0, Math.random() * Math.PI, 0);
    dummy.scale.set(s, s * 1.05, s);
    dummy.updateMatrix();
    bushes.setMatrixAt(i, dummy.matrix);
  });
  scene.add(bushes);

  // 石块
  var rockGeo = new THREE.DodecahedronGeometry(0.26, 0);
  var rocks = new THREE.InstancedMesh(rockGeo, rockMat, spots.length);
  rocks.castShadow = true;
  rocks.receiveShadow = true;
  spots.forEach(function (p, i) {
    var s = 0.5 + Math.random() * 0.9;
    dummy.position.set(p[0] + (Math.random() - 0.5) * 3, 0.14 * s, p[1] + (Math.random() - 0.5) * 3);
    dummy.rotation.set(Math.random(), Math.random() * Math.PI, Math.random() * 0.4);
    dummy.scale.set(s, s * 0.75, s);
    dummy.updateMatrix();
    rocks.setMatrixAt(i, dummy.matrix);
  });
  scene.add(rocks);

  // 草簇：每个点位放 4 根，用实例化一次画完
  var bladeGeo = new THREE.ConeGeometry(0.055, 0.42, 4);
  bladeGeo.translate(0, 0.21, 0);
  var bladeCount = spots.length * 4;
  var grass = new THREE.InstancedMesh(bladeGeo, grassMat, bladeCount);
  grass.castShadow = false;
  var gi = 0;
  spots.forEach(function (p) {
    for (var k = 0; k < 4; k++) {
      dummy.position.set(p[0] + (Math.random() - 0.5) * 1.1, 0, p[1] + (Math.random() - 0.5) * 1.1);
      dummy.rotation.set((Math.random() - 0.5) * 0.35, Math.random() * Math.PI, (Math.random() - 0.5) * 0.35);
      var gs = 0.7 + Math.random() * 0.9;
      dummy.scale.set(gs, gs, gs);
      dummy.updateMatrix();
      grass.setMatrixAt(gi++, dummy.matrix);
    }
  });
  scene.add(grass);

  // 花：彩色小花点缀（森林/沙漠才有）
  if (theme.decor === 'forest' || theme.decor === 'desert') {
    var petalGeo = new THREE.SphereGeometry(0.075, 6, 5);
    var petalMat = M.std(theme.decor === 'desert' ? 0xff9f43 : 0xffd166, { rough: 0.6, flat: true });
    var flowerCount = Math.floor(spots.length * 0.34);
    var flowers = new THREE.InstancedMesh(petalGeo, petalMat, flowerCount);
    for (var f = 0; f < flowerCount; f++) {
      var sp = spots[f];
      dummy.position.set(sp[0] + (Math.random() - 0.5) * 5, 0.16 + Math.random() * 0.06, sp[1] + (Math.random() - 0.5) * 5);
      dummy.rotation.set(0, Math.random() * Math.PI, 0);
      var fs = 0.55 + Math.random() * 0.4;
      dummy.scale.set(fs, fs * 0.7, fs);
      dummy.updateMatrix();
      flowers.setMatrixAt(f, dummy.matrix);
    }
    scene.add(flowers);
  }
}

// ============================================================
// 大型障碍物
// ============================================================
function createLargeObstacles() {
  var S = VX.shape, M = VX.materials;
  var wood = VX_ROOM.wood, woodDark = VX_ROOM.woodDark, theme = VX_ROOM.theme;

  ROOMS.forEach(function (rm) {
    // 倒下的柜子
    var fallen = new THREE.Group();
    var body = new THREE.Mesh(S.roundedBox(1.45, 0.5, 0.62, 0.05, 2), wood);
    body.position.y = 0.32;
    body.rotation.x = 1.42;
    body.castShadow = true;
    body.receiveShadow = true;
    fallen.add(body);

    [-0.46, 0.46].forEach(function (dx) {
      var door = new THREE.Mesh(S.roundedBox(0.56, 0.4, 0.04, 0.02, 2), woodDark);
      door.position.set(dx, 0.32, 0.28);
      door.rotation.x = 1.42;
      fallen.add(door);
      var knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), M.metal(0xffd166));
      knob.position.set(dx + 0.2, 0.38, 0.24);
      fallen.add(knob);
    });

    var fx = rm.cx + (Math.random() - 0.5) * (roomSize - 11);
    var fz = rm.cz + (Math.random() - 0.5) * (roomSize - 11);
    if (rm.cx === 0 && rm.cz === 0) {
      if (Math.abs(fx) < 8) fx = fx < 0 ? -10 : 10;
      if (Math.abs(fz) < 8) fz = fz < 0 ? -10 : 10;
    }
    fallen.position.set(fx, groundY, fz);
    fallen.rotation.y = Math.random() * Math.PI * 2;
    scene.add(fallen);
    obstacles.push(fallen);

    // 矮围栏
    var fence = new THREE.Group();
    var fenceLen = 2 + Math.random() * 2;
    var railTop = new THREE.Mesh(S.roundedBox(fenceLen, 0.11, 0.11, 0.04, 2), wood);
    railTop.position.y = 0.72;
    railTop.castShadow = true;
    fence.add(railTop);
    var railMid = railTop.clone();
    railMid.position.y = 0.4;
    fence.add(railMid);
    for (var pi = -1; pi <= 1; pi += 2) {
      var post = new THREE.Mesh(S.roundedBox(0.13, 0.86, 0.13, 0.03, 2), woodDark);
      post.position.set(pi * fenceLen / 2, 0.43, 0);
      post.castShadow = true;
      fence.add(post);
    }
    var fenceX = rm.cx + (Math.random() - 0.5) * (roomSize - 11);
    var fenceZ = rm.cz + (Math.random() - 0.5) * (roomSize - 11);
    if (rm.cx === 0 && rm.cz === 0) {
      if (Math.abs(fenceX) < 8) fenceX = fenceX < 0 ? -10 : 10;
      if (Math.abs(fenceZ) < 8) fenceZ = fenceZ < 0 ? -10 : 10;
    }
    fence.position.set(fenceX, groundY, fenceZ);
    fence.rotation.y = Math.random() * Math.PI * 2;
    scene.add(fence);
    obstacles.push(fence);
  });
}

// ============================================================
// 逃生飞船
// ============================================================
function createShip() {
  var S = VX.shape, M = VX.materials;
  var theme = VX_ROOM.theme || VX.palette.theme(GS.chapter);
  var g = new THREE.Group();

  var hullMat = M.std(0xdfe8f2, { rough: 0.35, metal: 0.55 });
  var accentMat = M.std(theme.accent, { rough: 0.4, metal: 0.3 });
  var darkMat = M.std(0x38415a, { rough: 0.55, metal: 0.4 });

  // 主体：圆润的胶囊舱
  var hull = new THREE.Mesh(S.taper(0.95, 1.15, 2.0, 24, function (t) {
    return Math.sin(t * Math.PI * 0.92) * 0.92 + t * 0.18;
  }), hullMat);
  hull.position.y = 1.55;
  hull.castShadow = true;
  g.add(hull);

  // 顶部圆顶
  var dome = new THREE.Mesh(new THREE.SphereGeometry(0.95, 22, 14, 0, Math.PI * 2, 0, Math.PI / 2), hullMat);
  dome.position.y = 2.55;
  dome.castShadow = true;
  g.add(dome);

  // 舷窗
  var glass = new THREE.Mesh(new THREE.CircleGeometry(0.36, 20), M.energy(0x7fe4ff, 0.75));
  glass.position.set(0, 1.95, 0.92);
  glass.rotation.x = -0.12;
  g.add(glass);
  var glassRim = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.06, 8, 24), darkMat);
  glassRim.position.set(0, 1.95, 0.9);
  glassRim.rotation.x = -0.12;
  g.add(glassRim);

  // 腰带
  var band = new THREE.Mesh(new THREE.TorusGeometry(1.02, 0.08, 8, 28), accentMat);
  band.position.y = 1.15;
  band.rotation.x = Math.PI / 2;
  g.add(band);

  // 尾翼 + 支脚
  for (var i = 0; i < 3; i++) {
    var a = i * Math.PI * 2 / 3 + Math.PI / 6;
    var fin = new THREE.Mesh(S.roundedBox(0.16, 1.1, 0.62, 0.05, 2), accentMat);
    fin.position.set(Math.sin(a) * 1.0, 0.72, Math.cos(a) * 1.0);
    fin.rotation.y = a;
    fin.rotation.x = 0.12;
    fin.castShadow = true;
    g.add(fin);

    var leg = new THREE.Mesh(S.capsule(0.075, 0.5, 10, 4), darkMat);
    leg.position.set(Math.sin(a + 0.5) * 1.05, 0.42, Math.cos(a + 0.5) * 1.05);
    leg.rotation.z = Math.sin(a + 0.5) * 0.28;
    leg.rotation.x = -Math.cos(a + 0.5) * 0.28;
    g.add(leg);

    var foot = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.1, 10), darkMat);
    foot.position.set(Math.sin(a + 0.5) * 1.12, 0.06, Math.cos(a + 0.5) * 1.12);
    g.add(foot);
  }

  // 顶部信标
  var beacon = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 10),
    M.std(theme.accent, { emissive: theme.accent, emissiveIntensity: 1.4, rough: 0.2 }));
  beacon.position.y = 3.62;
  g.add(beacon);
  var beaconGlow = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 10), M.glow(theme.accent, 0.18, true));
  beaconGlow.position.y = 3.62;
  g.add(beaconGlow);
  var mast = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.5, 6), darkMat);
  mast.position.y = 3.35;
  g.add(mast);

  // 地面能量环
  var ring = new THREE.Mesh(VX.shape.ring(1.5, 1.9, 44), M.glow(theme.accent, 0.28, true));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  g.add(ring);

  var ring2 = new THREE.Mesh(VX.shape.ring(2.1, 2.24, 44), M.glow(0xffffff, 0.12, true));
  ring2.rotation.x = -Math.PI / 2;
  ring2.position.y = 0.035;
  g.add(ring2);

  g.userData = { ring: ring, ring2: ring2, beacon: beacon, beaconGlow: beaconGlow };
  g.position.set(0, groundY, 0);
  scene.add(g);
  ship = g;
  window.ship = g;
}

// ============================================================
// 章节主题装饰物
// ============================================================
function addChapterDecorations(chd) {
  var S = VX.shape, M = VX.materials;
  var theme = VX_ROOM.theme || VX.palette.theme(chd.id);
  var positions = [];
  ROOMS.forEach(function (rm, idx) {
    if (idx === 0) {
      positions.push([rm.cx - 14, rm.cz - 14], [rm.cx + 14, rm.cz + 14]);
    } else {
      positions.push([rm.cx - 12, rm.cz - 12], [rm.cx + 12, rm.cz + 10], [rm.cx - 8, rm.cz + 14]);
    }
  });

  positions.forEach(function (pos) {
    var deco = new THREE.Group();

    if (chd.id === 1) {
      // 树：树干 + 三层圆润树冠
      var trunk = new THREE.Mesh(S.taper(0.22, 0.34, 2.3, 12), M.std(0x6b4a33, { rough: 0.9, map: M.wood() }));
      trunk.position.y = 1.15;
      trunk.castShadow = true;
      deco.add(trunk);

      [[1.45, 1.7, 0.55], [1.1, 1.35, 1.75], [0.75, 0.95, 2.6]].forEach(function (c, ci) {
        var crown = new THREE.Mesh(S.blob(c[0], 0.1, 10), M.std(ci === 2 ? 0x6cbb5e : ci === 1 ? 0x58a94f : 0x479340, { rough: 0.85, flat: true }));
        crown.position.y = c[2];
        crown.scale.y = 0.88;
        crown.castShadow = true;
        deco.add(crown);
      });
      // 树底蘑菇
      var mush = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), M.std(0xe8635a, { rough: 0.7 }));
      mush.position.set(0.42, 0.14, 0.3);
      mush.scale.y = 0.72;
      deco.add(mush);

    } else if (chd.id === 2) {
      // 冰晶簇
      [[0, 0, 1.7, 0.5], [0.62, 0.28, 1.15, 0.34], [-0.55, -0.2, 1.35, 0.3], [0.2, -0.6, 0.85, 0.22]].forEach(function (c, i) {
        var ice = new THREE.Mesh(new THREE.ConeGeometry(c[3], c[2], 6), M.std(0xa8e0f7, {
          rough: 0.12, metal: 0.1, transparent: true, opacity: 0.86,
          emissive: 0x6fc8e8, emissiveIntensity: 0.18
        }));
        ice.position.set(c[0], c[2] / 2, c[1]);
        ice.rotation.z = (Math.random() - 0.5) * 0.34;
        ice.rotation.y = Math.random() * Math.PI;
        ice.castShadow = true;
        deco.add(ice);
      });

    } else if (chd.id === 3) {
      // 阶梯金字塔
      var baseW = 2.6;
      for (var lv = 0; lv < 4; lv++) {
        var w = baseW * (1 - lv * 0.22);
        var step = new THREE.Mesh(S.roundedBox(w, 0.44, w, 0.04, 2), M.std(0xd9b47c - lv * 0x0a0804, { rough: 0.9 }));
        step.position.y = 0.22 + lv * 0.44;
        step.castShadow = true;
        step.receiveShadow = true;
        deco.add(step);
      }
      var tip = new THREE.Mesh(S.crystal(0.28), M.metal(0xffd166));
      tip.position.y = 2.05;
      deco.add(tip);
      var tipGlow = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 10), M.glow(0xffd166, 0.16, true));
      tipGlow.position.y = 2.05;
      deco.add(tipGlow);

    } else if (chd.id === 4) {
      // 火山岩 + 熔岩裂纹
      var rock = new THREE.Mesh(S.blob(1.15, 0.22, 9), M.std(0x4a3230, { rough: 0.95, flat: true }));
      rock.position.y = 0.85;
      rock.castShadow = true;
      deco.add(rock);
      var lava = new THREE.Mesh(S.blob(0.5, 0.3, 8), M.std(0xff6b35, { emissive: 0xff4400, emissiveIntensity: 1.1, rough: 0.5 }));
      lava.position.set(0.1, 1.28, 0.12);
      deco.add(lava);
      var lavaGlow = new THREE.Mesh(new THREE.SphereGeometry(0.85, 10, 10), M.glow(0xff5500, 0.14, true));
      lavaGlow.position.set(0.1, 1.3, 0.12);
      deco.add(lavaGlow);

    } else {
      // 太空水晶簇
      var base = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.95, 0.5, 8), M.std(0x2f2a5c, { rough: 0.8 }));
      base.position.y = 0.25;
      base.castShadow = true;
      deco.add(base);
      [[0, 1.6, 0.55, 0], [0.45, 1.1, 0.32, 0.4], [-0.42, 1.25, 0.36, -0.35]].forEach(function (c) {
        var crystal = new THREE.Mesh(S.crystal(c[2]), M.energy(0xb28dff, 0.82));
        crystal.position.set(c[0], c[1], c[3]);
        crystal.rotation.z = c[3];
        crystal.castShadow = true;
        deco.add(crystal);
      });
      var cg = new THREE.Mesh(new THREE.SphereGeometry(1.1, 10, 10), M.glow(0xb28dff, 0.12, true));
      cg.position.y = 1.3;
      deco.add(cg);
    }

    deco.position.set(pos[0], groundY, pos[1]);
    deco.rotation.y = Math.random() * Math.PI * 2;
    scene.add(deco);
  });
}

// ============================================================
// 家具
// ============================================================
function createTable(x, y, z, color) {
  var S = VX.shape, M = VX.materials;
  var g = new THREE.Group();
  var topMat = new THREE.MeshStandardMaterial({ color: color || 0x9a6b42, roughness: 0.7, map: M.wood() });

  var top = new THREE.Mesh(S.roundedBox(2.0, 0.14, 1.4, 0.06, 3), topMat);
  top.position.y = 0.72;
  top.castShadow = true;
  top.receiveShadow = true;
  g.add(top);

  [-0.78, 0.78].forEach(function (px) {
    [-0.5, 0.5].forEach(function (pz) {
      var leg = new THREE.Mesh(S.taper(0.045, 0.055, 0.68, 8), VX_ROOM.woodDark);
      leg.position.set(px, 0.34, pz);
      leg.castShadow = true;
      g.add(leg);
    });
  });

  // 桌上：花瓶 + 花
  var vase = new THREE.Mesh(S.taper(0.1, 0.13, 0.22, 12), M.std(0x5fa8d8, { rough: 0.3, metal: 0.1 }));
  vase.position.set(0.52, 0.88, 0.18);
  vase.castShadow = true;
  g.add(vase);
  [[0, 0.12, 0, 0.09], [0.09, 0.06, 0.04, 0.065], [-0.07, 0.05, -0.03, 0.06]].forEach(function (f) {
    var flower = new THREE.Mesh(S.blob(f[3], 0.12, 8), M.std(0xff8fb5, { rough: 0.65, flat: true }));
    flower.position.set(0.52 + f[0], 1.02 + f[1], 0.18 + f[2]);
    g.add(flower);
  });

  // 桌上：一摞书
  var bookColors = [0xd85a5a, 0x5a8fd8, 0x5ad8a0];
  for (var b = 0; b < 3; b++) {
    var book = new THREE.Mesh(S.roundedBox(0.3, 0.05, 0.4, 0.012, 2), M.std(bookColors[b], { rough: 0.75 }));
    book.position.set(-0.52, 0.8 + b * 0.055, 0.26);
    book.rotation.y = 0.24 + b * 0.06;
    book.castShadow = true;
    g.add(book);
  }

  g.position.set(x, y, z);
  g.rotation.y = Math.random() * 0.6;
  scene.add(g);
  furniture.push(g);
}

function createChair(x, y, z) {
  var S = VX.shape;
  var g = new THREE.Group();
  var seat = new THREE.Mesh(S.roundedBox(0.54, 0.1, 0.54, 0.05, 3), VX_ROOM.wood);
  seat.position.y = 0.42;
  seat.castShadow = true;
  g.add(seat);

  var back = new THREE.Mesh(S.roundedBox(0.5, 0.46, 0.08, 0.04, 3), VX_ROOM.wood);
  back.position.set(0, 0.66, -0.24);
  back.rotation.x = -0.06;
  back.castShadow = true;
  g.add(back);

  // 坐垫
  var pad = new THREE.Mesh(S.roundedBox(0.46, 0.07, 0.44, 0.035, 3), VX.materials.cloth(0xd8654f));
  pad.position.set(0, 0.49, 0.01);
  g.add(pad);

  [-0.2, 0.2].forEach(function (px) {
    [-0.2, 0.2].forEach(function (pz) {
      var leg = new THREE.Mesh(S.taper(0.028, 0.038, 0.4, 6), VX_ROOM.woodDark);
      leg.position.set(px, 0.2, pz);
      g.add(leg);
    });
  });

  g.position.set(x, y, z);
  g.rotation.y = Math.random() * Math.PI * 2;
  scene.add(g);
  furniture.push(g);
}

function createBed(x, y, z) {
  var S = VX.shape, M = VX.materials;
  var g = new THREE.Group();

  var frame = new THREE.Mesh(S.roundedBox(1.9, 0.3, 1.3, 0.07, 3), VX_ROOM.wood);
  frame.position.y = 0.2;
  frame.castShadow = true;
  frame.receiveShadow = true;
  g.add(frame);

  var mattress = new THREE.Mesh(S.roundedBox(1.78, 0.2, 1.2, 0.09, 3), M.cloth(0xf2ece0));
  mattress.position.y = 0.42;
  mattress.castShadow = true;
  g.add(mattress);

  var pillow = new THREE.Mesh(S.roundedBox(0.52, 0.14, 0.42, 0.07, 3), M.cloth(0xffffff));
  pillow.position.set(-0.56, 0.55, 0);
  pillow.rotation.y = 0.06;
  g.add(pillow);

  var blanket = new THREE.Mesh(S.roundedBox(0.95, 0.1, 1.16, 0.06, 3), M.cloth(0x7fb3d8));
  blanket.position.set(0.42, 0.54, 0);
  g.add(blanket);

  var headboard = new THREE.Mesh(S.roundedBox(0.1, 0.62, 1.3, 0.05, 3), VX_ROOM.woodDark);
  headboard.position.set(-0.95, 0.5, 0);
  headboard.castShadow = true;
  g.add(headboard);

  g.position.set(x, y, z);
  g.rotation.y = Math.random() * 0.3 - 0.15;
  scene.add(g);
  furniture.push(g);
}

function createBookshelf(x, y, z) {
  var S = VX.shape, M = VX.materials;
  var g = new THREE.Group();

  var backPanel = new THREE.Mesh(S.roundedBox(0.92, 1.5, 0.08, 0.03, 2), VX_ROOM.woodDark);
  backPanel.position.set(0, 0.75, -0.18);
  g.add(backPanel);

  [-0.44, 0.44].forEach(function (px) {
    var side = new THREE.Mesh(S.roundedBox(0.1, 1.5, 0.4, 0.035, 2), VX_ROOM.wood);
    side.position.set(px, 0.75, 0);
    side.castShadow = true;
    g.add(side);
  });

  var shelfYs = [0.12, 0.56, 1.0, 1.44];
  shelfYs.forEach(function (sy) {
    var shelf = new THREE.Mesh(S.roundedBox(0.9, 0.06, 0.38, 0.02, 2), VX_ROOM.wood);
    shelf.position.set(0, sy, 0);
    g.add(shelf);
  });

  var bookColors = [0xd85a5a, 0x5a8fd8, 0x5ad8a0, 0xf0c24a, 0xd86fb0, 0x9a7fd8];
  for (var s = 0; s < 3; s++) {
    var cnt = 3 + Math.floor(Math.random() * 3);
    for (var i = 0; i < cnt; i++) {
      var h = 0.2 + Math.random() * 0.1;
      var bk = new THREE.Mesh(S.roundedBox(0.07, h, 0.26, 0.008, 2), M.std(bookColors[Math.floor(Math.random() * bookColors.length)], { rough: 0.8 }));
      bk.position.set(-0.34 + i * 0.11 + Math.random() * 0.02, shelfYs[s] + 0.03 + h / 2, 0.02);
      bk.rotation.z = Math.random() > 0.85 ? 0.14 : 0;
      g.add(bk);
    }
  }

  g.position.set(x, y, z);
  g.rotation.y = (Math.random() - 0.5) * 0.8;
  scene.add(g);
  furniture.push(g);
  secondRoomObjects.push(g);
}

function createChest(x, y, z) {
  var S = VX.shape, M = VX.materials;
  var g = new THREE.Group();

  var body = new THREE.Mesh(S.roundedBox(0.86, 0.56, 0.62, 0.06, 3), VX_ROOM.wood);
  body.position.y = 0.3;
  body.castShadow = true;
  g.add(body);

  var lid = new THREE.Mesh(S.roundedBox(0.88, 0.2, 0.64, 0.08, 3), VX_ROOM.woodDark);
  lid.position.y = 0.64;
  lid.castShadow = true;
  g.add(lid);

  // 金属包角
  [-0.3, 0.3].forEach(function (bx) {
    var strapM = new THREE.Mesh(S.roundedBox(0.07, 0.62, 0.66, 0.02, 2), M.metal(0xc9a227));
    strapM.position.set(bx, 0.42, 0);
    g.add(strapM);
  });

  var lock = new THREE.Mesh(S.roundedBox(0.14, 0.16, 0.06, 0.03, 2), M.metal(0xe8c34a));
  lock.position.set(0, 0.56, 0.33);
  g.add(lock);

  // 缝隙发光
  var seam = new THREE.Mesh(S.roundedBox(0.8, 0.035, 0.02, 0.01, 2), M.glow(0xffd166, 0.7, true));
  seam.position.set(0, 0.54, 0.32);
  g.add(seam);

  g.position.set(x, y, z);
  g.rotation.y = Math.random() * Math.PI * 2;
  scene.add(g);
  furniture.push(g);
  secondRoomObjects.push(g);
}

function createPool(x, y, z) {
  var S = VX.shape, M = VX.materials;
  var g = new THREE.Group();

  var rim = new THREE.Mesh(S.roundedBox(2.2, 0.24, 1.8, 0.08, 3), M.std(0x9aa4ae, { rough: 0.7 }));
  rim.position.y = 0.12;
  rim.castShadow = true;
  rim.receiveShadow = true;
  g.add(rim);

  var water = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.5, 8, 8), M.energy(0x4fb8e8, 0.72));
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.21;
  g.add(water);
  g.userData.water = water;

  var glow = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.4), M.glow(0x7fdcff, 0.16, true));
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.225;
  g.add(glow);

  g.position.set(x, y, z);
  scene.add(g);
  furniture.push(g);
}

function createCabinet(x, y, z) {
  var S = VX.shape, M = VX.materials;
  var g = new THREE.Group();

  var body = new THREE.Mesh(S.roundedBox(1.05, 1.5, 0.62, 0.06, 3), VX_ROOM.wood);
  body.position.y = 0.75;
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);

  [-0.26, 0.26].forEach(function (dx) {
    var door = new THREE.Mesh(S.roundedBox(0.44, 1.24, 0.05, 0.03, 3), VX_ROOM.woodDark);
    door.position.set(dx, 0.75, 0.33);
    g.add(door);
    var handle = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 10), M.metal(0xe8c34a));
    handle.position.set(dx + (dx > 0 ? -0.16 : 0.16), 0.75, 0.38);
    g.add(handle);
  });

  g.position.set(x, y, z);
  g.rotation.y = (Math.random() - 0.5) * 1.2;
  scene.add(g);
  furniture.push(g);
}

function createRug(x, y, z, color) {
  var M = VX.materials;
  var g = new THREE.Group();

  var rug = new THREE.Mesh(new THREE.CircleGeometry(2.4, 32), M.cloth(color || 0x9a5f3a));
  rug.rotation.x = -Math.PI / 2;
  rug.position.y = 0.012;
  rug.receiveShadow = true;
  g.add(rug);

  var inner = new THREE.Mesh(new THREE.RingGeometry(1.5, 2.05, 32), M.cloth(0xc98a5a));
  inner.rotation.x = -Math.PI / 2;
  inner.position.y = 0.015;
  g.add(inner);

  var border = new THREE.Mesh(new THREE.TorusGeometry(2.36, 0.06, 6, 40), M.std(0xe8d9a8, { rough: 0.8 }));
  border.rotation.x = Math.PI / 2;
  border.position.y = 0.02;
  g.add(border);

  g.position.set(x, y, z);
  scene.add(g);
  furniture.push(g);
}

function createLamp(x, y, z) {
  var S = VX.shape, M = VX.materials;
  var g = new THREE.Group();

  var base = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.09, 12), M.metal(0x4a4a5a));
  base.position.y = 0.045;
  base.castShadow = true;
  g.add(base);

  var pole = new THREE.Mesh(S.capsule(0.045, 1.1, 8, 4), M.metal(0x5a5a6a));
  pole.position.y = 0.66;
  g.add(pole);

  var shade = new THREE.Mesh(S.taper(0.16, 0.3, 0.38, 16), M.std(0xfff0c8, {
    rough: 0.5, emissive: 0xffcf7a, emissiveIntensity: 0.55
  }));
  shade.position.y = 1.35;
  shade.castShadow = true;
  g.add(shade);

  var bulbGlow = new THREE.Mesh(new THREE.SphereGeometry(0.38, 12, 12), M.glow(0xffcf7a, 0.14, true));
  bulbGlow.position.y = 1.3;
  g.add(bulbGlow);

  g.position.set(x, y, z);
  scene.add(g);
  furniture.push(g);
}

function createObstacle(x, y, z, color) {
  var S = VX.shape, M = VX.materials;
  var g = new THREE.Group();
  var h = 0.45 + Math.random() * 0.3;
  var w = 0.6 + Math.random() * 0.3;

  var obs = new THREE.Mesh(S.blob(0.5, 0.2, 8), M.std(color || 0x7a7a8a, { rough: 0.9, flat: true }));
  obs.position.y = h * 0.55;
  obs.scale.set(w, h, w * 0.9);
  obs.castShadow = true;
  obs.receiveShadow = true;
  g.add(obs);

  g.position.set(x, y, z);
  g.rotation.y = Math.random() * Math.PI * 2;
  scene.add(g);
  obstacles.push(g);
  furniture.push(g);
}

// ---------- 导出 ----------
window.buildRoom = buildRoom;
window.scatterGroundDecor = scatterGroundDecor;
window.createLargeObstacles = createLargeObstacles;
window.createShip = createShip;
window.addChapterDecorations = addChapterDecorations;
window.createTable = createTable;
window.createChair = createChair;
window.createBed = createBed;
window.createBookshelf = createBookshelf;
window.createChest = createChest;
window.createPool = createPool;
window.createCabinet = createCabinet;
window.createRug = createRug;
window.createLamp = createLamp;
window.createObstacle = createObstacle;
