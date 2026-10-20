package com.miracle.forest;

import java.io.ByteArrayOutputStream;
import java.io.Closeable;
import java.io.EOFException;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 极简 WebSocket 服务器（RFC 6455）
 *
 * 让「创建房间」的 Android 手机自己充当联机服务器，加入者连它即可，
 * 不需要额外开一台电脑跑 node server.js。
 *
 * 只实现了本项目用到的部分：
 *   · HTTP  Upgrade 握手（Sec-WebSocket-Accept）
 *   · 文本帧收发（client→server 一定带 mask，server→client 不带）
 *   · ping/pong、close
 *   · 支持 16/64 位扩展长度
 *
 * 并发模型：每连接一个读线程，写操作加锁（避免多线程写交错）。
 */
public class WSServer implements Closeable {

    private static final String WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
    private static final String TAG = "MiracleForest";

    /** 连接对象 */
    public static class Conn implements Closeable {
        public final String peerId;
        public String roomCode;
        private final Socket socket;
        private final OutputStream out;
        private final InputStream in;
        private volatile boolean closed = false;

        Conn(Socket socket, String peerId) throws IOException {
            this.socket = socket;
            this.peerId = peerId;
            this.out = socket.getOutputStream();
            this.in = socket.getInputStream();
        }

        public InetAddress addr() { return socket.getInetAddress(); }

        /** 发送文本帧（线程安全） */
        public synchronized void sendText(String text) {
            if (closed) return;
            try {
                byte[] payload = text.getBytes(StandardCharsets.UTF_8);
                out.write(encodeFrame(0x1, payload));
                out.flush();
            } catch (IOException e) {
                closeQuietly();
            }
        }

        public synchronized void sendPong(byte[] payload) {
            if (closed) return;
            try {
                out.write(encodeFrame(0xA, payload));
                out.flush();
            } catch (IOException e) {
                closeQuietly();
            }
        }

        void closeQuietly() {
            closed = true;
            try { socket.close(); } catch (IOException ignored) { }
        }

        @Override
        public void close() {
            if (closed) return;
            try {
                out.write(encodeFrame(0x8, new byte[0]));
                out.flush();
            } catch (IOException ignored) { }
            closeQuietly();
        }
    }

    /** 消息监听 */
    public interface Listener {
        void onOpen(Conn conn);
        void onMessage(Conn conn, String text);
        void onClose(Conn conn);
    }

    private final int port;
    private final Listener listener;
    private ServerSocket serverSocket;
    private Thread acceptThread;
    private volatile boolean running = false;

    /** peerId → 连接 */
    public final Map<String, Conn> conns = new ConcurrentHashMap<>();

    public WSServer(int port, Listener listener) {
        this.port = port;
        this.listener = listener;
    }

    public boolean isRunning() { return running; }

    public void start() throws IOException {
        if (running) return;
        serverSocket = new ServerSocket(port);
        running = true;
        acceptThread = new Thread(new Runnable() {
            @Override
            public void run() { acceptLoop(); }
        }, "ws-accept");
        acceptThread.setDaemon(true);
        acceptThread.start();
    }

    private void acceptLoop() {
        while (running) {
            try {
                final Socket s = serverSocket.accept();
                s.setTcpNoDelay(true);
                // 必须每个连接单独开线程：
                // handleHandshake 里包含 readLoop（无限循环直到断开），
                // 如果在 accept 线程里同步处理，创建者自己连上后 accept 线程
                // 就被占死了，之后加入者的连接永远排在队列里没人接，
                // 表现就是"加入者一直连接超时"。
                Thread t = new Thread(new Runnable() {
                    @Override
                    public void run() { handleHandshake(s); }
                }, "ws-conn");
                t.setDaemon(true);
                t.start();
            } catch (IOException e) {
                if (running) {
                    // 单连接失败不影响整体
                }
            }
        }
    }

    // ---------------- 握手 ----------------

    private void handleHandshake(Socket s) {
        Conn conn = null;
        try {
            android.util.Log.i(TAG, "收到连接 " + s.getInetAddress());
            s.setSoTimeout(10000);   // 握手最多等 10 秒
            InputStream in = s.getInputStream();

            // 读 HTTP 请求头（以 \r\n\r\n 结束）
            ByteArrayOutputStream head = new ByteArrayOutputStream();
            int prev = -1, prev2 = -1, prev3 = -1, c;
            while ((c = in.read()) != -1) {
                head.write(c);
                if (prev3 == '\r' && prev2 == '\n' && prev == '\r' && c == '\n') break;
                prev3 = prev2; prev2 = prev; prev = c;
            }
            String req = head.toString("UTF-8");
            String key = null;
            for (String line : req.split("\r\n")) {
                int idx = line.indexOf(':');
                if (idx <= 0) continue;
                String name = line.substring(0, idx).trim();
                if ("Sec-WebSocket-Key".equalsIgnoreCase(name)) {
                    key = line.substring(idx + 1).trim();
                }
            }
            if (key == null) { s.close(); return; }

            String accept = Base64.getEncoder().encodeToString(
                    sha1((key + WS_GUID).getBytes(StandardCharsets.ISO_8859_1)));

            String resp = "HTTP/1.1 101 Switching Protocols\r\n"
                    + "Upgrade: websocket\r\n"
                    + "Connection: Upgrade\r\n"
                    + "Sec-WebSocket-Accept: " + accept + "\r\n\r\n";
            s.getOutputStream().write(resp.getBytes(StandardCharsets.ISO_8859_1));
            s.getOutputStream().flush();

            s.setSoTimeout(0);   // 之后无限等

            String peerId = "p_" + Long.toHexString(System.nanoTime());
            conn = new Conn(s, peerId);
            conns.put(peerId, conn);
            android.util.Log.i(TAG, "握手成功 " + conn.addr() + " → " + peerId);
            listener.onOpen(conn);

            s.setSoTimeout(60000);   // 60 秒没有数据视为掉线
            readLoop(conn, in);

        } catch (Exception e) {
            android.util.Log.w(TAG, "握手/读取失败 " + s.getInetAddress() + ": " + e);
        } finally {
            if (conn != null) {
                conns.remove(conn.peerId);
                conn.closeQuietly();
                listener.onClose(conn);
            } else {
                try { s.close(); } catch (IOException ignored) { }
            }
        }
    }

    private void readLoop(Conn conn, InputStream in) throws IOException {
        while (running && !conn.closed) {
            int b0 = in.read();
            if (b0 == -1) throw new EOFException();
            int opcode = b0 & 0x0F;
            // FIN / RSV 暂不校验

            int b1 = in.read();
            if (b1 == -1) throw new EOFException();
            boolean masked = (b1 & 0x80) != 0;
            long len = b1 & 0x7F;

            if (len == 126) {
                len = ((long) readUInt16(in)) & 0xFFFFL;
            } else if (len == 127) {
                len = readUInt64(in);
            }
            if (len < 0 || len > 4L * 1024 * 1024) throw new IOException("frame too large: " + len);

            byte[] mask = null;
            if (masked) {
                mask = new byte[4];
                readFully(in, mask);
            }

            byte[] payload = new byte[(int) len];
            readFully(in, payload);

            if (masked) {
                for (int i = 0; i < payload.length; i++) {
                    payload[i] = (byte) (payload[i] ^ mask[i % 4]);
                }
            }

            switch (opcode) {
                case 0x1:   // text
                    listener.onMessage(conn, new String(payload, StandardCharsets.UTF_8));
                    break;
                case 0x8:   // close
                    throw new EOFException("client close");
                case 0x9:   // ping → pong
                    conn.sendPong(payload);
                    break;
                case 0xA:   // pong
                    break;
                default:
                    break;
            }
        }
    }

    // ---------------- 帧编码 ----------------

    private static byte[] encodeFrame(int opcode, byte[] payload) throws IOException {
        ByteArrayOutputStream f = new ByteArrayOutputStream();
        f.write(0x80 | opcode);   // FIN + opcode

        int len = payload.length;
        if (len < 126) {
            f.write(len);
        } else if (len < 65536) {
            f.write(126);
            f.write((len >> 8) & 0xFF);
            f.write(len & 0xFF);
        } else {
            f.write(127);
            for (int i = 7; i >= 0; i--) f.write((int) ((len >> (8 * i)) & 0xFF));
        }
        f.write(payload);
        return f.toByteArray();
    }

    // ---------------- 工具 ----------------

    private static byte[] sha1(byte[] data) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-1");
        return md.digest(data);
    }

    private static int readUInt16(InputStream in) throws IOException {
        return (in.read() << 8) | in.read();
    }

    private static long readUInt64(InputStream in) throws IOException {
        long v = 0;
        for (int i = 0; i < 8; i++) v = (v << 8) | (in.read() & 0xFFL);
        return v;
    }

    private static void readFully(InputStream in, byte[] buf) throws IOException {
        int off = 0;
        while (off < buf.length) {
            int n = in.read(buf, off, buf.length - off);
            if (n == -1) throw new EOFException();
            off += n;
        }
    }

    // ---------------- 本机局域网 IP ----------------

    /** 取本机在局域网里的 IPv4（供其他手机连接） */
    public static String localIpv4() {
        try {
            String wlanIp = null;      // WiFi 网卡 —— 最希望用这个
            String fallback = null;    // 其他私有网段（排除蜂窝/VPN）
            String cellular = null;    // 蜂窝网段，最后才用

            for (NetworkInterface nif : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (nif.isLoopback() || !nif.isUp()) continue;
                String name = nif.getName() == null ? "" : nif.getName().toLowerCase();
                // 蜂窝/VPN/USB 网络共享的特征名：rmnet、ccmni、tun、ppp、usb
                boolean isCellular = name.startsWith("rmnet") || name.startsWith("ccmni")
                        || name.startsWith("tun") || name.startsWith("ppp")
                        || name.startsWith("usb");
                // WiFi / 以太网 / 软热点（swlan0、ap0 —— 开热点时队友连的就是它）。
                // 注意 swlan 不能再归到蜂窝：创建者开热点时它是唯一可用的局域网地址，
                // 被当成蜂窝排到最后会导致加入者拿到一个不可达的运营商内网地址。
                boolean isWlan = name.startsWith("wlan") || name.startsWith("eth")
                        || name.startsWith("swlan") || name.startsWith("ap");

                for (InetAddress addr : Collections.list(nif.getInetAddresses())) {
                    if (addr.isLoopbackAddress()) continue;
                    String ip = addr.getHostAddress();
                    if (ip == null || ip.indexOf(':') >= 0) continue;   // 跳过 IPv6
                    if (!isPrivateV4(ip)) continue;

                    if (isWlan) {
                        if (wlanIp == null) wlanIp = ip;
                    } else if (isCellular) {
                        if (cellular == null) cellular = ip;
                    } else if (fallback == null) {
                        fallback = ip;
                    }
                }
            }
            // WiFi 优先于其他私有网段优先于蜂窝：
            // 手机同时开着 WiFi 和流量时，rmnet 蜂窝网卡的 10.x.x.x 会排在前面，
            // 返回它的话加入者会去连一个不可达的运营商内网地址 —— 永远超时。
            if (wlanIp != null) return wlanIp;
            if (fallback != null) return fallback;
            if (cellular != null) return cellular;
        } catch (Exception ignored) { }
        return "127.0.0.1";
    }

    /** 是否为 RFC1918 私有网段 */
    private static boolean isPrivateV4(String ip) {
        return ip.startsWith("10.") || ip.startsWith("192.168.")
                || (ip.length() > 4 && ip.startsWith("172.") && is172Private(ip));
    }

    private static boolean is172Private(String ip) {
        try {
            int second = Integer.parseInt(ip.split("\\.")[1]);
            return second >= 16 && second <= 31;
        } catch (Exception e) { return false; }
    }

    @Override
    public void close() {
        running = false;
        for (Conn c : conns.values()) c.closeQuietly();
        conns.clear();
        if (serverSocket != null) {
            try { serverSocket.close(); } catch (IOException ignored) { }
        }
    }
}
