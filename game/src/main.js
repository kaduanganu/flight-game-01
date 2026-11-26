// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps (several in a slow frame, none in a fast one), and the renderer
// paints what is there. The game moves between title, play, paused, crashed,
// landed and game-over screens.
//
// ?seed=N fixes the world. ?shot=start|play|ring|land (with &seed=N) stages that
// scene instead of running the loop, paints it twice and sets window.__shotReady
// for a screenshot.
import { BEST_KEY, FIELD, SEED, STEP } from './config.js';
import { createAudio } from './audio.js';
import { ACTION_CONFIRM, ACTION_PAUSE, createInput } from './input.js';
import { bakeTerrain } from './terrain.js';
import { createWorld, currentTarget, EVENT_CRASH, EVENT_LANDED, EVENT_OVER, EVENT_RING, resetWorld, respawn, stepWorld } from './world.js';
import { createRenderer, SCREEN_CRASHED, SCREEN_LANDED, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : SEED;

const canvas = document.getElementById('game');
canvas.width = FIELD.width;
canvas.height = FIELD.height;
const status = document.getElementById('status');
const terrain = bakeTerrain();
const world = createWorld(terrain);
Object.defineProperty(window, '__skyState', { get: () => world.state });
const renderer = createRenderer(canvas, terrain);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, world.state.time, currentTarget(world.state));
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();

  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    resetWorld(world);
    world.state.status = 'flying';
    accumulator = 0;
    screen = SCREEN_PLAY;
    audio.unlock();
    announce('Flying. Full throttle to take off.');
  }

  function endGame() {
    screen = SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    announce(`Out of lives. Score ${world.state.score}. Best ${best}.`);
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & 4) {
      const muted = audio.toggleMute();
      announce(muted ? 'Sound off.' : 'Sound on.');
    }
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_LANDED)) {
      startGame();
    } else if (actions & ACTION_CONFIRM && screen === SCREEN_CRASHED) {
      if (world.state.lives > 0) {
        respawn(world);
        screen = SCREEN_PLAY;
      } else {
        startGame();
      }
    } else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Flying.');
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) return;
    const events = stepWorld(world, input.read());
    if (events & EVENT_RING) audio.ring();
    if (events & EVENT_CRASH) {
      audio.crash();
      if (world.state.status === 'over') endGame();
      else screen = SCREEN_CRASHED;
    }
    if (events & EVENT_LANDED) {
      audio.land();
      screen = SCREEN_LANDED;
      if (world.state.score > best) {
        best = world.state.score;
        saveBest(best);
      }
    }
    if (events & EVENT_OVER) endGame();
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_PLAY) {
      while (accumulator >= STEP && screen === SCREEN_PLAY) {
        step();
        accumulator -= STEP;
      }
      audio.engine(world.state.throttle, screen === SCREEN_PLAY);
    } else {
      accumulator = 0;
      audio.engine(0, false);
    }
    renderer.draw(world.state, screen, best, world.state.time, currentTarget(world.state));
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Sky Courier. Press Space or click to fly.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
