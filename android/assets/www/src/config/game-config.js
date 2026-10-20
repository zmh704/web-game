// ============================================================
// Game Constants - All magic numbers centralized
// ============================================================

export const GameConfig = {
  // ===== Movement =====
  MOVE_SPEED: 5,
  SKILL_SPEED_BOOST: 12,
  GRAVITY: -12,
  JUMP_POWER: 5.5,

  // ===== Combat =====
  ATTACK_COOLDOWN: 0.5,
  MELEE_RANGE: 5.0,
  MAX_PROJECTILES: 500,
  PROJECTILE_TRIM_TARGET: 300,
  HIT_FLASH_DURATION: 0.3,
  MONSTER_HIT_FLASH: 0.2,

  // ===== Skills =====
  SKILL_DURATION: 3,
  SKILL_COOLDOWN: 20,
  SKILL_ENERGY_MAX: 100,

  // ===== Chaser =====
  CHASE_LIMIT_MINION: 20,
  CHASE_LIMIT_BOSS: 25,
  CHASER_GRAB_RANGE: 1.8,
  CHASER_LEAVE_DURATION: 60,
  CHASER_RESPAWN_DELAY: 30,
  CHASER_CHASE_SPEED: 7.0,
  CHASER_BASE_SPEED: 3.0,
  CHASER_SPRINT_DURATION: 1.5,
  CHASER_SPRINT_COOLDOWN: 5.0,

  // ===== Capture =====
  CAPTURE_MAX_TAP: 10,
  CAPTURE_DMG_INTERVAL: 1.0,
  CAPTURE_DMG_AMOUNT: 3,
  CAPTURE_TAP_DECAY_INTERVAL: 1.2,
  CAPTURE_ESCAPE_BOOST: 2.5,
  CAPTURE_GRAB_COOLDOWN: 12,

  // ===== Flashlight =====
  FLASHLIGHT_MAX_DURATION: 15,
  FLASHLIGHT_COOLDOWN: 30,

  // ===== Energy Orb (Golden Chest) =====
  ENERGY_ORB_RESPAWN_DELAY: 30000,
  ENERGY_ORB_COOLDOWN: 2,

  // ===== Normal Chests =====
  CHEST_MAX_COUNT: 5,
  CHEST_RESPAWN_DELAY: 30000,
  CHEST_QUIZ_COOLDOWN: 2,

  // ===== Items =====
  ITEM_RESPAWN_DELAY: 10000,
  PICKUP_RANGE: 1.5,

  // ===== Fragments =====
  FRAGMENTS_PER_ENERGY: 2,

  // ===== Room =====
  ROOM_SIZE: 40,
  HALF_ROOM: 20,
  DOOR_HALF: 3.6,

  // ===== Camera =====
  CAMERA_SMOOTH_HOST: 10,
  CAMERA_SMOOTH_NORMAL: 6,

  // ===== Minimap =====
  MINIMAP_SIZE: 120,

  // ===== Particles =====
  PARTICLE_SPAWN_CHANCE: 0.04,
  PARTICLE_MAX_COUNT: 200,

  // ===== Multiplayer =====
  WS_RECONNECT_DELAY: 3000,
  WS_HEARTBEAT_INTERVAL: 5000,
  SNAPSHOT_INTERVAL: 50,
  INTERP_DURATION: 50,
};

// ============================================================
// Backward compatibility
// ============================================================
if (typeof window !== 'undefined') {
  window.GameConfig = GameConfig;
}
