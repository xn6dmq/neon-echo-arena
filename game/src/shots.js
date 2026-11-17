// The screenshot scenes behind ?shot=start|play|end. Each one plays the real rules forward from
// a fresh run, steered by an autopilot, so the frame is what a short game really looks like and
// the same seed always gives the same frame.
//
// - start: the title screen over its ambient attract scene.
// - play: a competent pilot (aim at the nearest hostile, keep a safe distance, fire) plays for
//   a fixed stretch — by then wave 2 is underway, with bullets, echo rings and a combo going.
// - end: a reckless pilot that fires constantly but steers straight into the pack banks a real
//   score first, then loses all three lives — the real game-over screen of a real run.
import { FIELD, STEP } from './config.js';
import { EVENT_OVER } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 4;
const PLAY_SECONDS = 17;
const END_LIMIT_SECONDS = 240;

/** The nearest live enemy to a point, or null. */
function nearestEnemy(state, x, y) {
  let best = null;
  let bestDist = Infinity;
  for (const e of state.enemies) {
    if (!e.active) continue;
    const d = (e.x - x) * (e.x - x) + (e.y - y) * (e.y - y);
    if (d < bestDist) {
      bestDist = d;
      best = e;
    }
  }
  return best;
}

/** Competent steering: move toward a standoff range from the target, strafe slowly, always fire. */
function playControl(state) {
  const p = state.player;
  const target = nearestEnemy(state, p.x, p.y);
  if (!target) return { mx: 0, my: 0, ax: p.x + 100, ay: p.y, fire: false };
  const dx = target.x - p.x;
  const dy = target.y - p.y;
  const dist = Math.hypot(dx, dy) || 1;
  const STANDOFF = 250;
  let mx = 0;
  let my = 0;
  if (dist > STANDOFF + 30) {
    mx = dx / dist;
    my = dy / dist;
  } else if (dist < STANDOFF - 60) {
    mx = -dx / dist;
    my = -dy / dist;
  } else {
    // At standoff range, strafe perpendicular so the scene keeps moving.
    mx = -dy / dist;
    my = dx / dist;
  }
  // Keep off the walls: bias back toward the centre when close to an edge.
  if (p.x < 130) mx += 0.8;
  if (p.x > FIELD.width - 130) mx -= 0.8;
  if (p.y < 130) my += 0.8;
  if (p.y > FIELD.height - 130) my -= 0.8;
  return { mx, my, ax: target.x, ay: target.y, fire: true };
}

/** A doomed pilot: it shoots at the nearest hostile but steers straight into it, every time. */
function doomedControl(state) {
  const p = state.player;
  const target = nearestEnemy(state, p.x, p.y);
  if (!target) return { mx: 0, my: 0, ax: p.x, ay: p.y - 100, fire: false };
  return { mx: target.x - p.x, my: target.y - p.y, ax: target.x, ay: target.y, fire: true };
}

/**
 * Set `world` to the named scene (start, play or end; any other name is start) and return the
 * screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  if (name !== 'play' && name !== 'end') {
    world.reset();
    for (let i = 0; i < START_SECONDS / STEP; i += 1) {
      world.step(STEP, { mx: 0, my: 0, ax: FIELD.width / 2, ay: 0, fire: false });
    }
    return { screen: SCREEN_TITLE, best: 0 };
  }
  world.startRun();
  if (name === 'play') {
    for (let i = 0; i < PLAY_SECONDS / STEP; i += 1) {
      world.step(STEP, playControl(world.state));
    }
    return { screen: SCREEN_PLAY, best: world.state.score };
  }
  for (let i = 0; i < END_LIMIT_SECONDS / STEP; i += 1) {
    if (world.step(STEP, doomedControl(world.state)) & EVENT_OVER) break;
  }
  return { screen: SCREEN_OVER, best: world.state.score };
}
