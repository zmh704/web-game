const fs=require('fs');
let html=fs.readFileSync('game.html','utf8').replace(/\r\n/g,'\n');
let fails=[];
function rep(find,replace,name){
  if(html.includes(find)){html=html.replace(find,replace);}
  else fails.push(name);
}
function sliceRep(startMark,endMark,replace,name){
  const s=html.indexOf(startMark);
  const e=html.indexOf(endMark);
  if(s<0||e<0||e<=s){fails.push(name);return;}
  html=html.slice(0,s)+replace+html.slice(e);
}

// ---------- 1. 全局几何常量 ----------
rep(`var roomSize=30,halfRoom=15;`,
`var roomSize=20,halfRoom=10;
var ROOMS=[
  {cx:0,cz:0,name:'中央'},
  {cx:0,cz:-20,name:'北'},
  {cx:20,cz:0,name:'东'},
  {cx:0,cz:20,name:'南'},
  {cx:-20,cz:0,name:'西'}
];
var DOOR_HALF=1.8;
var DOOR_POS={1:{x:0,z:-10},2:{x:10,z:0},3:{x:0,z:10},4:{x:-10,z:0}};
function roomIndexOf(x,z){
  var best=0,bd=1e9;
  for(var i=0;i<ROOMS.length;i++){
    var d=Math.abs(x-ROOMS[i].cx)+Math.abs(z-ROOMS[i].cz);
    if(d<bd){bd=d;best=i;}
  }
  return best;
}
var ship=null,energyOrb=null;`,'globals');

// ---------- 2. buildRoom 整体重写 ----------
sliceRep('function buildRoom(){','// 章节主题装饰物',
`function buildRoom(){
  var chapterData=CHAPTERS[GS.chapter-1]||CHAPTERS[0];
  scene.background=new THREE.Color(chapterData.bgColor);
  scene.fog=new THREE.Fog(chapterData.fogColor,12,30);

  var floorMat=new THREE.MeshStandardMaterial({color:chapterData.floorColor,roughness:0.92,metalness:0.05});
  var wallMat=new THREE.MeshStandardMaterial({color:chapterData.wallColor,roughness:0.95,side:THREE.DoubleSide});

  // 5 个房间的地板与网格
  ROOMS.forEach(function(rm){
    var floor=new THREE.Mesh(new THREE.PlaneGeometry(roomSize,roomSize),floorMat);
    floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;
    floor.position.set(rm.cx,groundY,rm.cz);
    scene.add(floor);
    var grid=new THREE.GridHelper(roomSize,10,0x1c232e,0x141a22);
    grid.position.set(rm.cx,groundY+0.01,rm.cz);
    scene.add(grid);
  });

  function wallSeg(cx,cz,len,ry){
    var wall=new THREE.Mesh(new THREE.PlaneGeometry(len,4),wallMat);
    wall.position.set(cx,2,cz);wall.rotation.y=ry;
    scene.add(wall);walls.push(wall);
  }
  var H=halfRoom,G=DOOR_HALF;
  var segLen=H-G,segMid=(H+G)/2;
  // 内部隔墙(带门洞)
  [-H,H].forEach(function(p){
    wallSeg(-segMid,p,segLen,0);wallSeg(segMid,p,segLen,0);
    wallSeg(p,-segMid,segLen,Math.PI/2);wallSeg(p,segMid,segLen,Math.PI/2);
  });
  // 北房间外墙
  wallSeg(0,-3*H,roomSize,0);
  wallSeg(-H,-2*H,roomSize,Math.PI/2);wallSeg(H,-2*H,roomSize,Math.PI/2);
  // 南房间外墙
  wallSeg(0,3*H,roomSize,0);
  wallSeg(-H,2*H,roomSize,Math.PI/2);wallSeg(H,2*H,roomSize,Math.PI/2);
  // 东房间外墙
  wallSeg(3*H,0,roomSize,Math.PI/2);
  wallSeg(2*H,-H,roomSize,0);wallSeg(2*H,H,roomSize,0);
  // 西房间外墙
  wallSeg(-3*H,0,roomSize,Math.PI/2);
  wallSeg(-2*H,-H,roomSize,0);wallSeg(-2*H,H,roomSize,0);

  // 门洞框(阴森黑木)
  var frameMat=new THREE.MeshStandardMaterial({color:0x1a1014,roughness:0.9});
  [[0,-H,0],[0,H,0],[-H,0,1],[H,0,1]].forEach(function(d){
    [-1,1].forEach(function(s){
      var pillar=new THREE.Mesh(new THREE.BoxGeometry(0.3,3.6,0.3),frameMat);
      if(d[2]===0)pillar.position.set(d[0]+s*(G+0.2),1.8,d[1]);
      else pillar.position.set(d[0],1.8,d[1]+s*(G+0.2));
      scene.add(pillar);
    });
    var beam=new THREE.Mesh(new THREE.BoxGeometry(d[2]===0?G*2+0.7:0.3,0.3,d[2]===0?0.3:G*2+0.7),frameMat);
    beam.position.set(d[0],3.6,d[1]);
    scene.add(beam);
  });

  // 家具与掩体分布在各房间
  createTable(-4,groundY,-2*H-4,0x4a3328);
  createTable(4,groundY,-2*H+4,0x3a2a20);
  createChair(-6,groundY,-2*H+2);
  createChair(5,groundY,-2*H-5);
  createBed(4,groundY,2*H+4);
  createBookshelf(-3,groundY,2*H-3);
  createChest(0,groundY,2*H+7);
  createBookshelf(2*H+4,groundY,3);
  createObstacle(2*H-4,groundY,-5,0x334444);
  createObstacle(2*H+5,groundY,5,0x443333);
  createObstacle(-2*H+4,groundY,5,0x333a44);
  createObstacle(-2*H-5,groundY,-4,0x3a3344);
  createChair(-2*H-3,groundY,4);

  // 逃生飞船(中央房间)
  createShip();

  // 章节主题装饰
  addChapterDecorations(chapterData);
}

// ============================================================
// 逃生飞船
// ============================================================
function createShip(){
  var g=new THREE.Group();
  var bodyMat=new THREE.MeshStandardMaterial({color:0x99aabb,roughness:0.35,metalness:0.7});
  var body=new THREE.Mesh(new THREE.CylinderGeometry(0.9,1.2,2.4,12),bodyMat);
  body.position.y=1.6;body.castShadow=true;g.add(body);
  var nose=new THREE.Mesh(new THREE.ConeGeometry(0.9,1.5,12),new THREE.MeshStandardMaterial({color:0xbb4444,roughness:0.4,metalness:0.5}));
  nose.position.y=3.55;g.add(nose);
  var win=new THREE.Mesh(new THREE.SphereGeometry(0.28,10,10),new THREE.MeshStandardMaterial({color:0x66ddff,emissive:0x3399cc,emissiveIntensity:0.7}));
  win.position.set(0,2.1,0.95);g.add(win);
  var finMat=new THREE.MeshStandardMaterial({color:0xbb4444,roughness:0.5});
  var legMat=new THREE.MeshStandardMaterial({color:0x555566,metalness:0.6,roughness:0.5});
  for(var i=0;i<3;i++){
    var a=i*Math.PI*2/3;
    var fin=new THREE.Mesh(new THREE.BoxGeometry(0.12,1.3,0.8),finMat);
    fin.position.set(Math.sin(a)*1.15,0.75,Math.cos(a)*1.15);
    fin.rotation.y=a;g.add(fin);
    var a2=a+Math.PI/3;
    var leg=new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.07,0.9,6),legMat);
    leg.position.set(Math.sin(a2)*1.25,0.45,Math.cos(a2)*1.25);
    leg.rotation.z=Math.sin(a2)*0.3;leg.rotation.x=-Math.cos(a2)*0.3;
    g.add(leg);
  }
  // 能量指示环
  var ring=new THREE.Mesh(new THREE.TorusGeometry(2.1,0.06,8,32),new THREE.MeshBasicMaterial({color:0x44ff88,transparent:true,opacity:0.3}));
  ring.rotation.x=Math.PI/2;ring.position.y=0.12;g.add(ring);
  g.userData={ring:ring};
  g.position.set(0,groundY,0);
  scene.add(g);
  ship=g;
}

// 章节主题装饰物`,'buildRoom');

// ---------- 3. 装饰物分布到各房间 ----------
rep(`  var positions=[[-10,-10],[10,-8],[-8,8],[9,9],[-12,2],[12,-3]];`,
`  var positions=[];
  ROOMS.forEach(function(rm,idx){
    if(idx===0){positions.push([rm.cx-7,rm.cz-7],[rm.cx+7,rm.cz+7]);}
    else{positions.push([rm.cx-6,rm.cz-6],[rm.cx+6,rm.cz+5],[rm.cx-4,rm.cz+7]);}
  });`,'deco-positions');

// ---------- 4. spawnQuizItems → 能量球系统 ----------
sliceRep('function spawnQuizItems(){',`// ============================================================
// 武器栏`,
`// ============================================================
// 能量球系统：一次一个，随机房间刷新
// ============================================================
function spawnEnergyOrb(){
  if(GS.gameOver||GS.energy>=5)return;
  var rm=ROOMS[Math.floor(Math.random()*ROOMS.length)];
  var x=rm.cx+(Math.random()-0.5)*(roomSize-6);
  var z=rm.cz+(Math.random()-0.5)*(roomSize-6);
  if(rm.cx===0&&rm.cz===0){
    if(Math.abs(x)<3.5)x=x<0?-5:5;
    if(Math.abs(z)<3.5)z=z<0?-5:5;
  }
  var orb=new THREE.Mesh(new THREE.SphereGeometry(0.5,14,14),
    new THREE.MeshStandardMaterial({color:0xffd700,emissive:0xffd700,emissiveIntensity:0.7,transparent:true,opacity:0.9}));
  orb.position.set(x,1.2,z);
  var glow=new THREE.Mesh(new THREE.SphereGeometry(0.85,12,12),
    new THREE.MeshBasicMaterial({color:0xffd700,transparent:true,opacity:0.12,side:THREE.DoubleSide}));
  orb.add(glow);
  // 冲天光柱便于寻找
  var beam=new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.3,8,8,1,true),
    new THREE.MeshBasicMaterial({color:0xffd700,transparent:true,opacity:0.15,side:THREE.DoubleSide}));
  beam.position.y=3.5;orb.add(beam);
  orb.userData={active:true,cooldown:0,floatPhase:Math.random()*Math.PI*2};
  scene.add(orb);
  energyOrb=orb;
  showMessage('💫 能量球出现了! 查看小地图',0xffd700);
}

function consumeEnergyOrb(){
  if(!energyOrb)return;
  scene.remove(energyOrb);
  energyOrb=null;
  if(GS.energy<5)setTimeout(spawnEnergyOrb,3000);
}

`,'energy-orb');

// ---------- 5. showQuiz 奖励重写 ----------
rep(`        var reward=q.reward;
        if(reward&&!GS.weapons[reward]){
          GS.weapons[reward]=WEAPONS[reward];
          GS.weaponCount++;
          if(!GS.curWeapon)GS.curWeapon=reward;
          updateWeaponBar();
          document.getElementById('quiz-reward').textContent='🎉 获得武器: '+WEAPONS[reward].icon+' '+reward+'!';
          document.getElementById('quiz-reward').style.display='block';
          showMessage('🎉 获得 '+reward+'!',0xffd700);
          createWeaponGetEffect();
        }else{
          GS.stars+=5;
          document.getElementById('quiz-reward').textContent='⭐ 答对! +15星星! 技能能量+'+GS.character==='qike'?'⚡':'🛡️';
          document.getElementById('quiz-reward').style.display='block';
          document.getElementById('quiz-reward').style.color='#ffd700';
        }
      }else{
        document.getElementById('quiz-reward').textContent='💪 再想想哦~ 继续加油!';
        document.getElementById('quiz-reward').style.display='block';
        document.getElementById('quiz-reward').style.color='#88ccff';
      }`,
`        // 解锁成功: 获得能量 + 随机武器
        GS.energy=Math.min(5,GS.energy+1);
        var lockedW=WEAPON_LIST.filter(function(n){return !GS.weapons[n]});
        var rmsg='🔋 解锁成功! 获得能量 ('+GS.energy+'/5)';
        if(lockedW.length>0){
          var wn=lockedW[Math.floor(Math.random()*lockedW.length)];
          GS.weapons[wn]=WEAPONS[wn];
          GS.weaponCount++;
          if(!GS.curWeapon)GS.curWeapon=wn;
          updateWeaponBar();
          rmsg+=' + '+WEAPONS[wn].icon+' '+wn;
          createWeaponGetEffect();
        }else{
          GS.stars+=10;
        }
        document.getElementById('quiz-reward').textContent=rmsg;
        document.getElementById('quiz-reward').style.display='block';
        document.getElementById('quiz-reward').style.color='#ffd700';
        if(GS.energy>=5)showMessage('🚀 能量集满! 快回飞船!',0x66ffcc);
        consumeEnergyOrb();
      }else{
        document.getElementById('quiz-reward').textContent='💀 解锁失败... 稍后可再试';
        document.getElementById('quiz-reward').style.display='block';
        document.getElementById('quiz-reward').style.color='#ff8888';
        if(energyOrb)energyOrb.userData.cooldown=2;
      }`,'quiz-reward');

// ---------- 6. interactDoor 删除 ----------
sliceRep(`// ============================================================
// 门交互
// ============================================================`,`// ============================================================
// 技能系统`,'','del-interactDoor');

// ---------- 7. clampPlayer → 5房间碰撞 ----------
rep(`function clampPlayer(){
  var r=0.4;
  var minZ,maxZ;
  if(GS.inSecondRoom){
    minZ=halfRoom+1;
    maxZ=halfRoom*2-0.5;
  }else{
    minZ=-halfRoom+r;
    maxZ=halfRoom-1;
  }
  player.position.x=Math.max(-halfRoom+r,Math.min(halfRoom-r,player.position.x));
  player.position.z=Math.max(minZ,Math.min(maxZ,player.position.z));
}`,
`function inPlayArea(x,z,r){
  for(var i=0;i<ROOMS.length;i++){
    if(Math.abs(x-ROOMS[i].cx)<halfRoom-r&&Math.abs(z-ROOMS[i].cz)<halfRoom-r)return true;
  }
  var G=DOOR_HALF;
  if(Math.abs(x)<G-r&&Math.abs(Math.abs(z)-halfRoom)<2.2)return true;
  if(Math.abs(z)<G-r&&Math.abs(Math.abs(x)-halfRoom)<2.2)return true;
  return false;
}
function clampPlayer(){
  var r=0.4,p=player.position;
  var lv=player.userData.lastValid;
  if(!lv){lv={x:0,z:-6};player.userData.lastValid=lv;}
  if(inPlayArea(p.x,p.z,r)){lv.x=p.x;lv.z=p.z;return;}
  if(inPlayArea(p.x,lv.z,r)){p.z=lv.z;lv.x=p.x;return;}
  if(inPlayArea(lv.x,p.z,r)){p.x=lv.x;lv.z=p.z;return;}
  p.x=lv.x;p.z=lv.z;
}`,'clampPlayer');

// ---------- 8. update() 内的能量球/飞船/怪物逻辑 ----------
rep(`  // 怪物AI (只在主房间)
  if(!GS.inSecondRoom)updateMonster(delta);`,
`  // 怪物AI
  updateMonster(delta);`,'update-monster-call');

rep(`  // 答题点浮空
  quizItems.forEach(function(item){
    if(item.userData.active){
      item.position.y=1.2+Math.sin(clock.elapsedTime*2+item.userData.floatPhase)*0.15;
      item.rotation.y+=delta*0.5;
    }
  });`,
`  // 能量球动画与解锁检测
  if(energyOrb&&energyOrb.userData.active){
    energyOrb.position.y=1.2+Math.sin(clock.elapsedTime*2+energyOrb.userData.floatPhase)*0.15;
    energyOrb.rotation.y+=delta*0.8;
    if(energyOrb.userData.cooldown>0){
      energyOrb.userData.cooldown-=delta;
    }else if(player.position.distanceTo(energyOrb.position)<2){
      showQuiz();
    }
  }
  // 飞船能量环与逃离检测
  if(ship){
    if(ship.userData.ring){
      ship.userData.ring.rotation.z+=delta*0.8;
      var shipFull=GS.energy>=5;
      ship.userData.ring.material.color.setHex(shipFull?0x66ffcc:0x44ff88);
      ship.userData.ring.material.opacity=shipFull?0.5+Math.sin(clock.elapsedTime*6)*0.25:0.3;
    }
    if(GS.energy>=5&&!GS.escaping&&player.position.distanceTo(ship.position)<3)startEscape();
  }`,'update-orb-ship');

rep(`  // 答题点靠近检测
  quizItems.forEach(function(item){
    if(item.userData.active&&!item.userData.triggered){
      var dist=player.position.distanceTo(item.position);
      if(dist<1.8){
        item.userData.triggered=true;
        item.userData.active=false;
        item.material.transparent=true;
        item.material.opacity=0.2;
        showQuiz();
      }
    }
  });

`,'','del-quiz-proximity');

rep(`  if(!GS.inSecondRoom&&monster.userData.active){`,
`  if(monster.userData.active){`,'update-monster-near');

fs.writeFileSync('game.html',html);
console.log(fails.length?('FAILED: '+fails.join(', ')):'ALL OK');
