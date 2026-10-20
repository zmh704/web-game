// ============================================================
// 角色元数据
//
// 三个角色的名字/图标散落在 scene、quiz、network、sync 好几处，
// 原来都是 `GS.character === 'qike' ? '奇奇' : '妙妙'` 这样的三元表达式，
// 加第三个角色时必然漏改。统一收口到这里。
// ============================================================
var CHARACTER_NAMES = { qike: '奇奇', miaomiao: '妙妙', baba: '爸爸' };
var CHARACTER_ICONS = { qike: '👦', miaomiao: '👧', baba: '👨' };
/** 联机时队友脚下的高亮光环颜色 */
var CHARACTER_AURA = { qike: 0x44ff88, miaomiao: 0xcc66ff, baba: 0xff9a3c };

function characterName(id) {
  return CHARACTER_NAMES[id] || CHARACTER_NAMES.qike;
}

function characterIcon(id) {
  return CHARACTER_ICONS[id] || CHARACTER_ICONS.qike;
}

// ============================================================
// 绘制角色头像 - 奇奇(男孩) / 妙妙(女孩) / 爸爸 差异化设计
// gender: 'boy' | 'girl' | 'dad'
// ============================================================
function drawAvatar(id, gender, bodyColor, hatColor) {
  var c = document.getElementById(id);
  if (!c || !c.getContext) return;
  var ctx = c.getContext('2d');
  var W = c.width || 120, H = c.height || 140;

  // 统一在 120x140 的设计坐标系里作画，再按画布实际尺寸缩放。
  // 原来坐标写死 120x140，但 HUD 里的小头像画布只有 60x70，会被裁掉大半。
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  ctx.scale(W / 120, H / 140);

  var isGirl = gender === 'girl';
  var isDad = gender === 'dad';
  var isBoy = !isGirl && !isDad;
  var skin = '#ffd3a8';
  var skinShade = isDad ? '#e8a878' : '#f0b184';
  var hair = isBoy ? '#5a3a24' : (isDad ? '#4a3527' : '#6b3f57');
  var hairLight = isBoy ? '#7a5232' : (isDad ? '#6b5340' : '#8a5570');

  function ell(x, y, rx, ry, rot) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rot || 0, 0, Math.PI * 2);
  }
  function rr(x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ---------- 地面投影 ----------
  ctx.fillStyle = 'rgba(70, 95, 70, 0.10)';
  ell(60, 136, 36, 5.5); ctx.fill();

  // ---------- 女生长辫（在最底层）----------
  if (isGirl) {
    ctx.fillStyle = hair;
    rr(15, 50, 13, 48, 6.5); ctx.fill();
    rr(92, 50, 13, 48, 6.5); ctx.fill();
  }

  // ---------- 上衣（半身像，底部出血到画布外）----------
  ctx.fillStyle = bodyColor;
  rr(14, 104, 92, 46, 26); ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.20)';
  ell(60, 118, 30, 15); ctx.fill();

  // ---------- 脖子 ----------
  ctx.fillStyle = skinShade;
  rr(50, 84, 20, 26, 9); ctx.fill();

  // ---------- 领口 ----------
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.beginPath();
  ctx.moveTo(39, 104);
  ctx.quadraticCurveTo(60, 125, 81, 104);
  ctx.quadraticCurveTo(60, 113, 39, 104);
  ctx.fill();

  // ---------- 后发底色 ----------
  ctx.fillStyle = hair;
  ell(60, 56, 33, 33); ctx.fill();

  // ---------- 耳朵 ----------
  ctx.fillStyle = skin;
  ell(25, 62, 7.5, 9); ctx.fill();
  ell(95, 62, 7.5, 9); ctx.fill();

  // ---------- 脸 ----------
  var faceGrad = ctx.createRadialGradient(48, 47, 5, 60, 62, 42);
  faceGrad.addColorStop(0, '#ffe7ca');
  faceGrad.addColorStop(1, skin);
  ctx.fillStyle = faceGrad;
  ell(60, 62, 31.5, 30); ctx.fill();

  // ---------- 刘海 ----------
  ctx.fillStyle = hair;
  ctx.beginPath();
  ctx.moveTo(28, 54);
  ctx.quadraticCurveTo(33, 26, 60, 26);
  ctx.quadraticCurveTo(87, 26, 92, 54);
  ctx.quadraticCurveTo(82, 40, 69, 45);
  ctx.quadraticCurveTo(59, 48, 50, 43);
  ctx.quadraticCurveTo(38, 45, 28, 54);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = hairLight;
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(43, 35); ctx.quadraticCurveTo(50, 31, 57, 34); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(66, 32); ctx.quadraticCurveTo(74, 31, 80, 37); ctx.stroke();

  // ---------- 帽子：圆顶 + 帽箍 + 帽徽 ----------
  ctx.fillStyle = hatColor;
  ctx.beginPath();
  ctx.arc(60, 44, 33, Math.PI, Math.PI * 2);
  ctx.closePath();
  ctx.fill();

  // 帽底暗边，让圆顶有体积
  ctx.save();
  ctx.beginPath();
  ctx.arc(60, 44, 33, Math.PI, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.13)';
  ctx.fillRect(20, 34, 80, 12);
  ctx.restore();

  ctx.fillStyle = '#fff6e6';
  rr(27, 37, 66, 8, 4); ctx.fill();

  ctx.fillStyle = '#ffd166';
  ell(60, 22, 6.6, 6.6); ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ell(57.8, 19.8, 2.1, 2.1); ctx.fill();

  // ---------- 眼睛 ----------
  function eye(cx) {
    ctx.fillStyle = '#ffffff';
    ell(cx, 62, 9.5, 10.5); ctx.fill();
    ctx.fillStyle = '#3b2a1e';
    ell(cx, 64, 6.6, 7.6); ctx.fill();
    ctx.fillStyle = '#1b120c';
    ell(cx, 64.5, 3.4, 4.2); ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ell(cx - 2.6, 59.5, 2.8, 2.8); ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ell(cx + 2.4, 67.5, 1.5, 1.5); ctx.fill();
  }
  eye(47);
  eye(73);

  // ---------- 爸爸：眼镜 ----------
  if (isDad) {
    ctx.strokeStyle = '#3a2f28';
    ctx.lineWidth = 2;
    rr(37, 53, 21, 18, 5); ctx.stroke();
    rr(62, 53, 21, 18, 5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(58, 60); ctx.lineTo(62, 60); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(37, 58); ctx.lineTo(29, 55); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(83, 58); ctx.lineTo(91, 55); ctx.stroke();
  }

  // ---------- 鼻子 ----------
  ctx.fillStyle = skinShade;
  ell(60, 70, 3.4, 2.6); ctx.fill();

  // ---------- 爸爸：络腮胡（画在嘴之前，嘴角不会被盖住）----------
  if (isDad) {
    ctx.fillStyle = hair;
    ctx.beginPath();
    ctx.moveTo(30, 58);
    ctx.quadraticCurveTo(30, 92, 60, 98);
    ctx.quadraticCurveTo(90, 92, 90, 58);
    ctx.lineTo(84, 60);
    ctx.quadraticCurveTo(84, 84, 60, 89);
    ctx.quadraticCurveTo(36, 84, 36, 60);
    ctx.closePath();
    ctx.fill();
  }

  // ---------- 微笑 ----------
  ctx.strokeStyle = '#a8543c';
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(52, 76);
  ctx.quadraticCurveTo(60, 83, 68, 76);
  ctx.stroke();

  // ---------- 腮红 ----------
  ctx.fillStyle = 'rgba(255, 130, 120, 0.32)';
  ell(37, 73, 7, 4.2); ctx.fill();
  ell(83, 73, 7, 4.2); ctx.fill();

  // ---------- 爸爸：上唇小胡子 ----------
  if (isDad) {
    ctx.fillStyle = hair;
    ell(60, 74.5, 9.5, 3.1); ctx.fill();
  }

  // ---------- 女生：发带蝴蝶结 ----------
  if (isGirl) {
    ctx.fillStyle = '#ff8fc0';
    ell(21, 52, 6.2, 4.6, -0.45); ctx.fill();
    ell(21, 61, 6.2, 4.6, 0.45); ctx.fill();
    ell(99, 52, 6.2, 4.6, 0.45); ctx.fill();
    ell(99, 61, 6.2, 4.6, -0.45); ctx.fill();
    ctx.fillStyle = '#ffd166';
    ell(21, 56.5, 2.6, 2.6); ctx.fill();
    ell(99, 56.5, 2.6, 2.6); ctx.fill();
  }

  ctx.restore();
}

// ============================================================
// 角色创建 (3D) - 骨架化圆润卡通造型
// 关键改动：
// 1. 全部关节化（髋/肩/头独立枢轴），支撑真实步态
// 2. 圆角与旋转体替代生硬圆柱，头身比 1:2 强化可爱感
// 3. 材质分层（皮肤/布料/金属/发光），并统一走 VX.materials
// ============================================================
// forRemote=true 时只构建模型并返回，不接管全局 player、也不加入场景。
// characterOverride 用于创建远程队友的模型（不能改全局 GS.character）。
function createPlayer(forRemote, characterOverride) {
  var _cid = characterOverride || GS.character;
  var isQike = _cid === 'qike';
  var isBaba = _cid === 'baba';
  var M = VX.materials, S = VX.shape;

  var root = new THREE.Group();
  var rig = {};

  // ---------------- 配色 ----------------
  // 爸爸：卡其工装 + 深绿背心 + 棕色皮鞋，和奇奇(橙蓝)、妙妙(紫粉)拉开区分
  var skinHex = isBaba ? 0xf2c49a : 0xffd7b0;
  var clothHex = isQike ? 0xff9f43 : (isBaba ? 0x4a7c59 : 0xc47bff);
  var clothDarkHex = isQike ? 0xe07b1e : (isBaba ? 0x355c40 : 0xa855e0);
  var pantsHex = isQike ? 0x3f6fd0 : (isBaba ? 0x6b5236 : 0xff8fc7);
  var hairHex = isQike ? 0x4a2c1d : (isBaba ? 0x3a2b22 : 0x6b2540);
  var shoeHex = isQike ? 0xe8562e : (isBaba ? 0x6b4a2f : 0xd94b78);

  // 爸爸体格更壮：肩更宽、躯干更粗、人略高一档
  var shoulderX = isBaba ? 0.335 : 0.305;
  var bodyTopR = isBaba ? 0.268 : 0.235;
  var bodyBotR = isBaba ? 0.340 : 0.305;
  var collarR = isBaba ? 0.190 : 0.172;
  var beltR = isBaba ? 0.338 : 0.302;

  var matSkin = M.skin(skinHex);
  var matCloth = M.cloth(clothHex);
  var matClothDark = M.cloth(clothDarkHex);
  var matPants = M.cloth(pantsHex);
  var matHair = M.std(hairHex, { rough: 0.85 });
  var matHairLight = M.std(isQike ? 0x6b4130 : (isBaba ? 0x5f5148 : 0x8a3554), { rough: 0.8 });
  var matShoe = M.std(shoeHex, { rough: 0.55 });
  var matWhite = M.std(0xffffff, { rough: 0.4 });
  var matGold = M.metal(0xffd166);
  var matEyeDark = M.std(isQike ? 0x2b1a12 : (isBaba ? 0x241a14 : 0x3a1230), { rough: 0.25 });
  var matBlush = M.glow(0xff9db0, 0.34);
  var matMouth = M.std(0xc0475f, { rough: 0.5 });
  var matGlass = M.std(0x2f2a26, { rough: 0.32 });

  // ---------------- 腿 ----------------
  function buildLeg(side) {
    var hip = new THREE.Group();
    hip.position.set(side * 0.135, 0.46, 0);

    var leg = new THREE.Mesh(S.capsule(0.088, 0.15, 12, 4), matPants);
    leg.position.y = -0.17;
    leg.castShadow = true;
    hip.add(leg);

    var foot = new THREE.Mesh(S.ellipsoid(0.1, 0.072, 0.14, 12), matShoe);
    foot.position.set(0, -0.39, 0.035);
    foot.castShadow = true;
    hip.add(foot);

    var strap = new THREE.Mesh(S.roundedBox(0.185, 0.028, 0.045, 0.012, 2), matWhite);
    strap.position.set(0, -0.355, 0.085);
    hip.add(strap);

    root.add(hip);
    return hip;
  }
  rig.hipL = buildLeg(-1);
  rig.hipR = buildLeg(1);

  // ---------------- 躯干 ----------------
  var torso = new THREE.Group();
  torso.position.set(0, 0.46, 0);
  root.add(torso);
  rig.torso = torso;

  var body = new THREE.Mesh(S.taper(bodyTopR, bodyBotR, 0.5, 20), matCloth);
  body.position.y = 0.25;
  body.castShadow = true;
  body.receiveShadow = true;
  torso.add(body);

  var collar = new THREE.Mesh(new THREE.TorusGeometry(collarR, 0.033, 8, 20), matClothDark);
  collar.position.y = 0.487;
  collar.rotation.x = Math.PI / 2;
  torso.add(collar);

  var belt = new THREE.Mesh(new THREE.CylinderGeometry(beltR, beltR, 0.055, 22), matClothDark);
  belt.position.y = 0.048;
  torso.add(belt);

  var buckle = new THREE.Mesh(S.roundedBox(0.105, 0.075, 0.032, 0.018, 2), matGold);
  buckle.position.set(0, 0.048, beltR + 0.02);
  torso.add(buckle);

  // 妙妙：短裙
  if (!isQike && !isBaba) {
    var skirt = new THREE.Mesh(S.taper(0.30, 0.42, 0.22, 20), matPants);
    skirt.position.y = -0.045;
    torso.add(skirt);
    var frill = new THREE.Mesh(new THREE.TorusGeometry(0.415, 0.022, 6, 24), matWhite);
    frill.position.y = -0.15;
    frill.rotation.x = Math.PI / 2;
    torso.add(frill);
  }

  // 背包（奇奇）/ 斜挎包（妙妙）
  if (isQike) {
    var pack = new THREE.Mesh(S.roundedBox(0.3, 0.32, 0.16, 0.06, 3), M.std(0x3f8f5f, { rough: 0.8 }));
    pack.position.set(0, 0.26, -0.28);
    pack.castShadow = true;
    torso.add(pack);
    var packFlap = new THREE.Mesh(S.roundedBox(0.28, 0.12, 0.05, 0.03, 2), M.std(0x2f7048, { rough: 0.8 }));
    packFlap.position.set(0, 0.34, -0.355);
    torso.add(packFlap);
    var packBuckle = new THREE.Mesh(S.roundedBox(0.05, 0.04, 0.03, 0.012, 2), matGold);
    packBuckle.position.set(0, 0.28, -0.365);
    torso.add(packBuckle);
  } else if (isBaba) {
    // 爸爸：工具腰带 + 腰包 + 插在腰间的小锤子
    var toolBelt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.352, 0.352, 0.075, 22),
      M.std(0x6b4a2f, { rough: 0.7 })
    );
    toolBelt.position.y = 0.048;
    torso.add(toolBelt);

    var pouch = new THREE.Mesh(S.roundedBox(0.15, 0.14, 0.10, 0.035, 2), M.std(0x7a5533, { rough: 0.8 }));
    pouch.position.set(0.30, 0.03, 0.10);
    pouch.castShadow = true;
    torso.add(pouch);

    var hammerHandle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.022, 0.20, 8),
      M.std(0x9a7a48, { rough: 0.85 })
    );
    hammerHandle.position.set(-0.30, 0.0, 0.08);
    hammerHandle.rotation.z = 0.28;
    torso.add(hammerHandle);
    var hammerHead = new THREE.Mesh(S.roundedBox(0.10, 0.055, 0.055, 0.018, 2), M.std(0x9aa3aa, { rough: 0.35 }));
    hammerHead.position.set(-0.34, 0.10, 0.08);
    hammerHead.rotation.z = 0.28;
    torso.add(hammerHead);
  } else {
    var sideBag = new THREE.Mesh(S.roundedBox(0.2, 0.22, 0.12, 0.05, 3), M.std(0x9944ff, { rough: 0.75 }));
    sideBag.position.set(0.28, 0.12, -0.06);
    sideBag.rotation.z = -0.18;
    sideBag.castShadow = true;
    torso.add(sideBag);
    var bagStud = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 8), matGold);
    bagStud.position.set(0.28, 0.16, 0.0);
    torso.add(bagStud);
  }

  // ---------------- 手臂 ----------------
  function buildArm(side) {
    var sh = new THREE.Group();
    // 挂点必须落在躯干轮廓外侧 —— 躯干下摆半径约 0.305（爸爸 0.340），
    // 之前用 0.253 会让整条手臂和手掌被躯干包住，画面里看不到手臂
    sh.position.set(side * shoulderX, 0.44, 0);

    var sleeve = new THREE.Mesh(S.capsule(0.077, 0.165, 10, 4), matCloth);
    sleeve.position.y = -0.125;
    sleeve.castShadow = true;
    sh.add(sleeve);

    var cuff = new THREE.Mesh(new THREE.TorusGeometry(0.072, 0.018, 6, 14), matClothDark);
    cuff.position.y = -0.215;
    cuff.rotation.x = Math.PI / 2;
    sh.add(cuff);

    var hand = new THREE.Mesh(S.ellipsoid(0.079, 0.082, 0.076, 12), matSkin);
    hand.position.y = -0.285;
    hand.castShadow = true;
    sh.add(hand);

    torso.add(sh);
    return sh;
  }
  rig.shoulderL = buildArm(-1);
  rig.shoulderR = buildArm(1);

  // ---------------- 头 ----------------
  var headG = new THREE.Group();
  headG.position.set(0, 0.5, 0);
  torso.add(headG);
  rig.head = headG;

  var neck = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.1, 0.1, 12), matSkin);
  neck.position.y = 0.03;
  headG.add(neck);

  var skull = new THREE.Mesh(S.ellipsoid(0.325, 0.305, 0.30, 24), matSkin);
  skull.position.y = 0.19;
  skull.castShadow = true;
  headG.add(skull);

  // ---- 眼睛（含眨眼用的 Group）----
  function buildEye(side) {
    var eye = new THREE.Group();
    eye.position.set(side * 0.125, 0.235, 0.252);

    var white = new THREE.Mesh(S.ellipsoid(0.088, 0.105, 0.055, 14), matWhite);
    eye.add(white);

    var iris = new THREE.Mesh(S.ellipsoid(0.062, 0.072, 0.04, 14), matEyeDark);
    iris.position.z = 0.035;
    eye.add(iris);

    var shine = new THREE.Mesh(new THREE.SphereGeometry(0.024, 8, 8), matWhite);
    shine.position.set(side * -0.018, 0.028, 0.068);
    eye.add(shine);

    var shine2 = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 6), matWhite);
    shine2.position.set(side * 0.022, -0.022, 0.066);
    eye.add(shine2);

    headG.add(eye);
    return eye;
  }
  rig.eyeL = buildEye(-1);
  rig.eyeR = buildEye(1);

  // 眉毛
  [-0.125, 0.125].forEach(function (bx, i) {
    var brow = new THREE.Mesh(S.roundedBox(0.115, 0.026, 0.03, 0.012, 2), matHair);
    brow.position.set(bx, 0.365, 0.258);
    brow.rotation.z = (i === 0 ? 1 : -1) * 0.12;
    headG.add(brow);
  });

  // 鼻子
  var nose = new THREE.Mesh(S.ellipsoid(0.045, 0.038, 0.03, 10), M.std(0xffc79a, { rough: 0.5 }));
  nose.position.set(0, 0.165, 0.288);
  headG.add(nose);

  // 嘴：微笑弧
  var mouth = new THREE.Mesh(new THREE.TorusGeometry(0.048, 0.014, 6, 14, Math.PI), matMouth);
  mouth.position.set(0, 0.108, 0.268);
  mouth.rotation.z = Math.PI;
  headG.add(mouth);

  // 腮红
  [-0.212, 0.212].forEach(function (bx) {
    var blush = new THREE.Mesh(new THREE.CircleGeometry(0.058, 14), matBlush);
    blush.position.set(bx, 0.125, 0.208);
    blush.rotation.y = bx > 0 ? -0.45 : 0.45;
    headG.add(blush);
  });

  // ---------------- 爸爸：络腮胡 + 眼镜 ----------------
  if (isBaba) {
    // 一圈包住下颌的胡子。
    // thetaStart 是算出来的，不能随手改：嘴的下沿在 y≈0.046，
    // 而胡子球半径比头骨大、会更靠前，只要它的上沿 y 高于 0.046 就会把嘴糊住。
    // 取 0.66π → 上沿 y = 0.19 + 0.322·cos(118.8°) ≈ 0.035，刚好让开嘴。
    var beard = new THREE.Mesh(
      new THREE.SphereGeometry(0.322, 22, 14, 0, Math.PI * 2, Math.PI * 0.66, Math.PI * 0.26),
      matHair
    );
    beard.position.set(0, 0.19, 0.01);
    beard.scale.set(1.0, 1.02, 1.0);
    headG.add(beard);

    // 上唇小胡子（贴在鼻子下方、嘴的上方）
    var stache = new THREE.Mesh(S.ellipsoid(0.095, 0.032, 0.035, 12), matHair);
    stache.position.set(0, 0.150, 0.274);
    headG.add(stache);

    // 眼镜：两侧镜框 + 鼻梁。
    // z 必须大于眼球最前端（约 0.307），否则镜框会陷进眼睛里看不见。
    [-1, 1].forEach(function (side) {
      var rim = new THREE.Mesh(new THREE.TorusGeometry(0.098, 0.013, 6, 18), matGlass);
      rim.position.set(side * 0.125, 0.235, 0.300);
      headG.add(rim);
    });
    var bridge = new THREE.Mesh(S.roundedBox(0.055, 0.014, 0.014, 0.006, 2), matGlass);
    bridge.position.set(0, 0.235, 0.300);
    headG.add(bridge);
  }

  // ---------------- 头发 ----------------
  var hairCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.312, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.46),
    matHair
  );
  hairCap.position.y = 0.205;
  hairCap.scale.set(1.03, 1.06, 1.02);
  headG.add(hairCap);

  if (isQike) {
    // 前额碎发（抬高到眉毛以上，避免挡脸）
    [[-0.18, 0.4, 0.215, 0.3], [-0.02, 0.432, 0.235, -0.1], [0.16, 0.405, 0.215, -0.35]].forEach(function (p) {
      var tuft = new THREE.Mesh(S.ellipsoid(0.115, 0.072, 0.088, 10), matHairLight);
      tuft.position.set(p[0], p[1], p[2]);
      tuft.rotation.z = p[3];
      headG.add(tuft);
    });
    // 圆顶帽：露出额头与眉眼
    var cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.322, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.34),
      M.std(0xff6b35, { rough: 0.72 })
    );
    cap.position.y = 0.25;
    headG.add(cap);
    // 帽箍
    var capBand = new THREE.Mesh(new THREE.TorusGeometry(0.291, 0.027, 8, 26), M.std(0xf2552a, { rough: 0.62 }));
    capBand.position.y = 0.402;
    capBand.rotation.x = Math.PI / 2;
    headG.add(capBand);
    // 帽徽
    var badge = new THREE.Mesh(S.crystal(0.058), matGold);
    badge.position.set(0, 0.4, 0.285);
    badge.rotation.x = 0.12;
    headG.add(badge);
    var capBtn = new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 10), M.std(0xf2552a, { rough: 0.6 }));
    capBtn.position.y = 0.565;
    headG.add(capBtn);
  } else if (isBaba) {
    // 爸爸：宽檐探险帽（帽檐 + 帽冠 + 帽带），和奇奇的圆顶帽、妙妙的发箍区分开
    var brim = new THREE.Mesh(
      new THREE.CylinderGeometry(0.455, 0.50, 0.036, 26),
      M.std(0x8a6b3f, { rough: 0.86 })
    );
    brim.position.y = 0.405;
    brim.castShadow = true;
    headG.add(brim);

    var crown = new THREE.Mesh(
      new THREE.CylinderGeometry(0.295, 0.335, 0.20, 22),
      M.std(0x9a7a48, { rough: 0.84 })
    );
    crown.position.y = 0.50;
    crown.castShadow = true;
    headG.add(crown);

    var crownTop = new THREE.Mesh(S.ellipsoid(0.295, 0.055, 0.295, 18), M.std(0x9a7a48, { rough: 0.84 }));
    crownTop.position.y = 0.60;
    headG.add(crownTop);

    var hatBand = new THREE.Mesh(new THREE.TorusGeometry(0.312, 0.026, 6, 24), M.std(0x5c4326, { rough: 0.7 }));
    hatBand.position.y = 0.428;
    hatBand.rotation.x = Math.PI / 2;
    headG.add(hatBand);
  } else {
    // 妙妙：双马尾 + 蝴蝶结 + 发箍
    [-1, 1].forEach(function (side) {
      var tailG = new THREE.Group();
      tailG.position.set(side * 0.285, 0.24, -0.06);
      var seg1 = new THREE.Mesh(S.capsule(0.062, 0.18, 10, 4), matHair);
      seg1.position.y = -0.09;
      seg1.rotation.z = side * 0.35;
      tailG.add(seg1);
      var seg2 = new THREE.Mesh(S.capsule(0.05, 0.16, 10, 4), matHairLight);
      seg2.position.set(side * 0.055, -0.26, 0.01);
      seg2.rotation.z = side * 0.5;
      tailG.add(seg2);
      var tip = new THREE.Mesh(S.ellipsoid(0.055, 0.06, 0.05, 10), matHairLight);
      tip.position.set(side * 0.095, -0.375, 0.015);
      tailG.add(tip);
      // 蝴蝶结
      var bowL = new THREE.Mesh(S.ellipsoid(0.06, 0.038, 0.028, 10), M.std(0xff6fa5, { rough: 0.6 }));
      bowL.position.set(side * 0.03, 0.005, 0.02);
      bowL.rotation.z = side * 0.4;
      tailG.add(bowL);
      var bowR = bowL.clone();
      bowR.position.set(side * -0.03, 0.005, 0.02);
      bowR.rotation.z = side * -0.4;
      tailG.add(bowR);
      headG.add(tailG);
    });
    var headband = new THREE.Mesh(new THREE.TorusGeometry(0.30, 0.022, 6, 24, Math.PI * 1.1), M.std(0xffd166, { rough: 0.4 }));
    headband.position.set(0, 0.30, 0);
    headband.rotation.set(Math.PI * 0.62, 0, 0);
    headG.add(headband);
    var star = new THREE.Mesh(S.crystal(0.055), M.metal(0xffd166));
    star.position.set(0, 0.38, 0.24);
    headG.add(star);
  }

  // ---------------- 木棍（挂在右手，随挥臂运动）----------------
  var stickGroup = new THREE.Group();
  stickGroup.position.set(0, -0.26, 0.03);
  rig.shoulderR.add(stickGroup);

  var stickBody = new THREE.Mesh(
    new THREE.CylinderGeometry(0.032, 0.048, 0.72, 8),
    M.std(0xa9743f, { rough: 0.85, map: M.wood() })
  );
  stickBody.position.y = 0.3;
  stickBody.castShadow = true;
  stickGroup.add(stickBody);

  var stickKnot = new THREE.Mesh(S.blob(0.062, 0.12, 10), M.std(0x8a5a30, { rough: 0.9 }));
  stickKnot.position.y = 0.66;
  stickGroup.add(stickKnot);

  var stickGlow = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 10), M.glow(0xffd166, 0.18, true));
  stickGlow.position.y = 0.4;
  stickGroup.add(stickGlow);

  var stick = { body: stickBody, knot: stickKnot, glow: stickGlow };
  stickBody.visible = false;
  stickKnot.visible = false;
  stickGlow.visible = false;
  rig.stick = stickGroup;

  // ---------------- 装配 ----------------
  root.userData = {
    radius: 0.4,
    isGrounded: true,
    rig: rig,
    stick: stick
  };
  // 爸爸整体高一档，站在两个孩子旁边一眼能看出是大人
  var bodyScale = isBaba ? 1.07 : 1;
  root.scale.set(bodyScale, bodyScale, bodyScale);

  // 让所有网格正确投射阴影
  root.traverse(function (o) {
    if (o.isMesh && o.castShadow === undefined) o.castShadow = true;
  });

  // 远程队友：只交出模型，位置由同步逻辑设置
  if (forRemote) return root;

  root.position.set(0, groundY, -6);
  scene.add(root);
  player = root;
  window.player = player;
}

// ============================================================
// 角色动画系统 - 基于关节的步态与动作
// ============================================================
var playerAnimState = {
  moving: false,
  speed: 0,
  walkPhase: 0,
  attackTimer: 0,
  attackDur: 0.42,
  hurtTimer: 0,
  skillTimer: 0,
  blinkTimer: 2.5,
  isBlinking: false,
  lastX: 0,
  lastZ: 0
};

function initPlayerAnimation() {
  if (!player) return;
  playerAnimState.lastX = player.position.x;
  playerAnimState.lastZ = player.position.z;
}

function updatePlayerAnimation(delta, time) {
  if (!player) return;
  var rig = player.userData.rig;
  if (!rig) return;

  var st = playerAnimState;

  // ---- 通过位移判断是否在走（不依赖外部状态）----
  var dx = player.position.x - st.lastX;
  var dz = player.position.z - st.lastZ;
  var dist = Math.sqrt(dx * dx + dz * dz);
  st.lastX = player.position.x;
  st.lastZ = player.position.z;

  var wantMove = dist > 0.0016 && !GS.isJumping;
  st.speed = VX.anim.damp(st.speed, wantMove ? 1 : 0, 9, delta);

  // ---- 倒地待救：整个人趴下，可以缓慢爬行 ----
  // 不处理的话，血量为 0 的角色还笔直站着，看起来像"没事站着不动"。
  if (GS.downed) {
    // 欧拉顺序必须是 YXZ：默认 XYZ 时矩阵是 Rx·Ry·Rz，Y（朝向）被套在 X 里面，
    // 躺倒之后再改 rotation.y 就变成"原地打转"，爬行方向和身体朝向对不上。
    // 换成 YXZ 先转朝向、再躺下，爬行才像真的在爬。
    if (player.rotation.order !== 'YXZ') player.rotation.order = 'YXZ';
    player.rotation.x = -Math.PI / 2;
    player.position.y = groundY + 0.12;

    var crawlSw = Math.min(1, st.speed || 0);
    // 用全局时间驱动划动相位：倒地分支在 walkPhase 累加之前就 return 了，
    // 拿 st.walkPhase 会永远停在旧值，手臂不会动。
    var cp = time * (2.2 + 7.5 * crawlSw);

    // 双臂交替前划（爬行的主要视觉信号）
    rig.shoulderL.rotation.z = -0.52;
    rig.shoulderR.rotation.z = 0.52;
    rig.shoulderL.rotation.x = 0.30 + Math.sin(cp) * 0.60 * crawlSw;
    rig.shoulderR.rotation.x = 0.30 - Math.sin(cp) * 0.60 * crawlSw;

    // 双腿轻微蹬动 + 身体随划动小幅起伏
    rig.hipL.rotation.x = 0.12 + Math.sin(cp + 1.7) * 0.20 * crawlSw;
    rig.hipR.rotation.x = 0.12 - Math.sin(cp + 1.7) * 0.20 * crawlSw;
    rig.hipL.rotation.z = 0;
    rig.hipR.rotation.z = 0;

    rig.torso.rotation.x = 0;
    rig.torso.rotation.z = Math.sin(cp) * 0.06 * crawlSw;
    rig.torso.rotation.y = 0;
    rig.torso.position.y = 0.46 + Math.sin(cp * 2) * 0.02 * crawlSw;

    rig.head.rotation.x = 0.28;
    return;
  }
  if (player.rotation.order !== 'XYZ') player.rotation.order = 'XYZ';
  player.rotation.x = 0;

  // ---- 飞行姿态（爸爸的技能）：双臂平展、双腿微垂、上身略前倾 ----
  // 必须放在步态之前并直接 return：下面的 hipL/R 是按"走路"算的，
  // 不拦住的话飞行时人物会在半空蹬腿。
  if (GS._flying) {
    rig.shoulderL.rotation.z = -1.15;
    rig.shoulderR.rotation.z = 1.15;
    rig.shoulderL.rotation.x = Math.sin(time * 3.2) * 0.22;
    rig.shoulderR.rotation.x = -Math.sin(time * 3.2) * 0.22;
    rig.hipL.rotation.x = 0.28 + Math.sin(time * 2.4) * 0.08;
    rig.hipR.rotation.x = 0.20 - Math.sin(time * 2.4) * 0.08;
    rig.hipL.rotation.z = 0;
    rig.hipR.rotation.z = 0;
    rig.torso.rotation.x = 0.18;
    rig.torso.rotation.z = 0;
    rig.torso.rotation.y = 0;
    rig.torso.position.y = 0.46;
    rig.head.rotation.x = -0.12;
    rig.eyeL.scale.y = 1;
    rig.eyeR.scale.y = 1;
    return;
  }

  var sw = st.speed;
  // 步频随速度提升
  st.walkPhase += delta * (3.4 + 6.2 * sw) * (0.25 + 0.75 * sw);
  var p = st.walkPhase;

  // ---- 腿：交替前后摆 ----
  var legAmp = 0.68 * sw;
  rig.hipL.rotation.x = Math.sin(p) * legAmp;
  rig.hipR.rotation.x = -Math.sin(p) * legAmp;
  // 抬脚时脚掌跟着转
  rig.hipL.rotation.z = Math.sin(p) * 0.03 * sw;
  rig.hipR.rotation.z = -Math.sin(p) * 0.03 * sw;

  // ---- 手臂：与腿反向摆，待机时轻微晃动 ----
  var armAmp = 0.52 * sw;
  var idleSway = Math.sin(time * 1.4) * 0.045 * (1 - sw);
  rig.shoulderL.rotation.x = -Math.sin(p) * armAmp + idleSway;
  rig.shoulderR.rotation.x = Math.sin(p) * armAmp - idleSway;
  // 手臂向外张开：左臂挂点在 -x，rotation.z 取负才是向外（原来符号反了，手臂内收进身体）
  var splay = 0.12 + Math.sin(time * 1.15) * 0.025;
  rig.shoulderL.rotation.z = -splay;
  rig.shoulderR.rotation.z = splay;

  // ---- 躯干：呼吸 + 走路弹跳 + 侧倾前倾 ----
  var breathe = Math.sin(time * 1.55);
  var bob = Math.abs(Math.sin(p)) * 0.052 * sw + breathe * 0.009 * (1 - sw);
  rig.torso.position.y = 0.46 + bob;
  rig.torso.rotation.z = Math.sin(p) * 0.06 * sw;
  rig.torso.rotation.x = sw * 0.1;
  rig.torso.rotation.y = Math.sin(p) * 0.05 * sw;

  var bScale = 1 + breathe * 0.014 * (1 - sw);
  rig.torso.scale.set(bScale, 1 + breathe * 0.01 * (1 - sw), bScale);

  // ---- 头：保持视线稳定 + 呼吸微动 ----
  rig.head.rotation.z = -Math.sin(p) * 0.05 * sw;
  rig.head.rotation.x = Math.sin(time * 0.85) * 0.028 - sw * 0.06;
  rig.head.rotation.y = Math.sin(time * 0.6) * 0.05 * (1 - sw);

  // ---- 眨眼 ----
  st.blinkTimer -= delta;
  if (st.blinkTimer <= 0 && !st.isBlinking) {
    st.isBlinking = true;
    st.blinkTimer = 2.2 + Math.random() * 3.6;
  }
  var eyeClose = 1;
  if (st.isBlinking) {
    eyeClose = 0.12;
    st._blinkHold = (st._blinkHold || 0) + delta;
    if (st._blinkHold > 0.12) {
      st.isBlinking = false;
      st._blinkHold = 0;
    }
  }
  rig.eyeL.scale.y = VX.anim.damp(rig.eyeL.scale.y, eyeClose, 30, delta);
  rig.eyeR.scale.y = rig.eyeL.scale.y;

  // ---- 攻击动作：蓄力 → 挥出 → 回收 ----
  if (st.attackTimer > 0) {
    st.attackTimer -= delta;
    var t = 1 - Math.max(0, st.attackTimer) / st.attackDur;
    var swing;
    if (t < 0.32) {
      swing = 1.0 * VX.anim.easeOutCubic(t / 0.32);          // 后拉蓄力
    } else {
      swing = 1.0 - 2.7 * VX.anim.easeOutCubic((t - 0.32) / 0.68); // 快速挥出
    }
    rig.shoulderR.rotation.x = swing;
    rig.shoulderR.rotation.z = 0.12 - Math.sin(t * Math.PI) * 0.42;
    rig.torso.rotation.y = -0.34 * Math.sin(t * Math.PI);
    rig.torso.rotation.x = -0.1 + 0.3 * Math.sin(t * Math.PI);
    rig.head.rotation.y = -0.18 * Math.sin(t * Math.PI);
  }

  // ---- 受击：后仰 + 闪红 ----
  if (st.hurtTimer > 0) {
    st.hurtTimer -= delta;
    var ht = Math.max(0, st.hurtTimer);
    var shake = Math.sin(ht * 55) * 0.06 * (ht / 0.45);
    rig.torso.rotation.x = -0.32 * (ht / 0.45);
    rig.head.rotation.x = -0.2 * (ht / 0.45);
    player.position.x += shake * 0.05;

    var on = Math.sin(ht * 42) > 0;
    if (on) {
      VX.rig.flash(player.userData._meshes || VX.rig.collectMeshes(player), 0xff3b3b, 0.85);
    } else {
      VX.rig.resetFlash(player.userData._meshes || VX.rig.collectMeshes(player));
    }
  }

  // ---- 技能：腾空旋转 + 光环 ----
  if (st.skillTimer > 0) {
    st.skillTimer -= delta;
    var sk = st.skillTimer / 3;
    var lift = Math.sin((1 - sk) * Math.PI) * 0.32;
    rig.torso.position.y = 0.46 + lift;
    rig.shoulderL.rotation.z = 0.07 + Math.sin(time * 9) * 0.5;
    rig.shoulderR.rotation.z = -0.07 - Math.sin(time * 9) * 0.5;
    rig.hipL.rotation.x = Math.sin(time * 7) * 0.35;
    rig.hipR.rotation.x = -Math.sin(time * 7) * 0.35;
    player.rotation.y += delta * 2.4;
    rig.head.rotation.z = Math.sin(time * 4) * 0.12;
  }
}

// 受击动画
function playHurtAnimation() {
  if (!player) return;
  playerAnimState.hurtTimer = 0.45;
  if (!player.userData._meshes) {
    player.userData._meshes = VX.rig.collectMeshes(player);
  }
  playerVelY = Math.max(playerVelY, 2.6);
}

// 攻击动画
function playAttackAnimation() {
  if (!player) return;
  playerAnimState.attackTimer = playerAnimState.attackDur;
}

// 技能动画
function playSkillAnimation() {
  if (!player) return;
  playerAnimState.skillTimer = 3;
  playerAnimState.baseRotY = player.rotation.y;
}

// ============================================================
// 状态光环：双层脉冲环，替代单薄圆环
// ============================================================
function createPlayerAura(color, opacity) {
  if (!player) return;
  if (player.userData.aura) {
    try { player.remove(player.userData.aura); } catch (e) { }
  }

  var group = new THREE.Group();

  var innerMat = VX.materials.glow(color, opacity || 0.4, true);
  var inner = new THREE.Mesh(VX.shape.ring(0.42, 0.56, 40), innerMat);
  inner.rotation.x = -Math.PI / 2;
  inner.position.y = 0.035;
  group.add(inner);

  var outerMat = VX.materials.glow(color, (opacity || 0.4) * 0.45, true);
  var outer = new THREE.Mesh(VX.shape.ring(0.62, 0.78, 40), outerMat);
  outer.rotation.x = -Math.PI / 2;
  outer.position.y = 0.03;
  group.add(outer);

  player.add(group);
  player.userData.aura = group;

  return group;
}

function updatePlayerAura(time) {
  if (!player || !player.userData.aura) return;
  var aura = player.userData.aura;
  var pulse = 1 + Math.sin(time * 3) * 0.12;
  aura.scale.set(pulse, 1, pulse);
  if (aura.children[0]) aura.children[0].material.opacity = 0.26 + Math.sin(time * 2.2) * 0.12;
  if (aura.children[1]) aura.children[1].material.opacity = 0.12 + Math.sin(time * 1.6 + 1) * 0.07;
  aura.rotation.y += 0.006;
}

// 脚底爆发粒子
function playAuraEffect(color, duration) {
  if (!player) return;

  var particles = [];
  for (var i = 0; i < 14; i++) {
    var angle = (Math.PI * 2 / 14) * i;
    var p = new THREE.Mesh(
      new THREE.SphereGeometry(0.045, 5, 5),
      VX.materials.glow(color, 0.85, true)
    );
    p.position.set(Math.cos(angle) * 0.55, 0.12, Math.sin(angle) * 0.55);
    player.add(p);
    particles.push({ mesh: p, angle: angle, radius: 0.55 });
  }

  var startTime = Date.now();
  var tick = setInterval(function () {
    var elapsed = (Date.now() - startTime) / 1000;
    if (elapsed > duration) {
      particles.forEach(function (p) {
        try { player.remove(p.mesh); } catch (e) { }
      });
      clearInterval(tick);
      return;
    }
    particles.forEach(function (p, idx) {
      p.angle += 0.055;
      var yOffset = Math.sin(elapsed * 3 + idx) * 0.22;
      p.mesh.position.set(
        Math.cos(p.angle) * p.radius,
        0.12 + yOffset,
        Math.sin(p.angle) * p.radius
      );
      p.mesh.material.opacity = 0.85 - (elapsed / duration) * 0.85;
      var s = 1 + elapsed * 0.6;
      p.mesh.scale.set(s, s, s);
    });
  }, 16);
}
