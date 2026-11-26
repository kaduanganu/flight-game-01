// Sky Courier's flight model: throttle, pitch and roll, the three mission stages,
// the ring course, fuel, damage and scoring. Fixed 1/60 s steps, no frame-rate
// dependence, so a screenshot scene staged from a seed always looks the same.
import { LIVES, MISSIONS, PLANE, RINGS, RUNWAY, START, STEP } from './config.js';
import { onRunway, terrainHeightAt } from './terrain.js';

export const EVENT_RING = 1;
export const EVENT_CRASH = 2;
export const EVENT_STAGE = 4;
export const EVENT_LANDED = 8;
export const EVENT_OVER = 16;
export const EVENT_FUEL_LOW = 32;

const KTS_TO_FPS = 1.68781;
const KTS_TO_FPM = 101.27;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function angleDiff(target, current) {
  let d = ((target - current + 540) % 360) - 180;
  return d;
}

/** Fresh flight state, sitting on runway 18 ready for takeoff. */
export function createState() {
  return {
    x: START.x,
    z: START.z,
    altitude: START.altitude,
    heading: START.heading,
    pitch: 0,
    roll: 0,
    speed: 0,
    throttle: 0,
    fuel: PLANE.startFuel,
    lives: LIVES,
    score: 0,
    ringsHit: RINGS.map(() => false),
    ringsDone: 0,
    stage: 0,
    time: 0,
    verticalSpeed: 0,
    airborne: false,
    status: 'title',
    message: 'Full throttle to take off — W or Shift',
    fuelWarned: false,
    landed: false,
  };
}

export function createWorld(terrain) {
  return { terrain, state: createState() };
}

export function resetWorld(world) {
  world.state = createState();
}

/** The current objective: next ring, or the runway threshold for landing. */
export function currentTarget(state) {
  if (state.stage === 2) return { x: RUNWAY.x, y: RUNWAY.elevation + 420, z: 2600, label: 'RUNWAY 18' };
  const index = state.ringsHit.findIndex((hit) => !hit);
  if (index === -1) return { x: RUNWAY.x, y: RUNWAY.elevation + 420, z: 2600, label: 'RUNWAY 18' };
  const ring = RINGS[index];
  return { x: ring.x, y: ring.y, z: ring.z, label: `RING ${index + 1}/8` };
}

function nextStage(world, events) {
  const state = world.state;
  state.stage += 1;
  state.score += 500;
  state.message = `${MISSIONS[state.stage].name} — ${MISSIONS[state.stage].brief}`;
  return events | EVENT_STAGE;
}

function crash(world, events, reason) {
  const state = world.state;
  state.lives -= 1;
  state.message = reason;
  state.status = 'crashed';
  if (state.lives <= 0) {
    state.status = 'over';
    return events | EVENT_CRASH | EVENT_OVER;
  }
  return events | EVENT_CRASH;
}

/** Put the plane back in the air after a crash, pointed at its next objective. */
export function respawn(world) {
  const state = world.state;
  const target = currentTarget(state);
  const dx = target.x - state.x;
  const dz = target.z - state.z;
  state.heading = (Math.atan2(dx, -dz) * 180) / Math.PI;
  state.altitude = Math.max(state.altitude, 900);
  state.speed = 140;
  state.throttle = 70;
  state.pitch = 0;
  state.roll = 0;
  state.airborne = false;
  state.status = 'flying';
  state.message = 'Back in the air — watch your altitude';
}

/**
 * Advance one fixed step. `input` is { pitch: -1..1, roll: -1..1, throttle: -1..1 }
 * plus `brake` when landing. Returns an event bitmask.
 */
export function stepWorld(world, input, dt = STEP) {
  const state = world.state;
  if (state.status !== 'flying') return 0;
  let events = 0;
  state.time += dt;

  state.roll = clamp(state.roll + input.roll * PLANE.rollRate * dt, -PLANE.maxRoll, PLANE.maxRoll);
  state.pitch = clamp(state.pitch + input.pitch * PLANE.pitchRate * dt, -12, PLANE.maxPitch);
  if (input.roll === 0) state.roll *= Math.max(0, 1 - 1.6 * dt);
  if (input.pitch === 0) state.pitch *= Math.max(0, 1 - 0.9 * dt);

  state.throttle = clamp(state.throttle + input.throttle * 55 * dt, 0, 100);
  if (state.fuel <= 0) state.throttle = 0;
  const targetSpeed = (state.throttle / 100) * PLANE.maxSpeed - Math.max(0, state.pitch) * 1.4;
  const accel = state.speed < targetSpeed ? 14 : 9;
  state.speed += clamp(targetSpeed - state.speed, -accel * dt, accel * dt);
  if (input.brake) state.speed = Math.max(0, state.speed - 40 * dt);

  // Turn rate grows with bank and speed; a level plane flies straight.
  state.heading = (state.heading + state.roll * state.speed * 0.0022 * dt * 60 + 360) % 360;
  const headingRad = (state.heading * Math.PI) / 180;
  const forward = state.speed * KTS_TO_FPS * dt;
  state.x += Math.sin(headingRad) * forward;
  state.z += -Math.cos(headingRad) * forward;
  state.verticalSpeed = state.speed * KTS_TO_FPM * Math.sin((state.pitch * Math.PI) / 180);
  state.altitude += (state.verticalSpeed / 60) * dt;
  state.x = clamp(state.x, -5800, 5800);
  state.z = clamp(state.z, -5800, 5800);

  state.fuel = Math.max(0, state.fuel - (state.throttle / 100) * PLANE.fuelBurn * dt);
  if (state.fuel < 20 && !state.fuelWarned) {
    state.fuelWarned = true;
    state.message = 'LOW FUEL — finish the stage';
    events |= EVENT_FUEL_LOW;
  }

  // Rings: fly through the hoop, not just near it.
  for (let i = 0; i < RINGS.length; i += 1) {
    if (state.ringsHit[i]) continue;
    const ring = RINGS[i];
    const dx = state.x - ring.x;
    const dy = state.altitude - ring.y;
    const dz = state.z - ring.z;
    if (dx * dx + dy * dy + dz * dz < (ring.r + 30) * (ring.r + 30)) {
      state.ringsHit[i] = true;
      state.ringsDone += 1;
      state.score += 250;
      state.fuel = Math.min(100, state.fuel + 5);
      state.message = `Ring ${state.ringsDone}/8 — +250`;
      events |= EVENT_RING;
    }
  }

  if (state.stage === 0 && state.altitude > 300 && state.speed > 80) {
    events = nextStage(world, events);
  } else if (state.stage === 1 && state.ringsDone >= RINGS.length) {
    events = nextStage(world, events);
  }

  // Ground and water. A plane sitting on the runway is taxiing, not crashing:
  // only an airborne plane can hit the ground, and only a fast one can ditch.
  const ground = terrainHeightAt(world.terrain, state.x, state.z);
  if (!state.airborne) {
    if (state.altitude > ground + 40) {
      state.airborne = true;
    } else if (ground < 2 && state.speed > 30) {
      return crash(world, events, 'Ditched in the sea!');
    } else {
      state.altitude = Math.max(state.altitude, ground);
    }
    return events;
  }
  if (state.altitude <= ground + 3) {
    const aligned = Math.min(Math.abs(angleDiff(0, state.heading)), Math.abs(angleDiff(180, state.heading))) < 18;
    const gentle = state.verticalSpeed > -650;
    if (state.stage === 2 && onRunway(state.x, state.z) && aligned && gentle && state.speed <= PLANE.landingMaxSpeed) {
      state.altitude = ground;
      state.landed = true;
      state.status = 'landed';
      state.score += 1000;
      state.message = 'TOUCHDOWN — perfect landing, +1000';
      return events | EVENT_LANDED;
    }
    const reason = ground < 2 ? 'Ditched in the sea!' : 'Crashed into terrain!';
    return crash(world, events, reason);
  }
  return events;
}

/**
 * A simple autopilot for the screenshot scenes: it steers toward the current
 * target, holds its altitude and keeps the throttle at cruise.
 */
export function autopilotInput(world) {
  const state = world.state;
  const target = currentTarget(state);
  const dx = target.x - state.x;
  const dz = target.z - state.z;
  const wantHeading = (Math.atan2(dx, -dz) * 180) / Math.PI;
  const headingError = angleDiff(wantHeading, state.heading);
  const roll = clamp(headingError / 25, -1, 1);
  // Never aim below the ground ahead: stay 180 ft over the terrain.
  const ground = terrainHeightAt(world.terrain, state.x, state.z);
  const wantAlt = Math.max(target.y, ground + 180);
  const altError = wantAlt - state.altitude;
  const pitch = clamp(altError / 400, -0.4, 1);
  const throttle = state.speed < 150 ? 1 : state.speed > 175 ? -1 : 0;
  return { pitch, roll, throttle, brake: false };
}
