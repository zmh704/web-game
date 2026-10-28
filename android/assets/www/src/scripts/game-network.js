// ============================================================
// 网络模块 — WebSocket 联机通信
// 连接本地服务器：ws://服务器IP:3000
// ============================================================

// WebSocket 服务器地址（自动根据页面访问地址推断，可被输入框覆盖）
var WS_URL = (function () {
  var loc = window.location;
  var host = loc.hostname || 'localhost';

  // 端口来源：
  //   1. 服务器注入的 window.__SERVER_PORT__（server.js 渲染 game.html 时写入真实端口）
  //   2. 服务器默认端口 3000
  //
  // 刻意不用 location.port：页面有可能不是从服务器端口加载的
  // （内嵌浏览器、预览代理转发等），那时 location.port 是代理端口，
  // 用它拼 ws:// 地址必然连不上，界面只显示"无法连接到服务器"却看不出原因。
  // WebSocket 服务和 HTTP 页面由同一个 server.js 提供，默认就是 3000。
  var port = parseInt(window.__SERVER_PORT__, 10);
  if (!port || isNaN(port)) port = 3000;

  if (loc.protocol === 'file:') return 'ws://localhost:' + port;

  // 始终用 ws://。server.js 只提供明文 WebSocket，没有 TLS。
  // 不要按页面协议切成 wss://：页面若是 https，wss 握手会直接失败；
  // 而浏览器对 localhost / 127.0.0.1 的 ws:// 有混合内容豁免，反而能连上。
  return 'ws://' + host + ':' + port;
})();

// 允许通过输入框覆盖服务器地址
function getServerUrl() {
  var input = document.getElementById('multiplayer-server-input');
  var val = input ? input.value.trim() : '';

  // Android · 创建房间的人：服务器就跑在自己手机里（壳启动时开的 WSServer），
  // 直连本机即可，不需要填任何地址，也不需要电脑。
  if (!val && IS_ANDROID && typeof PeerManager !== 'undefined' && PeerManager.isHost) {
    return 'ws://127.0.0.1:3000';
  }

  // Android · 加入者：回退到本地保存过的创建者 IP（填过一次后长期有效）
  if (!val && IS_ANDROID && window.AndroidHost && window.AndroidHost.getServerAddr) {
    try { val = (window.AndroidHost.getServerAddr() || '').trim(); } catch (e) { }
  }

  if (val) {
    // IP:端口 形式
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?$/.test(val)) {
      return 'ws://' + (val.indexOf(':') === -1 ? val + ':3000' : val);
    }
    // 已经是完整的 ws:// / wss:// 地址
    if (val.indexOf('ws://') === 0 || val.indexOf('wss://') === 0) return val;
    // 纯域名 / IP
    return 'ws://' + val + ':3000';
  }
  return WS_URL;
}

var WS_RECONNECT_DELAY = 3000; // 重连延迟
var WS_HEARTBEAT_INTERVAL = 5000; // 心跳间隔

// ------------------------------------------------------------------
// 随机昵称
//
// 原来输入框写死 value="冒险家"，进联机的人全是"冒险家"，
// 房间列表里根本分不清谁是谁。
// 这里改成进场就随机一个，并且服务端还会再做一次去重（见 server.js /
// RoomManager.java 的 uniquePlayerName）—— 随机也可能撞，光靠客户端保证不了唯一。
// ------------------------------------------------------------------
var NICK_ADJ = [
  '勇敢', '开心', '聪明', '飞快', '幸运', '神秘', '沉稳', '机灵',
  '温柔', '威武', '灵动', '安静', '活泼', '潇洒', '淘气', '闪亮'
];
var NICK_ANIMAL = [
  '狐狸', '兔子', '熊猫', '老虎', '小猫', '小狗', '小鸟', '小鱼',
  '小鹿', '小熊', '小象', '松鼠', '刺猬', '企鹅', '海豚', '狮子'
];

function randomNickname() {
  var a = NICK_ADJ[Math.floor(Math.random() * NICK_ADJ.length)];
  var b = NICK_ANIMAL[Math.floor(Math.random() * NICK_ANIMAL.length)];
  return a + b;   // 4 个字，远低于输入框的 maxlength=8
}

/** 重新随机一个昵称并写回输入框 */
function rollNickname() {
  var el = document.getElementById('multiplayer-name-input');
  if (!el) return randomNickname();
  el.value = randomNickname();
  return el.value;
}

/**
 * 昵称输入框当前值。
 * 空 / 还是占位默认值时兜一个随机的，避免把 "冒险家" 这种默认值发出去。
 */
function currentNickname() {
  var el = document.getElementById('multiplayer-name-input');
  var v = el ? (el.value || '').trim() : '';
  if (!v || v === '冒险家') v = rollNickname();
  return v.slice(0, 8);
}

// 是否运行在 Android App 的 WebView 壳里（壳会注入 window.AndroidHost）。
// 这时页面 origin 是 appassets.androidplatform.net，拿不到真实主机名，
// 联机必须让用户手动填电脑的局域网 IP，否则 WS_URL 会指向一个不存在的域名。
var IS_ANDROID = (function () {
  try {
    return typeof window.AndroidHost !== 'undefined' && !!window.AndroidHost.isAndroid();
  } catch (e) { return false; }
})();

var PeerManager = {
  ws: null,             // WebSocket 实例
  isHost: false,        // 是否是主机
  roomCode: null,       // 房间码
  playerId: null,       // 自己的玩家 ID
  playerName: '玩家',   // 玩家昵称
  playerCharacter: 'qike', // 玩家角色
  players: {},          // 所有玩家信息 { peerId: { name, character, isHost, ready } }
  handlers: {},         // 消息处理器 { type: [handler] }
  connected: false,
  heartbeatTimer: null,
  _disconnecting: false,
  _reconnectTimer: null,
  _pendingRoomAction: null,   // 首次连接时要发送的建房/加入动作
  _joinedOnce: false,         // 是否已经成功进过房（用来区分"首连"和"重连"）
  _rejoinAttempts: 0,

  // ============================================================
  // 连接 WebSocket 服务器
  // ============================================================
  _connect: function () {
    var self = this;
    if (this.ws) {
      // 换地址重连时旧连接还没超时断开，它的 onclose 会在几秒后迟到，
      // 触发"连接丢失"打断这次重试。先把回调摘掉再关，旧连接就彻底哑了。
      try {
        this.ws.onopen = null;
        this.ws.onmessage = null;
        this.ws.onclose = null;
        this.ws.onerror = null;
      } catch (e) { }
      try { this.ws.close(); } catch (e) { }
      this.ws = null;
    }

    var url = getServerUrl();
    console.log('[PeerManager] 连接服务器:', url);

    var ws = new WebSocket(url);
    this.ws = ws;

    // 连接身份校验：每次重建连接都会生成新的 ws，
    // 旧连接的回调必须是"我仍然是当前连接"才处理。
    // 否则旧 ws 的 onclose 会晚一步触发，把刚建好的新连接标记成断开，
    // 再安排一次自动重连——新旧连接互相打架，房间状态就乱了。
    ws.onopen = function () {
      if (self.ws !== ws) return;
      console.log('[PeerManager] 已连接到服务器');
      self.connected = true;

      // 断线重连：这次连接是新建的 socket，服务端已经把我从房间里踢掉了
      // （或者更糟——还保留着一条已死的 peerId）。必须重新进房，
      // 否则只是"连着服务器"，房间里根本没有我。
      //
      // 老实现把 _pendingRoomAction 用完就置空，重连后什么都不发，
      // 客户端却因为 connected=true 显示一切正常 —— 这就是"假重连"。
      if (self._joinedOnce && self.roomCode) {
        self._rejoinAttempts++;
        setTimeout(function () {
          console.log('[PeerManager] 断线重连，尝试回到房间:', self.roomCode);
          self._send({
            type: 'rejoin_room',
            roomCode: self.roomCode,
            playerName: self.playerName,
            character: self.playerCharacter
          });
        }, 100);
      } else if (self._pendingRoomAction) {
        var action = self._pendingRoomAction;
        setTimeout(function () {
          self._send(action);
        }, 100);
      }
    };

    ws.onmessage = function (event) {
      if (self.ws !== ws) return;
      var msg;
      try { msg = JSON.parse(event.data); } catch (e) { return; }
      if (!msg || !msg.type) return;

      self._handleServerMessage(msg);
    };

    ws.onclose = function () {
      if (self.ws !== ws) return;   // 已被新连接替换，忽略
      console.log('[PeerManager] 与服务器断开');
      self.connected = false;
      if (!self._disconnecting) {
        self._emit('connection_lost', { message: '与服务器的连接已断开', url: url });
        // 自动重连
        self._reconnectTimer = setTimeout(function () {
          if (!self._disconnecting && self.ws === ws) {
            console.log('[PeerManager] 尝试重连...');
            self._connect();
          }
        }, WS_RECONNECT_DELAY);
      }
    };

    ws.onerror = function (err) {
      if (self.ws !== ws) return;
      console.error('[PeerManager] WebSocket 错误');
    };
  },

  // ============================================================
  // 处理服务器消息
  // ============================================================
  _handleServerMessage: function (msg) {
    var self = this;
    switch (msg.type) {
      case 'room_created':
        self.playerId = msg.playerId;
        self.roomCode = msg.roomCode;
        self._joinedOnce = true;
        self._rejoinAttempts = 0;
        // 服务端可能因为重名改过我们的昵称，以它返回的为准
        if (msg.playerName) self.playerName = msg.playerName;
        self.isHost = true;
        self.players = {};
        if (msg.players) {
          msg.players.forEach(function (p) { self.players[p.id] = p; });
        }
        console.log('[PeerManager] 房间创建成功:', msg.roomCode);
        self._startHeartbeat();
        self._emit('room_created', { roomCode: msg.roomCode, players: msg.players || [] });
        break;

      case 'room_joined':
        self.playerId = msg.playerId;
        self.roomCode = msg.roomCode;
        self._joinedOnce = true;
        self._rejoinAttempts = 0;
        // 同上：名字撞了的话服务端会加后缀，这里要把它同步回来
        if (msg.playerName) self.playerName = msg.playerName;
        self.isHost = false;
        self.players = {};
        if (msg.players) {
          msg.players.forEach(function (p) { self.players[p.id] = p; });
        }
        // 设置 GS 状态，确保 initMultiplayerMode 在 init() 中被正确调用。
        // 重连回房时 GS.mode 已经是 multiplayer，这里不要动 isHost ——
        // 重连出来的是新玩家身份，权威世界仍然在原房主手里。
        if (typeof GS !== 'undefined') {
          GS.mode = 'multiplayer';
          if (!msg.rejoined) GS.isHost = false;
          GS.playerId = msg.playerId;
        }
        console.log('[PeerManager] ' + (msg.rejoined ? '重连回房成功:' : '加入房间成功:'), msg.roomCode);
        self._startHeartbeat();
        self._emit('room_joined', {
          roomId: msg.roomCode,
          playerId: msg.playerId,
          players: msg.players || [],
          rejoined: !!msg.rejoined
        });
        break;

      // 房主在对局中掉线：这一局已经没有任何人持有权威世界，直接结束
      case 'host_left':
        console.warn('[PeerManager] 房主已离开');
        self._emit('host_left', { message: msg.message || '房主已离开，本局结束' });
        break;

      // 重连时房间已经不存在（房主解散 / 所有人都走了）
      case 'room_gone':
        console.warn('[PeerManager] 房间已关闭:', msg.message);
        self._emit('room_gone', { message: msg.message || '房间已关闭' });
        break;

      case 'player_joined':
        if (msg.player) {
          self.players[msg.player.id] = msg.player;
          console.log('[PeerManager] 新玩家加入:', msg.player.name);
          self._emit('player_list_update', { players: self.getPlayerList() });
        }
        break;

      case 'player_left':
        delete self.players[msg.playerId];
        console.log('[PeerManager] 玩家离开:', msg.playerId);
        self._emit('player_left', { playerId: msg.playerId });
        break;

      case 'player_ready':
        if (msg.playerId && self.players[msg.playerId]) {
          self.players[msg.playerId].ready = msg.ready;
          self._emit('player_ready', { playerId: msg.playerId, ready: msg.ready });
        }
        break;

      case 'player_list_update':
        if (msg.players) {
          self.players = {};
          msg.players.forEach(function (p) { self.players[p.id] = p; });
          self._emit('player_list_update', { players: msg.players });
        }
        break;

      case 'game_start':
        self._emit('game_start', {
          chapter: msg.chapter || 3,
          difficulty: msg.difficulty || 'medium',
          character: msg.character || 'qike'
        });
        break;

      case 'relay':
        // 来自其他玩家的中继消息。
        //
        // 必须忽略"自己发出的"：服务器端 broadcast 现在已经排除发送者，
        // 但这里再挡一层。否则一旦连到旧版服务器（会把广播原样回传），
        // 「本地先应用 + 广播给队友」的逻辑就会被自己那条消息再加一遍——
        // 典型症状：捡 2 个碎片本该合成 1 点能量，界面却显示 +2。
        if (msg.fromPeerId && msg.fromPeerId === self.playerId) break;
        self._emit(msg.messageType, msg.data || {}, msg.fromPeerId);
        break;

      case 'error':
        self._emit('error', { message: msg.message || '未知错误' });
        break;

      case 'left_room':
        console.log('[PeerManager] 已离开房间');
        break;

      default:
        console.log('[PeerManager] 未知服务器消息:', msg.type);
    }
  },

  // ============================================================
  // 发送消息到服务器
  // ============================================================
  _send: function (msg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try { this.ws.send(JSON.stringify(msg)); } catch (e) { console.warn('[PeerManager] 发送失败:', e); }
    }
  },

  // ============================================================
  // 创建房间（主机）
  // ============================================================
  hostRoom: function (roomCode, playerName, character) {
    var self = this;
    this._disconnecting = false;
    this.isHost = true;
    this.roomCode = null;
    this._joinedOnce = false;      // 全新会话：首连要发 create_room，而不是 rejoin
    this._rejoinAttempts = 0;
    this.playerName = playerName || '主机';
    this.playerCharacter = character || 'qike';
    this.players = {};

    // 保存进房动作，断线重连后自动重发
    this._pendingRoomAction = {
      type: 'create_room',
      playerName: this.playerName,
      character: this.playerCharacter
    };

    // 关闭旧连接时要先标记成"主动断开"，
    // 否则旧 ws 的 onclose 会触发 connection_lost 并安排 3 秒后自动重连，
    // 新旧连接互相打架（返回大厅后再次创建房间时必现）。
    this._disconnecting = true;
    this._cleanup();
    this._disconnecting = false;
    this._connect();

    // 注意：这里绝对不能再补发一次 create_room。
    // _connect() 的 onopen 已经在连接建立后自动发送 _pendingRoomAction 了，
    // 原来这里还会再发一次，服务器就会收到两条创建请求：
    // 第一条成功建房间，第二条返回 "已经在一个房间中"，
    // 而前端的 error 处理器又会把"创建中"面板整个隐藏（错误文本就在面板里），
    // 结果就是用户看到"点了一下什么都没发生"。
    // 这里只做连接超时兜底，不发消息。
    setTimeout(function () {
      if (!self.connected) {
        // App 里服务器跑在创建者手机内，文案别再提 node server.js
        var _timeoutMsg = (typeof IS_ANDROID !== 'undefined' && IS_ANDROID)
          ? '连接超时：创建者的房间可能已关闭，或两台手机不在同一 WiFi'
          : '连接服务器超时，请确认已运行 node server.js';
        self._emit('error', { message: _timeoutMsg });
      }
    }, 6000);
  },

  // ============================================================
  // 加入房间（加入者）
  // ============================================================
  joinRoom: function (roomCode, playerName, character) {
    var self = this;
    this._disconnecting = false;
    this.isHost = false;
    this.roomCode = roomCode.toUpperCase();
    this._joinedOnce = false;      // 全新会话：首连要发 join_room，而不是 rejoin
    this._rejoinAttempts = 0;
    this.playerName = playerName || '玩家';
    this.playerCharacter = character || 'qike';
    this.players = {};

    // 保存进房动作，断线重连后自动重发
    this._pendingRoomAction = {
      type: 'join_room',
      roomCode: this.roomCode,
      playerName: this.playerName,
      character: this.playerCharacter
    };

    // 同 hostRoom：先标记主动断开，避免旧连接触发重连
    this._disconnecting = true;
    this._cleanup();
    this._disconnecting = false;
    this._connect();

    // 加入房间同理：_connect() 的 onopen 已经发送 _pendingRoomAction，
    // 这里重复发送会被服务器判定为"已经在一个房间中"并返回 error。
    setTimeout(function () {
      if (!self.connected) {
        // App 里服务器跑在创建者手机内，文案别再提 node server.js
        var _timeoutMsg = (typeof IS_ANDROID !== 'undefined' && IS_ANDROID)
          ? '连接超时：创建者的房间可能已关闭，或两台手机不在同一 WiFi'
          : '连接服务器超时，请确认已运行 node server.js';
        self._emit('error', { message: _timeoutMsg });
      }
    }, 6000);
  },

  // ============================================================
  // 心跳机制
  // ============================================================
  _startHeartbeat: function () {
    this._stopHeartbeat();
    // 心跳通过 WebSocket 的 ping/pong 由浏览器自动处理，这里只做连接状态检查
    var self = this;
    this.heartbeatTimer = setInterval(function () {
      if (!self.connected || self._disconnecting) return;
      if (!self.ws || self.ws.readyState !== WebSocket.OPEN) {
        self.connected = false;
        // 这里原来写的是 `url: url` —— url 只存在于 _connect 的局部作用域，
        // 在这个回调里引用会直接抛 ReferenceError，
        // 结果 connection_lost 永远发不出去，UI 收不到任何提示。
        var _u = '';
        try { _u = getServerUrl(); } catch (e) { }
        self._emit('connection_lost', { message: '与服务器的连接已断开', url: _u });
      }
    }, WS_HEARTBEAT_INTERVAL);
  },

  _stopHeartbeat: function () {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  },

  // ============================================================
  // 清理
  // ============================================================
  _cleanup: function () {
    this._stopHeartbeat();
    this.players = {};
    this.connected = false;
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (this.ws) {
      try { this.ws.close(); } catch (e) { }
      this.ws = null;
    }
  },

  // ============================================================
  // 发送消息到指定玩家（通过服务器中继）
  // ============================================================
  sendTo: function (peerId, type, data) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this._send({
      type: 'relay',
      targetPeerId: peerId,
      messageType: type,
      data: data || {}
    });
  },

  // ============================================================
  // 广播消息到房间所有玩家（通过服务器中转）
  // ============================================================
  broadcast: function (type, data) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this._send({
      type: 'broadcast',
      messageType: type,
      data: data || {}
    });
  },

  // ============================================================
  // 消息处理器
  // ============================================================
  on: function (type, handler) {
    if (!this.handlers[type]) this.handlers[type] = [];
    this.handlers[type].push(handler);
    return this;
  },

  off: function (type, handler) {
    if (!this.handlers[type]) return;
    if (!handler) {
      delete this.handlers[type];
      return;
    }
    this.handlers[type] = this.handlers[type].filter(function (h) { return h !== handler; });
  },

  _emit: function (type, data, fromPeerId) {
    var handlers = this.handlers[type];
    if (handlers) {
      for (var i = 0; i < handlers.length; i++) {
        try { handlers[i](data, fromPeerId); } catch (e) { console.warn('[PeerManager] 处理器错误:', e); }
      }
    }
  },

  // ============================================================
  // 断开连接
  // ============================================================
  disconnect: function () {
    this._disconnecting = true;
    this._pendingRoomAction = null; // 主动断开时清除重连动作
    this._joinedOnce = false;
    this._rejoinAttempts = 0;
    this._stopHeartbeat();
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (this.ws) {
      this._send({ type: 'leave_room' });
      try { this.ws.close(); } catch (e) { }
      this.ws = null;
    }
    this.players = {};
    this.connected = false;
    this.isHost = false;
    this.roomCode = null;
    this.playerId = null;
    this._emit('disconnected', {});
    this._disconnecting = false;
  },

  // ============================================================
  // 准备/取消准备
  // ============================================================
  setReady: function (ready) {
    if (!this.playerId) return;
    if (this.players[this.playerId]) {
      this.players[this.playerId].ready = ready;
    }
    this._send({
      type: 'ready',
      ready: ready
    });
  },

  // 获取所有玩家列表
  getPlayerList: function () {
    var list = [];
    for (var pid in this.players) {
      list.push({
        id: pid,
        name: this.players[pid].name,
        character: this.players[pid].character,
        isHost: this.players[pid].isHost,
        ready: this.players[pid].ready
      });
    }
    return list;
  },

  // 当前房主的 peerId（加入者要把 input / 世界状态请求只发给房主，
  // 而不是广播给整个房间——广播会让每个加入者都收到彼此的位置包，白烧流量）
  getHostId: function () {
    for (var pid in this.players) {
      if (this.players[pid] && this.players[pid].isHost) return pid;
    }
    return null;
  },

  // 检查是否所有非主机玩家都已准备
  allReady: function () {
    for (var pid in this.players) {
      if (!this.players[pid].isHost && !this.players[pid].ready) return false;
    }
    return true;
  }
};

// ============================================================
// 工具：生成随机房间码（纯数字4位）
// ============================================================
function generateRoomCode() {
  var code = '';
  for (var i = 0; i < 4; i++) {
    code += Math.floor(Math.random() * 10);
  }
  return code;
}

// ============================================================
// 联机大厅 UI 控制
// ============================================================
var MultiplayerUI = {
  // 显示联机大厅
  show: function () {
    document.getElementById('char-select').classList.add('hidden');
    document.getElementById('multiplayer-lobby').classList.remove('hidden');
    // 进场就先探一次服务器，用户不用点"创建房间"就能看出能不能连
    this.refreshDiag();
  },

  // 在联机大厅显示"页面地址 → WS 地址"以及一次轻量连通性探测结果
  //
  // 联机连不上时，用户只能看到"无法连接到服务器"，无法区分是服务器没开、
  // 地址算错了、还是浏览器拦了。把这两个地址直接摊在界面上，一眼就能判断。
  refreshDiag: function () {
    var el = document.getElementById('mp-diag');
    if (!el) return;

    var target = WS_URL;
    try { target = getServerUrl(); } catch (e) { }

    // Android · 创建者：服务器跑在本机，直接把 IP 亮出来，让队友照填
    if (IS_ANDROID && typeof PeerManager !== 'undefined' && PeerManager.isHost) {
      var myIp = '';
      try { myIp = window.AndroidHost.getLocalIp(); } catch (e) { }
      var allIps = '';
      try { if (window.AndroidHost.getLocalIps) allIps = window.AndroidHost.getLocalIps(); } catch (e) { }
      el.className = 'mp-diag ok';
      el.textContent =
        '你是主机，服务器跑在本机 ✓\n主地址: ' + myIp + ':3000'
        + (allIps && allIps !== myIp ? '\n全部地址: ' + allIps : '')
        + '\n队友只要输房间码就能自动找到你';
      return;
    }

    // Android · 加入者：页面域名不是服务器，必须填创建者的 IP
    if (IS_ANDROID && target.indexOf('appassets.androidplatform.net') > -1) {
      el.className = 'mp-diag bad';
      // 已经填了房间码 → 告诉用户直接点加入就行，壳会自己找
      var codeInput = document.getElementById('room-code-input');
      var hasCode = codeInput && codeInput.value.trim().length >= 4;
      var nd = androidNetDiag();
      el.textContent = (hasCode
        ? '房间码 ' + codeInput.value.trim() + ' 已就绪\n点「加入房间」自动查找创建者'
        : '在上方输入房间码，点「加入房间」即可\n同一 WiFi 下会自动找到创建者')
        + (nd ? '\n' + nd : '');
      var diagInput = document.getElementById('multiplayer-server-input');
      if (diagInput) diagInput.placeholder = '可选：创建者手机的 IP（留空则按房间码自动查找）';
      return;
    }

    // 网段对比：本机 IP 与目标 IP 前两段不一致 = 不在同一网络，
    // 探测必然超时。趁进页就点破，省得用户填完房间码白等 10 秒。
    if (IS_ANDROID && target.indexOf('ws://') === 0) {
      var mySeg = (androidNetDiag().match(/(\d{1,3}\.\d{1,3})\.\d{1,3}\.\d{1,3}/) || [])[1];
      var tgtSeg = (target.match(/ws:\/\/([\d.]+):/) || [])[1];
      tgtSeg = tgtSeg ? tgtSeg.split('.').slice(0, 2).join('.') : '';
      if (mySeg && tgtSeg && mySeg !== tgtSeg) {
        el.className = 'mp-diag bad';
        el.textContent = '⚠️ 两台设备不在同一网络\n本机网段 ' + mySeg + '.x，对方是 ' + tgtSeg + '.x\n' +
          '请连同一个 WiFi；或创建者开热点、你连它的热点（关掉自己的流量）';
        return;
      }
    }

    el.className = 'mp-diag';
    el.textContent = '页面: ' + location.origin + '\nWS: ' + target + '\n正在检测…';

    var finished = false;
    var finish = function (cls, text) {
      if (finished) return;
      finished = true;
      el.className = 'mp-diag ' + cls;
      el.textContent = '页面: ' + location.origin + '\nWS: ' + target + '\n' + text;
    };

    var probe;
    try {
      probe = new WebSocket(target);
    } catch (e) {
      finish('bad', '✗ 地址无效: ' + e.message);
      return;
    }

    probe.onopen = function () {
      finish('ok', '✓ 服务器可达');
      try { probe.close(); } catch (e) { }
    };
    probe.onerror = function () {
      finish('bad', '✗ 连不上（服务器未启动 / 地址不对 / 被浏览器拦截）');
    };
    setTimeout(function () {
      finish('bad', '✗ 检测超时（3 秒无响应）');
      try { probe.close(); } catch (e) { }
    }, 3000);
  },

  // 隐藏联机大厅
  hide: function () {
    document.getElementById('multiplayer-lobby').classList.add('hidden');
  },

  // 显示房间等待界面
  showRoomLobby: function () {
    var lobby = document.getElementById('room-lobby');
    if (lobby) lobby.classList.remove('hidden');
    this.hide();
    // 隐藏创建中提示（安全兜底）
    var creating = document.getElementById('mp-creating');
    if (creating) { creating.classList.add('hidden'); creating.style.display = 'none'; }
    var actions = document.querySelector('.mp-actions');
    if (actions) actions.style.display = 'flex';
    // 更新角色位显示
    this.updateSlots();
    // 更新角色选择面板
    this.updateCharSelect();
    // 根据主机/加入者显示不同按钮和设置
    var readyBtn = document.getElementById('ready-btn');
    var startBtn = document.getElementById('start-btn');
    var settings = document.getElementById('rl-settings');
    if (PeerManager.isHost) {
      if (readyBtn) readyBtn.style.display = 'none';
      if (startBtn) {
        startBtn.classList.remove('hidden');
        startBtn.style.display = 'inline-block';
      }
      // 主机可改难度/章节
      if (settings) {
        settings.style.display = '';
        settings.classList.remove('rl-locked');
        if (typeof selectMPDifficulty === 'function') selectMPDifficulty(selectedDiff || 'medium');
        if (typeof selectMPChapter === 'function') {
          selectMPChapter(selectedChapter || (typeof MP_DEFAULT_CHAPTER !== 'undefined' ? MP_DEFAULT_CHAPTER : 3));
        }
        // 上面两个 select 内部会广播；这里再兜一次，保证新加入的人也能拿到
        if (typeof broadcastMPSettings === 'function') broadcastMPSettings();
      }
    } else {
      if (readyBtn) readyBtn.style.display = 'inline-block';
      if (startBtn) {
        startBtn.classList.add('hidden');
        startBtn.style.display = 'none';
      }
      // 加入者：不隐藏右栏（否则三栏塌成两栏，布局会跳），
      // 改成加锁样式 —— 结构稳定，也明确告诉玩家"这里只有房主能改"
      if (settings) {
        settings.style.display = '';
        settings.classList.add('rl-locked');
      }
    }
  },

  // 隐藏房间等待界面
  hideRoomLobby: function () {
    var lobby = document.getElementById('room-lobby');
    if (lobby) lobby.classList.add('hidden');
  },

  // 更新 3 个角色位
  updateSlots: function () {
    var slots = document.querySelectorAll('.rl-slot');
    if (!slots.length) return;
    var players = PeerManager.getPlayerList();
    for (var si = 0; si < slots.length; si++) {
      slots[si].className = 'rl-slot rl-slot-empty';
      var avatar = slots[si].querySelector('.slot-avatar');
      var name = slots[si].querySelector('.slot-name');
      var status = slots[si].querySelector('.slot-status');
      avatar.innerHTML = '❓';
      name.textContent = '等待加入...';
      status.textContent = '';
    }
    players.forEach(function (p, idx) {
      if (idx >= slots.length) return;
      var slot = slots[idx];
      var charIcon = (typeof characterIcon === 'function') ? characterIcon(p.character)
        : (p.character === 'qike' ? '👦' : '👧');
      slot.className = 'rl-slot rl-slot-filled';
      if (p.isHost) slot.className += ' rl-slot-host';
      if (p.ready) slot.className += ' rl-slot-ready';
      var avatar = slot.querySelector('.slot-avatar');
      avatar.innerHTML = charIcon;
      var name = slot.querySelector('.slot-name');
      name.textContent = p.name || '玩家';
      var status = slot.querySelector('.slot-status');
      if (p.isHost) {
        status.textContent = '👑 房主';
      } else if (p.ready) {
        status.textContent = '✅ 已准备';
      } else {
        status.textContent = '⏳ 选择角色中';
      }
    });
  },

  // 更新角色选择面板
  updateCharSelect: function () {
    var options = document.querySelectorAll('.rl-char-option');
    if (!options.length) return;
    options.forEach(function (opt) {
      var myPlayer = PeerManager.players[PeerManager.playerId];
      if (myPlayer && myPlayer.character === opt.dataset.char) {
        opt.classList.add('selected');
      } else {
        opt.classList.remove('selected');
      }
    });
  },

  // 显示房间码
  showRoomCode: function (code) {
    var el = document.getElementById('room-code-display');
    if (el) el.textContent = code;
  },

  // 添加聊天消息
  addChatMessage: function (playerName, text) {
    var container = document.getElementById('chat-messages');
    if (!container) return;
    var el = document.createElement('div');
    el.className = 'chat-msg';
    // 昵称是别的客户端发来的，同样要转义。只转义正文、昵称直接拼 innerHTML，
    // 等于给对面留了一个 8 字符的 HTML 注入位（`<b>x</b>` 刚好 8 个字符）。
    el.innerHTML = '<span class="chat-name">' + escapeHtml(playerName || '玩家') + ':</span> ' + escapeHtml(text || '');
    container.appendChild(el);
    container.scrollTop = container.scrollHeight;
  }
};

// 简易 HTML 转义
function escapeHtml(text) {
  var div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================================
// 房间创建/加入函数（供 HTML onclick 调用）
// ============================================================
function createRoom() {
  var name = currentNickname();
  var code = generateRoomCode();

  // Android App：把服务器地址存到本地，下次进联机不用重填
  if (IS_ANDROID && window.AndroidHost && window.AndroidHost.setServerAddr) {
    var addrInput = document.getElementById('multiplayer-server-input');
    try { window.AndroidHost.setServerAddr(addrInput ? addrInput.value.trim() : ''); } catch (e) { }
  }

  // 显示创建中提示，隐藏操作按钮
  var creating = document.getElementById('mp-creating');
  var creatingText = document.getElementById('mp-creating-text');
  var creatingError = document.getElementById('mp-creating-error');
  var creatingCancel = document.getElementById('mp-creating-cancel');
  creating.classList.remove('hidden');
  creating.style.display = 'flex';
  if (creatingText) creatingText.textContent = '⏳ 正在连接服务器...';
  if (creatingError) creatingError.style.display = 'none';
  if (creatingCancel) creatingCancel.style.display = 'inline-block';
  // 取消按钮
  if (creatingCancel) {
    creatingCancel.onclick = function () {
      PeerManager._disconnecting = true;
      PeerManager._cleanup();
      creating.classList.add('hidden');
      creating.style.display = 'none';
      var actions = document.querySelector('.mp-actions');
      if (actions) actions.style.display = 'flex';
    };
  }

  var actions = document.querySelector('.mp-actions');
  if (actions) actions.style.display = 'none';

  // 清空所有旧处理器。
  // 不要用 for...in 边遍历边 off() —— 那是在遍历过程中删除属性，
  // 规范没保证不会漏项。先取出 key 列表再删。
  Object.keys(PeerManager.handlers).forEach(function (t) { PeerManager.off(t); });

  // 注册 game_start 处理器（加入者接收开始信号必需）
  _registerGameStartHandler();

  PeerManager.on('room_created', function (data) {
    document.getElementById('room-code-display').textContent = data.roomCode;
    // 隐藏创建中提示
    creating.classList.add('hidden');
    creating.style.display = 'none';
    if (actions) actions.style.display = 'flex';
    // 同步服务器确认的玩家列表和角色
    if (data && data.players) {
      PeerManager.players = {};
      data.players.forEach(function (p) {
        PeerManager.players[p.id] = p;
        if (p.id === PeerManager.playerId) {
          if (p.character) {
            GS.character = p.character;
            selectedChar = p.character;
          }
          // 服务端去重后可能改了我们的昵称（重名会加数字后缀），以服务端为准
          if (p.name) PeerManager.playerName = p.name;
        }
      });
    }
    MultiplayerUI.showRoomLobby();
  });

  PeerManager.on('player_list_update', function (data) {
    if (data && data.players) {
      PeerManager.players = {};
      data.players.forEach(function (p) {
        PeerManager.players[p.id] = p;
        // 同步自己的角色选择到 GS（服务器确认的值）
        if (p.id === PeerManager.playerId) {
          if (p.character) {
            GS.character = p.character;
            selectedChar = p.character;
          }
          // 服务端去重后可能改了我们的昵称（重名会加数字后缀），以服务端为准
          if (p.name) PeerManager.playerName = p.name;
        }
      });
      // 房主掉线后服务端会移交主机，这里必须跟着更新，
      // 否则新主机看不到「开始游戏」按钮、也调不起 startMultiplayerGame()
      var _hostChanged = refreshHostFlag();
      MultiplayerUI.updateSlots();
      MultiplayerUI.updateCharSelect();
      // 身份变化（或有人进出）时重刷整个大厅：按钮 / 右栏锁定状态都要跟着变
      var _lobby = document.getElementById('room-lobby');
      if (_hostChanged && _lobby && !_lobby.classList.contains('hidden')) {
        MultiplayerUI.showRoomLobby();
      }
      // 有人进/出房间时，房主补推一次难度+章节：
      // 新加入的人只收到过 player_list_update，没有 room_settings，
      // 右栏（锁定状态）会一个选项都不高亮，看起来像"设置丢了"。
      if (PeerManager.isHost && typeof broadcastMPSettings === 'function') {
        broadcastMPSettings();
      }
    }
  });

  PeerManager.on('player_ready', function (data) {
    if (data && data.playerId && PeerManager.players[data.playerId]) {
      PeerManager.players[data.playerId].ready = data.ready;
      MultiplayerUI.updateSlots();
    }
  });

  // 玩家离开由 _registerSessionHandlers 统一处理（清理远程模型 + 刷新座位）

  PeerManager.on('connection_lost', function (data) {
    // 显示连接错误（不弹alert，改用页面内提示）
    if (creatingText) creatingText.textContent = '❌ 连接失败';
    if (creatingError) {
      // 把实际尝试的地址也显示出来，否则用户完全无法判断是"服务器没开"
      // 还是"地址算错了"（后者在页面经代理转发时很常见）
      var lines = ['无法连接到服务器'];
      if (data && data.url) lines.push('尝试地址: ' + data.url);
      lines.push('请检查：');
      lines.push('1. 创建者的手机是否在本页面创建了房间（服务器跑在它机内）');
      lines.push('2. 两台手机是否在同一 WiFi');
      lines.push('3. 服务器地址是否正确');
      creatingError.textContent = lines.join('\n');
      creatingError.style.display = 'block';
    }
    if (creatingCancel) creatingCancel.textContent = '返回';
  });

  PeerManager.on('error', function (data) {
    // 关键：不要隐藏"创建中"面板。
    // 错误文本 creatingError 就在这个面板里面，一旦把面板 display:none，
    // 用户既看不到错误内容，也看不到任何界面变化，只会觉得"点了一下没反应"。
    creating.classList.remove('hidden');
    creating.style.display = 'flex';
    if (creatingText) creatingText.textContent = '❌ 创建房间失败';
    if (creatingError) {
      creatingError.textContent = (data && data.message) ? data.message : '未知错误';
      creatingError.style.display = 'block';
    }
    if (creatingCancel) {
      creatingCancel.textContent = '返回';
      creatingCancel.style.display = 'inline-block';
    }
  });

  // 连接超时处理（10秒）
  var createTimeout = setTimeout(function () {
    if (creating && creating.style.display !== 'none' && !creating.classList.contains('hidden')) {
      if (creatingText) creatingText.textContent = '⏱️ 连接超时';
      if (creatingError) {
        creatingError.textContent = '连接超时，请检查：\n1. 创建者的手机是否已创建房间\n2. 服务器地址是否正确\n3. 两台手机是否在同一 WiFi';
        creatingError.style.display = 'block';
      }
      if (creatingCancel) creatingCancel.textContent = '返回';
      PeerManager._cleanup();
    }
  }, 10000);

  // 覆盖 room_created 处理器以清除超时
  var origRoomCreated = PeerManager.handlers.room_created[0];
  PeerManager.off('room_created');
  PeerManager.on('room_created', function (data) {
    clearTimeout(createTimeout);
    // 调用原来的处理器
    origRoomCreated(data);
  });

  // Android：创建房间前先确保内置服务器真的在跑、且对外广播的是最新 IP。
  // 服务器是在 App 启动时起的，如果那时 WiFi 还没连上（或中途切过网络），
  // 记下来的 IP 就是旧的/错的，加入者拿到必然连不上。这里兜一次底。
  if (IS_ANDROID && window.AndroidHost && window.AndroidHost.ensureServer) {
    try { window.AndroidHost.ensureServer(); } catch (e) { }
  }

  PeerManager.hostRoom(code, name, GS.character || 'qike');

  // Android：必须放在 hostRoom() 之后 —— isHost 是在 hostRoom 内部才置 true 的。
  // 放在之前刷新会走"加入者"分支，把主机误显示成"连不上"。
  if (typeof MultiplayerUI !== 'undefined' && MultiplayerUI.refreshDiag) {
    MultiplayerUI.refreshDiag();
  }
  // 顺手把本机 IP 显示在创建中面板上：创建者不用展开高级选项也知道该把什么告诉队友
  if (IS_ANDROID && window.AndroidHost && window.AndroidHost.getLocalIp) {
    var ct = document.getElementById('mp-creating-text');
    if (ct) {
      ct.textContent = '正在创建房间…  本机 IP: ' + window.AndroidHost.getLocalIp() + ':3000';
    }
  }
}

// 取 Android 壳的网络诊断（IP / 服务器 / 房间发现是否在跑）
function androidNetDiag() {
  var build = (window.__UI_BUILD__ ? '版本 ' + window.__UI_BUILD__ : '');
  try {
    if (IS_ANDROID && window.AndroidHost && window.AndroidHost.netDiag) {
      var d = window.AndroidHost.netDiag() || '';
      return d + (build ? ' · ' + build : '');
    }
  } catch (e) { }
  return build;
}

// ------------------------------------------------------------------
// 候选地址：房间码查到的创建者地址可能有多个（创建者那台手机往往同时有
// WiFi / 流量 / 热点 / VPN 好几张网卡），按可靠度排序后逐个试，
// 第一个连不上就换下一个，避免"只认一个地址、偏偏那个地址不对"的死局。
// ------------------------------------------------------------------
var _joinCandidates = [];
var _joinCandidateIdx = 0;

function _splitCandidates(raw) {
  if (!raw) return [];
  return String(raw).split(',').map(function (s) { return s.trim(); })
    .filter(function (s) { return /^\d{1,3}(\.\d{1,3}){3}(:\d+)?$/.test(s); })
    .map(function (s) { return s.indexOf(':') === -1 ? s + ':3000' : s; });
}

// 加入状态提示（查找中 / 找到 / 失败）
function setJoinStatus(text, cls) {
  var el = document.getElementById('mp-join-status');
  if (!el) return;
  el.textContent = text || '';
  el.className = 'mp-join-status' + (cls ? ' ' + cls : '');
}

function joinRoom() {
  var code = document.getElementById('room-code-input').value.trim();
  if (!code || code.length < 4) {
    showMPError('请输入有效的房间码');
    return;
  }
  var name = currentNickname();

  // Android：只用房间码就能加入。壳通过 UDP 广播在局域网里查找创建者的 IP。
  //
  // findRoom 是**阻塞**调用（最多 2.5 秒）。直接调的话浏览器会卡着不渲染，
  // 用户看到的是"点了加入、按钮僵住 2.5 秒、什么提示都没有"。
  // 所以先用 setTimeout 让出一帧把「查找中」画出来，再进阻塞查找。
  if (IS_ANDROID && window.AndroidHost && window.AndroidHost.findRoom) {
    var addrInput = document.getElementById('multiplayer-server-input');
    var alreadyFilled = addrInput && addrInput.value.trim();
    if (!alreadyFilled) {
      var btn0 = document.querySelector('#join-room-form .mp-btn-small');
      if (btn0) { btn0.disabled = true; btn0.textContent = '查找中'; }
      setJoinStatus('🔍 正在查找房间 ' + code + ' …', 'busy');

      setTimeout(function () {
        var found = null;
        try { found = window.AndroidHost.findRoom(code); } catch (e) { }

        if (found) {
          _joinCandidates = _splitCandidates(found);
          _joinCandidateIdx = 0;
          var first = _joinCandidates[0] || found;
          if (addrInput) addrInput.value = first;
          // 记住地址，下次同房间直接连
          if (window.AndroidHost.setServerAddr) {
            try { window.AndroidHost.setServerAddr(first); } catch (e) { }
          }
          setJoinStatus('✓ 找到创建者 ' + first + '，正在连接…', 'ok');
          setTimeout(function () { joinRoomProceed(code, name); }, 30);
        } else {
          setJoinStatus('✗ 没找到房间 ' + code +
            '\n请确认：① 创建者已经创建房间 ② 两台手机连同一 WiFi' +
            (androidNetDiag() ? '\n' + androidNetDiag() : ''), 'bad');
          if (btn0) { btn0.disabled = false; btn0.textContent = '加入'; }
        }
      }, 60);
      return;
    }
  }

  joinRoomProceed(code, name);
}

// 真正发起连接（服务器地址已确定）
function joinRoomProceed(code, name) {
  // 清空所有旧处理器。
  // 不要用 for...in 边遍历边 off() —— 那是在遍历过程中删除属性，
  // 规范没保证不会漏项。先取出 key 列表再删。
  Object.keys(PeerManager.handlers).forEach(function (t) { PeerManager.off(t); });

  // 注册 game_start 处理器（加入者接收开始信号必需）
  _registerGameStartHandler();

  // 按钮反馈
  var btn = document.querySelector('#join-room-form .mp-btn-small');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ 连接中...'; }

  // 连接超时提示。
  // 有多个候选地址时每个只等 5 秒就换下一个 —— 4 个候选 × 10 秒会让用户干等 40 秒。
  var perTry = _joinCandidates.length > 1 ? 5000 : 10000;
  var joinTimeout = setTimeout(function () {
    if (btn) { btn.disabled = false; btn.textContent = '加入'; }

    // 还有候选没试完 → 换一个创建者地址重连。
    // 这是"能查到房间但连不上"的主要兜底：创建者那台手机可能挑错了网卡，
    // 但它会把所有地址都发过来，逐个试总有一个通。
    if (_joinCandidateIdx < _joinCandidates.length - 1) {
      _joinCandidateIdx++;
      var next = _joinCandidates[_joinCandidateIdx];
      var ai = document.getElementById('multiplayer-server-input');
      if (ai) ai.value = next;
      try { window.AndroidHost.setServerAddr(next); } catch (e) { }
      setJoinStatus('↻ 换地址重试 (' + (_joinCandidateIdx + 1) + '/' + _joinCandidates.length
        + ') ' + next + ' …', 'busy');
      setTimeout(function () { joinRoomProceed(code, name); }, 60);
      return;
    }

    // 全部候选都失败 → 做一次真·TCP 探测，把"拒绝 / 超时 / 不可达"讲清楚
    var detail = '';
    try {
      var m = getServerUrl().match(/ws:\/\/([\d.]+):(\d+)/);
      if (m && window.AndroidHost && window.AndroidHost.tcpProbe) {
        detail = '\n探测 ' + m[1] + ':' + m[2] + ' → ' + window.AndroidHost.tcpProbe(m[1], parseInt(m[2], 10), 3000);
      }
    } catch (e) { }
    setJoinStatus('✗ 连接超时' + detail, 'bad');
    showMPError('连接超时，请检查：\n1. 创建者是否已创建房间\n2. 两台手机是否在同一 WiFi\n3. 房间码是否正确' + detail);
  }, perTry);

  PeerManager.on('room_joined', function (data, fromPeerId) {
    clearTimeout(joinTimeout);
    // 断线重连回房（对局进行中）：不能把对局界面盖掉，
    // 而是要立刻向房主请求一次完整世界状态，把怪物/道具/宝箱重新对齐。
    if (data && data.rejoined && typeof GS !== 'undefined' &&
        GS.mode === 'multiplayer' && GS.running && !GS.gameOver) {
      console.log('[PeerManager] 对局中重连成功，重新同步世界状态');
      if (typeof showMessage === 'function') showMessage('✅ 已重新连上对局', 0x66ffcc);
      setTimeout(function () {
        var hostId = PeerManager.getHostId && PeerManager.getHostId();
        if (hostId) PeerManager.sendTo(hostId, 'world_state_request', {});
        else PeerManager.broadcast('world_state_request', {});
      }, 400);
      return;
    }
    setJoinStatus('✅ 已加入房间', 'ok');
    // 加入成功
    if (btn) { btn.disabled = false; btn.textContent = '✅ 已加入'; }
    // 更新玩家列表
    if (data && data.players) {
      PeerManager.players = {};
      data.players.forEach(function (p) {
        PeerManager.players[p.id] = p;
        // 同步自己的角色选择到 GS（服务器确认的值）
        if (p.id === PeerManager.playerId) {
          if (p.character) {
            GS.character = p.character;
            selectedChar = p.character;
          }
          // 服务端去重后可能改了我们的昵称（重名会加数字后缀），以服务端为准
          if (p.name) PeerManager.playerName = p.name;
        }
      });
    }
    MultiplayerUI.showRoomLobby();
    document.getElementById('room-code-display').textContent = data.roomId || code;
    MultiplayerUI.updateSlots();
    MultiplayerUI.updateCharSelect();
  });

  PeerManager.on('player_list_update', function (data) {
    if (data && data.players) {
      PeerManager.players = {};
      data.players.forEach(function (p) {
        PeerManager.players[p.id] = p;
        // 同步自己的角色选择到 GS（服务器确认的值）
        if (p.id === PeerManager.playerId) {
          if (p.character) {
            GS.character = p.character;
            selectedChar = p.character;
          }
          // 服务端去重后可能改了我们的昵称（重名会加数字后缀），以服务端为准
          if (p.name) PeerManager.playerName = p.name;
        }
      });
      var _hc2 = refreshHostFlag();
      MultiplayerUI.updateSlots();
      MultiplayerUI.updateCharSelect();
      var _lobby2 = document.getElementById('room-lobby');
      if (_hc2 && _lobby2 && !_lobby2.classList.contains('hidden')) {
        MultiplayerUI.showRoomLobby();
      }
    }
  });

  PeerManager.on('player_ready', function (data) {
    if (data && data.playerId && PeerManager.players[data.playerId]) {
      PeerManager.players[data.playerId].ready = data.ready;
      MultiplayerUI.updateSlots();
    }
  });

  // 玩家离开由 _registerSessionHandlers 统一处理（清理远程模型 + 刷新座位）

  PeerManager.on('connection_lost', function (data) {
    clearTimeout(joinTimeout);
    // 对局进行中不要急着退房：自动重连 3 秒后会发起 rejoin_room，
    // 这里起一个 12 秒的看门狗，重连不回来才结算本局。
    // 原来直接 leaveRoom() 把重连定时器一起清了，等于"抖一下就强制退到主菜单"。
    if (_watchReconnectInGame()) return;
    if (btn) { btn.disabled = false; btn.textContent = '加入'; }
    showMPError('连接丢失: ' + (data.message || '与服务器的连接已断开'));
    leaveRoom();
  });

  PeerManager.on('error', function (data) {
    clearTimeout(joinTimeout);
    if (btn) { btn.disabled = false; btn.textContent = '加入'; }
    var reason = (data && data.message) ? data.message : '找不到房间，请检查房间码';

    // 服务端明确回的"业务错误"（房间满 / 房间不存在 / 已在房间中）
    // 直接原样提示即可。原来一律套上"连接失败:" 前缀，还会走网段诊断，
    // 用户看到「连接失败: 房间已满（最多 3 人）」会以为是网络问题，排查方向全错。
    var isBizError = /房间已满|找不到该房间|已经在房间中/.test(reason);
    if (isBizError) {
      setJoinStatus('✗ ' + reason, 'bad');
      showMPError(reason);
      return;
    }

    // 网段对比：本机 IP 和目标 IP 的前两段不一致 = 两台设备根本不在同一网络。
    // 这是"能找到但连不上"最常见的原因，直接把网段摊出来，用户一眼看懂。
    var mySeg = (androidNetDiag().match(/(\d{1,3}\.\d{1,3})\.\d{1,3}\.\d{1,3}/) || [])[1];
    var tgtSeg = (getServerUrl().match(/ws:\/\/([\d.]+):/) || [])[1];
    tgtSeg = tgtSeg ? tgtSeg.split('.').slice(0, 2).join('.') : '';
    if (mySeg && tgtSeg && mySeg !== tgtSeg) {
      reason = '两台设备不在同一网络！\n本机网段 ' + mySeg + '.x，对方是 ' + tgtSeg + '.x\n' +
        '请让两台手机连同一个 WiFi；或由创建者开热点、你这台连它的热点（关掉自己的流量）';
    } else {
      // 网段看起来一致却还是连不上 → 多半是 WiFi 开了「AP 隔离」
      // （客户端之间不允许互访，常见于公共 WiFi / 部分路由器）。
      // 用真·TCP 探测把结论钉死，别让用户猜。
      try {
        var m2 = getServerUrl().match(/ws:\/\/([\d.]+):(\d+)/);
        if (m2 && window.AndroidHost && window.AndroidHost.tcpProbe) {
          var r = window.AndroidHost.tcpProbe(m2[1], parseInt(m2[2], 10), 3000);
          reason += '\n探测 ' + m2[1] + ':' + m2[2] + ' → ' + r;
          if (r.indexOf('TIMEOUT') === 0) {
            reason += '\n同一网段却连不上 = 这台 WiFi 开了「AP 隔离」，' +
              '不允许设备之间互相访问。\n解决：让创建者开手机热点，你连它的热点（关掉自己的流量）。';
          }
          if (r.indexOf('REFUSED') === 0) {
            reason += '\n创建者的联机服务没起来（或没在监听 3000）。\n解决：让创建者退出重进一次 App 再创建房间。';
          }
        }
      } catch (e) { }
    }

    setJoinStatus('✗ 连接失败：' + reason, 'bad');
    showMPError('连接失败: ' + reason);
  });

  PeerManager.joinRoom(code, name, GS.character || 'qike');
}

// ============================================================
// 刷新「我是不是主机」
//
// 服务端在房主掉线时会把主机移交给下一个人，并广播 player_list_update。
// 但前端一直没人更新 PeerManager.isHost —— 新主机看到的仍是「准备」按钮，
// 而且 startMultiplayerGame() 开头 `if (!PeerManager.isHost) return;` 会直接返回，
// 结果整个房间卡死：谁也开不了游戏。
// ============================================================
function refreshHostFlag() {
  if (typeof PeerManager === 'undefined' || !PeerManager.playerId) return false;
  var me = PeerManager.players && PeerManager.players[PeerManager.playerId];
  if (!me || me.isHost === undefined) return false;
  var next = !!me.isHost;
  if (PeerManager.isHost !== next) {
    PeerManager.isHost = next;
    console.log('[PeerManager] 主机身份更新 →', next);
    return true;
  }
  return false;
}

// 显示错误消息（页面内，不弹alert）
function showMPError(msg) {
  var errorEl = document.getElementById('mp-error-msg');
  if (!errorEl) {
    errorEl = document.createElement('div');
    errorEl.id = 'mp-error-msg';
    errorEl.className = 'mp-error-msg';
    var container = document.querySelector('.mp-lobby-content') || document.getElementById('multiplayer-lobby');
    if (container) container.appendChild(errorEl);
  }
  errorEl.textContent = msg;
  errorEl.style.display = 'block';
  // 3秒后自动隐藏
  if (errorEl._hideTimer) clearTimeout(errorEl._hideTimer);
  errorEl._hideTimer = setTimeout(function () {
    errorEl.style.display = 'none';
  }, 5000);
}

function leaveRoom() {
  PeerManager.disconnect();
  MultiplayerUI.hideRoomLobby();
  document.getElementById('char-select').classList.remove('hidden');
}

// ============================================================
// 联机会话级消息处理（建房/进房时都要注册一次）
//
// 这些处理器原来在 createRoom / joinRoomProceed 里各写一份，而且漏掉了
// "队友退出要清模型" 和 "房主对局中掉线" 这两种情况。
// 统一收在这里，两边只调用一次，避免漏注册。
// ============================================================
function _registerSessionHandlers() {
  // 队友退出：服务端已经从名单里删掉了他，但 3D 模型是客户端自己建的。
  // 原来只有加入者会在下一帧快照里被清掉，房主端永远留着那个"木头人"。
  PeerManager.on('player_left', function (data) {
    if (!data || !data.playerId) return;
    if (typeof SyncManager !== 'undefined' && SyncManager.removeRemotePlayer) {
      try { SyncManager.removeRemotePlayer(data.playerId); } catch (e) { }
    }
    MultiplayerUI.updateSlots();
    MultiplayerUI.updateCharSelect();
  });

  // 房主在对局中掉线：怪物/宝箱/掉落的权威世界全在原房主本地，
  // 没有任何一个加入者能接管，只能结束本局并明确告知。
  PeerManager.on('host_left', function (data) {
    if (typeof GS === 'undefined' || GS.mode !== 'multiplayer') return;
    endMultiplayerRun((data && data.message) || '房主已离开，本局结束');
  });

  // 重连上去时房间已经没了（房主解散 / 对局结束 / 所有人都走了）
  PeerManager.on('room_gone', function (data) {
    var msg = (data && data.message) || '房间已关闭';
    var inRun = (typeof GS !== 'undefined' && GS.mode === 'multiplayer' && GS.running);
    if (inRun) {
      endMultiplayerRun(msg);
    } else if (typeof showMPError === 'function') {
      showMPError(msg + '，请重新创建或加入房间');
    }
    if (!inRun) {
      try { PeerManager.disconnect(); } catch (e) { }
      MultiplayerUI.hideRoomLobby();
      var cs = document.getElementById('char-select');
      if (cs) cs.classList.remove('hidden');
    }
  });
}

// 连接中断后自动重连的看门狗：3 次机会（约 12 秒），
// 全部失败才判定掉线并结算，避免一次抖动就把整局判死。
function _watchReconnectInGame() {
  if (typeof GS === 'undefined' || GS.mode !== 'multiplayer' || GS.gameOver) return false;
  if (typeof showMessage === 'function') showMessage('📡 连接中断，正在重连…', 0xffcc44);
  var tries = 0;
  var timer = setInterval(function () {
    if (PeerManager.connected && PeerManager.playerId) {
      clearInterval(timer);
      if (typeof showMessage === 'function') showMessage('✅ 已重新连接', 0x66ffcc);
      return;
    }
    if (++tries > 3) {
      clearInterval(timer);
      endMultiplayerRun('网络中断，重连失败');
    }
  }, 4000);
  return true;
}

// 结束联机对局（房主掉线 / 房间关闭 / 重连失败）。
// 复用结算界面，标题直接说明原因，按钮仍走原来的"重新选择 / 返回主页"。
function endMultiplayerRun(reason) {
  var msg = reason || '联机中断';
  GS.running = false;
  GS.gameOver = true;
  try { if (typeof showSpectatorHud === 'function') showSpectatorHud(false); } catch (e) { }
  try { if (typeof AudioMgr !== 'undefined' && AudioMgr.playCharacterVoice) AudioMgr.playCharacterVoice('defeat'); } catch (e) { }

  // 答题/开箱这类模态弹窗必须先收掉，否则会盖在结算界面上面
  var quiz = document.getElementById('quiz-overlay');
  if (quiz) quiz.style.display = 'none';

  var title = document.getElementById('result-title');
  var answers = document.getElementById('final-answers');
  var weapons = document.getElementById('final-weapons');
  var go = document.getElementById('game-over');
  if (title) title.textContent = '📴 ' + msg;
  if (answers) answers.textContent = '本局已结束，请返回大厅重新创建房间';
  if (weapons) weapons.textContent = '';
  if (go) go.style.display = 'flex';
  try { if (typeof isPointerLocked !== 'undefined' && isPointerLocked) document.exitPointerLock(); } catch (e) { }
  if (typeof showMessage === 'function') showMessage('📴 ' + msg, 0xff9a3c);

  // 主动退房，别在服务端留一条"已结束但还占着位置"的连接
  try { PeerManager._send({ type: 'leave_room' }); } catch (e) { }
  PeerManager.roomCode = null;
  PeerManager._joinedOnce = false;
  PeerManager.players = {};
}

// ============================================================
// 角色选择
// ============================================================
function selectCharSlot(character) {
  if (!PeerManager.playerId) return;
  if (!PeerManager.players[PeerManager.playerId]) return;

  // 联机模式允许玩家自由选择任意角色，不限制重复
  PeerManager.players[PeerManager.playerId].character = character;
  GS.character = character;
  selectedChar = character;
  PeerManager.playerCharacter = character; // 同步更新 PeerManager 中的角色

  // 通知服务器角色变更
  PeerManager._send({
    type: 'select_character',
    character: character
  });

  MultiplayerUI.updateSlots();
  MultiplayerUI.updateCharSelect();
}

function toggleReady() {
  var btn = document.getElementById('ready-btn');
  var isReady = btn.classList.toggle('ready');
  PeerManager.setReady(isReady);
  MultiplayerUI.updateSlots();
}

function startMultiplayerGame() {
  if (!PeerManager.isHost) return;
  if (!PeerManager.allReady() && Object.keys(PeerManager.players).length > 1) {
    alert('等待所有玩家准备');
    return;
  }
  GS.mode = 'multiplayer';
  GS.isHost = true;
  GS.playerId = PeerManager.playerId;
  // 主机自己也要落到 GS.difficulty。
  // 原来只把难度塞进 start_game 发给加入者，主机本地仍是上一个默认值 ——
  // 房间内把难度从初级改成中/高级时，会出现"主机按初级刷怪、加入者按高级"的分裂。
  GS.difficulty = selectedDiff || 'medium';
  // 通知服务器开始游戏（服务器会广播给所有玩家）
  PeerManager._send({
    type: 'start_game',
    chapter: selectedChapter || 3,
    difficulty: selectedDiff || 'medium',
    character: selectedChar || 'qike'
  });
  beginMultiplayerGame();
}

function beginMultiplayerGame() {
  MultiplayerUI.hideRoomLobby();
  selectChapter(selectedChapter || 3);
}

// 注册 game_start 事件处理器（加入者接收开始信号）
// 注意：主机自己发送 start_game 消息，服务器会广播回给自己
// 因此主机在接收到 game_start 时不重复初始化，避免双重 init()
function _registerGameStartHandler() {
  // 会话级消息（队友退出 / 房主掉线 / 房间不存在）所有入口都需要
  _registerSessionHandlers();

  // 房主的难度/章节设置变更 —— 加入者只做显示同步，不参与决策
  PeerManager.on('room_settings', function (data) {
    if (!data || GS.isHost || PeerManager.isHost) return;
    if (data.difficulty && typeof selectMPDifficulty === 'function') selectMPDifficulty(data.difficulty);
    if (data.chapter && typeof selectMPChapter === 'function') selectMPChapter(data.chapter);
  });

  PeerManager.on('game_start', function (data) {
    // 主机已经自己调用过 beginMultiplayerGame()，跳过
    if (GS.isHost || PeerManager.isHost) return;

    selectedChapter = data.chapter || 3;
    selectedDiff = data.difficulty || 'medium';
    selectedChar = PeerManager.playerCharacter || 'qike';
    GS.character = selectedChar;
    GS.difficulty = selectedDiff;
    GS.mode = 'multiplayer';
    GS.isHost = false;
    GS.playerId = PeerManager.playerId;
    beginMultiplayerGame();
  });
}

// 在 game-network.js 中为 GS 添加默认值
if (typeof GS !== 'undefined') {
  GS.mode = 'single';
  GS.isHost = false;
  GS.playerId = null;
}
// ============================================================
// 返回/导航按钮兜底接管
//
// 菜单里的返回按钮用的是内联 onclick。一旦出现「全局函数被同名变量覆盖 /
// 脚本加载顺序变化 / 属性被缓存成旧版本」，用户看到的就是"点了没反应"，
// 而且在控制台不一定有报错，极难排查。
//
// 这里在 capture 阶段统一接管：从 onclick 属性里解析出函数名并调用，
// 再阻止事件继续传播，避免内联处理器重复执行一次。
// 解析或查找失败时完全放行，交回原本的内联 onclick。
// ============================================================
document.addEventListener('click', function (e) {
  var el = e.target;
  var btn = (el && el.closest) ? el.closest('.back-btn[onclick]') : null;
  if (!btn) return;

  var attr = btn.getAttribute('onclick') || '';
  // 只接管「纯无参调用」形式（如 onclick="backToCharSelect()"）。
  // 带参数或写得更复杂的表达式一律放行，避免这里传错实参。
  var m = /^\s*([A-Za-z_$][\w$]*)\s*\(\s*\)\s*;?\s*$/.exec(attr);
  if (!m) return;

  var fn = window[m[1]];
  if (typeof fn !== 'function') {
    console.warn('[导航] 找不到处理函数 ' + m[1] + '，放行给内联 onclick');
    return;
  }

  e.preventDefault();
  e.stopPropagation();
  try {
    fn.call(btn);
  } catch (err) {
    console.error('[导航] 执行 ' + m[1] + ' 出错:', err);
  }
}, true);
