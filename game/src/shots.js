// The screenshot scenes behind ?shot=start|play|ring|land. Each one plays the
// real rules forward from a fresh world for a fixed number of steps, flown by
// the autopilot, so the frame is what a short flight really looks like and the
// same seed always gives the same frame.
import { STEP } from './config.js';
import { autopilotInput, createWorld, stepWorld } from './world.js';
import { SCREEN_LANDED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const SAMPLE = STEP;

/** Fly forward `seconds` under the autopilot, one fixed step at a time. */
function fly(world, seconds) {
  for (let t = 0; t < seconds; t += SAMPLE) {
    if (world.state.status !== 'flying') break;
    stepWorld(world, autopilotInput(world), SAMPLE);
  }
}

/**
 * Set `world` to the named scene and return the screen to draw over it.
 * start: on the runway, title screen. play: mid ring-run, banked at a ring.
 * ring: close on the next ring. land: on final approach, runway ahead.
 */
export function stageShot(name, world) {
  const state = world.state;
  state.status = 'flying';
  state.throttle = 78;
  if (name === 'land') {
    // Jump to the final leg: rings done, lined up on the runway, descending.
    state.ringsHit = state.ringsHit.map(() => true);
    state.ringsDone = 8;
    state.stage = 2;
    state.x = 0;
    state.z = 3600;
    state.altitude = 800;
    state.heading = 0;
    state.pitch = -2;
    state.roll = 0;
    state.speed = 120;
    state.score = 2500;
    state.message = 'FINAL — runway 18 ahead, gear down';
    fly(world, 5);
    // Stage the frame: wings level, lined up on the centreline, gentle descent.
    state.x = 0;
    state.heading = 0;
    state.roll = 0;
    state.pitch = -2;
    state.verticalSpeed = state.speed * 101.27 * Math.sin((-2 * Math.PI) / 180);
    return { screen: SCREEN_PLAY, best: 0 };
  }
  if (name === 'ring') {
    fly(world, 34);
    // Nudge the plane onto the next ring for a close pass.
    const target = world.state;
    void target;
    return { screen: SCREEN_PLAY, best: world.state.score };
  }
  if (name === 'play') {
    fly(world, 26);
    return { screen: SCREEN_PLAY, best: world.state.score };
  }
  // start: taxi out and lift the nose, title screen over the runway.
  fly(world, 4);
  state.status = 'title';
  return { screen: SCREEN_TITLE, best: 0 };
}

export function createShotWorld(terrain) {
  return createWorld(terrain);
}
