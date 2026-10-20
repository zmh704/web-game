#!/usr/bin/env bash
# ============================================================
#  奇妙冒险记 · Android APK 构建脚本
#
#  不依赖 Gradle，直接用 Android SDK 自带工具链：
#    aapt2 (compile/link) → javac → d8 → zipalign → apksigner
#
#  用法：
#    cd android && bash build-apk.sh
#
#  产物：android/dist/miracle-forest.apk
# ============================================================
set -e
cd "$(dirname "$0")"

SDK="${ANDROID_HOME:-C:/Users/zmh70/Android/Sdk}"
# 反斜杠转正斜杠。必须用 bash 参数扩展：
# 用 sed 时 echo 会把 \ 变成两个反斜杠，结果得到 C://Users//... 这种双斜杠，
# aapt2 能容忍但 d8.bat 内部会静默失败（退出码还是 0，但什么都不产出）。
SDK="${SDK//\\//}"
BT="$SDK/build-tools/30.0.3"
AJ="$SDK/platforms/android-28/android.jar"
AAPT2="$BT/aapt2.exe"
D8="$BT/lib/d8.jar"   # 直接调 jar，不走 d8.bat（见下方说明）
ZIPALIGN="$BT/zipalign.exe"
APKSIGNER="$BT/apksigner.bat"

# Git Bash 会把 /xxx 路径自动转换，这里关掉以免破坏 Windows 路径
export MSYS_NO_PATHCONV=1

for f in "$AAPT2" "$D8" "$ZIPALIGN" "$APKSIGNER" "$AJ"; do
  [ -e "$f" ] || { echo "缺少构建工具: $f"; echo "请检查 ANDROID_HOME=$SDK"; exit 1; }
done

BUILD=build
# 不做 rm -rf：批量删除会被安全策略拦下（一次删几十上百个文件），
# 而且没必要 —— 下面每一步都是覆盖式产出（res.zip / .class / .dex 直接同名覆盖）。
mkdir -p "$BUILD/gen" "$BUILD/classes" "$BUILD/dex"

echo "==> 1/6 同步游戏资源到 assets/www"
mkdir -p assets/www
cp ../game.html ../manifest.json assets/www/
# 注意必须写成 `cp -r ../src assets/www/`（带目录名），
# 不能写成 `cp -r ../src/. assets/www/` —— 后者会把 src 的内容拍平铺到 www 根下，
# 页面里 src/scripts/*.js 全部 404，而且因为是旧文件残留，现象非常迷惑：
# 新 UI 版本号显示是对的，实际跑的还是上一版代码。
cp -r ../src assets/www/
cp -r ../icons assets/www/
rm -f assets/www/sw.js          # App 壳里禁用 Service Worker

echo "==> 2/6 编译资源"
"$AAPT2" compile --dir res -o "$BUILD/res.zip"

echo "==> 3/6 链接资源 + assets（生成 R.java）"
"$AAPT2" link \
  -o "$BUILD/base.apk" \
  -I "$AJ" \
  --manifest AndroidManifest.xml \
  -A assets \
  --java "$BUILD/gen" \
  --min-sdk-version 24 \
  --target-sdk-version 28 \
  --version-code 1 \
  --version-name 1.0 \
  "$BUILD/res.zip"

echo "==> 4/6 编译 Java"
# -encoding UTF-8 必须显式指定：Windows 下 javac 默认 GBK，
# 源文件里的中文注释/字符串会直接报"不可映射字符"
# 编译 src 下全部 Java（原来只列了 MainActivity.java，
# 新增 WSServer/RoomManager 这类类不会被编译进去，报"找不到符号"）
javac --release 8 \
  -encoding UTF-8 \
  -classpath "$AJ" \
  -d "$BUILD/classes" \
  $(find src -name '*.java') \
  $(find "$BUILD/gen" -name '*.java')

echo "==> 5/6 转 dex 并塞入 APK"
# 不要用 d8.bat：它靠 find_java.bat 定位 java，而 SDK 没装 tools 组件时
# find_java.bat 不存在，bat 会直接 goto :EOF —— 静默退出，退出码还是 0，
# 于是什么都不产出，后面才在 build/dex 上报错。直接调 jar 最稳。
java -cp "$BT/lib/d8.jar" com.android.tools.r8.D8 \
  --lib "$AJ" --min-api 24 --output "$BUILD/dex" \
  $(find "$BUILD/classes" -name '*.class')

if [ ! -d "$BUILD/dex" ]; then
  echo "d8 没有产出 dex 目录，先单独跑一次看真实报错："
  echo "  java -cp \"$D8\" com.android.tools.r8.D8 --lib \"$AJ\" --min-api 24 --output \"$BUILD/dex\" \$(find \"$BUILD/classes\" -name '*.class')"
  exit 1
fi

cp "$BUILD/base.apk" "$BUILD/unsigned.apk"
DEXFILE=$(find "$BUILD/dex" -name '*.dex' | head -1)
[ -n "$DEXFILE" ] || { echo "d8 没有产出 .dex 文件"; exit 1; }
# 不用 jar uf：jar 是 Windows 程序，不认 Git Bash 的 /d/File/... 路径，
# 会在 APK 同目录建临时文件时报"系统找不到指定的路径"。
# 用 Python 重写 zip，跨平台且可控。
python - <<'PYDEX'
import glob, os, shutil, zipfile
src, tmp = 'build/unsigned.apk', 'build/unsigned.tmp.apk'
dexs = sorted(glob.glob('build/dex/*.dex'))
assert dexs, 'build/dex 下没有 .dex'
zin = zipfile.ZipFile(src, 'r')
zout = zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED)
for it in zin.infolist():
    zout.writestr(it, zin.read(it.filename))
for d in dexs:
    # 必须用 os.path.basename：Windows 下 glob 可能返回带反斜杠的路径，
    # 用 d.split('/') 会把 'dex\classes.dex' 整个当文件名，结果 dex 被塞进
    # APK 子目录 —— Android 要求 classes.dex 位于 APK 根目录，否则装得上但打不开。
    zout.write(d, os.path.basename(d))
zin.close(); zout.close()
shutil.move(tmp, src)
print('已写入', len(dexs), '个 dex：', ', '.join(os.path.basename(d) for d in dexs))
PYDEX

echo "==> 6/6 对齐 + 签名"
"$ZIPALIGN" -f -p 4 "$BUILD/unsigned.apk" "$BUILD/aligned.apk"

mkdir -p dist
mkdir -p dist
if [ ! -f debug.keystore ]; then
  echo "    · 首次构建，生成 debug.keystore"
  keytool -genkeypair -v \
    -keystore debug.keystore -storepass android -keypass android \
    -alias androiddebugkey -keyalg RSA -keysize 2048 -validity 10000 \
    -dname "CN=Miracle Forest Debug, OU=Game, O=MiracleForest, L=NA, S=NA, C=CN" >/dev/null 2>&1
fi
"$APKSIGNER" sign \
  --ks debug.keystore --ks-pass pass:android --key-pass pass:android \
  --ks-key-alias androiddebugkey \
  --out dist/miracle-forest.apk "$BUILD/aligned.apk"

"$APKSIGNER" verify --verbose dist/miracle-forest.apk | head -3 || true

SIZE=$(du -h dist/miracle-forest.apk | cut -f1)
echo ""
echo "✔ 构建完成：android/dist/miracle-forest.apk  ($SIZE)"
echo "  安装：adb install -r dist/miracle-forest.apk"
