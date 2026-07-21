// ============================================================
// 绘制角色头像 - 奇奇(男孩) / 妙妙(女孩) 差异化设计
// ============================================================
function drawAvatar(id, gender, bodyColor, hatColor) {
  var c = document.getElementById(id);
  var ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 120, 140);
  var isBoy = gender === 'boy';

  ctx.fillStyle = bodyColor;
  ctx.beginPath(); ctx.ellipse(60, 95, 28, 30, 0, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = '#ffcc99';
  ctx.beginPath(); ctx.arc(60, 50, 28, 0, Math.PI * 2); ctx.fill();

  if (isBoy) {
    ctx.fillStyle = '#553322';
    ctx.beginPath(); ctx.arc(60, 42, 29, Math.PI, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#6b4433';
    ctx.beginPath(); ctx.arc(48, 46, 8, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(72, 46, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#553322';
    ctx.fillRect(35, 44, 50, 4);
    ctx.fillRect(40, 40, 40, 3);
  } else {
    ctx.fillStyle = '#663344';
    ctx.beginPath(); ctx.arc(60, 42, 29, Math.PI, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#885566';
    ctx.beginPath(); ctx.ellipse(32, 55, 6, 12, 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(88, 55, 6, 12, -0.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#663344';
    ctx.fillRect(36, 44, 48, 5);
    ctx.fillRect(38, 40, 44, 4);
    ctx.fillStyle = '#ff88cc';
    ctx.beginPath(); ctx.ellipse(42, 38, 6, 4, 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(48, 38, 5, 3, -0.3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(72, 38, 6, 4, -0.3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(78, 38, 5, 3, 0.3, 0, Math.PI * 2); ctx.fill();
  }

  if (isBoy) {
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.ellipse(48, 52, 7, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(72, 52, 7, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#333';
    ctx.beginPath(); ctx.arc(50, 54, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(74, 54, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(48, 50, 2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(72, 50, 2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#553322';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(40, 43); ctx.lineTo(54, 41); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(80, 43); ctx.lineTo(66, 41); ctx.stroke();
  } else {
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.ellipse(48, 52, 8, 9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(72, 52, 8, 9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#552244';
    ctx.beginPath(); ctx.arc(50, 54, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(74, 54, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(48, 49, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(72, 49, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#552244';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(42, 48); ctx.lineTo(44, 44); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(54, 48); ctx.lineTo(56, 44); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(66, 48); ctx.lineTo(64, 44); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(78, 48); ctx.lineTo(76, 44); ctx.stroke();
    ctx.strokeStyle = '#885566';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(42, 44); ctx.lineTo(55, 42); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(78, 44); ctx.lineTo(65, 42); ctx.stroke();
  }

  ctx.strokeStyle = '#ff6666';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(60, 63, 9, 0.1, Math.PI - 0.1); ctx.stroke();

  ctx.fillStyle = 'rgba(255,150,150,0.3)';
  ctx.beginPath(); ctx.ellipse(40, 65, 7, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(80, 65, 7, 4, 0, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = hatColor;
  ctx.beginPath(); ctx.ellipse(60, 35, 20, 8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(60, 30, 14, Math.PI, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffd700';
  ctx.beginPath(); ctx.arc(60, 16, 4, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = bodyColor;
  ctx.fillRect(30, 85, 10, 25);
  ctx.fillRect(80, 85, 10, 25);
  ctx.fillStyle = '#ffcc99';
  ctx.beginPath(); ctx.arc(35, 110, 6, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(85, 110, 6, 0, Math.PI * 2); ctx.fill();

  if (isBoy) {
    ctx.fillStyle = '#4477aa';
    ctx.fillRect(48, 120, 8, 18);
    ctx.fillRect(64, 120, 8, 18);
    ctx.fillStyle = '#ff6600';
    ctx.fillRect(45, 135, 14, 6);
    ctx.fillRect(61, 135, 14, 6);
  } else {
    ctx.fillStyle = '#aa66ff';
    ctx.beginPath(); ctx.ellipse(60, 118, 22, 8, 0, 0, Math.PI); ctx.fill();
    ctx.fillStyle = '#ff88cc';
    ctx.beginPath(); ctx.ellipse(60, 120, 18, 5, 0, 0, Math.PI); ctx.fill();
    ctx.fillStyle = '#ffcc99';
    ctx.fillRect(50, 118, 6, 14);
    ctx.fillRect(64, 118, 6, 14);
    ctx.fillStyle = '#fff';
    ctx.fillRect(49, 126, 8, 6);
    ctx.fillRect(63, 126, 8, 6);
    ctx.fillStyle = '#cc3333';
    ctx.fillRect(47, 132, 12, 5);
    ctx.fillRect(61, 132, 12, 5);
  }

  if (isBoy) {
    ctx.strokeStyle = '#ff8800';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(48, 52, 10, 10, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(72, 52, 10, 10, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(56, 52); ctx.lineTo(64, 52); ctx.stroke();
  } else {
    ctx.fillStyle = '#9944ff';
    ctx.fillRect(82, 78, 14, 20);
    ctx.strokeStyle = '#7722dd';
    ctx.lineWidth = 1;
    ctx.strokeRect(82, 78, 14, 20);
    ctx.fillStyle = '#ffd700';
    ctx.beginPath(); ctx.arc(89, 85, 3, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#9944ff';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(82, 80); ctx.lineTo(75, 74); ctx.stroke();
  }
}

// ============================================================
// 角色创建 (3D) - 奇奇(男孩)/妙妙(女孩)
// ============================================================
function createPlayer() {
  var g = new THREE.Group();
  var isQike = GS.character === 'qike';
  var isBoy = isQike;
  var mainColor = isBoy ? 0xff8800 : 0xcc77ff;
  var hatColor = isBoy ? 0xff6600 : 0x9944ff;

  var bodyMat = new THREE.MeshStandardMaterial({ color: mainColor, roughness: 0.5, emissive: mainColor, emissiveIntensity: 0.05 });
  var body = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 0.65, 10), bodyMat);
  body.position.y = 0.8; body.castShadow = true; g.add(body);

  var belt = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.04, 4, 12), new THREE.MeshStandardMaterial({ color: 0xffd700, roughness: 0.3 }));
  belt.position.y = 0.55; belt.rotation.x = Math.PI / 2; g.add(belt);

  if (!isBoy) {
    var skirt = new THREE.Mesh(new THREE.ConeGeometry(0.6, 0.28, 10), new THREE.MeshStandardMaterial({ color: 0xaa66ff, roughness: 0.6 }));
    skirt.position.y = 0.38; g.add(skirt);
    var skirtRuffle = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.04, 6, 12), new THREE.MeshStandardMaterial({ color: 0xff88cc, roughness: 0.6 }));
    skirtRuffle.position.y = 0.2; skirtRuffle.rotation.x = Math.PI / 2; g.add(skirtRuffle);
  }

  var headMat = new THREE.MeshStandardMaterial({ color: 0xffcc99, roughness: 0.3 });
  var head = new THREE.Mesh(new THREE.SphereGeometry(0.38, 14, 14), headMat);
  head.position.y = 1.25; head.castShadow = true; g.add(head);

  if (isBoy) {
    var hair = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x553322, roughness: 0.8 }));
    hair.position.y = 1.45; g.add(hair);
  } else {
    var hair = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x663344, roughness: 0.8 }));
    hair.position.y = 1.45; g.add(hair);
    var braidMat = new THREE.MeshStandardMaterial({ color: 0x885566, roughness: 0.8 });
    var braidL = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.07, 0.35, 6), braidMat);
    braidL.position.set(-0.35, 1.0, 0.15); braidL.rotation.z = 0.3; braidL.rotation.x = -0.1; g.add(braidL);
    var braidR = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.07, 0.35, 6), braidMat);
    braidR.position.set(0.35, 1.0, 0.15); braidR.rotation.z = -0.3; braidR.rotation.x = -0.1; g.add(braidR);
    var bowMat = new THREE.MeshStandardMaterial({ color: 0xff88cc, roughness: 0.5 });
    [-0.24, 0.24].forEach(function (bx) {
      var bow = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), bowMat);
      bow.position.set(bx, 1.5, 0.28); g.add(bow);
    });
  }

  var eyeColor = isBoy ? 0x222222 : 0x552244;
  [[-0.13, 1.32, 0.33], [0.13, 1.32, 0.33]].forEach(function (p) {
    var eyeW = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), new THREE.MeshStandardMaterial({ color: 0xffffff }));
    eyeW.position.set(p[0], p[1], p[2]); g.add(eyeW);
    var eyeB = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), new THREE.MeshStandardMaterial({ color: eyeColor }));
    eyeB.position.set(p[0], p[1], p[2] + 0.04); g.add(eyeB);
    var eyeH = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 6), new THREE.MeshStandardMaterial({ color: 0xffffff }));
    eyeH.position.set(p[0] + 0.03, p[1] + 0.03, p[2] + 0.08); g.add(eyeH);
  });

  if (isBoy) {
    var browMat = new THREE.MeshStandardMaterial({ color: 0x553322, roughness: 0.8 });
    [-0.18, 0.18].forEach(function (bx) {
      var brow = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.025, 0.02), browMat);
      brow.position.set(bx, 1.4, 0.36); g.add(brow);
    });
  } else {
    var browMat2 = new THREE.MeshStandardMaterial({ color: 0x885566, roughness: 0.8 });
    [-0.18, 0.18].forEach(function (bx) {
      var brow = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.018, 0.02), browMat2);
      brow.position.set(bx, 1.4, 0.36); g.add(brow);
    });
  }

  var mouth = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.015, 6, 12), new THREE.MeshStandardMaterial({ color: 0xff6666 }));
  mouth.position.set(0, 1.18, 0.36); mouth.rotation.x = Math.PI / 2; g.add(mouth);

  [-0.2, 0.2].forEach(function (x) {
    var blush = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffaaaa, transparent: true, opacity: 0.3 }));
    blush.position.set(x, 1.18, 0.3); g.add(blush);
  });

  var hat = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.25, 8), new THREE.MeshStandardMaterial({ color: hatColor, roughness: 0.6 }));
  hat.position.y = 1.52; g.add(hat);
  var hatBall = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), new THREE.MeshStandardMaterial({ color: 0xffd700 }));
  hatBall.position.y = 1.65; g.add(hatBall);

  if (isBoy) {
    var goggleMat = new THREE.MeshStandardMaterial({ color: 0xff8800, roughness: 0.3 });
    [-0.18, 0.18].forEach(function (x) {
      var goggle = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.025, 6, 12), goggleMat);
      goggle.position.set(x, 1.28, 0.3); g.add(goggle);
    });
    var goggleBand = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.02, 6, 12), goggleMat);
    goggleBand.position.set(0, 1.28, 0.25); goggleBand.rotation.x = 0.2; g.add(goggleBand);
  }

  if (!isBoy) {
    var clip = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), new THREE.MeshStandardMaterial({ color: 0xffd700 }));
    clip.position.set(0.24, 1.48, 0.25); g.add(clip);
    var bagBody = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.18, 0.08), new THREE.MeshStandardMaterial({ color: 0x9944ff, roughness: 0.6 }));
    bagBody.position.set(0.42, 0.7, -0.14); g.add(bagBody);
    var bagStrap = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.012, 4, 12), new THREE.MeshStandardMaterial({ color: 0x9944ff, roughness: 0.6 }));
    bagStrap.position.set(0.42, 0.8, -0.12); bagStrap.rotation.x = Math.PI / 2; g.add(bagStrap);
  }

  var armMat = new THREE.MeshStandardMaterial({ color: mainColor, roughness: 0.5 });
  var leftArm = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.4, 6), armMat);
  leftArm.position.set(-0.45, 0.7, 0); leftArm.rotation.z = 0.3; g.add(leftArm);
  var handMat = new THREE.MeshStandardMaterial({ color: 0xffcc99, roughness: 0.3 });
  var leftHand = new THREE.Mesh(new THREE.SphereGeometry(0.065, 6, 6), handMat);
  leftHand.position.set(-0.53, 0.48, 0); g.add(leftHand);

  var rightArm = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.4, 6), armMat);
  rightArm.position.set(0.45, 0.7, 0); rightArm.rotation.z = -0.3; g.add(rightArm);
  var rightHand = new THREE.Mesh(new THREE.SphereGeometry(0.065, 6, 6), handMat);
  rightHand.position.set(0.53, 0.48, 0); g.add(rightHand);

  if (isBoy) {
    var thighMat = new THREE.MeshStandardMaterial({ color: 0x4466aa, roughness: 0.7 });
    var leftThigh = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.14, 0.35, 8), thighMat);
    leftThigh.position.set(-0.16, 0.25, 0); leftThigh.rotation.x = 0.05; g.add(leftThigh);
    var rightThigh = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.14, 0.35, 8), thighMat);
    rightThigh.position.set(0.16, 0.25, 0); rightThigh.rotation.x = -0.05; g.add(rightThigh);
    var calfMat = new THREE.MeshStandardMaterial({ color: 0x3366aa, roughness: 0.7 });
    var leftCalf = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.3, 8), calfMat);
    leftCalf.position.set(-0.16, -0.05, 0.02); leftCalf.rotation.x = -0.05; g.add(leftCalf);
    var rightCalf = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.3, 8), calfMat);
    rightCalf.position.set(0.16, -0.05, -0.02); rightCalf.rotation.x = 0.05; g.add(rightCalf);
    var shoeMat = new THREE.MeshStandardMaterial({ color: 0xff6600, roughness: 0.7 });
    var leftShoe = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), shoeMat);
    leftShoe.position.set(-0.16, -0.2, 0.06); leftShoe.scale.set(1, 0.7, 1.3); g.add(leftShoe);
    var rightShoe = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), shoeMat);
    rightShoe.position.set(0.16, -0.2, -0.02); rightShoe.scale.set(1, 0.7, 1.3); g.add(rightShoe);
    var laceMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
    var leftLace = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.012, 4, 8), laceMat);
    leftLace.position.set(-0.16, -0.18, 0.08); leftLace.rotation.x = Math.PI / 2; g.add(leftLace);
    var rightLace = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.012, 4, 8), laceMat);
    rightLace.position.set(0.16, -0.18, 0); rightLace.rotation.x = Math.PI / 2; g.add(rightLace);
  } else {
    var thighMatG = new THREE.MeshStandardMaterial({ color: 0xffcc99, roughness: 0.3 });
    var leftThighG = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.13, 0.32, 8), thighMatG);
    leftThighG.position.set(-0.16, 0.25, 0); g.add(leftThighG);
    var rightThighG = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.13, 0.32, 8), thighMatG);
    rightThighG.position.set(0.16, 0.25, 0); g.add(rightThighG);
    var calfMatG = new THREE.MeshStandardMaterial({ color: 0xffcc99, roughness: 0.3 });
    var leftCalfG = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.28, 8), calfMatG);
    leftCalfG.position.set(-0.16, -0.05, 0.02); g.add(leftCalfG);
    var rightCalfG = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.28, 8), calfMatG);
    rightCalfG.position.set(0.16, -0.05, -0.02); g.add(rightCalfG);
    var sockMatG = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
    var leftSockG = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.09, 0.12, 8), sockMatG);
    leftSockG.position.set(-0.16, -0.14, 0.02); g.add(leftSockG);
    var rightSockG = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.09, 0.12, 8), sockMatG);
    rightSockG.position.set(0.16, -0.14, -0.02); g.add(rightSockG);
    var shoeMatG = new THREE.MeshStandardMaterial({ color: 0xcc3333, roughness: 0.7 });
    var leftShoeG2 = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), shoeMatG);
    leftShoeG2.position.set(-0.16, -0.22, 0.07); leftShoeG2.scale.set(1, 0.65, 1.3); g.add(leftShoeG2);
    var rightShoeG2 = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), shoeMatG);
    rightShoeG2.position.set(0.16, -0.22, -0.03); rightShoeG2.scale.set(1, 0.65, 1.3); g.add(rightShoeG2);
    var bowShoeMat = new THREE.MeshStandardMaterial({ color: 0xffd700, roughness: 0.5 });
    var leftBowShoe = new THREE.Mesh(new THREE.SphereGeometry(0.025, 4, 4), bowShoeMat);
    leftBowShoe.position.set(-0.16, -0.18, 0.12); g.add(leftBowShoe);
    var rightBowShoe = new THREE.Mesh(new THREE.SphereGeometry(0.025, 4, 4), bowShoeMat);
    rightBowShoe.position.set(0.16, -0.18, 0.02); g.add(rightBowShoe);
  }

  // 创建木棍（默认隐藏，选中木棍时显示）
  var stickMat = new THREE.MeshStandardMaterial({ color: 0x9a6b3f, roughness: 0.8 });
  var stickBody = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.8, 6), stickMat);
  stickBody.position.set(0.6, 0.7, 0.1);
  stickBody.rotation.z = -0.6;
  stickBody.rotation.x = 0.2;
  g.add(stickBody);
  var stickKnot = new THREE.Mesh(new THREE.SphereGeometry(0.065, 6, 6), new THREE.MeshStandardMaterial({ color: 0x7a5230, roughness: 0.9 }));
  stickKnot.position.set(0.6, 1.05, 0.1);
  g.add(stickKnot);
  // 木棍发光光晕
  var stickGlow = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xffd700, transparent: true, opacity: 0.15, side: THREE.DoubleSide })
  );
  stickGlow.position.set(0.6, 0.85, 0.1);
  g.add(stickGlow);
  var stick = { body: stickBody, knot: stickKnot, glow: stickGlow };
  g.userData.stick = stick;
  stickBody.visible = false;
  stickKnot.visible = false;
  stickGlow.visible = false;

  g.position.set(0, groundY, -6);
  g.userData = { radius: 0.4, isGrounded: true };
  g.scale.set(1.1, 1.1, 1.1);

  scene.add(g);
  player = g;
}

// ============================================================
// 角色动画系统
// ============================================================
var playerAnimState = {
  idle: true,
  moving: false,
  attacking: false,
  hurt: false,
  skill: false,
  hurtFlash: 0,
  attackTimer: 0,
  baseY: 0,
  breathPhase: 0,
  blinkTimer: 0,
  isBlinking: false
};

// 初始化动画状态
function initPlayerAnimation() {
  if (!player) return;
  playerAnimState.baseY = player.position.y;
}

// 更新角色动画（在每帧调用）
function updatePlayerAnimation(delta, time) {
  if (!player) return;

  // 跳跃时不应用呼吸/移动动画，避免与跳跃系统冲突
  if (GS.isJumping) return;

  // 呼吸动画（待机时）
  if (playerAnimState.idle && !playerAnimState.moving) {
    playerAnimState.breathPhase += delta * 2;
    var breathOffset = Math.sin(playerAnimState.breathPhase) * 0.03;
    player.position.y = playerAnimState.baseY + breathOffset;

    // 轻微的身体摇摆
    player.rotation.z = Math.sin(playerAnimState.breathPhase * 0.5) * 0.02;
  }

  // 移动动画
  if (playerAnimState.moving) {
    playerAnimState.breathPhase += delta * 4;
    var walkBounce = Math.abs(Math.sin(playerAnimState.breathPhase)) * 0.08;
    player.position.y = playerAnimState.baseY + walkBounce;

    // 身体轻微左右摇摆
    player.rotation.z = Math.sin(playerAnimState.breathPhase) * 0.05;
  }

  // 受击动画
  if (playerAnimState.hurt) {
    playerAnimState.hurtFlash -= delta;
    if (playerAnimState.hurtFlash <= 0) {
      playerAnimState.hurt = false;
      player.children.forEach(function (child) {
        if (child.isMesh && child.material && child.material.emissive) {
          child.material.emissive.setHex(0x000000);
        }
      });
    } else {
      // 闪烁红色
      var flashIntensity = Math.sin(playerAnimState.hurtFlash * 20) > 0 ? 1 : 0;
      player.children.forEach(function (child) {
        if (child.isMesh && child.material && child.material.emissive !== undefined) {
          if (flashIntensity) {
            child.material.emissive.setHex(0xff0000);
            child.material.emissiveIntensity = 0.5;
          } else {
            child.material.emissive.setHex(0x000000);
          }
        }
      });
    }
  }

  // 攻击动画计时器
  if (playerAnimState.attackTimer > 0) {
    playerAnimState.attackTimer -= delta;
  }

  // 眨眼动画
  playerAnimState.blinkTimer -= delta;
  if (playerAnimState.blinkTimer <= 0 && !playerAnimState.isBlinking) {
    playerAnimState.isBlinking = true;
    setTimeout(function () {
      playerAnimState.isBlinking = false;
      playerAnimState.blinkTimer = 2 + Math.random() * 4;
    }, 150);
  }
}

// 播放受击动画
function playHurtAnimation() {
  if (!player) return;
  playerAnimState.hurt = true;
  playerAnimState.hurtFlash = 0.5;

  // 击退效果
  playerVelY = Math.max(playerVelY, 3);
  player.position.y += 0.3;
}

// 播放攻击动画
function playAttackAnimation() {
  if (!player) return;
  playerAnimState.attackTimer = 0.3;

  // 攻击时身体前倾
  var originalRotX = player.rotation.x;
  player.rotation.x = -0.2;

  setTimeout(function () {
    if (player) {
      player.rotation.x = originalRotX;
    }
  }, 200);
}

// 播放技能动画
function playSkillAnimation() {
  if (!player) return;
  playerAnimState.skill = true;

  // 技能时身体上浮
  var skillFloat = setInterval(function () {
    if (!player || !playerAnimState.skill) {
      clearInterval(skillFloat);
      return;
    }
    player.position.y = playerAnimState.baseY + Math.sin(Date.now() * 0.01) * 0.2;
  }, 16);

  setTimeout(function () {
    playerAnimState.skill = false;
    if (player) {
      player.position.y = playerAnimState.baseY;
    }
    clearInterval(skillFloat);
  }, 3000);
}

// 创建角色脚下的状态光环
function createPlayerAura(color, opacity) {
  // 移除旧光环
  if (player.userData.aura) {
    try { player.remove(player.userData.aura); } catch (e) { }
  }

  var auraGeo = new THREE.RingGeometry(0.5, 0.7, 32);
  var auraMat = new THREE.MeshBasicMaterial({
    color: color,
    transparent: true,
    opacity: opacity || 0.4,
    side: THREE.DoubleSide
  });
  var aura = new THREE.Mesh(auraGeo, auraMat);
  aura.rotation.x = -Math.PI / 2;
  aura.position.y = 0.05;
  player.add(aura);
  player.userData.aura = aura;

  return aura;
}

// 更新角色光环
function updatePlayerAura(time) {
  if (!player || !player.userData.aura) return;

  var aura = player.userData.aura;
  var pulse = 1 + Math.sin(time * 3) * 0.15;
  aura.scale.set(pulse, pulse, pulse);
  aura.material.opacity = 0.3 + Math.sin(time * 2) * 0.15;
  aura.rotation.z += 0.02;
}

// 播放脚底光环特效（受击/治疗等）
function playAuraEffect(color, duration) {
  if (!player) return;

  var particles = [];
  for (var i = 0; i < 12; i++) {
    var angle = (Math.PI * 2 / 12) * i;
    var particle = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 4, 4),
      new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.8 })
    );
    particle.position.set(Math.cos(angle) * 0.6, 0.1, Math.sin(angle) * 0.6);
    player.add(particle);
    particles.push({ mesh: particle, angle: angle, radius: 0.6 });
  }

  var startTime = Date.now();
  var animateParticles = setInterval(function () {
    var elapsed = (Date.now() - startTime) / 1000;
    if (elapsed > duration) {
      particles.forEach(function (p) {
        try { player.remove(p.mesh); } catch (e) { }
      });
      clearInterval(animateParticles);
      return;
    }

    particles.forEach(function (p, idx) {
      p.angle += 0.05;
      var yOffset = Math.sin(elapsed * 3 + idx) * 0.2;
      p.mesh.position.set(
        Math.cos(p.angle) * p.radius,
        0.1 + yOffset,
        Math.sin(p.angle) * p.radius
      );
      p.mesh.material.opacity = 0.8 - (elapsed / duration) * 0.8;
    });
  }, 16);
}
