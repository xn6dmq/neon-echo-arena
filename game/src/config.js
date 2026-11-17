// Every tuning number and colour for NEON ECHO ARENA in one place. The playfield is a fixed
// 1280x720 logical arena; the renderer scales it to the window, so no rule below depends on
// the screen size.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const PLAYER = {
  radius: 13,
  speed: 305,
  lives: 3,
  /** Seconds of blinking invulnerability after a hit. */
  invulnerable: 1.6,
  /** Shots per second while the mouse is held. */
  fireRate: 7,
  bulletSpeed: 660,
  bulletLife: 0.95,
  bulletRadius: 3.5,
};

/** Enemy archetypes: hit points, speed, body radius, score value and spawn weight per wave. */
export const ENEMY = {
  chaser: { hp: 2, speed: 86, radius: 14, score: 50 },
  dasher: { hp: 1, speed: 58, radius: 11, score: 80 },
  tank: { hp: 7, speed: 33, radius: 25, score: 150 },
};

/** The echo ring a destroyed enemy emits: it expands, hurts what its front crosses, and chains. */
export const ECHO = {
  baseRadius: 96,
  /** Each chain generation reaches a little less far than the one that spawned it. */
  radiusPerDepth: 14,
  minRadius: 52,
  expandSpeed: 300,
  /** How thick, in pixels, the damaging front of the ring is. */
  bandWidth: 22,
  damage: 1,
  maxDepth: 3,
};

/** Waves: how many enemies, how fast they arrive, and when the heavy kinds join in. */
export const WAVES = {
  total: 10,
  countFor: (wave) => 7 + wave * 3,
  spawnIntervalFor: (wave) => Math.max(0.34, 1.05 - wave * 0.07),
  /** Seconds of quiet between a wave's last kill and the next wave's first spawn. */
  intermission: 2.6,
  clearBonusFor: (wave) => 100 * wave,
};

/** Combo: kills inside the window keep it alive; the multiplier grows every 8 combo points. */
export const COMBO = { window: 3, perMultiplier: 8, maxMultiplier: 5 };

/** Pool sizes: every entity array is allocated once, at boot, and reused forever. */
export const POOL = { enemies: 96, bullets: 220, rings: 48, particles: 420, texts: 32 };

export const PALETTE = {
  backdrop: '#05060e',
  arena: '#0a0d1f',
  grid: '#1b2350',
  gridGlow: '#27306e',
  border: '#3df5ff',
  player: '#3df5ff',
  playerCore: '#eaffff',
  bullet: '#aefcff',
  chaser: '#ff2d95',
  dasher: '#ffb020',
  tank: '#b26bff',
  echo: '#41ffd9',
  particle: '#ffffff',
  text: '#eef6ff',
  muted: '#8fa3c8',
  danger: '#ff3860',
  gold: '#ffd94d',
};

export const FONT = '"Segoe UI", system-ui, -apple-system, sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'neon-echo-arena.best';
