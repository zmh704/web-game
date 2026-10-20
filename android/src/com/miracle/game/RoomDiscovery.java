package com.miracle.forest;

import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;

/**
 * 局域网房间发现（UDP）
 *
 * 让加入者只需要输入房间码，不用知道创建者的 IP。
 *
 * 协议（端口 3001，与 WebSocket 的 3000 分开）：
 *   · 创建者：每秒广播一次  MIRACLE_ROOM|<codes>|<ip>:3000|<候选ip:3000,候选ip:3000>
 *   · 加入者：发送查询      MIRACLE_QUERY|<code>   （发到 255.255.255.255:3001）
 *   · 创建者：命中后**单播回复**同格式报文给查询方
 *
 * ────────────────────────────────────────────────────────────
 * 关键修复（"能找到房间，但连接超时"的真正原因）
 *
 * 症状：加入者能通过房间码查询到创建者，拿到形如 192.168.16.105:3000 的地址，
 *       但 WebSocket 连上去一定超时。
 *
 * 反推：UDP 广播查询发的是 255.255.255.255，**广播不会跨网段**。
 *       既然创建者收到了查询并回了包，两台设备必然在同一个二层网络里。
 *       同一个二层网络里 TCP 却连不上，只有一个解释 ——
 *       创建者告诉加入者的那个 IP（192.168.16.105），
 *       **并不是它在这个二层网络里的地址**。
 *
 * 成因：创建者原来用 WSServer.localIpv4() 按网卡名字（wlan/eth/rmnet…）
 *       挑一个"看起来像 WiFi"的 IP。手机上同时存在 WiFi、流量、VPN、
 *       热点、USB 共享等多张网卡时，按名字挑经常挑错；挑到的是另一张网卡
 *       的地址，加入者自然永远连不上。
 *
 * 修法：不再猜。创建者收到查询时，直接问操作系统
 *       "要发包给这个对端，你会用我哪个本地地址？"
 *       —— 用一个 connect() 到对端的临时 DatagramSocket 读 getLocalAddress()。
 *       这个地址一定是与对端同一二层网络的地址，TCP 必然可达。
 *       同时把所有私有 IPv4 一并作为候选地址回给加入者逐个尝试，双保险。
 * ────────────────────────────────────────────────────────────
 *
 * 端口分配：创建者绑定 3001 收查询；加入者用随机端口发查询并收回复。
 */
public class RoomDiscovery {

    private static final String TAG = "RoomDiscovery";
    public static final int DISCOVERY_PORT = 3001;
    private static final String PREFIX_ROOM = "MIRACLE_ROOM|";
    private static final String PREFIX_QUERY = "MIRACLE_QUERY|";

    /** 提供当前本机开放中的房间码列表 */
    public interface RoomCodeProvider {
        List<String> activeRoomCodes();
    }

    private static volatile boolean running = false;
    private static Thread broadcastThread;
    private static Thread queryThread;
    private static volatile String myIp = "127.0.0.1";
    private static volatile RoomCodeProvider provider;

    // ---------------- 本机地址 ----------------

    /** 列出本机全部私有 IPv4：WiFi/热点 优先，其次其他私有网段，蜂窝/VPN 最后 */
    public static List<String> allLocalIpv4() {
        List<String> wlan = new ArrayList<String>();
        List<String> other = new ArrayList<String>();
        List<String> cell = new ArrayList<String>();
        try {
            for (NetworkInterface nif : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (nif.isLoopback() || !nif.isUp()) continue;
                String name = nif.getName() == null ? "" : nif.getName().toLowerCase();
                // 蜂窝 / VPN / USB 共享：rmnet、ccmni、tun、ppp、usb
                boolean isCell = name.startsWith("rmnet") || name.startsWith("ccmni")
                        || name.startsWith("tun") || name.startsWith("ppp")
                        || name.startsWith("usb");
                // WiFi / 以太网 / 软热点（swlan0、ap0 —— 开热点时加入者连的就是它）
                boolean isWlan = name.startsWith("wlan") || name.startsWith("eth")
                        || name.startsWith("swlan") || name.startsWith("ap");

                for (InetAddress a : Collections.list(nif.getInetAddresses())) {
                    if (a.isLoopbackAddress()) continue;
                    String ip = a.getHostAddress();
                    if (ip == null || ip.indexOf(':') >= 0) continue;   // 跳过 IPv6
                    if (!isPrivateV4(ip)) continue;
                    if (isWlan) wlan.add(ip);
                    else if (isCell) cell.add(ip);
                    else other.add(ip);
                }
            }
        } catch (Exception ignored) { }

        List<String> out = new ArrayList<String>();
        out.addAll(wlan);
        out.addAll(other);
        out.addAll(cell);
        return new ArrayList<String>(new LinkedHashSet<String>(out));   // 去重保序
    }

    private static boolean isPrivateV4(String ip) {
        if (ip == null) return false;
        if (ip.startsWith("10.") || ip.startsWith("192.168.")) return true;
        if (ip.startsWith("172.")) {
            try {
                int second = Integer.parseInt(ip.split("\\.")[1]);
                return second >= 16 && second <= 31;
            } catch (Exception e) { return false; }
        }
        return false;
    }

    /**
     * 问操作系统："我要发包到 peer，会用我的哪个本地地址？"
     *
     * UDP 的 connect() 只是设定远端 + 让内核按路由表选定本地出口地址，
     * 不产生任何网络流量，因此既快又安全。拿到的地址一定与 peer 同网段。
     */
    private static String ipToward(InetAddress peer) {
        if (peer == null) return null;
        DatagramSocket probe = null;
        try {
            probe = new DatagramSocket();
            probe.connect(peer, DISCOVERY_PORT);
            InetAddress local = probe.getLocalAddress();
            if (local != null) {
                String ip = local.getHostAddress();
                if (ip != null && ip.indexOf(':') < 0 && !local.isLoopbackAddress()) return ip;
            }
        } catch (Exception e) {
            android.util.Log.w(TAG, "取本机出口地址失败: " + e.getMessage());
        } finally {
            if (probe != null) probe.close();
        }
        return null;
    }

    /** 给某个对端用的地址候选列表：出口地址排第一，其余私有地址兜底 */
    private static List<String> candidatesFor(InetAddress peer) {
        List<String> out = new ArrayList<String>();
        String best = ipToward(peer);
        if (best != null) out.add(best);
        for (String ip : allLocalIpv4()) {
            if (!out.contains(ip)) out.add(ip);
        }
        if (myIp != null && !myIp.startsWith("127.") && !out.contains(myIp)) out.add(myIp);
        return out;
    }

    private static String joinAddrs(List<String> ips) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < ips.size(); i++) {
            if (i > 0) sb.append(',');
            sb.append(ips.get(i)).append(":3000");
        }
        return sb.toString();
    }

    // ---------------- 创建者 ----------------

    /** 启动广播 + 查询监听（创建房间的手机调用一次） */
    public static synchronized void start(RoomCodeProvider p, String ip) {
        if (running) return;
        provider = p;
        myIp = (ip == null || ip.isEmpty()) ? "127.0.0.1" : ip;
        running = true;

        // 每秒广播一次房间码（兜底路径：加入者不主动查询也能收到）
        broadcastThread = new Thread(new Runnable() {
            @Override
            public void run() {
                DatagramSocket s = null;
                try {
                    s = new DatagramSocket();
                    s.setBroadcast(true);
                    InetAddress target = InetAddress.getByName("255.255.255.255");
                    while (running) {
                        try {
                            List<String> codes = provider.activeRoomCodes();
                            if (codes != null && !codes.isEmpty()) {
                                StringBuilder sb = new StringBuilder(PREFIX_ROOM);
                                for (int i = 0; i < codes.size(); i++) {
                                    if (i > 0) sb.append(',');
                                    sb.append(codes.get(i));
                                }
                                List<String> all = allLocalIpv4();
                                String first = all.isEmpty() ? myIp : all.get(0);
                                sb.append('|').append(first).append(":3000");
                                sb.append('|').append(joinAddrs(all));
                                byte[] data = sb.toString().getBytes("UTF-8");
                                s.send(new DatagramPacket(data, data.length, target, DISCOVERY_PORT));
                            }
                        } catch (Exception e) {
                            android.util.Log.w(TAG, "广播失败: " + e.getMessage());
                        }
                        try { Thread.sleep(1000); } catch (InterruptedException ie) { return; }
                    }
                } catch (Exception e) {
                    android.util.Log.w(TAG, "广播线程退出: " + e.getMessage());
                } finally {
                    if (s != null) s.close();
                }
            }
        }, "room-broadcast");
        broadcastThread.setDaemon(true);
        broadcastThread.start();

        // 绑定 3001 监听查询，命中就单播回复
        queryThread = new Thread(new Runnable() {
            @Override
            public void run() {
                DatagramSocket s = null;
                try {
                    s = new DatagramSocket(DISCOVERY_PORT);
                    s.setBroadcast(true);
                    android.util.Log.i(TAG, "查询监听已启动 :" + DISCOVERY_PORT);
                    byte[] buf = new byte[1024];
                    while (running) {
                        DatagramPacket pkt = new DatagramPacket(buf, buf.length);
                        try {
                            s.receive(pkt);
                        } catch (Exception e) {
                            if (!running) break;
                            continue;
                        }
                        String msg = new String(pkt.getData(), pkt.getOffset(), pkt.getLength(), "UTF-8");
                        if (!msg.startsWith(PREFIX_QUERY)) continue;

                        String want = msg.substring(PREFIX_QUERY.length()).trim().toUpperCase();
                        List<String> codes = provider.activeRoomCodes();
                        boolean hit = codes != null && codes.contains(want);
                        if (!hit) {
                            android.util.Log.i(TAG, "收到查询 " + want + " → 无此房间（当前 " + codes + "）");
                            continue;
                        }

                        // 按"到这个对端的出口地址"来回答，不再按网卡名猜
                        List<String> cands = candidatesFor(pkt.getAddress());
                        String best = cands.isEmpty() ? myIp : cands.get(0);
                        String reply = PREFIX_ROOM + want + "|" + best + ":3000|" + joinAddrs(cands);
                        android.util.Log.i(TAG, "收到查询 " + want + " 来自 " + pkt.getAddress()
                                + " → 回复 " + best + ":3000（候选 " + joinAddrs(cands) + "）");
                        byte[] data = reply.getBytes("UTF-8");
                        s.send(new DatagramPacket(data, data.length, pkt.getAddress(), pkt.getPort()));
                    }
                } catch (Exception e) {
                    android.util.Log.w(TAG, "查询监听退出: " + e.getMessage());
                } finally {
                    if (s != null) s.close();
                }
            }
        }, "room-query");
        queryThread.setDaemon(true);
        queryThread.start();

        android.util.Log.i(TAG, "房间发现已启动，本机 IP=" + myIp + " 全部地址=" + allLocalIpv4());
    }

    public static synchronized void stop() {
        running = false;
        broadcastThread = null;
        queryThread = null;
    }

    public static boolean isRunning() { return running; }

    /** 网络变了就把对外宣称的地址刷新一次 */
    public static synchronized void setMyIp(String ip) {
        if (ip != null && !ip.isEmpty()) myIp = ip;
    }

    // ---------------- 加入者 ----------------

    /**
     * 按房间码查找创建者，返回逗号分隔的候选地址列表 "ip:3000,ip:3000,…"，
     * 按可靠度排序（创建者按你的网段挑的出口地址排第一），超时返回 null。
     *
     * 会阻塞调用方最多 timeoutMs 毫秒。
     */
    public static String findRoom(String roomCode, int timeoutMs) {
        if (roomCode == null) return null;
        final String want = roomCode.trim().toUpperCase();
        if (want.isEmpty()) return null;

        DatagramSocket s = null;
        try {
            s = new DatagramSocket();          // 随机端口
            s.setBroadcast(true);
            InetAddress target = InetAddress.getByName("255.255.255.255");
            byte[] q = (PREFIX_QUERY + want).getBytes("UTF-8");

            long deadline = System.currentTimeMillis() + timeoutMs;
            int sent = 0;
            byte[] buf = new byte[1024];

            s.send(new DatagramPacket(q, q.length, target, DISCOVERY_PORT));
            sent = 1;

            while (System.currentTimeMillis() < deadline) {
                int remain = (int) (deadline - System.currentTimeMillis());
                if (remain <= 0) break;
                s.setSoTimeout(Math.min(remain, 400));   // 每 400ms 一轮

                DatagramPacket pkt = new DatagramPacket(buf, buf.length);
                try {
                    s.receive(pkt);
                } catch (java.net.SocketTimeoutException e) {
                    if (sent < 3) {
                        s.send(new DatagramPacket(q, q.length, target, DISCOVERY_PORT));
                        sent++;
                    } else {
                        break;
                    }
                    continue;
                }

                String msg = new String(pkt.getData(), pkt.getOffset(), pkt.getLength(), "UTF-8");
                if (!msg.startsWith(PREFIX_ROOM)) continue;
                String[] parts = msg.split("\\|");
                if (parts.length < 3) continue;

                // parts[1] 可能是 "CODE1,CODE2"（广播）或单个房间码（查询回复）
                String[] codes = parts[1].split(",");
                boolean matched = false;
                for (String c : codes) {
                    if (want.equals(c.trim().toUpperCase())) { matched = true; break; }
                }
                if (!matched) continue;

                // 候选顺序：① 创建者给出的最佳地址 ② 回复包的源地址（它在二层里的真身）
                //           ③ 创建者列出的其余地址
                List<String> cands = new ArrayList<String>();
                cands.add(parts[2].trim());
                String srcIp = pkt.getAddress().getHostAddress();
                if (srcIp != null && srcIp.indexOf(':') < 0) cands.add(srcIp + ":3000");
                if (parts.length >= 4) {
                    for (String a : parts[3].split(",")) {
                        if (a.trim().isEmpty()) continue;
                        cands.add(a.trim());
                    }
                }

                List<String> out = new ArrayList<String>();
                for (String c : cands) {
                    String a = c.indexOf(':') >= 0 ? c : c + ":3000";
                    // 去掉环回和明显无效项
                    if (a.startsWith("127.") || a.startsWith("0.")) continue;
                    if (!out.contains(a)) out.add(a);
                }
                if (out.isEmpty()) continue;

                StringBuilder sb = new StringBuilder();
                for (int i = 0; i < out.size(); i++) {
                    if (i > 0) sb.append(',');
                    sb.append(out.get(i));
                }
                android.util.Log.i(TAG, "找到房间 " + want + " → " + sb);
                return sb.toString();
            }
            android.util.Log.w(TAG, "未找到房间 " + want);
        } catch (Exception e) {
            android.util.Log.w(TAG, "查找失败: " + e.getMessage());
        } finally {
            if (s != null) s.close();
        }
        return null;
    }
}
