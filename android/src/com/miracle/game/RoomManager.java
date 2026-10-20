package com.miracle.forest;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 联机房间管理 —— 协议与 node 版 server.js 完全一致，前端无需任何改动。
 *
 * 跑在「创建房间」那台 Android 手机上：
 *   · 创建者连 ws://127.0.0.1:3000（自己就是服务器）
 *   · 加入者连 ws://<创建者局域网IP>:3000
 *
 * 支持的消息类型（与 server.js 的 switch 一一对应）：
 *   create_room / join_room / leave_room / ready / select_character
 *   start_game / relay / broadcast
 */
public class RoomManager implements WSServer.Listener, RoomDiscovery.RoomCodeProvider {

    /** org.json 的 put 会抛受检异常，链式写起来很啰嗦 */
    static class JO extends JSONObject {
        JO putSafe(String k, Object v) {
            try { return (JO) put(k, v); } catch (Exception e) { return this; }
        }
    }

    private static final String TAG = "[RoomManager]";

    private static class Player {
        final String peerId;
        final WSServer.Conn conn;
        String name;
        String character;
        boolean isHost;
        boolean ready;

        Player(String peerId, WSServer.Conn conn, String name, String character, boolean isHost) {
            this.peerId = peerId;
            this.conn = conn;
            this.name = name;
            this.character = character;
            this.isHost = isHost;
        }

        JSONObject toJson() {
            JSONObject o = new JO();
            try {
                o.put("id", peerId);
                o.put("name", name == null ? "玩家" : name);
                o.put("character", character == null ? "qike" : character);
                o.put("isHost", isHost);
                o.put("ready", ready);
            } catch (Exception ignored) { }
            return o;
        }
    }

    private static class Room {
        final String code;
        final Map<String, Player> players = new ConcurrentHashMap<>();
        volatile String hostId;

        Room(String code) { this.code = code; }
    }

    private final Map<String, Room> rooms = new ConcurrentHashMap<>();
    private final Map<String, String> connRoom = new ConcurrentHashMap<>();   // peerId → roomCode
    private final Random rnd = new Random();

    /** 供 UDP 广播使用：当前开放中的房间码 */
    @Override
    public List<String> activeRoomCodes() {
        return new java.util.ArrayList<>(rooms.keySet());
    }

    // ---------------- WSServer.Listener ----------------

    @Override
    public void onOpen(WSServer.Conn conn) {
        android.util.Log.i(TAG, "新连接 " + conn.addr());
    }

    @Override
    public void onMessage(WSServer.Conn conn, String text) {
        JSONObject msg;
        try {
            msg = new JSONObject(text);
        } catch (Exception e) {
            return;   // 非 JSON 直接忽略
        }
        String type = msg.optString("type", "");
        try {
            switch (type) {
                case "create_room": onCreateRoom(conn, msg); break;
                case "join_room":    onJoinRoom(conn, msg); break;
                case "leave_room":   onLeaveRoom(conn); break;
                case "ready":        onReady(conn, msg); break;
                case "select_character": onSelectCharacter(conn, msg); break;
                case "start_game":   onStartGame(conn, msg); break;
                case "relay":        onRelay(conn, msg); break;
                case "broadcast":    onBroadcast(conn, msg); break;
                default: break;
            }
        } catch (Exception e) {
            android.util.Log.w(TAG, "处理消息出错: " + e);
        }
    }

    @Override
    public void onClose(WSServer.Conn conn) {
        // 连接断开：从房间移除并通知其他人；房间空了就删掉
        String code = connRoom.remove(conn.peerId);
        if (code == null) return;
        Room room = rooms.get(code);
        if (room == null) return;

        Player left = room.players.remove(conn.peerId);
        if (left == null) return;

        if (room.players.isEmpty()) {
            rooms.remove(code);
            return;
        }
        // 主机掉线：把主机移交给房间里最早加入的人，房间不散
        if (conn.peerId.equals(room.hostId)) {
            Player newHost = null;
            for (Player p : room.players.values()) { newHost = p; break; }
            if (newHost != null) {
                newHost.isHost = true;
                room.hostId = newHost.peerId;
            }
        }
        broadcast(room, new JO()
                .putSafe("type", "player_left")
                .putSafe("playerId", conn.peerId), null);
        broadcastPlayerList(room);
    }

    // ---------------- 各消息处理 ----------------

    /**
     * 房间内昵称去重（与 node 版 server.js 的 uniquePlayerName 行为一致）。
     *
     * 客户端会随机生成昵称，但随机也会撞号 —— 两台手机可能都摇到"勇敢狐狸"。
     * 唯一性只能由服务端兜底：冲突就加数字后缀。
     * 返回最终生效的名字，必须写回 Player 并发回客户端，
     * 否则客户端界面上显示的还是原来那个重复的名字。
     */
    private static String uniquePlayerName(Room room, String desired) {
        String base = (desired == null ? "" : desired.trim());
        if (base.length() > 8) base = base.substring(0, 8);
        if (base.isEmpty()) base = "玩家";

        java.util.Set<String> taken = new java.util.HashSet<>();
        for (Player p : room.players.values()) {
            if (p.name != null) taken.add(p.name);
        }
        if (!taken.contains(base)) return base;

        // 后缀要挤进 8 个字符以内（输入框 maxlength=8），所以先截断 base
        String prefix = base.length() > 7 ? base.substring(0, 7) : base;
        for (int i = 2; i < 100; i++) {
            String cand = prefix + i;
            if (!taken.contains(cand)) return cand;
        }
        return base + "_" + (System.currentTimeMillis() % 1000);
    }

    private void onCreateRoom(WSServer.Conn conn, JSONObject msg) {
        if (connRoom.containsKey(conn.peerId)) {
            send(conn, err("已经在一个房间中"));
            return;
        }
        String code = String.format("%04d", rnd.nextInt(10000));
        Room room = new Room(code);
        String hostName = uniquePlayerName(room, msg.optString("playerName", "主机"));
        Player host = new Player(conn.peerId, conn, hostName, msg.optString("character", "qike"), true);
        room.players.put(conn.peerId, host);
        room.hostId = conn.peerId;
        rooms.put(code, room);
        connRoom.put(conn.peerId, code);

        send(conn, new JO()
                .putSafe("type", "room_created")
                .putSafe("roomCode", code)
                .putSafe("playerId", conn.peerId)
                .putSafe("playerName", hostName)
                .putSafe("players", playerList(room)));
    }

    private void onJoinRoom(WSServer.Conn conn, JSONObject msg) {
        if (connRoom.containsKey(conn.peerId)) {
            send(conn, err("已经在一个房间中"));
            return;
        }
        Room room = rooms.get(msg.optString("roomCode", ""));
        if (room == null) {
            send(conn, err("找不到该房间，请检查房间码是否正确"));
            return;
        }
        // 房间上限 3 人：界面只有 3 个角色位，第 4 人进来会没有位置、
        // 还会让"准备/开始"的人数判断错乱，在入口挡住。
        if (room.players.size() >= 3) {
            send(conn, err("房间已满（最多 3 人）"));
            return;
        }
        String want = msg.optString("playerName", "玩家");
        String joinName = uniquePlayerName(room, want);
        Player p = new Player(conn.peerId, conn, joinName, msg.optString("character", "qike"), false);
        room.players.put(conn.peerId, p);
        connRoom.put(conn.peerId, room.code);
        android.util.Log.i(TAG, "加入房间 " + room.code + " 玩家 " + conn.peerId + " 昵称 " + joinName
                + (joinName.equals(want) ? "" : "（原名 " + want + " 重复，已自动改名）"));

        send(conn, new JO()
                .putSafe("type", "room_joined")
                .putSafe("roomCode", room.code)
                .putSafe("playerId", conn.peerId)
                .putSafe("playerName", joinName)
                .putSafe("players", playerList(room)));

        broadcast(room, new JO()
                .putSafe("type", "player_list_update")
                .putSafe("players", playerList(room)), conn.peerId);
    }

    private void onLeaveRoom(WSServer.Conn conn) {
        onClose(conn);
    }

    private void onReady(WSServer.Conn conn, JSONObject msg) {
        Room room = roomOf(conn);
        if (room == null) return;
        Player p = room.players.get(conn.peerId);
        if (p == null) return;
        p.ready = msg.optBoolean("ready", false);

        broadcast(room, new JO()
                .putSafe("type", "player_ready")
                .putSafe("playerId", conn.peerId)
                .putSafe("ready", p.ready), null);
    }

    private void onSelectCharacter(WSServer.Conn conn, JSONObject msg) {
        Room room = roomOf(conn);
        if (room == null) return;
        Player p = room.players.get(conn.peerId);
        if (p == null) return;
        p.character = msg.optString("character", p.character);
        broadcastPlayerList(room);
    }

    private void onStartGame(WSServer.Conn conn, JSONObject msg) {
        Room room = roomOf(conn);
        if (room == null) return;
        // 只有主机能开始
        if (!conn.peerId.equals(room.hostId)) return;
        broadcast(room, new JO()
                .putSafe("type", "game_start")
                .putSafe("chapter", msg.optInt("chapter", 1)), conn.peerId);
    }

    private void onRelay(WSServer.Conn conn, JSONObject msg) {
        Room room = roomOf(conn);
        if (room == null) return;
        String target = msg.optString("targetPeerId", "");
        Player to = room.players.get(target);
        if (to == null) return;
        send(to.conn, new JO()
                .putSafe("type", "relay")
                .putSafe("fromPeerId", conn.peerId)
                .putSafe("messageType", msg.optString("messageType"))
                .putSafe("data", msg.optJSONObject("data")));
    }

    private void onBroadcast(WSServer.Conn conn, JSONObject msg) {
        Room room = roomOf(conn);
        if (room == null) return;
        // 必须排除发送者自己（node 版最初漏了这点，导致广播回传引发重复计算）
        broadcast(room, new JO()
                .putSafe("type", "relay")
                .putSafe("fromPeerId", conn.peerId)
                .putSafe("messageType", msg.optString("messageType"))
                .putSafe("data", msg.optJSONObject("data")), conn.peerId);
    }

    // ---------------- 工具 ----------------

    private Room roomOf(WSServer.Conn conn) {
        String code = connRoom.get(conn.peerId);
        return code == null ? null : rooms.get(code);
    }

    private static JSONArray playerList(Room room) {
        JSONArray arr = new JSONArray();
        for (Player p : room.players.values()) arr.put(p.toJson());
        return arr;
    }

    private void broadcastPlayerList(Room room) {
        broadcast(room, new JO()
                .putSafe("type", "player_list_update")
                .putSafe("players", playerList(room)), null);
    }

    private void broadcast(Room room, JSONObject msg, String excludePeerId) {
        for (Player p : room.players.values()) {
            if (p.peerId.equals(excludePeerId)) continue;
            send(p.conn, msg);
        }
    }

    private void send(WSServer.Conn conn, JSONObject msg) {
        if (conn != null) conn.sendText(msg.toString());
    }

    private static JSONObject err(String message) {
        return new JO().putSafe("type", "error").putSafe("message", message);
    }
}
