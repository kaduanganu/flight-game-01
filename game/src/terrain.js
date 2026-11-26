// The Coral Islands: one analytic height field, baked once into a 512x512 grid
// of heights and colours. The renderer, the physics and the screenshots all read
// the same grid, so the ground you see is the ground you can hit or land on.
import { GRID, PALETTE, RUNWAY, WORLD } from './config.js';

const ISLANDS = [
  { x: 0, z: 800, radius: 2600, peak: 700 },
  { x: -3200, z: -2600, radius: 1800, peak: 950 },
  { x: 3400, z: -1800, radius: 1500, peak: 520 },
  { x: 2000, z: 3400, radius: 900, peak: 260 },
  { x: -2600, z: 3200, radius: 700, peak: 180 },
];

function smoothstep(a, b, t) {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
}

/** Analytic ground height in feet at world (x, z). Sea level is 0. */
export function analyticHeight(x, z) {
  let h = -40; // sea floor
  for (const island of ISLANDS) {
    const dx = x - island.x;
    const dz = z - island.z;
    const d2 = (dx * dx + dz * dz) / (island.radius * island.radius);
    if (d2 < 4) h += island.peak * Math.exp(-d2 * 1.6);
  }
  h += 40 * Math.sin(x * 0.0016) * Math.cos(z * 0.0013);
  h += 18 * Math.sin(x * 0.004 + 1.7) * Math.sin(z * 0.0035 + 0.6);
  // The runway field is flattened to the runway elevation.
  const nearRunway = smoothstep(260, 60, Math.abs(x - RUNWAY.x)) * smoothstep(-400, 100, z) * smoothstep(2400, 1900, z);
  return h + (RUNWAY.elevation - h) * nearRunway;
}

function hexToRgb(hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const WATER = [hexToRgb(PALETTE.seaDeep), hexToRgb(PALETTE.sea), hexToRgb(PALETTE.seaShallow)];
const LAND = [hexToRgb(PALETTE.sand), hexToRgb(PALETTE.grass), hexToRgb(PALETTE.field), hexToRgb(PALETTE.forest), hexToRgb(PALETTE.rock), hexToRgb(PALETTE.snow)];

/** Colour of the ground at world (x, z) with height h: sea, beach, fields, forest, rock, snow, runway. */
export function groundColour(x, z, h) {
  if (Math.abs(x - RUNWAY.x) < RUNWAY.halfWidth && z > RUNWAY.z0 && z < RUNWAY.z1) {
    const dash = Math.floor(z / 90) % 2 === 0;
    const centre = Math.abs(x - RUNWAY.x) < 3;
    if (centre && dash) return hexToRgb(PALETTE.runwayMark);
    return hexToRgb(PALETTE.asphalt);
  }
  if (h < 0) {
    const depth = Math.min(1, -h / 60);
    const c = depth < 0.5 ? WATER[2] : depth < 0.85 ? WATER[1] : WATER[0];
    return c;
  }
  if (h < 10) return LAND[0];
  if (h < 90) return Math.sin(x * 0.0011 + 0.8) * Math.sin(z * 0.0009 + 0.4) > 0.25 ? LAND[2] : LAND[1];
  if (h < 220) return LAND[3];
  if (h < 520) return LAND[4];
  return LAND[5];
}

/** Bake the height and colour grids once. Returns { heights, colours, cell }. */
export function bakeTerrain() {
  const heights = new Float32Array(GRID * GRID);
  const colours = new Uint8Array(GRID * GRID * 3);
  const cell = WORLD.size / GRID;
  for (let gz = 0; gz < GRID; gz += 1) {
    const z = -WORLD.half + (gz + 0.5) * cell;
    for (let gx = 0; gx < GRID; gx += 1) {
      const x = -WORLD.half + (gx + 0.5) * cell;
      const h = analyticHeight(x, z);
      const i = gz * GRID + gx;
      heights[i] = h;
      const c = groundColour(x, z, h);
      colours[i * 3] = c[0];
      colours[i * 3 + 1] = c[1];
      colours[i * 3 + 2] = c[2];
    }
  }
  return { heights, colours, cell };
}

/** Bilinear height sample from a baked grid. */
export function terrainHeightAt(terrain, x, z) {
  const fx = (x + WORLD.half) / terrain.cell - 0.5;
  const fz = (z + WORLD.half) / terrain.cell - 0.5;
  const gx = Math.max(0, Math.min(GRID - 2, Math.floor(fx)));
  const gz = Math.max(0, Math.min(GRID - 2, Math.floor(fz)));
  const tx = Math.max(0, Math.min(1, fx - gx));
  const tz = Math.max(0, Math.min(1, fz - gz));
  const h = terrain.heights;
  const a = h[gz * GRID + gx];
  const b = h[gz * GRID + gx + 1];
  const c = h[(gz + 1) * GRID + gx];
  const d = h[(gz + 1) * GRID + gx + 1];
  return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
}

/** Nearest colour sample from a baked grid; returns [r, g, b]. */
export function terrainColourAt(terrain, x, z) {
  const gx = Math.max(0, Math.min(GRID - 1, Math.floor((x + WORLD.half) / terrain.cell)));
  const gz = Math.max(0, Math.min(GRID - 1, Math.floor((z + WORLD.half) / terrain.cell)));
  const i = (gz * GRID + gx) * 3;
  return [terrain.colours[i], terrain.colours[i + 1], terrain.colours[i + 2]];
}

/** True when the point is over the runway strip. */
export function onRunway(x, z) {
  return Math.abs(x - RUNWAY.x) < RUNWAY.halfWidth && z > RUNWAY.z0 && z < RUNWAY.z1;
}
