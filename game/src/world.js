// The simulation: player, bullets, three enemy kinds, echo rings, particles and floating score
// texts, advanced in fixed steps. It knows nothing about the DOM or sound; step() returns event
// flags so the shell can announce and sonify what happened.
//
// The signature mechanic is the echo: every destroyed enemy emits an expanding ring, and an
// enemy the ring's front crosses takes damage. An enemy destroyed BY a ring emits its own,
// weaker ring — so a kill in a dense pack can chain through the whole pack.
import { COMBO, ECHO, ENEMY, FIELD, PLAYER, POOL, WAVES } from './config.js';

export const EVENT_FIRED = 1;
export const EVENT_KILL = 2;
export const EVENT_ECHO = 4;
export const EVENT_HIT = 8;
export const EVENT_WAVE_CLEAR = 16;
export const EVENT_OVER = 32;
export const EVENT_CLEAR = 64;

export const KIND_CHASER = 0;
export const KIND_DASHER = 1;
export const KIND_TANK = 2;

const KIND_STATS = [ENEMY.chaser, ENEMY.dasher, ENEMY.tank];
const KIND_COLORS = ['#ff2d95', '#ffb020', '#b26bff'];

function makePool(size, factory) {
  const pool = [];
  for (let i = 0; i < size; i += 1) pool.push(factory());
  return pool;
}

function firstFree(pool) {
  for (let i = 0; i < pool.length; i += 1) if (!pool[i].active) return pool[i];
  return null;
}

export function createWorld(random) {
  const state = {
    time: 0,
    mode: 'title', // 'title' (ambient attract) or 'run'
    player: { x: FIELD.width / 2, y: FIELD.height / 2, vx: 0, vy: 0, angle: -Math.PI / 2, invuln: 0, fireTimer: 0 },
    lives: PLAYER.lives,
    score: 0,
    combo: 0,
    comboTimer: 0,
    multiplier: 1,
    wave: 0,
    phase: 'combat', // 'combat' or 'intermission'
    intermission: 0,
    banner: '',
    bannerTimer: 0,
    spawnLeft: 0,
    spawnTimer: 0,
    kills: 0,
    shake: 0,
    over: false,
    cleared: false,
    enemies: makePool(POOL.enemies, () => ({ active: false, kind: 0, x: 0, y: 0, vx: 0, vy: 0, hp: 1, flash: 0, dashTimer: 0, dashing: 0, ringMark: -1, wobble: 0 })),
    bullets: makePool(POOL.bullets, () => ({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0 })),
    rings: makePool(POOL.rings, () => ({ active: false, id: 0, x: 0, y: 0, radius: 0, maxRadius: 0, depth: 0 })),
    particles: makePool(POOL.particles, () => ({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 0, size: 2, color: '#fff' })),
    texts: makePool(POOL.texts, () => ({ active: false, x: 0, y: 0, life: 0, value: '' })),
  };
  let nextRingId = 1;

  function spawnParticles(x, y, color, count, speed) {
    for (let i = 0; i < count; i += 1) {
      const p = firstFree(state.particles);
      if (!p) return;
      const angle = random() * Math.PI * 2;
      const v = speed * (0.25 + random() * 0.95);
      p.active = true;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * v;
      p.vy = Math.sin(angle) * v;
      p.maxLife = 0.35 + random() * 0.45;
      p.life = p.maxLife;
      p.size = 1.5 + random() * 2.6;
      p.color = color;
    }
  }

  function spawnText(x, y, value) {
    const t = firstFree(state.texts);
    if (!t) return;
    t.active = true;
    t.x = x;
    t.y = y;
    t.life = 0.9;
    t.value = value;
  }

  function spawnRing(x, y, depth) {
    const ring = firstFree(state.rings);
    if (!ring) return 0;
    ring.active = true;
    ring.id = nextRingId;
    nextRingId += 1;
    ring.x = x;
    ring.y = y;
    ring.radius = 8;
    ring.maxRadius = Math.max(ECHO.minRadius, ECHO.baseRadius - depth * ECHO.radiusPerDepth);
    ring.depth = depth;
    return EVENT_ECHO;
  }

  function spawnEnemy(kind, x, y) {
    const e = firstFree(state.enemies);
    if (!e) return;
    const stats = KIND_STATS[kind];
    e.active = true;
    e.kind = kind;
    e.x = x;
    e.y = y;
    e.vx = 0;
    e.vy = 0;
    e.hp = stats.hp;
    e.flash = 0;
    e.dashTimer = 1 + random() * 1.6;
    e.dashing = 0;
    e.ringMark = -1;
    e.wobble = random() * Math.PI * 2;
  }

  /** Pick a spawn point on the arena edge, never close to the player. */
  function edgeSpawnPoint() {
    const margin = 30;
    for (let tries = 0; tries < 8; tries += 1) {
      const side = Math.floor(random() * 4);
      const x = side === 0 ? margin : side === 1 ? FIELD.width - margin : margin + random() * (FIELD.width - margin * 2);
      const y = side === 2 ? margin : side === 3 ? FIELD.height - margin : margin + random() * (FIELD.height - margin * 2);
      const dx = x - state.player.x;
      const dy = y - state.player.y;
      if (dx * dx + dy * dy > 240 * 240 || tries === 7) return { x, y };
    }
    return { x: margin, y: margin };
  }

  /** Choose the next enemy kind for the current wave: tanks join at wave 3, dashers at wave 2. */
  function pickKind() {
    const roll = random();
    if (state.wave >= 3 && roll < 0.1 + state.wave * 0.012) return KIND_TANK;
    if (state.wave >= 2 && roll < 0.42) return KIND_DASHER;
    return KIND_CHASER;
  }

  function startWave(wave) {
    state.wave = wave;
    state.phase = 'combat';
    state.spawnLeft = WAVES.countFor(wave);
    state.spawnTimer = 0.4;
    state.banner = `WAVE ${wave}`;
    state.bannerTimer = 1.6;
  }

  function killEnemy(enemy, byEcho, depth) {
    let events = EVENT_KILL;
    enemy.active = false;
    state.kills += 1;
    state.combo += 1;
    state.comboTimer = COMBO.window;
    state.multiplier = Math.min(COMBO.maxMultiplier, 1 + Math.floor(state.combo / COMBO.perMultiplier));
    const gained = KIND_STATS[enemy.kind].score * state.multiplier;
    state.score += gained;
    spawnText(enemy.x, enemy.y - 10, `+${gained}`);
    spawnParticles(enemy.x, enemy.y, KIND_COLORS[enemy.kind], enemy.kind === KIND_TANK ? 22 : 13, 260);
    state.shake = Math.min(9, state.shake + (enemy.kind === KIND_TANK ? 5 : 2.2));
    // Every death rings out; a death caused by a ring rings weaker, which is what ends a chain.
    const ringDepth = byEcho ? depth + 1 : 0;
    if (ringDepth <= ECHO.maxDepth) events |= spawnRing(enemy.x, enemy.y, ringDepth);
    return events;
  }

  function damageEnemy(enemy, amount, byEcho, depth) {
    enemy.hp -= amount;
    enemy.flash = 0.09;
    if (enemy.hp <= 0 && enemy.active) return killEnemy(enemy, byEcho, depth);
    spawnParticles(enemy.x, enemy.y, '#ffffff', 3, 150);
    return 0;
  }

  function hurtPlayer(source) {
    let events = EVENT_HIT;
    state.lives -= 1;
    state.combo = 0;
    state.multiplier = 1;
    state.comboTimer = 0;
    state.player.invuln = PLAYER.invulnerable;
    state.shake = Math.min(14, state.shake + 8);
    spawnParticles(state.player.x, state.player.y, '#3df5ff', 20, 300);
    if (source && source.active) {
      source.active = false;
      spawnParticles(source.x, source.y, KIND_COLORS[source.kind], 12, 240);
      events |= spawnRing(source.x, source.y, 0);
    }
    if (state.lives <= 0) {
      state.over = true;
      events |= EVENT_OVER;
      spawnParticles(state.player.x, state.player.y, '#eaffff', 42, 380);
    }
    return events;
  }

  function reset() {
    for (const list of [state.enemies, state.bullets, state.rings, state.particles, state.texts]) {
      for (const item of list) item.active = false;
    }
    state.time = 0;
    state.mode = 'title';
    state.player.x = FIELD.width / 2;
    state.player.y = FIELD.height / 2;
    state.player.vx = 0;
    state.player.vy = 0;
    state.player.angle = -Math.PI / 2;
    state.player.invuln = 0;
    state.player.fireTimer = 0;
    state.lives = PLAYER.lives;
    state.score = 0;
    state.combo = 0;
    state.comboTimer = 0;
    state.multiplier = 1;
    state.wave = 0;
    state.phase = 'combat';
    state.intermission = 0;
    state.banner = '';
    state.bannerTimer = 0;
    state.spawnLeft = 0;
    state.spawnTimer = 0;
    state.kills = 0;
    state.shake = 0;
    state.over = false;
    state.cleared = false;
    // Ambient drifters for the title screen's attract scene.
    for (let i = 0; i < 6; i += 1) {
      const point = edgeSpawnPoint();
      spawnEnemy(i % 3 === 2 ? KIND_TANK : i % 2, point.x, point.y);
    }
  }

  /** Begin a scored run from wave 1. */
  function startRun() {
    reset();
    state.mode = 'run';
    for (const e of state.enemies) e.active = false;
    startWave(1);
  }

  function stepEnemies(dt, hostile) {
    const p = state.player;
    for (const e of state.enemies) {
      if (!e.active) continue;
      const stats = KIND_STATS[e.kind];
      e.flash = Math.max(0, e.flash - dt);
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const dist = Math.hypot(dx, dy) || 1;
      e.wobble += dt * 2.4;
      if (!hostile) {
        // Attract mode: drift in slow circles, never touch the player.
        e.x += Math.cos(e.wobble) * 22 * dt;
        e.y += Math.sin(e.wobble * 1.3) * 22 * dt;
        e.x = Math.min(FIELD.width - 24, Math.max(24, e.x));
        e.y = Math.min(FIELD.height - 24, Math.max(24, e.y));
        continue;
      }
      let speed = stats.speed;
      if (e.kind === KIND_DASHER) {
        e.dashTimer -= dt;
        if (e.dashing > 0) {
          e.dashing -= dt;
          speed = 295;
        } else if (e.dashTimer <= 0) {
          e.dashing = 0.42;
          e.dashTimer = 1.5 + random() * 1.3;
          e.vx = (dx / dist) * 295;
          e.vy = (dy / dist) * 295;
        }
      }
      if (e.kind === KIND_DASHER && e.dashing > 0) {
        e.x += e.vx * dt;
        e.y += e.vy * dt;
      } else {
        // Chasers and tanks home in, with a slight perpendicular weave so packs spread out.
        const weave = Math.sin(e.wobble) * 0.35;
        const nx = dx / dist;
        const ny = dy / dist;
        e.x += (nx - ny * weave) * speed * dt;
        e.y += (ny + nx * weave) * speed * dt;
      }
      e.x = Math.min(FIELD.width - 16, Math.max(16, e.x));
      e.y = Math.min(FIELD.height - 16, Math.max(16, e.y));
      if (state.mode === 'run' && !state.over && p.invuln <= 0 && dist < stats.radius + PLAYER.radius - 2) {
        return hurtPlayer(e);
      }
    }
    return 0;
  }

  function step(dt, control) {
    let events = 0;
    state.time += dt;
    const p = state.player;
    p.invuln = Math.max(0, p.invuln - dt);
    state.bannerTimer = Math.max(0, state.bannerTimer - dt);
    state.shake = Math.max(0, state.shake - dt * 26);
    if (state.comboTimer > 0) {
      state.comboTimer -= dt;
      if (state.comboTimer <= 0) {
        state.combo = 0;
        state.multiplier = 1;
      }
    }

    if (state.mode === 'title') {
      events |= stepEnemies(dt, false);
    } else if (!state.over && !state.cleared) {
      // Steering: direct velocity, normalised so diagonals are not faster.
      const len = Math.hypot(control.mx, control.my);
      const nx = len > 0 ? control.mx / len : 0;
      const ny = len > 0 ? control.my / len : 0;
      p.vx = nx * PLAYER.speed;
      p.vy = ny * PLAYER.speed;
      p.x = Math.min(FIELD.width - PLAYER.radius, Math.max(PLAYER.radius, p.x + p.vx * dt));
      p.y = Math.min(FIELD.height - PLAYER.radius, Math.max(PLAYER.radius, p.y + p.vy * dt));
      p.angle = Math.atan2(control.ay - p.y, control.ax - p.x);

      // Firing.
      p.fireTimer -= dt;
      if (control.fire && p.fireTimer <= 0) {
        const b = firstFree(state.bullets);
        if (b) {
          b.active = true;
          b.x = p.x + Math.cos(p.angle) * (PLAYER.radius + 4);
          b.y = p.y + Math.sin(p.angle) * (PLAYER.radius + 4);
          b.vx = Math.cos(p.angle) * PLAYER.bulletSpeed;
          b.vy = Math.sin(p.angle) * PLAYER.bulletSpeed;
          b.life = PLAYER.bulletLife;
          events |= EVENT_FIRED;
        }
        p.fireTimer = 1 / PLAYER.fireRate;
      }

      // Spawning and wave flow.
      if (state.phase === 'combat') {
        if (state.spawnLeft > 0) {
          state.spawnTimer -= dt;
          if (state.spawnTimer <= 0) {
            const point = edgeSpawnPoint();
            spawnEnemy(pickKind(), point.x, point.y);
            state.spawnLeft -= 1;
            state.spawnTimer = WAVES.spawnIntervalFor(state.wave) * (0.6 + random() * 0.7);
          }
        } else if (!state.enemies.some((e) => e.active)) {
          const bonus = WAVES.clearBonusFor(state.wave);
          state.score += bonus;
          state.banner = `WAVE ${state.wave} CLEAR  +${bonus}`;
          state.bannerTimer = 1.8;
          events |= EVENT_WAVE_CLEAR;
          if (state.wave >= WAVES.total) {
            state.cleared = true;
            events |= EVENT_CLEAR;
          } else {
            state.phase = 'intermission';
            state.intermission = WAVES.intermission;
          }
        }
      } else {
        state.intermission -= dt;
        if (state.intermission <= 0) startWave(state.wave + 1);
      }

      events |= stepEnemies(dt, true);
    }

    // Bullets.
    for (const b of state.bullets) {
      if (!b.active) continue;
      b.life -= dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.life <= 0 || b.x < -12 || b.x > FIELD.width + 12 || b.y < -12 || b.y > FIELD.height + 12) {
        b.active = false;
        continue;
      }
      for (const e of state.enemies) {
        if (!e.active) continue;
        const stats = KIND_STATS[e.kind];
        const dx = e.x - b.x;
        const dy = e.y - b.y;
        const rr = stats.radius + PLAYER.bulletRadius;
        if (dx * dx + dy * dy < rr * rr) {
          b.active = false;
          events |= damageEnemy(e, 1, false, 0);
          break;
        }
      }
    }

    // Echo rings: expand, damage what the front crosses (once per ring per enemy), then fade.
    for (const ring of state.rings) {
      if (!ring.active) continue;
      ring.radius += ECHO.expandSpeed * dt;
      if (ring.radius >= ring.maxRadius) {
        ring.active = false;
        continue;
      }
      for (const e of state.enemies) {
        if (!e.active || e.ringMark === ring.id) continue;
        const dist = Math.hypot(e.x - ring.x, e.y - ring.y);
        if (Math.abs(dist - ring.radius) < ECHO.bandWidth + KIND_STATS[e.kind].radius * 0.5) {
          e.ringMark = ring.id;
          events |= damageEnemy(e, ECHO.damage, true, ring.depth);
        }
      }
    }

    // Particles and floating texts always animate, on every screen.
    for (const pt of state.particles) {
      if (!pt.active) continue;
      pt.life -= dt;
      if (pt.life <= 0) {
        pt.active = false;
        continue;
      }
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= 0.92;
      pt.vy *= 0.92;
    }
    for (const t of state.texts) {
      if (!t.active) continue;
      t.life -= dt;
      t.y -= 34 * dt;
      if (t.life <= 0) t.active = false;
    }
    return events;
  }

  reset();
  return { state, reset, startRun, step };
}
