// ============================================================
// Navigation - Character/Difficulty/Chapter selection flow
// ============================================================

var selectedChar = 'qike';
var selectedDiff = 'medium';   // 联机创建房间默认中级
var selectedChapter = 3;   // 联机创建房间默认第 3 章

function selectCharacter(ch) {
  selectedChar = ch;
  document.getElementById('char-select').classList.add('hidden');
  document.getElementById('diff-select').classList.remove('hidden');
}

function backToCharSelect() {
  document.getElementById('diff-select').classList.add('hidden');
  document.getElementById('char-select').classList.remove('hidden');
}

function backToDiffSelect() {
  document.getElementById('chapter-select').classList.add('hidden');
  document.getElementById('diff-select').classList.remove('hidden');
}

function selectDifficulty(d) {
  selectedDiff = d;
  GS.difficulty = d;
  document.getElementById('diff-select').classList.add('hidden');
  showChapterSelect();
}

function showChapterSelect() {
  ProgressMgr.load();
  document.getElementById('chapter-select').classList.remove('hidden');
  var grid = document.getElementById('chapter-grid');
  grid.innerHTML = '';

  CHAPTERS.forEach(function (ch) {
    var card = document.createElement('div');
    card.className = 'chapter-card' + (ch.unlocked ? '' : ' locked');
    card.style.setProperty('--chapter-color', ch.color);

    var html = '<div class="chapter-num">Chapter ' + ch.id + '</div>';
    html += '<div class="chapter-icon">' + ch.icon + '</div>';
    html += '<div class="chapter-name">' + ch.name + '</div>';
    html += '<div class="chapter-desc">' + ch.desc + '</div>';
    html += '<div class="chapter-energy">🔋 撤离需要 ' + (ch.escapeEnergy || 5) + ' 能量</div>';

    if (ch.unlocked) {
      card.onclick = function () { selectChapter(ch.id) };
    } else {
      html += '<div class="lock-icon">🔒</div>';
    }

    card.innerHTML = html;
    grid.appendChild(card);
  });
}

function selectChapter(id) {
  selectedChapter = id;
  GS.chapter = id;
  GS.character = selectedChar;
  GS.hp = GS.maxHp = 100;
  GS.stars = 0;
  GS.weapons = {};
  GS.weaponAmmo = {};
  GS.curWeapon = null;
  GS.weapons['木棍'] = WEAPONS['木棍'];
  GS.weaponAmmo['木棍'] = Infinity;
  GS.curWeapon = '木棍';
  GS.correct = 0; GS.total = 0;
  GS.weaponCount = 0;
  GS.energy = 0;
  var chData = CHAPTERS.find(function (c) { return c.id === id; });
  GS.energyMax = (chData && chData.escapeEnergy) || 5;
  GS.fragments = 0;
  GS.escaping = false;
  GS.gameOver = false;
  GS.running = false;
  GS.skillEnergy = 100;
  GS.skillReady = true;
  GS.skillCooldown = 0;
  GS.skillActive = 0;
  GS.moveSpeedBonus = 0;
  GS.atkBonus = 0;
  GS.atkSpeedBonus = 0;
  GS.defBonus = 0;
  GS.maxHpBonus = 0;
  GS.killCount = 0;
  GS.level = 1;
  GS.usedQuestions = {};
  GS.hasFlashlight = false;
  document.getElementById('chapter-select').classList.add('hidden');
  updateSkillHUD();
  init();
}

function backToMainMenu() {
  GS.running = false;
  GS.gameOver = false;
  try { localStorage.removeItem('miracleForest_pending'); } catch (e) { }
  if (typeof isPointerLocked !== 'undefined' && isPointerLocked) {
    try { document.exitPointerLock(); } catch (e) { }
  }
  location.reload();
}

// Multiplayer selection
function selectMPDifficulty(diff) {
  selectedDiff = diff;
  var opts = document.querySelectorAll('#rl-settings .rl-setting-opt[data-diff]');
  opts.forEach(function (o) { o.classList.remove('selected'); });
  var el = document.querySelector('#rl-settings .rl-setting-opt[data-diff="' + diff + '"]');
  if (el) el.classList.add('selected');
  updateMPSettingsDesc();
}

function selectMPChapter(ch) {
  selectedChapter = ch;
  var opts = document.querySelectorAll('#rl-settings .rl-setting-opt-ch');
  opts.forEach(function (o) { o.classList.remove('selected'); });
  var el = document.querySelector('#rl-settings .rl-setting-opt-ch[data-ch="' + ch + '"]');
  if (el) el.classList.add('selected');
  updateMPSettingsDesc();
}

function updateMPSettingsDesc() {
  var diffNames = { easy: '🌱 初级', medium: '🌿 中级', hard: '🌳 高级' };
  var el = document.getElementById('rl-settings-desc');
  if (el) el.textContent = (diffNames[selectedDiff] || '🌱 初级') + ' · 第' + (selectedChapter || 1) + '章';
}
