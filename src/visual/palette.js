// ============================================================
// VX.palette - 统一视觉调色板
// 设计原则：明快、低饱和背景 + 高饱和点缀，避免整屏同色
// ============================================================
var VX = window.VX || {};

VX.palette = {
  // 语义色
  ui: {
    gold: '#FFD166',
    goldDeep: '#E8A317',
    mint: '#4ED9A4',
    coral: '#FF8A6B',
    sky: '#7CC6F5',
    violet: '#B28DFF',
    ink: '#232840',
    paper: '#FBF7EF'
  },

  // 章节主题：sky=雾/背景, ground=地面, groundSpot=地面斑, wall=墙体, trim=墙体装饰边, accent=高亮
  themes: {
    1: {
      name: '森林',
      sky: 0xa9d9f2,
      fog: 0xbfe3f5,
      ground: '#63a04c',
      groundSpot: '#578f43',
      groundDark: '#4a7d3c',
      wall: 0x5c8a5a,
      wallDark: 0x3f6b45,
      trim: 0xe8d9a8,
      accent: 0xffd166,
      decor: 'forest'
    },
    2: {
      name: '冰原',
      sky: 0xcfe8f7,
      fog: 0xdfeef8,
      ground: '#dce9f0',
      groundSpot: '#c8dfea',
      groundDark: '#b3cfdd',
      wall: 0x9dc4d8,
      wallDark: 0x7ba6c0,
      trim: 0xf2fbff,
      accent: 0x7fd4f5,
      decor: 'ice'
    },
    3: {
      name: '沙漠',
      sky: 0xf7e0b0,
      fog: 0xf5dda6,
      ground: '#e6c896',
      groundSpot: '#d9b87f',
      groundDark: '#c9a468',
      wall: 0xd0ad74,
      wallDark: 0xb08c56,
      trim: 0xffe6a8,
      accent: 0xf0a54a,
      decor: 'desert'
    },
    4: {
      name: '火山',
      sky: 0x6b3a34,
      fog: 0x7a4038,
      ground: '#6b4a42',
      groundSpot: '#7d4f45',
      groundDark: '#553831',
      wall: 0x4f322c,
      wallDark: 0x3a2320,
      trim: 0xff8a4a,
      accent: 0xff6b35,
      decor: 'volcano'
    },
    5: {
      name: '太空',
      sky: 0x1b1840,
      fog: 0x241f4f,
      ground: '#3a3468',
      groundSpot: '#463f78',
      groundDark: '#2e2a55',
      wall: 0x2a2553,
      wallDark: 0x1d1940,
      trim: 0xb28dff,
      accent: 0xb28dff,
      decor: 'space'
    }
  }
};

VX.palette.theme = function (chapterId) {
  return VX.palette.themes[chapterId] || VX.palette.themes[1];
};

// 章节 accent 的 hex 字符串形式（给旧代码用）
VX.palette.accentHex = function (chapterId) {
  return '#' + VX.palette.theme(chapterId).accent.toString(16).padStart(6, '0');
};

// 天空渐变（CSS）：WebGL 画布透明，天空交给 CSS 绘制。
// 这样天空色不会被渲染器的 ACES 色调映射压成灰白。
VX.palette.skyCss = function (chapterId) {
  var t = VX.palette.theme(chapterId);
  function hx(v) { return '#' + v.toString(16).padStart(6, '0'); }
  var sky = new THREE.Color(t.sky);
  var hsl = {};
  sky.getHSL(hsl);
  // 顶部更蓝更深，近地平线更亮更暖
  var top = new THREE.Color().setHSL(hsl.h, Math.min(1, hsl.s * 1.22), Math.max(0.22, hsl.l * 0.76));
  var mid = new THREE.Color(t.sky);
  return 'linear-gradient(180deg, ' + hx(top.getHex()) + ' 0%, ' +
    hx(mid.getHex()) + ' 52%, ' + hx(t.fog) + ' 100%)';
};

// ------------------------------------------------------------
// 夜晚配色
//
// 游戏整体基调改成了"夜晚打手电筒"，天空不能再是白天的亮渐变。
// 这里保留各章节的色相（森林偏青绿、沙漠偏暖黄…），只把明度压到夜里，
// 远处几何体融进天空时才不会出现"天上亮、地平线黑"的割裂感。
// ------------------------------------------------------------
/**
 * 纯 JS 的 HSL → sRGB 十六进制。
 *
 * 不能直接用 THREE.Color().setHSL()：在 r152 里它默认写进**线性工作空间**，
 * 再 getHex() 转回 sRGB，结果"l=0.135"出来是 #536a77 这种中灰色 —— 用来当夜色
 * 就是一条横在半空的亮带。这里自己做 HSL→sRGB 的算术，数值所见即所得。
 */
function _nightHslHex(h, s, l) {
  var c = (1 - Math.abs(2 * l - 1)) * s;
  var hp = ((h % 1) + 1) % 1 * 6;
  var x = c * (1 - Math.abs((hp % 2) - 1));
  var r = 0, g = 0, b = 0;
  if (hp < 1) { r = c; g = x; }
  else if (hp < 2) { r = x; g = c; }
  else if (hp < 3) { g = c; b = x; }
  else if (hp < 4) { g = x; b = c; }
  else if (hp < 5) { r = x; b = c; }
  else { r = c; b = x; }
  var m = l - c / 2;
  return [r, g, b].map(function (v) {
    var n = Math.round(Math.max(0, Math.min(1, v + m)) * 255);
    return (n < 16 ? '0' : '') + n.toString(16);
  }).join('').replace(/^/, '#');
}

VX.palette.nightSkyCss = function (chapterId) {
  var t = VX.palette.theme(chapterId);
  var sky = new THREE.Color(t.sky);
  var hsl = {};
  sky.getHSL(hsl);
  var h = hsl.h;
  var top = _nightHslHex(h, Math.min(0.60, hsl.s * 0.70), 0.050);
  var mid = _nightHslHex(h, Math.min(0.52, hsl.s * 0.60), 0.085);
  var bot = _nightHslHex(h, Math.min(0.45, hsl.s * 0.50), 0.125);
  return 'linear-gradient(180deg, ' + top + ' 0%, ' + mid + ' 56%, ' + bot + ' 100%)';
};

/**
 * 夜晚地平线的颜色 —— 必须和 nightSkyCss 最底端同源。
 * 雾色取它，远处的墙/地面才会和天空无缝融在一起；
 * 取错的话夜里会看到一条明显的"雾带"横在半空（第一版就是这个毛病：
 * 雾比被压暗的地面还亮）。
 */
VX.palette.nightFog = function (chapterId) {
  var t = VX.palette.theme(chapterId);
  var sky = new THREE.Color(t.sky);
  var hsl = {};
  sky.getHSL(hsl);
  var hex = _nightHslHex(hsl.h, Math.min(0.45, hsl.s * 0.50), 0.125);
  return parseInt(hex.slice(1), 16);
};

window.VX = VX;
