// ============================================================
// WebSocket 联机服务器 — 静态文件服务 + 房间管理
// 启动：node server.js [端口号]
// 默认端口 3000，访问 http://localhost:3000
// ============================================================
var http = require('http');
var fs = require('fs');
var path = require('path');
var { WebSocketServer } = require('ws');

var PORT = parseInt(process.argv[2]) || 3000;

// ============================================================
// HTTP 静态文件服务
// ============================================================
var httpServer = http.createServer(function (req, res) {
  var filePath = req.url.split('?')[0];
  if (filePath === '/') filePath = '/game.html';
  if (filePath === '/index.html') { res.writeHead(302, { Location: '/game.html' }); res.end(); return; }
  var fullPath = path.join(__dirname, filePath);

  var extMap = {
    '.html': 'text/html;charset=utf-8',
    '.js': 'application/javascript;charset=utf-8',
    '.css': 'text/css;charset=utf-8',
    '.json': 'application/json;charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg'
  };

  fs.readFile(fullPath, function (err, data) {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain;charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    var ext = path.extname(filePath);
    var contentType = extMap[ext] || 'application/octet-stream';
    // 代码类资源不缓存：否则改完前端，用户刷新看到的还是旧 HTML/CSS，
    // 会表现为"按钮点了没反应"这种查不出原因的假故障
    var headers = { 'Content-Type': contentType };
    if (['.html', '.js', '.css', '.json'].indexOf(ext) >= 0) {
      headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
      headers['Pragma'] = 'no-cache';
      headers['Expires'] = '0';
    }
    // HTML 里注入服务器真实端口：
    // 前端推 WebSocket 地址时要靠它。如果页面不是从服务器端口加载的
    // （比如被内嵌浏览器/预览代理转发），location.port 会是代理端口，
    // 用它拼 ws:// 地址必然连不上。
    if (ext === '.html') {
      var htmlText = data.toString('utf8').replace(
        /window\.__SERVER_PORT__\s*=\s*\d+/,
        'window.__SERVER_PORT__ = ' + PORT
      );
      res.writeHead(200, headers);
      res.end(htmlText);
      return;
    }

    res.writeHead(200, headers);
    res.end(data);
  });
});

// ============================================================
// WebSocket 房间管理
// ============================================================
// maxPayload：协议层单帧上限。没有上限时一个 1MB 的垃圾包也能被解析进内存，
// 房间广播还会把它复制给所有人。联机包最大也就几十 KB（整局快照），256KB 足够宽松。
var wss = new WebSocketServer({ server: httpServer, maxPayload: 256 * 1024 });

// 单连接消息频率上限（条/秒）。正常客户端：加入者 30Hz input + 20Hz 快照回传，
// 峰值也就 80 条/秒；给到 400 是留足余量的同时挡住恶意洪泛。
var WS_MAX_MSG_PER_SEC = 400;

// 连接保活：定期 ping，连续一轮没有 pong 就强制断开。
//
// 没有保活时，玩家手机切后台 / 断网 / 关屏后，服务器会一直认为连接正常，
// 20Hz 的快照持续往这个死 socket 里写，Node 的发送缓冲区越积越大，
// 整个房间的广播都会被拖慢——这是"联机越玩越卡"的常见原因之一。
// 浏览器会自动回应 WebSocket 协议层的 pong，不需要客户端配合。
var WS_HEARTBEAT_MS = 15000;
var wsHeartbeatTimer = setInterval(function () {
  wss.clients.forEach(function (ws) {
    if (ws.isAlive === false) {
      console.log('[WS] 保活超时，强制断开该连接');
      try { ws.terminate(); } catch (e) { }
      return;
    }
    ws.isAlive = false;
    try { ws.ping(); } catch (e) { }
  });
}, WS_HEARTBEAT_MS);

wss.on('close', function () { clearInterval(wsHeartbeatTimer); });

// 房间数据
var rooms = {}; // { roomCode: { hostId, players: { peerId: { ws, name, character, isHost, ready } } } }

// 生成4位数字房间码
function generateRoomCode() {
  var code;
  var attempts = 0;
  do {
    code = '';
    for (var i = 0; i < 4; i++) code += Math.floor(Math.random() * 10);
    attempts++;
  } while (rooms[code] && attempts < 100);
  return rooms[code] ? null : code;
}

// 生成短 UUID 作为玩家 ID
function generatePlayerId() {
  return 'p_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
}

// 直接发送已序列化的字符串（避免重复 stringify）
function sendRaw(ws, payload) {
  if (ws && ws.readyState === 1) {
    try { ws.send(payload); } catch (e) { console.warn('[WS] 发送失败:', e.message); }
  }
}

// 发送消息给指定客户端
function sendTo(ws, msg) {
  sendRaw(ws, JSON.stringify(msg));
}

// 广播消息给房间内所有玩家（可选排除指定玩家）
// 同一条消息只序列化一次：原本每个接收者都要 stringify 一遍，
// 3~4 人房间里是纯浪费，高频同步时直接影响服务器吞吐。
/**
 * 房间内昵称去重。
 *
 * 客户端现在会随机生成昵称，但随机也会撞号 —— 两台手机可能都摇到"勇敢狐狸"。
 * 唯一性只能由服务端兜底：这里检查房间里已占用的名字，冲突就加数字后缀。
 * 返回最终生效的名字，调用方要把它写回玩家对象并发回客户端，
 * 否则客户端界面上显示的还是原来那个重复的名字。
 */
function uniquePlayerName(room, desired) {
  // 只留安全的可见字符：昵称会被客户端拼进 innerHTML 的聊天条里，
  // 直接放行 < > & " 之类的字符等于给了一个 8 字符长度的 HTML 注入面。
  var base = String(desired || '')
    .replace(/[<>&"'`\\]/g, '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 8);
  if (!base) base = '玩家';

  var taken = {};
  Object.keys(room.players).forEach(function (pid) {
    var n = room.players[pid] && room.players[pid].name;
    if (n) taken[n] = true;
  });
  if (!taken[base]) return base;

  // 后缀要挤进 8 个字符以内（输入框 maxlength=8），
  // 所以两位数后缀时前缀只能留 6 位，否则会超长。
  for (var i = 2; i < 100; i++) {
    var prefix = base.slice(0, i < 10 ? 7 : 6);
    var cand = prefix + i;
    if (!taken[cand]) return cand;
  }
  return base.slice(0, 4) + '_' + (Date.now() % 1000);
}

function broadcastToRoom(roomCode, msg, excludePeerId) {
  var room = rooms[roomCode];
  if (!room) return;
  var payload = JSON.stringify(msg);
  for (var pid in room.players) {
    if (pid === excludePeerId) continue;
    sendRaw(room.players[pid].ws, payload);
  }
}

// 获取房间玩家列表（不含 ws 对象）
function getPlayerList(room) {
  var list = [];
  for (var pid in room.players) {
    list.push({
      id: pid,
      name: room.players[pid].name,
      character: room.players[pid].character,
      isHost: room.players[pid].isHost,
      ready: room.players[pid].ready
    });
  }
  return list;
}

// 清理玩家：从房间移除，通知房间其他人，必要时删除房间
function removePlayerFromRoom(peerId, roomCode) {
  var room = rooms[roomCode];
  if (!room) return;

  var wasHost = room.players[peerId] && room.players[peerId].isHost;
  var wasInGame = !!room.inGame;
  delete room.players[peerId];
  console.log('[WS] 玩家离开:', peerId, '房间:', roomCode, '剩余:', Object.keys(room.players).length);

  if (Object.keys(room.players).length === 0) {
    // 房间空了，删除房间
    delete rooms[roomCode];
    console.log('[WS] 房间已删除:', roomCode);
    return;
  }

  // 对局中房主掉线：世界状态（怪物/宝箱/掉落）全在房主本地，
  // 没有任何一个加入者持有完整权威世界，把主机身份转给下一个人只会得到
  // 一个"能走但怪物全不动、宝箱开不了"的假主机。
  // 这里直接把这一局判死：通知所有人房主已离开，然后关闭房间。
  // 加入者收到 host_left 会弹结算并退回大厅 —— 比静默卡死好得多。
  if (wasHost && wasInGame) {
    console.log('[WS] host_left 广播: 房间', roomCode, '剩余玩家', Object.keys(room.players).length,
      '各自的readyState:', Object.keys(room.players).map(function (k) { return room.players[k].ws.readyState; }).join(','));
    broadcastToRoom(roomCode, {
      type: 'host_left',
      message: '房主已离开，本局结束'
    });
    delete rooms[roomCode];
    console.log('[WS] 房主在对局中离开，房间已关闭:', roomCode);
    return;
  }

  // 通知其他玩家
  broadcastToRoom(roomCode, { type: 'player_left', playerId: peerId });

  // 如果离开的是主机（还在大厅，没开局），转让主机给下一个玩家
  if (wasHost) {
    var remaining = Object.keys(room.players);
    if (remaining.length > 0) {
      var newHostId = remaining[0];
      room.players[newHostId].isHost = true;
      room.hostId = newHostId;
      console.log('[WS] 主机转让:', newHostId);
      // 通知所有玩家更新主机
      var list = getPlayerList(room);
      broadcastToRoom(roomCode, { type: 'player_list_update', players: list });
    }
  }
}

// ============================================================
// WebSocket 连接处理
// ============================================================
wss.on('connection', function (ws, req) {
  var clientAddr = req.socket.remoteAddress;
  console.log('[WS] 新连接:', clientAddr);

  // 连接保活标记
  ws.isAlive = true;
  ws.on('pong', function () { ws.isAlive = true; });

  var peerId = null;
  var roomCode = null;
  var msgCount = 0;
  var msgWindowAt = Date.now();

  ws.on('message', function (raw) {
    // 频率限制：窗口内超限直接断开，避免单连接把 CPU 打满拖垮整个房间
    var now = Date.now();
    if (now - msgWindowAt > 1000) { msgWindowAt = now; msgCount = 0; }
    if (++msgCount > WS_MAX_MSG_PER_SEC) {
      console.warn('[WS] 消息频率超限，断开连接:', clientAddr);
      try { ws.close(); } catch (e) { }
      return;
    }

    var msg;
    try { msg = JSON.parse(raw.toString()); } catch (e) { return; }
    if (!msg || !msg.type) return;

    switch (msg.type) {
      // ============================================================
      // 创建房间
      // ============================================================
      case 'create_room':
        if (peerId) {
          sendTo(ws, { type: 'error', message: '已经在一个房间中' });
          return;
        }
        var code = generateRoomCode();
        if (!code) {
          sendTo(ws, { type: 'error', message: '服务器繁忙，请重试' });
          return;
        }
        peerId = generatePlayerId();
        roomCode = code;
        rooms[code] = {
          hostId: peerId,
          inGame: false,
          players: {}
        };
        var hostName = uniquePlayerName(rooms[code], msg.playerName || '主机');
        rooms[code].players[peerId] = {
          ws: ws,
          name: hostName,
          character: msg.character || 'qike',
          isHost: true,
          ready: false
        };
        console.log('[WS] 创建房间:', code, '主机:', peerId, hostName);
        sendTo(ws, {
          type: 'room_created',
          roomCode: code,
          playerId: peerId,
          playerName: hostName,
          players: getPlayerList(rooms[code])
        });
        break;

      // ============================================================
      // 加入房间
      // ============================================================
      case 'join_room':
        if (peerId) {
          sendTo(ws, { type: 'error', message: '已经在一个房间中' });
          return;
        }
        var targetRoom = rooms[msg.roomCode];
        if (!targetRoom) {
          sendTo(ws, { type: 'error', message: '找不到该房间，请检查房间码是否正确' });
          return;
        }
        // 房间上限 3 人：界面只有 3 个角色位，第 4 个人进来会没有位置、
        // 还会让"准备/开始"的人数判断错乱，所以直接在入口挡住。
        if (Object.keys(targetRoom.players).length >= 3) {
          sendTo(ws, { type: 'error', message: '房间已满（最多 3 人）' });
          return;
        }
        // 对局已开始：中途进来的人拿不到 game_start，也没有世界快照的初始化路径，
        // 会卡在房间大厅里（房主端还会多出一个站桩队友模型）。直接拒绝更干净。
        if (targetRoom.inGame) {
          sendTo(ws, { type: 'error', message: '对局已开始，请等这一局结束再加入' });
          return;
        }
        peerId = generatePlayerId();
        roomCode = msg.roomCode;
        var joinName = uniquePlayerName(targetRoom, msg.playerName || '玩家');
        targetRoom.players[peerId] = {
          ws: ws,
          name: joinName,
          character: msg.character || 'qike',
          isHost: false,
          ready: false
        };
        console.log('[WS] 加入房间:', roomCode, '玩家:', peerId, joinName,
          (joinName === msg.playerName ? '' : '（原名 ' + msg.playerName + ' 重复，已自动改名）'));

        // 发送 room_joined 给加入者
        sendTo(ws, {
          type: 'room_joined',
          roomCode: roomCode,
          playerId: peerId,
          playerName: joinName,
          players: getPlayerList(targetRoom)
        });

        // 广播 player_joined 给房间其他人
        broadcastToRoom(roomCode, {
          type: 'player_joined',
          player: { id: peerId, name: joinName, character: msg.character || 'qike', isHost: false, ready: false }
        }, peerId);
        break;

      // ============================================================
      // 断线重连：按原房间码回到房间
      //
      // 客户端断线后会自动重连，但重连出来的是一条全新 socket。
      // 如果没有这个入口，重连成功的客户端只是"连上了服务器"，并不在任何房间里——
      // 界面还显示着旧房间码和老队友（本地缓存），实际上双方已经完全失联。
      // 对局中允许重连（不受 inGame 限制），否则请重连回一个已经打了一半的房间毫无意义。
      // ============================================================
      case 'rejoin_room':
        if (peerId) {
          sendTo(ws, { type: 'error', message: '已经在一个房间中' });
          return;
        }
        var reRoom = rooms[msg.roomCode];
        if (!reRoom) {
          // 房间已经被解散（房主掉线 / 所有人退出）
          sendTo(ws, { type: 'room_gone', message: '房间已关闭' });
          return;
        }
        if (Object.keys(reRoom.players).length >= 3) {
          sendTo(ws, { type: 'room_gone', message: '房间已满，无法重连' });
          return;
        }
        peerId = generatePlayerId();
        roomCode = msg.roomCode;
        var reName = uniquePlayerName(reRoom, msg.playerName || '玩家');
        reRoom.players[peerId] = {
          ws: ws,
          name: reName,
          character: msg.character || 'qike',
          isHost: false,
          // 重连回来的人原本就已经准备好（通常是在对局中掉线），
          // 标记为已准备，避免房主重开一局时卡在"等待所有玩家准备"。
          ready: true
        };
        console.log('[WS] 断线重连回房:', roomCode, '玩家:', peerId, reName);
        sendTo(ws, {
          type: 'room_joined',
          roomCode: roomCode,
          playerId: peerId,
          playerName: reName,
          rejoined: true,
          players: getPlayerList(reRoom)
        });
        broadcastToRoom(roomCode, {
          type: 'player_joined',
          player: { id: peerId, name: reName, character: msg.character || 'qike', isHost: false, ready: true }
        }, peerId);
        break;

      // ============================================================
      // 离开房间
      // ============================================================
      case 'leave_room':
        if (peerId && roomCode) {
          removePlayerFromRoom(peerId, roomCode);
        }
        peerId = null;
        roomCode = null;
        sendTo(ws, { type: 'left_room' });
        break;

      // ============================================================
      // 准备/取消准备
      // ============================================================
      case 'ready':
        if (peerId && roomCode && rooms[roomCode] && rooms[roomCode].players[peerId]) {
          rooms[roomCode].players[peerId].ready = msg.ready;
          broadcastToRoom(roomCode, {
            type: 'player_ready',
            playerId: peerId,
            ready: msg.ready
          });
        }
        break;

      // ============================================================
      // 选择角色
      // ============================================================
      case 'select_character':
        if (peerId && roomCode && rooms[roomCode] && rooms[roomCode].players[peerId]) {
          rooms[roomCode].players[peerId].character = msg.character;
          var list = getPlayerList(rooms[roomCode]);
          broadcastToRoom(roomCode, { type: 'player_list_update', players: list });
        }
        break;

      // ============================================================
      // 开始游戏（仅主机可触发）
      // ============================================================
      case 'start_game':
        if (peerId && roomCode && rooms[roomCode] && rooms[roomCode].hostId === peerId) {
          // 标记对局中：之后 join_room 会被拒绝（中途加入没有初始化路径），
          // 房主在这期间掉线也不再做主机转让（加入者没有权威世界）。
          rooms[roomCode].inGame = true;
          // 排除发送者（主机），主机已经自己调用了 beginMultiplayerGame
          broadcastToRoom(roomCode, {
            type: 'game_start',
            chapter: msg.chapter || 1,
            difficulty: msg.difficulty || 'easy',
            character: msg.character || 'qike'
          }, peerId);
        }
        break;

      // ============================================================
      // 本局结束（仅主机可触发）：解除"对局中"标记，允许新玩家加入
      // ============================================================
      case 'end_game':
        if (peerId && roomCode && rooms[roomCode] && rooms[roomCode].hostId === peerId) {
          rooms[roomCode].inGame = false;
          console.log('[WS] 对局结束，房间恢复可加入:', roomCode);
        }
        break;

      // ============================================================
      // 中继消息：发给指定玩家
      // ============================================================
      case 'relay':
        if (peerId && roomCode && rooms[roomCode]) {
          var target = rooms[roomCode].players[msg.targetPeerId];
          if (target) {
            sendTo(target.ws, {
              type: 'relay',
              fromPeerId: peerId,
              messageType: msg.messageType,
              data: msg.data || {}
            });
          }
        }
        break;

      // ============================================================
      // 广播消息：发给房间内所有其他玩家
      // ============================================================
      case 'broadcast':
        if (peerId && roomCode && rooms[roomCode]) {
          // 必须排除发送者自己！
          // 原来第三个参数没传，服务器会把广播原样回传给发送者，
          // 于是「本地先应用 + 广播增量」这类逻辑会被自己那条消息再加一遍：
          // 拾取 2 个碎片本该 +1 能量，实际变成 +2。
          broadcastToRoom(roomCode, {
            type: 'relay',
            fromPeerId: peerId,
            messageType: msg.messageType,
            data: msg.data || {}
          }, peerId);
        }
        break;

      default:
        console.log('[WS] 未知消息类型:', msg.type);
    }
  });

  // 断开连接
  ws.on('close', function () {
    console.log('[WS] 断开连接:', clientAddr, 'peerId:', peerId);
    if (peerId && roomCode) {
      removePlayerFromRoom(peerId, roomCode);
    }
  });

  ws.on('error', function (err) {
    console.warn('[WS] 连接错误:', err.message);
  });
});

// ============================================================
// 启动服务器
// ============================================================
httpServer.listen(PORT, function () {
  console.log('========================================');
  console.log('  奇妙冒险记 - 联机服务器');
  console.log('  HTTP  : http://localhost:' + PORT);
  console.log('  WS    : ws://localhost:' + PORT);
  console.log('========================================');
  console.log('按 Ctrl+C 停止服务器');
});