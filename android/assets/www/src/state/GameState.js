// ============================================================
// Game State Core
// ============================================================

var GS = {
  hp: 100, maxHp: 100,
  stars: 0,
  totalStars: 0,
  weapons: {},
  curWeapon: null,
  correct: 0, total: 0,
  difficulty: 'easy',
  chapter: 1,
  character: 'qike',
  monsterHp: 100, monsterMaxHp: 100,
  running: false, gameOver: false,
  weaponCount: 0,
  jumpPower: 0,
  isJumping: false,
  canJump: true,
  inSecondRoom: false,
  energy: 0,
  energyMax: 5,
  fragments: 0,
  escaping: false,
  skillEnergy: 100,
  skillMax: 100,
  skillReady: true,
  skillCooldown: 0,
  skillActive: 0,
  skillDuration: 3,
  skillCooldownTime: 20,
  moveSpeedBonus: 0,
  atkBonus: 0,
  atkSpeedBonus: 0,
  defBonus: 0,
  maxHpBonus: 0,
  killCount: 0,
  level: 1,
  levelHpBonus: 0,
  levelAtkBonus: 0,
  levelDefBonus: 0,
  levelSpeedBonus: 0,
  usedQuestions: null,
  hasFlashlight: false,
  weaponAmmo: {},
  mode: 'single',
  isHost: false,
  playerId: null
};

// ============================================================
// Backward compatibility
// ============================================================
if (typeof window !== 'undefined') {
  window.GS = GS;
}
