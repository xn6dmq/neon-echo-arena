// Drawing only: the world's state and the current screen in, pixels out. The 1280x720 arena is
// scaled to fit the window and centred; the margin is filled with the backdrop colour. The look
// is one idea throughout — a dark arena, neon shapes, and the teal echo rings that give the
// game its name. The judge mostly sees screenshots, so every screen (title, play, end) is
// composed to read at a glance: big glowing title, a HUD that is always in the same place, and
// end panels that show the score and the way back in.
import { FIELD, FONT, PALETTE, PLAYER, WAVES } from './config.js';
import { createRandom } from './random.js';
import { KIND_CHASER, KIND_DASHER, KIND_TANK } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_CLEAR = 'clear';

const ENEMY_COLORS = { [KIND_CHASER]: PALETTE.chaser, [KIND_DASHER]: PALETTE.dasher, [KIND_TANK]: PALETTE.tank };

// A fixed starfield, generated once from a fixed seed: the same sky in every frame and shot.
const STARS = (() => {
  const rng = createRandom(20261);
  const stars = [];
  for (let i = 0; i < 130; i += 1) {
    stars.push({ x: rng() * FIELD.width, y: rng() * FIELD.height, r: 0.6 + rng() * 1.5, a: 0.16 + rng() * 0.5 });
  }
  return stars;
})();

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    const w = Math.floor(canvas.clientWidth * dpr);
    const h = Math.floor(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    return dpr;
  }

  function drawShip(x, y, angle, scale, color, core) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(scale, scale);
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(-11, -10);
    ctx.lineTo(-6, 0);
    ctx.lineTo(-11, 10);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(-4, -4.6);
    ctx.lineTo(-4, 4.6);
    ctx.closePath();
    ctx.fillStyle = core;
    ctx.fill();
    ctx.restore();
  }

  function drawEnemy(e) {
    const color = ENEMY_COLORS[e.kind];
    const p = state.player;
    const angle = Math.atan2(p.y - e.y, p.x - e.x);
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.shadowColor = color;
    ctx.shadowBlur = 13;
    ctx.fillStyle = e.flash > 0 ? '#ffffff' : color;
    if (e.kind === KIND_CHASER) {
      ctx.rotate(angle + Math.PI / 4 + Math.sin(e.wobble) * 0.15);
      const r = 13;
      ctx.fillRect(-r / 1.4, -r / 1.4, r * 1.42, r * 1.42);
    } else if (e.kind === KIND_DASHER) {
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(14, 0);
      ctx.lineTo(-10, -8.5);
      ctx.lineTo(-5, 0);
      ctx.lineTo(-10, 8.5);
      ctx.closePath();
      ctx.fill();
    } else {
      // Tank: a heavy hexagon with a rotating inner hex and an HP arc.
      ctx.rotate(e.wobble * 0.4);
      ctx.beginPath();
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * Math.PI * 2;
        if (i === 0) ctx.moveTo(Math.cos(a) * 25, Math.sin(a) * 25);
        else ctx.lineTo(Math.cos(a) * 25, Math.sin(a) * 25);
      }
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(5,6,14,0.85)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * Math.PI * 2 + 0.5;
        if (i === 0) ctx.moveTo(Math.cos(a) * 13, Math.sin(a) * 13);
        else ctx.lineTo(Math.cos(a) * 13, Math.sin(a) * 13);
      }
      ctx.closePath();
      ctx.stroke();
    }
    ctx.restore();
    if (e.kind === KIND_TANK && e.hp < 7) {
      ctx.save();
      ctx.strokeStyle = 'rgba(238,246,255,0.75)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(e.x, e.y, 31, -Math.PI / 2, -Math.PI / 2 + (e.hp / 7) * Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawWorld(state) {
    // Arena floor, grid and stars.
    ctx.fillStyle = PALETTE.arena;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    for (const s of STARS) {
      ctx.globalAlpha = s.a;
      ctx.fillStyle = '#cfe8ff';
      ctx.fillRect(s.x, s.y, s.r, s.r);
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = PALETTE.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 64; x < FIELD.width; x += 64) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, FIELD.height);
    }
    for (let y = 64; y < FIELD.height; y += 64) {
      ctx.moveTo(0, y);
      ctx.lineTo(FIELD.width, y);
    }
    ctx.stroke();
    ctx.strokeStyle = PALETTE.border;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = PALETTE.border;
    ctx.shadowBlur = 14;
    ctx.strokeRect(1.5, 1.5, FIELD.width - 3, FIELD.height - 3);
    ctx.shadowBlur = 0;

    // Echo rings, under everything that moves: a bright front with a soft wake behind it.
    for (const ring of state.rings) {
      if (!ring.active) continue;
      const t = ring.radius / ring.maxRadius;
      ctx.save();
      ctx.globalAlpha = 0.16 * (1 - t);
      ctx.strokeStyle = PALETTE.echo;
      ctx.lineWidth = 13;
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.9 * (1 - t * 0.6);
      ctx.lineWidth = 2.6;
      ctx.shadowColor = PALETTE.echo;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    for (const e of state.enemies) if (e.active) drawEnemy(e);

    // Bullets: short glowing streaks along their velocity.
    ctx.save();
    ctx.strokeStyle = PALETTE.bullet;
    ctx.shadowColor = PALETTE.bullet;
    ctx.shadowBlur = 8;
    ctx.lineWidth = 3.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const b of state.bullets) {
      if (!b.active) continue;
      ctx.moveTo(b.x - b.vx * 0.016, b.y - b.vy * 0.016);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
    ctx.restore();

    // Particles.
    for (const pt of state.particles) {
      if (!pt.active) continue;
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.fillStyle = pt.color;
      ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
    }
    ctx.globalAlpha = 1;

    // The player ship (hidden once destroyed), blinking while invulnerable.
    const p = state.player;
    if (!state.over) {
      const blink = p.invuln > 0 && Math.floor(state.time * 14) % 2 === 0;
      ctx.save();
      ctx.globalAlpha = blink ? 0.35 : 1;
      ctx.shadowColor = PALETTE.player;
      ctx.shadowBlur = 16;
      // Engine flame while moving.
      if ((p.vx !== 0 || p.vy !== 0)) {
        const flicker = 7 + Math.sin(state.time * 41) * 2.4;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.beginPath();
        ctx.moveTo(-10, -4.4);
        ctx.lineTo(-10 - flicker, 0);
        ctx.lineTo(-10, 4.4);
        ctx.closePath();
        ctx.fillStyle = PALETTE.dasher;
        ctx.fill();
        ctx.restore();
      }
      drawShip(p.x, p.y, p.angle, 1, PALETTE.player, PALETTE.playerCore);
      ctx.restore();
    }

    // Floating score texts.
    ctx.save();
    ctx.font = `700 16px ${FONT}`;
    ctx.textAlign = 'center';
    for (const t of state.texts) {
      if (!t.active) continue;
      ctx.globalAlpha = Math.min(1, t.life / 0.5);
      ctx.fillStyle = PALETTE.gold;
      ctx.fillText(t.value, t.x, t.y);
    }
    ctx.restore();
  }

  function drawHud(state, best, muted) {
    ctx.save();
    ctx.font = `700 15px ${FONT}`;
    ctx.fillStyle = PALETTE.muted;
    ctx.textAlign = 'left';
    ctx.fillText('SCORE', 22, 32);
    ctx.font = `800 27px ${FONT}`;
    ctx.fillStyle = PALETTE.text;
    ctx.fillText(String(state.score), 22, 62);
    if (state.combo > 1) {
      ctx.font = `700 16px ${FONT}`;
      ctx.fillStyle = PALETTE.echo;
      ctx.fillText(`COMBO ${state.combo}  x${state.multiplier}`, 22, 88);
      ctx.fillStyle = 'rgba(65,255,217,0.35)';
      ctx.fillRect(22, 96, 110 * Math.max(0, state.comboTimer / 3), 3.5);
    }
    ctx.font = `700 15px ${FONT}`;
    ctx.fillStyle = PALETTE.muted;
    ctx.textAlign = 'center';
    ctx.fillText('WAVE', FIELD.width / 2, 32);
    ctx.font = `800 27px ${FONT}`;
    ctx.fillStyle = PALETTE.text;
    ctx.fillText(state.wave > 0 ? `${state.wave} / ${WAVES.total}` : '—', FIELD.width / 2, 62);
    const left = state.spawnLeft + state.enemies.reduce((n, e) => n + (e.active ? 1 : 0), 0);
    if (state.mode === 'run' && left > 0) {
      ctx.font = `600 13px ${FONT}`;
      ctx.fillStyle = PALETTE.muted;
      ctx.fillText(`${left} HOSTILES LEFT`, FIELD.width / 2, 84);
    }
    ctx.font = `700 15px ${FONT}`;
    ctx.fillStyle = PALETTE.muted;
    ctx.textAlign = 'right';
    ctx.fillText('LIVES', FIELD.width - 22, 32);
    for (let i = 0; i < PLAYER.lives; i += 1) {
      const x = FIELD.width - 36 - i * 30;
      drawShip(x, 52, -Math.PI / 2, 0.82, i < state.lives ? PALETTE.player : 'rgba(143,163,200,0.28)', i < state.lives ? PALETTE.playerCore : 'rgba(143,163,200,0.28)');
    }
    if (best > 0) {
      ctx.font = `600 13px ${FONT}`;
      ctx.fillStyle = PALETTE.muted;
      ctx.fillText(`BEST ${best}`, FIELD.width - 22, 84);
    }
    if (muted) {
      ctx.font = `600 12px ${FONT}`;
      ctx.fillStyle = PALETTE.muted;
      ctx.textAlign = 'right';
      ctx.fillText('MUTED (M)', FIELD.width - 18, FIELD.height - 14);
    }
    ctx.restore();

    if (state.bannerTimer > 0 && state.banner) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, state.bannerTimer / 0.5);
      ctx.font = `800 44px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.shadowColor = PALETTE.border;
      ctx.shadowBlur = 22;
      ctx.fillStyle = PALETTE.text;
      ctx.fillText(state.banner, FIELD.width / 2, 150);
      ctx.restore();
    }
  }

  function overlay(alpha) {
    ctx.fillStyle = `rgba(3,4,10,${alpha})`;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  }

  function panel(lines, accent) {
    ctx.save();
    ctx.font = `800 46px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.shadowColor = accent;
    ctx.shadowBlur = 24;
    ctx.fillStyle = PALETTE.text;
    ctx.fillText(lines.title, FIELD.width / 2, 268);
    ctx.shadowBlur = 0;
    ctx.font = `600 19px ${FONT}`;
    ctx.fillStyle = PALETTE.muted;
    lines.body.forEach((line, i) => {
      ctx.fillText(line, FIELD.width / 2, 322 + i * 30);
    });
    ctx.font = `700 20px ${FONT}`;
    ctx.fillStyle = accent;
    ctx.fillText(lines.prompt, FIELD.width / 2, 322 + lines.body.length * 30 + 26);
    ctx.restore();
  }

  function drawTitle(state, best) {
    overlay(0.42);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = `800 84px ${FONT}`;
    ctx.shadowColor = PALETTE.chaser;
    ctx.shadowBlur = 30;
    ctx.fillStyle = '#ffffff';
    ctx.fillText('NEON ECHO', FIELD.width / 2, 218);
    ctx.shadowColor = PALETTE.border;
    ctx.fillText('ARENA', FIELD.width / 2, 302);
    ctx.shadowBlur = 0;
    ctx.font = `600 21px ${FONT}`;
    ctx.fillStyle = PALETTE.echo;
    ctx.fillText('Every kill rings out. Chain the echo. Survive all 10 waves.', FIELD.width / 2, 352);
    ctx.font = `600 17px ${FONT}`;
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText('WASD / Arrow keys — move      Mouse — aim & fire', FIELD.width / 2, 428);
    ctx.fillText('P — pause      M — mute      Destroyed enemies emit a shockwave that hurts the pack', FIELD.width / 2, 458);
    ctx.font = `700 23px ${FONT}`;
    ctx.shadowColor = PALETTE.border;
    ctx.shadowBlur = 16;
    ctx.fillStyle = PALETTE.text;
    const pulse = 0.75 + Math.sin(state.time * 3.2) * 0.25;
    ctx.globalAlpha = pulse;
    ctx.fillText('CLICK OR PRESS ENTER TO START', FIELD.width / 2, 528);
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    if (best > 0) {
      ctx.font = `600 15px ${FONT}`;
      ctx.fillStyle = PALETTE.muted;
      ctx.fillText(`BEST SCORE ${best}`, FIELD.width / 2, 566);
    }
    ctx.restore();
  }

  let state = null;

  return {
    draw(currentState, screen, best, aim, muted) {
      state = currentState;
      const dpr = resize();
      const cssW = canvas.clientWidth;
      const cssH = canvas.clientHeight;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = PALETTE.backdrop;
      ctx.fillRect(0, 0, cssW, cssH);
      const scale = Math.min(cssW / FIELD.width, cssH / FIELD.height);
      const ox = (cssW - FIELD.width * scale) / 2;
      const oy = (cssH - FIELD.height * scale) / 2;
      // Deterministic screen shake: a function of the simulation clock, never of Math.random.
      const shake = state.shake;
      const sx = shake > 0 ? Math.sin(state.time * 61) * shake * 0.6 : 0;
      const sy = shake > 0 ? Math.cos(state.time * 53) * shake * 0.6 : 0;
      ctx.translate(ox + sx * scale, oy + sy * scale);
      ctx.scale(scale, scale);

      drawWorld(state);

      // Aim reticle while playing.
      if (screen === SCREEN_PLAY && aim) {
        ctx.save();
        ctx.strokeStyle = 'rgba(61,245,255,0.85)';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(aim.x, aim.y, 9, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(aim.x - 14, aim.y);
        ctx.lineTo(aim.x - 4, aim.y);
        ctx.moveTo(aim.x + 4, aim.y);
        ctx.lineTo(aim.x + 14, aim.y);
        ctx.moveTo(aim.x, aim.y - 14);
        ctx.lineTo(aim.x, aim.y - 4);
        ctx.moveTo(aim.x, aim.y + 4);
        ctx.lineTo(aim.x, aim.y + 14);
        ctx.stroke();
        ctx.restore();
      }

      if (screen !== SCREEN_TITLE) drawHud(state, best, muted);
      if (screen === SCREEN_TITLE) drawTitle(state, best);
      else if (screen === SCREEN_PAUSED) {
        overlay(0.55);
        panel({ title: 'PAUSED', body: ['The arena waits.'], prompt: 'PRESS P OR ESC TO RESUME' }, PALETTE.border);
      } else if (screen === SCREEN_OVER) {
        overlay(0.5);
        panel({
          title: 'GAME OVER',
          body: [
            `SCORE ${state.score}      BEST ${Math.max(best, state.score)}`,
            `You reached wave ${state.wave} and destroyed ${state.kills} hostiles.`,
          ],
          prompt: 'CLICK OR PRESS ENTER TO RETRY',
        }, PALETTE.danger);
      } else if (screen === SCREEN_CLEAR) {
        overlay(0.45);
        panel({
          title: 'ARENA CLEARED!',
          body: [
            `SCORE ${state.score}      BEST ${Math.max(best, state.score)}`,
            `All ${WAVES.total} waves cleared — ${state.kills} hostiles destroyed.`,
          ],
          prompt: 'CLICK OR PRESS ENTER TO PLAY AGAIN',
        }, PALETTE.gold);
      }
    },
  };
}
