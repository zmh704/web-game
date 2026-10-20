package com.miracle.forest;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * 奇妙冒险记 · Android 壳
 *
 * 游戏资源放在 assets/www/ 下，通过 shouldInterceptRequest 把
 * https://appassets.androidplatform.net/<path> 映射到 assets。
 * 之所以不用 file:// ：file 源拿不到 https origin，Service Worker、
 * Web Storage、以及 ws:// 联机都会受影响。
 */
public class MainActivity extends Activity {

    private static final String HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://appassets.androidplatform.net/game.html";

    private WebView webView;
    private long lastBackAt = 0L;

    // 内置联机服务器：创建房间的这台手机自己就是主机，
    // 加入者连它的局域网 IP 即可，不需要额外开电脑跑 node server.js
    private WSServer wsServer;
    private RoomManager roomManager;
    // Android 默认会过滤掉收到的广播/组播包。不拿这个锁，
    // 创建者可能收不到加入者发来的房间码查询（表现为"一直找不到房间"）。
    private android.net.wifi.WifiManager.MulticastLock multicastLock;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // 全屏 + 沉浸式 + 常亮
        applyFullscreen();

        acquireMulticastLock();
        startWsServer();

        webView = new WebView(this);
        webView.setBackgroundColor(Color.parseColor("#1a2e1a"));
        setContentView(webView);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        // 音效必须允许自动播放
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        // 关键：必须让页面自己的 viewport meta 生效。
        // useWideViewPort(false) 时 WebView 会按 980px 的假视口渲染，
        // 页面被整体缩放，DOM 按钮的视觉位置和命中区域全部错位，
        // 表现出来就是"按钮点了没反应"。
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setTextZoom(100);
        // 资源全部来自 assets，不需要磁盘缓存（也避免旧版本卡住）
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);
        s.setAllowFileAccess(false);
        // 页面是 https，联机要连 ws://明文，放开混合内容
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }
        // 触摸 / 手势
        s.setSupportMultipleWindows(false);
        s.setJavaScriptCanOpenWindowsAutomatically(false);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
            WebView.setWebContentsDebuggingEnabled(true);
        }

        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        webView.setHorizontalScrollBarEnabled(false);
        webView.setVerticalScrollBarEnabled(false);

        // JS 桥：让页面知道自己在 Android 里，并保存/读取联机服务器地址
        webView.addJavascriptInterface(new JsBridge(), "AndroidHost");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (url == null || !HOST.equals(url.getHost())) return null;
                return serveAsset(url.getPath());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                // 站内地址正常加载；外部链接交给系统浏览器
                if (url != null && HOST.equals(url.getHost())) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, url));
                } catch (Exception ignored) { }
                return true;
            }
        });

        // 返回键：先让网页自己处理（关闭答题框等），再退到上一页，最后双击退出
        webView.setOnKeyListener(new View.OnKeyListener() {
            @Override
            public boolean onKey(View v, int keyCode, KeyEvent event) {
                if (keyCode == KeyEvent.KEYCODE_BACK && event.getAction() == KeyEvent.ACTION_UP) {
                    webView.evaluateJavascript(
                        "(function(){try{window.onAndroidBack&&window.onAndroidBack();}catch(e){}})();", null);
                    if (webView.canGoBack()) {
                        webView.goBack();
                        return true;
                    }
                    long now = System.currentTimeMillis();
                    if (now - lastBackAt < 2000) {
                        finish();
                    } else {
                        lastBackAt = now;
                        Toast.makeText(MainActivity.this, "再按一次退出游戏", Toast.LENGTH_SHORT).show();
                    }
                    return true;
                }
                return false;
            }
        });

        if (savedInstanceState == null) {
            webView.loadUrl(START_URL);
        } else {
            webView.restoreState(savedInstanceState);
        }
    }

    /** 暴露给页面的桥：环境标记 + 联机服务器地址的本地保存 */
    private class JsBridge {
        private final android.content.SharedPreferences prefs;

        JsBridge() {
            prefs = getSharedPreferences("miracle_forest", MODE_PRIVATE);
        }

        @JavascriptInterface
        public boolean isAndroid() {
            return true;
        }

        @JavascriptInterface
        public String getServerAddr() {
            return prefs.getString("server_addr", "");
        }

        @JavascriptInterface
        public void setServerAddr(String addr) {
            prefs.edit().putString("server_addr", addr == null ? "" : addr.trim()).apply();
        }

        @JavascriptInterface
        public String getLocalIp() {
            return WSServer.localIpv4();
        }

        /** 本机所有私有 IPv4（逗号分隔），创建者用来告诉队友"这些地址都能试" */
        @JavascriptInterface
        public String getLocalIps() {
            StringBuilder sb = new StringBuilder();
            for (String ip : RoomDiscovery.allLocalIpv4()) {
                if (sb.length() > 0) sb.append(',');
                sb.append(ip);
            }
            return sb.toString();
        }

        /**
         * 只用房间码加入：主动查询 + 创建者单播回复。
         * 返回逗号分隔的候选地址列表（按可靠度排序），找不到返回 null。
         */
        @JavascriptInterface
        public String findRoom(String code) {
            return RoomDiscovery.findRoom(code, 2200);
        }

        /**
         * 精确探测某个地址:端口能不能连上（真·TCP connect，不走 WebSocket）。
         * WebSocket 失败只会给一个笼统的 error，分不清是"没开机 / 被拒绝 / 被路由挡住"。
         * 这里直接返回具体结果，排障时一眼定位。
         */
        @JavascriptInterface
        public String tcpProbe(String host, int port, int timeoutMs) {
            if (host == null || host.isEmpty()) return "地址为空";
            long t0 = System.currentTimeMillis();
            java.net.Socket sock = new java.net.Socket();
            try {
                sock.connect(new java.net.InetSocketAddress(host, port), Math.max(500, timeoutMs));
                return "OK " + (System.currentTimeMillis() - t0) + "ms";
            } catch (java.net.ConnectException e) {
                return "REFUSED 对方端口没开（服务器没启动或没在监听 3000）";
            } catch (java.net.NoRouteToHostException e) {
                return "NOROUTE 路由不可达（多半是不在同一网络 / 网段不对）";
            } catch (java.net.SocketTimeoutException e) {
                return "TIMEOUT " + timeoutMs + "ms 无响应（被防火墙或 WiFi 的「AP 隔离」挡住了）";
            } catch (java.net.UnknownHostException e) {
                return "BADHOST 地址无法解析";
            } catch (Exception e) {
                return "FAIL " + e.getClass().getSimpleName() + ": " + e.getMessage();
            } finally {
                try { sock.close(); } catch (Exception ignored) { }
            }
        }

        /** 当前 WiFi 名称（判断两台手机是否同一个网络，比对比 IP 更直观） */
        @JavascriptInterface
        public String getWifiSsid() {
            try {
                android.net.wifi.WifiManager wm =
                        (android.net.wifi.WifiManager) getApplicationContext().getSystemService(WIFI_SERVICE);
                if (wm == null) return "";
                android.net.wifi.WifiInfo info = wm.getConnectionInfo();
                if (info == null) return "";
                String ssid = info.getSSID();
                if (ssid == null) return "";
                ssid = ssid.replace("\"", "");
                if ("<unknown ssid>".equals(ssid) || ssid.isEmpty()) return "";
                return ssid;
            } catch (Exception e) {
                return "";
            }
        }

        /** 网络诊断：给联机页显示，方便判断是"没找到房间"还是"连不上" */
        @JavascriptInterface
        public String netDiag() {
            String ssid = getWifiSsid();
            return "本机IP " + WSServer.localIpv4()
                    + (ssid.isEmpty() ? "" : " · WiFi " + ssid)
                    + " · 服务器 " + (wsServer != null && wsServer.isRunning() ? "运行中" : "未启动")
                    + " · 房间发现 " + (RoomDiscovery.isRunning() ? "已开启" : "未开启");
        }

        @JavascriptInterface
        public boolean isWsServerRunning() {
            return wsServer != null && wsServer.isRunning();
        }

        /**
         * 确保联机服务器在跑，并把对外宣称的 IP 刷新到最新。
         *
         * 服务器是在 onCreate 里起的，如果那时 WiFi 还没连上（或者中间切过网络），
         * 对外广播的 IP 就是旧的/错的，加入者拿到的地址永远连不上。
         * 创建房间前调一次，可以彻底排除这类"启动时网络状态不对"的问题。
         */
        @JavascriptInterface
        public boolean ensureServer() {
            if (wsServer == null || !wsServer.isRunning()) {
                android.util.Log.w("MiracleForest", "服务器未在运行，尝试重启…");
                if (wsServer != null) { try { wsServer.close(); } catch (Exception ignored) { } }
                wsServer = null;
                RoomDiscovery.stop();
                try {
                    if (roomManager == null) roomManager = new RoomManager();
                    wsServer = new WSServer(3000, roomManager);
                    wsServer.start();
                } catch (Exception e) {
                    android.util.Log.w("MiracleForest", "重启服务器失败: " + e.getMessage());
                    return false;
                }
            }
            String ip = WSServer.localIpv4();
            RoomDiscovery.setMyIp(ip);
            if (!RoomDiscovery.isRunning()) {
                RoomDiscovery.start(roomManager, ip);
            }
            android.util.Log.i("MiracleForest", "ensureServer: 服务器运行中，本机 IP=" + ip
                    + " 全部=" + RoomDiscovery.allLocalIpv4());
            return true;
        }

        @JavascriptInterface
        public void reloadGame() {
            // 由壳主动重新加载，不依赖页面自己的 location.reload()。
            // WebView 里 reload 配合 Cache-Control: no-store 偶发不触发，
            // 表现为"点了退出没反应"。
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (webView != null) webView.loadUrl(START_URL);
                }
            });
        }

        @JavascriptInterface
        public void toast(String msg) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    Toast.makeText(MainActivity.this, msg, Toast.LENGTH_SHORT).show();
                }
            });
        }
    }

    /**
     * 拿组播锁。
     *
     * Android 的 WiFi 驱动默认把广播/组播包过滤掉以省电，不拿这个锁，
     * 创建者根本收不到加入者发来的 UDP 房间码查询 —— 现象是"点了加入，
     * 一直转圈最后说没找到房间"，但代码和协议都没问题。
     */
    private void acquireMulticastLock() {
        try {
            android.net.wifi.WifiManager wm =
                    (android.net.wifi.WifiManager) getApplicationContext().getSystemService(WIFI_SERVICE);
            if (wm == null) return;
            multicastLock = wm.createMulticastLock("miracle-forest-discovery");
            multicastLock.setReferenceCounted(false);
            multicastLock.acquire();
            android.util.Log.i("MiracleForest", "已获取组播锁，允许接收局域网广播");
        } catch (Exception e) {
            android.util.Log.w("MiracleForest", "获取组播锁失败: " + e.getMessage());
        }
    }

    /** 启动内置联机服务器（端口 3000，与 node 版一致） */
    private void startWsServer() {
        try {
            roomManager = new RoomManager();
            wsServer = new WSServer(3000, roomManager);
            wsServer.start();
            // 广播房间码 + 监听加入者的查询请求，让加入者只输房间码就能找到我们
            RoomDiscovery.start(roomManager, WSServer.localIpv4());
            android.util.Log.i("MiracleForest", "内置联机服务器已启动: ws://"
                    + WSServer.localIpv4() + ":3000（房间码广播中）");
        } catch (Exception e) {
            android.util.Log.w("MiracleForest", "内置服务器启动失败: " + e.getMessage());
        }
    }

    /** assets/www/<path> → WebResourceResponse */
    private WebResourceResponse serveAsset(String path) {
        if (path == null || path.equals("/")) path = "/game.html";
        try {
            InputStream in = getAssets().open("www" + path);
            Map<String, String> headers = new HashMap<>();
            // 每次都取最新，避免改了资源还看到旧版
            headers.put("Cache-Control", "no-store");
            return new WebResourceResponse(
                    guessMime(path), "utf-8", 200, "OK", headers, in);
        } catch (IOException e) {
            return null;
        }
    }

    private String guessMime(String path) {
        String p = path.toLowerCase();
        if (p.endsWith(".html") || p.endsWith(".htm")) return "text/html";
        if (p.endsWith(".js")) return "application/javascript";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".json") || p.endsWith(".webmanifest")) return "application/json";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
        if (p.endsWith(".mp3") || p.endsWith(".wav") || p.endsWith(".ogg")) return "audio/mpeg";
        if (p.endsWith(".woff2")) return "font/woff2";
        return "application/octet-stream";
    }

    // 编译目标是 API 28，这里统一用 setSystemUiVisibility（API 19 起可用）。
    // 不要用 Build.VERSION_CODES.R / setDecorFitsSystemWindows（API 30），
    // 否则在 android-28 的 android.jar 下直接编译不过。
    private void applyFullscreen() {
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) applyFullscreen();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (webView != null) webView.saveState(outState);
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (webView != null) webView.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
    }

    @Override
    protected void onDestroy() {
        RoomDiscovery.stop();
        if (wsServer != null) { wsServer.close(); wsServer = null; }
        if (webView != null) {
            webView.loadUrl("about:blank");
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
