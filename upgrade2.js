const fs=require('fs');
let html=fs.readFileSync('game.html','utf8').replace(/\r\n/g,'\n');
let fails=0;
function r(f,r2,n){if(html.includes(f)){html=html.replace(f,r2);}else{console.log('FAIL:',n);fails++;}}

// 1. 给 GS 追加 energy/escaping
r(`  canJump:true,
  inSecondRoom:false,`,
`  canJump:true,
  inSecondRoom:false,
  energy:0,
  escaping:false,`,'gs-energy');

// 2. 创建 startEscape + 怪物恐怖模型改版
r(`// ============================================================
// 跳跃系统
// ============================================================`,
`// ============================================================
// 逃离升空动画
// ============================================================
function startEscape(){
  if(GS.escaping)return;
  GS.escaping=true;GS.running=false;
  showMessage('🚀 能量集满! 引擎启动!',0x66ffcc);
  AudioMgr.playSkill();
  var phase=0,shipPos=ship.position.clone();
  var si=setInterval(function(){
    if(!ship||!ship.parent){clearInterval(si);return;}
    phase+=0.02;
    ship.position.y+=phase*1.2;
    ship.rotation.x+=0.02;
    ship.position.x+=Math.sin(phase*4)*0.05;
    var ring=ship.userData.ring;
    if(ring)ring.material.opacity=Math.max(0,ring.material.opacity-0.02);
    // 尾部喷射粒子
    for(var pi=0;pi<3;pi++){
      var pp=new THREE.Mesh(new THREE.SphereGeometry(0.04,4,4),
        new THREE.MeshBasicMaterial({color:[0xff6600,0xffaa00,0xff4400][pi],transparent:true,opacity:0.8}));
      pp.position.set(shipPos.x+(Math.random()-0.5)*0.4,ship.position.y-0.5,shipPos.z+(Math.random()-0.5)*0.4);
      pp.userData={vel:new THREE.Vector3((Math.random()-0.5)*0.5,-2-Math.random()*2,(Math.random()-0.5)*0.5),life:0.8,fade:true};
      scene.add(pp);projectiles.push(pp);
    }
    if(ship.position.y>15){
      clearInterval(si);
      scene.remove(ship);
      gameWin();
    }
  },30);
}

// ============================================================
// 跳跃系统
// ============================================================`,'startEscape');

// 3. init() 中 spawnEnergyOrb
r(`  buildWeaponBar();

  // 初始化音频系统
  AudioMgr.init();`,
`  buildWeaponBar();

  // 初始化音频系统
  AudioMgr.init();

  // 首颗能量球
  setTimeout(spawnEnergyOrb,1500);`,'init-orb');

// 4. 删除 quizItems 残余引用
r(`  quizItems.forEach(function(item){
    if(item.userData.active){
      var ix=offsetX+item.position.x*scale;
      var iz=offsetZ+item.position.z*scale;
      ctx.fillStyle='#ffd700';
      ctx.beginPath();
      ctx.arc(ix,iz,2.5,0,Math.PI*2);
      ctx.fill();
    }
  });`,'','minimap-quiz');

r(`quizItems=[];
  var count=3+Math.floor(Math.random()*2);
  var mat=new THREE.MeshStandardMaterial`,`quizItems=[];`,'quizItems-init');

r(`var walls=[],quizItems=[],projectiles=[];`,`var walls=[],projectiles=[];`,'quizItems-var');

// 5. 恐怖怪物类型定义重写 - 红色/暗色/多眼/獠牙
r(`var MONSTER_TYPES={
  '追风怪':{color:0x44aaff,emissive:0x2288dd,eyes:3,speed:2.5,hp:100,dmg:10,scale:1},
  '冰晶兽':{color:0x66ddff,emissive:0x44aaff,eyes:2,speed:2.0,hp:120,dmg:12,scale:1.1,spikes:true},
  '霜刺虫':{color:0x99ccff,emissive:0x6699ff,eyes:4,speed:3.2,hp:80,dmg:8,scale:0.8},
  '沙暴灵':{color:0xddaa44,emissive:0xbb8822,eyes:1,speed:2.8,hp:110,dmg:12,scale:1},
  '沙蝎':{color:0xcc8833,emissive:0xaa6611,eyes:2,speed:3.5,hp:90,dmg:14,scale:0.9,spikes:true},
  '熔岩怪':{color:0xff5522,emissive:0xdd3300,eyes:2,speed:2.2,hp:140,dmg:15,scale:1.15},
  '火蜥蜴':{color:0xff8844,emissive:0xdd5522,eyes:2,speed:3.8,hp:85,dmg:10,scale:0.85},
  '烈焰鸟':{color:0xffaa33,emissive:0xff6600,eyes:2,speed:4.2,hp:70,dmg:9,scale:0.75,fly:true},
  '星灵':{color:0xaa66ff,emissive:0x8844dd,eyes:3,speed:3.0,hp:120,dmg:13,scale:1,fly:true},
  '虚空兽':{color:0x6633aa,emissive:0x442288,eyes:5,speed:2.6,hp:150,dmg:16,scale:1.2,spikes:true},
  '陨石龙':{color:0x8855ff,emissive:0x6633dd,eyes:2,speed:3.4,hp:130,dmg:14,scale:1.1,spikes:true}
};
var BOSSES={
  1:{name:'森林守护者',color:0x22cc55,emissive:0x119933,eyes:3,speed:2.0,hp:300,dmg:18,scale:2.0,spikes:true},
  2:{name:'冰霜巨人',color:0x55bbff,emissive:0x3399ff,eyes:2,speed:1.8,hp:340,dmg:20,scale:2.2,spikes:true},
  3:{name:'法老之魂',color:0xffcc44,emissive:0xdd9922,eyes:1,speed:2.2,hp:380,dmg:22,scale:2.0},
  4:{name:'炎魔领主',color:0xff3300,emissive:0xcc1100,eyes:2,speed:2.4,hp:420,dmg:25,scale:2.3,spikes:true},
  5:{name:'虚空主宰',color:0x9922ff,emissive:0x6600cc,eyes:5,speed:2.6,hp:500,dmg:28,scale:2.5,spikes:true}
};`,
`var MONSTER_TYPES={
  '追风怪':{color:0xaa2244,emissive:0xcc1144,eyes:6,speed:2.5,hp:100,dmg:10,scale:1.1,spikes:true,fangs:true},
  '冰晶兽':{color:0x4488aa,emissive:0x2266cc,eyes:4,speed:2.0,hp:120,dmg:12,scale:1.2,spikes:true,fangs:true},
  '霜刺虫':{color:0x553366,emissive:0x8844aa,eyes:8,speed:3.2,hp:80,dmg:8,scale:0.7,spikes:true},
  '沙暴灵':{color:0x663322,emissive:0xaa4422,eyes:3,speed:2.8,hp:110,dmg:12,scale:1,fangs:true},
  '沙蝎':{color:0x442211,emissive:0x883311,eyes:6,speed:3.5,hp:90,dmg:14,scale:0.8,spikes:true},
  '熔岩怪':{color:0x881100,emissive:0xff3300,eyes:4,speed:2.2,hp:140,dmg:15,scale:1.15,spikes:true,fangs:true},
  '火蜥蜴':{color:0x992200,emissive:0xcc3300,eyes:4,speed:3.8,hp:85,dmg:10,scale:0.85,fangs:true},
  '烈焰鸟':{color:0x661100,emissive:0xcc4400,eyes:4,speed:4.2,hp:70,dmg:9,scale:0.65,fly:true,fangs:true},
  '星灵':{color:0x442266,emissive:0x8844dd,eyes:5,speed:3.0,hp:120,dmg:13,scale:0.9,fly:true},
  '虚空兽':{color:0x1a0a33,emissive:0x440099,eyes:7,speed:2.6,hp:150,dmg:16,scale:1.3,spikes:true,fangs:true},
  '陨石龙':{color:0x331144,emissive:0x6622cc,eyes:4,speed:3.4,hp:130,dmg:14,scale:1.1,spikes:true,fangs:true}
};
var BOSSES={
  1:{name:'森林守护者',color:0x116611,emissive:0x119933,eyes:4,speed:2.0,hp:300,dmg:18,scale:2.2,spikes:true,fangs:true},
  2:{name:'冰霜巨人',color:0x224477,emissive:0x3399ff,eyes:3,speed:1.8,hp:340,dmg:20,scale:2.4,spikes:true,fangs:true},
  3:{name:'法老之魂',color:0x664411,emissive:0xcc8822,eyes:2,speed:2.2,hp:380,dmg:22,scale:2.2,fangs:true},
  4:{name:'炎魔领主',color:0x771100,emissive:0xcc2200,eyes:4,speed:2.4,hp:420,dmg:25,scale:2.5,spikes:true,fangs:true},
  5:{name:'虚空主宰',color:0x330066,emissive:0x6600cc,eyes:8,speed:2.6,hp:500,dmg:28,scale:2.7,spikes:true,fangs:true}
};`,'monster-types');

// 6. buildMonsterMesh 中眼白变红,尖牙,血纹
r(`// 眼睛：按数量在前方弧线排布
  var eyeCount=t.eyes||2;
  for(var ei=0;ei<eyeCount;ei++){
    var a=(ei-(eyeCount-1)/2)*0.5;
    var ex=Math.sin(a)*0.55;
    var ez=Math.cos(a)*0.55;
    var ey=0.95+(ei%2)*0.12;
    var eyeWhite=new THREE.Mesh(new THREE.SphereGeometry(0.14,8,8),new THREE.MeshStandardMaterial({color:0xffffff}));
    eyeWhite.position.set(ex,ey,ez);g.add(eyeWhite);
    var pupilMat=new THREE.MeshStandardMaterial({color:0x22dd66,emissive:0x22dd66,emissiveIntensity:0.3});
    var pupil=new THREE.Mesh(new THREE.BoxGeometry(0.04,0.1,0.02),pupilMat);
    pupil.position.set(ex*1.05,ey,ez*1.05);g.add(pupil);
    var highlight=new THREE.Mesh(new THREE.SphereGeometry(0.03,6,6),new THREE.MeshBasicMaterial({color:0xffffff}));
    highlight.position.set(ex*1.1,ey+0.04,ez*1.1);g.add(highlight);
  }`,
`// 恐怖眼睛：数量多、血红瞳孔
  var eyeCount=t.eyes||2;
  for(var ei=0;ei<eyeCount;ei++){
    var a=(ei-(eyeCount-1)/2)*0.55;
    var ex=Math.sin(a)*0.55;
    var ez=Math.cos(a)*0.55;
    var ey=0.9+(ei%3)*0.1;
    var eyeWhite=new THREE.Mesh(new THREE.SphereGeometry(0.13,8,8),new THREE.MeshStandardMaterial({color:0xddbbbb}));
    eyeWhite.position.set(ex,ey,ez);g.add(eyeWhite);
    var pupilMat=new THREE.MeshStandardMaterial({color:0xff0000,emissive:0xff0000,emissiveIntensity:0.6});
    var pupil=new THREE.Mesh(new THREE.BoxGeometry(0.05,0.08,0.02),pupilMat);
    pupil.position.set(ex*1.05,ey,ez*1.05);g.add(pupil);
    var highlight=new THREE.Mesh(new THREE.SphereGeometry(0.025,6,6),new THREE.MeshBasicMaterial({color:0xff6666}));
    highlight.position.set(ex*1.1,ey+0.03,ez*1.1);g.add(highlight);
    // 血丝(细长立方体)
    for(var vs=0;vs<2;vs++){
      var vein=new THREE.Mesh(new THREE.BoxGeometry(0.01,0.06,0.01),new THREE.MeshBasicMaterial({color:0xcc3333,transparent:true,opacity:0.5}));
      vein.position.set(ex+((Math.random()-0.5)*0.12),ey+0.03+Math.random()*0.08,ez*1.08);
      vein.rotation.z=(Math.random()-0.5)*0.4;
      g.add(vein);
    }
  }`,'red-eyes');

// 7. 獠牙
r(`  // 嘴巴 - 波浪形
  var mouthMat=new THREE.MeshStandardMaterial({color:0x66bbee,roughness:0.5});
  [-0.15,0,0.15].forEach(function(ox,i){
    var mSeg=new THREE.Mesh(new THREE.SphereGeometry(0.03,6,6),mouthMat);
    mSeg.position.set(ox,0.55,0.75);g.add(mSeg);
  });`,
`  // 恐怖嘴巴带獠牙
  var mouthMat=new THREE.MeshStandardMaterial({color:0x661111,roughness:0.9});
  [-0.15,0,0.15].forEach(function(ox,i){
    var mSeg=new THREE.Mesh(new THREE.SphereGeometry(0.04,6,6),mouthMat);
    mSeg.position.set(ox,0.5,0.75);g.add(mSeg);
  });
  if(t.fangs){
    var fangMat=new THREE.MeshStandardMaterial({color:0xeeddcc,roughness:0.3});
    [-0.12,0.12].forEach(function(fx){
      var fang=new THREE.Mesh(new THREE.ConeGeometry(0.025,0.12,4),fangMat);
      fang.position.set(fx,0.46,0.82);
      fang.rotation.x=0.3;fang.rotation.z=fx*2;
      g.add(fang);
    });
  }`,'fangs');

// 8. 触角变血色尖刺
r(`  // 触角
  var antennaMat=new THREE.MeshStandardMaterial({color:t.color,roughness:0.5});
  [[-0.3,1.3,0.3],[0.3,1.3,0.3]].forEach(function(p){
    var stem=new THREE.Mesh(new THREE.CylinderGeometry(0.015,0.025,0.3,6),antennaMat);
    stem.position.set(p[0],p[1],p[2]);stem.rotation.x=-0.3;g.add(stem);
    var bulb=new THREE.Mesh(new THREE.SphereGeometry(0.06,6,6),new THREE.MeshStandardMaterial({color:t.emissive,emissive:t.emissive,emissiveIntensity:0.4}));
    bulb.position.set(p[0]-0.05,p[1]+0.2,p[2]-0.05);g.add(bulb);
  });`,
`  // 血色触角/骨刺
  var antennaMat=new THREE.MeshStandardMaterial({color:0x330011,roughness:0.7});
  [[-0.3,1.3,0.2],[0.3,1.3,0.2]].forEach(function(p){
    var stem=new THREE.Mesh(new THREE.ConeGeometry(0.03,0.35,5),antennaMat);
    stem.position.set(p[0],p[1],p[2]);stem.rotation.x=-0.3;g.add(stem);
    var bulb=new THREE.Mesh(new THREE.SphereGeometry(0.04,6,6),new THREE.MeshStandardMaterial({color:0xff2200,emissive:0xff0000,emissiveIntensity:0.5}));
    bulb.position.set(p[0]-0.04,p[1]+0.22,p[2]-0.04);
    g.add(bulb);
  });`,'antennae');

// 9. 条纹变血纹
r(`  // 身体条纹
  var stripeMat=new THREE.MeshStandardMaterial({color:t.color,roughness:0.5,transparent:true,opacity:0.3});
  for(var si=0;si<5;si++){
    var stripe=new THREE.Mesh(new THREE.TorusGeometry(0.6+si*0.05,0.02,6,16),stripeMat);
    stripe.position.y=0.5+si*0.15;stripe.rotation.x=Math.PI/2;g.add(stripe);
  }`,
`  // 暗红血纹
  var stripeMat=new THREE.MeshStandardMaterial({color:0x440000,roughness:0.5,transparent:true,opacity:0.45});
  for(var si=0;si<5;si++){
    var stripe=new THREE.Mesh(new THREE.TorusGeometry(0.6+si*0.05,0.025,6,16),stripeMat);
    stripe.position.y=0.5+si*0.15;stripe.rotation.x=Math.PI/2;g.add(stripe);
  }`,'stripes');

// 10. 怪物跨房间追击(移除 inSecondRoom 检查)
r(`  if(GS.inSecondRoom)return;
  if(!monster.userData.active)return;`,`  if(!monster.userData.active)return;`,'monster-ai-room');

// 11. 更新 updateMonster 检测玩家在任何房间
r(`  // Boss 远程火球攻击
  if(monster.userData.isBoss){`,
`  // Boss 远程火球攻击(全图追踪)
  if(monster.userData.isBoss){`,'boss-ball-comment');

// 12. 迷你地图重写
r(`function updateMinimap(){
  var canvas=document.getElementById('minimap-canvas');
  if(!canvas)return;
  var ctx=canvas.getContext('2d');
  var w=80,h=80;
  ctx.fillStyle='rgba(0,3,0,0.5)';
  ctx.fillRect(0,0,w,h);

  var totalZ=halfRoom*2+halfRoom;
  var totalX=halfRoom*2;
  var scale=Math.min(w/totalX,h/totalZ)*0.9;
  var offsetX=w/2;
  var offsetZ=h-totalZ*scale/2-5;

  ctx.strokeStyle='rgba(255,255,255,0.2)';
  ctx.lineWidth=1;
  ctx.strokeRect(offsetX-halfRoom*scale,offsetZ-halfRoom*scale,halfRoom*2*scale,halfRoom*2*scale);
  ctx.strokeRect(offsetX-halfRoom*scale,offsetZ+halfRoom*scale,halfRoom*2*scale,halfRoom*2*scale);

  ctx.fillStyle='rgba(68,255,136,0.3)';
  ctx.fillRect(offsetX-0.5*scale,offsetZ+halfRoom*scale-2,1*scale,4);

  quizItems.forEach(function(item){
    if(item.userData.active){
      var ix=offsetX+item.position.x*scale;
      var iz=offsetZ+item.position.z*scale;
      ctx.fillStyle='#ffd700';
      ctx.beginPath();
      ctx.arc(ix,iz,2.5,0,Math.PI*2);
      ctx.fill();
    }
  });

  if(monster&&monster.userData.active){
    var mx=offsetX+monster.position.x*scale;
    var mz=offsetZ+monster.position.z*scale;
    ctx.fillStyle='#ff4444';
    ctx.beginPath();
    ctx.arc(mx,mz,3,0,Math.PI*2);
    ctx.fill();
  }

  var cx=offsetX+player.position.x*scale;
  var cz=offsetZ+player.position.z*scale;
  ctx.fillStyle='#44ff88';
  ctx.beginPath();
  ctx.arc(cx,cz,3,0,Math.PI*2);
  ctx.fill();

  var angle=player.rotation.y;
  ctx.strokeStyle='#44ff88';
  ctx.lineWidth=1;
  ctx.beginPath();
  ctx.moveTo(cx,cz);
  ctx.lineTo(cx+Math.sin(angle)*8,cz+Math.cos(angle)*8);
  ctx.stroke();
}`,
`function updateMinimap(){
  var canvas=document.getElementById('minimap-canvas');
  if(!canvas)return;
  var ctx=canvas.getContext('2d');
  var w=120,h=120;
  ctx.fillStyle='rgba(0,0,0,0.6)';
  ctx.fillRect(0,0,w,h);

  // 绘制5个房间
  var minX=-halfRoom-20,minZ=-halfRoom-20;
  var totalX=(halfRoom+20)*2,totalZ=(halfRoom+20)*2;
  var scale=Math.min(w/totalX,h/totalZ)*0.9;
  var ox=w/2,oz=h/2;

  ROOMS.forEach(function(rm){
    var rx=ox+rm.cx*scale,rz=oz+rm.cz*scale;
    ctx.strokeStyle='rgba(200,180,160,0.35)';
    ctx.lineWidth=1;
    ctx.strokeRect(rx-halfRoom*scale,rz-halfRoom*scale,roomSize*scale,roomSize*scale);
    if(rm.cx===0&&rm.cz===0){
      ctx.fillStyle='rgba(255,215,0,0.08)';
      ctx.fillRect(rx-halfRoom*scale,rz-halfRoom*scale,roomSize*scale,roomSize*scale);
    }
    // 房间名
    ctx.fillStyle='rgba(200,200,200,0.2)';
    ctx.font='8px sans-serif';
    ctx.textAlign='center';
    ctx.fillText(rm.name,rx,rz+2);
  });

  // 门洞
  ctx.fillStyle='rgba(100,200,100,0.25)';
  var G=DOOR_HALF;
  [[0,-halfRoom,0,H],[0,halfRoom,0,-H],[-halfRoom,0,H,0],[halfRoom,0,-H,0]].forEach(function(d){
    ctx.fillRect(ox+d[0]*scale-G*scale,oz+d[1]*scale-2,G*2*scale,4);
  });

  // 飞船(中央)
  if(ship){
    var sx=ox+ship.position.x*scale,sz=oz+ship.position.z*scale;
    ctx.fillStyle=GS.energy>=5?'#66ffcc':'#99aabb';
    ctx.beginPath();
    ctx.moveTo(sx-8,sz+6);
    ctx.lineTo(sx-5,sz-6);
    ctx.lineTo(sx+5,sz-6);
    ctx.lineTo(sx+8,sz+6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle=GS.energy>=5?'#66ffcc':'#99aabb';
    ctx.lineWidth=1;
    ctx.stroke();
  }

  // 能量球
  if(energyOrb&&energyOrb.parent){
    var ex=ox+energyOrb.position.x*scale,ez=oz+energyOrb.position.z*scale;
    ctx.fillStyle='#ffd700';
    ctx.beginPath();
    ctx.arc(ex,ez,4,0,Math.PI*2);
    ctx.fill();
    // 发光光晕
    ctx.strokeStyle='rgba(255,215,0,0.4)';
    ctx.lineWidth=2;
    ctx.beginPath();
    ctx.arc(ex,ez,6,0,Math.PI*2);
    ctx.stroke();
  }

  // 怪物
  if(monster&&monster.userData.active){
    var mx=ox+monster.position.x*scale,mz=oz+monster.position.z*scale;
    ctx.fillStyle='#ff2244';
    ctx.beginPath();
    ctx.arc(mx,mz,4,0,Math.PI*2);
    ctx.fill();
    ctx.fillStyle='rgba(255,34,68,0.3)';
    ctx.beginPath();
    ctx.arc(mx,mz,7,0,Math.PI*2);
    ctx.fill();
  }

  // 玩家
  var cx=ox+player.position.x*scale,cz=oz+player.position.z*scale;
  ctx.fillStyle='#44ff88';
  ctx.beginPath();
  ctx.arc(cx,cz,3.5,0,Math.PI*2);
  ctx.fill();
  ctx.strokeStyle='#44ff88';
  ctx.lineWidth=1.5;
  ctx.beginPath();
  ctx.moveTo(cx,cz);
  ctx.lineTo(cx+Math.sin(player.rotation.y)*9,cz+Math.cos(player.rotation.y)*9);
  ctx.stroke();

  // 能量进度
  ctx.fillStyle='rgba(0,0,0,0.4)';
  ctx.fillRect(2,2,50,8);
  ctx.fillStyle='#66ffcc';
  ctx.fillRect(3,3,(GS.energy/5)*44,6);
  ctx.fillStyle='rgba(200,240,220,0.5)';
  ctx.font='7px sans-serif';
  ctx.textAlign='left';
  ctx.fillText('🔋'+GS.energy+'/5',4,9);
}`,'minimap-replace');

fs.writeFileSync('game.html',html);
if(fails)console.log('FAILS:',fails);
else console.log('ALL OK');