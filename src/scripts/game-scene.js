// ============================================================
// Three.js 场景
// ============================================================
var scene, camera, renderer, clock, player;
var monsters = []; // 替换单个monster对象
var bosses = []; // 新增Boss数组
var keys = {}, mouse = { x: 0, y: 0 }, targetMouse = { x: 0, y: 0 }, isPointerLocked = false;
var walls = [], projectiles = [];
var attackCooldown = 0;
var hitFlash = 0, monsterHitFlash = 0;
var roomSize = 20, halfRoom = 10;
var ROOMS = [
  { cx: 0, cz: 0, name: '中央' },
  { cx: 0, cz: -20, name: '北' },
  { cx: 20, cz: 0, name: '东' },
  { cx: 0, cz: 20, name: '南' },
  { cx: -20, cz: 0, name: '西' }
];
var DOOR_HALF = 1.8;
var DOOR_POS = { 1: { x: 0, z: -10 }, 2: { x: 10, z: 0 }, 3: { x: 0, z: 10 }, 4: { x: -10, z: 0 } };
function roomIndexOf(x, z) {
  var best = 0, bd = 1e9;
  for (var i = 0; i < ROOMS.length; i++) {
    var d = Math.abs(x - ROOMS[i].cx) + Math.abs(z - ROOMS[i].cz);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}
var ship = null, energyOrb = null, lastEnergyOrbRoom = null; // 新增 lastEnergyOrbRoom
var moveSpeed = 5;
var gravity = -12;
var playerVelY = 0;
var groundY = 0;
var furniture = [];
var doorObjects = [];
var obstacles = [];
var secondRoomObjects = [];

// 初始化场景（由game-main.js中的init调用）
function initScene() {
  var loading = document.getElementById('loading');
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a2e);
  scene.fog = new THREE.Fog(0x1a1a2e, 25, 40);

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
  initMonsters(); // 初始化所有小怪物
  spawnEnergyOrb();
  spawnItems();
  buildWeaponBar();

  AudioMgr.init();

  // 能量球刷新现在由spawnEnergyOrb内部的逻辑控制，不再单独延迟调用

  document.getElementById('char-name').textContent = GS.character === 'qike' ? '奇奇' : '妙妙';

  window.addEventListener('resize', function () {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
  document.addEventListener('keydown', function (e) {
    keys[e.key.toLowerCase()] = true;
    if (e.key === ' ') { e.preventDefault(); tryJump(); }
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

  // 显示 HUD
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
  scene.background = new THREE.Color(chapterData.bgColor);
  scene.fog = new THREE.Fog(chapterData.fogColor, 12, 30);

  var floorMat = new THREE.MeshStandardMaterial({ color: chapterData.floorColor, roughness: 0.92, metalness: 0.05 });
  var wallMat = new THREE.MeshStandardMaterial({ color: chapterData.wallColor, roughness: 0.95, side: THREE.DoubleSide, transparent: true, opacity: 0.6, depthWrite: false });

  ROOMS.forEach(function (rm) {
    var floor = new THREE.Mesh(new THREE.PlaneGeometry(roomSize, roomSize), floorMat);
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
    floor.position.set(rm.cx, groundY, rm.cz);
    scene.add(floor);
    var grid = new THREE.GridHelper(roomSize, 10, 0x1c232e, 0x141a22);
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

  createTable(-4, groundY, -2 * H - 4, 0x4a3328);
  createTable(4, groundY, -2 * H + 4, 0x3a2a20);
  createTable(6, groundY, 2 * H - 6, 0x5a3a28);
  createChair(-6, groundY, -2 * H + 2);
  createChair(5, groundY, -2 * H - 5);
  createChair(7, groundY, 2 * H - 8);
  createBed(4, groundY, 2 * H + 4);
  createBed(-6, groundY, -2 * H - 6);
  createBookshelf(-3, groundY, 2 * H - 3);
  createBookshelf(2 * H + 4, groundY, 3);
  createBookshelf(-2 * H - 4, groundY, -5);
  createChest(0, groundY, 2 * H + 7);
  createChest(-2 * H + 6, groundY, 6);
  createPool(2 * H - 5, groundY, -2 * H - 5);
  createCabinet(-5, groundY, -2 * H - 7);
  createCabinet(2 * H + 6, groundY, -6);
  createRug(0, groundY, 0, 0x884422);
  createRug(2 * H, groundY, 2 * H, 0x226688);
  createLamp(-2 * H - 6, groundY, 2 * H + 6);
  createLamp(2 * H + 6, groundY, -2 * H - 6);
  createLamp(-2 * H - 6, groundY, -2 * H - 6);
  createObstacle(2 * H - 4, groundY, -5, 0x334444);
  createObstacle(2 * H + 5, groundY, 5, 0x443333);
  createObstacle(-2 * H + 4, groundY, 5, 0x333a44);
  createObstacle(-2 * H - 5, groundY, -4, 0x3a3344);
  createChair(-2 * H - 3, groundY, 4);

  createShip();
  addChapterDecorations(chapterData);
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
    if (idx === 0) { positions.push([rm.cx - 7, rm.cz - 7], [rm.cx + 7, rm.cz + 7]); }
    else { positions.push([rm.cx - 6, rm.cz - 6], [rm.cx + 6, rm.cz + 5], [rm.cx - 4, rm.cz + 7]); }
  });
  positions.forEach(function (pos) {
    var deco = new THREE.Group();
    if (chd.id === 1) {
      var trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 1.2, 6), new THREE.MeshStandardMaterial({ color: 0x6B4E3C, roughness: 0.8 }));
      trunk.position.y = 0.6; trunk.castShadow = true; deco.add(trunk);
      var crown = new THREE.Mesh(new THREE.ConeGeometry(0.8, 1.5, 8), new THREE.MeshStandardMaterial({ color: 0x2a8a3a, roughness: 0.7 }));
      crown.position.y = 1.8; crown.castShadow = true; deco.add(crown);
      var crown2 = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.1, 8), new THREE.MeshStandardMaterial({ color: 0x35a045, roughness: 0.7 }));
      crown2.position.y = 2.3; deco.add(crown2);
    } else if (chd.id === 2) {
      [[0, 0.8, 0, 0.4, 1.6], [0.4, 0.5, 0.2, 0.25, 1.0], [-0.35, 0.4, -0.15, 0.2, 0.8]].forEach(function (c) {
        var ice = new THREE.Mesh(new THREE.ConeGeometry(c[3], c[4], 5), new THREE.MeshStandardMaterial({ color: 0x88ccff, transparent: true, opacity: 0.75, roughness: 0.15, emissive: 0x4499dd, emissiveIntensity: 0.15 }));
        ice.position.set(c[0], c[1], c[2]); ice.rotation.z = (Math.random() - 0.5) * 0.3; ice.castShadow = true; deco.add(ice);
      });
    } else if (chd.id === 3) {
      var pyramid = new THREE.Mesh(new THREE.ConeGeometry(1.0, 1.4, 4), new THREE.MeshStandardMaterial({ color: 0xcc9944, roughness: 0.9 }));
      pyramid.position.y = 0.7; pyramid.rotation.y = Math.PI / 4; pyramid.castShadow = true; deco.add(pyramid);
      var tip = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.25, 4), new THREE.MeshStandardMaterial({ color: 0xffd700, emissive: 0xffd700, emissiveIntensity: 0.4 }));
      tip.position.y = 1.5; tip.rotation.y = Math.PI / 4; deco.add(tip);
    } else if (chd.id === 4) {
      var rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.6), new THREE.MeshStandardMaterial({ color: 0x442222, roughness: 0.9 }));
      rock.position.y = 0.5; rock.castShadow = true; deco.add(rock);
      var lava = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 6), new THREE.MeshStandardMaterial({ color: 0xff4400, emissive: 0xff3300, emissiveIntensity: 0.8 }));
      lava.position.y = 0.95; deco.add(lava);
    } else {
      var crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.5), new THREE.MeshStandardMaterial({ color: 0xaa66ff, transparent: true, opacity: 0.8, emissive: 0x8844dd, emissiveIntensity: 0.4, roughness: 0.2 }));
      crystal.position.y = 1.0; crystal.castShadow = true; deco.add(crystal);
      var base = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 0.3, 6), new THREE.MeshStandardMaterial({ color: 0x333355, roughness: 0.8 }));
      base.position.y = 0.15; deco.add(base);
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
  var g = new THREE.Group();
  var tableMat = new THREE.MeshStandardMaterial({ color: color || 0x8B5E3C, roughness: 0.6 });
  // 加大桌面
  var top = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.1, 1.4), tableMat);
  top.position.y = 0.7; top.castShadow = true; top.receiveShadow = true; g.add(top);
  // 桌腿
  [-0.8, 0.8].forEach(function (px) {
    [-0.5, 0.5].forEach(function (pz) {
      var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.65, 6), tableMat);
      leg.position.set(px, 0.35, pz); g.add(leg);
    });
  });
  // 花瓶和花
  var vase = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.2, 8), new THREE.MeshStandardMaterial({ color: 0x4488ff, roughness: 0.5 }));
  vase.position.set(0.5, 0.8, 0.2); g.add(vase);
  var flower = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), new THREE.MeshStandardMaterial({ color: 0xff88aa, emissive: 0xff88aa, emissiveIntensity: 0.2 }));
  flower.position.set(0.5, 1.0, 0.2); g.add(flower);
  // 桌子上放一本书
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

// 新增：泳池
function createPool(x, y, z) {
  var g = new THREE.Group();
  var poolMat = new THREE.MeshStandardMaterial({ color: 0x556677, roughness: 0.3, metalness: 0.5 });
  // 外框
  var frame = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.2, 1.8), poolMat);
  frame.position.y = 0.1; frame.castShadow = true; frame.receiveShadow = true; g.add(frame);
  // 水面
  var water = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.05, 1.4),
    new THREE.MeshStandardMaterial({ color: 0x3399dd, roughness: 0.1, metalness: 0.8, transparent: true, opacity: 0.7 }));
  water.position.y = 0.25; g.add(water);
  // 水光
  var glow = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.02, 1.2),
    new THREE.MeshBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.15 }));
  glow.position.y = 0.28; g.add(glow);
  g.position.set(x, y, z); scene.add(g); furniture.push(g);
}

// 新增：柜子
function createCabinet(x, y, z) {
  var g = new THREE.Group();
  var cabMat = new THREE.MeshStandardMaterial({ color: 0x6B4E3C, roughness: 0.7 });
  var body = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.4, 0.6), cabMat);
  body.position.y = 0.7; body.castShadow = true; body.receiveShadow = true; g.add(body);
  // 门
  var doorMat = new THREE.MeshStandardMaterial({ color: 0x5A3D2C, roughness: 0.6 });
  var door = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.1, 0.04), doorMat);
  door.position.set(0.25, 0.7, 0.33); g.add(door);
  var door2 = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.1, 0.04), doorMat);
  door2.position.set(-0.25, 0.7, 0.33); g.add(door2);
  // 把手
  var handleMat = new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.7, roughness: 0.3 });
  var h1 = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), handleMat);
  h1.position.set(0.25, 0.7, 0.36); g.add(h1);
  var h2 = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), handleMat);
  h2.position.set(-0.25, 0.7, 0.36); g.add(h2);
  g.position.set(x, y, z); scene.add(g); furniture.push(g);
}

// 新增：地毯
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

// 新增：火把/灯柱
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
// 能量球系统
// ============================================================
function spawnEnergyOrb() {
  if (GS.gameOver || GS.energy >= (GS.energyMax || 5)) return;

  // 能量球不能连续刷新在同一个房间内
  var eligibleRooms = ROOMS.filter(function(r) { return r !== lastEnergyOrbRoom; });
  if (eligibleRooms.length === 0) eligibleRooms = ROOMS;
  var targetRoom = eligibleRooms[Math.floor(Math.random() * eligibleRooms.length)];
  
  var x = targetRoom.cx + (Math.random() - 0.5) * (roomSize - 6);
  var z = targetRoom.cz + (Math.random() - 0.5) * (roomSize - 6);

  // 避免在中央房间的飞船附近生成
  if (targetRoom.cx === 0 && targetRoom.cz === 0) {
    if (Math.abs(x) < 3.5) x = x < 0 ? -5 : 5;
    if (Math.abs(z) < 3.5) z = z < 0 ? -5 : 5;
  }

  var orb = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 14),
    new THREE.MeshStandardMaterial({ color: 0xffd700, emissive: 0xffd700, emissiveIntensity: 0.7, transparent: true, opacity: 0.9 }));
  orb.position.set(x, 1.2, z);
  var glow = new THREE.Mesh(new THREE.SphereGeometry(0.85, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xffd700, transparent: true, opacity: 0.12, side: THREE.DoubleSide }));
  orb.add(glow);
  var beam = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.3, 8, 8, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd700, transparent: true, opacity: 0.15, side: THREE.DoubleSide }));
  beam.position.y = 3.5; orb.add(beam);
  orb.userData = { active: true, cooldown: 0, floatPhase: Math.random() * Math.PI * 2 };
  scene.add(orb);
  energyOrb = orb;
  lastEnergyOrbRoom = targetRoom; // 记录上次能量球刷新的房间
  showMessage("💫 能量球出现了! 查看小地图", 0xffd700);
}

function consumeEnergyOrb() {
  if (!energyOrb) return;
  scene.remove(energyOrb);
  energyOrb = null;
  if (GS.energy < (GS.energyMax || 5)) {
    // 能量球刷新逻辑：3秒后刷新，确保不在同一个房间连续刷新
    setTimeout(spawnEnergyOrb, 3000);
  }
}

// ============================================================
// 章节Boss：开局常驻一个非中央房间，击败后掉落能量且不复活
// ============================================================
function spawnChapterBoss() {
  var chd = currentChapterData();
  var t = BOSSES[chd.id] || BOSSES[1];

  // 随机选一个非中央房间常驻
  var candidates = ROOMS.filter(function (r) { return !(r.cx === 0 && r.cz === 0); });
  var room = candidates[Math.floor(Math.random() * candidates.length)];

  var g = buildMonsterMesh(t);
  if (t.scale && t.scale !== 1) g.scale.setScalar(t.scale);

  var x = room.cx + (Math.random() - 0.5) * (roomSize - 6);
  var z = room.cz + (Math.random() - 0.5) * (roomSize - 6);
  g.position.set(x, groundY, z);
  scene.add(g);

  g.userData = {
    radius: 0.9 * (t.scale || 1),
    active: true,
    walkPhase: 0,
    type: t,
    isBoss: true,
    speedMul: 1,
    rangedTimer: 2.5,
    bossPhase: 3,
    homeRoom: room, // 记录Boss的常驻房间
    returnHomeTimer: 0,
    lastAttackedTime: clock.elapsedTime,
    respawnTimer: 0 // Boss一次性，不复活
  };
  g.userData.hp = t.hp;

  bosses.push(g);
  showMessage("👑 " + t.name + " 盘踞在" + room.name + "房间! 击败它可获得能量!", 0xff4444);
}

// 初始化所有房间的小怪物
function initMonsters() {
  monsters.forEach(function(m) { if (m.parent) scene.remove(m); });
  monsters = [];
  bosses.forEach(function(b) { if (b.parent) scene.remove(b); });
  bosses = [];

  var chd = currentChapterData();
  var monsterTypes = chd.monsters; // 获取本章节的小怪类型列表
  if (monsterTypes.length === 0) monsterTypes = ["追风怪"]; // 确保至少有一种小怪

  ROOMS.forEach(function (rm, index) {
    // 每个房间随机选择一个小怪类型
    var monsterType = monsterTypes[index % monsterTypes.length]; 
    var t = MONSTER_TYPES[monsterType] || MONSTER_TYPES["追风怪"];

    var g = buildMonsterMesh(t);
    if (t.scale && t.scale !== 1) g.scale.setScalar(t.scale);
    
    var x = rm.cx + (Math.random() - 0.5) * (roomSize - 6);
    var z = rm.cz + (Math.random() - 0.5) * (roomSize - 6);
    g.position.set(x, groundY, z);
    scene.add(g);

    g.userData = {
      radius: 0.9 * (t.scale || 1),
      active: true,
      walkPhase: 0,
      type: t,
      baseType: t, // 原始模板，重生时基于它计算时间增强
      isBoss: false,
      speedMul: 1,
      homeRoom: rm, // 记录小怪的初始房间
      returnHomeTimer: 0,
      lastAttackedTime: clock.elapsedTime,
      respawnTimer: 0 // 1分钟后刷新
    };
    g.userData.hp = t.hp;
    monsters.push(g);
  });

  // 清理上局残留的能量碎片
  if (typeof fragmentDrops !== 'undefined') {
    fragmentDrops.forEach(function (f) { if (f.parent) scene.remove(f); });
    fragmentDrops.length = 0;
  }

  // 章节Boss常驻一个非中央房间
  spawnChapterBoss();
}

// ============================================================
// 道具系统 - 每个房间随机刷新
// ============================================================
var items = []; // 场景中的道具列表

// 道具类型定义
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
    desc: '随机获得一把新武器',
    apply: function () {
      var lockedW = WEAPON_LIST.filter(function (n) { return !GS.weapons[n] });
      if (lockedW.length > 0) {
        var wn = lockedW[Math.floor(Math.random() * lockedW.length)];
        GS.weapons[wn] = WEAPONS[wn];
        GS.weaponCount++;
        if (!GS.curWeapon) GS.curWeapon = wn;
        updateWeaponBar();
        showMessage('⚔️ 获得武器: ' + wn, 0xff8800);
        createWeaponGetEffect();
      } else {
        GS.stars += 20;
        showMessage('⭐ 已拥有全部武器! +20星', 0xffd700);
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
  }
];

// 生成漂浮道具的3D模型
function buildItemMesh(itemType) {
  var g = new THREE.Group();
  var color = itemType.color;

  // 核心球体
  var core = new THREE.Mesh(
    new THREE.SphereGeometry(0.35, 10, 10),
    new THREE.MeshStandardMaterial({
      color: color, emissive: color, emissiveIntensity: 0.5,
      transparent: true, opacity: 0.9
    })
  );
  g.add(core);

  // 外发光
  var glow = new THREE.Mesh(
    new THREE.SphereGeometry(0.55, 8, 8),
    new THREE.MeshBasicMaterial({
      color: color, transparent: true, opacity: 0.15, side: THREE.DoubleSide
    })
  );
  g.add(glow);

  // 环
  var ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.45, 0.025, 6, 16),
    new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.5 })
  );
  ring.rotation.x = Math.PI / 2;
  g.add(ring);

  // 图标标识（用小几何体表示类型）
  var iconMesh;
  switch (itemType.id) {
    case 'hpPotion': // 十字
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
    case 'speedBoots': // 三角形箭头
      iconMesh = new THREE.Mesh(
        new THREE.ConeGeometry(0.12, 0.15, 3),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      iconMesh.position.y = 0.05;
      iconMesh.rotation.y = Math.PI / 2;
      g.add(iconMesh);
      break;
    case 'weapon': // 小方块
      iconMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.1, 0.1),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      iconMesh.position.y = 0.05;
      g.add(iconMesh);
      break;
    case 'atkGem': // 八面体
      iconMesh = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.1),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      iconMesh.position.y = 0.05;
      g.add(iconMesh);
      break;
    case 'defGem': // 六面体
      iconMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.12, 0.12),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      iconMesh.position.y = 0.05;
      g.add(iconMesh);
      break;
  }

  return g;
}

// 在房间中随机刷新道具
function spawnItems() {
  // 清除旧道具
  items.forEach(function (it) {
    if (it.parent) scene.remove(it);
  });
  items = [];

  // 在每个房间最多生成2个道具
  ROOMS.forEach(function (rm) {
    spawnItemsInRoom(rm);
  });
}

// 在指定房间生成道具（最多2个）
function spawnItemsInRoom(rm) {
  // 计算该房间内已有的道具数量
  var existingCount = 0;
  items.forEach(function (it) {
    if (Math.abs(it.position.x - rm.cx) < roomSize / 2 && Math.abs(it.position.z - rm.cz) < roomSize / 2) {
      existingCount++;
    }
  });

  var maxCount = 2;
  var spawnCount = maxCount - existingCount;
  if (spawnCount <= 0) return;

  for (var i = 0; i < spawnCount; i++) {
    // 中央房间: 第一个道具固定为武器
    var itemType;
    if (rm.cx === 0 && rm.cz === 0 && existingCount === 0 && i === 0) {
      // 找出武器类型
      var weaponType = null;
      for (var wt = 0; wt < ITEM_TYPES.length; wt++) {
        if (ITEM_TYPES[wt].id === 'weapon') { weaponType = ITEM_TYPES[wt]; break; }
      }
      itemType = weaponType || ITEM_TYPES[Math.floor(Math.random() * ITEM_TYPES.length)];
    } else {
      itemType = ITEM_TYPES[Math.floor(Math.random() * ITEM_TYPES.length)];
    }
    var x = rm.cx + (Math.random() - 0.5) * (roomSize - 6);
    var z = rm.cz + (Math.random() - 0.5) * (roomSize - 6);
    // 避免在中央房间的飞船附近生成
    if (rm.cx === 0 && rm.cz === 0) {
      if (Math.abs(x) < 4) x = x < 0 ? -5 : 5;
      if (Math.abs(z) < 4) z = z < 0 ? -5 : 5;
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

// 更新道具动画和拾取检测（在update循环中调用）
function updateItems(delta) {
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    if (!it.userData.active) continue;
    // 漂浮动画
    it.position.y = 1.0 + Math.sin(clock.elapsedTime * 2 + it.userData.floatPhase) * 0.2;
    it.rotation.y += delta * it.userData.rotSpeed;
    // 围绕环旋转
    if (it.children.length > 2) {
      var ring = it.children[2];
      if (ring) ring.rotation.z += delta * 2;
    }
    // 拾取检测
    if (player && player.position.distanceTo(it.position) < 1.5) {
      var itemType = it.userData.itemType;
      itemType.apply();
      // 拾取特效
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
      // 记录拾取位置所在的房间
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
      // 30秒后仅在该房间补充道具（最多2个）
      if (pickRoom) {
        (function (room) {
          setTimeout(function () {
            spawnItemsInRoom(room);
          }, 30000);
        })(pickRoom);
      }
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
    btn.innerHTML = '<span class="icon">' + w.icon + '</span>' + name;
    btn.dataset.weapon = name;
    btn.onclick = function () { if (GS.weapons[name] && !GS.gameOver) selectWeapon(name) };
    bar.appendChild(btn);
  });
  updateWeaponBar();
}

function updateWeaponBar() {
  var btns = document.querySelectorAll('.weapon-btn');
  btns.forEach(function (btn) {
    var n = btn.dataset.weapon;
    btn.className = 'weapon-btn' + (GS.weapons[n] ? (GS.curWeapon === n ? ' active' : '') : ' locked');
  });
}

function selectWeapon(name) {
  GS.curWeapon = name;
  updateWeaponBar();
  showMessage('⚔️ 切换 ' + name, 0x4488ff);
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
  // 玩家登船：站到飞船中心，起飞时跟随飞船一起升空
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

    // 玩家跟随飞船一起升空
    if (player) {
      player.position.x = ship.position.x;
      player.position.z = ship.position.z;
      player.position.y = ship.position.y + PLAYER_SHIP_OFFSET;
      player.rotation.y += 0.05;
    }

    // 镜头跟随升空过程：从后下方仰望带着玩家起飞的飞船
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
    if (Math.abs(x - ROOMS[i].cx) < halfRoom - r && Math.abs(z - ROOMS[i].cz) < halfRoom - r) return true;
  }
  var G = DOOR_HALF;
  if (Math.abs(x) < G - r && Math.abs(Math.abs(z) - halfRoom) < 2.2) return true;
  if (Math.abs(z) < G - r && Math.abs(Math.abs(x) - halfRoom) < 2.2) return true;
  return false;
}

function clampPlayer() {
  var r = 0.4, p = player.position;
  var lv = player.userData.lastValid;
  if (!lv) { lv = { x: 0, z: -6 }; player.userData.lastValid = lv; }
  if (inPlayArea(p.x, p.z, r)) { lv.x = p.x; lv.z = p.z; return; }
  if (inPlayArea(p.x, lv.z, r)) { p.z = lv.z; lv.x = p.x; return; }
  if (inPlayArea(lv.x, p.z, r)) { p.x = lv.x; lv.z = p.z; return; }
  p.x = lv.x; p.z = lv.z;
}