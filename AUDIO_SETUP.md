# 音频系统使用指南

## ❌ 问题：浏览器报错，音频无法加载

如果您看到类似 `GET file:///D:/.../background_music.mp3 net::ERR_FILE_NOT_FOUND` 的错误，这是因为**浏览器不允许直接从本地文件系统（file:// 协议）加载音频文件**。

## ✅ 解决方案：使用 HTTP 服务器启动游戏

### 方法一：使用启动脚本（最简单）

1. **双击运行** `start-server.bat`
2. 选择启动方式（推荐选择 1 或 2）
3. 浏览器访问：http://localhost:8000

### 方法二：使用 Python（推荐）

```bash
# 1. 打开命令提示符（CMD）或 PowerShell
# 2. 进入游戏目录
cd /d D:\File\workspace\web-game

# 3. 启动 HTTP 服务器
python -m http.server 8000

# 4. 浏览器访问
http://localhost:8000
```

### 方法三：使用 Node.js

```bash
# 1. 安装 serve（只需一次）
npm install -g serve

# 2. 启动服务器
serve . -p 8000

# 3. 浏览器访问
http://localhost:8000
```

### 方法四：使用 VS Code Live Server

1. 安装 VS Code 扩展：**Live Server**
2. 右键点击 `index.html`
3. 选择 **"Open with Live Server"**

## 🎵 当前音频文件状态

### ✅ 已成功准备的音频文件
- `background_music.mp3` - 背景音乐
- `attack.mp3` - 攻击音效
- `growl.mp3` - 怪物吼叫
- `scream.mp3` - 尖叫声

### ⚠️ 可选添加的音频文件
以下文件未找到时会自动使用程序化音效：
- `hit.mp3` - 命中音效
- `hurt.mp3` - 受伤音效
- `skill.mp3` - 技能音效
- `quiz.mp3` - 答题正确音效
- `whisper.mp3` - 环境低语
- `scratch.mp3` - 抓挠声

## 🔧 音频系统特性

1. **自动回退机制** - 缺少的音频文件会自动使用程序化音效
2. **用户交互启动** - 首次点击/按键后自动播放背景音乐
3. **循环播放** - 背景音乐和环境音效会自动循环
4. **音量控制** - 可在代码中调整各音效音量

## 📝 测试步骤

1. 使用上述任一方法启动 HTTP 服务器
2. 打开浏览器访问 http://localhost:8000
3. 打开浏览器开发者工具（F12）查看控制台
4. 应该看到音频加载成功日志（✓ 标记）
5. 点击页面或按任意键，背景音乐开始播放
6. 进入游戏测试各种音效

## 🐛 故障排查

### 问题1：控制台显示 "音频加载失败"
**原因**：音频文件路径错误或文件不存在  
**解决**：确认 `src/assets/audio/` 目录下有对应的 mp3 文件

### 问题2：背景音乐仍不播放
**原因**：浏览器自动播放策略阻止  
**解决**：确保在用户首次交互（点击/按键）后才尝试播放

### 问题3：某些音效缺失
**原因**：对应的 mp3 文件未提供  
**解决**：系统会自动使用程序化音效，无需额外操作

## 🎚️ 音量调整

在 `src/scripts/game-audio.js` 中可以调整音量：

```javascript
// 背景音乐音量（0.0 - 1.0）
bgm.volume = 0.3;

// 音效音量（0.0 - 1.0）  
clone.volume = 0.5;

// 环境音效音量
self.playRealAudio('growl', 0.3);
```

## 📞 需要帮助？

如果仍有问题，请提供：
1. 浏览器控制台的错误信息（F12 → Console）
2. 使用的启动方法
3. 音频文件的完整路径