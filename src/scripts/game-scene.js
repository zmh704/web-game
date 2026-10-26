// ============================================================
// NOTE: Most scene logic has moved to src/systems/*.js.
// This file now mainly holds initScene(), global state, and helpers.
// The system modules are loaded before this file and assign their
// functions to window.* for backward compatibility.
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
// 基础移速统一从 BALANCE 读取（技能期间会被临时改写为疾风冲刺速度）
var BASE_MOVE_SPEED = (typeof BALANCE !== 'undefined' && BALANCE.player) ? BALANCE.player.baseSpeed : 5;
var moveSpeed = BASE_MOVE_SPEED;
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
  escapeBoostTimer: 0,   // 挣脱后的加速逃跑窗口
  capturedAt: 0          // 被抓时刻（用于"兜底自动挣脱"计时）
};
var chaserLeaveTimer = 0;      // 抓捕者离开计时器
var CHASER_LEAVE_DURATION = 60; // 60秒后自动离开
var CHASER_RESPAWN_DELAY = 30;  // 离开后30秒重新生成

// ============================================================
// 初始化场景
// ============================================================
function initScene() {
  var loading = document.getElementById('loading');
  scene = new THREE.Scene();
  // 同步到 window 供联机同步模块使用
  window.scene = scene;
  // 雾距交给 NightSystem 统一管理（夜晚 ~19 米 / 开手电筒 ~52 米），
  // 这里只给个占位，buildRoom 里会立刻被 applyNightFog 覆盖
  scene.background = null;
  scene.fog = new THREE.Fog(0x0a1020, 5, 19);

  camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 120);
  camera.position.set(0, 5, 10);
  // 同步到 window 供联机模块使用
  window.camera = camera;

  // alpha: true —— 天空由 CSS 渐变负责绘制，避免背景色被 ACES 色调映射压成灰白
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', alpha: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.96;
  if (THREE.SRGBColorSpace !== undefined) renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.body.appendChild(renderer.domElement);

  clock = new THREE.Clock();

  // ============================================================
  // 光照：半球光打底 + 暖主光 + 冷补光，形成明确的明暗层次
  // ============================================================
  var theme = VX.palette.theme(GS.chapter);

  // 环境反射：让金属/光滑材质有真实的反射层次
  try {
    scene.environment = VX.materials.envMap(theme.sky, theme.groundDark);
    // 新版 three 支持直接压 IBL 强度；老版本已被 envMap 自身的压暗兜住
    if ('environmentIntensity' in scene) scene.environmentIntensity = 0.75;
  } catch (e) { /* 环境贴图不可用时静默降级 */ }

  // 半球光：天空色用于照亮朝上的面（地面！），所以不能用浅蓝，
  // 否则绿地面会被染成灰薄荷色。这里用接近中性的暖白，靠强度控制层次
  var hemi = new THREE.HemisphereLight(0xf2f6ee, theme.groundDark, 0.34);
  hemi.position.set(0, 12, 0);
  scene.add(hemi);

  var dirLight = new THREE.DirectionalLight(0xfff4e0, 1.05);
  dirLight.position.set(14, 20, 10);
  dirLight.castShadow = true;
  // 阴影贴图从 2048² 降到 1024²：像素量减少 75%。
  // 配合小怪不投影，阴影 pass 的开销能压掉一大半，
  // 而这个场景的阴影精度 1024² 完全够用，肉眼几乎无差别。
  dirLight.shadow.mapSize.width = 1024;
  dirLight.shadow.mapSize.height = 1024;
  dirLight.shadow.camera.near = 1;
  dirLight.shadow.camera.far = 70;
  dirLight.shadow.camera.left = -26;
  dirLight.shadow.camera.right = 26;
  dirLight.shadow.camera.top = 26;
  dirLight.shadow.camera.bottom = -26;
  dirLight.shadow.bias = -0.0008;
  dirLight.shadow.normalBias = 0.02;
  scene.add(dirLight);
  dirLight.target.position.set(0, 0, 0);
  scene.add(dirLight.target);

  var fillLight = new THREE.DirectionalLight(0x9ec8e8, 0.26);
  fillLight.position.set(-12, 9, -14);
  scene.add(fillLight);

  // 暖色轮廓光，让角色从背景中脱离出来
  var rimLight = new THREE.DirectionalLight(0xffd9a0, 0.22);
  rimLight.position.set(-6, 5, 12);
  scene.add(rimLight);

  window.GAME_LIGHTS = { hemi: hemi, dir: dirLight, fill: fillLight, rim: rimLight };

  // 把上面那套"白天"的灯压成月光（见 NightSystem）
  if (typeof applyNightLights === 'function') applyNightLights();

  buildRoom();
  createPlayer();
  initPlayerAnimation();

  // 预热战斗特效层（提前建好复用点光源，见 VX.vfx.ensureLight）
  if (window.VX && VX.vfx) VX.vfx.ensureLight();

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


  document.getElementById('char-name').textContent = characterName(GS.character);

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

  // 夜晚开局提示：不说明的话玩家会以为是屏幕太暗/渲染出错
  setTimeout(function () {
    if (typeof showMessage === 'function') {
      showMessage(IS_TOUCH ? '🌙 天黑了，点右下角 🔦 照亮更远' : '🌙 天黑了，按 F 打开手电筒照亮更远', 0xbfd0ff);
    }
  }, 900);

  animate();
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

  // 墙体碰撞：上面那段只保证"待在某个房间矩形里"，但 9 个房间是紧挨着铺满
  // -60..60 的、相邻房间边界重合，所以它拦不住任何内墙。
  // 真正挡墙的是这里 —— 只能从门洞穿过去。
  if (typeof resolveWallCollision === 'function') {
    var _pr = (player.userData.radius || 0.4) * (player.scale.x || 1);
    resolveWallCollision(player.position, _pr, player.position.y);
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
  // 伪装者：只在现形后显示血条 —— 伪装状态挂着「伪装者」血条等于自报身份
  if (typeof getImpostorTargets === 'function') {
    allActive = allActive.concat(getImpostorTargets(true));
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
    if (labelEl) labelEl.textContent = (t.name || '怪物') + '  ' + Math.ceil(hp) + '/' + maxHp;
    monsterHpEl.style.display = 'block';
  } else {
    monsterHpEl.style.display = 'none';
  }
}

// 导出到全局
window.initScene = initScene;
window.roomIndexOf = roomIndexOf;
window.inPlayArea = inPlayArea;
window.clampPlayer = clampPlayer;
window.setTargetMonster = setTargetMonster;
window.updateMonsterHPBar = updateMonsterHPBar;
window.captureState = captureState;
