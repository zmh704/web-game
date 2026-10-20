// ============================================================
// 网络模块 — WebSocket 联机通信
// 连接本地服务器：ws://服务器IP:3000
// ============================================================

// WebSocket 服务器地址（自动根据页面访问地址推断，可被输入框覆盖）
var WS_URL = (function () {
  var loc = window.location;
  var host = loc.hostname;
  var port = loc.port || 3000;
  // 如果是 file:// 协议，使用默认地址
  if (loc.protocol === 'file:') return 'ws://localhost:3000';
  return 'ws://' + host + ':' + port;
})();

// 允许通过输入框覆盖服务器地址
function getServerUrl() {
  var input = document.getElementById('multiplayer-server-input');
  if (input && input.value.trim()) {
    var val = input.value.trim();
    // 如果输入的是 IP:端口 格式
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?$/.test(val)) {
      return 'ws://' + (val.indexOf(':') === -1 ? val + ':3000' : val);
    }
    // 如果输入的是完整 ws:// 地址
    if (val.startsWith('ws://') || val.startsWith('wss://')) {
      return val;
    }
    // 纯 IP
    return 'ws://' + val + ':3000';
  }
  return WS_URL;
}

var WS_RECONNECT_DELAY = 3000; // 重连延迟
var WS_HEARTBEAT_INTERVAL = 5000; // 心跳间隔

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

  // ============================================================
  // 连接 WebSocket 服务器
  // ============================================================
  _connect: function () {
    var self = this;
    if (this.ws) {
      try { this.ws.close(); } catch (e) { }
      this.ws = null;
    }

    var url = getServerUrl();
    console.log('[PeerManager] 连接服务器:', url);

    this.ws = new WebSocket(url);

    this.ws.onopen = function () {
      console.log('[PeerManager] 已连接到服务器');
      self.connected = true;
      // 断线重连后自动重新进房
      if (self._pendingRoomAction) {
        var action = self._pendingRoomAction;
        self._pendingRoomAction = null;
        setTimeout(function () {
          self._send(action);
        }, 100);
      }
    };

    this.ws.onmessage = function (event) {
      var msg;
      try { msg = JSON.parse(event.data); } catch (e) { return; }
      if (!msg || !msg.type) return;

      self._handleServerMessage(msg);
    };

    this.ws.onclose = function () {
      console.log('[PeerManager] 与服务器断开');
      self.connected = false;
      if (!self._disconnecting) {
        self._emit('connection_lost', { message: '与服务器的连接已断开' });
        // 自动重连
        self._reconnectTimer = setTimeout(function () {
          if (!self._disconnecting) {
            console.log('[PeerManager] 尝试重连...');
            self._connect();
          }
        }, WS_RECONNECT_DELAY);
      }
    };

    this.ws.onerror = function (err) {
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
        self.isHost = true;
        self.players = {};
        if (msg.players) {
          msg.players.forEach(function (p) { self.players[p.id] = p; });
        }
        console.log('[PeerManager] 房间创建成功:', msg.roomCode);
        self._startHeartbeat();
        self._emit('room_created', { roomCode: msg.roomCode });
        break;

      case 'room_joined':
        self.playerId = msg.playerId;
        self.roomCode = msg.roomCode;
        self.isHost = false;
        self.players = {};
        if (msg.players) {
          msg.players.forEach(function (p) { self.players[p.id] = p; });
        }
        // 设置 GS 状态，确保 initMultiplayerMode 在 init() 中被正确调用
        if (typeof GS !== 'undefined') {
          GS.mode = 'multiplayer';
          GS.isHost = false;
          GS.playerId = msg.playerId;
        }
        console.log('[PeerManager] 加入房间成功:', msg.roomCode);
        self._startHeartbeat();
        self._emit('room_joined', {
          roomId: msg.roomCode,
          playerId: msg.playerId,
          players: msg.players || []
        });
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
          chapter: msg.chapter || 1,
          difficulty: msg.difficulty || 'easy',
          character: msg.character || 'qike'
        });
        break;

      case 'relay':
        // 来自其他玩家的中继消息
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
    this.playerName = playerName || '主机';
    this.playerCharacter = character || 'qike';
    this.players = {};

    // 保存进房动作，断线重连后自动重发
    this._pendingRoomAction = {
      type: 'create_room',
      playerName: this.playerName,
      character: this.playerCharacter
    };

    this._cleanup();
    this._connect();

    // 等待连接就绪后发送创建房间请求
    var waitConnect = function () {
      if (self.ws && self.ws.readyState === WebSocket.OPEN) {
        self._send({
          type: 'create_room',
          playerName: self.playerName,
          character: self.playerCharacter
        });
      } else if (self.ws && self.ws.readyState === WebSocket.CONNECTING) {
        setTimeout(waitConnect, 100);
      } else {
        self._emit('error', { message: '无法连接到服务器，请检查服务器是否已启动' });
      }
    };
    setTimeout(waitConnect, 200);
  },

  // ============================================================
  // 加入房间（加入者）
  // ============================================================
  joinRoom: function (roomCode, playerName, character) {
    var self = this;
    this._disconnecting = false;
    this.isHost = false;
    this.roomCode = roomCode.toUpperCase();
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

    this._cleanup();
    this._connect();

    // 等待连接就绪后发送加入房间请求
    var waitConnect = function () {
      if (self.ws && self.ws.readyState === WebSocket.OPEN) {
        self._send({
          type: 'join_room',
          roomCode: self.roomCode,
          playerName: self.playerName,
          character: self.playerCharacter
        });
      } else if (self.ws && self.ws.readyState === WebSocket.CONNECTING) {
        setTimeout(waitConnect, 100);
      } else {
        self._emit('error', { message: '无法连接到服务器，请检查服务器是否已启动' });
      }
    };
    setTimeout(waitConnect, 200);
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
        self._emit('connection_lost', { message: '与服务器的连接已断开' });
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
      // 主机显示难度/章节设置
      if (settings) {
        settings.style.display = 'block';
        if (typeof selectMPDifficulty === 'function') selectMPDifficulty(selectedDiff || 'easy');
        if (typeof selectMPChapter === 'function') selectMPChapter(selectedChapter || 1);
      }
    } else {
      if (readyBtn) readyBtn.style.display = 'inline-block';
      if (startBtn) {
        startBtn.classList.add('hidden');
        startBtn.style.display = 'none';
      }
      if (settings) settings.style.display = 'none';
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
      var charIcon = p.character === 'qike' ? '👦' : '👧';
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
    el.innerHTML = '<span class="chat-name">' + playerName + ':</span> ' + escapeHtml(text);
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
  var name = document.getElementById('multiplayer-name-input').value || '玩家';
  var code = generateRoomCode();

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

  // 清空所有旧处理器
  for (var t in PeerManager.handlers) {
    PeerManager.off(t);
  }

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
        }
      });
      MultiplayerUI.updateSlots();
      MultiplayerUI.updateCharSelect();
    }
  });

  PeerManager.on('player_ready', function (data) {
    if (data && data.playerId && PeerManager.players[data.playerId]) {
      PeerManager.players[data.playerId].ready = data.ready;
      MultiplayerUI.updateSlots();
    }
  });

  PeerManager.on('player_left', function (data) {
    MultiplayerUI.updateSlots();
    MultiplayerUI.updateCharSelect();
  });

  PeerManager.on('connection_lost', function (data) {
    // 显示连接错误（不弹alert，改用页面内提示）
    if (creatingText) creatingText.textContent = '❌ 连接失败';
    if (creatingError) {
      creatingError.textContent = '无法连接到服务器\n请检查：\n1. 电脑是否已启动服务器 (node server.js)\n2. 手机和电脑是否在同一WiFi\n3. 服务器地址是否正确';
      creatingError.style.display = 'block';
    }
    if (creatingCancel) creatingCancel.textContent = '返回';
  });

  PeerManager.on('error', function (data) {
    creating.classList.add('hidden');
    creating.style.display = 'none';
    if (actions) actions.style.display = 'flex';
    if (creatingError) {
      creatingError.textContent = '错误: ' + (data.message || '未知错误');
      creatingError.style.display = 'block';
    }
  });

  // 连接超时处理（10秒）
  var createTimeout = setTimeout(function () {
    if (creating && creating.style.display !== 'none' && !creating.classList.contains('hidden')) {
      if (creatingText) creatingText.textContent = '⏱️ 连接超时';
      if (creatingError) {
        creatingError.textContent = '连接超时，请检查：\n1. 服务器是否已启动 (node server.js)\n2. 服务器地址是否正确\n3. 手机和电脑是否在同一WiFi网络';
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

  PeerManager.hostRoom(code, name, GS.character || 'qike');
}

function joinRoom() {
  var code = document.getElementById('room-code-input').value.trim();
  if (!code || code.length < 4) {
    showMPError('请输入有效的房间码');
    return;
  }
  var name = document.getElementById('multiplayer-name-input').value || '玩家';

  // 清空所有旧处理器
  for (var t in PeerManager.handlers) {
    PeerManager.off(t);
  }

  // 注册 game_start 处理器（加入者接收开始信号必需）
  _registerGameStartHandler();

  // 按钮反馈
  var btn = document.querySelector('#join-room-form .mp-btn-small');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ 连接中...'; }

  // 连接超时提示（10秒）
  var joinTimeout = setTimeout(function () {
    if (btn) { btn.disabled = false; btn.textContent = '加入'; }
    showMPError('连接超时，请检查：\n1. 服务器是否已启动\n2. 房间码是否正确\n3. 是否在同一网络');
  }, 10000);

  PeerManager.on('room_joined', function (data, fromPeerId) {
    clearTimeout(joinTimeout);
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
        }
      });
      MultiplayerUI.updateSlots();
      MultiplayerUI.updateCharSelect();
    }
  });

  PeerManager.on('player_ready', function (data) {
    if (data && data.playerId && PeerManager.players[data.playerId]) {
      PeerManager.players[data.playerId].ready = data.ready;
      MultiplayerUI.updateSlots();
    }
  });

  PeerManager.on('player_left', function (data) {
    MultiplayerUI.updateSlots();
    MultiplayerUI.updateCharSelect();
  });

  PeerManager.on('connection_lost', function (data) {
    clearTimeout(joinTimeout);
    if (btn) { btn.disabled = false; btn.textContent = '加入'; }
    showMPError('连接丢失: ' + (data.message || '与服务器的连接已断开'));
    leaveRoom();
  });

  PeerManager.on('error', function (data) {
    clearTimeout(joinTimeout);
    if (btn) { btn.disabled = false; btn.textContent = '加入'; }
    showMPError('连接失败: ' + (data.message || '找不到房间，请检查房间码'));
  });

  PeerManager.joinRoom(code, name, GS.character || 'qike');
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
  // 通知服务器开始游戏（服务器会广播给所有玩家）
  PeerManager._send({
    type: 'start_game',
    chapter: selectedChapter || 1,
    difficulty: selectedDiff || 'easy',
    character: selectedChar || 'qike'
  });
  beginMultiplayerGame();
}

function beginMultiplayerGame() {
  MultiplayerUI.hideRoomLobby();
  selectChapter(selectedChapter || 1);
}

// 注册 game_start 事件处理器（加入者接收开始信号）
// 注意：主机自己发送 start_game 消息，服务器会广播回给自己
// 因此主机在接收到 game_start 时不重复初始化，避免双重 init()
function _registerGameStartHandler() {
  PeerManager.on('game_start', function (data) {
    // 主机已经自己调用过 beginMultiplayerGame()，跳过
    if (GS.isHost || PeerManager.isHost) return;

    selectedChapter = data.chapter || 1;
    selectedDiff = data.difficulty || 'easy';
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