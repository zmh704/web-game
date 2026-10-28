// ============================================================
// CollisionSystem - 墙体碰撞（角色 / 怪物 / 抓捕者共用）
//
// 问题：原来只有 clampPlayer() 把玩家限制在「某个 40x40 房间」内，
// 但 9 个房间是紧挨着铺满 -60..60 的，相邻房间边界重合 ——
// inPlayArea 永远为 true，于是内墙形同虚设，谁都能直接穿过去。
//
// 做法：不依赖 mesh 做射线，墙的位置是**已知常量**，直接做数学推出：
//   · 外墙  x/z = ±60，整条实心
//   · 内墙  x/z = ±20，每条线上 3 个门洞（-40 / 0 / 40）
//   实体被当成半径 r 的圆，压进墙体厚度带就沿法线推出去；
//   只有中心落在门洞净宽（doorHalf - r）内才允许通过。
//
// 之所以不用 THREE.Raycaster：
//   场景里有几百个 mesh，每帧对每个实体做射线检测的代价远高于几次加减比较，
//   而且墙是规则网格，数学解算既便宜又不会漏检。
// ============================================================

var COLLISION = {
  half: 20,          // 内墙位置（±halfRoom）
  limit: 60,         // 外墙位置（±halfRoom*3）
  thick: 0.34,       // 墙厚 WALL_T
  doorHalf: 3.6,     // 门洞半宽 DOOR_HALF
  doorCoords: [-40, 0, 40],
  wallHeight: 1.75,  // 飞行超过这个高度视为越过墙体
  iterations: 3      // 多次推出，处理墙角同时压两条墙的情况
};

/** 坐标是否落在某个门洞的净宽内（已扣掉实体半径） */
function _colInDoorGap(coord, radius, doorHalf) {
  var gap = (typeof doorHalf === 'number' ? doorHalf : COLLISION.doorHalf) - radius;
  if (gap <= 0) return false;          // 门洞比实体还窄 → 过不去
  for (var i = 0; i < COLLISION.doorCoords.length; i++) {
    if (Math.abs(coord - COLLISION.doorCoords[i]) < gap) return true;
  }
  return false;
}

/**
 * 把实体推出墙体（就地修改 pos）。
 *
 * @param {Object} pos    含 x / z 的对象（Vector3 或纯数据）
 * @param {number} radius 实体半径
 * @param {number} [y]    实体当前高度；高过墙顶时只挡外墙、不挡内墙（飞行跨墙）
 * @returns {boolean}     是否发生过推出
 */
function resolveWallCollision(pos, radius, y) {
  if (!pos) return false;

  // 医院地图：墙体是带高度区间的 AABB 列表（室内楼层 + 屋顶），
  // 下面这套网格数学碰撞假设"全图只有一个平面"，在楼上/楼下会互相干扰。
  if (typeof HMAP !== 'undefined' && HMAP && HMAP.active && typeof hospitalResolveCollision === 'function') {
    return hospitalResolveCollision(pos, radius, y);
  }

  var r = (typeof radius === 'number' && radius > 0) ? radius : 0.4;

  // 尺寸每次从真正的来源读，不用写死的副本。
  // 这个文件比 game-scene.js / RoomSystem.js 先加载，顶层拿不到 halfRoom，
  // 而如果这里保留一份写死的 20/60，以后谁改了房间尺寸，碰撞就会整体错位
  // —— 而且症状很隐蔽（人卡在看不见的墙上）。用 typeof 兜底保证先加载也能跑。
  var half = (typeof halfRoom !== 'undefined') ? halfRoom : COLLISION.half;
  var doorHalf = (typeof DOOR_HALF !== 'undefined') ? DOOR_HALF : COLLISION.doorHalf;
  var thick = (typeof VX_ROOM !== 'undefined' && VX_ROOM.wallT) ? VX_ROOM.wallT : COLLISION.thick;
  var wallH = (typeof VX_ROOM !== 'undefined' && VX_ROOM.wallH) ? VX_ROOM.wallH : COLLISION.wallHeight;
  var limit = half * 3;              // 外墙 = 3×3 房间网格的外沿

  var t2 = thick / 2;
  var push = t2 + r;

  // 高过墙顶：只保留外墙（防止飞出地图），内墙放行
  var overWall = (typeof y === 'number') && (y > wallH);
  var hit = false;

  // ---------- 1. 外墙：整条实心 ----------
  var outLimit = limit - t2 - r;
  if (pos.x > outLimit) { pos.x = outLimit; hit = true; }
  else if (pos.x < -outLimit) { pos.x = -outLimit; hit = true; }
  if (pos.z > outLimit) { pos.z = outLimit; hit = true; }
  else if (pos.z < -outLimit) { pos.z = -outLimit; hit = true; }

  if (overWall) return hit;

  // ---------- 2. 内墙：x = ±half（门洞沿 z 分布） ----------
  // ---------- 3. 内墙：z = ±half（门洞沿 x 分布） ----------
  // 迭代几次：推出 x 墙后可能又压到 z 墙（墙角），需要再收一次
  for (var it = 0; it < COLLISION.iterations; it++) {
    var moved = false;

    for (var sx = -1; sx <= 1; sx += 2) {
      var wx = sx * half;
      var dx = pos.x - wx;
      if (Math.abs(dx) < push) {
        if (!_colInDoorGap(pos.z, r, doorHalf)) {
          // dx === 0 时（正好在墙中线）按墙的内侧推出
          var dirX = (dx === 0) ? (sx > 0 ? -1 : 1) : (dx > 0 ? 1 : -1);
          pos.x = wx + dirX * push;
          moved = true;
          hit = true;
        }
      }
    }

    for (var sz = -1; sz <= 1; sz += 2) {
      var wz = sz * half;
      var dz = pos.z - wz;
      if (Math.abs(dz) < push) {
        if (!_colInDoorGap(pos.x, r, doorHalf)) {
          var dirZ = (dz === 0) ? (sz > 0 ? -1 : 1) : (dz > 0 ? 1 : -1);
          pos.z = wz + dirZ * push;
          moved = true;
          hit = true;
        }
      }
    }

    if (!moved) break;
  }

  return hit;
}

/** 取实体的碰撞半径（玩家的 root.scale 会放大模型，半径也要跟着放大） */
function entityRadius(obj, fallback) {
  var base = (obj && obj.userData && obj.userData.radius) ? obj.userData.radius : (fallback || 0.4);
  var s = (obj && obj.scale && obj.scale.x) ? obj.scale.x : 1;
  return base * s;
}

// ============================================================
// 怪物跨房间导航
//
// 怪物没有寻路，只有「朝目标直线走」。加了墙体碰撞之后，直线追击的目标
// 一旦在墙另一边，怪物就会一直顶着墙、每帧被推回来 —— 表现就是「卡墙」。
//
// 这里做个极简导航：只要怪物和目标不在同一个房间，就先朝「通往目标房间的
// 那道门」走；过了门房间变了，下一帧自然接着往下一个门/目标走。
// 房间是 3x3 规则网格、门就在两房间连线中点，所以不需要真正的寻路算法。
// ============================================================
function monsterNavDir(m, targetPos, fallbackDir) {
  if (!m || !targetPos) return fallbackDir;

  // 医院：走廊 + 8 个房间，3×3 网格导航会把怪物指向房间内部的隔墙，
  // 改用医院自己的导航图（走廊节点 / 门节点 / 房间中心）。
  if (typeof HMAP !== 'undefined' && HMAP && HMAP.active && typeof hospitalNavDir === 'function') {
    return hospitalNavDir(m, targetPos, fallbackDir);
  }

  if (typeof roomIndexOf !== 'function' || typeof ROOMS === 'undefined' || !ROOMS) return fallbackDir;

  var myIdx = roomIndexOf(m.position.x, m.position.z);
  var tgIdx = roomIndexOf(targetPos.x, targetPos.z);
  if (myIdx === tgIdx) return fallbackDir;          // 同房间：直接冲

  var my = ROOMS[myIdx], tg = ROOMS[tgIdx];
  if (!my || !tg || my === tg) return fallbackDir;

  // 房间中心坐标除以一间房的跨度（40）即网格坐标 -1/0/1
  var SPAN = 40;
  var mgx = Math.round(my.cx / SPAN), mgz = Math.round(my.cz / SPAN);
  var tgx = Math.round(tg.cx / SPAN), tgz = Math.round(tg.cz / SPAN);

  // 先对齐 x，再对齐 z；门就在当前房间边界的中点
  var doorX = my.cx, doorZ = my.cz;
  if (mgx !== tgx) {
    doorX = my.cx + (tgx > mgx ? 1 : -1) * (SPAN / 2);
    doorZ = my.cz;
  } else if (mgz !== tgz) {
    doorX = my.cx;
    doorZ = my.cz + (tgz > mgz ? 1 : -1) * (SPAN / 2);
  } else {
    return fallbackDir;
  }

  var dx = doorX - m.position.x;
  var dz = doorZ - m.position.z;
  var len = Math.sqrt(dx * dx + dz * dz);
  if (len < 0.001) return fallbackDir;             // 已经站在门上，直接穿过去

  var v = new THREE.Vector3(dx / len, 0, dz / len);
  return v;
}

// ============================================================
// Backward compatibility
// ============================================================
window.COLLISION = COLLISION;
window.resolveWallCollision = resolveWallCollision;
window.entityRadius = entityRadius;
window.monsterNavDir = monsterNavDir;
