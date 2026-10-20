// ============================================================
// Three.js 场景
// ============================================================
var scene, camera, renderer, clock, player;
var monsters = [];
var bosses = [];
var keys = {}, mouse = { x: 0, y: 0 }, targetMouse = { x: 0, y: 0 }, isPointerLocked = false;
var walls = [], projectiles = [];
var attackCooldown = 0;
var hitFlash = 0, monsterHitFlash = 0;
var roomSize = 40, halfRoom = 20;
var ROOMS = [
  { cx: 0, cz: 0, name: '中央' },
  { cx: 0, cz: -40, name: '北' },
  { cx: 40, cz: 0, name: '东' },
  { cx: 0, cz: 40, name: '南' },
  { cx: -40, cz: 0, name: '西' },
  { cx: 40, cz: -40, name: '东北' },
  { cx: 40, cz: 40, name: '东南' },
  { cx: -40, cz: -40, name: '西北' },
  { cx: -40, cz: 40, name: '西南' }
];
var DOOR_HALF = 3.6;
// 3x3网格中12扇门的位置
var DOOR_POSITIONS = [
  // 垂直墙（x=-20和x=20）上的门: [x, z]
  [-20, -40], [-20, 0], [-20, 40],
  [20, -40], [20, 0], [20, 40],
  // 水平墙（z=-20和z=20）上的门
  [-40, -20], [0, -20], [40, -20],
  [-40, 20], [0, 20], [40, 20]
];
function roomIndexOf(x, z) {
  var best = 0, bd = 1e9;
  for (var i = 0; i < ROOMS.length; i++) {
    var d = Math.abs(x - ROOMS[i].cx) + Math.abs(z - ROOMS[i].cz);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}
var ship = null, energyOrb = null, lastEnergyOrbRoom = null;
var moveSpeed = 5;
var gravity = -12;
var playerVelY = 0;
var groundY = 0;
var furniture = [];
var doorObjects = [];
var obstacles = [];
var secondRoomObjects = [];

// 手电筒相关
var flashlightActive = false;
var flashlightSpotLight = null;
var flashlightDuration = 0;
var flashlightCooldown = 0;
var FLASHLIGHT_MAX_DURATION = 15;
var FLASHLIGHT_COOLDOWN = 30;

// 中央房间怪物刷新计时器
var centerRoomMonsterTimer = 30;
var centerRoomMonstersSpawned = false;

// 怪物刷新房间追踪（防止连续刷新在同一个房间）
var lastMonsterSpawnRoom = null;
var lastBossSpawnRoom = null;

// 抓捕者系统
var chaserMonster = null;
var captureState = {
  captured: false,
  tapCount: 0,
  maxTap: 10,
  dmgTimer: 0,
  grabCooldown: 0,
  tapDecayTimer: 0,      // 挣脱进度衰减计时
  escapeBoostTimer: 0    // 挣脱后的加速逃跑窗口
};
var chaserLeaveTimer = 0;      // 抓捕者离开计时器
var CHASER_LEAVE_DURATION = 60; // 60秒后自动离开
var CHASER_RESPAWN_DELAY = 30;  // 离开后30秒重新生成

// 初始化场景
function initScene() {
  var loading = document.getElementById('loading');
  scene = new THREE.Scene();
  // 同步到 window 供联机同步模块使用
  window.scene = scene;
  scene.background = new THREE.Color(0x1a1a2e);
  scene.fog = new THREE.Fog(0x1a1a2e, 8, 13);

  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 50);
  camera.position.set(0, 5, 10);
  // 同步到 window 供联机模块使用
  window.camera = camera;

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  document.body.appendChild(renderer.domElement);

  clock = new THREE.Clock();

  var ambient = new THREE.AmbientLight(0x4466aa, 0.4);
  scene.add(ambient);
  var dirLight = new THREE.DirectionalLight(0xffeedd, 1);
  dirLight.position.set(8, 15, 8);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 2048;
  dirLight.shadow.mapSize.height = 2048;
  dirLight.shadow.camera.near = 0.5;
  dirLight.shadow.camera.far = 40;
  dirLight.shadow.camera.left = -20;
  dirLight.shadow.camera.right = 20;
  dirLight.shadow.camera.top = 20;
  dirLight.shadow.camera.bottom = -20;
  scene.add(dirLight);
  var fillLight = new THREE.DirectionalLight(0x8888ff, 0.3);
  fillLight.position.set(-5, 8, -8);
  scene.add(fillLight);

  buildRoom();
  createPlayer();
  initPlayerAnimation();

  if (GS.mode === 'multiplayer' && !GS.isHost) {
    // 加入者模式：不创建怪物、宝箱、道具（由主机同步）
    // 但保留武器栏
    buildWeaponBar();
    // 初始化空数组（必须挂载到 window 以便同步模块访问）
    // 注意：如果 items 已经被 _syncItems 同步过，不要覆盖（会丢失已同步道具）
    if (typeof window.items === 'undefined' || window.items.length === 0) {
      window.items = [];
    }
    if (typeof window.monsters === 'undefined' || window.monsters.length === 0) {
      window.monsters = [];
    }
    if (typeof window.bosses === 'undefined' || window.bosses.length === 0) {
      window.bosses = [];
    }
    if (typeof window.normalChests === 'undefined' || window.normalChests.length === 0) {
      window.normalChests = [];
    }
    if (typeof window.fragmentDrops === 'undefined' || window.fragmentDrops.length === 0) {
      window.fragmentDrops = [];
    }
    window.chaserMonster = null;
    // 同步局部变量引用
    monsters = window.monsters;
    bosses = window.bosses;
    items = window.items;
    normalChests = window.normalChests;
    fragmentDrops = window.fragmentDrops;
    chaserMonster = window.chaserMonster;
    energyOrb = window.energyOrb;
  } else {
    // 单机模式 / 主机模式：创建所有游戏实体
    initMonsters();
    spawnEnergyOrb();
    spawnItems();
    spawnInitialChests();
    buildWeaponBar();
  }

  // 同步所有游戏实体引用到 window，供联机同步模块访问
  // 对于加入者，这些已经在上面设置过，这里是安全的兜底
  window.monsters = monsters;
  window.bosses = bosses;
  window.items = items;
  window.normalChests = normalChests;
  window.fragmentDrops = fragmentDrops;
  // 注意：energyOrb/chaserMonster/ship 已在 spawnEnergyOrb/spawnChaser/createShip 中设置
  // 这里不要重置为 null，否则会覆盖已有的值
  if (!window.energyOrb) window.energyOrb = null;
  if (!window.chaserMonster) window.chaserMonster = null;
  if (!window.ship) window.ship = null;
  window.clock = clock;

  AudioMgr.init();


  document.getElementById('char-name').textContent = GS.character === 'qike' ? '奇奇' : '妙妙';

  window.addEventListener('resize', function () {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
  document.addEventListener('keydown', function (e) {
    keys[e.key.toLowerCase()] = true;
    if (e.key === ' ') { e.preventDefault(); tryJump(); }
    if (e.key === 'f' || e.key === 'F') { toggleFlashlight(); }
    // 桌面端：被抓住时按空格挣脱
    if (e.key === ' ' && captureState && captureState.captured) {
      e.preventDefault();
      onCaptureTap();
    }
  });
  document.addEventListener('keyup', function (e) { keys[e.key.toLowerCase()] = false });
  document.addEventListener('mousemove', function (e) {
    if (isPointerLocked) {
      targetMouse.x -= e.movementX * 0.0015;
      targetMouse.y = 0;
    }
  });
  document.addEventListener('pointerlockchange', function () { isPointerLocked = document.pointerLockElement === renderer.domElement });
  renderer.domElement.addEventListener('click', function () {
    if (!IS_TOUCH && !isPointerLocked && !GS.gameOver && GS.running) renderer.domElement.requestPointerLock();
  });
  document.addEventListener('mousedown', function (e) { if (e.button === 0 && isPointerLocked) attack() });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'q' || e.key === 'Q') useSkill();
  });

  setupTouchControls();

  document.getElementById('hud').classList.remove('hidden');
  updateHUD();
  loading.style.opacity = '0';
  setTimeout(function () { loading.style.display = 'none' }, 500);
  GS.running = true;
  animate();
}

// ============================================================
// 场景建造
// ============================================================
function buildRoom() {
  var chapterData = CHAPTERS[GS.chapter - 1] || CHAPTERS[0];
  // 背景色必须与雾色一致，否则远处物体会以剪影形式透出形状（冰雪峡谷等章节曾出现）
  scene.background = new THREE.Color(chapterData.fogColor);
  scene.fog = new THREE.Fog(chapterData.fogColor, 8, 13);

  var floorMat = new THREE.MeshStandardMaterial({ color: chapterData.floorColor, roughness: 0.92, metalness: 0.05 });
  var wallMat = new THREE.MeshStandardMaterial({ color: chapterData.wallColor, roughness: 0.95, side: THREE.DoubleSide, transparent: true, opacity: 0.6, depthWrite: false });

  ROOMS.forEach(function (rm) {
    var floor = new THREE.Mesh(new THREE.PlaneGeometry(roomSize, roomSize), floorMat);
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
    floor.position.set(rm.cx, groundY, rm.cz);
    scene.add(floor);
    var grid = new THREE.GridHelper(roomSize, 20, 0x1c232e, 0x141a22);
    grid.position.set(rm.cx, groundY + 0.01, rm.cz);
    scene.add(grid);
  });

  function wallSeg(cx, cz, len, ry) {
    var wall = new THREE.Mesh(new THREE.PlaneGeometry(len, 4), wallMat);
    wall.position.set(cx, 2, cz); wall.rotation.y = ry;
    scene.add(wall); walls.push(wall);
  }
  var H = halfRoom, G = DOOR_HALF;
  var S = H * 3; // 60, 半边长（3x3网格总边长的一半）

  // 辅助：在一条墙线上插入带门洞的墙段
  // ry=0: 水平墙(沿x轴)，门位置沿x方向; ry=PI/2: 垂直墙(沿z轴)，门位置沿z方向
  function addSegmentedWall(fixedCoord, ry, doorPositions) {
    var halfLen = S;
    var prev = -halfLen;
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
    if (halfLen > prev + 0.01) {
      var segCenter = (prev + halfLen) / 2;
      var segLen = halfLen - prev;
      if (ry === 0) wallSeg(segCenter, fixedCoord, segLen, 0);
      else wallSeg(fixedCoord, segCenter, segLen, Math.PI / 2);
    }
  }

  // 外墙（完整无门）
  wallSeg(0, -S, 2 * S, 0);        // 上
  wallSeg(0, S, 2 * S, 0);         // 下
  wallSeg(-S, 0, 2 * S, Math.PI / 2); // 左
  wallSeg(S, 0, 2 * S, Math.PI / 2);  // 右

  // 内墙（带门洞）
  // 垂直墙 x=-20, x=20: 门在 z=-40, 0, 40
  addSegmentedWall(-H, Math.PI / 2, [-2 * H, 0, 2 * H]);
  addSegmentedWall(H, Math.PI / 2, [-2 * H, 0, 2 * H]);
  // 水平墙 z=-20, z=20: 门在 x=-40, 0, 40
  addSegmentedWall(-H, 0, [-2 * H, 0, 2 * H]);
  addSegmentedWall(H, 0, [-2 * H, 0, 2 * H]);

  // 门框柱子/横梁（12扇门）
  var frameMat = new THREE.MeshStandardMaterial({ color: 0x1a1014, roughness: 0.9 });
  DOOR_POSITIONS.forEach(function (dp) {
    var dx = dp[0], dz = dp[1];
    // 判断门方向：垂直墙(x固定) or 水平墙(z固定)
    var isVertical = (dx === -H || dx === H);
    // 柱子：左右两侧
    if (isVertical) {
      // 垂直墙：门沿z轴，柱子沿z方向两侧
      [-1, 1].forEach(function (s) {
        var pillar = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.6, 0.3), frameMat);
        pillar.position.set(dx, 1.8, dz + s * (G + 0.2));
        scene.add(pillar);
      });
      // 横梁
      var beam = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, G * 2 + 0.7), frameMat);
      beam.position.set(dx, 3.6, dz);
      scene.add(beam);
    } else {
      // 水平墙：门沿x轴，柱子沿x方向两侧
      [-1, 1].forEach(function (s) {
        var pillar = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.6, 0.3), frameMat);
        pillar.position.set(dx + s * (G + 0.2), 1.8, dz);
        scene.add(pillar);
      });
      // 横梁
      var beam = new THREE.Mesh(new THREE.BoxGeometry(G * 2 + 0.7, 0.3, 0.3), frameMat);
      beam.position.set(dx, 3.6, dz);
      scene.add(beam);
    }
  });

  // 家具分布到9个房间（在每个房间随机放一些）
  ROOMS.forEach(function (rm, idx) {
    var rx = rm.cx, rz = rm.cz;
    // 中央房间只放少量家具（保留飞船区域）
    if (idx === 0) {
      createRug(rx, groundY, rz, 0x884422);
      createLamp(rx - 8, groundY, rz - 8);
      createLamp(rx + 8, groundY, rz + 8);
      createObstacle(rx - 10, groundY, rz - 10, 0x334444);
      createObstacle(rx + 10, groundY, rz + 10, 0x443333);
      return;
    }
    // 其他房间随机分配家具
    var roomFurniture = [
      function () { createTable(rx + (Math.random() - 0.5) * 16, groundY, rz + (Math.random() - 0.5) * 16, [0x4a3328, 0x3a2a20, 0x5a3a28][Math.floor(Math.random() * 3)]); },
      function () { createChair(rx + (Math.random() - 0.5) * 18, groundY, rz + (Math.random() - 0.5) * 18); },
      function () { createBed(rx + (Math.random() - 0.5) * 10, groundY, rz + (Math.random() - 0.5) * 10); },
      function () { createBookshelf(rx + (Math.random() - 0.5) * 12, groundY, rz + (Math.random() - 0.5) * 12); },
      function () { createChest(rx + (Math.random() - 0.5) * 14, groundY, rz + (Math.random() - 0.5) * 14); },
      function () { createPool(rx + (Math.random() - 0.5) * 10, groundY, rz + (Math.random() - 0.5) * 10); },
      function () { createCabinet(rx + (Math.random() - 0.5) * 14, groundY, rz + (Math.random() - 0.5) * 14); },
      function () { createLamp(rx + (Math.random() - 0.5) * 18, groundY, rz + (Math.random() - 0.5) * 18); },
      function () { createObstacle(rx + (Math.random() - 0.5) * 16, groundY, rz + (Math.random() - 0.5) * 16, [0x334444, 0x443333, 0x333a44, 0x3a3344][Math.floor(Math.random() * 4)]); },
    ];
    // 每个房间放3-5件家具
    var count = 3 + Math.floor(Math.random() * 3);
    for (var fi = 0; fi < count; fi++) {
      var fn = roomFurniture[Math.floor(Math.random() * roomFurniture.length)];
      fn();
    }
  });

  // 新增大型障碍物
  createLargeObstacles();

  createShip();
  addChapterDecorations(chapterData);
}

// ============================================================
// 大型障碍物
// ============================================================
function createLargeObstacles() {
  var H = halfRoom;

  // 每个房间添加1-2个大型障碍物
  ROOMS.forEach(function (rm) {
    // 倒下的柜子
    var fallenCabinet = new THREE.Group();
    var cabMat = new THREE.MeshStandardMaterial({ color: 0x5a3d2c, roughness: 0.8 });
    var body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.6, 0.8), cabMat);
    body.position.y = 0.3;
    body.rotation.z = Math.PI / 2.5; // 倾斜倒下
    body.castShadow = true;
    fallenCabinet.add(body);
    // 柜门
    var doorMat = new THREE.MeshStandardMaterial({ color: 0x4a2d1c, roughness: 0.7 });
    var door = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.04, 0.3), doorMat);
    door.position.set(0.5, 0.3, 0.45);
    fallenCabinet.add(door);
    var door2 = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.04, 0.3), doorMat);
    door2.position.set(-0.5, 0.3, 0.45);
    fallenCabinet.add(door2);
    // 把手
    var handleMat = new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.5 });
    var h1 = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), handleMat);
    h1.position.set(0.5, 0.3, 0.48);
    fallenCabinet.add(h1);
    var h2 = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), handleMat);
    h2.position.set(-0.5, 0.3, 0.48);
    fallenCabinet.add(h2);

    var fx = rm.cx + (Math.random() - 0.5) * (roomSize - 10);
    var fz = rm.cz + (Math.random() - 0.5) * (roomSize - 10);
    // 避免在中央房间飞船附近
    if (rm.cx === 0 && rm.cz === 0) {
      if (Math.abs(fx) < 8) fx = fx < 0 ? -10 : 10;
      if (Math.abs(fz) < 8) fz = fz < 0 ? -10 : 10;
    }
    fallenCabinet.position.set(fx, groundY, fz);
    fallenCabinet.rotation.y = Math.random() * Math.PI * 2;
    scene.add(fallenCabinet);
    obstacles.push(fallenCabinet);
    furniture.push(fallenCabinet);

    // 围栏/矮墙
    var fenceMat = new THREE.MeshStandardMaterial({ color: 0x444455, roughness: 0.7 });
    var fence = new THREE.Group();
    var fenceLen = 2 + Math.random() * 2;
    var fenceBody = new THREE.Mesh(new THREE.BoxGeometry(fenceLen, 0.8, 0.15), fenceMat);
    fenceBody.position.y = 0.4;
    fenceBody.castShadow = true;
    fence.add(fenceBody);
    // 柱子
    for (var pi = -1; pi <= 1; pi += 2) {
      var post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.9, 0.1), fenceMat);
      post.position.set(pi * fenceLen / 2, 0.45, 0);
      fence.add(post);
    }
    var fenceX = rm.cx + (Math.random() - 0.5) * (roomSize - 10);
    var fenceZ = rm.cz + (Math.random() - 0.5) * (roomSize - 10);
    if (rm.cx === 0 && rm.cz === 0) {
      if (Math.abs(fenceX) < 8) fenceX = fenceX < 0 ? -10 : 10;
      if (Math.abs(fenceZ) < 8) fenceZ = fenceZ < 0 ? -10 : 10;
    }
    fence.position.set(fenceX, groundY, fenceZ);
    fence.rotation.y = Math.random() * Math.PI * 2;
    scene.add(fence);
    obstacles.push(fence);
    furniture.push(fence);
  });
}

// ============================================================
// 逃生飞船
// ============================================================
function createShip() {
  var g = new THREE.Group();
  var bodyMat = new THREE.MeshStandardMaterial({ color: 0x99aabb, roughness: 0.35, metalness: 0.7 });
  var body = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.2, 2.4, 12), bodyMat);
  body.position.y = 1.6; body.castShadow = true; g.add(body);
  var nose = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.5, 12), new THREE.MeshStandardMaterial({ color: 0xbb4444, roughness: 0.4, metalness: 0.5 }));
  nose.position.y = 3.55; g.add(nose);
  var win = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 10), new THREE.MeshStandardMaterial({ color: 0x66ddff, emissive: 0x3399cc, emissiveIntensity: 0.7 }));
  win.position.set(0, 2.1, 0.95); g.add(win);
  var finMat = new THREE.MeshStandardMaterial({ color: 0xbb4444, roughness: 0.5 });
  var legMat = new THREE.MeshStandardMaterial({ color: 0x555566, metalness: 0.6, roughness: 0.5 });
  for (var i = 0; i < 3; i++) {
    var a = i * Math.PI * 2 / 3;
    var fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.3, 0.8), finMat);
    fin.position.set(Math.sin(a) * 1.15, 0.75, Math.cos(a) * 1.15);
    fin.rotation.y = a; g.add(fin);
    var a2 = a + Math.PI / 3;
    var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.9, 6), legMat);
    leg.position.set(Math.sin(a2) * 1.25, 0.45, Math.cos(a2) * 1.25);
    leg.rotation.z = Math.sin(a2) * 0.3; leg.rotation.x = -Math.cos(a2) * 0.3;
    g.add(leg);
  }
  var ring = new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.06, 8, 32), new THREE.MeshBasicMaterial({ color: 0x44ff88, transparent: true, opacity: 0.3 }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.12; g.add(ring);
  g.userData = { ring: ring };
  g.position.set(0, groundY, 0);
  scene.add(g);
  ship = g;
  window.ship = g;
}

// ============================================================
// 章节主题装饰物
// ============================================================
function addChapterDecorations(chd) {
  var positions = [];
  ROOMS.forEach(function (rm, idx) {
    if (idx === 0) { positions.push([rm.cx - 14, rm.cz - 14], [rm.cx + 14, rm.cz + 14]); }
    else { positions.push([rm.cx - 12, rm.cz - 12], [rm.cx + 12, rm.cz + 10], [rm.cx - 8, rm.cz + 14]); }
  });
  positions.forEach(function (pos) {
    var deco = new THREE.Group();
    if (chd.id === 1) {
      var trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 2.4, 6), new THREE.MeshStandardMaterial({ color: 0x6B4E3C, roughness: 0.8 }));
      trunk.position.y = 1.2; trunk.castShadow = true; deco.add(trunk);
      var crown = new THREE.Mesh(new THREE.ConeGeometry(1.6, 3.0, 8), new THREE.MeshStandardMaterial({ color: 0x2a8a3a, roughness: 0.7 }));
      crown.position.y = 3.6; crown.castShadow = true; deco.add(crown);
      var crown2 = new THREE.Mesh(new THREE.ConeGeometry(1.2, 2.2, 8), new THREE.MeshStandardMaterial({ color: 0x35a045, roughness: 0.7 }));
      crown2.position.y = 4.6; deco.add(crown2);
    } else if (chd.id === 2) {
      [[0, 1.6, 0, 0.8, 3.2], [0.8, 1.0, 0.4, 0.5, 2.0], [-0.7, 0.8, -0.3, 0.4, 1.6]].forEach(function (c) {
        var ice = new THREE.Mesh(new THREE.ConeGeometry(c[3], c[4], 5), new THREE.MeshStandardMaterial({ color: 0x88ccff, transparent: true, opacity: 0.75, roughness: 0.15, emissive: 0x4499dd, emissiveIntensity: 0.15 }));
        ice.position.set(c[0], c[1], c[2]); ice.rotation.z = (Math.random() - 0.5) * 0.3; ice.castShadow = true; deco.add(ice);
      });
    } else if (chd.id === 3) {
      var pyramid = new THREE.Mesh(new THREE.ConeGeometry(2.0, 2.8, 4), new THREE.MeshStandardMaterial({ color: 0xcc9944, roughness: 0.9 }));
      pyramid.position.y = 1.4; pyramid.rotation.y = Math.PI / 4; pyramid.castShadow = true; deco.add(pyramid);
      var tip = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.5, 4), new THREE.MeshStandardMaterial({ color: 0xffd700, emissive: 0xffd700, emissiveIntensity: 0.4 }));
      tip.position.y = 3.0; tip.rotation.y = Math.PI / 4; deco.add(tip);
    } else if (chd.id === 4) {
      var rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.2), new THREE.MeshStandardMaterial({ color: 0x442222, roughness: 0.9 }));
      rock.position.y = 1.0; rock.castShadow = true; deco.add(rock);
      var lava = new THREE.Mesh(new THREE.SphereGeometry(0.4, 6, 6), new THREE.MeshStandardMaterial({ color: 0xff4400, emissive: 0xff3300, emissiveIntensity: 0.8 }));
      lava.position.y = 1.9; deco.add(lava);
    } else {
      var crystal = new THREE.Mesh(new THREE.OctahedronGeometry(1.0), new THREE.MeshStandardMaterial({ color: 0xaa66ff, transparent: true, opacity: 0.8, emissive: 0x8844dd, emissiveIntensity: 0.4, roughness: 0.2 }));
      crystal.position.y = 2.0; crystal.castShadow = true; deco.add(crystal);
      var base = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 0.6, 6), new THREE.MeshStandardMaterial({ color: 0x333355, roughness: 0.8 }));
      base.position.y = 0.3; deco.add(base);
    }
    deco.position.set(pos[0], groundY, pos[1]);
    deco.rotation.y = Math.random() * Math.PI * 2;
    scene.add(deco);
  });
}

// ============================================================
// 家具（保留原有）
// ============================================================
function createTable(x, y, z, color) {
  var g = new THREE.Group();
  var tableMat = new THREE.MeshStandardMaterial({ color: color || 0x8B5E3C, roughness: 0.6 });
  var top = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.1, 1.4), tableMat);
  top.position.y = 0.7; top.castShadow = true; top.receiveShadow = true; g.add(top);
  [-0.8, 0.8].forEach(function (px) {
    [-0.5, 0.5].forEach(function (pz) {
      var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.65, 6), tableMat);
      leg.position.set(px, 0.35, pz); g.add(leg);
    });
  });
  var vase = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.2, 8), new THREE.MeshStandardMaterial({ color: 0x4488ff, roughness: 0.5 }));
  vase.position.set(0.5, 0.8, 0.2); g.add(vase);
  var flower = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), new THREE.MeshStandardMaterial({ color: 0xff88aa, emissive: 0xff88aa, emissiveIntensity: 0.2 }));
  flower.position.set(0.5, 1.0, 0.2); g.add(flower);
  var book = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.04, 0.35), new THREE.MeshStandardMaterial({ color: 0xcc4444, roughness: 0.7 }));
  book.position.set(-0.5, 0.75, 0.3); book.rotation.y = 0.3; g.add(book);
  g.position.set(x, y, z); scene.add(g); furniture.push(g);
}

function createChair(x, y, z) {
  var g = new THREE.Group();
  var chairMat = new THREE.MeshStandardMaterial({ color: 0x8B5E3C, roughness: 0.6 });
  var seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.5), chairMat);
  seat.position.y = 0.4; seat.castShadow = true; g.add(seat);
  var back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.04), chairMat);
  back.position.set(0, 0.6, -0.25); g.add(back);
  [-0.2, 0.2].forEach(function (px) {
    [-0.2, 0.2].forEach(function (pz) {
      var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.4, 6), chairMat);
      leg.position.set(px, 0.2, pz); g.add(leg);
    });
  });
  g.position.set(x, y, z); g.rotation.y = Math.random() * 0.5; scene.add(g); furniture.push(g);
}

function createBed(x, y, z) {
  var g = new THREE.Group();
  var bedMat = new THREE.MeshStandardMaterial({ color: 0x6B8E5C, roughness: 0.7 });
  var base = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.25, 1.2), bedMat);
  base.position.y = 0.15; base.castShadow = true; base.receiveShadow = true; g.add(base);
  var mattress = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.15, 1.1), new THREE.MeshStandardMaterial({ color: 0x88aacc, roughness: 0.9 }));
  mattress.position.y = 0.35; g.add(mattress);
  var pillow = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.4), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }));
  pillow.position.set(-0.5, 0.42, -0.3); g.add(pillow);
  var blanket = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.04, 0.8), new THREE.MeshStandardMaterial({ color: 0xff88aa, roughness: 0.8 }));
  blanket.position.set(0.2, 0.43, 0.1); g.add(blanket);
  g.position.set(x, y, z); g.rotation.y = 0.2; scene.add(g); furniture.push(g);
}

function createBookshelf(x, y, z) {
  var g = new THREE.Group();
  var shelfMat = new THREE.MeshStandardMaterial({ color: 0x6B4E3C, roughness: 0.7 });
  var sides = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.2, 0.4), shelfMat);
  sides.position.set(0, 0.6, 0); g.add(sides);
  [-0.4, 0.4].forEach(function (px) {
    var side = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.2, 0.4), shelfMat);
    side.position.set(px, 0.6, 0); g.add(side);
  });
  [0.2, 0.6, 1.0].forEach(function (sy) {
    var shelf = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.03, 0.35), shelfMat);
    shelf.position.set(0, sy, 0); g.add(shelf);
  });
  var colors = [0xff4444, 0x44ff44, 0x4488ff, 0xffd700, 0xff8800, 0x9944ff];
  for (var i = 0; i < 4; i++) {
    var book = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12 + Math.random() * 0.08, 0.06), new THREE.MeshStandardMaterial({ color: colors[Math.floor(Math.random() * colors.length)] }));
    book.position.set(-0.3 + Math.random() * 0.6, 0.7 + Math.random() * 0.3, 0.15 + Math.random() * 0.1);
    book.rotation.y = (Math.random() - 0.5) * 0.1; g.add(book);
  }
  g.position.set(x, y, z); scene.add(g); furniture.push(g); secondRoomObjects.push(g);
}

function createChest(x, y, z) {
  var g = new THREE.Group();
  var chestMat = new THREE.MeshStandardMaterial({ color: 0x8B5E3C, roughness: 0.6 });
  var body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.6), chestMat);
  body.position.y = 0.25; body.castShadow = true; g.add(body);
  var lid = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.08, 0.55), new THREE.MeshStandardMaterial({ color: 0x6B3E1C, roughness: 0.7 }));
  lid.position.set(0, 0.55, 0); g.add(lid);
  var lock = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), new THREE.MeshStandardMaterial({ color: 0xffd700 }));
  lock.position.set(0, 0.55, 0.25); g.add(lock);
  g.position.set(x, y, z); scene.add(g); furniture.push(g); secondRoomObjects.push(g);
}

function createPool(x, y, z) {
  var g = new THREE.Group();
  var poolMat = new THREE.MeshStandardMaterial({ color: 0x556677, roughness: 0.3, metalness: 0.5 });
  var frame = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.2, 1.8), poolMat);
  frame.position.y = 0.1; frame.castShadow = true; frame.receiveShadow = true; g.add(frame);
  var water = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.05, 1.4),
    new THREE.MeshStandardMaterial({ color: 0x3399dd, roughness: 0.1, metalness: 0.8, transparent: true, opacity: 0.7 }));
  water.position.y = 0.25; g.add(water);
  var glow = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.02, 1.2),
    new THREE.MeshBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.15 }));
  glow.position.y = 0.28; g.add(glow);
  g.position.set(x, y, z); scene.add(g); furniture.push(g);
}

function createCabinet(x, y, z) {
  var g = new THREE.Group();
  var cabMat = new THREE.MeshStandardMaterial({ color: 0x6B4E3C, roughness: 0.7 });
  var body = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.4, 0.6), cabMat);
  body.position.y = 0.7; body.castShadow = true; body.receiveShadow = true; g.add(body);
  var doorMat = new THREE.MeshStandardMaterial({ color: 0x5A3D2C, roughness: 0.6 });
  var door = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.1, 0.04), doorMat);
  door.position.set(0.25, 0.7, 0.33); g.add(door);
  var door2 = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.1, 0.04), doorMat);
  door2.position.set(-0.25, 0.7, 0.33); g.add(door2);
  var handleMat = new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.7, roughness: 0.3 });
  var h1 = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), handleMat);
  h1.position.set(0.25, 0.7, 0.36); g.add(h1);
  var h2 = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), handleMat);
  h2.position.set(-0.25, 0.7, 0.36); g.add(h2);
  g.position.set(x, y, z); scene.add(g); furniture.push(g);
}

function createRug(x, y, z, color) {
  var g = new THREE.Group();
  var rugMat = new THREE.MeshStandardMaterial({ color: color || 0x884422, roughness: 0.95 });
  var rug = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.9, 0.04, 12), rugMat);
  rug.position.y = 0.02; rug.receiveShadow = true; g.add(rug);
  var border = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.03, 8, 16),
    new THREE.MeshStandardMaterial({ color: 0x664422, roughness: 0.8 }));
  border.position.y = 0.03; g.add(border);
  g.position.set(x, y, z); g.rotation.y = Math.random() * Math.PI; scene.add(g); furniture.push(g);
}

function createLamp(x, y, z) {
  var g = new THREE.Group();
  var poleMat = new THREE.MeshStandardMaterial({ color: 0x444455, metalness: 0.6, roughness: 0.4 });
  var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 1.2, 6), poleMat);
  pole.position.y = 0.6; g.add(pole);
  var lantern = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xffaa44, emissive: 0xff6600, emissiveIntensity: 0.6 }));
  lantern.position.y = 1.2; g.add(lantern);
  var glow = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.1 }));
  glow.position.y = 1.2; g.add(glow);
  g.position.set(x, y, z); scene.add(g); furniture.push(g);
}

function createObstacle(x, y, z, color) {
  var g = new THREE.Group();
  var h = 0.4 + Math.random() * 0.3;
  var w = 0.5 + Math.random() * 0.3;
  var obs = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.5), new THREE.MeshStandardMaterial({ color: color, roughness: 0.7, emissive: color, emissiveIntensity: 0.05 }));
  obs.position.y = h / 2; obs.castShadow = true; obs.receiveShadow = true; g.add(obs);
  var top = new THREE.Mesh(new THREE.BoxGeometry(w * 0.8, 0.03, 0.4), new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.3 }));
  top.position.y = h + 0.02; g.add(top);
  g.position.set(x, y, z); scene.add(g); obstacles.push(g);
}

// ============================================================
// 金色宝箱系统（原能量球）：答题解锁，开出3点能量，30秒刷新
// ============================================================
function spawnEnergyOrb() {
  if (GS.gameOver || GS.energy >= (GS.energyMax || 5)) return;

  // 宝箱不能刷新在中间的房间内
  var eligibleRooms = ROOMS.filter(function (r) {
    return !(r.cx === 0 && r.cz === 0) && r !== lastEnergyOrbRoom;
  });
  if (eligibleRooms.length === 0) {
    eligibleRooms = ROOMS.filter(function (r) { return !(r.cx === 0 && r.cz === 0); });
  }
  var targetRoom = eligibleRooms[Math.floor(Math.random() * eligibleRooms.length)];

  var x = targetRoom.cx + (Math.random() - 0.5) * (roomSize - 12);
  var z = targetRoom.cz + (Math.random() - 0.5) * (roomSize - 12);

  // 金色宝箱模型
  var chest = new THREE.Group();
  var goldMat = new THREE.MeshStandardMaterial({ color: 0xddaa22, metalness: 0.7, roughness: 0.3, emissive: 0xaa7700, emissiveIntensity: 0.25 });
  var darkGoldMat = new THREE.MeshStandardMaterial({ color: 0xbb8811, metalness: 0.6, roughness: 0.4 });
  var body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.65, 0.75), goldMat);
  body.position.y = 0.33; body.castShadow = true; chest.add(body);
  var lid = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 1.1, 12, 1, false, 0, Math.PI), darkGoldMat);
  lid.rotation.z = Math.PI / 2;
  lid.position.y = 0.66; chest.add(lid);
  // 金属包边
  var trimMat = new THREE.MeshStandardMaterial({ color: 0xffe066, metalness: 0.9, roughness: 0.2, emissive: 0xffcc44, emissiveIntensity: 0.3 });
  [-0.4, 0.4].forEach(function (tx) {
    var trim = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.68, 0.78), trimMat);
    trim.position.set(tx, 0.33, 0); chest.add(trim);
  });
  // 锁扣
  var lock = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.08), trimMat);
  lock.position.set(0, 0.5, 0.4); chest.add(lock);
  // 光柱与光晕
  var glow = new THREE.Mesh(new THREE.SphereGeometry(1.0, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xffd700, transparent: true, opacity: 0.1, side: THREE.DoubleSide }));
  glow.position.y = 0.5; chest.add(glow);
  var beam = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.4, 8, 8, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd700, transparent: true, opacity: 0.15, side: THREE.DoubleSide }));
  beam.position.y = 4; chest.add(beam);

  chest.position.set(x, groundY, z);
  chest.rotation.y = Math.random() * Math.PI * 2;
  chest.userData = { active: true, cooldown: 0, floatPhase: Math.random() * Math.PI * 2, glow: glow, isChest: true };
  scene.add(chest);
  energyOrb = chest;
  window.energyOrb = chest;
  lastEnergyOrbRoom = targetRoom;
  showMessage("🎁 金色宝箱出现在" + targetRoom.name + "房间! 答题解锁", 0xffd700);

  // Boss刷新到宝箱所在的房间（不通知位置）
  spawnBossInRoom(targetRoom);
}

function consumeEnergyOrb() {
  if (!energyOrb) return;
  scene.remove(energyOrb);
  energyOrb = null;
  window.energyOrb = null;
  if (GS.energy < (GS.energyMax || 5)) {
    // 金色宝箱刷新时间：30秒
    setTimeout(spawnEnergyOrb, 30000);
  }
}

// ============================================================
// Boss系统 - 全场只有一只Boss
// ============================================================
function spawnBossInRoom(room) {
  // 如果Boss还活着，不移除
  var existingBoss = null;
  for (var i = 0; i < bosses.length; i++) {
    if (bosses[i].userData.active) {
      existingBoss = bosses[i];
      break;
    }
  }
  if (existingBoss) return; // Boss还活着，不移除

  var chd = currentChapterData();
  var t = BOSSES[chd.id] || BOSSES[1];

  // 应用时间增强
  var scaledT = scaleMonsterType(t);

  var g = buildMonsterMesh(scaledT);
  if (scaledT.scale && scaledT.scale !== 1) g.scale.setScalar(scaledT.scale);

  var x = room.cx + (Math.random() - 0.5) * (roomSize - 12);
  var z = room.cz + (Math.random() - 0.5) * (roomSize - 12);
  g.position.set(x, groundY, z);
  scene.add(g);

  g.userData = {
    radius: 0.9 * (scaledT.scale || 1),
    active: true,
    walkPhase: 0,
    type: scaledT,
    isBoss: true,
    speedMul: 1,
    rangedTimer: 2.5,
    bossPhase: 3,
    homeRoom: room,
    returnHomeTimer: 0,
    lastAttackedTime: clock.elapsedTime,
    respawnTimer: 0
  };
  g.userData.hp = scaledT.hp;

  bosses.push(g);
  lastBossSpawnRoom = room;
  showMessage("👑 " + scaledT.name + " 出现了! 击败它可获得能量!", 0xff4444);
}

// 初始化怪物 - 全场只有1只小怪和1只Boss
// 随机选择小怪类型：50%概率远程攻击型，50%概率近战型（近战怪每10秒急速冲刺）
var RANGED_MINIONS = ['暗影射手', '毒液喷射者'];
function pickMinionType() {
  if (Math.random() < 0.5) {
    var name = RANGED_MINIONS[Math.floor(Math.random() * RANGED_MINIONS.length)];
    return MONSTER_TYPES[name];
  }
  var chd = currentChapterData();
  var monsterTypes = chd.monsters;
  if (!monsterTypes || monsterTypes.length === 0) monsterTypes = ["追风怪"];
  var mName = monsterTypes[Math.floor(Math.random() * monsterTypes.length)];
  return MONSTER_TYPES[mName] || MONSTER_TYPES["追风怪"];
}

// （抓捕者实例与状态在文件顶部统一声明）

// 生成抓捕者（追捕者） - 巡逻者，遇到角色快速追击并抓捕
function spawnChaser() {
  if (chaserMonster && chaserMonster.parent) {
    scene.remove(chaserMonster);
    chaserMonster = null;
  }

  var g = buildChaserMesh();

  // 抓捕者初始位置在远离玩家的非中央房间
  var candidates = ROOMS.filter(function (r) { return !(r.cx === 0 && r.cz === 0); });
  var room = candidates[Math.floor(Math.random() * candidates.length)];
  var x = room.cx + (Math.random() - 0.5) * (roomSize - 12);
  var z = room.cz + (Math.random() - 0.5) * (roomSize - 12);
  g.position.set(x, groundY, z);
  scene.add(g);

  g.userData = {
    radius: 0.9,
    active: true,
    walkPhase: 0,
    type: { name: '追捕者', speed: 3.0, chaseSpeed: 7.0, hp: 500, scale: 1 },
    isChaser: true,
    hp: 500,
    speedMul: 1,
    homeRoom: room,
    roamTimer: 0,
    wanderTarget: null,
    isChasing: false
  };
  chaserMonster = g;
  window.chaserMonster = g;
  chaserLeaveTimer = CHASER_LEAVE_DURATION;
  showMessage('👁️ 追捕者被释放了! 它在四处巡逻!', 0x4444ff);
}

// 构建恐怖人形追捕者 - 白色身体、血迹、长发、狰狞面容、长指甲
function buildChaserMesh() {
  var g = new THREE.Group();
  var whiteMat = new THREE.MeshStandardMaterial({ color: 0xeeeedd, roughness: 0.7 });
  var bloodMat = new THREE.MeshStandardMaterial({ color: 0xaa1111, roughness: 0.5, emissive: 0x440000, emissiveIntensity: 0.15 });
  var darkMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 });
  var hairMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });
  var nailMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.3, emissive: 0x111111 });

  // 身体（白色瘦长）
  var torso = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 1.0, 8), whiteMat);
  torso.position.y = 0.9; torso.castShadow = true; g.add(torso);

  // 血迹 - 身体上随机血斑
  for (var bi = 0; bi < 6; bi++) {
    var blood = new THREE.Mesh(new THREE.SphereGeometry(0.06 + Math.random() * 0.08, 5, 5), bloodMat);
    blood.position.set((Math.random() - 0.5) * 0.6, 0.5 + Math.random() * 0.8, 0.35 + Math.random() * 0.1);
    blood.scale.set(1, 1, 0.3);
    g.add(blood);
  }
  // 大片血迹
  var bigBlood = new THREE.Mesh(new THREE.CircleGeometry(0.2, 8), bloodMat);
  bigBlood.position.set(0.1, 0.6, 0.4);
  bigBlood.rotation.x = -0.5;
  bigBlood.scale.set(1, 1, 0.2);
  g.add(bigBlood);

  // 破烂衣服碎片
  var clothMat = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.9, transparent: true, opacity: 0.6 });
  for (var ci = 0; ci < 4; ci++) {
    var rag = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.25 + Math.random() * 0.15), clothMat);
    rag.position.set((Math.random() - 0.5) * 0.7, 0.4 + Math.random() * 0.6, 0.4);
    rag.rotation.x = Math.random() * 0.5;
    rag.rotation.z = (Math.random() - 0.5) * 0.3;
    g.add(rag);
  }

  // 头
  var head = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 10), whiteMat);
  head.position.y = 1.55; head.castShadow = true; g.add(head);

  // 狰狞面容 - 深陷的眼窝
  var socketMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
  [[-0.14, 1.6, 0.32], [0.14, 1.6, 0.32]].forEach(function (p) {
    var socket = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), socketMat);
    socket.position.set(p[0], p[1], p[2]); g.add(socket);
  });
  // 血红发光眼睛
  var eyeMat = new THREE.MeshStandardMaterial({ color: 0xff2200, emissive: 0xff0000, emissiveIntensity: 1.0 });
  [[-0.14, 1.6, 0.36], [0.14, 1.6, 0.36]].forEach(function (p) {
    var eye = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), eyeMat);
    eye.position.set(p[0], p[1], p[2]); g.add(eye);
    var pupil = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 6), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    pupil.position.set(p[0], p[1], p[2] + 0.04); g.add(pupil);
  });
  // 狰狞的眉毛（倒八字，怒眉）
  var browMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });
  [-0.14, 0.14].forEach(function (bx, idx) {
    var brow = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.03, 0.03), browMat);
    brow.position.set(bx, 1.68, 0.36);
    brow.rotation.z = idx === 0 ? 0.4 : -0.4;
    g.add(brow);
  });
  // 血泪痕迹
  for (var ti = 0; ti < 3; ti++) {
    var tear = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.005, 0.15 + Math.random() * 0.1, 4), bloodMat);
    tear.position.set(-0.14 + Math.random() * 0.28, 1.5 - Math.random() * 0.15, 0.35);
    g.add(tear);
  }

  // 嘴巴 - 裂开的大嘴
  var mouthMat = new THREE.MeshStandardMaterial({ color: 0x110000, roughness: 0.9 });
  var mouth = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), mouthMat);
  mouth.position.set(0, 1.42, 0.36);
  mouth.scale.set(1.2, 0.5, 0.5);
  g.add(mouth);
  // 牙齿
  var toothMat = new THREE.MeshStandardMaterial({ color: 0xeeddcc, roughness: 0.2 });
  for (var ti2 = 0; ti2 < 5; ti2++) {
    var tx = -0.08 + ti2 * 0.04;
    var tooth = new THREE.Mesh(new THREE.ConeGeometry(0.015, 0.04, 4), toothMat);
    tooth.position.set(tx, 1.43, 0.41);
    g.add(tooth);
    var tooth2 = new THREE.Mesh(new THREE.ConeGeometry(0.015, 0.035, 4), toothMat);
    tooth2.position.set(tx + 0.02, 1.39, 0.41);
    tooth2.rotation.x = 0.3;
    g.add(tooth2);
  }

  // 长发 - 使用多个圆柱体模拟飘逸长发
  var hairLen = 0.5;
  for (var hi = 0; hi < 12; hi++) {
    var strand = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.005, hairLen + Math.random() * 0.2, 4), hairMat);
    var angle = (hi / 12) * Math.PI * 2;
    var radius = 0.3 + Math.random() * 0.08;
    strand.position.set(Math.cos(angle) * radius, 1.45 - hairLen / 2, Math.sin(angle) * radius);
    strand.rotation.x = (Math.random() - 0.5) * 0.3;
    strand.rotation.z = (Math.cos(angle) * 0.2);
    g.add(strand);
  }
  // 前面几缕头发（遮住部分脸）
  for (var fi = 0; fi < 5; fi++) {
    var fringe = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.004, 0.3 + Math.random() * 0.15, 4), hairMat);
    fringe.position.set(-0.1 + Math.random() * 0.2, 1.5, 0.3 + Math.random() * 0.08);
    fringe.rotation.x = 0.5 + Math.random() * 0.3;
    g.add(fringe);
  }

  // 双臂（瘦长，白色）
  var armMat = new THREE.MeshStandardMaterial({ color: 0xdddccc, roughness: 0.7 });
  [-1, 1].forEach(function (side) {
    var upperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.5, 6), armMat);
    upperArm.position.set(side * 0.5, 0.9, 0);
    upperArm.rotation.z = side * 0.4;
    g.add(upperArm);
    var forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.5, 6), armMat);
    forearm.position.set(side * 0.72, 0.55, 0);
    forearm.rotation.z = side * 0.5;
    g.add(forearm);
    // 手
    var hand = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), whiteMat);
    hand.position.set(side * 0.85, 0.28, 0);
    g.add(hand);
    // 长指甲（3根）
    for (var ni = 0; ni < 3; ni++) {
      var nail = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.08, 4), nailMat);
      nail.position.set(side * 0.85 + (ni - 1) * 0.03, 0.22, (ni - 1) * 0.03);
      nail.rotation.x = 0.3;
      nail.rotation.z = -side * 0.2;
      g.add(nail);
    }
  });

  // 双腿（瘦长，白色）
  [-1, 1].forEach(function (side) {
    var thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.4, 6), whiteMat);
    thigh.position.set(side * 0.15, 0.25, 0);
    g.add(thigh);
    var calf = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.35, 6), whiteMat);
    calf.position.set(side * 0.15, -0.1, 0);
    g.add(calf);
    // 脚
    var foot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.2), darkMat);
    foot.position.set(side * 0.15, -0.28, 0.05);
    g.add(foot);
  });

  // 全身血迹飞溅（小粒子）
  for (var si = 0; si < 15; si++) {
    var splat = new THREE.Mesh(new THREE.SphereGeometry(0.015 + Math.random() * 0.025, 4, 4), bloodMat);
    splat.position.set((Math.random() - 0.5) * 0.8, Math.random() * 1.4, 0.3 + Math.random() * 0.1);
    g.add(splat);
  }

  // 红色光晕
  var glow = new THREE.Mesh(
    new THREE.SphereGeometry(1.2, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0xff2222, transparent: true, opacity: 0.06, side: THREE.DoubleSide })
  );
  glow.position.y = 0.8;
  g.add(glow);

  g.scale.set(1.1, 1.1, 1.1);
  return g;
}

// 抓捕者尝试抓住最近的玩家（主机权威）：主机→本地捕获；加入者→事件通知
function tryChaserGrab(m, GRAB_RANGE) {
  var bestPid = 'host';
  var bestD = m.position.distanceTo(player.position);
  if (GS.mode === 'multiplayer' && GS.isHost && typeof PeerManager !== 'undefined') {
    for (var pid in PeerManager.players) {
      if (pid === PeerManager.playerId) continue;
      var pp = PeerManager.players[pid];
      if (pp && pp.position && !pp.isCaptured) {
        var dx = m.position.x - pp.position.x, dz = m.position.z - pp.position.z;
        var d = Math.sqrt(dx * dx + dz * dz);
        if (d < bestD) { bestD = d; bestPid = pid; }
      }
    }
  }
  if (bestD >= GRAB_RANGE) return;

  if (bestPid === 'host') {
    capturePlayer();
    m.userData.captiveId = 'host';
  } else {
    // 抓住加入者：标记状态并通知该加入者，本地不动其位置（贴住即可）
    var cp = PeerManager.players[bestPid];
    cp.isCaptured = true;
    cp._captureAck = false; // 等待加入者确认，防止在途 input 立即误解除
    m.userData.captiveId = bestPid;
    m.userData.deliveredToBoss = false;
    m.userData.isChasing = false;
    m.userData.captiveTimer = 0;
    if (typeof PeerManager.sendTo === 'function') {
      PeerManager.sendTo(bestPid, 'game_event', { event: 'player_captured', playerId: bestPid });
    }
    showMessage('🕸️ 追捕者抓住了 ' + (cp.name || '队友') + '!', 0xff8844);
  }
}

// 主机端：抓捕者挟持加入者期间的表现（拖着加入者向Boss移动，等待其挣脱或死亡）
function updateChaserHoldingJoiner(m, delta, GRAB_RANGE) {
  var pid = m.userData.captiveId;
  var p = (typeof PeerManager !== 'undefined' && PeerManager.players) ? PeerManager.players[pid] : null;

  // 加入者离开 / 已挣脱(通过 input 上报 isCaptured=false) / 超时 → 解除挟持
  m.userData.captiveTimer = (m.userData.captiveTimer || 0) + delta;
  if (!p || !p.position || !p.isCaptured || m.userData.captiveTimer > 30) {
    releaseChaserCaptive(m, p, true);
    return;
  }

  // 与单机 captureState.captured 分支一致：抓捕者向 Boss 移动，加入者跟随抓捕者
  var bossTarget = null;
  for (var bIdx = 0; bIdx < bosses.length; bIdx++) {
    if (bosses[bIdx].userData.active && bosses[bIdx].parent) { bossTarget = bosses[bIdx]; break; }
  }
  var dt = bossTarget ? { x: bossTarget.position.x, z: bossTarget.position.z }
    : (lastBossSpawnRoom ? { x: lastBossSpawnRoom.cx, z: lastBossSpawnRoom.cz }
      : { x: m.position.x, z: m.position.z });

  var dragSpeed = ((m.userData.type && m.userData.type.speed) || 3.0) * 2.0 * delta;
  var dDir = new THREE.Vector3(dt.x - m.position.x, 0, dt.z - m.position.z);
  var dDist = dDir.length();
  if (dDist > 3.0) {
    dDir.normalize();
    var dMove = dDir.clone().multiplyScalar(dragSpeed);
    m.position.add(dMove);
    m.rotation.y = Math.atan2(dMove.x, dMove.z);
    m.userData.walkPhase = (m.userData.walkPhase || 0) + delta * 6;
    // 拖着加入者跟随（在抓捕者身后1.5单位）——写入 p.position，快照会把它下发给加入者
    p.position.x = m.position.x - dDir.x * 1.5;
    p.position.z = m.position.z - dDir.z * 1.5;
  }
  m.position.y = groundY + Math.abs(Math.sin(m.userData.walkPhase || 0)) * 0.05;

  // 挟持期间发光增强
  m.children.forEach(function (child, idx) {
    if (child.isMesh && child.material && child.material.emissive) {
      child.material.emissiveIntensity = 0.5 + Math.sin(clock.elapsedTime * 5 + idx) * 0.3;
    }
  });
}

// 解除抓捕者对加入者的挟持（击退 + 冷却）；notify=true 时通知该加入者挣脱
function releaseChaserCaptive(m, p, notify) {
  var pid = m.userData.captiveId;
  m.userData.captiveId = null;
  m.userData.deliveredToBoss = false;
  m.userData.isChasing = false;
  m.userData.staggerTimer = 2.0;
  m.userData.captiveTimer = 0;
  captureState.grabCooldown = 12;
  if (p) { p.isCaptured = false; p._captureAck = false; }
  // 击退抓捕者
  if (p && p.position) {
    var kb = new THREE.Vector3(m.position.x - p.position.x, 0, m.position.z - p.position.z);
    if (kb.length() > 0) { kb.normalize().multiplyScalar(6); m.position.add(kb); }
  }
  if (notify && pid && pid !== 'host' && typeof PeerManager !== 'undefined' && typeof PeerManager.sendTo === 'function') {
    PeerManager.sendTo(pid, 'game_event', { event: 'player_rescued', playerId: pid });
  }
}

// 抓捕者AI更新
function updateChaser(delta) {
  if (!chaserMonster || !chaserMonster.parent || !chaserMonster.userData.active) return;

  var m = chaserMonster;
  var t = m.userData.type;
  // 联机主机端：抓捕者追踪最近的玩家（含加入者）；单机/加入者端为本地玩家
  var _chaserTgt = (typeof nearestPlayerPos === 'function') ? nearestPlayerPos(m.position) : player.position;
  var dist = m.position.distanceTo(_chaserTgt);

  // 捆仙绳束缚：完全无法移动和抓捕
  if (m.userData.boundTimer > 0) {
    m.userData.boundTimer -= delta;
    if (m.userData.bindRings) {
      m.userData.bindRings.rotation.y += delta * 3;
    }
    return;
  }

  // 受击/挣脱硬直：原地眩晕（被抓状态下不生效，防止卡住拖拽）
  if (!captureState.captured && m.userData.staggerTimer > 0) {
    m.userData.staggerTimer -= delta;
    return;
  }

  // （抓捕冷却统一在 updateCaptureSystem 中递减，此处不再重复扣减）

  var CHASE_RANGE = 18; // 发现玩家的距离
  var GRAB_RANGE = 1.8; // 抓捕距离

  // ===== 联机主机端：抓捕者正挟持某个加入者 =====
  if (GS.mode === 'multiplayer' && GS.isHost && m.userData.captiveId && m.userData.captiveId !== 'host') {
    updateChaserHoldingJoiner(m, delta, GRAB_RANGE);
    return;
  }

  if (captureState.captured) {
    // 被抓模式：怪物拖着玩家前往Boss所在的房间
    // 优先以存活Boss的实际位置为目标；没有Boss时退回随机游走
    var bossTarget = null;
    for (var bIdx = 0; bIdx < bosses.length; bIdx++) {
      if (bosses[bIdx].userData.active && bosses[bIdx].parent) {
        bossTarget = bosses[bIdx];
        break;
      }
    }

    var dt;
    if (bossTarget) {
      dt = { x: bossTarget.position.x, z: bossTarget.position.z };
    } else if (lastBossSpawnRoom) {
      dt = { x: lastBossSpawnRoom.cx, z: lastBossSpawnRoom.cz };
    } else {
      // 没有Boss也没有Boss房间记录：随机选房间拖拽（原行为）
      if (!m.userData.dragTarget || m.userData.dragChangeTimer <= 0) {
        var targetRoom = ROOMS[Math.floor(Math.random() * ROOMS.length)];
        m.userData.dragTarget = {
          x: targetRoom.cx + (Math.random() - 0.5) * (roomSize - 12),
          z: targetRoom.cz + (Math.random() - 0.5) * (roomSize - 12)
        };
        m.userData.dragChangeTimer = 3 + Math.random() * 2;
      }
      m.userData.dragChangeTimer -= delta;
      dt = m.userData.dragTarget;
    }

    var dragSpeed = (t.speed || 3.0) * 2.0 * delta;
    var dDir = new THREE.Vector3(dt.x - m.position.x, 0, dt.z - m.position.z);
    var dDist = dDir.length();
    // 距离Boss/目标点3以上继续拖，否则原地按住玩家
    if (dDist > 3.0) {
      dDir.normalize();
      var dMove = dDir.clone().multiplyScalar(dragSpeed);
      m.position.add(dMove);
      m.rotation.y = Math.atan2(dMove.x, dMove.z);
      m.userData.walkPhase += delta * 6;

      // 拖拽玩家跟着怪物移动（在怪物身后1.5单位）
      player.position.x = m.position.x - dDir.x * 1.5;
      player.position.z = m.position.z - dDir.z * 1.5;
      player.position.y = groundY;
    } else if (bossTarget && !m.userData.deliveredToBoss) {
      // 已把玩家拖到Boss面前
      m.userData.deliveredToBoss = true;
      showMessage('👑 你被拖到了Boss面前! 快挣脱!', 0xff4444);
    }

    // 被抓时发光更强
    m.children.forEach(function (child, idx) {
      if (child.isMesh && child.material && child.material.emissive) {
        child.material.emissiveIntensity = 0.5 + Math.sin(clock.elapsedTime * 5 + idx) * 0.3;
      }
    });
    return;
  }

  if (dist < CHASE_RANGE && !m.userData.isChasing) {
    // 发现玩家，开始追击
    m.userData.isChasing = true;
    showMessage('⚠️ 追捕者发现你了! 快跑!', 0xff4444);
  } else if (dist >= CHASE_RANGE * 1.5) {
    m.userData.isChasing = false;
  }

  if (m.userData.isChasing) {
    // 追击模式：冲刺/冷却交替，给玩家逃跑机会
    // 初始化冲刺计时器
    if (m.userData.sprintTimer === undefined) m.userData.sprintTimer = 0;
    if (m.userData.sprintCooldown === undefined) m.userData.sprintCooldown = 0;

    // 冲刺冷却递减
    if (m.userData.sprintCooldown > 0) {
      m.userData.sprintCooldown -= delta;
    }

    // 冲刺计时递减
    var isSprinting = m.userData.sprintTimer > 0;
    if (isSprinting) {
      m.userData.sprintTimer -= delta;
    }

    // 冲刺结束后进入冷却
    if (!isSprinting && m.userData.sprintCooldown <= 0) {
      // 开始新一轮冲刺（持续1.5秒）
      m.userData.sprintTimer = 1.5;
      m.userData.sprintCooldown = 5.0; // 5秒冷却
      isSprinting = true;
    }

    var chaseSpeed;
    if (isSprinting) {
      // 冲刺速度：快速接近
      chaseSpeed = (t.chaseSpeed || 7.0) * delta;
      // 冲刺时显示警告
      if (Math.random() < 0.02) showMessage('💨 追捕者冲刺中!', 0xff4444);
    } else {
      // 冷却中：缓慢移动（比巡逻稍快一点）
      chaseSpeed = (t.speed || 3.0) * 0.8 * delta;
    }

    var dir = new THREE.Vector3().subVectors(_chaserTgt, m.position);
    dir.y = 0;
    if (dir.length() > 0) {
      var move = dir.clone().normalize().multiplyScalar(chaseSpeed);
      m.position.add(move);
      m.rotation.y = Math.atan2(move.x, move.z);
      m.userData.walkPhase += delta * (isSprinting ? 10 : 4);
    }

    // 冲刺时抓捕最近的玩家（主机权威：可抓主机或加入者）
    if (isSprinting && captureState.grabCooldown <= 0 && !m.userData.captiveId) {
      tryChaserGrab(m, GRAB_RANGE);
    }
  } else {
    // 巡逻模式：随机游荡
    m.userData.roamTimer = (m.userData.roamTimer || 0) + delta;
    if (!m.userData.wanderTarget || m.userData.roamTimer > 8) {
      var rm = ROOMS[Math.floor(Math.random() * ROOMS.length)];
      m.userData.wanderTarget = {
        x: rm.cx + (Math.random() - 0.5) * (roomSize - 14),
        z: rm.cz + (Math.random() - 0.5) * (roomSize - 14)
      };
      m.userData.roamTimer = 0;
    }
    var speed = (t.speed || 3.0) * 0.6 * delta;
    var wt = m.userData.wanderTarget;
    var wDir = new THREE.Vector3(wt.x - m.position.x, 0, wt.z - m.position.z);
    if (wDir.length() > 0.5) {
      var wMove = wDir.normalize().multiplyScalar(speed);
      m.position.add(wMove);
      m.rotation.y = Math.atan2(wMove.x, wMove.z);
      m.userData.walkPhase += delta * 3;
    }
  }

  // 呼吸起伏
  m.position.y = groundY + Math.abs(Math.sin(m.userData.walkPhase)) * 0.08;

  // 发光动画（受击时闪白光优先）
  if (m.userData.hitFlash > 0) {
    m.userData.hitFlash -= delta;
    m.children.forEach(function (child) {
      if (child.isMesh && child.material && child.material.emissive) {
        child.material.emissiveIntensity = 0.9;
      }
    });
  } else {
    m.children.forEach(function (child, idx) {
      if (child.isMesh && child.material && child.material.emissive) {
        child.material.emissiveIntensity = 0.2 + Math.sin(clock.elapsedTime * 3 + idx) * 0.15;
      }
    });
  }
}

function initMonsters() {
  monsters.forEach(function (m) { if (m.parent) scene.remove(m); });
  monsters = [];
  bosses.forEach(function (b) { if (b.parent) scene.remove(b); });
  bosses = [];

  var chd = currentChapterData();

  // 随机选一个非中央房间生成小怪
  var candidates = ROOMS.filter(function (r) { return !(r.cx === 0 && r.cz === 0); });
  var spawnRoom = candidates[Math.floor(Math.random() * candidates.length)];
  lastMonsterSpawnRoom = spawnRoom;

  var t = pickMinionType();
  // 应用时间增强
  var scaledT = scaleMonsterType(t);

  var g = buildMonsterMesh(scaledT);
  if (scaledT.scale && scaledT.scale !== 1) g.scale.setScalar(scaledT.scale);

  var x = spawnRoom.cx + (Math.random() - 0.5) * (roomSize - 12);
  var z = spawnRoom.cz + (Math.random() - 0.5) * (roomSize - 12);
  g.position.set(x, groundY, z);
  scene.add(g);

  g.userData = {
    radius: 0.9 * (scaledT.scale || 1),
    active: true,
    walkPhase: 0,
    type: scaledT,
    baseType: t,
    isBoss: false,
    speedMul: 1,
    homeRoom: spawnRoom,
    returnHomeTimer: 0,
    rangedTimer: 2,
    dashTimer: 10,
    lastAttackedTime: clock.elapsedTime,
    respawnTimer: 0
  };
  g.userData.hp = scaledT.hp;
  monsters.push(g);

  if (typeof fragmentDrops !== 'undefined') {
    fragmentDrops.forEach(function (f) { if (f.parent) scene.remove(f); });
    fragmentDrops.length = 0;
  }

  // Boss在金色宝箱刷新时生成，不在init时生成

  centerRoomMonsterTimer = 30;
  centerRoomMonstersSpawned = true; // 不再额外刷怪：全场只有1只小怪+1只Boss

  // 生成抓捕者
  spawnChaser();
}

// 中央房间怪物刷新
function spawnCenterRoomMonsters() {
  if (centerRoomMonstersSpawned) return;
  centerRoomMonstersSpawned = true;

  var centerRoom = ROOMS[0];
  var t = pickMinionType();
  var scaledT = scaleMonsterType(t);

  // 中央房间刷1只怪物
  var g = buildMonsterMesh(scaledT);
  if (scaledT.scale && scaledT.scale !== 1) g.scale.setScalar(scaledT.scale);

  var x = centerRoom.cx + (Math.random() - 0.5) * (roomSize - 12);
  var z = centerRoom.cz + (Math.random() - 0.5) * (roomSize - 12);
  if (Math.abs(x) < 6) x = x < 0 ? -8 : 8;
  if (Math.abs(z) < 6) z = z < 0 ? -8 : 8;
  g.position.set(x, groundY, z);
  scene.add(g);

  g.userData = {
    radius: 0.9 * (scaledT.scale || 1),
    active: true,
    walkPhase: 0,
    type: scaledT,
    baseType: t,
    isBoss: false,
    speedMul: 1,
    homeRoom: centerRoom,
    returnHomeTimer: 0,
    rangedTimer: 2,
    dashTimer: 10,
    lastAttackedTime: clock.elapsedTime,
    respawnTimer: 0
  };
  g.userData.hp = scaledT.hp;
  monsters.push(g);
  lastMonsterSpawnRoom = centerRoom;
  // 不通知怪物刷新
}

// 刷新小怪（被击败后立即刷新，不在同一个房间）
// 刷新时重新随机选择远程/近战类型
function respawnMonster(m) {
  var baseT = pickMinionType();
  var t = scaleMonsterType(baseT);

  // 选择一个与上次不同的房间
  var candidates = ROOMS.filter(function (r) {
    return r !== lastMonsterSpawnRoom;
  });
  if (candidates.length === 0) candidates = ROOMS;
  var rm = candidates[Math.floor(Math.random() * candidates.length)];

  var g = buildMonsterMesh(t);
  if (t.scale && t.scale !== 1) g.scale.setScalar(t.scale);

  var x = rm.cx + (Math.random() - 0.5) * (roomSize - 12);
  var z = rm.cz + (Math.random() - 0.5) * (roomSize - 12);
  g.position.set(x, groundY, z);
  scene.add(g);

  g.userData = {
    radius: 0.9 * (t.scale || 1),
    active: true,
    walkPhase: 0,
    type: t,
    baseType: baseT,
    isBoss: false,
    speedMul: 1,
    homeRoom: rm,
    returnHomeTimer: 0,
    rangedTimer: 2,
    dashTimer: 10,
    lastAttackedTime: clock.elapsedTime,
    respawnTimer: 0
  };
  g.userData.hp = t.hp;

  var idx = monsters.indexOf(m);
  if (idx !== -1) {
    monsters[idx] = g;
  } else {
    monsters.push(g);
  }
  lastMonsterSpawnRoom = rm;
  // 不通知怪物刷新位置
}

// ============================================================
// 道具系统
// ============================================================
var items = [];
var normalChests = [];

var ITEM_TYPES = [
  {
    id: 'hpPotion', name: '生命药水', icon: '❤️', color: 0xff4488,
    desc: '恢复30点生命值',
    apply: function () {
      var maxHp = GS.maxHp + (GS.maxHpBonus || 0);
      GS.hp = Math.min(maxHp, GS.hp + 30);
      showMessage('❤️ 生命药水! 恢复30点生命', 0xff4488);
    }
  },
  {
    id: 'speedBoots', name: '急速之靴', icon: '👢', color: 0x44ddff,
    desc: '移动速度+1.5',
    apply: function () {
      GS.moveSpeedBonus = (GS.moveSpeedBonus || 0) + 1.5;
      showMessage('👢 急速之靴! 速度+' + GS.moveSpeedBonus.toFixed(1), 0x44ddff);
    }
  },
  {
    id: 'weapon', name: '武器', icon: '⚔️', color: 0xff8800,
    desc: '随机获得一把新武器（20发子弹，捆仙绳仅1次）',
    apply: function () {
      var lockedW = REWARD_WEAPON_LIST.filter(function (n) { return !GS.weapons[n] });
      if (lockedW.length > 0) {
        var wn = lockedW[Math.floor(Math.random() * lockedW.length)];
        GS.weapons[wn] = WEAPONS[wn];
        GS.weaponAmmo[wn] = WEAPONS[wn].type === 'rope' ? 1 : 20; // 捆仙绳一次性
        GS.weaponCount++;
        if (!GS.curWeapon) GS.curWeapon = wn;
        updateWeaponBar();
        showMessage('⚔️ 获得武器: ' + wn + (WEAPONS[wn].type === 'rope' ? ' (1次)' : ' (20发)'), 0xff8800);
        createWeaponGetEffect();
      } else {
        // 已拥有全部武器，捡到重置子弹
        var ownedW = REWARD_WEAPON_LIST.filter(function (n) { return GS.weapons[n] });
        if (ownedW.length > 0) {
          var wn = ownedW[Math.floor(Math.random() * ownedW.length)];
          GS.weaponAmmo[wn] = WEAPONS[wn].type === 'rope' ? 1 : 20;
          GS.curWeapon = wn;
          updateWeaponBar();
          showMessage('⚔️ 弹药重置: ' + wn, 0xff8800);
        } else {
          GS.stars += 20;
          showMessage('⭐ +20星', 0xffd700);
        }
      }
    }
  },
  {
    id: 'atkGem', name: '攻击宝石', icon: '💎', color: 0xff3333,
    desc: '攻击力+10，攻击速度提升',
    apply: function () {
      GS.atkBonus = (GS.atkBonus || 0) + 10;
      GS.atkSpeedBonus = (GS.atkSpeedBonus || 0) + 0.05;
      showMessage('💎 攻击宝石! 攻击力+10, 攻速提升', 0xff3333);
    }
  },
  {
    id: 'defGem', name: '防御宝石', icon: '🛡️', color: 0x4488ff,
    desc: '血量上限+20，防御+5',
    apply: function () {
      GS.maxHpBonus = (GS.maxHpBonus || 0) + 20;
      GS.defBonus = (GS.defBonus || 0) + 5;
      showMessage('🛡️ 防御宝石! 血量上限+20, 防御+5', 0x4488ff);
    }
  },
  {
    id: 'chest', name: '普通宝盒', icon: '🎁', color: 0xaa77ff,
    desc: '答题解锁：随机1-3个能量碎片+1件武器',
    isChest: true,
    apply: function () { } // 宝盒不即时生效，走答题流程
  },
  {
    id: 'flashlight', name: '手电筒', icon: '🔦', color: 0xffff44,
    desc: '开启手电筒增加视线距离',
    apply: function () {
      GS.hasFlashlight = true;
      showMessage('🔦 获得手电筒! 按F开启', 0xffff44);
      if (!flashlightActive && flashlightCooldown <= 0) {
        toggleFlashlight();
      }
    }
  },
  {
    id: 'fragment', name: '能量碎片', icon: '💠', color: 0xffd700,
    desc: '获得1个能量碎片（2个合成1点能量）',
    apply: function () {
      gainFragment();
      showMessage('💠 获得能量碎片! (' + (GS.fragments || 0) + '/2)', 0xffd700);
    }
  }
];

// 生成漂浮道具的3D模型
function buildItemMesh(itemType) {
  var g = new THREE.Group();
  var color = itemType.color;

  if (itemType.id === 'chest') {
    // 普通宝盒 - 紫色小箱子（比金色宝箱小，颜色区分）
    var boxMat = new THREE.MeshStandardMaterial({ color: 0x7755cc, metalness: 0.4, roughness: 0.5, emissive: 0x5533aa, emissiveIntensity: 0.25 });
    var darkMat = new THREE.MeshStandardMaterial({ color: 0x553399, metalness: 0.4, roughness: 0.5 });
    var body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.35, 0.42), boxMat);
    body.position.y = 0.18; g.add(body);
    var lid = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.6, 10, 1, false, 0, Math.PI), darkMat);
    lid.rotation.z = Math.PI / 2;
    lid.position.y = 0.36; g.add(lid);
    var trimMat = new THREE.MeshStandardMaterial({ color: 0xcc99ff, metalness: 0.8, roughness: 0.2, emissive: 0xaa77ff, emissiveIntensity: 0.4 });
    var lock = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.05), trimMat);
    lock.position.set(0, 0.26, 0.22); g.add(lock);
    var glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xaa77ff, transparent: true, opacity: 0.12, side: THREE.DoubleSide })
    );
    glow.position.y = 0.25; g.add(glow);
    var ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.4, 0.02, 6, 16),
      new THREE.MeshBasicMaterial({ color: 0xaa77ff, transparent: true, opacity: 0.4 })
    );
    ring.rotation.x = Math.PI / 2; g.add(ring);
    return g;
  }

  if (itemType.id === 'weapon') {
    // 武器道具以武器的形态展示 - 剑的造型
    var bladeMat = new THREE.MeshStandardMaterial({ color: 0xccccff, emissive: 0x4488ff, emissiveIntensity: 0.3, metalness: 0.8, roughness: 0.2 });
    var handleMat = new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.7 });
    var guardMat = new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.6, roughness: 0.3 });

    var blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.6, 0.02), bladeMat);
    blade.position.y = 0.4;
    g.add(blade);

    var tip = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.15, 6), bladeMat);
    tip.position.y = 0.78;
    g.add(tip);

    var guard = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.03, 0.04), guardMat);
    guard.position.y = 0.1;
    g.add(guard);

    var handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.15, 6), handleMat);
    handle.position.y = -0.02;
    g.add(handle);

    var glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.4, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0x4488ff, transparent: true, opacity: 0.12, side: THREE.DoubleSide })
    );
    g.add(glow);

    var ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.35, 0.02, 6, 16),
      new THREE.MeshBasicMaterial({ color: 0x4488ff, transparent: true, opacity: 0.4 })
    );
    ring.rotation.x = Math.PI / 2;
    g.add(ring);

    return g;
  }

  if (itemType.id === 'fragment') {
    // 碎片造型 - 金色八面体
    var core = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.3),
      new THREE.MeshStandardMaterial({ color: 0xffd700, emissive: 0xffd700, emissiveIntensity: 0.9, transparent: true, opacity: 0.95 })
    );
    g.add(core);
    var innerGlow = new THREE.Mesh(
      new THREE.SphereGeometry(0.4, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffd700, transparent: true, opacity: 0.2, side: THREE.DoubleSide })
    );
    g.add(innerGlow);
    var outerGlow = new THREE.Mesh(
      new THREE.SphereGeometry(0.6, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.1, side: THREE.DoubleSide })
    );
    g.add(outerGlow);
    return g;
  }

  // 核心球体（非武器、非碎片道具）
  var core = new THREE.Mesh(
    new THREE.SphereGeometry(0.35, 10, 10),
    new THREE.MeshStandardMaterial({
      color: color, emissive: color, emissiveIntensity: 0.5,
      transparent: true, opacity: 0.9
    })
  );
  g.add(core);

  var glow = new THREE.Mesh(
    new THREE.SphereGeometry(0.55, 8, 8),
    new THREE.MeshBasicMaterial({
      color: color, transparent: true, opacity: 0.15, side: THREE.DoubleSide
    })
  );
  g.add(glow);

  var ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.45, 0.025, 6, 16),
    new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.5 })
  );
  ring.rotation.x = Math.PI / 2;
  g.add(ring);

  var iconMesh;
  switch (itemType.id) {
    case 'hpPotion':
      iconMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.2, 0.08),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      iconMesh.position.y = 0.05;
      g.add(iconMesh);
      var hBar = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 0.08, 0.08),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      hBar.position.y = 0.05;
      g.add(hBar);
      break;
    case 'speedBoots':
      iconMesh = new THREE.Mesh(
        new THREE.ConeGeometry(0.12, 0.15, 3),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      iconMesh.position.y = 0.05;
      iconMesh.rotation.y = Math.PI / 2;
      g.add(iconMesh);
      break;
    case 'atkGem':
      iconMesh = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.1),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      iconMesh.position.y = 0.05;
      g.add(iconMesh);
      break;
    case 'defGem':
      iconMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.12, 0.12),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      iconMesh.position.y = 0.05;
      g.add(iconMesh);
      break;
    case 'flashlight':
      var bodyMat = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.5, roughness: 0.3 });
      var body = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.25, 8), bodyMat);
      body.position.y = 0.05;
      g.add(body);
      var lensMat = new THREE.MeshStandardMaterial({ color: 0xffff88, emissive: 0xffff44, emissiveIntensity: 0.5 });
      var lens = new THREE.Mesh(new THREE.CircleGeometry(0.08, 8), lensMat);
      lens.position.set(0, 0.05, 0.13);
      lens.rotation.x = 0;
      g.add(lens);
      break;
  }

  return g;
}

function spawnItems() {
  items.forEach(function (it) {
    if (it.parent) scene.remove(it);
  });
  items = [];

  ROOMS.forEach(function (rm) {
    spawnItemsInRoom(rm);
  });
}

function spawnItemsInRoom(rm) {
  // 统计房间内现有道具（总数 + 每种类型数量）
  var existingCount = 0;
  var typeCounts = {};
  items.forEach(function (it) {
    if (Math.abs(it.position.x - rm.cx) < roomSize / 2 && Math.abs(it.position.z - rm.cz) < roomSize / 2) {
      existingCount++;
      var tid = it.userData.itemType.id;
      typeCounts[tid] = (typeCounts[tid] || 0) + 1;
    }
  });

  // 每个房间随机刷新5-10个道具
  var maxCount = 5 + Math.floor(Math.random() * 6);
  var spawnCount = maxCount - existingCount;
  if (spawnCount <= 0) return;

  for (var i = 0; i < spawnCount; i++) {
    var itemType;
    if (rm.cx === 0 && rm.cz === 0 && existingCount === 0 && i === 0) {
      var weaponType = null;
      for (var wt = 0; wt < ITEM_TYPES.length; wt++) {
        if (ITEM_TYPES[wt].id === 'weapon') { weaponType = ITEM_TYPES[wt]; break; }
      }
      itemType = weaponType || ITEM_TYPES[Math.floor(Math.random() * ITEM_TYPES.length)];
    } else {
      // 同一房间内同一道具不能同时存在大于2个（宝盒由独立系统管理，不走随机池）
      var allowed = ITEM_TYPES.filter(function (t) { return !t.isChest && (typeCounts[t.id] || 0) < 2; });
      if (allowed.length === 0) break;
      itemType = allowed[Math.floor(Math.random() * allowed.length)];
    }
    typeCounts[itemType.id] = (typeCounts[itemType.id] || 0) + 1;
    var x = rm.cx + (Math.random() - 0.5) * (roomSize - 12);
    var z = rm.cz + (Math.random() - 0.5) * (roomSize - 12);
    if (rm.cx === 0 && rm.cz === 0) {
      if (Math.abs(x) < 8) x = x < 0 ? -10 : 10;
      if (Math.abs(z) < 8) z = z < 0 ? -10 : 10;
    }
    var mesh = buildItemMesh(itemType);
    mesh.position.set(x, 1.0, z);
    // 联机模式：赋予唯一 netId，用于主机快照同步
    if (!mesh.userData.netId) {
      mesh.userData.netId = 'i_' + Math.random().toString(36).substr(2, 8);
    }
    mesh.userData = {
      netId: mesh.userData.netId,
      itemType: itemType,
      active: true,
      floatPhase: Math.random() * Math.PI * 2,
      rotSpeed: 1 + Math.random() * 0.5
    };
    scene.add(mesh);
    items.push(mesh);
  }
}

// ============================================================
// 普通宝盒独立刷新系统
// 全场同时最多5个；只刷在房间墙角；不刷在Boss房间和金色宝箱房间；
// 每个宝盒答题一次（无论对错）即销毁，30秒后随机换其他房间补刷
// ============================================================
var CHEST_MAX_COUNT = 5;

function chestTypeDef() {
  for (var i = 0; i < ITEM_TYPES.length; i++) {
    if (ITEM_TYPES[i].isChest) return ITEM_TYPES[i];
  }
  return null;
}

function countChests() {
  var n = 0;
  normalChests.forEach(function (it) {
    if (it.userData.itemType && it.userData.itemType.isChest && it.userData.active) n++;
  });
  return n;
}

function roomOfPosition(pos) {
  for (var ri = 0; ri < ROOMS.length; ri++) {
    if (Math.abs(pos.x - ROOMS[ri].cx) < roomSize / 2 &&
      Math.abs(pos.z - ROOMS[ri].cz) < roomSize / 2) {
      return ROOMS[ri];
    }
  }
  return null;
}

// 宝盒可刷新的房间：排除Boss所在房间、金色宝箱所在房间、已有宝盒的房间（防重叠）、指定房间（刚销毁的那间）
function chestEligibleRooms(excludeRoom) {
  return ROOMS.filter(function (r) {
    if (excludeRoom && r === excludeRoom) return false;
    // 排除金色宝箱所在房间
    if (energyOrb) {
      var grIdx = roomIndexOf(energyOrb.position.x, energyOrb.position.z);
      if (grIdx !== -1 && r === ROOMS[grIdx]) return false;
    }
    // 该房间已有宝盒则不再刷（每房间最多1个，避免同角重叠连续触发答题）
    for (var ii = 0; ii < normalChests.length; ii++) {
      var it = normalChests[ii];
      if (it.userData.itemType && it.userData.itemType.isChest &&
        Math.abs(it.position.x - r.cx) < roomSize / 2 &&
        Math.abs(it.position.z - r.cz) < roomSize / 2) return false;
    }
    for (var bi = 0; bi < bosses.length; bi++) {
      var b = bosses[bi];
      if (!b.userData.active) continue;
      if (Math.abs(b.position.x - r.cx) < roomSize / 2 &&
        Math.abs(b.position.z - r.cz) < roomSize / 2) return false;
    }
    return true;
  });
}

function spawnChest(excludeRoom) {
  if (countChests() >= CHEST_MAX_COUNT) return;
  var ct = chestTypeDef();
  if (!ct) return;

  var eligible = chestEligibleRooms(excludeRoom);
  if (eligible.length === 0) eligible = chestEligibleRooms(null);
  if (eligible.length === 0) return;
  var rm = eligible[Math.floor(Math.random() * eligible.length)];

  // 固定刷新在房间墙角（四角随机选一个，微小偏移避免完全重叠）
  var cornerOff = halfRoom - 3; // 距墙3个单位，避免嵌墙
  var corners = [
    [-cornerOff, -cornerOff], [cornerOff, -cornerOff],
    [-cornerOff, cornerOff], [cornerOff, cornerOff]
  ];
  var c = corners[Math.floor(Math.random() * corners.length)];
  var x = rm.cx + c[0] + (Math.random() - 0.5) * 1.5;
  var z = rm.cz + c[1] + (Math.random() - 0.5) * 1.5;

  var mesh = buildItemMesh(ct);
  mesh.position.set(x, 1.0, z);
  // 联机模式：赋予唯一 netId
  if (!mesh.userData.netId) {
    mesh.userData.netId = 'c_' + Math.random().toString(36).substr(2, 8);
  }
  mesh.userData = {
    netId: mesh.userData.netId,
    itemType: ct,
    active: true,
    floatPhase: Math.random() * Math.PI * 2,
    rotSpeed: 1 + Math.random() * 0.5
  };
  scene.add(mesh);
  normalChests.push(mesh);
}

// 初始铺满5个宝盒
function spawnInitialChests() {
  for (var i = 0; i < CHEST_MAX_COUNT; i++) spawnChest(null);
}

// 销毁宝盒（答题后无论对错都调用）：显示盖子打开状态，30秒后移除并补刷
function destroyChestItem(it) {
  if (!it || it.userData.destroyed) return;
  it.userData.destroyed = true;
  it.userData.active = false;

  // 视觉：打开盖子
  if (it.children.length >= 5) {
    var lid = it.children[1]; // 盖子
    if (lid) lid.rotation.x = -Math.PI * 0.5;
    var lock = it.children[2]; // 锁
    if (lock) lock.visible = false;
    var glow = it.children[3]; // 光晕
    if (glow && glow.material) glow.material.opacity = 0.04;
    var ring = it.children[4]; // 光环
    if (ring) ring.visible = false;
  }

  var fromRoom = roomOfPosition(it.position);

  // 30秒后：移除已打开的空宝箱，在其他房间补刷新宝箱
  var tryRespawn = function () {
    if (GS.gameOver) return;
    // 游戏暂停中（如答题界面未关），延后重试，宝盒不丢失
    if (!GS.running) { setTimeout(tryRespawn, 2000); return; }
    // 移除打开的宝箱
    var idx = normalChests.indexOf(it);
    if (idx !== -1) normalChests.splice(idx, 1);
    if (it.parent) scene.remove(it);
    spawnChest(fromRoom);
    // 联机模式：主机广播宝箱重生通知
    if (GS.mode === 'multiplayer' && GS.isHost && typeof PeerManager !== 'undefined') {
      PeerManager.broadcast('chest_refresh', {
        fromRoomCx: fromRoom ? fromRoom.cx : null,
        fromRoomCz: fromRoom ? fromRoom.cz : null
      });
    }
  };
  setTimeout(tryRespawn, 30000);
}

function updateItems(delta) {
  // 联机加入者模式：跳过本地拾取，只更新动画
  if (GS.mode === 'multiplayer' && !GS.isHost) {
    for (var si = 0; si < items.length; si++) {
      var sit = items[si];
      if (!sit.userData.active) continue;
      sit.position.y = 1.0 + Math.sin(clock.elapsedTime * 2 + sit.userData.floatPhase) * 0.2;
      sit.rotation.y += delta * sit.userData.rotSpeed;
    }
    return;
  }

  // 答题期间跳过所有物品交互，防止重复触发
  var quizOverlay = document.getElementById('quiz-overlay');
  var quizActive = quizOverlay && quizOverlay.style.display === 'flex';
  
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    if (!it.userData.active) continue;
    it.position.y = 1.0 + Math.sin(clock.elapsedTime * 2 + it.userData.floatPhase) * 0.2;
    it.rotation.y += delta * it.userData.rotSpeed;
    if (it.children.length > 2) {
      var ring = it.children[2];
      if (ring) ring.rotation.z += delta * 2;
    }
    if (player && !quizActive && !window.currentQuizChest && player.position.distanceTo(it.position) < 1.5) {
      var itemType = it.userData.itemType;

      itemType.apply();
      for (var j = 0; j < 12; j++) {
        (function () {
          var sp = new THREE.Mesh(
            new THREE.SphereGeometry(0.05, 4, 4),
            new THREE.MeshBasicMaterial({ color: itemType.color, transparent: true, opacity: 1 })
          );
          sp.position.copy(it.position);
          var angle = Math.random() * Math.PI * 2;
          sp.userData = {
            vel: new THREE.Vector3(Math.cos(angle) * 2, 2 + Math.random() * 2, Math.sin(angle) * 2),
            life: 0.5, fade: true
          };
          scene.add(sp);
          projectiles.push(sp);
        })();
      }
      var pickRoom = null;
      for (var ri = 0; ri < ROOMS.length; ri++) {
        if (Math.abs(it.position.x - ROOMS[ri].cx) < roomSize / 2 &&
          Math.abs(it.position.z - ROOMS[ri].cz) < roomSize / 2) {
          pickRoom = ROOMS[ri];
          break;
        }
      }
      scene.remove(it);
      items.splice(i, 1);
      i--;
      updateHUD();

      // 联机模式：主机广播道具拾取事件，通知加入者该房间将有新道具刷新
      if (GS.mode === 'multiplayer' && GS.isHost && typeof PeerManager !== 'undefined') {
        PeerManager.broadcast('item_pickup_sync', {
          roomCx: pickRoom ? pickRoom.cx : 0,
          roomCz: pickRoom ? pickRoom.cz : 0,
          itemType: itemType.id
        });
      }

      if (pickRoom) {
        (function (room, roomCx, roomCz) {
          // 普通道具刷新时间：10秒
          setTimeout(function () {
            spawnItemsInRoom(room);
            // 联机模式：主机广播道具刷新通知
            if (GS.mode === 'multiplayer' && GS.isHost && typeof PeerManager !== 'undefined') {
              PeerManager.broadcast('item_refresh', {
                roomCx: roomCx,
                roomCz: roomCz
              });
            }
          }, 10000);
        })(pickRoom, pickRoom.cx, pickRoom.cz);
      }
    }
  }
}

// ============================================================
// 手电筒系统
// ============================================================
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
      flashlightSpotLight = new THREE.SpotLight(0xffffcc, 2);
      flashlightSpotLight.angle = 0.4;
      flashlightSpotLight.penumbra = 0.3;
      flashlightSpotLight.decay = 1;
      flashlightSpotLight.distance = 25;
      flashlightSpotLight.castShadow = true;
      scene.add(flashlightSpotLight);

      var coneMat = new THREE.MeshBasicMaterial({
        color: 0xffffcc,
        transparent: true,
        opacity: 0.05,
        side: THREE.DoubleSide
      });
      var cone = new THREE.Mesh(new THREE.ConeGeometry(6, 12, 16, 1, true), coneMat);
      cone.rotation.x = Math.PI / 2;
      cone.position.z = -6;
      flashlightSpotLight.add(cone);
    }

    scene.fog = new THREE.Fog(scene.background.getHex(), 15, 30);

    if (!GS._flashlightAmbient) {
      GS._flashlightAmbient = new THREE.AmbientLight(0xffffcc, 0.15);
      scene.add(GS._flashlightAmbient);
    }
  } else {
    showMessage('🔦 手电筒关闭', 0xffff44);
    flashlightCooldown = FLASHLIGHT_COOLDOWN;

    if (flashlightSpotLight) {
      scene.remove(flashlightSpotLight);
      flashlightSpotLight = null;
    }

    var chd = currentChapterData();
    scene.fog = new THREE.Fog(chd.fogColor, 8, 13);

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
      var chd = currentChapterData();
      scene.fog = new THREE.Fog(chd.fogColor, 8, 13);
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
// 武器栏
// ============================================================
function buildWeaponBar() {
  var bar = document.getElementById('weapon-bar');
  bar.innerHTML = '';
  WEAPON_LIST.forEach(function (name) {
    var w = WEAPONS[name];
    var btn = document.createElement('button');
    btn.className = 'weapon-btn locked';
    btn.innerHTML = '<span class="icon">' + w.icon + '</span>' + name + '<span class="ammo-count"></span>';
    btn.dataset.weapon = name;
    var handler = function (e) { e.preventDefault(); if (GS.weapons[name] && !GS.gameOver) selectWeapon(name); };
    btn.addEventListener('click', handler);
    btn.addEventListener('touchstart', handler, { passive: false });
    bar.appendChild(btn);
  });
  updateWeaponBar();
}

function updateWeaponBar() {
  var btns = document.querySelectorAll('.weapon-btn');
  btns.forEach(function (btn) {
    var n = btn.dataset.weapon;
    var hasWeapon = GS.weapons[n];
    var ammo = GS.weaponAmmo[n] || 0;
    btn.className = 'weapon-btn' + (hasWeapon ? (GS.curWeapon === n ? ' active' : '') : ' locked');
    var ammoSpan = btn.querySelector('.ammo-count');
    if (ammoSpan) {
      // 木棍等无限武器显示∞
      ammoSpan.textContent = hasWeapon ? (isFinite(ammo) ? ' (' + ammo + ')' : ' (∞)') : '';
    }
  });
}

function selectWeapon(name) {
  GS.curWeapon = name;
  updateWeaponBar();
  var ammo = GS.weaponAmmo[name] || 0;
  showMessage('⚔️ 切换 ' + name + (isFinite(ammo) ? ' (' + ammo + '发)' : ' (∞)'), 0x4488ff);
  // 显示/隐藏角色身上的木棍
  if (player && player.userData.stick) {
    var isStick = name === '木棍' || (GS.weapons[name] && GS.weapons[name].type === 'stick');
    player.userData.stick.body.visible = isStick;
    player.userData.stick.knot.visible = isStick;
    player.userData.stick.glow.visible = isStick;
  }
}

// ============================================================
// 逃离升空动画
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
// 跳跃系统
// ============================================================
function tryJump() {
  if (GS.gameOver || !GS.running) return;
  if (!GS.canJump) return;
  GS.canJump = false;
  playerVelY = 5.5;
  GS.isJumping = true;
}

function updateJump(delta) {
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
// 辅助函数
// ============================================================
function inPlayArea(x, z, r) {
  for (var i = 0; i < ROOMS.length; i++) {
    var rm = ROOMS[i];
    if (Math.abs(x - rm.cx) < halfRoom && Math.abs(z - rm.cz) < halfRoom) return true;
  }
  return false;
}

function clampPlayer() {
  if (!inPlayArea(player.position.x, player.position.z, 0.5)) {
    var bestRm = ROOMS[0], bestDist = 1e9;
    ROOMS.forEach(function (rm) {
      var d = Math.abs(player.position.x - rm.cx) + Math.abs(player.position.z - rm.cz);
      if (d < bestDist) { bestDist = d; bestRm = rm; }
    });
    var dx = player.position.x - bestRm.cx;
    var dz = player.position.z - bestRm.cz;
    if (Math.abs(dx) > halfRoom - 0.5) player.position.x = bestRm.cx + Math.sign(dx) * (halfRoom - 0.5);
    if (Math.abs(dz) > halfRoom - 0.5) player.position.z = bestRm.cz + Math.sign(dz) * (halfRoom - 0.5);
  }
}

var currentTargetMonster = null;

function setTargetMonster(m) {
  currentTargetMonster = m;
}

function updateMonsterHPBar() {
  var monsterHpEl = document.getElementById('monster-hp');
  var fillEl = document.getElementById('monster-hp-fill');
  var labelEl = document.querySelector('#monster-hp .label');

  if (!monsterHpEl || !fillEl) return;

  var allActive = monsters.concat(bosses);
  if (chaserMonster && chaserMonster.parent && chaserMonster.userData.active) {
    allActive.push(chaserMonster);
  }
  var closest = null, closestDist = 999;
  allActive.forEach(function (m) {
    if (!m.userData.active) return;
    var d = player.position.distanceTo(m.position);
    if (d < closestDist && d < 15) {
      closestDist = d;
      closest = m;
    }
  });

  if (closest && closest.userData.active) {
    var t = closest.userData.type || {};
    var hp = closest.userData.hp || 0;
    var maxHp = t.hp || 100;
    var pct = Math.max(0, (hp / maxHp * 100));
    fillEl.style.width = pct + '%';
    if (labelEl) labelEl.textContent = '👾 ' + (t.name || '怪物') + ' HP: ' + Math.ceil(hp) + '/' + maxHp;
    monsterHpEl.style.display = 'block';
  } else {
    monsterHpEl.style.display = 'none';
  }
}

// ============================================================
// 抓捕者系统 - 抓捕/挣脱
// ============================================================
function capturePlayer() {
  if (captureState.captured) return;
  if (GS.gameOver || !GS.running) return;

  captureState.captured = true;
  captureState.tapCount = 0;
  captureState.dmgTimer = 0;
  // 注意：冷却在挣脱/送达时设置，被抓瞬间不设（否则挣脱快时冷却反而先走完）

  // 显示挣脱进度条
  var bar = document.getElementById('capture-bar');
  if (bar) bar.classList.remove('hidden');

  // 攻击按钮变为挣脱模式
  var attackBtn = document.getElementById('btn-attack');
  if (attackBtn) attackBtn.classList.add('capture-mode');

  // 被抓紫晕脉动
  var vig = document.getElementById('hit-vignette');
  if (vig) vig.classList.add('captured');

  // 更新UI
  updateCaptureUI();

  // 玩家不能移动
  // 播放被抓动画效果
  if (chaserMonster && chaserMonster.parent) {
    // 清除之前的拖拽目标，开始拖向Boss房间
    chaserMonster.userData.dragTarget = null;
    chaserMonster.userData.deliveredToBoss = false;
    chaserMonster.userData.isChasing = false;
  }
  showMessage('🕸️ 追捕者正拖着你去Boss房间! 快点击攻击挣脱!', 0xff4444);
  AudioMgr.playHurt();
  if (navigator.vibrate) { try { navigator.vibrate([80, 40, 80]); } catch (e) { } }
}

function updateCaptureUI() {
  var pct = Math.min(100, (captureState.tapCount / captureState.maxTap) * 100);
  var fillEl = document.getElementById('capture-bar-fill');
  var countEl = document.getElementById('capture-bar-count');
  if (fillEl) fillEl.style.width = pct + '%';
  if (countEl) countEl.textContent = captureState.tapCount + '/' + captureState.maxTap;
}

function onCaptureTap() {
  if (!captureState.captured) return;

  captureState.tapCount++;
  captureState.tapDecayTimer = 0; // 点击重置衰减计时
  updateCaptureUI();

  // 点击反馈：音效+震动（移动端）
  AudioMgr.playHit();
  if (navigator.vibrate) { try { navigator.vibrate(30); } catch (e) { } }

  if (captureState.tapCount >= captureState.maxTap) {
    // 挣脱成功
    breakFreeFromCapture();
  }
}

function breakFreeFromCapture() {
  captureState.captured = false;
  captureState.tapCount = 0;
  // 挣脱后给2.5秒加速逃跑窗口
  captureState.escapeBoostTimer = 2.5;

  // 隐藏进度条
  var bar = document.getElementById('capture-bar');
  if (bar) bar.classList.add('hidden');

  // 攻击按钮恢复正常
  var attackBtn = document.getElementById('btn-attack');
  if (attackBtn) attackBtn.classList.remove('capture-mode');

  // 关闭被抓紫晕
  var vig = document.getElementById('hit-vignette');
  if (vig) vig.classList.remove('captured');

  showMessage('💪 挣脱成功! 抓紧时间快跑!', 0x44ff88);
  AudioMgr.playSkill();

  // 重置离开计时器（挣脱后抓捕者还会多待一会儿）
  chaserLeaveTimer = Math.max(chaserLeaveTimer, 20);

  // 击退抓捕者
  if (chaserMonster && chaserMonster.parent) {
    var knockback = new THREE.Vector3().subVectors(chaserMonster.position, player.position);
    knockback.y = 0;
    if (knockback.length() > 0) {
      knockback.normalize().multiplyScalar(6);
      chaserMonster.position.add(knockback);
    }
    // 抓捕者被击退后眩晕2秒，且短时间内不再追击/抓捕
    chaserMonster.userData.isChasing = false;
    chaserMonster.userData.deliveredToBoss = false;
    chaserMonster.userData.captiveId = null;
    chaserMonster.userData.staggerTimer = 2.0;
  }
  // 统一冷却：挣脱后12秒内不会再次被抓
  captureState.grabCooldown = 12;
}

// 在update中处理抓捕者相关逻辑
function updateCaptureSystem(delta) {
  // 抓捕者离开计时器（只在非抓捕状态时倒计时，加入者由主机快照同步）
  if (!captureState.captured && chaserMonster && chaserMonster.parent) {
    // 加入者不管理抓捕者生命周期，由主机快照同步控制
    if (GS.mode === 'multiplayer' && !GS.isHost) {
      // 跳过
    } else {
      chaserLeaveTimer -= delta;
      if (chaserLeaveTimer <= 0) {
        // 抓捕者自动离开
        if (chaserMonster && chaserMonster.parent) {
          scene.remove(chaserMonster);
          chaserMonster = null;
          window.chaserMonster = null;
        }
        showMessage('👋 追捕者离开了，稍后会重新出现', 0x8888ff);
        // 30秒后重新生成
        setTimeout(function () {
          if (GS.running && !GS.gameOver) {
            spawnChaser();
          }
        }, CHASER_RESPAWN_DELAY * 1000);
        return;
      }
    }
  }

  // 被抓期间持续掉血 + 挣脱进度缓慢衰减（制造拉扯对抗感）
  if (captureState.captured) {
    // 联机加入者端：贴着本地抓捕者模型移动（模拟被拖拽效果）
    if (GS.mode === 'multiplayer' && !GS.isHost && typeof chaserMonster !== 'undefined' && chaserMonster && chaserMonster.parent && player) {
      var _cDir = new THREE.Vector3(chaserMonster.position.x - player.position.x, 0, chaserMonster.position.z - player.position.z);
      if (_cDir.length() > 1.5) {
        _cDir.normalize();
        player.position.x = chaserMonster.position.x - _cDir.x * 1.5;
        player.position.z = chaserMonster.position.z - _cDir.z * 1.5;
      }
    }
    captureState.dmgTimer += delta;
    if (captureState.dmgTimer >= 1.0) {
      captureState.dmgTimer = 0;
      GS.hp -= 3;
      if (GS.hp <= 0) {
        GS.hp = 0;
        GS.gameOver = true;
        GS.running = false;
        captureState.captured = false;
        var bar = document.getElementById('capture-bar');
        if (bar) bar.classList.add('hidden');
        var attackBtn = document.getElementById('btn-attack');
        if (attackBtn) attackBtn.classList.remove('capture-mode');
        var vig = document.getElementById('hit-vignette');
        if (vig) vig.classList.remove('captured');
        showGameOver();
      }
      updateHUD();
    }
    // 每1.2秒不点击就掉1点挣脱进度（最多掉到0），点得慢就挣不脱
    captureState.tapDecayTimer += delta;
    if (captureState.tapDecayTimer >= 1.2) {
      captureState.tapDecayTimer = 0;
      if (captureState.tapCount > 0) {
        captureState.tapCount--;
        updateCaptureUI();
      }
    }
  } else {
    captureState.tapDecayTimer = 0;
  }

  // 挣脱后加速逃跑窗口递减
  if (captureState.escapeBoostTimer > 0) {
    captureState.escapeBoostTimer -= delta;
  }

  // 抓捕者冷却
  if (captureState.grabCooldown > 0) {
    captureState.grabCooldown -= delta;
  }

  // 更新抓捕者AI（加入者跳过，由主机权威执行）
  if (GS.mode !== 'multiplayer' || GS.isHost) {
    updateChaser(delta);
  }
}

// 导出到全局
window.initScene = initScene;
window.spawnChaser = spawnChaser;
window.capturePlayer = capturePlayer;
window.breakFreeFromCapture = breakFreeFromCapture;
window.captureState = captureState;
