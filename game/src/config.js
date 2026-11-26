// Sky Courier: Coral Island Run — every tuning number and colour in one place.
// The playfield is a fixed 1280x720 logical area; the renderer scales it to the
// window, so no rule below depends on the screen size. World units are feet.
export const FIELD = { width: 1280, height: 720 };
export const STEP = 1 / 60;
export const WORLD = { half: 6000, size: 12000 };
export const GRID = 512;
export const PLANE = {
  maxSpeed: 210, // knots at full throttle, level
  cruiseSpeed: 150,
  takeoffSpeed: 75,
  landingMaxSpeed: 130,
  maxPitch: 28, // degrees
  maxRoll: 62, // degrees
  rollRate: 95, // degrees per second of input
  pitchRate: 42,
  fuelBurn: 0.55, // fuel points per second at full throttle
  startFuel: 100,
};
export const MISSIONS = [
  { id: 'takeoff', name: 'TAKEOFF', brief: 'Full throttle, lift off past 300 ft' },
  { id: 'rings', name: 'RING RUN', brief: 'Fly all 8 rings over the islands' },
  { id: 'landing', name: 'LANDING', brief: 'Line up on runway 18, touch down under 130 kt' },
];
export const RINGS = [
  { x: 0, y: 720, z: -900, r: 140 },
  { x: 950, y: 820, z: -1700, r: 140 },
  { x: 1900, y: 920, z: -900, r: 140 },
  { x: 2500, y: 820, z: 800, r: 140 },
  { x: 1300, y: 720, z: 2300, r: 140 },
  { x: -600, y: 820, z: 2700, r: 140 },
  { x: -1900, y: 920, z: 1300, r: 140 },
  { x: -1300, y: 720, z: -500, r: 140 },
];
export const RUNWAY = { x: 0, z0: 0, z1: 2000, halfWidth: 45, elevation: 120 };
export const START = { x: 0, z: 1750, heading: 0, altitude: 120 };
export const LIVES = 3;
export const PALETTE = {
  skyTop: '#2f6fd0',
  skyMid: '#7db4e8',
  skyLow: '#cfe8f7',
  seaDeep: '#0d4d8a',
  sea: '#1b6fb4',
  seaShallow: '#3fa7c9',
  sand: '#e8d49a',
  grass: '#4f9e4a',
  field: '#7fb84e',
  forest: '#2f7a37',
  rock: '#8a7f72',
  snow: '#eef2f5',
  asphalt: '#3c4148',
  runwayMark: '#f5f2e6',
  planeBody: '#f2f5f7',
  planeAccent: '#ff7a1a',
  planeTail: '#0d5aa8',
  hud: '#ffe9a8',
  hudGreen: '#7dffb0',
  hudRed: '#ff6b5e',
  panel: '#10151d',
};
export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
export const BEST_KEY = 'sky-courier.best';
export const SEED = 7;
