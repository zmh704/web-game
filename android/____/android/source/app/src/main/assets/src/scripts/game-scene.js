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
  { cx: -40, cz: 0, name: '西' }
];
var DOOR_HALF = 3.6;
var DOOR_POS = { 1: { x: 0, z: -20 }, 2: { x: 20, z: 0 }, 3: { x: 0, z: 20 }, 4: { x: -20, z: 0 } };
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

// 初始化场景
function initScene() {
  var loading = document.getElementById('loading');
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a2e);
  scene.fog = new THREE.Fog(0x1a1a2e, 8, 13);

  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 50);
  camera.position.set(0, 5, 10);

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
  initMonsters();
  spawnEnergyOrb();
  spawnItems();
  buildWeaponBar();

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
  var segLen = H - G, segMid = (H + G) / 2;
  [-H, H].forEach(function (p) {
    wallSeg(-segMid, p, segLen, 0); wallSeg(segMid, p, segLen, 0);
    wallSeg(p, -segMid, segLen, Math.PI / 2); wallSeg(p, segMid, segLen, Math.PI / 2);
  });
  wallSeg(0, -3 * H, roomSize, 0);
  wallSeg(-H, -2 * H, roomSize, Math.PI / 2); wallSeg(H, -2 * H, roomSize, Math.PI / 2);
  wallSeg(0, 3 * H, roomSize, 0);
  wallSeg(-H, 2 * H, roomSize, Math.PI / 2); wallSeg(H, 2 * H, roomSize, Math.PI / 2);
  wallSeg(3 * H, 0, roomSize, Math.PI / 2);
  wallSeg(2 * H, -H, roomSize, 0); wallSeg(2 * H, H, roomSize, 0);
  wallSeg(-3 * H, 0, roomSize, Math.PI / 2);
  wallSeg(-2 * H, -H, roomSize, 0); wallSeg(-2 * H, H, roomSize, 0);

  var frameMat = new THREE.MeshStandardMaterial({ color: 0x1a1014, roughness: 0.9 });
  [[0, -H, 0], [0, H, 0], [-H, 0, 1], [H, 0, 1]].forEach(function (d) {
    [-1, 1].forEach(function (s) {
      var pillar = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.6, 0.3), frameMat);
      if (d[2] === 0) pillar.position.set(d[0] + s * (G + 0.2), 1.8, d[1]);
      else pillar.position.set(d[0], 1.8, d[1] + s * (G + 0.2));
      scene.add(pillar);
    });
    var beam = new THREE.Mesh(new THREE.BoxGeometry(d[2] === 0 ? G * 2 + 0.7 : 0.3, 0.3, d[2] === 0 ? 0.3 : G * 2 + 0.7), frameMat);
    beam.position.set(d[0], 3.6, d[1]);
    scene.add(beam);
  });

  createTable(-8, groundY, -2 * H - 8, 0x4a3328);
  createTable(8, groundY, -2 * H + 8, 0x3a2a20);
  createTable(12, groundY, 2 * H - 12, 0x5a3a28);
  createChair(-12, groundY, -2 * H + 4);
  createChair(10, groundY, -2 * H - 10);
  createChair(14, groundY, 2 * H - 16);
  createBed(8, groundY, 2 * H + 8);
  createBed(-12, groundY, -2 * H - 12);
  createBookshelf(-6, groundY, 2 * H - 6);
  createBookshelf(2 * H + 8, groundY, 6);
  createBookshelf(-2 * H - 8, groundY, -10);
  createChest(0, groundY, 2 * H + 14);
  createChest(-2 * H + 12, groundY, 12);
  createPool(2 * H - 10, groundY, -2 * H - 10);
  createCabinet(-10, groundY, -2 * H - 14);
  createCabinet(2 * H + 12, groundY, -12);
  createRug(0, groundY, 0, 0x884422);
  createRug(2 * H, groundY, 2 * H, 0x226688);
  createLamp(-2 * H - 12, groundY, 2 * H + 12);
  createLamp(2 * H + 12, groundY, -2 * H - 12);
  createLamp(-2 * H - 12, groundY, -2 * H - 12);
  createObstacle(2 * H - 8, groundY, -10, 0x334444);
  createObstacle(2 * H + 10, groundY, 10, 0x443333);
  createObstacle(-2 * H + 8, groundY, 10, 0x333a44);
  createObstacle(-2 * H - 10, groundY, -8, 0x3a3344);
  createChair(-2 * H - 6, groundY, 8);

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
  ROOMS.forEach(function(rm) {
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
// 金色宝箱系统（原能量球）：答题解锁，开出3-5个能量碎片，30秒刷新
// ============================================================
function spawnEnergyOrb() {
  if (GS.gameOver || GS.energy >= (GS.energyMax || 5)) return;

  // 宝箱不能刷新在中间的房间内
  var eligibleRooms = ROOMS.filter(function(r) {
    return !(r.cx === 0 && r.cz === 0) && r !== lastEnergyOrbRoom;
  });
  if (eligibleRooms.length === 0) {
    eligibleRooms = ROOMS.filter(function(r) { return !(r.cx === 0 && r.cz === 0); });
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
  lastEnergyOrbRoom = targetRoom;
  showMessage("🎁 金色宝箱出现在" + targetRoom.name + "房间! 答题解锁", 0xffd700);

  // Boss刷新到宝箱所在的房间（不通知位置）
  spawnBossInRoom(targetRoom);
}

function consumeEnergyOrb() {
  if (!energyOrb) return;
  scene.remove(energyOrb);
  energyOrb = null;
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

function initMonsters() {
  monsters.forEach(function(m) { if (m.parent) scene.remove(m); });
  monsters = [];
  bosses.forEach(function(b) { if (b.parent) scene.remove(b); });
  bosses = [];

  var chd = currentChapterData();

  // 随机选一个非中央房间生成小怪
  var candidates = ROOMS.filter(function(r) { return !(r.cx === 0 && r.cz === 0); });
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
  var candidates = ROOMS.filter(function(r) { 
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

  // 每个房间随机刷新3-8个道具
  var maxCount = 3 + Math.floor(Math.random() * 6);
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
      // 同一房间内同一道具不能同时存在大于2个
      var allowed = ITEM_TYPES.filter(function (t) { return (typeCounts[t.id] || 0) < 2; });
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
    mesh.userData = {
      itemType: itemType,
      active: true,
      floatPhase: Math.random() * Math.PI * 2,
      rotSpeed: 1 + Math.random() * 0.5
    };
    scene.add(mesh);
    items.push(mesh);
  }
}

function updateItems(delta) {
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    if (!it.userData.active) continue;
    it.position.y = 1.0 + Math.sin(clock.elapsedTime * 2 + it.userData.floatPhase) * 0.2;
    it.rotation.y += delta * it.userData.rotSpeed;
    if (it.children.length > 2) {
      var ring = it.children[2];
      if (ring) ring.rotation.z += delta * 2;
    }
    if (player && player.position.distanceTo(it.position) < 1.5) {
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
      if (pickRoom) {
        (function (room) {
          // 普通道具刷新时间：10秒
          setTimeout(function () {
            spawnItemsInRoom(room);
          }, 10000);
        })(pickRoom);
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
  
  var flashlightEl = document.getElementById('flashlight-status');
  if (flashlightEl) {
    if (GS.hasFlashlight) {
      if (flashlightActive) {
        flashlightEl.textContent = '🔦 ' + Math.ceil(flashlightDuration) + 's';
        flashlightEl.style.color = '#ffff44';
      } else if (flashlightCooldown > 0) {
        flashlightEl.textContent = '🔦 冷却' + Math.ceil(flashlightCooldown) + 's';
        flashlightEl.style.color = '#888844';
      } else {
        flashlightEl.textContent = '🔦 就绪(按F)';
        flashlightEl.style.color = '#aaaa44';
      }
    } else {
      flashlightEl.textContent = '🔦 未获得';
      flashlightEl.style.color = '#555';
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
  var closest = null, closestDist = 999;
  allActive.forEach(function(m) {
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
    labelEl.textContent = '👾 ' + (t.name || '怪物') + ' HP: ' + Math.ceil(hp) + '/' + maxHp;
    monsterHpEl.style.display = 'block';
  } else {
    monsterHpEl.style.display = 'none';
  }
}